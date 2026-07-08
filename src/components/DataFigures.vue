<template>
  <div class="data-figures">
    <h2><i class="fas fa-chart-line"></i> Data &amp; Figures</h2>
    <p class="df-intro">
      Upload raw instrument data, run a shared <strong>analysis set</strong>, and get
      publication-ready figures in one consistent lab style. HPLC-DNA is built in;
      you can add your own Python analysis and publish it for everyone.
    </p>

    <!-- ── 1 · Analysis set + params ─────────────────────────────────────── -->
    <section class="df-card">
      <h3><i class="fas fa-vials"></i> Analysis set</h3>
      <div class="df-row">
        <label class="df-field grow">
          <span>Set</span>
          <select v-model="selectedSetId">
            <optgroup label="Built in">
              <option v-for="s in builtinSets" :key="s.id" :value="s.id">{{ s.name }}</option>
            </optgroup>
            <optgroup v-if="visibleCustomSets.length" label="Shared / mine">
              <option v-for="s in visibleCustomSets" :key="s.id" :value="s.id">
                {{ s.name }} · {{ s.scope }}{{ s.owner_id === store.user?.id ? ' (mine)' : '' }}
              </option>
            </optgroup>
          </select>
        </label>
      </div>
      <div v-if="currentSet" class="df-meta">
        <span><i class="fas fa-microscope"></i> {{ currentSet.instrument || '—' }}</span>
        <span><i class="fas fa-file-lines"></i> {{ currentSet.fileFormat || '—' }}</span>
        <span><i class="fas fa-tag"></i> {{ currentSet.namingConvention || '—' }}</span>
      </div>
      <p v-if="currentSet?.description" class="df-desc">{{ currentSet.description }}</p>

      <!-- Params: generated form when the set declares a schema, else JSON. -->
      <div v-if="currentSchema.length" class="df-params">
        <div v-for="grp in paramGroups" :key="grp" class="df-param-group">
          <h4>{{ grp }}</h4>
          <div class="df-param-grid">
            <label v-for="f in currentSchema.filter(x => (x.group || 'Parameters') === grp)" :key="f.key" class="df-field">
              <span>{{ f.label }}<em v-if="f.unit"> ({{ f.unit }})</em></span>
              <input v-if="f.type === 'boolean'" type="checkbox" v-model="params[f.key]" />
              <input v-else type="number" :step="f.step || 'any'" v-model.number="params[f.key]" />
            </label>
          </div>
        </div>
      </div>
      <label v-else class="df-field">
        <span>Parameters (JSON)</span>
        <textarea v-model="paramsJson" rows="4" class="df-code"></textarea>
      </label>
    </section>

    <!-- ── 2 · Upload + run ──────────────────────────────────────────────── -->
    <section class="df-card">
      <h3><i class="fas fa-upload"></i> Raw data</h3>
      <div class="df-drop" @dragover.prevent @drop.prevent="onDrop">
        <i class="fas fa-cloud-arrow-up"></i>
        <span>Drop files here or</span>
        <input ref="fileInput" type="file" multiple @change="onFilesSelected" />
      </div>
      <div v-if="goodFiles.length || skipped.length" class="df-filelist">
        <div class="df-file-ok"><i class="fas fa-check"></i> {{ goodFiles.length }} file(s) ready</div>
        <div v-if="skipped.length" class="df-file-skip">
          <i class="fas fa-triangle-exclamation"></i> {{ skipped.length }} skipped
          <ul><li v-for="s in skipped" :key="s.name">{{ s.name }} — {{ s.reason }}</li></ul>
        </div>
      </div>

      <!-- Trust gate for other users' Python before it runs in your browser. -->
      <div v-if="needsTrust" class="df-trust">
        <i class="fas fa-shield-halved"></i>
        <div>
          <strong>This analysis runs {{ currentSet.owner_id === store.user?.id ? 'your' : 'someone else\'s' }} Python in your browser.</strong>
          It executes in a sandbox (no page access), but review the code before running a shared set.
          <details><summary>Show code</summary><pre class="df-code-view">{{ currentSet.code }}</pre></details>
          <label class="df-check"><input type="checkbox" v-model="trustChecked" /> I have reviewed and trust this analysis set</label>
        </div>
      </div>

      <div class="df-actions">
        <button class="df-btn primary" :disabled="!canRun" @click="runAnalysis">
          <i class="fas fa-play"></i> Run analysis
        </button>
        <span v-if="progress" class="df-progress">{{ progress }}</span>
      </div>
    </section>

    <!-- ── 3 · Results table ─────────────────────────────────────────────── -->
    <section v-if="tableRows.length" class="df-card">
      <h3><i class="fas fa-table"></i> Results <span class="df-count">{{ tableRows.length }}</span></h3>
      <div class="df-table-wrap">
        <table class="df-table">
          <thead>
            <tr><th v-for="c in columns" :key="c.key">{{ c.label }}<em v-if="c.unit"> / {{ c.unit }}</em></th></tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in tableRows" :key="i">
              <td v-for="c in columns" :key="c.key">{{ fmtCell(r[c.key]) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="anyEstimatedEpsilon" class="df-note">
        <i class="fas fa-circle-info"></i> Some samples used a default extinction coefficient
        (strands not found in your sequence library) — concentrations are approximate.
      </p>
    </section>

    <!-- ── 4 · Figures ───────────────────────────────────────────────────── -->
    <section v-if="tableRows.length" class="df-card">
      <h3><i class="fas fa-image"></i> Figures</h3>
      <div class="df-row">
        <label class="df-field">
          <span>Plot preset</span>
          <select v-model="selectedPresetId">
            <option v-for="p in allPresets" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="df-field">
          <span>Palette</span>
          <select v-model="selectedPaletteId">
            <option v-for="p in allPalettes" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
      </div>

      <div v-if="isHplcDna" class="df-figtabs">
        <button :class="{ active: figureTab === 'heatmap' }" @click="figureTab = 'heatmap'">Heatmap</button>
        <button :class="{ active: figureTab === 'gallery' }" @click="figureTab = 'gallery'">Chromatograms</button>
      </div>

      <!-- Heatmap -->
      <div v-show="figureTab === 'heatmap' && isHplcDna" class="df-figure">
        <div class="df-row">
          <label class="df-field">
            <span>Value</span>
            <select v-model="heatmapValue">
              <option value="conversion_pct">Conversion (%)</option>
              <option value="product_uM">Product (µM)</option>
            </select>
          </label>
          <label v-if="timepoints.length > 1" class="df-field">
            <span>Timepoint (min)</span>
            <select v-model.number="heatmapTime">
              <option v-for="t in timepoints" :key="t" :value="t">{{ t }}</option>
            </select>
          </label>
        </div>
        <div ref="heatEl" class="df-plot"></div>
      </div>

      <!-- Chromatogram gallery -->
      <div v-show="figureTab === 'gallery' && isHplcDna" class="df-gallery">
        <div v-for="r in tableRows" :key="r.name" class="df-gallery-item"
             :ref="el => setGalleryRef(r.name, el)"></div>
      </div>

      <div v-if="isHplcDna" class="df-actions">
        <button class="df-btn" :disabled="exportBusy" @click="exportFigure('png')"><i class="fas fa-file-image"></i> Export PNG</button>
        <button class="df-btn" :disabled="exportBusy" @click="exportFigure('svg')"><i class="fas fa-bezier-curve"></i> Export SVG</button>
        <button class="df-btn" :disabled="exportBusy" @click="exportFigure('pdf')"><i class="fas fa-file-pdf"></i> Export PDF</button>
        <span v-if="exportProgress" class="df-progress">{{ exportProgress }}</span>
      </div>
      <p v-else class="df-note">
        <i class="fas fa-circle-info"></i> Interactive figures and publication export for custom
        Python sets are coming next — for now the analysed table above is available to save.
      </p>
      <div v-if="exportImg" class="df-export-preview">
        <img v-if="exportImg.format !== 'pdf'" :src="exportImg.dataUrl" alt="publication figure" />
        <a :href="exportImg.dataUrl" :download="exportFilename">Download {{ exportImg.format.toUpperCase() }}</a>
      </div>
    </section>

    <!-- ── 5 · Save / publish dataset ────────────────────────────────────── -->
    <section v-if="tableRows.length" class="df-card">
      <h3><i class="fas fa-cloud-arrow-up"></i> Save dataset</h3>
      <div class="df-row">
        <label class="df-field grow"><span>Name</span><input v-model="datasetName" placeholder="e.g. CTI-117 conversion" /></label>
        <label class="df-field"><span>Scope</span>
          <select v-model="datasetScope"><option>Personal</option><option>Global</option></select>
        </label>
        <button class="df-btn primary" :disabled="!store.user || !datasetName" @click="saveDataset"><i class="fas fa-save"></i> Save</button>
      </div>
      <span v-if="saveMsg" class="df-progress">{{ saveMsg }}</span>
    </section>

    <!-- ── 6 · Analysis-set manager ──────────────────────────────────────── -->
    <section class="df-card">
      <h3 class="df-collapse" @click="managerOpen = !managerOpen">
        <i class="fas" :class="managerOpen ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
        Create / share an analysis set
      </h3>
      <div v-if="managerOpen" class="df-manager">
        <p class="df-desc">
          Define a Python analysis everyone can reuse. It must define
          <code>analyze(files, params)</code> returning
          <code>{{ '{ columns, rows, traces }' }}</code>.
        </p>
        <div class="df-row">
          <label class="df-field grow"><span>Name</span><input v-model="editor.name" placeholder="e.g. UV-Vis kinetics" /></label>
          <label class="df-field"><span>Scope</span>
            <select v-model="editor.scope"><option>Personal</option><option>Global</option></select>
          </label>
        </div>
        <div class="df-row">
          <label class="df-field grow"><span>Instrument</span><input v-model="editor.instrument" placeholder="e.g. Tecan Spark" /></label>
          <label class="df-field grow"><span>File format</span><input v-model="editor.fileFormat" placeholder="e.g. CSV export, 2 header rows" /></label>
        </div>
        <div class="df-row">
          <label class="df-field grow"><span>Naming convention</span><input v-model="editor.namingConvention" placeholder="e.g. {run}_{sample}_{time}.csv" /></label>
          <label class="df-field grow"><span>Extra pip packages (comma-sep)</span><input v-model="editor.packages" placeholder="e.g. openpyxl" /></label>
        </div>
        <label class="df-field"><span>Default params (JSON)</span>
          <textarea v-model="editor.defaultsJson" rows="3" class="df-code"></textarea>
        </label>
        <label class="df-field"><span>Python code</span>
          <textarea v-model="editor.code" rows="14" class="df-code df-code-lg" spellcheck="false"></textarea>
        </label>
        <div class="df-actions">
          <button class="df-btn" @click="seedTemplate"><i class="fas fa-wand-magic-sparkles"></i> Insert template</button>
          <button class="df-btn primary" :disabled="!store.user || !editor.name || !editor.code" @click="saveSet">
            <i class="fas fa-save"></i> {{ editor.id ? 'Update' : 'Save' }} set
          </button>
          <button v-if="editor.id" class="df-btn" @click="resetEditor">New</button>
          <span v-if="managerMsg" class="df-progress">{{ managerMsg }}</span>
        </div>

        <div v-if="myCustomSets.length" class="df-myset-list">
          <div v-for="s in myCustomSets" :key="s.id" class="df-myset">
            <span>{{ s.name }} · {{ s.scope }}</span>
            <span class="df-myset-actions">
              <button class="df-link" @click="editSet(s)">Edit</button>
              <button class="df-link danger" @click="removeSet(s)">Delete</button>
            </span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted } from 'vue'
import Plotly from 'plotly.js-dist-min'
import { useLabStore } from '../stores/labStore'
import { parseHplcFilename } from '../utils/hplcFilename'
import { processChromatograms } from '../services/hplcLocalService'
import {
  listItems, saveItem, deleteItem, runPythonAnalysis, renderFigure,
} from '../services/dataFiguresService'
import {
  BUILTIN_ANALYSIS_SETS, getAnalysisSetById, resolveParams,
  deriveHplcDnaRow, buildMatrix, timepointsOf,
} from '../utils/analysisSets'
import { BOEKHOVEN_PALETTE, hexToRgba } from '../utils/palette'
import {
  DEFAULT_PRESET, resolvePreset, boekhovenPlotlyLayout, boekhovenHeatmapLayout,
  axisTitle, matplotlibStyleCode,
} from '../utils/plotStyle'

const store = useLabStore()

// ── Analysis sets ────────────────────────────────────────────────────────────
const builtinSets = BUILTIN_ANALYSIS_SETS
const customSets = ref([])            // from Supabase, kind 'analysis_set'
const selectedSetId = ref(builtinSets[0].id)

const visibleCustomSets = computed(() =>
  customSets.value.filter(s => s.scope === 'Global' || s.owner_id === store.user?.id))
const myCustomSets = computed(() => customSets.value.filter(s => s.owner_id === store.user?.id))
const currentSet = computed(() =>
  getAnalysisSetById(selectedSetId.value, customSets.value))
const isHplcDna = computed(() => currentSet.value?.builtinKey === 'hplc-dna')

const currentSchema = computed(() => currentSet.value?.paramsSchema || [])
const paramGroups = computed(() =>
  [...new Set(currentSchema.value.map(f => f.group || 'Parameters'))])

const params = reactive({})
const paramsJson = ref('{}')

function loadDefaults(set) {
  for (const k of Object.keys(params)) delete params[k]
  Object.assign(params, set?.defaults || {})
  paramsJson.value = JSON.stringify(set?.defaults || {}, null, 2)
}
watch(currentSet, (s) => loadDefaults(s), { immediate: true })

// ── Uploaded files ───────────────────────────────────────────────────────────
const fileInput = ref(null)
const goodFiles = ref([])   // [{ file, meta }]
const skipped = ref([])
const seqLibraryMap = ref(new Map())

function loadSeqLibrary() {
  try {
    const raw = localStorage.getItem('lida_seq_library')
    const entries = raw ? JSON.parse(raw) : []
    seqLibraryMap.value = new Map(entries.map(e => [e.name.toLowerCase(), e]))
  } catch { seqLibraryMap.value = new Map() }
}

function onFilesSelected(e) { ingestFiles(Array.from(e.target.files || [])); e.target.value = '' }
function onDrop(e) { ingestFiles(Array.from(e.dataTransfer?.files || [])) }

function ingestFiles(fileList) {
  if (!fileList.length) return
  const good = []
  const bad = []
  for (const f of fileList) {
    // For the builtin HPLC-DNA set, resolve the filename + sequence up front so
    // bad names never reach the worker. Other sets take files as-is.
    if (isHplcDna.value) {
      const meta = parseHplcFilename(f.name)
      if (meta.error) { bad.push({ name: f.name, reason: meta.error }); continue }
      if (meta.scheme === 'named') {
        const entry = seqLibraryMap.value.get(String(meta.seqName).toLowerCase())
        if (entry) { meta.seqAB = entry.seqAB; meta.seqABprime = entry.seqABprime }
        meta.timeMin = meta.time
      } else {
        meta.seqAB = meta.ABseq; meta.seqABprime = meta.ABprimeSeq
        meta.seqName = meta.replicatorName; meta.code = meta.replicatorName; meta.timeMin = meta.time
      }
      good.push({ file: f, meta })
    } else {
      good.push({ file: f, meta: { name: f.name } })
    }
  }
  goodFiles.value = good
  skipped.value = bad
}

// ── Trust gate for shared Python ─────────────────────────────────────────────
const trustChecked = ref(false)
const ackSets = ref(new Set(JSON.parse(localStorage.getItem('datafig_ack_sets') || '[]')))
const needsTrust = computed(() =>
  currentSet.value?.kind === 'python' && !ackSets.value.has(currentSet.value.id))

const canRun = computed(() =>
  !isRunning.value && goodFiles.value.length > 0 &&
  (!needsTrust.value || trustChecked.value))

// ── Run ──────────────────────────────────────────────────────────────────────
const isRunning = ref(false)
const progress = ref('')
const rawResults = ref([])          // hplc worker results (builtin)
const pythonResult = ref(null)      // { columns, rows, traces } (python sets)

async function runAnalysis() {
  isRunning.value = true
  progress.value = 'Reading files…'
  rawResults.value = []
  pythonResult.value = null
  try {
    const files = await Promise.all(goodFiles.value.map(async ({ file }) => ({
      name: file.name, text: await file.text(),
    })))

    if (isHplcDna.value) {
      const wp = {
        scanMin: +params.scanMin, scanMax: +params.scanMax, prominence: +params.prominence,
        baselineWindow: +params.baselineWindow, useHplcPy: !!params.useHplcPy,
        productMin: +params.productMin, productMax: +params.productMax,
      }
      const results = await processChromatograms(files, wp, m => (progress.value = m))
      rawResults.value = results.map((r, i) => ({ ...r, meta: goodFiles.value[i]?.meta }))
    } else {
      // Custom Python set. Persist trust acknowledgement on first successful run.
      const p = currentSchema.value.length ? { ...params } : safeJson(paramsJson.value, {})
      const pkgs = (currentSet.value.packages || '')
        .split(',').map(s => s.trim()).filter(Boolean)
      pythonResult.value = await runPythonAnalysis(
        currentSet.value.code, files, p, pkgs, m => (progress.value = m))
      acknowledgeTrust(currentSet.value.id)
    }
    progress.value = `Done — ${files.length} file(s) processed.`
  } catch (err) {
    progress.value = `Failed: ${err?.message || err}`
  } finally {
    isRunning.value = false
  }
}

function acknowledgeTrust(id) {
  ackSets.value.add(id)
  localStorage.setItem('datafig_ack_sets', JSON.stringify([...ackSets.value]))
}

// ── Derived rows + table ─────────────────────────────────────────────────────
const derivedRows = computed(() => {
  if (!isHplcDna.value) return pythonResult.value?.rows || []
  const rp = resolveParams(currentSet.value, params)
  return rawResults.value.map(r => deriveHplcDnaRow(r, r.meta, rp))
})
const tableRows = computed(() => derivedRows.value)
const columns = computed(() => {
  if (!isHplcDna.value) return pythonResult.value?.columns || []
  return currentSet.value?.resultColumns || []
})
const anyEstimatedEpsilon = computed(() => isHplcDna.value && derivedRows.value.some(r => r.epsilonEstimated))
const timepoints = computed(() => timepointsOf(derivedRows.value))

function fmtCell(v) {
  if (v == null) return ''
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2)
  return String(v)
}
function safeJson(s, fallback) { try { return JSON.parse(s) } catch { return fallback } }

