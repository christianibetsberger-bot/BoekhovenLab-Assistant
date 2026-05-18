<template>
  <div class="card module-card" @click="activeExportInv = null">

    <!-- ── Header ── -->
    <div class="full-width-header">
      <div class="flex-between">
        <h2 style="display:flex; align-items:center; gap:10px; margin:0;">
          <i class="fas fa-dna"></i>
          <input
            type="text"
            v-model="dataset.name"
            placeholder="LIDA Kinetics Dataset"
            class="dataset-name-input"
          />
        </h2>
        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
          <label class="checkbox-label"><input type="radio" v-model="dataset.scope" value="Personal" /> Personal</label>
          <label class="checkbox-label"><input type="radio" v-model="dataset.scope" value="Global" /> Global</label>
          <button class="small success-btn" @click="saveToCloud" :disabled="!store.user">
            <i class="fas fa-cloud-arrow-up"></i> Save
          </button>
          <button class="small" @click="showLibrary = true">
            <i class="fas fa-folder-open"></i> Library
          </button>
          <button class="small" @click="archiveDataset" v-if="dataset.id" title="Move to Archive">
            <i class="fas fa-box-archive"></i>
          </button>
          <button class="small danger-btn" @click="newDataset" title="Start a fresh dataset">
            <i class="fas fa-file"></i> New
          </button>
        </div>
      </div>
      <p style="font-size:0.85rem; opacity:0.8; margin-top:5px;">
        Import time-course LIDA conversion data, fit replication-kinetics ODEs, and run METIS active learning to optimise reaction conditions and DNA sequences.
      </p>
    </div>

    <div class="layout-columns">

      <!-- ════ LEFT COLUMN ════ -->
      <div class="col-left">

        <!-- 1. Import / Template -->
        <div class="internal-section">
          <h3>1. Import / Template</h3>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="small" @click="downloadTemplate">
              <i class="fas fa-download"></i> Download Template
            </button>
            <input ref="csvFileInput" type="file" accept=".csv,.tsv,.txt" style="display:none" @change="onCsvFileSelected" />
            <button class="small success-btn" @click="$refs.csvFileInput.click()">
              <i class="fas fa-file-csv"></i> Import CSV
            </button>
            <button class="small danger-btn" @click="clearAll" v-if="dataset.experiments.length">
              <i class="fas fa-trash"></i> Clear All
            </button>
          </div>
          <div v-if="parseError" class="section-error">
            <i class="fas fa-triangle-exclamation"></i> {{ parseError }}
          </div>
          <div v-if="parseStats" class="section-info">
            <i class="fas fa-circle-check"></i> {{ parseStats }}
          </div>
        </div>

        <!-- 1b. HPLC Import -->
        <div class="internal-section">
          <h3>1b. HPLC Import</h3>

          <div class="hplc-toolbar">
            <input ref="hplcFileInput" type="file" accept=".txt,.TXT" multiple style="display:none" @change="onHplcFileSelected" />
            <button class="small success-btn" :disabled="isProcessingHplc" @click="$refs.hplcFileInput.click()">
              <i class="fas fa-vials"></i> Pick files
            </button>
            <button class="small" @click="downloadHplcTemplate" title="Download an example file with the correct filename">
              <i class="fas fa-file-arrow-down"></i> Template
            </button>
            <button class="small" @click="hplcShowSettings = !hplcShowSettings" :class="{ active: hplcShowSettings }">
              <i class="fas fa-sliders"></i> Settings
            </button>
            <div class="hplc-toolbar-spacer"></div>
            <button v-if="hplcResults.length" class="small" @click="applyHplcResultsToDataset">
              <i class="fas fa-arrow-right-to-bracket"></i> Append
            </button>
            <button v-if="hplcResults.length" class="small danger-btn" @click="discardHplcResults">
              <i class="fas fa-times"></i> Discard
            </button>
          </div>

          <div class="hplc-schema">
            <span class="hplc-schema-example">
              e.g. <code>ATCGATCG_AB_CGATCGAT_S1-30.txt</code>
              <span class="no-upper" style="opacity:0.7;">— seq · _ReplicatorName_ · seq · S/U · rep · t (min) &nbsp;(AB, EB, Dzeta, …)</span>
            </span>
            <span v-if="isProcessingHplc" class="hplc-status"><i class="fas fa-spinner fa-spin"></i> {{ hplcProgress }}</span>
            <span v-else-if="hplcProgress" class="hplc-status">{{ hplcProgress }}</span>
          </div>

          <!-- Settings drawer -->
          <div v-if="hplcShowSettings" class="hplc-settings">
            <details open>
              <summary>Scan &amp; detection</summary>
              <div class="grid-3-col">
                <div class="input-group">
                  <label>RT&nbsp;min <span class="no-upper">(min)</span></label>
                  <input type="number" step="0.1" v-model.number="hplcSettings.scanMin">
                </div>
                <div class="input-group">
                  <label>RT&nbsp;max <span class="no-upper">(min)</span></label>
                  <input type="number" step="0.1" v-model.number="hplcSettings.scanMax">
                </div>
                <div class="input-group">
                  <label>Prominence</label>
                  <input type="number" step="0.01" v-model.number="hplcSettings.prominence">
                </div>
                <div class="input-group">
                  <label>Baseline <span class="no-upper">(min)</span></label>
                  <input type="number" step="0.1" v-model.number="hplcSettings.baselineWindow">
                </div>
              </div>
            </details>

            <details>
              <summary>Beer–Lambert</summary>
              <div class="grid-3-col">
                <div class="input-group">
                  <label>Pathlength <span class="no-upper">(cm)</span></label>
                  <input type="number" step="0.01" v-model.number="hplcSettings.pathLength_cm">
                </div>
                <div class="input-group">
                  <label>Injection <span class="no-upper">(µL)</span></label>
                  <input type="number" step="0.1" v-model.number="hplcSettings.injection_uL">
                </div>
                <div class="input-group">
                  <label>Flow rate <span class="no-upper">(mL/min)</span></label>
                  <input type="number" step="0.01" v-model.number="hplcSettings.flow_mL_min">
                </div>
                <div class="input-group">
                  <label>Solvent corr.</label>
                  <input type="number" step="0.001" v-model.number="hplcSettings.solventCorrection">
                </div>
                <div class="input-group">
                  <label>Aliquot <span class="no-upper">(µL)</span></label>
                  <input type="number" step="0.1" v-model.number="hplcSettings.aliquot_uL">
                </div>
                <div class="input-group">
                  <label>Vial total <span class="no-upper">(µL)</span></label>
                  <input type="number" step="0.1" v-model.number="hplcSettings.vial_uL">
                </div>
              </div>
              <div class="grid-2-col" style="margin-top:6px;">
                <div class="input-group" title="Auto = vial / aliquot. Leave override blank to use auto.">
                  <label>Dilution factor <span class="no-upper">(auto = {{ hplcDilutionFactor.toFixed(2) }})</span></label>
                  <input type="number" step="0.01" v-model.number="hplcSettings.dilutionOverride" placeholder="auto">
                </div>
                <div class="input-group">
                  <label>R<sub>max</sub> <span class="no-upper">(µM)</span></label>
                  <input type="number" step="0.01" v-model.number="hplcSettings.rMax_uM">
                </div>
              </div>
            </details>

            <details>
              <summary>Peak assignment</summary>
              <div style="display:flex; gap:14px; font-size:0.8rem;">
                <label class="radio-inline"><input type="radio" :value="true"  v-model="hplcSettings.earliestPeakIsAprime"> earliest = A'B'</label>
                <label class="radio-inline"><input type="radio" :value="false" v-model="hplcSettings.earliestPeakIsAprime"> earliest = AB</label>
              </div>
            </details>

            <details>
              <summary>Batch conditions <span class="no-upper" style="opacity:0.6; font-weight:normal;">(applied to every file)</span></summary>
              <div class="grid-3-col">
                <div class="input-group">
                  <label>T <span class="no-upper">(°C)</span></label>
                  <input type="number" step="0.1" v-model.number="hplcBatchConditions.temperature">
                </div>
                <div class="input-group">
                  <label>Ligase</label>
                  <input type="number" step="any" v-model.number="hplcBatchConditions.ligase">
                </div>
                <div class="input-group">
                  <label>ATP</label>
                  <input type="number" step="any" v-model.number="hplcBatchConditions.atp">
                </div>
                <div class="input-group">
                  <label><span class="no-upper">Mg²⁺</span></label>
                  <input type="number" step="any" v-model.number="hplcBatchConditions.mg2">
                </div>
                <div class="input-group">
                  <label>Env</label>
                  <input type="text" v-model="hplcBatchConditions.env">
                </div>
              </div>
            </details>
          </div>

          <!-- Product window inputs -->
          <div v-if="hplcResults.length" class="hplc-window">
            <span class="hplc-window-label"><i class="fas fa-compress-arrows-alt"></i> Product window</span>
            <div class="hplc-window-inputs">
              <label class="no-upper">RT min (min)
                <input type="number" step="0.05" v-model.number="hplcSettings.productMin">
              </label>
              <span class="hplc-window-dash">–</span>
              <label class="no-upper">RT max (min)
                <input type="number" step="0.05" v-model.number="hplcSettings.productMax">
              </label>
            </div>
          </div>

          <!-- Skipped files -->
          <div v-if="hplcSkipped.length" class="hplc-skipped">
            <strong>{{ hplcSkipped.length }} skipped</strong>
            <ul>
              <li v-for="s in hplcSkipped" :key="s.name">{{ s.name }} — {{ s.reason }}</li>
            </ul>
          </div>

          <!-- Preview table -->
          <div v-if="hplcResults.length" class="hplc-preview">
            <table>
              <thead>
                <tr>
                  <th class="left">File</th>
                  <th>Rep</th>
                  <th class="no-upper"><span class="no-upper">t (min)</span></th>
                  <th class="no-upper"><span class="no-upper">Area AB</span></th>
                  <th class="no-upper"><span class="no-upper">c AB (µM)</span></th>
                  <th class="no-upper"><span class="no-upper">Area A'B'</span></th>
                  <th class="no-upper"><span class="no-upper">c A'B' (µM)</span></th>
                  <th class="no-upper"><span class="no-upper">[R] (µM)</span></th>
                  <th class="no-upper"><span class="no-upper">Conv. %</span></th>
                  <th class="no-upper" style="border-left:2px solid var(--border-color,#e2e8f0);"><span class="no-upper">T (°C)</span></th>
                  <th class="no-upper"><span class="no-upper">Ligase</span></th>
                  <th class="no-upper"><span class="no-upper">ATP (mM)</span></th>
                  <th class="no-upper"><span class="no-upper">Mg²⁺ (mM)</span></th>
                  <th class="no-upper"><span class="no-upper">Env</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in hplcDerived" :key="r.name" :class="{ 'row-error': r.error }">
                  <td class="left filename" :title="r.name">{{ r.name }}</td>
                  <td>{{ r.meta?.replicate ?? '' }}</td>
                  <td>{{ r.meta?.time ?? '' }}</td>
                  <td>{{ r.abPeak ? r.abPeak.area_mAU_min.toFixed(3) : '—' }}</td>
                  <td>{{ r.cAB_uM.toFixed(3) }}</td>
                  <td>{{ r.abPrimePeak ? r.abPrimePeak.area_mAU_min.toFixed(3) : '—' }}</td>
                  <td>{{ r.cABp_uM.toFixed(3) }}</td>
                  <td><strong>{{ r.R_uM.toFixed(3) }}</strong></td>
                  <td>{{ r.conversion.toFixed(1) }}</td>
                  <template v-if="hplcFileConditions[r.name]">
                    <td style="border-left:2px solid var(--border-color,#e2e8f0);">
                      <input type="number" step="0.5" class="cond-input" v-model.number="hplcFileConditions[r.name].temperature">
                    </td>
                    <td><input type="number" step="any" class="cond-input" v-model.number="hplcFileConditions[r.name].ligase"></td>
                    <td><input type="number" step="any" class="cond-input" v-model.number="hplcFileConditions[r.name].atp"></td>
                    <td><input type="number" step="any" class="cond-input" v-model.number="hplcFileConditions[r.name].mg2"></td>
                    <td>
                      <select class="cond-select" v-model="hplcFileConditions[r.name].env">
                        <option value="seeded">Seeded</option>
                        <option value="unseeded">Unseeded</option>
                        <option value="none">—</option>
                      </select>
                    </td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 2. CSV Concentration Units & Initial Conditions -->
        <div class="internal-section">
          <h3>2. CSV Units &amp; Initial Conditions</h3>

          <div class="sub-label">Concentration unit used in your CSV columns</div>
          <div class="grid-3-col">
            <div class="input-group">
              <label>T4-Ligase</label>
              <select v-model="dataset.units.ligase">
                <option value="nM">nM</option>
                <option value="µM">µM</option>
                <option value="mM">mM</option>
                <option value="M">M</option>
                <option value="U/µL">U/µL (activity)</option>
              </select>
            </div>
            <div class="input-group">
              <label>ATP</label>
              <select v-model="dataset.units.atp">
                <option value="nM">nM</option>
                <option value="µM">µM</option>
                <option value="mM">mM</option>
                <option value="M">M</option>
              </select>
            </div>
            <div class="input-group">
              <label><span class="no-upper">Mg²⁺</span></label>
              <select v-model="dataset.units.mg2">
                <option value="nM">nM</option>
                <option value="µM">µM</option>
                <option value="mM">mM</option>
                <option value="M">M</option>
              </select>
            </div>
          </div>

          <div class="sub-label" style="margin-top:10px;">Initial concentrations for ODE fit <span style="opacity:0.7;">(all in µM)</span></div>
          <div class="grid-3-col">
            <div class="input-group" title="Max yieldable [R] in µM. 100% conversion corresponds to this concentration.">
              <label>Max Yield [R]<sub>max</sub></label>
              <input type="number" step="any" min="0" v-model.number="dataset.kinetics.limit_uM" />
            </div>
            <div class="input-group" title="Initial [A] = [a]. Default 2.8 µM.">
              <label>A₀ initial</label>
              <input type="number" step="any" min="0" v-model.number="dataset.kinetics.A0" />
            </div>
            <div class="input-group" title="Initial [B] = [b]. Default 1.4 µM.">
              <label>B₀ initial</label>
              <input type="number" step="any" min="0" v-model.number="dataset.kinetics.B0" />
            </div>
          </div>
        </div>

        <!-- 3. Condition Ranges -->
        <div class="internal-section">
          <h3>3. Condition Ranges</h3>
          <div class="grid-2-col">
            <div class="input-group">
              <label>Temperature (°C)</label>
              <div class="range-inputs">
                <input type="number" step="any" v-model.number="dataset.config.ranges.tMin" placeholder="Min" />
                <input type="number" step="any" v-model.number="dataset.config.ranges.tMax" placeholder="Max" />
              </div>
            </div>
            <div class="input-group">
              <label>T4-Ligase <span class="no-upper">({{ dataset.units.ligase }})</span></label>
              <div class="range-inputs">
                <input type="number" step="any" v-model.number="dataset.config.ranges.ligaseMin" placeholder="Min" />
                <input type="number" step="any" v-model.number="dataset.config.ranges.ligaseMax" placeholder="Max" />
              </div>
            </div>
            <div class="input-group">
              <label>ATP <span class="no-upper">({{ dataset.units.atp }})</span></label>
              <div class="range-inputs">
                <input type="number" step="any" v-model.number="dataset.config.ranges.atpMin" placeholder="Min" />
                <input type="number" step="any" v-model.number="dataset.config.ranges.atpMax" placeholder="Max" />
              </div>
            </div>
            <div class="input-group">
              <label><span class="no-upper">Mg²⁺ ({{ dataset.units.mg2 }})</span></label>
              <div class="range-inputs">
                <input type="number" step="any" v-model.number="dataset.config.ranges.mg2Min" placeholder="Min" />
                <input type="number" step="any" v-model.number="dataset.config.ranges.mg2Max" placeholder="Max" />
              </div>
            </div>
          </div>
        </div>

        <!-- 4. Active Learning Engine -->
        <div class="internal-section">
          <h3>4. Active Learning Engine</h3>

          <div class="al-config-box">
            <div class="al-grid-3">
              <div class="al-input">
                <label>Suggestions</label>
                <input type="number" min="1" max="96" v-model.number="dataset.config.nSuggestions" />
              </div>
              <div class="al-input">
                <label>Ensemble</label>
                <input type="number" min="5" max="50" step="5" v-model.number="dataset.config.ensembleSize" />
              </div>
              <div class="al-input">
                <label>Pool size</label>
                <input type="number" min="500" max="20000" step="500" v-model.number="dataset.config.poolSize" />
              </div>
            </div>

            <div class="slider-row">
              <span class="slider-label">κ (UCB)</span>
              <input type="range" min="0" max="3" step="0.05" v-model.number="dataset.config.explorationCoeff" class="slider-input" />
              <span class="slider-value">{{ (dataset.config.explorationCoeff ?? 1.41).toFixed(2) }}</span>
              <span class="slider-hint">{{ (dataset.config.explorationCoeff ?? 1.41) === 0 ? 'exploit' : (dataset.config.explorationCoeff ?? 1.41) >= 3 ? 'explore' : 'balanced' }}</span>
            </div>

            <div class="slider-row">
              <span class="slider-label">Logo top</span>
              <input type="range" min="0" max="100" step="5" v-model.number="dataset.config.yieldThreshold" class="slider-input" />
              <span class="slider-value">{{ 100 - dataset.config.yieldThreshold }}%</span>
              <span class="slider-hint">of groups</span>
            </div>
          </div>

          <div class="engine-row" title="Where the ODE fit runs. Local uses Pyodide in your browser (faster, no server queue, ~12 MB first-load). Server uses Render. Auto tries Local first.">
            <span class="engine-label">Fit engine</span>
            <label class="engine-opt"><input type="radio" v-model="dataset.config.fitEngine" value="auto" /> Auto</label>
            <label class="engine-opt"><input type="radio" v-model="dataset.config.fitEngine" value="local" /> Local (browser)</label>
            <label class="engine-opt"><input type="radio" v-model="dataset.config.fitEngine" value="server" /> Server (Render)</label>
          </div>

          <div class="action-row">
            <button class="compact-btn" @click="fitKinetics" :disabled="isFitting || !dataset.experiments.length">
              <i class="fas" :class="isFitting ? 'fa-spinner fa-spin' : 'fa-chart-line'"></i>
              {{ isFitting ? 'Fitting…' : 'Fit Kinetics' }}
            </button>
            <button class="compact-btn" @click="suggestNext" :disabled="isSuggesting || !dataset.experiments.length">
              <i class="fas" :class="isSuggesting ? 'fa-spinner fa-spin' : 'fa-lightbulb'"></i>
              {{ isSuggesting ? 'Computing…' : 'Suggest Next' }}
            </button>
            <button class="compact-btn" @click="predictSequence" :disabled="isPredicting || !dataset.experiments.length">
              <i class="fas" :class="isPredicting ? 'fa-spinner fa-spin' : 'fa-shuffle'"></i>
              {{ isPredicting ? 'Predicting…' : 'Predict Sequences' }}
            </button>
          </div>

          <div v-if="backendError" class="section-error" style="margin-top:8px;">
            <i class="fas fa-triangle-exclamation"></i> {{ backendError }}
          </div>
          <div v-if="fitNote" class="section-warn" style="margin-top:8px;">
            <i class="fas fa-circle-info"></i> {{ fitNote }}
          </div>
        </div>

        <!-- 5. Experiment Ledger -->
        <div class="internal-section" style="flex-grow:1;">
          <h3>5. Experiment Ledger ({{ dataset.experiments.length }})</h3>
          <div class="ledger-table-container">
            <table class="ledger-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Sequence</th>
                  <th>T °C</th>
                  <th>Lig</th>
                  <th>ATP</th>
                  <th><span class="no-upper">Mg²⁺</span></th>
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
                      <i class="fas fa-check" style="color:#10b981;"></i>
                    </span>
                    <span v-else style="opacity:0.4;">—</span>
                  </td>
                  <td>
                    <button class="clear-btn" @click="removeGroup(i)" title="Remove group">
                      <i class="fas fa-trash"></i>
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
        </div>

      </div>

      <!-- ════ RIGHT COLUMN ════ -->
      <div class="col-right">

        <!-- Plots: Kinetic Curves + Heatmap side by side -->
        <div class="internal-section">
          <div class="plots-row">

            <!-- Kinetic Curves -->
            <div class="plot-col">
              <div class="plot-col-header">
                <span class="plot-title">Kinetic Curves</span>
              </div>
              <div ref="curvePlotEl" class="plot-area"></div>
              <!-- External legend -->
              <div class="plot-legend" v-if="dataset.experiments.length">
                <div class="legend-item" v-for="(g, i) in dataset.experiments" :key="g.groupId">
                  <span class="legend-dot" :style="{ background: PASTEL_COLORS[i % PASTEL_COLORS.length] }"></span>
                  <span class="legend-label" :title="g.sequence">
                    {{ truncateSeq(g.sequence) }} · {{ formatNum(g.conditions.temperature) }}°C
                  </span>
                  <span class="legend-val">
                    {{ formatNum(g.maxConversion) }}%
                    <i v-if="g.fit && g.fit.ku != null" class="fas fa-check" style="color:#10b981; font-size:0.65rem; margin-left:2px;"></i>
                  </span>
                </div>
              </div>
            </div>

            <!-- Condition Heatmap -->
            <div class="plot-col">
              <div class="plot-col-header flex-between">
                <span class="plot-title">Heatmap</span>
                <div style="display:flex; gap:3px; align-items:center; font-size:0.72rem;">
                  <label style="opacity:0.7;">X</label>
                  <select v-model="heatX" class="axis-select">
                    <option value="temperature">T °C</option>
                    <option value="ligase">Lig</option>
                    <option value="atp">ATP</option>
                    <option value="mg2">Mg²⁺</option>
                  </select>
                  <label style="opacity:0.7;">Y</label>
                  <select v-model="heatY" class="axis-select">
                    <option value="temperature">T °C</option>
                    <option value="ligase">Lig</option>
                    <option value="atp">ATP</option>
                    <option value="mg2">Mg²⁺</option>
                  </select>
                </div>
              </div>
              <div ref="heatPlotEl" class="plot-area"></div>
            </div>

          </div>
        </div>

        <!-- Sequence Logos: observed (top yield) + predicted (METIS) -->
        <div class="internal-section">
          <div class="logos-row">
            <div class="logo-col">
              <div class="logo-col-header">Observed (top {{ 100 - dataset.config.yieldThreshold }}%)</div>
              <div v-if="logoWarning" class="section-warn">
                <i class="fas fa-circle-info"></i> {{ logoWarning }}
              </div>
              <div ref="logoEl" class="logo-wrap" v-html="logoSvg"></div>
              <div v-if="!logoSvg" class="logo-empty">No experiments yet.</div>
            </div>
            <div class="logo-col">
              <div class="logo-col-header">Predicted (METIS top-{{ seqCandidates.length || '?' }})</div>
              <div class="logo-wrap" v-html="predictedLogoSvg"></div>
              <div v-if="!predictedLogoSvg" class="logo-empty">
                Run <strong>Predict Sequences</strong> to generate.
              </div>
            </div>
          </div>
        </div>

        <!-- Suggested Next Experiments -->
        <div class="internal-section">
          <h3>Suggested Next Experiments</h3>
          <div v-if="suggestNote" class="section-warn" style="margin-bottom:8px;">
            <i class="fas fa-circle-info"></i> {{ suggestNote }}
          </div>
          <div v-if="!aiSuggestions.length && !suggestNote" style="opacity:0.5; font-size:0.8rem; padding:8px 0;">
            Click <strong>Suggest Next</strong> to run METIS active learning on your data.
          </div>
          <div v-if="aiSuggestions.length" style="max-height:220px; overflow-y:auto; padding-right:4px;">
            <div class="suggestion-card" v-for="(s, i) in aiSuggestions" :key="i">
              <div class="flex-between">
                <div>
                  <span class="sug-id">#{{ i + 1 }}</span>
                  <span class="sug-seq" :title="s.sequence">{{ s.sequence }}</span>
                  <span v-if="seqNameOf(s.sequence)" class="sug-name">{{ seqNameOf(s.sequence) }}</span>
                </div>
                <span style="font-size:0.78rem; color:var(--primary, #3b82f6); font-weight:bold;">
                  {{ formatNum(s.predicted_conversion) }}%
                </span>
              </div>
              <div style="font-size:0.72rem; opacity:0.75; margin-top:3px;">
                T: {{ formatNum(s.conditions.temperature) }}°C ·
                Lig: {{ formatNum(s.conditions.ligase) }} ·
                ATP: {{ formatNum(s.conditions.atp) }} ·
                <span class="no-upper">Mg²⁺</span>: {{ formatNum(s.conditions.mg2) }} ·
                Env: {{ s.conditions.env }}
                <span style="opacity:0.7;"> · ±{{ formatNum(s.uncertainty) }}</span>
              </div>
            </div>
          </div>

          <!-- Send to Wellplate — always shown when experiments are loaded so
               stocks can be pre-configured before running Suggest Next -->
          <div v-if="dataset.experiments.length" class="wellplate-export">
            <div class="wellplate-export-header">
              <i class="fas fa-flask-vial"></i> Send to Wellplate
            </div>
            <p class="wellplate-export-hint">
              Configure stocks here at any time. DNA building blocks appear automatically when sequences have a <strong>Name</strong> column (e.g. "Eβ"). Volume formula: <code>V = target × wellVol / stock</code>; MQ H₂O fills the rest. Run <strong>Suggest Next</strong> to unlock the Send button.
            </p>

            <div class="wellplate-stock-grid">
              <!-- Inventory scope toggle — applies to all stock dropdowns in this panel -->
              <div class="stock-scope-row">
                <span class="stock-scope-label">Inventory:</span>
                <label class="scope-opt" :class="{ active: exportInvScope === 'Global' }">
                  <input type="radio" value="Global" v-model="exportInvScope" /> Global
                </label>
                <label class="scope-opt" :class="{ active: exportInvScope === 'Personal' }">
                  <input type="radio" value="Personal" v-model="exportInvScope" /> Personal
                </label>
              </div>

              <!-- T4-Ligase -->
              <div class="stock-row">
                <label>T4-Ligase stock</label>
                <div class="stock-input-row">
                  <input type="number" step="any" v-model.number="exportStocks.ligase" :placeholder="`stock conc (${dataset.units.ligase})`" />
                  <span class="stock-unit">{{ dataset.units.ligase }}</span>
                  <div class="inv-picker" @click.stop>
                    <button class="inv-pick-btn" @click="activeExportInv = activeExportInv === 'ligase' ? null : 'ligase'">
                      <i class="fas fa-tag"></i>
                      {{ exportStocks.ligaseInv ? `[${exportStocks.ligaseInv.code}] ${exportStocks.ligaseInv.name}` : 'Inventory…' }}
                    </button>
                    <button v-if="exportStocks.ligaseInv" class="inv-clear-btn" @click="clearExportInv('ligase')" title="Clear">
                      <i class="fas fa-xmark"></i>
                    </button>
                    <div v-if="activeExportInv === 'ligase'" class="inv-dropdown">
                      <input type="text" v-model="exportInvSearch.ligase" placeholder="Search inventory…" @click.stop />
                      <div class="inv-results">
                        <div
                          v-for="inv in filterExportInventory(exportInvSearch.ligase)"
                          :key="inv.id"
                          class="inv-item"
                          @mousedown.prevent="selectExportInv('ligase', inv)"
                        >
                          [{{ inv.code }}] {{ inv.name }} <span class="inv-stock">({{ inv.stock }} {{ inv.stockUnit || '?' }})</span>
                        </div>
                        <div v-if="!filterExportInventory(exportInvSearch.ligase).length" class="inv-empty">No items.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- ATP -->
              <div class="stock-row">
                <label>ATP stock</label>
                <div class="stock-input-row">
                  <input type="number" step="any" v-model.number="exportStocks.atp" :placeholder="`stock conc (${dataset.units.atp})`" />
                  <span class="stock-unit">{{ dataset.units.atp }}</span>
                  <div class="inv-picker" @click.stop>
                    <button class="inv-pick-btn" @click="activeExportInv = activeExportInv === 'atp' ? null : 'atp'">
                      <i class="fas fa-tag"></i>
                      {{ exportStocks.atpInv ? `[${exportStocks.atpInv.code}] ${exportStocks.atpInv.name}` : 'Inventory…' }}
                    </button>
                    <button v-if="exportStocks.atpInv" class="inv-clear-btn" @click="clearExportInv('atp')" title="Clear">
                      <i class="fas fa-xmark"></i>
                    </button>
                    <div v-if="activeExportInv === 'atp'" class="inv-dropdown">
                      <input type="text" v-model="exportInvSearch.atp" placeholder="Search inventory…" @click.stop />
                      <div class="inv-results">
                        <div
                          v-for="inv in filterExportInventory(exportInvSearch.atp)"
                          :key="inv.id"
                          class="inv-item"
                          @mousedown.prevent="selectExportInv('atp', inv)"
                        >
                          [{{ inv.code }}] {{ inv.name }} <span class="inv-stock">({{ inv.stock }} {{ inv.stockUnit || '?' }})</span>
                        </div>
                        <div v-if="!filterExportInventory(exportInvSearch.atp).length" class="inv-empty">No items.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Mg²⁺ -->
              <div class="stock-row">
                <label><span class="no-upper">Mg²⁺</span> stock</label>
                <div class="stock-input-row">
                  <input type="number" step="any" v-model.number="exportStocks.mg2" :placeholder="`stock conc (${dataset.units.mg2})`" />
                  <span class="stock-unit">{{ dataset.units.mg2 }}</span>
                  <div class="inv-picker" @click.stop>
                    <button class="inv-pick-btn" @click="activeExportInv = activeExportInv === 'mg2' ? null : 'mg2'">
                      <i class="fas fa-tag"></i>
                      {{ exportStocks.mg2Inv ? `[${exportStocks.mg2Inv.code}] ${exportStocks.mg2Inv.name}` : 'Inventory…' }}
                    </button>
                    <button v-if="exportStocks.mg2Inv" class="inv-clear-btn" @click="clearExportInv('mg2')" title="Clear">
                      <i class="fas fa-xmark"></i>
                    </button>
                    <div v-if="activeExportInv === 'mg2'" class="inv-dropdown">
                      <input type="text" v-model="exportInvSearch.mg2" placeholder="Search inventory…" @click.stop />
                      <div class="inv-results">
                        <div
                          v-for="inv in filterExportInventory(exportInvSearch.mg2)"
                          :key="inv.id"
                          class="inv-item"
                          @mousedown.prevent="selectExportInv('mg2', inv)"
                        >
                          [{{ inv.code }}] {{ inv.name }} <span class="inv-stock">({{ inv.stock }} {{ inv.stockUnit || '?' }})</span>
                        </div>
                        <div v-if="!filterExportInventory(exportInvSearch.mg2).length" class="inv-empty">No items.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- DNA Building Blocks — sourced from all imported experiments -->
              <template v-if="exportBuildingBlocks.aside.length || exportBuildingBlocks.bside.length">
                <div class="stock-section-label" style="margin-top:10px;">DNA Building Blocks &amp; Counterstrands</div>
                <div class="stock-section-hint">
                  Main strands target A₀ = {{ dataset.kinetics.A0 }} µM / B₀ = {{ dataset.kinetics.B0 }} µM.
                  Counterstrands (X′) are always co-present and use the same targets.
                  Inventory is pre-filtered by letter; type to search freely.
                </div>

                <!-- ─ helper template so A/B/comp rows share identical markup ─ -->
                <!-- A-side main strands (e.g. E) -->
                <div class="strand-group-label">A-side strands</div>
                <div class="stock-row" v-for="letter in exportBuildingBlocks.aside" :key="'aside_' + letter">
                  <label><strong>{{ letter }}</strong> (A-side · {{ dataset.kinetics.A0 }} µM)</label>
                  <div class="stock-input-row">
                    <input type="number" step="any"
                      :value="dnaStocks[letter]?.conc ?? 0"
                      @input="setDnaConc(letter, $event.target.value)"
                      placeholder="stock (µM)" />
                    <span class="stock-unit">µM</span>
                    <div class="inv-picker" @click.stop>
                      <button class="inv-pick-btn" @click="activeExportInv = activeExportInv === 'dna_a_' + letter ? null : 'dna_a_' + letter">
                        <i class="fas fa-tag"></i>
                        {{ dnaStocks[letter]?.inv ? `[${dnaStocks[letter].inv.code}] ${dnaStocks[letter].inv.name}` : 'Inventory…' }}
                      </button>
                      <button v-if="dnaStocks[letter]?.inv" class="inv-clear-btn" @click="clearDnaStockInv(letter)" title="Clear"><i class="fas fa-xmark"></i></button>
                      <div v-if="activeExportInv === 'dna_a_' + letter" class="inv-dropdown">
                        <input type="text" v-model="dnaInvSearch[letter]" :placeholder="`Search '${letter}' in inventory…`" @click.stop />
                        <div class="inv-results">
                          <div v-for="inv in filterDnaInventory(dnaInvSearch[letter], letter)" :key="inv.id" class="inv-item" @mousedown.prevent="selectDnaStockInv(letter, inv)">
                            [{{ inv.code }}] {{ inv.name }} <span class="inv-stock">({{ inv.stock }} {{ inv.stockUnit || '?' }})</span>
                          </div>
                          <div v-if="!filterDnaInventory(dnaInvSearch[letter], letter).length" class="inv-empty">No matching items.</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- B-side main strands (e.g. β) -->
                <div class="strand-group-label">B-side strands</div>
                <div class="stock-row" v-for="letter in exportBuildingBlocks.bside" :key="'bside_' + letter">
                  <label><strong>{{ letter }}</strong> (B-side · {{ dataset.kinetics.B0 }} µM)</label>
                  <div class="stock-input-row">
                    <input type="number" step="any"
                      :value="dnaStocks[letter]?.conc ?? 0"
                      @input="setDnaConc(letter, $event.target.value)"
                      placeholder="stock (µM)" />
                    <span class="stock-unit">µM</span>
                    <div class="inv-picker" @click.stop>
                      <button class="inv-pick-btn" @click="activeExportInv = activeExportInv === 'dna_b_' + letter ? null : 'dna_b_' + letter">
                        <i class="fas fa-tag"></i>
                        {{ dnaStocks[letter]?.inv ? `[${dnaStocks[letter].inv.code}] ${dnaStocks[letter].inv.name}` : 'Inventory…' }}
                      </button>
                      <button v-if="dnaStocks[letter]?.inv" class="inv-clear-btn" @click="clearDnaStockInv(letter)" title="Clear"><i class="fas fa-xmark"></i></button>
                      <div v-if="activeExportInv === 'dna_b_' + letter" class="inv-dropdown">
                        <input type="text" v-model="dnaInvSearch[letter]" :placeholder="`Search '${letter}' in inventory…`" @click.stop />
                        <div class="inv-results">
                          <div v-for="inv in filterDnaInventory(dnaInvSearch[letter], letter)" :key="inv.id" class="inv-item" @mousedown.prevent="selectDnaStockInv(letter, inv)">
                            [{{ inv.code }}] {{ inv.name }} <span class="inv-stock">({{ inv.stock }} {{ inv.stockUnit || '?' }})</span>
                          </div>
                          <div v-if="!filterDnaInventory(dnaInvSearch[letter], letter).length" class="inv-empty">No matching items.</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- A-side counterstrands (e.g. E′) -->
                <div class="strand-group-label" style="color:#6366f1;">A-side counterstrands</div>
                <div class="stock-row" v-for="letter in exportBuildingBlocks.asideComp" :key="'acomp_' + letter">
                  <label><strong>{{ letter }}</strong> (A′-counterstrand · {{ dataset.kinetics.A0 }} µM)</label>
                  <div class="stock-input-row">
                    <input type="number" step="any"
                      :value="dnaStocks[letter]?.conc ?? 0"
                      @input="setDnaConc(letter, $event.target.value)"
                      placeholder="stock (µM)" />
                    <span class="stock-unit">µM</span>
                    <div class="inv-picker" @click.stop>
                      <button class="inv-pick-btn" @click="activeExportInv = activeExportInv === 'dna_ac_' + letter ? null : 'dna_ac_' + letter">
                        <i class="fas fa-tag"></i>
                        {{ dnaStocks[letter]?.inv ? `[${dnaStocks[letter].inv.code}] ${dnaStocks[letter].inv.name}` : 'Inventory…' }}
                      </button>
                      <button v-if="dnaStocks[letter]?.inv" class="inv-clear-btn" @click="clearDnaStockInv(letter)" title="Clear"><i class="fas fa-xmark"></i></button>
                      <div v-if="activeExportInv === 'dna_ac_' + letter" class="inv-dropdown">
                        <input type="text" v-model="dnaInvSearch[letter]" :placeholder="`Search '${letter}' in inventory…`" @click.stop />
                        <div class="inv-results">
                          <div v-for="inv in filterDnaInventory(dnaInvSearch[letter], letter)" :key="inv.id" class="inv-item" @mousedown.prevent="selectDnaStockInv(letter, inv)">
                            [{{ inv.code }}] {{ inv.name }} <span class="inv-stock">({{ inv.stock }} {{ inv.stockUnit || '?' }})</span>
                          </div>
                          <div v-if="!filterDnaInventory(dnaInvSearch[letter], letter).length" class="inv-empty">No matching items.</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- B-side counterstrands (e.g. β′) -->
                <div class="strand-group-label" style="color:#6366f1;">B-side counterstrands</div>
                <div class="stock-row" v-for="letter in exportBuildingBlocks.bsideComp" :key="'bcomp_' + letter">
                  <label><strong>{{ letter }}</strong> (B′-counterstrand · {{ dataset.kinetics.B0 }} µM)</label>
                  <div class="stock-input-row">
                    <input type="number" step="any"
                      :value="dnaStocks[letter]?.conc ?? 0"
                      @input="setDnaConc(letter, $event.target.value)"
                      placeholder="stock (µM)" />
                    <span class="stock-unit">µM</span>
                    <div class="inv-picker" @click.stop>
                      <button class="inv-pick-btn" @click="activeExportInv = activeExportInv === 'dna_bc_' + letter ? null : 'dna_bc_' + letter">
                        <i class="fas fa-tag"></i>
                        {{ dnaStocks[letter]?.inv ? `[${dnaStocks[letter].inv.code}] ${dnaStocks[letter].inv.name}` : 'Inventory…' }}
                      </button>
                      <button v-if="dnaStocks[letter]?.inv" class="inv-clear-btn" @click="clearDnaStockInv(letter)" title="Clear"><i class="fas fa-xmark"></i></button>
                      <div v-if="activeExportInv === 'dna_bc_' + letter" class="inv-dropdown">
                        <input type="text" v-model="dnaInvSearch[letter]" :placeholder="`Search '${letter}' in inventory…`" @click.stop />
                        <div class="inv-results">
                          <div v-for="inv in filterDnaInventory(dnaInvSearch[letter], letter)" :key="inv.id" class="inv-item" @mousedown.prevent="selectDnaStockInv(letter, inv)">
                            [{{ inv.code }}] {{ inv.name }} <span class="inv-stock">({{ inv.stock }} {{ inv.stockUnit || '?' }})</span>
                          </div>
                          <div v-if="!filterDnaInventory(dnaInvSearch[letter], letter).length" class="inv-empty">No matching items.</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>

            <!-- Send row — only active once METIS suggestions exist -->
            <div v-if="aiSuggestions.length" class="wellplate-export-row">
              <div class="input-group" style="flex:1; min-width:120px;">
                <label>Well volume (µL)</label>
                <input type="number" step="any" min="1" v-model.number="exportWellVol" />
              </div>
              <div class="input-group" style="flex:2; min-width:160px;">
                <label>Target plate</label>
                <select v-model="exportPlateId">
                  <option value="" disabled>Select a plate…</option>
                  <option v-for="p in store.wellPlates" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </div>
              <div class="input-group" style="flex:0 0 90px;">
                <label>Start well</label>
                <input type="text" v-model="exportStartWell" placeholder="A1" maxlength="3" />
              </div>
              <button class="compact-btn" style="background:#8b5cf6; box-shadow:0 2px 4px rgba(139,92,246,0.3); align-self:flex-end;" @click="exportSuggestionsToPlate" :disabled="!exportPlateId">
                <i class="fas fa-arrow-down"></i> Send
              </button>
            </div>
            <div v-else class="section-warn" style="margin-top:8px;">
              <i class="fas fa-circle-info"></i> Run <strong>Suggest Next</strong> to generate experiments, then use the Send button to write them to a plate.
            </div>

            <div v-if="exportError" class="section-error" style="margin-top:6px;">
              <i class="fas fa-triangle-exclamation"></i> {{ exportError }}
            </div>
            <div v-if="exportSuccess" class="section-info" style="margin-top:6px;">
              <i class="fas fa-circle-check"></i> {{ exportSuccess }}
            </div>
          </div>
        </div>

        <!-- Predicted High-Yield Sequences -->
        <div class="internal-section" v-if="seqCandidates.length">
          <h3>Predicted High-Yield Sequences</h3>
          <div style="max-height:220px; overflow-y:auto; padding-right:4px;">
            <div class="suggestion-card" v-for="(c, i) in seqCandidates" :key="i">
              <div class="flex-between">
                <div>
                  <span class="sug-id">#{{ i + 1 }}</span>
                  <span class="sug-seq">{{ c.sequence }}</span>
                </div>
                <span style="font-size:0.78rem; color:var(--primary, #3b82f6); font-weight:bold;">
                  {{ formatNum(c.predicted_conversion) }}%
                </span>
              </div>
              <div v-if="c.uncertainty != null" style="font-size:0.72rem; opacity:0.65; margin-top:2px;">
                ±{{ formatNum(c.uncertainty) }} uncertainty
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- Chromatogram Gallery (full-width, below the two columns) -->
    <div v-if="hplcResults.length" class="internal-section" style="margin-top:8px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <h3 style="margin:0;">Chromatogram Gallery <span style="opacity:0.6; font-size:0.85rem; font-weight:normal;">({{ hplcDerived.length }} files)</span></h3>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="small" @click="hplcShowGallery = !hplcShowGallery">
            <i class="fas" :class="hplcShowGallery ? 'fa-eye-slash' : 'fa-eye'"></i>
            {{ hplcShowGallery ? 'Hide' : 'Show' }}
          </button>
          <button class="small" :disabled="!hplcShowGallery" @click="exportAllHplcChartsPng">
            <i class="fas fa-download"></i> Export all PNGs
          </button>
        </div>
      </div>
      <div v-if="hplcShowGallery" class="hplc-gallery">
        <div v-for="r in hplcDerived" :key="r.name" class="hplc-gallery-card">
          <div :ref="(el) => setHplcChartRef(r.name, el)" style="width:100%; height:240px;"></div>
          <div class="hplc-gallery-card-footer">
            <span style="font-size:0.7rem; opacity:0.7;">
              ε(AB)={{ r.epsAB ? r.epsAB.toFixed(0) : '—' }} ·
              ε(A'B')={{ r.epsABp ? r.epsABp.toFixed(0) : '—' }}
              <span v-if="r.meta && !r.meta.isCanonicalRC" style="color:#f59e0b;" title="A'B' is not the reverse complement of AB">⚠</span>
            </span>
            <button class="small" @click="exportHplcChartPng(r.name)" style="padding:2px 8px;">
              <i class="fas fa-download"></i> PNG
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Kinetic Fits Gallery (full-width, below chromatograms) -->
    <div v-if="dataset.experiments.some(e => e.fit)" class="internal-section" style="margin-top:8px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <h3 style="margin:0;">Kinetic Fits Gallery</h3>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="small" @click="exportAllFitChartsPng">
            <i class="fas fa-download"></i> Export all PNGs
          </button>
          <button class="small" @click="exportFitParamsCsv">
            <i class="fas fa-file-csv"></i> Export params CSV
          </button>
        </div>
      </div>
      <div class="hplc-gallery">
        <div v-for="exp in dataset.experiments.filter(e => e.fit)" :key="exp.groupId" class="hplc-gallery-card">
          <div :ref="(el) => setFitChartRef(exp.groupId, el)" style="width:100%; height:260px;"></div>
          <div class="hplc-gallery-card-footer">
            <span style="font-size:0.7rem; opacity:0.75; max-width:75%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" :title="exp.sequence">
              {{ truncateSeq(exp.sequence) }} · {{ exp.replicates?.length || 1 }} rep(s)
            </span>
            <button class="small" @click="exportFitChartPng(exp.groupId)" style="padding:2px 8px;">
              <i class="fas fa-download"></i> PNG
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Cloud Library Modal -->
    <div v-if="showLibrary" class="modal-overlay" @click.self="showLibrary = false">
      <div class="modal-body">
        <div class="modal-header flex-between">
          <h3 style="margin:0;"><i class="fas fa-folder-open"></i> LIDA Kinetics Library</h3>
          <button class="clear-btn" @click="showLibrary = false"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-content">
          <div v-if="!libraryItems.length" style="text-align:center; opacity:0.6; padding:30px;">
            No saved datasets. Save the current dataset to populate the library.
          </div>
          <div v-for="item in libraryItems" :key="item.id" class="library-row">
            <div>
              <strong>{{ item.name || 'Untitled' }}</strong>
              <span class="lib-scope" :class="`scope-${item.scope?.toLowerCase()}`">{{ item.scope }}</span>
              <div style="font-size:0.75rem; opacity:0.7;">{{ item.experiments?.length || 0 }} groups</div>
            </div>
            <div style="display:flex; gap:6px;">
              <button class="small" @click="loadFromLibrary(item)"><i class="fas fa-download"></i> Open</button>
              <button class="small danger-btn" @click="deleteFromLibrary(item)" v-if="item.owner_id === store.user?.id">
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
import { fitKineticsLocal } from '../services/kineticsLocalFit'
import { suggestNextLocal, predictSequenceLocal } from '../services/metisLocalService'
import { processChromatograms, preloadHplcEngine } from '../services/hplcLocalService'
import { parseChromeleonFilename, reverseComplement, HPLC_FILENAME_REGEX_SOURCE } from '../utils/hplcFilename'
import { areaToMicromolar, concentrationToConversion, dilutionFactorFromVial, DEFAULT_HPLC_PARAMS } from '../utils/hplcConcentration'
import { calcSeqExtinction } from '../utils/seqUtils'
import { esc } from '../utils/htmlSafe'

