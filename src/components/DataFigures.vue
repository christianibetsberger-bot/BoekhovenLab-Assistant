<template>
  <div class="data-figures">
    <h2><i class="fas fa-chart-line"></i> Data &amp; Figures</h2>

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

      <!-- Tunables rendered generically from the set's schema (any widget the set
           declares — numbers, toggles, tables like the gradient, …). If a set
           ships no schema, one is inferred from its default-params shape. -->
      <div v-if="currentSchema.length" class="df-params">
        <div v-for="grp in paramGroups" :key="grp" class="df-param-group">
          <h4 v-if="grp !== 'Parameters' || paramGroups.length > 1">{{ grp }}</h4>
          <div class="df-fields">
            <template v-for="f in fieldsInGroup(grp)" :key="f.key">
              <template v-if="fieldVisible(f)">
                <label v-if="f.type === 'boolean'" class="df-check inline">
                  <input type="checkbox" v-model="params[f.key]" /> {{ f.label }}
                </label>
                <label v-else-if="f.type === 'select'" class="df-field">
                  <span>{{ f.label }}</span>
                  <select v-model="params[f.key]"><option v-for="o in f.options" :key="o" :value="o">{{ o }}</option></select>
                </label>
                <label v-else-if="f.type === 'text'" class="df-field">
                  <span>{{ f.label }}</span><input v-model="params[f.key]" />
                </label>
                <div v-else-if="f.type === 'table'" class="df-mini">
                  <div class="df-mini-head">
                    <span>{{ f.label }}</span>
                    <button class="df-link" @click="addTableRow(f)">+ row</button>
                  </div>
                  <table class="df-table compact">
                    <thead><tr><th v-for="c in f.columns" :key="c.label">{{ c.label }}</th><th></th></tr></thead>
                    <tbody>
                      <tr v-for="(row, i) in (params[f.key] || [])" :key="i">
                        <td v-for="(c, ci) in f.columns" :key="ci">
                          <input type="number" :step="c.step || 'any'" v-model.number="row[ci]" />
                        </td>
                        <td><button class="df-link danger" @click="params[f.key].splice(i, 1)">×</button></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div v-else-if="f.type === 'readout'" class="df-fit">{{ readoutText(f) }}</div>
                <label v-else class="df-field">
                  <span>{{ f.label }}<em v-if="f.unit"> ({{ f.unit }})</em></span>
                  <input type="number" :step="f.step || 'any'" v-model.number="params[f.key]" />
                </label>
              </template>
            </template>
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
        <input ref="fileInput" type="file" multiple @change="onFilesSelected" />
      </div>
      <div v-if="goodFiles.length || skipped.length" class="df-filelist">
        <div class="df-file-ok"><i class="fas fa-check"></i> {{ goodFiles.length }} file(s) ready</div>
        <div v-if="skipped.length" class="df-file-skip">
          <i class="fas fa-triangle-exclamation"></i> {{ skipped.length }} skipped
          <ul><li v-for="s in skipped" :key="s.name">{{ s.name }} — {{ s.reason }}</li></ul>
        </div>
      </div>

      <div v-if="needsTrust" class="df-trust">
        <i class="fas fa-shield-halved"></i>
        <div>
          <strong>Runs {{ currentSet.owner_id === store.user?.id ? 'your' : "another user's" }} Python in a browser sandbox.</strong>
          <details><summary>Show code</summary><pre class="df-code-view">{{ currentSet.code }}</pre></details>
          <label class="df-check"><input type="checkbox" v-model="trustChecked" /> Reviewed &amp; trusted</label>
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
      <h3>
        <i class="fas fa-table"></i> Results <span class="df-count">{{ tableRows.length }}</span>
        <span v-if="anyEstimatedEpsilon" class="df-chip" title="Strands not in the sequence library — default ε used">approx ε</span>
      </h3>
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
    </section>

    <!-- ── 4 · Figures (only what this set produces) ─────────────────────── -->
    <section v-if="tableRows.length && setFigures.length" class="df-card">
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
        <button class="df-btn" @click="styleOpen = !styleOpen">
          <i class="fas" :class="styleOpen ? 'fa-chevron-up' : 'fa-sliders'"></i> Plot style
        </button>
      </div>

      <!-- Plot-style editor — drives both the Plotly preview and the export -->
      <div v-if="styleOpen" class="df-style">
        <div class="df-param-grid">
          <label class="df-field"><span>Font</span><input v-model="workingPreset.font" /></label>
          <label class="df-field"><span>Font size (pt)</span><input type="number" v-model.number="workingPreset.fontSize" /></label>
          <label class="df-field"><span>Width (in)</span><input type="number" step="0.5" v-model.number="workingPreset.sizeInches[0]" /></label>
          <label class="df-field"><span>Height (in)</span><input type="number" step="0.5" v-model.number="workingPreset.sizeInches[1]" /></label>
          <label class="df-field"><span>DPI</span><input type="number" v-model.number="workingPreset.dpi" /></label>
          <label class="df-field"><span>Axis separator</span>
            <select v-model="workingPreset.axisSep"><option value=" | "> | </option><option value=" / "> / </option></select>
          </label>
          <label class="df-field"><span>Legend size</span><input type="number" v-model.number="workingPreset.legend.fontSize" /></label>
          <label class="df-field"><span>Band opacity</span><input type="number" step="0.05" min="0" max="1" v-model.number="workingPreset.band.alpha" /></label>
        </div>
        <div class="df-toggles">
          <label class="df-check inline"><input type="checkbox" v-model="workingPreset.spines.top" /> Top spine</label>
          <label class="df-check inline"><input type="checkbox" v-model="workingPreset.spines.right" /> Right spine</label>
          <label class="df-check inline"><input type="checkbox" v-model="workingPreset.grid" /> Grid</label>
          <label class="df-check inline"><input type="checkbox" v-model="workingPreset.legend.show" /> Legend</label>
          <label class="df-check inline"><input type="checkbox" v-model="workingPreset.legend.frame" /> Legend frame</label>
        </div>
        <div class="df-row">
          <label class="df-field grow"><span>Save preset as</span><input v-model="presetName" :placeholder="workingPreset.name" /></label>
          <label class="df-field"><span>Scope</span>
            <select v-model="presetScope"><option>Personal</option><option>Global</option></select>
          </label>
          <button class="df-btn primary" :disabled="!store.user" @click="savePreset"><i class="fas fa-save"></i> Save style</button>
          <span v-if="presetMsg" class="df-progress">{{ presetMsg }}</span>
        </div>
      </div>

      <div v-if="setFigures.length > 1" class="df-figtabs">
        <button v-for="f in setFigures" :key="f" :class="{ active: figureTab === f }" @click="figureTab = f">
          {{ FIGURE_LABELS[f] || f }}
        </button>
      </div>

      <div v-show="figureTab === 'heatmap'" class="df-figure">
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

      <div v-show="figureTab === 'chromGallery'" class="df-gallery">
        <div v-for="r in tableRows" :key="r.name" class="df-gallery-item"
             :ref="el => setGalleryRef(r.name, el)"></div>
      </div>

      <div class="df-actions">
        <button class="df-btn" :disabled="exportBusy" @click="exportFigure('png')"><i class="fas fa-file-image"></i> PNG</button>
        <button class="df-btn" :disabled="exportBusy" @click="exportFigure('svg')"><i class="fas fa-bezier-curve"></i> SVG</button>
        <button class="df-btn" :disabled="exportBusy" @click="exportFigure('pdf')"><i class="fas fa-file-pdf"></i> PDF</button>
        <span v-if="exportProgress" class="df-progress">{{ exportProgress }}</span>
      </div>
      <div v-if="exportImg" class="df-export-preview">
        <img v-if="exportImg.format !== 'pdf'" :src="exportImg.dataUrl" alt="publication figure" />
        <a :href="exportImg.dataUrl" :download="exportFilename">Download {{ exportImg.format.toUpperCase() }}</a>
      </div>
    </section>

    <!-- ── 5 · Save dataset ──────────────────────────────────────────────── -->
    <section v-if="tableRows.length" class="df-card">
      <h3><i class="fas fa-cloud-arrow-up"></i> Save dataset</h3>
      <div class="df-row">
        <label class="df-field grow"><span>Name</span><input v-model="datasetName" placeholder="e.g. CTI-117 conversion" /></label>
        <label class="df-field"><span>Scope</span>
          <select v-model="datasetScope"><option>Personal</option><option>Global</option></select>
        </label>
        <button class="df-btn primary" :disabled="!store.user || !datasetName" @click="saveDataset"><i class="fas fa-save"></i> Save</button>
        <span v-if="saveMsg" class="df-progress">{{ saveMsg }}</span>
      </div>
    </section>

    <!-- ── 6 · Analysis-set manager (copy-paste your code) ───────────────── -->
    <section class="df-card">
      <h3 class="df-collapse" @click="managerOpen = !managerOpen">
        <i class="fas" :class="managerOpen ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
        Analysis set — paste code &amp; share
      </h3>
      <div v-if="managerOpen" class="df-manager">
        <div class="df-row">
          <label class="df-field grow"><span>Name</span><input v-model="editor.name" placeholder="e.g. UV-Vis kinetics" /></label>
          <label class="df-field"><span>Runtime</span>
            <select v-model="editor.runtime">
              <option value="pyodide">In-browser (Pyodide)</option>
              <option value="backend">Server (Docker) — soon</option>
            </select>
          </label>
          <label class="df-field"><span>Scope</span>
            <select v-model="editor.scope"><option>Personal</option><option>Global</option></select>
          </label>
        </div>
        <div class="df-row">
          <label class="df-field grow"><span>Instrument</span><input v-model="editor.instrument" placeholder="e.g. Tecan Spark" /></label>
          <label class="df-field grow"><span>File format</span><input v-model="editor.fileFormat" placeholder="e.g. CSV, 2 header rows" /></label>
        </div>
        <div class="df-row">
          <label class="df-field grow"><span>Naming convention</span><input v-model="editor.namingConvention" placeholder="e.g. {run}_{sample}_{time}.csv" /></label>
          <label class="df-field grow"><span>Extra pip packages</span><input v-model="editor.packages" placeholder="comma-separated, e.g. openpyxl" /></label>
        </div>
        <div class="df-row">
          <label class="df-field grow"><span>Default params (JSON)</span>
            <textarea v-model="editor.defaultsJson" rows="3" class="df-code"></textarea>
          </label>
          <label class="df-field grow"><span>Controls schema (JSON, optional — else inferred)</span>
            <textarea v-model="editor.schemaJson" rows="3" class="df-code"></textarea>
          </label>
        </div>
        <label class="df-field"><span>Python — must define analyze(files, params)</span>
          <textarea v-model="editor.code" rows="18" class="df-code df-code-lg" spellcheck="false"></textarea>
        </label>
        <div class="df-actions">
          <button class="df-btn" @click="seedTemplate"><i class="fas fa-paste"></i> Paste-in template</button>
          <button class="df-btn" :disabled="!editor.code || detecting" @click="detectFromCode">
            <i class="fas fa-wand-magic-sparkles"></i> Detect interface from code
          </button>
          <button class="df-btn primary" :disabled="!store.user || !editor.name || !editor.code" @click="saveSet">
            <i class="fas fa-save"></i> {{ editor.id ? 'Update' : 'Save' }} set
          </button>
          <button v-if="editor.id" class="df-btn" @click="resetEditor">New</button>
          <span v-if="managerMsg" class="df-progress">{{ managerMsg }}</span>
        </div>

        <div v-if="myCustomSets.length" class="df-myset-list">
          <div v-for="s in myCustomSets" :key="s.id" class="df-myset">
            <span>{{ s.name }} · {{ s.scope }} · {{ s.runtime || 'pyodide' }}</span>
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
  listItems, saveItem, deleteItem, runPythonAnalysis, renderFigure, describeAnalysis,
} from '../services/dataFiguresService'
import {
  BUILTIN_ANALYSIS_SETS, getAnalysisSetById, resolveParams,
  deriveHplcDnaRow, buildMatrix, timepointsOf, schemaFor, linearFit,
} from '../utils/analysisSets'
import { BOEKHOVEN_PALETTE, hexToRgba } from '../utils/palette'
import {
  DEFAULT_PRESET, resolvePreset, boekhovenPlotlyLayout, boekhovenHeatmapLayout,
  axisTitle, matplotlibStyleCode,
} from '../utils/plotStyle'

