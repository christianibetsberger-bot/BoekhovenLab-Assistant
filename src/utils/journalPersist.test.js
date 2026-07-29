import { describe, it, expect, vi } from 'vitest'
import { journalEntryPayload, isBlankJournalContent } from './journalPersist.js'

// journalPersist imports the Supabase client at module load; stub it so the test
// doesn't need VITE_SUPABASE_* env (absent in CI). journalEntryPayload is pure.
vi.mock('../services/supabase', () => ({ db: {} }))

// This payload shape is shared by LabJournal's autosave and the store's
// cross-module "Log to Journal" writes. If the two ever disagree, logged content
// silently fails to persist — so pin the shape here.
describe('journalEntryPayload', () => {
  const entry = {
    id: 'abc', expId: 'EXP-001', date: '2026-07-29',
    content: '<p>hi</p>', linkedProtocols: [{ id: 'p1' }],
    status: 'success', category: 'DNA', scope: 'Lab',
    sharedWith: ['a@x.de'], owner_email: 'owner@x.de',
  }

  it('carries content and metadata into data, with columns at top level', () => {
    const p = journalEntryPayload(entry, 'me@x.de')
    expect(p.data.content).toBe('<p>hi</p>')
    expect(p.data.expId).toBe('EXP-001')
    expect(p.data.status).toBe('success')
    expect(p.data.category).toBe('DNA')
    expect(p.data.linkedProtocols).toEqual([{ id: 'p1' }])
    expect(p.data.lastEditor).toBe('me@x.de')
    expect(p.scope).toBe('Lab')
    expect(p.shared_with).toEqual(['a@x.de'])
  })

  it('preserves the entry owner email, only falling back to the editor', () => {
    expect(journalEntryPayload(entry, 'me@x.de').data.ownerEmail).toBe('owner@x.de')
    expect(journalEntryPayload({ ...entry, owner_email: '' }, 'me@x.de').data.ownerEmail).toBe('me@x.de')
  })

  it('applies safe defaults for a fresh entry', () => {
    const p = journalEntryPayload({ id: 'z', content: 'x' }, 'me@x.de')
    expect(p.data.status).toBe('in_progress')
    expect(p.data.category).toBe('')
    expect(p.data.linkedProtocols).toEqual([])
    expect(p.scope).toBe('Personal')
    expect(p.shared_with).toEqual([])
  })
})

// Guards the anti-overwrite safety net: a blank editor must not be allowed to
// wipe an entry, but media/refs with no text must NOT be mistaken for blank.
describe('isBlankJournalContent', () => {
  it('treats empty, whitespace, and text-less markup as blank', () => {
    expect(isBlankJournalContent('')).toBe(true)
    expect(isBlankJournalContent('   \n ')).toBe(true)
    expect(isBlankJournalContent('<p></p>')).toBe(true)
    expect(isBlankJournalContent('<div><br></div>')).toBe(true)
    expect(isBlankJournalContent('&nbsp; &nbsp;')).toBe(true)
    expect(isBlankJournalContent(null)).toBe(true)
  })

  it('treats real text as content', () => {
    expect(isBlankJournalContent('<p>Added 5 uL buffer</p>')).toBe(false)
  })

  it('treats embedded media and references as content even without text', () => {
    expect(isBlankJournalContent('<table><tr><td></td></tr></table>')).toBe(false)
    expect(isBlankJournalContent('<img src="x">')).toBe(false)
    expect(isBlankJournalContent('<div class="chem-struct" data-ket="..."></div>')).toBe(false)
    expect(isBlankJournalContent('<span class="file-attach"></span>')).toBe(false)
    expect(isBlankJournalContent('<span class="inv-ref"></span>')).toBe(false)
  })
})
