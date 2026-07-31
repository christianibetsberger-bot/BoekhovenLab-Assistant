// ─────────────────────────────────────────────────────────────────────────────
// Two-way Google Calendar sync for the group Meetings calendar.
//
// A Google service account (shared into the calendar with "Make changes to events")
// lets us read AND write the group calendar via the Calendar API — something the
// read-only iCal feed can't do. This function:
//   1. PULL  Google → tool: mirror events into the `meetings` table (everyone sees them)
//   2. PUSH  tool → Google: create/update Google events for meetings made in the tool
//            (gated behind PUSH_ENABLED so the first deploy is read-only & safe)
//
// ★ SAFETY — this sync NEVER deletes Google Calendar events, and never infers a deletion
//   from absence. Turning it on with an EMPTY tool cannot harm the real calendar: the first
//   run only PULLS Google's events into the tool. PUSH only inserts/updates events for
//   meetings that EXIST in the tool with origin='tool'; an empty tool pushes nothing.
//   The only deletions flow Google → tool (a *cancelled* Google event removes its tool copy).
//
// Secrets (Supabase → Edge Functions → Secrets):
//   GOOGLE_SA_KEY       full service-account JSON (use a FRESH key, not the leaked one)
//   GOOGLE_CALENDAR_ID  ....@group.calendar.google.com
//   PUSH_ENABLED        "true" to turn on tool → Google (leave unset while verifying)
//   SYNC_SECRET         optional; if set, callers must send header x-sync-secret: <it>
//
// Run it on a schedule (every ~5 min) via pg_cron + pg_net, or invoke manually to test.
// Deploy:  supabase functions deploy google-calendar-sync
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CAL_ID = Deno.env.get('GOOGLE_CALENDAR_ID') || ''
const PUSH   = (Deno.env.get('PUSH_ENABLED') || '').toLowerCase() === 'true'
const SYNC_SECRET = Deno.env.get('SYNC_SECRET') || ''
const SA = JSON.parse(Deno.env.get('GOOGLE_SA_KEY') || '{}')

const GCAL = (path: string) =>
  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}${path}`

const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } })

// ── Service-account → OAuth access token (RS256 JWT bearer grant) ───────────────
function b64url(bytes: Uint8Array | string): string {
  const b = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  let s = ''; for (const c of b) s += String.fromCharCode(c)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '')
  const raw = atob(body); const buf = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i)
  return buf.buffer
}
async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: SA.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: SA.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }))
  const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(SA.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key,
    new TextEncoder().encode(`${header}.${claims}`)))
  const jwt = `${header}.${claims}.${b64url(sig)}`
  const res = await fetch(SA.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error('token exchange failed: ' + JSON.stringify(j))
  return j.access_token as string
}

// ── Map a Google event ⇄ a meetings row ────────────────────────────────────────
const isoOf = (t: any) => t?.dateTime || (t?.date ? `${t.date}T00:00:00Z` : null)
function eventToMeeting(ev: any) {
  return {
    title: ev.summary || '(no title)',
    location: ev.location || '',
    starts_at: isoOf(ev.start),
    ends_at: isoOf(ev.end),
    notes: ev.description || '',
    scope: 'lab',                       // group calendar → visible to everyone in the tool
    invitees: [],
    owner_email: ev.organizer?.email || ev.creator?.email || '',
    origin: 'google',
    google_event_id: ev.id,
    google_etag: ev.etag || null,
    synced_at: new Date().toISOString(),
  }
}

// ── PULL: Google → tool ─────────────────────────────────────────────────────────
async function pull(token: string) {
  const { data: st } = await sb.from('calendar_sync_state').select('sync_token').eq('calendar_id', CAL_ID).maybeSingle()
  let syncToken: string | null = st?.sync_token ?? null
  let pageToken: string | null = null
  let nextSyncToken: string | null = null
  let upserts = 0, deletes = 0, done = false

  while (!done) {
    const p = new URLSearchParams({ singleEvents: 'true', showDeleted: 'true', maxResults: '250' })
    if (syncToken) p.set('syncToken', syncToken)
    else p.set('timeMin', new Date(Date.now() - 30 * 864e5).toISOString())   // first run: last 30 days + future
    if (pageToken) p.set('pageToken', pageToken)

    const res = await fetch(GCAL(`/events?${p}`), { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 410) {   // syncToken expired → start a fresh full resync
      await sb.from('calendar_sync_state').upsert({ calendar_id: CAL_ID, sync_token: null, updated_at: new Date().toISOString() })
      syncToken = null; pageToken = null; continue
    }
    const j = await res.json()
    if (!res.ok) throw new Error('events.list failed: ' + JSON.stringify(j))

    for (const ev of j.items || []) {
      if (ev.status === 'cancelled') {
        // Google → tool only: remove the tool's copy of a cancelled event. Never touches Google.
        const { count } = await sb.from('meetings').delete({ count: 'exact' }).eq('google_event_id', ev.id)
        deletes += count || 0
      } else if (isoOf(ev.start) && isoOf(ev.end)) {
        await sb.from('meetings').upsert(eventToMeeting(ev), { onConflict: 'google_event_id' })
        upserts++
      }
    }
    if (j.nextSyncToken) nextSyncToken = j.nextSyncToken
    pageToken = j.nextPageToken || null
    if (!pageToken) done = true
  }

  if (nextSyncToken) await sb.from('calendar_sync_state').upsert({ calendar_id: CAL_ID, sync_token: nextSyncToken, updated_at: new Date().toISOString() })
  return { upserts, deletes }
}

// ── PUSH: tool → Google (gated by PUSH_ENABLED) ─────────────────────────────────
async function push(token: string) {
  // meetings made in the tool that are new, or edited since we last synced them.
  const { data: rows } = await sb.from('meetings').select('*')
    .eq('origin', 'tool')
    .or('google_event_id.is.null,synced_at.is.null')   // new/unsynced; edited-since handled below via updated_at
  const pending = (rows || [])
  // also pick up tool meetings edited after their last sync
  const { data: edited } = await sb.from('meetings').select('*').eq('origin', 'tool').not('google_event_id', 'is', null)
  for (const m of edited || []) if (m.updated_at && m.synced_at && new Date(m.updated_at) > new Date(m.synced_at)) pending.push(m)

  let created = 0, updated = 0
  for (const m of pending) {
    const body = {
      summary: m.title, location: m.location || '', description: m.notes || '',
      start: { dateTime: m.starts_at }, end: { dateTime: m.ends_at },
    }
    const url = m.google_event_id ? GCAL(`/events/${encodeURIComponent(m.google_event_id)}`) : GCAL('/events')
    const res = await fetch(url, {
      method: m.google_event_id ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const j = await res.json()
    if (!res.ok) { console.error('push failed for', m.id, j); continue }
    await sb.from('meetings').update({ google_event_id: j.id, google_etag: j.etag, synced_at: new Date().toISOString() }).eq('id', m.id)
    m.google_event_id ? updated++ : created++
  }
  return { created, updated }
}

Deno.serve(async (req) => {
  if (SYNC_SECRET && req.headers.get('x-sync-secret') !== SYNC_SECRET)
    return new Response('forbidden', { status: 403 })
  if (!CAL_ID || !SA.client_email) return new Response('missing GOOGLE_CALENDAR_ID / GOOGLE_SA_KEY', { status: 500 })
  try {
    const token = await getAccessToken()
    const pulled = await pull(token)
    const pushed = PUSH ? await push(token) : { skipped: true }
    return Response.json({ ok: true, pulled, pushed })
  } catch (e) {
    console.error(e)
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
})
