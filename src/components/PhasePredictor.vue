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
              <label>Component A (Anion) <select :value="config.anionUnit" @change="changeUnit('anion', config.anionUnit, $event.target.value)" class="unit-select"><option v-for="u in unitOptions" :key="u" :value="u">{{ u }}</option></select></label>
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
                <input type="number" v-model="config.anionMin" @change="renderPlot" style="flex: 0.4;" :title="`Min (${config.anionUnit})`" placeholder="Min" />
                <input type="number" v-model="config.anionMax" @change="renderPlot" style="flex: 0.4;" :title="`Max (${config.anionUnit})`" placeholder="Max" />
                <input type="number" v-model="config.anionStep" @change="renderPlot" style="flex: 0.4;" :title="`Step (${config.anionUnit})`" placeholder="Step" />
                <input type="number" v-model="config.stockAnion" style="flex: 0.6;" :title="`Stock (${config.anionUnit})`" :placeholder="`Stock ${config.anionUnit}`" />
              </div>
            </div>
            
            <div class="input-group">
              <label>Component B (Cation) <select :value="config.cationUnit" @change="changeUnit('cation', config.cationUnit, $event.target.value)" class="unit-select"><option v-for="u in unitOptions" :key="u" :value="u">{{ u }}</option></select></label>
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
                <input type="number" v-model="config.cationMin" @change="renderPlot" style="flex: 0.4;" :title="`Min (${config.cationUnit})`" placeholder="Min" />
                <input type="number" v-model="config.cationMax" @change="renderPlot" style="flex: 0.4;" :title="`Max (${config.cationUnit})`" placeholder="Max" />
                <input type="number" v-model="config.cationStep" @change="renderPlot" style="flex: 0.4;" :title="`Step (${config.cationUnit})`" placeholder="Step" />
                <input type="number" v-model="config.stockCation" style="flex: 0.6;" :title="`Stock (${config.cationUnit})`" :placeholder="`Stock ${config.cationUnit}`" />
              </div>
            </div>
            
            <div class="input-group">
              <label>Component C (Salt/Buffer) <select :value="config.saltUnit" @change="changeUnit('salt', config.saltUnit, $event.target.value)" class="unit-select"><option v-for="u in unitOptions" :key="u" :value="u">{{ u }}</option></select></label>
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
                <input type="number" v-model="config.saltMin" @change="renderPlot" style="flex: 0.4;" :title="`Min (${config.saltUnit})`" placeholder="Min" />
                <input type="number" v-model="config.saltMax" @change="renderPlot" style="flex: 0.4;" :title="`Max (${config.saltUnit})`" placeholder="Max" />
                <input type="number" v-model="config.saltStep" @change="renderPlot" style="flex: 0.4;" :title="`Step (${config.saltUnit})`" placeholder="Step" />
                <input type="number" v-model="config.stockSalt" style="flex: 0.6;" :title="`Stock (${config.saltUnit})`" :placeholder="`Stock ${config.saltUnit}`" />
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
                  <th>A (<span class="unit-text">{{ config.anionUnit }}</span>)</th>
                  <th>B (<span class="unit-text">{{ config.cationUnit }}</span>)</th>
                  <th>C (<span class="unit-text">{{ config.saltUnit }}</span>)</th>
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
              <button class="small" @click="csvInputRef.click()" style="background: var(--summary-bg, #f1f5f9); color: inherit; border: 1px solid var(--border-color, #cbd5e1);">
                <i class="fas fa-file-csv"></i> Import CSV
              </button>
              <input type="file" ref="csvInputRef" accept=".csv" style="display: none" @change="onCsvFileSelected" />
            </div>
            <button class="small danger-btn" @click="clearLedger"><i class="fas fa-trash-alt"></i> Reset Memory</button>
          </div>
        </div>

        <!-- ── Platereader Import ── -->
        <div class="internal-section">
          <h3><i class="fas fa-microscope" style="font-size:0.85rem; opacity:0.65;"></i> Platereader Import</h3>

          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
            <button class="small" @click="prInputRef.click()">
              <i class="fas fa-upload"></i> Load Platereader CSV
            </button>
            <input type="file" ref="prInputRef" accept=".csv,.CSV,.txt" style="display:none" @change="onPlatereaderCsvSelected" />
            <span v-if="prODMap" style="font-size:0.75rem; color:var(--success-color,#10b981);">
              <i class="fas fa-check-circle"></i> {{ Object.keys(prODMap).length }} wells · max OD in first 5 min
            </span>
            <button v-if="prODMap" class="small danger-btn" @click="prODMap = null" style="padding:2px 8px;">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <!-- Wellplate picker — always visible so the user can link the plate before or after loading CSV -->
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px; font-size:0.8rem;">
            <label style="white-space:nowrap; font-weight:600;">Wellplate used:</label>
            <select v-model="prLinkedPlateId" style="font-size:0.8rem; padding:3px 6px; flex:1; min-width:120px;">
              <option :value="null">— none (positional fallback) —</option>
              <option v-for="p in prAvailablePlates" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <span v-if="prLinkedPlateId" style="color:var(--success-color,#10b981); white-space:nowrap;">
              <i class="fas fa-link"></i> {{ prMappedWellCount }} wells mapped
            </span>
          </div>

          <template v-if="prODMap">
            <!-- Show/filter control -->
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px; font-size:0.8rem;">
              <template v-if="!prLinkedPlateId">
                <label>Map to:</label>
                <select v-model="prMapSource" style="font-size:0.8rem; padding:3px 6px;">
                  <option value="untested">Untested (phase = –1)</option>
                  <option value="all">All experiments</option>
                </select>
                <label>Starting well:</label>
                <input type="text" v-model="prStartWell" maxlength="3" style="width:46px; font-size:0.8rem; padding:3px 6px; text-transform:uppercase;" placeholder="A1" />
              </template>
              <template v-else>
                <label>Import:</label>
                <select v-model="prMapSource" style="font-size:0.8rem; padding:3px 6px;">
                  <option value="untested">New + untested wells (skip already-classified)</option>
                  <option value="all">All matched wells (overwrite existing phase)</option>
                </select>
              </template>
            </div>

            <!-- OD → Phase legend -->
            <div style="display:flex; gap:6px; flex-wrap:wrap; font-size:0.7rem; margin-bottom:8px; padding:5px 8px; background:var(--summary-bg,#f1f5f9); border-radius:4px;">
              <span v-for="t in OD_THRESHOLDS" :key="t.phase" style="display:flex; align-items:center; gap:3px;">
                <span :style="{ display:'inline-block', width:'10px', height:'10px', borderRadius:'2px', background: getPhaseColor(t.phase, 0.35), border:`1px solid ${getPhaseColor(t.phase,1)}` }"></span>
                {{ t.label }}: {{ t.range }}
              </span>
            </div>

            <!-- 96-well preview grid -->
            <div style="margin-bottom:8px; user-select:none;">
              <div style="display:flex; margin-bottom:1px; padding-left:16px;">
                <div v-for="c in 12" :key="c" style="flex:1; text-align:center; font-size:0.58rem; opacity:0.55; font-weight:600;">{{ c }}</div>
              </div>
              <div v-for="(row, rIdx) in plateRows" :key="row" style="display:flex; align-items:center; margin-bottom:1px;">
                <div style="width:16px; font-size:0.6rem; font-weight:600; opacity:0.55; text-align:right; padding-right:3px;">{{ row }}</div>
                <div style="display:flex; flex:1; gap:1px;">
                  <div v-for="c in 12" :key="c"
                    :style="prWellStyle(row, c)"
                    :title="prWellTooltip(row, c)"
                    style="flex:1; aspect-ratio:1; border-radius:50%; border-width:1px; border-style:solid; cursor:default; min-width:0;">
                  </div>
                </div>
              </div>
            </div>

            <!-- Stats + import button -->
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <span style="font-size:0.75rem; opacity:0.8;">{{ prStatsText }}</span>
              <button class="small success-btn" @click="importPlatereaderResults" :disabled="!prPreviewItems.length">
                <i class="fas fa-check"></i> Apply ({{ prPreviewItems.length }} wells)
              </button>
            </div>
          </template>

          <p v-if="!prODMap" style="font-size:0.75rem; opacity:0.6; margin:4px 0 0;">
            Select the wellplate that was used, then load the plate-reader CSV.
            Concentrations are read directly from each well cell; OD determines the phase.
            Works even if the AI suggestions were never logged to the active learning.
          </p>
        </div>
      </div>

      <div class="col-right">
        <div class="internal-section" style="display: flex; flex-direction: column;">
          <div class="flex-between" style="margin-bottom: 10px;">
            <h3 style="margin: 0; border: none; padding: 0;">3. Phase Map ({{ fixedAxis ? '2D Slice + 3D' : '3D Space' }})</h3>
            <div style="display: flex; gap: 10px; align-items: center;">
              <span v-if="boundaryData" style="font-size: 0.75rem; opacity: 0.7;">
                {{ boundaryData.n_labeled }} pts · phases {{ boundaryData.phases_used?.join(', ') }}
              </span>
              <label v-if="boundaryData" class="checkbox-label">
                <input type="checkbox" v-model="showBoundary" @change="renderPlot"> Show Phase Boundaries
              </label>
              <button class="small" @click="calculateBoundary" :disabled="isCalculatingBoundary" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; border: 1px solid #3b82f6; margin: 0;">
                <i class="fas" :class="isCalculatingBoundary ? 'fa-spinner fa-spin' : 'fa-cube'"></i>
                {{ isCalculatingBoundary ? 'Modeling...' : 'Map Phase Boundaries' }}
              </button>
              <button class="small" @click="exportPlot" title="Export interactive 3D phase map as HTML (open in browser to rotate)" style="background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid #10b981; margin: 0;">
                <i class="fas fa-cube"></i> Export HTML
              </button>
            </div>
          </div>
          <div class="plot-area" :style="fixedAxis ? 'display:grid; grid-template-columns:38fr 62fr; gap:2px; overflow:hidden;' : ''">
            <div v-if="fixedAxis" id="phase-2d-plot" style="height:100%; min-width:0; overflow:hidden;"></div>
            <div id="phase-ternary-plot" :style="fixedAxis ? 'height:100%; min-width:0; overflow:hidden;' : 'width:100%; height:100%;'"></div>
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
import { esc } from '../utils/htmlSafe'
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
  anionName: 'Compound A', anionMin: 0, anionMax: 6, anionStep: 0.5, stockAnion: 100, anionUnit: 'mM', anionInv: null, anionSearchQuery: '', anionSearchScope: 'Global',
  cationName: 'Compound B', cationMin: 0, cationMax: 6, cationStep: 0.5, stockCation: 100, cationUnit: 'mM', cationInv: null, cationSearchQuery: '', cationSearchScope: 'Global',
  saltName: 'Compound C', saltMin: 0, saltMax: 200, saltStep: 10, stockSalt: 1000, saltUnit: 'mM', saltInv: null, saltSearchQuery: '', saltSearchScope: 'Global',
  targetVolume: 100,
  strategy: 'safe',
  numSuggestions: 96,
  minDistanceFactor: 0.05
})

