<script setup>
// The OT-2 deck drawn the way the Opentrons App's "Deck View" draws it: a
// 3 × 4 grid of nearly-white slot tiles seen from above, the back row
// (10 · 11 · TRASH) at the top and the front row (1 · 2 · 3) at the bottom.
// Empty slots show only their number; occupied slots are filled edge to edge
// by their labware — a plate of round wells, a tip rack of dense dots, a rack
// of tubes, the troughs of a reservoir — in monochrome grey with thin dark
// strokes. The Thermocycler stands once, as one tall unit, in the left column
// over slots 7 and 10; slots 8 and 11 stay visible but hatched, since the
// robot reserves them for it.
//
// What goes beyond the reference, so the dialog can rely on the map: the plate
// being built is tinted with the app accent; sample labware, liquid sources and
// modules carry a thin coloured bar along their top edge; every occupied slot
// has a caption line with its slot number and its role (or the pipette that
// owns a tip rack). Neutrals are the app's tokens, so both themes work.
//
// Input is the generator's summary.deck: one row per occupied slot.
import { computed, useId } from 'vue'

// `overlay` is what the run preview paints on top of the deck for one moment
// of the run: the wells being drawn from and dispensed into, the wells already
// filled, the tips already used, the module states, and a banner when the
// person at the bench has to do something. Null draws the plain deck.
//   { src: { slot, wells[] } | null, dst: { slot, wells[] } | null,
//     filled: { [slot]: string[] }, tips: { [slot]: { used, columns } },
//     modules: { tcLid, tcBlock, tcLidTemp, temp, hsTemp, hsRpm, mag } | null,
//     banner: { kind: 'user' | 'wait' | 'info', text } | null }
const props = defineProps({ deck: { type: Array, default: () => [] }, overlay: { type: Object, default: null } })

// ── Deck geometry (SBS footprint 128 : 86, 8-unit gaps) ──
const SW = 128, SH = 86, GAP = 8, PAD = 8
const ORDER = [['10', '11', '12'], ['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3']]
const pos = {}
ORDER.forEach((row, r) => row.forEach((s, c) => { pos[s] = { x: PAD + c * (SW + GAP), y: PAD + r * (SH + GAP) } }))
const W = PAD * 2 + 3 * SW + 2 * GAP   // 416
const H = PAD * 2 + 4 * SH + 3 * GAP   // 384
const CAPTION = 13                     // the caption line reserved along the bottom of a labware

// The plate being built is tinted, not barred; everything else gets a bar.
const ROLE_COLOR = { plate: '', samples: '#CC79A7', stocks: '#009E73', bulk: '#009E73', reservoir: '#009E73', module: '#E69F00', tips: '' }
const ROLE_WORD = { plate: 'plate', samples: 'samples', stocks: 'stocks', bulk: 'bulk', reservoir: 'reservoir' }
const MODULE_LABEL = { temperature: 'Temperature', heater_shaker: 'Heater-Shaker', magnetic: 'Magnetic' }

// Several maps can sit on one page; a pattern id must not be shared between them.
const hatchId = useId() + '-hatch'

const bySlot = computed(() => Object.fromEntries(props.deck.map(d => [String(d.slot), d])))
const tc = computed(() => props.deck.find(d => d.moduleType === 'thermocycler' && d.anchor) || null)
const TC_UNDER = new Set(['7', '10'])      // covered by the unit
const TC_RESERVED = new Set(['8', '11'])   // kept free for it

