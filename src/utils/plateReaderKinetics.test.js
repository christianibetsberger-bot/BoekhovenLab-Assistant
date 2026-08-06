import { describe, it, expect } from 'vitest'
import {
  parseSkanItXml, parseNumber, summarizeWell, analyzePlate, smoothSeries,
  sortWellIds, formatMinutes, normalizeKineticSettings, DEFAULT_KINETIC_SETTINGS,
} from './plateReaderKinetics'

// A SkanIt export in miniature: German number locale, a space as the thousands
// separator, one disabled reading, and the PlateTemplate block that repeats every
// coordinate without any readings.
function makeXml(wells, { step = 'Absorbance 1', ex = '600' } = {}) {
  const coord = (id, pts) => {
    const row = id[0], col = id.slice(1)
    const iters = pts.map(([t, v, extra], i) => {
      const sec = (t * 60).toFixed(2).replace('.', ',')
      const spaced = sec.length > 6 ? sec.slice(0, sec.length - 6) + ' ' + sec.slice(sec.length - 6) : sec
      return `<Iteration value="${i + 1}"><Result saturated="false" disabled="${extra === 'off' ? 'true' : 'false'}" time="${spaced}" value="${String(v).replace('.', ',')}" /></Iteration>`
    }).join('')
    return `<Coordinate column="${col}" row="${row}" basetime="0,00">${iters}</Coordinate>`
  }
  const body = Object.entries(wells).map(([id, pts]) => coord(id, pts)).join('')
  const template = Object.keys(wells).map(id =>
    `<Coordinate column="${id.slice(1)}" row="${id[0]}"><Sample name="Std00${id}"><Type>Standard</Type></Sample></Coordinate>`).join('')
  return `<?xml version="1.0" encoding="utf-8"?>
<Sessions><Session name="run.skax">
  <ResultStep name="${step}"><Plate name="Plate 1"><Wavelength ex="${ex}" em="0"><Wells>${body}</Wells></Wavelength></Plate></ResultStep>
  <ResultsSummary><SessionName>run.skax</SessionName><Name>Multiskan GO</Name><NoOfReadings>3</NoOfReadings><TotalTime>16:00:00</TotalTime></ResultsSummary>
  <Plates><PlateTemplate><Plate name="Plate 1"><Wells>${template}</Wells></Plate></PlateTemplate></Plates>
</Session></Sessions>`
}

// Traces are built from a shape rather than typed out: flat, a peak that returns
// to baseline, and a peak that stays up.
const trace = (shape, { n = 60, stepMin = 2, base = 0.075, peak = 0.6, riseAt = 4, fallAt = 20 } = {}) => {
  const t = [], v = []
  for (let i = 0; i < n; i++) {
    const min = i * stepMin
    let od = base
    if (shape !== 'flat' && min >= riseAt) od = peak
    if (shape === 'transient' && min >= fallAt) od = base
    t.push(min); v.push(od)
  }
  return { t, v }
}

describe('parseNumber', () => {
  it('reads the German locale SkanIt writes', () => {
    expect(parseNumber('0,0790')).toBeCloseTo(0.079, 6)
    expect(parseNumber('1 080,00')).toBeCloseTo(1080, 6)
    expect(parseNumber('16 920,00')).toBeCloseTo(16920, 6)
  })
  it('reads the English locale too', () => {
    expect(parseNumber('1,080.00')).toBeCloseTo(1080, 6)
    expect(parseNumber('0.079')).toBeCloseTo(0.079, 6)
  })
  it('is NaN for anything that is not a number', () => {
    expect(parseNumber('')).toBeNaN()
    expect(parseNumber('Overflow')).toBeNaN()
  })
})

describe('parseSkanItXml', () => {
  const xml = makeXml({ A1: [[0, 0.079], [2, 0.081], [4, 0.08]], H12: [[0, 0.5], [2, 0.6], [4, 0.55]] })

  it('returns one channel with time in minutes', () => {
    const parsed = parseSkanItXml(xml)
    expect(parsed.channels).toHaveLength(1)
    const ch = parsed.channels[0]
    expect(ch.wellCount).toBe(2)
    expect(ch.wells.A1.t).toEqual([0, 2, 4])
    expect(ch.wells.A1.v[0]).toBeCloseTo(0.079, 6)
    expect(ch.durationMin).toBe(4)
    expect(ch.intervalMin).toBe(2)
    expect(ch.label).toBe('Absorbance 1 · Plate 1 · 600 nm')
  })

  it('does not let the plate template invent wells', () => {
    const parsed = parseSkanItXml(xml)
    expect(Object.keys(parsed.channels[0].wells).sort()).toEqual(['A1', 'H12'])
  })

  it('keeps two wavelengths apart instead of mixing them', () => {
    const a = makeXml({ A1: [[0, 0.1]] })
    const b = makeXml({ A1: [[0, 0.9]] }, { step: 'Absorbance 2', ex: '350' })
    const second = b.slice(b.indexOf('<ResultStep'), b.indexOf('<ResultsSummary'))
    const merged = a.replace('<Plates>', second + '<Plates>')
    const parsed = parseSkanItXml(merged)
    expect(parsed.channels).toHaveLength(2)
    expect(parsed.channels[1].wells.A1.v[0]).toBeCloseTo(0.9, 6)
  })

  it('skips readings the operator disabled', () => {
    const parsed = parseSkanItXml(makeXml({ A1: [[0, 0.079], [2, 9.9, 'off'], [4, 0.08]] }))
    expect(parsed.channels[0].wells.A1.v).toHaveLength(2)
  })

  it('pulls the run metadata', () => {
    const { meta } = parseSkanItXml(xml)
    expect(meta.instrument).toBe('Multiskan GO')
    expect(meta.session).toBe('run.skax')
    expect(meta.totalTime).toBe('16:00:00')
  })

  it('is null for a file that is not a SkanIt result', () => {
    expect(parseSkanItXml('<html><body>nope</body></html>')).toBeNull()
    expect(parseSkanItXml('')).toBeNull()
  })
})

