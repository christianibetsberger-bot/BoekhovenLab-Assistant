// Shared persistence for Lab Journal entries.
//
// Journal entries live in the Supabase `journals` table but are edited as plain
// in-memory objects (store.journal.entries). Both LabJournal's autosave AND the
// "Log to Journal" buttons in other modules need to write an entry back with an
// identical row shape — so that logic lives here, in one place, instead of being
// duplicated (and drifting) between the component and the store.

import { db } from '../services/supabase'
import { extractInvRefsFromHtml, reconcileUsage } from './usageTracker'

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
      console.warn('journal save skipped: refusing to overwrite a non-empty entry with blank content')
      return
    }
  }
  const payload = journalEntryPayload(e, userEmail)
  let { error } = await db.from('journals').update(payload).eq('id', e.id)
  if (error && /shared_with|scope|column|schema/i.test(error.message)) {
    ({ error } = await db.from('journals').update({ data: payload.data }).eq('id', e.id))
  }
  if (error) { console.error('journal save failed:', error); return }
  // Usage traceability: reconcile this entry's compound chips into the usage log.
  // Only finished experiments count (status !== 'in_progress'); reconcileUsage
  // removes rows again when the entry reverts or a chip is removed. Fire-and-
  // forget so autosave latency is untouched; every save path funnels through
  // here (editor autosave, status changes, AND appendToActiveJournal from the
  // planners — so "Log to journal" content is picked up automatically).
  reconcileJournalUsage(e, userEmail)
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