// ── Glyph geometry ──
// rows × cols grid of centres filling a box. The pitch may differ between the
// two axes (up to 1.4 : 1) so a well field fills a wide, short box instead of
// leaving blank margins; `shrink` is the radius as a fraction of the pitch.
const ROWS = 'ABCDEFGHIJKLMNOP'
function grid(box, rows, cols, shrink) {
  const cx = box.w / cols, cy = box.h / rows
  const cellX = Math.min(cx, cy * 1.4), cellY = Math.min(cy, cx * 1.4)
  const ox = box.x + (box.w - cellX * cols) / 2 + cellX / 2
  const oy = box.y + (box.h - cellY * rows) / 2 + cellY / 2
  const pts = [], names = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { pts.push({ x: ox + c * cellX, y: oy + r * cellY }); names.push(`${ROWS[r]}${c + 1}`) }
  return { pts, names, rows, cols, r: Math.min(cellX, cellY) * shrink }
}
// Reservoir troughs: `cols` upright troughs for a single row, otherwise `rows` flat ones.
function troughs(box, rows, cols) {
  const out = [], g = 2
  if (rows <= 1) {
    const w = (box.w - g * (cols - 1)) / cols
    for (let c = 0; c < cols; c++) out.push({ x: box.x + c * (w + g), y: box.y, w, h: box.h, name: `A${c + 1}` })
  } else {
    const h = (box.h - g * (rows - 1)) / rows
    for (let r = 0; r < rows; r++) out.push({ x: box.x, y: box.y + r * (h + g), w: box.w, h, name: `${ROWS[r]}1` })
  }
  return out
}

// A labware drawn inside `box` (its outer rounded rectangle). Bare labware
// keeps a caption line free along its bottom edge; labware on a module does
// not (the module tile carries the caption).
function labwareGlyph(lw, box, caption) {
  const k = lw?.kind || 'plate'
  const rows = lw?.rows || 0, cols = lw?.cols || 0
  const inner = caption
    ? { x: box.x + 3, y: box.y + 6, w: box.w - 6, h: box.h - 6 - CAPTION - 2 }
    : { x: box.x + 3, y: box.y + 4, w: box.w - 6, h: box.h - 7 }
  if (k === 'tiprack') return { type: 'tips', box, ...grid(inner, rows || 8, cols || 12, 0.3) }
  if (k === 'reservoir') return { type: 'troughs', box, troughs: troughs(inner, rows || 1, cols || 1) }
  if (k === 'tuberack' || (k === 'block' && rows > 0 && rows <= 4)) return { type: 'tubes', box, ...grid(inner, rows || 4, cols || 6, 0.38) }
  const r = rows || 8, c = cols || 12
  return { type: 'wells', box, ...grid(inner, r, c, r >= 16 ? 0.3 : 0.36) }
}

// ── What the overlay says about a slot ──
const ov = computed(() => props.overlay || null)
const setOf = (arr) => new Set(arr || [])
const slotState = (slot) => {
  const o = ov.value
  if (!o) return null
  const isSrc = o.src && String(o.src.slot) === slot, isDst = o.dst && String(o.dst.slot) === slot
  return {
    src: isSrc ? setOf(o.src.wells) : null, dst: isDst ? setOf(o.dst.wells) : null,
    filled: setOf(o.filled?.[slot]), tips: o.tips?.[slot] || null,
    active: !!(isSrc || isDst),
  }
}
// The class of one well/tip/tube/trough by its name, given the slot's state.
const wellClass = (st, name, i, glyph) => {
  if (!st) return ''
  if (glyph.type === 'tips' && st.tips) {
    // Tips are taken column by column (A1, B1, … H1, A2, …); an 8-channel takes a whole column at once.
    const col = i % glyph.cols, row = Math.floor(i / glyph.cols)
    const used = st.tips.columns ? col < st.tips.used : (col * glyph.rows + row) < st.tips.used
    return used ? 'used' : ''
  }
  if (st.dst?.has(name)) return 'dst'
  if (st.src?.has(name)) return 'src'
  if (st.filled.has(name)) return 'filled'
  return ''
}

