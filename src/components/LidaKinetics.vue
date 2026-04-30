<template>
  <div class="card">
    <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; border-bottom: 2px solid var(--bg); padding-bottom: 12px; margin-bottom: 15px;">
      <h2 style="border:none; padding:0; margin:0; display:flex; align-items:center; gap:10px;">
        <i class="fas fa-dna icon-muted"></i>
        <input
          type="text"
          v-model="dataset.name"
          placeholder="LIDA Kinetics Dataset"
          style="font-size:1.1rem; font-weight:700; color:var(--primary); border:none; border-bottom:2px solid var(--primary); background:transparent; padding:2px 0; min-width:240px;"
        />
      </h2>
      <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
        <label class="checkbox-label" style="font-size:0.75rem;">
          <input type="radio" v-model="dataset.scope" value="Personal" /> Personal
        </label>
        <label class="checkbox-label" style="font-size:0.75rem;">
          <input type="radio" v-model="dataset.scope" value="Global" /> Global
        </label>
        <button class="small success" @click="saveToCloud" :disabled="!store.user">
          <i class="fas fa-cloud-arrow-up"></i> Save
        </button>
        <button class="small secondary" @click="showLibrary = true">
          <i class="fas fa-folder-open"></i> Library
        </button>
        <button class="small secondary" @click="archiveDataset" v-if="dataset.id" title="Move to Archive">
          <i class="fas fa-box-archive"></i>
        </button>
        <button class="small danger" @click="newDataset" title="Start a fresh dataset">
          <i class="fas fa-file"></i> New
        </button>
      </div>
    </div>

    <div class="lida-layout">
      <!-- ════════════════ LEFT COLUMN ════════════════ -->
      <div class="lida-col">

        <!-- Import / Template -->
        <section class="lida-section">
          <h3><i class="fas fa-file-import icon-muted"></i> Import / Template</h3>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="small" @click="downloadTemplate">
              <i class="fas fa-download"></i> Download Template
            </button>
            <input ref="csvFileInput" type="file" accept=".csv,.tsv,.txt" style="display:none" @change="onCsvFileSelected" />
            <button class="small success" @click="$refs.csvFileInput.click()">
              <i class="fas fa-file-csv"></i> Import CSV
            </button>
            <button class="small danger" @click="clearAll" v-if="dataset.experiments.length">
              <i class="fas fa-trash"></i> Clear All
            </button>
          </div>
          <div v-if="parseError" class="lida-error">
            <i class="fas fa-triangle-exclamation"></i> {{ parseError }}
          </div>
          <div v-if="parseStats" class="lida-info">
            <i class="fas fa-circle-check"></i> {{ parseStats }}
          </div>
        </section>

        <!-- Units -->
        <section class="lida-section">
          <h3><i class="fas fa-ruler icon-muted"></i> Units &amp; Replication Limits</h3>
          <div class="grid-3-col">
            <div class="input-group">
              <label>T4-Ligase</label>
              <select v-model="dataset.units.ligase">
                <option value="µM">µM</option>
                <option value="mM">mM</option>
                <option value="U/µL">U/µL</option>
              </select>
            </div>
            <div class="input-group">
              <label>ATP</label>
              <select v-model="dataset.units.atp">
                <option value="µM">µM</option>
                <option value="mM">mM</option>
              </select>
            </div>
            <div class="input-group">
              <label>Mg²⁺</label>
              <select v-model="dataset.units.mg2">
                <option value="mM">mM</option>
                <option value="µM">µM</option>
              </select>
            </div>
          </div>
          <div class="grid-3-col" style="margin-top:8px;">
            <div class="input-group" title="Max yieldable [R] in µM (LIMIT_B in the notebook). 100 % conversion = limit_uM.">
              <label>limit_uM ([R]ₘₐₓ, µM)</label>
              <input type="number" step="any" min="0" v-model.number="dataset.kinetics.limit_uM" />
            </div>
            <div class="input-group" title="Initial [A] = [a] (µM). Default 2.8.">
              <label>A₀ (µM)</label>
              <input type="number" step="any" min="0" v-model.number="dataset.kinetics.A0" />
            </div>
            <div class="input-group" title="Initial [B] = [b] (µM). Default 1.4.">
              <label>B₀ (µM)</label>
              <input type="number" step="any" min="0" v-model.number="dataset.kinetics.B0" />
            </div>
          </div>
        </section>

        <!-- Condition Ranges -->
        <section class="lida-section">
          <h3><i class="fas fa-arrows-left-right-to-line icon-muted"></i> Condition Ranges (Active Learning)</h3>
          <div class="grid-2-col">
            <div class="range-group">
              <label>Temperature (°C)</label>
              <div class="range-inputs">
                <input type="number" step="any" v-model.number="dataset.config.ranges.tMin" placeholder="Min" />
                <input type="number" step="any" v-model.number="dataset.config.ranges.tMax" placeholder="Max" />
              </div>
            </div>
            <div class="range-group">
              <label>T4-Ligase ({{ dataset.units.ligase }})</label>
              <div class="range-inputs">
                <input type="number" step="any" v-model.number="dataset.config.ranges.ligaseMin" placeholder="Min" />
                <input type="number" step="any" v-model.number="dataset.config.ranges.ligaseMax" placeholder="Max" />
              </div>
            </div>
            <div class="range-group">
              <label>ATP ({{ dataset.units.atp }})</label>
              <div class="range-inputs">
                <input type="number" step="any" v-model.number="dataset.config.ranges.atpMin" placeholder="Min" />
                <input type="number" step="any" v-model.number="dataset.config.ranges.atpMax" placeholder="Max" />
              </div>
            </div>
            <div class="range-group">
              <label>Mg²⁺ ({{ dataset.units.mg2 }})</label>
              <div class="range-inputs">
                <input type="number" step="any" v-model.number="dataset.config.ranges.mg2Min" placeholder="Min" />
                <input type="number" step="any" v-model.number="dataset.config.ranges.mg2Max" placeholder="Max" />
              </div>
            </div>
          </div>
        </section>

        <!-- AL Config -->
        <section class="lida-section">
          <h3><i class="fas fa-wand-magic-sparkles icon-muted"></i> Suggestion Strategy</h3>
          <div class="grid-2-col">
            <div class="input-group">
              <label>Number of suggestions</label>
              <input type="number" min="1" max="96" v-model.number="dataset.config.nSuggestions" />
            </div>
            <div class="input-group">
              <label>Strategy</label>
              <div style="display:flex; gap:10px;">
                <label class="checkbox-label" style="font-size:0.8rem;">
                  <input type="radio" v-model="dataset.config.strategy" value="exploit" /> Exploit (max yield)
                </label>
                <label class="checkbox-label" style="font-size:0.8rem;">
                  <input type="radio" v-model="dataset.config.strategy" value="explore" /> Explore (uncertainty)
                </label>
              </div>
            </div>
          </div>
          <div class="input-group" style="margin-top:8px;">
            <label>Yield-threshold percentile for sequence logo (default 80%)</label>
            <input type="range" min="0" max="100" step="5" v-model.number="dataset.config.yieldThreshold" />
            <span style="font-size:0.8rem; opacity:0.7;">{{ dataset.config.yieldThreshold }}th percentile of max conversion</span>
          </div>
        </section>

        <!-- Action buttons -->
        <section class="lida-section">
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="action-btn auto-btn" @click="fitKinetics" :disabled="isFitting || !dataset.experiments.length">
              <i class="fas fa-chart-line"></i>
              {{ isFitting ? 'Fitting…' : 'Fit Kinetics' }}
            </button>
            <button class="action-btn auto-btn" @click="suggestNext" :disabled="isSuggesting || !dataset.experiments.length">
              <i class="fas fa-lightbulb"></i>
              {{ isSuggesting ? 'Computing…' : 'Suggest Next' }}
            </button>
            <button class="action-btn auto-btn" @click="predictSequence" :disabled="isPredicting || !dataset.experiments.length">
              <i class="fas fa-shuffle"></i>
              {{ isPredicting ? 'Predicting…' : 'Predict Sequences' }}
            </button>
          </div>
          <div v-if="backendError" class="lida-error" style="margin-top:8px;">
            <i class="fas fa-triangle-exclamation"></i> {{ backendError }}
          </div>
        </section>

        <!-- Ledger -->
        <section class="lida-section">
          <h3><i class="fas fa-list icon-muted"></i> Experiment Groups ({{ dataset.experiments.length }})</h3>
          <div class="ledger-wrap">
            <table class="ledger-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Sequence</th>
                  <th>T °C</th>
                  <th>Lig</th>
                  <th>ATP</th>
                  <th>Mg²⁺</th>
                  <th>Env</th>
                  <th>Pts</th>
                  <th>Rep</th>
                  <th>Max %</th>
                  <th>Fit</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(g, i) in dataset.experiments" :key="g.groupId">
                  <td>{{ i + 1 }}</td>
                  <td class="seq-cell" :title="g.sequence">{{ truncateSeq(g.sequence) }}</td>
                  <td>{{ formatNum(g.conditions.temperature) }}</td>
                  <td>{{ formatNum(g.conditions.ligase) }}</td>
                  <td>{{ formatNum(g.conditions.atp) }}</td>
                  <td>{{ formatNum(g.conditions.mg2) }}</td>
                  <td class="env-cell" :title="g.conditions.env">{{ g.conditions.env || '—' }}</td>
                  <td>{{ g.timeCourse.length }}</td>
                  <td>
                    <span v-if="replicateCount(g) > 1" style="font-weight:600; color:var(--primary);">{{ replicateCount(g) }}</span>
                    <span v-else style="opacity:0.35;">—</span>
                  </td>
                  <td><strong>{{ formatNum(g.maxConversion) }}</strong></td>
                  <td>
                    <span v-if="g.fit && g.fit.ku != null" :title="fitTooltip(g.fit)">
                      <i class="fas fa-check" style="color:var(--success);"></i>
                    </span>
                    <span v-else style="opacity:0.4;">—</span>
                  </td>
                  <td>
                    <button class="small danger" @click="removeGroup(i)" title="Remove group">
                      <i class="fas fa-times"></i>
                    </button>
                  </td>
                </tr>
                <tr v-if="!dataset.experiments.length">
                  <td colspan="12" style="text-align:center; opacity:0.5; padding:20px;">
                    No experiments yet. Download the template, fill it, and import.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- ════════════════ RIGHT COLUMN ════════════════ -->
      <div class="lida-col">

        <!-- Kinetic Curves -->
        <section class="lida-section">
          <h3><i class="fas fa-chart-line icon-muted"></i> Kinetic Curves</h3>
          <div ref="curvePlotEl" class="lida-plot"></div>
        </section>

        <!-- Condition Heatmap -->
        <section class="lida-section">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <h3 style="margin:0;"><i class="fas fa-fire icon-muted"></i> Condition Heatmap</h3>
            <div style="display:flex; gap:6px; align-items:center; font-size:0.8rem;">
              <label>X:</label>
              <select v-model="heatX" style="width:auto; padding:4px 8px;">
                <option value="temperature">Temperature</option>
                <option value="ligase">Ligase</option>
                <option value="atp">ATP</option>
                <option value="mg2">Mg²⁺</option>
              </select>
              <label>Y:</label>
              <select v-model="heatY" style="width:auto; padding:4px 8px;">
                <option value="temperature">Temperature</option>
                <option value="ligase">Ligase</option>
                <option value="atp">ATP</option>
                <option value="mg2">Mg²⁺</option>
              </select>
            </div>
          </div>
          <div ref="heatPlotEl" class="lida-plot"></div>
        </section>

        <!-- Sequence Logo -->
        <section class="lida-section">
          <h3><i class="fas fa-align-center icon-muted"></i> Sequence Logo (top {{ 100 - dataset.config.yieldThreshold }}%)</h3>
          <div v-if="logoWarning" class="lida-warn">
            <i class="fas fa-circle-info"></i> {{ logoWarning }}
          </div>
          <div ref="logoEl" class="logo-wrap" v-html="logoSvg"></div>
        </section>

        <!-- Suggestions -->
        <section class="lida-section" v-if="aiSuggestions.length">
          <h3><i class="fas fa-lightbulb icon-muted"></i> Suggested Next Experiments</h3>
          <div class="suggestions-list">
            <div v-for="(s, i) in aiSuggestions" :key="i" class="suggestion-card">
              <div class="sug-rank">#{{ i + 1 }}</div>
              <div class="sug-body">
                <div class="sug-seq" :title="s.sequence">{{ s.sequence }}</div>
                <div class="sug-cond">
                  T: {{ formatNum(s.conditions.temperature) }}°C ·
                  Lig: {{ formatNum(s.conditions.ligase) }} ·
                  ATP: {{ formatNum(s.conditions.atp) }} ·
                  Mg²⁺: {{ formatNum(s.conditions.mg2) }} ·
                  Env: {{ s.conditions.env }}
                </div>
                <div class="sug-pred">
                  Predicted: <strong>{{ formatNum(s.predicted_conversion) }}%</strong>
                  <span style="opacity:0.7;">± {{ formatNum(s.uncertainty) }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Sequence prediction -->
        <section class="lida-section" v-if="seqCandidates.length">
          <h3><i class="fas fa-shuffle icon-muted"></i> Predicted High-Yield Sequences</h3>
          <div class="suggestions-list">
            <div v-for="(c, i) in seqCandidates" :key="i" class="suggestion-card">
              <div class="sug-rank">#{{ i + 1 }}</div>
              <div class="sug-body">
                <div class="sug-seq">{{ c.sequence }}</div>
                <div class="sug-pred">
                  Predicted: <strong>{{ formatNum(c.predicted_conversion) }}%</strong>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- Cloud Library Modal -->
    <div v-if="showLibrary" class="lida-modal" @click.self="showLibrary = false">
      <div class="lida-modal-body">
        <div class="lida-modal-header">
          <h3 style="margin:0;"><i class="fas fa-folder-open"></i> LIDA Kinetics Library</h3>
          <button class="small" @click="showLibrary = false"><i class="fas fa-times"></i></button>
        </div>
        <div class="lida-modal-content">
          <div v-if="!libraryItems.length" style="text-align:center; opacity:0.6; padding:30px;">
            No saved datasets. Save the current dataset to populate the library.
          </div>
          <div v-for="item in libraryItems" :key="item.id" class="library-row">
            <div>
              <strong>{{ item.name || 'Untitled' }}</strong>
              <span class="lib-scope" :class="`scope-${item.scope?.toLowerCase()}`">{{ item.scope }}</span>
              <div style="font-size:0.75rem; opacity:0.7;">
                {{ item.experiments?.length || 0 }} groups
              </div>
            </div>
            <div style="display:flex; gap:6px;">
              <button class="small" @click="loadFromLibrary(item)"><i class="fas fa-download"></i> Open</button>
              <button class="small danger" @click="deleteFromLibrary(item)" v-if="item.owner_id === store.user?.id">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, reactive, computed, watch, nextTick } from 'vue'