const store = useLabStore()

const BASES = ['A', 'C', 'G', 'T']
const BASE_COLORS = { A: '#10b981', C: '#3b82f6', G: '#f59e0b', T: '#ef4444' }

function emptyDataset() {
  return {
    id: null,
    name: '',
    scope: 'Personal',
    units: { ligase: 'µM', atp: 'µM', mg2: 'µM' },
    // Replication-kinetics initial conditions; defaults match the antimony model.
    kinetics: { limit_uM: 1.4, A0: 2.8, B0: 1.4 },
    experiments: [],
    config: {
      ranges: { tMin: 20, tMax: 50, ligaseMin: 0, ligaseMax: 10, atpMin: 0, atpMax: 10, mg2Min: 0, mg2Max: 20 },
      nSuggestions: 12,
      explorationCoeff: 1.41,
      ensembleSize: 20,
      poolSize: 5000,
      yieldThreshold: 80,
      // 'auto' = try Pyodide-in-browser, fall back to Render if it fails
      // 'local' = always use Pyodide (no network needed after first load)
      // 'server' = always use the Render backend
      fitEngine: 'auto',
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
const suggestNote = ref('')
const fitNote = ref('')
const seqCandidates = ref([])

const heatX = ref('temperature')
const heatY = ref('ligase')

const showLibrary = ref(false)

// ── Send-to-Wellplate state ─────────────────────────────────────────────
// Mirrors the pattern in PhasePredictor.vue: stock concentrations + an
// inventory tag per component, a well volume, a target plate, and a start
// well. Each METIS suggestion writes one well; volumes are computed as
//   V_component = (target_conc × wellVol) / stock_conc.
// MQ H₂O fills the remainder so total per-well volume == exportWellVol.
const exportStocks = reactive({
  ligase: 0, atp: 0, mg2: 0,
  ligaseInv: null, atpInv: null, mg2Inv: null,
})
const exportWellVol = ref(100)
const exportPlateId = ref('')
const exportStartWell = ref('A1')
const activeExportInv = ref(null)  // 'ligase' | 'atp' | 'mg2' | null
const exportInvSearch = reactive({ ligase: '', atp: '', mg2: '' })
const exportError = ref('')
const exportSuccess = ref('')

// ── HPLC chromatogram import state ────────────────────────────────────────
// Files imported as ThermoFisher Chromeleon `.txt`. The worker runs hplc-py
// in Pyodide to detect + integrate all peaks per file. Classification of
// "product" peaks (and area→concentration conversion) lives reactively in
// computed bindings so the user's product-window slider re-classifies
// instantly without re-running integration.
const hplcSettings = reactive({
  scanMin: 1.6, scanMax: 10.0,
  prominence: 0.05, baselineWindow: 1.0,
  productMin: 6.2, productMax: 7.4,
  pathLength_cm: DEFAULT_HPLC_PARAMS.pathLength_cm,
  flow_mL_min:   DEFAULT_HPLC_PARAMS.flow_mL_min,
  injection_uL:  DEFAULT_HPLC_PARAMS.injection_uL,
  solventCorrection: DEFAULT_HPLC_PARAMS.solventCorrection,
  aliquot_uL: DEFAULT_HPLC_PARAMS.aliquot_uL,
  vial_uL:    DEFAULT_HPLC_PARAMS.vial_uL,
  dilutionOverride: null,        // if set, use directly instead of vial/aliquot ratio
  rMax_uM: 1.4,
  earliestPeakIsAprime: true,    // peak-to-strand assignment when 2 product peaks
  useHplcPy: true,
})
// Per-batch reaction conditions applied to every imported file (METIS needs
// these). Defaults come from the dataset condition ranges' midpoints.
const hplcBatchConditions = reactive({
  temperature: 25, ligase: 1, atp: 5, mg2: 10, env: 'none',
})
// Per-file condition overrides. Keyed by filename; initialized from
// hplcBatchConditions at upload time with env auto-set from the S/U filename flag.
const hplcFileConditions = reactive({})
const hplcResults = ref([])             // [{ name, parsed, trace, peaks, ... }]
const hplcSkipped = ref([])             // [{ name, reason }]
const isProcessingHplc = ref(false)
const hplcProgress = ref('')
const hplcShowSettings = ref(false)
const hplcShowGallery  = ref(true)
const hplcFileInput = ref(null)

const hplcDilutionFactor = computed(() => hplcSettings.dilutionOverride != null
  ? Number(hplcSettings.dilutionOverride)
  : dilutionFactorFromVial(hplcSettings.vial_uL, hplcSettings.aliquot_uL))

// Beer-Lambert parameter bag passed to areaToMicromolar.
const hplcParams = computed(() => ({
  pathLength_cm:     Number(hplcSettings.pathLength_cm),
  flow_mL_min:       Number(hplcSettings.flow_mL_min),
  injection_uL:      Number(hplcSettings.injection_uL),
  solventCorrection: Number(hplcSettings.solventCorrection),
  dilutionFactor:    hplcDilutionFactor.value,
}))

// Reactive: for each HPLC result, classify peaks against the current
// product window and compute c(AB), c(A'B'), [R], conversion%.
const hplcDerived = computed(() => hplcResults.value.map(r => deriveHplcRow(r)))

// Helpers used by the chromatogram gallery (Plotly refs keyed by filename).
const hplcChartRefs = ref({})
const hplcFilter = reactive({ condition: '', timeMin: null, timeMax: null, replicate: '' })

// ── HPLC kinetic-fits gallery state ───────────────────────────────────────
const fitChartRefs = ref({})

// ── DNA Building Block state ────────────────────────────────────────────────
// Sequence names in the CSV follow the pattern <LatinUpper><greeklower>, e.g.
// "Eβ". The uppercase Latin letter is the A-side strand; the Greek lowercase
// letter is the B-side strand. Both get their own inventory-linked stock entry.

const GREEK_LETTERS = 'αβγδεζηθικλμνξοπρστυφχψω'

function parseSeqName(name) {
  if (!name) return { aside: null, bside: null }
  const latinMatch = name.match(/[A-Z]/)
  const greekChar = [...(name || '')].find(c => GREEK_LETTERS.includes(c))
  return { aside: latinMatch?.[0] ?? null, bside: greekChar ?? null }
}

function seqNameOf(seq) {
  return dataset.experiments.find(e => e.sequence === seq)?.seqName ?? null
}

// Per-building-block stock concentrations and inventory selections.
// Keyed by the building-block letter (e.g. 'E', 'β'). A-side and B-side
// letters come from different character sets so they can share one map.
const dnaStocks    = reactive({})  // { 'E': { conc: 0, inv: null }, ... }
const dnaInvSearch = reactive({})  // { 'E': '', ... }
const exportInvScope = ref('Global')  // 'Global' | 'Personal' — filters all stock dropdowns in the panel

const GREEK_TO_LATIN = {
  'α':'alpha','β':'beta','γ':'gamma','δ':'delta','ε':'epsilon',
  'ζ':'zeta','η':'eta','θ':'theta','ι':'iota','κ':'kappa',
  'λ':'lambda','μ':'mu','ν':'nu','ξ':'xi','ο':'omicron',
  'π':'pi','ρ':'rho','σ':'sigma','τ':'tau','υ':'upsilon',
  'φ':'phi','χ':'chi','ψ':'psi','ω':'omega',
}

function findExactDnaStock(letter) {
  const list = store.inventory || []
  const isPrime = letter.endsWith("'")
  const base = isPrime ? letter.slice(0, -1) : letter
  const latin = GREEK_TO_LATIN[base] ?? null
  const targets = new Set([base.toLowerCase()])
  if (latin) targets.add(latin)
  if (isPrime) {
    const bases = [base.toLowerCase(), ...(latin ? [latin] : [])]
    for (const bn of bases) {
      for (const suf of ["'", " prime", "prime", "comp", " comp", " complement", "complement", " counterstrand", "counterstrand"])
        targets.add(bn + suf)
    }
  }
  const sorted = [...list].sort((a, b) =>
    ((a.scope || 'Global') === 'Personal' ? 0 : 1) - ((b.scope || 'Global') === 'Personal' ? 0 : 1)
  )
  return sorted.find(i => {
    const n = (i.name || '').toLowerCase().trim()
    const c = (i.code || '').toLowerCase().trim()
    return targets.has(n) || targets.has(c)
  }) ?? null
}

// Unique building-block letters sourced from ALL imported experiments so the
// stock UI covers every strand needed for the full lab setup, not just what
// METIS happens to suggest in one run.
// Returns four arrays:
//   aside     – A-side main strand letters    (e.g. ['E'])
//   bside     – B-side main strand letters    (e.g. ['β'])
//   asideComp – A-side counterstrand letters  (e.g. ["E'"])
//   bsideComp – B-side counterstrand letters  (e.g. ["β'"])
// Eβ always implies E'β', so counterstrands are derived automatically.
const exportBuildingBlocks = computed(() => {
  const aside = new Set()
  const bside = new Set()
  for (const exp of dataset.experiments) {
    const { aside: a, bside: b } = parseSeqName(exp.seqName)
    if (a) aside.add(a)
    if (b) bside.add(b)
  }
  const asideArr = [...aside].sort()
  const bsideArr = [...bside].sort()
  return {
    aside:     asideArr,
    bside:     bsideArr,
    asideComp: asideArr.map(l => `${l}'`),
    bsideComp: bsideArr.map(l => `${l}'`),
  }
})

function setDnaConc(letter, val) {
  if (!dnaStocks[letter]) dnaStocks[letter] = { conc: 0, inv: null }
  dnaStocks[letter].conc = Number(val) || 0
}

function selectDnaStockInv(letter, inv) {
  if (!dnaStocks[letter]) dnaStocks[letter] = { conc: 0, inv: null }
  dnaStocks[letter].inv = inv
  if (typeof inv?.stock === 'number') dnaStocks[letter].conc = inv.stock
  activeExportInv.value = null
}

function clearDnaStockInv(letter) {
  if (dnaStocks[letter]) dnaStocks[letter].inv = null
}

// Pre-filters by the building-block letter when no search query is active.
// For counterstrand keys that end in ' (prime), also matches " prime", "'",
// and "comp" suffixes so inventory items named "E prime" or "E'" are found.
function scopedInventory() {
  return (store.inventory || []).filter(i => (i.scope || 'Global') === exportInvScope.value)
}

function filterDnaInventory(query, letter) {
  const list = scopedInventory()
  const q = (query || '').toLowerCase()
  if (q) {
    return list.filter(i =>
      (i.name || '').toLowerCase().includes(q) ||
      (i.code || '').toLowerCase().includes(q)
    )
  }
  const isPrime = letter.endsWith("'")
  const base = isPrime ? letter.slice(0, -1) : letter
  const bl = base.toLowerCase()
  const latin = GREEK_TO_LATIN[base] ?? null
  const byLetter = list.filter(i => {
    const n = (i.name || '').toLowerCase()
    const c = (i.code || '').toLowerCase()
    if (isPrime) {
      const latinBl = latin ?? bl
      return n.includes(letter.toLowerCase()) || c.includes(letter.toLowerCase()) ||
             n.includes(bl + ' prime') || n.includes(bl + "'") || n.includes(bl + 'comp') ||
             n.includes(latinBl + ' prime') || n.includes(latinBl + "'") || n.includes(latinBl + 'comp') ||
             c.includes(bl + "'") || c.includes(latinBl + "'")
    }
    const latinBase = latin ?? ''
    return n.includes(bl) || c.includes(bl) ||
           (latinBase && (n.includes(latinBase) || c.includes(latinBase)))
  })
  return byLetter.length > 0 ? byLetter : list
}

function filterExportInventory(query) {
  const q = (query || '').toLowerCase()
  const list = scopedInventory()
  if (!q) return list
  return list.filter(i =>
    (i.name || '').toLowerCase().includes(q) ||
    (i.code || '').toLowerCase().includes(q) ||
    (i.cas  || '').toLowerCase().includes(q)
  )
}

function selectExportInv(field, inv) {
  exportStocks[`${field}Inv`] = inv
  if (typeof inv?.stock === 'number') exportStocks[field] = inv.stock
  activeExportInv.value = null
}

function clearExportInv(field) {
  exportStocks[`${field}Inv`] = null
}

const csvFileInput = ref(null)
const curvePlotEl = ref(null)
const heatPlotEl = ref(null)
const logoEl = ref(null)
const logoSvg = ref('')
const predictedLogoSvg = ref('')
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
  suggestNote.value = ''
  fitNote.value = ''
  seqCandidates.value = []
  backendError.value = ''
  parseError.value = ''
  parseStats.value = ''
}

function clearAll() {
  if (!confirm('Remove all experiment groups from this dataset?')) return
  dataset.experiments = []
  aiSuggestions.value = []
  suggestNote.value = ''
  fitNote.value = ''
  seqCandidates.value = []
}

function removeGroup(i) {
  dataset.experiments.splice(i, 1)
}

// ════════════════ CSV ════════════════

const TEMPLATE_HEADER = ['DNA-Sequence', 'Name', 'Time', 'Conversion', 'T4-Ligase', 'ATP', 'Temperature', 'Environment', 'Mg2+', 'Replicate']

function downloadTemplate() {
  const rows = [
    TEMPLATE_HEADER.join(','),
    'GATCAGCTGATCAG,Eβ,0,0,1,1,30,none,5,1',
    'GATCAGCTGATCAG,Eβ,30,15,1,1,30,none,5,1',
    'GATCAGCTGATCAG,Eβ,60,42,1,1,30,none,5,1',
    'GATCAGCTGATCAG,Eβ,90,68,1,1,30,none,5,1',
    'GATCAGCTGATCAG,Eβ,120,82,1,1,30,none,5,1',
    'GATCAGCTGATCAG,Eβ,0,0,1,1,30,none,5,2',
    'GATCAGCTGATCAG,Eβ,30,18,1,1,30,none,5,2',
    'GATCAGCTGATCAG,Eβ,60,39,1,1,30,none,5,2',
    'GATCAGCTGATCAG,Eβ,90,71,1,1,30,none,5,2',
    'GATCAGCTGATCAG,Eβ,120,79,1,1,30,none,5,2',
    'TTACCGTACCGTAC,Aα,0,0,2,2,37,synthetic_cells,10,1',
    'TTACCGTACCGTAC,Aα,30,8,2,2,37,synthetic_cells,10,1',
    'TTACCGTACCGTAC,Aα,60,22,2,2,37,synthetic_cells,10,1',
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
  name: 'seqname',
  seqname: 'seqname',
  dnaname: 'seqname',
  buildingblock: 'seqname',
  buildingblockname: 'seqname',
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
  const hasNameCol = headerKeys.includes('seqname')
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
      seqName: hasNameCol ? (String(cols[idx('seqname')] || '').trim() || null) : null,
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

  // ── Modal-condition normalization (Replicate column only) ─────────────────
  // When the user provides an explicit Replicate column, every row sharing
  // (sequence, replicateId) belongs to the SAME experiment by user intent —
  // even if a few rows have minor typos in conditions (a common case is
  // T4-Ligase being entered differently at t=0). We replace each replicate's
  // conditions with the per-replicate modal value across all its rows so
  // the downstream groupKey lumps them correctly. Inconsistencies are
  // surfaced via parseStats so the user can audit.
  let normalizedReps = 0
  if (hasReplCol) {
    const repBuckets = new Map()
    for (const r of rows) {
      const k = `${r.sequence}|||${r.replicateId}`
      if (!repBuckets.has(k)) repBuckets.set(k, [])
      repBuckets.get(k).push(r)
    }

    const FIELDS = ['temperature', 'ligase', 'atp', 'mg2', 'env']
    for (const repRows of repBuckets.values()) {
      // Compute mode per field across this replicate.
      const modal = {}
      for (const f of FIELDS) {
        const counts = new Map()
        for (const r of repRows) {
          const v = r.conditions[f]
          counts.set(v, (counts.get(v) || 0) + 1)
        }
        let bestV = repRows[0].conditions[f], bestC = -1
        for (const [v, c] of counts) {
          if (c > bestC) { bestV = v; bestC = c }
        }
        modal[f] = bestV
      }

      // Detect any row that disagrees with the modal — these are the typos.
      const inconsistent = repRows.some(r => FIELDS.some(f => r.conditions[f] !== modal[f]))
      if (inconsistent) normalizedReps++

      // Apply modal conditions to every row in the replicate.
      for (const r of repRows) r.conditions = { ...modal }
    }
  }

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
        seqName: r.seqName || null,
        conditions: r.conditions,
        timeCourse: [],
        maxConversion: 0,
        fit: null,
      })
      repsByKey.set(key, new Map())
    }
    const grp = groupsByKey.get(key)
    if (r.seqName && !grp.seqName) grp.seqName = r.seqName
    grp.timeCourse.push({ time: r.time, conversion: r.conversion })
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
  if (normalizedReps > 0) parseStats.value += ` Normalized ${normalizedReps} replicate(s) with inconsistent conditions across timepoints (used the most-common value per column).`
  if (badRows > 0) parseStats.value += ` Skipped ${badRows} invalid row(s).`
}