// ── One entry per slot tile (the two under the Thermocycler are not drawn) ──
const cells = computed(() => Object.keys(pos)
  .filter(slot => !(tc.value && TC_UNDER.has(slot)))
  .map(slot => {
    const { x, y } = pos[slot]
    const d = bySlot.value[slot] || null
    const c = { slot, x, y, kind: 'empty', title: `Slot ${slot}: empty`, role: '', st: slotState(slot) }
    if (slot === '12') { c.kind = 'trash'; c.title = 'Slot 12: fixed trash'; return c }
    if (tc.value && TC_RESERVED.has(slot)) { c.kind = 'reserved'; c.title = `Slot ${slot}: reserved for the Thermocycler`; return c }
    if (!d) return c
    c.title = `Slot ${slot}: ${d.what || 'occupied'}`
    const lw = { x: x + 3, y: y + 3, w: SW - 6, h: SH - 6 }
    if (d.role === 'module') {
      c.kind = 'module'
      c.module = d.moduleType
      c.body = lw
      c.accent = ROLE_COLOR.module
      c.label = MODULE_LABEL[d.moduleType] || 'Module'
      c.platform = { x: x + 18, y: y + 9, w: SW - 36, h: 50 }
      if (d.onModule) {
        c.title += ` — ${d.onModule.label || d.onModule.name || ''}`
        // The generator only ever puts the plate being built on a module.
        c.role = 'plate'
        c.glyph = labwareGlyph(d.onModule, { x: c.platform.x + 2, y: c.platform.y + 2, w: c.platform.w - 4, h: c.platform.h - 4 }, false)
      }
      return c
    }
    c.kind = 'labware'
    c.role = d.role || ''
    c.accent = ROLE_COLOR[d.role] || ''
    c.glyph = labwareGlyph(d, lw, true)
    c.num = slot
    c.word = d.kind === 'tiprack' ? (d.pipette || 'tips') : (ROLE_WORD[d.role] || '')
    return c
  }))

// ── Overlay geometry: the path from source to target, badges, banner ──
const slotCentre = (slot) => {
  const s = String(slot)
  if (tc.value && (s === '7' || s === '10' || s === '8' || s === '11') && tcBox.value) {
    const b = tcBox.value; return { x: b.x + b.w / 2, y: b.y + b.h * 0.62 }
  }
  const p = pos[s]; return p ? { x: p.x + SW / 2, y: p.y + SH / 2 } : null
}
const path = computed(() => {
  const o = ov.value
  if (!o?.src || !o?.dst) return null
  const a = slotCentre(o.src.slot), b = slotCentre(o.dst.slot)
  if (!a || !b) return null
  if (String(o.src.slot) === String(o.dst.slot)) return { d: `M${a.x - 30} ${a.y - 26} q30 -28 60 0` }
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1
  const bow = Math.min(46, len * 0.25)
  return { d: `M${a.x} ${a.y} Q${mx - dy / len * bow} ${my + dx / len * bow} ${b.x} ${b.y}` }
})
const fmtTemp = (t) => (t == null ? null : `${Math.round(t * 10) / 10} °C`)
const badgeFor = (moduleType) => {
  const m = ov.value?.modules
  if (!m) return ''
  if (moduleType === 'thermocycler') return [m.tcLid === 'closed' ? 'lid closed' : 'lid open', fmtTemp(m.tcBlock)].filter(Boolean).join(' · ')
  if (moduleType === 'temperature') return fmtTemp(m.temp) || 'idle'
  if (moduleType === 'heater_shaker') return [fmtTemp(m.hsTemp), m.hsRpm ? `${m.hsRpm} rpm` : null].filter(Boolean).join(' · ') || 'idle'
  if (moduleType === 'magnetic') return m.mag === 'up' ? 'magnets up' : 'magnets down'
  return ''
}
// The banner wraps onto a second line rather than cutting a sentence short.
const banner = computed(() => {
  const b = ov.value?.banner
  if (!b) return null
  const words = String(b.text || '').split(/\s+/)
  const lines = ['']
  for (const w of words) {
    if ((lines[lines.length - 1] + ' ' + w).trim().length > 60 && lines.length < 2) lines.push(w)
    else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim()
  }
  if (lines[1] && lines[1].length > 60) lines[1] = lines[1].slice(0, 59) + '…'
  return { kind: b.kind, lines }
})

