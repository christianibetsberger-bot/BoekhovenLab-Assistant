<script setup>
// Cryogenic label studio — faithful implementation of the design handoff
// (design_handoff_cryo_labels). Renders DYMO CryoSTUCK LWCS and HERMA 4363 labels
// at true millimetre size, pulling name / CAS / code from inventory, with real
// scannable QR codes and full/short/code payload modes. Prints black-on-white.
import { h, ref, computed, onMounted, watch, nextTick } from 'vue'
import { useLabStore } from '../stores/labStore'
import { LWCS, HERMA, labelPayload, qrSvg, moduleMM, scanVerdict } from '../utils/cryoLabels'

const store = useLabStore()
const props = defineProps({ seed: { type: Object, default: null } })
const emit = defineEmits(['close'])

const COND = "'IBM Plex Sans Condensed','Arial Narrow',sans-serif"
const MONO = "'IBM Plex Mono',ui-monospace,'SFMono-Regular',monospace"

const media = ref('dymo')            // 'dymo' | 'herma'
const dymoSize = ref('506')          // '506' | '507' | '503'
const hermaSize = ref('e05')         // 'e05' | 'e15' | 'f15' | 'f50'
const qrMode = ref('full')           // 'full' | 'short' | 'code'
const shortHost = ref('boek.li')
const pickerSearch = ref('')
const sheetRef = ref(null)

// Selected records: { code, name, cas }
const records = ref([])
function seedFrom(item) {
  if (!item) return
  const rec = { code: item.code || '', name: item.name || '', cas: item.cas || '' }
  if (!records.value.some(r => r.code === rec.code && r.name === rec.name)) records.value.push(rec)
}
onMounted(() => { seedFrom(props.seed) })

const sizeKey = computed(() => media.value === 'dymo' ? dymoSize.value : hermaSize.value)
const sp = computed(() => media.value === 'dymo' ? LWCS[dymoSize.value] : HERMA[hermaSize.value])
const dymoSizes = [['506', '0.5 mL'], ['507', '1.5 mL'], ['503', 'Falcon 15/50']]
const hermaSizes = [['e05', '0.5 mL'], ['e15', '1.5 mL'], ['f15', 'Falcon 15'], ['f50', 'Falcon 50']]

// Inventory picker
const pickList = computed(() => {
  const q = pickerSearch.value.trim().toLowerCase()
  return store.inventory.filter(i => !q || (i.code || '').toLowerCase().includes(q) || (i.name || '').toLowerCase().includes(q)).slice(0, 200)
})
function addItem(i) {
  const rec = { code: i.code || '', name: i.name || '', cas: i.cas || '' }
  if (!records.value.some(r => r.code === rec.code && r.name === rec.name)) records.value.push(rec)
}
function removeRecord(i) { records.value.splice(i, 1) }

// Scan-size verdict for the current size + payload (shown as a warning banner).
const scanInfo = computed(() => {
  const s = sp.value
  const sampleCode = records.value[0]?.code || 'R00000'
  const url = labelPayload(sampleCode, qrMode.value, shortHost.value)
  const mm = moduleMM(s.qr, url, s.ecc)
  return { mm, ...scanVerdict(mm) }
})

// ── Faithful label renderers (ported from the handoff's h()-based reference) ──
function qrImg(code, s) {
  const uri = qrSvg(labelPayload(code, qrMode.value, shortHost.value), s.ecc).uri
  return h('img', { src: uri, alt: 'QR', style: { width: s.qr + 'mm', height: s.qr + 'mm', display: 'block' } })
}
function nameEl(name, s, min = '1.1') {
  return h('div', { 'data-fit': '1', 'data-max': String(s.fName), 'data-min': min, style: { fontFamily: COND, fontWeight: 700, lineHeight: 1.02, letterSpacing: '-0.01em', color: '#000', flex: '1 1 auto', minHeight: 0, overflow: 'hidden', wordBreak: 'break-word', fontSize: s.fName + 'mm' } }, name)
}
function casEl(cas, s, mono = MONO) {
  return h('div', { style: { fontFamily: mono, fontWeight: 500, fontSize: s.fCas + 'mm', lineHeight: 1, color: '#000', whiteSpace: 'nowrap', overflow: 'hidden', flex: '0 0 auto' } }, [h('span', { style: { opacity: 0.55 } }, 'CAS '), cas])
}
function codeEl(code, s, mt = '0.3mm') {
  return h('div', { style: { fontFamily: MONO, fontWeight: 600, fontSize: s.fCode + 'mm', lineHeight: 1.05, marginTop: mt, color: '#000', flex: '0 0 auto' } }, code)
}
function ruleEl(o = 0.4, m = '0.35mm 0 0.3mm') {
  return h('div', { style: { height: '0.1mm', background: '#000', opacity: o, margin: m, flex: '0 0 auto' } })
}