// ════════════════ HPLC chromatogram import ════════════════
// Reads Chromeleon `.txt` files, runs hplc-py in a Pyodide worker for peak
// detection + integration, and exposes per-file results to the gallery and
// the dataset glue. Filename schema: `{seq1}_{ReplicatorName}_{seq2}_{S|U}{rep}-{time}.txt`.

async function onHplcFileSelected(e) {
  const fileList = Array.from(e.target.files || [])
  e.target.value = ''
  if (!fileList.length) return

  // Parse filenames first so we can drop bad ones before sending to the worker.
  const good = []
  const skipped = []
  for (const f of fileList) {
    const meta = parseChromeleonFilename(f.name)
    if (meta.error) {
      skipped.push({ name: f.name, reason: meta.error })
    } else {
      good.push({ file: f, meta })
    }
  }
  hplcSkipped.value = skipped

  if (!good.length) return

  // Initialise per-file conditions (only for new files; preserve any user edits).
  for (const { file, meta } of good) {
    if (!hplcFileConditions[file.name]) {
      hplcFileConditions[file.name] = {
        temperature: hplcBatchConditions.temperature,
        ligase:      hplcBatchConditions.ligase,
        atp:         hplcBatchConditions.atp,
        mg2:         hplcBatchConditions.mg2,
        env: meta.condition === 'S' ? 'seeded'
           : meta.condition === 'U' ? 'unseeded'
           : (hplcBatchConditions.env || 'none'),
      }
    }
  }

  isProcessingHplc.value = true
  hplcProgress.value = 'Reading files…'
  try {
    // Read file texts (browser File API).
    const filesPayload = await Promise.all(good.map(async ({ file }) => ({
      name: file.name,
      text: await file.text(),
    })))

    const params = {
      scanMin: Number(hplcSettings.scanMin),
      scanMax: Number(hplcSettings.scanMax),
      prominence: Number(hplcSettings.prominence),
      baselineWindow: Number(hplcSettings.baselineWindow),
      useHplcPy: !!hplcSettings.useHplcPy,
      productMin: Number(hplcSettings.productMin),
      productMax: Number(hplcSettings.productMax),
    }

    // Initialize incremental results so the gallery starts filling as files
    // come back from the worker.
    const incoming = []
    hplcResults.value = []

    const results = await processChromatograms(
      filesPayload,
      params,
      msg => { hplcProgress.value = msg },
      ({ index, total, result }) => {
        const meta = good[index]?.meta
        incoming.push({ ...result, parsed: meta })
        // Push a fresh array reference so Vue refreshes the gallery.
        hplcResults.value = [...incoming]
      }
    )
    // Make sure the final result list is in upload order (worker preserves it).
    hplcResults.value = results.map((r, i) => ({ ...r, parsed: good[i]?.meta }))
    hplcProgress.value = `Done — ${results.length} file(s) processed.`
  } catch (err) {
    hplcProgress.value = `HPLC processing failed: ${err?.message || err}`
  } finally {
    isProcessingHplc.value = false
  }
}