// ── The Thermocycler: one tall unit over slots 7 and 10, overhanging right ──
const tcUnit = computed(() => {
  if (!tc.value) return null
  const b = { x: pos['7'].x, y: pos['10'].y - 2, w: SW + 6, h: 2 * SH + GAP + 4 }
  const body = `M${b.x + 10} ${b.y} H${b.x + b.w - 10} a10 10 0 0 1 10 10 V${b.y + b.h - 4} a4 4 0 0 1 -4 4 H${b.x + 4} a4 4 0 0 1 -4 -4 V${b.y + 10} a10 10 0 0 1 10 -10 z`
  const lid = { x: b.x + 8, y: b.y + 8, w: b.w - 16, h: 40 }
  const holder = { x: b.x + 8, y: b.y + 56, w: b.w - 16, h: 96 }
  const plate = { x: b.x + 16, y: b.y + 66, w: b.w - 32, h: 76 }
  const notches = [
    { x: holder.x + 2, y: holder.y + 2 }, { x: holder.x + holder.w - 7, y: holder.y + 2 },
    { x: holder.x + 2, y: holder.y + holder.h - 7 }, { x: holder.x + holder.w - 7, y: holder.y + holder.h - 7 },
  ]
  const lwOn = tc.value.onModule
  return {
    st: slotState('7'),
    box: b, body, lid, holder, plate, notches,
    handle: { x: b.x + b.w / 2 - 20, y: lid.y + 14, w: 40, h: 5 },
    vent: { x: b.x + 14, y: b.y + b.h - 20, w: b.w - 42, h: 4 },
    dot: { cx: b.x + b.w - 14, cy: b.y + b.h - 18 },
    glyph: lwOn ? labwareGlyph(lwOn, plate, false) : null,
    title: `Thermocycler (slots 7 · 10)${lwOn ? ` — ${lwOn.label || lwOn.name || ''}` : ''}`,
  }
})
</script>

