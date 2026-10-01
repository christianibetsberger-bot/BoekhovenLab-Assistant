// Fixture plates and configs shared by the dialog preview and the deck-map preview.
import { defaultOt2Config, newOt2Step } from '../../src/utils/opentronsExport.js'

const chip = (code, name, stock, unit) => `<span class="inv-ref" data-inv-id="inv-${code}" data-labware="">[${code}] ${name} (${stock} ${unit})</span>`
const linked = (code, name, stock, unit, vol) => `&nbsp;${chip(code, name, stock, unit)}&nbsp; ${vol} µL<br>`
const fill = (label, vol) => `<strong>${label}:</strong> ${vol} µL<br>`
const ROWS = 'ABCDEFGH'

export function plate96({ name, peptide, rna, total = 80 }) {
  const wells = {}
  for (let r = 0; r < 8; r++) for (let c = 1; c <= 12; c++) {
    const a = peptide(r, c), b = rna(r, c)
    wells[`${ROWS[r]}${c}`] = linked('C1', 'K10 peptide', 10, 'mM', a.toFixed(2)) + linked('C2', 'pU RNA', 8, 'mM', b.toFixed(2)) + fill('MQ H₂O', (total - a - b).toFixed(2))
  }
  wells.A1 += '<strong>EDC:</strong> 4.00 µL (10 mM)<br>'
  return { name, format: 96, targetVolume: total, wells }
}

export function fixture(which) {
  let plate, cfg
  if (which === 'multi') {
    plate = plate96({ name: 'Coacervate kinetics 12', peptide: (r, c) => 5 + c, rna: () => 10 })
    cfg = defaultOt2Config(plate)
    cfg.pipettes = { left: 'p300_multi_gen2', right: 'p20_single_gen2' }
    const series = newOt2Step('series'); Object.assign(series, { count: 6, intervalMinutes: 30, wells: 'A1-H2', volume: 25, quenchName: 'TFA 1 %', quenchUl: 30 })
    const mix = newOt2Step('mix'); Object.assign(mix, { wells: 'A3-H3', reps: 2, volume: 40 })
    cfg.steps = [newOt2Step('build'), series, mix]
  } else if (which === 'swap') {
    plate = plate96({ name: 'Coacervate kinetics 14', peptide: (r, c) => 5 + c, rna: () => 10 })
    cfg = defaultOt2Config(plate)
    cfg.pipettes = { left: 'p300_multi_gen2', right: 'p20_single_gen2' }
    const series = newOt2Step('series'); Object.assign(series, { count: 8, intervalMinutes: 20, wells: 'A1-H2', volume: 25, quenchName: 'TFA 1 %', quenchUl: 30, pauseEvery: 4, pauseMessage: 'Top up the quench tube' })
    cfg.steps = [newOt2Step('build'), series]
  } else if (which === 'modules') {
    plate = plate96({ name: 'PCR screen 4', peptide: (r) => 5 + r, rna: (r, c) => c * 2 })
    cfg = defaultOt2Config(plate)
    cfg.target = { on: 'thermocycler', labware: 'nest_96_wellplate_100ul_pcr_full_skirt' }
    cfg.deck.heaterShaker = '3'
    cfg.deck.magnetic = '6'
    const tc = newOt2Step('thermocycler'); Object.assign(tc, { lid: 'close', blockTemp: 30, lidTemp: 50, holdMinutes: 5 })
    const hs = newOt2Step('heater_shaker'); Object.assign(hs, { temp: 37, rpm: 500 })
    const tm = newOt2Step('temperature'); tm.temp = 4
    const mg = newOt2Step('magnetic')
    const series = newOt2Step('series'); Object.assign(series, { count: 4, intervalMinutes: 15, wells: 'A1-H1', volume: 5, quenchName: 'Quench', quenchUl: 20 })
    const off = newOt2Step('thermocycler'); Object.assign(off, { lid: 'open', deactivate: true })
    cfg.steps = [newOt2Step('build'), tc, hs, tm, mg, series, off, newOt2Step('custom'), newOt2Step('pause')]
  } else if (which === 'groups') {
    // Two rows of the plate, each sampled into a sample plate of its own.
    const wells = {}
    for (const r of ['A', 'B']) for (let c = 1; c <= 12; c++) {
      wells[`${r}${c}`] = linked('C1', 'K10 peptide', 10, 'mM', '10.00') + linked('C2', 'pU RNA', 8, 'mM', '10.00') + fill('MQ H₂O', '60.00')
    }
    plate = { name: 'Two conditions', format: 96, targetVolume: 80, wells }
    cfg = defaultOt2Config(plate)
    cfg.prefilled = true
    cfg.sampleSlots = ['2', '3']
    const series = newOt2Step('series')
    Object.assign(series, { count: 8, intervalMinutes: 15, volume: 15, groups: [
      { id: 'g1', wells: 'A1-A12', plate: '2', start: '', layout: 'rows' },
      { id: 'g2', wells: 'B1-B12', plate: '3', start: '', layout: 'rows' },
    ] })
    cfg.steps = [series]
  } else if (which === 'hybrid') {
    // An 8-channel chosen by name, with runs of different lengths and a lone well.
    plate = plate96({ name: 'Kinetics 6+4', peptide: (r, c) => 5 + c, rna: () => 10 })
    cfg = defaultOt2Config(plate)
    cfg.prefilled = true
    cfg.pipettes = { left: 'p300_multi_gen2', right: 'p20_single_gen2' }
    cfg.deck.stocks = '11'
    const series = newOt2Step('series')
    Object.assign(series, { count: 6, intervalMinutes: 10, wells: 'A1-F1 A2-D2 H2', volume: 25, pipette: 'left' })
    cfg.steps = [series]
  } else if (which === 'blocked') {
    // A row run with the 8-channel chosen: it cannot be done as set.
    plate = plate96({ name: 'Row run', peptide: (r, c) => 5 + c, rna: () => 10 })
    cfg = defaultOt2Config(plate)
    cfg.prefilled = true
    cfg.pipettes = { left: 'p300_multi_gen2', right: 'p20_single_gen2' }
    const series = newOt2Step('series')
    Object.assign(series, { count: 6, intervalMinutes: 10, wells: 'A1-A6', volume: 25, pipette: 'left' })
    cfg.steps = [series]
  } else if (which === 'layout') {
    // Two part-columns of six, sampled into the same shape on the sample plate.
    plate = plate96({ name: 'Kinetics 2 × 6', peptide: (r, c) => 5 + c, rna: () => 10 })
    cfg = defaultOt2Config(plate)
    cfg.prefilled = true
    cfg.pipettes = { left: 'p300_multi_gen2', right: 'p20_single_gen2' }
    const series = newOt2Step('series'); Object.assign(series, { count: 8, intervalMinutes: 15, wells: 'A1-F1 A2-F2', volume: 25, layout: 'mirror' })
    cfg.steps = [series]
  } else {
    plate = plate96({ name: 'Coacervate screen 3', peptide: (r) => 5 + r, rna: (r, c) => c * 2 })
    cfg = defaultOt2Config(plate)
    const d = newOt2Step('delay'); d.minutes = 30
    cfg.steps = [newOt2Step('build'), d, newOt2Step('sample')]
  }
  return { plate, cfg }
}