import Plotly from 'plotly.js-dist-min'
import { useLabStore } from '../stores/labStore'
import { db } from '../services/supabase'
import { ENDPOINTS } from '../services/kineticsBackend'
import { esc } from '../utils/htmlSafe'

const store = useLabStore()

const BASES = ['A', 'C', 'G', 'T']
const BASE_COLORS = { A: '#10b981', C: '#3b82f6', G: '#f59e0b', T: '#ef4444' }

function emptyDataset() {
  return {
    id: null,
    name: '',
    scope: 'Personal',
    units: { ligase: 'mM', atp: 'mM', mg2: 'mM' },
    // Replication-kinetics initial conditions; defaults match the antimony model.
    kinetics: { limit_uM: 1.4, A0: 2.8, B0: 1.4 },
    experiments: [],
    config: {
      ranges: { tMin: 20, tMax: 50, ligaseMin: 0, ligaseMax: 10, atpMin: 0, atpMax: 10, mg2Min: 0, mg2Max: 20 },
      nSuggestions: 12,
      strategy: 'exploit',
      yieldThreshold: 80,
    },
    suggestions: [],
  }
}

const dataset = reactive(emptyDataset())
const parseError = ref('')
const parseStats = ref('')
const backendError = ref('')
const isFitting = ref(false)
const isSuggesting = ref(false)
const isPredicting = ref(false)

