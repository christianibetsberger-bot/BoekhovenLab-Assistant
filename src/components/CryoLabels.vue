<script setup>
// Cryogenic label studio — faithful implementation of the design handoff
// (design_handoff_cryo_labels). Renders DYMO CryoSTUCK LWCS and HERMA 4363 labels
// at true millimetre size, pulling name / CAS / code from inventory, with real
// scannable QR codes and full/short/code payload modes. Prints black-on-white.
import { h, ref, computed, onMounted, watch, nextTick } from 'vue'
import { useLabStore } from '../stores/labStore'
import { LWCS, HERMA, labelPayload, qrSvg, moduleMM, scanVerdict, dymoXml, labelTitle } from '../utils/cryoLabels'

const store = useLabStore()
const props = defineProps({ seed: { type: Object, default: null } })
const emit = defineEmits(['close'])

// Match the .dymo fonts so the preview mirrors the DYMO Connect import:
// Arial Narrow for the name (on every Mac, rendered by DYMO), Consolas for the
// mono fields (the .dymo's CAS/CODE font, with cross-platform fallbacks).
const COND = "'Arial Narrow',Arial,sans-serif"
const MONO = "Consolas,'Courier New',ui-monospace,monospace"

const media = ref('dymo')            // 'dymo' | 'herma'
const dymoSize = ref('506')          // '506' | '507' | '503'
const hermaSize = ref('e05')         // 'e05' | 'e15' | 'f15' | 'f50'
const qrMode = ref('full')           // 'full' | 'short' | 'code'
const shortHost = ref(localStorage.getItem('cryo_shortHost') || 'boek.li')
watch(shortHost, v => { try { localStorage.setItem('cryo_shortHost', (v || '').trim()) } catch { /* private mode */ } })
const pickerSearch = ref('')
const sheetRef = ref(null)

// Selected records: { code, name, cas, copies }
const records = ref([])
function addRecord(item) {
  if (!item) return
  const found = records.value.find(r => r.code === (item.code || '') && r.name === (item.name || ''))
  if (found) { found.copies++; return }
  records.value.push({ code: item.code || '', name: item.name || '', short: item.short || '', cas: item.cas || '', copies: 1 })
}
function setCopies(rec, n) { rec.copies = Math.max(1, Math.min(999, (n | 0) || 1)) }
onMounted(() => { addRecord(props.seed) })

const sizeKey = computed(() => media.value === 'dymo' ? dymoSize.value : hermaSize.value)
const sp = computed(() => media.value === 'dymo' ? LWCS[dymoSize.value] : HERMA[hermaSize.value])
const dymoSizes = [['506', '0.5 mL'], ['507', '1.5 mL'], ['503', 'Falcon 15/50']]
const hermaSizes = [['e05', '0.5 mL'], ['e15', '1.5 mL'], ['f15', 'Falcon 15'], ['f50', 'Falcon 50']]

// Inventory picker
const pickList = computed(() => {
  const q = pickerSearch.value.trim().toLowerCase()
  return store.inventory.filter(i => !q || (i.code || '').toLowerCase().includes(q) || (i.name || '').toLowerCase().includes(q)).slice(0, 200)
})

// Scan-size verdict for the current size + payload (shown as a warning banner).
const scanInfo = computed(() => {
  const s = sp.value
  const sampleCode = records.value[0]?.code || 'R00000'
  const url = labelPayload(sampleCode, qrMode.value, shortHost.value)
  const mm = moduleMM(s.qr, url, s.ecc)
  return { mm, ...scanVerdict(mm) }
})

