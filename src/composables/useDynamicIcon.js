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

// ── SVG icon — Erlenmeyer flask with molecule in liquid ──────────────────────
//
// 512×512 viewBox, macOS squircle background (rx 114 ≈ 22%).
// The flask is always white; background gradient shifts with the user's color.

function makeIconSVG(color) {
  const bgTop    = shiftL(color,  14)
  const bgBottom = shiftL(color, -20)

  // Flask outer wall path — Erlenmeyer silhouette:
  //   neck (206,65)→(306,65), body widens via cubic beziers to a flat base at y=472
  const flask = 'M206,65 L206,190 C148,220 84,294 66,368 C48,428 72,466 132,472 L380,472 C440,466 464,428 446,368 C428,294 364,220 306,190 L306,65 Z'

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="${bgTop}"/>
      <stop offset="100%" stop-color="${bgBottom}"/>
    </linearGradient>
    <linearGradient id="gl" x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="white" stop-opacity="0.28"/>
      <stop offset="55%"  stop-color="white" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="fc">
      <path d="${flask}"/>
    </clipPath>
  </defs>

  <!-- Squircle background -->
  <rect width="512" height="512" rx="114" fill="url(#bg)"/>
  <rect width="512" height="512" rx="114" fill="url(#gl)"/>

  <!-- Flask glass body: translucent fill + white outline -->
  <path d="${flask}"
    fill="white" fill-opacity="0.1"
    stroke="white" stroke-width="14" stroke-linejoin="round"/>

  <!-- Neck stopper / rim cap -->
  <rect x="190" y="50" width="132" height="20" rx="10"
    fill="white" fill-opacity="0.9"/>

  <!-- Liquid + molecule (all clipped inside flask wall) -->
  <g clip-path="url(#fc)">
    <!-- Liquid fill — lower ~40% of flask -->
    <rect x="40" y="358" width="432" height="130" fill="white" fill-opacity="0.28"/>

    <!-- Liquid surface (subtle wave) -->
    <path d="M66,362 Q170,350 256,364 Q342,378 446,362"
      fill="none" stroke="white" stroke-width="3.5" stroke-opacity="0.5"/>

    <!-- Molecule: central atom -->
    <circle cx="256" cy="426" r="22" fill="white" fill-opacity="0.92"/>
    <!-- Left bond + atom -->
    <line x1="238" y1="410" x2="182" y2="386"
      stroke="white" stroke-width="10" stroke-opacity="0.85" stroke-linecap="round"/>
    <circle cx="170" cy="380" r="16" fill="white" fill-opacity="0.88"/>
    <!-- Right bond + atom -->
    <line x1="274" y1="410" x2="330" y2="386"
      stroke="white" stroke-width="10" stroke-opacity="0.85" stroke-linecap="round"/>
    <circle cx="342" cy="380" r="16" fill="white" fill-opacity="0.88"/>
    <!-- Down bond + atom (round-bottom detail) -->
    <line x1="256" y1="448" x2="256" y2="463"
      stroke="white" stroke-width="10" stroke-opacity="0.78" stroke-linecap="round"/>
    <circle cx="256" cy="471" r="13" fill="white" fill-opacity="0.78"/>

    <!-- Micro bubbles for depth -->
    <circle cx="148" cy="447" r="9"  fill="white" fill-opacity="0.38"/>
    <circle cx="354" cy="455" r="7"  fill="white" fill-opacity="0.30"/>
    <circle cx="308" cy="424" r="5"  fill="white" fill-opacity="0.26"/>
  </g>

  <!-- Glass specular highlight on flask shoulder (outside clip = always visible) -->
  <path d="M288,200 C332,224 382,274 402,330 C406,342 402,354 394,356 C385,358 372,344 368,332 C350,280 306,234 278,216 Z"
    fill="white" fill-opacity="0.16"/>
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

      // Rewrite manifest blob so the install-time icon matches the user's color
      const manifest = JSON.stringify({
        name: 'BoekhovenLab Assistant',
        short_name: 'Lab Assistant',
        description: 'Integrated research toolkit for the Boekhoven Lab',
        display: 'standalone',
        background_color: color,
        theme_color: color,
        start_url: '/',
        icons: [
          { src: pngUrl,        sizes: '512x512', type: 'image/png',      purpose: 'any maskable' },
          { src: '/favicon.svg', sizes: 'any',     type: 'image/svg+xml'                           },
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

export function useDynamicIcon() {
  const store = useLabStore()
  const apply = () => applyIcon(store.uiSettings?.primaryColor || '#0E396E')

  // Run immediately (picks up default or already-loaded user prefs)
  apply()

  // Re-run whenever the user changes their theme color in Global Settings
  watch(() => store.uiSettings?.primaryColor, apply)
}
