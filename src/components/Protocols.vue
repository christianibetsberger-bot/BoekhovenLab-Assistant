<script setup>
import { ref, computed, onMounted, watch, defineAsyncComponent } from 'vue'
import { useLabStore } from '../stores/labStore'
import { db } from '../services/supabase'
import { protocolHtml, isRecipeType } from '../utils/protocolView'
import { mergeInstrumentGroups } from '../utils/instruments'

// Ketcher is heavy (React + editor); only load it when a scheme is drawn.
const KetcherField = defineAsyncComponent(() => import('./KetcherField.vue'))

const store = useLabStore()
const props = defineProps({ openId: { type: String, default: '' } })

const TYPES = ['HPLC', 'Confocal', 'Synthesis', 'Peptide', 'DNA', 'Stock prep', 'General']
const uuid = () => 'proto_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2))

function blank(type = 'HPLC') {
  return {
    id: uuid(), name: '', type, scope: 'Global', instrument: '', sharedWith: [],
    // HPLC
    column: '', columnLot: '', temperature: null, flowRate: null, injectionVolume: null, detection: '',
    eluents: { A: '', B: '', C: '', D: '' },
    gradient: [{ time: 0, pctB: 5, curve: 5 }, { time: 20, pctB: 95, curve: 5 }],
    peaks: [],
    // Synthesis / Peptide / DNA (recipe model)
    scheme: null,                 // { ket, img } reaction scheme drawn in Ketcher
    sequence: '', scale: null, scaleUnit: type === 'DNA' ? 'µmol' : 'mmol',
    reagents: [],                 // [{ name, amount, equiv }]
    steps: [],                    // [{ text, temp, time, atmosphere }]
    // Generic / other
    params: [],
    procedure: '',
  }
}
const isRecipe = computed(() => !!editing.value && isRecipeType(editing.value.type))
const paramsLabel = computed(() => {
  const t = editing.value?.type
  if (t === 'Confocal') return 'Confocal settings'
  if (t === 'Peptide' || t === 'DNA') return 'Synthesizer settings'
  if (t === 'Synthesis') return 'Other conditions'
  return 'Parameters'
})
const paramKeyPlaceholder = computed(() => {
  const t = editing.value?.type
  if (t === 'Confocal') return 'e.g. Laser 488 nm power'
  if (t === 'Peptide') return 'e.g. Resin / Coupling / Deprotection'
  if (t === 'DNA') return 'e.g. Activator / Oxidizer / Cap'
  return 'Setting'
})

// Instrument options come live from the Instrument Booking catalogue (built-ins +
// lab-added rows). The choice is scoped to the protocol type: recipe types have no
// instrument, Confocal offers only the confocal microscopes, HPLC only the HPLC
// group, everything else the full list.
const instrumentRows = ref([])
onMounted(async () => { try { const { data } = await db.from('instruments').select('*'); if (data) instrumentRows.value = data } catch { /* table may not exist yet */ } })
const instrumentGroups = computed(() => mergeInstrumentGroups(instrumentRows.value))
const allInstruments = computed(() => instrumentGroups.value.flatMap(g => g.instruments))
const RECIPE_TYPE_LIST = ['Synthesis', 'Peptide', 'DNA']
const showInstrumentField = computed(() => !!editing.value && !RECIPE_TYPE_LIST.includes(editing.value.type))
const instrumentChoices = computed(() => {
  const t = editing.value?.type
  if (t === 'Confocal') return allInstruments.value.filter(n => n.toLowerCase().startsWith('confocal'))
  if (t === 'HPLC') return instrumentGroups.value.find(g => g.name === 'HPLC')?.instruments || allInstruments.value
  return allInstruments.value
})
// ── Library ──
const protocols = ref([])
const loadError = ref('')
async function load() {
  loadError.value = ''
  const { data, error } = await db.from('protocols').select('*')
  if (error) { loadError.value = error.message; return }
  protocols.value = (data || []).map(r => ({ ...r.data, owner_id: r.owner_id, sharedWith: r.shared_with ?? r.data?.sharedWith ?? [] }))
}
onMounted(async () => { await load(); if (props.openId) openById(props.openId) })
function openById(id) { const p = protocols.value.find(x => x.id === id); if (p) editProtocol(p) }
watch(() => props.openId, (id) => { if (id) openById(id) })
const search = ref('')
const shared = computed(() => protocols.value.filter(p => p.scope === 'Global').filter(matchSearch))
const mine = computed(() => protocols.value.filter(p => p.scope !== 'Global' && p.owner_id === store.user?.id).filter(matchSearch))
const sharedWithMe = computed(() => protocols.value.filter(p => p.scope !== 'Global' && p.owner_id !== store.user?.id && (p.sharedWith || []).includes(store.user?.email)).filter(matchSearch))
function matchSearch(p) {
  const q = search.value.trim().toLowerCase()
  return !q || (p.name || '').toLowerCase().includes(q) || (p.type || '').toLowerCase().includes(q)
}
const knownProtoEmails = computed(() => [...new Set(protocols.value.flatMap(p => p.sharedWith || []).filter(Boolean))].sort())