// ── Faithful label renderers (ported from the handoff's h()-based reference) ──
function qrImg(code, s, sizeMm = s.qr) {
  const uri = qrSvg(labelPayload(code, qrMode.value, shortHost.value), s.ecc).uri
  return h('img', { src: uri, alt: 'QR', style: { width: sizeMm + 'mm', height: sizeMm + 'mm', display: 'block' } })
}
// QR square for the round cap. The quiet zone baked into qrSvg keeps the black
// modules clear of the die-cut edge, so the code can fill the cap; the small
// back-off just stops the white quiet-zone corner from touching the cap border.
// Preview-only — the .dymo keeps sp.qr.
function capQrMm(s) {
  return Math.min(s.qr, s.circ / Math.SQRT2 - 0.2)
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
  const els = [nameEl(labelTitle(s, rec), s, String(s.fMin || 1.1))]
  if (s.rule !== false) els.push(ruleEl())   // LWCS506 drops the rule to buy height
  els.push(casEl(rec.cas, s), codeEl(rec.code, s))
  return els
}
// DYMO landscape strip: name/CAS/code column on the left, QR at the right end —
// inscribed in the SnapPEEL cap circle for eppis (506/507), plain for 503.
function dymoLabel(rec, s) {
  if (!s.cap) {
    const qrBox = h('div', { style: { flex: '0 0 auto', display: 'flex', alignItems: 'center' } }, qrImg(rec.code, s))
    const textCol = h('div', { style: { flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' } }, eppiInner(rec, s))
    return h('div', { style: { width: s.W + 'mm', height: s.H + 'mm', boxSizing: 'border-box', background: '#fff', border: '0.15mm solid #b7b6b1', borderRadius: '0.7mm', padding: '1.1mm 1.6mm', display: 'flex', alignItems: 'stretch', gap: '1mm', fontFamily: COND } }, [qrBox, textCol])
  }
  // Cap circle (QR) on the LEFT, wrap-panel text on the RIGHT — matches the die-cut.
  // Inscribe the QR with a corner margin so it never grazes the round cap edge.
  const qr = qrImg(rec.code, s, capQrMm(s))
  const circle = h('div', { style: { position: 'absolute', left: 0, top: ((s.H - s.circ) / 2) + 'mm', width: s.circ + 'mm', height: s.circ + 'mm', borderRadius: '50%', background: '#fff', border: '0.15mm solid #b7b6b1', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 } }, qr)
  const wrap = h('div', { style: { position: 'absolute', left: (s.circ - 0.6) + 'mm', top: 0, width: s.wrapW + 'mm', height: s.H + 'mm', background: '#fff', border: '0.15mm solid #b7b6b1', borderRadius: '0.7mm', boxSizing: 'border-box', padding: '0.9mm 0.9mm 0.9mm 1.2mm', display: 'flex', flexDirection: 'column', justifyContent: 'center' } }, eppiInner(rec, s))
  return h('div', { style: { position: 'relative', width: s.W + 'mm', height: s.H + 'mm', fontFamily: COND } }, [wrap, circle])
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
// A HERMA 105×48 cell holding the given tiles (up to cols×rows). Partial cells
// leave the remaining slots blank — so "1 label" prints exactly one tile.
function hermaCellFromTiles(recs, s) {
  const tiles = recs.map(rec => hermaTile(rec, s))
  return h('div', { style: { width: HERMA.cell.w + 'mm', height: HERMA.cell.h + 'mm', boxSizing: 'border-box', background: '#fff', display: 'grid', gridTemplateColumns: `repeat(${s.cols}, ${s.tileW}mm)`, gridAutoRows: s.tileH + 'mm', gap: s.gutter + 'mm', justifyContent: 'center', alignContent: 'flex-start', alignItems: 'start', padding: '1.5mm' } }, tiles)
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

// Every label to print, flattened by copies, then grouped into print units:
// DYMO → one die-cut label each; HERMA falcon → one wrap cell each; HERMA eppi →
// tiles packed into 105×48 cells (only as many tiles as requested).
const totalLabels = computed(() => records.value.reduce((s, r) => s + Math.max(1, r.copies || 1), 0))
const flatUnits = computed(() => records.value.flatMap(r => Array(Math.max(1, r.copies || 1)).fill(r)))
const perCell = computed(() => (media.value === 'herma' && sp.value.kind === 'eppi') ? sp.value.cols * sp.value.rows : 1)
const printUnits = computed(() => {
  const units = flatUnits.value
  if (media.value === 'dymo') return units.map(rec => ({ k: 'dymo', rec }))
  if (sp.value.kind === 'wrap') return units.map(rec => ({ k: 'wrap', rec }))
  const cells = []
  for (let i = 0; i < units.length; i += perCell.value) cells.push({ k: 'cell', tiles: units.slice(i, i + perCell.value) })
  return cells
})

// Remove the record(s) a clicked preview tile represents (all copies) from the selection.
function removeUnit(u) {
  const refs = new Set(u.k === 'cell' ? u.tiles : [u.rec])
  records.value = records.value.filter(r => !refs.has(r))
}
function renderUnit(u) {
  const s = sp.value
  if (u.k === 'dymo') return dymoLabel(u.rec, s)
  if (u.k === 'wrap') return hermaWrap(u.rec, s)
  return hermaCellFromTiles(u.tiles, s)
}
const LabelUnit = (p) => renderUnit(p.u)
LabelUnit.props = ['u']

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
    // Paginate into sheets of 12 so more than one page of labels doesn't overflow
    // a single fixed-height sheet (that overflow was pushing rows off the top).
    pageCss = '@page { size: A4; margin: 0; }'
    let sheets = ''
    for (let i = 0; i < units.length; i += 12) {
      const cells = units.slice(i, i + 12).map(u => `<div class="cell">${u}</div>`).join('')
      sheets += `<div class="sheet">${cells}</div>`
    }
    body = sheets
  } else {
    // One DYMO strip per page (the roll feeds one at a time).
    pageCss = `@page { size: ${s.W}mm ${s.H}mm; margin: 0; }`
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
      .sheet{ width:210mm; height:297mm; padding:4.5mm 0; box-sizing:border-box; display:grid; grid-template-columns:repeat(2,105mm); grid-auto-rows:48mm; align-content:start; overflow:hidden; break-after:page; page-break-after:always; }
      .sheet:last-child{ break-after:auto; page-break-after:auto; }
      .cell{ overflow:hidden; }
      img{ image-rendering:pixelated; }
    </style></head><body>${body}<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script></body></html>`)
  w.document.close()
}

// ── DYMO Connect outputs (per the handoff): download a filled .dymo, or print
// straight to the LabelWriter 550 via the DYMO Connect Web Service if present. ──
function triggerDownload(xml, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }))
  a.download = filename
  document.body.appendChild(a); a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 150)
}
function downloadDymoAll() {
  const key = dymoSize.value
  records.value.forEach((rec, i) => setTimeout(() => {
    triggerDownload(dymoXml(key, rec, qrMode.value, shortHost.value), `${LWCS[key].labelName}_${rec.code || 'label'}.dymo`)
  }, i * 250))   // stagger so the browser doesn't block the batch
}
function printToDymo() {
  const fw = window.dymo?.label?.framework
  const key = dymoSize.value
  if (!fw) {
    alert('Direct printing needs DYMO Connect + its Web Service running on this computer.\n\nUse “.dymo” to download the label(s) and print from DYMO Connect — or run this app on the lab PC with DYMO Connect installed, then this prints straight to the LabelWriter 550.')
    return
  }
  try {
    const printers = (fw.getPrinters() || []).filter(p => p && p.isConnected !== false)
    if (!printers.length) { alert('No DYMO printer detected. Switch on the LabelWriter 550, then try again — or use the .dymo download.'); return }
    flatUnits.value.forEach(rec => fw.openLabelXml(dymoXml(key, rec, qrMode.value, shortHost.value)).print(printers[0].name))
  } catch (e) {
    alert('DYMO print failed: ' + ((e && e.message) || e) + '\nUse the .dymo download and print from DYMO Connect instead.')
  }
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
        <template v-if="media === 'dymo'">
          <button class="cl-print" :disabled="!records.length" @click="printToDymo" title="Print straight to a connected LabelWriter 550 (needs DYMO Connect)"><i class="fas fa-print"></i> Print to DYMO 550</button>
          <button class="cl-print ghost" :disabled="!records.length" @click="downloadDymoAll" title="Download a .dymo file per item to open in DYMO Connect"><i class="fas fa-download"></i> .dymo</button>
          <button class="cl-print ghost" :disabled="!records.length" @click="printLabels" title="Print a paper proof from the browser"><i class="fas fa-file-lines"></i> Proof</button>
        </template>
        <button v-else class="cl-print" :disabled="!records.length" @click="printLabels"><i class="fas fa-print"></i> Print sheet</button>
      </div>
      <div v-if="qrMode === 'short'" class="cl-shortnote">
        <i class="fas fa-triangle-exclamation"></i> Short URLs only open the inventory if <strong>{{ shortHost }}</strong> is a redirect host you control (forwarding <code>/{{ '{code}' }}</code> → the inventory page). It isn't set up yet — “Full URL” works everywhere today.
      </div>

      <div class="cl-scan" :style="{ color: scanInfo.c }">
        <i class="fas fa-qrcode"></i> QR module ≈ {{ scanInfo.mm ? scanInfo.mm.toFixed(2) : '—' }} mm — <strong>{{ scanInfo.t }}</strong>
        <span v-if="scanInfo.t !== 'Scannable'" class="cl-scan-tip">try “Short URL” or “Code only” for the small caps</span>
      </div>

      <div class="cl-body">
        <div class="cl-picker">
          <div class="cl-search"><i class="fas fa-search"></i><input v-model="pickerSearch" placeholder="Add from inventory…"></div>
          <div class="cl-picklist">
            <button v-for="i in pickList" :key="i.id" class="cl-pickrow" @click="addRecord(i)" :title="i.name">
              <span class="cl-pickcode">{{ i.code }}</span><span class="cl-pickname">{{ i.name }}</span><i class="fas fa-plus"></i>
            </button>
            <div v-if="!pickList.length" class="cl-empty">No inventory items.</div>
          </div>
          <div v-if="records.length" class="cl-selected">
            <div class="cl-sel-title">Selected · {{ totalLabels }} label{{ totalLabels === 1 ? '' : 's' }}</div>
            <div v-for="(r, i) in records" :key="i" class="cl-sel-item">
              <div class="cl-sel-row">
                <span class="cl-selcode">{{ r.code }}</span>
                <span class="cl-selname" :title="r.name">{{ r.name }}</span>
                <div class="cl-copies">
                  <button @click="setCopies(r, r.copies - 1)" :disabled="r.copies <= 1">−</button>
                  <input type="number" min="1" :value="r.copies" @input="setCopies(r, +$event.target.value)">
                  <button @click="setCopies(r, r.copies + 1)">+</button>
                </div>
                <button class="cl-sel-x" @click="records.splice(i, 1)" title="Remove">✕</button>
              </div>
              <label v-if="media === 'dymo' && dymoSize === '506'" class="cl-shortrow" title="The 0.5 mL cap prints this short name (a full IUPAC name will not fit). Blank = the full name, shrunk.">
                <span>short</span><input v-model="r.short" :placeholder="r.name">
              </label>
            </div>
          </div>
        </div>

        <div class="cl-preview">
          <div v-if="!records.length" class="cl-empty" style="margin:auto;">Add items from the left to preview labels.</div>
          <div v-else ref="sheetRef" class="cl-sheet">
            <div v-for="(u, i) in printUnits" :key="i" class="cl-unit">
              <button class="cl-unit-x" @click="removeUnit(u)" title="Remove from preview">✕</button>
              <div data-unit><LabelUnit :u="u" /></div>
              <div class="cl-unit-cap">{{ u.k === 'cell' ? u.tiles.length + ' label' + (u.tiles.length > 1 ? 's' : '') : u.rec.code }} · {{ sp.label }}</div>
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
.cl-print.ghost { background: var(--fl, #eef2f7); color: var(--tx2, #475569); }
.cl-print ~ .cl-print { margin-left: 0; }   /* only the first print button gets the auto margin */
.cl-scan { font-size: 0.78rem; padding: 8px 16px; border-bottom: 1px solid var(--ln, #eee); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cl-scan-tip { opacity: .7; font-style: italic; }
.cl-shortnote { font-size: 0.74rem; color: #9a6b00; background: rgba(154,107,0,.09); padding: 7px 16px; display: flex; gap: 7px; align-items: baseline; }
.cl-shortnote code { font-family: ui-monospace, monospace; }
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
.cl-selected { border-top: 1px solid var(--ln, #eee); padding: 8px 6px; overflow-y: auto; max-height: 42%; }
.cl-sel-title { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--tx2, #64748b); padding: 2px 6px 6px; }
.cl-sel-item { padding: 2px 0; }
.cl-sel-row { display: flex; align-items: center; gap: 6px; padding: 4px 6px; }
.cl-shortrow { display: flex; align-items: center; gap: 6px; padding: 0 6px 5px 6px; }
.cl-shortrow > span { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--tx3, #94a3b8); flex: none; }
.cl-shortrow input { flex: 1; min-width: 0; font-size: 0.76rem; padding: 3px 6px; border: 1px solid var(--ln2, #cbd5e1); border-radius: 5px; background: var(--fl, transparent); color: inherit; }
.cl-selcode { font: 600 0.72rem/1 ui-monospace, monospace; color: var(--acc, #2563eb); flex: none; }
.cl-selname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.76rem; }
.cl-copies { display: inline-flex; align-items: center; flex: none; border: 1px solid var(--ln2, #cbd5e1); border-radius: 6px; overflow: hidden; }
.cl-copies button { width: 20px; height: 22px; border: none; background: var(--fl, #eef2f7); color: var(--tx2, #475569); cursor: pointer; font-size: 0.9rem; line-height: 1; box-shadow: none; }
.cl-copies button:disabled { opacity: .4; cursor: default; }
.cl-copies input { width: 30px; height: 22px; border: none; border-left: 1px solid var(--ln2, #cbd5e1); border-right: 1px solid var(--ln2, #cbd5e1); text-align: center; background: transparent; color: inherit; font-size: 0.76rem; -moz-appearance: textfield; }
.cl-copies input::-webkit-outer-spin-button, .cl-copies input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.cl-sel-x { width: 18px; height: 18px; border-radius: 50%; border: none; background: none; color: var(--tx3, #94a3b8); cursor: pointer; font-size: 11px; flex: none; }
.cl-sel-x:hover { color: var(--wr, #dc2626); }
.cl-preview { flex: 1; min-width: 0; overflow: auto; background: repeating-conic-gradient(#f4f4f2 0 25%, #ececea 0 50%) 0 0 / 16px 16px; padding: 20px; }
.cl-sheet { display: flex; flex-wrap: wrap; gap: 18px; align-content: flex-start; }
.cl-unit { position: relative; background: #fff; padding: 10px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,.12); display: flex; flex-direction: column; align-items: center; gap: 6px; }
.cl-unit-x { position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; border-radius: 50%; border: none; background: rgba(0,0,0,.35); color: #fff; font-size: 10px; cursor: pointer; z-index: 3; line-height: 1; }
.cl-unit-cap { font: 500 0.66rem/1 ui-monospace, monospace; color: #64748b; }
.cl-empty { font-size: 0.82rem; color: var(--tx3, #94a3b8); font-style: italic; padding: 14px; text-align: center; }
</style>