// Classify a single file's peaks against the current product window and
// produce derived concentrations.  This is intentionally a pure-ish function
// (depends on hplcSettings + hplcParams) so it can be re-run via computed
// without re-touching the worker.
function deriveHplcRow(result) {
  const settings = hplcSettings
  const params = hplcParams.value
  const meta = result.parsed || {}
  const ABseq      = meta.ABseq || ''
  const ABprimeSeq = meta.ABprimeSeq || ''
  const epsAB      = ABseq      ? calcSeqExtinction(ABseq,      'DNA') : 0
  const epsABp     = ABprimeSeq ? calcSeqExtinction(ABprimeSeq, 'DNA') : 0

  const peaks = (result.peaks || []).map(p => ({ ...p }))
  // Tag peaks: product / building_block / other.
  for (const p of peaks) {
    if (p.rt >= settings.productMin && p.rt <= settings.productMax) p.peakClass = 'product'
    else if (p.rt < settings.productMin) p.peakClass = 'building_block'
    else p.peakClass = 'other'
  }

  // Pick the two largest product peaks (by area) — sorted by RT for assignment.
  const products = peaks.filter(p => p.peakClass === 'product')
    .sort((a, b) => (b.area_mAU_min || 0) - (a.area_mAU_min || 0))
    .slice(0, 2)
    .sort((a, b) => a.rt - b.rt)

  let abPeak = null, abPrimePeak = null
  if (products.length === 1) {
    abPeak = products[0]
  } else if (products.length >= 2) {
    if (settings.earliestPeakIsAprime) {
      abPrimePeak = products[0]; abPeak = products[1]
    } else {
      abPeak = products[0];     abPrimePeak = products[1]
    }
  }
  if (abPeak)      abPeak.assignment      = 'AB'
  if (abPrimePeak) abPrimePeak.assignment = "A'B'"

  const areaAB  = abPeak      ? Number(abPeak.area_mAU_min) || 0      : 0
  const areaABp = abPrimePeak ? Number(abPrimePeak.area_mAU_min) || 0 : 0
  const cAB  = epsAB  ? areaToMicromolar(areaAB,  epsAB,  params) : 0
  const cABp = epsABp ? areaToMicromolar(areaABp, epsABp, params) : 0
  const R_uM = cAB + cABp
  const conversion = concentrationToConversion(R_uM, settings.rMax_uM)

  return {
    name: result.name,
    meta,
    epsAB, epsABp,
    abPeak, abPrimePeak,
    peaks,
    cAB_uM:  cAB,
    cABp_uM: cABp,
    R_uM,
    conversion,
    trace: result.trace || { t: [], s: [] },
    error: result.error || null,
  }
}

