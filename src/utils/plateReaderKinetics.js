// A 16-hour kinetic plate run → what actually happened in each well.
//
// Absorbance kinetics on a coacervate screen answer two questions per well: did
// droplets ever form, and did they go away again. This module reads a SkanIt XML
// export (Thermo Multiskan / Varioskan, "Platereader 1") and then answers both —
// with thresholds the user sets, never with a fit. Where a well sits on the line
// between "turbid" and "not turbid" is a lab decision, so it is an input here.
//
// Three outcomes:
//   none        never rose far enough above baseline to count as coacervation
//   transient   rose, then came back down within the time the user allows
//   metastable  rose and never came back — aggregates, or droplets that persist
//
// Every level is anchored to something the experimenter can point at: the well's
// own first reading, or a blank they measured and typed in. Nothing is fitted to
// the shape of the curve, so two wells with the same OD are always judged the same
// way regardless of how tall their peaks were.
//
// What is measured is never guessed. A well whose first reading is already turbid
// gets the `startsHigh` flag rather than a lifetime starting at t = 0: the run
// cannot say when that turbidity began, and a lifetime that pretends otherwise is
// a number nobody measured. Same for the time limit — a well that has not
// dissolved by the end of the run is metastable *as far as this run goes*, which
// is why `dissolvedMin` stays null instead of being extrapolated.

export const KINETIC_CLASSES = Object.freeze([
  { key: 'none',       label: 'No coacervation',       short: 'None',       phase: 0 },
  { key: 'transient',  label: 'Transient coacervate',  short: 'Transient',  phase: 1 },
  { key: 'metastable', label: 'Metastable / aggregate', short: 'Metastable', phase: 2 },
])

export const DEFAULT_KINETIC_SETTINGS = Object.freeze({
  // Baseline: the well's own first reading, or a blank you measured and type in.
  // The manual blank is what to use when wells were already turbid before the run
  // started — their own first reading is not a blank, and judging them against it
  // hides the coacervate that formed during pipetting.
  baselineMode: 'first',   // 'first' | 'manual'
  baselineValue: 0.08,     // OD, used when baselineMode is 'manual'
  smoothPoints: 3,

  // Did it coacervate? Either a rise above baseline, or a flat OD cut-off.
  riseMode: 'delta',       // 'delta' | 'absolute'
  riseDelta: 0.05,
  riseAbs: 0.15,

  // Did it dissolve again? Back to within an OD of the baseline, or below a flat
  // OD you type in.
  dropMode: 'delta',       // 'delta' | 'absolute'
  dropDelta: 0.02,
  dropAbs: 0.10,
  sustainPoints: 3,        // consecutive readings below the level before it counts

  // Dissolution has to have happened by this time (minutes) or the well is
  // metastable. null = the full length of the run.
  timeLimitMin: null,
})

// A number input that has been cleared hands back '' , not a number. Coercing here
// keeps an empty field from turning a threshold into string arithmetic — silently
// reclassifying the plate — and lets it mean "the default" instead.
const NUMERIC_SETTINGS = [
  'baselineValue', 'smoothPoints', 'riseDelta', 'riseAbs',
  'dropDelta', 'dropAbs', 'sustainPoints',
]

// Settings saved by an earlier version named their modes differently. Mapping them
// forward keeps old datasets classifying the same way instead of silently falling
// through to a default.
const LEGACY_BASELINE = { well: 'first', plate: 'manual' }
const LEGACY_DROP = { fraction: 'delta' }

export const normalizeKineticSettings = (s) => {
  const out = { ...DEFAULT_KINETIC_SETTINGS, ...(s || {}) }
  out.baselineMode = LEGACY_BASELINE[out.baselineMode] || out.baselineMode
  out.dropMode = LEGACY_DROP[out.dropMode] || out.dropMode
  if (out.baselineMode !== 'manual') out.baselineMode = 'first'
  if (out.dropMode !== 'absolute') out.dropMode = 'delta'
  for (const key of NUMERIC_SETTINGS) {
    const n = parseFloat(out[key])
    out[key] = isFinite(n) ? n : DEFAULT_KINETIC_SETTINGS[key]
  }
  const limit = parseFloat(out.timeLimitMin)
  out.timeLimitMin = isFinite(limit) && limit > 0 ? limit : null   // null = the whole run
  return out
}

