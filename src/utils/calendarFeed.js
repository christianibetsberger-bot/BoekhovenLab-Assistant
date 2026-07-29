// Client helper for the personal meetings calendar feed.
//
// Each user has one secret token (in the `calendar_tokens` table). The token maps
// to a webcal:// URL served by the `calendar-feed` Edge Function, which Apple
// Calendar and Google Calendar subscribe to and re-poll on their own. Adding the
// link is the user's opt-in: nothing leaves the app until they subscribe.

import { db } from '../services/supabase'

function randomToken(bytes = 24) {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('')
}

// Thrown when the calendar_tokens table hasn't been created yet, so the UI can
// show a specific "run the setup SQL" hint instead of a generic failure.
export class CalendarTokenTableMissing extends Error {}

function isMissingTable(error) {
  const m = (error?.message || '') + ' ' + (error?.details || '')
  return error?.code === '42P01' || /calendar_tokens|does not exist|schema cache|relation/i.test(m)
}

// Return the user's existing feed token, creating one on first use.
export async function getOrCreateFeedToken(user) {
  const { data, error } = await db
    .from('calendar_tokens')
    .select('token')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) {
    if (isMissingTable(error)) throw new CalendarTokenTableMissing(error.message)
    throw error
  }
  if (data?.token) return data.token

  const token = randomToken()
  const { error: insErr } = await db
    .from('calendar_tokens')
    .insert({ user_id: user.id, user_email: (user.email || '').toLowerCase(), token })
  if (insErr) {
    if (isMissingTable(insErr)) throw new CalendarTokenTableMissing(insErr.message)
    // Someone created a row between our read and insert — fetch it back.
    const { data: again } = await db.from('calendar_tokens').select('token').eq('user_id', user.id).maybeSingle()
    if (again?.token) return again.token
    throw insErr
  }
  return token
}

// Issue a fresh token and revoke the old one (any calendars still on the old
// link will stop updating and should be re-added).
export async function rotateFeedToken(user) {
  const token = randomToken()
  const { error } = await db
    .from('calendar_tokens')
    .upsert(
      { user_id: user.id, user_email: (user.email || '').toLowerCase(), token },
      { onConflict: 'user_id' },
    )
  if (error) {
    if (isMissingTable(error)) throw new CalendarTokenTableMissing(error.message)
    throw error
  }
  return token
}

// The subscribe links for a token. `https` is the raw feed; `webcal` triggers the
// OS "subscribe" handler (Apple Calendar, and Google on desktop); `google` opens
// Google Calendar's add-by-URL screen pre-filled with the feed.
export function feedUrls(token) {
  const base = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const https = `${base}/functions/v1/calendar-feed?token=${token}`
  const webcal = https.replace(/^https?:\/\//, 'webcal://')
  const google = `https://calendar.google.com/calendar/u/0/r/settings/addbyurl?cid=${encodeURIComponent(https)}`
  return { https, webcal, google }
}
