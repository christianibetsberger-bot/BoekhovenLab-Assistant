// Which letter a compound sits on.
//
// A, B, C and D are slots, not identities: the screen decides what goes in them,
// and an imported plate fills them in whatever order it was pipetted. So the
// allocation has to be changeable afterwards — polyU landing on D when it belongs
// on A is a labelling accident, not a result.
//
// The catch is that a slot owns more than its name. It owns the range, the step,
// the stock, the unit, the inventory link, the solvent, every logged value on
// every experiment, and any dependency that points at it. Moving the name alone
// would leave the ledger's numbers where they were and silently relabel every
// point in the dataset — so this moves all of it, or none of it.

export const COMPONENT_SLOTS = ['anion', 'cation', 'salt', 'compD']
export const SLOT_LETTERS = Object.freeze({ anion: 'A', cation: 'B', salt: 'C', compD: 'D' })

// Config fields named `<slot><Suffix>`.
const SLOT_SUFFIXES = ['Name', 'Min', 'Max', 'Step', 'Unit', 'Inv', 'SearchQuery', 'SearchScope', 'Medium']

// The stock concentration is the one field that breaks the pattern: `stockAnion`,
// not `anionStock`.
export const stockKeyOf = (slot) => 'stock' + slot.charAt(0).toUpperCase() + slot.slice(1)

const swapKeys = (obj, ka, kb) => {
  if (!(ka in obj) && !(kb in obj)) return
  const tmp = obj[ka]
  obj[ka] = obj[kb]
  obj[kb] = tmp
}

/**
 * Swap two component slots, in place.
 *
 * @param config      the screen config (mutated)
 * @param rows        every row carrying per-slot values — experiments, suggestions (mutated)
 * @param a, b        slot keys, e.g. 'anion' and 'compD'
 * @returns true when something was swapped
 */
export function swapComponentSlots(config, rows, a, b) {
  if (!config || a === b) return false
  if (!COMPONENT_SLOTS.includes(a) || !COMPONENT_SLOTS.includes(b)) return false

  for (const suffix of SLOT_SUFFIXES) swapKeys(config, a + suffix, b + suffix)
  swapKeys(config, stockKeyOf(a), stockKeyOf(b))

  // The measured values move with the slot. Missing means zero, not missing: a
  // component that was never in a well was in it at zero.
  for (const row of rows || []) {
    if (!row) continue
    const av = Number(row[a]) || 0
    row[a] = Number(row[b]) || 0
    row[b] = av
  }

  // A → B link written before the swap still means the same two compounds.
  for (const dep of config.dependencies || []) {
    if (!dep) continue
    if (dep.source === a) dep.source = b
    else if (dep.source === b) dep.source = a
    if (dep.target === a) dep.target = b
    else if (dep.target === b) dep.target = a
  }

  return true
}