// ── Palettes + presets ───────────────────────────────────────────────────────
const customPalettes = ref([])
const customPresets = ref([])
const allPalettes = computed(() => [BOEKHOVEN_PALETTE, ...customPalettes.value])
const allPresets = computed(() => [DEFAULT_PRESET, ...customPresets.value])
const selectedPaletteId = ref(BOEKHOVEN_PALETTE.id)
const selectedPresetId = ref(DEFAULT_PRESET.id)
const currentPalette = computed(() => allPalettes.value.find(p => p.id === selectedPaletteId.value) || BOEKHOVEN_PALETTE)
const currentPreset = computed(() => resolvePreset(allPresets.value.find(p => p.id === selectedPresetId.value) || DEFAULT_PRESET))

// ── Interactive figures (Plotly) ─────────────────────────────────────────────
const figureTab = ref('heatmap')
const heatmapValue = ref('conversion_pct')
const heatmapTime = ref(null)
const heatEl = ref(null)
const galleryRefs = ref({})
function setGalleryRef(name, el) { if (el) galleryRefs.value[name] = el }

watch(timepoints, (tps) => { if (heatmapTime.value == null && tps.length) heatmapTime.value = tps[tps.length - 1] })

function renderHeatmap() {
  if (!heatEl.value || !isHplcDna.value) return
  const rows = derivedRows.value
  if (!rows.length) { Plotly.purge(heatEl.value); return }
  const value = heatmapValue.value
  const tp = timepoints.value.length > 1 ? heatmapTime.value : (timepoints.value[0] ?? null)
  const m = buildMatrix(rows, { value, timeMin: tp })
  const vmax = value === 'conversion_pct' ? 100 : Math.max(...m.z.flat().filter(v => v != null), 0.001)
  const { layout, colorscale } = boekhovenHeatmapLayout(currentPreset.value, currentPalette.value, {
    isDark: store.isDarkMode,
    x: { quantity: 'Sequence column' }, y: { quantity: 'Row' },
    title: value === 'conversion_pct' ? 'Conversion' : 'Product concentration',
  })
  const annotations = []
  m.z.forEach((row, i) => row.forEach((v, j) => {
    if (v == null) return
    annotations.push({
      x: m.xLabels[j], y: m.y[i], text: value === 'conversion_pct' ? `${Math.round(v)}` : v.toFixed(2),
      showarrow: false, font: { size: 11, color: v > vmax * 0.6 ? '#fff' : '#0f172a' },
    })
  }))
  layout.annotations = annotations
  const trace = {
    type: 'heatmap', x: m.xLabels, y: m.y, z: m.z, colorscale, zmin: 0, zmax: vmax,
    xgap: 2, ygap: 2, connectgaps: false,
    colorbar: { title: { text: value === 'conversion_pct' ? '%' : 'µM', font: { size: 10 } }, thickness: 12 },
    hovertemplate: '%{y}%{x}: %{z:.2f}<extra></extra>',
  }
  Plotly.react(heatEl.value, [trace], layout, { responsive: true, displayModeBar: false })
}