const store = useLabStore()
const FIGURE_LABELS = { heatmap: 'Heatmap', chromGallery: 'Chromatograms', xy: 'XY' }

// ── Analysis sets ────────────────────────────────────────────────────────────
const builtinSets = BUILTIN_ANALYSIS_SETS
const customSets = ref([])
const selectedSetId = ref(builtinSets[0].id)
const visibleCustomSets = computed(() =>
  customSets.value.filter(s => s.scope === 'Global' || s.owner_id === store.user?.id))
const myCustomSets = computed(() => customSets.value.filter(s => s.owner_id === store.user?.id))
const currentSet = computed(() => getAnalysisSetById(selectedSetId.value, customSets.value))
const isHplcDna = computed(() => currentSet.value?.builtinKey === 'hplc-dna')
const setFigures = computed(() => currentSet.value?.figures || [])

// Explicit schema if the set ships one, else inferred from its defaults' shape.
const currentSchema = computed(() => schemaFor(currentSet.value))
const paramGroups = computed(() => [...new Set(currentSchema.value.map(f => f.group || 'Parameters'))])
function fieldsInGroup(grp) { return currentSchema.value.filter(f => (f.group || 'Parameters') === grp) }
// A field shows unless a showIf condition on another param is unmet.
function fieldVisible(f) { return !f.showIf || params[f.showIf.key] === f.showIf.equals }
function addTableRow(f) {
  if (!Array.isArray(params[f.key])) params[f.key] = []
  params[f.key].push((f.columns || [{}, {}]).map(() => 0))
}
// A 'readout' field: compute a value from another field and format it.
function readoutText(f) {
  if (f.as === 'linearFit') {
    const tbl = params[f.from] || []
    const fit = linearFit(tbl.map(r => +r[0]), tbl.map(r => +r[1]))
    return (f.format || '{slope} {intercept}')
      .replace('{slope}', fit.slope.toFixed(4)).replace('{intercept}', fit.intercept.toFixed(4))
  }
  return ''
}

