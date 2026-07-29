import { describe, it, expect } from 'vitest'
import { journalEntryPayload } from './journalPersist.js'

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
