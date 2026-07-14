// Generic Pyodide worker for the Data & Figures module.
//
// Two jobs, both client-side in a WASM sandbox (no DOM/FS access):
//   1. analyze      – run a user-supplied Analysis Set's Python `analyze(files,
//                     params)` and return the contract dict (see analysisSets.js).
//   2. renderFigure – draw a publication figure with matplotlib/seaborn using a
//                     Plot Preset's style, returned as base64 PNG/SVG/PDF.
//
// Protocol (mirrors hplcWorker.js):
//   { type:'init' }                                   → 'ready'
//   { type:'analyze', id, code, files, params, packages? }
//        → 'progress' … then { type:'result', id, result }
//   { type:'renderFigure', id, styleCode, spec, format }
//        → { type:'image', id, format, dataBase64 }
//   errors: { type:'error', id?, message }
//
// SECURITY: `analyze`/plot code may originate from another user (a Global
// analysis set). It runs in this Worker's Pyodide sandbox — no DOM, no page
// cookies, no file system — which bounds the blast radius, but callers must
// still gate first-run execution behind an explicit user opt-in (see the
// service / component). This worker never fetches or runs code on its own.

const PYODIDE_VERSION = '0.27.7'
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

let pyodide = null
let initPromise = null
const installedPackages = new Set()