describe('smoothSeries', () => {
  it('a moving median drops a single spike', () => {
    expect(smoothSeries([1, 1, 9, 1, 1], 3)).toEqual([1, 1, 1, 1, 1])
  })
  it('leaves the series alone when smoothing is off', () => {
    expect(smoothSeries([1, 9, 1], 1)).toEqual([1, 9, 1])
  })
})

describe('summarizeWell', () => {
  const S = DEFAULT_KINETIC_SETTINGS

  it('calls a flat well no coacervation', () => {
    const r = summarizeWell(trace('flat'), S, 0.075)
    expect(r.cls).toBe('none')
    expect(r.onsetMin).toBeNull()
    expect(r.lifetimeMin).toBeNull()
  })

  it('calls a peak that returns to baseline transient, with a lifetime', () => {
    const r = summarizeWell(trace('transient'), S, 0.075)
    expect(r.cls).toBe('transient')
    expect(r.onsetMin).toBe(4)
    expect(r.dissolvedMin).toBe(20)
    expect(r.lifetimeMin).toBe(16)
  })

  it('calls a peak that stays up metastable', () => {
    const r = summarizeWell(trace('sustained'), S, 0.075)
    expect(r.cls).toBe('metastable')
    expect(r.dissolvedMin).toBeNull()
    expect(r.lifetimeMin).toBeNull()
  })

  it('a rise under the threshold is not coacervation', () => {
    const r = summarizeWell(trace('transient', { peak: 0.1 }), S, 0.075)
    expect(r.cls).toBe('none')
    expect(summarizeWell(trace('transient', { peak: 0.1 }), { ...S, riseDelta: 0.02 }, 0.075).cls).toBe('transient')
  })

  it('dissolution past the time limit is metastable, and says when it happened', () => {
    const late = trace('transient', { fallAt: 80 })
    expect(summarizeWell(late, S, 0.075).cls).toBe('transient')
    const r = summarizeWell(late, { ...S, timeLimitMin: 60 }, 0.075)
    expect(r.cls).toBe('metastable')
    expect(r.dissolvedMin).toBe(80)
    expect(r.lateDissolution).toBe(true)
    expect(r.lifetimeMin).toBeNull()
  })

  it('needs the dip to hold — one low reading is noise', () => {
    const t = trace('sustained')
    t.v[30] = 0.075                       // a single reading back at baseline
    expect(summarizeWell(t, { ...S, smoothPoints: 1 }, 0.075).cls).toBe('metastable')
    expect(summarizeWell(t, { ...S, smoothPoints: 1, sustainPoints: 1 }, 0.075).cls).toBe('transient')
  })

  it('absolute mode judges the raw OD, not the rise', () => {
    const dim = trace('transient', { base: 0.02, peak: 0.1 })
    expect(summarizeWell(dim, S, 0.02).cls).toBe('transient')                                  // rose 0.08
    expect(summarizeWell(dim, { ...S, riseMode: 'absolute', riseAbs: 0.15 }, 0.02).cls).toBe('none')
  })

  it('flags a well that was already turbid at the first reading', () => {
    const preformed = trace('transient', { base: 0.4, peak: 0.8 })
    const r = summarizeWell(preformed, S, 0.075)
    expect(r.startsHigh).toBe(true)
    expect(summarizeWell(trace('transient'), S, 0.075).startsHigh).toBe(false)
  })

  it('a measured blank rescues a well that coacervated before the run started', () => {
    // Turbid from t = 0 and never dissolving: against its own first reading there
    // is no rise at all, against a blank that was actually measured it is plainly
    // an aggregate.
    const preformed = { t: trace('flat').t, v: trace('flat', { base: 0.6 }).v }
    expect(summarizeWell(preformed, S, 0.075).cls).toBe('none')
    expect(summarizeWell(preformed, { ...S, baselineMode: 'manual', baselineValue: 0.075 }, 0.075).cls).toBe('metastable')
  })

  it('takes the baseline from the first reading, not from a window over the start', () => {
    // A well that is already rising when the run begins: the baseline is where it
    // started, so the rise is measured from there and nowhere else.
    const rising = trace('transient', { riseAt: 0 })
    expect(summarizeWell(rising, S, 0.075).baseline).toBeCloseTo(0.6, 6)
    const flat = trace('transient')
    expect(summarizeWell(flat, S, 0.075).baseline).toBeCloseTo(0.075, 6)
  })

  it('a typed blank is the baseline for every well, whatever they started at', () => {
    const r = summarizeWell(trace('transient', { base: 0.2 }), { ...S, baselineMode: 'manual', baselineValue: 0.09 }, 0.075)
    expect(r.baseline).toBe(0.09)
    expect(r.riseLevel).toBeCloseTo(0.09 + S.riseDelta, 6)
  })

  it('dissolution is the baseline plus what you type, or a flat OD', () => {
    const r = summarizeWell(trace('transient'), { ...S, dropMode: 'delta', dropDelta: 0.02 }, 0.075)
    expect(r.dropLevel).toBeCloseTo(0.095, 6)
    const abs = summarizeWell(trace('transient'), { ...S, dropMode: 'absolute', dropAbs: 0.1 }, 0.075)
    expect(abs.dropLevel).toBe(0.1)
  })

  it('a dissolution threshold under the baseline never fires', () => {
    // The well returns to 0.075; asking it to fall below 0.05 is asking for
    // something that never happened, so it stays metastable rather than being
    // rounded into a transient.
    const r = summarizeWell(trace('transient'), { ...S, dropMode: 'absolute', dropAbs: 0.05 }, 0.075)
    expect(r.cls).toBe('metastable')
    expect(r.dissolvedMin).toBeNull()
  })
})

