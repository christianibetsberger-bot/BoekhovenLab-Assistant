<template>
  <div class="card module-card" @click="activeDropdown = null">
    <div class="full-width-header">
      <h2 style="display: flex; align-items: center; gap: 10px;">
        <i class="fas fa-brain"></i> Active Learning Phase Predictor
      </h2>
      <p style="font-size: 0.85rem; opacity: 0.8; margin-top: 5px;">
        Map chemical phase space and calculate pipetting volumes using smart experimental design.
      </p>
    </div>

    <div class="layout-columns">
      
      <div class="col-left">
        <div class="internal-section">
          <div class="flex-between">
            <h3>1. Search Space & Volumes</h3>
            <div class="target-vol-input">
              <label>Target Well Vol (µL):</label>
              <input type="number" v-model="config.targetVolume" @change="renderPlot" title="Total Volume per well in µL" />
            </div>
          </div>
          
          <div class="config-grid-complex">
            <div class="input-group">
              <label>Component A (Anion)</label>
              <div style="display: flex; gap: 5px; align-items: flex-end;">
                <div style="flex: 2; position: relative;" @click.stop>
                  <div @click="activeDropdown = activeDropdown === 'anion' ? null : 'anion'" class="inventory-select-box">
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
                      <button class="small" @click="config.anionName = config.anionSearchQuery; activeDropdown = null; renderPlot()">Text</button>
                    </div>
                    <div class="dropdown-results">
                      <div v-for="inv in filterBlockInventory(config.anionSearchQuery, config.anionSearchScope)" :key="inv.id" class="dropdown-item" @mousedown.prevent="config.anionName = '[' + inv.code + '] ' + inv.name; activeDropdown = null; renderPlot()">
                        [{{ inv.code }}] {{ inv.name }}
                      </div>
                    </div>
                  </div>
                </div>
                <input type="number" v-model="config.anionMax" @change="renderPlot" style="flex: 0.7;" title="Max Target (mM)" placeholder="Max mM" />
                <input type="number" v-model="config.stockAnion" style="flex: 0.7;" title="Stock Conc (mM)" placeholder="Stock mM" />
              </div>
            </div>
            
            <div class="input-group">
              <label>Component B (Cation)</label>
              <div style="display: flex; gap: 5px; align-items: flex-end;">
                <div style="flex: 2; position: relative;" @click.stop>
                  <div @click="activeDropdown = activeDropdown === 'cation' ? null : 'cation'" class="inventory-select-box">
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
                      <button class="small" @click="config.cationName = config.cationSearchQuery; activeDropdown = null; renderPlot()">Text</button>
                    </div>
                    <div class="dropdown-results">
                      <div v-for="inv in filterBlockInventory(config.cationSearchQuery, config.cationSearchScope)" :key="inv.id" class="dropdown-item" @mousedown.prevent="config.cationName = '[' + inv.code + '] ' + inv.name; activeDropdown = null; renderPlot()">
                        [{{ inv.code }}] {{ inv.name }}
                      </div>
                    </div>
                  </div>
                </div>
                <input type="number" v-model="config.cationMax" @change="renderPlot" style="flex: 0.7;" title="Max Target (mM)" placeholder="Max mM" />
                <input type="number" v-model="config.stockCation" style="flex: 0.7;" title="Stock Conc (mM)" placeholder="Stock mM" />
              </div>
            </div>
            
            <div class="input-group">
              <label>Component C (Salt/Buffer)</label>
              <div style="display: flex; gap: 5px; align-items: flex-end;">
                <div style="flex: 2; position: relative;" @click.stop>
                  <div @click="activeDropdown = activeDropdown === 'salt' ? null : 'salt'" class="inventory-select-box">
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
                      <button class="small" @click="config.saltName = config.saltSearchQuery; activeDropdown = null; renderPlot()">Text</button>
                    </div>
                    <div class="dropdown-results">
                      <div v-for="inv in filterBlockInventory(config.saltSearchQuery, config.saltSearchScope)" :key="inv.id" class="dropdown-item" @mousedown.prevent="config.saltName = '[' + inv.code + '] ' + inv.name; activeDropdown = null; renderPlot()">
                        [{{ inv.code }}] {{ inv.name }}
                      </div>
                    </div>
                  </div>
                </div>
                <input type="number" v-model="config.saltMax" @change="renderPlot" style="flex: 0.7;" title="Max Target (mM)" placeholder="Max mM" />
                <input type="number" v-model="config.stockSalt" style="flex: 0.7;" title="Stock Conc (mM)" placeholder="Stock mM" />
              </div>
            </div>
          </div>
        </div>

        <div class="internal-section" style="flex-grow: 1;">
          <h3>2. Experiment Ledger</h3>
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
                    <select v-model="exp.phase" @change="updateExperiment(exp)" class="small-select" :class="{'bg-green-hit': exp.phase === 1, 'bg-red-miss': exp.phase === 0}">
                      <option :value="-1">Untested</option>
                      <option :value="0">Clear</option>
                      <option :value="1">Coacervate</option>
                    </select>
                  </td>
                  <td>
                    <button class="clear-btn" @click="removeRow(index, exp)" title="Remove Row"><i class="fas fa-trash"></i></button>
                  </td>
                </tr>
              </tbody>
            </table>
            <button class="small mt-2" @click="addManualRow"><i class="fas fa-plus"></i> Add Manual Data</button>
          </div>
        </div>
      </div>

      <div class="col-right">
        <div class="internal-section" style="display: flex; flex-direction: column;">
          <h3>3. Phase Map (3D Space)</h3>
          <div class="plot-area">
            <div id="phase-ternary-plot" style="width: 100%; height: 100%;"></div>
          </div>
        </div>

        <div class="internal-section">
          <h3>4. Active Learning Engine</h3>

          <div style="margin-bottom: 15px; padding: 10px; background: rgba(59, 130, 246, 0.05); border: 1px solid var(--border-color, #cbd5e1); border-radius: 6px;">
            <label style="display: block; font-size: 0.85rem; font-weight: bold; margin-bottom: 8px; color: var(--primary, #3b82f6);">Sampling Strategy:</label>
            <div style="display: flex; gap: 15px;">
              <label class="checkbox-label">
                <input type="radio" value="safe" v-model="config.strategy"> Safe (Entropy/Boundary)
              </label>
              <label class="checkbox-label">
                <input type="radio" value="risky" v-model="config.strategy"> Risky (Midpoint Hunt)
              </label>
            </div>
          </div>

          <div class="engine-actions-grid">
            <button class="action-btn auto-btn" @click="calculateNextExperiments" :disabled="isCalculating">
              <i class="fas" :class="isCalculating ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'"></i>
              <span>{{ isCalculating ? 'Calculating...' : 'Auto-Suggest Plate' }}</span>
            </button>
            <button class="action-btn import-btn" @click="triggerFileInput">
              <i class="fas fa-file-csv"></i> <span>Import CSV</span>
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
            <div class="flex-between" style="margin-bottom: 5px;">
              <h4 class="priority-label" style="margin-bottom: 0; border: none; padding: 0;">Target Queue:</h4>
              <button class="small success-btn" @click="importAllSuggestions" style="width: auto; margin-top: 0; padding: 6px 12px;">
                <i class="fas fa-save"></i> Log All
              </button>
            </div>
            <div style="max-height: 150px; overflow-y: auto; padding-right: 8px; font-size: 0.8rem;">
              <div class="suggestion-card" v-for="(sug, index) in suggestions" :key="index" style="padding: 10px;">
                <div class="flex-between">
                  <div>
                    <span class="sug-id" v-if="sug.sampleId">ID: {{ sug.sampleId }}</span>
                    A: {{ sug.anion }} | B: {{ sug.cation }} | C: {{ sug.salt }}
                  </div>
                  <button class="small success-btn" @click="importSuggestion(sug)" style="width: auto; margin:0; padding: 4px 8px;">Log</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="internal-section full-width-section" v-if="existingPlateData.length > 0 || suggestions.length > 0">
      <div class="flex-between" style="border-bottom: 1px solid var(--border-color, #e2e8f0); padding-bottom: 8px; margin-bottom: 15px;">
        <h3 style="margin: 0; border: none; padding: 0;">5. Wet Lab Mapping: 96-Well Plates</h3>
        <div v-if="suggestedPlateData.length > 0" class="export-controls">
            <span style="font-size: 0.85rem; font-weight: bold; opacity: 0.7;">Export with Volumes:</span>
            <select v-model="targetPlateId" class="compact-select">
                <option value="" disabled>Select Plate...</option>
                <option v-for="p in store.wellPlates" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <input type="text" v-model="targetStartWell" placeholder="A1" class="compact-input">
            <button class="small" @click="exportSuggestionsToPlate" style="background: #8b5cf6; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer;">
                <i class="fas fa-arrow-down"></i> Send
            </button>
        </div>
      </div>

      <div class="plates-grid">
          <div class="well-plate-wrapper" v-if="existingPlateData.length > 0">
            <h4 style="text-align: center; color: #3b82f6; margin-top: 0; font-size: 0.9rem;">Known Data Map</h4>
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
                  <div v-for="cIndex in 12" :key="'well'+rIndex+'-'+cIndex" class="well" :class="getWellStatusClass(existingPlateData, rIndex, cIndex - 1)" :title="getWellTooltip(existingPlateData, rIndex, cIndex - 1)">
                    <span class="well-id">{{ getWellSample(existingPlateData, rIndex, cIndex - 1)?.sampleId || '' }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="well-plate-wrapper" v-if="suggestedPlateData.length > 0">
            <h4 style="text-align: center; color: #8b5cf6; margin-top: 0; font-size: 0.9rem;">AI / CSV Target Plate</h4>
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
                  <div v-for="cIndex in 12" :key="'well'+rIndex+'-'+cIndex" class="well" :class="getWellStatusClass(suggestedPlateData, rIndex, cIndex - 1)" :title="getWellTooltip(suggestedPlateData, rIndex, cIndex - 1)">
                    <span class="well-id">{{ getWellSample(suggestedPlateData, rIndex, cIndex - 1)?.sampleId || '' }}</span>
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

const targetPlateId = ref('')
const targetStartWell = ref('A1')

// --- State ---
const config = ref({ 
  anionName: 'Compound A', anionMax: 6, stockAnion: 100, anionSearchQuery: '', anionSearchScope: 'Global',
  cationName: 'Compound B', cationMax: 6, stockCation: 100, cationSearchQuery: '', cationSearchScope: 'Global',
  saltName: 'Compound C', saltMax: 200, stockSalt: 1000, saltSearchQuery: '', saltSearchScope: 'Global',
  targetVolume: 100, // µL
  strategy: 'safe' // The Active Learning strategy toggle
})

const experiments = ref([])
const suggestions = ref([])
const isCalculating = ref(false)
const csvInput = ref(null)

const plateRows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const importedFileName = ref('')
const totalImportedCount = ref(0)

const filterBlockInventory = (query, scope) => {
    const term = query ? query.toLowerCase() : '';
    const targetScope = scope || 'Global';
    return store.inventory.filter(item => 
        (item.scope === targetScope || (!item.scope && targetScope === 'Global')) &&
        ((!term) || (item.name && item.name.toLowerCase().includes(term)) || (item.code && item.code.toLowerCase().includes(term)))
    );
}

const existingPlateData = computed(() => {
  const map = new Map();
  experiments.value.forEach(item => map.set(item.sampleId, item));
  return Array.from(map.values()).sort((a, b) => Number(a.sampleId) - Number(b.sampleId));
})

const suggestedPlateData = computed(() => {
  const map = new Map();
  suggestions.value.forEach(item => map.set(item.sampleId, item));
  return Array.from(map.values()).sort((a, b) => Number(a.sampleId) - Number(b.sampleId));
})

const getWellSample = (dataArray, rIndex, cIndex) => {
  const linearIndex = rIndex * 12 + cIndex
  return dataArray[linearIndex] || null
}

const getWellStatusClass = (dataArray, r, c) => {
  const sample = getWellSample(dataArray, r, c)
  if (!sample) return ''
  if (sample.phase === 1) return 'phase-hit'
  if (sample.phase === 0) return 'phase-miss'
  return 'phase-target'
}

const getWellTooltip = (dataArray, r, c) => {
  const s = getWellSample(dataArray, r, c)
  if (!s) return 'Empty Well'
  const status = s.phase === 1 ? 'HIT' : (s.phase === 0 ? 'CLEAR' : 'AI TARGET')
  return `ID: ${s.sampleId} [${status}]\nA: ${s.anion} | B: ${s.cation} | C: ${s.salt}`
}

const exportSuggestionsToPlate = () => {
    if (!targetPlateId.value || !targetStartWell.value) { alert("Please select a target plate and starting well."); return; }
    const plate = store.wellPlates.find(p => p.id === targetPlateId.value);
    if (!plate) return;
    
    const startWell = targetStartWell.value.toUpperCase().trim();
    const match = startWell.match(/^([A-Z]+)(\d+)$/);
    if (!match) { alert("Invalid well format. Use A1, B2, etc."); return; }
    
    let startRow = match[1].charCodeAt(0) - 65; 
    let startCol = parseInt(match[2]) - 1;
    
    suggestions.value.forEach((sug, i) => {
        let rOffset = Math.floor((startCol + i) / 12);
        let cOffset = (startCol + i) % 12;

        let targetR = startRow + rOffset;
        let targetC = cOffset;
        
        if (targetR < 8 && targetC < 12) {
            let wId = String.fromCharCode(65 + targetR) + (targetC + 1);
            
            // Volume Calculations (Target Vol * Target Conc / Stock Conc)
            let vA = ((sug.anion * config.value.targetVolume) / config.value.stockAnion).toFixed(2);
            let vB = ((sug.cation * config.value.targetVolume) / config.value.stockCation).toFixed(2);
            let vC = ((sug.salt * config.value.targetVolume) / config.value.stockSalt).toFixed(2);
            let vTotalStocks = parseFloat(vA) + parseFloat(vB) + parseFloat(vC);
            let vWater = (config.value.targetVolume - vTotalStocks).toFixed(2);
            
            let warningHtml = vWater < 0 ? `<br><span style="color:#ef4444; font-size:0.7rem;">⚠️ Vol Exceeds Limit</span>` : '';

            let cellHtml = `<strong>AI Target [${sug.sampleId}]</strong><br>
                            A: ${vA} µL<br>
                            B: ${vB} µL<br>
                            C: ${vC} µL<br>
                            H2O: ${vWater} µL${warningHtml}`;
            plate.wells[wId] = cellHtml;
        }
    });
    alert(`Successfully sent pipetting volumes to Plate: ${plate.name} starting at ${startWell}`);
}

const renderPlot = () => {
  const plotDiv = document.getElementById('phase-ternary-plot')
  if (!plotDiv) return

  const traceCoacervate = { 
    type: 'scatter3d', mode: 'markers', x: [], y: [], z: [], text: [], 
    name: 'Hit (1)', marker: { color: '#10b981', size: 5, symbol: 'circle', line: { color: '#064e3b', width: 1 } } 
  }
  const traceClear = { 
    type: 'scatter3d', mode: 'markers', x: [], y: [], z: [], text: [], 
    name: 'Clear (0)', marker: { color: '#ef4444', size: 3, symbol: 'circle', line: { color: '#7f1d1d', width: 1 } } 
  }
  const traceUnknown = { 
    type: 'scatter3d', mode: 'markers', x: [], y: [], z: [], text: [], 
    name: 'Untested', marker: { color: '#94a3b8', size: 2, symbol: 'circle' } 
  }
  const traceTarget = { 
    type: 'scatter3d', mode: 'markers', x: [], y: [], z: [], text: [], 
    name: 'Target', marker: { color: '#3b82f6', size: 4, symbol: 'cross', line: { color: '#1e3a8a', width: 1 } } 
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
      xaxis: { title: config.value.anionName + ' (mM)', backgroundcolor: "#000000", gridcolor: "#444444", showbackground: true, zerolinecolor: "#888888", tickfont: { color: '#dddddd', size: 10 }, titlefont: { color: '#ffffff', size: 12 } },
      yaxis: { title: config.value.cationName + ' (mM)', backgroundcolor: "#000000", gridcolor: "#444444", showbackground: true, zerolinecolor: "#888888", tickfont: { color: '#dddddd', size: 10 }, titlefont: { color: '#ffffff', size: 12 } },
      zaxis: { title: config.value.saltName + ' (mM)', backgroundcolor: "#000000", gridcolor: "#444444", showbackground: true, zerolinecolor: "#888888", tickfont: { color: '#dddddd', size: 10 }, titlefont: { color: '#ffffff', size: 12 } }
    },
    paper_bgcolor: '#000000',
    margin: { l: 0, r: 0, b: 0, t: 0 },
    showlegend: true,
    legend: { orientation: "h", y: 0.05, x: 0.5, xanchor: 'center', font: { color: '#ffffff', size: 10 } }
  }

  Plotly.react('phase-ternary-plot', [traceCoacervate, traceClear, traceUnknown, traceTarget], layout, { displayModeBar: false, responsive: true })
}

