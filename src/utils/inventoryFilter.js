// Inventory search used by every module that lets you pick a stock from a
// dropdown (reaction plans, matrices, screenings, well plates, phase predictor,
// lab journal). Six components carried a byte-identical copy of this.
//
// Matches the same fields the user can see in the picker — name, code, CAS — and
// restricts to one scope, because Lab and Private stocks are separate shelves.

/**
 * @param inventory store.inventory
 * @param query     free-text search (name / code / CAS), empty shows all
 * @param scope     'Global' (lab) or 'Personal'; items with no scope count as Global
 */
export function filterInventory(inventory, query, scope) {
  const term = query ? String(query).toLowerCase() : ''
  const targetScope = scope || 'Global'
  return (inventory || []).filter(item =>
    (item.scope === targetScope || (!item.scope && targetScope === 'Global')) &&
    (!term
      || (item.name && item.name.toLowerCase().includes(term))
      || (item.code && item.code.toLowerCase().includes(term))
      || (item.cas && item.cas.toLowerCase().includes(term)))
  )
}
