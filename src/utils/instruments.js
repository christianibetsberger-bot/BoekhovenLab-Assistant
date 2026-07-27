// Shared instrument catalogue for the booking calendar and protocols.
//
// The built-in groups below are the lab's default instruments. A lab-shared
// `instruments` Supabase table layers custom additions and "tombstones" on top:
//   • a row with hidden=false  → a custom instrument (added to its category)
//   • a row with hidden=true   → hides a built-in of that name (a tombstone)
// so instruments can be added and removed without ever editing this file.

export const INSTRUMENT_GROUPS = [
  { name: 'Electrophoresis', instruments: ['ChemiDoc Imager', 'Mini PAGE Caster', 'Mini Tetra Cell 1', 'Mini Tetra Cell 2', 'Large PAGE Caster', 'Large PAGE Cell', 'Agarose Caster', 'Agarose Cell', 'Power Supply', 'Power Supply BioRad'] },
  { name: 'Instruments', instruments: ['Peptide synthesizer', 'Fluorescence', 'Plate reader 1', 'Plate reader new 2', 'Plate reader multimode 3', 'Plate reader new-new 4', 'DSC', 'Webcam setup Lab1', 'Webcamsetup Lab3', 'Confocal microscope', 'Confocal microscope new', 'Shitty microscope', 'Incubator', 'Incubator confocal', 'ITC', '3D Printer ultimaker', '3D Printer other', 'DLS', 'Thermoshaker OHAUS', 'ThermoshakerPro 2', 'Thermo-Cycler', 'Thermocycler double', 'DNA Synthesizer', 'qPCR', 'ANDREW'] },
  { name: 'HPLC', instruments: ['HPLC-MS', 'HPLC right', 'HPLC Vanquish double right', 'HPLC Vanquish double left', 'HPLC Vanquish Single', 'prep HPLC Thermo', 'prep HPLC Agilent', 'DNA HPLC left', 'DNA HPLC right'] },
]

export const INSTRUMENT_CATEGORIES = INSTRUMENT_GROUPS.map(g => g.name)
export const BUILTIN_INSTRUMENTS = INSTRUMENT_GROUPS.flatMap(g => g.instruments)

export function isBuiltinInstrument(name) { return BUILTIN_INSTRUMENTS.includes(name) }

// Merge the built-in groups with the lab-shared `instruments` table rows,
// dropping any built-in hidden by a tombstone and appending custom additions.
export function mergeInstrumentGroups(customRows = []) {
  const hidden = new Set(customRows.filter(r => r.hidden).map(r => r.name))
  const map = new Map()
  for (const g of INSTRUMENT_GROUPS) map.set(g.name, g.instruments.filter(n => !hidden.has(n)))
  for (const r of customRows) {
    if (r.hidden) continue
    const cat = (r.category || 'Instruments').trim() || 'Instruments'
    if (!map.has(cat)) map.set(cat, [])
    if (!map.get(cat).includes(r.name)) map.get(cat).push(r.name)
  }
  return [...map.entries()]
    .map(([name, instruments]) => ({ name, instruments }))
    .filter(g => g.instruments.length)
}

export function mergeInstrumentList(customRows = []) {
  return mergeInstrumentGroups(customRows).flatMap(g => g.instruments)
}

// The category a name belongs to (built-in group, custom row, else 'Instruments').
export function categoryOf(name, customRows = []) {
  for (const g of INSTRUMENT_GROUPS) if (g.instruments.includes(name)) return g.name
  const r = customRows.find(x => x.name === name && !x.hidden)
  return r?.category || 'Instruments'
}
