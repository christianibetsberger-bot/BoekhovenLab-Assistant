<script setup>
// The OT-2 deck as the robot sees it: eleven SBS slots in three columns, the
// fixed trash at the back right, the Thermocycler spanning four slots. Every
// occupied slot draws what sits there — a plate with its wells, a tip rack, a
// rack of tubes, the troughs of a reservoir, a module with its labware on
// top — so a glance at the map matches the deck a person is about to load.
//
// Input is the generator's summary.deck: one row per occupied slot with the
// labware's kind/rows/cols, its role (plate, stocks, bulk, reservoir, samples,
// tips) and, for modules, the module type and any labware loaded on it.
import { computed } from 'vue'

const props = defineProps({ deck: { type: Array, default: () => [] } })

// Slot footprint in map units (SBS plate proportions), laid out front to back.
const SW = 128, SH = 86, GAP = 8, PAD = 8
const ORDER = [['10', '11', '12'], ['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3']]
const pos = {}
ORDER.forEach((row, r) => row.forEach((s, c) => { pos[s] = { x: PAD + c * (SW + GAP), y: PAD + r * (SH + GAP) } }))
const W = PAD * 2 + 3 * SW + 2 * GAP
const H = PAD * 2 + 4 * SH + 3 * GAP

const bySlot = computed(() => Object.fromEntries(props.deck.map(d => [String(d.slot), d])))
const tc = computed(() => props.deck.find(d => d.moduleType === 'thermocycler' && d.anchor) || null)
const tcSlots = new Set(['7', '8', '10', '11'])

// Slots drawn on their own (everything the Thermocycler does not cover).
const slots = computed(() => Object.keys(pos)
  .filter(s => !(tc.value && tcSlots.has(s)))
  .map(s => ({ slot: s, ...pos[s], d: bySlot.value[s] || null })))

// The Thermocycler block: slots 7 and 8 in front, 10 and 11 behind.
const tcBox = computed(() => tc.value ? { x: pos['7'].x, y: pos['10'].y, w: 2 * SW + GAP, h: 2 * SH + GAP } : null)

// ── Glyph geometry ──
// A grid of rows × cols centred in a box; `shrink` is the dot radius as a
// fraction of the cell pitch.
function grid(box, rows, cols, shrink = 0.34) {
  const cell = Math.min(box.w / cols, box.h / rows)
  const ox = box.x + (box.w - cell * cols) / 2 + cell / 2
  const oy = box.y + (box.h - cell * rows) / 2 + cell / 2
  const pts = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pts.push({ x: ox + c * cell, y: oy + r * cell })
  return { pts, r: cell * shrink, cell }
}
// Reservoir troughs: `cols` upright troughs (or `rows` flat ones) filling the box.
function troughs(box, rows, cols) {
  const out = []
  if (rows <= 1) {
    const g = 2, w = (box.w - g * (cols - 1)) / cols
    for (let c = 0; c < cols; c++) out.push({ x: box.x + c * (w + g), y: box.y, w, h: box.h })
  } else {
    const g = 2, h = (box.h - g * (rows - 1)) / rows
    for (let r = 0; r < rows; r++) out.push({ x: box.x, y: box.y + r * (h + g), w: box.w, h })
  }
  return out
}
const roleClass = (d) => ({ plate: 'plate', samples: 'samples', stocks: 'source', bulk: 'source', reservoir: 'source', tips: 'tips' }[d?.role] || 'neutral')

// What to draw for a labware row inside a box.
function labwareGlyph(lw, box, cls) {
  if (!lw || !lw.kind) return null
  const k = lw.kind
  if (k === 'tiprack') return { type: 'tips', cls, box, ...grid(box, 8, 12, 0.28) }
  if (k === 'reservoir') return { type: 'troughs', cls, box, troughs: troughs({ x: box.x + 4, y: box.y + 4, w: box.w - 8, h: box.h - 8 }, lw.rows, lw.cols) }
  if (k === 'tuberack' || (k === 'block' && lw.rows <= 4)) return { type: 'tubes', cls, box, ...grid({ x: box.x + 4, y: box.y + 4, w: box.w - 8, h: box.h - 8 }, lw.rows, lw.cols, 0.36) }
  const rows = lw.rows || 8, cols = lw.cols || 12
  return { type: 'plate', cls, box, ...grid({ x: box.x + 5, y: box.y + 5, w: box.w - 10, h: box.h - 10 }, rows, cols, rows >= 16 ? 0.3 : 0.34) }
}