// ── Editor ──
const editing = ref(null)
const msg = ref('')
// Keep the instrument valid for the current type: cleared for recipe types, and
// dropped if it isn't among the new type's choices (e.g. switching to Confocal).
watch(() => editing.value?.type, (t) => {
  if (!editing.value) return
  if (RECIPE_TYPE_LIST.includes(t)) { editing.value.instrument = ''; return }
  if (editing.value.instrument && !instrumentChoices.value.includes(editing.value.instrument)) editing.value.instrument = ''
})
function newProtocol() { editing.value = blank(); msg.value = '' }
function editProtocol(p) {
  editing.value = JSON.parse(JSON.stringify(p))
  const e = editing.value
  if (!e.eluents) e.eluents = { A: '', B: '', C: '', D: '' }
  if (!e.gradient) e.gradient = []
  if (!e.peaks) e.peaks = []
  if (!e.params) e.params = []
  if (!e.sharedWith) e.sharedWith = []
  // Recipe fields (older protocols predate them)
  if (e.scheme === undefined) e.scheme = null
  if (e.sequence === undefined) e.sequence = ''
  if (e.scale === undefined) e.scale = null
  if (!e.scaleUnit) e.scaleUnit = e.type === 'DNA' ? 'µmol' : 'mmol'
  if (!e.reagents) e.reagents = []
  if (!e.steps) e.steps = []
  msg.value = ''
}
function cancelEdit() { editing.value = null }
function addGradRow() { editing.value.gradient.push({ time: (editing.value.gradient.at(-1)?.time || 0) + 5, pctB: 95, curve: 5 }) }
function addPeak() { editing.value.peaks.push({ name: '', rt: null }) }
function addParam() { editing.value.params.push({ key: '', value: '' }) }

// ── Recipe (reagents + steps) ──
function addReagent() { editing.value.reagents.push({ name: '', amount: '', equiv: '' }) }
function addStep() { editing.value.steps.push({ text: '', temp: null, time: '', atmosphere: '' }) }
function moveStep(i, d) {
  const s = editing.value.steps, j = i + d
  if (j < 0 || j >= s.length) return
  ;[s[i], s[j]] = [s[j], s[i]]
}

// ── Reaction scheme (Ketcher) ──
const showScheme = ref(false)
let schemeKetcher = null
const schemeReady = ref(false)
const schemeBusy = ref(false)
const schemeInitKet = ref('')
function openScheme() { schemeInitKet.value = editing.value.scheme?.ket || ''; schemeReady.value = false; showScheme.value = true }
function onSchemeReady(k) { schemeKetcher = k; schemeReady.value = true }
watch(showScheme, (open) => { if (!open) schemeKetcher = null })
function blobToDataURL(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob) }) }
async function saveScheme() {
  const k = schemeKetcher
  if (!k) return
  schemeBusy.value = true
  try {
    const ket = await k.getKet()
    let img = ''
    for (const outputFormat of ['png', 'svg']) {
      try { const blob = await k.generateImage(ket, { outputFormat, backgroundColor: 'FFFFFF' }); img = await blobToDataURL(blob); if (img) break } catch { /* try next format */ }
    }
    // A blank Ketcher canvas serializes to a tiny KET; treat that as "nothing drawn".
    const drawn = !!img || (ket && ket.length > 60)
    editing.value.scheme = drawn ? { ket, img } : null
    if (!drawn) store.toast('Canvas looked empty — nothing saved')
    showScheme.value = false
  } catch { store.toast('Could not read the scheme — try again') } finally { schemeBusy.value = false }
}
function clearScheme() { editing.value.scheme = null }