// Harness Python: runs the user's analyze() and renders builtin figure types.
// Kept free of app-specific logic so any Analysis Set can plug in.
const HARNESS_CODE = `
import json, base64, io, os, builtins, glob as _glob, fnmatch
import numpy as np

# matplotlib with the non-interactive Agg backend so savefig() works headless.
import matplotlib
matplotlib.use('agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap


# ── Uploaded-file shim ───────────────────────────────────────────────────────
# Pasted notebook code usually reads from hardcoded disk paths (BASE + name).
# Those paths don't exist in Pyodide, so we materialise every uploaded file in a
# virtual dir and redirect any file read to the upload whose *filename* matches —
# so hardcoded absolute paths keep working without the user editing them. Reads
# that hit a real existing path are left untouched.
UPLOAD_DIR = '/uploads'
_UPLOADS = {}                       # basename -> text
_REAL_OPEN = builtins.open
_REAL_EXISTS = os.path.exists
_REAL_LISTDIR = os.listdir
_REAL_GLOB = _glob.glob
_SHIM_INSTALLED = False


def _as_path(p):
    return os.fspath(p) if hasattr(p, '__fspath__') else str(p)


def _resolve_path(path):
    p = _as_path(path)
    try:
        if _REAL_EXISTS(p):
            return p
    except Exception:
        pass
    base = os.path.basename(p)
    return os.path.join(UPLOAD_DIR, base) if base in _UPLOADS else p


def _patched_open(file, *a, **k):
    if isinstance(file, (str, bytes)) or hasattr(file, '__fspath__'):
        file = _resolve_path(file)
    return _REAL_OPEN(file, *a, **k)


def _patched_exists(path):
    try:
        if _REAL_EXISTS(path):
            return True
    except Exception:
        pass
    try:
        return os.path.basename(_as_path(path)) in _UPLOADS
    except Exception:
        return False


def _patched_listdir(path='.'):
    try:
        if _REAL_EXISTS(path):
            return _REAL_LISTDIR(path)
    except Exception:
        pass
    return list(_UPLOADS.keys())          # any missing dir -> show the uploads


def _patched_glob(pattern, *a, **k):
    res = _REAL_GLOB(pattern, *a, **k)
    if res:
        return res
    pat = os.path.basename(_as_path(pattern))
    return [os.path.join(UPLOAD_DIR, n) for n in _UPLOADS if fnmatch.fnmatch(n, pat)]


def _install_upload_shim(files):
    global _SHIM_INSTALLED
    _UPLOADS.clear()
    try:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
    except Exception:
        pass
    for f in files:
        name = os.path.basename(f.get('name', '') or '')
        if not name:
            continue
        _UPLOADS[name] = f.get('text', '')
        try:
            with _REAL_OPEN(os.path.join(UPLOAD_DIR, name), 'w') as fh:
                fh.write(_UPLOADS[name])
        except Exception:
            pass
    if not _SHIM_INSTALLED:
        builtins.open = _patched_open
        os.path.exists = _patched_exists
        os.listdir = _patched_listdir
        _glob.glob = _patched_glob
        _SHIM_INSTALLED = True


def run_analyze(user_ns, files_json, params_json):
    """Call the user set's analyze(files, params) and validate the contract."""
    files = json.loads(files_json)
    params = json.loads(params_json)
    _install_upload_shim(files)         # make hardcoded paths resolve to uploads
    fn = user_ns.get('analyze')
    if not callable(fn):
        raise ValueError("Analysis code must define analyze(files, params).")
    out = fn(files, params)
    if not isinstance(out, dict):
        raise ValueError("analyze() must return a dict {columns, rows, traces?}.")
    out.setdefault('columns', [])
    out.setdefault('rows', [])
    out.setdefault('traces', {})
    if not isinstance(out['rows'], list):
        raise ValueError("analyze() 'rows' must be a list.")
    return json.dumps(out)


def describe_interface(user_ns):
    """Introspect an analysis set's code for a self-declared interface.
    A set may define module-level PARAMS (defaults dict) and/or SCHEMA (widget
    list) — we return whatever is present so the UI can build controls from the
    code itself, without the app knowing what the code does."""
    def _py(x):
        try:
            return x.to_py()      # PyProxy dict/list → JS-native
        except Exception:
            return x
    params = user_ns.get('PARAMS')
    if params is None:
        params = user_ns.get('DEFAULTS')
    return json.dumps({'schema': _py(user_ns.get('SCHEMA')), 'params': _py(params)})


def _seq_cmap(colors):
    return LinearSegmentedColormap.from_list('seq', colors) if colors else plt.cm.Blues


def _fig_to_b64(fig, fmt):
    buf = io.BytesIO()
    fig.savefig(buf, format=('svg' if fmt == 'svg' else 'pdf' if fmt == 'pdf' else 'png'),
                bbox_inches='tight')
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode('ascii')


def render_heatmap(data, fmt):
    z = np.array([[np.nan if v is None else v for v in row] for row in data['z']], dtype=float)
    xlabels = data.get('xLabels', [])
    ylabels = data.get('y', [])
    vmax = data.get('vmax', None)
    cmap = _seq_cmap(data.get('sequential'))
    annot = data.get('annot', None)  # optional 2D list of strings

    n_rows, n_cols = z.shape if z.size else (len(ylabels), len(xlabels))
    fig, ax = plt.subplots(figsize=(max(6, n_cols * 0.6), max(4, n_rows * 0.6)))
    im = ax.imshow(z, cmap=cmap, vmin=0, vmax=vmax, aspect='equal')
    ax.set_xticks(range(len(xlabels))); ax.set_xticklabels(xlabels)
    ax.set_yticks(range(len(ylabels))); ax.set_yticklabels(ylabels)
    ax.xaxis.set_ticks_position('top'); ax.xaxis.set_label_position('top')
    ax.tick_params(length=0)
    for spine in ax.spines.values():
        spine.set_visible(False)
    if annot is not None:
        for i in range(len(ylabels)):
            for j in range(len(xlabels)):
                txt = annot[i][j] if i < len(annot) and j < len(annot[i]) else ''
                if txt:
                    ax.text(j, i, txt, ha='center', va='center', fontsize=9, color='black')
    if data.get('title'):
        ax.set_title(data['title'], fontweight='bold', pad=16)
    fig.colorbar(im, ax=ax, fraction=0.03, pad=0.02, label=data.get('valueLabel', ''))
    return _fig_to_b64(fig, fmt)


def render_chrom_gallery(data, fmt):
    panels = data.get('panels', [])
    n = max(1, len(panels))
    ncol = int(data.get('ncol', min(4, n)))
    nrow = int(np.ceil(n / ncol))
    fig, axes = plt.subplots(nrow, ncol, figsize=(ncol * 3.2, nrow * 2.4), squeeze=False)
    control = data.get('control', '#D0021B')
    line = data.get('lineColor', '#0065BD')
    for idx in range(nrow * ncol):
        ax = axes[idx // ncol][idx % ncol]
        if idx >= n:
            ax.set_visible(False); continue
        p = panels[idx]
        ax.plot(p.get('t', []), p.get('s', []), color=line, lw=1.2)
        for sh in p.get('shades', []):
            ax.axvspan(sh['x0'], sh['x1'], color=sh.get('color', control), alpha=0.25, lw=0)
        for vx in p.get('vlines', []):
            ax.axvline(vx, color='#64748b', ls=':', lw=0.8)
        ax.set_title(p.get('title', ''), fontsize=9)
        ax.set_xlabel(data.get('xlabel', 't | min'), fontsize=8)
        ax.set_ylabel(data.get('ylabel', 'signal | mAU'), fontsize=8)
        for s in ('top', 'right'):
            ax.spines[s].set_visible(False)
    if data.get('title'):
        fig.suptitle(data['title'], fontweight='bold')
    fig.tight_layout()
    return _fig_to_b64(fig, fmt)


def render_pycode(user_ns, data, fmt):
    """Escape hatch: user plot code defines plot(data, params) -> Figure."""
    fn = user_ns.get('plot')
    if not callable(fn):
        raise ValueError("Plot code must define plot(data, params) returning a matplotlib Figure.")
    fig = fn(data.get('data'), data.get('params', {}))
    return _fig_to_b64(fig, fmt)


def render_figure(user_ns, spec_json, fmt):
    spec = json.loads(spec_json)
    kind = spec.get('type')
    data = spec.get('data', {})
    if kind == 'heatmap':
        return render_heatmap(data, fmt)
    if kind == 'chromGallery':
        return render_chrom_gallery(data, fmt)
    if kind == 'pycode':
        return render_pycode(user_ns, data, fmt)
    raise ValueError(f"Unknown figure type: {kind}")
`