function renderGallery() {
  if (!isHplcDna.value) return
  const pal = currentPalette.value
  const lineColor = store.isDarkMode ? '#e2e8f0' : '#0f172a'
  for (const r of derivedRows.value) {
    const el = galleryRefs.value[r.name]
    if (!el) continue
    const t = r.trace?.t || [], s = r.trace?.s || []
    const traces = [{ type: 'scatter', mode: 'lines', x: t, y: s, line: { color: lineColor, width: 1.4 }, hoverinfo: 'x+y', showlegend: false }]
    for (const pk of r.peaks || []) {
      if (pk.peakClass !== 'product') continue
      const hw = pk.scale && pk.scale > 0 ? Math.min(0.35, pk.scale * 3) : 0.18
      const xs = [], ys = []
      for (let i = 0; i < t.length; i++) if (t[i] >= pk.rt - hw && t[i] <= pk.rt + hw) { xs.push(t[i]); ys.push(s[i]) }
      if (xs.length > 1) traces.push({
        type: 'scatter', mode: 'lines', x: xs, y: ys, fill: 'tozeroy',
        line: { color: pal.control }, fillcolor: hexToRgba(pal.control, 0.35), hoverinfo: 'skip', showlegend: false,
      })
    }
    const layout = boekhovenPlotlyLayout(currentPreset.value, pal, {
      isDark: store.isDarkMode,
      x: { quantity: 't', unit: 'min', range: [params.scanMin, params.scanMax] },
      y: { quantity: 'signal', unit: 'mAU' },
      title: `${r.seqName || r.name} · ${r.product_uM.toFixed(2)} µM`,
    })
    layout.shapes = [params.productMin, params.productMax].map(x => ({
      type: 'line', xref: 'x', yref: 'paper', x0: x, x1: x, y0: 0, y1: 1,
      line: { dash: 'dot', width: 1, color: '#64748b' },
    }))
    Plotly.react(el, traces, layout, { responsive: true, displayModeBar: false })
  }
}