const aiSuggestions = ref([])
const seqCandidates = ref([])

const heatX = ref('temperature')
const heatY = ref('ligase')

const showLibrary = ref(false)

const csvFileInput = ref(null)
const curvePlotEl = ref(null)
const heatPlotEl = ref(null)
const logoEl = ref(null)
const logoSvg = ref('')
const logoWarning = ref('')

const libraryItems = computed(() => {
  const all = [...store.cloudKinetics, ...store.archivedKinetics]
  return all.filter(i => i.scope === 'Global' || i.owner_id === store.user?.id)
})

function formatNum(n) {
  if (n == null || isNaN(n)) return '—'
  return store.formatNum ? store.formatNum(n) : Number(n).toFixed(2)
}

function truncateSeq(s) {
  if (!s) return ''
  return s.length > 14 ? s.slice(0, 12) + '…' : s
}

function sci(n, p = 3) {
  if (n == null || isNaN(n)) return '—'
  const abs = Math.abs(n)
  if (abs === 0) return '0'
  if (abs < 1e-3 || abs >= 1e3) return Number(n).toExponential(p)
  return Number(n).toPrecision(p + 1)
}

function fitTooltip(fit) {
  if (!fit) return ''
  const parts = [
    `model: ${fit.model || '—'}`,
    `ku = ${sci(fit.ku)}`,
    `k1 = ${sci(fit.k1)}`,
    `k2 = ${sci(fit.k2)}`,
    `kr = ${sci(fit.kr)}`,
    `k_bg = ${sci(fit.k_bg)}`,
  ]
  if (fit.limit_uM != null) parts.push(`limit = ${fit.limit_uM} µM`)
  if (fit.seed_uM != null && fit.seed_uM > 0) parts.push(`seed = ${sci(fit.seed_uM)} µM`)
  return parts.join('\n')
}