watch([experiments, suggestions, config], () => { renderPlot() }, { deep: true })

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

const importAllSuggestions = async () => {
  const payload = suggestions.value.map(sug => ({ sampleId: sug.sampleId, anion: sug.anion, cation: sug.cation, salt: sug.salt, phase: sug.phase }));
  const { data, error } = await db.from('phase_data').insert(payload).select()
  if(!error && data) { 
    experiments.value.push(...data); 
    suggestions.value = []; 
    clearImport() 
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
          let rawPhase = parseInt(cols[4]);
          let phaseVal = isNaN(rawPhase) ? -1 : rawPhase; 
          newSuggestions.push({ 
              sampleId: parseInt(cols[0], 10), 
              anion: Number(parseFloat(cols[1]).toFixed(2)), 
              cation: Number(parseFloat(cols[2]).toFixed(2)), 
              salt: Number(parseFloat(cols[3]).toFixed(1)), 
              phase: phaseVal 
          }) 
      }
    }
    totalImportedCount.value = newSuggestions.length; suggestions.value = newSuggestions; event.target.value = '';
  }
  reader.readAsText(file)
}

const clearImport = () => { importedFileName.value = ''; totalImportedCount.value = 0; suggestions.value = [] }

const calculateNextExperiments = async () => {
  isCalculating.value = true; 
  clearImport();
  
  // Dynamically find the highest Sample ID so the next plate stacks properly
  let maxId = 8999; // Base starting point if no data exists
  experiments.value.forEach(e => {
    if (e.sampleId && !isNaN(e.sampleId) && e.sampleId > maxId) {
      maxId = e.sampleId;
    }
  });
  const nextStartId = maxId + 1;
  
  try {
    const response = await fetch('https://experiment-backend-s71q.onrender.com/api/suggest-experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: config.value,
        experiments: experiments.value,
        n_suggestions: 96,
        start_id: nextStartId
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
.module-card { display: flex; flex-direction: column; gap: 10px; }

/* 2-Column Condensed Grid */
.layout-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
@media (max-width: 1024px) { .layout-columns { grid-template-columns: 1fr; } }

.col-left { display: flex; flex-direction: column; gap: 15px; }
.col-right { display: flex; flex-direction: column; gap: 15px; }

.internal-section h3 { font-size: 1.05rem; border-bottom: 1px solid var(--border-color, #e2e8f0); padding-bottom: 6px; margin-bottom: 10px; color: var(--primary, #3b82f6); }
.full-width-section { width: 100%; margin-top: 5px; }

/* Inputs and Config */
.target-vol-input { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: bold; }
.target-vol-input input { width: 80px; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color, #cbd5e1); background: transparent; color: inherit; }
.config-grid-complex { display: grid; grid-template-columns: 1fr; gap: 10px; }
.input-group label { display: block; font-size: 0.8rem; margin-bottom: 4px; font-weight: bold; opacity: 0.8; }
.input-group input { width: 100%; padding: 6px; border-radius: 4px; border: 1px solid var(--border-color, #cbd5e1); background: transparent; color: inherit; font-size: 0.85rem; }
.inventory-select-box { border: 1px solid var(--border-color, #cbd5e1); padding: 6px 10px; background: transparent; color: inherit; cursor: pointer; border-radius: 4px; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center; min-height: 32px; }

/* Dropdown */
.inventory-dropdown { position: absolute; top: 100%; left: 0; z-index: 1000; background: var(--bg-color, white); border: 1px solid var(--border-color, #cbd5e1); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); width: 100%; min-width: 250px; border-radius: 6px; overflow: hidden; }
.dropdown-scope-selector { display: flex; gap: 10px; padding: 8px; border-bottom: 1px solid var(--border-color, #e2e8f0); }
.dropdown-search { padding: 8px; display: flex; gap: 5px; border-bottom: 1px solid var(--border-color, #f1f5f9); }
.dropdown-results { overflow-y: auto; max-height: 150px; }
.dropdown-item { padding: 8px 12px; cursor: pointer; font-size: 0.8rem; border-bottom: 1px solid var(--border-color, #f8fafc); transition: background 0.2s; }
.dropdown-item:hover { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.truncate-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px; }

/* Ledger Table */
.ledger-table-container { max-height: 200px; overflow-y: auto; border: 1px solid var(--border-color, #e2e8f0); border-radius: 6px; }
.ledger-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; table-layout: fixed; }
.ledger-table th, .ledger-table td { padding: 8px; text-align: left; border-bottom: 1px solid var(--border-color, #f1f5f9); }
.ledger-table th { background: var(--summary-bg, #f8fafc); font-weight: bold; position: sticky; top: 0; z-index: 5; }
.small-input { width: 100%; padding: 4px; border-radius: 4px; border: 1px solid var(--border-color, #cbd5e1); font-size: 0.8rem; background-color: transparent !important; color: inherit !important; }
.small-select { padding: 4px; border-radius: 4px; border: 1px solid var(--border-color, #ddd); font-size: 0.8rem; outline: none; background-color: transparent !important; color: inherit !important; }
.bg-green-hit { background-color: rgba(16, 185, 129, 0.2) !important; color: #10b981 !important; font-weight: bold; border-color: #10b981; }
.bg-red-miss { background-color: rgba(239, 68, 68, 0.2) !important; color: #ef4444 !important; border-color: #ef4444; }

/* Plot Area */
.plot-area { height: 280px; background: #000; border-radius: 8px; border: 1px solid var(--border-color, #e2e8f0); padding: 5px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02); overflow: hidden; }

/* Buttons & Engine */
.engine-actions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
.action-btn { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: all 0.2s; border: none; font-size: 0.85rem; }
.auto-btn { background: #3b82f6; color: white; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3); }
.auto-btn:hover:not(:disabled) { background: #2563eb; transform: translateY(-1px); }
.import-btn { background: var(--summary-bg, #f1f5f9); color: inherit; border: 1px solid var(--border-color, #cbd5e1); }
.clear-btn { background: transparent; border: none; color: #ef4444; cursor: pointer; padding: 2px; border-radius: 4px; }
.success-btn { background: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; }

/* Side-by-Side Plates Grid */
.plates-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; align-items: start; }
@media (max-width: 1100px) { .plates-grid { grid-template-columns: 1fr; } }

.well-plate-wrapper { display: flex; flex-direction: column; align-items: center; padding: 15px; background: #0f172a; border-radius: 12px; box-shadow: inset 0 4px 10px rgba(0,0,0,0.3); width: 100%; overflow-x: auto; }
.well-plate { display: inline-flex; flex-direction: column; gap: 6px; }
.plate-header-row { display: flex; align-items: center; gap: 8px; }
.plate-col-labels { display: flex; gap: 8px; }
.col-label { width: 28px; text-align: center; color: #94a3b8; font-size: 0.75rem; font-weight: 800; }
.plate-row-wrapper { display: flex; align-items: center; gap: 8px; }
.row-label { width: 18px; color: #94a3b8; font-size: 0.85rem; font-weight: 800; text-align: center; }
.plate-row { display: flex; gap: 8px; }

/* Condensed Well */
.well { width: 28px; height: 28px; border-radius: 50%; background: #1e293b; border: 1px solid #334155; display: flex; align-items: center; justify-content: center; transition: all 0.3s; cursor: help; }
.well-id { font-size: 0.55rem; color: #475569; font-weight: bold; pointer-events: none; }
.phase-hit { border-color: #10b981; background: rgba(16, 185, 129, 0.4) !important; box-shadow: 0 0 10px rgba(16, 185, 129, 0.6); }
.phase-hit .well-id { color: #fff; }
.phase-miss { border-color: #ef4444; background: rgba(239, 68, 68, 0.2) !important; }
.phase-target { border-color: #3b82f6; background: rgba(59, 130, 246, 0.25) !important; animation: pulse-blue 2s infinite; }
.phase-target .well-id { color: #fff; }
@keyframes pulse-blue { 0% { box-shadow: 0 0 0 0 rgba(59,130,246,0.5); } 70% { box-shadow: 0 0 0 5px rgba(59,130,246,0); } 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); } }

/* Utils */
.flex-between { display: flex; justify-content: space-between; align-items: center; }
.checkbox-label { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; cursor: pointer; color: #475569; font-weight: bold; }
.export-controls { display: flex; align-items: center; gap: 10px; }
.compact-select { width: 120px; padding: 4px; background: transparent; color: inherit; border: 1px solid var(--border-color, #475569); border-radius: 4px; font-size: 0.8rem; }
.compact-input { width: 60px; padding: 4px; background: transparent; color: inherit; border: 1px solid var(--border-color, #475569); border-radius: 4px; font-size: 0.8rem; text-align: center; }
</style>