// Share with specific users (emails)
const shareInput = ref('')
function addProtoShare() {
  const e = (shareInput.value || '').trim().toLowerCase()
  if (e && e !== store.user?.email && !editing.value.sharedWith.includes(e)) editing.value.sharedWith.push(e)
  shareInput.value = ''
}
function removeProtoShare(em) { editing.value.sharedWith = editing.value.sharedWith.filter(x => x !== em) }

async function save() {
  const p = editing.value
  if (!p.name.trim()) { msg.value = 'Give it a name.'; return }
  msg.value = 'Saving…'
  const sw = p.scope === 'Global' ? [] : (p.sharedWith || [])
  const data = { ...p, owner_id: store.user.id, sharedWith: sw }
  const payload = { item_id: String(p.id), owner_id: store.user.id, scope: p.scope || 'Personal', shared_with: sw, data }
  let { error } = await db.from('protocols').upsert(payload, { onConflict: 'item_id' })
  if (error && /shared_with|column|schema/i.test(error.message)) {
    ({ error } = await db.from('protocols').upsert({ item_id: String(p.id), owner_id: store.user.id, scope: p.scope || 'Personal', data }, { onConflict: 'item_id' }))
  }
  if (error) { msg.value = 'Save failed: ' + error.message; return }
  await load(); editing.value = null; store.toast('Protocol saved')
}
async function remove(p) {
  if (!confirm(`Delete protocol "${p.name}"?`)) return
  const { error } = await db.from('protocols').delete().eq('item_id', String(p.id))
  if (error) { store.toast('Delete failed'); return }
  await load(); if (editing.value?.id === p.id) editing.value = null; store.toast('Protocol deleted')
}

