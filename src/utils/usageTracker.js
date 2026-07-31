// ─────────────────────────────────────────────────────────────────────────────
// Inventory usage tracker — full compound traceability.
//
// A compound counts as USED in an experiment when the experiment is saved with a
// status other than 'in_progress' (only finished work counts). Sources: journal
// entries (chips in the content HTML) and the planners (matrix / reaction /
// screening / well plate). Reconciliation keeps `inventory_usage` in step with
// reality: setting a source back to in-progress, or removing a compound from it,
// removes the rows again.
//
// Rows key on the inventory item's stable client id, which survives the item
// being moved to `inventory_archive` — so history stays readable years later.
//
// Safety rules baked in here, because this is an audit trail:
//   · never delete history we cannot positively account for (unresolved chips
//     abort destructive work rather than silently wiping rows)
//   · never move an existing use to a different date on re-save
//   · reconciles for one source are ordered — a slow older run can't resurrect
//     rows a newer run deleted
// Everything degrades quietly if the SQL hasn't been run yet.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from '../services/supabase'

// ── Chip parsing ──────────────────────────────────────────────────────────────
// New chips carry data-inv-id. Legacy chips only have "[CODE] Name …" text, so we
// resolve their codes against the live inventory + archive. Codes are NOT unique
// in this app (imports hardcode 'TXT'/'IMP'), so we disambiguate by name and
// refuse to guess when a code is ambiguous.
let _codeMap = null            // lowercased code -> { id, name } | AMBIGUOUS
let _codeMapAt = 0
let _codeMapInFlight = null
const AMBIGUOUS = Symbol('ambiguous')
const CODE_MAP_TTL = 5 * 60_000

export function resetCodeMap() { _codeMap = null; _codeMapAt = 0; _codeMapInFlight = null }

function indexRow(map, id, data) {
  const code = data?.code
  if (!code) return
  const key = String(code).toLowerCase()
  const entry = { id: String(id), name: data?.name || '' }
  const prev = map.get(key)
  if (!prev) map.set(key, entry)
  else if (prev !== AMBIGUOUS && prev.id !== entry.id) map.set(key, AMBIGUOUS)
}

// Builds the code→item index. Uses the already-loaded inventory when given, and
// only caches on a clean read so a failed/unauthenticated fetch can't poison it.
async function legacyCodeMap(inventory = null) {
  const now = Date.now()
  if (_codeMap && now - _codeMapAt < CODE_MAP_TTL) return _codeMap
  if (_codeMapInFlight) return _codeMapInFlight          // dedupe concurrent builds
  _codeMapInFlight = (async () => {
    const map = new Map()
    let clean = true
    for (const it of inventory || []) indexRow(map, it.id, it)
    try {
      if (!inventory?.length) {
        const { data, error } = await db.from('inventory').select('item_id, item_data')
        if (error) clean = false
        for (const row of data || []) indexRow(map, row.item_id, row.item_data)
      }
      const { data: arch, error: archErr } = await db.from('inventory_archive').select('item_id, item_data')
      if (archErr) clean = false
      for (const row of arch || []) indexRow(map, row.item_id, row.item_data)
    } catch { clean = false }
    if (clean) { _codeMap = map; _codeMapAt = Date.now() }
    _codeMapInFlight = null
    return map
  })()
  return _codeMapInFlight
}

