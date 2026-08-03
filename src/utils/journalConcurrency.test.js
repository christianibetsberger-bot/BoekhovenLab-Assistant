import { describe, it, expect, vi, beforeEach } from 'vitest'

// Concurrent editing is where real data can be lost, so pin the contract:
// a stale write must NOT overwrite a co-editor, and the version it would have
// clobbered must be preserved. These tests drive persistJournalEntry against a
// scripted Supabase double.

const state = {
  row: null,              // the stored journals row
  updateCalls: [],        // { payload, whereRev }
  versions: [],           // journal_versions inserts
}

vi.mock('../services/supabase', () => {
  const from = (table) => {
    if (table === 'journals') {
      return {
        // .select('data').eq('id').maybeSingle()  — blank-content guard
        // .select('*').eq('id').maybeSingle()     — conflict re-read
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: state.row }) }),
        }),
        update: (payload) => ({
          eq: (col, val) => {
            if (col === 'id') {
              // legacy path: .update().eq('id') with no rev guard
              const chain = {
                eq: (c2, rev) => ({
                  select: async () => {
                    state.updateCalls.push({ payload, whereRev: rev })
                    if (state.row && state.row.rev === rev) {
                      state.row = { ...state.row, ...payload }
                      return { data: [{ rev: payload.rev }], error: null }
                    }
                    return { data: [], error: null }        // stale → 0 rows
                  },
                }),
                then: undefined,
              }
              // allow `await update().eq('id')` (legacy, no .eq('rev'))
              chain.select = async () => ({ data: [], error: null })
              return Object.assign(Promise.resolve({ error: null }), chain)
            }
            return { select: async () => ({ data: [], error: null }) }
          },
        }),
      }
    }
    return { select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) }
  }
  return { db: { from } }
})

vi.mock('./journalVersions', () => ({
  createVersion: vi.fn(async (entry, user, opts) => {
    state.versions.push({ entryId: entry.id, content: entry.content, by: user?.email, ...opts })
    return { version: { version_no: state.versions.length } }
  }),
}))

vi.mock('./usageTracker', () => ({
  extractInvRefsFromHtml: async () => ({ items: [], unresolved: 0 }),
  reconcileUsage: async () => {},
}))

const { persistJournalEntry, onJournalConflict } = await import('./journalPersist.js')
const { createVersion } = await import('./journalVersions')

beforeEach(() => {
  state.row = null; state.updateCalls = []; state.versions = []
  createVersion.mockClear()
})

describe('journal concurrent-edit protection', () => {
  it('writes when the entry is still at the revision we edited', async () => {
    state.row = { id: 'e1', rev: 4, data: { content: '<p>base</p>' } }
    const mine = { id: 'e1', rev: 4, content: '<p>mine</p>', status: 'in_progress' }

    await persistJournalEntry(mine, 'me@x.de')

    expect(state.updateCalls).toHaveLength(1)
    expect(state.updateCalls[0].whereRev).toBe(4)      // guarded on the base revision
    expect(state.updateCalls[0].payload.rev).toBe(5)   // and advances it
    expect(mine.rev).toBe(5)
    expect(createVersion).not.toHaveBeenCalled()       // no conflict, nothing to preserve
  })

  it('does NOT overwrite a co-editor who wrote first, and preserves their version', async () => {
    // We loaded rev 4, but someone else has since written and the row is at rev 5.
    state.row = { id: 'e1', rev: 5, owner_id: 'u2', data: { content: '<p>theirs</p>', lastEditor: 'her@x.de' } }
    const mine = { id: 'e1', rev: 4, content: '<p>mine</p>', status: 'in_progress' }

    let notified = null
    onJournalConflict((info) => { notified = info })

    await persistJournalEntry(mine, 'me@x.de')

    // the stored row still holds THEIR content — we did not clobber it
    expect(state.row.data.content).toBe('<p>theirs</p>')
    // …and their version was captured so it stays recoverable in History
    expect(createVersion).toHaveBeenCalledTimes(1)
    expect(state.versions[0].content).toBe('<p>theirs</p>')
    expect(state.versions[0].by).toBe('her@x.de')
    // we re-base onto their revision so the next save is judged fairly
    expect(mine.rev).toBe(5)
    // and the user is told rather than left guessing
    expect(notified).toEqual({ id: 'e1', by: 'her@x.de' })
  })

  it('still refuses to blank an entry that has stored content', async () => {
    state.row = { id: 'e1', rev: 2, data: { content: '<p>real work</p>' } }
    const mine = { id: 'e1', rev: 2, content: '   ', status: 'in_progress' }

    await persistJournalEntry(mine, 'me@x.de')

    expect(state.updateCalls).toHaveLength(0)          // never reached the DB
    expect(state.row.data.content).toBe('<p>real work</p>')
  })
})