// ── Gradient plot (SVG) ──
const W = 320, H = 130, PAD = 28
const gradPts = computed(() => {
  const g = (editing.value?.gradient || []).filter(r => r.time != null && r.pctB != null).sort((a, b) => a.time - b.time)
  return g
})
const maxTime = computed(() => Math.max(1, ...gradPts.value.map(r => +r.time)))
function gx(t) { return PAD + (t / maxTime.value) * (W - PAD - 8) }
function gy(pct) { return PAD - 8 + (1 - pct / 100) * (H - PAD - 12) }
// Chromeleon gradient curve: 5 = linear; 1–4 convex (rapid change at the start);
// 6–9 concave (rapid change at the end). Modelled as p^e with e = 2^((c−5)/2).
function curveShape(p, curve) {
  const c = curve == null ? 5 : Number(curve)
  if (c === 5 || isNaN(c)) return p
  return Math.pow(p, Math.pow(2, (c - 5) / 2))
}
const gradPath = computed(() => {
  const pts = gradPts.value
  if (!pts.length) return ''
  let d = `M${gx(+pts[0].time).toFixed(1)},${gy(+pts[0].pctB).toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    const t0 = +pts[i - 1].time, v0 = +pts[i - 1].pctB
    const t1 = +pts[i].time, v1 = +pts[i].pctB
    const curve = pts[i].curve  // curve on a row shapes the approach to that row
    const STEPS = 18
    for (let s = 1; s <= STEPS; s++) {
      const p = s / STEPS
      const t = t0 + (t1 - t0) * p
      const v = v0 + (v1 - v0) * curveShape(p, curve)
      d += `L${gx(t).toFixed(1)},${gy(v).toFixed(1)}`
    }
  }
  return d
})

// ── Insert into active journal entry ──
const canInsert = computed(() => !!store.journal.activeId)
function insertIntoJournal(p) {
  if (!store.appendToActiveJournal(protocolHtml(p))) { store.toast('Open a journal entry first'); return }
  store.toast('Protocol added to journal entry')
}
// Link (reference) a protocol to the active journal entry — kept live, not inlined.
const activeEntry = computed(() => store.journal.entries.find(e => e.id === store.journal.activeId))
function linkToJournal(p) {
  const entry = activeEntry.value
  if (!entry) { store.toast('Open a journal entry first'); return }
  entry.linkedProtocols = entry.linkedProtocols || []
  if (entry.linkedProtocols.some(x => x.id === p.id)) { store.toast('Already linked'); return }
  entry.linkedProtocols.push({ id: p.id, name: p.name, type: p.type })
  store.journalNeedsSync++
  store.toast('Linked to journal entry')
}
</script>

<template>
  <div class="protocols-panel">
    <div v-if="loadError" class="pr-error"><i class="fas fa-triangle-exclamation"></i> {{ loadError }} — is the <code>protocols</code> table set up?</div>

    <!-- ── Editor ── -->
    <div v-if="editing" class="pr-editor">
      <div class="pr-row">
        <label class="pr-field grow"><span>Name</span><input v-model="editing.name" placeholder="e.g. HPLC DNA 5–95% ACN, 20 min"></label>
        <label class="pr-field"><span>Type</span><select v-model="editing.type"><option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option></select></label>
        <label class="pr-field"><span>Share</span><select v-model="editing.scope"><option value="Global">Lab</option><option value="Personal">Private</option></select></label>
      </div>
      <div v-if="showInstrumentField" class="pr-row">
        <label class="pr-field grow"><span>Instrument <span style="font-weight:400;opacity:.6;">(from Instrument Booking — shows in that instrument's logbook)</span></span>
          <select v-model="editing.instrument">
            <option value="">— none —</option>
            <option v-for="i in instrumentChoices" :key="i" :value="i">{{ i }}</option>
          </select>
        </label>
      </div>
      <div v-if="editing.scope !== 'Global'" class="pr-row">
        <label class="pr-field grow"><span>Share with specific users (emails)</span>
          <div v-if="editing.sharedWith.length" class="pr-shared">
            <span v-for="em in editing.sharedWith" :key="em" class="pr-share-chip">{{ em }}<button @click="removeProtoShare(em)">×</button></span>
          </div>
          <div style="display:flex; gap:6px;">
            <input v-model="shareInput" list="pr-share-emails" placeholder="name@example.com" @keydown.enter.prevent="addProtoShare" style="flex:1;">
            <button class="secondary small" @click="addProtoShare">Add</button>
          </div>
          <datalist id="pr-share-emails"><option v-for="em in knownProtoEmails" :key="em" :value="em"></option></datalist>
        </label>
      </div>

      <!-- HPLC-specific -->
      <template v-if="editing.type === 'HPLC'">
        <div class="pr-row">
          <label class="pr-field grow"><span>Column</span><input v-model="editing.column" placeholder="e.g. Vanquish C18, 2.1×100 mm, 1.9 µm"></label>
          <label class="pr-field"><span>Column lot</span><input v-model="editing.columnLot" placeholder="lot #"></label>
        </div>
        <div class="pr-row">
          <label class="pr-field"><span>Temp (°C)</span><input type="number" step="any" v-model.number="editing.temperature"></label>
          <label class="pr-field"><span>Flow (mL/min)</span><input type="number" step="any" v-model.number="editing.flowRate"></label>
          <label class="pr-field"><span>Injection (µL)</span><input type="number" step="any" v-model.number="editing.injectionVolume"></label>
          <label class="pr-field grow"><span>Detection</span><input v-model="editing.detection" placeholder="e.g. UV 260 nm / MS ESI+"></label>
        </div>
        <div class="pr-row">
          <label class="pr-field grow"><span>Eluent A</span><input v-model="editing.eluents.A" placeholder="e.g. 100 mM TEAA, pH 7"></label>
          <label class="pr-field grow"><span>Eluent B</span><input v-model="editing.eluents.B" placeholder="e.g. Acetonitrile"></label>
        </div>
        <div class="pr-row">
          <label class="pr-field grow"><span>Eluent C</span><input v-model="editing.eluents.C" placeholder="(optional)"></label>
          <label class="pr-field grow"><span>Eluent D</span><input v-model="editing.eluents.D" placeholder="(optional)"></label>
        </div>

        <div class="pr-two">
          <div class="pr-mini">
            <div class="pr-mini-head"><span>Gradient (Chromeleon)</span><button class="pr-link" @click="addGradRow">+ row</button></div>
            <table class="pr-table"><thead><tr><th>Time (min)</th><th>%B</th><th>Curve</th><th></th></tr></thead>
              <tbody><tr v-for="(r, i) in editing.gradient" :key="i">
                <td><input type="number" step="any" v-model.number="r.time"></td>
                <td><input type="number" step="any" min="0" max="100" v-model.number="r.pctB"></td>
                <td><input type="number" step="1" v-model.number="r.curve"></td>
                <td><button class="pr-link danger" @click="editing.gradient.splice(i, 1)">×</button></td>
              </tr></tbody>
            </table>
            <div class="pr-curvenote">Curve: <b>5</b> = linear · <b>1–4</b> convex (fast at start) · <b>6–9</b> concave (fast at end)</div>
          </div>
          <div class="pr-plot-box">
            <div class="pr-mini-head"><span>Gradient profile</span></div>
            <svg :viewBox="`0 0 ${W} ${H}`" class="pr-plot">
              <line :x1="PAD" :y1="H - PAD" :x2="W - 6" :y2="H - PAD" stroke="var(--ln2)" />
              <line :x1="PAD" :y1="PAD - 8" :x2="PAD" :y2="H - PAD" stroke="var(--ln2)" />
              <text :x="4" :y="gy(100) + 4" class="pr-axl">100</text>
              <text :x="8" :y="gy(0) + 4" class="pr-axl">0</text>
              <text :x="W - 24" :y="H - PAD + 14" class="pr-axl">{{ maxTime }}m</text>
              <text :x="2" :y="PAD - 12" class="pr-axl">%B</text>
              <path :d="gradPath" fill="none" stroke="var(--acc)" stroke-width="2.2" stroke-linejoin="round" />
              <circle v-for="(r, i) in gradPts" :key="i" :cx="gx(+r.time)" :cy="gy(+r.pctB)" r="2.5" fill="var(--acc)" />
            </svg>
          </div>
        </div>

        <div class="pr-mini">
          <div class="pr-mini-head"><span>Expected peak retention times</span><button class="pr-link" @click="addPeak">+ peak</button></div>
          <table class="pr-table"><thead><tr><th>Compound</th><th>RT (min)</th><th></th></tr></thead>
            <tbody><tr v-for="(r, i) in editing.peaks" :key="i">
              <td><input v-model="r.name" placeholder="e.g. product"></td>
              <td><input type="number" step="any" v-model.number="r.rt"></td>
              <td><button class="pr-link danger" @click="editing.peaks.splice(i, 1)">×</button></td>
            </tr>
            <tr v-if="!editing.peaks.length"><td colspan="3" style="opacity:.5;font-size:.78rem;">No peaks yet.</td></tr></tbody>
          </table>
        </div>
      </template>

      <!-- Reaction scheme (Synthesis) -->
      <div v-if="editing.type === 'Synthesis'" class="pr-mini">
        <div class="pr-mini-head"><span>Reaction scheme</span>
          <span>
            <button class="pr-link" @click="openScheme"><i class="fas fa-pen-nib"></i> {{ editing.scheme ? 'Edit' : 'Draw' }} scheme</button>
            <button v-if="editing.scheme" class="pr-link danger" @click="clearScheme">Clear</button>
          </span>
        </div>
        <div v-if="editing.scheme?.img" class="pr-scheme" @click="openScheme"><img :src="editing.scheme.img" alt="Reaction scheme"></div>
        <div v-else class="pr-scheme-empty" @click="openScheme">Draw reactants → products with the reaction-arrow tool; put reagents/conditions above the arrow.</div>
      </div>

      <!-- Sequence + scale (Peptide / DNA) -->
      <div v-if="editing.type === 'Peptide' || editing.type === 'DNA'" class="pr-row">
        <label class="pr-field grow"><span>Sequence ({{ editing.type === 'DNA' ? "5'→3'" : 'N→C' }})</span>
          <input v-model="editing.sequence" :placeholder="editing.type === 'DNA' ? 'e.g. 5-ACGT ATCG GGCC-3' : 'e.g. H-FLFLF-NH2 (one- or three-letter)'">
        </label>
        <label class="pr-field"><span>Scale</span><input type="number" step="any" v-model.number="editing.scale"></label>
        <label class="pr-field"><span>Unit</span><select v-model="editing.scaleUnit"><option>µmol</option><option>mmol</option><option>mg</option><option>g</option></select></label>
      </div>

      <!-- Reagents (recipe types) -->
      <div v-if="isRecipe" class="pr-mini">
        <div class="pr-mini-head"><span>Reagents</span><button class="pr-link" @click="addReagent">+ reagent</button></div>
        <table class="pr-table"><thead><tr><th>Reagent</th><th>Amount</th><th>Equiv</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in editing.reagents" :key="i">
              <td><input v-model="r.name" placeholder="e.g. Fmoc-Ala-OH / DIC"></td>
              <td><input v-model="r.amount" placeholder="e.g. 3 mmol"></td>
              <td><input v-model="r.equiv" placeholder="e.g. 3"></td>
              <td><button class="pr-link danger" @click="editing.reagents.splice(i, 1)">×</button></td>
            </tr>
            <tr v-if="!editing.reagents.length"><td colspan="4" style="opacity:.5;font-size:.78rem;">No reagents yet.</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Procedure steps with conditions (recipe types) -->
      <div v-if="isRecipe" class="pr-mini">
        <div class="pr-mini-head"><span>Procedure steps</span><button class="pr-link" @click="addStep">+ step</button></div>
        <div class="pr-steps">
          <div v-for="(s, i) in editing.steps" :key="i" class="pr-step">
            <span class="pr-step-no">{{ i + 1 }}</span>
            <div class="pr-step-body">
              <textarea v-model="s.text" rows="2" placeholder="What to do in this step…"></textarea>
              <div class="pr-step-conds">
                <label>Temp (°C) <input type="number" step="any" v-model.number="s.temp" placeholder="rt"></label>
                <label>Time <input v-model="s.time" placeholder="e.g. 2 h"></label>
                <label>Atmosphere <input v-model="s.atmosphere" placeholder="e.g. N₂"></label>
              </div>
            </div>
            <div class="pr-step-actions">
              <button class="pr-link" @click="moveStep(i, -1)" :disabled="i === 0" title="Move up">↑</button>
              <button class="pr-link" @click="moveStep(i, 1)" :disabled="i === editing.steps.length - 1" title="Move down">↓</button>
              <button class="pr-link danger" @click="editing.steps.splice(i, 1)" title="Remove">×</button>
            </div>
          </div>
          <div v-if="!editing.steps.length" class="pr-empty">No steps yet — add the first step.</div>
        </div>
      </div>

      <!-- Parameters / synthesizer settings (all types) -->
      <div class="pr-mini">
        <div class="pr-mini-head"><span>{{ paramsLabel }}</span><button class="pr-link" @click="addParam">+ parameter</button></div>
        <table class="pr-table"><thead><tr><th>Setting</th><th>Value</th><th></th></tr></thead>
          <tbody><tr v-for="(r, i) in editing.params" :key="i">
            <td><input v-model="r.key" :placeholder="paramKeyPlaceholder"></td>
            <td><input v-model="r.value" placeholder="Value"></td>
            <td><button class="pr-link danger" @click="editing.params.splice(i, 1)">×</button></td>
          </tr>
          <tr v-if="!editing.params.length"><td colspan="3" style="opacity:.5;font-size:.78rem;">No parameters yet.</td></tr></tbody>
        </table>
      </div>

      <label class="pr-field"><span>Procedure / notes</span><textarea v-model="editing.procedure" rows="4" placeholder="Step-by-step procedure, sample prep, gotchas…"></textarea></label>

      <div class="pr-actions">
        <button class="danger small" v-if="editing.owner_id === store.user?.id" @click="remove(editing)"><i class="fas fa-trash"></i></button>
        <span v-if="msg" class="pr-msg">{{ msg }}</span>
        <button class="secondary small" style="margin-left:auto;" @click="cancelEdit">Cancel</button>
        <button class="small" @click="save"><i class="fas fa-save"></i> Save</button>
      </div>
    </div>

    <!-- ── Library ── -->
    <template v-else>
      <div class="pr-toolbar">
        <div class="search-box" style="margin:0;flex:1;max-width:320px;"><i class="fas fa-search"></i><input v-model="search" placeholder="Search protocols…"></div>
        <button class="small" style="margin-left:auto;" @click="newProtocol"><i class="fas fa-plus"></i> New protocol</button>
      </div>

      <h4><span class="scope-badge lab" style="margin-right:6px;">Lab</span> Shared protocols</h4>
      <div class="pr-list">
        <div v-for="p in shared" :key="p.id" class="pr-item" @click="editProtocol(p)">
          <span class="pr-type">{{ p.type }}</span>
          <span class="pr-name">{{ p.name }}</span>
          <span v-if="p.instrument" class="pr-inst"><i class="fas fa-flask-vial"></i> {{ p.instrument }}</span>
          <button v-if="canInsert" class="pr-link" @click.stop="linkToJournal(p)" title="Link to current journal entry"><i class="fas fa-link"></i></button>
          <button v-if="canInsert" class="pr-link" @click.stop="insertIntoJournal(p)" title="Insert a copy into the entry text"><i class="fas fa-file-import"></i></button>
        </div>
        <div v-if="!shared.length" class="pr-empty">No shared protocols yet.</div>
      </div>

      <h4 style="margin-top:16px;"><span class="scope-badge private" style="margin-right:6px;">Private</span> My protocols</h4>
      <div class="pr-list">
        <div v-for="p in mine" :key="p.id" class="pr-item" @click="editProtocol(p)">
          <span class="pr-type">{{ p.type }}</span>
          <span class="pr-name">{{ p.name }}</span>
          <span v-if="p.instrument" class="pr-inst"><i class="fas fa-flask-vial"></i> {{ p.instrument }}</span>
          <button v-if="canInsert" class="pr-link" @click.stop="linkToJournal(p)" title="Link to current journal entry"><i class="fas fa-link"></i></button>
          <button v-if="canInsert" class="pr-link" @click.stop="insertIntoJournal(p)" title="Insert a copy into the entry text"><i class="fas fa-file-import"></i></button>
        </div>
        <div v-if="!mine.length" class="pr-empty">No private protocols yet.</div>
      </div>

      <template v-if="sharedWithMe.length">
        <h4 style="margin-top:16px;"><span class="scope-badge" style="margin-right:6px; background:var(--acs); color:var(--acc);">Shared</span> Shared with me</h4>
        <div class="pr-list">
          <div v-for="p in sharedWithMe" :key="p.id" class="pr-item" @click="editProtocol(p)">
            <span class="pr-type">{{ p.type }}</span>
            <span class="pr-name">{{ p.name }}</span>
            <span v-if="p.instrument" class="pr-inst"><i class="fas fa-flask-vial"></i> {{ p.instrument }}</span>
            <button v-if="canInsert" class="pr-link" @click.stop="linkToJournal(p)" title="Link to current journal entry"><i class="fas fa-link"></i></button>
            <button v-if="canInsert" class="pr-link" @click.stop="insertIntoJournal(p)" title="Insert a copy into the entry text"><i class="fas fa-file-import"></i></button>
          </div>
        </div>
      </template>
    </template>

    <!-- ── Reaction scheme editor (Ketcher) — teleported so it centres on the viewport ── -->
    <Teleport to="body">
    <div v-if="showScheme" class="pr-modal" :class="{ 'dark-mode': store.isDarkMode }" @click.self="showScheme = false">
      <div class="pr-scheme-dialog">
        <div class="pr-scheme-head"><span><i class="fas fa-diagram-project"></i> Reaction scheme</span><button class="pr-x" @click="showScheme = false">✕</button></div>
        <div class="pr-scheme-canvas">
          <div v-if="!schemeReady" class="pr-scheme-loading"><i class="fas fa-spinner fa-spin"></i> Loading structure editor…</div>
          <KetcherField :initial-ket="schemeInitKet" @ready="onSchemeReady" />
        </div>
        <div class="pr-scheme-foot">
          <span class="pr-hint">Use the reaction-arrow tool to link reactants → products; add reagents/conditions above the arrow.</span>
          <span v-if="schemeBusy" class="pr-msg"><i class="fas fa-spinner fa-spin"></i> Saving…</span>
          <button class="secondary small" style="margin-left:auto;" @click="showScheme = false">Cancel</button>
          <button class="small" @click="saveScheme" :disabled="schemeBusy || !schemeReady"><i class="fas fa-check"></i> Save scheme</button>
        </div>
      </div>
    </div>
    </Teleport>
  </div>
</template>

<style scoped>
.pr-error { background: var(--wrs); color: var(--wr); border: 1px solid var(--wr); border-radius: var(--rc); padding: 10px 12px; font-size: 0.82rem; margin-bottom: 12px; }
.pr-error code { font-family: ui-monospace, monospace; }
.pr-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.pr-shared { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 6px; }
.pr-share-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 9px; border-radius: 999px; background: var(--acs); color: var(--acc); font-size: 0.72rem; font-weight: 600; }
.pr-share-chip button { background: none; border: none; box-shadow: none; color: inherit; cursor: pointer; font-size: 0.9rem; line-height: 1; padding: 0 2px; }
.pr-list { display: flex; flex-direction: column; gap: 6px; }
.pr-item { display: flex; align-items: center; gap: 10px; padding: 9px 11px; border: 1px solid var(--cdl); border-radius: var(--rc); background: var(--fl); cursor: pointer; }
.pr-item:hover { border-color: var(--acc); }
.pr-type { font-size: 9.5px; font-weight: 700; color: var(--tx2); background: var(--surface-solid); border-radius: 6px; padding: 2px 7px; flex: none; }
.pr-name { font-size: 0.88rem; font-weight: 600; color: var(--tx); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pr-inst { display: inline-flex; align-items: center; gap: 4px; flex: none; font-size: 0.7rem; font-weight: 600; color: var(--acc); background: var(--acs); border-radius: 999px; padding: 2px 8px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pr-empty { font-size: 0.82rem; color: var(--tx3); font-style: italic; padding: 6px 2px; }

.pr-editor { display: flex; flex-direction: column; gap: 8px; }
.pr-row { display: flex; flex-wrap: wrap; gap: 10px; }
.pr-field { display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem; }
.pr-field.grow { flex: 1; min-width: 160px; }
.pr-field > span { font-weight: 600; color: var(--tx2); font-size: 0.72rem; }
.pr-two { display: grid; grid-template-columns: 1fr 340px; gap: 14px; align-items: start; }
@media (max-width: 820px) { .pr-two { grid-template-columns: 1fr; } }
.pr-mini { margin: 6px 0; }
.pr-mini-head { display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 0.78rem; color: var(--tx); margin-bottom: 5px; }
.pr-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
.pr-table th { text-align: left; font-size: 0.68rem; color: var(--tx2); padding: 3px 6px; }
.pr-table td { padding: 2px 4px; }
.pr-table input { padding: 5px 6px; }
.pr-curvenote { font-size: 0.68rem; color: var(--tx2); margin-top: 5px; }
.pr-plot-box { border: 1px solid var(--ln2); border-radius: var(--rc); padding: 8px; background: var(--surface-solid); }
.pr-plot { width: 100%; height: auto; background: #fff; border-radius: 6px; }
.pr-axl { font-size: 8px; fill: #64748b; }
.pr-link { background: none; border: none; box-shadow: none; color: var(--acc); cursor: pointer; font-size: 0.78rem; padding: 2px 4px; }
.pr-link:hover { filter: none; }
.pr-link.danger { color: var(--danger-color); font-size: 0.95rem; }
.pr-actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding-top: 12px; border-top: 1px solid var(--ln); }
.pr-msg { font-size: 0.78rem; color: var(--tx2); }

/* Reaction scheme preview */
.pr-scheme { border: 1px solid var(--ln2); border-radius: var(--rc); padding: 8px; background: #fff; cursor: pointer; text-align: center; }
.pr-scheme img { max-width: 100%; max-height: 260px; }
.pr-scheme-empty { border: 1px dashed var(--ln2); border-radius: var(--rc); padding: 16px; font-size: 0.78rem; color: var(--tx3); text-align: center; cursor: pointer; }
.pr-scheme-empty:hover, .pr-scheme:hover { border-color: var(--acc); }

/* Recipe steps */
.pr-steps { display: flex; flex-direction: column; gap: 8px; }
.pr-step { display: flex; gap: 8px; align-items: flex-start; padding: 8px; border: 1px solid var(--ln2); border-radius: var(--rc); background: var(--surface-solid); }
.pr-step-no { flex: none; width: 22px; height: 22px; border-radius: 50%; background: var(--acs); color: var(--acc); font-size: 0.74rem; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.pr-step-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.pr-step-body textarea { width: 100%; resize: vertical; }
.pr-step-conds { display: flex; flex-wrap: wrap; gap: 8px; }
.pr-step-conds label { display: inline-flex; align-items: center; gap: 5px; font-size: 0.7rem; color: var(--tx2); }
.pr-step-conds input { width: 90px; padding: 4px 6px; }
.pr-step-actions { display: flex; flex-direction: column; gap: 2px; flex: none; }
.pr-step-actions .pr-link:disabled { opacity: 0.3; cursor: default; }

/* Ketcher scheme modal */
.pr-modal { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 16px; }
.pr-scheme-dialog { background: var(--modal, var(--surface)); border: 1px solid var(--cdl, var(--border)); border-radius: var(--r, 14px); box-shadow: var(--sh); width: 100%; max-width: 900px; display: flex; flex-direction: column; overflow: hidden; }
.pr-scheme-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; font-weight: 600; color: var(--tx); border-bottom: 1px solid var(--ln); }
.pr-x { width: 28px; height: 28px; border-radius: 50%; background: var(--fl); color: var(--tx2); border: none; box-shadow: none; cursor: pointer; font-size: 13px; }
.pr-scheme-canvas { position: relative; }
.pr-scheme-loading { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; gap: 8px; background: var(--surface-solid); color: var(--tx2); font-size: 0.85rem; }
.pr-scheme-foot { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-top: 1px solid var(--ln); flex-wrap: wrap; }
.pr-hint { font-size: 0.72rem; color: var(--tx2); flex: 1; min-width: 160px; }
</style>