function newDataset() {
  if (dataset.experiments.length && !confirm('Discard current dataset?')) return
  Object.assign(dataset, emptyDataset())
  aiSuggestions.value = []
  seqCandidates.value = []
  backendError.value = ''
  parseError.value = ''
  parseStats.value = ''
}

function clearAll() {
  if (!confirm('Remove all experiment groups from this dataset?')) return
  dataset.experiments = []
  aiSuggestions.value = []
  seqCandidates.value = []
}

function removeGroup(i) {
  dataset.experiments.splice(i, 1)
}

// ════════════════ CSV ════════════════

const TEMPLATE_HEADER = ['DNA-Sequence', 'Time', 'Conversion', 'T4-Ligase', 'ATP', 'Temperature', 'Environment', 'Mg2+', 'Replicate']

function downloadTemplate() {
  const rows = [
    TEMPLATE_HEADER.join(','),
    'GATCAGCTGATCAG,0,0,1,1,30,none,5,1',
    'GATCAGCTGATCAG,30,15,1,1,30,none,5,1',
    'GATCAGCTGATCAG,60,42,1,1,30,none,5,1',
    'GATCAGCTGATCAG,90,68,1,1,30,none,5,1',
    'GATCAGCTGATCAG,120,82,1,1,30,none,5,1',
    'GATCAGCTGATCAG,0,0,1,1,30,none,5,2',
    'GATCAGCTGATCAG,30,18,1,1,30,none,5,2',
    'GATCAGCTGATCAG,60,39,1,1,30,none,5,2',
    'GATCAGCTGATCAG,90,71,1,1,30,none,5,2',
    'GATCAGCTGATCAG,120,79,1,1,30,none,5,2',
    'TTACCGTACCGTAC,0,0,2,2,37,synthetic_cells,10,1',
    'TTACCGTACCGTAC,30,8,2,2,37,synthetic_cells,10,1',
    'TTACCGTACCGTAC,60,22,2,2,37,synthetic_cells,10,1',
  ]
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'lida-kinetics-template.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/)[0] || ''
  if (firstLine.includes('\t')) return '\t'
  if (firstLine.split(';').length > firstLine.split(',').length) return ';'
  return ','
}

function normalizeHeader(h) {
  return h.trim().toLowerCase().replace(/\s+/g, '').replace(/[-_]/g, '')
}

const HEADER_ALIASES = {
  dnasequence: 'sequence',
  sequence: 'sequence',
  time: 'time',
  timeminutes: 'time',
  timemin: 'time',
  conversion: 'conversion',
  conversionattimepoint: 'conversion',
  conversionpercent: 'conversion',
  t4ligase: 'ligase',
  t4dnaligase: 'ligase',
  ligase: 'ligase',
  ligaseconcentration: 'ligase',
  atp: 'atp',
  atpconcentration: 'atp',
  temperature: 'temperature',
  temperatur: 'temperature',
  temp: 'temperature',
  environment: 'env',
  environmentalconditions: 'env',
  env: 'env',
  'mg2+': 'mg2',
  mg2: 'mg2',
  mgconcentration: 'mg2',
  magnesium: 'mg2',
  replicate: 'replicate',
  replicateid: 'replicate',
  rep: 'replicate',
  repid: 'replicate',
  replicatenumber: 'replicate',
}

function onCsvFileSelected(e) {
  parseError.value = ''
  parseStats.value = ''
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = ev => {
    parseCsv(String(ev.target.result || ''))
    e.target.value = ''
  }
  reader.readAsText(file)
}

