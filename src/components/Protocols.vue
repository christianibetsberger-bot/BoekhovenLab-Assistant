<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useLabStore } from '../stores/labStore'
import { db } from '../services/supabase'
import { protocolHtml } from '../utils/protocolView'
import { mergeInstrumentList } from '../utils/instruments'

const store = useLabStore()
const props = defineProps({ openId: { type: String, default: '' } })

const TYPES = ['HPLC', 'Confocal', 'Synthesis', 'Stock prep', 'General']
const uuid = () => 'proto_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2))

function blank(type = 'HPLC') {
  return {
    id: uuid(), name: '', type, scope: 'Global', instrument: '', sharedWith: [],
    // HPLC
    column: '', columnLot: '', temperature: null, flowRate: null, injectionVolume: null, detection: '',
    eluents: { A: '', B: '', C: '', D: '' },
    gradient: [{ time: 0, pctB: 5, curve: 5 }, { time: 20, pctB: 95, curve: 5 }],
    peaks: [],
    // Generic / other
    params: [],
    procedure: '',
  }
}

// Instrument options for the "link to instrument" field (built-ins + lab-added).
const instrumentRows = ref([])
onMounted(async () => { try { const { data } = await db.from('instruments').select('*'); if (data) instrumentRows.value = data } catch { /* table may not exist yet */ } })
const instrumentOptions = computed(() => mergeInstrumentList(instrumentRows.value))

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
function newProtocol() { editing.value = blank(); msg.value = '' }
function editProtocol(p) { editing.value = JSON.parse(JSON.stringify(p)); if (!editing.value.eluents) editing.value.eluents = { A: '', B: '', C: '', D: '' }; if (!editing.value.gradient) editing.value.gradient = []; if (!editing.value.peaks) editing.value.peaks = []; if (!editing.value.params) editing.value.params = []; if (!editing.value.sharedWith) editing.value.sharedWith = []; msg.value = '' }
function cancelEdit() { editing.value = null }
function addGradRow() { editing.value.gradient.push({ time: (editing.value.gradient.at(-1)?.time || 0) + 5, pctB: 95, curve: 5 }) }
function addPeak() { editing.value.peaks.push({ name: '', rt: null }) }
function addParam() { editing.value.params.push({ key: '', value: '' }) }

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
      <div class="pr-row">
        <label class="pr-field grow"><span>Instrument <span style="font-weight:400;opacity:.6;">(shows in that instrument's logbook)</span></span>
          <input v-model="editing.instrument" list="pr-instruments" placeholder="(optional) e.g. HPLC-MS">
          <datalist id="pr-instruments"><option v-for="i in instrumentOptions" :key="i" :value="i"></option></datalist>
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

      <!-- Parameters (all types) -->
      <div class="pr-mini">
        <div class="pr-mini-head"><span>{{ editing.type === 'Confocal' ? 'Confocal settings' : 'Parameters' }}</span><button class="pr-link" @click="addParam">+ parameter</button></div>
        <table class="pr-table"><thead><tr><th>Setting</th><th>Value</th><th></th></tr></thead>
          <tbody><tr v-for="(r, i) in editing.params" :key="i">
            <td><input v-model="r.key" :placeholder="editing.type === 'Confocal' ? 'e.g. Laser 488 nm power' : 'Setting'"></td>
            <td><input v-model="r.value" :placeholder="editing.type === 'Confocal' ? 'e.g. 5 %' : 'Value'"></td>
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
</style>