describe('a cleared number field', () => {
  const S = DEFAULT_KINETIC_SETTINGS

  it('falls back to the default instead of doing string arithmetic', () => {
    const blanked = { ...S, riseDelta: '', smoothPoints: '', sustainPoints: '', baselineValue: '' }
    const r = summarizeWell(trace('transient'), blanked, 0.075)
    expect(r.cls).toBe('transient')
    expect(typeof r.riseLevel).toBe('number')
    expect(r.riseLevel).toBeCloseTo(0.075 + S.riseDelta, 6)
  })

  it('an empty time limit means the whole run, not zero', () => {
    expect(summarizeWell(trace('transient'), { ...S, timeLimitMin: '' }, 0.075).cls).toBe('transient')
    expect(summarizeWell(trace('transient'), { ...S, timeLimitMin: null }, 0.075).cls).toBe('transient')
  })

  it('formats an empty value as a dash rather than crashing', () => {
    expect(formatMinutes('')).toBe('—')
    expect(formatMinutes('90')).toBe('1 h 30 min')
    expect(formatMinutes(NaN)).toBe('—')
  })
})

describe('settings saved by an earlier version', () => {
  it('maps the old mode names forward instead of falling back to a default', () => {
    const legacy = normalizeKineticSettings({ baselineMode: 'well', dropMode: 'fraction', dropFraction: 0.2 })
    expect(legacy.baselineMode).toBe('first')
    expect(legacy.dropMode).toBe('delta')
    const asPlate = normalizeKineticSettings({ baselineMode: 'plate' })
    expect(asPlate.baselineMode).toBe('manual')
  })

  it('refuses a mode it does not recognise', () => {
    expect(normalizeKineticSettings({ baselineMode: 'bogus' }).baselineMode).toBe('first')
    expect(normalizeKineticSettings({ dropMode: 'bogus' }).dropMode).toBe('delta')
  })
})

describe('analyzePlate', () => {
  it('counts the classes and takes the blank from the plate', () => {
    const r = analyzePlate({
      A1: trace('flat'), A2: trace('flat'),
      B1: trace('transient'), B2: trace('transient'),
      C1: trace('sustained'),
    }, DEFAULT_KINETIC_SETTINGS)
    expect(r.counts).toEqual({ none: 2, transient: 2, metastable: 1 })
    expect(r.blank).toBeCloseTo(0.075, 6)
    expect(r.durationMin).toBe(118)
  })
})

describe('helpers', () => {
  it('sorts wells in reading order', () => {
    expect(sortWellIds(['B2', 'A10', 'A2', 'A1', 'B1'])).toEqual(['A1', 'A2', 'A10', 'B1', 'B2'])
  })
  it('formats minutes the way a lab book would', () => {
    expect(formatMinutes(4.5)).toBe('4.5 min')
    expect(formatMinutes(45)).toBe('45 min')
    expect(formatMinutes(150)).toBe('2 h 30 min')
    expect(formatMinutes(120)).toBe('2 h')
    expect(formatMinutes(null)).toBe('—')
  })
})