function groupKey(seq, c) {
  // Round numeric conditions to 6 d.p. to absorb CSV float-parse noise while
  // still treating any real difference as a distinct group. Two rows only share
  // a groupKey — and can therefore be replicates — when sequence AND every
  // condition are exactly the same.
  const r = n => Math.round(Number(n) * 1e6) / 1e6
  return `${seq}|T${r(c.temperature)}|L${r(c.ligase)}|A${r(c.atp)}|M${r(c.mg2)}|E${String(c.env || '').trim()}`
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) { parseError.value = 'CSV is empty.'; return }
  const delim = detectDelimiter(text)
  const rawHeader = lines[0].split(delim).map(h => h.replace(/^"|"$/g, ''))
  const headerKeys = rawHeader.map(h => HEADER_ALIASES[normalizeHeader(h)] || normalizeHeader(h))

  const required = ['sequence', 'time', 'conversion', 'ligase', 'atp', 'temperature', 'env', 'mg2']
  const missing = required.filter(r => !headerKeys.includes(r))
  if (missing.length) {
    parseError.value = `Missing columns: ${missing.join(', ')}. Download the template for the expected format.`
    return
  }

  const hasReplCol = headerKeys.includes('replicate')
  const idx = name => headerKeys.indexOf(name)
  const rows = []
  let badRows = 0
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delim).map(c => c.replace(/^"|"$/g, '').trim())
    if (cols.length < required.length) { badRows++; continue }
    const seq = String(cols[idx('sequence')] || '').toUpperCase()
    if (!/^[ACGT]+$/.test(seq)) { badRows++; continue }
    const time = parseFloat(cols[idx('time')])
    const conv = parseFloat(cols[idx('conversion')])
    if (isNaN(time) || time < 0) { badRows++; continue }
    if (isNaN(conv) || conv < 0 || conv > 100) { badRows++; continue }
    rows.push({
      sequence: seq,
      time,
      conversion: conv,
      replicateId: hasReplCol ? String(cols[idx('replicate')] || '1').trim() : null,
      conditions: {
        ligase: parseFloat(cols[idx('ligase')]) || 0,
        atp: parseFloat(cols[idx('atp')]) || 0,
        temperature: parseFloat(cols[idx('temperature')]) || 0,
        env: cols[idx('env')] || 'none',
        mg2: parseFloat(cols[idx('mg2')]) || 0,
      },
    })
  }

  if (!rows.length) { parseError.value = 'No valid rows found.'; return }

  // Auto-detect replicates (no Replicate column):
  // Two rows are replicates iff they share the EXACT same sequence, every condition,
  // AND the same time point — only conversion% differs. Anything else → different group.
  if (!hasReplCol) {
    const seenGroupTime = new Map()
    for (const r of rows) {
      const tRounded = Math.round(r.time * 1e6) / 1e6
      const tk = `${groupKey(r.sequence, r.conditions)}|||${tRounded}`
      const n = (seenGroupTime.get(tk) || 0) + 1
      seenGroupTime.set(tk, n)
      r.replicateId = String(n)
    }
    const anyMultiple = rows.some(r => r.replicateId !== '1')
    if (!anyMultiple) rows.forEach(r => { r.replicateId = '1' })
  }

  // Build per-group map, then per-replicate sub-map.
  const groupsByKey = new Map()
  const repsByKey = new Map()   // baseKey → Map<replicateId, [{time, conversion}]>

  for (const r of rows) {
    const key = groupKey(r.sequence, r.conditions)
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, {
        groupId: key,
        sequence: r.sequence,
        conditions: r.conditions,
        timeCourse: [],
        maxConversion: 0,
        fit: null,
      })
      repsByKey.set(key, new Map())
    }
    groupsByKey.get(key).timeCourse.push({ time: r.time, conversion: r.conversion })
    const repsMap = repsByKey.get(key)
    if (!repsMap.has(r.replicateId)) repsMap.set(r.replicateId, [])
    repsMap.get(r.replicateId).push({ time: r.time, conversion: r.conversion })
  }

  // Merge into existing dataset
  for (const [key, g] of groupsByKey) {
    g.timeCourse.sort((a, b) => a.time - b.time)
    g.maxConversion = Math.max(...g.timeCourse.map(p => p.conversion))

    const repsMap = repsByKey.get(key)
    if (repsMap.size > 1) {
      g.replicates = [...repsMap.entries()]
        .map(([repId, tc]) => ({
          replicateId: repId,
          timeCourse: tc.slice().sort((a, b) => a.time - b.time),
        }))
        .sort((a, b) => a.replicateId.localeCompare(b.replicateId, undefined, { numeric: true }))
    }

    const existingIdx = dataset.experiments.findIndex(e => e.groupId === key)
    if (existingIdx >= 0) dataset.experiments[existingIdx] = g
    else dataset.experiments.push(g)
  }

  const nRepGroups = [...groupsByKey.values()].filter(g => g.replicates?.length > 1).length
  parseStats.value = `Imported ${rows.length} rows into ${groupsByKey.size} group(s).`
  if (nRepGroups > 0) parseStats.value += ` ${nRepGroups} group(s) detected with multiple replicates.`
  if (badRows > 0) parseStats.value += ` Skipped ${badRows} invalid row(s).`
}

// ════════════════ Sequence logo (frontend) ════════════════

function computeLogo() {
  logoWarning.value = ''
  if (!dataset.experiments.length) { logoSvg.value = ''; return }

  const allMax = dataset.experiments.map(g => g.maxConversion).sort((a, b) => a - b)
  const cutIdx = Math.floor(allMax.length * dataset.config.yieldThreshold / 100)
  const cutoff = allMax[Math.min(cutIdx, allMax.length - 1)]
  const top = dataset.experiments.filter(g => g.maxConversion >= cutoff)

  if (!top.length) { logoSvg.value = ''; return }

  const maxLen = Math.max(...top.map(g => g.sequence.length))
  const lengths = new Set(top.map(g => g.sequence.length))
  if (lengths.size > 1) {
    logoWarning.value = `${top.length} sequences have ${lengths.size} different lengths; logo extends to longest (${maxLen}); shorter sequences excluded from later positions.`
  }

  const charW = 22
  const charH = 60
  const pad = { left: 28, top: 6, bottom: 18, right: 6 }
  const W = pad.left + maxLen * charW + pad.right
  const H = pad.top + charH + pad.bottom

  let body = ''
  body += `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + charH}" stroke="currentColor" stroke-width="0.8" opacity="0.5"/>`
  body += `<line x1="${pad.left}" y1="${pad.top + charH}" x2="${W - pad.right}" y2="${pad.top + charH}" stroke="currentColor" stroke-width="0.8" opacity="0.5"/>`
  body += `<text x="4" y="${pad.top + 6}" font-size="9" fill="currentColor" opacity="0.7">2.0</text>`
  body += `<text x="4" y="${pad.top + charH}" font-size="9" fill="currentColor" opacity="0.7">0</text>`
  body += `<text x="2" y="${pad.top + charH / 2 + 3}" font-size="9" fill="currentColor" opacity="0.7" transform="rotate(-90 6 ${pad.top + charH / 2 + 3})">bits</text>`

  for (let i = 0; i < maxLen; i++) {
    const counts = { A: 0, C: 0, G: 0, T: 0 }
    let total = 0
    for (const g of top) {
      if (i < g.sequence.length) {
        const b = g.sequence[i]
        if (counts[b] != null) { counts[b]++; total++ }
      }
    }
    if (!total) continue
    const probs = {}
    let H_entropy = 0
    for (const b of BASES) {
      probs[b] = counts[b] / total
      if (probs[b] > 0) H_entropy -= probs[b] * Math.log2(probs[b])
    }
    const IC = Math.max(0, 2 - H_entropy)

    const stack = BASES
      .map(b => ({ base: b, height: probs[b] * IC }))
      .filter(x => x.height > 0.001)
      .sort((a, b) => b.height - a.height)

    const xCenter = pad.left + i * charW + charW / 2
    let yCursor = pad.top + charH

    for (const item of stack) {
      const pxH = (item.height / 2) * charH
      yCursor -= pxH
      const sx = 1
      const sy = pxH / 14
      body += `<text x="${xCenter}" y="${yCursor + pxH - 1}" font-size="14" font-weight="700" font-family="monospace" text-anchor="middle" fill="${BASE_COLORS[item.base]}" transform="translate(${xCenter} ${yCursor + pxH - 1}) scale(${sx} ${sy}) translate(${-xCenter} ${-(yCursor + pxH - 1)})">${item.base}</text>`
    }

    body += `<text x="${xCenter}" y="${pad.top + charH + 12}" font-size="9" fill="currentColor" opacity="0.7" text-anchor="middle">${i + 1}</text>`
  }

  logoSvg.value = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%; max-width:${W}px;">${body}</svg>`
}

