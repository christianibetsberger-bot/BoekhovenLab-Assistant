<template>
  <div class="card module-card" @click="activeDropdown = null">
    <div class="full-width-header">
      <h2 style="display: flex; align-items: center; gap: 10px;">
        <i class="fas fa-microscope"></i> Active Learning Phase Predictor
      </h2>
      <p style="font-size: 0.85rem; opacity: 0.8; margin-top: 5px;">
        Map your chemical phase space using smart experimental design.
      </p>
    </div>

    <div class="predictor-internal-grid">
      
      <div class="internal-section">
        <h3>1. Search Space & Inventory Config</h3>
        <p style="font-size: 0.8rem; opacity: 0.7; margin-bottom: 10px;">
          Assign inventory stocks to the ternary coordinates.
        </p>
        
        <div class="config-grid-complex">
          <div class="input-group">
            <label>Component A (Anion)</label>
            <div style="display: flex; gap: 5px; align-items: flex-end;">
              <div style="flex: 2; position: relative;" @click.stop>
                <div 
                  @click="activeDropdown = activeDropdown === 'anion' ? null : 'anion'" 
                  class="inventory-select-box"
                >
                  <span class="truncate-text">{{ config.anionName || 'Search inventory...' }}</span>
                  <i class="fas fa-search" style="font-size: 0.7rem; opacity: 0.5;"></i>
                </div>
                <div v-if="activeDropdown === 'anion'" class="inventory-dropdown">
                  <div class="dropdown-scope-selector">
                    <label class="checkbox-label"><input type="radio" value="Global" v-model="config.anionSearchScope"> Global</label>
                    <label class="checkbox-label"><input type="radio" value="Personal" v-model="config.anionSearchScope"> Personal</label>
                  </div>
                  <div class="dropdown-search">
                    <input type="text" v-model="config.anionSearchQuery" placeholder="Filter inventory..." @click.stop>
                    <button class="small" @click="config.anionName = config.anionSearchQuery; activeDropdown = null; renderPlot()">Use Text</button>
                  </div>
                  <div class="dropdown-results">
                    <div 
                      v-for="inv in filterBlockInventory(config.anionSearchQuery, config.anionSearchScope)" 
                      :key="inv.id" 
                      class="dropdown-item"
                      @mousedown.prevent="config.anionName = '[' + inv.code + '] ' + inv.name; activeDropdown = null; renderPlot()"
                    >
                      [{{ inv.code }}] {{ inv.name }}
                    </div>
                  </div>
                </div>
              </div>
              <input type="number" v-model="config.anionMax" @change="renderPlot" style="flex: 0.8;" title="Max Concentration (mM)" placeholder="Max mM" />
            </div>
          </div>
          
          <div class="input-group">
            <label>Component B (Cation)</label>
            <div style="display: flex; gap: 5px; align-items: flex-end;">
              <div style="flex: 2; position: relative;" @click.stop>
                <div 
                  @click="activeDropdown = activeDropdown === 'cation' ? null : 'cation'" 
                  class="inventory-select-box"
                >
                  <span class="truncate-text">{{ config.cationName || 'Search inventory...' }}</span>
                  <i class="fas fa-search" style="font-size: 0.7rem; opacity: 0.5;"></i>
                </div>
                <div v-if="activeDropdown === 'cation'" class="inventory-dropdown">
                  <div class="dropdown-scope-selector">
                    <label class="checkbox-label"><input type="radio" value="Global" v-model="config.cationSearchScope"> Global</label>
                    <label class="checkbox-label"><input type="radio" value="Personal" v-model="config.cationSearchScope"> Personal</label>
                  </div>
                  <div class="dropdown-search">
                    <input type="text" v-model="config.cationSearchQuery" placeholder="Filter inventory..." @click.stop>
                    <button class="small" @click="config.cationName = config.cationSearchQuery; activeDropdown = null; renderPlot()">Use Text</button>
                  </div>
                  <div class="dropdown-results">
                    <div 
                      v-for="inv in filterBlockInventory(config.cationSearchQuery, config.cationSearchScope)" 
                      :key="inv.id" 
                      class="dropdown-item"
                      @mousedown.prevent="config.cationName = '[' + inv.code + '] ' + inv.name; activeDropdown = null; renderPlot()"
                    >
                      [{{ inv.code }}] {{ inv.name }}
                    </div>
                  </div>
                </div>
              </div>
              <input type="number" v-model="config.cationMax" @change="renderPlot" style="flex: 0.8;" title="Max Concentration (mM)" placeholder="Max mM" />
            </div>
          </div>
          
          <div class="input-group">
            <label>Component C (Salt/Buffer)</label>
            <div style="display: flex; gap: 5px; align-items: flex-end;">
              <div style="flex: 2; position: relative;" @click.stop>
                <div 
                  @click="activeDropdown = activeDropdown === 'salt' ? null : 'salt'" 
                  class="inventory-select-box"
                >
                  <span class="truncate-text">{{ config.saltName || 'Search inventory...' }}</span>
                  <i class="fas fa-search" style="font-size: 0.7rem; opacity: 0.5;"></i>
                </div>
                <div v-if="activeDropdown === 'salt'" class="inventory-dropdown">
                  <div class="dropdown-scope-selector">
                    <label class="checkbox-label"><input type="radio" value="Global" v-model="config.saltSearchScope"> Global</label>
                    <label class="checkbox-label"><input type="radio" value="Personal" v-model="config.saltSearchScope"> Personal</label>
                  </div>
                  <div class="dropdown-search">
                    <input type="text" v-model="config.saltSearchQuery" placeholder="Filter inventory..." @click.stop>
                    <button class="small" @click="config.saltName = config.saltSearchQuery; activeDropdown = null; renderPlot()">Use Text</button>
                  </div>
                  <div class="dropdown-results">
                    <div 
                      v-for="inv in filterBlockInventory(config.saltSearchQuery, config.saltSearchScope)" 
                      :key="inv.id" 
                      class="dropdown-item"
                      @mousedown.prevent="config.saltName = '[' + inv.code + '] ' + inv.name; activeDropdown = null; renderPlot()"
                    >
                      [{{ inv.code }}] {{ inv.name }}
                    </div>
                  </div>
                </div>
              </div>
              <input type="number" v-model="config.saltMax" @change="renderPlot" style="flex: 0.8;" title="Max Concentration (mM)" placeholder="Max mM" />
            </div>
          </div>
        </div>

        <h3 class="mt-4">2. Experiment Ledger</h3>
        <div class="ledger-table-container">
          <table class="ledger-table">
            <thead>
              <tr>
                <th>A (mM)</th>
                <th>B (mM)</th>
                <th>C (mM)</th>
                <th>Result</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(exp, index) in experiments" :key="exp.id || index">
                <td><input type="number" v-model="exp.anion" @change="updateExperiment(exp)" class="small-input" /></td>
                <td><input type="number" v-model="exp.cation" @change="updateExperiment(exp)" class="small-input" /></td>
                <td><input type="number" v-model="exp.salt" @change="updateExperiment(exp)" class="small-input" /></td>
                <td>
                  <select 
                    v-model="exp.phase" 
                    @change="updateExperiment(exp)" 
                    class="small-select" 
                    :class="{'bg-green-hit': exp.phase === 1, 'bg-red-miss': exp.phase === 0}"
                  >
                    <option :value="-1">Untested</option>
                    <option :value="0">Clear</option>
                    <option :value="1">Coacervate</option>
                  </select>
                </td>
                <td>
                  <button class="clear-btn" @click="removeRow(index, exp)" title="Remove Row">
                    <i class="fas fa-trash"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <button class="small mt-2" @click="addManualRow">
            <i class="fas fa-plus"></i> Add Manual Data Point
          </button>
        </div>
      </div>

      <div class="internal-section full-width-section" style="display: flex; flex-direction: column;">
        <h3>Phase Map (3D Space)</h3>
        <div class="plot-area">
          <div id="phase-ternary-plot" style="width: 100%; height: 100%;"></div>
        </div>
      </div>

      <div class="internal-section">
        <h3>3. Active Learning Engine</h3>
        <p class="engine-desc" style="font-size: 0.85rem; opacity: 0.8; margin-bottom: 20px;">
          Define phase boundaries with automated suggestions.
        </p>
        
        <div class="engine-actions-grid">
          <button class="action-btn auto-btn" @click="calculateNextExperiments" :disabled="isCalculating">
            <i class="fas" :class="isCalculating ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'"></i>
            <span>{{ isCalculating ? 'Calculating...' : 'Auto-Suggest' }}</span>
          </button>

          <button class="action-btn import-btn" @click="triggerFileInput">
            <i class="fas fa-file-csv"></i>
            <span>Import CSV</span>
          </button>
          <input type="file" ref="csvInput" accept=".csv" style="display: none" @change="handleFileUpload" />
        </div>

        <div v-if="importedFileName" class="imported-file-badge">
          <div class="flex-between">
            <span class="truncate-text"><i class="fas fa-file-csv"></i> {{ importedFileName }}</span>
            <button class="clear-btn" @click="clearImport" title="Clear Import"><i class="fas fa-times"></i></button>
          </div>
          <div style="font-size: 0.7rem; margin-top: 4px; opacity: 0.8;">{{ totalImportedCount }} coordinates loaded.</div>
        </div>

        <div class="suggestions-container" v-if="suggestions.length > 0">
          <h4 class="priority-label">Next Priority Experiments:</h4>
          <div class="suggestion-card" v-for="(sug, index) in suggestions" :key="index">
            <div class="sug-data">
              <div class="sug-id" v-if="sug.sampleId">ID: {{ sug.sampleId }}</div>
              <strong>A:</strong> {{ sug.anion }} | <strong>B:</strong> {{ sug.cation }} | <strong>C:</strong> {{ sug.salt }}
              <div v-if="sug.phase === 1" class="sug-hit-badge">HIT DETECTED IN FILE</div>
            </div>
            <button class="small success-btn" @click="importSuggestion(sug)">
              <i class="fas fa-save"></i> Log Result
            </button>
          </div>
        </div>
      </div>

      <div class="internal-section full-width-section" v-if="combinedPlateData.length > 0">
        <h3>4. Wet Lab Mapping: 96-Well Plate View</h3>
        <p style="font-size: 0.8rem; opacity: 0.7; margin-bottom: 15px;">
          Sorted by Sample ID. <span style="color: #10b981; font-weight: bold;">Green = Hit</span>, 
          <span style="color: #ef4444; font-weight: bold;">Red = Miss</span>, 
          <span style="color: #3b82f6; font-weight: bold;">Blue = Target</span>.
        </p>

        <div class="well-plate-wrapper">
          <div class="well-plate">
            <div class="plate-header-row">
              <div class="plate-corner"></div>
              <div class="plate-col-labels">
                <div v-for="c in 12" :key="'col'+c" class="col-label">{{ c }}</div>
              </div>
            </div>
            
            <div v-for="(rowLabel, rIndex) in plateRows" :key="'row'+rIndex" class="plate-row-wrapper">
              <div class="row-label">{{ rowLabel }}</div>
              <div class="plate-row">
                <div 
                  v-for="cIndex in 12" 
                  :key="'well'+rIndex+'-'+cIndex"
                  class="well"
                  :class="getWellStatusClass(rIndex, cIndex - 1)"
                  :title="getWellTooltip(rIndex, cIndex - 1)"
                >
                  <span class="well-id">{{ getWellSample(rIndex, cIndex - 1)?.sampleId || '' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { db } from '../services/supabase'
import { useLabStore } from '../stores/labStore'
import Plotly from 'plotly.js-dist-min'

const store = useLabStore()
const activeDropdown = ref(null)

// --- State ---
const config = ref({ 
  anionName: 'Compound A', anionMax: 6, anionSearchQuery: '', anionSearchScope: 'Global',
  cationName: 'Compound B', cationMax: 6, cationSearchQuery: '', cationSearchScope: 'Global',
  saltName: 'Compound C', saltMax: 200, saltSearchQuery: '', saltSearchScope: 'Global'
})

const experiments = ref([])
const suggestions = ref([])
const isCalculating = ref(false)
const csvInput = ref(null)

const plateRows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const importedFileName = ref('')
const totalImportedCount = ref(0)

// --- Helper: Filter Inventory ---
const filterBlockInventory = (query, scope) => {
    const term = query ? query.toLowerCase() : '';
    const targetScope = scope || 'Global';
    return store.inventory.filter(item => 
        (item.scope === targetScope || (!item.scope && targetScope === 'Global')) &&
        ((!term) || (item.name && item.name.toLowerCase().includes(term)) || (item.code && item.code.toLowerCase().includes(term)))
    );
}

// --- Plate Logic ---
const combinedPlateData = computed(() => {
  const all = [...experiments.value, ...suggestions.value]
  const map = new Map();
  all.forEach(item => map.set(item.sampleId, item));
  return Array.from(map.values()).sort((a, b) => Number(a.sampleId) - Number(b.sampleId));
})

const getWellSample = (rIndex, cIndex) => {
  const linearIndex = rIndex * 12 + cIndex
  return combinedPlateData.value[linearIndex] || null
}

const getWellStatusClass = (r, c) => {
  const sample = getWellSample(r, c)
  if (!sample) return ''
  if (sample.phase === 1) return 'phase-hit'
  if (sample.phase === 0) return 'phase-miss'
  return 'phase-target'
}

const getWellTooltip = (r, c) => {
  const s = getWellSample(r, c)
  if (!s) return 'Empty Well'
  const status = s.phase === 1 ? 'HIT' : (s.phase === 0 ? 'CLEAR' : 'AI TARGET')
  return `ID: ${s.sampleId} [${status}]\nA: ${s.anion} | B: ${s.cation} | C: ${s.salt}`
}

// --- Plotly Renderer ---
const renderPlot = () => {
  const plotDiv = document.getElementById('phase-ternary-plot')
  if (!plotDiv) return

  const traceCoacervate = { 
    type: 'scatter3d', mode: 'markers', x: [], y: [], z: [], text: [], 
    name: 'Hit (1)', marker: { color: '#10b981', size: 6, symbol: 'circle', line: { color: '#064e3b', width: 1 } } 
  }
  const traceClear = { 
    type: 'scatter3d', mode: 'markers', x: [], y: [], z: [], text: [], 
    name: 'Clear (0)', marker: { color: '#ef4444', size: 4, symbol: 'circle', line: { color: '#7f1d1d', width: 1 } } 
  }
  const traceUnknown = { 
    type: 'scatter3d', mode: 'markers', x: [], y: [], z: [], text: [], 
    name: 'Untested', marker: { color: '#94a3b8', size: 3, symbol: 'circle' } 
  }
  const traceTarget = { 
    type: 'scatter3d', mode: 'markers', x: [], y: [], z: [], text: [], 
    name: 'Target', marker: { color: '#3b82f6', size: 5, symbol: 'cross', line: { color: '#1e3a8a', width: 1 } } 
  }

  const allData = [...experiments.value, ...suggestions.value]

  allData.forEach(exp => {
    const label = `ID: ${exp.sampleId || 'Manual'} | A: ${exp.anion} | B: ${exp.cation} | C: ${exp.salt}`
    
    if (exp.phase === 1) { 
        traceCoacervate.x.push(exp.anion); traceCoacervate.y.push(exp.cation); traceCoacervate.z.push(exp.salt); traceCoacervate.text.push(label) 
    } else if (exp.phase === 0) { 
        traceClear.x.push(exp.anion); traceClear.y.push(exp.cation); traceClear.z.push(exp.salt); traceClear.text.push(label) 
    } else if (exp.sampleId > 0 && !experiments.value.some(e => e.sampleId === exp.sampleId)) {
        traceTarget.x.push(exp.anion); traceTarget.y.push(exp.cation); traceTarget.z.push(exp.salt); traceTarget.text.push(label)
    } else {
        traceUnknown.x.push(exp.anion); traceUnknown.y.push(exp.cation); traceUnknown.z.push(exp.salt); traceUnknown.text.push(label)
    }
  })

  const layout = {
    scene: {
      xaxis: { title: config.value.anionName + ' (mM)', backgroundcolor: "#000000", gridcolor: "#444444", showbackground: true, zerolinecolor: "#888888", tickfont: { color: '#dddddd' }, titlefont: { color: '#ffffff' } },
      yaxis: { title: config.value.cationName + ' (mM)', backgroundcolor: "#000000", gridcolor: "#444444", showbackground: true, zerolinecolor: "#888888", tickfont: { color: '#dddddd' }, titlefont: { color: '#ffffff' } },
      zaxis: { title: config.value.saltName + ' (mM)', backgroundcolor: "#000000", gridcolor: "#444444", showbackground: true, zerolinecolor: "#888888", tickfont: { color: '#dddddd' }, titlefont: { color: '#ffffff' } }
    },
    paper_bgcolor: '#000000',
    margin: { l: 0, r: 0, b: 0, t: 0 },
    showlegend: true,
    legend: { orientation: "h", y: 0.05, x: 0.5, xanchor: 'center', font: { color: '#ffffff' } }
  }

  Plotly.react('phase-ternary-plot', [traceCoacervate, traceClear, traceUnknown, traceTarget], layout, { displayModeBar: false, responsive: true })
}

watch([experiments, suggestions, config], () => { renderPlot() }, { deep: true })

// --- Logic ---
const fetchExperiments = async () => {
  const { data, error } = await db.from('phase_data').select('*')
  if (!error && data) { experiments.value = data; renderPlot() }
}

const updateExperiment = async (exp) => {
  if(!exp.id) { renderPlot(); return }
  await db.from('phase_data').update({ phase: exp.phase, anion: exp.anion, cation: exp.cation, salt: exp.salt }).eq('id', exp.id); renderPlot()
}

const addManualRow = () => { experiments.value.push({ sampleId: Math.floor(Math.random() * 500), anion: 0, cation: 0, salt: 0, phase: -1 }) }

const removeRow = async (index, exp) => {
  experiments.value.splice(index, 1);
  if (exp.id) {
    await db.from('phase_data').delete().eq('id', exp.id);
  }
  renderPlot();
}

const importSuggestion = async (sug) => {
  const { data, error } = await db.from('phase_data').insert([{ sampleId: sug.sampleId, anion: sug.anion, cation: sug.cation, salt: sug.salt, phase: sug.phase }]).select()
  if(!error && data) { 
    experiments.value.push(data[0]); 
    suggestions.value = suggestions.value.filter(s => s.sampleId !== sug.sampleId); 
    if(suggestions.value.length === 0) clearImport() 
  }
}

const triggerFileInput = () => { if (csvInput.value) csvInput.value.click() }

const handleFileUpload = (event) => {
  const file = event.target.files[0]; if (!file) return;
  importedFileName.value = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result; const lines = text.split('\n').filter(line => line.trim() !== '');
    const newSuggestions = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length >= 4) { 
          const phaseVal = parseInt(cols[4]);
          newSuggestions.push({ 
              sampleId: parseInt(cols[0], 10), 
              anion: Number(parseFloat(cols[1]).toFixed(2)), 
              cation: Number(parseFloat(cols[2]).toFixed(2)), 
              salt: Number(parseFloat(cols[3]).toFixed(1)), 
              phase: isNaN(phaseVal) ? -1 : phaseVal 
          }) 
      }
    }
    totalImportedCount.value = newSuggestions.length; suggestions.value = newSuggestions; event.target.value = '';
  }
  reader.readAsText(file)
}