// Detect when exactly one axis is collapsed (min === max) → show 2D slice alongside 3D
const fixedAxis = computed(() => {
  if (config.value.anionMin === config.value.anionMax) return 'anion'
  if (config.value.cationMin === config.value.cationMax) return 'cation'
  if (config.value.saltMin === config.value.saltMax) return 'salt'
  return null
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

const unitOptions = ['M', 'mM', 'µM', 'nM', 'mg/mL', 'µg/µL', 'ng/µL', 'X', '%']

// Inverse of getMM — convert a mM value back to a target unit (molar units only)
const MOLAR_UNITS = new Set(['M', 'mM', 'µM', 'nM'])
const fromMM = (valMM, unit) => {
    if (unit === 'M')  return valMM / 1000;
    if (unit === 'mM') return valMM;
    if (unit === 'µM') return valMM * 1000;
    if (unit === 'nM') return valMM * 1e6;
    return valMM; // non-molar units: leave as-is
}

const rescaleRange = (cfgMin, cfgMax, cfgStep, oldUnit, newUnit) => {
    if (!MOLAR_UNITS.has(oldUnit) || !MOLAR_UNITS.has(newUnit) || oldUnit === newUnit) return null;
    const decimals = newUnit === 'nM' ? 0 : newUnit === 'µM' ? 2 : 4;
    return {
        min:  +fromMM(getMM(cfgMin,  oldUnit), newUnit).toFixed(decimals),
        max:  +fromMM(getMM(cfgMax,  oldUnit), newUnit).toFixed(decimals),
        step: +fromMM(getMM(cfgStep, oldUnit), newUnit).toFixed(decimals)
    };
}

// Called when the user changes the unit selector manually — rescales all values.
const changeUnit = (type, oldUnit, newUnit) => {
    if (oldUnit === newUnit) return;
    const rescale = (min, max, step, stock) => {
        const range = rescaleRange(min, max, step, oldUnit, newUnit);
        let newStock = stock;
        if (MOLAR_UNITS.has(oldUnit) && MOLAR_UNITS.has(newUnit)) {
            const d = newUnit === 'nM' ? 0 : newUnit === 'µM' ? 2 : 4;
            newStock = +fromMM(getMM(stock, oldUnit), newUnit).toFixed(d);
        }
        return { range, newStock };
    };
    if (type === 'anion') {
        const { range, newStock } = rescale(config.value.anionMin, config.value.anionMax, config.value.anionStep, config.value.stockAnion);
        if (range) { config.value.anionMin = range.min; config.value.anionMax = range.max; config.value.anionStep = range.step; }
        config.value.stockAnion = newStock;
        config.value.anionUnit = newUnit;
    } else if (type === 'cation') {
        const { range, newStock } = rescale(config.value.cationMin, config.value.cationMax, config.value.cationStep, config.value.stockCation);
        if (range) { config.value.cationMin = range.min; config.value.cationMax = range.max; config.value.cationStep = range.step; }
        config.value.stockCation = newStock;
        config.value.cationUnit = newUnit;
    } else if (type === 'salt') {
        const { range, newStock } = rescale(config.value.saltMin, config.value.saltMax, config.value.saltStep, config.value.stockSalt);
        if (range) { config.value.saltMin = range.min; config.value.saltMax = range.max; config.value.saltStep = range.step; }
        config.value.stockSalt = newStock;
        config.value.saltUnit = newUnit;
    }
    renderPlot();
}

const selectInventory = (type, inv) => {
    const newUnit = inv.stockUnit || 'µM';
    if (type === 'anion') {
        const scaled = rescaleRange(config.value.anionMin, config.value.anionMax, config.value.anionStep, config.value.anionUnit, newUnit);
        if (scaled) { config.value.anionMin = scaled.min; config.value.anionMax = scaled.max; config.value.anionStep = scaled.step; }
        config.value.anionName = `[${inv.code}] ${inv.name}`;
        config.value.stockAnion = inv.stock;
        config.value.anionUnit = newUnit;
        config.value.anionInv = inv;
    } else if (type === 'cation') {
        const scaled = rescaleRange(config.value.cationMin, config.value.cationMax, config.value.cationStep, config.value.cationUnit, newUnit);
        if (scaled) { config.value.cationMin = scaled.min; config.value.cationMax = scaled.max; config.value.cationStep = scaled.step; }
        config.value.cationName = `[${inv.code}] ${inv.name}`;
        config.value.stockCation = inv.stock;
        config.value.cationUnit = newUnit;
        config.value.cationInv = inv;
    } else if (type === 'salt') {
        const scaled = rescaleRange(config.value.saltMin, config.value.saltMax, config.value.saltStep, config.value.saltUnit, newUnit);
        if (scaled) { config.value.saltMin = scaled.min; config.value.saltMax = scaled.max; config.value.saltStep = scaled.step; }
        config.value.saltName = `[${inv.code}] ${inv.name}`;
        config.value.stockSalt = inv.stock;
        config.value.saltUnit = newUnit;
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
        if (!inv) return `<strong>Unknown Component:</strong> ${esc(vol)} µL (${esc(targetConc)} mM)<br>`;
        return `&nbsp;<span class="inv-ref" contenteditable="false" data-labware=""><i class="fas fa-tag"></i>&nbsp;[${esc(inv.code)}] ${esc(inv.name)} (${esc(store.formatNum(inv.stock))} ${esc(inv.stockUnit || 'µM')})&nbsp;<i class="fas fa-times inv-ref-remove" style="cursor:pointer; margin-left:4px; opacity: 0.7;"></i></span>&nbsp; ${esc(vol)} µL (${esc(targetConc)} mM)<br>`;
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
          const pId = parseInt(phaseId, 10);
          // Skip Clear (0) — represents unstructured solution; no surface needed.
          // Other phases may be directly adjacent to each other without a Clear gap.
          if (pId === 0) return;

          const rawProb = [...boundaryData.value.probs[phaseId]];
          const maxProb = Math.max(...rawProb);
          if (maxProb < 0.3) return;

          const baseColor = phaseColors[pId] || 'rgba(148, 163, 184, 1)';
          const transparentColor = baseColor.replace('1)', '0.0)');
          const cScale = [ [0, transparentColor], [1, baseColor] ];

          const traceSurface = {
              type: 'isosurface',
              x: rawX,
              y: rawY,
              z: rawZ,
              value: rawProb,
              // Threshold 0.40 on the argmax-indicator (0/1) field after light Gaussian smoothing.
              // At a direct phase-phase boundary (no Clear in between), the smoothed indicator
              // for both phases is ~0.5 at the shared boundary voxels.  Using 0.40 ensures
              // both surfaces extend to include those voxels so they visually meet rather than
              // leaving a spurious gap.  Training points are well inside (field → 1) so they
              // remain enclosed regardless of threshold.
              isomin: 0.40,
              isomax: 1.0,
              surface: { show: true, count: 1 },
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
      xaxis: { range: [config.value.anionMin, config.value.anionMax], title: { text: `${config.value.anionName} (${config.value.anionUnit})`, font: { color: '#ffffff', size: 12 } }, backgroundcolor: "#000000", gridcolor: "#444444", showbackground: true, zerolinecolor: "#888888", tickfont: { color: '#dddddd', size: 10 } },
      yaxis: { range: [config.value.cationMin, config.value.cationMax], title: { text: `${config.value.cationName} (${config.value.cationUnit})`, font: { color: '#ffffff', size: 12 } }, backgroundcolor: "#000000", gridcolor: "#444444", showbackground: true, zerolinecolor: "#888888", tickfont: { color: '#dddddd', size: 10 } },
      zaxis: { range: [config.value.saltMin, config.value.saltMax], title: { text: `${config.value.saltName} (${config.value.saltUnit})`, font: { color: '#ffffff', size: 12 } }, backgroundcolor: "#000000", gridcolor: "#444444", showbackground: true, zerolinecolor: "#888888", tickfont: { color: '#dddddd', size: 10 } }
    },
    paper_bgcolor: '#000000',
    margin: { l: 0, r: fixedAxis.value ? 110 : 0, b: 0, t: 0 },
    showlegend: true,
    legend: fixedAxis.value
      ? { orientation: 'v', x: 1.02, xanchor: 'left', y: 0.5, yanchor: 'middle', font: { color: '#ffffff', size: 9 } }
      : { orientation: 'h', y: 0.05, x: 0.5, xanchor: 'center', font: { color: '#ffffff', size: 10 } }
  }

  Plotly.react('phase-ternary-plot', traces, layout, { displayModeBar: false, responsive: true })
  nextTick(() => render2DPlot())
}

const render2DPlot = () => {
  const plotDiv = document.getElementById('phase-2d-plot')
  if (!plotDiv || !fixedAxis.value) return

  const fixed = fixedAxis.value
  const [xKey, yKey] = ['anion', 'cation', 'salt'].filter(a => a !== fixed)
  const xLabel = `${config.value[xKey + 'Name']} (${config.value[xKey + 'Unit']})`
  const yLabel = `${config.value[yKey + 'Name']} (${config.value[yKey + 'Unit']})`
  const fixedLabel = `${config.value[fixed + 'Name']} = ${config.value[fixed + 'Min']} ${config.value[fixed + 'Unit']}`

  const classTraces = {}
  for (let i = 0; i <= 4; i++) {
    classTraces[i] = { type: 'scatter', mode: 'markers', x: [], y: [], text: [], name: phaseNames[i],
      marker: { color: phaseColors[i], size: 8, symbol: 'circle', line: { color: '#fff', width: 0.5 } } }
  }
  const traceUnknown = { type: 'scatter', mode: 'markers', x: [], y: [], text: [], name: 'Untested',
    marker: { color: '#94a3b8', size: 4, symbol: 'circle' } }
  const traceTarget = { type: 'scatter', mode: 'markers', x: [], y: [], text: [], name: 'AI Target',
    marker: { color: phaseColors[-1], size: 7, symbol: 'cross', line: { color: '#fff', width: 1 } } }

  const allData = [...experiments.value, ...suggestions.value]
  allData.forEach(exp => {
    const statusName = exp.phase === -1 ? 'AI Target' : (phaseNames[exp.phase] || `Phase ${exp.phase}`)
    const xVal = exp[xKey], yVal = exp[yKey]
    const label = `ID: ${exp.sampleId || 'Manual'} | ${statusName} | ${xLabel}: ${xVal} | ${yLabel}: ${yVal}`
    if (exp.phase >= 0 && exp.phase <= 4) {
      classTraces[exp.phase].x.push(xVal); classTraces[exp.phase].y.push(yVal); classTraces[exp.phase].text.push(label)
    } else if (exp.sampleId > 0 && !experiments.value.some(e => e.sampleId === exp.sampleId)) {
      traceTarget.x.push(xVal); traceTarget.y.push(yVal); traceTarget.text.push(label)
    } else {
      traceUnknown.x.push(xVal); traceUnknown.y.push(yVal); traceUnknown.text.push(label)
    }
  })

  const traces2d = [...Object.values(classTraces).filter(t => t.x.length > 0), traceUnknown, traceTarget]

  if (boundaryData.value && showBoundary.value && boundaryData.value.probs) {
    const bData = boundaryData.value
    const axisToArray = { anion: bData.x, cation: bData.y, salt: bData.z }
    const bxArr = axisToArray[xKey]
    const byArr = axisToArray[yKey]
    const fixedArr = axisToArray[fixed]

    // Pick the single grid value on the fixed axis closest to the actual fixed value.
    // This gives the exact same XY grid plane the 3D isosurface slices through.
    const targetVal = config.value[fixed + 'Min']
    const uniqueFixed = [...new Set(fixedArr)].sort((a, b) => a - b)
    const closestFixed = uniqueFixed.reduce((best, v) =>
      Math.abs(v - targetVal) < Math.abs(best - targetVal) ? v : best, uniqueFixed[0])
    const sliceIdx = []
    for (let i = 0; i < fixedArr.length; i++) {
      if (Math.abs(fixedArr[i] - closestFixed) < 1e-9) sliceIdx.push(i)
    }

    const uniqueX = [...new Set(sliceIdx.map(i => bxArr[i]))].sort((a, b) => a - b)
    const uniqueY = [...new Set(sliceIdx.map(i => byArr[i]))].sort((a, b) => a - b)

    Object.keys(bData.probs).forEach(phaseId => {
      const pId = parseInt(phaseId, 10)
      if (pId === 0) return
      const rawProb = bData.probs[phaseId]
      if (Math.max(...sliceIdx.map(i => rawProb[i])) < 0.3) return

      const probMap = {}
      for (const i of sliceIdx) probMap[`${bxArr[i]}_${byArr[i]}`] = rawProb[i]
      const zGrid = uniqueY.map(yv => uniqueX.map(xv => probMap[`${xv}_${yv}`] ?? 0))

      const baseColor = phaseColors[pId] || 'rgba(148, 163, 184, 1)'
      traces2d.unshift({
        type: 'heatmap',
        x: uniqueX,
        y: uniqueY,
        z: zGrid,
        showscale: false,
        showlegend: false,
        hoverinfo: 'none',
        zauto: false,
        zmin: 0,
        zmax: 1,
        zsmooth: 'best',
        colorscale: [[0, 'rgba(0,0,0,0)'], [0.399, 'rgba(0,0,0,0)'], [0.40, baseColor.replace('1)', '0.45)')], [1, baseColor.replace('1)', '0.45)')]]
      })
    })
  }

  const layout2d = {
    annotations: [{ text: fixedLabel, x: 0.5, y: 1.06, xref: 'paper', yref: 'paper', showarrow: false, font: { color: '#aaaaaa', size: 10 } }],
    xaxis: { title: { text: xLabel, font: { color: '#dddddd', size: 11 } }, color: '#dddddd', gridcolor: '#444444', zerolinecolor: '#888888', range: [config.value[xKey + 'Min'], config.value[xKey + 'Max']] },
    yaxis: { title: { text: yLabel, font: { color: '#dddddd', size: 11 } }, color: '#dddddd', gridcolor: '#444444', zerolinecolor: '#888888', range: [config.value[yKey + 'Min'], config.value[yKey + 'Max']] },
    paper_bgcolor: '#000000', plot_bgcolor: '#000000',
    margin: { l: 50, r: 10, b: 50, t: 30 },
    showlegend: false
  }
  Plotly.react('phase-2d-plot', traces2d, layout2d, { displayModeBar: false, responsive: true })
}

watch([experiments, suggestions, config], () => { renderPlot() }, { deep: true })

const fetchExperiments = async () => {
  if (!store.user?.id) return;
  const { data, error } = await db.from('phase_data').select('*').eq('owner_id', store.user.id);
  if (!error && data) {
      experiments.value = data.map(row => ({
          ...row,
          sampleId: row.sampleId ?? row.sampleid
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
  const payload = { sampleId: sug.sampleId, anion: sug.anion, cation: sug.cation, salt: sug.salt, phase: sug.phase, owner_id: store.user.id };
  const { error } = await db.from('phase_data').insert([payload]);
  if (!error) {
    await fetchExperiments();
    suggestions.value = suggestions.value.filter(s => s.sampleId !== sug.sampleId);
  }
}

const importAllSuggestions = async () => {
  if (!store.user?.id) return;
  const payload = suggestions.value.map(sug => ({
      sampleId: sug.sampleId, anion: sug.anion, cation: sug.cation, salt: sug.salt, phase: sug.phase, owner_id: store.user.id
  }));
  const { error } = await db.from('phase_data').insert(payload);
  if (!error) {
    await fetchExperiments();
    suggestions.value = [];
  } else {
    alert("Error logging AI targets to Supabase.");
  }
}

const csvInputRef = ref(null)

// ─── Platereader Import ────────────────────────────────────────────────────
const ALL_WELLS_96 = (() => {
  const rows = ['A','B','C','D','E','F','G','H']
  return rows.flatMap(r => [1,2,3,4,5,6,7,8,9,10,11,12].map(c => `${r}${c}`))
})()

const OD_THRESHOLDS = [
  { phase: 0, label: 'Clear',   range: '0 – 0.15',   max: 0.15 },
  { phase: 1, label: 'Phase 1', range: '0.15 – 0.3',  max: 0.30 },
  { phase: 2, label: 'Phase 2', range: '0.3 – 0.6',   max: 0.60 },
  { phase: 3, label: 'Phase 3', range: '0.6 – 0.9',   max: 0.90 },
  { phase: 4, label: 'Phase 4', range: '> 0.9',        max: Infinity },
]

const prInputRef = ref(null)
const prODMap     = ref(null)
const prMapSource = ref('untested')
const prStartWell = ref('A1')
const prLinkedPlateId = ref(null)

// All plates available for linking (workspace + cloud, deduplicated).
const prAvailablePlates = computed(() => {
  const all = [...(store.wellPlates || []), ...(store.cloudPlates || [])]
  const seen = new Set()
  return all.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true })
})

const prLinkedPlate = computed(() =>
  prAvailablePlates.value.find(p => p.id === prLinkedPlateId.value) || null
)

// Parse each well's HTML for sampleId AND concentrations written by exportSuggestionsToPlate.
// Format per well: "AI Target [9001]" … "5.50 µL (5.5 mM)" × 3 compounds
const prWellData = computed(() => {
  if (!prLinkedPlate.value) return {}
  const map = {}
  for (const [wellId, html] of Object.entries(prLinkedPlate.value.wells || {})) {
    if (!html) continue
    const sidMatch = html.match(/\[(\d+)\]/)
    if (!sidMatch) continue
    const sampleId = parseInt(sidMatch[1])
    // Match "X.XX µL (Y.YY mM)" — the target concentration after each inv-ref span.
    const concMatches = [...html.matchAll(/[\d.]+\s*µL\s*\(([\d.]+)\s*mM\)/g)]
    if (concMatches.length < 3) continue
    const [anion, cation, salt] = concMatches.slice(0, 3).map(m => parseFloat(m[1]))
    map[wellId] = { sampleId, anion, cation, salt }
  }
  return map
})

const prMappedWellCount = computed(() => Object.keys(prWellData.value).length)

const prSampleIdToExp = computed(() => {
  const map = {}
  for (const exp of experiments.value) map[String(exp.sampleId)] = exp
  return map
})

function odToPhase(od) {
  for (const t of OD_THRESHOLDS) { if (od < t.max) return t.phase }
  return 4
}

function parsePlatereaderCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return null
  const delim = lines[0].includes(';') ? ';' : ','
  // Strip non-ASCII (handles UTF-8 BOM and encoding artefacts like Â°)
  const rawHeaders = lines[0].split(delim).map(h => h.replace(/[^\x20-\x7E]/g, '').trim())
  const wellColIdx = {}
  rawHeaders.forEach((h, i) => { if (/^[A-H]\d{1,2}$/.test(h)) wellColIdx[h] = i })
  if (!Object.keys(wellColIdx).length) return null

  const wellData = {}
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delim)
    const parts = (cols[0] || '').trim().split(':')
    const timeMin = parts.length >= 2
      ? parseInt(parts[0] || 0) * 60 + parseInt(parts[1] || 0) + (parseInt(parts[2] || 0) / 60)
      : NaN
    if (isNaN(timeMin) || timeMin > 5.0) continue
    for (const [wId, cIdx] of Object.entries(wellColIdx)) {
      const od = parseFloat(cols[cIdx])
      if (!isNaN(od)) { if (!wellData[wId]) wellData[wId] = []; wellData[wId].push(od) }
    }
  }
  const maxOD = {}
  for (const [wId, vals] of Object.entries(wellData)) { if (vals.length) maxOD[wId] = Math.max(...vals) }
  return Object.keys(maxOD).length ? maxOD : null
}

const onPlatereaderCsvSelected = async (event) => {
  const file = event.target.files[0]; event.target.value = ''
  if (!file) return
  const result = parsePlatereaderCsv(await file.text())
  if (!result) { alert('Could not parse platereader CSV. Expected semicolon- or comma-delimited file with well columns (A1–H12) and time in HH:MM:SS format.'); return }
  prODMap.value = result
}

const prPreviewItems = computed(() => {
  if (!prODMap.value) return []

  // ── Plate-based mapping: concentrations come from wellplate HTML, OD from CSV ──
  if (prLinkedPlate.value) {
    const wellData  = prWellData.value
    const sidToExp  = prSampleIdToExp.value
    return Object.entries(prODMap.value)
      .map(([wellId, od]) => {
        const wd = wellData[wellId]
        if (!wd) return null                         // well has no parsed sampleId/conc
        const exp = sidToExp[String(wd.sampleId)]   // may be undefined if not yet logged
        // In "untested" mode skip wells whose existing experiment is already classified.
        if (prMapSource.value === 'untested' && exp && exp.phase !== -1) return null
        return { wellId, wd, exp: exp || null, od, newPhase: odToPhase(od) }
      })
      .filter(Boolean)
      .sort((a, b) => ALL_WELLS_96.indexOf(a.wellId) - ALL_WELLS_96.indexOf(b.wellId))
  }

  // ── Positional fallback (no plate linked) ──
  const sw = (prStartWell.value || 'A1').toUpperCase().trim()
  const m = sw.match(/^([A-H])(\d{1,2})$/)
  if (!m) return []
  const startOffset = (m[1].charCodeAt(0) - 65) * 12 + (parseInt(m[2]) - 1)
  const src = prMapSource.value === 'untested'
    ? experiments.value.filter(e => e.phase === -1)
    : [...experiments.value]
  src.sort((a, b) => Number(a.sampleId) - Number(b.sampleId))
  return src.map((exp, i) => {
    const idx = startOffset + i
    if (idx >= 96) return null
    const wellId = ALL_WELLS_96[idx]
    const od = prODMap.value[wellId]
    return od !== undefined ? { wellId, exp, od, newPhase: odToPhase(od) } : null
  }).filter(Boolean)
})

const prWellLookup = computed(() => {
  const map = {}; for (const item of prPreviewItems.value) map[item.wellId] = item; return map
})

const prWellStyle = (row, col) => {
  const item = prWellLookup.value[`${row}${col}`]
  return item
    ? { background: getPhaseColor(item.newPhase, 0.4), borderColor: getPhaseColor(item.newPhase, 1) }
    : { background: 'transparent', borderColor: 'var(--border-color,#e2e8f0)' }
}

const prWellTooltip = (row, col) => {
  const item = prWellLookup.value[`${row}${col}`]
  if (!item) return `${row}${col} — no data`
  const name = item.newPhase === 0 ? 'Clear' : `Phase ${item.newPhase}`
  const sid = item.wd?.sampleId ?? item.exp?.sampleId ?? '?'
  const conc = item.wd
    ? `A: ${item.wd.anion} · B: ${item.wd.cation} · C: ${item.wd.salt} mM`
    : ''
  const status = item.exp ? (item.exp.phase === -1 ? 'untested' : `phase ${item.exp.phase}`) : 'new'
  return `${row}${col} · Sample ${sid} (${status})\n${conc}\nOD = ${item.od.toFixed(4)}\n→ ${name}`
}

const prStatsText = computed(() => {
  const items = prPreviewItems.value
  if (!items.length) return 'No wells matched. Check the plate has AI Target cells.'
  const newCount = items.filter(i => !i.exp).length
  const updateCount = items.length - newCount
  const phaseCounts = {}
  for (const { newPhase } of items) {
    const n = newPhase === 0 ? 'Clear' : `Phase ${newPhase}`
    phaseCounts[n] = (phaseCounts[n] || 0) + 1
  }
  const phaseStr = Object.entries(phaseCounts).map(([n, c]) => `${c}× ${n}`).join(' · ')
  const actionStr = [newCount && `${newCount} new`, updateCount && `${updateCount} update`].filter(Boolean).join(', ')
  return `${phaseStr}  ·  ${actionStr}`
})

const importPlatereaderResults = async () => {
  const items = prPreviewItems.value
  if (!items.length) return
  let updated = 0, created = 0

  const toInsert = []
  for (const { exp, wd, newPhase } of items) {
    if (exp?.id) {
      // Experiment already in ledger — just update its phase.
      const { error } = await db.from('phase_data').update({ phase: newPhase }).eq('id', exp.id)
      if (!error) updated++
    } else if (wd) {
      // Experiment was never logged — create it now from wellplate concentrations.
      toInsert.push({
        sampleId: wd.sampleId,
        anion: wd.anion,
        cation: wd.cation,
        salt: wd.salt,
        phase: newPhase,
        owner_id: store.user?.id,
      })
    }
  }

  if (toInsert.length) {
    const { error } = await db.from('phase_data').insert(toInsert)
    if (!error) created = toInsert.length
  }

  await fetchExperiments(); renderPlot()
  prODMap.value = null
  const msg = [updated && `${updated} updated`, created && `${created} created`].filter(Boolean).join(', ')
  alert(`Platereader import complete: ${msg}.`)
}
// ──────────────────────────────────────────────────────────────────────────

const onCsvFileSelected = async (event) => {
  const file = event.target.files[0];
  // Reset so the same file can be re-uploaded later
  event.target.value = '';
  if (!file) return;

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) { alert('CSV file appears to be empty.'); return; }

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delimiter).map(s => s.trim().replace(/^﻿/, '').replace(/^["']|["']$/g, '').toLowerCase());

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
    if (!rowText) continue;

    const cols = rowText.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length <= Math.max(idxA, idxB, idxC, idxPhase)) continue;

    let sId = parseInt(cols[idxId], 10);
    const a = parseFloat(cols[idxA]);
    const b = parseFloat(cols[idxB]);
    const c = parseFloat(cols[idxC]);
    const rawPhase = parseInt(cols[idxPhase], 10);

    if (isNaN(sId)) sId = Math.floor(Math.random() * 9000);
    if (isNaN(a) || isNaN(b) || isNaN(c) || isNaN(rawPhase)) continue;
    if (rawPhase < -1 || rawPhase > 4) continue;

    const row = { sampleId: sId, anion: Number(a.toFixed(4)), cation: Number(b.toFixed(4)), salt: Number(c.toFixed(4)), phase: rawPhase };
    if (store.user?.id) row.owner_id = store.user.id;
    newKnowns.push(row);
  }

  if (newKnowns.length === 0) {
    alert('No valid rows found in the CSV. Check that columns Anion, Cation, Salt, Phase exist.');
    return;
  }

  const seenIds = new Set(experiments.value.map(exp => exp.sampleId));
  const uniqueToInsert = [];
  for (const k of newKnowns) {
    if (!seenIds.has(k.sampleId)) {
      uniqueToInsert.push(k);
      seenIds.add(k.sampleId);
    }
  }

  if (uniqueToInsert.length === 0) {
    alert('All rows in this CSV are already loaded in the Ledger.');
    return;
  }

  const { error } = await db.from('phase_data').insert(uniqueToInsert);
  if (!error) {
    await fetchExperiments();
    alert(`Successfully imported ${uniqueToInsert.length} data points into the Ledger!`);
  } else {
    console.error('Supabase insert error:', error);
    alert(`Import failed: ${error.message}`);
  }
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
    let sendConfig = config.value
    if (fixedAxis.value) {
      const fa = fixedAxis.value
      const fixedVal = config.value[fa + 'Min']
      const epsilon = Math.max(0.01, Math.abs(fixedVal) * 0.005)
      sendConfig = { ...config.value, [fa + 'Min']: fixedVal - epsilon, [fa + 'Max']: fixedVal + epsilon }
    }
    const response = await fetch('https://experiment-backend-s71q.onrender.com/api/phase-boundary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: sendConfig, experiments: experiments.value })
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

const exportPlot = () => {
  const plotDiv = document.getElementById('phase-ternary-plot')
  if (!plotDiv || !plotDiv.data) { alert('Nothing to export — generate the phase map first.'); return; }

  const date = new Date().toISOString().split('T')[0];
  const filename = `PhaseMap_${date}`;

  // Serialize live traces and layout into a standalone interactive HTML file.
  // Plotly 3D is rendered in WebGL so downloadImage only captures the SVG legend —
  // exporting as HTML preserves the full interactive 3D scene.
  const html = `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <title>${filename}</title>
  <script src="https://cdn.plot.ly/plotly-2.32.0.min.js"><\/script>
  <style>body{margin:0;background:#000;}#plot{width:100vw;height:100vh;}</style>
</head>
<body>
  <div id="plot"></div>
  <script>
    Plotly.newPlot('plot',
      ${JSON.stringify(plotDiv.data)},
      ${JSON.stringify(plotDiv.layout)},
      {responsive:true}
    );
  <\/script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}.html`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
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
.unit-select { display: inline-block; font-size: 0.7rem; font-weight: normal; text-transform: none; letter-spacing: 0; background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.35); border-radius: 3px; padding: 1px 3px; margin-left: 4px; cursor: pointer; width: auto; max-width: 80px; outline: none; vertical-align: middle; }
.unit-select option { text-transform: none; color: var(--text); background: var(--surface); }
.unit-text { text-transform: none; }
.input-group input { width: 100%; padding: 6px; border-radius: 4px; border: 1px solid var(--border-color, #cbd5e1); background: transparent; color: inherit; font-size: 0.85rem; }
.inventory-select-box { border: 1px solid var(--border-color, #cbd5e1); padding: 6px 10px; background: transparent; color: inherit; cursor: pointer; border-radius: 4px; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center; min-height: 32px; }

/* Dropdown */
.inventory-dropdown { position: absolute; top: 100%; left: 0; z-index: 1000; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2); width: 100%; min-width: 250px; border-radius: 6px; overflow: hidden; color: var(--text); }
.dropdown-scope-selector { display: flex; gap: 10px; padding: 8px; border-bottom: 1px solid var(--border); }
.dropdown-search { padding: 8px; display: flex; gap: 5px; border-bottom: 1px solid var(--border); }
.dropdown-search input { background: var(--input-bg) !important; color: var(--text) !important; border: 1px solid var(--border) !important; border-radius: 4px; padding: 5px 8px; font-size: 0.82rem; width: 100%; }
.dropdown-results { overflow-y: auto; max-height: 150px; background: var(--surface); }
.dropdown-item { padding: 8px 12px; cursor: pointer; font-size: 0.8rem; border-bottom: 1px solid var(--border); transition: background 0.2s; color: var(--text); }
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