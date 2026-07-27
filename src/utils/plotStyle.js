// Figure styling for the Data & Figures module.
//
// One *Plot Preset* drives both renderers so the interactive preview and the
// publication export look the same:
//   • boekhovenPlotlyLayout(preset, palette, opts) → a Plotly layout object
//     (despined axes, Arial, palette colourway, "quantity | unit" titles).
//   • matplotlibStyleCode(preset, palette)          → a Python snippet that
//     sets the equivalent seaborn/matplotlib rcParams inside the Pyodide
//     export worker (pixel-parity with the group's notebook figures).
//
// The preset is a plain, serialisable object so it round-trips through Supabase.

import { BOEKHOVEN_PALETTE, plotlyColorscale } from './palette.js'

// ── "Boekhoven Wilke" — the publication-grade default ────────────────────────
// Per Wilke, Fundamentals of Data Visualization (ch. 20/23/24): larger type that
// stays legible at 2-inch width, ≤ 5 ticks per axis, heavier lines, direct
// end-of-line series labels when few series, and a vermillion dashed control.
export const WILKE_PRESET = Object.freeze({
  id: 'boekhoven-wilke',
  name: 'Boekhoven Wilke',
  builtin: true,
  plotType: 'chromGallery', // 'heatmap' | 'chromGallery' | 'xy' | 'kinetic'
  font: 'Arial',
  fontSize: 15,             // base font (pt)
  tickFontSize: 14,         // tick labels — base − 1
  axisTitleSize: 15.5,      // axis titles
  sizeInches: [6, 4],       // width, height — used for matplotlib export
  dpi: 300,
  axisSep: ' | ',           // "Absorbance 600 nm | AU"; use ' / ' for "t / min"
  spines: { top: false, right: false, left: true, bottom: true },
  grid: false,
  nticks: 5,                // ≤ 5 ticks per axis
  lineWidth: 2.2,
  legend: { show: true, frame: false, fontSize: 13, direct: true, directMax: 6 },
  control: { color: '#D55E00', dash: '6 4' }, // vermillion, dashed
  band: { alpha: 0.2 },     // mean ± SD shaded band opacity
  margin: { l: 64, b: 56, r: 15, t: 12 },
})

// ── "Default (current)" — reproduces the app's previous figure styling ───────
// Kept as a switchable preset so users can render the before/after comparison.
export const LEGACY_PRESET = Object.freeze({
  id: 'boekhoven-default',
  name: 'Default (current)',
  builtin: true,
  plotType: 'chromGallery',
  font: 'Arial',
  fontSize: 12,
  tickFontSize: 10,
  axisTitleSize: 12,
  sizeInches: [6, 4],
  dpi: 300,
  axisSep: ' | ',
  spines: { top: false, right: false, left: true, bottom: true },
  grid: false,
  nticks: null,             // Plotly auto ticks
  lineWidth: 1.4,
  legend: { show: true, frame: true, fontSize: 11, direct: false, directMax: 6 },
  control: { color: '#D55E00', dash: null },
  band: { alpha: 0.2 },
  margin: { l: 55, b: 42, r: 15, t: 12 },
})

// Boekhoven Wilke is the default preset for new figures.
export const DEFAULT_PRESET = WILKE_PRESET
export const BUILTIN_PRESETS = [WILKE_PRESET, LEGACY_PRESET]
export function isBuiltinPreset(id) { return BUILTIN_PRESETS.some(p => p.id === id) }

// Merge a (possibly partial) preset onto the defaults so callers can pass just
// the fields they care about.
export function resolvePreset(preset) {
  const p = preset || {}
  return {
    ...DEFAULT_PRESET,
    ...p,
    spines:  { ...DEFAULT_PRESET.spines,  ...(p.spines  || {}) },
    legend:  { ...DEFAULT_PRESET.legend,  ...(p.legend  || {}) },
    band:    { ...DEFAULT_PRESET.band,    ...(p.band    || {}) },
    control: { ...DEFAULT_PRESET.control, ...(p.control || {}) },
    margin:  { ...DEFAULT_PRESET.margin,  ...(p.margin  || {}) },
  }
}

// "quantity | unit" (or the preset's separator). Unit is optional.
export function axisTitle(quantity, unit, preset) {
  const sep = (preset && preset.axisSep) || DEFAULT_PRESET.axisSep
  const q = String(quantity ?? '')
  return unit ? `${q}${sep}${unit}` : q
}

// Theme-aware fg/bg so figures read in both light and dark app themes. The
// publication export always forces light (see the export worker).
function themeColors(isDark) {
  return isDark
    ? { paper: '#0f172a', plot: '#0f172a', fg: '#e2e8f0', axis: '#475569' }
    : { paper: '#ffffff', plot: '#ffffff', fg: '#0f172a', axis: '#334155' }
}

