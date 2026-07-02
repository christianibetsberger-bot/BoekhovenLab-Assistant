(function(){let e=`https://cdn.jsdelivr.net/pyodide/v0.27.7/full/`,t=null,n=null;async function r(){if(!t)return n||(n=(async()=>{self.postMessage({type:`progress`,stage:`downloading`,text:`Downloading Python engine…`}),importScripts(`${e}pyodide.js`),t=await self.loadPyodide({indexURL:e}),self.postMessage({type:`progress`,stage:`loading-packages`,text:`Loading numpy + scipy + pandas…`}),await t.loadPackage([`numpy`,`scipy`,`pandas`,`matplotlib`,`micropip`]),self.postMessage({type:`progress`,stage:`installing-hplc`,text:`Installing hplc-py…`});try{await t.runPythonAsync(`
import micropip
await micropip.install(['tqdm', 'seaborn', 'termcolor', 'lmfit', 'asteval', 'uncertainties', 'hplc-py'])
`)}catch(e){console.error(`[hplcWorker] hplc-py install failed:`,e?.message||String(e)),self.postMessage({type:`progress`,stage:`installing-hplc`,text:`hplc-py unavailable — falling back to scipy peak integration.`})}self.postMessage({type:`progress`,stage:`compiling-code`,text:`Compiling HPLC engine…`}),t.runPython(`
import json
import io
import numpy as np
import pandas as pd
from scipy.ndimage import minimum_filter1d
from scipy.signal import find_peaks


def _read_chromatogram_text(text):
    # Chromeleon export: 43 header lines, tab-delimited, comma decimal, columns
    # time / step / signal.  Some exports have trailing whitespace lines.
    df = pd.read_csv(
        io.StringIO(text),
        delimiter='\\t', decimal=',', header=None,
        skiprows=43, names=['time', 'step', 'signal'], usecols=[0, 1, 2],
    )
    df['time']   = pd.to_numeric(df['time'],   errors='coerce')
    df['signal'] = pd.to_numeric(df['signal'], errors='coerce')
    return df.dropna(subset=['time', 'signal']).reset_index(drop=True)


def _rough_correct(t, s, window_min=0.5):
    if len(t) < 2 or t[-1] <= t[0]:
        return np.clip(s, 0.0, None)
    pts_per_min = len(t) / (t[-1] - t[0])
    window = max(3, int(window_min * pts_per_min))
    baseline = minimum_filter1d(s, size=window, mode='nearest')
    return np.clip(s - baseline, 0.0, None)


def _integrate_via_valley(t, s, target_rt, max_half_width=0.3):
    # Valley-bounded trapezoidal fallback (notebook's get_dynamic_peak_bounds).
    apex_mask = (t >= target_rt - 0.08) & (t <= target_rt + 0.08)
    if not apex_mask.any():
        return 0.0, None, None
    idx_range = np.where(apex_mask)[0]
    apex_idx = int(idx_range[np.argmax(s[idx_range])])

    s_sm = np.convolve(s, np.ones(5)/5, mode='same')

    li = apex_idx
    while li > 2 and (t[apex_idx] - t[li]) < max_half_width:
        if (s_sm[li-1] > s_sm[li] + 1e-4) and (s_sm[li-2] > s_sm[li-1] + 1e-4):
            break
        li -= 1
    ri = apex_idx
    while ri < len(s) - 3 and (t[ri] - t[apex_idx]) < max_half_width:
        if (s_sm[ri+1] > s_sm[ri] + 1e-4) and (s_sm[ri+2] > s_sm[ri+1] + 1e-4):
            break
        ri += 1

    t_win = t[li:ri+1]
    s_win = s[li:ri+1]
    if len(s_win) < 2:
        return 0.0, float(t[li]), float(t[ri])
    base = np.linspace(s_win[0], s_win[-1], len(s_win))
    area = float(np.trapz(np.clip(s_win - base, 0, None), t_win))
    return area, float(t[li]), float(t[ri])


def _scipy_peak_count(s, prominence):
    """Count peaks via scipy — used as a fast pre-screen before the expensive hplc-py fit."""
    idx, _ = find_peaks(s, prominence=prominence)
    return len(idx)


def _hplc_fit(chrom_obj, prominence, verbose=False, max_iter=500):
    import sys
    # Build kwargs; drop max_iterations if this hplc-py version doesn't support it.
    def _call(prom):
        for kwargs in [
            {'prominence': prom, 'correct_baseline': False, 'verbose': verbose, 'max_iterations': max_iter},
            {'prominence': prom, 'correct_baseline': False, 'verbose': verbose},
        ]:
            try:
                result = chrom_obj.fit_peaks(**kwargs)
                print(f'[hplcWorker] fit_peaks OK prominence={prom:.4f} max_iter={kwargs.get("max_iterations","?")} → {len(result)} peaks', file=sys.stderr)
                return result
            except TypeError as te:
                if 'max_iterations' in str(te):
                    continue  # retry without max_iterations
                print(f'[hplcWorker] fit_peaks TypeError: {te}', file=sys.stderr)
                return None
            except Exception as ex:
                print(f'[hplcWorker] fit_peaks error: {ex}', file=sys.stderr)
                return None
        return None

    result = _call(prominence)
    if result is None or result.empty:
        result = _call(prominence / 5.0)
    return result


def _peak_row_to_dict(row, area_mAU_min):
    return {
        'rt':          float(row.get('retention_time', row.get('peak_center', row.get('center', row.get('time', 0.0))))),
        'area_mAU_min': area_mAU_min,
        'height':    float(row['amplitude']) if 'amplitude' in row else None,
        'scale':     float(row['scale'])     if 'scale'     in row else None,
        'skew':      float(row['skew'])      if 'skew'      in row else None,
        'amplitude': float(row['amplitude']) if 'amplitude' in row else None,
    }


def process_chromatogram(text, params_json):
    params = json.loads(params_json)
    scan_min   = float(params.get('scanMin',   1.6))
    scan_max   = float(params.get('scanMax',  10.0))
    prominence = float(params.get('prominence', 0.05))
    baseline_window_min = float(params.get('baselineWindow', 1.0))
    use_hplc_py = bool(params.get('useHplcPy', True))
    product_min = float(params.get('productMin', 6.2))
    product_max = float(params.get('productMax', 7.4))

    df = _read_chromatogram_text(text)
    if df.empty:
        return json.dumps({'trace': {'t': [], 's': []}, 'peaks': [], 'note': 'empty file'})

    df = df[(df['time'] >= scan_min) & (df['time'] <= scan_max)].reset_index(drop=True)
    if len(df) < 10:
        return json.dumps({'trace': {'t': [], 's': []}, 'peaks': [], 'note': 'too few points in scan range'})

    t = df['time'].values.astype(float)
    s_raw = df['signal'].values.astype(float)
    s_corr = _rough_correct(t, s_raw)

    peaks_out = []
    # Pass 1 (scipy, fast): detect ALL peaks across the full scan range using valley
    # integration.  This gives building-block peaks without the expensive hplc-py
    # Gaussian fit.  Product-window peaks from this pass are replaced by Pass 2.
    if _scipy_peak_count(s_corr, prominence) > 0:
        idx_peaks, _ = find_peaks(s_corr, prominence=prominence)
        for i in idx_peaks:
            rt = float(t[i])
            area, _, _ = _integrate_via_valley(t, s_corr, rt)
            if area > 0:
                peaks_out.append({
                    'rt': rt,
                    'area_mAU_min': float(area),
                    'height': float(s_corr[i]),
                    'scale': None, 'skew': None, 'amplitude': float(s_corr[i]),
                })

    # Pass 2 (hplc-py, accurate): tight-crop around the product RT window only.
    # The notebook uses crop = [productMin-0.7, productMax+0.7] with prominence/2
    # to properly resolve closely-spaced product peaks.  Only this pass uses the
    # expensive Gaussian fitter — keeping total hplc-py calls to 1 per file.
    if use_hplc_py:
        tight_lo = max(scan_min, product_min - 0.7)
        tight_hi = min(scan_max, product_max + 0.7)
        df_tight = df[(df['time'] >= tight_lo) & (df['time'] <= tight_hi)].reset_index(drop=True)
        tight_product_peaks = []
        s_tight = df_tight['signal'].values.astype(float) if len(df_tight) >= 10 else np.array([])
        s_tight_corr = _rough_correct(df_tight['time'].values.astype(float), s_tight) if len(s_tight) >= 10 else s_tight
        if len(df_tight) >= 10 and _scipy_peak_count(s_tight_corr, prominence / 2.0) > 0:
            try:
                from hplc.quant import Chromatogram as _C
                chrom_t = _C(df_tight.copy())
                chrom_t.crop([tight_lo, tight_hi])
                try:
                    chrom_t.correct_baseline(window=baseline_window_min)
                except Exception:
                    pass
                pt_tight = _hplc_fit(chrom_t, prominence / 2.0)
                if pt_tight is not None and not pt_tight.empty:
                    rt_col_t   = next((c for c in ['retention_time', 'peak_center', 'center', 'time']
                                       if c in pt_tight.columns), None)
                    area_col_t = next((c for c in ['area', 'integrated_area'] if c in pt_tight.columns), None)
                    if rt_col_t and area_col_t:
                        for _, row in pt_tight.iterrows():
                            rt = float(row[rt_col_t])
                            if product_min <= rt <= product_max:
                                area_min = float(row[area_col_t]) / 60.0
                                tight_product_peaks.append(_peak_row_to_dict(row, area_min))
            except Exception as e:
                import sys
                print(f'[hplcWorker] tight-crop pass failed: {e}', file=sys.stderr)

        import sys
        print(f'[hplcWorker] tight-crop found {len(tight_product_peaks)} product peaks in [{product_min},{product_max}]: {[(round(p["rt"],3), round(p["area_mAU_min"],4)) for p in tight_product_peaks]}', file=sys.stderr)

        if tight_product_peaks:
            # Replace product-range peaks from pass 1 with the tighter measurements.
            peaks_out = [p for p in peaks_out if not (product_min <= p['rt'] <= product_max)]
            peaks_out += tight_product_peaks

    # If hplc-py found nothing at all, fall back to scipy find_peaks + valley integration
    if not peaks_out:
        idx, _ = find_peaks(s_corr, prominence=prominence)
        for i in idx:
            rt = float(t[i])
            area, _, _ = _integrate_via_valley(t, s_corr, rt)
            if area > 0:
                peaks_out.append({
                    'rt': rt,
                    'area_mAU_min': float(area),
                    'height': float(s_corr[i]),
                    'scale': None, 'skew': None, 'amplitude': float(s_corr[i]),
                })

    # Sort peaks by RT.
    peaks_out.sort(key=lambda p: p['rt'])

    # Downsample trace if huge — gallery rendering doesn't need >2000 points.
    if len(t) > 2000:
        idx = np.linspace(0, len(t)-1, 2000).astype(int)
        t_ds = t[idx].tolist()
        s_ds = s_corr[idx].tolist()
    else:
        t_ds = t.tolist()
        s_ds = s_corr.tolist()

    return json.dumps({'trace': {'t': t_ds, 's': s_ds}, 'peaks': peaks_out})
`),console.log(`[hplcWorker] v6 ready`),self.postMessage({type:`ready`})})(),n)}self.onmessage=async e=>{let n=e.data||{};try{if(n.type===`init`){await r();return}if(n.type===`process`){await r();let e=n.files||[],i=JSON.stringify(n.params||{}),a=t.globals.get(`process_chromatogram`),o=[];for(let t=0;t<e.length;t++){let r=e[t];self.postMessage({type:`progress`,stage:`processing`,text:`Processing ${r.name} (${t+1} / ${e.length})…`});let s;try{let e=a(r.text,i);s=JSON.parse(e)}catch(e){s={trace:{t:[],s:[]},peaks:[],error:e?.message||String(e)}}let c={name:r.name,...s};o.push(c),self.postMessage({type:`file-done`,id:n.id,index:t,total:e.length,result:c})}a.destroy(),self.postMessage({type:`result`,id:n.id,results:o});return}}catch(e){self.postMessage({type:`error`,id:n.id,message:e?.message||String(e)})}}})();