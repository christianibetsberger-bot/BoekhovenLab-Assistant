import { describe, it, expect } from 'vitest'
import {
  plateDemands, parseWellSelection, generateOpentronsProtocol, defaultOt2Config,
  normalizeOt2Config, newOt2Step, targetLabwareOptions, wellNamesOf, labwareByName,
  adjacentSlots, loadVolume, opentronsFilename, multiGroups,
} from './opentronsExport'

// The markup the planners actually write into a well (see plateExport.test.js).
const chip = (code, name, stock, unit, id = `inv-${code}`) =>
  `<span class="inv-ref" data-inv-id="${id}" data-labware="">[${code}] ${name} (${stock} ${unit})</span>`
const linked = (code, name, stock, unit, vol) => `&nbsp;${chip(code, name, stock, unit)}&nbsp; ${vol} µL<br>`
const fill = (label, vol) => `<strong>${label}:</strong> ${vol} µL<br>`

const ROWS = 'ABCDEFGH'
function fullPlate({ name = 'Screen 3', peptide = (r, c) => 5 + r, rna = (r, c) => c * 2, total = 80 } = {}) {
  const wells = {}
  for (let r = 0; r < 8; r++) for (let c = 1; c <= 12; c++) {
    const a = peptide(r, c), b = rna(r, c)
    wells[`${ROWS[r]}${c}`] = linked('C1', 'K10 peptide', 10, 'mM', a.toFixed(2))
      + linked('C2', 'pU RNA', 8, 'mM', b.toFixed(2))
      + fill('MQ H₂O', (total - a - b).toFixed(2))
  }
  return { name, format: 96, targetVolume: total, wells }
}
const smallPlate = () => ({
  name: 'Tiny "plate"',
  format: 96,
  targetVolume: 80,
  wells: {
    A1: linked('C1', 'K10 peptide', 10, 'mM', '40.00') + fill('MOPS pH 7', '40.00'),
    B2: linked('C1', 'K10 peptide', 10, 'mM', '5.00') + `<strong>EDC:</strong> 4.00 µL (10 mM)<br>` + fill('MQ H₂O', '71.00'),
  },
})

const gen = (plate, mutate = () => {}) => {
  const cfg = defaultOt2Config(plate)
  mutate(cfg)
  return generateOpentronsProtocol(plate, cfg, { now: new Date('2026-09-03T12:00:00Z') })
}

