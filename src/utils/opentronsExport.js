// Turning a plate into an Opentrons OT-2 protocol.
//
// The .onp exporter talks to an Andrew+ through a catalogue of UUIDs; the OT-2
// takes a Python file, which is both simpler and more exposed: every labware,
// pipette and volume is written out in plain text, and the robot runs exactly
// that. So this module does two things. It turns the wells of a plate into
// pipetting instructions (the same parsed composition the other exporters use),
// and it lets a plate be followed by what the OT-2 can do that a pipetting robot
// cannot: hold a temperature, cycle it, shake, wait, and take samples out of the
// plate at intervals into a second labware.
//
// Everything here is pure — a config object in, `{ code, warnings, summary }`
// out — so it can be tested in node and the generated Python can be run through
// `opentrons_simulate` without a browser. The Vue side only edits the config.
//
// API facts (labware load names, pipette ranges, module load names, method
// signatures) are from docs.opentrons.com/v2 — keep OT2_* in step with it.
import { parseWellHtml, unlinkedVolumes, entryKey } from './wellComposition'
import { plateDims, wellIdsFor } from './plateExport'
import { BOEKHOVEN_PALETTE, assignColors } from './palette'

const ROWS = 'ABCDEFGHIJKLMNOP'

// ── Catalogue ────────────────────────────────────────────────────────────────

// apiLevel decides which features the robot accepts. 2.14 brought liquids,
// 2.13 the Heater-Shaker; anything older than 2.13 cannot run what this emits.
export const OT2_API_LEVELS = ['2.28', '2.24', '2.20', '2.18', '2.16', '2.14', '2.13']
export const OT2_DEFAULT_API_LEVEL = '2.20'

export const OT2_PIPETTES = [
  { name: 'p20_single_gen2',   label: 'P20 Single-Channel GEN2',   min: 1,   max: 20,   channels: 1, gen: 2, tips: ['opentrons_96_tiprack_20ul', 'opentrons_96_filtertiprack_20ul', 'opentrons_96_tiprack_10ul', 'opentrons_96_filtertiprack_10ul'] },
  { name: 'p300_single_gen2',  label: 'P300 Single-Channel GEN2',  min: 20,  max: 300,  channels: 1, gen: 2, tips: ['opentrons_96_tiprack_300ul', 'opentrons_96_filtertiprack_200ul', 'tipone_96_tiprack_200ul'] },
  { name: 'p1000_single_gen2', label: 'P1000 Single-Channel GEN2', min: 100, max: 1000, channels: 1, gen: 2, tips: ['opentrons_96_tiprack_1000ul', 'opentrons_96_filtertiprack_1000ul', 'geb_96_tiprack_1000ul'] },
  { name: 'p20_multi_gen2',    label: 'P20 8-Channel GEN2',        min: 1,   max: 20,   channels: 8, gen: 2, tips: ['opentrons_96_tiprack_20ul', 'opentrons_96_filtertiprack_20ul', 'opentrons_96_tiprack_10ul', 'opentrons_96_filtertiprack_10ul'] },
  { name: 'p300_multi_gen2',   label: 'P300 8-Channel GEN2',       min: 20,  max: 300,  channels: 8, gen: 2, tips: ['opentrons_96_tiprack_300ul', 'opentrons_96_filtertiprack_200ul', 'tipone_96_tiprack_200ul'] },
  { name: 'p10_single',        label: 'P10 Single-Channel GEN1',   min: 1,   max: 10,   channels: 1, gen: 1, tips: ['opentrons_96_tiprack_10ul', 'opentrons_96_filtertiprack_10ul', 'geb_96_tiprack_10ul'] },
  { name: 'p50_single',        label: 'P50 Single-Channel GEN1',   min: 5,   max: 50,   channels: 1, gen: 1, tips: ['opentrons_96_tiprack_300ul', 'opentrons_96_filtertiprack_200ul'] },
  { name: 'p300_single',       label: 'P300 Single-Channel GEN1',  min: 30,  max: 300,  channels: 1, gen: 1, tips: ['opentrons_96_tiprack_300ul', 'opentrons_96_filtertiprack_200ul'] },
  { name: 'p1000_single',      label: 'P1000 Single-Channel GEN1', min: 100, max: 1000, channels: 1, gen: 1, tips: ['opentrons_96_tiprack_1000ul', 'opentrons_96_filtertiprack_1000ul', 'geb_96_tiprack_1000ul'] },
  { name: 'p10_multi',         label: 'P10 8-Channel GEN1',        min: 1,   max: 10,   channels: 8, gen: 1, tips: ['opentrons_96_tiprack_10ul', 'opentrons_96_filtertiprack_10ul', 'geb_96_tiprack_10ul'] },
  { name: 'p50_multi',         label: 'P50 8-Channel GEN1',        min: 5,   max: 50,   channels: 8, gen: 1, tips: ['opentrons_96_tiprack_300ul', 'opentrons_96_filtertiprack_200ul'] },
  { name: 'p300_multi',        label: 'P300 8-Channel GEN1',       min: 30,  max: 300,  channels: 8, gen: 1, tips: ['opentrons_96_tiprack_300ul', 'opentrons_96_filtertiprack_200ul'] },
]
export const pipetteByName = (name) => OT2_PIPETTES.find(p => p.name === name) || null

// kind: plate | tuberack | reservoir | block | tiprack | hsAdapter
// on:   where the labware may sit — 'deck' and/or a module type.
// maxUl: working volume of one well, for capacity warnings and load_liquid.
export const OT2_LABWARE = [
  // 96-well plates
  { name: 'corning_96_wellplate_360ul_flat',              label: 'Corning 96 Well Plate 360 µL Flat',               kind: 'plate', rows: 8, cols: 12, maxUl: 360,  h: 14, on: ['deck'] },
  { name: 'nest_96_wellplate_200ul_flat',                 label: 'NEST 96 Well Plate 200 µL Flat',                  kind: 'plate', rows: 8, cols: 12, maxUl: 200,  h: 14, on: ['deck'] },
  { name: 'nest_96_wellplate_100ul_pcr_full_skirt',       label: 'NEST 96 Well Plate 100 µL PCR Full Skirt',        kind: 'plate', rows: 8, cols: 12, maxUl: 100,  h: 16, on: ['deck', 'thermocycler'] },
  { name: 'opentrons_96_wellplate_200ul_pcr_full_skirt',  label: 'Opentrons Tough 96 Well Plate 200 µL PCR Full Skirt', kind: 'plate', rows: 8, cols: 12, maxUl: 200, h: 16, on: ['deck', 'thermocycler'] },
  { name: 'armadillo_96_wellplate_200ul_pcr_full_skirt',  label: 'Armadillo 96 Well Plate 200 µL PCR Full Skirt',   kind: 'plate', rows: 8, cols: 12, maxUl: 200,  h: 16, on: ['deck', 'thermocycler'] },
  { name: 'biorad_96_wellplate_200ul_pcr',                label: 'Bio-Rad 96 Well Plate 200 µL PCR',                kind: 'plate', rows: 8, cols: 12, maxUl: 200,  h: 16, on: ['deck', 'thermocycler'] },
  { name: 'greiner_96_wellplate_323ul',                   label: 'Greiner 96 Well Plate 323 µL',                    kind: 'plate', rows: 8, cols: 12, maxUl: 323,  h: 14, on: ['deck'] },
  { name: 'greiner_96_wellplate_340ul_chimney',           label: 'Greiner 96 Well Plate 340 µL (chimney)',          kind: 'plate', rows: 8, cols: 12, maxUl: 340,  h: 14, on: ['deck'] },
  { name: 'greiner_96_wellplate_382ul',                   label: 'Greiner 96 Well Plate 382 µL',                    kind: 'plate', rows: 8, cols: 12, maxUl: 382,  h: 15, on: ['deck'] },
  { name: 'corning_96_wellplate_330ul',                   label: 'Corning 96 Well Plate 330 µL',                    kind: 'plate', rows: 8, cols: 12, maxUl: 330,  h: 14, on: ['deck'] },
  { name: 'ibidi_96_square_well_plate_300ul',             label: 'ibidi 96 Square Well Flat Bottom Plate 300 µL',   kind: 'plate', rows: 8, cols: 12, maxUl: 300,  h: 15, on: ['deck'] },
  { name: 'axygen_96_wellplate_500ul',                    label: 'Axygen 96 Well Plate 500 µL',                     kind: 'plate', rows: 8, cols: 12, maxUl: 500,  h: 14, on: ['deck'] },
  { name: 'eppendorf_96_wellplate_150ul',                 label: 'Eppendorf 96 Well Plate 150 µL',                  kind: 'plate', rows: 8, cols: 12, maxUl: 150,  h: 16, on: ['deck'] },
  { name: 'eppendorf_96_wellplate_350ul_lobind',          label: 'Eppendorf 96 Well DNA LoBind Microplate 350 µL',  kind: 'plate', rows: 8, cols: 12, maxUl: 350,  h: 14, on: ['deck'] },
  { name: 'eppendorf_96_wellplate_500ul_lobind',          label: 'Eppendorf 96 Protein LoBind Deepwell 500 µL',     kind: 'plate', rows: 8, cols: 12, maxUl: 500,  h: 27, on: ['deck'] },
  { name: 'thermoscientificnunc_96_wellplate_1300ul',     label: 'Thermo Scientific Nunc 96 Well Plate 1300 µL',    kind: 'plate', rows: 8, cols: 12, maxUl: 1300, h: 32, on: ['deck'] },
  { name: 'nest_96_wellplate_2ml_deep',                   label: 'NEST 96 Deep Well Plate 2 mL',                    kind: 'plate', rows: 8, cols: 12, maxUl: 2000, h: 41, on: ['deck'] },
  { name: 'eppendorf_96_wellplate_2000ul_lobind',         label: 'Eppendorf 96 Protein LoBind Deepwell 2 mL',       kind: 'plate', rows: 8, cols: 12, maxUl: 2000, h: 44, on: ['deck'] },
  { name: 'usascientific_96_wellplate_2.4ml_deep',        label: 'USA Scientific 96 Deep Well Plate 2.4 mL',        kind: 'plate', rows: 8, cols: 12, maxUl: 2400, h: 44, on: ['deck'] },
  // Aluminum blocks (Temperature Module) that hold a 96-format
  { name: 'opentrons_96_aluminumblock_generic_pcr_strip_200ul',  label: 'Opentrons 96 Well Aluminum Block + generic PCR strips 200 µL', kind: 'block', rows: 8, cols: 12, maxUl: 200, h: 26, on: ['temperature', 'deck'] },
  { name: 'opentrons_96_aluminumblock_nest_wellplate_100ul',     label: 'Opentrons 96 Well Aluminum Block + NEST 100 µL PCR plate',    kind: 'block', rows: 8, cols: 12, maxUl: 100, h: 21, on: ['temperature', 'deck'] },
  { name: 'opentrons_96_aluminumblock_biorad_wellplate_200ul',   label: 'Opentrons 96 Well Aluminum Block + Bio-Rad 200 µL PCR plate', kind: 'block', rows: 8, cols: 12, maxUl: 200, h: 19, on: ['temperature', 'deck'] },
  // Heater-Shaker adapter + labware definitions (one load name covers both)
  { name: 'opentrons_96_pcr_adapter_nest_wellplate_100ul_pcr_full_skirt',   label: 'Heater-Shaker PCR adapter + NEST 96 PCR 100 µL',        kind: 'hsAdapter', rows: 8, cols: 12, maxUl: 100,  h: 19, on: ['heater_shaker'] },
  { name: 'opentrons_96_pcr_adapter_armadillo_wellplate_200ul',             label: 'Heater-Shaker PCR adapter + Armadillo 96 PCR 200 µL',   kind: 'hsAdapter', rows: 8, cols: 12, maxUl: 200,  h: 19, on: ['heater_shaker'] },
  { name: 'opentrons_96_flat_bottom_adapter_nest_wellplate_200ul_flat',     label: 'Heater-Shaker flat adapter + NEST 96 Flat 200 µL',      kind: 'hsAdapter', rows: 8, cols: 12, maxUl: 200,  h: 16, on: ['heater_shaker'] },
  { name: 'opentrons_96_deep_well_adapter_nest_wellplate_2ml_deep',         label: 'Heater-Shaker deep-well adapter + NEST 96 Deep 2 mL',   kind: 'hsAdapter', rows: 8, cols: 12, maxUl: 2000, h: 42, on: ['heater_shaker'] },
  { name: 'opentrons_universal_flat_adapter_corning_384_wellplate_112ul_flat', label: 'Heater-Shaker universal adapter + Corning 384 Flat 112 µL', kind: 'hsAdapter', rows: 16, cols: 24, maxUl: 112, h: 18, on: ['heater_shaker'] },
  // 384
  { name: 'corning_384_wellplate_112ul_flat',             label: 'Corning 384 Well Plate 112 µL Flat',              kind: 'plate', rows: 16, cols: 24, maxUl: 112, h: 14, on: ['deck'] },
  { name: 'greiner_384_wellplate_240ul',                  label: 'Greiner 384 Well Plate 240 µL',                   kind: 'plate', rows: 16, cols: 24, maxUl: 240, h: 22, on: ['deck'] },
  { name: 'corning_falcon_384_wellplate_130ul_flat',      label: 'Corning Falcon 384 Well Microtest Plate 130 µL',  kind: 'plate', rows: 16, cols: 24, maxUl: 130, h: 14, on: ['deck'] },
  { name: 'nunc_384_wellplate_100ul',                     label: 'Nunc 384 Well Plate 100 µL',                      kind: 'plate', rows: 16, cols: 24, maxUl: 100, h: 14, on: ['deck'] },
  { name: 'biorad_384_wellplate_50ul',                    label: 'Bio-Rad 384 Well Plate 50 µL',                    kind: 'plate', rows: 16, cols: 24, maxUl: 50,  h: 10, on: ['deck'] },
  { name: 'eppendorf_384_wellplate_45ul',                 label: 'Eppendorf 384 Well Plate 45 µL',                  kind: 'plate', rows: 16, cols: 24, maxUl: 45,  h: 11, on: ['deck'] },
  { name: 'appliedbiosystemsmicroamp_384_wellplate_40ul', label: 'Applied Biosystems MicroAmp 384 Well Plate 40 µL', kind: 'plate', rows: 16, cols: 24, maxUl: 40, h: 10, on: ['deck'] },
  // 48 / 24 / 12 / 6
  { name: 'corning_48_wellplate_1.6ml_flat',              label: 'Corning 48 Well Plate 1.6 mL Flat',               kind: 'plate', rows: 6, cols: 8,  maxUl: 1600, h: 20, on: ['deck'] },
  { name: 'corning_24_wellplate_3.4ml_flat',              label: 'Corning 24 Well Plate 3.4 mL Flat',               kind: 'plate', rows: 4, cols: 6,  maxUl: 3400, h: 20, on: ['deck'] },
  { name: 'nest_24_wellplate_10.4ml',                     label: 'NEST 24 Well Plate 10.4 mL',                      kind: 'plate', rows: 4, cols: 6,  maxUl: 10400, h: 44, on: ['deck'] },
  { name: 'corning_12_wellplate_6.9ml_flat',              label: 'Corning 12 Well Plate 6.9 mL Flat',               kind: 'plate', rows: 3, cols: 4,  maxUl: 6900, h: 20, on: ['deck'] },
  { name: 'corning_6_wellplate_16.8ml_flat',              label: 'Corning 6 Well Plate 16.8 mL Flat',               kind: 'plate', rows: 2, cols: 3,  maxUl: 16800, h: 20, on: ['deck'] },
  // Tube racks (4×6 = 24 tubes; also usable as a 24-well "plate")
  { name: 'opentrons_24_tuberack_nest_1.5ml_snapcap',                  label: 'Opentrons 24 Tube Rack + NEST 1.5 mL Snapcap',            kind: 'tuberack', rows: 4, cols: 6, maxUl: 1500,  h: 80, on: ['deck'] },
  { name: 'opentrons_24_tuberack_nest_1.5ml_screwcap',                 label: 'Opentrons 24 Tube Rack + NEST 1.5 mL Screwcap',           kind: 'tuberack', rows: 4, cols: 6, maxUl: 1500,  h: 85, on: ['deck'] },
  { name: 'opentrons_24_tuberack_eppendorf_1.5ml_safelock_snapcap',    label: 'Opentrons 24 Tube Rack + Eppendorf 1.5 mL Safe-Lock',     kind: 'tuberack', rows: 4, cols: 6, maxUl: 1500,  h: 80, on: ['deck'] },
  { name: 'opentrons_24_tuberack_nest_2ml_snapcap',                    label: 'Opentrons 24 Tube Rack + NEST 2 mL Snapcap',              kind: 'tuberack', rows: 4, cols: 6, maxUl: 2000,  h: 79, on: ['deck'] },
  { name: 'opentrons_24_tuberack_nest_2ml_screwcap',                   label: 'Opentrons 24 Tube Rack + NEST 2 mL Screwcap',             kind: 'tuberack', rows: 4, cols: 6, maxUl: 2000,  h: 85, on: ['deck'] },
  { name: 'opentrons_24_tuberack_eppendorf_2ml_safelock_snapcap',      label: 'Opentrons 24 Tube Rack + Eppendorf 2 mL Safe-Lock',       kind: 'tuberack', rows: 4, cols: 6, maxUl: 2000,  h: 80, on: ['deck'] },
  { name: 'opentrons_24_tuberack_generic_2ml_screwcap',                label: 'Opentrons 24 Tube Rack + generic 2 mL Screwcap',          kind: 'tuberack', rows: 4, cols: 6, maxUl: 2000,  h: 84, on: ['deck'] },
  { name: 'opentrons_24_tuberack_nest_0.5ml_screwcap',                 label: 'Opentrons 24 Tube Rack + NEST 0.5 mL Screwcap',           kind: 'tuberack', rows: 4, cols: 6, maxUl: 500,   h: 85, on: ['deck'] },
  { name: 'opentrons_24_aluminumblock_nest_1.5ml_snapcap',             label: 'Opentrons 24 Well Aluminum Block + NEST 1.5 mL Snapcap',  kind: 'block',    rows: 4, cols: 6, maxUl: 1500,  h: 44, on: ['temperature', 'deck'] },
  { name: 'opentrons_24_aluminumblock_nest_1.5ml_screwcap',            label: 'Opentrons 24 Well Aluminum Block + NEST 1.5 mL Screwcap', kind: 'block',    rows: 4, cols: 6, maxUl: 1500,  h: 49, on: ['temperature', 'deck'] },
  { name: 'opentrons_24_aluminumblock_nest_2ml_snapcap',               label: 'Opentrons 24 Well Aluminum Block + NEST 2 mL Snapcap',    kind: 'block',    rows: 4, cols: 6, maxUl: 2000,  h: 44, on: ['temperature', 'deck'] },
  { name: 'opentrons_24_aluminumblock_generic_2ml_screwcap',           label: 'Opentrons 24 Well Aluminum Block + generic 2 mL Screwcap', kind: 'block',   rows: 4, cols: 6, maxUl: 2000,  h: 49, on: ['temperature', 'deck'] },
  { name: 'opentrons_24_aluminumblock_nest_0.5ml_screwcap',            label: 'Opentrons 24 Well Aluminum Block + NEST 0.5 mL Screwcap', kind: 'block',    rows: 4, cols: 6, maxUl: 500,   h: 49, on: ['temperature', 'deck'] },
  { name: 'opentrons_15_tuberack_falcon_15ml_conical',                 label: 'Opentrons 15 Tube Rack + Falcon 15 mL Conical',           kind: 'tuberack', rows: 3, cols: 5, maxUl: 15000, h: 124, on: ['deck'] },
  { name: 'opentrons_15_tuberack_nest_15ml_conical',                   label: 'Opentrons 15 Tube Rack + NEST 15 mL Conical',             kind: 'tuberack', rows: 3, cols: 5, maxUl: 15000, h: 125, on: ['deck'] },
  { name: 'opentrons_6_tuberack_falcon_50ml_conical',                  label: 'Opentrons 6 Tube Rack + Falcon 50 mL Conical',            kind: 'tuberack', rows: 2, cols: 3, maxUl: 50000, h: 120, on: ['deck'] },
  { name: 'opentrons_6_tuberack_nest_50ml_conical',                    label: 'Opentrons 6 Tube Rack + NEST 50 mL Conical',              kind: 'tuberack', rows: 2, cols: 3, maxUl: 50000, h: 120, on: ['deck'] },
  // Reservoirs
  { name: 'nest_12_reservoir_15ml',        label: 'NEST 12 Well Reservoir 15 mL',        kind: 'reservoir', rows: 1, cols: 12, maxUl: 15000,  h: 31, on: ['deck'] },
  { name: 'nest_12_reservoir_22ml',        label: 'NEST 12 Well Reservoir 22 mL',        kind: 'reservoir', rows: 1, cols: 12, maxUl: 22000,  h: 44, on: ['deck'] },
  { name: 'usascientific_12_reservoir_22ml', label: 'USA Scientific 12 Well Reservoir 22 mL', kind: 'reservoir', rows: 1, cols: 12, maxUl: 22000, h: 44, on: ['deck'] },
  { name: 'nest_8_reservoir_22ml',         label: 'NEST 8 Well Reservoir 22 mL',         kind: 'reservoir', rows: 8, cols: 1,  maxUl: 22000,  h: 31, on: ['deck'] },
  { name: 'nest_1_reservoir_195ml',        label: 'NEST 1 Well Reservoir 195 mL',        kind: 'reservoir', rows: 1, cols: 1,  maxUl: 195000, h: 31, on: ['deck'] },
  { name: 'nest_1_reservoir_290ml',        label: 'NEST 1 Well Reservoir 290 mL',        kind: 'reservoir', rows: 1, cols: 1,  maxUl: 290000, h: 44, on: ['deck'] },
  { name: 'agilent_1_reservoir_290ml',     label: 'Agilent 1 Well Reservoir 290 mL',     kind: 'reservoir', rows: 1, cols: 1,  maxUl: 290000, h: 44, on: ['deck'] },
  { name: 'axygen_1_reservoir_90ml',       label: 'Axygen 1 Well Reservoir 90 mL',       kind: 'reservoir', rows: 1, cols: 1,  maxUl: 90000,  h: 19, on: ['deck'] },
  // Tip racks
  { name: 'opentrons_96_tiprack_10ul',         label: 'Opentrons 96 Tip Rack 10 µL',          kind: 'tiprack', rows: 8, cols: 12, maxUl: 10,   h: 65, on: ['deck'] },
  { name: 'opentrons_96_tiprack_20ul',         label: 'Opentrons 96 Tip Rack 20 µL',          kind: 'tiprack', rows: 8, cols: 12, maxUl: 20,   h: 65, on: ['deck'] },
  { name: 'opentrons_96_tiprack_300ul',        label: 'Opentrons 96 Tip Rack 300 µL',         kind: 'tiprack', rows: 8, cols: 12, maxUl: 300,  h: 64, on: ['deck'] },
  { name: 'opentrons_96_tiprack_1000ul',       label: 'Opentrons 96 Tip Rack 1000 µL',        kind: 'tiprack', rows: 8, cols: 12, maxUl: 1000, h: 97, on: ['deck'] },
  { name: 'opentrons_96_filtertiprack_10ul',   label: 'Opentrons 96 Filter Tip Rack 10 µL',   kind: 'tiprack', rows: 8, cols: 12, maxUl: 10,   h: 65, on: ['deck'] },
  { name: 'opentrons_96_filtertiprack_20ul',   label: 'Opentrons 96 Filter Tip Rack 20 µL',   kind: 'tiprack', rows: 8, cols: 12, maxUl: 20,   h: 65, on: ['deck'] },
  { name: 'opentrons_96_filtertiprack_200ul',  label: 'Opentrons 96 Filter Tip Rack 200 µL',  kind: 'tiprack', rows: 8, cols: 12, maxUl: 200,  h: 64, on: ['deck'] },
  { name: 'opentrons_96_filtertiprack_1000ul', label: 'Opentrons 96 Filter Tip Rack 1000 µL', kind: 'tiprack', rows: 8, cols: 12, maxUl: 1000, h: 97, on: ['deck'] },
  { name: 'geb_96_tiprack_10ul',               label: 'GEB 96 Tip Rack 10 µL',                kind: 'tiprack', rows: 8, cols: 12, maxUl: 10,   h: 52, on: ['deck'] },
  { name: 'geb_96_tiprack_1000ul',             label: 'GEB 96 Tip Rack 1000 µL',              kind: 'tiprack', rows: 8, cols: 12, maxUl: 1000, h: 100, on: ['deck'] },
  { name: 'tipone_96_tiprack_200ul',           label: 'TipOne 96 Tip Rack 200 µL',            kind: 'tiprack', rows: 8, cols: 12, maxUl: 200,  h: 64, on: ['deck'] },
  { name: 'eppendorf_96_tiprack_10ul_eptips',  label: 'Eppendorf epT.I.P.S. 96 Tip Rack 10 µL', kind: 'tiprack', rows: 8, cols: 12, maxUl: 10, h: 65, on: ['deck'] },
  { name: 'eppendorf_96_tiprack_1000ul_eptips', label: 'Eppendorf epT.I.P.S. 96 Tip Rack 1000 µL', kind: 'tiprack', rows: 8, cols: 12, maxUl: 1000, h: 122, on: ['deck'] },
]
export const labwareByName = (name) => OT2_LABWARE.find(l => l.name === name) || null

