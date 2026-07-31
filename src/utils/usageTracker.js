// ─────────────────────────────────────────────────────────────────────────────
// Inventory usage tracker — full compound traceability.
//
// A compound counts as USED in an experiment when the experiment is saved with a
// status other than 'in_progress' (only finished work counts). Sources: journal
// entries (chips in the content HTML) and the planners (matrix / reaction /
// screening / well plate — structured refs or well HTML). Reconciliation keeps
// `inventory_usage` in step with reality: setting a source back to in-progress,
// or removing a compound from it, removes the rows again.
//
// Rows key on the inventory item's stable client id, which survives the item
// being moved to `inventory_archive` — so history stays readable years later.
// Everything degrades quietly if the SQL hasn't been run yet.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from '../services/supabase'

// ── Chip parsing ──────────────────────────────────────────────────────────────
// New chips carry data-inv-id. Legacy chips only have "[CODE] Name …" text, so we
// resolve their codes against the live inventory + archive (cached per session).
let _codeMap = null          // lowercased code -> { id, name }
let _codeMapAt = 0

async function legacyCodeMap() {
  const now = Date.now()
  if (_codeMap && now - _codeMapAt < 5 * 60_000) return _codeMap
  const map = new Map()
  try {
    const { data } = await db.from('inventory').select('item_id, item_data')
    for (const row of data || []) {
      const c = row.item_data?.code
      if (c && !map.has(String(c).toLowerCase())) map.set(String(c).toLowerCase(), { id: String(row.item_id), name: row.item_data?.name || '' })
    }
    const { data: arch } = await db.from('inventory_archive').select('item_id, item_data')
    for (const row of arch || []) {
      const c = row.item_data?.code
      if (c && !map.has(String(c).toLowerCase())) map.set(String(c).toLowerCase(), { id: String(row.item_id), name: row.item_data?.name || '' })
    }
  } catch { /* tables missing — legacy chips just won't resolve */ }
  _codeMap = map; _codeMapAt = now
  return map
}

// Extract referenced inventory items from experiment HTML: [{id, code, name}].
export async function extractInvRefsFromHtml(html) {
  if (!html || !html.includes('inv-ref')) return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const out = new Map()
  const legacy = []
  doc.querySelectorAll('span.inv-ref').forEach(el => {
    const text = el.textContent || ''
    const m = text.match(/\[([^\]]+)\]/)
    const code = m ? m[1].trim() : ''
    const name = m ? text.slice(text.indexOf(']') + 1).replace(/\(.*$/, '').trim() : text.trim()
    const id = el.getAttribute('data-inv-id')
    if (id) out.set(id, { id, code, name })
    else if (code) legacy.push({ code, name })
  })
  if (legacy.length) {
    const map = await legacyCodeMap()
    for (const l of legacy) {
      const hit = map.get(l.code.toLowerCase())
      if (hit && !out.has(hit.id)) out.set(hit.id, { id: hit.id, code: l.code, name: l.name || hit.name })
    }
  }
  return [...out.values()]
}

// ── Reconciliation ────────────────────────────────────────────────────────────
// One row per (item × source). status !== 'in_progress' → rows upserted for the
// current refs and stale ones removed; in_progress (or no refs) → all rows for
// the source removed.
export async function reconcileUsage({ sourceType, sourceId, sourceLabel, status, userEmail, usedAt, items }) {
  if (!sourceType || !sourceId) return
  const sid = String(sourceId)
  try {
    const counts = status && status !== 'in_progress'
    if (!counts || !items?.length) {
      await db.from('inventory_usage').delete().eq('source_type', sourceType).eq('source_id', sid)
      return
    }
    const now = new Date().toISOString()
    const rows = items.map(it => ({
      item_id: String(it.id),
      item_code: it.code || null,
      item_name: it.name || null,
      source_type: sourceType,
      source_id: sid,
      source_label: sourceLabel || null,
      status,
      user_email: userEmail || null,
      used_at: usedAt || now,
      updated_at: now,
    }))
    // Remove rows for compounds no longer referenced by this source…
    const keep = new Set(rows.map(r => r.item_id))
    const { data: existing } = await db.from('inventory_usage').select('id, item_id')
      .eq('source_type', sourceType).eq('source_id', sid)
    const stale = (existing || []).filter(r => !keep.has(r.item_id)).map(r => r.id)
    if (stale.length) await db.from('inventory_usage').delete().in('id', stale)
    // …and upsert the current set.
    await db.from('inventory_usage').upsert(rows, { onConflict: 'item_id,source_type,source_id' })
  } catch { /* table missing — degrade quietly */ }
}

// Remove every usage row a deleted source left behind.
export async function deleteUsageForSource(sourceType, sourceId) {
  try {
    await db.from('inventory_usage').delete().eq('source_type', sourceType).eq('source_id', String(sourceId))
  } catch { /* ignore */ }
}

// ── Per-source ref extraction ─────────────────────────────────────────────────
// Planner tables → how to pull the referenced inventory ids out of the saved
// object. Kinetics datasets don't persist their stock refs — their chips reach
// plates/journal on export and are counted there.
export const PLAN_SOURCE_TYPES = { matrices: 'matrix', reactions: 'reaction', screenings: 'screening', plates: 'plate' }

export async function extractPlanRefs(tableName, plan, inventory = []) {
  const byId = (id) => {
    const it = inventory.find(i => i.id === id)
    return { id: String(id), code: it?.code || '', name: it?.name || '' }
  }
  if (tableName === 'reactions') return (plan.items || []).filter(i => i.invId).map(i => byId(i.invId))
  if (tableName === 'screenings') return (plan.components || []).filter(c => c.invId).map(c => byId(c.invId))
  if (tableName === 'matrices') {
    const ids = new Set((plan.customBlocks || []).flatMap(b => b.itemIds || []))
    return [...ids].map(byId)
  }
  if (tableName === 'plates') {
    const html = Object.values(plan.wells || {}).join('\n')
    return await extractInvRefsFromHtml(html)
  }
  return []
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
