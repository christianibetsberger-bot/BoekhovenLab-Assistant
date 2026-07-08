// Analysis-Set registry + I/O contract for the Data & Figures module.
//
// An *Analysis Set* is a named, shareable recipe that turns raw uploaded files
// into a structured result table (+ optional per-file traces) for plotting.
// It declares the instrument, file format and filename convention so uploads
// auto-match the right set ("plug and play"). Two kinds:
//   • 'builtin' – a JS/worker pipeline shipped with the app (this file).
//   • 'python'  – user-uploaded Python run in the Pyodide worker (stored in
//                 Supabase, shareable Global). See pyAnalysisWorker.js.
//
// I/O CONTRACT (both kinds must honour it):
//   input  : files  = [{ name, text }]           params = { ...tunables }
//   output : {
//     columns : [{ key, label, unit? }],          // result-table schema
//     rows    : [{ [key]: value, ... }],          // one row per file/sample
//     traces? : { [name]: { t:[…], s:[…] } },     // raw signals for the gallery
//   }
// A Python set defines `analyze(files, params) -> dict` returning this shape.

import { areaToMicromolar, concentrationToConversion } from './hplcConcentration.js'
import { calcSeqExtinction } from './seqUtils.js'

export const CONTRACT_VERSION = 1

// 96-plate-style matrix used by the DNA heatmap: row letters × Greek columns.
export const MATRIX_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'M', 'N', 'O']
export const MATRIX_COLS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta',
  'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi']
export const GREEK_SYMBOL = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ',
}

// Solvent gradient: [time (min), % Eluent B]. Eluent B is the MeOH-containing
// eluent, so % B is effectively the % MeOH along the run (notebook GRADIENT_TABLE).
export const DEFAULT_GRADIENT = [
  [0.0, 4.0], [0.5, 4.0], [10.0, 60.0], [10.5, 60.0], [11.0, 7.0], [15.0, 7.0],
]

// MeOH correction-factor calibration: [% Eluent B, correction factor]. A line is
// fit through these points and evaluated at each peak's % B (notebook CORRECTION_FACTOR_TABLE).
export const DEFAULT_CF_CALIBRATION = [
  [10.0, 0.820], [20.0, 0.898], [30.0, 1.180], [40.0, 1.265], [50.0, 1.551],
]

// Defaults ported from HPLCHeatmap.ipynb (CONFIGURATION & PARAMETERS + Beer-Lambert).
export const HPLC_DNA_DEFAULTS = Object.freeze({
  // Peak detection (passed to hplcWorker)
  scanMin: 1.6,
  scanMax: 10.0,
  prominence: 0.05,
  baselineWindow: 1.0,
  useHplcPy: true,
  productMin: 6.2,
  productMax: 7.4,
  // Beer-Lambert + dilution (product strands' extinction is resolved per-sample)
  pathLength_cm: 0.7,
  flow_mL_min: 0.3,
  injection_uL: 5.0,
  aliquot_uL: 1.5,
  vial_uL: 24.0,
  defaultEpsilon: 180000,  // fallback product ε when strands aren't in the library
  // Dynamic MeOH correction: interpolate % B from the gradient at each peak's RT,
  // apply the linear CF(% B) fit, divide the area by it. `solventCorrection` is the
  // flat fallback used when dynamic correction is off.
  useDynamicCF: true,
  gradient: DEFAULT_GRADIENT.map(p => [...p]),
  cfCalibration: DEFAULT_CF_CALIBRATION.map(p => [...p]),
  solventCorrection: 1.31,
  // Yield → conversion %
  rMax_uM: 2.8,
})

// Least-squares line fit y = slope·x + intercept (np.polyfit deg 1).
export function linearFit(xs, ys) {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return { slope: 0, intercept: n ? ys[0] : 0 }
  let sx = 0, sy = 0, sxx = 0, sxy = 0
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i] }
  const d = n * sxx - sx * sx
  if (d === 0) return { slope: 0, intercept: sy / n }
  const slope = (n * sxy - sx * sy) / d
  return { slope, intercept: (sy - slope * sx) / n }
}

// Piecewise-linear interpolation with end clamping (np.interp). `xs` ascending.
export function interp(x, xs, ys) {
  const n = xs.length
  if (!n) return 0
  if (x <= xs[0]) return ys[0]
  if (x >= xs[n - 1]) return ys[n - 1]
  let i = 1
  while (i < n && xs[i] < x) i++
  const x0 = xs[i - 1], x1 = xs[i], y0 = ys[i - 1], y1 = ys[i]
  return x1 === x0 ? y0 : y0 + (y1 - y0) * (x - x0) / (x1 - x0)
}