// Every line of run() is indented by four; nothing else is. A generator that
// drops a level produces Python that fails at parse time, which is the one
// error the warnings list cannot carry.
function assertPythonShape(code) {
  const lines = code.split('\n')
  let inRun = false
  for (const l of lines) {
    if (l.startsWith('def run(')) { inRun = true; continue }
    if (!inRun) {
      expect(l === '' || /^(#|from |import |metadata|requirements|    "|\}|\)|def run)/.test(l)).toBe(true)
    } else if (l !== '') {
      expect(l.startsWith('    ')).toBe(true)
    }
  }
  expect(code.endsWith('\n')).toBe(true)
}

describe('plateDemands', () => {
  it('groups by inventory id, exports fill-ups under their own name, keeps unlinked volumes', () => {
    const d = plateDemands(smallPlate())
    const names = d.map(x => x.name)
    // Fill-ups first, then alphabetical.
    expect(names).toEqual(['MOPS pH 7', 'MQ H₂O', 'EDC', 'K10 peptide'])
    const k10 = d.find(x => x.key === 'inv:inv-C1')
    expect(k10.transfers).toEqual([{ well: 'A1', volume: 40 }, { well: 'B2', volume: 5 }])
    expect(k10.totalUl).toBe(45)
    expect(k10.linked).toBe(true)
    const edc = d.find(x => x.name === 'EDC')
    expect(edc.unlinked).toBe(true)
    expect(edc.transfers).toEqual([{ well: 'B2', volume: 4 }])
  })
  it('sums a 96-well plate', () => {
    const d = plateDemands(fullPlate())
    expect(d.find(x => x.key === 'inv:inv-C1').transfers).toHaveLength(96)
    expect(d.find(x => x.isFill).transfers).toHaveLength(96)
  })
})

describe('parseWellSelection', () => {
  const plate = smallPlate()
  it('"all" is the filled wells', () => {
    expect(parseWellSelection('all', plate).wells).toEqual(['A1', 'B2'])
    expect(parseWellSelection('', plate).wells).toEqual(['A1', 'B2'])
  })
  it('reads ids, row runs, column runs and rectangles', () => {
    expect(parseWellSelection('A1, c3 h12', plate).wells).toEqual(['A1', 'C3', 'H12'])
    expect(parseWellSelection('A1-A4', plate).wells).toEqual(['A1', 'A2', 'A3', 'A4'])
    expect(parseWellSelection('A1-D1', plate).wells).toEqual(['A1', 'B1', 'C1', 'D1'])
    expect(parseWellSelection('A1-B2', plate).wells).toEqual(['A1', 'A2', 'B1', 'B2'])
  })
  it('reports what it could not read and drops out-of-plate wells', () => {
    const r = parseWellSelection('A1 Z9 foo A13', plate)
    expect(r.wells).toEqual(['A1'])
    expect(r.unknown).toEqual(['Z9', 'foo', 'A13'])
  })
})

describe('catalogue helpers', () => {
  it('orders wells column by column like Opentrons does', () => {
    expect(wellNamesOf(labwareByName('opentrons_24_tuberack_nest_1.5ml_snapcap')).slice(0, 5)).toEqual(['A1', 'B1', 'C1', 'D1', 'A2'])
    expect(wellNamesOf(labwareByName('nest_12_reservoir_15ml'))).toHaveLength(12)
  })
  it('offers labware matching the plate format and location', () => {
    expect(targetLabwareOptions(96, 'deck').every(l => l.rows === 8 && l.cols === 12)).toBe(true)
    expect(targetLabwareOptions(24, 'deck').map(l => l.name)).toContain('opentrons_24_tuberack_nest_1.5ml_snapcap')
    expect(targetLabwareOptions(96, 'thermocycler').map(l => l.name)).toContain('nest_96_wellplate_100ul_pcr_full_skirt')
    expect(targetLabwareOptions(96, 'thermocycler').map(l => l.name)).not.toContain('corning_96_wellplate_360ul_flat')
    expect(targetLabwareOptions(384, 'deck').length).toBeGreaterThan(2)
  })
  it('knows the deck grid', () => {
    expect(adjacentSlots('5').sort()).toEqual(['2', '4', '6', '8'])
    expect(adjacentSlots('1').sort()).toEqual(['2', '4'])
    expect(adjacentSlots('10').sort()).toEqual(['11', '7'])
    expect(adjacentSlots('3', { xOnly: true })).toEqual(['2'])
  })
  it('rounds load volumes to something a person can measure', () => {
    expect(loadVolume(45, 20)).toBe(54)
    expect(loadVolume(2540, 20)).toBe(3100)
    expect(loadVolume(50000, 0)).toBe(50000)
  })
})

describe('generateOpentronsProtocol — plain build', () => {
  const plate = fullPlate()
  const { code, warnings, summary } = gen(plate)

  it('is a complete protocol with no warnings', () => {
    expect(warnings).toEqual([])
    assertPythonShape(code)
    expect(code).toContain('from opentrons import protocol_api')
    expect(code).toContain('requirements = {"robotType": "OT-2", "apiLevel": "2.20"}')
    expect(code).toContain('"protocolName": "Screen 3"')
    expect(code).toContain('def run(protocol: protocol_api.ProtocolContext) -> None:')
  })
  it('loads the plate, the racks and the pipettes with their tip racks', () => {
    expect(code).toContain('plate = protocol.load_labware("corning_96_wellplate_360ul_flat", "1", label="Screen 3")')
    expect(code).toContain('stocks = protocol.load_labware("opentrons_24_tuberack_nest_1.5ml_snapcap", "4", label="Stocks")')
    expect(code).toContain('bulk = protocol.load_labware("opentrons_15_tuberack_falcon_15ml_conical", "5", label="Bulk liquids")')
    expect(code).toContain('p300 = protocol.load_instrument("p300_single_gen2", "left", tip_racks=tips_p300)')
    expect(code).toContain('p20 = protocol.load_instrument("p20_single_gen2", "right", tip_racks=tips_p20)')
    expect(code).toMatch(/tips_p300 = \[protocol.load_labware\("opentrons_96_tiprack_300ul", slot\) for slot in \["3", "6"\]\]/)
  })
  it('puts water in the bulk rack because 96 × ~65 µL does not fit a 1.5 mL tube', () => {
    const water = summary.sources.find(s => s.isFill)
    expect(water.rack).toBe('bulk')
    expect(water.loadUl).toBeGreaterThan(water.demandUl)
    expect(summary.sources.find(s => s.name === 'K10 peptide').rack).toBe('stocks')
  })
  it('declares liquids and loads them where the header says', () => {
    expect(code).toContain('liq_1 = protocol.define_liquid(name="MQ H₂O", description="fill-up", display_color="#0072B2")')
    expect(code).toMatch(/bulk\["A1"\]\.load_liquid\(liquid=liq_1, volume=\d+\)/)
    expect(code).toMatch(/#   bulk {6}A1 {3}MQ H₂O/)
  })
  it('pipettes water first, then the stocks alphabetically, each with the right pipette', () => {
    const iWater = code.indexOf('# MQ H₂O —')
    const iK10 = code.indexOf('# [C1] K10 peptide 10 mM —')
    const iRna = code.indexOf('# [C2] pU RNA 8 mM —')
    expect(iWater).toBeGreaterThan(0)
    expect(iWater).toBeLessThan(iK10)
    expect(iK10).toBeLessThan(iRna)
    // 5–12 µL of peptide → P20; ~60 µL water → P300.
    expect(code).toMatch(/build\(p20, stocks\["A1"\], \[\s*\("A1", 5\)/)
    expect(code).toMatch(/build\(p300, bulk\["A1"\], \[\s*\("A1", 73\)/)
    expect(code).toContain('], new_tip="always", blow_out=True, blowout_location="destination well")')
  })
  it('counts tips per pipette and racks per count', () => {
    const p20 = summary.pipettes.find(p => p.var === 'p20')
    // Peptide everywhere; RNA in columns 1–10 (2–20 µL) — columns 11–12 get 22–24 µL from the P300.
    expect(p20.tipsNeeded).toBe(96 + 80)
    expect(p20.tipSlots).toHaveLength(2)
    expect(summary.pipettes.find(p => p.var === 'p300').tipsNeeded).toBe(96 + 16)
    expect(code).not.toContain('need_tips')
  })
})

describe('generateOpentronsProtocol — options', () => {
  it('escapes names and strings like Python wants', () => {
    const { code } = gen(smallPlate())
    expect(code).toContain('"protocolName": "Tiny \\"plate\\""')
    expect(code).toContain('label="Tiny \\"plate\\""')
    assertPythonShape(code)
  })
  it('leaves out a compound that was unticked and honours manual positions', () => {
    const { code, summary, warnings } = gen(smallPlate(), cfg => {
      cfg.compounds = {
        'name:edc': { included: false },
        'inv:inv-C1': { included: true, position: 'stocks:D6' },
        'fill:mq h₂o': { included: true, position: 'stocks:D6' },
      }
    })
    expect(code).not.toContain('EDC')
    expect(summary.excluded.map(e => e.name)).toEqual(['EDC'])
    // Fill-ups are placed first, so the water wins D6 and the peptide is told why it did not.
    expect(summary.sources.find(s => s.name === 'MQ H₂O').well).toBe('D6')
    expect(warnings.some(w => /K10 peptide: stocks D6 is already taken/.test(w))).toBe(true)
    expect(summary.sources.find(s => s.name === 'K10 peptide').well).toBe('B1')   // A1 went to the MOPS fill-up
  })
  it('warns when a liquid does not fit its position', () => {
    const { warnings } = gen(fullPlate(), cfg => { cfg.bulkLabware = 'opentrons_24_tuberack_nest_2ml_snapcap' })
    expect(warnings.some(w => /MQ H₂O needs about .* but one .* holds 2 mL/.test(w))).toBe(true)
  })
  it('chooses the smaller pipette for gap volumes and tallies below-minimum volumes', () => {
    const plate = fullPlate({ peptide: () => 0.5, rna: () => 45 })
    const { code, warnings } = gen(plate, cfg => { cfg.pipettes = { left: 'p1000_single_gen2', right: 'p20_single_gen2' } })
    expect(warnings).toContain('K10 peptide: 96 transfers of 0.5 µL — below the P20 Single-Channel GEN2\'s 1 µL minimum. Pipetted anyway, but not accurately.')
    expect(warnings.some(w => /pU RNA: 96 transfers of 45 µL — above the P20 Single-Channel GEN2's 20 µL maximum, so each is done in several strokes\. A P300 Single-Channel GEN2 would do them in one\./.test(w))).toBe(true)
    // 96 × 45 µL does not fit a 1.5 mL tube, so the RNA sits in the bulk rack after the water.
    expect(code).toMatch(/build\(p20, bulk\["B1"\], \[\s*\("A1", 45\)/)
  })
  it('refuses an 8-channel pipette for single wells and says so', () => {
    const { warnings, code } = gen(smallPlate(), cfg => { cfg.pipettes = { left: 'p300_multi_gen2', right: '' } })
    expect(warnings.some(w => /8-channel cannot address single wells/.test(w))).toBe(true)
    expect(code).not.toContain('build(p300m')
  })
  it('one tip per stock and distribute mode change the call, not the volumes', () => {
    const { code: once } = gen(smallPlate(), cfg => { cfg.steps[0].newTip = 'once'; cfg.steps[0].mixAfterReps = 3; cfg.steps[0].mixAfterUl = 20; cfg.steps[0].touchTip = true; cfg.steps[0].airGapUl = 2 })
    expect(once).toContain('], new_tip="once", blow_out=True, blowout_location="destination well", touch_tip=True, mix_after=(3, 20), air_gap=2)')
    const { code: dist } = gen(smallPlate(), cfg => { cfg.steps[0].mode = 'distribute' })
    expect(dist).toContain('], mode="distribute", new_tip="once", blow_out=True, disposal_volume=20)')
  })
  it('sets flow rates and a chosen tip rack', () => {
    const { code } = gen(smallPlate(), cfg => { cfg.flowRates.right.aspirate = 5; cfg.tipRacks.right = 'opentrons_96_filtertiprack_20ul' })
    expect(code).toContain('p20.flow_rate.aspirate = 5  # µL/s')
    expect(code).toContain('load_labware("opentrons_96_filtertiprack_20ul", slot)')
  })
  it('maps an 8-strip onto column 1 of a 96 block', () => {
    const wells = {}
    for (let c = 1; c <= 8; c++) wells[`A${c}`] = linked('C1', 'K10 peptide', 10, 'mM', '2.00') + fill('MQ H₂O', '18.00')
    const strip = { name: 'strip', format: 'pcr8', wells }
    const { code, warnings } = gen(strip, cfg => { cfg.target = { on: 'temperature', labware: 'opentrons_96_aluminumblock_generic_pcr_strip_200ul' } })
    expect(warnings).toEqual([])
    expect(code).toContain('temp_mod = protocol.load_module("temperature module gen2", "9")')
    expect(code).toContain('plate = temp_mod.load_labware("opentrons_96_aluminumblock_generic_pcr_strip_200ul", label="strip")')
    expect(code).toMatch(/\("A1", 2\), \("B1", 2\), \("C1", 2\)/)
    assertPythonShape(code)
  })
  it('refuses Ibidi chambers', () => {
    const r = generateOpentronsProtocol({ name: 'x', format: 'ibidi', wells: {} }, null)
    expect(r.code).toBe('')
    expect(r.warnings[0]).toMatch(/Ibidi/)
  })
})

describe('generateOpentronsProtocol — deck rules', () => {
  it('names a slot used twice and the four Thermocycler slots', () => {
    const { warnings, code } = gen(smallPlate(), cfg => {
      cfg.deck.stocks = '1'
      cfg.steps.push(newOt2Step('thermocycler'))
      cfg.deck.temperature = '8'
      cfg.steps.push(newOt2Step('temperature'))
    })
    expect(warnings).toContain('Deck conflict: slot 8 holds both the Thermocycler and the Temperature Module.')
    expect(warnings.some(w => /slot 1 holds both the plate "Tiny \\?"plate\\?"" and the stock rack/.test(w) || /slot 1 holds both/.test(w))).toBe(true)
    expect(code).toContain('tc = protocol.load_module("thermocyclerModuleV1")')
  })
  it('applies the Heater-Shaker neighbour rules and keeps tip racks away from it', () => {
    const { warnings, summary } = gen(smallPlate(), cfg => {
      cfg.deck.heaterShaker = '3'
      cfg.deck.magnetic = '6'
      cfg.deck.samples = '2'
      cfg.samplesLabware = 'opentrons_24_tuberack_nest_1.5ml_snapcap'   // 80 mm tall, left of slot 3
      cfg.steps.push(newOt2Step('heater_shaker'), newOt2Step('magnetic'), newOt2Step('sample'))
    })
    expect(warnings.some(w => /Magnetic Module in slot 6 is next to the Heater-Shaker in slot 3/.test(w))).toBe(true)
    expect(warnings.some(w => /sample labware in slot 2 is 80 mm tall/.test(w))).toBe(true)
    const tipSlots = summary.pipettes.flatMap(p => p.tipSlots)
    expect(tipSlots.some(s => ['2', '6'].includes(s))).toBe(false)
  })
  it('only allows the Heater-Shaker where the OT-2 has room for it', () => {
    const { warnings } = gen(smallPlate(), cfg => { cfg.deck.heaterShaker = '5'; cfg.steps.push(newOt2Step('heater_shaker')) })
    expect(warnings.some(w => /recommends slots 1, 3, 4, 6, 7 or 10 for the Heater-Shaker/.test(w))).toBe(true)
  })
})

describe('generateOpentronsProtocol — modules and steps', () => {
  it('thermocycler: plate on the module, lid handling, hold and block volume', () => {
    const { code, warnings } = gen(smallPlate(), cfg => {
      cfg.target = { on: 'thermocycler', labware: 'nest_96_wellplate_100ul_pcr_full_skirt' }
      const tc = newOt2Step('thermocycler'); tc.lid = 'close'; tc.blockTemp = 30; tc.lidTemp = 50; tc.holdMinutes = 10
      const s = newOt2Step('sample'); s.wells = 'A1'; s.volume = 10
      const off = newOt2Step('thermocycler'); off.lid = 'open'; off.deactivate = true
      cfg.steps.push(tc, s, off)
    })
    expect(warnings).toEqual([])
    expect(code).toContain('plate = tc.load_labware("nest_96_wellplate_100ul_pcr_full_skirt", label="Tiny \\"plate\\"")')
    expect(code).toContain('tc.open_lid()  # the plate must be reachable')
    expect(code).toContain('tc.set_lid_temperature(50)')
    expect(code).toContain('tc.set_block_temperature(30, hold_time_minutes=10, block_max_volume=80)')
    // Sampling from a closed thermocycler opens the lid and closes it again.
    const i = code.indexOf('# Step 3: take 10 µL')
    const after = code.slice(i)
    expect(after.indexOf('tc.open_lid()')).toBeLessThan(after.indexOf('p20.transfer(10'))
    expect(after.indexOf('p20.transfer(10')).toBeLessThan(after.indexOf('tc.close_lid()'))
    expect(code).toContain('tc.deactivate_lid()')
    assertPythonShape(code)
  })
  it('thermocycler profile', () => {
    const { code } = gen(smallPlate(), cfg => {
      cfg.target = { on: 'thermocycler', labware: 'nest_96_wellplate_100ul_pcr_full_skirt' }
      const p = newOt2Step('tc_profile'); p.cycles = 25; p.finalTemp = 4
      cfg.steps.push(p)
    })
    expect(code).toContain('{"temperature": 95, "hold_time_seconds": 30},')
    expect(code).toContain('repetitions=25,')
    expect(code).toContain('block_max_volume=80,')
    expect(code).toMatch(/tc\.close_lid\(\)\n\s+tc\.set_lid_temperature\(105\)\n\s+tc\.execute_profile\(/)
    expect(code).toContain('tc.set_block_temperature(4)')
  })
  it('heater-shaker: latch, heat, shake — and stops shaking around pipetting', () => {
    const { code } = gen(smallPlate(), cfg => {
      cfg.target = { on: 'heater_shaker', labware: 'opentrons_96_flat_bottom_adapter_nest_wellplate_200ul_flat' }
      const hs = newOt2Step('heater_shaker'); hs.temp = 37; hs.rpm = 500
      const m = newOt2Step('mix'); m.wells = 'A1'; m.reps = 2; m.volume = 20
      const off = newOt2Step('heater_shaker'); off.deactivate = true
      cfg.steps.push(hs, m, off)
    })
    expect(code).toContain('hs = protocol.load_module("heaterShakerModuleV1", "10")')
    expect(code).toContain('plate = hs.load_labware("opentrons_96_flat_bottom_adapter_nest_wellplate_200ul_flat"')
    expect(code).toContain('hs.close_labware_latch()')
    expect(code).toContain('hs.set_and_wait_for_temperature(37)')
    expect(code).toContain('hs.set_and_wait_for_shake_speed(500)')
    const i = code.indexOf('# Step 3: mix')
    const after = code.slice(i)
    expect(after.indexOf('hs.deactivate_shaker()')).toBeLessThan(after.indexOf('p20.mix(2, 20, plate[well])'))
    expect(after.indexOf('p20.mix(2, 20')).toBeLessThan(after.indexOf('hs.set_and_wait_for_shake_speed(500)'))
    expect(code).toContain('hs.deactivate_heater()')
  })
  it('temperature, magnet, wait, pause, comment, custom', () => {
    const { code } = gen(smallPlate(), cfg => {
      const t = newOt2Step('temperature'); t.temp = 4
      const t2 = newOt2Step('temperature'); t2.deactivate = true
      const mg = newOt2Step('magnetic'); mg.height = 6.5
      const mg2 = newOt2Step('magnetic'); mg2.action = 'disengage'
      const d = newOt2Step('delay'); d.minutes = 1.5; d.seconds = 10; d.message = 'incubate "now"'
      const p = newOt2Step('pause'); p.message = 'Swap plates'
      const c = newOt2Step('comment'); c.text = 'half\nway'
      const cu = newOt2Step('custom'); cu.code = 'for w in plate.wells()[:2]:\n    protocol.comment(str(w))\n'
      cfg.steps.push(t, t2, mg, mg2, d, p, c, cu)
    })
    expect(code).toContain('temp_mod.set_temperature(celsius=4)')
    expect(code).toContain('temp_mod.deactivate()')
    expect(code).toContain('mag.engage(height_from_base=6.5)')
    expect(code).toContain('mag.disengage()')
    expect(code).toContain('protocol.delay(minutes=1.5, seconds=10, msg="incubate \\"now\\"")')
    expect(code).toContain('protocol.pause("Swap plates")')
    expect(code).toContain('protocol.comment("half way")')
    expect(code).toContain('    for w in plate.wells()[:2]:\n        protocol.comment(str(w))')
    assertPythonShape(code)
  })
  it('sampling series: timing helper, column-order destinations that continue across steps, quench', () => {
    const { code, warnings, summary } = gen(fullPlate(), cfg => {
      const s = newOt2Step('series'); s.count = 4; s.intervalMinutes = 15; s.wells = 'A1-H1'; s.volume = 5; s.quenchName = 'TFA'; s.quenchUl = 20; s.mixBeforeReps = 2
      const one = newOt2Step('sample'); one.wells = 'A1, B2'; one.volume = 10
      cfg.steps.push(s, one)
    })
    expect(warnings).toEqual([])
    expect(code).toContain('import time')
    expect(code).toContain('def wait_until(t_target):')
    expect(code).toContain('samples = protocol.load_labware("nest_96_wellplate_100ul_pcr_full_skirt", "2", label="Samples")')
    expect(code).toContain('series_starts = [0, 8, 16, 24]  # first sample well of each time point')
    expect(code).toContain('fresh_plate_before = set()')
    expect(code).toContain('    dests = samples.wells()[series_starts[i]:series_starts[i] + 8]')
    expect(code).toContain('for i in range(4):')
    expect(code).toContain('        wait_until(series_t0 + i * 15 * 60)')
    // Peptide A1, RNA B1, then the quench is the third tube.
    expect(code).toContain('        p20.transfer(20, stocks["C1"], dests, new_tip="once", blow_out=True, blowout_location="destination well")  # quench first')
    expect(code).toContain('        p20.transfer(5, [plate[w] for w in series_wells], dests, new_tip="always", blow_out=True, blowout_location="destination well", mix_before=(2, 5))')
    expect(code).toContain('dests = samples.wells()[32:34]')
    expect(summary.sources.find(s => s.isQuench).demandUl).toBe(20 * 8 * 4)
    expect(summary.sampleWellsUsed).toBe(34)
    assertPythonShape(code)
  })
  it('sampling series: first sample after one interval; a full sample plate schedules a plate change instead of overflowing', () => {
    const { code, warnings, summary, actions, clearance } = gen(fullPlate(), cfg => {
      const s = newOt2Step('series'); s.count = 20; s.intervalMinutes = 5; s.wells = 'all'; s.volume = 5; s.firstAtZero = false
      cfg.steps.push(s)
    })
    expect(code).toContain('wait_until(series_t0 + (i + 1) * 5 * 60)')
    // 96 wells per time point = one plate each: a fresh plate before every time point but the first.
    expect(code).toContain(`fresh_plate_before = {${Array.from({ length: 19 }, (_, i) => i + 1).join(', ')}}`)
    expect(code).toContain('        if i in fresh_plate_before:\n            protocol.pause("Sample plate full: replace it with a fresh one (and top up the quench), then resume")')
    expect(code).toContain('series_starts = [' + Array(20).fill('0').join(', ') + ']')
    expect(summary.samplePlates).toBe(20)
    expect(summary.sampleSwaps).toBe(19)
    expect(summary.sampleWellsUsed).toBe(1920)
    expect(warnings.some(w => /sample wells/.test(w))).toBe(false)
    const swaps = actions.filter(a => a.kind === 'swap')
    expect(swaps).toHaveLength(19)
    expect(swaps.every(a => a.userAction && a.dst.slot === '2')).toBe(true)
    // The swap comes right after the time-point comment, before anything is pipetted.
    const k = actions.findIndex(a => a.kind === 'swap')
    expect(actions[k - 1].kind).toBe('comment')
    expect(clearance.find(c => c.id === 'samples')).toMatchObject({ ok: true, info: '1920 wells over 20 plates — 19 plate changes scheduled' })
  })
  it('a series can pause for a scheduled check every N time points; the clearance list sorts every warning into a check', () => {
    const { code, warnings, actions, clearance } = gen(fullPlate(), cfg => {
      const s = newOt2Step('series'); s.count = 7; s.intervalMinutes = 10; s.wells = 'A1-H1'; s.volume = 5; s.pauseEvery = 3; s.pauseMessage = 'Top up the quench'
      cfg.steps.push(s)
    })
    expect(code).toContain('        if i > 0 and i % 3 == 0:\n            protocol.pause("Top up the quench")')
    const pauses = actions.filter(a => a.kind === 'pause')
    expect(pauses.map(a => a.text)).toEqual(['Paused: Top up the quench — press Resume in the Opentrons App', 'Paused: Top up the quench — press Resume in the Opentrons App'])   // before time points 4 and 7
    expect(actions[actions.indexOf(pauses[0]) - 1].text).toBe('Time point 4/7 at t = 30 min')
    expect(clearance.map(c => c.id)).toEqual(['deck', 'tips', 'samples', 'liquids', 'api', 'modules', 'pipettes', 'steps'])
    expect(clearance.flatMap(c => c.notes).sort()).toEqual([...warnings].sort())
    expect(clearance.find(c => c.id === 'samples')).toMatchObject({ ok: true, info: '56 wells over 1 plate' })
    expect(clearance.find(c => c.id === 'steps').info).toMatch(/^\d+ steps?, \d+ actions, about \d+ min$/)
  })
  it('pauses to refill tips when the deck cannot hold enough racks', () => {
    const wells = {}
    const R = 'ABCDEFGHIJKLMNOP'
    for (let r = 0; r < 16; r++) for (let c = 1; c <= 24; c++) wells[`${R[r]}${c}`] = linked('C1', 'K10', 10, 'mM', '5.00') + linked('C2', 'NaCl', 1, 'M', '3.00') + fill('MQ H₂O', '12.00')
    const { code, warnings, summary } = gen({ name: '384', format: 384, wells }, cfg => { cfg.pipettes = { left: 'p20_single_gen2', right: '' } })
    expect(summary.pipettes[0].tipsNeeded).toBe(1152)
    expect(summary.pipettes[0].tipSlots).toHaveLength(8)
    expect(warnings.some(w => /the run will pause 1× for you to refill/.test(w))).toBe(true)
    expect(code).toContain('tips_capacity = {"left": 768}')
    expect(code).toContain('def need_tips(pipette, n):')
    expect(code).toContain('need_tips(p20, 384)')
    expect(code).toContain('pipette.reset_tipracks()')
    assertPythonShape(code)
  })
})

describe('config', () => {
  it('normalizes an old config without losing what it had', () => {
    const plate = smallPlate()
    const old = { apiLevel: '2.16', pipettes: { left: 'p10_single' }, steps: [{ id: 'x', type: 'delay', minutes: 3 }] }
    const c = normalizeOt2Config(old, plate)
    expect(c.apiLevel).toBe('2.16')
    expect(c.pipettes).toEqual({ left: 'p10_single', right: 'p20_single_gen2' })
    expect(c.steps[0]).toMatchObject({ id: 'x', type: 'delay', minutes: 3, seconds: 0, message: '' })
    expect(c.deck.stocks).toBe('4')
  })
  it('an older apiLevel loses liquids but says so', () => {
    const { code, warnings } = gen(smallPlate(), cfg => { cfg.apiLevel = '2.13' })
    expect(code).not.toContain('define_liquid')
    expect(warnings.some(w => /apiLevel below 2.14/.test(w))).toBe(true)
  })
  it('makes a filename that survives a filesystem', () => {
    expect(opentronsFilename({ name: 'Coacervate screen / 3' }, '2026-09-03')).toBe('OT2_Coacervate_screen_3_2026-09-03.py')
  })
})

describe('8-channel', () => {
  // Water and RNA are the same in every well of a column; the peptide changes by column.
  const columnPlate = () => fullPlate({ peptide: (r, c) => 5 + c, rna: () => 10, total: 80 })   // water = 65 − c per column
  const multiCfg = (cfg) => { cfg.pipettes = { left: 'p300_multi_gen2', right: 'p20_single_gen2' } }

  it('knows which wells an 8-channel spans', () => {
    expect(multiGroups(96)).toHaveLength(12)
    expect(multiGroups(96)[0]).toEqual({ address: 'A1', wells: ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'] })
    expect(multiGroups(384)).toHaveLength(48)
    expect(multiGroups(384)[1].wells).toEqual(['B1', 'D1', 'F1', 'H1', 'J1', 'L1', 'N1', 'P1'])
    expect(multiGroups(24)).toEqual([])
    expect(multiGroups('pcr8')[0].wells).toEqual(['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'])
  })
  it('fills whole matching columns from the reservoir with the 8-channel and the rest with the single-channel', () => {
    const { code, warnings, summary } = gen(columnPlate(), multiCfg)
    expect(warnings).toEqual([])
    expect(code).toContain('reservoir = protocol.load_labware("nest_12_reservoir_15ml", "6", label="8-channel reservoir")')
    expect(code).toContain('p300m = protocol.load_instrument("p300_multi_gen2", "left", tip_racks=tips_p300m)')
    expect(code).toMatch(/build\(p300m, reservoir\["A1"\], \[\s*\("A1", 64\), \("A2", 63\)/)
    expect(code).toContain('12 columns × 8 wells, 5.62 mL (p300m, 8-channel')   // Σ (65 − c) × 8 over 12 columns
    // 6–17 µL of peptide and 10 µL of RNA are below the multi's 20 µL minimum: single-channel, well by well.
    expect(code).toMatch(/build\(p20, stocks\["A1"\], \[\s*\("A1", 6\), \("A2", 7\)/)
    expect(code).not.toContain('build(p300m, stocks')
    const water = summary.sources.find(s => s.isFill)
    expect(water).toMatchObject({ rack: 'reservoir', well: 'A1', columns: 12 })
    expect(summary.sources.find(s => s.name === 'K10 peptide')).toMatchObject({ rack: 'stocks', columns: 0 })
    const multi = summary.pipettes.find(p => p.var === 'p300m')
    expect(multi).toMatchObject({ channels: 8, tipsNeeded: 12, perRack: 12 })
    expect(multi.tipSlots).toHaveLength(1)
    assertPythonShape(code)
  })
  it('stays single-channel when the liquid is put in a tube, or when the 8-channel is switched off', () => {
    const inTube = gen(columnPlate(), cfg => { multiCfg(cfg); cfg.compounds = { 'fill:mq h₂o': { included: true, position: 'stocks:D6' } } })
    expect(inTube.code).not.toContain('build(p300m')
    expect(inTube.code).toMatch(/build\(p20, stocks\["D6"\]/)
    const off = gen(columnPlate(), cfg => { multiCfg(cfg); cfg.steps[0].multi = 'off' })
    expect(off.code).not.toContain('build(p300m')
    expect(off.code).not.toContain('reservoir')
  })
  it('a column with one differing well is not 8-channel work', () => {
    const plate = columnPlate()
    plate.wells.H1 = plate.wells.H1.replace('64.00 µL', '61.00 µL')   // water in H1 differs (65 − 1 = 64 → 61)
    const { summary } = gen(plate, multiCfg)
    expect(summary.sources.find(s => s.isFill).columns).toBe(11)
  })
  it('samples whole columns with the 8-channel into sample-plate columns, quench included', () => {
    const { code, warnings } = gen(columnPlate(), cfg => {
      multiCfg(cfg)
      const s = newOt2Step('series'); s.count = 3; s.intervalMinutes = 10; s.wells = 'A1-H2'; s.volume = 25; s.quenchName = 'TFA'; s.quenchUl = 30
      const one = newOt2Step('sample'); one.wells = 'A1, B2'; one.volume = 10
      cfg.steps.push(s, one)
    })
    expect(warnings).toEqual([])
    expect(code).toContain('series_wells = ["A1", "A2"]')
    expect(code).toContain('series_starts = [0, 16, 32]')
    expect(code).toContain('    dests = [col[0] for col in samples.columns()[series_starts[i] // 8:series_starts[i] // 8 + 2]]')
    expect(code).toContain('        p300m.transfer(30, reservoir["A2"], dests, new_tip="once", blow_out=True, blowout_location="destination well")  # quench first')
    expect(code).toContain('        p300m.transfer(25, [plate[w] for w in series_wells], dests, new_tip="always", blow_out=True, blowout_location="destination well")')
    // A partial selection after the series stays single-channel and continues after the used columns.
    expect(code).toContain('dests = samples.wells()[48:50]')
    expect(code).toMatch(/p20\.transfer\(10, \[plate\[w\] for w in sample_wells\], dests/)
    assertPythonShape(code)
  })
  it('a single-channel quench into 8-channel columns visits every well of each column', () => {
    const { code } = gen(columnPlate(), cfg => {
      multiCfg(cfg)
      const s = newOt2Step('sample'); s.wells = 'A1-H1'; s.volume = 25; s.quenchName = 'TFA'; s.quenchUl = 15
      cfg.compounds = { 'quench:tfa': { included: true, position: 'stocks:C1' } }
      cfg.steps.push(s)
    })
    expect(code).toContain('p20.transfer(15, stocks["C1"], [w for a in dests for w in samples.columns_by_name()[a.well_name[1:]]], new_tip="once"')
    expect(code).toContain('p300m.transfer(25, [plate[w] for w in sample_wells], dests')
  })
  it('mixes a column with the 8-channel, and caps a mix at what the tip holds', () => {
    const { code } = gen(columnPlate(), cfg => { multiCfg(cfg); const m = newOt2Step('mix'); m.wells = 'A3-H3'; m.reps = 2; m.volume = 40; cfg.steps.push(m) })
    expect(code).toContain('# Step 2: mix 1 column with the 8-channel, 2 × 40 µL (p300m)')
    expect(code).toContain('for well in ["A3"]:')
    expect(code).toContain('p300m.mix(2, 40, plate[well])')
    const capped = gen(smallPlate(), cfg => { cfg.pipettes = { left: '', right: 'p20_single_gen2' }; const m = newOt2Step('mix'); m.wells = 'A1'; m.volume = 40; cfg.steps.push(m) })
    expect(capped.warnings).toContain('Mix wells: 40 µL is more than the P20 Single-Channel GEN2 can hold — mixing with 20 µL instead.')
    expect(capped.code).toContain('p20.mix(3, 20, plate[well])')
  })
  it('an 8-row reservoir labware splits a load over its column', () => {
    const { code } = gen(columnPlate(), cfg => { multiCfg(cfg); cfg.columnLabware = 'nest_96_wellplate_2ml_deep'; cfg.apiLevel = '2.24' })
    expect(code).toMatch(/reservoir\.load_liquid\(wells=\["A1", "B1", "C1", "D1", "E1", "F1", "G1", "H1"\], volume=\d+(\.\d+)?, liquid=liq_1\)/)
    expect(code).toMatch(/#   reservoir A1 {3}MQ H₂O.*split over A1–H1/)
  })
})

describe('tip accounting', () => {
  // A volume above the pipette's maximum is several strokes, and with a new tip
  // per well the robot re-tips for every stroke — the count must say so, or the
  // run dies with OutOfTipsError halfway through the plate.
  it('counts one tip per stroke when volumes exceed the pipette maximum', () => {
    // Water 67 µL everywhere → 4 strokes on a P20; the Thermocycler takes four
    // slots, so only five racks (480 tips) fit and the run must pause to refill.
    const plate = fullPlate({ peptide: () => 5, rna: () => 10, total: 82 })
    const { summary, warnings, code } = gen(plate, cfg => {
      cfg.pipettes = { left: '', right: 'p20_single_gen2' }
      cfg.target = { on: 'thermocycler', labware: 'nest_96_wellplate_100ul_pcr_full_skirt' }
    })
    const p20 = summary.pipettes[0]
    expect(p20.tipsNeeded).toBe(96 * 4 + 96 + 96)      // water 4 tips/well, peptide 1, RNA 1
    expect(p20.tipSlots).toHaveLength(5)
    expect(warnings.some(w => /needs 576 tips \(6 racks\) but only 5 racks fit/.test(w))).toBe(true)
    // The refill helper accounts in strokes too: no chunk asks for more than the racks hold.
    const calls = [...code.matchAll(/need_tips\(p20, (\d+)\)/g)].map(m => Number(m[1]))
    expect(calls.length).toBeGreaterThan(1)
    expect(Math.max(...calls)).toBeLessThanOrEqual(480)
    expect(calls.reduce((a, b) => a + b, 0)).toBe(576)
  })
  it('one tip per stock is one tip however many strokes', () => {
    const plate = fullPlate({ peptide: () => 5, rna: () => 10, total: 82 })
    const { summary } = gen(plate, cfg => { cfg.pipettes = { left: '', right: 'p20_single_gen2' }; cfg.steps[0].newTip = 'once' })
    expect(summary.pipettes[0].tipsNeeded).toBe(3)
  })
})

describe('action list (the run preview)', () => {
  it('records every transfer with its wells, tips and clock, in execution order', () => {
    const { actions, summary } = gen(fullPlate(), cfg => { const d = newOt2Step('delay'); d.minutes = 30; cfg.steps.push(d, newOt2Step('sample')) })
    expect(actions.map(a => a.kind)).toEqual(['transfer', 'transfer', 'transfer', 'transfer', 'wait', 'transfer'])
    const water = actions[0]
    expect(water).toMatchObject({ step: 1, stepType: 'build', pipette: 'p300', count: 96, tipsUsed: 96, clockSec: 0 })
    expect(water.src).toEqual({ slot: '5', var: 'bulk', wells: ['A1'] })
    expect(water.dst.slot).toBe('1')
    expect(water.dst.wells).toHaveLength(96)
    expect(water.state.tipsLeft).toEqual({ p300: 96, p20: 288 })   // two P300 racks minus the 96 tips this action spends; the state is after its spend
    expect(actions[4]).toMatchObject({ kind: 'wait', durationSec: 1800 })
    expect(actions[5].clockSec).toBe(actions[4].clockSec + 1800)
    expect(actions[5]).toMatchObject({ kind: 'transfer', pipette: 'p20', count: 96 })
    expect(actions[5].src.wells).toHaveLength(96)
    expect(actions[5].dst).toMatchObject({ slot: '2', var: 'samples' })
    expect(actions[5].dst.wells.slice(0, 3)).toEqual(['A1', 'B1', 'C1'])
    expect(summary.runSec).toBe(actions[5].clockSec + actions[5].durationSec)
    expect(summary.plateSlot).toBe('1')
  })
  it('expands a sampling series into time points with waits measured from the series start, lid open/close around each', () => {
    const { actions } = gen(smallPlate(), cfg => {
      cfg.target = { on: 'thermocycler', labware: 'nest_96_wellplate_100ul_pcr_full_skirt' }
      const tc = newOt2Step('thermocycler'); tc.lid = 'close'; tc.blockTemp = 30
      const s = newOt2Step('series'); s.count = 3; s.intervalMinutes = 10; s.wells = 'A1'; s.volume = 5; s.firstAtZero = true
      cfg.steps.push(tc, s)
    })
    const seq = actions.map(a => a.kind)
    // setup lid open, build transfers, tc close, tc block, then 3 × (wait?, comment, open, sample, close)
    expect(seq.slice(0, 1)).toEqual(['tc'])
    const points = actions.filter(a => a.kind === 'comment' && /Time point/.test(a.text))
    expect(points).toHaveLength(3)
    const t0 = points[0].clockSec
    expect(points[1].clockSec).toBe(t0 + 600)
    expect(points[2].clockSec).toBe(t0 + 1200)
    const after = actions.slice(actions.indexOf(points[0]))
    expect(after.slice(1, 4).map(a => a.kind)).toEqual(['tc', 'transfer', 'tc'])
    expect(after[1].text).toMatch(/open the lid/)
    expect(after[3].text).toMatch(/close the lid/)
    expect(after[2].dst.wells).toEqual(['A1'])
    expect(actions.find(a => a.kind === 'wait').text).toMatch(/time point 2\/3/)
    expect(actions.every(a => a.dst?.var !== 'plate' || a.dst.slot === '7')).toBe(true)
  })
  it('places the tip refills exactly where need_tips() will pause, as user actions', () => {
    const plate = fullPlate({ peptide: () => 5, rna: () => 10, total: 82 })   // 576 P20 tips, 480 fit → one refill
    const { actions, code } = gen(plate, cfg => {
      cfg.pipettes = { left: '', right: 'p20_single_gen2' }
      cfg.target = { on: 'thermocycler', labware: 'nest_96_wellplate_100ul_pcr_full_skirt' }
    })
    const refills = actions.filter(a => a.kind === 'refill')
    expect(refills).toHaveLength(1)
    expect(refills[0].userAction).toBe(true)
    expect(refills[0].text).toMatch(/Refill every tip rack of the P20/)
    const spentBefore = actions.slice(0, actions.indexOf(refills[0])).reduce((a, x) => a + x.tipsUsed, 0)
    expect(spentBefore).toBeLessThanOrEqual(480)
    expect(spentBefore + actions[actions.indexOf(refills[0]) + 1].tipsUsed).toBeGreaterThan(480)
    expect((code.match(/need_tips\(p20/g) || []).length).toBe(actions.filter(a => a.kind === 'transfer').length)
  })
  it('a pipette with no rack at all stops the run once, instead of pausing before every well', () => {
    const { actions, code, warnings } = gen(fullPlate(), cfg => {
      // Thermocycler + every module + samples + both racks leave one free slot; the P300 takes it.
      cfg.target = { on: 'thermocycler', labware: 'nest_96_wellplate_100ul_pcr_full_skirt' }
      cfg.deck.heaterShaker = '3'; cfg.deck.magnetic = '6'; cfg.deck.temperature = '9'
      cfg.steps.push(newOt2Step('heater_shaker'), newOt2Step('magnetic'), newOt2Step('temperature'), newOt2Step('sample'))
    })
    const stops = actions.filter(a => a.kind === 'refill' && /No tip rack/.test(a.text))
    expect(stops).toHaveLength(1)
    expect(code).not.toContain('need_tips(p20')
    expect(warnings.some(w => /No slot is free for a tip rack of the P20 Single-Channel GEN2, which needs \d+ tips — the run would stop at its first pickup/.test(w))).toBe(true)
    expect(actions.filter(a => a.kind === 'transfer' && a.pipette === 'p20').length).toBeGreaterThan(0)
  })
  it('a pause and a custom step are actions too; comments carry their text', () => {
    const { actions } = gen(smallPlate(), cfg => {
      const p = newOt2Step('pause'); p.message = 'Swap plates'
      const c = newOt2Step('comment'); c.text = 'half way'
      const cu = newOt2Step('custom'); cu.code = 'protocol.comment("x")'
      cfg.steps.push(p, c, cu)
    })
    expect(actions.find(a => a.kind === 'pause')).toMatchObject({ userAction: true, durationSec: 0 })
    expect(actions.find(a => a.kind === 'pause').text).toContain('Swap plates')
    expect(actions.find(a => a.kind === 'comment').text).toBe('half way')
    expect(actions.find(a => a.kind === 'custom').text).toMatch(/not previewed/)
  })
})

describe('tip racks when the deck is crowded', () => {
  it('never leaves a pipette that needs tips without a rack — the richer pipette gives one up', () => {
    const { summary, warnings, actions } = gen(fullPlate(), cfg => {
      cfg.pipettes = { left: 'p300_multi_gen2', right: 'p20_single_gen2' }
      const s = newOt2Step('series'); s.count = 8; s.intervalMinutes = 1; s.wells = 'A1-H12'; s.volume = 25; s.quenchName = 'TFA'; s.quenchUl = 30
      cfg.steps.push(s)
    })
    const multi = summary.pipettes.find(p => p.var === 'p300m'), single = summary.pipettes.find(p => p.var === 'p20')
    expect(single.tipsNeeded).toBeGreaterThan(0)
    expect(single.tipSlots.length).toBeGreaterThanOrEqual(1)
    expect(multi.tipSlots.length + single.tipSlots.length).toBe(6)            // every free slot holds a rack
    expect(warnings.some(w => /only 0 racks|No slot is free/.test(w))).toBe(false)
    expect(warnings.filter(w => /the run will pause \d+×/.test(w))).toHaveLength(2)
    expect(actions.filter(a => a.kind === 'refill' && a.pipette === 'p20').length).toBeGreaterThan(0)
  })
})

describe('8-channel on a 384-well plate', () => {
  it('fills each column in two strokes — every other row per stroke — when the volumes agree within a stroke', () => {
    const wells = {}
    const R = 'ABCDEFGHIJKLMNOP'
    for (let r = 0; r < 16; r++) for (let c = 1; c <= 24; c++) {
      wells[`${R[r]}${c}`] = linked('C1', 'K10', 10, 'mM', (1 + (r % 2)).toFixed(2)) + fill('MQ H₂O', '12.00')   // 1 µL on rows A,C,E…; 2 µL on B,D,F…
    }
    const { code, summary, warnings, actions } = gen({ name: '384', format: 384, targetVolume: 20, wells }, cfg => {
      cfg.pipettes = { left: 'p20_multi_gen2', right: 'p20_single_gen2' }
      cfg.target = { on: 'deck', slot: '1', labware: 'corning_384_wellplate_112ul_flat' }
    })
    // 24 columns × 2 interleaved groups for each liquid, both from the reservoir.
    expect(summary.sources.map(s => [s.name, s.columns, s.rack])).toEqual([['MQ H₂O', 48, 'reservoir'], ['K10', 48, 'reservoir']])
    expect(code).toMatch(/build\(p20m, reservoir\["A2"\], \[\s*\("A1", 1\), \("B1", 2\), \("A2", 1\), \("B2", 2\)/)
    expect(code).not.toContain('build(p20,')
    const multi = summary.pipettes.find(p => p.var === 'p20m')
    expect(multi.tipsNeeded).toBe(96)        // 48 columns per liquid, a new tip column each
    expect(summary.pipettes.find(p => p.var === 'p20').tipsNeeded).toBe(0)
    expect(warnings).toEqual([])
    // The preview knows a stroke on "A1" of a 384 plate touches rows A, C, …, O.
    const first = actions.find(a => a.kind === 'transfer')
    expect(first.dst.wells.slice(0, 3)).toEqual(['A1', 'C1', 'E1'])
    expect(first.dst.wells).toHaveLength(384)
  })
})