// Apply current derived rows to dataset.experiments, grouped by sequence + conditions.
function applyHplcResultsToDataset() {
  const rows = hplcDerived.value
  if (!rows.length) {
    parseError.value = 'No HPLC results to apply.'
    return
  }
  // Build grouping: (ABseq + per-file conditions) → time-course rows.
  // Files with different conditions end up in separate experiment groups.
  const groupsByKey = new Map()
  const repsByKey   = new Map()

  for (const r of rows) {
    if (!r.meta?.ABseq) continue
    const seq = r.meta.ABseq
    const time = r.meta.time
    const conversion = r.conversion
    if (!isFinite(time) || !isFinite(conversion)) continue

    // Resolve conditions: per-file override > batch defaults.
    const fc = hplcFileConditions[r.name] || hplcBatchConditions
    const conds = {
      ligase:      Number(fc.ligase)      || 0,
      atp:         Number(fc.atp)         || 0,
      temperature: Number(fc.temperature) || 0,
      env:         fc.env || 'none',
      mg2:         Number(fc.mg2)         || 0,
    }

    const key = groupKey(seq, conds)
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, {
        groupId: key,
        sequence: seq,
        seqName: null,
        conditions: { ...conds },
        timeCourse: [],
        maxConversion: 0,
        fit: null,
        hplc: { ABprimeSeq: r.meta.ABprimeSeq, epsAB: r.epsAB, epsABp: r.epsABp,
                rMax_uM: hplcSettings.rMax_uM, productWindow: [hplcSettings.productMin, hplcSettings.productMax] },
      })
      repsByKey.set(key, new Map())
    }
    const grp = groupsByKey.get(key)
    grp.timeCourse.push({
      time, conversion,
      concentration_uM: r.R_uM,
      peakAreaAB:      r.abPeak ? r.abPeak.area_mAU_min : 0,
      peakAreaABprime: r.abPrimePeak ? r.abPrimePeak.area_mAU_min : 0,
      epsilonAB:       r.epsAB,
      epsilonABprime:  r.epsABp,
    })
    const repId = String(r.meta.replicate ?? '1')
    if (!repsByKey.get(key).has(repId)) repsByKey.get(key).set(repId, [])
    repsByKey.get(key).get(repId).push({ time, conversion, concentration_uM: r.R_uM })
  }

  for (const [key, g] of groupsByKey) {
    g.timeCourse.sort((a, b) => a.time - b.time)
    // Use the user-specified rMax as strand B concentration (matches notebook: LIMIT_B = B0).
    // Auto-estimating from the last N data points gives wrong A0/B0 when the experiment
    // hasn't yet plateaued — the ODE ceiling then falls below the data, causing overestimation.
    const rMax = hplcSettings.rMax_uM || 1.4
    g.limit_uM = rMax
    g.A0 = 2 * rMax
    g.B0 = rMax
    for (const pt of g.timeCourse) {
      pt.conversion = Math.min(100, 100 * (pt.concentration_uM || 0) / rMax)
    }
    g.maxConversion = g.timeCourse.length ? Math.max(...g.timeCourse.map(p => p.conversion)) : 0
    const repsMap = repsByKey.get(key)
    if (repsMap && repsMap.size > 1) {
      g.replicates = [...repsMap.entries()]
        .map(([repId, tc]) => ({
          replicateId: repId,
          timeCourse: tc.slice()
            .sort((a, b) => a.time - b.time)
            .map(pt => ({ ...pt, conversion: Math.min(100, 100 * (pt.concentration_uM || 0) / rMax) })),
        }))
        .sort((a, b) => a.replicateId.localeCompare(b.replicateId, undefined, { numeric: true }))
    }
    const existingIdx = dataset.experiments.findIndex(e => e.groupId === key)
    if (existingIdx >= 0) dataset.experiments[existingIdx] = g
    else dataset.experiments.push(g)
  }

  parseStats.value = `HPLC: appended ${rows.length} datapoint(s) into ${groupsByKey.size} group(s). Click "Fit Kinetics" to run the ODE fit, then "Suggest Next" for METIS.`
}

function discardHplcResults() {
  hplcResults.value.forEach(r => { delete hplcFileConditions[r.name] })
  hplcResults.value = []
  hplcSkipped.value = []
  hplcProgress.value = ''
}

// Download an example Chromeleon-style chromatogram with the expected filename.
// File contents are a minimal valid header + a few dummy rows; the goal is to
// show users the naming pattern, not to be a working test fixture.
function downloadHplcTemplate() {
  const name = 'ATCGATCG_AB_CGATCGAT_S1-30.txt'
  const lines = []
  // Chromeleon exports have 43 header lines before data; we approximate with
  // a comment block + Chromeleon-style 'Time;Step;Value (mAU)' column header.
  lines.push('# LIDA HPLC chromatogram — filename template')
  lines.push("# Schema: {seq1}_{ReplicatorName}_{seq2}_{S|U}{replicate}-{time}.txt")
  lines.push("# ReplicatorName can be AB, EB, Dzeta, or any label starting with a letter.")
  lines.push('# Example: seq1=ATCGATCG, ReplicatorName=AB, seq2=CGATCGAT, Seeded, rep 1, t=30 min')
  lines.push('# Replace this file with your Chromeleon UV/Vis .txt export.')
  for (let i = 0; i < 39; i++) lines.push('#')
  lines.push('Time (min)\tStep (s)\tValue (mAU)')
  for (let i = 0; i < 5; i++) {
    const t = (i * 0.05).toFixed(3).replace('.', ',')
    lines.push(`${t}\t0,500\t0,000`)
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href)
}

function setHplcChartRef(name, el) { if (el) hplcChartRefs.value[name] = el; else delete hplcChartRefs.value[name] }
function setFitChartRef(key, el)   { if (el) fitChartRefs.value[key] = el;   else delete fitChartRefs.value[key] }