// Fit the CF calibration points once → {slope, intercept}.
export function cfFit(cfCalibration) {
  const pts = (cfCalibration || DEFAULT_CF_CALIBRATION).filter(p => p && p.length >= 2)
  return linearFit(pts.map(p => +p[0]), pts.map(p => +p[1]))
}

// Dynamic MeOH correction factor at a retention time: % B from the gradient, then
// the linear CF(% B). Returns 1 when disabled or degenerate (no correction).
export function dynamicCF(rt, gradient, fit) {
  const g = (gradient || DEFAULT_GRADIENT).filter(p => p && p.length >= 2)
  if (!g.length || !fit) return 1
  const pctB = interp(+rt, g.map(p => +p[0]), g.map(p => +p[1]))
  const cf = pctB * fit.slope + fit.intercept
  return cf > 0 ? cf : 1
}

// Param form schema — drives the tunables UI in DataFigures.vue.
export const HPLC_DNA_PARAMS_SCHEMA = [
  { group: 'Peak detection', key: 'scanMin', label: 'Scan start', unit: 'min', type: 'number', step: 0.1 },
  { group: 'Peak detection', key: 'scanMax', label: 'Scan end', unit: 'min', type: 'number', step: 0.1 },
  { group: 'Peak detection', key: 'prominence', label: 'Prominence', type: 'number', step: 0.01 },
  { group: 'Peak detection', key: 'baselineWindow', label: 'Baseline window', unit: 'min', type: 'number', step: 0.1 },
  { group: 'Peak detection', key: 'productMin', label: 'Product window start', unit: 'min', type: 'number', step: 0.1 },
  { group: 'Peak detection', key: 'productMax', label: 'Product window end', unit: 'min', type: 'number', step: 0.1 },
  { group: 'Peak detection', key: 'useHplcPy', label: 'Use hplc-py fit', type: 'boolean' },
  { group: 'Quantification', key: 'pathLength_cm', label: 'Path length', unit: 'cm', type: 'number', step: 0.1 },
  { group: 'Quantification', key: 'flow_mL_min', label: 'Flow rate', unit: 'mL/min', type: 'number', step: 0.05 },
  { group: 'Quantification', key: 'injection_uL', label: 'Injection volume', unit: 'µL', type: 'number', step: 0.5 },
  { group: 'Quantification', key: 'aliquot_uL', label: 'Sample aliquot', unit: 'µL', type: 'number', step: 0.5 },
  { group: 'Quantification', key: 'vial_uL', label: 'Vial total volume', unit: 'µL', type: 'number', step: 0.5 },
  { group: 'Quantification', key: 'solventCorrection', label: 'Solvent correction', type: 'number', step: 0.01 },
  { group: 'Quantification', key: 'rMax_uM', label: 'Max theoretical yield', unit: 'µM', type: 'number', step: 0.1 },
]

export const BUILTIN_ANALYSIS_SETS = Object.freeze([
  {
    id: 'builtin:hplc-dna-heatmap',
    name: 'HPLC — DNA replicator (heatmap)',
    kind: 'builtin',
    builtinKey: 'hplc-dna',
    scope: 'Builtin',
    instrument: 'Thermo Vanquish HPLC · Chromeleon 7',
    fileFormat: 'Chromeleon .txt export — 43-line header, tab-delimited, comma decimal',
    namingConvention: 'CTI-117_Aalpha_4h.txt  (code · SeqName · time[h/min])',
    filenameMatcher: 'named', // resolved via hplcFilename.parseHplcFilename
    // Capabilities that drive which controls/figures the module shows for this set.
    hplcCorrection: true,             // gradient + MeOH correction editor
    figures: ['heatmap', 'chromGallery'],
    paramsSchema: HPLC_DNA_PARAMS_SCHEMA,
    defaults: HPLC_DNA_DEFAULTS,
    resultColumns: [
      { key: 'seqName', label: 'Sample' },
      { key: 'code', label: 'Run' },
      { key: 'timeMin', label: 'Time', unit: 'min' },
      { key: 'product_uM', label: 'Product', unit: 'µM' },
      { key: 'conversion_pct', label: 'Conversion', unit: '%' },
    ],
  },
])

export function listBuiltinAnalysisSets() {
  return BUILTIN_ANALYSIS_SETS
}

export function getAnalysisSetById(id, extra = []) {
  return [...BUILTIN_ANALYSIS_SETS, ...extra].find(s => s.id === id) || null
}

// Merge user params over a set's defaults (numbers coerced).
export function resolveParams(set, params) {
  const defs = set?.defaults || {}
  const out = { ...defs }
  for (const [k, v] of Object.entries(params || {})) {
    if (v === '' || v == null) continue
    out[k] = typeof defs[k] === 'boolean' ? !!v : (typeof defs[k] === 'number' ? Number(v) : v)
  }
  return out
}

