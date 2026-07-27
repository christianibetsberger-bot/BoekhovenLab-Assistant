// Coacervate app icon — a cluster of coalescing liquid droplets with a nested
// multiphase droplet (the hallmark of a complex coacervate). One generator,
// used both at runtime (useDynamicIcon) and by scripts/gen-icons.mjs for the
// static PNG fallbacks. Produces a light and a dark variant, tinted to the
// user's accent colour.

function hexToRgb(hex) {
  const c = hex.replace('#', '')
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}
export function hexToHsl(hex) {
  let [r, g, b] = hexToRgb(hex).map(v => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0, l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return [h * 360, s * 100, l * 100]
}
export function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100
  let r, g, b
  if (s === 0) { r = g = b = l } else {
    const hue = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue(p, q, h + 1 / 3); g = hue(p, q, h); b = hue(p, q, h - 1 / 3)
  }
  return rgbToHex(r * 255, g * 255, b * 255)
}

// Build the coacervate icon SVG. dark=true → deep background + luminous white
// droplets; dark=false → bright background + glossy accent droplets.
export function coacervateSVG({ accent = '#0E396E', dark = true } = {}) {
  const [h, s] = hexToHsl(accent)
  const bgTop = dark ? hslToHex(h, Math.min(s, 72), 30) : hslToHex(h, Math.min(s, 34), 96)
  const bgBot = dark ? hslToHex(h, Math.min(s, 82), 15) : hslToHex(h, Math.min(s, 46), 83)

  // Droplet gloss stops [color, opacity] and rim.
  const S = dark
    ? { hi: ['#ffffff', 0.96], mid: ['#ffffff', 0.30], edge: ['#ffffff', 0.10], rim: ['#ffffff', 0.72], inner: ['#ffffff', 0.55] }
    : {
        hi: [hslToHex(h, Math.max(18, s - 14), 93), 1],
        mid: [hslToHex(h, Math.min(92, s + 12), 57), 1],
        edge: [hslToHex(h, Math.min(94, s + 18), 43), 1],
        rim: [hslToHex(h, Math.min(94, s + 18), 36), 0.92],
        inner: [hslToHex(h, Math.max(18, s - 8), 92), 0.95],
      }
  const sheen = dark ? 0.16 : 0.42

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${bgTop}"/>
      <stop offset="100%" stop-color="${bgBot}"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="${sheen}"/>
      <stop offset="46%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="drop" cx="35%" cy="30%" r="72%">
      <stop offset="0%"  stop-color="${S.hi[0]}"  stop-opacity="${S.hi[1]}"/>
      <stop offset="42%" stop-color="${S.mid[0]}" stop-opacity="${S.mid[1]}"/>
      <stop offset="100%" stop-color="${S.edge[0]}" stop-opacity="${S.edge[1]}"/>
    </radialGradient>
  </defs>

  <rect width="512" height="512" rx="114" fill="url(#bg)"/>

  <g fill="url(#drop)" stroke="${S.rim[0]}" stroke-opacity="${S.rim[1]}">
    <!-- coalescing cluster (painter's order: largest first) -->
    <circle cx="206" cy="252" r="122" stroke-width="7"/>
    <circle cx="322" cy="300" r="84"  stroke-width="6"/>
    <circle cx="360" cy="150" r="58"  stroke-width="5"/>
    <circle cx="120" cy="372" r="40"  stroke-width="4.5"/>
    <circle cx="424" cy="292" r="26"  stroke-width="3.5"/>
    <circle cx="96"  cy="168" r="17"  stroke-width="2.6"/>
    <circle cx="432" cy="404" r="12"  stroke-width="2"/>
    <!-- nested multiphase droplet inside the main one (a vacuolated coacervate) -->
    <circle cx="178" cy="236" r="37" fill="none" stroke="${S.inner[0]}" stroke-opacity="${S.inner[1]}" stroke-width="6"/>
    <circle cx="178" cy="236" r="17" stroke-width="3"/>
  </g>

  <rect width="512" height="512" rx="114" fill="url(#sheen)"/>
</svg>`
}
