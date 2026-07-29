// Shared persistence for Lab Journal entries.
//
// Journal entries live in the Supabase `journals` table but are edited as plain
// in-memory objects (store.journal.entries). Both LabJournal's autosave AND the
// "Log to Journal" buttons in other modules need to write an entry back with an
// identical row shape — so that logic lives here, in one place, instead of being
// duplicated (and drifting) between the component and the store.

import { db } from '../services/supabase'

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

// Persist an entry to Supabase. Retries without the sharing columns if the table
// predates them, so content/status still save either way.
export async function persistJournalEntry(e, userEmail) {
  if (!e || !e.id || typeof e.id !== 'string') return
  const payload = journalEntryPayload(e, userEmail)
  let { error } = await db.from('journals').update(payload).eq('id', e.id)
  if (error && /shared_with|scope|column|schema/i.test(error.message)) {
    ({ error } = await db.from('journals').update({ data: payload.data }).eq('id', e.id))
  }
  if (error) console.error('journal save failed:', error)
}