function renderFigures() { nextTick(() => { renderHeatmap(); renderGallery() }) }
watch([derivedRows, selectedPresetId, selectedPaletteId, figureTab, heatmapValue, heatmapTime,
  () => store.isDarkMode], renderFigures)

// ── matplotlib publication export ────────────────────────────────────────────
const exportBusy = ref(false)
const exportProgress = ref('')
const exportImg = ref(null)
const exportFilename = computed(() => `figure_${figureTab.value}.${exportImg.value?.format || 'png'}`)

function buildExportSpec() {
  const pal = currentPalette.value
  if (figureTab.value === 'heatmap') {
    const value = heatmapValue.value
    const tp = timepoints.value.length > 1 ? heatmapTime.value : (timepoints.value[0] ?? null)
    const m = buildMatrix(derivedRows.value, { value, timeMin: tp })
    const vmax = value === 'conversion_pct' ? 100 : Math.max(...m.z.flat().filter(v => v != null), 0.001)
    const annot = m.z.map(row => row.map(v => v == null ? '' : (value === 'conversion_pct' ? `${Math.round(v)}` : v.toFixed(2))))
    return { type: 'heatmap', data: {
      z: m.z, xLabels: m.xLabels, y: m.y, vmax, annot, sequential: pal.sequential,
      valueLabel: value === 'conversion_pct' ? 'Conversion (%)' : 'Product (µM)',
      title: value === 'conversion_pct' ? 'Conversion' : 'Product concentration',
    } }
  }
  const panels = derivedRows.value.map(r => ({
    name: r.name, t: r.trace?.t || [], s: r.trace?.s || [],
    title: `${r.seqName || r.name} · ${r.product_uM.toFixed(2)} µM`,
    shades: (r.peaks || []).filter(p => p.peakClass === 'product').map(p => ({
      x0: p.rt - 0.18, x1: p.rt + 0.18, color: pal.control,
    })),
    vlines: [params.productMin, params.productMax],
  }))
  return { type: 'chromGallery', data: {
    panels, control: pal.control, lineColor: '#0f172a',
    xlabel: axisTitle('t', 'min', currentPreset.value), ylabel: axisTitle('signal', 'mAU', currentPreset.value),
  } }
}

