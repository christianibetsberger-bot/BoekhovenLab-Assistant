import { watch } from 'vue'
import { useLabStore } from '../stores/labStore.js'

// ── Color utilities ──────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const c = hex.replace('#', '')
  return [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)]
}

function rgbToHex(r, g, b) {
  return '#' + [r,g,b].map(v =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2,'0')
  ).join('')
}

function hexToHsl(hex) {
  let [r,g,b] = hexToRgb(hex).map(v => v/255)
  const max = Math.max(r,g,b), min = Math.min(r,g,b)
  let h = 0, s = 0, l = (max+min)/2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d/(2-max-min) : d/(max+min)
    if (max===r) h = ((g-b)/d + (g<b?6:0))/6
    else if (max===g) h = ((b-r)/d + 2)/6
    else h = ((r-g)/d + 4)/6
  }
  return [h*360, s*100, l*100]
}

function hslToHex(h, s, l) {
  h/=360; s/=100; l/=100
  let r, g, b
  if (s === 0) {
    r = g = b = l
  } else {
    const hue = (p, q, t) => {
      if (t<0) t+=1; if (t>1) t-=1
      if (t<1/6) return p+(q-p)*6*t
      if (t<1/2) return q
      if (t<2/3) return p+(q-p)*(2/3-t)*6
      return p
    }
    const q = l < 0.5 ? l*(1+s) : l+s-l*s
    const p = 2*l - q
    r = hue(p,q,h+1/3); g = hue(p,q,h); b = hue(p,q,h-1/3)
  }
  return rgbToHex(r*255, g*255, b*255)
}

function shiftL(hex, delta) {
  const [h,s,l] = hexToHsl(hex)
  return hslToHex(h, s, Math.max(5, Math.min(95, l+delta)))
}

// ── SVG icon — coacervate droplet cluster ────────────────────────────────────
//
// 512×512 viewBox, macOS squircle background (rx 114 ≈ 22%).
// Droplets are white with a radial gradient (bright upper-left highlight → transparent
// edge) that mimics the phase-contrast microscopy appearance of coacervates.
// objectBoundingBox (SVG default) positions the highlight relative to each circle's
// own bounding box, so all droplets get correctly placed specular spots.

function makeIconSVG(color) {
  const bgTop    = shiftL(color,  14)
  const bgBottom = shiftL(color, -20)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="${bgTop}"/>
      <stop offset="100%" stop-color="${bgBottom}"/>
    </linearGradient>
    <linearGradient id="gl" x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="white" stop-opacity="0.25"/>
      <stop offset="50%"  stop-color="white" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="dm" cx="34%" cy="30%" r="64%">
      <stop offset="0%"   stop-color="white" stop-opacity="0.92"/>
      <stop offset="36%"  stop-color="white" stop-opacity="0.26"/>
      <stop offset="100%" stop-color="white" stop-opacity="0.07"/>
    </radialGradient>
    <radialGradient id="ds" cx="33%" cy="27%" r="67%">
      <stop offset="0%"   stop-color="white" stop-opacity="0.88"/>
      <stop offset="30%"  stop-color="white" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="white" stop-opacity="0.05"/>
    </radialGradient>
  </defs>

  <rect width="512" height="512" rx="114" fill="url(#bg)"/>
  <rect width="512" height="512" rx="114" fill="url(#gl)"/>

  <circle cx="210" cy="238" r="118" fill="url(#dm)" stroke="white" stroke-width="6.5" stroke-opacity="0.72"/>
  <circle cx="322" cy="298" r="76"  fill="url(#dm)" stroke="white" stroke-width="5.5" stroke-opacity="0.65"/>
  <circle cx="390" cy="155" r="50"  fill="url(#ds)" stroke="white" stroke-width="4.5" stroke-opacity="0.60"/>
  <circle cx="128" cy="372" r="36"  fill="url(#ds)" stroke="white" stroke-width="4.0" stroke-opacity="0.55"/>
  <circle cx="416" cy="276" r="22"  fill="url(#ds)" stroke="white" stroke-width="3.0" stroke-opacity="0.50"/>
  <circle cx="105" cy="190" r="15"  fill="url(#ds)" stroke="white" stroke-width="2.5" stroke-opacity="0.45"/>
  <circle cx="422" cy="394" r="11"  fill="url(#ds)" stroke="white" stroke-width="2.0" stroke-opacity="0.40"/>
  <circle cx="170" cy="462" r="8"   fill="url(#ds)" stroke="white" stroke-width="1.5" stroke-opacity="0.35"/>
</svg>`
}

// ── DOM updater ───────────────────────────────────────────────────────────────

let _prevManifestUrl = null

async function applyIcon(color) {
  if (!color || typeof color !== 'string') return

  const svg    = makeIconSVG(color)
  const svgB64 = btoa(unescape(encodeURIComponent(svg)))
  const svgUrl = `data:image/svg+xml;base64,${svgB64}`

  // Favicon (SVG data URL — instant, no CORS issues)
  const fav = document.querySelector("link[rel~='icon']") ?? (() => {
    const el = document.createElement('link')
    el.rel = 'icon'; el.type = 'image/svg+xml'
    document.head.appendChild(el); return el
  })()
  fav.href = svgUrl

  // theme-color meta (browser toolbar tint on macOS Safari / Chrome)
  const themeMeta = document.querySelector("meta[name='theme-color']")
  if (themeMeta) themeMeta.content = color

  // apple-touch-icon + manifest icon — need PNG via canvas (async)
  const img = new Image()
  img.onload = () => {
    try {
      const canvas = Object.assign(document.createElement('canvas'), { width: 512, height: 512 })
      canvas.getContext('2d').drawImage(img, 0, 0)
      const pngUrl = canvas.toDataURL('image/png')

      // apple-touch-icon (macOS Safari PWA dock icon)
      const ati = document.querySelector("link[rel='apple-touch-icon']") ?? (() => {
        const el = document.createElement('link')
        el.rel = 'apple-touch-icon'
        document.head.appendChild(el); return el
      })()
      ati.href = pngUrl

      // Rewrite manifest blob so the install-time icon matches the user's color.
      // Static PNGs are included as fallback so the dock always has a real PNG.
      const manifest = JSON.stringify({
        name: 'BoekhovenLab Assistant',
        short_name: 'Lab Assistant',
        description: 'Integrated research toolkit for the Boekhoven Lab',
        display: 'standalone',
        background_color: color,
        theme_color: color,
        start_url: '/',
        icons: [
          { src: pngUrl,         sizes: '512x512', type: 'image/png',      purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png',      purpose: 'any maskable' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png',      purpose: 'any maskable' },
          { src: '/favicon.svg',  sizes: 'any',     type: 'image/svg+xml'                           },
        ],
      })
      const blob = new Blob([manifest], { type: 'application/json' })
      if (_prevManifestUrl) URL.revokeObjectURL(_prevManifestUrl)
      _prevManifestUrl = URL.createObjectURL(blob)
      const mlink = document.querySelector("link[rel='manifest']")
      if (mlink) mlink.href = _prevManifestUrl
    } catch (_) { /* cross-origin canvas taint — skip PNG path */ }
  }
  img.src = svgUrl
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