// ── Number parsing ───────────────────────────────────────────────────────────
// SkanIt writes the machine's locale: "0,0790" and "1 080,00" on a German
// install, "1,080.00" on an English one. Whichever separator comes last is the
// decimal point.
// \s already covers NBSP, thin and narrow spaces — the separators SkanIt emits.
const SPACES = /\s/g

export function parseNumber(raw) {
  let s = String(raw ?? '').replace(SPACES, '')
  if (!s) return NaN
  const comma = s.lastIndexOf(','), dot = s.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (comma >= 0) {
    s = s.replace(',', '.')
  }
  const v = parseFloat(s)
  return isFinite(v) ? v : NaN
}

const attrOf = (attrs, name) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)
  return m ? m[1] : ''
}

const tagText = (src, name) => {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(src)
  return m ? m[1].trim() : ''
}

// ── SkanIt XML ───────────────────────────────────────────────────────────────
// The file is one <Session> holding <ResultStep> blocks; inside each, a <Plate>,
// a <Wavelength>, and one <Coordinate> per well carrying an <Iteration>/<Result>
// pair per reading. A run with two absorbance steps, or two wavelengths, is
// therefore several independent traces per well — kept apart as "channels" so
// the caller picks which one to classify instead of getting them silently mixed.
//
// The <Plates><PlateTemplate> block at the end repeats every coordinate to
// describe the layout; it holds no readings and is skipped.
export function parseSkanItXml(text) {
  const src = String(text || '')
  if (!/<ResultStep\b/i.test(src)) return null

  const channels = []
  const byKey = new Map()
  let step = '', plate = '', ex = '', em = '', cur = null, inTemplate = false

  const TAG = /<(ResultStep|PlateTemplate|Plate|Wavelength|Coordinate|Result)\b([^>]*?)\/?>/g
  let m
  while ((m = TAG.exec(src)) !== null) {
    const tag = m[1], attrs = m[2]
    if (tag === 'PlateTemplate') { inTemplate = true; cur = null; continue }
    if (inTemplate) continue

    if (tag === 'ResultStep') { step = attrOf(attrs, 'name') || 'Result'; plate = ''; ex = ''; em = ''; cur = null }
    else if (tag === 'Plate') { plate = attrOf(attrs, 'name') || ''; cur = null }
    else if (tag === 'Wavelength') { ex = attrOf(attrs, 'ex'); em = attrOf(attrs, 'em'); cur = null }
    else if (tag === 'Coordinate') {
      const row = attrOf(attrs, 'row').toUpperCase()
      const col = parseInt(attrOf(attrs, 'column'), 10)
      if (!row || !isFinite(col)) { cur = null; continue }
      const key = `${step}|${plate}|${ex}|${em}`
      let ch = byKey.get(key)
      if (!ch) {
        ch = { key, step, plate, ex, em, wells: {} }
        byKey.set(key, ch)
        channels.push(ch)
      }
      const wellId = row + col
      cur = ch.wells[wellId] || (ch.wells[wellId] = { t: [], v: [], saturated: false })
    } else if (tag === 'Result') {
      if (!cur) continue
      if (attrOf(attrs, 'disabled') === 'true') continue
      const tSec = parseNumber(attrOf(attrs, 'time'))
      const value = parseNumber(attrOf(attrs, 'value'))
      if (!isFinite(tSec) || !isFinite(value)) continue
      cur.t.push(tSec / 60)   // everything downstream is in minutes
      cur.v.push(value)
      if (attrOf(attrs, 'saturated') === 'true') cur.saturated = true
    }
  }

  // Drop wells that were declared but never read, then channels left with none.
  const live = []
  for (const ch of channels) {
    for (const [id, w] of Object.entries(ch.wells)) {
      if (!w.t.length) { delete ch.wells[id]; continue }
      if (!isSorted(w.t)) sortTrace(w)
    }
    const ids = Object.keys(ch.wells)
    if (!ids.length) continue
    const spans = ids.map(id => ch.wells[id].t[ch.wells[id].t.length - 1])
    ch.wellCount = ids.length
    ch.readings = Math.max(...ids.map(id => ch.wells[id].t.length))
    ch.durationMin = Math.max(...spans)
    ch.intervalMin = ch.readings > 1 ? ch.durationMin / (ch.readings - 1) : 0
    ch.label = [ch.step, ch.plate, ch.ex && `${ch.ex} nm`].filter(Boolean).join(' · ')
    live.push(ch)
  }
  if (!live.length) return null

  const meta = {
    instrument: tagText(src, 'Name'),
    session: tagText(src, 'SessionName'),
    description: tagText(src, 'SessionDescription'),
    executedAt: tagText(src, 'SessionExecutedTime'),
    software: tagText(src, 'SoftwareVersion'),
    readings: tagText(src, 'NoOfReadings'),
    totalTime: tagText(src, 'TotalTime'),
    interval: tagText(src, 'KineticInterval'),
    temperature: tagText(src, 'InstrumentSetTemperature'),
  }
  return { channels: live, meta }
}

