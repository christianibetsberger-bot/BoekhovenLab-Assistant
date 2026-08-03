// Inventory reference "chips" — the single source of truth for the markup that
// links a compound into experiment content (journal entries, wells, plans).
//
// This markup was previously duplicated across 12 template literals in 7
// components. That was a real liability, not just noise: the chip carries
// `data-inv-id`, which is what the usage tracker keys traceability on, so a site
// that drifted would silently stop recording usage. Adding that attribute meant
// editing all nine copies by hand — exactly the kind of edit that gets missed.
//
// Keep the text shape `[CODE] Name (value unit)` intact: the Opentrons exporters
// in WellPlateEditor parse it back out with a regex, and legacy chips without an
// id are resolved by the code in those brackets.
import { esc } from './htmlSafe'

const REMOVE_ICON = `<i class="fas fa-times inv-ref-remove" style="cursor:pointer; margin-left:4px; opacity: 0.7;"></i>`

/**
 * A chip referencing a real inventory item.
 * @param inv  the inventory item ({ id, code, name, stock, stockUnit })
 * @param opts labware  – target labware, stored on the chip for exporters
 *             unit     – fallback unit when the item has no stockUnit
 *             fmt      – number formatter (pass store.formatNum)
 *             removable – render the × (false for read-only summaries)
 */
export function invChip(inv, { labware = '', unit = 'µM', fmt = (v) => v, removable = true } = {}) {
  return `<span class="inv-ref" contenteditable="false" data-inv-id="${esc(inv.id)}" data-labware="${esc(labware)}">`
    + `<i class="fas fa-tag"></i>&nbsp;[${esc(inv.code)}] ${esc(inv.name)} `
    + `(${esc(fmt(inv.stock))} ${esc(inv.stockUnit || unit)})`
    + `${removable ? '&nbsp;' + REMOVE_ICON : ''}</span>`
}

/**
 * A chip for something that is NOT an inventory item (free-text additives).
 * It deliberately carries no data-inv-id — nothing to trace — and is styled grey
 * so it reads differently from a real stock reference.
 */
export function textChip(name, { labware = '', color = '#6b7280', removable = true } = {}) {
  return `<span class="inv-ref" contenteditable="false" data-labware="${esc(labware)}" style="background-color: ${color};">`
    + `<i class="fas fa-flask"></i>&nbsp;${esc(name)}`
    + `${removable ? '&nbsp;' + REMOVE_ICON : ''}</span>`
}