const clearImport = () => { importedFileName.value = ''; totalImportedCount.value = 0; suggestions.value = [] }

// --- INTEGRATED GP ACTIVE LEARNING CALL ---
const calculateNextExperiments = async () => {
  isCalculating.value = true; 
  clearImport();
  
  try {
    const response = await fetch('https://experiment-backend-s71q.onrender.com/api/suggest-experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: config.value,
        experiments: experiments.value
      })
    });
    
    if (!response.ok) throw new Error('Backend responded with an error.');
    
    const data = await response.json();
    suggestions.value = data.suggestions;
    
  } catch (err) {
    console.error("Active Learning Engine failed:", err);
    alert("Could not connect to the Python Active Learning engine. Ensure the backend is running.");
  } finally {
    isCalculating.value = false;
  }
}

onMounted(() => {
  fetchExperiments()
  nextTick(() => { renderPlot() })
})
</script>

<style scoped>
/* All CSS remains completely unchanged */
.module-card { display: flex; flex-direction: column; gap: 15px; }
.predictor-internal-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
.internal-section h3 { font-size: 1.1rem; border-bottom: 1px solid var(--border-color, #e2e8f0); padding-bottom: 8px; margin-bottom: 15px; color: var(--primary, #3b82f6); }
.full-width-section { grid-column: 1 / -1; }

.config-grid-complex { display: grid; grid-template-columns: 1fr; gap: 12px; }
.input-group label { display: block; font-size: 0.85rem; margin-bottom: 4px; font-weight: bold; opacity: 0.8; }
.input-group input { width: 100%; padding: 7px; border-radius: 6px; border: 1px solid var(--border-color, #cbd5e1); background: transparent; color: inherit; }

/* Inventory Styles */
.inventory-select-box { border: 1px solid var(--border-color, #cbd5e1); padding: 7px 12px; background: transparent; color: inherit; cursor: pointer; border-radius: 6px; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center; min-height: 35px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.inventory-dropdown { position: absolute; top: 100%; left: 0; z-index: 1000; background: white; border: 1px solid var(--border-color, #cbd5e1); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); width: 100%; min-width: 280px; border-radius: 8px; color: #333; overflow: hidden; }
.dropdown-scope-selector { display: flex; gap: 10px; padding: 10px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; }
.dropdown-search { padding: 10px; display: flex; gap: 5px; border-bottom: 1px solid #f1f5f9; }
.dropdown-results { overflow-y: auto; max-height: 200px; }
.dropdown-item { padding: 10px 15px; cursor: pointer; font-size: 0.85rem; border-bottom: 1px solid #f8fafc; transition: background 0.2s; }
.dropdown-item:hover { background: #eff6ff; color: #3b82f6; }
.truncate-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px; }

/* Ledger Styles */
.ledger-table-container { max-height: 250px; overflow-y: auto; border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; }
.ledger-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; table-layout: fixed; }
.ledger-table th, .ledger-table td { padding: 12px; text-align: left; border-bottom: 1px solid var(--border-color, #f1f5f9); }
.ledger-table th { background: #f8fafc; font-weight: bold; position: sticky; top: 0; z-index: 5; }

/* Added input style for manual ledger rows */
.small-input { width: 100%; max-width: 65px; padding: 4px; border-radius: 4px; border: 1px solid var(--border-color, #cbd5e1); font-size: 0.8rem; background: transparent; color: inherit; }

.small-select { padding: 5px 8px; border-radius: 6px; border: 1px solid var(--border-color, #ddd); font-size: 0.8rem; outline: none; background: transparent; color: inherit; }
.bg-green-hit { background: rgba(16, 185, 129, 0.15) !important; color: #064e3b; font-weight: bold; border-color: #10b981; }
.bg-red-miss { background: rgba(239, 68, 68, 0.1) !important; color: #7f1d1d; border-color: #ef4444; }

/* Visualization Area */
.plot-area { height: 480px; background: #000; border-radius: 12px; border: 1px solid var(--border-color, #e2e8f0); padding: 15px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02); overflow: hidden; }

/* Engine Actions Redesign */
.engine-actions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
.action-btn { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: all 0.2s; border: none; font-size: 0.95rem; }
.auto-btn { background: #3b82f6; color: white; box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3); }
.auto-btn:hover:not(:disabled) { background: #2563eb; transform: translateY(-1px); }
.import-btn { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
.import-btn:hover { background: #e2e8f0; }

.imported-file-badge { background: #f0f9ff; border: 1px solid #bae6fd; padding: 12px; border-radius: 8px; margin-bottom: 20px; color: #0369a1; }
.clear-btn { background: transparent; border: none; color: #ef4444; cursor: pointer; padding: 4px; border-radius: 4px; }

.priority-label { margin-bottom: 12px; color: #1e3a8a; border-bottom: 2px solid #eff6ff; padding-bottom: 6px; font-size: 0.95rem; }
.suggestion-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 15px; margin-bottom: 12px; background: white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
.sug-id { font-size: 0.75rem; color: #94a3b8; font-weight: bold; margin-bottom: 5px; }
.sug-hit-badge { color: #10b981; font-weight: 800; font-size: 0.7rem; margin-top: 5px; background: rgba(16, 185, 129, 0.1); padding: 2px 6px; border-radius: 4px; display: inline-block; }
.success-btn { background: #10b981; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%; margin-top: 10px; }

/* 96-Well Plate Map Styles */
.well-plate-wrapper { display: flex; justify-content: center; padding: 30px 0; background: #0f172a; border-radius: 16px; box-shadow: inset 0 4px 10px rgba(0,0,0,0.3); }
.well-plate { display: inline-flex; flex-direction: column; gap: 10px; }
.plate-header-row { display: flex; align-items: center; gap: 12px; }
.plate-col-labels { display: flex; gap: 12px; }
.col-label { width: 38px; text-align: center; color: #94a3b8; font-size: 0.9rem; font-weight: 800; }
.plate-row-wrapper { display: flex; align-items: center; gap: 12px; }
.row-label { width: 25px; color: #94a3b8; font-size: 1.1rem; font-weight: 800; text-align: center; }
.plate-row { display: flex; gap: 12px; }
.well { width: 38px; height: 38px; border-radius: 50%; background: #1e293b; border: 2px solid #334155; display: flex; align-items: center; justify-content: center; transition: all 0.3s; cursor: help; }
.well-id { font-size: 0.65rem; color: #475569; font-weight: bold; pointer-events: none; }

.phase-hit { border-color: #10b981; background: rgba(16, 185, 129, 0.4) !important; box-shadow: 0 0 15px rgba(16, 185, 129, 0.6); }
.phase-hit .well-id { color: #fff; }
.phase-miss { border-color: #ef4444; background: rgba(239, 68, 68, 0.2) !important; }
.phase-target { border-color: #3b82f6; background: rgba(59, 130, 246, 0.25) !important; animation: pulse-blue 2s infinite; }
.phase-target .well-id { color: #fff; }

@keyframes pulse-blue { 0% { box-shadow: 0 0 0 0 rgba(59,130,246,0.6); } 70% { box-shadow: 0 0 0 8px rgba(59,130,246,0); } 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); } }

.flex-between { display: flex; justify-content: space-between; align-items: center; }
.checkbox-label { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; cursor: pointer; color: #475569; font-weight: bold; }
</style>