async function exportFigure(format) {
  exportBusy.value = true
  exportProgress.value = 'Preparing Python renderer…'
  exportImg.value = null
  try {
    const styleCode = matplotlibStyleCode(currentPreset.value, currentPalette.value)
    const spec = buildExportSpec()
    exportImg.value = await renderFigure(styleCode, spec, format, null, m => (exportProgress.value = m))
    exportProgress.value = ''
  } catch (err) {
    exportProgress.value = `Export failed: ${err?.message || err}`
  } finally {
    exportBusy.value = false
  }
}

// ── Save dataset ─────────────────────────────────────────────────────────────
const datasetName = ref('')
const datasetScope = ref('Personal')
const saveMsg = ref('')
async function saveDataset() {
  saveMsg.value = 'Saving…'
  try {
    const obj = {
      id: 'dfset_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36)),
      kind: 'dataset', scope: datasetScope.value, name: datasetName.value,
      analysisSetId: selectedSetId.value, params: { ...params },
      columns: columns.value, rows: tableRows.value,
      figure: { presetId: selectedPresetId.value, paletteId: selectedPaletteId.value, tab: figureTab.value, heatmapValue: heatmapValue.value },
      createdAt: new Date().toISOString(),
    }
    await saveItem(obj, store.user.id)
    saveMsg.value = 'Saved.'
  } catch (err) { saveMsg.value = `Save failed: ${err?.message || err}` }
}