// One entry per drawn slot: the base, an optional module body and its labware,
// or a bare labware glyph, plus a caption.
const cells = computed(() => slots.value.map(({ slot, x, y, d }) => {
  const inner = { x: x + 6, y: y + 15, w: SW - 12, h: SH - 29 }
  const cell = { slot, x, y, d, caption: '', glyph: null, module: null, trash: slot === '12' }
  if (slot === '12') { cell.caption = 'trash'; return cell }
  if (!d) return cell
  if (d.role === 'module') {
    cell.module = d.moduleType
    cell.caption = { temperature: 'temp module', heater_shaker: 'heater-shaker', magnetic: 'magnet' }[d.moduleType] || 'module'
    const lwBox = { x: inner.x + 10, y: inner.y + 6, w: inner.w - 20, h: inner.h - 10 }
    if (d.onModule) cell.glyph = labwareGlyph(d.onModule, lwBox, 'plate')
    return cell
  }
  cell.glyph = labwareGlyph(d, inner, roleClass(d))
  cell.caption = d.role === 'tips' ? `tips · ${d.pipette}` : d.role === 'plate' ? 'plate' : d.role || ''
  return cell
}))

const tcCell = computed(() => {
  if (!tcBox.value) return null
  const b = tcBox.value
  // Lid across the back, the block with its plate in front.
  const lid = { x: b.x + 10, y: b.y + 10, w: b.w - 20, h: b.h * 0.34 }
  const plateBox = { x: b.x + 62, y: b.y + b.h * 0.42, w: b.w - 124, h: b.h * 0.44 }
  return { box: b, lid, glyph: tc.value.onModule ? labwareGlyph(tc.value.onModule, plateBox, 'plate') : null }
})
</script>

<template>
  <svg class="deck" :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="OT-2 deck">
    <!-- Slots -->
    <g v-for="c in cells" :key="c.slot" class="slot" :class="{ empty: !c.d && !c.trash }">
      <title>{{ c.d ? c.d.what : c.trash ? 'Fixed trash' : `Slot ${c.slot}: empty` }}</title>
      <rect :x="c.x" :y="c.y" :width="SW" :height="SH" rx="7" class="base" />
      <text :x="c.x + 6" :y="c.y + 10" class="num">{{ c.slot }}</text>

      <!-- Trash -->
      <g v-if="c.trash" class="trash">
        <rect :x="c.x + 44" :y="c.y + 30" width="40" height="34" rx="4" />
        <rect :x="c.x + 40" :y="c.y + 24" width="48" height="5" rx="2" />
        <line :x1="c.x + 56" :y1="c.y + 37" :x2="c.x + 56" :y2="c.y + 57" /><line :x1="c.x + 64" :y1="c.y + 37" :x2="c.x + 64" :y2="c.y + 57" /><line :x1="c.x + 72" :y1="c.y + 37" :x2="c.x + 72" :y2="c.y + 57" />
      </g>

      <!-- Module body -->
      <g v-if="c.module" class="module" :class="c.module">
        <rect :x="c.x + 4" :y="c.y + 12" :width="SW - 8" :height="SH - 24" rx="6" class="body" />
        <template v-if="c.module === 'temperature'">
          <rect :x="c.x + 8" :y="c.y + 18" width="6" :height="SH - 36" rx="2" class="strip" />
        </template>
        <template v-else-if="c.module === 'heater_shaker'">
          <rect :x="c.x + 8" :y="c.y + 22" width="5" :height="SH - 44" rx="2" class="latch" />
          <rect :x="c.x + SW - 13" :y="c.y + 22" width="5" :height="SH - 44" rx="2" class="latch" />
          <path :d="`M${c.x + 24} ${c.y + SH - 17} q6 -5 12 0 t12 0 t12 0 t12 0 t12 0 t12 0`" class="wave" />
        </template>
        <template v-else-if="c.module === 'magnetic'">
          <path :d="`M${c.x + 48} ${c.y + 56} v-14 a16 16 0 0 1 32 0 v14 h-9 v-14 a7 7 0 0 0 -14 0 v14 z`" class="magnet" />
          <rect :x="c.x + 48" :y="c.y + 50" width="9" height="6" class="pole" /><rect :x="c.x + 71" :y="c.y + 50" width="9" height="6" class="pole" />
        </template>
      </g>

      <!-- Labware glyph (bare, or on a module) -->
      <g v-if="c.glyph" class="lw" :class="[c.glyph.cls, c.glyph.type]">
        <rect :x="c.glyph.box.x" :y="c.glyph.box.y" :width="c.glyph.box.w" :height="c.glyph.box.h" rx="4" class="frame" />
        <template v-if="c.glyph.type === 'troughs'">
          <rect v-for="(t, i) in c.glyph.troughs" :key="i" :x="t.x" :y="t.y" :width="t.w" :height="t.h" rx="1.5" class="trough" />
        </template>
        <template v-else-if="c.glyph.type === 'tips'">
          <rect v-for="(p, i) in c.glyph.pts" :key="i" :x="p.x - c.glyph.r" :y="p.y - c.glyph.r" :width="c.glyph.r * 2" :height="c.glyph.r * 2" rx="0.8" class="tip" />
        </template>
        <template v-else-if="c.glyph.type === 'tubes'">
          <g v-for="(p, i) in c.glyph.pts" :key="i">
            <circle :cx="p.x" :cy="p.y" :r="c.glyph.r" class="tube" />
            <circle :cx="p.x" :cy="p.y" :r="c.glyph.r * 0.55" class="tube-in" />
          </g>
        </template>
        <template v-else>
          <circle v-for="(p, i) in c.glyph.pts" :key="i" :cx="p.x" :cy="p.y" :r="c.glyph.r" class="well" />
        </template>
      </g>

      <text :x="c.x + SW / 2" :y="c.y + SH - 4" class="cap" text-anchor="middle">{{ c.caption }}</text>
    </g>

    <!-- Thermocycler: one body over slots 7, 8, 10 and 11 -->
    <g v-if="tcCell" class="slot module thermocycler">
      <title>{{ tc.what }}{{ tc.onModule ? ` — ${tc.onModule.label}` : '' }}</title>
      <rect :x="tcCell.box.x" :y="tcCell.box.y" :width="tcCell.box.w" :height="tcCell.box.h" rx="9" class="body" />
      <text :x="tcCell.box.x + 6" :y="tcCell.box.y + 10" class="num">7 · 8 · 10 · 11</text>
      <rect :x="tcCell.lid.x" :y="tcCell.lid.y + 6" :width="tcCell.lid.w" :height="tcCell.lid.h" rx="6" class="lid" />
      <rect :x="tcCell.lid.x + tcCell.lid.w / 2 - 22" :y="tcCell.lid.y + 12" width="44" height="5" rx="2.5" class="handle" />
      <text :x="tcCell.lid.x + tcCell.lid.w / 2" :y="tcCell.lid.y + tcCell.lid.h - 10" class="lidcap" text-anchor="middle">Thermocycler</text>
      <g v-if="tcCell.glyph" class="lw" :class="[tcCell.glyph.cls, tcCell.glyph.type]">
        <rect :x="tcCell.glyph.box.x" :y="tcCell.glyph.box.y" :width="tcCell.glyph.box.w" :height="tcCell.glyph.box.h" rx="4" class="frame" />
        <circle v-for="(p, i) in tcCell.glyph.pts" :key="i" :cx="p.x" :cy="p.y" :r="tcCell.glyph.r" class="well" />
      </g>
      <rect v-else :x="tcCell.box.x + 62" :y="tcCell.box.y + tcCell.box.h * 0.42" :width="tcCell.box.w - 124" :height="tcCell.box.h * 0.44" rx="4" class="block" />
      <text :x="tcCell.box.x + tcCell.box.w / 2" :y="tcCell.box.y + tcCell.box.h - 5" class="cap" text-anchor="middle">{{ tc.onModule ? 'plate on the block' : 'block' }}</text>
    </g>
  </svg>