export const OT2_MODULES = {
  thermocycler:  { label: 'Thermocycler',       models: [['thermocyclerModuleV1', 'GEN1'], ['thermocyclerModuleV2', 'GEN2']], slots: ['7'], blockMin: 4, blockMax: 99, lidMin: 37, lidMax: 110 },
  temperature:   { label: 'Temperature Module', models: [['temperature module gen2', 'GEN2'], ['temperature module', 'GEN1']], min: 4, max: 95 },
  heater_shaker: { label: 'Heater-Shaker',      models: [['heaterShakerModuleV1', 'GEN1']], min: 37, max: 95, rpmMin: 200, rpmMax: 3000, slots: ['1', '3', '4', '6', '7', '10'] },
  magnetic:      { label: 'Magnetic Module',    models: [['magnetic module gen2', 'GEN2'], ['magnetic module', 'GEN1']] },
}

// Slots 1–11 hold labware; 12 is the fixed trash. The Thermocycler is a
// four-slot module: it sits on 7 and covers 8, 10 and 11.
export const OT2_SLOTS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']
const TC_SLOTS = ['7', '8', '10', '11']
// Where tip racks go when the user has not said: away from the front-left
// corner, which is where a hand reaches first to swap a plate.
const TIP_SLOT_ORDER = ['3', '6', '9', '2', '5', '8', '1', '4', '7', '10', '11']

// The deck is a 3-wide grid: 1 2 3 in the front row, 10 11 (12) at the back.
// The Heater-Shaker cares about its neighbours: no other module next to it in
// any direction, nothing taller than 53 mm to its left or right, and nothing
// next to it reachable while it shakes.
export const HS_MAX_ADJACENT_HEIGHT_MM = 53
// The robot exempts its own standard tip racks from the height rule (they are
// taller than 53 mm but slim); nothing else tall may sit left or right of it.
const HS_TALL_OK = new Set(['opentrons_96_tiprack_10ul', 'opentrons_96_tiprack_20ul', 'opentrons_96_tiprack_300ul',
                            'opentrons_96_filtertiprack_10ul', 'opentrons_96_filtertiprack_20ul', 'opentrons_96_filtertiprack_200ul'])
export const tooTallBesideHS = (lw) => !!lw && lw.h > HS_MAX_ADJACENT_HEIGHT_MM && !HS_TALL_OK.has(lw.name)
export function adjacentSlots(slot, { xOnly = false } = {}) {
  const n = Number(slot)
  if (!(n >= 1 && n <= 11)) return []
  const col = (n - 1) % 3, row = Math.floor((n - 1) / 3)
  const out = []
  if (col > 0) out.push(String(n - 1))
  if (col < 2 && n + 1 <= 11) out.push(String(n + 1))
  if (!xOnly) {
    if (row > 0) out.push(String(n - 3))
    if (n + 3 <= 11) out.push(String(n + 3))
  }
  return out
}

// Opentrons orders `labware.wells()` column by column: A1, B1, …, then A2.
export function wellNamesOf(lw) {
  const out = []
  for (let c = 1; c <= lw.cols; c++) for (let r = 0; r < lw.rows; r++) out.push(`${ROWS[r]}${c}`)
  return out
}

// A 24-well plate in the editor may be a real 24-well plate or a rack of 24
// tubes; both are 4×6 so both are offered. The 8-PCR-strip format is 1×8 in the
// editor and maps onto the first column of a 96-format (see targetWell).
export function targetLabwareOptions(format, on = 'deck') {
  const dims = plateDims(format)
  return OT2_LABWARE.filter(l => {
    if (l.kind === 'tiprack' || !l.on.includes(on)) return false
    if (format === 'pcr8') return l.rows >= 8 && l.cols >= 1
    return l.rows === dims.rows && l.cols === dims.cols
  })
}
export function defaultTargetLabware(format, on = 'deck') {
  const opts = targetLabwareOptions(format, on)
  const prefer = {
    96: ['corning_96_wellplate_360ul_flat', 'nest_96_wellplate_100ul_pcr_full_skirt', 'opentrons_96_aluminumblock_generic_pcr_strip_200ul', 'opentrons_96_flat_bottom_adapter_nest_wellplate_200ul_flat'],
    384: ['corning_384_wellplate_112ul_flat', 'opentrons_universal_flat_adapter_corning_384_wellplate_112ul_flat'],
    24: ['corning_24_wellplate_3.4ml_flat', 'opentrons_24_aluminumblock_nest_1.5ml_snapcap'],
    48: ['corning_48_wellplate_1.6ml_flat'],
    pcr8: ['opentrons_96_aluminumblock_generic_pcr_strip_200ul', 'nest_96_wellplate_100ul_pcr_full_skirt', 'opentrons_96_pcr_adapter_nest_wellplate_100ul_pcr_full_skirt'],
  }[format] || []
  return prefer.find(n => opts.some(o => o.name === n)) || opts[0]?.name || ''
}
export const sourceLabwareOptions = () => OT2_LABWARE.filter(l => ['tuberack', 'reservoir', 'plate', 'block'].includes(l.kind) && l.on.includes('deck'))
export const sampleLabwareOptions = () => OT2_LABWARE.filter(l => ['plate', 'tuberack', 'block'].includes(l.kind) && l.on.includes('deck'))
export const tipRackOptions = (pipetteName) => {
  const p = pipetteByName(pipetteName)
  return p ? p.tips.map(labwareByName).filter(Boolean) : []
}

// ── 8-channel geometry ──
// An 8-channel pipette spans eight wells 9 mm apart: one column of a 96-format,
// or every other row of a 384. It can only draw from somewhere all eight tips
// reach at once — a reservoir trough, or a column of an 8-row labware.
export const columnLabwareOptions = () => OT2_LABWARE.filter(l => l.on.includes('deck') && (l.kind === 'reservoir' || ((l.kind === 'plate' || l.kind === 'block') && l.rows === 8)))
// Positions the 8-channel can address in such labware — like Opentrons, by the
// A-row well of the column (a trough of a 1-row reservoir is its own well).
export const columnPositions = (lw) => lw.rows === 1 ? wellNamesOf(lw) : Array.from({ length: lw.cols }, (_, i) => `A${i + 1}`)
export const columnWells = (lw, address) => lw.rows === 1 ? [address] : ROWS.slice(0, lw.rows).split('').map(r => `${r}${address.slice(1)}`)
// Two wells count as "the same volume" when they agree to the hundredth of a µL.
export const MULTI_TOL = 0.005

// ── Partial tip pickup ───────────────────────────────────────────────────────
// An OT-2 8-channel can work with only some of its nozzles tipped
// (`configure_nozzle_layout(style=PARTIAL_COLUMN, …)`, apiLevel 2.20 and newer).
// The tipped nozzles are always the bottom ones, counted up from H1, so a stroke
// covers the N rows ENDING at the well it addresses: four nozzles at D1 reach
// A1–D1. Addressing row A with more than one nozzle puts the rest off the plate,
// which is the crash the Opentrons docs warn about — hence the "last well" rule.
export const PARTIAL_MIN_API = '2.20'
export const partialEndNozzle = (n) => `${ROWS[8 - n]}1`
// Tipped from the front, the pipette body hangs further back, so it fouls
// anything tall in the slot DIRECTLY BEHIND the one it is reaching into. The
// robot refuses such a move outright (PartialTipMovementNotAllowedError).
// Measured against opentrons 8.8.2: 56 mm clears, 65 mm does not; only the
// slot behind matters, and the back row has nothing behind it.
export const PARTIAL_REAR_MAX_HEIGHT_MM = 57
// Slot 12 counts: the fixed trash bin stands there, tall, directly behind slot 9.
// The robot's own check misses it — the trash is a TrashBin, not deck labware, so
// `deck["12"]` is empty and the protocol analyses clean, then fouls at run time.
export const TRASH_SLOT = '12'
export const slotBehind = (slot) => { const n = Number(slot) + 3; return n <= 12 ? String(n) : null }
export const tooTallBehindPartial = (lw) => !!lw && lw.h > PARTIAL_REAR_MAX_HEIGHT_MM
// Any module is tall enough to foul the move, whatever sits on it — verified for
// the Thermocycler, Temperature Module, Heater-Shaker and Magnetic Module. The
// one exception is a module reaching over itself: the Thermocycler covers 7, 8,
// 10 and 11, and pipetting into its own plate on slot 7 is fine.
export const blocksPartialBehind = (rear, front) => {
  if (rear?.fixedTrash) return true
  if (!rear) return false
  if (rear.module && front?.module && rear.moduleType === front.moduleType) return false
  return !!rear.module || tooTallBehindPartial(rear.lw)
}
/**
 * The strokes a partly tipped 8-channel can do over `wellIds`: one contiguous
 * run per column, every run the same length. Returns null when that is not what
 * the selection looks like, and the single-channel takes over instead.
 * `anyLength` admits runs that do not divide 8 — safe only when every stroke
 * lands at the top of its own sample column (the plate-layout mode).
 */
export function partialColumnGroups(wellIds, format, { anyLength = false } = {}) {
  if (format !== 96 && format !== 'pcr8') return null      // a 384's nozzle pitch skips every other row
  const byCol = new Map()
  for (const w of wellIds) {
    const r = ROWS.indexOf(w[0]), c = Number(w.slice(1))
    if (r < 0 || r > 7 || !(c >= 1)) return null
    if (!byCol.has(c)) byCol.set(c, [])
    byCol.get(c).push(r)
  }
  let n = 0
  const out = []
  for (const c of [...byCol.keys()].sort((a, b) => a - b)) {
    const rows = byCol.get(c).sort((a, b) => a - b)
    if (rows.some((r, i) => i > 0 && r !== rows[i - 1] + 1)) return null   // a gap — not one stroke
    if (!n) n = rows.length
    else if (rows.length !== n) return null                               // one nozzle layout per step
    out.push({ address: `${ROWS[rows[rows.length - 1]]}${c}`, wells: rows.map(r => `${ROWS[r]}${c}`) })
  }
  // Sample wells are handed out in blocks of n inside an 8-row column, so a block
  // never straddles two columns: n has to divide 8 (2 or 4; 8 is the whole column).
  // Laid out as on the plate, each run keeps its own rows in its own column.
  if (!(n >= 2 && n <= 7) || (!anyLength && 8 % n !== 0)) return null
  return { n, groups: out }
}
/**
 * The unbroken runs of rows a selection makes in each column, in column order —
 * what the 8-channel can reach in one stroke and what it cannot.
 *   'whole' the entire column (every nozzle, addressed by its A-row well)
 *   'part'  2..7 rows in a row (that many tips, addressed by the LAST well)
 *   'lone'  a single well — the 8-channel has nothing to grip it with
 * A 384 plate has its own pitch: only the half-columns an 8-channel spans count
 * as whole strokes, everything else is on its own. Other formats are all 'lone'.
 */
export function columnRuns(wellIds, format) {
  const ids = [...new Set(wellIds)]
  const lone = (w) => ({ col: Number(w.slice(1)), wells: [w], n: 1, kind: 'lone', address: w })
  if (format === 384) {
    const have = new Set(ids)
    const out = []
    const taken = new Set()
    for (const g of multiGroups(384)) {
      if (!g.wells.every(w => have.has(w))) continue
      out.push({ col: Number(g.address.slice(1)), wells: [...g.wells], n: 8, kind: 'whole', address: g.address })
      g.wells.forEach(w => taken.add(w))
    }
    for (const w of ids) if (!taken.has(w)) out.push(lone(w))
    return out.sort((a, b) => a.col - b.col || ROWS.indexOf(a.wells[0][0]) - ROWS.indexOf(b.wells[0][0]))
  }
  if (format !== 96 && format !== 'pcr8') return ids.map(lone).sort((a, b) => a.col - b.col || ROWS.indexOf(a.wells[0][0]) - ROWS.indexOf(b.wells[0][0]))
  const byCol = new Map()
  for (const w of ids) {
    const r = ROWS.indexOf(w[0]), c = Number(w.slice(1))
    if (r < 0 || r > 7 || !(c >= 1)) return ids.map(lone)
    if (!byCol.has(c)) byCol.set(c, [])
    byCol.get(c).push(r)
  }
  const out = []
  for (const c of [...byCol.keys()].sort((a, b) => a - b)) {
    const rows = byCol.get(c).sort((a, b) => a - b)
    let run = [rows[0]]
    const flush = () => {
      const wells = run.map(r => `${ROWS[r]}${c}`)
      const n = run.length
      out.push({ col: c, wells, n, kind: n === 8 ? 'whole' : n === 1 ? 'lone' : 'part', address: n === 8 ? `A${c}` : wells[n - 1] })
    }
    for (let i = 1; i < rows.length; i++) {
      if (rows[i] === rows[i - 1] + 1) run.push(rows[i])
      else { flush(); run = [rows[i]] }
    }
    flush()
  }
  return out
}
/**
 * Where one time point's strokes land, counted from its first sample well, when
 * the samples simply take the next free wells. A stroke has to stay inside one
 * sample column (the nozzles sit one under the other), so a stroke that would
 * cross the foot of a column starts at the top of the next one and leaves those
 * wells empty. `strokes` are {n, multi} in the order the robot does them.
 */
export function packFootprint(strokes, rows) {
  let c = 0
  const placements = strokes.map(st => {
    if (!st.multi || st.n < 2) { const p = { addressOffset: c, fill: [c] }; c += 1; return p }
    if ((c % rows) + st.n > rows) c = Math.ceil(c / rows) * rows
    const fill = Array.from({ length: st.n }, (_, k) => c + k)
    const p = { addressOffset: st.n === rows ? c : c + st.n - 1, fill }
    c += st.n
    return p
  })
  return { placements, extent: c }
}
/**
 * The step a time point's first well may move by and still keep every stroke
 * inside one sample column: the smallest of 1, 2, 4, 8 that works for every
 * shift it allows. For whole columns this is 8 and for single wells 1, which is
 * exactly where the sample cursor used to land.
 */
export function footprintAlign(placements, rows) {
  const multiFills = placements.filter(p => p.fill.length > 1).map(p => p.fill)
  if (!multiFills.length) return 1
  for (const a of [1, 2, 4, 8]) {
    if (rows % a) continue
    let ok = true
    for (let s = 0; s < rows && ok; s += a) {
      for (const fill of multiFills) {
        if (Math.floor((fill[0] + s) / rows) !== Math.floor((fill[fill.length - 1] + s) / rows)) { ok = false; break }
      }
    }
    if (ok) return a
  }
  return rows
}
/**
 * Where each well of a selection lands when a time point keeps the plate's own
 * layout: the same row, with the selection's columns moved side by side into a
 * block of adjacent sample columns (a column the selection skips is not kept).
 * Offsets count from the first well of that block, down each column first like
 * `labware.wells()`, so a block that starts at flat index `st` puts `well` at
 * `st + offsetOf(well)`. `problem` says why the sample labware cannot hold it.
 */
export function rowsLayout(wellIds, sampleLw) {
  if (!wellIds.length || !sampleLw) return { problem: 'nothing to lay out' }
  const rows = [...new Set(wellIds.map(w => ROWS.indexOf(w[0])))].sort((a, b) => a - b)
  const lastCol = Math.max(...wellIds.map(w => Number(w.slice(1))))
  if (lastCol > sampleLw.cols) return { problem: `the wells reach column ${lastCol} and ${sampleLw.label} has only ${sampleLw.cols}` }
  if (rows.length > sampleLw.rows) return { problem: `the wells span ${rows.length} rows and ${sampleLw.label} has only ${sampleLw.rows}` }
  return {
    kind: 'rows', height: rows.length, width: lastCol, rows: sampleLw.rows, cols: sampleLw.cols,
    cellOf: (w) => ({ dc: Number(w.slice(1)) - 1, dr: rows.indexOf(ROWS.indexOf(w[0])) }),
  }
}
/**
 * Where each well of a selection lands when a time point keeps the plate's own
 * layout: the same row, with the selection's columns moved side by side into a
 * block of adjacent sample columns (a column the selection skips is not kept).
 */
export function mirrorLayout(wellIds, sampleLw) {
  if (!wellIds.length || !sampleLw) return { problem: 'nothing to lay out' }
  const cols = [...new Set(wellIds.map(w => Number(w.slice(1))))].sort((a, b) => a - b)
  const lowest = Math.max(...wellIds.map(w => ROWS.indexOf(w[0])))
  if (lowest >= sampleLw.rows) return { problem: `the wells reach down to row ${ROWS[lowest]} and ${sampleLw.label} stops at row ${ROWS[sampleLw.rows - 1]}` }
  if (cols.length > sampleLw.cols) return { problem: `the wells span ${cols.length} columns and ${sampleLw.label} has only ${sampleLw.cols}` }
  return {
    kind: 'mirror', cols: cols.length, rows: sampleLw.rows, width: cols.length, height: sampleLw.rows,
    offsetOf: (w) => cols.indexOf(Number(w.slice(1))) * sampleLw.rows + ROWS.indexOf(w[0]),
    cellOf: (w) => ({ dc: cols.indexOf(Number(w.slice(1))), dr: ROWS.indexOf(w[0]) }),
  }
}
/** The groups of eight target wells an 8-channel fills in one stroke, per plate format. */
export function multiGroups(format) {
  if (format === 'pcr8') return [{ address: 'A1', wells: ROWS.slice(0, 8).split('').map(r => `${r}1`) }]
  if (format === 96) return Array.from({ length: 12 }, (_, i) => ({ address: `A${i + 1}`, wells: ROWS.slice(0, 8).split('').map(r => `${r}${i + 1}`) }))
  if (format === 384) {
    const out = []
    for (let c = 1; c <= 24; c++) {
      out.push({ address: `A${c}`, wells: [0, 2, 4, 6, 8, 10, 12, 14].map(r => `${ROWS[r]}${c}`) })
      out.push({ address: `B${c}`, wells: [1, 3, 5, 7, 9, 11, 13, 15].map(r => `${ROWS[r]}${c}`) })
    }
    return out
  }
  return []   // 24- and 48-well plates have a different pitch
}

// ── Config ───────────────────────────────────────────────────────────────────

let stepSeq = 0
const newId = () => `s${Date.now().toString(36)}${(stepSeq++).toString(36)}`

export const OT2_STEP_TYPES = [
  { type: 'build',         label: 'Build plate',        icon: 'fa-fill-drip',        help: 'Pipette every stock into the wells exactly as the plate states.' },
  { type: 'thermocycler',  label: 'Thermocycler',       icon: 'fa-temperature-half', help: 'Open/close the lid, set the block and lid temperature, optionally hold.' },
  { type: 'tc_profile',    label: 'Thermocycler profile', icon: 'fa-rotate',         help: 'A cycled temperature profile (PCR-style).' },
  { type: 'temperature',   label: 'Temperature Module', icon: 'fa-snowflake',        help: 'Set the Temperature Module and wait until it is reached.' },
  { type: 'heater_shaker', label: 'Heater-Shaker',      icon: 'fa-water',            help: 'Heat and/or shake the plate on the Heater-Shaker.' },
  { type: 'magnetic',      label: 'Magnetic Module',    icon: 'fa-magnet',           help: 'Engage or disengage the magnets.' },
  { type: 'delay',         label: 'Wait',               icon: 'fa-hourglass-half',   help: 'Pause the protocol for a fixed time.' },
  { type: 'pause',         label: 'Pause for user',     icon: 'fa-hand',             help: 'Stop until someone presses Resume in the Opentrons App.' },
  { type: 'mix',           label: 'Mix wells',          icon: 'fa-blender',          help: 'Mix the plate wells in place.' },
  { type: 'sample',        label: 'Take samples',       icon: 'fa-vial',             help: 'Move a sample from plate wells into the sample labware — once.' },
  { type: 'series',        label: 'Sampling series',    icon: 'fa-clock-rotate-left', help: 'Take samples every N minutes, M times, each time point into fresh wells.' },
  { type: 'comment',       label: 'Comment',            icon: 'fa-message',          help: 'A line shown in the run log.' },
  { type: 'custom',        label: 'Custom Python',      icon: 'fa-code',             help: 'Your own Python inside run(); the labware and pipettes are in scope.' },
]

export function newOt2Step(type) {
  const base = { id: newId(), type }
  switch (type) {
    case 'build':         return { ...base, pipette: 'auto', multi: 'auto', mode: 'transfer', newTip: 'always', mixAfterReps: 0, mixAfterUl: '', blowOut: true, touchTip: false, airGapUl: '' }
    case 'thermocycler':  return { ...base, lid: 'close', blockTemp: '', holdMinutes: '', lidTemp: '', deactivate: false }
    case 'tc_profile':    return { ...base, profile: [{ temp: 95, seconds: 30 }, { temp: 55, seconds: 30 }, { temp: 72, seconds: 60 }], cycles: 30, lidTemp: 105, blockMaxUl: '', finalTemp: '' }
    case 'temperature':   return { ...base, temp: 4, deactivate: false }
    case 'heater_shaker': return { ...base, temp: '', rpm: '', deactivate: false }
    case 'magnetic':      return { ...base, action: 'engage', height: '' }
    case 'delay':         return { ...base, minutes: 10, seconds: 0, message: '' }
    case 'pause':         return { ...base, message: 'Continue when ready' }
    case 'mix':           return { ...base, wells: 'all', reps: 3, volume: '', pipette: 'auto', newTip: 'always' }
    // layout: 'packed' = the next free sample wells in column order;
    //         'mirror' = each time point in whole sample columns, rows as on the plate;
    //         'rows'   = each time point one row band down the plate, columns kept.
    // plate:  'auto' = the next free sample plate on the deck, or a slot of its own.
    // groups: [] = the whole selection goes to one destination; otherwise one
    //         entry per group of wells, each with its own plate, start and layout.
    case 'sample':        return { ...base, wells: 'all', volume: 10, pipette: 'auto', multi: 'partial', layout: 'packed', plate: 'auto', start: '', groups: [], newTip: 'always', mixBeforeReps: 0, mixBeforeUl: '', quenchName: '', quenchUl: '' }
    case 'series':        return { ...base, count: 6, intervalMinutes: 30, firstAtZero: true, wells: 'all', volume: 10, pipette: 'auto', multi: 'partial', layout: 'packed', plate: 'auto', start: '', groups: [], newTip: 'always', mixBeforeReps: 0, mixBeforeUl: '', quenchName: '', quenchUl: '', pauseEvery: 0, pauseMessage: '' }
    case 'comment':       return { ...base, text: '' }
    case 'custom':        return { ...base, code: '' }
    default:              return base
  }
}

