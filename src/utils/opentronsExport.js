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
    case 'sample':        return { ...base, wells: 'all', volume: 10, pipette: 'auto', newTip: 'always', mixBeforeReps: 0, mixBeforeUl: '', quenchName: '', quenchUl: '' }
    case 'series':        return { ...base, count: 6, intervalMinutes: 30, firstAtZero: true, wells: 'all', volume: 10, pipette: 'auto', newTip: 'always', mixBeforeReps: 0, mixBeforeUl: '', quenchName: '', quenchUl: '' }
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
    pipettes: { left: 'p300_single_gen2', right: 'p20_single_gen2' },
    tipRacks: { left: '', right: '' },          // '' = the pipette's default rack
    flowRates: { left: { aspirate: '', dispense: '' }, right: { aspirate: '', dispense: '' } },
    target: { on: 'deck', slot: '1', labware: defaultTargetLabware(plate?.format) },
    modules: { thermocycler: 'thermocyclerModuleV1', temperature: 'temperature module gen2', heaterShaker: 'heaterShakerModuleV1', magnetic: 'magnetic module gen2' },
    deck: { stocks: '4', bulk: '5', samples: '2', column: '6', temperature: '9', heaterShaker: '10', magnetic: '3' },
    stocksLabware: 'opentrons_24_tuberack_nest_1.5ml_snapcap',
    bulkLabware: 'opentrons_15_tuberack_falcon_15ml_conical',
    columnLabware: 'nest_12_reservoir_15ml',           // where the 8-channel draws from
    samplesLabware: 'nest_96_wellplate_100ul_pcr_full_skirt',
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
  c.steps = Array.isArray(cfg?.steps) && cfg.steps.length ? cfg.steps.map(s => ({ ...newOt2Step(s.type), ...s })) : d.steps
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

  const steps = (cfg.steps || []).filter(s => s && s.type)
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
  const sources = [...included, ...quenchDemands.values()]

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

  if (usesTC) for (const s of TC_SLOTS) occupy(s, 'the Thermocycler', { module: true })
  if (usesTemp) occupy(cfg.deck.temperature, 'the Temperature Module', { module: true })
  const hsSlot = usesHS ? String(cfg.deck.heaterShaker) : null
  if (usesHS) {
    occupy(hsSlot, 'the Heater-Shaker', { module: true })
    if (hsSlot === '9') warn('The Heater-Shaker cannot go in slot 9 — the fixed trash blocks its locking screw.')
    else if (!OT2_MODULES.heater_shaker.slots.includes(hsSlot)) warn(`Opentrons recommends slots 1, 3, 4, 6, 7 or 10 for the Heater-Shaker on an OT-2 (never 9); slot ${hsSlot} loads, but check the pipette can reach everything around it.`)
  }
  if (usesMag) occupy(cfg.deck.magnetic, 'the Magnetic Module', { module: true })
  const targetSlot = targetOn === 'deck' ? String(cfg.target.slot || '1') : null
  if (targetSlot) occupy(targetSlot, `the plate "${plate?.name || 'plate'}"`, { lw: targetLw })

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
  const selectionPre = new Map()   // step id -> { wells, groups } for sampling and mixing
  for (const s of stepsOf('sample', 'series', 'mix')) {
    const label = s.type === 'series' ? 'Sampling series' : s.type === 'sample' ? 'Take samples' : 'Mix wells'
    const wells = wellList(s.wells, label)
    const tw = new Set(wells.map(targetWell))
    let mg = []
    if (multis.length && !mountIsSingle(s.pipette)) {
      mg = groups.filter(g => g.wells.every(w => tw.has(w)))
      if (mg.length * 8 !== tw.size) mg = []                       // only whole columns, nothing left over
      const vol = num(s.volume)
      if (mg.length && vol > 0 && !multiCanDo(vol)) mg = []
      if (mg.length && s.type !== 'mix' && samplesLw && samplesLw.rows !== 8) {
        warn(`${label}: the 8-channel needs an 8-row sample labware and ${samplesLw.label} is not one — the single-channel takes these samples.`)
        mg = []
      }
    }
    selectionPre.set(s.id, { wells, groups: mg })
    if (mg.length && s.type !== 'mix') {
      const qn = String(s.quenchName || '').trim()
      const q = qn ? quenchDemands.get('quench:' + qn.toLowerCase()) : null
      if (q) q.wantsColumn = true
    }
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
  for (const r of Object.values(racks)) if (r.any) occupy(r.slot, r.label, { lw: r.lw })
  if (samplesLw) occupy(String(cfg.deck.samples || '2'), 'the sample labware', { lw: samplesLw })

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
  // Tips are counted in pickups: an 8-channel takes a whole column of tips each time.
  const tipCount = (p, n) => { if (p) p.tipsNeeded += n }

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
          tipCount(p, s.newTip === 'always' && s.mode !== 'distribute' ? transfers.length : 1)
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
        tipCount(p, s.newTip === 'always' && s.mode !== 'distribute' ? transfers.length : 1)
      }
    }
    if (!plan.length) warn('Build plate: nothing to pipette — the plate has no included stocks with volumes.')
    // Reservoirs refuse touch_tip outright (a labware quirk the robot enforces).
    if (s.touchTip && plan.some(b => racks[b.src.rack].lw.kind === 'reservoir')) warn('Build plate: touch tip is not allowed on reservoirs — the robot refuses it. Untick touch tip, or keep those liquids in tube racks.')
    plan.columns = columns
    buildPlans.push(plan)
  }

  // Sampling: destinations are handed out column by column, continuing across
  // steps. 8-channel sampling starts on a fresh column of the sample labware.
  let sampleCursor = 0
  const samplePlans = new Map()
  for (const s of stepsOf('sample', 'series')) {
    const label = s.type === 'series' ? 'Sampling series' : 'Take samples'
    const pre = selectionPre.get(s.id)
    const multi = pre.groups.length > 0
    const units = multi ? pre.groups.map(g => g.address) : pre.wells.map(targetWell)
    const vol = num(s.volume) || 0
    if (!(vol > 0)) warn(`${label}: sample volume must be a positive number of µL.`)
    const count = s.type === 'series' ? Math.max(1, Math.floor(Number(s.count) || 0)) : 1
    const pref = multi ? s.pipette : (mountIsMulti(s.pipette) ? 'auto' : s.pipette)
    const p = vol > 0 ? choosePipette(vol, pref, `${label} (${pyNum(vol)} µL)`, { multi }) : null
    const start = multi ? Math.ceil(sampleCursor / 8) * 8 : sampleCursor
    const need = units.length * (multi ? 8 : 1) * count
    sampleCursor = start + need
    const capacity = samplesLw ? samplesLw.rows * samplesLw.cols : 0
    if (sampleCursor > capacity) warn(`${label}: needs ${need} sample wells (${units.length * (multi ? 8 : 1)} wells × ${count} time point${count > 1 ? 's' : ''}) but only ${Math.max(0, capacity - start)} are left on the ${samplesLw?.label || 'sample labware'}. Reduce the count, sample fewer wells, or choose a larger labware.`)
    if (samplesLw && vol > samplesLw.maxUl) warn(`${label}: ${pyNum(vol)} µL exceeds a ${samplesLw.label} well (${samplesLw.maxUl} µL).`)
    const qv = num(s.quenchUl), qn = String(s.quenchName || '').trim()
    const quench = qn && qv > 0 ? quenchDemands.get('quench:' + qn.toLowerCase()) : null
    const qMulti = !!(multi && quench?.useMulti)
    const qp = quench ? choosePipette(qv, 'auto', `${label}: quench "${qn}"`, { multi: qMulti }) : null
    tipCount(p, s.newTip === 'once' ? count : units.length * count)
    if (quench) tipCount(qp, count)
    if (s.type === 'series') {
      const iv = num(s.intervalMinutes)
      if (!(iv > 0)) warn('Sampling series: the interval must be a positive number of minutes.')
    }
    samplePlans.set(s.id, { wells: pre.wells, units, multi, vol, count, pip: p, start, quench, qp, qv, qMulti })
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

  // ── Tip racks: as many as the count needs, in the free slots ──
  // Slots beside the Heater-Shaker come last (and never left/right of it for a
  // rack taller than it allows); the racks are all taller than a plate.
  const hsNeighbours = usesHS ? adjacentSlots(hsSlot) : []
  const hsSides = usesHS ? adjacentSlots(hsSlot, { xOnly: true }) : []
  const freeSlots = (lw) => {
    const free = TIP_SLOT_ORDER.filter(s => !occupancy[s] && !(tooTallBesideHS(lw) && hsSides.includes(s)))
    return [...free.filter(s => !hsNeighbours.includes(s)), ...free.filter(s => hsNeighbours.includes(s))]
  }
  for (const p of pipettes) {
    p.perRack = p.def.channels === 8 ? 12 : 96     // an 8-channel empties a rack in 12 pickups
    const racksNeeded = Math.max(1, Math.ceil(p.tipsNeeded / p.perRack))
    p.tipSlots = []
    for (let i = 0; i < racksNeeded; i++) {
      const slot = freeSlots(p.tipLw)[0]
      if (!slot) break
      occupancy[slot] = { what: `${p.tipLw?.label || p.tipName} (${p.var})`, lw: p.tipLw }
      p.tipSlots.push(slot)
    }
    p.tipCapacity = p.tipSlots.length * p.perRack
    if (p.tipSlots.length < racksNeeded) {
      const unit = p.def.channels === 8 ? 'tip columns' : 'tips'
      warn(`${p.def.label} needs ${p.tipsNeeded} ${unit} (${racksNeeded} racks) but only ${p.tipSlots.length} rack${p.tipSlots.length === 1 ? '' : 's'} fit on the deck — the run will pause ${Math.ceil(p.tipsNeeded / Math.max(p.perRack, p.tipCapacity)) - 1}× for you to refill them. "One tip per stock" needs far fewer.`)
    }
  }
  // When any pipette will run dry, the protocol keeps its own count and pauses
  // for a refill just before the step that would fail.
  const needRefill = pipettes.some(p => p.tipsNeeded > p.tipCapacity)
  const tipCall = (p, n, indent = '') => { if (needRefill && p && n > 0) emit(`${indent}need_tips(${p.var}, ${n})`) }
  const chunked = (items, size) => {
    if (!needRefill || items.length <= size) return [items]
    const out = []
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
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
  const deckRows = Object.entries(occupancy).sort((a, b) => Number(a[0]) - Number(b[0])).map(([slot, o]) => [slot, o.what])
  for (const [slot, what] of deckRows) H.push(`#   slot ${slot.padStart(2)}  ${what}`)
  H.push('#   slot 12  fixed trash')
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
  if (warnings.length) {
    H.push('#')
    H.push('# CHECK BEFORE RUNNING')
    for (const w of warnings) H.push(`#   - ${oneLine(w)}`)
  }
  H.push('#')
  H.push('# Simulate before running:  opentrons_simulate this_file.py')
  H.push('')
  H.push('from opentrons import protocol_api')
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
  }
  for (const r of ['stocks', 'bulk', 'reservoir']) {
    if (!racks[r].any) continue
    const label = { stocks: 'Stocks', bulk: 'Bulk liquids', reservoir: '8-channel reservoir' }[r]
    emit(`${racks[r].var} = protocol.load_labware(${py(racks[r].lw.name)}, ${py(racks[r].slot)}, label=${py(uniqueLabel(label))})`)
  }
  if (samplesLw) emit(`samples = protocol.load_labware(${py(samplesLw.name)}, ${py(String(cfg.deck.samples || '2'))}, label=${py(uniqueLabel('Samples'))})`)
  for (const p of pipettes) {
    if (!p.tipSlots.length) { emit(`${p.tipVar} = []  # no free slot for a tip rack — see warnings`); continue }
    emit(`${p.tipVar} = [protocol.load_labware(${py(p.tipName)}, slot) for slot in [${p.tipSlots.map(py).join(', ')}]]`)
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
  if (liquidSources.length && liquidsOk) {
    emit('# ── Liquids (the Opentrons App shows these in Labware Setup) ──')
    const colors = assignColors(BOEKHOVEN_PALETTE, liquidSources.map(d => d.key))
    liquidSources.forEach((d, i) => {
      const desc = [d.code ? `[${d.code}]` : '', d.stock != null ? `${pyNum(d.stock)} ${d.unit}` : '', d.isFill ? 'fill-up' : '', d.isQuench ? 'quench' : ''].filter(Boolean).join(' ')
      emit(`liq_${i + 1} = protocol.define_liquid(name=${py(oneLine(d.name))}, description=${py(desc)}, display_color=${py(colors[d.key] || '#0072B2')})`)
      // A reservoir column of an 8-row labware is eight wells sharing the load.
      const cw = d.rack === 'reservoir' ? columnWells(columnLw, d.well) : [d.well]
      const vol = pyNum(Math.min(d.loadUl, d.capacityUl || d.loadUl) / cw.length)
      // Well.load_liquid was deprecated in 2.22 in favour of the labware-level call.
      if (apiAtLeast(cfg.apiLevel, '2.22')) emit(`${d.rack}.load_liquid(wells=[${cw.map(py).join(', ')}], volume=${vol}, liquid=liq_${i + 1})`)
      else for (const w of cw) emit(`${d.rack}[${py(w)}].load_liquid(liquid=liq_${i + 1}, volume=${vol})`)
    })
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
  if (targetOn === 'thermocycler') { emit('tc.open_lid()  # the plate must be reachable before anything is pipetted into it'); lidOpen = true; emit() }
  if (usesHS) { emit('hs.close_labware_latch()  # the latch must be closed to shake and to hold the plate'); emit() }

  // Before any pipetting: the plate on the Thermocycler needs its lid open, and a
  // shaking Heater-Shaker blocks the pipette from every slot around it. Both are
  // put back afterwards, so a step that was set up keeps running.
  const beforePipetting = () => {
    const undo = []
    if (targetOn === 'thermocycler' && !lidOpen) { emit('tc.open_lid()'); lidOpen = true; undo.push(() => { emit('tc.close_lid()'); lidOpen = false }) }
    if (usesHS && hsRpm > 0) { const rpm = hsRpm; emit('hs.deactivate_shaker()'); hsRpm = 0; undo.push(() => { emit(`hs.set_and_wait_for_shake_speed(${pyNum(rpm)})`); hsRpm = rpm }) }
    return () => undo.forEach(fn => fn())
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
          const kw = transferKwargs(s).map(k => k.replace('MIX_VOLUME', pyNum(Math.min(b.pip.def.max, Math.max(b.pip.def.min, b.transfers[0].volume)))))
          const oneTip = s.mode === 'distribute' || s.newTip === 'once'
          for (const chunk of chunked(b.transfers, oneTip ? b.transfers.length : Math.max(1, b.pip.tipCapacity))) {
            tipCall(b.pip, oneTip ? 1 : chunk.length)
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
        if (s.lid === 'open') { emit('tc.open_lid()'); lidOpen = true }
        if (s.lid === 'close') { emit('tc.close_lid()'); lidOpen = false }
        if (isSet(s.lidTemp)) emit(`tc.set_lid_temperature(${pyNum(s.lidTemp)})`)
        if (isSet(s.blockTemp)) {
          const args = [pyNum(s.blockTemp)]
          if (isSet(s.holdMinutes) && Number(s.holdMinutes) > 0) args.push(`hold_time_minutes=${pyNum(s.holdMinutes)}`)
          if (Number(plate?.targetVolume) > 0) args.push(`block_max_volume=${pyNum(plate.targetVolume)}`)
          emit(`tc.set_block_temperature(${args.join(', ')})${isSet(s.holdMinutes) && Number(s.holdMinutes) > 0 ? '  # returns after the hold' : ''}`)
        }
        if (s.deactivate) { emit('tc.deactivate_lid()'); emit('tc.deactivate_block()') }
        emit()
        break
      }
      case 'tc_profile': {
        const prof = (s.profile || []).filter(st => isSet(st.temp) && isSet(st.seconds))
        emit(`# Step ${n}: thermocycler profile — ${prof.map(st => `${pyNum(st.temp)} °C ${pyNum(st.seconds)} s`).join(' → ')} × ${Math.max(1, Math.floor(Number(s.cycles) || 1))}`)
        if (lidOpen) { emit('tc.close_lid()'); lidOpen = false }
        if (isSet(s.lidTemp)) emit(`tc.set_lid_temperature(${pyNum(s.lidTemp)})`)
        emit('tc.execute_profile(')
        emit('    steps=[')
        for (const st of prof) emit(`        {"temperature": ${pyNum(st.temp)}, "hold_time_seconds": ${pyNum(st.seconds)}},`)
        emit('    ],')
        emit(`    repetitions=${Math.max(1, Math.floor(Number(s.cycles) || 1))},`)
        const bmv = isSet(s.blockMaxUl) ? Number(s.blockMaxUl) : (Number(plate?.targetVolume) > 0 ? Number(plate.targetVolume) : null)
        if (bmv) emit(`    block_max_volume=${pyNum(bmv)},`)
        emit(')')
        if (isSet(s.finalTemp)) emit(`tc.set_block_temperature(${pyNum(s.finalTemp)})`)
        emit()
        break
      }
      case 'temperature': {
        if (s.deactivate) { emit(`# Step ${n}: temperature module off`); emit('temp_mod.deactivate()') }
        else { emit(`# Step ${n}: temperature module → ${pyNum(s.temp)} °C (waits until reached)`); emit(`temp_mod.set_temperature(celsius=${pyNum(s.temp)})`) }
        emit()
        break
      }
      case 'heater_shaker': {
        if (s.deactivate) {
          emit(`# Step ${n}: heater-shaker off`)
          emit('hs.deactivate_shaker()'); emit('hs.deactivate_heater()'); hsRpm = 0; hsHeating = false
        } else {
          const bits = []
          if (isSet(s.temp)) bits.push(`${pyNum(s.temp)} °C`)
          if (isSet(s.rpm)) bits.push(Number(s.rpm) > 0 ? `${pyNum(s.rpm)} rpm` : 'stop shaking')
          emit(`# Step ${n}: heater-shaker — ${bits.join(', ') || 'no change'}`)
          if (isSet(s.temp)) { emit(`hs.set_and_wait_for_temperature(${pyNum(s.temp)})`); hsHeating = true }
          if (isSet(s.rpm)) {
            if (Number(s.rpm) > 0) { emit(`hs.set_and_wait_for_shake_speed(${pyNum(s.rpm)})`); hsRpm = Number(s.rpm) }
            else { emit('hs.deactivate_shaker()'); hsRpm = 0 }
          }
        }
        emit()
        break
      }
      case 'magnetic': {
        if (s.action === 'disengage') { emit(`# Step ${n}: magnets down`); emit('mag.disengage()') }
        else { emit(`# Step ${n}: magnets up`); emit(isSet(s.height) ? `mag.engage(height_from_base=${pyNum(s.height)})` : 'mag.engage()') }
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
        emit()
        break
      }
      case 'pause': {
        emit(`# Step ${n}: pause until someone resumes the run`)
        emit(`protocol.pause(${py(oneLine(s.message || 'Continue when ready'))})`)
        emit()
        break
      }
      case 'comment': {
        if (String(s.text || '').trim()) emit(`protocol.comment(${py(oneLine(s.text))})`)
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
        if (s.newTip === 'once') tipCall(pl.pip, 1)
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
        if (!pl || !pl.pip || !pl.units.length || !(pl.vol > 0)) break
        const isSeries = s.type === 'series'
        const nU = pl.units.length
        const kw = [`new_tip=${py(s.newTip === 'once' ? 'once' : 'always')}`, 'blow_out=True', 'blowout_location="destination well"']
        const mb = Math.floor(Number(s.mixBeforeReps) || 0)
        if (mb > 0) kw.push(`mix_before=(${mb}, ${isSet(s.mixBeforeUl) ? pyNum(s.mixBeforeUl) : pyNum(Math.min(pl.pip.def.max, Math.max(pl.pip.def.min, pl.vol)))})`)
        const srcList = `[plate[w] for w in ${isSeries ? 'series_wells' : 'sample_wells'}]`
        const fromWhat = pl.multi ? `${nU} column${nU === 1 ? '' : 's'} (${nU * 8} wells) with the 8-channel` : `${nU} well${nU === 1 ? '' : 's'}`
        // With the 8-channel, destinations are whole columns of the sample labware.
        const col0 = pl.start / 8
        const destsExpr = (count) => pl.multi
          ? `[col[0] for col in samples.columns()[${col0}:${col0 + nU * count}]]`
          : `samples.wells()[${pl.start}:${pl.start + nU * count}]`
        // A single-channel quench into 8-channel destinations must visit every well of each column.
        const quenchDests = pl.multi && !pl.qMulti ? '[w for a in dests for w in samples.columns_by_name()[a.well_name[1:]]]' : 'dests'
        if (isSeries) {
          const iv = num(s.intervalMinutes) || 0
          const count = pl.count
          emit(`# Step ${n}: sampling series — ${count} time points every ${pyNum(iv)} min, ${pyNum(pl.vol)} µL from ${fromWhat} (${pl.pip.var})`)
          if (pl.multi) emit(`#   time point i fills samples columns ${col0 + 1} + i*${nU} … (a well name below means its whole column)`)
          else emit(`#   time point i fills samples wells [${pl.start} + i*${nU} : ${pl.start} + (i+1)*${nU}] in column order (A1, B1, … H1, A2, …)`)
          emit(`series_wells = [${pl.units.map(py).join(', ')}]`)
          emit(`series_dests = ${destsExpr(count)}`)
          emit(`series_t0 = time.monotonic()`)
          emit(`for i in range(${count}):`)
          const firstAtZero = s.firstAtZero !== false
          emit(`    wait_until(series_t0 + ${firstAtZero ? 'i' : '(i + 1)'} * ${pyNum(iv)} * 60)`)
          emit(`    protocol.comment(f"Time point {i + 1}/${count} at t = {${firstAtZero ? 'i' : '(i + 1)'} * ${pyNum(iv)}} min")`)
          emit(`    dests = series_dests[i * ${nU}:(i + 1) * ${nU}]`)
          // Everything inside the loop is one level deeper: emit, then indent.
          const loopStart = L.length
          const restore = beforePipetting()
          if (pl.quench && pl.qp) {
            tipCall(pl.qp, 1)
            emit(`${pl.qp.var}.transfer(${pyNum(pl.qv)}, ${pl.quench.rack}[${py(pl.quench.well)}], ${quenchDests}, new_tip="once", blow_out=True, blowout_location="destination well")  # quench first`)
          }
          tipCall(pl.pip, s.newTip === 'once' ? 1 : nU)
          emit(`${pl.pip.var}.transfer(${pyNum(pl.vol)}, ${srcList}, dests, ${kw.join(', ')})`)
          restore()
          for (let k = loopStart; k < L.length; k++) L[k] = '    ' + L[k]
        } else {
          const into = pl.multi ? `samples columns ${col0 + 1}–${col0 + nU}` : `samples wells ${pl.start}–${pl.start + nU - 1}`
          emit(`# Step ${n}: take ${pyNum(pl.vol)} µL from ${fromWhat} into ${into} (${pl.pip.var})`)
          emit(`sample_wells = [${pl.units.map(py).join(', ')}]`)
          emit(`dests = ${destsExpr(1)}`)
          const restore = beforePipetting()
          if (pl.quench && pl.qp) {
            tipCall(pl.qp, 1)
            emit(`${pl.qp.var}.transfer(${pyNum(pl.qv)}, ${pl.quench.rack}[${py(pl.quench.well)}], ${quenchDests}, new_tip="once", blow_out=True, blowout_location="destination well")  # quench first`)
          }
          tipCall(pl.pip, s.newTip === 'once' ? 1 : nU)
          emit(`${pl.pip.var}.transfer(${pyNum(pl.vol)}, ${srcList}, dests, ${kw.join(', ')})`)
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
        emit()
        break
      }
      default:
        warn(`Step ${n}: unknown step type "${s.type}" was skipped.`)
    }
  }
  if (!steps.length) emit('protocol.comment("No steps — add a Build plate step.")')
  if (hsRpm > 0 || hsHeating) warn(`The Heater-Shaker is still ${hsRpm > 0 && hsHeating ? 'heating and shaking' : hsRpm > 0 ? 'shaking' : 'heating'} when the protocol ends — the robot does not switch it off by itself. Add a Heater-Shaker step set to off, unless that is intended.`)
  emit('protocol.comment("Done.")')

  // Trailing blank lines inside run() are noise; one newline ends the file.
  while (L.length && L[L.length - 1] === '') L.pop()
  const code = [...H, ...L].join('\n') + '\n'

  const summary = {
    deck: deckRows.map(([slot, what]) => ({ slot, what })),
    sources: sources.map(d => ({ key: d.key, name: d.name, code: d.code, stock: d.stock, unit: d.unit, isFill: d.isFill, isQuench: !!d.isQuench,
                                 linked: d.linked, unlinked: !!d.unlinked, included: d.included !== false, rack: d.rack || '', well: d.well || '',
                                 demandUl: round2(d.totalUl), loadUl: d.loadUl, wells: d.transfers.length, overCapacity: !!d.overCapacity,
                                 columns: d.columnGroups?.length || 0 })),
    excluded: demands.filter(d => !d.included).map(d => ({ key: d.key, name: d.name })),
    pipettes: pipettes.map(p => ({ mount: p.mount, name: p.def.name, var: p.var, channels: p.def.channels, tipsNeeded: p.tipsNeeded, perRack: p.perRack, tipSlots: p.tipSlots, tipRack: p.tipName })),
    columnLabware: columnLw?.name || '',
    sampleWellsUsed: sampleCursor,
    sampleCapacity: samplesLw ? samplesLw.rows * samplesLw.cols : 0,
    modules: { thermocycler: usesTC, temperature: usesTemp, heaterShaker: usesHS, magnetic: usesMag },
    steps: steps.length,
  }
  return { code, warnings, summary }
}

/** A filename that says which plate it is and when it was made. */
export function opentronsFilename(plate, today = '') {
  const safe = String(plate?.name || 'plate').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'plate'
  return `OT2_${safe}${today ? `_${today}` : ''}.py`
}