// Force a Plotly div to light-mode, download PNG, then restore original theme.
async function downloadPngLightMode(el, opts) {
  const wasDark = store.isDarkMode
  if (wasDark) {
    await Plotly.relayout(el, { paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff', font: { color: '#0f172a' } })
  }
  try {
    await Plotly.downloadImage(el, opts)
  } finally {
    if (wasDark) {
      await Plotly.relayout(el, { paper_bgcolor: '#0f172a', plot_bgcolor: '#0f172a', font: { color: '#e2e8f0' } })
    }
  }
}

async function exportHplcChartPng(name) {
  const el = hplcChartRefs.value[name]
  if (!el) return
  try {
    await downloadPngLightMode(el, { format: 'png', filename: name.replace(/\.txt$/i, '') + '_chrom', width: 900, height: 500 })
  } catch (err) { console.error('PNG export failed:', err) }
}

async function exportAllHplcChartsPng() {
  for (const [name, el] of Object.entries(hplcChartRefs.value)) {
    if (!el) continue
    try {
      await downloadPngLightMode(el, { format: 'png', filename: name.replace(/\.txt$/i, '') + '_chrom', width: 900, height: 500 })
    } catch (err) { console.error('PNG export failed:', err) }
    await new Promise(r => setTimeout(r, 300))
  }
}

async function exportFitChartPng(key) {
  const el = fitChartRefs.value[key]
  if (!el) return
  try {
    await downloadPngLightMode(el, { format: 'png', filename: `fit_${key}`, width: 800, height: 500 })
  } catch (err) { console.error('PNG export failed:', err) }
}

async function exportAllFitChartsPng() {
  for (const [key, el] of Object.entries(fitChartRefs.value)) {
    if (!el) continue
    try {
      await downloadPngLightMode(el, { format: 'png', filename: `fit_${key}`, width: 800, height: 500 })
    } catch (err) { console.error('PNG export failed:', err) }
    await new Promise(r => setTimeout(r, 300))
  }
}

function exportFitParamsCsv() {
  const rows = []
  for (const e of dataset.experiments) {
    const fits = []
    if (e.replicates?.length) {
      for (const rep of e.replicates) {
        if (rep.fit) fits.push({ replicateId: rep.replicateId, fit: rep.fit })
      }
    } else if (e.fit) {
      fits.push({ replicateId: '1', fit: e.fit })
    }
    for (const { replicateId, fit } of fits) {
      rows.push({
        sequence:   e.sequence,
        condition:  e.conditions?.env || '',
        temperature: e.conditions?.temperature ?? '',
        ligase:     e.conditions?.ligase ?? '',
        atp:        e.conditions?.atp ?? '',
        mg2:        e.conditions?.mg2 ?? '',
        replicate:  replicateId,
        ku:   fit.ku ?? '',
        k1:   fit.k1 ?? '',
        k2:   fit.k2 ?? '',
        kr:   fit.kr ?? '',
        k_bg: fit.k_bg ?? '',
        R_max: e.hplc?.rMax_uM ?? '',
      })
    }
  }
  if (!rows.length) { alert('No fits to export — run Fit Kinetics first.'); return }
  const headers = Object.keys(rows[0])
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `kinetic_fits_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href)
}

// ════════════════ Sequence logo (frontend) ════════════════

// Renders a sequence logo SVG from a list of equal-or-mixed-length DNA strings.
// Letter heights are Shannon-entropy-derived information content (bits, max 2).
// Used for both the OBSERVED top-yield logo and the PREDICTED logo from METIS.
function buildLogoSvg(seqs) {
  if (!seqs?.length) return ''
  const maxLen = Math.max(...seqs.map(s => s.length))
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
    for (const s of seqs) {
      if (i < s.length) {
        const b = s[i]
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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%; max-width:${W}px;">${body}</svg>`
}

function computeLogo() {
  logoWarning.value = ''
  if (!dataset.experiments.length) { logoSvg.value = ''; return }

  const allMax = dataset.experiments.map(g => g.maxConversion).sort((a, b) => a - b)
  const cutIdx = Math.floor(allMax.length * dataset.config.yieldThreshold / 100)
  const cutoff = allMax[Math.min(cutIdx, allMax.length - 1)]
  const top = dataset.experiments.filter(g => g.maxConversion >= cutoff)

  if (!top.length) { logoSvg.value = ''; return }

  const lengths = new Set(top.map(g => g.sequence.length))
  if (lengths.size > 1) {
    const maxLen = Math.max(...top.map(g => g.sequence.length))
    logoWarning.value = `${top.length} sequences have ${lengths.size} different lengths; logo extends to longest (${maxLen}); shorter sequences excluded from later positions.`
  }

  logoSvg.value = buildLogoSvg(top.map(g => g.sequence))
}

// Sequence logo from METIS-predicted high-yield sequences. Shows the
// motif the model thinks should perform well — useful next to the
// observed logo for spotting positions the AI wants to change.
function computePredictedLogo() {
  if (!seqCandidates.value?.length) { predictedLogoSvg.value = ''; return }
  predictedLogoSvg.value = buildLogoSvg(seqCandidates.value.map(c => c.sequence))
}

// ════════════════ Plotly: kinetic curves ════════════════

function plotLayoutDark() {
  const isDark = store.isDarkMode
  const lineCol = isDark ? '#374151' : '#d1d5db'
  return {
    paper_bgcolor: isDark ? '#111827' : '#ffffff',
    plot_bgcolor:  isDark ? '#111827' : '#ffffff',
    font: { color: isDark ? '#f3f4f6' : '#1f2937', size: 10 },
    // Generous margins so the plot content has breathing room from the
    // plot-area container's border and the axis labels never crop.
    margin: { l: 55, r: 22, b: 45, t: 18 },
    showlegend: false,
    xaxis: { showgrid: false, zeroline: false, showline: true, linecolor: lineCol, linewidth: 1, automargin: true },
    yaxis: { showgrid: false, zeroline: false, showline: true, linecolor: lineCol, linewidth: 1, automargin: true },
  }
}

const PASTEL_COLORS = [
  'rgb(255,179,186)', 'rgb(186,225,255)', 'rgb(186,255,201)', 'rgb(255,223,186)',
  'rgb(232,186,255)', 'rgb(255,255,186)', 'rgb(186,255,232)', 'rgb(255,186,230)',
  'rgb(217,235,255)', 'rgb(255,217,186)', 'rgb(210,255,210)', 'rgb(255,210,240)',
]

function renderCurves() {
  if (!curvePlotEl.value) return
  if (!dataset.experiments.length) { Plotly.purge(curvePlotEl.value); return }

  const traces = []
  dataset.experiments.forEach((g, i) => {
    const color = PASTEL_COLORS[i % PASTEL_COLORS.length]
    const nRep = replicateCount(g)
    const label = nRep > 1
      ? `${truncateSeq(g.sequence)} (T${formatNum(g.conditions.temperature)}, n=${nRep})`
      : `${truncateSeq(g.sequence)} (T${formatNum(g.conditions.temperature)})`

    // Use µM when available (HPLC), fall back to conversion% (CSV).
    const useUM = g.timeCourse.length > 0 && g.timeCourse[0].concentration_uM != null

    // Raw data points — always markers only, no connecting lines.
    traces.push({
      type: 'scatter',
      mode: 'markers',
      name: label,
      legendgroup: g.groupId,
      x: g.timeCourse.map(p => p.time),
      y: useUM
        ? g.timeCourse.map(p => p.concentration_uM)
        : g.timeCourse.map(p => p.conversion),
      marker: { size: 8, color, line: { width: 1, color: 'rgba(0,0,0,0.25)' } },
      hovertemplate: useUM
        ? `<b>${esc(g.sequence)}</b><br>Time: %{x} min<br>[R]: %{y:.3f} µM<extra></extra>`
        : `<b>${esc(g.sequence)}</b><br>Time: %{x} min<br>Conv: %{y:.1f}%<extra></extra>`,
    })

    // Mean fit curve overlay (line only, same color, slightly darker).
    const fitY = useUM && g.fit?.simY_uM?.length ? g.fit.simY_uM : g.fit?.simY
    const hasFitCurve = g.fit && Array.isArray(g.fit.simT) && g.fit.simT.length > 0 && fitY?.length
    if (hasFitCurve) {
      traces.push({
        type: 'scatter',
        mode: 'lines',
        name: `${label} fit`,
        legendgroup: g.groupId,
        showlegend: false,
        x: g.fit.simT,
        y: fitY,
        line: { color, width: 2.5 },
        hovertemplate: useUM
          ? `<b>fit</b><br>%{x:.0f} min · %{y:.3f} µM<extra></extra>`
          : `<b>fit</b><br>%{x:.0f} min · %{y:.1f}%<extra></extra>`,
      })
    }
  })

  // Determine if any experiment uses µM — if mixed, prefer µM axis.
  const anyUM = dataset.experiments.some(
    g => g.timeCourse.length > 0 && g.timeCourse[0].concentration_uM != null
  )
  const layout = plotLayoutDark()
  layout.xaxis.title = { text: 'Time (min)', font: { size: 9 } }
  layout.yaxis.title = { text: anyUM ? '[R] / µM' : 'Conv (%)', font: { size: 9 } }
  if (!anyUM) layout.yaxis.range = [0, 105]
  Plotly.react(curvePlotEl.value, traces, layout, { responsive: true, displayModeBar: false })
}

function renderHeatmap() {
  if (!heatPlotEl.value) return
  if (!dataset.experiments.length) { Plotly.purge(heatPlotEl.value); return }

  // Build sorted unique axis values.
  const xUniq = [...new Set(dataset.experiments.map(g => g.conditions[heatX.value]))].sort((a, b) => a - b)
  const yUniq = [...new Set(dataset.experiments.map(g => g.conditions[heatY.value]))].sort((a, b) => a - b)

  // z[row][col] = mean maxConversion at (xUniq[col], yUniq[row]); null = no data.
  const z = yUniq.map(yv =>
    xUniq.map(xv => {
      const hits = dataset.experiments.filter(g =>
        g.conditions[heatX.value] === xv && g.conditions[heatY.value] === yv
      )
      return hits.length ? hits.reduce((s, g) => s + g.maxConversion, 0) / hits.length : null
    })
  )

  const isDark = store.isDarkMode
  const trace = {
    type: 'heatmap',
    x: xUniq,
    y: yUniq,
    z,
    colorscale: 'Viridis',
    zmin: 0,
    zmax: 100,
    connectgaps: false,
    colorbar: { title: { text: 'Max %', font: { size: 10 } }, thickness: 12 },
    hovertemplate: `${heatX.value}: %{x}<br>${heatY.value}: %{y}<br>Max conv: %{z:.1f}%<extra></extra>`,
  }
  const axisLabel = (key) => {
    if (key === 'temperature') return 'Temperature (°C)'
    if (key === 'ligase') return `T4-Ligase (${dataset.units.ligase})`
    if (key === 'atp') return `ATP (${dataset.units.atp})`
    if (key === 'mg2') return `Mg²⁺ (${dataset.units.mg2})`
    return key
  }
  const layout = plotLayoutDark()
  layout.xaxis.title = { text: axisLabel(heatX.value), font: { size: 9 } }
  layout.yaxis.title = { text: axisLabel(heatY.value), font: { size: 9 } }
  layout.xaxis.type = 'category'
  layout.yaxis.type = 'category'
  layout.margin.r = 60   // extra room for the colorbar
  Plotly.react(heatPlotEl.value, [trace], layout, { responsive: true, displayModeBar: false })
}

function renderAll() {
  computeLogo()
  computePredictedLogo()
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
    if (!timeMap.has(pt.time)) timeMap.set(pt.time, { convs: [], concs: [] })
    const bucket = timeMap.get(pt.time)
    bucket.convs.push(pt.conversion)
    if (pt.concentration_uM != null) bucket.concs.push(pt.concentration_uM)
  }
  return [...timeMap.entries()]
    .map(([time, { convs, concs }]) => ({
      time,
      conversion: convs.reduce((a, b) => a + b, 0) / convs.length,
      ...(concs.length ? { concentration_uM: concs.reduce((a, b) => a + b, 0) / concs.length } : {}),
    }))
    .sort((a, b) => a.time - b.time)
}

// Chunk size for the SERVER fit path: each ODE fit takes ~30-50 s on Render's
// free-tier shared CPU, so 2 per request keeps us comfortably under gunicorn's
// 120 s worker timeout. The local Pyodide path doesn't chunk — there's no
// per-request timeout in the browser.
const FIT_CHUNK_SIZE = 2

async function fitKinetics() {
  isFitting.value = true
  fitNote.value = ''
  backendError.value = ''

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
          limit_uM: g.limit_uM,
          A0: g.A0,
          B0: g.B0,
        })
      }
    } else {
      // No replicates — deduplicate time points just in case.
      flatExps.push({ ...g, timeCourse: meanTimeCourse(g.timeCourse) })
    }
  }

  const payload = {
    experiments: flatExps,
    limit_uM: dataset.kinetics.limit_uM,
    A0: dataset.kinetics.A0,
    B0: dataset.kinetics.B0,
  }

  const engine = dataset.config.fitEngine || 'auto'

  // Try local first for 'local' or 'auto'.
  if (engine === 'local' || engine === 'auto') {
    try {
      const result = await fitKineticsLocal(payload, msg => { fitNote.value = msg })
      isFitting.value = false
      applyFits(result.fits || [])
      return
    } catch (err) {
      if (engine === 'local') {
        // Strict local mode — surface the failure, don't fall back.
        isFitting.value = false
        backendError.value = `Local engine failed: ${err.message}. Switch to Server or Auto to use the Render backend.`
        return
      }
      // Auto mode — log and fall through to the server path.
      fitNote.value = `Local engine unavailable (${err.message}). Falling back to server…`
    }
  }

  // Server path — chunked to fit the 120 s gunicorn timeout.
  await fitKineticsServer(flatExps)
}

async function fitKineticsServer(flatExps) {
  const chunks = []
  for (let i = 0; i < flatExps.length; i += FIT_CHUNK_SIZE) {
    chunks.push(flatExps.slice(i, i + FIT_CHUNK_SIZE))
  }

  const allFits = []
  for (let ci = 0; ci < chunks.length; ci++) {
    if (chunks.length > 1) {
      fitNote.value = `Fitting batch ${ci + 1} of ${chunks.length} (${chunks[ci].length} fit${chunks[ci].length === 1 ? '' : 's'})…`
    }
    const result = await callBackend(ENDPOINTS.fit, {
      experiments: chunks[ci],
      limit_uM: dataset.kinetics.limit_uM,
      A0: dataset.kinetics.A0,
      B0: dataset.kinetics.B0,
    })
    if (!result) {
      // backendError is already set by callBackend.
      isFitting.value = false
      if (allFits.length) {
        applyFits(allFits, `Backend dropped after batch ${ci} of ${chunks.length} — showing partial results, retry to fit the rest. `)
      }
      return
    }
    allFits.push(...(result.fits || []))
  }

  isFitting.value = false
  applyFits(allFits)
}

function applyFits(allFits, prefix = '') {
  const fitsById = Object.fromEntries(allFits.map(f => [f.groupId, f]))
  const REP_SEP = '|||rep'
  const failureNotes = []
  let okCount = 0, partialCount = 0, failCount = 0

  for (const g of dataset.experiments) {
    if (g.replicates?.length > 1) {
      const allRepFits = g.replicates.map(rep => fitsById[`${g.groupId}${REP_SEP}${rep.replicateId}`])
      // A "fitted" replicate has rate constants. simT is for plotting only —
      // if the dense post-fit simulation failed but the optimizer converged,
      // we still want to show ✓ in the ledger and use the parameters in AL.
      const repFits = allRepFits.filter(f => f?.ku != null)
      if (!repFits.length) {
        failCount++
        const note = allRepFits.find(f => f?.note)?.note || 'no replicate produced a usable curve'
        failureNotes.push(`${truncateSeq(g.sequence)}: ${note}`)
        continue
      }

      const repsWithCurves = repFits.filter(f => f.simT?.length > 0)
      const bestFit = repFits.reduce((a, b) => ((a.cost ?? Infinity) < (b.cost ?? Infinity) ? a : b))

      if (repsWithCurves.length) {
        // Average simulated curves over the replicates that produced one.
        const tMax = Math.max(...repsWithCurves.map(f => Math.max(...f.simT)))
        const simT = Array.from({ length: 100 }, (_, i) => (i / 99) * tMax)
        const allY    = repsWithCurves.map(f => interpLinear(f.simT, f.simY,    simT))
        const allY_uM = repsWithCurves.filter(f => f.simY_uM?.length)
                                       .map(f => interpLinear(f.simT, f.simY_uM, simT))
        const simY    = simT.map((_, i) => allY.reduce((s, y) => s + y[i], 0) / allY.length)
        const simY_uM = allY_uM.length
          ? simT.map((_, i) => allY_uM.reduce((s, y) => s + y[i], 0) / allY_uM.length)
          : []
        g.fit = { ...bestFit, simT, simY, simY_uM, replicateCount: repsWithCurves.length }
        if (repFits.length === g.replicates.length && repsWithCurves.length === repFits.length) {
          okCount++
        } else {
          partialCount++
          if (repsWithCurves.length < repFits.length) {
            failureNotes.push(`${truncateSeq(g.sequence)}: ${repFits.length - repsWithCurves.length}/${repFits.length} replicate(s) converged but curve sim failed`)
          }
        }
      } else {
        // Optimizer converged but no replicate produced a smooth curve. Keep
        // the rate constants so the ledger shows ✓ and AL can use them; the
        // plot will just show data points without an overlay line.
        g.fit = { ...bestFit, simT: [], simY: [], replicateCount: repFits.length, note: 'Curve sim failed (rate constants OK)' }
        partialCount++
        failureNotes.push(`${truncateSeq(g.sequence)}: rate constants OK but curve sim failed`)
      }
    } else {
      const f = fitsById[g.groupId]
      if (f && f.ku != null && f.simT?.length > 0) {
        g.fit = f; okCount++
      } else if (f && f.ku != null) {
        // Same partial-success path for non-replicate groups.
        g.fit = { ...f, note: 'Curve sim failed (rate constants OK)' }
        partialCount++
        failureNotes.push(`${truncateSeq(g.sequence)}: rate constants OK but curve sim failed`)
      } else {
        failCount++
        failureNotes.push(`${truncateSeq(g.sequence)}: ${f?.note || 'fit did not converge'}`)
      }
    }
  }

  const total = dataset.experiments.length
  const parts = []
  if (okCount)      parts.push(`${okCount} fitted`)
  if (partialCount) parts.push(`${partialCount} partial (rate constants OK, curve sim incomplete)`)
  if (failCount)    parts.push(`${failCount} failed`)
  const summary = parts.length === 1 && okCount === total && !prefix
    ? '' // perfect — no note needed
    : `${parts.join(' · ')} of ${total} group${total === 1 ? '' : 's'}` +
      (failureNotes.length ? `. Issues: ${failureNotes.slice(0, 3).join('; ')}${failureNotes.length > 3 ? '…' : ''}` : '')
  fitNote.value = (prefix + summary).trim()
}

async function suggestNext() {
  suggestNote.value = ''
  fitNote.value = ''
  if (dataset.experiments.length < 3) {
    suggestNote.value = `METIS needs at least 3 experiment groups to train on — you have ${dataset.experiments.length}. Import more CSV data with varied conditions.`
    return
  }
  isSuggesting.value = true
  const payload = {
    experiments: dataset.experiments,
    ranges: dataset.config.ranges,
    nSuggestions: dataset.config.nSuggestions,
    explorationCoeff: dataset.config.explorationCoeff ?? 1.41,
    ensembleSize: dataset.config.ensembleSize ?? 20,
    poolSize: dataset.config.poolSize ?? 5000,
  }
  let result = null
  try {
    result = await suggestNextLocal(payload, msg => { suggestNote.value = msg })
  } catch (localErr) {
    suggestNote.value = `Local METIS unavailable (${localErr.message}). Falling back to server…`
    result = await callBackend(ENDPOINTS.suggest, payload)
  }
  isSuggesting.value = false
  if (result) {
    aiSuggestions.value = result.suggestions || []
    suggestNote.value = result.note || (result.suggestions?.length === 0 ? 'No suggestions returned — check experiment data or expand condition ranges.' : '')
  }
}

async function predictSequence() {
  isPredicting.value = true
  const payload = {
    experiments: dataset.experiments,
    topK: 5,
    ensembleSize: dataset.config.ensembleSize ?? 20,
    poolSize: 2000,
  }
  let result = null
  try {
    result = await predictSequenceLocal(payload, msg => { suggestNote.value = msg })
  } catch (localErr) {
    suggestNote.value = `Local METIS unavailable (${localErr.message}). Falling back to server…`
    result = await callBackend(ENDPOINTS.sequencePredict, payload)
  }
  isPredicting.value = false
  if (result) {
    seqCandidates.value = result.candidates || []
    suggestNote.value = ''
  }
}

// ════════════════ Send to Wellplate ════════════════
//
// Writes each METIS suggestion into one well of the user's chosen plate,
// formatted to match PhasePredictor.vue's cell template so the same
// downstream Opentrons (.opnp) export pipeline picks them up unchanged.

function getInvTag(inv, vol, targetConc, unit, label = '') {
  const pre = label ? `<strong>${esc(label)}:</strong> ` : ''
  if (!inv) {
    return `${pre}<strong>Manual:</strong> ${esc(vol)} µL (${esc(targetConc)} ${esc(unit)})<br>`
  }
  return `${pre}&nbsp;<span class="inv-ref" contenteditable="false" data-labware=""><i class="fas fa-tag"></i>&nbsp;[${esc(inv.code)}] ${esc(inv.name)} (${esc(store.formatNum ? store.formatNum(inv.stock) : inv.stock)} ${esc(inv.stockUnit || unit)})&nbsp;<i class="fas fa-times inv-ref-remove" style="cursor:pointer; margin-left:4px; opacity:0.7;"></i></span>&nbsp; ${esc(vol)} µL (${esc(targetConc)} ${esc(unit)})<br>`
}