<template>
  <svg class="deck" :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="OT-2 deck">
    <defs>
      <pattern :id="hatchId" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" class="hatch" />
      </pattern>
    </defs>
    <rect x=".5" y=".5" :width="W - 1" :height="H - 1" rx="12" class="panel" />

    <!-- Slot tiles -->
    <g v-for="c in cells" :key="c.slot" class="slot" :class="[c.kind, { active: c.st?.active, 'active-src': !!c.st?.src, 'active-dst': !!c.st?.dst }]">
      <title>{{ c.title }}</title>
      <rect :x="c.x" :y="c.y" :width="SW" :height="SH" rx="4" class="base" />

      <!-- Empty: the number only -->
      <text v-if="c.kind === 'empty'" :x="c.x + SW / 2" :y="c.y + SH / 2" dy=".36em" text-anchor="middle" class="num">{{ c.slot }}</text>

      <!-- Reserved for the Thermocycler: hatched, number muted further -->
      <template v-else-if="c.kind === 'reserved'">
        <rect :x="c.x" :y="c.y" :width="SW" :height="SH" rx="4" :fill="`url(#${hatchId})`" class="reserve" />
        <text :x="c.x + SW / 2" :y="c.y + SH / 2" dy=".36em" text-anchor="middle" class="num dim">{{ c.slot }}</text>
      </template>

      <!-- Fixed trash -->
      <text v-else-if="c.kind === 'trash'" :x="c.x + SW / 2" :y="c.y + SH / 2" dy=".36em" text-anchor="middle" class="trash">TRASH</text>

      <!-- A module: grey block, one telling detail, a recessed platform, its labware, a caption -->
      <template v-else-if="c.kind === 'module'">
        <rect :x="c.body.x" :y="c.body.y" :width="c.body.w" :height="c.body.h" rx="4" class="mbody" />
        <path :d="`M${c.body.x + 4} ${c.body.y + 1.5} H${c.body.x + c.body.w - 4}`" class="bar" :style="{ stroke: c.accent }" />
        <template v-if="c.module === 'temperature'">
          <rect :x="c.x + 9" :y="c.y + 10" width="5" height="50" rx="2" class="heat" />
        </template>
        <template v-else-if="c.module === 'heater_shaker'">
          <rect :x="c.x + 9" :y="c.y + 10" width="5" height="50" rx="2" class="rail" />
          <rect :x="c.x + SW - 14" :y="c.y + 10" width="5" height="50" rx="2" class="rail" />
          <path :d="`M${c.x + 10} ${c.y + 66} q5 -4 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0`" class="wave" />
        </template>
        <template v-else-if="c.module === 'magnetic'">
          <path :d="`M${c.x + 5} ${c.y + 44} v-10 a5.5 5.5 0 0 1 11 0 v10 h-3.5 v-10 a2 2 0 0 0 -4 0 v10 z`" class="magnet" />
          <rect :x="c.x + 5" :y="c.y + 41" width="3.5" height="3" class="pole" />
          <rect :x="c.x + 12.5" :y="c.y + 41" width="3.5" height="3" class="pole" />
        </template>
        <rect :x="c.platform.x" :y="c.platform.y" :width="c.platform.w" :height="c.platform.h" rx="3" class="platform" />
        <g v-if="c.glyph" class="lw" :class="[c.glyph.type, 'role-' + c.role]">
          <rect :x="c.glyph.box.x" :y="c.glyph.box.y" :width="c.glyph.box.w" :height="c.glyph.box.h" rx="3" class="frame" />
          <template v-if="c.glyph.type === 'troughs'">
            <rect v-for="(t, i) in c.glyph.troughs" :key="i" :x="t.x" :y="t.y" :width="t.w" :height="t.h" rx="1.5" class="trough" :class="wellClass(c.st, t.name, i, c.glyph)" />
          </template>
          <template v-else-if="c.glyph.type === 'tips'">
            <circle v-for="(p, i) in c.glyph.pts" :key="i" :cx="p.x" :cy="p.y" :r="c.glyph.r" class="tip" :class="wellClass(c.st, c.glyph.names[i], i, c.glyph)" />
          </template>
          <template v-else-if="c.glyph.type === 'tubes'">
            <g v-for="(p, i) in c.glyph.pts" :key="i" :class="wellClass(c.st, c.glyph.names[i], i, c.glyph)">
              <circle :cx="p.x" :cy="p.y" :r="c.glyph.r" class="tube" />
              <circle :cx="p.x" :cy="p.y" :r="c.glyph.r * 0.58" class="tube-in" />
            </g>
          </template>
          <template v-else>
            <circle v-for="(p, i) in c.glyph.pts" :key="i" :cx="p.x" :cy="p.y" :r="c.glyph.r" class="well" :class="wellClass(c.st, c.glyph.names[i], i, c.glyph)" />
          </template>
        </g>
        <text v-if="badgeFor(c.module)" :x="c.x + SW / 2" :y="c.y + 12" text-anchor="middle" class="badge">{{ badgeFor(c.module) }}</text>
        <text :x="c.x + 7" :y="c.y + SH - 6" class="cap num">{{ c.slot }}</text>
        <text :x="c.x + SW / 2 + (c.slot.length > 1 ? 5 : 0)" :y="c.y + SH - 6" text-anchor="middle" class="mlabel">{{ c.label }}</text>
      </template>

      <!-- Bare labware filling the slot, with its caption line -->
      <g v-else-if="c.kind === 'labware'" class="lw" :class="[c.glyph.type, 'role-' + c.role]">
        <rect :x="c.glyph.box.x" :y="c.glyph.box.y" :width="c.glyph.box.w" :height="c.glyph.box.h" rx="4" class="frame" />
        <path v-if="c.accent" :d="`M${c.glyph.box.x + 4} ${c.glyph.box.y + 1.5} H${c.glyph.box.x + c.glyph.box.w - 4}`" class="bar" :style="{ stroke: c.accent }" />
        <template v-if="c.glyph.type === 'troughs'">
          <rect v-for="(t, i) in c.glyph.troughs" :key="i" :x="t.x" :y="t.y" :width="t.w" :height="t.h" rx="1.5" class="trough" :class="wellClass(c.st, t.name, i, c.glyph)" />
        </template>
        <template v-else-if="c.glyph.type === 'tips'">
          <circle v-for="(p, i) in c.glyph.pts" :key="i" :cx="p.x" :cy="p.y" :r="c.glyph.r" class="tip" :class="wellClass(c.st, c.glyph.names[i], i, c.glyph)" />
        </template>
        <template v-else-if="c.glyph.type === 'tubes'">
          <g v-for="(p, i) in c.glyph.pts" :key="i" :class="wellClass(c.st, c.glyph.names[i], i, c.glyph)">
            <circle :cx="p.x" :cy="p.y" :r="c.glyph.r" class="tube" />
            <circle :cx="p.x" :cy="p.y" :r="c.glyph.r * 0.58" class="tube-in" />
          </g>
        </template>
        <template v-else>
          <circle v-for="(p, i) in c.glyph.pts" :key="i" :cx="p.x" :cy="p.y" :r="c.glyph.r" class="well" :class="wellClass(c.st, c.glyph.names[i], i, c.glyph)" />
        </template>
        <text :x="c.glyph.box.x + 6" :y="c.glyph.box.y + c.glyph.box.h - 4" class="cap num">{{ c.num }}</text>
        <text :x="c.glyph.box.x + c.glyph.box.w - 6" :y="c.glyph.box.y + c.glyph.box.h - 4" text-anchor="end" class="cap word">{{ c.word }}</text>
      </g>
    </g>

    <!-- Thermocycler: one tall unit in the left column over slots 7 and 10 -->
    <g v-if="tcUnit" class="tc" :class="{ active: tcUnit.st?.active, 'active-src': !!tcUnit.st?.src, 'active-dst': !!tcUnit.st?.dst }">
      <title>{{ tcUnit.title }}</title>
      <path :d="tcUnit.body" class="tcbody" />
      <path :d="`M${tcUnit.box.x + 10} ${tcUnit.box.y + 1.5} H${tcUnit.box.x + tcUnit.box.w - 10}`" class="bar" :style="{ stroke: ROLE_COLOR.module }" />
      <!-- lid with its handle, and the slots it stands on -->
      <rect :x="tcUnit.lid.x" :y="tcUnit.lid.y" :width="tcUnit.lid.w" :height="tcUnit.lid.h" rx="5" class="lid" />
      <rect :x="tcUnit.handle.x" :y="tcUnit.handle.y" :width="tcUnit.handle.w" :height="tcUnit.handle.h" rx="2.5" class="handle" />
      <text :x="tcUnit.lid.x + 8" :y="tcUnit.lid.y + tcUnit.lid.h - 8" class="cap num">7 · 10</text>
      <!-- plate holder with corner notches -->
      <rect :x="tcUnit.holder.x" :y="tcUnit.holder.y" :width="tcUnit.holder.w" :height="tcUnit.holder.h" rx="3" class="holder" />
      <rect v-for="(n, i) in tcUnit.notches" :key="i" :x="n.x" :y="n.y" width="5" height="5" rx="1" class="notch" />
      <g v-if="tcUnit.glyph" class="lw role-plate" :class="tcUnit.glyph.type">
        <rect :x="tcUnit.plate.x" :y="tcUnit.plate.y" :width="tcUnit.plate.w" :height="tcUnit.plate.h" rx="3" class="frame" />
        <template v-if="tcUnit.glyph.type === 'troughs'">
          <rect v-for="(t, i) in tcUnit.glyph.troughs" :key="i" :x="t.x" :y="t.y" :width="t.w" :height="t.h" rx="1.5" class="trough" :class="wellClass(tcUnit.st, t.name, i, tcUnit.glyph)" />
        </template>
        <template v-else-if="tcUnit.glyph.type === 'tubes'">
          <g v-for="(p, i) in tcUnit.glyph.pts" :key="i" :class="wellClass(tcUnit.st, tcUnit.glyph.names[i], i, tcUnit.glyph)">
            <circle :cx="p.x" :cy="p.y" :r="tcUnit.glyph.r" class="tube" />
            <circle :cx="p.x" :cy="p.y" :r="tcUnit.glyph.r * 0.58" class="tube-in" />
          </g>
        </template>
        <template v-else>
          <circle v-for="(p, i) in tcUnit.glyph.pts" :key="i" :cx="p.x" :cy="p.y" :r="tcUnit.glyph.r" :class="[tcUnit.glyph.type === 'tips' ? 'tip' : 'well', wellClass(tcUnit.st, tcUnit.glyph.names[i], i, tcUnit.glyph)]" />
        </template>
      </g>
      <rect v-else :x="tcUnit.plate.x" :y="tcUnit.plate.y" :width="tcUnit.plate.w" :height="tcUnit.plate.h" rx="3" class="block" />
      <text v-if="badgeFor('thermocycler')" :x="tcUnit.lid.x + tcUnit.lid.w - 8" :y="tcUnit.lid.y + tcUnit.lid.h - 8" text-anchor="end" class="badge">{{ badgeFor('thermocycler') }}</text>
      <!-- vent bar and indicator -->
      <rect :x="tcUnit.vent.x" :y="tcUnit.vent.y" :width="tcUnit.vent.w" :height="tcUnit.vent.h" rx="2" class="vent" />
      <circle :cx="tcUnit.dot.cx" :cy="tcUnit.dot.cy" r="4" class="dot" />
    </g>

    <!-- Preview overlay: the move being made, and anything the person must do -->
    <defs v-if="path">
      <marker :id="hatchId + '-arrow'" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" class="arrowhead" />
      </marker>
    </defs>
    <path v-if="path" :d="path.d" class="move" :marker-end="`url(#${hatchId}-arrow)`" />
    <g v-if="banner" class="banner" :class="banner.kind">
      <rect :x="PAD + 10" :y="PAD + 10" :width="W - PAD * 2 - 20" :height="banner.lines.length > 1 ? 58 : 44" rx="9" class="banner-bg" />
      <text :x="W / 2" :y="PAD + 10 + 18" text-anchor="middle" class="banner-title">{{ banner.kind === 'user' ? 'YOUR TURN' : banner.kind === 'wait' ? 'WAITING' : 'NOTE' }}</text>
      <text v-for="(l, i) in banner.lines" :key="i" :x="W / 2" :y="PAD + 10 + 34 + i * 14" text-anchor="middle" class="banner-text">{{ l }}</text>
    </g>
  </svg>