// ════════════════ Plotly: kinetic curves ════════════════

function plotLayoutDark(title) {
  const isDark = store.isDarkMode
  return {
    paper_bgcolor: isDark ? '#111827' : '#ffffff',
    plot_bgcolor: isDark ? '#111827' : '#ffffff',
    font: { color: isDark ? '#f3f4f6' : '#1f2937', size: 11 },
    margin: { l: 50, r: 20, b: 40, t: 30 },
    title: { text: title, font: { size: 12 } },
    xaxis: { gridcolor: isDark ? '#374151' : '#e5e7eb', zerolinecolor: isDark ? '#4b5563' : '#d1d5db' },
    yaxis: { gridcolor: isDark ? '#374151' : '#e5e7eb', zerolinecolor: isDark ? '#4b5563' : '#d1d5db' },
    legend: { orientation: 'h', y: -0.18, x: 0, font: { size: 9 } },
  }
}

function renderCurves() {
  if (!curvePlotEl.value) return
  if (!dataset.experiments.length) {
    Plotly.purge(curvePlotEl.value)
    return
  }

  const maxYield = Math.max(1, ...dataset.experiments.map(g => g.maxConversion))
  const traces = []
  dataset.experiments.forEach((g, i) => {
    const intensity = g.maxConversion / maxYield
    const r = Math.round(255 * (1 - intensity))
    const gC = Math.round(120 + 120 * intensity)
    const b = Math.round(40 + 60 * (1 - intensity))
    const color = `rgb(${r},${gC},${b})`
    const nRep = replicateCount(g)
    const label = nRep > 1
      ? `${truncateSeq(g.sequence)} (T${formatNum(g.conditions.temperature)}, n=${nRep})`
      : `${truncateSeq(g.sequence)} (T${formatNum(g.conditions.temperature)})`

    // Raw timepoints (markers only when a fit curve exists, otherwise lines+markers).
    const hasFitCurve = g.fit && Array.isArray(g.fit.simT) && g.fit.simT.length > 0
    traces.push({
      type: 'scatter',
      mode: hasFitCurve ? 'markers' : 'lines+markers',
      name: label,
      legendgroup: g.groupId,
      x: g.timeCourse.map(p => p.time),
      y: g.timeCourse.map(p => p.conversion),
      line: { color, width: 2 },
      marker: { size: 7, color, line: { width: 1, color: 'rgba(0,0,0,0.4)' } },
      hovertemplate: `<b>${esc(g.sequence)}</b><br>Time: %{x} min<br>Conv: %{y:.1f}%<extra></extra>`,
    })

    // Simulated replication-kinetics curve overlay.
    if (hasFitCurve) {
      traces.push({
        type: 'scatter',
        mode: 'lines',
        name: `${label} fit`,
        legendgroup: g.groupId,
        showlegend: false,
        x: g.fit.simT,
        y: g.fit.simY,
        line: { color, width: 2 },
        hovertemplate: `<b>fit</b><br>%{x:.0f} min · %{y:.1f}%<extra></extra>`,
      })
    }
  })

  const layout = plotLayoutDark('Conversion vs. Time')
  layout.xaxis.title = { text: 'Time (min)', font: { size: 10 } }
  layout.yaxis.title = { text: 'Conversion (%)', font: { size: 10 } }
  layout.yaxis.range = [0, 105]
  Plotly.react(curvePlotEl.value, traces, layout, { responsive: true, displayModeBar: false })
}

