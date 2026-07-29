// ELN version history + Part 11-style electronic signatures for journal entries.
//
// Every meaningful checkpoint of an entry is snapshotted (append-only) into the
// journal_versions table with a SHA-256 content hash. Signing re-authenticates
// the user and writes a locked, signed version binding signer + time + intent +
// content. Nothing here is ever updated or deleted, so history is tamper-evident.

import { createClient } from '@supabase/supabase-js'
import { db } from '../services/supabase'

// A throwaway client used ONLY to verify a password for signing. It has its own
// storage and never persists, so calling signInWithPassword on it does not touch
// the app's real session or fire App.vue's onAuthStateChange (which would trigger
// a full re-init). Created lazily so tests never instantiate a real client.
let _verifyClient = null
function verifyClient() {
  if (!_verifyClient) {
    _verifyClient = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: 'sb-signing-verify' },
    })
  }
  return _verifyClient
}

// SHA-256 → lowercase hex, via the Web Crypto API (available in browsers and Node).
export async function sha256Hex(str) {
  const data = new TextEncoder().encode(String(str ?? ''))
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
}

// Bind the signed content to the signer, time, and stated meaning.
export async function signatureHash({ contentHash, email, signedAt, meaning }) {
  return sha256Hex([contentHash, email, signedAt, meaning].join('|'))
}

export class JournalVersionsTableMissing extends Error {}
function isMissing(error) {
  const m = (error?.message || '') + ' ' + (error?.details || '')
  return error?.code === '42P01' || /journal_versions|does not exist|schema cache/i.test(m)
}

async function nextVersionNo(entryId) {
  const { data, error } = await db.from('journal_versions')
    .select('version_no, content_hash').eq('entry_id', entryId)
    .order('version_no', { ascending: false }).limit(1).maybeSingle()
  if (error) { if (isMissing(error)) throw new JournalVersionsTableMissing(error.message); throw error }
  return { last: data, next: (data?.version_no || 0) + 1 }
}

// Snapshot the entry's current content as the next version. Skips when nothing has
// changed since the latest version (unless force). Best-effort: on error it
// returns { error } rather than throwing — except a missing table, which is
// re-thrown so the UI can show a one-time "run the SQL" hint.
export async function createVersion(entry, user, { changeSummary = '', force = false } = {}) {
  if (!entry?.id) return { skipped: true }
  const content = entry.content || ''
  const content_hash = await sha256Hex(content)
  try {
    const { last, next } = await nextVersionNo(entry.id)
    if (!force && last && last.content_hash === content_hash) return { skipped: true }
    const { data, error } = await db.from('journal_versions').insert({
      entry_id: entry.id, version_no: next, content, content_hash,
      author_id: user?.id || null, author_email: user?.email || '', change_summary: changeSummary,
    }).select().maybeSingle()
    if (error) { if (isMissing(error)) throw new JournalVersionsTableMissing(error.message); throw error }
    return { version: data }
  } catch (err) {
    if (err instanceof JournalVersionsTableMissing) throw err
    console.error('createVersion failed:', err)
    return { error: err }
  }
}

export async function listVersions(entryId) {
  const { data, error } = await db.from('journal_versions')
    .select('*').eq('entry_id', entryId).order('version_no', { ascending: false })
  if (error) { if (isMissing(error)) throw new JournalVersionsTableMissing(error.message); throw error }
  return data || []
}

// Part 11-style signature: re-authenticate (proves the signer is present), then
// snapshot the current content as a locked, signed version.
export async function signCurrent(entry, user, { password, meaning }) {
  if (!entry?.id) return { error: 'No entry selected.' }
  if (!meaning || !meaning.trim()) return { error: 'State the meaning of your signature.' }
  if (!password) return { error: 'Enter your password to sign.' }
  if (!user?.email) return { error: 'No signed-in user.' }

  const { error: authErr } = await verifyClient().auth.signInWithPassword({ email: user.email, password })
  if (authErr) return { error: 'Password does not match — signature not applied.' }

  const content = entry.content || ''
  const content_hash = await sha256Hex(content)
  const signed_at = new Date().toISOString()
  const signature_hash = await signatureHash({ contentHash: content_hash, email: user.email, signedAt: signed_at, meaning: meaning.trim() })
  try {
    const { next } = await nextVersionNo(entry.id)
    const { data, error } = await db.from('journal_versions').insert({
      entry_id: entry.id, version_no: next, content, content_hash,
      author_id: user.id, author_email: user.email, change_summary: 'Signed',
      signed: true, signed_by_email: user.email, signed_at,
      signature_meaning: meaning.trim(), signature_hash,
    }).select().maybeSingle()
    if (error) { if (isMissing(error)) throw new JournalVersionsTableMissing(error.message); throw error }
    return { version: data }
  } catch (err) {
    if (err instanceof JournalVersionsTableMissing) throw err
    return { error: err.message || String(err) }
  }
}

// Recompute a version's content hash to confirm the stored content is intact.
export async function verifyVersion(v) {
  if (!v) return false
  return (await sha256Hex(v.content || '')) === v.content_hash
}