</template>

<style scoped>
/* The aspect ratio is stated explicitly so a browser that does not derive it
   from the viewBox cannot give the SVG a default height. */
.deck { width: 100%; height: auto; aspect-ratio: 416 / 384; display: block; overflow: hidden; font-family: inherit; }
.deck text { user-select: none; }

/* The light neutral panel the tiles sit on */
.panel { fill: var(--fl); stroke: var(--ln); stroke-width: 1; }

/* Slot tiles: nearly white, a hairline a shade darker */
.base { fill: var(--cd); stroke: var(--ln2); stroke-width: 1; }
.num { font-size: 26px; font-weight: 700; fill: var(--tx3); }
.num.dim { opacity: .5; }
.trash { font-size: 16px; font-weight: 700; fill: var(--tx3); letter-spacing: .12em; }
.hatch { stroke: var(--ln2); stroke-width: 1.2; }
.reserve { stroke: none; }

/* Captions: slot number left, role or pipette right. `.cap.num` restates the
   size so a caption never inherits the big empty-slot number by rule order. */
.cap { font-size: 11px; font-weight: 700; }
.cap.num { font-size: 11px; fill: var(--tx3); }
.cap.word { fill: var(--tx2); }

/* Labware: a shade darker than the slot, thin dark strokes, grey contents */
.frame { fill: var(--fl); stroke: var(--tx3); stroke-width: .8; }
.bar { fill: none; stroke-width: 3; stroke-linecap: round; }
.well { fill: var(--cd); stroke: var(--tx3); stroke-width: .7; }
.tip { fill: var(--tx3); }
.tube { fill: var(--cd); stroke: var(--tx3); stroke-width: .9; }
.tube-in { fill: none; stroke: var(--tx3); stroke-width: .7; }
.trough { fill: var(--cd); stroke: var(--tx3); stroke-width: .7; }