function renderHeatmap() {
  if (!heatPlotEl.value) return
  if (!dataset.experiments.length) {
    Plotly.purge(heatPlotEl.value)
    return
  }
  const xVals = dataset.experiments.map(g => g.conditions[heatX.value])
  const yVals = dataset.experiments.map(g => g.conditions[heatY.value])
  const z = dataset.experiments.map(g => g.maxConversion)

  const trace = {
    type: 'scatter',
    mode: 'markers',
    x: xVals,
    y: yVals,
    marker: {
      size: 14,
      color: z,
      colorscale: 'Viridis',
      cmin: 0,
      cmax: 100,
      colorbar: { title: { text: 'Max %', font: { size: 10 } }, thickness: 12 },
      line: { width: 1, color: 'rgba(0,0,0,0.4)' },
    },
    hovertemplate: `${heatX.value}: %{x}<br>${heatY.value}: %{y}<br>Max conv: %{marker.color:.1f}%<extra></extra>`,
  }
  const layout = plotLayoutDark(`Max Conversion by ${heatX.value} × ${heatY.value}`)
  layout.xaxis.title = { text: heatX.value, font: { size: 10 } }
  layout.yaxis.title = { text: heatY.value, font: { size: 10 } }
  Plotly.react(heatPlotEl.value, [trace], layout, { responsive: true, displayModeBar: false })
}

function renderAll() {
  computeLogo()
  nextTick(() => {
    renderCurves()
    renderHeatmap()
  })
}

// ════════════════ Helpers ════════════════

function interpLinear(t, y, tNew) {
  return tNew.map(tq => {
    if (tq <= t[0]) return y[0]
    if (tq >= t[t.length - 1]) return y[y.length - 1]
    let lo = 0, hi = t.length - 1
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t[mid] <= tq) lo = mid; else hi = mid }
    const frac = (tq - t[lo]) / (t[hi] - t[lo])
    return y[lo] + frac * (y[hi] - y[lo])
  })
}

// ════════════════ Backend calls ════════════════

async function callBackend(url, body) {
  backendError.value = ''
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      backendError.value = `Backend ${res.status}: ${res.statusText}. Frontend features still work; the LIDA backend may not be deployed yet.`
      return null
    }
    return await res.json()
  } catch (err) {
    backendError.value = `Backend unreachable: ${err.message}. Frontend features still work; the LIDA backend may not be deployed yet.`
    return null
  }
}

function replicateCount(g) {
  if (g.replicates?.length > 1) return g.replicates.length
  // Fall back: count max occurrences of any time value in the raw time course.
  const freq = new Map()
  for (const pt of g.timeCourse) freq.set(pt.time, (freq.get(pt.time) || 0) + 1)
  return Math.max(1, ...freq.values())
}

function meanTimeCourse(timeCourse) {
  const timeMap = new Map()
  for (const pt of timeCourse) {
    if (!timeMap.has(pt.time)) timeMap.set(pt.time, [])
    timeMap.get(pt.time).push(pt.conversion)
  }
  return [...timeMap.entries()]
    .map(([time, vals]) => ({ time, conversion: vals.reduce((a, b) => a + b, 0) / vals.length }))
    .sort((a, b) => a.time - b.time)
}

async function fitKinetics() {
  isFitting.value = true

  // Expand replicate groups into one entry per replicate for individual fitting.
  const REP_SEP = '|||rep'
  const flatExps = []
  for (const g of dataset.experiments) {
    if (g.replicates?.length > 1) {
      for (const rep of g.replicates) {
        flatExps.push({
          groupId: `${g.groupId}${REP_SEP}${rep.replicateId}`,
          sequence: g.sequence,
          conditions: g.conditions,
          timeCourse: rep.timeCourse,
        })
      }
    } else {
      // No replicates — deduplicate time points just in case.
      flatExps.push({ ...g, timeCourse: meanTimeCourse(g.timeCourse) })
    }
  }

  const result = await callBackend(ENDPOINTS.fit, {
    experiments: flatExps,
    limit_uM: dataset.kinetics.limit_uM,
    A0: dataset.kinetics.A0,
    B0: dataset.kinetics.B0,
  })
  isFitting.value = false
  if (!result) return

  const fitsById = Object.fromEntries((result.fits || []).map(f => [f.groupId, f]))

  for (const g of dataset.experiments) {
    if (g.replicates?.length > 1) {
      // Collect individual replicate fits that succeeded.
      const repFits = g.replicates
        .map(rep => fitsById[`${g.groupId}${REP_SEP}${rep.replicateId}`])
        .filter(f => f?.ku != null && f.simT?.length > 0)
      if (!repFits.length) continue

      // Average simulated curves on a shared time grid.
      const tMax = Math.max(...repFits.map(f => Math.max(...f.simT)))
      const simT = Array.from({ length: 100 }, (_, i) => (i / 99) * tMax)
      const allY = repFits.map(f => interpLinear(f.simT, f.simY, simT))
      const simY = simT.map((_, i) => allY.reduce((s, y) => s + y[i], 0) / allY.length)

      // Tooltip uses the lowest-cost replicate's parameters.
      const bestFit = repFits.reduce((a, b) => ((a.cost ?? Infinity) < (b.cost ?? Infinity) ? a : b))
      g.fit = { ...bestFit, simT, simY, replicateCount: repFits.length }
    } else {
      const f = fitsById[g.groupId]
      if (f) g.fit = f
    }
  }
}

async function suggestNext() {
  isSuggesting.value = true
  const result = await callBackend(ENDPOINTS.suggest, {
    experiments: dataset.experiments,
    ranges: dataset.config.ranges,
    nSuggestions: dataset.config.nSuggestions,
    strategy: dataset.config.strategy,
  })
  isSuggesting.value = false
  if (result) aiSuggestions.value = result.suggestions || []
}

async function predictSequence() {
  isPredicting.value = true
  const top = dataset.experiments.reduce((a, b) => a.maxConversion > b.maxConversion ? a : b, dataset.experiments[0])
  const result = await callBackend(ENDPOINTS.sequencePredict, {
    experiments: dataset.experiments,
    fixedConditions: top?.conditions || null,
    topK: 5,
  })
  isPredicting.value = false
  if (result) seqCandidates.value = result.candidates || []
}

// ════════════════ Cloud persistence ════════════════