async function init() {
  if (pyodide) return
  if (initPromise) return initPromise
  initPromise = (async () => {
    self.postMessage({ type: 'progress', stage: 'downloading', text: 'Downloading Python engine…' })
    importScripts(`${PYODIDE_CDN}pyodide.js`)
    pyodide = await self.loadPyodide({ indexURL: PYODIDE_CDN })
    self.postMessage({ type: 'progress', stage: 'loading-packages', text: 'Loading numpy + scipy + pandas + matplotlib…' })
    await pyodide.loadPackage(['numpy', 'scipy', 'pandas', 'matplotlib', 'micropip'])
    try {
      await pyodide.runPythonAsync(`import micropip\nawait micropip.install(['seaborn'])`)
      installedPackages.add('seaborn')
    } catch (err) {
      console.warn('[pyAnalysisWorker] seaborn install failed:', err?.message || err)
    }
    self.postMessage({ type: 'progress', stage: 'compiling', text: 'Compiling figure engine…' })
    pyodide.runPython(HARNESS_CODE)
    self.postMessage({ type: 'ready' })
  })()
  return initPromise
}

// Install any extra pip packages an Analysis Set declares (best-effort).
async function ensurePackages(pkgs) {
  const needed = (pkgs || []).filter(p => p && !installedPackages.has(p))
  if (!needed.length) return
  self.postMessage({ type: 'progress', stage: 'installing', text: `Installing ${needed.join(', ')}…` })
  await pyodide.runPythonAsync(
    `import micropip\nawait micropip.install(${JSON.stringify(needed)})`
  )
  needed.forEach(p => installedPackages.add(p))
}

// Run user code inside an isolated namespace, then invoke `caller(ns)`.
// The namespace is a fresh Python dict (CPython injects __builtins__ on exec).
function runInUserNamespace(code, caller) {
  const ns = pyodide.toPy({})
  try {
    pyodide.runPython(code, { globals: ns })
    return caller(ns)
  } finally {
    ns.destroy()
  }
}

self.onmessage = async (e) => {
  const msg = e.data || {}
  try {
    if (msg.type === 'init') { await init(); return }

    if (msg.type === 'analyze') {
      await init()
      await ensurePackages(msg.packages)
      self.postMessage({ type: 'progress', stage: 'analyzing', text: 'Running analysis…' })
      const filesJson = JSON.stringify(msg.files || [])
      const paramsJson = JSON.stringify(msg.params || {})
      const runAnalyze = pyodide.globals.get('run_analyze')
      const resultJson = runInUserNamespace(msg.code || '', (ns) => runAnalyze(ns, filesJson, paramsJson))
      runAnalyze.destroy()
      self.postMessage({ type: 'result', id: msg.id, result: JSON.parse(resultJson) })
      return
    }

    if (msg.type === 'describe') {
      await init()
      await ensurePackages(msg.packages)
      self.postMessage({ type: 'progress', stage: 'describing', text: 'Reading interface…' })
      const describe = pyodide.globals.get('describe_interface')
      const out = runInUserNamespace(msg.code || '', (ns) => describe(ns))
      describe.destroy()
      self.postMessage({ type: 'described', id: msg.id, result: JSON.parse(out) })
      return
    }

    if (msg.type === 'renderFigure') {
      await init()
      await ensurePackages(msg.packages)
      self.postMessage({ type: 'progress', stage: 'rendering', text: 'Rendering figure…' })
      const fmt = msg.format || 'png'
      // Style code from plotStyle.matplotlibStyleCode defines apply_style().
      const styleNs = pyodide.toPy({})
      let dataBase64
      try {
        pyodide.runPython((msg.styleCode || '') + '\napply_style()', { globals: styleNs })
        const specJson = JSON.stringify(msg.spec || {})
        const renderFigure = pyodide.globals.get('render_figure')
        // Merge palette hints from style into the spec's data if the type needs them.
        if (msg.plotCode) {
          dataBase64 = runInUserNamespace(msg.plotCode, (ns) => renderFigure(ns, specJson, fmt))
        } else {
          dataBase64 = renderFigure(styleNs, specJson, fmt)
        }
        renderFigure.destroy()
      } finally {
        styleNs.destroy()
      }
      self.postMessage({ type: 'image', id: msg.id, format: fmt, dataBase64 })
      return
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err?.message || String(err) })
  }
}