export function defaultOt2Config(plate) {
  return {
    apiLevel: OT2_DEFAULT_API_LEVEL,
    protocolName: plate?.name || 'Plate',
    author: '',
    description: '',
    // A prefilled plate is pipetted by hand and put on the robot ready to go:
    // no build step, and none of its stocks need a place on the deck.
    prefilled: false,
    pipettes: { left: 'p300_single_gen2', right: 'p20_single_gen2' },
    tipRacks: { left: '', right: '' },          // '' = the pipette's default rack
    flowRates: { left: { aspirate: '', dispense: '' }, right: { aspirate: '', dispense: '' } },
    target: { on: 'deck', slot: '1', labware: defaultTargetLabware(plate?.format) },
    modules: { thermocycler: 'thermocyclerModuleV1', temperature: 'temperature module gen2', heaterShaker: 'heaterShakerModuleV1', magnetic: 'magnetic module gen2' },
    deck: { stocks: '4', bulk: '5', column: '6', temperature: '9', heaterShaker: '10', magnetic: '3' },
    stocksLabware: 'opentrons_24_tuberack_nest_1.5ml_snapcap',
    bulkLabware: 'opentrons_15_tuberack_falcon_15ml_conical',
    columnLabware: 'nest_12_reservoir_15ml',           // where the 8-channel draws from
    samplesLabware: 'nest_96_wellplate_100ul_pcr_full_skirt',
    sampleSlots: ['2'],                         // one slot per sample plate, filled in this order
    // Labware Position Check offsets, keyed "<load name>@<slot>": an offset is
    // measured for one labware type in one place, so it must not follow either.
    offsets: {},
    headroomPct: 20,
    compounds: {},                              // key -> { included, position: 'stocks:A1' | 'bulk:A1' | '' }
    steps: [newOt2Step('build')],
  }
}

// Old configs gain new keys without losing what they had.
export function normalizeOt2Config(cfg, plate) {
  const d = defaultOt2Config(plate)
  const c = { ...d, ...(cfg || {}) }
  c.pipettes = { ...d.pipettes, ...(cfg?.pipettes || {}) }
  c.tipRacks = { ...d.tipRacks, ...(cfg?.tipRacks || {}) }
  c.flowRates = { left: { ...d.flowRates.left, ...(cfg?.flowRates?.left || {}) }, right: { ...d.flowRates.right, ...(cfg?.flowRates?.right || {}) } }
  c.target = { ...d.target, ...(cfg?.target || {}) }
  c.modules = { ...d.modules, ...(cfg?.modules || {}) }
  c.deck = { ...d.deck, ...(cfg?.deck || {}) }
  c.compounds = { ...(cfg?.compounds || {}) }
  c.offsets = { ...(cfg?.offsets || {}) }
  c.steps = Array.isArray(cfg?.steps) && cfg.steps.length ? cfg.steps.map(s => ({ ...newOt2Step(s.type), ...s })) : d.steps
  // The single sample slot of older configs becomes the first of the list.
  const slots = Array.isArray(cfg?.sampleSlots) ? cfg.sampleSlots.map(String).filter(Boolean) : (cfg?.deck?.samples ? [String(cfg.deck.samples)] : [])
  c.sampleSlots = slots.length ? [...new Set(slots)] : d.sampleSlots
  delete c.deck.samples
  return c
}

// ── Reading the plate ────────────────────────────────────────────────────────

const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : null }
const isSet = (v) => v !== '' && v != null && isFinite(Number(v))
const round2 = (v) => Math.round(Number(v) * 100) / 100

/**
 * Every liquid the plate needs, with the wells it goes to.
 * Fill-ups are exported under their own name (a buffer fill-up is a source
 * like any other on an OT-2), and volumes with no inventory chip are offered
 * too — here the source is a tube position the user assigns, so nothing is
 * missing that would stop the robot. They are flagged, not dropped.
 */
export function plateDemands(plate) {
  const wells = plate?.wells || {}
  const byKey = new Map()
  for (const wellId of wellIdsFor(plate?.format)) {
    const html = wells[wellId]
    if (!html || !String(html).trim()) continue
    const entries = parseWellHtml(html)
    for (const e of entries) {
      const vol = Number(e.volume) || 0
      if (!(vol > 0)) continue
      const isFill = e.kind === 'water'
      const key = isFill ? 'fill:' + String(e.name || 'MQ H₂O').trim().toLowerCase() : entryKey(e)
      if (!byKey.has(key)) {
        byKey.set(key, { key, name: e.name, code: e.code || '', invId: e.invId || '', stock: isFill ? null : e.stock,
                         unit: isFill ? '' : (e.unit || ''), isFill, linked: !!e.invId, transfers: [], totalUl: 0 })
      }
      const g = byKey.get(key)
      g.transfers.push({ well: wellId, volume: round2(vol) })
      g.totalUl += vol
    }
    for (const u of unlinkedVolumes(html)) {
      const key = 'name:' + String(u.name || '').trim().toLowerCase()
      if (!byKey.has(key)) {
        byKey.set(key, { key, name: u.name, code: '', invId: '', stock: null, unit: '', isFill: false, linked: false, unlinked: true, transfers: [], totalUl: 0 })
      }
      const g = byKey.get(key)
      g.transfers.push({ well: wellId, volume: round2(u.volume) })
      g.totalUl += u.volume
    }
  }
  // Fill-ups first (they dilute everything that follows), then alphabetical.
  return [...byKey.values()].sort((a, b) => {
    if (a.isFill !== b.isFill) return a.isFill ? -1 : 1
    return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' })
  })
}

/** Well ids of the plate that hold anything, in plate order. */
export function filledWells(plate) {
  const wells = plate?.wells || {}
  return wellIdsFor(plate?.format).filter(w => wells[w] && String(wells[w]).trim())
}

/**
 * "all", "A1 B2 C3", "A1-A6" (a row run), "A1-H1" (a column run), "A1-B6" (a
 * rectangle); comma or space separated. Unknown tokens are returned so the
 * caller can say which ones it did not understand.
 */
export function parseWellSelection(text, plate) {
  const { rows, cols } = plateDims(plate?.format)
  const valid = new Set(wellIdsFor(plate?.format))
  const s = String(text || '').trim()
  if (!s || /^all$/i.test(s)) return { wells: filledWells(plate), unknown: [] }
  const out = []
  const unknown = []
  const push = (w) => { if (valid.has(w) && !out.includes(w)) out.push(w) }
  for (const tok of s.split(/[\s,;]+/).filter(Boolean)) {
    const m = /^([A-Pa-p])(\d{1,2})(?:\s*[-–:]\s*([A-Pa-p])(\d{1,2}))?$/.exec(tok)
    if (!m) { unknown.push(tok); continue }
    const r1 = ROWS.indexOf(m[1].toUpperCase()), c1 = Number(m[2])
    if (!m[3]) { if (r1 < rows && c1 >= 1 && c1 <= cols) push(`${ROWS[r1]}${c1}`); else unknown.push(tok); continue }
    const r2 = ROWS.indexOf(m[3].toUpperCase()), c2 = Number(m[4])
    const [ra, rb] = r1 <= r2 ? [r1, r2] : [r2, r1]
    const [ca, cb] = c1 <= c2 ? [c1, c2] : [c2, c1]
    if (rb >= rows || cb > cols || ca < 1) { unknown.push(tok); continue }
    for (let r = ra; r <= rb; r++) for (let c = ca; c <= cb; c++) push(`${ROWS[r]}${c}`)
  }
  return { wells: out, unknown }
}

// ── Python emission helpers ──────────────────────────────────────────────────

// JSON string literals are valid Python string literals (same escapes, and
// Python 3 source is UTF-8, so µ and ₂ pass through untouched).
const py = (s) => JSON.stringify(String(s ?? ''))
const pyNum = (v) => {
  const n = Number(v)
  if (!isFinite(n)) return '0'
  const r = Math.round(n * 100) / 100
  return Number.isInteger(r) ? String(r) : String(r)
}
const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim()
const apiAtLeast = (level, want) => {
  const [a, b] = String(level).split('.').map(Number)
  const [c, d] = String(want).split('.').map(Number)
  return a > c || (a === c && b >= d)
}