async function saveToCloud() {
  if (!store.user) return
  if (!dataset.id) dataset.id = `lida-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const payload = {
    id: dataset.id,
    name: dataset.name || 'Untitled LIDA Dataset',
    scope: dataset.scope,
    units: dataset.units,
    kinetics: dataset.kinetics,
    experiments: dataset.experiments,
    config: dataset.config,
    suggestions: aiSuggestions.value,
  }
  await store.saveToCloud('kinetics_data', payload)
}

async function loadFromLibrary(item) {
  const fresh = emptyDataset()
  const loaded = JSON.parse(JSON.stringify(item))
  // Backfill any missing top-level keys (e.g., `kinetics` for datasets saved
  // before the replication-model fit was wired up).
  for (const k of Object.keys(fresh)) {
    if (loaded[k] == null) loaded[k] = fresh[k]
  }
  loaded.kinetics = { ...fresh.kinetics, ...(loaded.kinetics || {}) }
  Object.assign(dataset, loaded)
  showLibrary.value = false
  aiSuggestions.value = item.suggestions || []
  seqCandidates.value = []
}

async function deleteFromLibrary(item) {
  if (!confirm(`Delete "${item.name}" permanently?`)) return
  await store.deleteFromCloud('kinetics_data', item.id)
}

async function archiveDataset() {
  if (!dataset.id) return
  if (!confirm('Move this dataset to Archive?')) return
  dataset.scope = 'Archived'
  await saveToCloud()
}

// ════════════════ Mount ════════════════

watch(() => [dataset.experiments, dataset.config.yieldThreshold, heatX.value, heatY.value, store.isDarkMode], renderAll, { deep: true })

onMounted(() => {
  nextTick(renderAll)
})

onBeforeUnmount(() => {
  if (curvePlotEl.value) Plotly.purge(curvePlotEl.value)
  if (heatPlotEl.value) Plotly.purge(heatPlotEl.value)
})
</script>

<style scoped>
.lida-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}
@media (max-width: 1024px) {
  .lida-layout { grid-template-columns: 1fr; }
}
.lida-col { display: flex; flex-direction: column; gap: 15px; min-width: 0; }

.lida-section {
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
}
.lida-section h3 {
  font-size: 0.95rem;
  color: var(--primary);
  margin: 0 0 10px 0;
  display: flex; align-items: center; gap: 8px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 6px;
}

.grid-2-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.grid-3-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }

.range-group label { font-size: 0.75rem; font-weight: 600; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.4px; display: block; margin-bottom: 4px; }
.range-inputs { display: flex; gap: 6px; }
.range-inputs input { flex: 1; min-width: 0; }

.lida-error {
  background: var(--danger-bg);
  color: var(--danger);
  border: 1px solid var(--danger);
  border-radius: var(--radius);
  padding: 8px 10px;
  margin-top: 8px;
  font-size: 0.8rem;
  display: flex; align-items: center; gap: 8px;
}
.lida-info {
  background: color-mix(in srgb, var(--success) 12%, transparent);
  color: var(--success);
  border: 1px solid var(--success);
  border-radius: var(--radius);
  padding: 8px 10px;
  margin-top: 8px;
  font-size: 0.8rem;
  display: flex; align-items: center; gap: 8px;
}
.lida-warn {
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  color: var(--primary);
  border: 1px solid var(--primary);
  border-radius: var(--radius);
  padding: 6px 10px;
  margin-bottom: 8px;
  font-size: 0.75rem;
  display: flex; align-items: center; gap: 8px;
}

.action-btn {
  padding: 8px 12px;
  border-radius: 6px;
  border: none;
  font-weight: 600;
  font-size: 0.8rem;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: filter 0.18s;
}
.action-btn:hover:not(:disabled) { filter: brightness(0.92); }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.auto-btn { background: var(--primary); color: #fff; }

.ledger-wrap { max-height: 320px; overflow: auto; border: 1px solid var(--border); border-radius: var(--radius); }
.ledger-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
.ledger-table th { position: sticky; top: 0; background: var(--input-bg); z-index: 1; padding: 6px 8px; text-align: left; border-bottom: 1px solid var(--border); font-weight: 700; opacity: 0.85; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.4px; }
.ledger-table td { padding: 6px 8px; border-bottom: 1px solid var(--border); }
.seq-cell { font-family: monospace; font-size: 0.75rem; }
.env-cell { font-size: 0.75rem; opacity: 0.85; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.lida-plot { width: 100%; height: 280px; border: 1px solid var(--border); border-radius: var(--radius); }

.logo-wrap { width: 100%; overflow-x: auto; padding: 8px 0; color: var(--text); }
.logo-wrap svg { display: block; }

.suggestions-list { display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow-y: auto; }
.suggestion-card {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--input-bg);
  font-size: 0.8rem;
}
.sug-rank { font-weight: 700; color: var(--primary); min-width: 24px; }
.sug-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sug-seq { font-family: monospace; font-size: 0.78rem; word-break: break-all; }
.sug-cond { font-size: 0.72rem; opacity: 0.75; }
.sug-pred { font-size: 0.78rem; }

.lida-modal {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 2000;
}
.lida-modal-body {
  background: var(--surface);
  border-radius: var(--radius);
  width: 92%;
  max-width: 720px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.lida-modal-header {
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  display: flex; justify-content: space-between; align-items: center;
}
.lida-modal-content { padding: 14px 18px; overflow-y: auto; }

.library-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-bg);
  margin-bottom: 8px;
}
.lib-scope {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.7rem;
  margin-left: 6px;
  background: var(--summary-bg);
  border: 1px solid var(--border);
}
.scope-global { background: color-mix(in srgb, var(--success) 18%, transparent); border-color: var(--success); }
.scope-personal { background: color-mix(in srgb, var(--primary) 12%, transparent); border-color: var(--primary); }

.icon-muted { opacity: 0.65; }
</style>
