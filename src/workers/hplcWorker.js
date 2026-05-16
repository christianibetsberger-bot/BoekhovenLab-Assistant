// Web Worker that runs HPLC peak detection + integration inside Pyodide.
//
// Uses scipy + the hplc-py library (hplc.quant.Chromatogram.fit_peaks) to
// reproduce the notebook /Users/christianibetsberger/Downloads/HPLCdirectimportforLIDA.ipynb.
// Per-file output is a list of detected peaks (rt + integrated area in mAU·min)
// plus the baseline-corrected trace for plotting in the main thread.
//
// Classification of peaks (which RTs count as "product" vs "building block")
// and area→concentration conversion live on the main thread so the user's
// product-window slider can re-classify without re-running integration.
//
// Protocol:
//   { type: 'init' }                              → loads Pyodide + hplc-py
//   { type: 'process', id, files: [{name,text}], params }
//                                                 → returns per-file peak results
//   ─→ { type: 'progress', stage, text }
//   ─→ { type: 'ready' }
//   ─→ { type: 'file-done', id, index, result }   per-file result (streams in)
//   ─→ { type: 'result',    id, results }         once all files processed
//   ─→ { type: 'error',     id?, message }

const PYODIDE_VERSION = '0.27.7'
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

let pyodide = null
let initPromise = null

// Python embedded into the worker.  Port of the notebook helpers, no
// matplotlib/seaborn/tqdm: pure data crunching only.  Each invocation
// `process_chromatogram(text_json, params_json)` returns a JSON blob with
//   - trace.t, trace.s            : cropped + baseline-corrected trace
//   - peaks: [{rt, area_mAU_min, amplitude, scale, skew, height}]
const HPLC_CODE = `
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


def process_chromatogram(text, params_json):
    params = json.loads(params_json)
    scan_min   = float(params.get('scanMin',   1.6))
    scan_max   = float(params.get('scanMax',  10.0))
    prominence = float(params.get('prominence', 0.05))
    baseline_window_min = float(params.get('baselineWindow', 1.0))
    use_hplc_py = bool(params.get('useHplcPy', True))

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
    # First try hplc-py for accurate asymmetric-Gaussian integration; fall back
    # to valley-bounded trapz on any failure or when use_hplc_py is False.
    peak_table = None
    if use_hplc_py:
        try:
            from hplc.quant import Chromatogram
            chrom = Chromatogram(df.copy())
            chrom.crop([scan_min, scan_max])
            try:
                chrom.correct_baseline(window=baseline_window_min)
            except Exception:
                pass
            try:
                peak_table = chrom.fit_peaks(prominence=prominence, correct_baseline=False, verbose=False)
            except ValueError:
                try:
                    peak_table = chrom.fit_peaks(prominence=prominence/5.0, correct_baseline=False, verbose=False)
                except Exception:
                    peak_table = None
            except Exception:
                peak_table = None
            # Pull baseline-corrected signal back out
            try:
                t = chrom.df['time'].values.astype(float)
                s_corr = chrom.df[chrom.int_col].values.astype(float)
            except Exception:
                pass
        except Exception:
            peak_table = None

    if peak_table is not None and not peak_table.empty:
        rt_col = next((c for c in ['retention_time', 'peak_center', 'center', 'time']
                       if c in peak_table.columns), None)
        area_col = next((c for c in ['area', 'integrated_area'] if c in peak_table.columns), None)
        for _, row in peak_table.iterrows():
            rt = float(row[rt_col]) if rt_col else 0.0
            # hplc-py returns area in mAU·s; divide by 60 → mAU·min (matches notebook).
            area_min = float(row[area_col]) / 60.0 if area_col else 0.0
            peaks_out.append({
                'rt': rt,
                'area_mAU_min': area_min,
                'height':    float(row['amplitude']) if 'amplitude' in row else None,
                'scale':     float(row['scale'])     if 'scale'     in row else None,
                'skew':      float(row['skew'])      if 'skew'      in row else None,
                'amplitude': float(row['amplitude']) if 'amplitude' in row else None,
            })

    # If hplc-py found nothing, fall back to scipy find_peaks + valley integration
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
`

async function init() {
  if (pyodide) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    self.postMessage({ type: 'progress', stage: 'downloading', text: 'Downloading Python engine…' })
    importScripts(`${PYODIDE_CDN}pyodide.js`)
    pyodide = await self.loadPyodide({ indexURL: PYODIDE_CDN })

    self.postMessage({ type: 'progress', stage: 'loading-packages', text: 'Loading numpy + scipy + pandas…' })
    await pyodide.loadPackage(['numpy', 'scipy', 'pandas', 'micropip'])

    self.postMessage({ type: 'progress', stage: 'installing-hplc', text: 'Installing hplc-py…' })
    try {
      await pyodide.runPythonAsync(`
import micropip
await micropip.install('hplc-py')
`)
    } catch (err) {
      // hplc-py install failed (rare; pure-Python but may pull in incompatible deps).
      // The Python code falls back to scipy find_peaks + valley integration when
      // hplc-py is unavailable, so we keep going.
      self.postMessage({ type: 'progress', stage: 'installing-hplc',
        text: 'hplc-py unavailable — falling back to scipy peak integration.' })
    }

    self.postMessage({ type: 'progress', stage: 'compiling-code', text: 'Compiling HPLC engine…' })
    pyodide.runPython(HPLC_CODE)

    self.postMessage({ type: 'ready' })
  })()

  return initPromise
}

self.onmessage = async (e) => {
  const msg = e.data || {}

  try {
    if (msg.type === 'init') {
      await init()
      return
    }

    if (msg.type === 'process') {
      await init()
      const files = msg.files || []
      const paramsJson = JSON.stringify(msg.params || {})
      const fn = pyodide.globals.get('process_chromatogram')
      const results = []
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        self.postMessage({ type: 'progress', stage: 'processing',
          text: `Processing ${f.name} (${i + 1} / ${files.length})…` })
        let parsed
        try {
          const json = fn(f.text, paramsJson)
          parsed = JSON.parse(json)
        } catch (err) {
          parsed = { trace: { t: [], s: [] }, peaks: [], error: err?.message || String(err) }
        }
        const result = { name: f.name, ...parsed }
        results.push(result)
        self.postMessage({ type: 'file-done', id: msg.id, index: i, total: files.length, result })
      }
      fn.destroy()
      self.postMessage({ type: 'result', id: msg.id, results })
      return
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err?.message || String(err) })
  }
}
