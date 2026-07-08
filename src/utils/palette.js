// Colour palettes for the Data & Figures module.
//
// A palette bundles three things:
//   categorical – ordered series colours (line 1, line 2, …)
//   sequential  – light→dark ramp for heatmaps / continuous scales
//   control     – the fixed colour for blanks / reference traces
// plus a `colorMap` that pins a piece of dataset *content* (a sequence name,
// a condition label, …) to a fixed hex so the same entity keeps the same
// colour across every figure that plots it.
//
// The seeded "Boekhoven Lab" palette matches the group's published figures
// (steel-blue data, red controls) and the TUM secondary colour system. It is
// editable/duplicable once the palette-builder UI lands; nothing here is
// hard-wired into the plot code — plots read whichever palette is selected.

export const BOEKHOVEN_PALETTE = Object.freeze({
  id: 'boekhoven-lab',
  name: 'Boekhoven Lab',
  builtin: true,
  // TUM secondary palette + observed figure colours.
  categorical: [
    '#0065BD', // TUM blue (primary data)
    '#E37222', // TUM orange
    '#A2AD00', // TUM green
    '#98C6EA', // light blue
    '#64A0C8', // mid blue
    '#B55CA5', // magenta
    '#007C30', // dark green
    '#7F7F7F', // neutral grey
  ],
  // Blues ramp (matplotlib "Blues" / seaborn light_palette('#0065BD')).
  sequential: [
    '#F7FBFF', '#DEEBF7', '#C6DBEF', '#9ECAE1', '#6BAED6',
    '#4292C6', '#2171B5', '#08519C', '#08306B',
  ],
  control: '#D0021B', // red — blanks / reference
  colorMap: {},       // { contentKey: '#rrggbb' }
})

// A stable, deterministic index for a key so an un-pinned entity still gets a
// consistent colour between sessions (same key → same slot).
export function stableIndexForKey(key, n) {
  const s = String(key == null ? '' : key)
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return n > 0 ? (h >>> 0) % n : 0
}

// n-th categorical colour, wrapping.
export function categoricalColor(palette, i) {
  const cats = palette?.categorical?.length ? palette.categorical : BOEKHOVEN_PALETTE.categorical
  return cats[((i % cats.length) + cats.length) % cats.length]
}

// Colour for a piece of content. Explicit `colorMap` pin wins; otherwise fall
// back to the categorical slot at `index` (if given) or a stable hash slot.
export function colorForKey(palette, key, index = null) {
  const pinned = palette?.colorMap?.[key]
  if (pinned) return pinned
  const cats = palette?.categorical?.length ? palette.categorical : BOEKHOVEN_PALETTE.categorical
  const slot = index == null ? stableIndexForKey(key, cats.length) : index
  return categoricalColor(palette, slot)
}

// Assign colours to a list of content keys, honouring existing pins and giving
// each new key the next unused categorical slot (so a legend reads left→right
// in palette order). Returns a plain { key: hex } map — merge it back into
// `palette.colorMap` to persist the assignment.
export function assignColors(palette, keys) {
  const cats = palette?.categorical?.length ? palette.categorical : BOEKHOVEN_PALETTE.categorical
  const pins = palette?.colorMap || {}
  const out = {}
  let next = 0
  const used = new Set(Object.values(pins))
  for (const key of keys) {
    if (pins[key]) { out[key] = pins[key]; continue }
    // Skip categorical slots already taken by a pin so colours don't collide.
    while (used.has(cats[next % cats.length]) && next < cats.length) next++
    const color = cats[next % cats.length]
    out[key] = color
    used.add(color)
    next++
  }
  return out
}

// #rrggbb → 'rgba(r,g,b,a)' for fill bands (mean±SD, peak shading).
export function hexToRgba(hex, alpha = 1) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim())
  if (!m) return `rgba(0,0,0,${alpha})`
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// Palette.sequential → a Plotly colorscale [[0,hex], …, [1,hex]].
export function plotlyColorscale(palette) {
  const seq = palette?.sequential?.length ? palette.sequential : BOEKHOVEN_PALETTE.sequential
  const last = seq.length - 1
  return seq.map((hex, i) => [last === 0 ? 0 : i / last, hex])
}

// A fresh, editable copy of the seeded palette (for "duplicate & customise").
export function clonePalette(palette, overrides = {}) {
  const base = palette || BOEKHOVEN_PALETTE
  return {
    id: 'palette_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36)),
    name: (base.name || 'Palette') + ' copy',
    builtin: false,
    categorical: [...base.categorical],
    sequential: [...base.sequential],
    control: base.control,
    colorMap: { ...(base.colorMap || {}) },
    ...overrides,
  }
}