const params = reactive({})
const paramsJson = ref('{}')
function loadDefaults(set) {
  for (const k of Object.keys(params)) delete params[k]
  // Deep clone so editing table fields (gradient/CF) never mutates the frozen defaults.
  Object.assign(params, JSON.parse(JSON.stringify(set?.defaults || {})))
  paramsJson.value = JSON.stringify(set?.defaults || {}, null, 2)
}
watch(currentSet, (s) => loadDefaults(s), { immediate: true })

// ── Uploaded files ───────────────────────────────────────────────────────────
const fileInput = ref(null)
const goodFiles = ref([])
const skipped = ref([])
const seqLibraryMap = ref(new Map())
function loadSeqLibrary() {
  try {
    const raw = localStorage.getItem('lida_seq_library')
    seqLibraryMap.value = new Map((raw ? JSON.parse(raw) : []).map(e => [e.name.toLowerCase(), e]))
  } catch { seqLibraryMap.value = new Map() }
}
function onFilesSelected(e) { ingestFiles(Array.from(e.target.files || [])); e.target.value = '' }
function onDrop(e) { ingestFiles(Array.from(e.dataTransfer?.files || [])) }
function ingestFiles(fileList) {
  if (!fileList.length) return
  const good = [], bad = []
  for (const f of fileList) {
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
const needsTrust = computed(() => currentSet.value?.kind === 'python' && !ackSets.value.has(currentSet.value.id))
const canRun = computed(() =>
  !isRunning.value && goodFiles.value.length > 0 && (!needsTrust.value || trustChecked.value))

// ── Run ──────────────────────────────────────────────────────────────────────
const isRunning = ref(false)
const progress = ref('')
const rawResults = ref([])
const pythonResult = ref(null)
async function runAnalysis() {
  if (currentSet.value?.kind === 'python' && currentSet.value.runtime === 'backend') {
    progress.value = 'Server (Docker) runtime is not wired up yet — set the runtime to In-browser.'
    return
  }
  isRunning.value = true
  progress.value = 'Reading files…'
  rawResults.value = []
  pythonResult.value = null
  try {
    const files = await Promise.all(goodFiles.value.map(async ({ file }) => ({ name: file.name, text: await file.text() })))
    if (isHplcDna.value) {
      const wp = {
        scanMin: +params.scanMin, scanMax: +params.scanMax, prominence: +params.prominence,
        baselineWindow: +params.baselineWindow, useHplcPy: !!params.useHplcPy,
        productMin: +params.productMin, productMax: +params.productMax,
      }
      const results = await processChromatograms(files, wp, m => (progress.value = m))
      rawResults.value = results.map((r, i) => ({ ...r, meta: goodFiles.value[i]?.meta }))
    } else {
      const p = currentSchema.value.length ? { ...params } : safeJson(paramsJson.value, {})
      const pkgs = (currentSet.value.packages || '').split(',').map(s => s.trim()).filter(Boolean)
      pythonResult.value = await runPythonAnalysis(currentSet.value.code, files, p, pkgs, m => (progress.value = m))
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
const columns = computed(() =>
  isHplcDna.value ? (currentSet.value?.resultColumns || []) : (pythonResult.value?.columns || []))
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

// Editable working copy of the selected preset — drives preview + export live.
const styleOpen = ref(false)
const presetName = ref('')
const presetScope = ref('Personal')
const presetMsg = ref('')
const workingPreset = reactive(JSON.parse(JSON.stringify(resolvePreset(DEFAULT_PRESET))))
function loadPreset(p) { Object.assign(workingPreset, JSON.parse(JSON.stringify(resolvePreset(p)))) }
watch(selectedPresetId, (id) => {
  const p = allPresets.value.find(x => x.id === id)
  if (p) { loadPreset(p); presetName.value = '' }
})
const currentPreset = computed(() => resolvePreset(workingPreset))

async function savePreset() {
  presetMsg.value = 'Saving…'
  try {
    const base = JSON.parse(JSON.stringify(workingPreset))
    const isBuiltin = workingPreset.id === DEFAULT_PRESET.id
    const obj = {
      ...base, kind: 'plot_preset', scope: presetScope.value,
      name: presetName.value || workingPreset.name,
      id: isBuiltin ? ('preset_' + uuid()) : workingPreset.id,
      builtin: false,
    }
    await saveItem(obj, store.user.id)
    await loadCustom()
    selectedPresetId.value = obj.id
    presetMsg.value = 'Saved.'
  } catch (err) { presetMsg.value = `Save failed: ${err?.message || err}` }
}

// ── Interactive figures (Plotly) ─────────────────────────────────────────────
const figureTab = ref('heatmap')
const heatmapValue = ref('conversion_pct')
const heatmapTime = ref(null)
const heatEl = ref(null)
const galleryRefs = ref({})
function setGalleryRef(name, el) { if (el) galleryRefs.value[name] = el }
watch(setFigures, (f) => { if (f.length && !f.includes(figureTab.value)) figureTab.value = f[0] }, { immediate: true })
watch(timepoints, (tps) => { if (heatmapTime.value == null && tps.length) heatmapTime.value = tps[tps.length - 1] })

function renderHeatmap() {
  if (!heatEl.value || !setFigures.value.includes('heatmap')) return
  const rows = derivedRows.value
  if (!rows.length) { Plotly.purge(heatEl.value); return }
  const value = heatmapValue.value
  const tp = timepoints.value.length > 1 ? heatmapTime.value : (timepoints.value[0] ?? null)
  const m = buildMatrix(rows, { value, timeMin: tp })
  const vmax = value === 'conversion_pct' ? 100 : Math.max(...m.z.flat().filter(v => v != null), 0.001)
  const { layout, colorscale } = boekhovenHeatmapLayout(currentPreset.value, currentPalette.value, {
    isDark: store.isDarkMode, x: { quantity: 'Sequence column' }, y: { quantity: 'Row' },
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
  if (!setFigures.value.includes('chromGallery')) return
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
watch([derivedRows, selectedPaletteId, figureTab, heatmapValue, heatmapTime, () => store.isDarkMode], renderFigures)
watch(workingPreset, renderFigures, { deep: true })

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
    shades: (r.peaks || []).filter(p => p.peakClass === 'product').map(p => ({ x0: p.rt - 0.18, x1: p.rt + 0.18, color: pal.control })),
    vlines: [params.productMin, params.productMax],
  }))
  return { type: 'chromGallery', data: {
    panels, control: pal.control, lineColor: '#0f172a',
    xlabel: axisTitle('t', 'min', currentPreset.value), ylabel: axisTitle('signal', 'mAU', currentPreset.value),
  } }
}
async function exportFigure(format) {
  exportBusy.value = true
  exportProgress.value = 'Preparing renderer…'
  exportImg.value = null
  try {
    const styleCode = matplotlibStyleCode(currentPreset.value, currentPalette.value)
    exportImg.value = await renderFigure(styleCode, buildExportSpec(), format, null, m => (exportProgress.value = m))
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
      id: 'dfset_' + uuid(), kind: 'dataset', scope: datasetScope.value, name: datasetName.value,
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
const detecting = ref(false)
const editor = reactive({
  id: '', name: '', scope: 'Personal', runtime: 'pyodide', instrument: '', fileFormat: '',
  namingConvention: '', packages: '', defaultsJson: '{}', schemaJson: '', code: '',
})
function resetEditor() {
  Object.assign(editor, { id: '', name: '', scope: 'Personal', runtime: 'pyodide', instrument: '', fileFormat: '', namingConvention: '', packages: '', defaultsJson: '{}', schemaJson: '', code: '' })
}

// Run the code once and read a self-declared interface (PARAMS / SCHEMA) from it,
// so a pasted script can bring its own controls without us knowing its internals.
async function detectFromCode() {
  detecting.value = true
  managerMsg.value = 'Reading interface from code…'
  try {
    const pkgs = (editor.packages || '').split(',').map(s => s.trim()).filter(Boolean)
    const { schema, params } = await describeAnalysis(editor.code, pkgs, m => (managerMsg.value = m))
    if (params && Object.keys(params).length) editor.defaultsJson = JSON.stringify(params, null, 2)
    if (Array.isArray(schema) && schema.length) editor.schemaJson = JSON.stringify(schema, null, 2)
    managerMsg.value = schema || params
      ? 'Interface detected.'
      : 'No PARAMS/SCHEMA found — controls will be inferred from Default params.'
  } catch (err) {
    managerMsg.value = `Detect failed: ${err?.message || err}`
  } finally {
    detecting.value = false
  }
}
function seedTemplate() {
  editor.code = `# Paste your existing analysis below, then define analyze(files, params).
# Contract: analyze(files, params) -> {'columns': [...], 'rows': [...], 'traces': {name: {'t': [...], 's': [...]}}}
#   files  = [{'name': str, 'text': str}]   (the uploaded files)
#   params = your "Default params" dict (edit above)
#
# HARDCODED PATHS JUST WORK: any pd.read_csv("/…/CTI-117_Aalpha_4h.txt") or
# open(path) is auto-redirected to the uploaded file whose FILENAME matches — so
# you can paste notebook code with its own BASE/file_paths and only add analyze().
# glob("*.txt") and os.listdir() also see the uploads. Upload the files your code
# names.
import numpy as np
import pandas as pd

def read_chromatogram(path):
    # your existing reader — reads by path; the shim maps it to the upload
    df = pd.read_csv(path, sep='\\t', decimal=',', skiprows=43,
                     header=None, names=['time', 'step', 'signal'], usecols=[0, 1, 2])
    return df.apply(pd.to_numeric, errors='coerce').dropna()

def analyze(files, params):
    rows, traces = [], {}
    for f in files:
        df = read_chromatogram(f['name'])          # or your own file_paths list
        rows.append({'file': f['name'], 'max_signal': float(df['signal'].max())})
        traces[f['name']] = {'t': df['time'].tolist(), 's': df['signal'].tolist()}
    return {
        'columns': [{'key': 'file', 'label': 'File'}, {'key': 'max_signal', 'label': 'Max', 'unit': 'mAU'}],
        'rows': rows,
        'traces': traces,
    }
`
}
function editSet(s) {
  managerOpen.value = true
  Object.assign(editor, {
    id: s.id, name: s.name, scope: s.scope, runtime: s.runtime || 'pyodide',
    instrument: s.instrument || '', fileFormat: s.fileFormat || '', namingConvention: s.namingConvention || '',
    packages: s.packages || '', defaultsJson: JSON.stringify(s.defaults || {}, null, 2),
    schemaJson: s.paramsSchema ? JSON.stringify(s.paramsSchema, null, 2) : '', code: s.code || '',
  })
}
async function saveSet() {
  managerMsg.value = 'Saving…'
  try {
    const schema = safeJson(editor.schemaJson, null)
    const obj = {
      id: editor.id || ('aset_' + uuid()), kind: 'python', scope: editor.scope, runtime: editor.runtime,
      name: editor.name, instrument: editor.instrument, fileFormat: editor.fileFormat,
      namingConvention: editor.namingConvention, packages: editor.packages,
      defaults: safeJson(editor.defaultsJson, {}), code: editor.code,
      ...(Array.isArray(schema) && schema.length ? { paramsSchema: schema } : {}),
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
function uuid() { return globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2) }
async function loadCustom() {
  const items = await listItems()
  customSets.value = items.filter(i => i.kind === 'python')
  customPalettes.value = items.filter(i => i.kind === 'palette')
  customPresets.value = items.filter(i => i.kind === 'plot_preset')
}
onMounted(() => { loadSeqLibrary(); loadCustom() })
</script>

<style scoped>
.data-figures { max-width: 1100px; }
.df-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-bottom: 16px; }
.df-card h3 { margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
.df-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
.df-field { display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem; }
.df-field.grow { flex: 1; min-width: 180px; }
.df-field > span { font-weight: 600; opacity: 0.75; }
.df-field em { opacity: 0.6; font-style: normal; }
.df-meta { display: flex; flex-wrap: wrap; gap: 16px; font-size: 0.75rem; opacity: 0.75; margin: 10px 0; }
.df-params { margin-top: 12px; }
.df-param-group h4 { margin: 12px 0 6px; }
.df-param-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
/* Generic schema renderer: numbers/toggles flow inline; tables wrap to full width. */
.df-fields { display: flex; flex-wrap: wrap; gap: 12px 16px; align-items: flex-end; }
.df-fields > .df-field { min-width: 150px; }
.df-fields > .df-check.inline { flex-basis: 100%; }
.df-fields > .df-mini { flex: 1 1 100%; }
@media (min-width: 640px) { .df-fields > .df-mini { flex: 1 1 300px; } }
.df-fields > .df-fit { flex-basis: 100%; }

.df-check.inline { display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; }
.df-tables { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 12px; }
.df-mini { min-width: 220px; }
.df-mini.dim { opacity: 0.5; }
.df-mini-head { display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 0.78rem; margin-bottom: 4px; }
.df-table.compact th, .df-table.compact td { padding: 2px 4px; }
.df-table.compact input { width: 74px; padding: 4px; }
.df-fit { margin-top: 6px; font-size: 0.74rem; font-family: ui-monospace, monospace; opacity: 0.85; }

.df-drop { display: flex; align-items: center; justify-content: center; gap: 12px; border: 2px dashed var(--border); border-radius: var(--radius); padding: 18px; }
.df-drop i { font-size: 1.4rem; color: var(--primary); }
.df-filelist { margin-top: 10px; font-size: 0.8rem; }
.df-file-ok { color: #10b981; font-weight: 600; }
.df-file-skip { color: #f59e0b; margin-top: 6px; }
.df-file-skip ul { margin: 4px 0 0 20px; opacity: 0.8; }

.df-trust { display: flex; gap: 12px; margin-top: 14px; padding: 12px; border: 1px solid #f59e0b; border-radius: var(--radius); background: rgba(245, 158, 11, 0.08); font-size: 0.82rem; }
.df-trust > i { color: #f59e0b; font-size: 1.2rem; }
.df-check { display: block; margin-top: 8px; font-weight: 600; }
.df-code-view { max-height: 220px; overflow: auto; background: var(--input-bg); padding: 8px; border-radius: 6px; font-size: 0.72rem; }

.df-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
.df-btn { background: var(--input-bg); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 14px; cursor: pointer; font-weight: 600; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px; }
.df-btn.primary { background: var(--primary); color: #fff; border-color: var(--primary); }
.df-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.df-progress { font-size: 0.78rem; opacity: 0.8; }
.df-count { background: var(--primary); color: #fff; border-radius: 999px; padding: 1px 8px; font-size: 0.7rem; }
.df-chip { background: rgba(245, 158, 11, 0.18); color: #b45309; border-radius: 999px; padding: 1px 8px; font-size: 0.68rem; font-weight: 600; }

.df-table-wrap { overflow-x: auto; }
.df-table { border-collapse: collapse; width: 100%; font-size: 0.8rem; }
.df-table th, .df-table td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; }
.df-table th { background: var(--input-bg); }

.df-style { margin: 12px 0; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--input-bg); }
.df-toggles { display: flex; flex-wrap: wrap; gap: 14px; margin: 12px 0; }

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
.df-code-lg { min-height: 260px; }
.df-myset-list { margin-top: 10px; border-top: 1px solid var(--border); padding-top: 8px; }
.df-myset { display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.8rem; }
.df-myset-actions { display: flex; gap: 10px; }
.df-link { background: none; border: none; color: var(--primary); cursor: pointer; font-size: 0.78rem; padding: 0; }
.df-link.danger { color: #ef4444; }
</style>
