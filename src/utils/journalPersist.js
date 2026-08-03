// Shared persistence for Lab Journal entries.
//
// Journal entries live in the Supabase `journals` table but are edited as plain
// in-memory objects (store.journal.entries). Both LabJournal's autosave AND the
// "Log to Journal" buttons in other modules need to write an entry back with an
// identical row shape — so that logic lives here, in one place, instead of being
// duplicated (and drifting) between the component and the store.

import { db } from '../services/supabase'
import { extractInvRefsFromHtml, reconcileUsage } from './usageTracker'
import { createVersion } from './journalVersions'

// The blank-content guard below refuses to overwrite a saved entry with an empty
// editor. That must never be silent — the UI registers a notifier here so the user
// learns their change wasn't stored (e.g. after deleting the entry's only chip).
let _blankNotifier = null
export function onBlankJournalSaveSkipped(fn) { _blankNotifier = fn }
function onBlankSaveSkipped() {
  try { _blankNotifier?.('Nothing saved — an entry can’t be left completely empty. Add a note or delete the entry.') }
  catch { /* notifier is best-effort */ }
}

// Build the `journals` row payload from an in-memory entry.
export function journalEntryPayload(e, userEmail) {
  return {
    data: {
      expId: e.expId, date: e.date, content: e.content,
      linkedProtocols: e.linkedProtocols || [],
      status: e.status || 'in_progress', category: e.category || '',
      ownerEmail: e.owner_email || userEmail || '',
      lastEditor: userEmail || '',
    },
    scope: e.scope || 'Personal',
    shared_with: e.sharedWith || [],
  }
}

// True when HTML carries no visible text AND no embedded media or references —
// so a plate map, a drawn structure, an attachment, or an inventory ref counts as
// real content, not "blank". Used to stop an empty editor from wiping an entry.
export function isBlankJournalContent(html) {
  const s = String(html || '')
  if (s.trim() === '') return true
  if (/<(img|table|svg|canvas|video|audio)\b/i.test(s)) return false
  if (/data-ket=|chem-struct|file-attach|inv-ref/i.test(s)) return false
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').trim() === ''
}

// Persist an entry to Supabase. Retries without the sharing columns if the table
// predates them, so content/status still save either way.
export async function persistJournalEntry(e, userEmail) {
  if (!e || !e.id || typeof e.id !== 'string') return
  // Safety net: never let a blank editor silently overwrite an entry that still
  // has saved content (e.g. a stale second tab that fired a save on blur). A
  // genuine clear then needs a fresh non-blank save. Only costs a read when blank.
  if (isBlankJournalContent(e.content)) {
    const { data } = await db.from('journals').select('data').eq('id', e.id).maybeSingle()
    if (data && !isBlankJournalContent(data.data?.content)) {
      // Refuse the write, but say so — silently skipping made removing the last
      // compound chip look saved while the entry (and its usage row) stayed put.
      console.warn('journal save skipped: refusing to overwrite a non-empty entry with blank content')
      onBlankSaveSkipped()
      return
    }
  }
  const payload = journalEntryPayload(e, userEmail)
  const error = await writeEntry(e, payload, userEmail)
  if (error === CONFLICT) return          // handled: nothing overwritten, both sides kept
  if (error) { console.error('journal save failed:', error); return }
  // Usage traceability: reconcile this entry's compound chips into the usage log.
  // Only finished experiments count (status !== 'in_progress'); reconcileUsage
  // removes rows again when the entry reverts or a chip is removed. Fire-and-
  // forget so autosave latency is untouched; every save path funnels through
  // here (editor autosave, status changes, AND appendToActiveJournal from the
  // planners — so "Log to journal" content is picked up automatically).
  reconcileJournalUsage(e, userEmail)
}

// ── Concurrent editing: optimistic concurrency, and never lose the loser ──────
// Journal rows carry a `rev` counter. An UPDATE only applies if the row is still
// at the revision we based our edit on; if someone else wrote in the meantime the
// update matches 0 rows and we DON'T overwrite them. Instead their content is
// snapshotted into journal_versions (so it is recoverable and diffable in the
// existing History UI), we re-base onto their revision, and the user is told.
// Without the `rev` column (SQL not run) this degrades to the old last-write-wins.
const CONFLICT = Symbol('conflict')
let _conflictNotifier = null
export function onJournalConflict(fn) { _conflictNotifier = fn }

async function writeEntry(e, payload, userEmail) {
  const base = Number.isFinite(e.rev) ? e.rev : null
  // No rev known → legacy path (unguarded), keeps working on an un-migrated DB.
  if (base === null) return await legacyUpdate(e, payload)

  const { data, error } = await db.from('journals')
    .update({ ...payload, rev: base + 1 }).eq('id', e.id).eq('rev', base).select('rev')
  if (error) {
    if (/rev|column|schema/i.test(error.message || '')) { e.rev = null; return await legacyUpdate(e, payload) }
    return error
  }
  if (data && data.length) { e.rev = data[0].rev; return null }   // clean win

  // 0 rows matched → someone else advanced the row. Preserve their work first.
  const { data: remote } = await db.from('journals').select('*').eq('id', e.id).maybeSingle()
  if (!remote) return null                                        // entry was deleted — nothing to do
  try {
    await createVersion(
      { id: e.id, content: remote.data?.content || '' },
      { id: remote.owner_id, email: remote.data?.lastEditor || remote.data?.ownerEmail || '' },
      { changeSummary: 'Auto-saved before a concurrent edit' },
    )
  } catch { /* versions table missing — the re-base below still prevents silent loss */ }
  e.rev = remote.rev ?? null
  const by = remote.data?.lastEditor || 'someone else'
  try { _conflictNotifier?.({ id: e.id, by }) } catch { /* best-effort */ }
  return CONFLICT
}

async function legacyUpdate(e, payload) {
  let { error } = await db.from('journals').update(payload).eq('id', e.id)
  if (error && /shared_with|scope|column|schema/i.test(error.message)) {
    ({ error } = await db.from('journals').update({ data: payload.data }).eq('id', e.id))
  }
  return error || null
}

async function reconcileJournalUsage(e, userEmail) {
  try {
    const { items, unresolved } = await extractInvRefsFromHtml(e.content)
    // Entry dates are 'YYYY-MM-DD'; anchor at midday so a timezone shift can't
    // move a use into the neighbouring day (and therefore the wrong year group).
    const d = /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') ? new Date(e.date + 'T12:00:00') : null
    await reconcileUsage({
      sourceType: 'journal',
      sourceId: e.id,
      sourceLabel: e.expId || 'Journal entry',
      status: e.status || 'in_progress',
      userEmail: e.owner_email || userEmail || '',
      usedAt: d && !isNaN(d) ? d.toISOString() : null,
      items,
      unresolved,
    })
  } catch (err) { console.warn('usage reconcile skipped:', err?.message || err) }
}
