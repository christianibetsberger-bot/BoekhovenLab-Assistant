import { watch } from 'vue'
import { useLabStore } from '../stores/labStore.js'
import { coacervateSVG } from '../utils/coacervateIcon.js'

// ── DOM updater ───────────────────────────────────────────────────────────────

const svgDataUrl = (svg) => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`

// Ensure a <link> with the given rel (+ optional media) exists, keyed by id.
function ensureLink(id, rel, media) {
  let el = document.getElementById(id)
  if (!el) {
    el = document.createElement('link')
    el.id = id; el.rel = rel
    if (media) el.media = media
    document.head.appendChild(el)
  }
  return el
}

// Rasterise an SVG data URL to a PNG data URL at the given size.
function svgToPng(svgUrl, size) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size })
        canvas.getContext('2d').drawImage(img, 0, 0, size, size)
        resolve(canvas.toDataURL('image/png'))
      } catch { resolve(null) }
    }
    img.onerror = () => resolve(null)
    img.src = svgUrl
  })
}

let _prevManifestUrl = null

async function applyIcon(color) {
  if (!color || typeof color !== 'string') return

  const lightUrl = svgDataUrl(coacervateSVG({ accent: color, dark: false }))
  const darkUrl  = svgDataUrl(coacervateSVG({ accent: color, dark: true }))

  // Favicon — light & dark variants via prefers-color-scheme, plus an untagged
  // fallback (dark) for browsers that ignore the media attribute. Remove the
  // static <link rel="icon"> from index.html so it doesn't win over these.
  document.querySelectorAll("link[rel~='icon']:not([id^='fav-'])").forEach(el => el.remove())
  ensureLink('fav-light', 'icon', '(prefers-color-scheme: light)').href = lightUrl
  ensureLink('fav-dark',  'icon', '(prefers-color-scheme: dark)').href  = darkUrl
  const favDefault = ensureLink('fav-default', 'icon'); favDefault.type = 'image/svg+xml'; favDefault.href = darkUrl

  // theme-color meta (browser toolbar tint)
  const themeMeta = document.querySelector("meta[name='theme-color']")
  if (themeMeta) themeMeta.content = color

  // Home-screen icon (iOS/macOS) — light & dark PNGs, rasterised via canvas.
  document.querySelectorAll("link[rel='apple-touch-icon']:not([id^='ati-'])").forEach(el => el.remove())
  const [lightPng, darkPng] = await Promise.all([svgToPng(lightUrl, 512), svgToPng(darkUrl, 512)])
  if (lightPng) ensureLink('ati-light', 'apple-touch-icon', '(prefers-color-scheme: light)').href = lightPng
  if (darkPng)  ensureLink('ati-dark',  'apple-touch-icon', '(prefers-color-scheme: dark)').href  = darkPng
  if (lightPng) ensureLink('ati-default', 'apple-touch-icon').href = lightPng

  // Rewrite the manifest so the installed PWA icon matches the accent colour.
  // (Manifest icons are a single set — home-screen light/dark isn't a web-manifest
  // feature — so we use the dark variant, which reads well on most home screens.)
  const installPng = darkPng || lightPng
  const manifest = JSON.stringify({
    name: 'Lab Assistant by CTI',
    short_name: 'Lab Assistant',
    description: 'Integrated research toolkit by CTI',
    display: 'standalone',
    background_color: color,
    theme_color: color,
    start_url: '/',
    icons: [
      ...(installPng ? [{ src: installPng, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] : []),
      { src: '/icon-dark-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      { src: '/icon-dark-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  })
  const blob = new Blob([manifest], { type: 'application/json' })
  if (_prevManifestUrl) URL.revokeObjectURL(_prevManifestUrl)
  _prevManifestUrl = URL.createObjectURL(blob)
  const mlink = document.querySelector("link[rel='manifest']")
  if (mlink) mlink.href = _prevManifestUrl
}

// ── Composable ────────────────────────────────────────────────────────────────

// Read the last-used primary color from localStorage so the icon is correct
// immediately at startup — before the auth session resolves and cloud settings
// load.  This eliminates the brief flash of the default blue and ensures that
// if the user adds the webapp to the macOS dock right after opening it, Safari
// captures the icon with their actual theme color rather than the default.
function seedColorFromStorage() {
  try {
    // Scan all lab_user_prefs_* keys — we don't know the user ID yet, but there
    // is normally only one user on a device, so take the first match found.
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('lab_user_prefs_')) {
        const prefs = JSON.parse(localStorage.getItem(key) || '{}')
        if (prefs?.uiSettings?.primaryColor) return prefs.uiSettings.primaryColor
      }
    }
  } catch (_) { /* storage unavailable or parse error */ }
  return null
}

export function useDynamicIcon() {
  const store = useLabStore()
  const apply = () => applyIcon(store.uiSettings?.primaryColor || '#0E396E')

  // Apply the stored color immediately (before auth / cloud settings finish
  // loading) so the favicon and manifest icon are never the wrong color.
  const storedColor = seedColorFromStorage()
  applyIcon(storedColor || '#0E396E')

  // Re-run whenever the Pinia store's primaryColor changes — covers both the
  // cloud-settings load after login and live changes in Global Settings.
  watch(() => store.uiSettings?.primaryColor, apply)
}