</template>

<style scoped>
.deck { width: 100%; height: auto; display: block; font-family: inherit; }

.base { fill: var(--cd); stroke: var(--ln2); stroke-width: 1; }
.slot.empty .base { stroke-dasharray: 3 3; fill: transparent; }
.num { font-size: 10.5px; font-weight: 700; fill: var(--tx3); }
.cap { font-size: 11px; font-weight: 600; fill: var(--tx2); }
.lidcap { font-size: 13px; font-weight: 700; fill: var(--tx2); letter-spacing: .02em; }

/* Trash */
.trash rect { fill: var(--fl); stroke: var(--tx3); stroke-width: 1; }
.trash line { stroke: var(--tx3); stroke-width: 1; }

/* Modules: metal-grey bodies with one telling detail each */
.module .body { fill: rgba(110,110,115,.18); stroke: var(--tx3); stroke-width: 1; }
.module .strip { fill: #E69F00; }
.module .latch { fill: var(--tx3); }
.module .wave { fill: none; stroke: #E69F00; stroke-width: 1.4; }
.module .magnet { fill: #E69F00; }
.module .pole { fill: var(--tx3); }
.thermocycler .body { fill: rgba(110,110,115,.16); stroke: var(--tx3); stroke-width: 1; }
.thermocycler .lid { fill: rgba(110,110,115,.22); stroke: var(--tx3); stroke-width: 1; }
.thermocycler .handle { fill: var(--tx3); }
.thermocycler .block { fill: var(--fl); stroke: var(--ln2); stroke-dasharray: 3 3; }

/* Labware */
.lw .frame { fill: var(--cd); stroke: var(--tx3); stroke-width: 1; }
.lw .well { fill: var(--ln2); }
.lw .tip { fill: var(--tx3); opacity: .55; }
.lw .tube { fill: var(--cd); stroke: var(--tx3); stroke-width: .9; }
.lw .tube-in { fill: var(--ln2); }
.lw .trough { fill: var(--ln2); }

.lw.plate .frame { stroke: var(--acc); fill: var(--acs); }
.lw.plate .well { fill: var(--acc); opacity: .6; }
.lw.samples .frame { stroke: #CC79A7; fill: rgba(204,121,167,.14); }
.lw.samples .well { fill: #CC79A7; opacity: .6; }
.lw.source .frame { stroke: #009E73; fill: rgba(0,158,115,.12); }
.lw.source .well, .lw.source .trough, .lw.source .tube-in { fill: #009E73; opacity: .55; }
.lw.source .tube { stroke: #009E73; }
.lw.tips .frame { stroke: var(--tx3); fill: var(--fl); }
</style>