function eppiInner(rec, s) {
  return [nameEl(rec.name, s), ruleEl(), casEl(rec.cas, s), codeEl(rec.code, s)]
}
function falconInner(rec, s) {
  const left = h('div', { style: { flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' } }, [
    nameEl(rec.name, s, '1.4'),
    ruleEl(0.4, '0.5mm 0 0.4mm'),
    casEl(rec.cas, s),
    codeEl(rec.code, s, '0.6mm'),
  ])
  const right = h('div', { style: { flex: '0 0 auto', display: 'flex', alignItems: 'center' } }, qrImg(rec.code, s))
  return [left, right]
}
// DYMO die-cut label (cap circle + wrap rect for eppis; flat rect for falcon).
function dymoLabel(rec, s) {
  const is503 = s.cd === 0
  const rect = h('div', { style: { position: s.cd ? 'absolute' : 'relative', left: 0, bottom: 0, width: s.rw + 'mm', height: s.rh + 'mm', background: '#fff', border: '0.15mm solid #b7b6b1', borderRadius: '0.6mm', boxSizing: 'border-box', padding: is503 ? '1mm' : '0.9mm', display: 'flex', flexDirection: is503 ? 'row' : 'column', gap: is503 ? '0.9mm' : '0' } }, is503 ? falconInner(rec, s) : eppiInner(rec, s))
  if (!s.cd) return h('div', { style: { position: 'relative', width: s.rw + 'mm', height: s.rh + 'mm', fontFamily: COND } }, rect)
  const bboxH = s.cd + s.rh - s.ov
  const circle = h('div', { style: { position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: s.cd + 'mm', height: s.cd + 'mm', borderRadius: '50%', background: '#fff', border: '0.15mm solid #b7b6b1', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 } }, qrImg(rec.code, s))
  return h('div', { style: { position: 'relative', width: s.rw + 'mm', height: bboxH + 'mm', fontFamily: COND } }, [circle, rect])
}
// HERMA small eppi tile (QR on the tile — no die-cut cap).
function hermaTile(rec, s) {
  const left = h('div', { style: { flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' } }, [
    nameEl(rec.name, s, '1.0'),
    ruleEl(0.35, '0.3mm 0 0.25mm'),
    casEl(rec.cas, s),
    codeEl(rec.code, s, '0.2mm'),
  ])
  const right = h('div', { style: { flex: '0 0 auto', display: 'flex', alignItems: 'center' } }, qrImg(rec.code, s))
  return h('div', { style: { width: s.tileW + 'mm', height: s.tileH + 'mm', boxSizing: 'border-box', border: '0.15mm solid #b7b6b1', borderRadius: '0.5mm', background: '#fff', padding: '0.7mm', display: 'flex', gap: '0.7mm', alignItems: 'stretch', fontFamily: COND } }, [left, right])
}
// A full HERMA 105×48 cell filled with cols×rows identical tiles of one record.
function hermaCell(rec, s) {
  const tiles = []
  for (let i = 0; i < s.cols * s.rows; i++) tiles.push(hermaTile(rec, s))
  return h('div', { style: { width: HERMA.cell.w + 'mm', height: HERMA.cell.h + 'mm', boxSizing: 'border-box', background: '#fff', display: 'grid', gridTemplateColumns: `repeat(${s.cols}, ${s.tileW}mm)`, gridAutoRows: s.tileH + 'mm', gap: s.gutter + 'mm', justifyContent: 'center', alignContent: 'center', padding: '1.5mm' } }, tiles)
}
// HERMA falcon wrap — content block repeated `repeat` times across the 105 mm cell.
function hermaWrap(rec, s) {
  const W = HERMA.cell.w / s.repeat
  const blocks = []
  for (let i = 0; i < s.repeat; i++) {
    const left = h('div', { style: { flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' } }, [
      h('div', { 'data-fit': '1', 'data-max': String(s.fName), 'data-min': '1.8', style: { fontFamily: COND, fontWeight: 700, lineHeight: 1.03, letterSpacing: '-0.01em', color: '#000', overflow: 'hidden', wordBreak: 'break-word', fontSize: s.fName + 'mm', maxHeight: '24mm' } }, rec.name),
      h('div', { style: { fontFamily: MONO, fontWeight: 500, fontSize: s.fCas + 'mm', lineHeight: 1.1, color: '#000', marginTop: '1.4mm' } }, [h('span', { style: { opacity: 0.55 } }, 'CAS '), rec.cas]),
      h('div', { style: { fontFamily: MONO, fontWeight: 600, fontSize: s.fCode + 'mm', lineHeight: 1.05, color: '#000', marginTop: '1mm' } }, rec.code),
    ])
    const right = h('div', { style: { flex: '0 0 auto', display: 'flex', alignItems: 'center' } }, qrImg(rec.code, s))
    blocks.push(h('div', { style: { width: W + 'mm', height: HERMA.cell.h + 'mm', boxSizing: 'border-box', padding: '3mm 3.5mm', display: 'flex', gap: '3mm', alignItems: 'center', borderRight: s.repeat > 1 ? '0.2mm dashed #c3c2bc' : 'none' } }, [left, right]))
  }
  return h('div', { style: { width: HERMA.cell.w + 'mm', height: HERMA.cell.h + 'mm', boxSizing: 'border-box', background: '#fff', border: '0.15mm solid #b7b6b1', borderRadius: '0.8mm', display: 'flex', fontFamily: COND } }, blocks)
}

// One rendered unit per record (a die-cut DYMO label, or a HERMA cell/wrap).
function renderUnit(rec) {
  const s = sp.value
  if (media.value === 'dymo') return dymoLabel(rec, s)
  return s.kind === 'wrap' ? hermaWrap(rec, s) : hermaCell(rec, s)
}
const LabelUnit = (p) => renderUnit(p.rec)
LabelUnit.props = ['rec']

// ── Shrink-to-fit: mirror the reference's fitAll over [data-fit] elements ──
function fitAll() {
  const root = sheetRef.value
  if (!root) return
  root.querySelectorAll('[data-fit]').forEach(el => {
    const max = parseFloat(el.getAttribute('data-max')) || 3
    const min = parseFloat(el.getAttribute('data-min')) || 1.2
    let f = max; el.style.fontSize = f + 'mm'; let guard = 0
    while (f > min && (el.scrollHeight > el.clientHeight + 0.5 || el.scrollWidth > el.clientWidth + 0.5) && guard < 120) {
      f = Math.round((f - 0.05) * 100) / 100; el.style.fontSize = f + 'mm'; guard++
    }
  })
}
function scheduleFit() { nextTick(() => requestAnimationFrame(fitAll)) }
onMounted(scheduleFit)
watch([records, media, dymoSize, hermaSize, qrMode, shortHost], scheduleFit, { deep: true })

// ── Print — self-contained window so the app's chrome/CSS can't interfere ──
function printLabels() {
  fitAll()
  if (!records.value.length || !sheetRef.value) return
  const isHerma = media.value === 'herma'
  const s = sp.value
  const units = Array.from(sheetRef.value.querySelectorAll('[data-unit]')).map(el => el.innerHTML)
  let pageCss, body
  if (isHerma) {
    // A4 sheet: HERMA 4363 = 2 columns × 6 rows of 105×48 mm cells (12/sheet).
    pageCss = '@page { size: A4; margin: 0; }'
    const cells = units.map(u => `<div class="cell">${u}</div>`).join('')
    body = `<div class="sheet">${cells}</div>`
  } else {
    // One die-cut label per page (the roll feeds one at a time).
    const bboxH = s.cd ? (s.cd + s.rh - s.ov) : s.rh
    pageCss = `@page { size: ${s.rw}mm ${bboxH}mm; margin: 0; }`
    body = units.map(u => `<div class="dymo">${u}</div>`).join('')
  }
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) return
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Labels</title>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans+Condensed:wght@700&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;padding:0;background:#fff;}
      ${pageCss}
      .dymo{ page-break-after:always; break-after:page; }
      .sheet{ width:210mm; height:297mm; padding:4.5mm 0; box-sizing:border-box; display:grid; grid-template-columns:repeat(2,105mm); grid-auto-rows:48mm; }
      .cell{ overflow:hidden; }
      img{ image-rendering:pixelated; }
    </style></head><body>${body}<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script></body></html>`)
  w.document.close()
}
</script>

<template>
  <div class="cl-overlay" :class="{ 'dark-mode': store.isDarkMode }" @click.self="emit('close')">
    <div class="cl-modal">
      <div class="cl-head">
        <span><i class="fas fa-tags"></i> Cryo labels</span>
        <button class="cl-x" @click="emit('close')">✕</button>
      </div>

      <div class="cl-controls">
        <div class="cl-seg">
          <button :class="{ on: media === 'dymo' }" @click="media = 'dymo'">DYMO CryoSTUCK</button>
          <button :class="{ on: media === 'herma' }" @click="media = 'herma'">HERMA 4363 (A4)</button>
        </div>
        <div class="cl-seg">
          <template v-if="media === 'dymo'"><button v-for="[k, lbl] in dymoSizes" :key="k" :class="{ on: dymoSize === k }" @click="dymoSize = k">{{ lbl }}</button></template>
          <template v-else><button v-for="[k, lbl] in hermaSizes" :key="k" :class="{ on: hermaSize === k }" @click="hermaSize = k">{{ lbl }}</button></template>
        </div>
        <div class="cl-seg">
          <button :class="{ on: qrMode === 'full' }" @click="qrMode = 'full'">Full URL</button>
          <button :class="{ on: qrMode === 'short' }" @click="qrMode = 'short'">Short URL</button>
          <button :class="{ on: qrMode === 'code' }" @click="qrMode = 'code'">Code only</button>
        </div>
        <input v-if="qrMode === 'short'" v-model="shortHost" class="cl-host" placeholder="boek.li">
        <button class="cl-print" :disabled="!records.length" @click="printLabels"><i class="fas fa-print"></i> Print {{ records.length }}</button>
      </div>

      <div class="cl-scan" :style="{ color: scanInfo.c }">
        <i class="fas fa-qrcode"></i> QR module ≈ {{ scanInfo.mm ? scanInfo.mm.toFixed(2) : '—' }} mm — <strong>{{ scanInfo.t }}</strong>
        <span v-if="scanInfo.t !== 'Scannable'" class="cl-scan-tip">try “Short URL” or “Code only” for the small caps</span>
      </div>

      <div class="cl-body">
        <div class="cl-picker">
          <div class="cl-search"><i class="fas fa-search"></i><input v-model="pickerSearch" placeholder="Add from inventory…"></div>
          <div class="cl-picklist">
            <button v-for="i in pickList" :key="i.id" class="cl-pickrow" @click="addItem(i)" :title="i.name">
              <span class="cl-pickcode">{{ i.code }}</span><span class="cl-pickname">{{ i.name }}</span><i class="fas fa-plus"></i>
            </button>
            <div v-if="!pickList.length" class="cl-empty">No inventory items.</div>
          </div>
        </div>

        <div class="cl-preview">
          <div v-if="!records.length" class="cl-empty" style="margin:auto;">Add items from the left to preview labels.</div>
          <div v-else ref="sheetRef" class="cl-sheet">
            <div v-for="(rec, i) in records" :key="i" class="cl-unit">
              <button class="cl-unit-x" @click="removeRecord(i)" title="Remove">✕</button>
              <div data-unit><LabelUnit :rec="rec" /></div>
              <div class="cl-unit-cap">{{ rec.code }} · {{ sp.label }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cl-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; z-index: 2200; padding: 16px; }
.cl-modal { background: var(--modal, #fff); color: var(--tx, #1a1a1a); border: 1px solid var(--cdl, #e2e8f0); border-radius: var(--r, 14px); box-shadow: var(--sh, 0 12px 48px rgba(0,0,0,.25)); width: 100%; max-width: 1000px; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; }
.cl-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; font-weight: 600; border-bottom: 1px solid var(--ln, #eee); }
.cl-x { width: 28px; height: 28px; border-radius: 50%; background: var(--fl, #eef2f7); color: var(--tx2, #64748b); border: none; cursor: pointer; }
.cl-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--ln, #eee); }
.cl-seg { display: inline-flex; border: 1px solid var(--ln2, #cbd5e1); border-radius: 8px; overflow: hidden; }
.cl-seg button { font: 500 12.5px/1 inherit; padding: 7px 12px; border: none; border-left: 1px solid var(--ln2, #cbd5e1); background: transparent; color: var(--tx2, #475569); cursor: pointer; box-shadow: none; }
.cl-seg button:first-child { border-left: none; }
.cl-seg button.on { background: var(--acc, #2563eb); color: #fff; }
.cl-host { padding: 6px 9px; border: 1px solid var(--ln2, #cbd5e1); border-radius: 8px; background: var(--fl, transparent); color: inherit; font: 500 12.5px/1 ui-monospace, monospace; width: 120px; }
.cl-print { margin-left: auto; display: inline-flex; align-items: center; gap: 7px; font: 600 13px/1 inherit; padding: 8px 14px; border: none; border-radius: 8px; background: var(--acc, #2563eb); color: #fff; cursor: pointer; }
.cl-print:disabled { opacity: .5; cursor: default; }
.cl-scan { font-size: 0.78rem; padding: 8px 16px; border-bottom: 1px solid var(--ln, #eee); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cl-scan-tip { opacity: .7; font-style: italic; }
.cl-body { display: flex; min-height: 0; flex: 1; }
.cl-picker { width: 260px; flex: none; border-right: 1px solid var(--ln, #eee); display: flex; flex-direction: column; min-height: 0; }
.cl-search { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-bottom: 1px solid var(--ln, #eee); color: var(--tx2, #64748b); }
.cl-search input { border: none; background: none; outline: none; flex: 1; color: inherit; font-size: 0.85rem; }
.cl-picklist { overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 2px; }
.cl-pickrow { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: none; background: none; box-shadow: none; cursor: pointer; text-align: left; border-radius: 6px; color: var(--tx, inherit); }
.cl-pickrow:hover { background: var(--acs, #eef2ff); }
.cl-pickcode { font: 600 0.74rem/1 ui-monospace, monospace; color: var(--acc, #2563eb); flex: none; }
.cl-pickname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.8rem; }
.cl-pickrow i { opacity: .4; font-size: 0.72rem; }
.cl-preview { flex: 1; min-width: 0; overflow: auto; background: repeating-conic-gradient(#f4f4f2 0 25%, #ececea 0 50%) 0 0 / 16px 16px; padding: 20px; }
.cl-sheet { display: flex; flex-wrap: wrap; gap: 18px; align-content: flex-start; }
.cl-unit { position: relative; background: #fff; padding: 10px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,.12); display: flex; flex-direction: column; align-items: center; gap: 6px; }
.cl-unit-x { position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; border-radius: 50%; border: none; background: rgba(0,0,0,.35); color: #fff; font-size: 10px; cursor: pointer; z-index: 3; line-height: 1; }
.cl-unit-cap { font: 500 0.66rem/1 ui-monospace, monospace; color: #64748b; }
.cl-empty { font-size: 0.82rem; color: var(--tx3, #94a3b8); font-style: italic; padding: 14px; text-align: center; }
</style>