function exportSuggestionsToPlate() {
  exportError.value = ''
  exportSuccess.value = ''
  if (!aiSuggestions.value.length) {
    exportError.value = 'No METIS suggestions yet. Run "Suggest Next" first.'
    return
  }
  if (!exportPlateId.value) {
    exportError.value = 'Pick a target plate.'
    return
  }
  const plate = store.wellPlates.find(p => p.id === exportPlateId.value)
  if (!plate) { exportError.value = 'Selected plate not found.'; return }
  const m = (exportStartWell.value || '').toUpperCase().trim().match(/^([A-Z])(\d{1,2})$/)
  if (!m) { exportError.value = 'Invalid start well — use format like A1, B2, H12.'; return }
  const startRow = m[1].charCodeAt(0) - 65
  const startCol = parseInt(m[2]) - 1

  const wellVol = Number(exportWellVol.value) || 0
  if (wellVol <= 0) { exportError.value = 'Well volume must be > 0 µL.'; return }

  const stockL = Number(exportStocks.ligase) || 0
  const stockA = Number(exportStocks.atp)    || 0
  const stockM = Number(exportStocks.mg2)    || 0
  if (stockL <= 0 || stockA <= 0 || stockM <= 0) {
    exportError.value = 'T4-Ligase, ATP, and Mg²⁺ stock concentrations must all be > 0. Set them manually or pick from inventory.'
    return
  }

  // All building-block stocks (main strands + counterstrands) must be set.
  const { aside: asideBlocks, bside: bsideBlocks, asideComp, bsideComp } = exportBuildingBlocks.value
  const allDnaBlocks = [...asideBlocks, ...bsideBlocks, ...asideComp, ...bsideComp]
  const missingDna = allDnaBlocks.filter(l => !(dnaStocks[l]?.conc > 0))
  if (missingDna.length) {
    exportError.value = `Set stock concentrations for: ${missingDna.join(', ')}.`
    return
  }

  let writtenCount = 0, skippedOverflow = 0, skippedExcessVol = 0
  const fmt = n => Number(n).toFixed(2)
  aiSuggestions.value.forEach((s, i) => {
    const rOff = Math.floor((startCol + i) / 12)
    const cOff = (startCol + i) % 12
    const targetR = startRow + rOff
    const targetC = cOff
    if (targetR >= 8 || targetC >= 12) { skippedOverflow++; return }
    const wId = String.fromCharCode(65 + targetR) + (targetC + 1)

    const vL = (s.conditions.ligase * wellVol) / stockL
    const vA = (s.conditions.atp    * wellVol) / stockA
    const vM = (s.conditions.mg2    * wellVol) / stockM

    // Main strands: A-side and B-side. Counterstrand keys have trailing ' (prime).
    // Target concentrations match the ODE initial conditions: A0 for A/A', B0 for B/B'.
    const { aside, bside } = parseSeqName(seqNameOf(s.sequence))
    const asideKey  = aside  || null
    const bsideKey  = bside  || null
    const asideCompKey = aside  ? `${aside}'`  : null
    const bsideCompKey = bside  ? `${bside}'`  : null

    const stockOf = k => (k && dnaStocks[k]?.conc > 0) ? dnaStocks[k].conc : 0
    const volOf   = (k, target) => { const s = stockOf(k); return s > 0 ? (target * wellVol) / s : 0 }

    const vAs  = volOf(asideKey,     dataset.kinetics.A0)
    const vBs  = volOf(bsideKey,     dataset.kinetics.B0)
    const vAsc = volOf(asideCompKey, dataset.kinetics.A0)
    const vBsc = volOf(bsideCompKey, dataset.kinetics.B0)

    const vSum   = vL + vA + vM + vAs + vBs + vAsc + vBsc
    const vWater = wellVol - vSum

    const warn = vWater < 0
      ? `<br><span style="color:#ef4444; font-size:0.7rem;">⚠️ Stock volumes (${fmt(vSum)} µL) exceed well volume — increase stocks or shrink well.</span>`
      : ''
    if (vWater < 0) skippedExcessVol++

    const nameLabel = seqNameOf(s.sequence)
      ? ` <strong style="color:#8b5cf6; font-size:0.72rem;">${esc(seqNameOf(s.sequence))}</strong>` : ''
    let dnaHtml = ''
    if (asideKey)     dnaHtml += getInvTag(dnaStocks[asideKey]?.inv     ?? null, fmt(vAs),  formatNum(dataset.kinetics.A0), 'µM', `A [${asideKey}]`)
    if (bsideKey)     dnaHtml += getInvTag(dnaStocks[bsideKey]?.inv     ?? null, fmt(vBs),  formatNum(dataset.kinetics.B0), 'µM', `B [${bsideKey}]`)
    if (asideCompKey) dnaHtml += getInvTag(dnaStocks[asideCompKey]?.inv ?? null, fmt(vAsc), formatNum(dataset.kinetics.A0), 'µM', `A′ [${asideCompKey}]`)
    if (bsideCompKey) dnaHtml += getInvTag(dnaStocks[bsideCompKey]?.inv ?? null, fmt(vBsc), formatNum(dataset.kinetics.B0), 'µM', `B′ [${bsideCompKey}]`)

    plate.wells[wId] =
      `<strong style="color: var(--primary);">METIS [#${i + 1}]</strong>` +
      `<span style="font-family:monospace; font-size:0.78rem;"> ${esc(s.sequence)}</span>${nameLabel}<br>` +
      `<span style="font-size:0.72rem; opacity:0.75;">T ${esc(formatNum(s.conditions.temperature))} °C · env ${esc(s.conditions.env || 'none')} · pred ${esc(formatNum(s.predicted_conversion))}%</span><br>` +
      dnaHtml +
      getInvTag(exportStocks.ligaseInv, fmt(vL), formatNum(s.conditions.ligase), dataset.units.ligase, 'T4-Ligase') +
      getInvTag(exportStocks.atpInv,    fmt(vA), formatNum(s.conditions.atp),    dataset.units.atp, 'ATP') +
      getInvTag(exportStocks.mg2Inv,    fmt(vM), formatNum(s.conditions.mg2),    dataset.units.mg2, 'Mg²⁺') +
      `<strong>MQ H₂O:</strong> ${fmt(Math.max(0, vWater))} µL${warn}`
    writtenCount++
  })

  const parts = [`Wrote ${writtenCount} well${writtenCount === 1 ? '' : 's'} to "${plate.name}" starting at ${exportStartWell.value.toUpperCase()}`]
  if (skippedOverflow)  parts.push(`${skippedOverflow} skipped (off-plate)`)
  if (skippedExcessVol) parts.push(`${skippedExcessVol} flagged with stock-volume warning`)
  exportSuccess.value = parts.join('. ') + '.'
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
  loaded.config = { ...fresh.config, ...(loaded.config || {}) }
  // Legacy migration: older datasets stored 'mM' but the UI now only offers µM.
  loaded.units = { ...fresh.units, ...(loaded.units || {}) }
  for (const k of ['ligase', 'atp', 'mg2']) {
    if (loaded.units[k] === 'mM') loaded.units[k] = 'µM'
  }
  Object.assign(dataset, loaded)
  showLibrary.value = false
  aiSuggestions.value = item.suggestions || []
  suggestNote.value = ''
  fitNote.value = ''
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

// ════════════════ HPLC chromatogram gallery + kinetic-fits gallery rendering ════════════════

// Render one Plotly chart per HPLC result. Reactive to derived classification
// so adjusting the product-window slider re-shades peaks instantly.
function renderHplcCharts() {
  const rows = hplcDerived.value
  for (const row of rows) {
    const el = hplcChartRefs.value[row.name]
    if (!el) continue
    const t = row.trace?.t || []
    const s = row.trace?.s || []
    const traces = [{
      type: 'scatter', mode: 'lines', x: t, y: s,
      line: { color: '#0f172a', width: 1.4 }, name: 'signal', hoverinfo: 'x+y',
    }]
    // Shaded fills under product peaks. We synthesize a Gaussian-ish window
    // around each assigned peak's RT using ±0.15 min (cheap visual; exact
    // bounds were already used to compute area in the worker).
    for (const peak of row.peaks || []) {
      if (peak.peakClass !== 'product') continue
      const color = peak.assignment === 'AB' ? 'rgba(59,130,246,0.45)'
                 : peak.assignment === "A'B'" ? 'rgba(245,158,11,0.45)'
                 : 'rgba(148,163,184,0.35)'
      const halfWidth = (peak.scale && peak.scale > 0) ? Math.min(0.35, peak.scale * 3) : 0.18
      const xs = [], ys = []
      for (let i = 0; i < t.length; i++) {
        if (t[i] >= peak.rt - halfWidth && t[i] <= peak.rt + halfWidth) {
          xs.push(t[i]); ys.push(s[i])
        }
      }
      if (xs.length > 1) {
        traces.push({
          type: 'scatter', mode: 'lines', x: xs, y: ys,
          fill: 'tozeroy', line: { color }, fillcolor: color, hoverinfo: 'skip',
          name: peak.assignment ? `${peak.assignment} (rt=${peak.rt.toFixed(2)})` : `peak ${peak.rt.toFixed(2)}`,
          showlegend: false,
        })
      }
    }
    // Vertical dashed lines at product window edges.
    const shapes = [
      { type: 'line', xref: 'x', yref: 'paper', x0: hplcSettings.productMin, x1: hplcSettings.productMin, y0: 0, y1: 1,
        line: { dash: 'dot', width: 1, color: '#64748b' } },
      { type: 'line', xref: 'x', yref: 'paper', x0: hplcSettings.productMax, x1: hplcSettings.productMax, y0: 0, y1: 1,
        line: { dash: 'dot', width: 1, color: '#64748b' } },
    ]
    const titleParts = [row.name]
    if (row.abPeak)      titleParts.push(`AB ${row.cAB_uM.toFixed(2)} µM`)
    if (row.abPrimePeak) titleParts.push(`A'B' ${row.cABp_uM.toFixed(2)} µM`)
    titleParts.push(`[R] ${row.R_uM.toFixed(2)} µM`)
    const layout = {
      title: { text: titleParts.join(' · '), font: { size: 11 } },
      xaxis: { title: 't / min', range: [hplcSettings.scanMin, hplcSettings.scanMax] },
      yaxis: { title: 'signal / mAU' },
      shapes,
      margin: { l: 50, r: 10, t: 30, b: 35 },
      showlegend: false,
      paper_bgcolor: store.isDarkMode ? '#0f172a' : '#ffffff',
      plot_bgcolor: store.isDarkMode ? '#0f172a' : '#ffffff',
      font: { color: store.isDarkMode ? '#e2e8f0' : '#0f172a' },
    }
    Plotly.react(el, traces, layout, { responsive: true, displayModeBar: false })
  }
}

// Render one Plotly chart per experiment showing data points + fitted ODE curve.
const FIT_CHART_PALETTE = ['#a62b17', '#1d6fa5', '#2e7d32', '#7c3aed', '#b45309', '#0e7490', '#9d174d']

function renderFitCharts() {
  for (const exp of dataset.experiments) {
    const key = exp.groupId
    const el = fitChartRefs.value[key]
    if (!el) continue
    const expIdx = dataset.experiments.findIndex(e => e.groupId === key)
    const color = FIT_CHART_PALETTE[Math.max(0, expIdx) % FIT_CHART_PALETTE.length]

    // Use µM when available (HPLC), fall back to conversion% (CSV).
    const sampleTc = exp.replicates?.[0]?.timeCourse ?? exp.timeCourse ?? []
    const useUM = sampleTc.length > 0 && sampleTc[0].concentration_uM != null

    const traces = []
    if (exp.replicates?.length) {
      for (const rep of exp.replicates) {
        traces.push({
          type: 'scatter', mode: 'markers',
          x: rep.timeCourse.map(p => p.time),
          y: useUM
            ? rep.timeCourse.map(p => p.concentration_uM)
            : rep.timeCourse.map(p => p.conversion),
          name: `rep ${rep.replicateId}`,
          marker: { size: 7, color: color, opacity: 0.45 },
        })
      }
    } else if (exp.timeCourse?.length) {
      traces.push({
        type: 'scatter', mode: 'markers',
        x: exp.timeCourse.map(p => p.time),
        y: useUM
          ? exp.timeCourse.map(p => p.concentration_uM)
          : exp.timeCourse.map(p => p.conversion),
        name: 'data',
        marker: { size: 7, color: color, opacity: 0.45 },
      })
    }
    // Fit curve: simY_uM (µM) when available, else simY (conversion%).
    const fitY = useUM && exp.fit?.simY_uM?.length ? exp.fit.simY_uM : exp.fit?.simY
    if (exp.fit?.simT?.length && fitY?.length) {
      traces.push({
        type: 'scatter', mode: 'lines',
        x: exp.fit.simT,
        y: fitY,
        name: 'fit', line: { color: color, width: 2 },
      })
    }
    const f = exp.fit || {}
    const subtitle = f.ku != null
      ? `ku=${sci(f.ku, 2)} k1=${sci(f.k1, 2)} kr=${sci(f.kr, 2)} k_bg=${sci(f.k_bg, 2)}`
      : ''
    const limitLabel = exp.limit_uM != null ? ` · R_max=${exp.limit_uM.toFixed(2)} µM` : ''
    const layout = {
      title: { text: `${exp.sequence}${limitLabel}${subtitle ? ' · ' + subtitle : ''}`, font: { size: 10 } },
      xaxis: { title: 't / min' },
      yaxis: useUM
        ? { title: '[R] / µM' }
        : { title: 'conversion %', range: [0, 105] },
      margin: { l: 50, r: 10, t: 40, b: 35 },
      showlegend: false,
      paper_bgcolor: store.isDarkMode ? '#0f172a' : '#ffffff',
      plot_bgcolor: store.isDarkMode ? '#0f172a' : '#ffffff',
      font: { color: store.isDarkMode ? '#e2e8f0' : '#0f172a' },
    }
    Plotly.react(el, traces, layout, { responsive: true, displayModeBar: false })
  }
}

watch([hplcDerived, () => hplcSettings.productMin, () => hplcSettings.productMax, () => hplcSettings.scanMin, () => hplcSettings.scanMax],
      () => { nextTick(renderHplcCharts) }, { deep: true })
// Re-render after show — v-if destroys DOM, so refs are fresh on re-mount.
watch(hplcShowGallery, (v) => { if (v) nextTick(renderHplcCharts) })
watch(() => dataset.experiments.map(e => ({ id: e.groupId, fit: e.fit })),
      () => { nextTick(renderFitCharts) }, { deep: true })

// ════════════════ Mount ════════════════

watch(() => [dataset.experiments, dataset.config.yieldThreshold, heatX.value, heatY.value, store.isDarkMode], renderAll, { deep: true })
watch(seqCandidates, computePredictedLogo, { deep: true })
// Ensure a dnaStocks entry exists for every building-block letter that appears
// in the current suggestions so v-model bindings in the template never hit undefined.
watch(exportBuildingBlocks, ({ aside, bside, asideComp, bsideComp }) => {
  for (const l of [...aside, ...bside, ...asideComp, ...bsideComp]) {
    if (!dnaStocks[l]) dnaStocks[l] = { conc: 0, inv: null }
    if (dnaInvSearch[l] == null) dnaInvSearch[l] = ''
    if (!dnaStocks[l].inv) {
      const match = findExactDnaStock(l)
      if (match) {
        dnaStocks[l].inv = match
        if (typeof match.stock === 'number') dnaStocks[l].conc = match.stock
      }
    }
  }
}, { immediate: true })

onMounted(() => {
  nextTick(renderAll)
})

onBeforeUnmount(() => {
  if (curvePlotEl.value) Plotly.purge(curvePlotEl.value)
  if (heatPlotEl.value) Plotly.purge(heatPlotEl.value)
})
</script>

<style scoped>
/* ── Layout ─────────────────────────────────────────────── */
.module-card { display: flex; flex-direction: column; gap: 10px; }

.layout-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
@media (max-width: 1024px) { .layout-columns { grid-template-columns: 1fr; } }

.col-left  { display: flex; flex-direction: column; gap: 15px; min-width: 0; }
.col-right { display: flex; flex-direction: column; gap: 15px; min-width: 0; }

/* ── Header ─────────────────────────────────────────────── */
.full-width-header { margin-bottom: 5px; }
.dataset-name-input {
  font-size: 1.1rem; font-weight: 700; color: var(--primary, #3b82f6);
  border: none; border-bottom: 2px solid var(--primary, #3b82f6);
  background: transparent; padding: 2px 0; min-width: 200px; outline: none;
}

/* ── Sections ────────────────────────────────────────────── */
.internal-section h3 {
  font-size: 1.05rem;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  padding-bottom: 6px; margin-bottom: 10px; margin-top: 0;
  color: var(--primary, #3b82f6);
}

/* ── Grids & range inputs ─────────────────────────────────── */
.grid-2-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.grid-3-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }

/* ── HPLC import panel ─────────────────────────────────────── */
.hplc-toolbar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  margin-bottom: 8px;
}
.hplc-toolbar-spacer { flex: 1 1 auto; }
.hplc-toolbar .small.active { background: #3b82f6; color: #fff; }

.hplc-schema {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; flex-wrap: wrap;
  font-size: 0.72rem; opacity: 0.8;
  padding: 4px 8px;
  background: var(--summary-bg, #f1f5f9);
  border-radius: 4px;
  margin-bottom: 8px;
}
.hplc-schema code { font-family: ui-monospace, Menlo, monospace; font-size: 0.72rem; }
.hplc-status { font-size: 0.72rem; opacity: 0.7; }

.hplc-settings {
  margin-bottom: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 6px;
  display: flex; flex-direction: column; gap: 4px;
}
.hplc-settings details { padding: 4px 0; }
.hplc-settings summary {
  cursor: pointer; font-size: 0.78rem; font-weight: 600;
  padding: 4px 2px; user-select: none;
  text-transform: none;
}
.hplc-settings summary::marker { color: var(--primary, #3b82f6); }
.hplc-settings details > *:not(summary) { margin-top: 6px; }
.hplc-settings .input-group { margin: 0; }
.hplc-settings .input-group label { font-size: 0.7rem; text-transform: none; letter-spacing: 0; }
.hplc-settings .radio-inline {
  display: inline-flex; align-items: center; gap: 4px;
  text-transform: none; font-weight: normal;
}

.hplc-window {
  margin: 8px 0;
  padding: 6px 10px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 6px;
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
}
.hplc-window-label {
  font-size: 0.78rem; font-weight: 600; white-space: nowrap;
}
.hplc-window-inputs {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.hplc-window-inputs label {
  display: flex; align-items: center; gap: 4px; font-size: 0.75rem;
}
.hplc-window-inputs input[type="number"] { width: 70px; }
.hplc-window-dash { font-size: 1rem; }

.hplc-skipped {
  margin-top: 8px; padding: 6px 10px;
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px; font-size: 0.72rem;
}
.hplc-skipped ul { margin: 4px 0 0 16px; padding: 0; }

.hplc-preview {
  margin-top: 8px; max-height: 220px; overflow: auto;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 6px;
}
.hplc-preview table { width: 100%; font-size: 0.72rem; border-collapse: collapse; }
.hplc-preview thead { background: var(--summary-bg, #f1f5f9); position: sticky; top: 0; }
.hplc-preview th, .hplc-preview td {
  padding: 3px 6px; text-align: right; white-space: nowrap;
  text-transform: none;
}
.hplc-preview th.left, .hplc-preview td.left { text-align: left; }
.hplc-preview td.filename { max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
.hplc-preview tr.row-error { opacity: 0.5; }
.cond-input  { width: 56px; padding: 1px 3px; font-size: 0.7rem; }
.cond-select { width: 80px; padding: 1px 2px; font-size: 0.7rem; }

/* ── HPLC chromatogram + kinetic-fit gallery ──────────────── */
.hplc-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 10px;
  max-height: 70vh;
  overflow-y: auto;
  padding: 6px 2px;
}
.hplc-gallery-card {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 6px;
  padding: 6px;
  background: var(--surface, #ffffff);
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.hplc-gallery-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}

.range-inputs { display: flex; gap: 6px; }
.range-inputs input { flex: 1; min-width: 0; }

/* ── Input groups ───────────────────────────────────────── */
.input-group label { display: block; font-size: 0.8rem; margin-bottom: 4px; font-weight: bold; opacity: 0.8; }
.input-group input,
.input-group select { width: 100%; padding: 6px; border-radius: 4px; border: 1px solid var(--border-color, #cbd5e1); background: transparent; color: inherit; font-size: 0.85rem; }

/* ── Status banners ─────────────────────────────────────── */
.section-error {
  background: rgba(239,68,68,0.1); color: #ef4444;
  border: 1px solid #ef4444; border-radius: 4px;
  padding: 8px 10px; margin-top: 8px;
  font-size: 0.8rem; display: flex; align-items: center; gap: 8px;
}
.section-info {
  background: rgba(16,185,129,0.1); color: #10b981;
  border: 1px solid #10b981; border-radius: 4px;
  padding: 8px 10px; margin-top: 8px;
  font-size: 0.8rem; display: flex; align-items: center; gap: 8px;
}
.section-warn {
  background: rgba(59,130,246,0.08); color: var(--primary, #3b82f6);
  border: 1px solid var(--primary, #3b82f6); border-radius: 4px;
  padding: 6px 10px; margin-bottom: 8px;
  font-size: 0.75rem; display: flex; align-items: center; gap: 8px;
}

/* ── Action buttons ─────────────────────────────────────── */
.engine-row {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  font-size: 0.72rem; opacity: 0.85;
  margin-bottom: 6px; padding: 4px 0;
}
.engine-label { font-weight: 700; color: var(--primary, #3b82f6); text-transform: uppercase; letter-spacing: 0.4px; }
.engine-opt { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
.engine-opt input { margin: 0; }

.action-row { display: flex; gap: 6px; }
.compact-btn {
  flex: 1; min-width: 0;
  display: flex; align-items: center; justify-content: center; gap: 5px;
  padding: 7px 6px; border-radius: 6px; border: none;
  font-weight: bold; font-size: 0.76rem;
  background: #3b82f6; color: white;
  box-shadow: 0 2px 4px rgba(59,130,246,0.3);
  cursor: pointer; transition: all 0.2s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.compact-btn:hover:not(:disabled) { background: #2563eb; transform: translateY(-1px); }
.compact-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Scoped button variants ─────────────────────────────── */
.success-btn { background: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; }
.danger-btn  { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid #ef4444; border-radius: 4px; padding: 4px 10px; cursor: pointer; }
.danger-btn:hover { background: #ef4444; color: white; }
.clear-btn   { background: transparent; border: none; color: #ef4444; cursor: pointer; padding: 2px; border-radius: 4px; }

/* ── Ledger ─────────────────────────────────────────────── */
.ledger-table-container { max-height: 280px; overflow-y: auto; border: 1px solid var(--border-color, #e2e8f0); border-radius: 6px; }
.ledger-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
.ledger-table th {
  position: sticky; top: 0; background: var(--input-bg, #f8fafc); z-index: 1;
  padding: 6px 8px; text-align: left; border-bottom: 1px solid var(--border-color, #e2e8f0);
  font-weight: 700; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.4px;
}
/* Disable uppercasing for chemical symbols (Mg, Cl, etc.) */
.no-upper { text-transform: none !important; }
.ledger-table td { padding: 6px 8px; border-bottom: 1px solid var(--border-color, #f1f5f9); }
.seq-cell { font-family: monospace; font-size: 0.75rem; }
.env-cell { font-size: 0.75rem; opacity: 0.85; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Plots side-by-side ─────────────────────────────────── */
.plots-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.plot-col { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.plot-col-header {
  display: flex; align-items: center; justify-content: space-between;
  min-height: 22px;
}
.plot-title { font-size: 0.8rem; font-weight: 700; opacity: 0.85; }
.axis-select { font-size: 0.72rem; padding: 2px 4px; border-radius: 3px; border: 1px solid var(--border-color, #cbd5e1); background: transparent; color: inherit; }

/* ── Plot areas ─────────────────────────────────────────── */
.plot-area {
  width: 100%; aspect-ratio: 1 / 1;
  border-radius: 6px; border: 1px solid var(--border-color, #e2e8f0);
  overflow: hidden;
}

/* ── External plot legend ───────────────────────────────── */
/* Height tuned to fit ~4 entries (legend-item ~17px + 3px gap = 20px) → 80px */
.plot-legend { display: flex; flex-direction: column; gap: 3px; max-height: 80px; overflow-y: auto; padding-right: 2px; }
.plot-legend::-webkit-scrollbar { width: 5px; }
.plot-legend::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); border-radius: 3px; }
.legend-item {
  display: flex; align-items: center; gap: 5px;
  font-size: 0.7rem; line-height: 1.3;
}
.legend-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; border: 1px solid rgba(0,0,0,0.15); }
.legend-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.85; font-family: monospace; }
.legend-val { flex-shrink: 0; font-weight: 600; font-size: 0.68rem; opacity: 0.9; }

/* ── Section 2: sub-section label ──────────────────────── */
.sub-label {
  font-size: 0.72rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.4px;
  opacity: 0.65; margin-bottom: 5px;
}

/* ── AL Engine config box ───────────────────────────────── */
.al-config-box {
  margin-bottom: 10px;
  padding: 9px 10px;
  background: rgba(59,130,246,0.05);
  border: 1px solid var(--border-color, #cbd5e1);
  border-radius: 6px;
  display: flex; flex-direction: column; gap: 7px;
}
.al-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.al-input label {
  display: block; font-size: 0.7rem; font-weight: bold;
  color: var(--primary, #3b82f6); margin-bottom: 2px;
}
.al-input input {
  width: 100%; padding: 4px 6px; font-size: 0.78rem;
  border-radius: 4px; border: 1px solid var(--border-color, #cbd5e1);
  background: transparent; color: inherit;
}

/* ── Compact inline sliders ─────────────────────────────── */
.slider-row { display: flex; align-items: center; gap: 8px; }
.slider-label {
  flex-shrink: 0; min-width: 50px;
  font-size: 0.7rem; font-weight: bold; color: var(--primary, #3b82f6);
}
.slider-input { flex: 1; min-width: 0; margin: 0; }
.slider-value {
  flex-shrink: 0; min-width: 38px; text-align: right;
  font-size: 0.72rem; font-weight: 700; font-family: monospace;
}
.slider-hint {
  flex-shrink: 0; font-size: 0.65rem; opacity: 0.6;
  min-width: 56px; text-align: left;
}

/* ── Sequence logo ──────────────────────────────────────── */
.logo-wrap { width: 100%; overflow-x: auto; padding: 8px 0; color: var(--text); }
.logo-wrap svg { display: block; }

.logos-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 900px) { .logos-row { grid-template-columns: 1fr; } }
.logo-col { display: flex; flex-direction: column; min-width: 0; }
.logo-col-header {
  font-size: 0.75rem; font-weight: 700; opacity: 0.85;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  padding-bottom: 4px; margin-bottom: 6px;
}
.logo-empty {
  font-size: 0.75rem; opacity: 0.5; padding: 24px 8px; text-align: center;
}

/* ── Send-to-Wellplate panel ───────────────────────────── */
.wellplate-export {
  margin-top: 12px;
  padding: 10px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 6px;
  background: rgba(139, 92, 246, 0.04);
}
.wellplate-export-header {
  font-size: 0.82rem; font-weight: 700;
  color: #8b5cf6;
  margin-bottom: 4px;
  display: flex; align-items: center; gap: 6px;
}
.wellplate-export-hint {
  font-size: 0.7rem; opacity: 0.65; margin: 0 0 8px;
}
.wellplate-export-hint code {
  font-family: monospace; font-size: 0.7rem;
  background: rgba(0,0,0,0.07); padding: 0 4px; border-radius: 3px;
}

.wellplate-stock-grid { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
.stock-scope-row {
  display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
  padding: 4px 8px; background: rgba(139,92,246,0.06); border-radius: 6px;
}
.stock-scope-label { font-size: 0.7rem; font-weight: 700; opacity: 0.7; }
.scope-opt {
  display: flex; align-items: center; gap: 4px;
  font-size: 0.72rem; cursor: pointer; opacity: 0.65;
  padding: 2px 8px; border-radius: 4px; transition: opacity 0.15s;
}
.scope-opt input { margin: 0; cursor: pointer; }
.scope-opt.active { opacity: 1; font-weight: 700; }
.stock-row { display: flex; flex-direction: column; gap: 2px; }
.stock-row label {
  font-size: 0.7rem; font-weight: 700; opacity: 0.75;
}
.stock-input-row {
  display: flex; align-items: center; gap: 6px;
}
.stock-input-row input[type="number"] {
  flex: 0 0 110px;
  padding: 4px 6px; font-size: 0.78rem;
  border: 1px solid var(--border-color, #cbd5e1);
  border-radius: 4px;
  background: transparent; color: inherit;
}
.stock-unit { font-size: 0.7rem; opacity: 0.55; min-width: 24px; }

.inv-picker { position: relative; flex: 1; display: flex; gap: 4px; align-items: center; min-width: 0; }
.inv-pick-btn {
  flex: 1; min-width: 0;
  padding: 4px 8px; font-size: 0.72rem;
  border: 1px solid var(--border-color, #cbd5e1); border-radius: 4px;
  background: transparent; color: inherit; cursor: pointer;
  text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.inv-pick-btn:hover { background: rgba(139, 92, 246, 0.08); }
.inv-clear-btn {
  border: none; background: transparent; color: #ef4444; cursor: pointer;
  padding: 0 4px; font-size: 0.85rem;
}

.inv-dropdown {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 50;
  background: var(--surface, #fff);
  border: 1px solid var(--border-color, #cbd5e1); border-radius: 6px;
  box-shadow: 0 10px 15px -3px rgba(0,0,0,0.18);
  overflow: hidden;
  min-width: 240px;
}
.inv-dropdown input[type="text"] {
  width: 100%; padding: 6px 8px; font-size: 0.78rem;
  border: none; border-bottom: 1px solid var(--border-color, #cbd5e1);
  background: var(--input-bg, transparent); color: inherit; outline: none;
}
.inv-results { max-height: 180px; overflow-y: auto; }
.inv-item {
  padding: 6px 10px; font-size: 0.75rem; cursor: pointer;
  border-bottom: 1px solid var(--border-color, #f1f5f9);
}
.inv-item:hover { background: rgba(139, 92, 246, 0.10); }
.inv-stock { opacity: 0.65; font-size: 0.7rem; }
.inv-empty { padding: 10px; text-align: center; opacity: 0.5; font-size: 0.7rem; }

.wellplate-export-row {
  display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end;
  margin-top: 4px;
}

/* ── Suggestion cards ───────────────────────────────────── */
.suggestion-card {
  padding: 8px 10px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 6px;
  background: var(--summary-bg, #f8fafc);
  margin-bottom: 6px;
  font-size: 0.8rem;
}
.sug-id  { font-weight: 700; color: var(--primary, #3b82f6); margin-right: 5px; font-size: 0.75rem; }
.sug-seq { font-family: monospace; font-size: 0.78rem; word-break: break-all; }
.sug-name { font-size: 0.72rem; font-weight: 700; color: #8b5cf6; margin-left: 6px; }

/* ── DNA Building Block sub-section ────────────────────────── */
.stock-section-label {
  font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.4px; color: #8b5cf6;
}
.stock-section-hint {
  font-size: 0.68rem; opacity: 0.6; margin-bottom: 4px;
}
.strand-group-label {
  font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.3px; color: #8b5cf6; opacity: 0.75;
  margin-top: 6px; margin-bottom: 2px;
}

/* ── Utilities ──────────────────────────────────────────── */
.flex-between { display: flex; justify-content: space-between; align-items: center; }
.checkbox-label { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; cursor: pointer; color: #475569; font-weight: bold; }

/* ── Modal ──────────────────────────────────────────────── */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center; z-index: 2000;
}
.modal-body {
  background: var(--surface); border-radius: 8px;
  width: 92%; max-width: 720px; max-height: 80vh;
  display: flex; flex-direction: column; overflow: hidden;
}
.modal-header { padding: 14px 18px; border-bottom: 1px solid var(--border-color, #e2e8f0); }
.modal-content { padding: 14px 18px; overflow-y: auto; }

/* ── Library ────────────────────────────────────────────── */
.library-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 12px; border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 6px; background: var(--surface); margin-bottom: 8px;
}
.lib-scope {
  display: inline-block; padding: 1px 8px; border-radius: 999px;
  font-size: 0.7rem; margin-left: 6px;
  background: var(--summary-bg); border: 1px solid var(--border-color, #e2e8f0);
}
.scope-global   { background: rgba(16,185,129,0.18); border-color: #10b981; }
.scope-personal { background: rgba(59,130,246,0.12); border-color: #3b82f6; }
</style>