// A despined, Arial, palette-coloured Plotly layout. Pass axis {quantity,unit}
// so titles follow the "q | u" convention.
export function boekhovenPlotlyLayout(preset, palette, opts = {}) {
  const p = resolvePreset(preset)
  const pal = palette || BOEKHOVEN_PALETTE
  const { isDark = false, x = {}, y = {}, title = '' } = opts
  const c = themeColors(isDark)

  // Tick / axis-title sizes fall back to base-derived values (Wilke: base−1 and
  // base+0.5) when a preset doesn't specify them.
  const tickSize  = p.tickFontSize  ?? (p.fontSize - 1)
  const titleSize = p.axisTitleSize ?? p.fontSize
  const m = p.margin || {}

  const axis = (side, spec) => ({
    title: { text: axisTitle(spec.quantity, spec.unit, p), font: { size: titleSize, family: p.font } },
    showgrid: !!p.grid,
    gridcolor: c.axis,
    zeroline: false,
    showline: p.spines[side] !== false,
    linecolor: c.axis,
    mirror: false,            // despined: no top/right mirror line
    ticks: 'outside',
    ticklen: 4,
    tickfont: { size: tickSize, family: p.font },
    ...(p.nticks ? { nticks: p.nticks } : {}),  // ≤ N ticks per axis
    ...(spec.range ? { range: spec.range } : {}),
    ...(spec.type ? { type: spec.type } : {}),
  })

  return {
    title: title ? { text: title, font: { size: p.fontSize + 2, family: p.font } } : undefined,
    font: { family: p.font, size: p.fontSize, color: c.fg },
    colorway: pal.categorical,
    paper_bgcolor: c.paper,
    plot_bgcolor: c.plot,
    xaxis: axis('bottom', x),
    yaxis: axis('left', y),
    showlegend: p.legend.show,
    legend: {
      font: { size: p.legend.fontSize, family: p.font },
      bgcolor: 'rgba(0,0,0,0)',
      borderwidth: p.legend.frame ? 1 : 0,
    },
    margin: { l: m.l ?? 64, r: m.r ?? 15, t: title ? 34 : (m.t ?? 12), b: m.b ?? 56 },
  }
}

// Plotly heatmap layout+colorscale for a conversion / concentration matrix.
export function boekhovenHeatmapLayout(preset, palette, opts = {}) {
  const p = resolvePreset(preset)
  const layout = boekhovenPlotlyLayout(p, palette, opts)
  layout.xaxis.type = 'category'
  layout.yaxis.type = 'category'
  layout.yaxis.autorange = 'reversed' // matrix row A at the top, like the notebook
  layout.margin.r = 60
  return { layout, colorscale: plotlyColorscale(palette || BOEKHOVEN_PALETTE) }
}

// ── matplotlib / seaborn style for the Pyodide export worker ─────────────────
// Returns a Python snippet defining `apply_style()` which mirrors the preset.
// Colours are passed through so the export uses the same palette as the preview.
export function matplotlibStyleCode(preset, palette) {
  const p = resolvePreset(preset)
  const pal = palette || BOEKHOVEN_PALETTE
  const cats = JSON.stringify(pal.categorical)
  const seq = JSON.stringify(pal.sequential)
  const spinesTop = p.spines.top ? 'True' : 'False'
  const spinesRight = p.spines.right ? 'True' : 'False'
  const grid = p.grid ? 'True' : 'False'
  const [w, h] = p.sizeInches
  const tickSize  = p.tickFontSize  ?? (p.fontSize - 1)
  const titleSize = p.axisTitleSize ?? p.fontSize
  const nticks = p.nticks ? p.nticks : 'None'
  // matplotlib dash tuple from a Plotly-style "on off" string, else solid.
  const ctrlDash = p.control?.dash
    ? `(0, (${p.control.dash.split(/\s+/).map(Number).join(', ')}))`
    : "'-'"
  // Note: executed inside Pyodide where seaborn + matplotlib are available.
  return `
import matplotlib as _mpl
import matplotlib.pyplot as _plt
from cycler import cycler as _cycler
try:
    import seaborn as _sns
except Exception:
    _sns = None

BOEKHOVEN_CATEGORICAL = ${cats}
BOEKHOVEN_SEQUENTIAL  = ${seq}
BOEKHOVEN_CONTROL     = ${JSON.stringify(pal.control)}
BOEKHOVEN_MAX_TICKS   = ${nticks}
# Redundant coding for the control/reference trace: vermillion + dashed.
BOEKHOVEN_CONTROL_STYLE = {"color": BOEKHOVEN_CONTROL, "linestyle": ${ctrlDash}}

def apply_style():
    if _sns is not None:
        _sns.set_theme(style="white", context="notebook", font="${p.font}",
                       rc={"axes.grid": ${grid}})
    _mpl.rcParams.update({
        "font.family": "${p.font}",
        "font.size": ${p.fontSize},
        "axes.labelsize": ${titleSize},
        "axes.titlesize": ${p.fontSize + 1},
        "xtick.labelsize": ${tickSize},
        "ytick.labelsize": ${tickSize},
        "figure.figsize": (${w}, ${h}),
        "figure.dpi": ${p.dpi},
        "savefig.dpi": ${p.dpi},
        "axes.grid": ${grid},
        "axes.spines.top": ${spinesTop},
        "axes.spines.right": ${spinesRight},
        "axes.linewidth": 1.0,
        "lines.linewidth": ${p.lineWidth ?? 1.4},
        "axes.prop_cycle": _cycler(color=BOEKHOVEN_CATEGORICAL),
        "legend.frameon": ${p.legend.frame ? 'True' : 'False'},
        "legend.fontsize": ${p.legend.fontSize},
    })

def apply_ticks(ax):
    # Wilke's "zoom-out test": keep ≤ N ticks per axis so labels stay legible
    # when the figure is scaled down to ~2-inch width.
    if BOEKHOVEN_MAX_TICKS:
        from matplotlib.ticker import MaxNLocator
        ax.xaxis.set_major_locator(MaxNLocator(BOEKHOVEN_MAX_TICKS))
        ax.yaxis.set_major_locator(MaxNLocator(BOEKHOVEN_MAX_TICKS))
    return ax

def sequential_cmap():
    from matplotlib.colors import LinearSegmentedColormap
    return LinearSegmentedColormap.from_list("boekhoven_seq", BOEKHOVEN_SEQUENTIAL)
`
}
