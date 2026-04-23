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
            <h3>1. Search Space, Steps & Volumes</h3>
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
                    </div>
                    <div class="dropdown-results">
                      <div v-for="inv in filterBlockInventory(config.anionSearchQuery, config.anionSearchScope)" :key="inv.id" class="dropdown-item" @mousedown.prevent="selectInventory('anion', inv)">
                        [{{ inv.code }}] {{ inv.name }} ({{inv.stock}} {{inv.stockUnit || 'µM'}})
                      </div>
                    </div>
                  </div>
                </div>
                <input type="number" v-model="config.anionMin" @change="renderPlot" style="flex: 0.4;" title="Min Target (mM)" placeholder="Min" />
                <input type="number" v-model="config.anionMax" @change="renderPlot" style="flex: 0.4;" title="Max Target (mM)" placeholder="Max" />
                <input type="number" v-model="config.anionStep" @change="renderPlot" style="flex: 0.4;" title="Step Grid (mM)" placeholder="Step" />
                <input type="number" v-model="config.stockAnion" style="flex: 0.6;" title="Stock Conc (mM)" placeholder="Stock" />
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
                    </div>
                    <div class="dropdown-results">
                      <div v-for="inv in filterBlockInventory(config.cationSearchQuery, config.cationSearchScope)" :key="inv.id" class="dropdown-item" @mousedown.prevent="selectInventory('cation', inv)">
                        [{{ inv.code }}] {{ inv.name }} ({{inv.stock}} {{inv.stockUnit || 'µM'}})
                      </div>
                    </div>
                  </div>
                </div>
                <input type="number" v-model="config.cationMin" @change="renderPlot" style="flex: 0.4;" title="Min Target (mM)" placeholder="Min" />
                <input type="number" v-model="config.cationMax" @change="renderPlot" style="flex: 0.4;" title="Max Target (mM)" placeholder="Max" />
                <input type="number" v-model="config.cationStep" @change="renderPlot" style="flex: 0.4;" title="Step Grid (mM)" placeholder="Step" />
                <input type="number" v-model="config.stockCation" style="flex: 0.6;" title="Stock Conc (mM)" placeholder="Stock" />
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
                    </div>
                    <div class="dropdown-results">
                      <div v-for="inv in filterBlockInventory(config.saltSearchQuery, config.saltSearchScope)" :key="inv.id" class="dropdown-item" @mousedown.prevent="selectInventory('salt', inv)">
                        [{{ inv.code }}] {{ inv.name }} ({{inv.stock}} {{inv.stockUnit || 'µM'}})
                      </div>
                    </div>
                  </div>
                </div>
                <input type="number" v-model="config.saltMin" @change="renderPlot" style="flex: 0.4;" title="Min Target (mM)" placeholder="Min" />
                <input type="number" v-model="config.saltMax" @change="renderPlot" style="flex: 0.4;" title="Max Target (mM)" placeholder="Max" />
                <input type="number" v-model="config.saltStep" @change="renderPlot" style="flex: 0.4;" title="Step Grid (mM)" placeholder="Step" />
                <input type="number" v-model="config.stockSalt" style="flex: 0.6;" title="Stock Conc (mM)" placeholder="Stock" />
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
                  <th>Observed Phase</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(exp, index) in experiments" :key="exp.id || index">
                  <td><input type="number" v-model="exp.anion" @change="updateExperiment(exp)" class="small-input" /></td>
                  <td><input type="number" v-model="exp.cation" @change="updateExperiment(exp)" class="small-input" /></td>
                  <td><input type="number" v-model="exp.salt" @change="updateExperiment(exp)" class="small-input" /></td>
                  <td>
                    <select v-model="exp.phase" @change="updateExperiment(exp)" class="small-select" :style="{ backgroundColor: getPhaseColor(exp.phase, 0.2), borderColor: getPhaseColor(exp.phase, 1) }">
                      <option :value="-1">Untested</option>
                      <option :value="0">Clear</option>
                      <option :value="1">Phase 1</option>
                      <option :value="2">Phase 2</option>
                      <option :value="3">Phase 3</option>
                      <option :value="4">Phase 4</option>
                    </select>
                  </td>
                  <td>
                    <button class="clear-btn" @click="removeRow(index, exp)" title="Remove Row"><i class="fas fa-trash"></i></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="flex-between" style="margin-top: 10px;">
            <div style="display: flex; gap: 10px;">
              <button class="small" @click="addManualRow"><i class="fas fa-plus"></i> Add Manual Data</button>
              <button class="small" @click="triggerFileInput" style="background: var(--summary-bg, #f1f5f9); color: inherit; border: 1px solid var(--border-color, #cbd5e1);">
                <i class="fas fa-file-csv"></i> Import CSV
              </button>
              <input type="file" id="hidden-csv-input" accept=".csv" style="display: none" />
            </div>
            <button class="small danger-btn" @click="clearLedger"><i class="fas fa-trash-alt"></i> Reset Memory</button>
          </div>
        </div>
      </div>

      <div class="col-right">
        <div class="internal-section" style="display: flex; flex-direction: column;">
          <div class="flex-between" style="margin-bottom: 10px;">
            <h3 style="margin: 0; border: none; padding: 0;">3. Phase Map (3D Space)</h3>
            <div style="display: flex; gap: 10px; align-items: center;">
              <label v-if="boundaryData" class="checkbox-label">
                <input type="checkbox" v-model="showBoundary" @change="renderPlot"> Show Phase Boundaries
              </label>
              <button class="small" @click="calculateBoundary" :disabled="isCalculatingBoundary" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; border: 1px solid #3b82f6; margin: 0;">
                <i class="fas" :class="isCalculatingBoundary ? 'fa-spinner fa-spin' : 'fa-cube'"></i>
                {{ isCalculatingBoundary ? 'Modeling...' : 'Map Phase Boundaries' }}
              </button>
            </div>
          </div>
          <div class="plot-area">
            <div id="phase-ternary-plot" style="width: 100%; height: 100%;"></div>
          </div>
        </div>

        <div class="internal-section">
          <h3>4. Active Learning Engine</h3>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; padding: 10px; background: rgba(59, 130, 246, 0.05); border: 1px solid var(--border-color, #cbd5e1); border-radius: 6px;">
              <div class="input-group" style="margin: 0;">
                  <label style="font-size: 0.75rem; font-weight: bold; color: var(--primary, #3b82f6);">Targets to Suggest:</label>
                  <input type="number" v-model.number="config.numSuggestions" min="1" max="384" style="padding: 6px;" title="How many wells should the AI generate?" />
              </div>
              <div class="input-group" style="margin: 0;">
                  <label style="font-size: 0.75rem; font-weight: bold; color: var(--primary, #3b82f6);">Min Distance Filter (0-1):</label>
                  <input type="number" v-model.number="config.minDistanceFactor" step="0.01" min="0" max="1" style="padding: 6px;" title="0.0 = Tightly Clustered, 0.1+ = Spread Apart" />
              </div>
              <div style="grid-column: span 2; margin-top: 5px;">
                  <label style="display: block; font-size: 0.75rem; font-weight: bold; margin-bottom: 8px; color: var(--primary, #3b82f6);">Sampling Strategy:</label>
                  <div style="display: flex; gap: 15px;">
                    <label class="checkbox-label">
                      <input type="radio" value="safe" v-model="config.strategy"> Multi-Phase Entropy (Boundary)
                    </label>
                    <label class="checkbox-label">
                      <input type="radio" value="risky" v-model="config.strategy"> Geometry Midpoint Hunt
                    </label>
                  </div>
              </div>
          </div>

          <button class="action-btn auto-btn" @click="calculateNextExperiments" :disabled="isCalculating" style="width: 100%; margin-bottom: 10px;">
            <i class="fas" :class="isCalculating ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'"></i>
            <span>{{ isCalculating ? 'Calculating...' : 'Auto-Suggest Grid-Locked Plate' }}</span>
          </button>

          <div class="suggestions-container" v-if="suggestions.length > 0">
            <div class="flex-between" style="margin-bottom: 5px;">
              <h4 class="priority-label" style="margin-bottom: 0; border: none; padding: 0;">AI Target Queue:</h4>
              <button class="small success-btn" @click="importAllSuggestions" style="width: auto; margin-top: 0; padding: 6px 12px;">
                <i class="fas fa-save"></i> Log All Targets
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
            <span style="font-size: 0.85rem; font-weight: bold; opacity: 0.7;">Export AI Targets with Volumes:</span>
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
                  <div v-for="cIndex in 12" :key="'well'+rIndex+'-'+cIndex" class="well" :style="{ backgroundColor: getPhaseColor(getWellSample(existingPlateData, rIndex, cIndex-1)?.phase, 0.4), borderColor: getPhaseColor(getWellSample(existingPlateData, rIndex, cIndex-1)?.phase, 1) }" :title="getWellTooltip(existingPlateData, rIndex, cIndex - 1)">
                    <span class="well-id">{{ getWellSample(existingPlateData, rIndex, cIndex - 1)?.sampleId || '' }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="well-plate-wrapper" v-if="suggestedPlateData.length > 0">
            <h4 style="text-align: center; color: #8b5cf6; margin-top: 0; font-size: 0.9rem;">AI Generated Plate</h4>
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
                  <div v-for="cIndex in 12" :key="'well'+rIndex+'-'+cIndex" class="well" :style="{ backgroundColor: getPhaseColor(getWellSample(suggestedPlateData, rIndex, cIndex-1)?.phase, 0.4), borderColor: getPhaseColor(getWellSample(suggestedPlateData, rIndex, cIndex-1)?.phase, 1) }" :title="getWellTooltip(suggestedPlateData, rIndex, cIndex - 1)">
                    <span class="well-id" style="color: white;">{{ getWellSample(suggestedPlateData, rIndex, cIndex - 1)?.sampleId || '' }}</span>
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

// --- Multi-Phase Colors ---
const phaseColors = {
    [-1]: 'rgba(59, 130, 246, 1)',   
    0: 'rgba(239, 68, 68, 1)',    
    1: 'rgba(16, 185, 129, 1)',   
    2: 'rgba(245, 158, 11, 1)',   
    3: 'rgba(168, 85, 247, 1)',   
    4: 'rgba(236, 72, 153, 1)'    
};
const phaseNames = {
    0: 'Clear (0)', 1: 'Phase 1', 2: 'Phase 2', 3: 'Phase 3', 4: 'Phase 4'
};
const getPhaseColor = (phase, alpha = 1) => {
    if (phase === undefined || phase === null) return 'transparent';
    let rgb = phaseColors[phase] || 'rgba(148, 163, 184, 1)'; 
    return rgb.replace('1)', `${alpha})`);
};

// --- State ---
const config = ref({ 
  anionName: 'Compound A', anionMin: 0, anionMax: 6, anionStep: 0.5, stockAnion: 100, anionInv: null, anionSearchQuery: '', anionSearchScope: 'Global',
  cationName: 'Compound B', cationMin: 0, cationMax: 6, cationStep: 0.5, stockCation: 100, cationInv: null, cationSearchQuery: '', cationSearchScope: 'Global',
  saltName: 'Compound C', saltMin: 0, saltMax: 200, saltStep: 10, stockSalt: 1000, saltInv: null, saltSearchQuery: '', saltSearchScope: 'Global',
  targetVolume: 100,
  strategy: 'safe',
  numSuggestions: 96,
  minDistanceFactor: 0.05
})

const experiments = ref([])
const suggestions = ref([])
const isCalculating = ref(false)

const boundaryData = ref(null)
const isCalculatingBoundary = ref(false)
const showBoundary = ref(true)

const plateRows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

// --- Helper Math ---
const getMM = (val, unit) => {
    if (!val) return 0;
    let m = 1;
    if (unit === 'M') m = 1000;
    else if (unit === 'mM') m = 1;
    else if (unit === 'µM') m = 1e-3;
    else if (unit === 'nM') m = 1e-6;
    else if (unit === 'mg/mL' || unit === 'µg/µL') m = 1;
    else if (unit === 'ng/µL') m = 1e-3;
    else if (unit === 'X') m = 1;
    else if (unit === '%') m = 10;
    return val * m;
}

const selectInventory = (type, inv) => {
    const stockInMM = getMM(inv.stock, inv.stockUnit || 'µM');
    if (type === 'anion') {
        config.value.anionName = `[${inv.code}] ${inv.name}`;
        config.value.stockAnion = stockInMM;
        config.value.anionInv = inv;
    } else if (type === 'cation') {
        config.value.cationName = `[${inv.code}] ${inv.name}`;
        config.value.stockCation = stockInMM;
        config.value.cationInv = inv;
    } else if (type === 'salt') {
        config.value.saltName = `[${inv.code}] ${inv.name}`;
        config.value.stockSalt = stockInMM;
        config.value.saltInv = inv;
    }
    activeDropdown.value = null;
    renderPlot();
}

const filterBlockInventory = (query, scope) => {
    const term = query ? query.toLowerCase() : '';
    const targetScope = scope || 'Global';
    return store.inventory.filter(item => 
        (item.scope === targetScope || (!item.scope && targetScope === 'Global')) &&
        ((!term) || 
         (item.name && item.name.toLowerCase().includes(term)) || 
         (item.code && item.code.toLowerCase().includes(term)) ||
         (item.cas && item.cas.toLowerCase().includes(term)))
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

const getWellTooltip = (dataArray, r, c) => {
  const s = getWellSample(dataArray, r, c)
  if (!s) return 'Empty Well'
  const statusName = s.phase === -1 ? 'AI TARGET' : (phaseNames[s.phase] || `Phase ${s.phase}`);
  return `ID: ${s.sampleId} [${statusName}]\nA: ${s.anion} | B: ${s.cation} | C: ${s.salt}`
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

    const getInventoryTag = (inv, vol, targetConc) => {
        if (!inv) return `<strong>Unknown Component:</strong> ${vol} µL (${targetConc} mM)<br>`;
        return `&nbsp;<span class="inv-ref" contenteditable="false" data-labware=""><i class="fas fa-tag"></i>&nbsp;[${inv.code}] ${inv.name} (${store.formatNum(inv.stock)} ${inv.stockUnit || 'µM'})&nbsp;<i class="fas fa-times" style="cursor:pointer; margin-left:4px; opacity: 0.7;" onclick="let ce = this.closest('[contenteditable]'); this.parentElement.remove(); if(ce) ce.dispatchEvent(new Event('input', {bubbles: true}));" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7"></i></span>&nbsp; ${vol} µL (${targetConc} mM)<br>`;
    };
    
    suggestions.value.forEach((sug, i) => {
        let rOffset = Math.floor((startCol + i) / 12);
        let cOffset = (startCol + i) % 12;

        let targetR = startRow + rOffset;
        let targetC = cOffset;
        
        if (targetR < 8 && targetC < 12) {
            let wId = String.fromCharCode(65 + targetR) + (targetC + 1);
            
            let vA = config.value.stockAnion > 0 ? ((sug.anion * config.value.targetVolume) / config.value.stockAnion).toFixed(2) : 0;
            let vB = config.value.stockCation > 0 ? ((sug.cation * config.value.targetVolume) / config.value.stockCation).toFixed(2) : 0;
            let vC = config.value.stockSalt > 0 ? ((sug.salt * config.value.targetVolume) / config.value.stockSalt).toFixed(2) : 0;
            
            let vTotalStocks = parseFloat(vA) + parseFloat(vB) + parseFloat(vC);
            let vWater = (config.value.targetVolume - vTotalStocks).toFixed(2);
            
            let warningHtml = vWater < 0 ? `<br><span style="color:#ef4444; font-size:0.7rem;">⚠️ Vol Exceeds Limit</span>` : '';

            let cellHtml = `<strong style="color: var(--primary);">AI Target [${sug.sampleId}]</strong><br>
                            ${getInventoryTag(config.value.anionInv, vA, sug.anion)}
                            ${getInventoryTag(config.value.cationInv, vB, sug.cation)}
                            ${getInventoryTag(config.value.saltInv, vC, sug.salt)}
                            <strong>MQ H₂O:</strong> ${vWater} µL${warningHtml}`;
                            
            plate.wells[wId] = cellHtml;
        }
    });
    alert(`Successfully sent pipetting volumes to Plate: ${plate.name} starting at ${startWell}`);
}

const renderPlot = () => {
  const plotDiv = document.getElementById('phase-ternary-plot')
  if (!plotDiv) return

  const classTraces = {};
  for(let i=0; i<=4; i++) {
      classTraces[i] = { type: 'scatter3d', mode: 'markers', x:[], y:[], z:[], text:[], name: phaseNames[i], marker: {color: phaseColors[i], size: 5, symbol: 'circle', line: {color: '#000', width: 1}} };
  }
  
  const traceUnknown = { type: 'scatter3d', mode: 'markers', x: [], y: [], z: [], text: [], name: 'Untested', marker: { color: '#94a3b8', size: 2, symbol: 'circle' } };
  const traceTarget = { type: 'scatter3d', mode: 'markers', x: [], y: [], z: [], text: [], name: 'AI Target', marker: { color: phaseColors[-1], size: 4, symbol: 'cross', line: { color: '#fff', width: 1 } } };

  const allData = [...experiments.value, ...suggestions.value]

  allData.forEach(exp => {
    const statusName = exp.phase === -1 ? 'AI Target' : (phaseNames[exp.phase] || `Phase ${exp.phase}`);
    const label = `ID: ${exp.sampleId || 'Manual'} | ${statusName} | A: ${exp.anion} | B: ${exp.cation} | C: ${exp.salt}`;
    
    if (exp.phase >= 0 && exp.phase <= 4) {
        classTraces[exp.phase].x.push(exp.anion); classTraces[exp.phase].y.push(exp.cation); classTraces[exp.phase].z.push(exp.salt); classTraces[exp.phase].text.push(label);
    } else if (exp.sampleId > 0 && !experiments.value.some(e => e.sampleId === exp.sampleId)) {
        traceTarget.x.push(exp.anion); traceTarget.y.push(exp.cation); traceTarget.z.push(exp.salt); traceTarget.text.push(label);
    } else {
        traceUnknown.x.push(exp.anion); traceUnknown.y.push(exp.cation); traceUnknown.z.push(exp.salt); traceUnknown.text.push(label);
    }
  })

  const traces = [...Object.values(classTraces).filter(t => t.x.length > 0), traceUnknown, traceTarget];

  // MATHEMATICALLY ROBUST DYNAMIC ISOSURFACE RENDERING
  if (boundaryData.value && showBoundary.value && boundaryData.value.probs) {
      const rawX = [...boundaryData.value.x];
      const rawY = [...boundaryData.value.y];
      const rawZ = [...boundaryData.value.z];

      Object.keys(boundaryData.value.probs).forEach(phaseId => {
          const rawProb = [...boundaryData.value.probs[phaseId]];
          const pId = parseInt(phaseId, 10);
          
          // Clamp detection: Prevent WebGL from crashing if the model is highly uncertain
          const maxProb = Math.max(...rawProb);
          const minProb = Math.min(...rawProb);
          if (maxProb - minProb < 0.05 || maxProb < 0.20) return; // Skip if surface mathematically doesn't exist
          
          // Force proper Plotly colorscale syntax
          const baseColor = phaseColors[pId] || 'rgba(148, 163, 184, 1)';
          const transparentColor = baseColor.replace('1)', '0.0)');
          const cScale = [ [0, transparentColor], [1, baseColor] ];

          const traceSurface = {
              type: 'isosurface',
              x: rawX,
              y: rawY,
              z: rawZ,
              value: rawProb,
              // Anchor the boundary line dynamically near the highest confidence ridge
              isomin: Math.max(0.2, maxProb - 0.15), 
              isomax: maxProb, 
              surface: { show: true, count: 3 },
              opacity: 0.45, 
              colorscale: cScale, 
              caps: { x: {show: false}, y: {show: false}, z: {show: false} },
              name: `${phaseNames[pId] || 'Phase ' + pId} Boundary`,
              showscale: false, 
              hoverinfo: 'none'
          };
          traces.push(traceSurface);
      });
  }

  const layout = {
    scene: {
      xaxis: { range: [config.value.anionMin, config.value.anionMax], title: config.value.anionName + ' (mM)', backgroundcolor: "#000000", gridcolor: "#444444", showbackground: true, zerolinecolor: "#888888", tickfont: { color: '#dddddd', size: 10 }, titlefont: { color: '#ffffff', size: 12 } },
      yaxis: { range: [config.value.cationMin, config.value.cationMax], title: config.value.cationName + ' (mM)', backgroundcolor: "#000000", gridcolor: "#444444", showbackground: true, zerolinecolor: "#888888", tickfont: { color: '#dddddd', size: 10 }, titlefont: { color: '#ffffff', size: 12 } },
      zaxis: { range: [config.value.saltMin, config.value.saltMax], title: config.value.saltName + ' (mM)', backgroundcolor: "#000000", gridcolor: "#444444", showbackground: true, zerolinecolor: "#888888", tickfont: { color: '#dddddd', size: 10 }, titlefont: { color: '#ffffff', size: 12 } }
    },
    paper_bgcolor: '#000000',
    margin: { l: 0, r: 0, b: 0, t: 0 },
    showlegend: true,
    legend: { orientation: "h", y: 0.05, x: 0.5, xanchor: 'center', font: { color: '#ffffff', size: 10 } }
  }

  Plotly.react('phase-ternary-plot', traces, layout, { displayModeBar: false, responsive: true })
}

watch([experiments, suggestions, config], () => { renderPlot() }, { deep: true })

const fetchExperiments = async () => {
  if (!store.user?.id) return;
  const { data, error } = await db.from('phase_data').select('*').eq('owner_id', store.user.id);
  if (!error && data) {
      experiments.value = data.map(row => ({
          ...row,
          sampleId: row.sampleid !== undefined ? row.sampleid : row.sampleId
      }));
      renderPlot()
  }
}

const updateExperiment = async (exp) => {
  if(!exp.id) { renderPlot(); return }
  await db.from('phase_data').update({ phase: exp.phase, anion: exp.anion, cation: exp.cation, salt: exp.salt }).eq('id', exp.id); renderPlot()
}

const addManualRow = () => { experiments.value.push({ sampleId: Math.floor(Math.random() * 9000), anion: 0, cation: 0, salt: 0, phase: -1 }) }

const removeRow = async (index, exp) => {
  experiments.value.splice(index, 1);
  if (exp.id) {
    await db.from('phase_data').delete().eq('id', exp.id);
  }
  renderPlot();
}

const clearLedger = async () => {
  if (!confirm("Are you sure you want to wipe all known data for this predictor? This will permanently delete this module's memory.")) return;
  
  const idsToDelete = experiments.value.map(e => e.id).filter(id => id);
  if (idsToDelete.length > 0) {
     const { error } = await db.from('phase_data').delete().in('id', idsToDelete);
     if (!error) {
         experiments.value = [];
         boundaryData.value = null;
         renderPlot();
     } else {
         alert("Failed to clear database.");
     }
  } else {
     experiments.value = [];
     boundaryData.value = null;
     renderPlot();
  }
}

const importSuggestion = async (sug) => {
  if (!store.user?.id) return;
  const payload = { sampleid: sug.sampleId, anion: sug.anion, cation: sug.cation, salt: sug.salt, phase: sug.phase, owner_id: store.user.id };
  const { error } = await db.from('phase_data').insert([payload]);
  if (!error) {
    await fetchExperiments();
    suggestions.value = suggestions.value.filter(s => s.sampleId !== sug.sampleId);
  }
}

const importAllSuggestions = async () => {
  if (!store.user?.id) return;
  const payload = suggestions.value.map(sug => ({
      sampleid: sug.sampleId, anion: sug.anion, cation: sug.cation, salt: sug.salt, phase: sug.phase, owner_id: store.user.id
  }));
  const { error } = await db.from('phase_data').insert(payload);
  if (!error) {
    await fetchExperiments();
    suggestions.value = [];
  } else {
    alert("Error logging AI targets to Supabase.");
  }
}

const triggerFileInput = () => { 
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv';

  input.onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      const text = e.target.result; 
      const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
      if (lines.length < 2) return;
      
      const delimiter = lines[0].includes(';') ? ';' : ',';
      const headers = lines[0].split(delimiter).map(s => s.trim().replace(/^["']|["']$/g, '').toLowerCase());
      
      let idxId = headers.findIndex(h => h === '' || h === 'index' || h === 'sampleid');
      let idxA = headers.indexOf('anion');
      let idxB = headers.indexOf('cation');
      let idxC = headers.indexOf('salt');
      let idxPhase = headers.indexOf('phase');
      
      if (idxId === -1) idxId = 0;
      if (idxA === -1) idxA = 1;
      if (idxB === -1) idxB = 2;
      if (idxC === -1) idxC = 3;
      if (idxPhase === -1) idxPhase = 4;
      
      const newKnowns = [];
      
      for (let i = 1; i < lines.length; i++) {
        const rowText = lines[i].trim();
        if(!rowText) continue;
        
        const cols = rowText.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
        
        if (cols.length > Math.max(idxA, idxB, idxC, idxPhase)) { 
            let sId = parseInt(cols[idxId], 10);
            let a = parseFloat(cols[idxA]);
            let b = parseFloat(cols[idxB]);
            let c = parseFloat(cols[idxC]);
            let rawPhase = parseInt(cols[idxPhase], 10); 
            
            if (isNaN(sId)) sId = Math.floor(Math.random() * 9000);
            if (isNaN(a) || isNaN(b) || isNaN(c) || isNaN(rawPhase)) continue;

            if (rawPhase >= -1 && rawPhase <= 4) {
                newKnowns.push({ sampleid: sId, anion: Number(a.toFixed(4)), cation: Number(b.toFixed(4)), salt: Number(c.toFixed(4)), phase: rawPhase, owner_id: store.user?.id });
            }
        }
      }

      if (newKnowns.length > 0) {
          const uniqueToInsert = [];
          const seenIds = new Set(experiments.value.map(exp => exp.sampleId));

          for (let k of newKnowns) {
              if (!seenIds.has(k.sampleid)) {
                  uniqueToInsert.push(k);
                  seenIds.add(k.sampleid);
              }
          }

          if (uniqueToInsert.length > 0) {
              const { error } = await db.from('phase_data').insert(uniqueToInsert);
              if (!error) {
                  await fetchExperiments();
                  alert(`Successfully imported ${uniqueToInsert.length} historical data points into the Ledger!`);
              } else {
                  console.error("Supabase Error:", error);
                  alert("Error logging CSV data to Supabase. Check console.");
              }
          } else {
              alert("All tested points in this CSV are already loaded in the Ledger.");
          }
      } else {
          alert("No valid tested points (Phases 0-4) were found in the uploaded CSV.");
      }
    };
    
    reader.onerror = () => { alert("Failed to read the file."); };
    reader.readAsText(file);
  };
  
  input.click();
}

const calculateBoundary = async () => {
  const validExps = experiments.value.filter(e => e.phase !== -1);
  const phases = new Set(validExps.map(e => e.phase));
  if (phases.size < 2) {
      alert("You need multiple different phases logged to map a boundary.");
      return;
  }

  isCalculatingBoundary.value = true;
  try {
    const response = await fetch('https://experiment-backend-s71q.onrender.com/api/phase-boundary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: config.value, experiments: experiments.value })
    });
    
    if (!response.ok) throw new Error('Boundary calculation failed.');
    
    boundaryData.value = await response.json();
    renderPlot();
  } catch (err) {
    console.error(err);
    alert("Failed to calculate boundary. Ensure the backend is running.");
  } finally {
    isCalculatingBoundary.value = false;
  }
}

const calculateNextExperiments = async () => {
  isCalculating.value = true; 
  suggestions.value = []; 
  
  let maxId = 8999; 
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
        n_suggestions: config.value.numSuggestions || 96,
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

/* Plot Area */
.plot-area { height: 280px; background: #000; border-radius: 8px; border: 1px solid var(--border-color, #e2e8f0); padding: 5px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02); overflow: hidden; }

/* Buttons & Engine */
.action-btn { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: all 0.2s; border: none; font-size: 0.85rem; }
.auto-btn { background: #3b82f6; color: white; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3); }
.auto-btn:hover:not(:disabled) { background: #2563eb; transform: translateY(-1px); }
.clear-btn { background: transparent; border: none; color: #ef4444; cursor: pointer; padding: 2px; border-radius: 4px; }
.success-btn { background: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; }
.danger-btn { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid #ef4444; }
.danger-btn:hover { background: #ef4444; color: white; }

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
.well-id { font-size: 0.55rem; font-weight: bold; pointer-events: none; }

/* Utils */
.flex-between { display: flex; justify-content: space-between; align-items: center; }
.checkbox-label { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; cursor: pointer; color: #475569; font-weight: bold; }
.export-controls { display: flex; align-items: center; gap: 10px; }
.compact-select { width: 120px; padding: 4px; background: transparent; color: inherit; border: 1px solid var(--border-color, #475569); border-radius: 4px; font-size: 0.8rem; }
.compact-input { width: 60px; padding: 4px; background: transparent; color: inherit; border: 1px solid var(--border-color, #475569); border-radius: 4px; font-size: 0.8rem; text-align: center; }
</style>