// Extract referenced inventory items from experiment HTML.
// Returns { items:[{id,code,name}], unresolved:n } — `unresolved` > 0 means some
// chip could not be tied to an item, so callers must not treat the result as a
// complete picture (see reconcileUsage).
export async function extractInvRefsFromHtml(html, inventory = null) {
  if (!html || !html.includes('inv-ref')) return { items: [], unresolved: 0 }
  let doc
  try { doc = new DOMParser().parseFromString(String(html), 'text/html') }
  catch { return { items: [], unresolved: 1 } }
  const out = new Map()
  const legacy = []
  doc.querySelectorAll('span.inv-ref').forEach(el => {
    const text = el.textContent || ''
    const m = text.match(/\[([^\]]+)\]/)
    const code = m ? m[1].trim() : ''
    const name = m ? text.slice(text.indexOf(']') + 1).replace(/\(.*$/, '').trim() : text.trim()
    const id = el.getAttribute('data-inv-id')
    if (id) out.set(String(id), { id: String(id), code, name })
    else if (code) legacy.push({ code, name })
  })
  let unresolved = 0
  if (legacy.length) {
    const map = await legacyCodeMap(inventory)
    for (const l of legacy) {
      const hit = map.get(l.code.toLowerCase())
      if (!hit || hit === AMBIGUOUS) {
        // Ambiguous code — accept only an exact name match, else leave unresolved.
        const byName = [...map.values()].find(v => v !== AMBIGUOUS && v.name && l.name && v.name.toLowerCase() === l.name.toLowerCase())
        if (byName) out.set(byName.id, { id: byName.id, code: l.code, name: l.name })
        else unresolved++
        continue
      }
      if (!out.has(hit.id)) out.set(hit.id, { id: hit.id, code: l.code, name: l.name || hit.name })
    }
  }
  return { items: [...out.values()], unresolved }
}

// ── Reconciliation ────────────────────────────────────────────────────────────
const sourceKey = (t, id) => `${t}:${id}`
const _seq = new Map()         // source -> latest issued sequence (ordering guard)
const _lastState = new Map()   // source -> last reconciled signature (skip no-ops)

// One row per (item × source). status !== 'in_progress' → rows upserted for the
// current refs and stale ones removed; in_progress (or no refs) → rows removed.
// `unresolved` > 0 disables the destructive paths: we never delete an audit row
// we cannot account for.
export async function reconcileUsage({ sourceType, sourceId, sourceLabel, status, userEmail, usedAt, items, unresolved = 0 }) {
  if (!sourceType || !sourceId) return
  const sid = String(sourceId)
  const key = sourceKey(sourceType, sid)
  const mySeq = (_seq.get(key) || 0) + 1
  _seq.set(key, mySeq)
  const isCurrent = () => _seq.get(key) === mySeq

  const counts = !!status && status !== 'in_progress'
  const ids = (items || []).map(i => String(i.id)).sort()
  const signature = `${counts ? status : 'none'}|${ids.join(',')}|${unresolved}`
  if (_lastState.get(key) === signature) return          // nothing changed this session

  try {
    if (!counts || !ids.length) {
      // Unfinished (or nothing referenced) → this source contributes no history.
      // Skip when we already know it has none, and never wipe when chips failed
      // to resolve — that would delete history we simply couldn't read.
      if (unresolved > 0 && ids.length === 0) return
      const { error } = await db.from('inventory_usage').delete().eq('source_type', sourceType).eq('source_id', sid)
      if (error) { if (!/relation|does not exist|schema cache/i.test(error.message || '')) console.warn('usage delete failed:', error.message); return }
      if (isCurrent()) _lastState.set(key, signature)
      return
    }

    // Read existing rows so we can preserve each use's original date and find
    // rows that are no longer referenced.
    const { data: existing, error: readErr } = await db.from('inventory_usage')
      .select('id, item_id, used_at').eq('source_type', sourceType).eq('source_id', sid)
    if (readErr) { if (!/relation|does not exist|schema cache/i.test(readErr.message || '')) console.warn('usage read failed:', readErr.message); return }
    if (!isCurrent()) return                              // a newer reconcile took over

    const prevDate = new Map((existing || []).map(r => [String(r.item_id), r.used_at]))
    const now = new Date().toISOString()
    // Dedupe by item id — two plan rows can reference the same stock, and a
    // duplicate key would make Postgres reject the whole upsert.
    const seen = new Set()
    const rows = []
    for (const it of items) {
      const id = String(it.id)
      if (seen.has(id)) continue
      seen.add(id)
      rows.push({
        item_id: id,
        item_code: it.code || null,
        item_name: it.name || null,
        source_type: sourceType,
        source_id: sid,
        source_label: sourceLabel || null,
        status,
        user_email: userEmail || null,
        // Keep the original date on re-save; only a brand-new use gets "now".
        used_at: prevDate.get(id) || usedAt || now,
        updated_at: now,
      })
    }

    // Remove rows for compounds no longer referenced — but only when every chip
    // resolved, so an unreadable ref can't silently erase a recorded use.
    if (!unresolved) {
      const stale = (existing || []).filter(r => !seen.has(String(r.item_id))).map(r => r.id)
      if (stale.length) {
        await db.from('inventory_usage').delete().in('id', stale)
        if (!isCurrent()) return
      }
    }
    const { error: upErr } = await db.from('inventory_usage').upsert(rows, { onConflict: 'item_id,source_type,source_id' })
    if (upErr) { console.warn('usage upsert failed:', upErr.message); return }
    if (isCurrent()) _lastState.set(key, signature)
  } catch (e) { console.warn('usage reconcile skipped:', e?.message || e) }
}