const isSorted = (a) => { for (let i = 1; i < a.length; i++) if (a[i] < a[i - 1]) return false; return true }
const sortTrace = (w) => {
  const idx = w.t.map((t, i) => i).sort((a, b) => w.t[a] - w.t[b])
  w.t = idx.map(i => w.t[i])
  w.v = idx.map(i => w.v[i])
}

// ── Statistics ───────────────────────────────────────────────────────────────
export function median(values) {
  const a = values.filter(v => isFinite(v)).sort((x, y) => x - y)
  if (!a.length) return NaN
  const mid = a.length >> 1
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

// A moving median, not a mean: a single spike from a bubble crossing the beam
// should not lift the peak the classification is read off.
export function smoothSeries(values, points) {
  const n = Math.max(1, Math.round(points || 1))
  if (n < 2 || values.length < n) return values.slice()
  const half = n >> 1
  return values.map((_, i) => median(values.slice(Math.max(0, i - half), Math.min(values.length, i + half + 1))))
}

// The well's own starting point: the first reading of the smoothed trace. Smoothing
// is what makes a single reading safe to anchor on — v[0] of a 3-point moving median
// is already the middle of the first readings, not one noisy number.
const firstReading = (v) => v[0]

// ── Classification ───────────────────────────────────────────────────────────
/**
 * One well's verdict.
 *
 * { cls, baseline, startBaseline, peak, tPeakMin, riseLevel, dropLevel,
 *   onsetMin, dissolvedMin, lifetimeMin, endOD, minAfterPeak, amplitude,
 *   startsHigh, saturated, smoothed }
 *
 * `lifetimeMin` is the time between crossing the coacervation level and coming
 * back under the dissolution level — null unless both actually happened.
 */
export function summarizeWell(trace, settings, blank) {
  const s = normalizeKineticSettings(settings)
  const t = trace.t
  const v = smoothSeries(trace.v, s.smoothPoints)
  const startBase = firstReading(v)
  const baseline = s.baselineMode === 'manual' ? s.baselineValue : startBase

  let peak = -Infinity, iPeak = 0
  for (let i = 0; i < v.length; i++) if (v[i] > peak) { peak = v[i]; iPeak = i }

  const riseLevel = s.riseMode === 'absolute' ? s.riseAbs : baseline + s.riseDelta
  const endOD = median(v.slice(Math.max(0, v.length - 3)))
  const afterPeak = v.slice(iPeak + 1)
  const minAfterPeak = afterPeak.length ? Math.min(...afterPeak) : peak

  // Judged against the plate blank, was this well already over the line at t=0?
  const blankRise = s.riseMode === 'absolute' ? s.riseAbs : (isFinite(blank) ? blank : startBase) + s.riseDelta
  const startsHigh = startBase >= blankRise

  const base = {
    baseline, startBaseline: startBase, peak, tPeakMin: t[iPeak],
    amplitude: peak - baseline, riseLevel, endOD, minAfterPeak,
    startsHigh, saturated: !!trace.saturated, smoothed: v,
    lastMin: t[t.length - 1],
  }

  if (!(peak >= riseLevel)) {
    return { ...base, cls: 'none', dropLevel: null, onsetMin: null, dissolvedMin: null, lifetimeMin: null }
  }

  const dropLevel = s.dropMode === 'absolute' ? s.dropAbs : baseline + s.dropDelta

  let onsetMin = null
  for (let i = 0; i < v.length; i++) if (v[i] >= riseLevel) { onsetMin = t[i]; break }

  // Dissolution has to hold: one reading dipping under the level is noise, a run
  // of them is the droplets being gone.
  const sustain = Math.max(1, Math.round(s.sustainPoints))
  let dissolvedMin = null, run = 0
  for (let i = iPeak + 1; i < v.length; i++) {
    if (v[i] <= dropLevel) {
      if (++run >= sustain) { dissolvedMin = t[i - sustain + 1]; break }
    } else run = 0
  }

  const limit = s.timeLimitMin === null ? t[t.length - 1] : s.timeLimitMin
  const inTime = dissolvedMin !== null && dissolvedMin <= limit
  return {
    ...base,
    cls: inTime ? 'transient' : 'metastable',
    dropLevel,
    onsetMin,
    // A well that only dissolved after the deadline is metastable by the user's
    // own rule, so the time is reported but the lifetime is not claimed.
    dissolvedMin,
    lifetimeMin: inTime && onsetMin !== null ? dissolvedMin - onsetMin : null,
    lateDissolution: dissolvedMin !== null && !inTime,
  }
}

/**
 * Every well of one channel. Returns { blank, wells, counts, durationMin }.
 * `blank` is the plate-wide median of the per-well start baselines — the best
 * estimate of "an empty well" the run itself contains.
 */
export function analyzePlate(wells, settings) {
  const s = normalizeKineticSettings(settings)
  const ids = Object.keys(wells || {})
  // Not a baseline — the reference the `startsHigh` flag is judged against, so a
  // well that began well above where the rest of the plate began gets called out.
  const blank = s.baselineMode === 'manual'
    ? s.baselineValue
    : median(ids.map(id => firstReading(smoothSeries(wells[id].v, s.smoothPoints))))

  const out = {}
  const counts = { none: 0, transient: 0, metastable: 0 }
  let durationMin = 0
  for (const id of ids) {
    const sum = summarizeWell(wells[id], s, blank)
    out[id] = sum
    counts[sum.cls]++
    durationMin = Math.max(durationMin, sum.lastMin)
  }
  return { blank, wells: out, counts, durationMin }
}

// Wells in plate reading order (A1…A12, B1…) for tables and grids.
export function sortWellIds(ids) {
  const key = (id) => {
    const m = /^([A-Z]+)(\d+)$/.exec(id)
    if (!m) return [1e6, 0]
    let row = 0
    for (const ch of m[1]) row = row * 26 + (ch.charCodeAt(0) - 64)
    return [row, parseInt(m[2], 10)]
  }
  return [...ids].sort((a, b) => {
    const ka = key(a), kb = key(b)
    return ka[0] - kb[0] || ka[1] - kb[1]
  })
}

export const formatMinutes = (raw) => {
  // '' from a cleared input coerces to 0 through isFinite, so reject it by hand
  // rather than reporting "0.0 min" for a field nobody filled in.
  if (raw === null || raw === undefined || raw === '') return '—'
  const min = Number(raw)
  if (!isFinite(min)) return '—'
  if (min < 90) return `${min.toFixed(min < 10 ? 1 : 0)} min`
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return m ? `${h} h ${m} min` : `${h} h`
}