// ── Analysis-set manager ─────────────────────────────────────────────────────
const managerOpen = ref(false)
const managerMsg = ref('')
const editor = reactive({
  id: '', name: '', scope: 'Personal', instrument: '', fileFormat: '',
  namingConvention: '', packages: '', defaultsJson: '{}', code: '',
})
function resetEditor() {
  Object.assign(editor, { id: '', name: '', scope: 'Personal', instrument: '', fileFormat: '', namingConvention: '', packages: '', defaultsJson: '{}', code: '' })
}
function seedTemplate() {
  editor.code = `def analyze(files, params):
    """files: [{'name','text'}]  params: dict from 'Default params'.
    Return {'columns': [...], 'rows': [...], 'traces': {name: {'t': [...], 's': [...]}}}.
    """
    import io
    rows = []
    traces = {}
    for f in files:
        # Example: parse a simple 2-column CSV of x,y and report the max y.
        ys = []
        for line in f['text'].splitlines()[1:]:
            parts = line.replace(',', ' ').split()
            if len(parts) >= 2:
                try: ys.append(float(parts[1]))
                except ValueError: pass
        rows.append({'file': f['name'], 'max': max(ys) if ys else 0})
    return {
        'columns': [{'key': 'file', 'label': 'File'}, {'key': 'max', 'label': 'Max', 'unit': 'AU'}],
        'rows': rows,
        'traces': traces,
    }
`
}
function editSet(s) {
  managerOpen.value = true
  Object.assign(editor, {
    id: s.id, name: s.name, scope: s.scope, instrument: s.instrument || '',
    fileFormat: s.fileFormat || '', namingConvention: s.namingConvention || '',
    packages: s.packages || '', defaultsJson: JSON.stringify(s.defaults || {}, null, 2), code: s.code || '',
  })
}
async function saveSet() {
  managerMsg.value = 'Saving…'
  try {
    const obj = {
      id: editor.id || ('aset_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36))),
      kind: 'python', scope: editor.scope, name: editor.name,
      instrument: editor.instrument, fileFormat: editor.fileFormat,
      namingConvention: editor.namingConvention, packages: editor.packages,
      defaults: safeJson(editor.defaultsJson, {}), code: editor.code,
    }
    await saveItem(obj, store.user.id)
    await loadCustom()
    selectedSetId.value = obj.id
    resetEditor()
    managerMsg.value = 'Saved.'
  } catch (err) { managerMsg.value = `Save failed: ${err?.message || err}` }
}
async function removeSet(s) {
  if (!confirm(`Delete analysis set "${s.name}"?`)) return
  try { await deleteItem(s.id); await loadCustom() } catch (err) { managerMsg.value = `Delete failed: ${err?.message || err}` }
}

// ── Load shared items ────────────────────────────────────────────────────────
async function loadCustom() {
  const items = await listItems()
  customSets.value = items.filter(i => i.kind === 'python')
  customPalettes.value = items.filter(i => i.kind === 'palette')
  customPresets.value = items.filter(i => i.kind === 'plot_preset')
}

onMounted(() => {
  loadSeqLibrary()
  loadCustom()
})
</script>

<style scoped>
.data-figures { max-width: 1100px; }
.df-intro { color: var(--text); opacity: 0.8; font-size: 0.9rem; margin: 4px 0 16px; }
.df-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 16px; margin-bottom: 16px;
}
.df-card h3 { margin-bottom: 12px; }
.df-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
.df-field { display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem; }
.df-field.grow { flex: 1; min-width: 180px; }
.df-field > span { font-weight: 600; opacity: 0.75; }
.df-field em { opacity: 0.6; font-style: normal; }
.df-meta { display: flex; flex-wrap: wrap; gap: 16px; font-size: 0.75rem; opacity: 0.75; margin-top: 10px; }
.df-desc { font-size: 0.8rem; opacity: 0.8; margin: 8px 0; }
.df-params { margin-top: 12px; }
.df-param-group h4 { margin: 12px 0 6px; }
.df-param-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }

.df-drop {
  display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap;
  border: 2px dashed var(--border); border-radius: var(--radius); padding: 22px; text-align: center;
  color: var(--text); opacity: 0.85; font-size: 0.85rem;
}
.df-drop i { font-size: 1.4rem; color: var(--primary); }
.df-filelist { margin-top: 10px; font-size: 0.8rem; }
.df-file-ok { color: #10b981; font-weight: 600; }
.df-file-skip { color: #f59e0b; margin-top: 6px; }
.df-file-skip ul { margin: 4px 0 0 20px; opacity: 0.8; }

.df-trust {
  display: flex; gap: 12px; margin-top: 14px; padding: 12px;
  border: 1px solid #f59e0b; border-radius: var(--radius); background: rgba(245, 158, 11, 0.08); font-size: 0.82rem;
}
.df-trust > i { color: #f59e0b; font-size: 1.2rem; }
.df-check { display: block; margin-top: 8px; font-weight: 600; }
.df-code-view { max-height: 220px; overflow: auto; background: var(--input-bg); padding: 8px; border-radius: 6px; font-size: 0.72rem; }

.df-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
.df-btn {
  background: var(--input-bg); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 8px 14px; cursor: pointer; font-weight: 600; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px;
}
.df-btn.primary { background: var(--primary); color: #fff; border-color: var(--primary); }
.df-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.df-progress { font-size: 0.78rem; opacity: 0.8; }
.df-count { background: var(--primary); color: #fff; border-radius: 999px; padding: 1px 8px; font-size: 0.7rem; margin-left: 6px; }

.df-table-wrap { overflow-x: auto; }
.df-table { border-collapse: collapse; width: 100%; font-size: 0.8rem; }
.df-table th, .df-table td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; }
.df-table th { background: var(--input-bg); }
.df-note { font-size: 0.76rem; opacity: 0.8; margin-top: 8px; }

.df-figtabs { display: flex; gap: 6px; margin: 12px 0; }
.df-figtabs button { background: var(--input-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 6px 14px; cursor: pointer; font-size: 0.8rem; }
.df-figtabs button.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.df-plot { width: 100%; height: 460px; }
.df-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.df-gallery-item { height: 220px; border: 1px solid var(--border); border-radius: 6px; }
.df-export-preview { margin-top: 12px; }
.df-export-preview img { max-width: 100%; border: 1px solid var(--border); border-radius: 6px; }
.df-export-preview a { display: inline-block; margin-top: 6px; font-size: 0.8rem; }

.df-collapse { cursor: pointer; user-select: none; }
.df-manager { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.df-code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.76rem; }
.df-code-lg { min-height: 220px; }
.df-myset-list { margin-top: 10px; border-top: 1px solid var(--border); padding-top: 8px; }
.df-myset { display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.8rem; }
.df-myset-actions { display: flex; gap: 10px; }
.df-link { background: none; border: none; color: var(--primary); cursor: pointer; font-size: 0.78rem; padding: 0; }
.df-link.danger { color: #ef4444; }
</style>