// Remove every usage row a deleted source left behind.
export async function deleteUsageForSource(sourceType, sourceId) {
  try {
    await db.from('inventory_usage').delete().eq('source_type', sourceType).eq('source_id', String(sourceId))
    _lastState.delete(sourceKey(sourceType, String(sourceId)))
  } catch { /* ignore */ }
}

// ── Per-source ref extraction ─────────────────────────────────────────────────
// Planner tables → the compounds a saved plan actually doses. These mirror each
// planner's own chip-emission rules, so the log can't claim a compound the plan
// never used. Kinetics datasets don't persist their stock refs — their chips
// reach plates/journal on export and are counted there.
export const PLAN_SOURCE_TYPES = { matrices: 'matrix', reactions: 'reaction', screenings: 'screening', plates: 'plate' }

export async function extractPlanRefs(tableName, plan, inventory = []) {
  const byId = (id) => {
    const it = inventory.find(i => String(i.id) === String(id))
    return { id: String(id), code: it?.code || '', name: it?.name || '' }
  }
  const uniq = (ids) => [...new Set(ids.map(String))].map(byId)

  if (tableName === 'reactions') {
    return { items: uniq((plan.items || []).filter(i => i.invId).map(i => i.invId)), unresolved: 0 }
  }
  if (tableName === 'screenings') {
    // Only components that actually dose something (mirrors the chip predicate).
    const dosed = (plan.components || []).filter(c => c.invId && Object.values(c.grid || {}).some(v => Number(v) > 0))
    return { items: uniq(dosed.map(c => c.invId)), unresolved: 0 }
  }
  if (tableName === 'matrices') {
    // Only blocks placed on an axis contribute — unselected blocks dose nothing.
    const used = new Set([...(plan.selectedRows || []), ...(plan.selectedCols || [])])
    const ids = (plan.customBlocks || []).filter(b => used.has(b.id)).flatMap(b => b.itemIds || [])
    return { items: uniq(ids), unresolved: 0 }
  }
  if (tableName === 'plates') {
    return await extractInvRefsFromHtml(Object.values(plan.wells || {}).join('\n'), inventory)
  }
  return { items: [], unresolved: 0 }
}

// ── History for the info window ───────────────────────────────────────────────
export async function fetchUsageHistory(itemId) {
  try {
    const { data, error } = await db.from('inventory_usage').select('*')
      .eq('item_id', String(itemId)).order('used_at', { ascending: false })
    if (error) return { rows: [], missing: /relation|does not exist|schema cache/i.test(error.message || '') }
    return { rows: data || [], missing: false }
  } catch {
    return { rows: [], missing: true }
  }
}
