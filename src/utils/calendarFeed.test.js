import { describe, it, expect, vi, afterEach } from 'vitest'

// calendarFeed imports the Supabase client at module load; stub it so the test
// doesn't need VITE_SUPABASE_* env (absent in CI). feedUrls only reads env.
vi.mock('../services/supabase', () => ({ db: {} }))

// feedUrls reads VITE_SUPABASE_URL at call time, so stub it per test.
async function withBase(base, fn) {
  vi.stubEnv('VITE_SUPABASE_URL', base)
  const { feedUrls } = await import('./calendarFeed.js')
  return fn(feedUrls)
}

afterEach(() => vi.unstubAllEnvs())

describe('feedUrls', () => {
  it('builds the https feed link with the token', async () => {
    await withBase('https://abc.supabase.co', (feedUrls) => {
      const { https } = feedUrls('tok123')
      expect(https).toBe('https://abc.supabase.co/functions/v1/calendar-feed?token=tok123')
    })
  })

  it('swaps https for the webcal:// subscribe scheme', async () => {
    await withBase('https://abc.supabase.co', (feedUrls) => {
      expect(feedUrls('tok123').webcal).toBe('webcal://abc.supabase.co/functions/v1/calendar-feed?token=tok123')
    })
  })

  it('pre-fills the Google add-by-URL screen with the encoded feed', async () => {
    await withBase('https://abc.supabase.co', (feedUrls) => {
      const { google, https } = feedUrls('tok123')
      expect(google).toContain('calendar.google.com/calendar/u/0/r/settings/addbyurl?cid=')
      expect(google).toContain(encodeURIComponent(https))
    })
  })

  it('tolerates a trailing slash on the base URL', async () => {
    await withBase('https://abc.supabase.co/', (feedUrls) => {
      expect(feedUrls('t').https).toBe('https://abc.supabase.co/functions/v1/calendar-feed?token=t')
    })
  })
})
