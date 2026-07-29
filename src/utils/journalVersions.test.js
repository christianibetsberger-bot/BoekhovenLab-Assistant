import { describe, it, expect, vi } from 'vitest'
import { sha256Hex, signatureHash } from './journalVersions.js'

// journalVersions imports the Supabase client at module load; stub it (these tests
// only exercise the pure crypto helpers).
vi.mock('../services/supabase', () => ({ db: {} }))

describe('sha256Hex', () => {
  it('matches known SHA-256 vectors', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('changes when content changes (integrity)', async () => {
    const a = await sha256Hex('<p>Result: 42</p>')
    const b = await sha256Hex('<p>Result: 43</p>')
    expect(a).not.toBe(b)
  })
})

describe('signatureHash', () => {
  it('binds content, signer, time, and meaning together deterministically', async () => {
    const base = { contentHash: 'abc', email: 'a@x.de', signedAt: '2026-07-29T10:00:00Z', meaning: 'Reviewed' }
    const h1 = await signatureHash(base)
    const h2 = await signatureHash(base)
    expect(h1).toBe(h2)
    // Any changed field changes the signature hash.
    expect(await signatureHash({ ...base, meaning: 'Approved' })).not.toBe(h1)
    expect(await signatureHash({ ...base, email: 'b@x.de' })).not.toBe(h1)
    expect(await signatureHash({ ...base, contentHash: 'abd' })).not.toBe(h1)
  })
})
