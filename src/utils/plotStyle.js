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

export const DEFAULT_PRESET = Object.freeze({
  id: 'boekhoven-default',
  name: 'Boekhoven Default',
  builtin: true,
  plotType: 'chromGallery', // 'heatmap' | 'chromGallery' | 'xy' | 'kinetic'
  font: 'Arial',
  fontSize: 12,
  sizeInches: [6, 4], // width, height — used for matplotlib export
  dpi: 300,
  axisSep: ' | ',     // "Absorbance 600 nm | AU"; use ' / ' for "t / min"
  spines: { top: false, right: false, left: true, bottom: true },
  grid: false,
  legend: { show: true, frame: false, fontSize: 11 },
  band: { alpha: 0.2 }, // mean ± SD shaded band opacity
})

// Merge a (possibly partial) preset onto the defaults so callers can pass just
// the fields they care about.
export function resolvePreset(preset) {
  const p = preset || {}
  return {
    ...DEFAULT_PRESET,
    ...p,
    spines: { ...DEFAULT_PRESET.spines, ...(p.spines || {}) },
    legend: { ...DEFAULT_PRESET.legend, ...(p.legend || {}) },
    band: { ...DEFAULT_PRESET.band, ...(p.band || {}) },
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

  const axis = (side, spec) => ({
    title: { text: axisTitle(spec.quantity, spec.unit, p), font: { size: p.fontSize, family: p.font } },
    showgrid: !!p.grid,
    gridcolor: c.axis,
    zeroline: false,
    showline: p.spines[side] !== false,
    linecolor: c.axis,
    mirror: false,            // despined: no top/right mirror line
    ticks: 'outside',
    ticklen: 4,
    tickfont: { size: p.fontSize - 2, family: p.font },
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
    margin: { l: 55, r: 15, t: title ? 34 : 12, b: 42 },
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

def apply_style():
    if _sns is not None:
        _sns.set_theme(style="white", context="notebook", font="${p.font}",
                       rc={"axes.grid": ${grid}})
    _mpl.rcParams.update({
        "font.family": "${p.font}",
        "font.size": ${p.fontSize},
        "figure.figsize": (${w}, ${h}),
        "figure.dpi": ${p.dpi},
        "savefig.dpi": ${p.dpi},
        "axes.grid": ${grid},
        "axes.spines.top": ${spinesTop},
        "axes.spines.right": ${spinesRight},
        "axes.linewidth": 1.0,
        "lines.linewidth": 1.4,
        "axes.prop_cycle": _cycler(color=BOEKHOVEN_CATEGORICAL),
        "legend.frameon": ${p.legend.frame ? 'True' : 'False'},
        "legend.fontsize": ${p.legend.fontSize},
    })

def sequential_cmap():
    from matplotlib.colors import LinearSegmentedColormap
    return LinearSegmentedColormap.from_list("boekhoven_seq", BOEKHOVEN_SEQUENTIAL)
`
}