// ── HPLC-DNA derivation ──────────────────────────────────────────────────────
// Turn one hplcWorker result (peaks + trace) plus its resolved metadata into a
// result row. `meta` carries { seqName, code, timeMin(minutes), seqAB, seqABprime }.
// Product concentration uses the summed area of the (≤2 largest) product-window
// peaks with the product duplex extinction coefficient ε(AB)+ε(A'B').
export function deriveHplcDnaRow(result, meta, params) {
  const p = params || HPLC_DNA_DEFAULTS
  const m = meta || result.parsed || {}
  const epsAB = m.seqAB ? calcSeqExtinction(m.seqAB, 'DNA') : 0
  const epsABp = m.seqABprime ? calcSeqExtinction(m.seqABprime, 'DNA') : 0
  // Fall back to the notebook's default product ε when strands are unknown so a
  // heatmap still renders (approximate, flagged in the UI).
  const epsilon = (epsAB + epsABp) > 0 ? (epsAB + epsABp) : (p.defaultEpsilon || 0)
  const epsilonEstimated = (epsAB + epsABp) <= 0

  const peaks = (result.peaks || []).map(pk => {
    const cls = pk.rt >= p.productMin && pk.rt <= p.productMax ? 'product'
      : pk.rt < p.productMin ? 'building_block' : 'other'
    return { ...pk, peakClass: cls }
  })

  const products = peaks
    .filter(pk => pk.peakClass === 'product')
    .sort((a, b) => (b.area_mAU_min || 0) - (a.area_mAU_min || 0))
    .slice(0, 2)
  const productArea = products.reduce((s, pk) => s + (pk.area_mAU_min || 0), 0)

  // Dynamic MeOH correction: divide each peak's area by CF(% B at its RT) before
  // summing, so quantification tracks the gradient. Otherwise use the flat factor.
  const fit = p.useDynamicCF ? cfFit(p.cfCalibration) : null
  const productAreaCorr = p.useDynamicCF
    ? products.reduce((s, pk) => s + (pk.area_mAU_min || 0) / dynamicCF(pk.rt, p.gradient, fit), 0)
    : productArea

  const beer = {
    pathLength_cm: p.pathLength_cm, flow_mL_min: p.flow_mL_min, injection_uL: p.injection_uL,
    aliquot_uL: p.aliquot_uL, vial_uL: p.vial_uL,
    // When dynamic CF already corrected the area, don't double-correct here.
    solventCorrection: p.useDynamicCF ? 1 : p.solventCorrection,
  }
  const product_uM = epsilon > 0 ? areaToMicromolar(productAreaCorr, epsilon, beer) : 0
  const conversion_pct = concentrationToConversion(product_uM, p.rMax_uM)

  const seqName = m.seqName || (result.name || '').split('_')[1] || result.name
  const row = seqName ? seqName[0] : ''
  const col = seqName ? seqName.slice(1) : ''

  return {
    name: result.name,
    code: m.code || '',
    seqName,
    row,
    col,
    timeMin: m.timeMin != null ? m.timeMin : (m.time != null ? m.time : null),
    epsilon,
    epsilonEstimated,
    productArea_mAU_min: productArea,
    productAreaCorr_mAU_min: productAreaCorr,
    product_uM,
    conversion_pct,
    peaks,
    trace: result.trace || { t: [], s: [] },
    error: result.error || null,
  }
}

// Pivot derived rows into a matrix z-grid for the heatmap, at one timepoint.
// `value` is the row field to plot ('conversion_pct' or 'product_uM'). Cells
// with several files (replicates) are averaged. Returns { z, x, y, xLabels }.
export function buildMatrix(rows, { value = 'conversion_pct', timeMin = null } = {}) {
  const sel = rows.filter(r => timeMin == null || r.timeMin === timeMin)
  const usedRows = MATRIX_ROWS.filter(rl => sel.some(r => r.row === rl))
  const usedCols = MATRIX_COLS.filter(cl => sel.some(r => r.col === cl))
  const z = usedRows.map(rl =>
    usedCols.map(cl => {
      const hits = sel.filter(r => r.row === rl && r.col === cl)
      if (!hits.length) return null
      return hits.reduce((s, r) => s + (Number(r[value]) || 0), 0) / hits.length
    })
  )
  return {
    z,
    x: usedCols,
    xLabels: usedCols.map(c => GREEK_SYMBOL[c] || c),
    y: usedRows,
  }
}

// Distinct timepoints present in a result set, ascending.
export function timepointsOf(rows) {
  return [...new Set(rows.map(r => r.timeMin).filter(t => t != null))].sort((a, b) => a - b)
}