// Volume of a source to load: demand plus headroom, rounded up to something a
// person can measure, in µL.
export function loadVolume(demandUl, headroomPct) {
  const v = demandUl * (1 + (Number(headroomPct) || 0) / 100)
  if (v >= 10000) return Math.ceil(v / 500) * 500
  if (v >= 1000) return Math.ceil(v / 100) * 100
  if (v >= 100) return Math.ceil(v / 10) * 10
  return Math.ceil(v)
}
export const fmtUl = (v) => v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2).replace(/\.?0+$/, '')} mL` : `${round2(v)} µL`

// ── Labware Position Check offsets ───────────────────────────────────────────
// An offset belongs to one labware type in one place — a plate sits differently
// on the Thermocycler than on the deck — so it is keyed by both and is dropped
// by itself when either changes. Positive x/y/z move right, back and up, in mm.
export const offsetKey = (labwareName, slot) => `${labwareName}@${slot}`
/** The offset to apply, or null when there is none or it is all zeros. */
export function offsetFor(cfg, labwareName, slot) {
  const o = cfg?.offsets?.[offsetKey(labwareName, slot)]
  if (!o) return null
  const x = num(o.x) || 0, y = num(o.y) || 0, z = num(o.z) || 0
  return x || y || z ? { x: round2(x), y: round2(y), z: round2(z) } : null
}
// set_offset() exists from 2.12, was removed for 2.14–2.17, and is back from
// 2.18 on. The robot refuses the file outright in that gap.
export const OFFSET_API_GAP = ['2.14', '2.17']
export const offsetsWorkAt = (level) => {
  const [a, b] = String(level).split('.').map(Number)
  if (!(a >= 2)) return false
  return a > 2 || (b >= 12 && b <= 13) || b >= 18
}

/**
 * Read `set_offset()` lines as the Opentrons App's "Get Labware Offset Data"
 * writes them: a load per labware (sometimes through a module or adapter), then
 * the offset on that variable. Returns one entry per offset, with the slot it
 * belongs to, so the caller can match it against its own deck.
 */
export function parseLabwareOffsets(text) {
  const at = new Map()      // variable -> { name, slot }
  const slotOf = new Map()  // module/adapter variable -> slot
  const out = []
  const loc = (s) => String(s ?? '').replace(/^["']|["']$/g, '')
  for (const raw of String(text || '').split(/\r?\n/)) {
    const l = raw.trim()
    let m
    if ((m = /^(\w+)\s*=\s*protocol\.load_(?:module|adapter)\(\s*["']([^"']+)["']\s*(?:,\s*(?:location\s*=\s*)?(["']?[\w.]+["']?))?\s*\)/.exec(l))) {
      // A Thermocycler has no location argument — it always sits on slot 7.
      slotOf.set(m[1], m[3] ? loc(m[3]) : (/thermocycler/i.test(m[2]) ? '7' : ''))
      if (/adapter/.test(l)) at.set(m[1], { name: m[2], slot: m[3] ? loc(m[3]) : '' })
      continue
    }
    if ((m = /^(\w+)\s*=\s*protocol\.load_labware\(\s*["']([^"']+)["']\s*,\s*(?:location\s*=\s*)?(["']?[\w.]+["']?)/.exec(l))) {
      at.set(m[1], { name: m[2], slot: loc(m[3]) })
      continue
    }
    if ((m = /^(\w+)\s*=\s*(\w+)\.load_labware\(\s*["']([^"']+)["']/.exec(l))) {
      at.set(m[1], { name: m[3], slot: slotOf.get(m[2]) ?? at.get(m[2])?.slot ?? '' })
      continue
    }
    if ((m = /^(\w+)\s*\.set_offset\(\s*(?:x\s*=\s*)?(-?[\d.]+)\s*,\s*(?:y\s*=\s*)?(-?[\d.]+)\s*,\s*(?:z\s*=\s*)?(-?[\d.]+)\s*\)/.exec(l))) {
      const w = at.get(m[1])
      if (w) out.push({ labware: w.name, slot: w.slot, x: Number(m[2]), y: Number(m[3]), z: Number(m[4]) })
    }
  }
  return out
}

// Wrap a Python list of literal items to ~96 columns, continuation-indented.
function pyList(items, indent) {
  const pad = ' '.repeat(indent)
  const lines = []
  let cur = ''
  for (const it of items) {
    const piece = (cur ? ', ' : '') + it
    if (cur && (pad.length + cur.length + piece.length) > 96) { lines.push(pad + cur + ','); cur = it }
    else cur += piece
  }
  if (cur) lines.push(pad + cur)
  return lines
}

// ── The generator ────────────────────────────────────────────────────────────

/**
 * @returns {{ code: string, warnings: string[], summary: object }}
 * The code is complete and runnable as written when `warnings` is empty; every
 * warning names a thing that will fail or that the user should check.
 */
export function generateOpentronsProtocol(plate, rawConfig, { now = new Date() } = {}) {
  const cfg = normalizeOt2Config(rawConfig, plate)
  const warnings = []
  const warn = (m) => { if (!warnings.includes(m)) warnings.push(m) }
  const L = []                    // lines of the run() body (already indented by 4)
  const emit = (s = '') => L.push(s === '' ? '' : '    ' + s)

  const format = plate?.format ?? 96
  if (format === 'ibidi') {
    return { code: '', warnings: ['Ibidi chambers are not an OT-2 labware — choose a plate format the robot can hold.'], summary: null }
  }
  // Target well naming: identity, except the 8-strip which lives in column 1.
  const targetWell = (wellId) => format === 'pcr8' ? `${ROWS[Number(wellId.slice(1)) - 1]}1` : wellId

  // ── Pipettes ──
  const pipettes = []
  for (const mount of ['left', 'right']) {
    const def = pipetteByName(cfg.pipettes?.[mount])
    if (!def) continue
    const tipName = cfg.tipRacks?.[mount] && def.tips.includes(cfg.tipRacks[mount]) ? cfg.tipRacks[mount] : def.tips[0]
    pipettes.push({ mount, def, tipName, tipLw: labwareByName(tipName), var: '', tipsNeeded: 0, tipVar: '' })
  }
  if (!pipettes.length) warn('No pipette is loaded — choose one for the left or right mount.')
  // Variable names: by model, and by mount when both mounts carry the same model.
  for (const p of pipettes) {
    const short = p.def.name.replace(/_gen2$/, '').replace(/_single$/, '').replace(/_multi$/, 'm')
    p.var = pipettes.filter(q => q !== p && q.def.name === p.def.name).length ? `${short}_${p.mount}` : short
    p.tipVar = `tips_${p.var}`
    p.nozzles = 8
    p.dryN = 8       // the nozzle layout the tip count is standing on
  }
  const singles = pipettes.filter(p => p.def.channels === 1)
  const multis = pipettes.filter(p => p.def.channels === 8)

  // Volumes a loaded pipette cannot do in one accurate stroke are tallied per
  // liquid rather than reported per well: "32 wells get 22.5–30 µL" is something
  // a person can act on, 32 lines saying it one well at a time is not.
  const tallies = new Map()
  const tally = (reason, what, p, volume) => {
    const k = `${reason}|${what}|${p.var}`
    const t = tallies.get(k) || { reason, what, p, n: 0, lo: Infinity, hi: -Infinity }
    t.n++; t.lo = Math.min(t.lo, volume); t.hi = Math.max(t.hi, volume)
    tallies.set(k, t)
  }
  const choosePipette = (volume, pref, what, { multi = false, noSplit = false } = {}) => {
    const kind = multi ? multis : singles
    const pool = (pref && pref !== 'auto') ? kind.filter(p => p.mount === pref) : kind
    if (!pool.length) {
      if (multi) return null   // callers only ask for an 8-channel when one is loaded
      if (pipettes.length && !singles.length) warn(`${what}: needs a single-channel pipette for wells that are not whole matching columns — an 8-channel cannot address single wells. Load one on the other mount.`)
      else if (pipettes.length) warn(`${what}: no single-channel pipette on the ${pref} mount.`)
      return null
    }
    const fits = pool.filter(p => volume >= p.def.min && volume <= p.def.max).sort((a, b) => a.def.max - b.def.max)
    if (fits.length) return fits[0]
    // Too much for the pipettes below it and too little for the ones above: the
    // largest of the small ones does it in several strokes — slower, still accurate.
    // (transfer() splits any volume above the pipette's maximum by itself; mix()
    // does not, so a caller that cannot split says so and gets no tally.)
    const tooSmall = pool.filter(p => volume > p.def.max).sort((a, b) => b.def.max - a.def.max)
    if (tooSmall.length) { if (!noSplit) tally('split', what, tooSmall[0], volume); return tooSmall[0] }
    const smallest = pool.slice().sort((a, b) => a.def.min - b.def.min)[0]
    tally('low', what, smallest, volume)
    return smallest
  }
  const flushTallies = () => {
    const range = (t) => `${pyNum(t.lo)}${t.lo !== t.hi ? '–' + pyNum(t.hi) : ''} µL`
    const covering = (t) => OT2_PIPETTES.find(p => p.channels === t.p.def.channels && p.gen === 2 && t.lo >= p.min && t.hi <= p.max && !pipettes.some(q => q.def.name === p.name))
    for (const t of tallies.values()) {
      const n = `${t.n} transfer${t.n === 1 ? '' : 's'}`
      const hint = covering(t)
      if (t.reason === 'low') warn(`${t.what}: ${n} of ${range(t)} — below the ${t.p.def.label}'s ${t.p.def.min} µL minimum. Pipetted anyway, but not accurately.${hint ? ` A ${hint.label} covers ${hint.min}–${hint.max} µL.` : ''}`)
      else warn(`${t.what}: ${n} of ${range(t)} — above the ${t.p.def.label}'s ${t.p.def.max} µL maximum, so each is done in several strokes.${hint ? ` A ${hint.label} would do them in one.` : ''}`)
    }
    tallies.clear()
  }

  // ── Deck ──
  const targetOn = cfg.target?.on || 'deck'
  const targetLw = labwareByName(cfg.target?.labware) || labwareByName(defaultTargetLabware(format, targetOn))
  if (!targetLw) warn('No target labware fits this plate format on the chosen location.')
  else if (!targetLw.on.includes(targetOn)) warn(`${targetLw.label} cannot be loaded on the ${targetOn === 'deck' ? 'deck' : OT2_MODULES[targetOn]?.label} — pick a labware from the list for that location.`)

  const demands = plateDemands(plate).map(d => ({ ...d, included: cfg.compounds?.[d.key]?.included !== false, position: cfg.compounds?.[d.key]?.position || '' }))
  const included = demands.filter(d => d.included)

  // A prefilled plate arrives on the robot already pipetted: its stocks stay off
  // the deck (freeing those slots for sample plates and tip racks), and a build
  // step left over from before has nothing to do.
  const prefilled = !!cfg.prefilled
  const allSteps = (cfg.steps || []).filter(s => s && s.type)
  if (prefilled && allSteps.some(s => s.type === 'build')) warn('The plate is filled by hand, so the Build plate step was skipped. Remove it, or untick "already filled" to have the robot build the plate.')
  const steps = prefilled ? allSteps.filter(s => s.type !== 'build') : allSteps
  const stepsOf = (...types) => steps.filter(s => types.includes(s.type))

  // Quench liquids from sampling steps are sources too: they need a tube and a
  // volume like any stock, and are pipetted from the same racks.
  const quenchDemands = new Map()
  const quenchStepCount = (s) => (s.type === 'series' ? Math.max(1, Math.floor(Number(s.count) || 0)) : 1)
  for (const s of stepsOf('sample', 'series')) {
    const qn = String(s.quenchName || '').trim()
    const qv = num(s.quenchUl)
    if (!qn || !(qv > 0)) continue
    const n = parseWellSelection(s.wells, plate).wells.length
    const key = 'quench:' + qn.toLowerCase()
    if (!quenchDemands.has(key)) quenchDemands.set(key, { key, name: qn, code: '', invId: '', stock: null, unit: '', isFill: false, linked: false, isQuench: true, transfers: [], totalUl: 0, included: true, position: cfg.compounds?.[key]?.position || '' })
    quenchDemands.get(key).totalUl += qv * n * quenchStepCount(s)
  }
  // What the robot draws from a tube or trough. A prefilled plate contributes
  // nothing here — only the quench liquids a sampling step pours still need one.
  const sources = prefilled ? [...quenchDemands.values()] : [...included, ...quenchDemands.values()]

  const usesTC = targetOn === 'thermocycler' || stepsOf('thermocycler', 'tc_profile').length > 0
  const usesTemp = targetOn === 'temperature' || stepsOf('temperature').length > 0
  const usesHS = targetOn === 'heater_shaker' || stepsOf('heater_shaker').length > 0
  const usesMag = stepsOf('magnetic').length > 0
  const usesSamples = stepsOf('sample', 'series').length > 0

  // Slot bookkeeping: who sits where, so conflicts are named before the robot names them.
  const occupancy = {}   // slot -> { what, module: bool, h: mm }
  const occupy = (slot, what, meta = {}) => {
    const s = String(slot)
    if (!OT2_SLOTS.includes(s)) { warn(`${what}: slot "${s}" is not an OT-2 deck slot (1–11).`); return }
    if (occupancy[s]) warn(`Deck conflict: slot ${s} holds both ${occupancy[s].what} and ${what}.`)
    occupancy[s] = { what, ...meta }
  }

  if (usesTC) for (const s of TC_SLOTS) occupy(s, 'the Thermocycler', { module: true, moduleType: 'thermocycler', anchor: s === '7', onModule: targetOn === 'thermocycler' ? targetLw : null })
  if (usesTemp) occupy(cfg.deck.temperature, 'the Temperature Module', { module: true, moduleType: 'temperature', onModule: targetOn === 'temperature' ? targetLw : null })
  const hsSlot = usesHS ? String(cfg.deck.heaterShaker) : null
  if (usesHS) {
    occupy(hsSlot, 'the Heater-Shaker', { module: true, moduleType: 'heater_shaker', onModule: targetOn === 'heater_shaker' ? targetLw : null })
    if (hsSlot === '9') warn('The Heater-Shaker cannot go in slot 9 — the fixed trash blocks its locking screw.')
    else if (!OT2_MODULES.heater_shaker.slots.includes(hsSlot)) warn(`Opentrons recommends slots 1, 3, 4, 6, 7 or 10 for the Heater-Shaker on an OT-2 (never 9); slot ${hsSlot} loads, but check the pipette can reach everything around it.`)
  }
  if (usesMag) occupy(cfg.deck.magnetic, 'the Magnetic Module', { module: true, moduleType: 'magnetic' })
  const targetSlot = targetOn === 'deck' ? String(cfg.target.slot || '1') : null
  if (targetSlot) occupy(targetSlot, `the plate "${plate?.name || 'plate'}"`, { lw: targetLw, role: 'plate' })

  // ── What the 8-channel can take over ──
  // A column is one stroke when all eight of its wells get the same liquid at
  // the same volume; a selection is 8-channel work when it is whole columns.
  // Volumes below every 8-channel's minimum stay with the single-channel, which
  // does them accurately.
  const groups = multiGroups(format)
  const mountIsSingle = (pref) => pref !== 'auto' && singles.some(p => p.mount === pref)
  const mountIsMulti = (pref) => pref !== 'auto' && multis.some(p => p.mount === pref)
  const multiCanDo = (vol) => multis.some(p => vol >= p.def.min)
  const buildMultiOn = multis.length > 0 && stepsOf('build').some(s => s.multi !== 'off' && !mountIsSingle(s.pipette))
  for (const d of included) {
    const byT = new Map()
    for (const t of d.transfers) { const w = targetWell(t.well); byT.set(w, round2((byT.get(w) || 0) + t.volume)) }
    d.byTarget = byT
    d.columnGroups = buildMultiOn
      ? groups.filter(g => g.wells.every(w => byT.has(w)) && g.wells.every(w => Math.abs(byT.get(w) - byT.get(g.wells[0])) < MULTI_TOL) && multiCanDo(byT.get(g.wells[0])))
      : []
    d.wantsColumn = d.columnGroups.length > 0
  }

  const wellList = (sel, what) => {
    const { wells, unknown } = parseWellSelection(sel, plate)
    if (unknown.length) warn(`${what}: could not read well${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')} — use ids like A1, a run like A1-A6, or "all".`)
    if (!wells.length) warn(`${what}: no wells selected (and the plate has no filled wells to fall back on).`)
    return wells
  }
  const samplesLw = usesSamples ? (labwareByName(cfg.samplesLabware) || labwareByName('nest_96_wellplate_100ul_pcr_full_skirt')) : null
  // Several sample plates side by side on the deck are filled one after the
  // other, so the run only stops when the last of them is full.
  const sampleSlots = [...new Set((Array.isArray(cfg.sampleSlots) && cfg.sampleSlots.length ? cfg.sampleSlots : ['2']).map(String))]
  const selectionPre = new Map()   // step id -> { wells, groups } for mixing, { wells, plan } for sampling
  const blocking = []              // choices that cannot be honoured: the .py refuses to run
  for (const s of stepsOf('mix')) {
    const wells = wellList(s.wells, 'Mix wells')
    const tw = new Set(wells.map(targetWell))
    let mg = []
    if (multis.length && !mountIsSingle(s.pipette) && s.multi !== 'off') {
      mg = groups.filter(g => g.wells.every(w => tw.has(w)))
      if (mg.length * 8 !== tw.size) mg = []                       // only whole columns, nothing left over
      const vol = num(s.volume)
      if (mg.length && vol > 0 && !multiCanDo(vol)) mg = []
    }
    selectionPre.set(s.id, { wells, groups: mg, nozzles: 8, mirror: null })
  }
  // ── Who takes which wells in a sampling step ──
  // The 8-channel takes every unbroken run down a column it is allowed to (with
  // as many tips as the run is long), the single-channel takes what is left.
  // A pipette the user chose by name is never quietly replaced: when it cannot
  // do the step, the step is blocked and the exported file refuses to run.
  const rangeText = (wells) => {
    if (!wells.length) return ''
    const runs = columnRuns(wells, format)
    return runs.map(r => r.n > 1 ? `${r.wells[0]}–${r.wells[r.n - 1]}` : r.wells[0]).join(', ')
  }
  const planSampling = (s, label, stepNo, wells, tw, mirror) => {
    const vol = num(s.volume) || 0
    const pinned = mountIsMulti(s.pipette) ? 'multi' : mountIsSingle(s.pipette) ? 'single' : null
    const policy = s.multi === 'off' ? 'none' : s.multi === 'auto' ? 'columns' : 'runs'
    const runs = columnRuns([...tw], format)
    const plan = { runs, pinned, policy, blocks: [], notes: [] }
    const block = (code, message, fixes = []) => blocking.push({ stepId: s.id, step: stepNo, label, code, message, fixes })
    const LET_VOLUME = { label: 'Let the volume decide', step: { pipette: 'auto' } }
    // What stands between the 8-channel and this step, if anything.
    const wantsMulti = pinned !== 'single' && multis.length > 0 && policy !== 'none'
    let gate = null
    if (wantsMulti && samplesLw && samplesLw.rows !== 8) gate = {
      code: 'SAMPLE_LW', all: true,
      why: `the 8-channel needs an 8-row sample labware and ${samplesLw.label} is not one`,
      warning: `${label}: the 8-channel needs an 8-row sample labware and ${samplesLw.label} is not one — the single-channel takes these samples.`,
      fixes: [{ label: 'Sample into a 96-well PCR plate', cfg: { samplesLabware: 'nest_96_wellplate_100ul_pcr_full_skirt' } }, LET_VOLUME],
    }
    else if (wantsMulti && vol > 0 && !multiCanDo(vol)) gate = {
      code: 'VOLUME', all: true,
      why: `${pyNum(vol)} µL is below what any loaded 8-channel can pipette`,
      warning: `${label}: ${pyNum(vol)} µL is below what any loaded 8-channel can pipette, so the single-channel takes these samples.`,
      fixes: [{ label: `Sample ${Math.min(...multis.map(p => p.def.min))} µL`, step: { volume: Math.min(...multis.map(p => p.def.min)) } }, LET_VOLUME],
    }
    else if (wantsMulti && policy === 'runs' && !apiAtLeast(cfg.apiLevel, PARTIAL_MIN_API) && runs.some(r => r.kind === 'part')) gate = {
      code: 'API', all: false,
      why: `partial tip pickup needs apiLevel ${PARTIAL_MIN_API} or newer`,
      warning: `${label}: ${runs.find(r => r.kind === 'part').n} wells per column could be taken in one stroke by the 8-channel, but partial tip pickup needs apiLevel ${PARTIAL_MIN_API} or newer. The single-channel takes them one at a time.`,
      fixes: [{ label: `Use apiLevel ${PARTIAL_MIN_API}`, cfg: { apiLevel: PARTIAL_MIN_API } }, LET_VOLUME],
    }
    // Which runs the 8-channel may take. A lone well has nothing for it to grip.
    const canMulti = (r) => {
      if (!wantsMulti || r.kind === 'lone') return false
      if (r.kind === 'part' && policy !== 'runs') return false
      if (gate && (gate.all || r.kind === 'part')) return false
      return true
    }
    const multiRuns = runs.filter(canMulti)
    const leftovers = runs.filter(r => !canMulti(r)).flatMap(r => r.wells)
    // A gate only matters when it actually costs the 8-channel work it could do.
    const gateCost = gate && runs.some(r => r.kind !== 'lone' && (gate.all || r.kind === 'part') && (r.kind === 'whole' || policy === 'runs'))
    if (gateCost) {
      if (pinned === 'multi') block(gate.code, `you chose the ${multis.find(p => p.mount === s.pipette).def.label} (${s.pipette}), but ${gate.why}.`, gate.fixes)
      else warn(gate.warning)
    }
    const multiPip = multiRuns.length ? choosePipette(vol, pinned === 'multi' ? s.pipette : 'auto', `${label} (${pyNum(vol)} µL)`, { multi: true }) : null
    const singlePip = leftovers.length ? choosePipette(vol, pinned === 'single' ? s.pipette : 'auto', `${label} (${pyNum(vol)} µL)`, { multi: false }) : null
    // One block per nozzle count: the robot re-tips between them.
    const byN = new Map()
    for (const r of multiRuns) {
      if (!byN.has(r.n)) byN.set(r.n, [])
      byN.get(r.n).push({ address: r.address, wells: r.wells })
    }
    for (const [n, strokes] of [...byN.entries()].sort((a, b) => b[0] - a[0])) {
      plan.blocks.push({ key: `${multiPip?.var || 'multi'}_${n}`, kind: 'multi', n, pip: multiPip, strokes })
    }
    if (leftovers.length) plan.blocks.push({ key: singlePip?.var || 'single', kind: 'single', n: 1, pip: singlePip, strokes: leftovers.map(w => ({ address: w, wells: [w] })) })
    plan.multiBlocks = plan.blocks.filter(b => b.kind === 'multi').length
    // A chosen pipette that ends up with nothing to do, and leftovers it cannot take.
    if (pinned === 'multi' && !plan.multiBlocks && !gateCost && tw.size) {
      const why = policy === 'none' ? 'its 8-channel setting is off'
        : policy === 'columns' && runs.some(r => r.kind === 'part') ? `it is set to whole columns only and ${rangeText(runs.filter(r => r.kind === 'part').flatMap(r => r.wells))} ${runs.filter(r => r.kind === 'part').length === 1 ? 'is a part-column' : 'are part-columns'}`
        : runs.every(r => r.kind === 'lone') ? `every well you chose stands on its own in its column, and its nozzles sit one under the other down a column`
        : 'it has nothing it can take'
      block('NOTHING_FOR_MULTI', `you chose the ${multis.find(p => p.mount === s.pipette).def.label} (${s.pipette}), but ${why}.`,
        [...(policy === 'columns' ? [{ label: 'Allow part-columns', step: { multi: 'partial' } }] : []), ...(policy === 'none' ? [{ label: 'Turn the 8-channel on', step: { multi: 'partial' } }] : []), LET_VOLUME])
    }
    if (leftovers.length && !singlePip) block('NO_PIPETTE', `${rangeText(leftovers)} cannot be reached by an 8-channel and no single-channel pipette is loaded.`,
      [{ label: `Leave ${rangeText(leftovers)} out`, dropWells: leftovers }])
    else if (pinned === 'multi' && leftovers.length && plan.multiBlocks) {
      warn(`${label}: you chose the ${multis.find(p => p.mount === s.pipette).def.label} (${s.pipette}), but ${rangeText(leftovers)} ${leftovers.length === 1 ? 'stands' : 'stand'} where its nozzles cannot reach — the ${singlePip.def.label} takes ${leftovers.length === 1 ? 'it' : 'them'} one at a time.`)
    }
    plan.shape = mirror
    return plan
  }
  // A step samples one set of wells, or several groups each with their own
  // destination — a row of the plate into one sample plate, another row into
  // the next. One group is the ordinary case and keeps the shorter Python.
  const groupsOf = (s) => (Array.isArray(s.groups) && s.groups.length
    ? s.groups.map((g, i) => ({ no: i + 1, wells: g.wells, plate: String(g.plate || 'auto'), start: String(g.start || ''), layout: g.layout || s.layout }))
    : [{ no: 1, wells: s.wells, plate: String(s.plate || 'auto'), start: String(s.start || ''), layout: s.layout }])
  let stepNo = 0
  for (const s of steps) {
    stepNo++
    if (s.type !== 'sample' && s.type !== 'series') continue
    const label = s.type === 'series' ? 'Sampling series' : 'Take samples'
    const units = []
    const seen = new Map()
    for (const g of groupsOf(s)) {
      const many = groupsOf(s).length > 1
      const what = many ? `${label}, group ${g.no}` : label
      const wells = wellList(g.wells, what)
      const tw = new Set(wells.map(targetWell))
      for (const w of tw) {
        if (seen.has(w)) warn(`${label}: ${w} is in group ${seen.get(w)} and group ${g.no} — a well can only be sampled once per time point, so group ${g.no} takes it.`)
        seen.set(w, g.no)
      }
      // How a time point is laid out: the next free wells, the plate's own
      // layout (time points across columns), or one row band per time point.
      let shape = null
      if (samplesLw && tw.size && (g.layout === 'mirror' || g.layout === 'rows')) {
        const m = g.layout === 'rows' ? rowsLayout([...tw], samplesLw) : mirrorLayout([...tw], samplesLw)
        if (m.problem) warn(`${what}: the sample labware cannot keep ${g.layout === 'rows' ? 'one row band per time point' : 'the plate layout'} — ${m.problem}. The samples go into the next free wells instead.`)
        else shape = m
      }
      if (g.plate !== 'auto' && !sampleSlots.includes(g.plate)) {
        blocking.push({ stepId: s.id, step: stepNo, label, code: 'PLATE_RANGE',
          message: `${many ? `group ${g.no} is` : 'the samples are'} set to go into slot ${g.plate}, and no sample plate is there.`,
          fixes: [{ label: 'Next free plate', step: many ? {} : { plate: 'auto' } }] })
      }
      if (g.start && samplesLw && !wellNamesOf(samplesLw).includes(g.start.toUpperCase())) {
        blocking.push({ stepId: s.id, step: stepNo, label, code: 'START_RANGE',
          message: `${many ? `group ${g.no} is` : 'the samples are'} set to start at ${g.start}, which is not a well of the ${samplesLw.label}.`,
          fixes: [{ label: 'Start at the next free well', step: many ? {} : { start: '' } }] })
      }
      const plan = planSampling(s, what, stepNo, wells, tw, shape)
      units.push({ ...g, wells, tw, plan, shape, label: what })
    }
    selectionPre.set(s.id, { units, wells: units.flatMap(u => u.wells) })
    const qn = String(s.quenchName || '').trim()
    const q = qn ? quenchDemands.get('quench:' + qn.toLowerCase()) : null
    // Only a step the 8-channel does from end to end can be quenched by it.
    if (q && units.every(u => u.plan.multiBlocks && !u.plan.blocks.some(b => b.kind === 'single'))) q.wantsColumn = true
  }

  // Sources: which rack, which well. Manual positions first, then auto-fill;
  // a liquid the 8-channel will use goes to the reservoir when it has room.
  const stocksLw = labwareByName(cfg.stocksLabware) || labwareByName('opentrons_24_tuberack_nest_1.5ml_snapcap')
  const bulkLw = labwareByName(cfg.bulkLabware) || labwareByName('opentrons_15_tuberack_falcon_15ml_conical')
  const columnLw = labwareByName(cfg.columnLabware) || labwareByName('nest_12_reservoir_15ml')
  const racks = { stocks:    { lw: stocksLw, var: 'stocks',    slot: String(cfg.deck.stocks || '4'), used: new Set(), any: false, positions: wellNamesOf(stocksLw), label: 'the stock rack' },
                 bulk:      { lw: bulkLw,   var: 'bulk',      slot: String(cfg.deck.bulk || '5'),   used: new Set(), any: false, positions: wellNamesOf(bulkLw), label: 'the bulk-liquid rack' },
                 reservoir: { lw: columnLw, var: 'reservoir', slot: String(cfg.deck.column || '6'), used: new Set(), any: false, positions: columnPositions(columnLw), label: 'the 8-channel reservoir' } }
  // One reservoir position is a trough, or a whole column of an 8-row labware.
  const rackCapacity = (r) => r.var === 'reservoir' ? r.lw.maxUl * columnWells(r.lw, r.positions[0]).length : r.lw.maxUl
  for (const d of sources) {
    d.loadUl = loadVolume(d.totalUl, cfg.headroomPct)
    const m = /^(stocks|bulk|reservoir):([A-P]\d{1,2})$/i.exec(String(d.position || '').trim())
    if (m) {
      const rack = racks[m[1].toLowerCase()]
      const well = m[2].toUpperCase()
      if (!rack.positions.includes(well)) warn(`${d.name}: ${rack.lw.label} has no position ${well}.`)
      else if (rack.used.has(well)) warn(`${d.name}: ${rack.var} ${well} is already taken by another stock.`)
      else { rack.used.add(well); d.rack = rack.var; d.well = well }
    }
  }
  for (const d of sources) {
    if (d.rack) continue
    const tubes = d.loadUl > stocksLw.maxUl ? ['bulk', 'stocks'] : ['stocks', 'bulk']
    const order = d.wantsColumn ? ['reservoir', ...tubes] : tubes
    for (const r of order) {
      const rack = racks[r]
      const free = rack.positions.find(w => !rack.used.has(w))
      if (free) { rack.used.add(free); d.rack = r; d.well = free; break }
    }
    if (!d.rack) warn(`${d.name}: no free position left in the stock or bulk labware — choose racks with more positions.`)
    else if (d.wantsColumn && d.rack !== 'reservoir') warn(`${d.name}: no free position in the 8-channel reservoir, so the single-channel pipettes it well by well.`)
  }
  for (const d of sources) {
    if (!d.rack) continue
    racks[d.rack].any = true
    d.capacityUl = rackCapacity(racks[d.rack])
    d.overCapacity = d.loadUl > d.capacityUl
    // Eight tips can only dip into the reservoir; anywhere else is single-channel work.
    if (d.rack !== 'reservoir') d.columnGroups = []
    d.useMulti = d.rack === 'reservoir'
    if (d.overCapacity) warn(`${d.name} needs about ${fmtUl(d.loadUl)} but one ${racks[d.rack].lw.label} position holds ${fmtUl(d.capacityUl)} — put it in the bulk labware, or choose a larger one.`)
  }
  for (const r of Object.values(racks)) if (r.any) occupy(r.slot, r.label, { lw: r.lw, role: r.var })
  if (samplesLw) sampleSlots.forEach((slot, i) => occupy(slot, sampleSlots.length > 1 ? `sample plate ${i + 1} of ${sampleSlots.length}` : 'the sample labware', { lw: samplesLw, role: 'samples' }))

  // What the Heater-Shaker's neighbours may be — the robot refuses the rest at load time.
  if (usesHS) {
    for (const s of adjacentSlots(hsSlot)) {
      const o = occupancy[s]
      if (o?.module) warn(`Deck conflict: ${o.what} in slot ${s} is next to the Heater-Shaker in slot ${hsSlot} — no other module may be adjacent to it.`)
    }
    for (const s of adjacentSlots(hsSlot, { xOnly: true })) {
      const o = occupancy[s]
      if (o && !o.module && tooTallBesideHS(o.lw)) warn(`Deck conflict: ${o.what} in slot ${s} is ${Math.round(o.lw.h)} mm tall — nothing over ${HS_MAX_ADJACENT_HEIGHT_MM} mm may sit left or right of the Heater-Shaker (slot ${hsSlot}).`)
    }
  }

  // ── Steps: dry run to count tips and sample wells ──
  // Tips are counted in pickups: an 8-channel takes a whole column of tips each
  // time, and a volume above the pipette's maximum is several strokes — with a
  // new tip per well, transfer() takes a fresh tip for every stroke.
  const tipCount = (p, n) => { if (p) p.tipsNeeded += n }
  const strokes = (p, vol) => Math.max(1, Math.ceil((Number(vol) || 0) / p.def.max - 1e-9))
  const tipsFor = (p, transfers, always) => always ? transfers.reduce((a, t) => a + strokes(p, t.volume), 0) : 1

  // Build: whole matching columns go to the 8-channel; everything left is split
  // by the single-channel that handles each volume.
  const buildPlans = []   // per build step: [{ src, pip, multi, transfers: [{ target, volume, wells }] }]
  for (const s of stepsOf('build')) {
    const plan = []
    const stepMulti = s.multi !== 'off' && !mountIsSingle(s.pipette)
    const prefSingle = mountIsMulti(s.pipette) ? 'auto' : s.pipette
    let columns = 0
    for (const d of included) {
      if (!d.rack) continue
      const covered = new Set()
      if (stepMulti && d.useMulti && d.columnGroups.length) {
        const byPip = new Map()
        for (const g of d.columnGroups) {
          const vol = d.byTarget.get(g.wells[0])
          const p = choosePipette(vol, s.pipette, d.name, { multi: true })
          if (!p) continue
          if (!byPip.has(p)) byPip.set(p, [])
          byPip.get(p).push({ target: g.address, volume: vol, wells: g.wells.length })
          g.wells.forEach(w => covered.add(w))
        }
        for (const [p, transfers] of byPip) {
          plan.push({ src: d, pip: p, multi: true, transfers })
          columns += transfers.length
          tipCount(p, tipsFor(p, transfers, s.newTip === 'always' && s.mode !== 'distribute'))
        }
      }
      const byPip = new Map()
      for (const t of d.transfers) {
        if (covered.has(targetWell(t.well))) continue
        const p = choosePipette(t.volume, prefSingle, d.name)
        if (!p) continue
        if (!byPip.has(p)) byPip.set(p, [])
        byPip.get(p).push({ target: targetWell(t.well), volume: t.volume, wells: 1 })
      }
      for (const [p, transfers] of byPip) {
        plan.push({ src: d, pip: p, multi: false, transfers })
        tipCount(p, tipsFor(p, transfers, s.newTip === 'always' && s.mode !== 'distribute'))
      }
    }
    if (!plan.length) warn('Build plate: nothing to pipette — the plate has no included stocks with volumes.')
    // Reservoirs refuse touch_tip outright (a labware quirk the robot enforces).
    if (s.touchTip && plan.some(b => racks[b.src.rack].lw.kind === 'reservoir')) warn('Build plate: touch tip is not allowed on reservoirs — the robot refuses it. Untick touch tip, or keep those liquids in tube racks.')
    plan.columns = columns
    buildPlans.push(plan)
  }

  // Sampling: destinations are handed out column by column, continuing across
  // steps and across sample plates. 8-channel sampling starts on a fresh column.
  let sampleCursor = 0
  let sampleLoadIdx = 0, sampleSwaps = 0
  let sampleFilled = 0             // wells that actually receive a sample (the plate layout leaves some empty)
  const sampleWellNames = samplesLw ? wellNamesOf(samplesLw) : []
  const usedCells = new Map()      // deck load -> the sample wells already spoken for
  const geometryFailed = new Set()
  const samplePlans = new Map()
  // Which sample plates are spoken for: a group with a plate of its own keeps it
  // for the whole run, and a group set to "next free plate" uses the rest.
  const claimedSlots = new Set()
  let usesGroups = false
  for (const s of stepsOf('sample', 'series')) for (const u of selectionPre.get(s.id).units) {
    if (u.plate !== 'auto') { claimedSlots.add(u.plate); usesGroups = true }
    if (u.start || u.layout === 'rows') usesGroups = true
    if (selectionPre.get(s.id).units.length > 1) usesGroups = true
  }
  const capacityAll = samplesLw ? samplesLw.rows * samplesLw.cols : 0
  const rowsN = samplesLw ? samplesLw.rows : 8
  const colsN = samplesLw ? samplesLw.cols : 12
  const autoPlates = sampleSlots.map((_, i) => i).filter(i => !claimedSlots.has(sampleSlots[i]))
  const plateUsed = sampleSlots.map(() => new Set())     // cells already spoken for, per plate
  const plateLoads = sampleSlots.map(() => 0)            // fresh plates put in each slot so far
  const swapsAt = new Map()                              // step id -> Map(time point -> [plate index])
  for (const s of stepsOf('sample', 'series')) {
    const label = s.type === 'series' ? 'Sampling series' : 'Take samples'
    const pre = selectionPre.get(s.id)
    const units = pre.units
    const vol = num(s.volume) || 0
    if (!(vol > 0)) warn(`${label}: sample volume must be a positive number of µL.`)
    const count = s.type === 'series' ? Math.max(1, Math.floor(Number(s.count) || 0)) : 1
    const capacity = capacityAll
    const deckCapacity = capacity * sampleSlots.length
    if (samplesLw && vol > samplesLw.maxUl) warn(`${label}: ${pyNum(vol)} µL exceeds a ${samplesLw.label} well (${samplesLw.maxUl} µL).`)
    // ── The shape one time point makes in a sample plate ──
    for (const u of units) {
      const blocks = u.plan.blocks.filter(b => b.pip)
      u.blocks = blocks
      const ordered = blocks.flatMap(b => b.strokes.map(st => ({ b, st })))
      u.ordered = ordered
      if (u.shape) {
        // The plate's own layout, or one row band per time point: a stroke keeps
        // its rows, so its offsets from the shape's corner never change.
        for (const { st } of ordered) {
          st.fill = st.wells.map(w => { const c = u.shape.cellOf(w); return c.dc * rowsN + c.dr }).sort((a, b) => a - b)
          const a = u.shape.cellOf(st.address)
          st.addressOffset = a.dc * rowsN + a.dr
        }
        u.width = u.shape.width
        u.height = u.shape.height
        u.step = u.shape.kind === 'rows' ? 1 : rowsN          // a row band, or a whole column
        u.reserveOf = (c) => {
          const c0 = Math.floor(c / rowsN), r0 = c % rowsN, cells = []
          for (let dc = 0; dc < u.width; dc++) for (let dr = 0; dr < u.height; dr++) cells.push((c0 + dc) * rowsN + r0 + dr)
          return cells
        }
        u.validAt = (c) => Math.floor(c / rowsN) + u.width <= colsN && (c % rowsN) + u.height <= rowsN
        u.advance = (c) => u.shape.kind === 'rows' ? c + u.height : c + u.width * rowsN
        u.extent = u.width * u.height
      } else {
        const fp = packFootprint(ordered.map(({ b, st }) => ({ n: st.wells.length, multi: b.kind === 'multi' })), rowsN)
        ordered.forEach(({ st }, i) => { st.addressOffset = fp.placements[i].addressOffset; st.fill = fp.placements[i].fill })
        u.extent = fp.extent
        u.step = footprintAlign(fp.placements, rowsN)
        u.reserveOf = (c) => Array.from({ length: u.extent }, (_, k) => c + k)
        u.validAt = (c) => c + u.extent <= capacity && fp.placements.every(pp => Math.floor((c + pp.fill[0]) / rowsN) === Math.floor((c + pp.fill[pp.fill.length - 1]) / rowsN))
        u.advance = (c) => c + u.extent
      }
      u.fillOffsets = ordered.flatMap(({ st }) => st.fill).sort((a, b) => a - b)
      u.filled = ordered.reduce((a, { st }) => a + st.wells.length, 0)
      u.plateIdx = -1
      u.cursor = 0
      u.points = []
      if (deckCapacity && u.extent > deckCapacity) warn(`${u.label}: one time point needs ${u.extent} sample wells but the ${sampleSlots.length > 1 ? `${sampleSlots.length} × ` : ''}${samplesLw.label} on the deck hold ${deckCapacity} — sample fewer wells, add a sample plate, or split the step in two.`)
    }
    const starts = [], fresh = new Set()
    const swaps = new Map()
    if (!usesGroups) {
      // One group taking the next free wells: the cursor runs across every plate
      // on the deck, exactly as it always has.
      const u = units[0]
      let abs = sampleCursor
      for (let i = 0; i < count; i++) {
        abs = Math.ceil(abs / u.step) * u.step
        if (u.shape && (abs % capacity) + u.extent > capacity) abs = Math.ceil(abs / capacity) * capacity
        if (deckCapacity && u.extent <= deckCapacity && (abs % deckCapacity) + u.extent > deckCapacity) abs = Math.ceil(abs / deckCapacity) * deckCapacity
        const loadIdx = deckCapacity ? Math.floor(abs / deckCapacity) : 0
        if (loadIdx > sampleLoadIdx) { fresh.add(i); sampleLoadIdx = loadIdx }
        const local = deckCapacity ? abs % deckCapacity : abs
        starts.push(local)
        u.points.push({ i, abs: local, plateIdx: capacity ? Math.floor(local / capacity) : 0, load: fresh.size })
        abs += u.extent
      }
      sampleCursor = abs
      sampleSwaps += fresh.size
    } else {
      // Groups: every plate keeps its own record of what is taken, so a group can
      // have a plate to itself or share one, and only the plate that fills up is
      // swapped. A whole time point is placed at once — a swap in the middle of
      // one would otherwise forget the groups already placed on that plate.
      for (let i = 0; i < count; i++) {
        const attempt = (clear) => {
          const scratch = plateUsed.map((set, pi) => clear.includes(pi) ? new Set() : new Set(set))
          const placed = []
          for (const u of units) {
            const allowed = u.plate !== 'auto' ? [sampleSlots.indexOf(u.plate)] : autoPlates
            let got = null
            for (const pi of allowed) {
              if (pi < 0) continue
              const pinned = i === 0 && u.start ? sampleWellNames.indexOf(u.start.toUpperCase()) : -1
              const from = pinned >= 0 ? pinned : (u.plateIdx === pi && !clear.includes(pi) ? u.cursor : 0)
              for (let c = pinned >= 0 ? pinned : Math.ceil(from / u.step) * u.step; c < capacity; c += u.step) {
                if (!u.validAt(c)) { if (pinned >= 0) break; continue }
                const cells = u.reserveOf(c)
                if (cells.some(x => scratch[pi].has(x))) { if (pinned >= 0) break; continue }
                got = { pi, c, cells }
                break
              }
              if (got) break
            }
            if (!got) return { fail: u }
            got.cells.forEach(x => scratch[got.pi].add(x))
            placed.push({ u, ...got })
          }
          return { placed, scratch }
        }
        let r = attempt([])
        if (r.fail) {
          const need = r.fail.plate !== 'auto' ? [sampleSlots.indexOf(r.fail.plate)] : autoPlates
          const before = r.fail
          r = attempt(need)
          if (r.fail) {
            blocking.push({ stepId: s.id, step: steps.indexOf(s) + 1, label, code: 'GROUP_FIT',
              message: `${before.label.replace(label + ', ', '')} needs ${before.extent} sample wells laid out as asked, and they do not fit an empty ${samplesLw ? samplesLw.label : 'sample plate'}${units.length > 1 ? ' beside the other groups' : ''}.`,
              fixes: [{ label: 'Next free wells', step: { layout: 'packed' } }] })
            break
          }
          swaps.set(i, need)
          for (const pi of need) { plateUsed[pi] = new Set(); plateLoads[pi]++; for (const st of stepsOf('sample', 'series')) for (const uu of selectionPre.get(st.id).units) if (uu.plateIdx === pi) uu.cursor = 0 }
          sampleSwaps++
        }
        r.scratch.forEach((set, pi) => { plateUsed[pi] = set })
        for (const { u, pi, c } of r.placed) {
          u.plateIdx = pi
          u.cursor = u.advance(c)
          u.points.push({ i, abs: pi * capacity + c, plateIdx: pi, load: plateLoads[pi] })
        }
        starts.push(r.placed[0] ? r.placed[0].pi * capacity + r.placed[0].c : 0)
      }
      swapsAt.set(s.id, swaps)
      sampleCursor = Math.max(sampleCursor, ...plateUsed.flatMap((set, pi) => set.size ? [pi * capacity + Math.max(...set) + 1] : [0]))
    }
    // The last guard before any Python is written: a stroke whose tipped nozzles
    // would hang over the top of a sample column, or two samples in one well,
    // are things the Opentrons App's own analysis does NOT catch.
    const seenCells = new Map()
    for (const u of units) for (const pt of u.points) for (const { b, st } of u.ordered) {
      const first = pt.abs + st.fill[0], last = pt.abs + st.fill[st.fill.length - 1], addr = pt.abs + st.addressOffset
      const key = `${pt.load || 0}:${first}`
      const bad = Math.floor(first / rowsN) !== Math.floor(last / rowsN) ? 'a stroke would cross the foot of a sample column'
        : b.kind === 'multi' && b.n < 8 && addr % rowsN < b.n - 1 ? `a stroke of ${b.n} addressed at ${sampleWellNames[addr % capacity]} would hold its top nozzles over the edge of the plate`
        : b.kind === 'multi' && b.n === 8 && addr % rowsN !== 0 ? 'a whole-column stroke must be addressed by an A-row well'
        : seenCells.has(key) ? `sample well ${sampleWellNames[first % capacity]} would be used twice`
        : null
      seenCells.set(key, true)
      if (bad && !geometryFailed.has(s.id)) {
        geometryFailed.add(s.id)
        blocking.push({ stepId: s.id, step: steps.indexOf(s) + 1, label, code: 'GEOMETRY',
          message: `the samples cannot be laid out as asked — ${bad}. Please report this, and use "next free wells" meanwhile.`,
          fixes: [{ label: 'Next free wells', step: { layout: 'packed' } }] })
      }
    }
    const qv = num(s.quenchUl), qn = String(s.quenchName || '').trim()
    const quench = qn && qv > 0 ? quenchDemands.get('quench:' + qn.toLowerCase()) : null
    const allBlocks = units.flatMap(u => u.blocks)
    // The 8-channel can only pour the quench when it does every well itself.
    const qMulti = !!(quench?.useMulti && allBlocks.length > 0 && allBlocks.every(b => b.kind === 'multi'))
    const qp = quench ? choosePipette(qv, 'auto', `${label}: quench "${qn}"`, { multi: qMulti }) : null
    // Tips: an 8-channel spends a whole column of its rack per pickup, so a
    // stroke of n costs 1/floor(8/n) of a column. Changing the nozzle layout
    // abandons what is left of the current column (verified in simulation), so
    // the count is rounded up before every change.
    const multiBlocks = allBlocks.filter(b => b.kind === 'multi')
    const inLoop = new Set(multiBlocks.map(b => `${b.pip.var}:${b.n}`)).size > 1
    multiBlocks.forEach((b, i) => { b.configure = inLoop ? multiBlocks[(i - 1 + multiBlocks.length) % multiBlocks.length].n !== b.n : true })
    for (const b of allBlocks) {
      b.perCol = b.kind === 'multi' ? Math.floor(8 / b.n) : 1
      b.pickups = s.newTip === 'once' ? 1 : b.strokes.length * strokes(b.pip, vol)
      b.tipsPerPoint = b.pickups / b.perCol
    }
    for (let i = 0; i < count; i++) {
      for (const u of units) {
        for (const b of u.blocks) {
          if (b.kind === 'multi' && (inLoop ? b.configure : i === 0) && b.pip.dryN !== b.n) { b.pip.tipsNeeded = Math.ceil(b.pip.tipsNeeded - 1e-9); b.pip.dryN = b.n }
          if (quench && qp && qMulti && b.kind === 'multi') tipCount(qp, 1 / b.perCol)
          tipCount(b.pip, b.tipsPerPoint)
        }
        // A quench poured by a single-channel visits every well this group fills.
        if (quench && qp && !qMulti && u.blocks.length) tipCount(qp, 1)
      }
    }
    if (s.type === 'series') {
      const iv = num(s.intervalMinutes)
      if (!(iv > 0)) warn('Sampling series: the interval must be a positive number of minutes.')
    }
    const pauseEvery = s.type === 'series' ? Math.max(0, Math.floor(Number(s.pauseEvery) || 0)) : 0
    sampleFilled += count * units.reduce((a, u) => a + u.filled, 0)
    // One group with one block keeps the shorter Python it has always had.
    const only = units.length === 1 && units[0].blocks.length === 1 ? units[0].blocks[0] : null
    const form = !only ? 'blocks'
      : units[0].shape ? 'offsets'
      : only.kind === 'single' ? 'slice'
      : only.n === 8 ? 'cols'
      : 8 % only.n === 0 ? 'stride'
      : 'offsets'
    samplePlans.set(s.id, {
      units, blocks: allBlocks, form, multi: multiBlocks.length > 0, inLoop, usesGroups,
      vol, count, start: starts[0] ?? 0, starts, fresh, swaps, capacity, extent: units[0]?.extent || 0,
      mirror: units.length === 1 ? units[0].shape : null, wells: pre.wells,
      quench, qp, qv, qMulti, pauseEvery, filledPerPoint: units.reduce((a, u) => a + u.filled, 0),
      pauseMessage: oneLine(s.pauseMessage || 'Scheduled check — do what is needed, then resume'),
      points: [],
    })
  }
  for (const s of stepsOf('mix')) {
    const pre = selectionPre.get(s.id)
    const multi = pre.groups.length > 0
    const units = multi ? pre.groups.map(g => g.address) : pre.wells.map(targetWell)
    const vol = num(s.volume)
    const pref = multi ? s.pipette : (mountIsMulti(s.pipette) ? 'auto' : s.pipette)
    const p = choosePipette(vol > 0 ? vol : (Number(plate?.targetVolume) || 20) / 2, pref, 'Mix wells', { multi, noSplit: true })
    // mix() aspirates the whole volume in one stroke, so it is capped at what the tip holds.
    if (p && vol > p.def.max) warn(`Mix wells: ${pyNum(vol)} µL is more than the ${p.def.label} can hold — mixing with ${p.def.max} µL instead.`)
    tipCount(p, s.newTip === 'once' ? 1 : units.length)
    samplePlans.set(s.id, { wells: pre.wells, units, multi, vol: p ? Math.min(vol, p.def.max) : vol, pip: p })
  }
  flushTallies()
  const partialPlans = [...samplePlans.values()].filter(pl => (pl.blocks || []).some(b => b.kind === 'multi' && b.n < 8))
  const usesPartial = partialPlans.length > 0
  // Every slot a partly tipped pipette reaches into. Whatever sits behind one of
  // these has to be short, so tip racks must keep out of those slots.
  const targetPlateSlot = targetOn === 'deck' ? targetSlot : targetOn === 'thermocycler' ? '7' : targetOn === 'temperature' ? String(cfg.deck.temperature) : String(cfg.deck.heaterShaker)
  const partialPipettes = new Set(partialPlans.flatMap(pl => [...pl.blocks.filter(b => b.kind === 'multi' && b.n < 8).map(b => b.pip), pl.qMulti ? pl.qp : null]).filter(Boolean))
  const partialReach = new Set()
  if (usesPartial) {
    partialReach.add(targetPlateSlot)
    for (const s of sampleSlots) partialReach.add(s)
    for (const pl of partialPlans) if (pl.qMulti && pl.quench?.rack) partialReach.add(racks[pl.quench.rack].slot)
  }
  const rearOfReach = new Set([...partialReach].map(slotBehind).filter(Boolean))
  // What occupies the slot behind `s` — the fixed trash is always in slot 12.
  const behindEntry = (b) => b === TRASH_SLOT ? { what: 'the fixed trash', fixedTrash: true } : occupancy[b]

  // ── Tip racks: as many as the count needs, in the free slots ──
  // Slots beside the Heater-Shaker come last (and never left/right of it for a
  // rack taller than it allows); the racks are all taller than a plate.
  const hsNeighbours = usesHS ? adjacentSlots(hsSlot) : []
  const hsSides = usesHS ? adjacentSlots(hsSlot, { xOnly: true }) : []
  const freeSlots = (lw, p, allowBlocked = false) => {
    let free = TIP_SLOT_ORDER.filter(s => !occupancy[s] && !(tooTallBesideHS(lw) && hsSides.includes(s))
      // A rack is tall: it must not land behind anything a partial stroke reaches.
      && !(tooTallBehindPartial(lw) && rearOfReach.has(s)))
    // A rack the partial pipette itself visits needs a clear slot behind it too —
    // a module or the trash there is as much of an obstacle as tall labware. This
    // is a hard filter: one rack fewer only costs a refill pause, whereas a rack
    // in a blocked slot fails the run outright when the pipette reaches for it.
    if (p && partialPipettes.has(p) && !allowBlocked) {
      free = free.filter(s => { const b = slotBehind(s); return !b || !blocksPartialBehind(behindEntry(b), null) })
    }
    return [...free.filter(s => !hsNeighbours.includes(s)), ...free.filter(s => hsNeighbours.includes(s))]
  }
  const takeRack = (p, { allowBlocked = false } = {}) => {
    const slot = freeSlots(p.tipLw, p, allowBlocked)[0]
    if (!slot) return false
    occupancy[slot] = { what: `${p.tipLw?.label || p.tipName} (${p.var})`, lw: p.tipLw, role: 'tips', pipette: p.var }
    p.tipSlots.push(slot)
    // The partial pipette now reaches into this slot as well, so whatever sits
    // behind it must stay short — no later rack may take that place.
    if (partialPipettes.has(p)) { const b = slotBehind(slot); if (b) rearOfReach.add(b) }
    return true
  }
  const racksNeeded = (p) => p.tipsNeeded > 0 ? Math.ceil(p.tipsNeeded / p.perRack) : 0   // none for a pipette that never picks up a tip
  for (const p of pipettes) {
    p.perRack = p.def.channels === 8 ? 12 : 96     // an 8-channel empties a rack in 12 pickups
    p.tipSlots = []
    for (let i = 0; i < racksNeeded(p); i++) if (!takeRack(p)) break
    // A pipette with no rack at all cannot pick up a single tip, so for that one
    // case a flagged slot still beats nothing.
    if (!p.tipSlots.length && p.tipsNeeded > 0) takeRack(p, { allowBlocked: true })
  }
  // A pipette left without any rack would stop the run at its first pickup,
  // whereas one rack fewer for another pipette only means one more refill pause:
  // hand over a rack from the pipette that has the most.
  for (const needy of pipettes.filter(p => p.tipsNeeded > 0 && !p.tipSlots.length)) {
    const donor = [...pipettes].filter(p => p.tipSlots.length > 1).sort((a, b) => b.tipSlots.length - a.tipSlots.length)[0]
    if (!donor) continue
    delete occupancy[donor.tipSlots.pop()]
    takeRack(needy)
  }
  for (const p of pipettes) {
    p.tipCapacity = p.tipSlots.length * p.perRack
    const need = racksNeeded(p)
    if (p.tipSlots.length >= need) continue
    const unit = p.def.channels === 8 ? 'tip columns' : 'tips'
    if (!p.tipSlots.length) warn(`No slot is free for a tip rack of the ${p.def.label}, which needs ${Math.ceil(p.tipsNeeded)} ${unit} — the run would stop at its first pickup. Free a slot: a smaller sample labware, fewer sources, or one pipette for everything.`)
    else warn(`${p.def.label} needs ${Math.ceil(p.tipsNeeded)} ${unit} (${need} racks) but only ${p.tipSlots.length} rack${p.tipSlots.length === 1 ? '' : 's'} fit on the deck — the run will pause ${Math.ceil(p.tipsNeeded / p.tipCapacity) - 1}× for you to refill them. "One tip per stock" needs far fewer.`)
  }
  // However the racks landed, name every rear-slot clash the robot would refuse.
  if (usesPartial) {
    const reach = new Set(partialReach)
    for (const pl of partialPlans) {
      for (const s of pl.blocks.flatMap(b => b.pip?.tipSlots || [])) reach.add(s)
      if (pl.qMulti) for (const s of pl.qp?.tipSlots || []) reach.add(s)
    }
    for (const s of [...reach].sort((a, b) => Number(a) - Number(b))) {
      const b = slotBehind(s)
      const o = b ? behindEntry(b) : null
      if (!blocksPartialBehind(o, occupancy[s])) continue
      const fix = `Move what is in slot ${s} to a slot with nothing, or nothing over ${PARTIAL_REAR_MAX_HEIGHT_MM} mm, behind it — or set this step's 8-channel to "whole columns only".`
      // The trash is the one obstacle the robot's own analysis misses, so the
      // file uploads clean and only fails once the run reaches that slot.
      if (o.fixedTrash) warn(`Partial tip pickup: the fixed trash stands behind slot ${s}, and a partly tipped 8-channel fouls it reaching in there. The Opentrons App does NOT catch this — the trash is not deck labware, so the protocol analyses cleanly and then fails mid-run. ${fix}`)
      else warn(`Partial tip pickup: ${o.module ? `${o.what} in slot ${b}` : `${o.what} in slot ${b} is ${Math.round(o.lw.h)} mm tall and`} sits behind slot ${s}, which the 8-channel reaches into with only some of its nozzles tipped — the robot refuses that move (PartialTipMovementNotAllowedError). ${fix}`)
    }
  }

  // When any pipette will run dry, the protocol keeps its own count and pauses
  // for a refill just before the step that would fail.
  const needRefill = pipettes.some(p => p.tipsNeeded > p.tipCapacity)
  const tipCall = (p, n, indent = '') => { if (needRefill && p && p.tipCapacity && n > 0) emit(`${indent}need_tips(${p.var}, ${n})`) }

  // ── The run as a list of actions, for the dialog's preview ──
  // One record per atomic thing the robot does, in execution order, with the
  // wells it touches, the tips it spends, a rough duration, and the module state
  // after it. It is built by the same walk that writes the Python, so the two
  // cannot disagree; a series is expanded into its time points, and the tip
  // refills land exactly where need_tips() will pause.
  const actions = []
  let clock = 0
  let curStep = null, curN = 0
  const previewTips = Object.fromEntries(pipettes.map(p => [p.var, p.tipCapacity]))
  const mod = { tcBlock: null, tcLidTemp: null, temp: null, hsTemp: null, mag: 'down' }
  const plateSlot = targetOn === 'deck' ? targetSlot : targetOn === 'thermocycler' ? '7' : targetOn === 'temperature' ? String(cfg.deck.temperature) : String(cfg.deck.heaterShaker)
  const sampleNames = samplesLw ? wellNamesOf(samplesLw) : []
  const groupWells = (address) => groups.find(g => g.address === address)?.wells || [address]
  const srcRef = (d) => d?.rack ? { slot: racks[d.rack].slot, var: d.rack, wells: d.rack === 'reservoir' ? columnWells(columnLw, d.well) : [d.well] } : null
  const act = (a) => {
    const durationSec = Math.round(a.durationSec || 0)
    actions.push({ id: actions.length, step: curN, stepId: curStep?.id || '', stepType: curStep?.type || 'setup', kind: a.kind, text: a.text,
                   pipette: a.pipette || '', multi: !!a.multi, src: a.src || null, dst: a.dst || null, volume: a.volume ?? null, count: a.count || 0,
                   tipsUsed: a.tipsUsed || 0, durationSec, userAction: !!a.userAction, clockSec: Math.round(clock),
                   state: { tcLid: lidOpen ? 'open' : 'closed', tcBlock: mod.tcBlock, tcLidTemp: mod.tcLidTemp, temp: mod.temp, hsTemp: mod.hsTemp, hsRpm, mag: mod.mag, tipsLeft: { ...previewTips } } })
    clock += durationSec
  }
  // Tip accounting for the preview: the same rule need_tips() applies at run time.
  const spendTips = (p, n) => {
    if (!p || !(n > 0)) return
    if (!p.tipCapacity) {
      // No rack could be placed: the run cannot get past the first pickup.
      if (!p.noRackFlagged) { p.noRackFlagged = true; act({ kind: 'refill', userAction: true, pipette: p.var, text: `No tip rack for the ${p.def.label} fits on the deck — the run stops at its first pickup. Free a slot (see the warnings).` }) }
      return
    }
    if (needRefill && previewTips[p.var] < n) {
      act({ kind: 'refill', userAction: true, pipette: p.var, text: `Refill every tip rack of the ${p.def.label} (slot${p.tipSlots.length === 1 ? '' : 's'} ${p.tipSlots.join(', ')}), then resume`,
            dst: { slot: p.tipSlots[0] || '', var: p.tipVar, wells: [] } })
      previewTips[p.var] = p.tipCapacity
    }
    previewTips[p.var] = Math.max(0, previewTips[p.var] - n)
  }
  const volText = (vols) => { const lo = Math.min(...vols), hi = Math.max(...vols); return lo === hi ? `${pyNum(lo)} µL` : `${pyNum(lo)}–${pyNum(hi)} µL` }
  // Split a transfer list so no chunk costs more tips than the loaded racks hold.
  const chunked = (items, p, always) => {
    if (!needRefill || !always || !p.tipCapacity) return [{ items, tips: always ? tipsFor(p, items, true) : 1 }]
    const cap = p.tipCapacity
    const out = []
    let cur = [], cost = 0
    for (const it of items) {
      const c = strokes(p, it.volume)
      if (cur.length && cost + c > cap) { out.push({ items: cur, tips: cost }); cur = []; cost = 0 }
      cur.push(it); cost += c
    }
    if (cur.length) out.push({ items: cur, tips: cost })
    return out
  }

  // ── Validation of module steps ──
  const tcM = OT2_MODULES.thermocycler, tmM = OT2_MODULES.temperature, hsM = OT2_MODULES.heater_shaker
  const inRange = (v, lo, hi) => v >= lo && v <= hi
  for (const s of stepsOf('thermocycler')) {
    if (isSet(s.blockTemp) && !inRange(Number(s.blockTemp), tcM.blockMin, tcM.blockMax)) warn(`Thermocycler block: ${s.blockTemp} °C is outside ${tcM.blockMin}–${tcM.blockMax} °C.`)
    if (isSet(s.lidTemp) && !inRange(Number(s.lidTemp), tcM.lidMin, tcM.lidMax)) warn(`Thermocycler lid: ${s.lidTemp} °C is outside ${tcM.lidMin}–${tcM.lidMax} °C.`)
  }
  for (const s of stepsOf('tc_profile')) {
    for (const st of s.profile || []) if (!inRange(Number(st.temp), tcM.blockMin, tcM.blockMax)) warn(`Thermocycler profile: ${st.temp} °C is outside ${tcM.blockMin}–${tcM.blockMax} °C.`)
    if (!(Number(s.cycles) >= 1)) warn('Thermocycler profile: repetitions must be at least 1.')
    if (!(s.profile || []).length) warn('Thermocycler profile: add at least one temperature step.')
  }
  for (const s of stepsOf('temperature')) if (!s.deactivate && isSet(s.temp) && !inRange(Number(s.temp), tmM.min, tmM.max)) warn(`Temperature Module: ${s.temp} °C is outside ${tmM.min}–${tmM.max} °C.`)
  for (const s of stepsOf('heater_shaker')) {
    if (isSet(s.temp) && Number(s.temp) > hsM.max) warn(`Heater-Shaker: ${s.temp} °C is above its ${hsM.max} °C maximum.`)
    else if (isSet(s.temp) && Number(s.temp) < hsM.min && !apiAtLeast(cfg.apiLevel, '2.25')) warn(`Heater-Shaker: ${s.temp} °C is below the ${hsM.min} °C floor of apiLevel < 2.25 — it has no cooling anyway, so it can only hold what is above room temperature.`)
    if (isSet(s.rpm) && Number(s.rpm) > 0 && !inRange(Number(s.rpm), hsM.rpmMin, hsM.rpmMax)) warn(`Heater-Shaker: ${s.rpm} rpm is outside ${hsM.rpmMin}–${hsM.rpmMax} rpm.`)
  }
  if (usesHS && !apiAtLeast(cfg.apiLevel, '2.13')) warn('The Heater-Shaker needs apiLevel 2.13 or newer.')
  const liquidsOk = apiAtLeast(cfg.apiLevel, '2.14')
  if (!liquidsOk) warn('apiLevel below 2.14 cannot declare liquids — the Opentrons App will not show what to load where. The header comment still lists it.')
  if (targetOn === 'thermocycler' && !targetLw?.on.includes('thermocycler')) warn('Only a full-skirt 96 PCR plate fits the Thermocycler.')

  // ── Emit ─────────────────────────────────────────────────────────────────
  const H = []
  const stamp = now.toISOString().slice(0, 16).replace('T', ' ')
  H.push(`# ${oneLine(cfg.protocolName || plate?.name || 'Plate')} — Opentrons OT-2 protocol`)
  H.push(`# Generated ${stamp} by the Boekhoven Lab Assistant from the well plate "${oneLine(plate?.name || '')}" (${format}-well).`)
  H.push('#')
  H.push('# DECK')
  const deckEntries = Object.entries(occupancy).sort((a, b) => Number(a[0]) - Number(b[0]))
  const deckRows = deckEntries.map(([slot, o]) => [slot, o.what])
  for (const [slot, what] of deckRows) H.push(`#   slot ${slot.padStart(2)}  ${what}`)
  H.push('#   slot 12  fixed trash')
  if (prefilled && included.length) {
    H.push('#')
    H.push('# PIPETTE THE PLATE BY HAND BEFORE STARTING  (the robot does not build it)')
    for (const d of included) {
      const desc = `${d.code ? '[' + d.code + '] ' : ''}${d.name}${d.stock != null ? ` (${pyNum(d.stock)} ${d.unit})` : ''}`
      H.push(`#   ${oneLine(desc).padEnd(54)} ${String(d.transfers.length).padStart(3)} well${d.transfers.length === 1 ? ' ' : 's'}   ${fmtUl(d.totalUl).padStart(9)} in total`)
    }
  }
  if (sources.length) {
    H.push('#')
    H.push('# LIQUIDS TO LOAD  (position — liquid — load at least; demand)')
    for (const d of sources) {
      if (!d.rack) continue
      const desc = `${d.code ? '[' + d.code + '] ' : ''}${d.name}${d.stock != null ? ` (${pyNum(d.stock)} ${d.unit})` : ''}`
      const cw = d.rack === 'reservoir' ? columnWells(columnLw, d.well) : [d.well]
      const spread = cw.length > 1 ? ` — split over ${cw[0]}–${cw[cw.length - 1]}, ≥ ${fmtUl(d.loadUl / cw.length)} each` : ''
      H.push(`#   ${d.rack.padEnd(9)} ${d.well.padEnd(4)} ${oneLine(desc).padEnd(44)} ≥ ${fmtUl(d.loadUl).padStart(9)}   (${fmtUl(d.totalUl)} into ${d.isQuench ? 'sample wells' : `${d.transfers.length} well${d.transfers.length === 1 ? '' : 's'}`})${spread}`)
    }
  }
  // Both blocks are spliced in once the body has been written: the offsets are
  // only known then, and so are the warnings the emission itself raises.
  const headerAt = H.length
  H.push('#')
  H.push('# Simulate before running:  opentrons_simulate this_file.py')
  H.push('')
  H.push('from opentrons import protocol_api')
  if (usesPartial) H.push('from opentrons.protocol_api import ALL, PARTIAL_COLUMN')
  if (stepsOf('series').length) H.push('import time')
  H.push('')
  H.push('metadata = {')
  H.push(`    "protocolName": ${py(oneLine(cfg.protocolName || plate?.name || 'Plate'))},`)
  H.push(`    "author": ${py(oneLine(cfg.author))},`)
  H.push(`    "description": ${py(oneLine(cfg.description || `Well plate ${plate?.name || ''}`))},`)
  H.push('    "source": "Boekhoven Lab Assistant",')
  H.push('}')
  H.push(`requirements = {"robotType": "OT-2", "apiLevel": ${py(cfg.apiLevel || OT2_DEFAULT_API_LEVEL)}}`)
  H.push('')
  H.push('')
  H.push('def run(protocol: protocol_api.ProtocolContext) -> None:')

  // Modules
  if (usesTC || usesTemp || usesHS || usesMag) emit('# ── Modules ──')
  if (usesTC) emit(`tc = protocol.load_module(${py(cfg.modules.thermocycler)})`)
  if (usesTemp) emit(`temp_mod = protocol.load_module(${py(cfg.modules.temperature)}, ${py(String(cfg.deck.temperature))})`)
  if (usesHS) emit(`hs = protocol.load_module(${py(cfg.modules.heaterShaker)}, ${py(String(cfg.deck.heaterShaker))})`)
  if (usesMag) emit(`mag = protocol.load_module(${py(cfg.modules.magnetic)}, ${py(String(cfg.deck.magnetic))})`)
  if (usesTC || usesTemp || usesHS || usesMag) emit()

  // Labware
  emit('# ── Labware ──')
  // Labware Position Check offsets: mm to the right (x), to the back (y) and up
  // (z) from the labware's nominal position, exactly what the Opentrons App's
  // "Get Labware Offset Data" hands back. set_offset() overrides whatever the
  // App has stored, so the file carries its own calibration and runs as it is.
  const appliedOffsets = []
  const emitOffset = (expr, lwName, slot, what) => {
    const o = offsetFor(cfg, lwName, slot)
    if (!o) return
    appliedOffsets.push({ slot: String(slot), labware: lwName, what, ...o })
    emit(`${expr}.set_offset(x=${pyNum(o.x)}, y=${pyNum(o.y)}, z=${pyNum(o.z)})`)
  }
  const plateLabel = oneLine(plate?.name || 'Plate')
  const usedLabels = new Set()
  const uniqueLabel = (l) => { let s = l; let i = 2; while (usedLabels.has(s)) s = `${l} (${i++})`; usedLabels.add(s); return s }
  const targetLabel = uniqueLabel(plateLabel)
  if (targetLw) {
    const loader = { deck: `protocol.load_labware(${py(targetLw.name)}, ${py(targetSlot)}, label=${py(targetLabel)})`,
                     thermocycler: `tc.load_labware(${py(targetLw.name)}, label=${py(targetLabel)})`,
                     temperature: `temp_mod.load_labware(${py(targetLw.name)}, label=${py(targetLabel)})`,
                     heater_shaker: `hs.load_labware(${py(targetLw.name)}, label=${py(targetLabel)})` }[targetOn]
    emit(`plate = ${loader}`)
    emitOffset('plate', targetLw.name, plateSlot, `the plate "${plateLabel}"`)
  }
  for (const r of ['stocks', 'bulk', 'reservoir']) {
    if (!racks[r].any) continue
    const label = { stocks: 'Stocks', bulk: 'Bulk liquids', reservoir: '8-channel reservoir' }[r]
    emit(`${racks[r].var} = protocol.load_labware(${py(racks[r].lw.name)}, ${py(racks[r].slot)}, label=${py(uniqueLabel(label))})`)
    emitOffset(racks[r].var, racks[r].lw.name, racks[r].slot, label)
  }
  // The sample plates are one list, and their wells one flat run of destinations
  // across all of them, so a step only has to know how far along it is.
  const sampleMulti = stepsOf('sample', 'series').some(s => samplePlans.get(s.id)?.multi)
  if (samplesLw) {
    if (sampleSlots.length === 1) emit(`sample_plates = [protocol.load_labware(${py(samplesLw.name)}, ${py(sampleSlots[0])}, label=${py(uniqueLabel('Samples'))})]`)
    else {
      emit('sample_plates = [')
      sampleSlots.forEach((slot, i) => emit(`    protocol.load_labware(${py(samplesLw.name)}, ${py(slot)}, label=${py(uniqueLabel(`Samples ${i + 1}`))}),`))
      emit(']')
    }
    sampleSlots.forEach((slot, i) => emitOffset(`sample_plates[${i}]`, samplesLw.name, slot, sampleSlots.length > 1 ? `sample plate ${i + 1}` : 'the sample labware'))
    emit('sample_dests = [w for p in sample_plates for w in p.wells()]')
    if (sampleMulti) emit('sample_dest_cols = [c[0] for p in sample_plates for c in p.columns()]')
  }
  for (const p of pipettes) {
    if (!p.tipSlots.length) { emit(`${p.tipVar} = []  # ${p.tipsNeeded > 0 ? 'no free slot for a tip rack — see warnings' : 'this pipette is not used by any step'}`); continue }
    emit(`${p.tipVar} = [protocol.load_labware(${py(p.tipName)}, slot) for slot in [${p.tipSlots.map(py).join(', ')}]]`)
    p.tipSlots.forEach((slot, i) => emitOffset(`${p.tipVar}[${i}]`, p.tipName, slot, `${p.tipLw?.label || p.tipName} (${p.var})`))
  }
  emit()

  // Pipettes
  emit('# ── Pipettes ──')
  for (const p of pipettes) {
    emit(`${p.var} = protocol.load_instrument(${py(p.def.name)}, ${py(p.mount)}, tip_racks=${p.tipVar})`)
    const fr = cfg.flowRates?.[p.mount] || {}
    if (isSet(fr.aspirate)) emit(`${p.var}.flow_rate.aspirate = ${pyNum(fr.aspirate)}  # µL/s`)
    if (isSet(fr.dispense)) emit(`${p.var}.flow_rate.dispense = ${pyNum(fr.dispense)}  # µL/s`)
  }
  emit()

  // Liquids
  const liquidSources = sources.filter(d => d.rack)
  // A prefilled plate declares its contents straight into the plate, so the
  // Opentrons App shows what every well should already hold before the run.
  const plateLiquids = prefilled ? included.filter(d => d.byTarget?.size) : []
  if ((liquidSources.length || plateLiquids.length) && liquidsOk) {
    emit('# ── Liquids (the Opentrons App shows these in Labware Setup) ──')
    const all = [...liquidSources, ...plateLiquids]
    const colors = assignColors(BOEKHOVEN_PALETTE, all.map(d => d.key))
    all.forEach((d, i) => {
      const desc = [d.code ? `[${d.code}]` : '', d.stock != null ? `${pyNum(d.stock)} ${d.unit}` : '', d.isFill ? 'fill-up' : '', d.isQuench ? 'quench' : '', d.rack ? '' : 'pipetted into the plate by hand'].filter(Boolean).join(' ')
      emit(`liq_${i + 1} = protocol.define_liquid(name=${py(oneLine(d.name))}, description=${py(desc)}, display_color=${py(colors[d.key] || '#0072B2')})`)
      if (!d.rack) return                       // the plate's own contents follow, as a table
      // A reservoir column of an 8-row labware is eight wells sharing the load.
      const cw = d.rack === 'reservoir' ? columnWells(columnLw, d.well) : [d.well]
      const vol = pyNum(Math.min(d.loadUl, d.capacityUl || d.loadUl) / cw.length)
      // Well.load_liquid was deprecated in 2.22 in favour of the labware-level call.
      if (apiAtLeast(cfg.apiLevel, '2.22')) emit(`${d.rack}.load_liquid(wells=[${cw.map(py).join(', ')}], volume=${vol}, liquid=liq_${i + 1})`)
      else for (const w of cw) emit(`${d.rack}[${py(w)}].load_liquid(liquid=liq_${i + 1}, volume=${vol})`)
    })
    // A hand-filled plate is a table of (liquid, [(µL, wells), …]) rather than one
    // call per group: a 96-well plate can hold a hundred of them.
    if (plateLiquids.length) {
      emit('# What every well should already hold when the plate goes on the robot.')
      emit('for liq, groups in [')
      plateLiquids.forEach((d, j) => {
        const byVol = new Map()
        for (const [w, v] of d.byTarget) { const k = pyNum(v); if (!byVol.has(k)) byVol.set(k, []); byVol.get(k).push(w) }
        emit(`    (liq_${liquidSources.length + j + 1}, [`)
        for (const [vol, wells] of byVol) {
          const list = wells.map(py).join(', ')
          if (list.length <= 70) { emit(`        (${vol}, [${list}]),`); continue }
          emit(`        (${vol}, [`)
          for (const line of pyList(wells.map(py), 12)) emit(line)
          emit('        ]),')
        }
        emit('    ]),')
      })
      emit(']:')
      emit('    for vol, ws in groups:')
      if (apiAtLeast(cfg.apiLevel, '2.22')) emit('        plate.load_liquid(wells=ws, volume=vol, liquid=liq)')
      else {
        emit('        for w in ws:')
        emit('            plate[w].load_liquid(liquid=liq, volume=vol)')
      }
    }
    emit()
  }

  // Helpers only when a step uses them
  if (buildPlans.length) {
    emit('def build(pipette, source, transfers, mode="transfer", **kwargs):')
    emit('    """Pipette transfers = [(well, µL), ...] from one source into the plate."""')
    emit('    volumes = [v for _, v in transfers]')
    emit('    dests = [plate[w] for w, _ in transfers]')
    emit('    if mode == "distribute":')
    emit('        pipette.distribute(volumes, source, dests, **kwargs)')
    emit('    else:')
    emit('        pipette.transfer(volumes, source, dests, **kwargs)')
    emit()
  }
  if (needRefill) {
    emit(`tips_capacity = {${pipettes.map(p => `${py(p.mount)}: ${p.tipCapacity}`).join(', ')}}`)
    emit('tips_left = dict(tips_capacity)')
    emit()
    emit('def need_tips(pipette, n):')
    emit('    """Pause for fresh racks before a step whose n tips would run out."""')
    emit('    if tips_left[pipette.mount] < n:')
    emit('        protocol.pause(f"{pipette.name} ({pipette.mount}) is out of tips — refill ALL of its tip racks, then resume.")')
    emit('        pipette.reset_tipracks()')
    emit('        tips_left[pipette.mount] = tips_capacity[pipette.mount]')
    emit('    tips_left[pipette.mount] -= n')
    emit()
  }
  if (stepsOf('series').length) {
    emit('def wait_until(t_target):')
    emit('    """Wait until t_target (a time.monotonic() moment). Intervals are measured from')
    emit('    the start of the series, so the time taken by sampling itself does not add up."""')
    emit('    remaining = t_target - time.monotonic()')
    emit('    if remaining > 0:')
    emit('        protocol.delay(seconds=remaining, msg=f"next time point in {remaining / 60:.1f} min")')
    emit()
  }

  // Module setup that must precede any pipetting into a module-held plate.
  let lidOpen = true     // what the code has told the thermocycler so far
  let hsRpm = 0          // shake speed currently commanded
  let hsHeating = false  // the robot never switches the Heater-Shaker off by itself
  if (targetOn === 'thermocycler') { emit('tc.open_lid()  # the plate must be reachable before anything is pipetted into it'); lidOpen = true; act({ kind: 'tc', text: 'Thermocycler: open the lid so the plate can be reached', dst: { slot: '7', var: 'tc', wells: [] }, durationSec: 30 }); emit() }
  if (usesHS) { emit('hs.close_labware_latch()  # the latch must be closed to shake and to hold the plate'); act({ kind: 'hs', text: 'Heater-Shaker: close the labware latch', dst: { slot: String(cfg.deck.heaterShaker), var: 'hs', wells: [] }, durationSec: 5 }); emit() }

  // Before any pipetting: the plate on the Thermocycler needs its lid open, and a
  // shaking Heater-Shaker blocks the pipette from every slot around it. Both are
  // put back afterwards, so a step that was set up keeps running.
  // `record` adds the same moves to the preview; the series loop records its
  // time points itself, since the code for them is written once but runs N times.
  // The lid must be up for the pipette to reach the plate, and belongs down
  // again whenever the block or the lid heater is on: a plate incubating with
  // the lid open neither holds its temperature nor keeps its volume. So the lid
  // also comes down after pipetting that found it open, which is what makes a
  // sampling series on a heated Thermocycler close between time points.
  // `loop` is for a body that runs many times over: it has to leave the lid the
  // way it found it, so one that closes the lid at the end must open it at the
  // start — the second time round it would otherwise pipette into a closed
  // Thermocycler. Opening an open lid is a no-op on the robot.
  const lidPlan = ({ loop = false } = {}) => {
    if (targetOn !== 'thermocycler') return { open: false, close: false }
    const close = !lidOpen || mod.tcBlock != null || mod.tcLidTemp != null
    return { open: !lidOpen || (loop && close), close }
  }
  const beforePipetting = ({ record = true, loop = false } = {}) => {
    const undo = []
    const lid = lidPlan({ loop })
    if (lid.open) {
      emit('tc.open_lid()'); lidOpen = true
      if (record) act({ kind: 'tc', text: 'Thermocycler: open the lid for pipetting', dst: { slot: '7', var: 'tc', wells: [] }, durationSec: 30 })
    }
    if (lid.close) {
      undo.push(() => { emit('tc.close_lid()'); lidOpen = false; if (record) act({ kind: 'tc', text: `Thermocycler: close the lid again${mod.tcBlock != null ? ` — the block stays at ${pyNum(mod.tcBlock)} °C` : ''}`, dst: { slot: '7', var: 'tc', wells: [] }, durationSec: 30 }) })
    }
    if (usesHS && hsRpm > 0) {
      const rpm = hsRpm
      emit('hs.deactivate_shaker()'); hsRpm = 0
      if (record) act({ kind: 'hs', text: 'Heater-Shaker: stop shaking so the pipette can reach the deck around it', dst: { slot: String(cfg.deck.heaterShaker), var: 'hs', wells: [] }, durationSec: 5 })
      undo.push(() => { emit(`hs.set_and_wait_for_shake_speed(${pyNum(rpm)})`); hsRpm = rpm; if (record) act({ kind: 'hs', text: `Heater-Shaker: shake again at ${pyNum(rpm)} rpm`, dst: { slot: String(cfg.deck.heaterShaker), var: 'hs', wells: [] }, durationSec: 5 }) })
    }
    return () => undo.forEach(fn => fn())
  }

  // Changing the nozzle layout makes the pipette start on a fresh column of
  // tips, so it is only emitted when the layout actually has to change.
  // `force` is for a configure inside a series loop: the layout is right when the
  // line is written, but the round before it has already changed it back.
  const useNozzles = (p, n, { force = false } = {}) => {
    if (!p || p.def.channels !== 8 || (p.nozzles === n && !force)) return
    p.nozzles = n
    if (n === 8) emit(`${p.var}.configure_nozzle_layout(style=ALL, tip_racks=${p.tipVar})`)
    else emit(`${p.var}.configure_nozzle_layout(style=PARTIAL_COLUMN, start="H1", end=${py(partialEndNozzle(n))}, tip_racks=${p.tipVar})  # ${n} of 8 nozzles, tipped from the front`)
  }

  const transferKwargs = (s) => {
    const kw = [`new_tip=${py(s.newTip === 'once' ? 'once' : 'always')}`]
    if (s.blowOut !== false) kw.push('blow_out=True', 'blowout_location="destination well"')
    if (s.touchTip) kw.push('touch_tip=True')
    const mr = Math.floor(Number(s.mixAfterReps) || 0)
    if (mr > 0) kw.push(`mix_after=(${mr}, ${isSet(s.mixAfterUl) ? pyNum(s.mixAfterUl) : 'MIX_VOLUME'})`)
    if (isSet(s.airGapUl) && Number(s.airGapUl) > 0) kw.push(`air_gap=${pyNum(s.airGapUl)}`)
    return kw
  }

  emit('# ── Steps ──')
  let n = 0
  for (const s of steps) {
    n++
    curStep = s; curN = n
    switch (s.type) {
      case 'build': {
        const plan = buildPlans.shift() || []
        const fills = plan.reduce((a, b) => a + b.transfers.reduce((x, t) => x + t.wells, 0), 0)
        emit(`# Step ${n}: build the plate — ${fills} well fills from ${new Set(plan.map(b => b.src.key)).size} liquids${plan.columns ? `, ${plan.columns} column${plan.columns === 1 ? '' : 's'} by 8-channel` : ''}`)
        const restore = beforePipetting()
        for (const b of plan) {
          const desc = `${b.src.code ? '[' + b.src.code + '] ' : ''}${b.src.name}${b.src.stock != null ? ` ${pyNum(b.src.stock)} ${b.src.unit}` : ''}`
          const total = b.transfers.reduce((a, t) => a + t.volume * t.wells, 0)
          const what = b.multi ? `${b.transfers.length} column${b.transfers.length === 1 ? '' : 's'} × 8 wells` : `${b.transfers.length} well${b.transfers.length === 1 ? '' : 's'}`
          emit(`# ${oneLine(desc)} — ${what}, ${fmtUl(total)} (${b.pip.var}${b.multi ? ', 8-channel: a well name means its whole column' : ''})`)
          useNozzles(b.pip, 8)
          const kw = transferKwargs(s).map(k => k.replace('MIX_VOLUME', pyNum(Math.min(b.pip.def.max, Math.max(b.pip.def.min, b.transfers[0].volume)))))
          const oneTip = s.mode === 'distribute' || s.newTip === 'once'
          for (const { items: chunk, tips } of chunked(b.transfers, b.pip, !oneTip)) {
            tipCall(b.pip, tips)
            spendTips(b.pip, tips)
            const fills = chunk.reduce((x, t) => x + t.wells, 0)
            act({
              kind: s.mode === 'distribute' ? 'distribute' : 'transfer', pipette: b.pip.var, multi: b.multi,
              text: `${oneLine(desc)}: ${volText(chunk.map(t => t.volume))} into ${b.multi ? `${chunk.length} column${chunk.length === 1 ? '' : 's'} (${fills} wells) with the 8-channel` : `${fills} well${fills === 1 ? '' : 's'}`} (${b.pip.var}, ${oneTip ? 'one tip' : 'new tip each'})`,
              src: srcRef(b.src), dst: { slot: plateSlot, var: 'plate', wells: chunk.flatMap(t => b.multi ? groupWells(t.target) : [t.target]) },
              volume: chunk.length === 1 ? chunk[0].volume : null, count: fills, tipsUsed: tips,
              durationSec: s.mode === 'distribute' ? 8 + 3 * chunk.length : chunk.length * (oneTip ? 4 : 9) + 2 * (tips - (oneTip ? 1 : chunk.length)),
            })
            if (s.mode === 'distribute') {
              // One aspirate feeds several wells; the tip never re-enters the wells.
              const kwd = kw.filter(k => !k.startsWith('blowout_location') && !k.startsWith('mix_after') && !k.startsWith('new_tip'))
              kwd.unshift('new_tip="once"'); kwd.push(`disposal_volume=${pyNum(b.pip.def.min)}`)
              emit(`build(${b.pip.var}, ${b.src.rack}[${py(b.src.well)}], [`)
              for (const line of pyList(chunk.map(t => `(${py(t.target)}, ${pyNum(t.volume)})`), 8)) emit(line)
              emit(`], mode="distribute", ${kwd.join(', ')})`)
            } else {
              emit(`build(${b.pip.var}, ${b.src.rack}[${py(b.src.well)}], [`)
              for (const line of pyList(chunk.map(t => `(${py(t.target)}, ${pyNum(t.volume)})`), 8)) emit(line)
              emit(`], ${kw.join(', ')})`)
            }
          }
        }
        restore()
        emit()
        break
      }
      case 'thermocycler': {
        const bits = []
        if (s.lid === 'open') bits.push('lid open'); if (s.lid === 'close') bits.push('lid closed')
        if (isSet(s.blockTemp)) bits.push(`block ${pyNum(s.blockTemp)} °C${isSet(s.holdMinutes) && Number(s.holdMinutes) > 0 ? ` for ${pyNum(s.holdMinutes)} min` : ''}`)
        if (isSet(s.lidTemp)) bits.push(`lid ${pyNum(s.lidTemp)} °C`)
        if (s.deactivate) bits.push('then off')
        emit(`# Step ${n}: thermocycler — ${bits.join(', ') || 'no change'}`)
        const tcRef = { slot: '7', var: 'tc', wells: [] }
        if (s.lid === 'open') { emit('tc.open_lid()'); lidOpen = true; act({ kind: 'tc', text: 'Thermocycler: open the lid', dst: tcRef, durationSec: 30 }) }
        if (s.lid === 'close') { emit('tc.close_lid()'); lidOpen = false; act({ kind: 'tc', text: 'Thermocycler: close the lid', dst: tcRef, durationSec: 30 }) }
        if (isSet(s.lidTemp)) { emit(`tc.set_lid_temperature(${pyNum(s.lidTemp)})`); mod.tcLidTemp = Number(s.lidTemp); act({ kind: 'tc', text: `Thermocycler: heat the lid to ${pyNum(s.lidTemp)} °C`, dst: tcRef, durationSec: 60 }) }
        if (isSet(s.blockTemp)) {
          const args = [pyNum(s.blockTemp)]
          const hold = isSet(s.holdMinutes) && Number(s.holdMinutes) > 0 ? Number(s.holdMinutes) : 0
          if (hold) args.push(`hold_time_minutes=${pyNum(s.holdMinutes)}`)
          if (Number(plate?.targetVolume) > 0) args.push(`block_max_volume=${pyNum(plate.targetVolume)}`)
          emit(`tc.set_block_temperature(${args.join(', ')})${hold ? '  # returns after the hold' : ''}`)
          mod.tcBlock = Number(s.blockTemp)
          act({ kind: 'tc', text: `Thermocycler: block to ${pyNum(s.blockTemp)} °C${hold ? ` and hold ${pyNum(hold)} min` : ''}`, dst: tcRef, durationSec: 60 + hold * 60 })
        }
        if (s.deactivate) { emit('tc.deactivate_lid()'); emit('tc.deactivate_block()'); mod.tcBlock = null; mod.tcLidTemp = null; act({ kind: 'tc', text: 'Thermocycler: block and lid off', dst: tcRef, durationSec: 5 }) }
        emit()
        break
      }
      case 'tc_profile': {
        const prof = (s.profile || []).filter(st => isSet(st.temp) && isSet(st.seconds))
        emit(`# Step ${n}: thermocycler profile — ${prof.map(st => `${pyNum(st.temp)} °C ${pyNum(st.seconds)} s`).join(' → ')} × ${Math.max(1, Math.floor(Number(s.cycles) || 1))}`)
        const tcRef = { slot: '7', var: 'tc', wells: [] }
        if (lidOpen) { emit('tc.close_lid()'); lidOpen = false; act({ kind: 'tc', text: 'Thermocycler: close the lid for the profile', dst: tcRef, durationSec: 30 }) }
        if (isSet(s.lidTemp)) { emit(`tc.set_lid_temperature(${pyNum(s.lidTemp)})`); mod.tcLidTemp = Number(s.lidTemp); act({ kind: 'tc', text: `Thermocycler: heat the lid to ${pyNum(s.lidTemp)} °C`, dst: tcRef, durationSec: 60 }) }
        {
          const reps = Math.max(1, Math.floor(Number(s.cycles) || 1))
          const perCycle = prof.reduce((x, st) => x + Number(st.seconds) + 15, 0)
          mod.tcBlock = prof.length ? Number(prof[prof.length - 1].temp) : mod.tcBlock
          act({ kind: 'tc', text: `Thermocycler: run the profile ${prof.map(st => `${pyNum(st.temp)} °C ${pyNum(st.seconds)} s`).join(' → ')} × ${reps}`, dst: tcRef, durationSec: 30 + perCycle * reps })
        }
        emit('tc.execute_profile(')
        emit('    steps=[')
        for (const st of prof) emit(`        {"temperature": ${pyNum(st.temp)}, "hold_time_seconds": ${pyNum(st.seconds)}},`)
        emit('    ],')
        emit(`    repetitions=${Math.max(1, Math.floor(Number(s.cycles) || 1))},`)
        const bmv = isSet(s.blockMaxUl) ? Number(s.blockMaxUl) : (Number(plate?.targetVolume) > 0 ? Number(plate.targetVolume) : null)
        if (bmv) emit(`    block_max_volume=${pyNum(bmv)},`)
        emit(')')
        if (isSet(s.finalTemp)) { emit(`tc.set_block_temperature(${pyNum(s.finalTemp)})`); mod.tcBlock = Number(s.finalTemp); act({ kind: 'tc', text: `Thermocycler: hold the block at ${pyNum(s.finalTemp)} °C`, dst: { slot: '7', var: 'tc', wells: [] }, durationSec: 60 }) }
        emit()
        break
      }
      case 'temperature': {
        const tmRef = { slot: String(cfg.deck.temperature), var: 'temp_mod', wells: [] }
        if (s.deactivate) { emit(`# Step ${n}: temperature module off`); emit('temp_mod.deactivate()'); mod.temp = null; act({ kind: 'temp', text: 'Temperature Module: off', dst: tmRef, durationSec: 3 }) }
        else { emit(`# Step ${n}: temperature module → ${pyNum(s.temp)} °C (waits until reached)`); emit(`temp_mod.set_temperature(celsius=${pyNum(s.temp)})`); mod.temp = Number(s.temp); act({ kind: 'temp', text: `Temperature Module: to ${pyNum(s.temp)} °C and wait until reached`, dst: tmRef, durationSec: 120 }) }
        emit()
        break
      }
      case 'heater_shaker': {
        const hsRef = { slot: String(cfg.deck.heaterShaker), var: 'hs', wells: [] }
        if (s.deactivate) {
          emit(`# Step ${n}: heater-shaker off`)
          emit('hs.deactivate_shaker()'); emit('hs.deactivate_heater()'); hsRpm = 0; hsHeating = false; mod.hsTemp = null
          act({ kind: 'hs', text: 'Heater-Shaker: heater and shaker off', dst: hsRef, durationSec: 5 })
        } else {
          const bits = []
          if (isSet(s.temp)) bits.push(`${pyNum(s.temp)} °C`)
          if (isSet(s.rpm)) bits.push(Number(s.rpm) > 0 ? `${pyNum(s.rpm)} rpm` : 'stop shaking')
          emit(`# Step ${n}: heater-shaker — ${bits.join(', ') || 'no change'}`)
          if (isSet(s.temp)) { emit(`hs.set_and_wait_for_temperature(${pyNum(s.temp)})`); hsHeating = true; mod.hsTemp = Number(s.temp); act({ kind: 'hs', text: `Heater-Shaker: heat to ${pyNum(s.temp)} °C and wait`, dst: hsRef, durationSec: 90 }) }
          if (isSet(s.rpm)) {
            if (Number(s.rpm) > 0) { emit(`hs.set_and_wait_for_shake_speed(${pyNum(s.rpm)})`); hsRpm = Number(s.rpm); act({ kind: 'hs', text: `Heater-Shaker: shake at ${pyNum(s.rpm)} rpm`, dst: hsRef, durationSec: 5 }) }
            else { emit('hs.deactivate_shaker()'); hsRpm = 0; act({ kind: 'hs', text: 'Heater-Shaker: stop shaking', dst: hsRef, durationSec: 5 }) }
          }
        }
        emit()
        break
      }
      case 'magnetic': {
        const mgRef = { slot: String(cfg.deck.magnetic), var: 'mag', wells: [] }
        if (s.action === 'disengage') { emit(`# Step ${n}: magnets down`); emit('mag.disengage()'); mod.mag = 'down'; act({ kind: 'mag', text: 'Magnetic Module: magnets down', dst: mgRef, durationSec: 5 }) }
        else { emit(`# Step ${n}: magnets up`); emit(isSet(s.height) ? `mag.engage(height_from_base=${pyNum(s.height)})` : 'mag.engage()'); mod.mag = 'up'; act({ kind: 'mag', text: `Magnetic Module: magnets up${isSet(s.height) ? ` (${pyNum(s.height)} mm)` : ''}`, dst: mgRef, durationSec: 5 }) }
        emit()
        break
      }
      case 'delay': {
        const mins = num(s.minutes) || 0, secs = num(s.seconds) || 0
        if (!(mins > 0 || secs > 0)) { warn(`Step ${n} (wait): no duration set.`); break }
        emit(`# Step ${n}: wait ${mins ? pyNum(mins) + ' min' : ''}${mins && secs ? ' ' : ''}${secs ? pyNum(secs) + ' s' : ''}`)
        const args = []
        if (mins > 0) args.push(`minutes=${pyNum(mins)}`)
        if (secs > 0) args.push(`seconds=${pyNum(secs)}`)
        if (String(s.message || '').trim()) args.push(`msg=${py(oneLine(s.message))}`)
        emit(`protocol.delay(${args.join(', ')})`)
        act({ kind: 'wait', text: `Wait ${mins ? pyNum(mins) + ' min' : ''}${mins && secs ? ' ' : ''}${secs ? pyNum(secs) + ' s' : ''}${String(s.message || '').trim() ? ` — ${oneLine(s.message)}` : ''}`, durationSec: mins * 60 + secs })
        emit()
        break
      }
      case 'pause': {
        emit(`# Step ${n}: pause until someone resumes the run`)
        emit(`protocol.pause(${py(oneLine(s.message || 'Continue when ready'))})`)
        act({ kind: 'pause', userAction: true, text: `Paused: ${oneLine(s.message || 'Continue when ready')} — press Resume in the Opentrons App` })
        emit()
        break
      }
      case 'comment': {
        if (String(s.text || '').trim()) { emit(`protocol.comment(${py(oneLine(s.text))})`); act({ kind: 'comment', text: oneLine(s.text) }) }
        emit()
        break
      }
      case 'mix': {
        const pl = samplePlans.get(s.id)
        if (!pl || !pl.pip || !pl.units.length) break
        const vol = pl.vol > 0 ? pl.vol : Math.min(pl.pip.def.max, Math.max(pl.pip.def.min, (Number(plate?.targetVolume) || 20) / 2))
        const what = pl.multi ? `${pl.units.length} column${pl.units.length === 1 ? '' : 's'} with the 8-channel` : `${pl.units.length} well${pl.units.length === 1 ? '' : 's'}`
        emit(`# Step ${n}: mix ${what}, ${Math.max(1, Math.floor(Number(s.reps) || 1))} × ${pyNum(vol)} µL (${pl.pip.var})`)
        const restore = beforePipetting()
        useNozzles(pl.pip, 8)
        if (s.newTip === 'once') tipCall(pl.pip, 1)
        spendTips(pl.pip, s.newTip === 'once' ? 1 : pl.units.length)
        act({ kind: 'mix', pipette: pl.pip.var, multi: pl.multi, text: `Mix ${what}: ${Math.max(1, Math.floor(Number(s.reps) || 1))} × ${pyNum(vol)} µL (${pl.pip.var})`,
              dst: { slot: plateSlot, var: 'plate', wells: pl.units.flatMap(u => pl.multi ? groupWells(u) : [u]) }, count: pl.units.length, tipsUsed: s.newTip === 'once' ? 1 : pl.units.length, durationSec: pl.units.length * 6 })
        emit(`for well in [${pl.units.map(py).join(', ')}]:`)
        if (s.newTip === 'once') { emit(`    if not ${pl.pip.var}.has_tip:`); emit(`        ${pl.pip.var}.pick_up_tip()`) }
        else { tipCall(pl.pip, 1, '    '); emit(`    ${pl.pip.var}.pick_up_tip()`) }
        emit(`    ${pl.pip.var}.mix(${Math.max(1, Math.floor(Number(s.reps) || 1))}, ${pyNum(vol)}, plate[well])`)
        emit(`    ${pl.pip.var}.blow_out(plate[well].top())`)
        if (s.newTip !== 'once') emit(`    ${pl.pip.var}.drop_tip()`)
        if (s.newTip === 'once') emit(`${pl.pip.var}.drop_tip()`)
        restore()
        emit()
        break
      }
      case 'sample':
      case 'series': {
        const pl = samplePlans.get(s.id)
        if (!pl || !pl.blocks.length || !(pl.vol > 0)) break
        const label = s.type === 'series' ? 'Sampling series' : 'Take samples'
        // A step that cannot be done as set pipettes nothing: the run stops at the
        // raise above, and no well is quietly handed to the other pipette.
        const stopped = blocking.filter(b => b.stepId === s.id)
        if (stopped.length) {
          emit(`# Step ${n}: ${label} — skipped: can't do as set (${oneLine(stopped[0].message)})`)
          act({ kind: 'blocked', userAction: true, text: `Step ${n} · ${label} — can't do as set: ${oneLine(stopped[0].message)}` })
          emit()
          break
        }
        const isSeries = s.type === 'series'
        const units = pl.units
        // One group with one pipetting block keeps the shorter Python it has
        // always had; anything more names its group and its pipette.
        const many = pl.form === 'blocks'
        const gsuf = (u) => units.length > 1 ? `_g${u.no}` : ''
        const wellsVar = (u, b) => `${isSeries ? 'series_wells' : 'from_wells'}${many ? `${gsuf(u)}_${b.key}` : ''}`
        const offsVar = (u, b) => `${isSeries ? 'series_offsets' : 'offsets'}${many ? `${gsuf(u)}_${b.key}` : ''}`
        const destsVar = (u, b) => many ? `dests${gsuf(u)}_${b.key}` : 'dests'
        const startsVar = (u) => `series_starts${gsuf(u)}`
        const fillVar = (u) => `${isSeries ? 'series_fill_offsets' : 'fill_offsets'}${gsuf(u)}`
        const startAt = (u, i) => u.points[i]?.abs ?? 0
        const kwFor = (b) => {
          const kw = [`new_tip=${py(s.newTip === 'once' ? 'once' : 'always')}`, 'blow_out=True', 'blowout_location="destination well"']
          const mb = Math.floor(Number(s.mixBeforeReps) || 0)
          if (mb > 0) kw.push(`mix_before=(${mb}, ${isSet(s.mixBeforeUl) ? pyNum(s.mixBeforeUl) : pyNum(Math.min(b.pip.def.max, Math.max(b.pip.def.min, pl.vol)))})`)
          return kw
        }
        const blockWord = (b) => b.kind === 'single'
          ? `${b.strokes.length} well${b.strokes.length === 1 ? '' : 's'} one at a time (${b.pip.var})`
          : b.n === 8 ? `${b.strokes.length} column${b.strokes.length === 1 ? '' : 's'} with all 8 channels (${b.pip.var})`
          : `${b.strokes.length} run${b.strokes.length === 1 ? '' : 's'} of ${b.n} with ${b.n} of the 8 channels (${b.pip.var})`
        const one = pl.blocks[0]
        const nU = one.strokes.length
        const fromWhat = many ? `${pl.filledPerPoint} wells — ${pl.blocks.map(blockWord).join(' · ')}`
          : one.kind === 'single' ? `${nU} well${nU === 1 ? '' : 's'}`
          : one.n === 8 ? `${nU} column${nU === 1 ? '' : 's'} (${nU * 8} wells) with the 8-channel`
          : `${nU} part-column${nU === 1 ? '' : 's'} of ${one.n} (${nU * one.n} wells) with ${one.n} of the 8 channels`
        const blockFrom = (b) => many ? blockWord(b) : fromWhat
        // Every sample well a group fills from `st`, with the plate each sits on.
        const cellsAt = (st, offsets) => offsets.map(o => {
          const abs = st + o
          return { slot: sampleSlots[Math.floor(abs / pl.capacity)] || sampleSlots[0], well: sampleNames[abs % pl.capacity] }
        })
        const spansOfCells = (cells) => {
          const out = []
          for (const c of cells) {
            const last = out[out.length - 1]
            if (last && last.slot === c.slot) last.wells.push(c.well)
            else out.push({ slot: c.slot, wells: [c.well] })
          }
          return out
        }
        const spanWord = (sp) => `${sampleSlots.length > 1 ? `slot ${sp.slot} ` : ''}${sp.wells[0]}–${sp.wells[sp.wells.length - 1]}`
        const SWAP_MSG = sampleSlots.length > 1
          ? `All ${sampleSlots.length} sample plates are full: replace them with fresh ones (and top up the quench), then resume`
          : 'Sample plate full: replace it with a fresh one (and top up the quench), then resume'
        const swapMsg = (plates) => `${plates.length > 1 ? `Sample plates ${plates.map(pi => `${pi + 1} (slot ${sampleSlots[pi]})`).join(' and ')} are full: replace them` : `Sample plate ${plates[0] + 1} (slot ${sampleSlots[plates[0]]}) is full: replace it`} with ${plates.length > 1 ? 'fresh ones' : 'a fresh one'} (and top up the quench), then resume`
        // Where one block's strokes are addressed, in the shortest form that says
        // it: a slice for single wells, whole columns by their A-row well, an
        // evenly spaced run by stride, anything else by its offsets.
        const destExpr = (u, b, st) => {
          const lit = typeof st === 'number'
          const k = b.strokes.length
          if (pl.form === 'slice') return lit ? `sample_dests[${st}:${st + k}]` : `sample_dests[${st}:${st} + ${k}]`
          if (pl.form === 'cols') return lit ? `sample_dest_cols[${st / 8}:${st / 8 + k}]` : `sample_dest_cols[${st} // 8:${st} // 8 + ${k}]`
          if (pl.form === 'stride') return lit ? `sample_dests[${st + b.n - 1}:${st + k * b.n}:${b.n}]` : `sample_dests[${st} + ${b.n - 1}:${st} + ${k * b.n}:${b.n}]`
          return lit ? `[sample_dests[i] for i in [${b.strokes.map(x => st + x.addressOffset).join(', ')}]]` : `[sample_dests[${st} + o] for o in ${offsVar(u, b)}]`
        }
        // A quench poured by a single-channel visits every well the group fills.
        const quenchExpr = (u, st) => {
          const lit = typeof st === 'number'
          if (!many && pl.form === 'slice') return 'dests'
          if (!many && (pl.form === 'cols' || pl.form === 'stride')) return lit ? `sample_dests[${st}:${st + u.filled}]` : `sample_dests[${st}:${st} + ${u.filled}]`
          return lit ? `[sample_dests[i] for i in [${u.fillOffsets.map(o => st + o).join(', ')}]]` : `[sample_dests[${st} + o] for o in ${fillVar(u)}]`
        }
        const needFill = (u) => !!(pl.quench && pl.qp && !pl.qMulti && (many || pl.form === 'offsets'))
        // The lists the loop reads, per group and per block.
        const emitLists = () => {
          for (const u of units) {
            if (units.length > 1) emit(`#   group ${u.no}: ${u.wells.length} well${u.wells.length === 1 ? '' : 's'} (${u.wells[0]}${u.wells.length > 1 ? `–${u.wells[u.wells.length - 1]}` : ''}) → sample plate ${u.plateIdx + 1} (slot ${sampleSlots[u.plateIdx]})${u.shape ? u.shape.kind === 'rows' ? ', a row band per time point' : ', laid out as on the plate' : ''}`)
            for (const b of u.blocks) {
              emit(`${wellsVar(u, b)} = [${b.strokes.map(x => py(x.address)).join(', ')}]${b.kind === 'multi' && b.n > 1 && b.n < 8 ? `  # runs of ${b.n}, each addressed by its LAST well (the tips sit on the front nozzles)` : ''}`)
              if (pl.form === 'offsets' || many) emit(`${offsVar(u, b)} = [${b.strokes.map(x => x.addressOffset).join(', ')}]  # where each of ${wellsVar(u, b)} lands, counted from the first well of its time point`)
            }
            if (needFill(u)) emit(`${fillVar(u)} = [${u.fillOffsets.join(', ')}]  # every well the strokes fill, for the quench`)
          }
        }
        // The preview records for one round, in the order the Python runs them.
        const sampleRound = (i, label) => {
          const allCells = units.flatMap(u => cellsAt(startAt(u, i), u.fillOffsets))
          const allSpans = spansOfCells(allCells)
          pl.points.push({ i, start: startAt(units[0], i), spans: allSpans, wells: allCells.map(c => c.well),
                           pairs: units.flatMap(u => u.blocks.flatMap(b => b.strokes.map(x => ({ group: u.no, pipette: b.pip.var, nozzles: b.kind === 'multi' ? b.n : 0, src: x.wells, dst: cellsAt(startAt(u, i), x.fill).map(c => c.well), slot: cellsAt(startAt(u, i), x.fill)[0].slot })))) })
          for (const u of units) {
            const st = startAt(u, i)
            if (pl.quench && pl.qp && !pl.qMulti) {
              const cells = cellsAt(st, u.fillOffsets), spans = spansOfCells(cells)
              spendTips(pl.qp, 1)
              act({ kind: 'transfer', pipette: pl.qp.var, multi: false, text: `${label}quench: ${pyNum(pl.qv)} µL ${pl.quench.name} into ${cells.length} sample well${cells.length === 1 ? '' : 's'}${units.length > 1 ? ` for group ${u.no}` : ''} (${pl.qp.var})`,
                    src: srcRef(pl.quench), dst: { slot: spans[0].slot, var: 'sample_plates', wells: spans[0].wells, spans },
                    volume: pl.qv, count: cells.length, tipsUsed: 1, durationSec: 6 + 3 * cells.length })
            }
            for (const b of u.blocks) {
              const spans = spansOfCells(cellsAt(st, b.strokes.flatMap(x => x.fill).sort((a, c) => a - c)))
              const where = spans.map(spanWord).join(' + ')
              if (b.kind === 'multi' && pl.inLoop && b.configure) {
                act({ kind: 'nozzles', pipette: b.pip.var, nozzles: b.n, durationSec: 3,
                      text: `${b.pip.var}: ${b.n === 8 ? 'all 8 nozzles' : `${b.n} of the 8 nozzles`} — a new layout starts on a fresh column of tips` })
              }
              if (pl.qMulti) {
                spendTips(pl.qp, 1 / b.perCol)
                act({ kind: 'transfer', pipette: pl.qp.var, multi: true, nozzles: b.n, text: `${label}quench: ${pyNum(pl.qv)} µL ${pl.quench.name} into ${b.strokes.length * b.n} sample wells (${pl.qp.var})`,
                      src: srcRef(pl.quench), dst: { slot: spans[0].slot, var: 'sample_plates', wells: spans[0].wells, spans },
                      volume: pl.qv, count: b.strokes.length * b.n, tipsUsed: 1 / b.perCol, durationSec: 6 + 3 * b.strokes.length * b.n })
              }
              spendTips(b.pip, b.tipsPerPoint)
              act({ kind: 'transfer', pipette: b.pip.var, multi: b.kind === 'multi', nozzles: b.kind === 'multi' ? b.n : 0, group: units.length > 1 ? u.no : undefined,
                    text: `${label}${units.length > 1 ? `group ${u.no}: ` : ''}sample ${pyNum(pl.vol)} µL from ${blockFrom(b)} into ${where} (${b.pip.var})`,
                    src: { slot: plateSlot, var: 'plate', wells: b.strokes.flatMap(x => x.wells) },
                    dst: { slot: spans[0].slot, var: 'sample_plates', wells: spans[0].wells, spans },
                    pairs: b.strokes.map(x => ({ src: x.wells, dst: cellsAt(st, x.fill).map(c => c.well), slot: cellsAt(st, x.fill)[0].slot })),
                    volume: pl.vol, count: b.strokes.reduce((a, x) => a + x.wells.length, 0), tipsUsed: b.tipsPerPoint,
                    durationSec: b.strokes.length * (s.newTip === 'once' ? 5 : 9) })
            }
          }
        }
        // The transfers of one round. `stOf` indexes sample_dests at run time.
        const emitRound = (stOf) => {
          for (const u of units) {
            if (pl.quench && pl.qp && !pl.qMulti) {
              tipCall(pl.qp, 1)
              emit(`${pl.qp.var}.transfer(${pyNum(pl.qv)}, ${pl.quench.rack}[${py(pl.quench.well)}], ${quenchExpr(u, stOf(u))}, new_tip="once", blow_out=True, blowout_location="destination well")  # quench first`)
            }
            for (const b of u.blocks) {
              if (b.kind === 'multi' && pl.inLoop && b.configure) {
                useNozzles(b.pip, b.n, { force: true })
                if (needRefill) emit(`tips_left[${py(b.pip.mount)}] = int(tips_left[${py(b.pip.mount)}])  # a new nozzle layout starts on a fresh column of tips`)
              }
              if (many) emit(`${destsVar(u, b)} = ${destExpr(u, b, stOf(u))}`)
              if (pl.qMulti) {
                tipCall(pl.qp, 1 / b.perCol)
                emit(`${pl.qp.var}.transfer(${pyNum(pl.qv)}, ${pl.quench.rack}[${py(pl.quench.well)}], ${destsVar(u, b)}, new_tip="once", blow_out=True, blowout_location="destination well")  # quench first`)
              }
              tipCall(b.pip, b.tipsPerPoint)
              emit(`${b.pip.var}.transfer(${pyNum(pl.vol)}, [plate[w] for w in ${wellsVar(u, b)}], ${destsVar(u, b)}, ${kwFor(b).join(', ')})`)
            }
          }
        }
        if (isSeries) {
          const iv = num(s.intervalMinutes) || 0
          const count = pl.count
          emit(`# Step ${n}: sampling series — ${count} time points every ${pyNum(iv)} min, ${pyNum(pl.vol)} µL from ${fromWhat}${many ? '' : ` (${one.pip.var})`}`)
          const plates = sampleSlots.length > 1 ? `${sampleSlots.length} sample plates (slots ${sampleSlots.join(', ')}), one plate after the other` : 'sample labware'
          const swapNote = pl.fresh.size ? `; ${sampleSlots.length > 1 ? 'all of them are swapped for fresh ones' : 'the plate is swapped for a fresh one'} before time point${pl.fresh.size === 1 ? '' : 's'} ${[...pl.fresh].map(i => i + 1).join(', ')}` : ''
          if (!pl.usesGroups) emit(pl.mirror
            ? `#   each time point fills the next ${pl.mirror.cols} column${pl.mirror.cols === 1 ? '' : 's'} of the ${plates}, laid out as on the plate (same rows; never split over two plates)${swapNote}`
            : `#   each time point fills the next ${pl.extent} well${pl.extent === 1 ? '' : 's'} of the ${plates} (column order: A1, B1, … H1, A2, …)${swapNote}`)
          if (pl.inLoop) emit(`#   the nozzle layout changes inside the loop: each change starts a fresh column of tips`)
          if (!pl.inLoop) for (const b of pl.blocks) if (b.kind === 'multi') useNozzles(b.pip, b.n)
          if (pl.qMulti && !pl.inLoop) useNozzles(pl.qp, pl.blocks.find(b => b.kind === 'multi').n)
          emitLists()
          for (const u of units) emit(`${startsVar(u)} = [${u.points.map(p => p.abs).join(', ')}]  # first sample well of each time point${units.length > 1 ? ` for group ${u.no}` : ''}, across all plates on the deck`)
          if (pl.usesGroups) emit(`swap_before = {${[...pl.swaps.entries()].map(([i, plates]) => `${i}: ${py(swapMsg(plates))}`).join(', ')}}  # time points that start on a fresh sample plate`)
          else emit(`fresh_plate_before = ${pl.fresh.size ? '{' + [...pl.fresh].join(', ') + '}' : 'set()'}  # time points that begin on fresh sample labware`)
          emit(`series_t0 = time.monotonic()`)
          emit(`for i in range(${count}):`)
          const firstAtZero = s.firstAtZero !== false
          emit(`    wait_until(series_t0 + ${firstAtZero ? 'i' : '(i + 1)'} * ${pyNum(iv)} * 60)`)
          emit(`    protocol.comment(f"Time point {i + 1}/${count} at t = {${firstAtZero ? 'i' : '(i + 1)'} * ${pyNum(iv)}} min")`)
          if (pl.usesGroups) {
            emit(`    if i in swap_before:`)
            emit(`        protocol.pause(swap_before[i])`)
          } else {
            emit(`    if i in fresh_plate_before:`)
            emit(`        protocol.pause(${py(SWAP_MSG)})`)
          }
          if (pl.pauseEvery > 0) { emit(`    if i > 0 and i % ${pl.pauseEvery} == 0:`); emit(`        protocol.pause(${py(pl.pauseMessage)})`) }
          if (!many) emit(`    dests = ${destExpr(units[0], one, `${startsVar(units[0])}[i]`)}`)
          // Everything inside the loop is one level deeper: emit, then indent.
          const loopStart = L.length
          // What the loop body will do to the lid, captured before the emission
          // moves it, so the preview below replays exactly the same moves.
          const lid = lidPlan({ loop: true })
          const restore = beforePipetting({ record: false, loop: true })
          emitRound((u) => `${startsVar(u)}[i]`)
          restore()
          for (let k = loopStart; k < L.length; k++) L[k] = '    ' + L[k]
          // The preview walks the time points the loop will run.
          const t0 = clock
          const shaking = usesHS && hsRpm > 0 ? hsRpm : 0
          for (let i = 0; i < count; i++) {
            const tMin = (firstAtZero ? i : i + 1) * iv
            const target = t0 + tMin * 60
            if (target > clock) act({ kind: 'wait', text: `Wait for time point ${i + 1}/${count} (t = ${pyNum(tMin)} min)`, durationSec: target - clock })
            act({ kind: 'comment', text: `Time point ${i + 1}/${count} at t = ${pyNum(tMin)} min` })
            const swapped = pl.usesGroups ? pl.swaps.get(i) : (pl.fresh.has(i) ? sampleSlots.map((_, k) => k) : null)
            if (swapped) act({ kind: 'swap', userAction: true, text: pl.usesGroups ? swapMsg(swapped) : SWAP_MSG,
                               dst: { slot: sampleSlots[swapped[0]], var: 'sample_plates', wells: [], slots: swapped.map(k => sampleSlots[k]) } })
            if (pl.pauseEvery > 0 && i > 0 && i % pl.pauseEvery === 0) act({ kind: 'pause', userAction: true, text: `Paused: ${pl.pauseMessage} — press Resume in the Opentrons App` })
            if (lid.open) { lidOpen = true; act({ kind: 'tc', text: 'Thermocycler: open the lid for sampling', dst: { slot: '7', var: 'tc', wells: [] }, durationSec: 30 }) }
            if (shaking) { hsRpm = 0; act({ kind: 'hs', text: 'Heater-Shaker: stop shaking for sampling', dst: { slot: String(cfg.deck.heaterShaker), var: 'hs', wells: [] }, durationSec: 5 }) }
            sampleRound(i, `Time point ${i + 1}: `)
            if (lid.close) { lidOpen = false; act({ kind: 'tc', text: `Thermocycler: close the lid again${mod.tcBlock != null ? ` — the block stays at ${pyNum(mod.tcBlock)} °C` : ''}`, dst: { slot: '7', var: 'tc', wells: [] }, durationSec: 30 }) }
            if (shaking) { hsRpm = shaking; act({ kind: 'hs', text: `Heater-Shaker: shake again at ${pyNum(shaking)} rpm`, dst: { slot: String(cfg.deck.heaterShaker), var: 'hs', wells: [] }, durationSec: 5 }) }
          }
        } else {
          const spans = spansOfCells(units.flatMap(u => cellsAt(startAt(u, 0), u.fillOffsets)))
          emit(`# Step ${n}: take ${pyNum(pl.vol)} µL from ${fromWhat} into ${spans.map(spanWord).join(' + ')}${pl.mirror ? pl.mirror.kind === 'rows' ? ', a row band per time point' : ', laid out as on the plate' : ''}${many ? '' : ` (${one.pip.var})`}`)
          if (!pl.inLoop) for (const b of pl.blocks) if (b.kind === 'multi') useNozzles(b.pip, b.n)
          if (pl.qMulti && !pl.inLoop) useNozzles(pl.qp, pl.blocks.find(b => b.kind === 'multi').n)
          emitLists()
          const swapped = pl.usesGroups ? pl.swaps.get(0) : (pl.fresh.has(0) ? sampleSlots.map((_, k) => k) : null)
          if (swapped) {
            const msg = pl.usesGroups ? swapMsg(swapped) : SWAP_MSG
            emit(`protocol.pause(${py(msg)})`)
            act({ kind: 'swap', userAction: true, text: msg, dst: { slot: sampleSlots[swapped[0]], var: 'sample_plates', wells: [], slots: swapped.map(k => sampleSlots[k]) } })
          }
          if (!many) emit(`dests = ${destExpr(units[0], one, startAt(units[0], 0))}`)
          const restore = beforePipetting()
          emitRound((u) => startAt(u, 0))
          sampleRound(0, '')
          restore()
        }
        emit()
        break
      }
      case 'custom': {
        const code = String(s.code || '').replace(/\r\n?/g, '\n').replace(/\s+$/, '')
        if (!code.trim()) break
        emit(`# Step ${n}: custom`)
        for (const line of code.split('\n')) L.push(line.trim() ? '    ' + line : '')
        act({ kind: 'custom', text: `Custom Python (${code.split('\n').filter(l => l.trim()).length} lines) — not previewed` })
        emit()
        break
      }
      default:
        warn(`Step ${n}: unknown step type "${s.type}" was skipped.`)
    }
  }
  if (!steps.length) emit('protocol.comment("No steps — add a Build plate step.")')
  if (hsRpm > 0 || hsHeating) warn(`The Heater-Shaker is still ${hsRpm > 0 && hsHeating ? 'heating and shaking' : hsRpm > 0 ? 'shaking' : 'heating'} when the protocol ends — the robot does not switch it off by itself. Add a Heater-Shaker step set to off, unless that is intended.`)
  for (const p of pipettes) if (p.nozzles !== 8) { useNozzles(p, 8); emit() }
  emit('protocol.comment("Done.")')

  if (appliedOffsets.length && !offsetsWorkAt(cfg.apiLevel)) {
    warn(`Labware offsets: set_offset() does not exist in apiLevel ${OFFSET_API_GAP[0]}–${OFFSET_API_GAP[1]}, so the robot refuses this file as it stands. Choose apiLevel 2.18 or newer.`)
  }

  // Trailing blank lines inside run() are noise; one newline ends the file.
  while (L.length && L[L.length - 1] === '') L.pop()
  const head = []
  appliedOffsets.sort((a, b) => Number(a.slot) - Number(b.slot))   // like the DECK block above
  if (appliedOffsets.length) {
    head.push('#')
    head.push('# LABWARE OFFSETS  (from Labware Position Check — mm right / back / up)')
    for (const o of appliedOffsets) head.push(`#   slot ${o.slot.padStart(2)}  ${oneLine(o.what).padEnd(44)} x ${o.x.toFixed(2).padStart(6)}   y ${o.y.toFixed(2).padStart(6)}   z ${o.z.toFixed(2).padStart(6)}`)
  }
  if (blocking.length) {
    head.push('#')
    head.push("# CAN'T DO AS SET (the file stops at its first line until these are fixed)")
    for (const b of blocking) head.push(`#   - Step ${b.step} · ${b.label}: ${oneLine(b.message)}`)
  }
  if (warnings.length) {
    head.push('#')
    head.push('# CHECK BEFORE RUNNING')
    for (const w of warnings) head.push(`#   - ${oneLine(w)}`)
  }
  H.splice(headerAt, 0, ...head)
  // A pipette the user chose by name is never quietly replaced: a step that
  // cannot be done as set stops the run at its first line instead, so the
  // Opentrons App refuses the file rather than sampling with the wrong pipette.
  if (blocking.length) {
    const at = H.findIndex(l => l.startsWith('def run('))
    if (at >= 0) H.splice(at + 1, 0,
      `    # ── CAN'T DO AS SET ── fix the step in the Boekhoven Lab Assistant, then export again`,
      `    raise RuntimeError(${py(blocking.map(b => `Step ${b.step} · ${b.label} — can't do as set: ${oneLine(b.message)}`).join(' | '))})`,
      '')
  }
  const code = [...H, ...L].join('\n') + '\n'

  const summary = {
    // One row per occupied slot, with enough about what sits there to draw it.
    deck: deckEntries.map(([slot, o]) => ({
      slot, what: o.what, role: o.role || (o.module ? 'module' : ''), moduleType: o.moduleType || '', anchor: o.anchor !== false,
      kind: o.lw?.kind || '', name: o.lw?.name || '', label: o.lw?.label || '', rows: o.lw?.rows || 0, cols: o.lw?.cols || 0, pipette: o.pipette || '',
      onModule: o.onModule ? { kind: o.onModule.kind, name: o.onModule.name, label: o.onModule.label, rows: o.onModule.rows, cols: o.onModule.cols } : null,
    })),
    sources: sources.map(d => ({ key: d.key, name: d.name, code: d.code, stock: d.stock, unit: d.unit, isFill: d.isFill, isQuench: !!d.isQuench,
                                 linked: d.linked, unlinked: !!d.unlinked, included: d.included !== false, rack: d.rack || '', well: d.well || '',
                                 demandUl: round2(d.totalUl), loadUl: d.loadUl, wells: d.transfers.length, overCapacity: !!d.overCapacity,
                                 columns: d.columnGroups?.length || 0 })),
    excluded: demands.filter(d => !d.included).map(d => ({ key: d.key, name: d.name })),
    pipettes: pipettes.map(p => ({ mount: p.mount, name: p.def.name, var: p.var, channels: p.def.channels, tipsNeeded: p.tipsNeeded, perRack: p.perRack, tipSlots: p.tipSlots, tipRack: p.tipName })),
    columnLabware: columnLw?.name || '',
    sampleWellsUsed: sampleCursor,   // positions spent, the empty rows of a plate layout included
    sampleWellsFilled: sampleFilled,
    // What each sampling step does, for the dialog: who takes which wells, and
    // where every one of them lands. Read from the same walk that wrote the
    // Python and the run preview, so the three cannot disagree.
    sampling: Object.fromEntries([...samplePlans.entries()].filter(([, pl]) => pl.form).map(([id, pl]) => [id, {
      pinned: pl.units[0].plan.pinned, policy: pl.units[0].plan.policy,
      groups: pl.units.map(u => ({
        no: u.no, wells: u.wells, plate: u.plate, slot: sampleSlots[u.plateIdx] || null, layout: u.shape ? u.shape.kind : 'packed', start: u.start,
        runs: u.plan.runs.map(r => ({ wells: r.wells, n: r.n, kind: r.kind, address: r.address })),
        blocks: u.blocks.map(b => ({ key: b.key, pipette: b.pip.var, channels: b.pip.def.channels, nozzles: b.kind === 'multi' ? b.n : 0, label: b.pip.def.label,
                                     strokes: b.strokes.map(x => ({ address: x.address, wells: x.wells })), tipsPerPoint: b.tipsPerPoint, configures: !!(pl.inLoop && b.configure) })),
        extent: u.extent, filled: u.filled,
      })),
      // Kept flat as well, so a step with one group reads as it always has.
      layout: pl.mirror ? pl.mirror.kind : 'packed',
      runs: pl.units[0].plan.runs.map(r => ({ wells: r.wells, n: r.n, kind: r.kind, address: r.address })),
      blocks: pl.blocks.map(b => ({ key: b.key, pipette: b.pip.var, channels: b.pip.def.channels, nozzles: b.kind === 'multi' ? b.n : 0, label: b.pip.def.label,
                                    strokes: b.strokes.map(x => ({ address: x.address, wells: x.wells })), tipsPerPoint: b.tipsPerPoint, configures: !!(pl.inLoop && b.configure) })),
      points: pl.points, extent: pl.extent, filled: pl.filledPerPoint, layoutChanges: pl.inLoop, swaps: [...(pl.swaps?.keys() || [])],
    }])),
    sampleCapacity: samplesLw ? samplesLw.rows * samplesLw.cols * sampleSlots.length : 0,   // everything on the deck at once
    samplePlates: samplesLw && usesSamples ? Math.max(1, Math.ceil(sampleCursor / (samplesLw.rows * samplesLw.cols))) : 0,
    samplePlatesOnDeck: samplesLw ? sampleSlots.length : 0,
    sampleSwaps,
    prefilled,
    usesPartial,
    // Slots a partly tipped 8-channel cannot reach into, because of what stands
    // behind them. Empty ones count too: the UI offers them for a sample plate.
    partialBlockedSlots: OT2_SLOTS.filter(s => blocksPartialBehind(behindEntry(slotBehind(s)), occupancy[s])),
    offsets: appliedOffsets,
    modules: { thermocycler: usesTC, temperature: usesTemp, heaterShaker: usesHS, magnetic: usesMag },
    steps: steps.length,
    plateSlot, sampleSlots: samplesLw ? sampleSlots : [],
    runSec: Math.round(clock),
  }
  // ── Run clearance: the warnings sorted into the checks the Opentrons App would
  // fail the file on (deck, tips, labware, modules, apiLevel), plus the ones only
  // this side knows (volumes a pipette cannot do accurately, what is scheduled).
  const refills = actions.filter(a => a.kind === 'refill').length
  const CHECKS = [
    { id: 'deck', label: 'Deck layout', re: /deck conflict|not an OT-2 deck slot|Heater-Shaker can|recommends slots|next to the Heater-Shaker|left or right of the Heater-Shaker|fits the Thermocycler|cannot be loaded on the/i, info: `${deckEntries.length} slots in use` },
    { id: 'tips', label: 'Tips', re: /tip rack|tips \(|tip columns|needs \d+ tips/i, info: refills ? `${refills} refill pause${refills === 1 ? '' : 's'} scheduled` : 'the loaded racks cover the run' },
    { id: 'samples', label: 'Sample plate', re: /sample well|sample labware|sample plate|time point/i, info: usesSamples ? `${sampleFilled === sampleCursor ? sampleCursor : `${sampleFilled} of ${sampleCursor}`} wells over ${summary.samplePlates} plate${summary.samplePlates === 1 ? '' : 's'}${sampleSlots.length > 1 ? `, ${sampleSlots.length} on the deck at a time` : ''}${sampleSwaps ? ` — ${sampleSwaps} plate change${sampleSwaps === 1 ? '' : 's'} scheduled` : ''}` : 'no sampling' },
    { id: 'liquids', label: 'Liquids and their containers', re: /needs about|no free position|already taken|has no position|reservoir, so the single|touch tip/i, info: prefilled ? `${included.length} already in the plate, ${sources.filter(d => d.rack).length} on the deck` : `${sources.filter(d => d.rack).length} liquids placed` },
    { id: 'offsets', label: 'Labware offsets', re: /offset/i, info: appliedOffsets.length ? `${appliedOffsets.length} applied from Labware Position Check` : 'none — the robot uses its own calibration' },
    { id: 'api', label: 'Robot software', re: /apiLevel/i, info: `apiLevel ${cfg.apiLevel}` },
    { id: 'modules', label: 'Modules', re: /Thermocycler|Temperature Module|Heater-Shaker|°C|rpm|profile|magnet/i, info: [usesTC && 'Thermocycler', usesTemp && 'Temperature Module', usesHS && 'Heater-Shaker', usesMag && 'Magnetic Module'].filter(Boolean).join(', ') || 'none' },
    { id: 'pipettes', label: 'Pipettes and volumes', re: /pipette|minimum|maximum|strokes|8-channel|single-channel|mount/i, info: pipettes.map(p => `${p.var} (${p.def.min}–${p.def.max} µL)`).join(', ') || 'none loaded' },
    { id: 'steps', label: 'Steps', re: /./, info: `${steps.length} step${steps.length === 1 ? '' : 's'}, ${actions.length} actions, about ${Math.round(clock / 60)} min` },
  ]
  const clearance = CHECKS.map(c => ({ id: c.id, label: c.label, info: c.info, notes: [] }))
  for (const w of [...blocking.map(b => `${b.label}: can't do as set — ${b.message}`), ...warnings]) {
    const c = CHECKS.findIndex(x => x.re.test(w))
    clearance[c >= 0 ? c : clearance.length - 1].notes.push(w)
  }
  for (const c of clearance) c.ok = c.notes.length === 0
  return { code, warnings, blocking, summary, actions, clearance }
}

/** A filename that says which plate it is and when it was made. */
export function opentronsFilename(plate, today = '') {
  const safe = String(plate?.name || 'plate').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'plate'
  return `OT2_${safe}${today ? `_${today}` : ''}.py`
}