/* The plate being built is the one thing in the app's accent */
.lw.role-plate .frame { fill: var(--acs); stroke: var(--acc); }
.lw.role-plate .well, .lw.role-plate .tube, .lw.role-plate .tube-in, .lw.role-plate .trough { stroke: var(--acc); }

/* Modules: a grey block, a recessed platform, one telling detail each */
.mbody { fill: var(--fl); stroke: var(--tx3); stroke-width: .8; }
.platform { fill: var(--cd); opacity: .55; stroke: var(--ln2); stroke-width: .7; }
.mlabel { font-size: 11px; font-weight: 700; fill: var(--tx2); letter-spacing: .02em; }
.heat { fill: #E69F00; }
.rail { fill: var(--tx3); }
.wave { fill: none; stroke: var(--tx3); stroke-width: 1.2; }
.magnet { fill: var(--tx3); }
.pole { fill: #E69F00; }

/* Preview overlay */
.slot.active-dst .base, .tc.active-dst .tcbody { stroke: var(--acc); stroke-width: 2; }
.slot.active-src .base, .tc.active-src .tcbody { stroke: #009E73; stroke-width: 2; }
.well.filled, .tube.filled, .filled .tube-in { fill: var(--acc); opacity: .35; }
.lw.role-samples .well.filled { fill: #CC79A7; opacity: .45; }
.well.dst, .filled.dst, .dst .tube-in { fill: var(--acc); opacity: 1; stroke: var(--acc); }
.well.src, .src .tube, .src .tube-in, .trough.src { fill: #009E73; stroke: #009E73; opacity: .85; }
.trough.dst { fill: var(--acc); stroke: var(--acc); }
.tip.used { opacity: .12; }
.move { fill: none; stroke: var(--acc); stroke-width: 2.5; stroke-dasharray: 6 4; animation: otd-flow 1.2s linear infinite; }
.arrowhead { fill: var(--acc); }
@keyframes otd-flow { to { stroke-dashoffset: -20; } }
.badge { font-size: 10px; font-weight: 700; fill: #b45309; }
.banner-bg { stroke-width: 1.2; }
.banner.user .banner-bg { fill: rgba(217,119,6,.92); stroke: #b45309; }
.banner.wait .banner-bg { fill: var(--acc); stroke: var(--acc); opacity: .92; }
.banner.info .banner-bg { fill: var(--tx3); stroke: var(--tx3); opacity: .9; }
.banner-title { font-size: 11px; font-weight: 800; letter-spacing: .12em; fill: #fff; }
.banner-text { font-size: 11.5px; font-weight: 600; fill: #fff; }

/* Thermocycler */
.tcbody { fill: var(--fl); stroke: var(--tx3); stroke-width: 1; }
.lid { fill: var(--cd); stroke: var(--tx3); stroke-width: .8; }
.handle { fill: var(--tx3); }
.holder { fill: var(--cd); stroke: var(--tx3); stroke-width: .8; }
.notch { fill: var(--ln2); stroke: var(--tx3); stroke-width: .5; }
.block { fill: var(--fl); stroke: var(--ln2); stroke-width: .8; stroke-dasharray: 3 3; }
.vent { fill: var(--tx3); opacity: .6; }
.dot { fill: var(--cd); stroke: var(--tx3); stroke-width: .8; }
</style>
