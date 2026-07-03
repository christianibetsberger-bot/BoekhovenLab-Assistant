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

            <div class="input-group" v-if="config.enableCompD">
              <label>Component D <select :value="config.compDUnit" @change="changeUnit('compD', config.compDUnit, $event.target.value)" class="unit-select"><option v-for="u in unitOptions" :key="u" :value="u">{{ u }}</option></select></label>
              <div style="display: flex; gap: 5px; align-items: flex-end;">
                <div style="flex: 2; position: relative;" @click.stop>
                  <div @click="activeDropdown = activeDropdown === 'compD' ? null : 'compD'" class="inventory-select-box">
                    <span class="truncate-text">{{ config.compDName || 'Search inventory...' }}</span>
                    <i class="fas fa-search" style="font-size: 0.7rem; opacity: 0.5;"></i>
                  </div>
                  <div v-if="activeDropdown === 'compD'" class="inventory-dropdown">
                    <div class="dropdown-scope-selector">
                      <label class="checkbox-label"><input type="radio" value="Global" v-model="config.compDSearchScope"> Global</label>
                      <label class="checkbox-label"><input type="radio" value="Personal" v-model="config.compDSearchScope"> Personal</label>
                    </div>
                    <div class="dropdown-search">
                      <input type="text" v-model="config.compDSearchQuery" placeholder="Filter inventory..." @click.stop>
                    </div>
                    <div class="dropdown-results">
                      <div v-for="inv in filterBlockInventory(config.compDSearchQuery, config.compDSearchScope)" :key="inv.id" class="dropdown-item" @mousedown.prevent="selectInventory('compD', inv)">
                        [{{ inv.code }}] {{ inv.name }} ({{inv.stock}} {{inv.stockUnit || 'µM'}})
                      </div>
                    </div>
                  </div>
                </div>
                <input type="number" v-model="config.compDMin" @change="renderPlot" style="flex: 0.4;" :title="`Min (${config.compDUnit})`" placeholder="Min" />
                <input type="number" v-model="config.compDMax" @change="renderPlot" style="flex: 0.4;" :title="`Max (${config.compDUnit})`" placeholder="Max" />
                <input type="number" v-model="config.compDStep" @change="renderPlot" style="flex: 0.4;" :title="`Step (${config.compDUnit})`" placeholder="Step" />
                <input type="number" v-model="config.stockCompD" style="flex: 0.6;" :title="`Stock (${config.compDUnit})`" :placeholder="`Stock ${config.compDUnit}`" />
              </div>
            </div>
          </div>

          <div style="margin-top: 8px;">
            <label class="checkbox-label" style="font-size: 0.78rem;">
              <input type="checkbox" v-model="config.enableCompD" @change="renderPlot">
              Enable 4th component (Component D) — adds a slider sweep through D in the 3D scatter
            </label>
          </div>

          <!-- ── Component Links (dependencies) ── -->
          <div style="margin-top: 8px;">
            <button type="button"
              @click="config.showDependencies = !config.showDependencies"
              style="width:100%; text-align:left; background:transparent; border:1px dashed var(--border-color,#cbd5e1); border-radius:6px; padding:5px 10px; cursor:pointer; color:inherit; font-size:0.78rem; opacity:0.75; display:flex; align-items:center; gap:8px;">
              <i class="fas" :class="config.showDependencies ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
              Component Links — lock one component as a function of another (e.g. D = 2 × C)
              <span v-if="config.dependencies && config.dependencies.length" style="margin-left:auto; background:rgba(139,92,246,0.2); color:#8b5cf6; border-radius:10px; padding:1px 7px; font-size:0.7rem;">{{ config.dependencies.length }} link{{ config.dependencies.length > 1 ? 's' : '' }}</span>
            </button>

            <div v-if="config.showDependencies" style="margin-top:8px; padding:10px 12px; border:1px solid var(--border-color,#e2e8f0); border-radius:6px; font-size:0.8rem; display:flex; flex-direction:column; gap:8px;">
              <p style="font-size:0.72rem; opacity:0.6; margin:0;">
                Each link enforces <strong>target = source × factor + offset</strong> (values in each component's configured unit).
                Applied when exporting to wellplate and when post-processing AI suggestions.
              </p>

              <!-- Existing links -->
              <div v-for="(dep, di) in (config.dependencies || [])" :key="di"
                style="display:grid; grid-template-columns:1fr 20px 1fr 16px 80px 16px 70px auto; gap:6px; align-items:center;">
                <select v-model="dep.source" style="font-size:0.78rem; padding:3px 5px;">
                  <option v-for="k in COMP_KEYS" :key="k" :value="k">{{ compLabel(k) }}</option>
                </select>
                <span style="text-align:center; opacity:0.5;">→</span>
                <select v-model="dep.target" @change="dep.target === 'compD' && (config.enableCompD = true)" style="font-size:0.78rem; padding:3px 5px;">
                  <option v-for="k in COMP_KEYS" :key="k" :value="k" :disabled="k === dep.source">{{ compLabel(k) }}</option>
                </select>
                <span style="text-align:center; opacity:0.5; font-size:0.7rem;">×</span>
                <input type="number" v-model.number="dep.factor" step="any" style="font-size:0.78rem; padding:3px 5px;" placeholder="factor" title="Multiplier">
                <span style="text-align:center; opacity:0.5; font-size:0.7rem;">+</span>
                <input type="number" v-model.number="dep.offset" step="any" style="font-size:0.78rem; padding:3px 5px;" placeholder="offset" title="Offset (in target unit)">
                <button @click="removeDependency(di)" style="background:none; border:none; cursor:pointer; color:#ef4444; font-size:0.85rem; padding:0 4px;" title="Remove link">✕</button>
              </div>

              <div v-if="!config.dependencies || config.dependencies.length === 0" style="font-size:0.75rem; opacity:0.45; text-align:center; padding:4px 0;">
                No links defined yet.
              </div>

              <button class="small" @click="addDependency" style="align-self:flex-start; padding:3px 10px; font-size:0.75rem;">
                <i class="fas fa-plus"></i> Add Link
              </button>
            </div>
          </div>

          <!-- ── Advanced: Solvents, Background Salt & pH ── -->
          <div style="margin-top: 10px;">
            <button type="button"
              @click="config.showMediumSettings = !config.showMediumSettings"
              style="width:100%; text-align:left; background:transparent; border:1px dashed var(--border-color,#cbd5e1); border-radius:6px; padding:5px 10px; cursor:pointer; color:inherit; font-size:0.78rem; opacity:0.75; display:flex; align-items:center; gap:8px;">
              <i class="fas" :class="config.showMediumSettings ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
              Advanced: Component Solvents · Background Salt (Na⁺) · pH
            </button>

            <div v-if="config.showMediumSettings" style="margin-top:8px; padding:12px; border:1px solid var(--border-color,#e2e8f0); border-radius:6px; font-size:0.8rem; display:flex; flex-direction:column; gap:10px;">
              <p style="font-size:0.72rem; opacity:0.6; margin:0;">
                Specify the solvent each stock is dissolved in. Background Na⁺ is subtracted from the Component C (salt) volume during well-plate export so the target final concentration is met exactly. Volume-weighted H⁺ mixing gives a per-well pH estimate.
              </p>

              <!-- Header row -->
              <div style="display:grid; grid-template-columns:120px 100px 1fr 130px 80px; gap:6px; align-items:center; font-size:0.7rem; font-weight:700; opacity:0.55; text-transform:uppercase; letter-spacing:0.04em;">
                <span>Component</span>
                <span>Solvent</span>
                <span>Buffer name</span>
                <span>Na⁺ in solvent (mM)</span>
                <span>Stock pH</span>
              </div>

              <!-- Component A -->
              <div style="display:grid; grid-template-columns:120px 100px 1fr 130px 80px; gap:6px; align-items:center;">
                <span style="font-size:0.78rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" :title="config.anionName">A: {{ config.anionName }}</span>
                <select v-model="config.anionMedium.type" style="font-size:0.78rem; padding:3px 5px;">
                  <option value="water">MQ Water</option>
                  <option value="buffer">Buffer</option>
                </select>
                <input v-if="config.anionMedium.type === 'buffer'" type="text" v-model="config.anionMedium.bufName" placeholder="e.g. Tris-HCl 50 mM" style="font-size:0.78rem; padding:3px 5px;">
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
                <input v-if="config.anionMedium.type === 'buffer'" type="number" v-model.number="config.anionMedium.naMM" step="any" min="0" placeholder="0" style="font-size:0.78rem; padding:3px 5px;">
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
                <input v-if="config.anionMedium.type === 'buffer'" type="number" v-model.number="config.anionMedium.pH" step="0.1" min="0" max="14" placeholder="7.0" style="font-size:0.78rem; padding:3px 5px;">
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
              </div>

              <!-- Component B -->
              <div style="display:grid; grid-template-columns:120px 100px 1fr 130px 80px; gap:6px; align-items:center;">
                <span style="font-size:0.78rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" :title="config.cationName">B: {{ config.cationName }}</span>
                <select v-model="config.cationMedium.type" style="font-size:0.78rem; padding:3px 5px;">
                  <option value="water">MQ Water</option>
                  <option value="buffer">Buffer</option>
                </select>
                <input v-if="config.cationMedium.type === 'buffer'" type="text" v-model="config.cationMedium.bufName" placeholder="e.g. PBS 1× pH 7.4" style="font-size:0.78rem; padding:3px 5px;">
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
                <input v-if="config.cationMedium.type === 'buffer'" type="number" v-model.number="config.cationMedium.naMM" step="any" min="0" placeholder="0" style="font-size:0.78rem; padding:3px 5px;">
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
                <input v-if="config.cationMedium.type === 'buffer'" type="number" v-model.number="config.cationMedium.pH" step="0.1" min="0" max="14" placeholder="7.0" style="font-size:0.78rem; padding:3px 5px;">
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
              </div>

              <!-- Component C (salt) -->
              <div style="display:grid; grid-template-columns:120px 100px 1fr 130px 80px; gap:6px; align-items:center;">
                <span style="font-size:0.78rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" :title="config.saltName">C: {{ config.saltName }}</span>
                <select v-model="config.saltMedium.type" style="font-size:0.78rem; padding:3px 5px;">
                  <option value="water">MQ Water</option>
                  <option value="buffer">Buffer</option>
                </select>
                <input v-if="config.saltMedium.type === 'buffer'" type="text" v-model="config.saltMedium.bufName" placeholder="buffer name" style="font-size:0.78rem; padding:3px 5px;">
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
                <input v-if="config.saltMedium.type === 'buffer'" type="number" v-model.number="config.saltMedium.naMM" step="any" min="0" placeholder="0" style="font-size:0.78rem; padding:3px 5px;">
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
                <input v-if="config.saltMedium.type === 'buffer'" type="number" v-model.number="config.saltMedium.pH" step="0.1" min="0" max="14" placeholder="7.0" style="font-size:0.78rem; padding:3px 5px;">
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
              </div>

              <!-- Component D (optional) -->
              <div v-if="config.enableCompD" style="display:grid; grid-template-columns:120px 100px 1fr 130px 80px; gap:6px; align-items:center;">
                <span style="font-size:0.78rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" :title="config.compDName">D: {{ config.compDName }}</span>
                <select v-model="config.compDMedium.type" style="font-size:0.78rem; padding:3px 5px;">
                  <option value="water">MQ Water</option>
                  <option value="buffer">Buffer</option>
                </select>
                <input v-if="config.compDMedium.type === 'buffer'" type="text" v-model="config.compDMedium.bufName" placeholder="buffer name" style="font-size:0.78rem; padding:3px 5px;">
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
                <input v-if="config.compDMedium.type === 'buffer'" type="number" v-model.number="config.compDMedium.naMM" step="any" min="0" placeholder="0" style="font-size:0.78rem; padding:3px 5px;">
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
                <input v-if="config.compDMedium.type === 'buffer'" type="number" v-model.number="config.compDMedium.pH" step="0.1" min="0" max="14" placeholder="7.0" style="font-size:0.78rem; padding:3px 5px;">
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
              </div>

              <!-- Divider -->
              <div style="border-top:1px dashed var(--border-color,#cbd5e1); padding-top:8px; font-size:0.72rem; font-weight:700; opacity:0.55; text-transform:uppercase; letter-spacing:0.04em;">Fill-up solution</div>

              <!-- Fill-up -->
              <div style="display:grid; grid-template-columns:120px 100px 1fr 130px 80px; gap:6px; align-items:center;">
                <span style="font-size:0.78rem;">Remainder</span>
                <select v-model="config.fillupMedium.type" style="font-size:0.78rem; padding:3px 5px;">
                  <option value="water">MQ Water</option>
                  <option value="buffer">Buffer</option>
                </select>
                <template v-if="config.fillupMedium.type === 'buffer'">
                  <div style="position:relative; display:flex; flex-direction:column; gap:3px;" @click.stop>
                    <input type="text" v-model="config.fillupMedium.bufName" placeholder="Buffer name" style="font-size:0.78rem; padding:3px 5px;">
                    <!-- Inventory link for fill-up buffer -->
                    <div @click="activeDropdown = activeDropdown === 'fillup' ? null : 'fillup'" class="inventory-select-box" style="font-size:0.72rem; padding:2px 5px;">
                      <span class="truncate-text">{{ config.fillupMedium.inv ? `[${config.fillupMedium.inv.code}] ${config.fillupMedium.inv.name}` : 'Link inventory…' }}</span>
                      <i class="fas fa-search" style="font-size:0.65rem; opacity:0.5;"></i>
                    </div>
                    <div v-if="activeDropdown === 'fillup'" class="inventory-dropdown">
                      <div class="dropdown-scope-selector">
                        <label class="checkbox-label"><input type="radio" value="Global" v-model="config.fillupMedium.searchScope"> Global</label>
                        <label class="checkbox-label"><input type="radio" value="Personal" v-model="config.fillupMedium.searchScope"> Personal</label>
                      </div>
                      <div class="dropdown-search">
                        <input type="text" v-model="config.fillupMedium.searchQuery" placeholder="Filter inventory..." @click.stop>
                      </div>
                      <div class="dropdown-results">
                        <div
                          v-for="inv in filterBlockInventory(config.fillupMedium.searchQuery, config.fillupMedium.searchScope)"
                          :key="inv.id" class="dropdown-item"
                          @mousedown.prevent="config.fillupMedium.inv = inv; activeDropdown = null"
                        >
                          [{{ inv.code }}] {{ inv.name }} ({{ inv.stock }} {{ inv.stockUnit || 'µM' }})
                        </div>
                      </div>
                    </div>
                    <button v-if="config.fillupMedium.inv" @click="config.fillupMedium.inv = null" style="font-size:0.65rem; background:none; border:none; cursor:pointer; color:#ef4444; text-align:left; padding:0;">✕ Clear link</button>
                  </div>
                </template>
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
                <input v-if="config.fillupMedium.type === 'buffer'" type="number" v-model.number="config.fillupMedium.naMM" step="any" min="0" placeholder="0" style="font-size:0.78rem; padding:3px 5px;">
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
                <input v-if="config.fillupMedium.type === 'buffer'" type="number" v-model.number="config.fillupMedium.pH" step="0.1" min="0" max="14" placeholder="7.0" style="font-size:0.78rem; padding:3px 5px;">
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
              </div>

              <!-- Live preview for first suggestion -->
              <template v-if="suggestions.length > 0">
                <div style="border-top:1px solid var(--border-color,#e2e8f0); padding-top:8px;">
                  <div style="font-size:0.7rem; font-weight:700; opacity:0.55; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">Preview (first AI target)</div>
                  <div style="font-size:0.78rem; display:flex; gap:16px; flex-wrap:wrap;">
                    <span>A: <strong>{{ computeWellVolumes(suggestions[0]).vA.toFixed(2) }} µL</strong></span>
                    <span>B: <strong>{{ computeWellVolumes(suggestions[0]).vB.toFixed(2) }} µL</strong></span>
                    <span>C (adj.): <strong>{{ computeWellVolumes(suggestions[0]).vC.toFixed(2) }} µL</strong></span>
                    <span>Fill: <strong>{{ computeWellVolumes(suggestions[0]).vFill.toFixed(2) }} µL</strong></span>
                    <span v-if="computeWellVolumes(suggestions[0]).backgroundNa_mM > 0.001" style="color:#f59e0b;">
                      Bg Na⁺: <strong>{{ computeWellVolumes(suggestions[0]).backgroundNa_mM.toFixed(2) }} mM</strong>
                    </span>
                    <span v-if="computeWellVolumes(suggestions[0]).mixedPH !== null" style="color:#8b5cf6;">
                      Est. pH: <strong>{{ computeWellVolumes(suggestions[0]).mixedPH }}</strong>
                    </span>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <div class="internal-section" style="flex-grow: 1;">
          <div class="flex-between" style="margin-bottom: 6px;">
            <h3 style="margin: 0; border: none; padding: 0;">2. Experiment Ledger</h3>
            <span v-if="activeDataset" style="font-size: 0.72rem; opacity: 0.65;">
              <i class="fas fa-database"></i> Loaded:
              <strong>{{ activeDataset.name || '—' }}</strong>
              <span :style="{ marginLeft: '4px', padding: '1px 5px', borderRadius: '3px', fontSize: '0.65rem',
                background: activeDataset.scope === 'Global' ? 'rgba(59,130,246,0.18)' : 'rgba(148,163,184,0.18)',
                color: activeDataset.scope === 'Global' ? '#3b82f6' : 'inherit' }">
                {{ activeDataset.scope || 'Personal' }}
              </span>
              <span v-if="!canMutateActive" style="margin-left:4px; opacity:0.7;" title="You don't own this dataset — Save will create a new copy under your account.">(read-only)</span>
            </span>
            <span v-else style="font-size: 0.72rem; opacity: 0.55;">
              <i class="fas fa-circle-dot"></i> Unsaved workspace
            </span>
          </div>
          <div style="display:flex; gap:6px; align-items:center; margin-bottom:8px; padding:6px 8px; background:var(--summary-bg,#f1f5f9); border:1px solid var(--border-color,#e2e8f0); border-radius:6px; flex-wrap:wrap;">
            <input type="text" v-model="datasetNameInput" placeholder="Dataset name…"
              style="flex:1 1 160px; min-width:120px; padding:5px 8px; font-size:0.82rem; border:1px solid var(--border-color,#cbd5e1); border-radius:4px; background:transparent; color:inherit;" />
            <div style="display:flex; gap:6px; align-items:center; padding:0 4px; font-size:0.72rem;">
              <label class="checkbox-label" style="margin:0;"><input type="radio" value="Personal" v-model="datasetScope"> Personal</label>
              <label class="checkbox-label" style="margin:0;"><input type="radio" value="Global" v-model="datasetScope"> Global</label>
            </div>
            <button class="small success-btn" @click="saveCurrentDataset" :disabled="isSavingData || !datasetNameInput.trim()" style="padding:5px 10px;">
              <i class="fas" :class="isSavingData ? 'fa-spinner fa-spin' : 'fa-save'"></i>
              {{ isSavingData ? 'Saving…' : 'Save' }}
            </button>
            <select :value="activeDatasetId || ''" @change="loadDataset($event.target.value)"
              style="flex:0 0 auto; padding:5px 8px; font-size:0.82rem; border:1px solid var(--border-color,#cbd5e1); border-radius:4px; background:transparent; color:inherit;">
              <option value="" disabled>Load dataset…</option>
              <optgroup label="Personal">
                <option v-for="d in datasets.filter(x => (x.scope || 'Personal') === 'Personal' && x.ownerId === store.user?.id)" :key="d.id" :value="d.id">
                  {{ d.name }}{{ d.experiments ? ` (${d.experiments.length} pts)` : '' }}
                </option>
              </optgroup>
              <optgroup label="Global">
                <option v-for="d in datasets.filter(x => x.scope === 'Global')" :key="d.id" :value="d.id">
                  {{ d.name }}{{ d.experiments ? ` (${d.experiments.length} pts)` : '' }}{{ d.ownerId !== store.user?.id ? ' • shared' : '' }}
                </option>
              </optgroup>
            </select>
            <button class="small" @click="newDataset" title="Clear workspace for a new dataset" style="padding:5px 10px;">
              <i class="fas fa-file-circle-plus"></i> New
            </button>
            <button class="small danger-btn" @click="deleteDataset" :disabled="!activeDatasetId || !canMutateActive" title="Delete the currently-loaded dataset (owner only)" style="padding:5px 10px;">
              <i class="fas fa-trash"></i>
            </button>
          </div>
          <div class="ledger-table-container">
            <table class="ledger-table">
              <thead>
                <tr>
                  <th>A (<span class="unit-text">{{ config.anionUnit }}</span>)</th>
                  <th>B (<span class="unit-text">{{ config.cationUnit }}</span>)</th>
                  <th>C (<span class="unit-text">{{ config.saltUnit }}</span>)</th>
                  <th v-if="config.enableCompD">D (<span class="unit-text">{{ config.compDUnit }}</span>)</th>
                  <th>Observed Phase</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(exp, index) in experiments" :key="exp.id || index">
                  <td><input type="number" v-model="exp.anion" @change="updateExperiment(exp)" class="small-input" /></td>
                  <td><input type="number" v-model="exp.cation" @change="updateExperiment(exp)" class="small-input" /></td>
                  <td><input type="number" v-model="exp.salt" @change="updateExperiment(exp)" class="small-input" /></td>
                  <td v-if="config.enableCompD"><input type="number" v-model="exp.compD" @change="updateExperiment(exp)" class="small-input" /></td>
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

          <!-- Row 1: instrument + file + wellplate -->
          <div style="display:grid; grid-template-columns:auto 1fr auto; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap;">
            <select v-model="prReaderType" style="font-size:0.8rem; padding:4px 8px; font-weight:600; white-space:nowrap;" title="Select which plate reader was used">
              <option value="reader2">Platereader 2</option>
              <option value="reader1" disabled>Platereader 1 (template pending)</option>
            </select>
            <div style="display:flex; gap:6px; align-items:center; min-width:0;">
              <button class="small" @click="prInputRef.click()"><i class="fas fa-upload"></i> Load CSV</button>
              <input type="file" ref="prInputRef" accept=".csv,.CSV,.txt" style="display:none" @change="onPlatereaderCsvSelected" />
              <span v-if="prODMap" style="font-size:0.75rem; color:var(--success-color,#10b981); white-space:nowrap;">
                <i class="fas fa-check-circle"></i> {{ Object.keys(prODMap).length }} wells loaded
              </span>
              <button v-if="prODMap" class="small danger-btn" @click="prODMap = null" style="padding:2px 8px;"><i class="fas fa-times"></i></button>
            </div>
            <button class="small" @click="prShowSettings = !prShowSettings" :style="prShowSettings ? 'background:var(--primary);color:#fff;' : ''" style="white-space:nowrap; padding:4px 8px;">
              <i class="fas fa-sliders"></i> Settings
            </button>
          </div>

          <!-- Settings panel -->
          <div v-if="prShowSettings" style="border:1px solid var(--border-color,#e2e8f0); border-radius:6px; padding:10px; margin-bottom:8px; font-size:0.8rem; display:flex; flex-direction:column; gap:8px;">
            <div style="font-weight:700; font-size:0.75rem; text-transform:uppercase; letter-spacing:.4px; opacity:.7;">OD → Phase Thresholds</div>
            <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px;">
              <div class="input-group" style="margin:0;">
                <label style="font-size:0.7rem;">Clear / Ph 1</label>
                <input type="number" step="0.01" min="0" max="1" v-model.number="prPhaseBoundaries.phase0max" style="padding:3px 5px; font-size:0.8rem;" />
              </div>
              <div class="input-group" style="margin:0;">
                <label style="font-size:0.7rem;">Ph 1 / Ph 2</label>
                <input type="number" step="0.01" min="0" max="2" v-model.number="prPhaseBoundaries.phase1max" style="padding:3px 5px; font-size:0.8rem;" />
              </div>
              <div class="input-group" style="margin:0;">
                <label style="font-size:0.7rem;">Ph 2 / Ph 3</label>
                <input type="number" step="0.01" min="0" max="2" v-model.number="prPhaseBoundaries.phase2max" style="padding:3px 5px; font-size:0.8rem;" />
              </div>
              <div class="input-group" style="margin:0;">
                <label style="font-size:0.7rem;">Ph 3 / Ph 4</label>
                <input type="number" step="0.01" min="0" max="5" v-model.number="prPhaseBoundaries.phase3max" style="padding:3px 5px; font-size:0.8rem;" />
              </div>
            </div>
            <div style="font-weight:700; font-size:0.75rem; text-transform:uppercase; letter-spacing:.4px; opacity:.7; margin-top:4px;">Dissolution Detection</div>
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
              <label class="checkbox-label" style="font-size:0.8rem;">
                <input type="checkbox" v-model="prDissolutionEnabled" /> Enable
              </label>
              <template v-if="prDissolutionEnabled">
                <div class="input-group" style="margin:0; display:flex; align-items:center; gap:6px;">
                  <label style="font-size:0.75rem; white-space:nowrap;">OD drops below</label>
                  <input type="number" step="0.01" min="0" max="2" v-model.number="prDissolutionThreshold" style="width:64px; padding:3px 5px; font-size:0.8rem;" />
                  <span style="opacity:.6; font-size:0.75rem;">→ classified as Clear (dissolved)</span>
                </div>
              </template>
              <span v-else style="opacity:.55; font-size:0.75rem;">If OD drops below a threshold after peaking, classify the well as Clear (dissolved droplets).</span>
            </div>
          </div>

          <!-- Wellplate picker -->
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

            <!-- OD → Phase legend (live thresholds) -->
            <div style="display:flex; gap:6px; flex-wrap:wrap; font-size:0.7rem; margin-bottom:8px; padding:5px 8px; background:var(--summary-bg,#f1f5f9); border-radius:4px;">
              <span v-for="t in OD_THRESHOLDS_DISPLAY" :key="t.phase" style="display:flex; align-items:center; gap:3px;">
                <span :style="{ display:'inline-block', width:'10px', height:'10px', borderRadius:'2px', background: getPhaseColor(t.phase, 0.35), border:`1px solid ${getPhaseColor(t.phase,1)}` }"></span>
                {{ t.label }}: {{ t.range }}
              </span>
              <span v-if="prDissolutionEnabled" style="display:flex; align-items:center; gap:3px; opacity:.75;">
                <i class="fas fa-arrow-down" style="font-size:0.65rem;"></i> Dissolved if OD&nbsp;≤&nbsp;{{ prDissolutionThreshold }} after peak
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
              <div class="color-mode-toggle" title="Distinct hues for independent phases (coacervates, aggregates…); a light→dark intensity ramp for gradations of one phase. Clear is always red.">
                <button type="button" :class="{ active: colorMode === 'categorical' }" @click="colorMode = 'categorical'">
                  <i class="fas fa-palette"></i> Distinct
                </button>
                <button type="button" :class="{ active: colorMode === 'gradient' }" @click="colorMode = 'gradient'">
                  <i class="fas fa-sliders"></i> Gradient
                </button>
              </div>
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
          <div v-if="config.enableCompD" style="display:flex; align-items:center; gap:10px; margin-top:8px; padding:6px 10px; background:var(--summary-bg,#f1f5f9); border:1px solid var(--border-color,#e2e8f0); border-radius:6px; font-size:0.78rem;">
            <span style="font-weight:600; white-space:nowrap;">
              <i class="fas fa-sliders-h" style="opacity:0.6;"></i>
              {{ config.compDName || 'Component D' }} slice
            </span>
            <input type="range"
              :min="config.compDMin"
              :max="config.compDMax"
              :step="config.compDStep || 0.01"
              v-model.number="currentDSlice"
              style="flex:1; min-width:0;" />
            <span style="font-variant-numeric: tabular-nums; min-width:90px; text-align:right;">
              <strong>{{ currentDSlice }}</strong> {{ config.compDUnit }}
              <span style="opacity:0.55;">± {{ ((config.compDStep || 0) / 2).toFixed(3) }}</span>
            </span>
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
                    A: {{ sug.anion }} | B: {{ sug.cation }} | C: {{ sug.salt }}<span v-if="config.enableCompD"> | D: {{ sug.compD ?? 0 }}</span>
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

    <!-- ── 6. Additive Experiment Layer ── -->
    <div class="internal-section full-width-section">
      <div class="flex-between" style="border-bottom:1px solid var(--border-color,#e2e8f0); padding-bottom:8px; margin-bottom:12px;">
        <h3 style="margin:0; border:none; padding:0;">
          <i class="fas fa-flask" style="font-size:0.85rem; opacity:0.7;"></i> 6. Additive Experiment Layer
        </h3>
        <label class="checkbox-label" style="font-size:0.8rem; gap:8px;">
          <input type="checkbox" v-model="additiveConfig.enabled">
          Enable
        </label>
      </div>

      <div v-if="!additiveConfig.enabled" style="font-size:0.8rem; opacity:0.5; text-align:center; padding:8px 0;">
        Add a new component ON TOP of existing wells. Concentrations of all existing components are
        automatically diluted by the added volume.
      </div>

      <template v-else>
        <!-- Row 1: source + additive component definition -->
        <div style="display:grid; grid-template-columns:180px 1fr 120px 120px; gap:10px; align-items:end; margin-bottom:12px; flex-wrap:wrap;">
          <!-- Source -->
          <div class="input-group" style="margin:0;">
            <label style="font-size:0.75rem;">Base rows from</label>
            <select v-model="additiveConfig.source" style="padding:5px; font-size:0.82rem; width:100%;">
              <option value="suggestions">AI Suggestions ({{ suggestions.length }})</option>
              <option value="experiments">Experiment Ledger ({{ experiments.length }})</option>
            </select>
          </div>
          <!-- Component name + inventory -->
          <div class="input-group" style="margin:0; position:relative;" @click.stop>
            <label style="font-size:0.75rem;">Additive component</label>
            <div style="display:flex; gap:5px;">
              <input type="text" v-model="additiveConfig.name" placeholder="Name…" style="flex:1; font-size:0.82rem; padding:5px;" />
              <div style="flex:1.5; position:relative;">
                <div @click="additiveConfig.showAdditiveInvDropdown = !additiveConfig.showAdditiveInvDropdown" class="inventory-select-box" style="min-height:30px; font-size:0.78rem;">
                  <span class="truncate-text">{{ additiveConfig.inv ? `[${additiveConfig.inv.code}] ${additiveConfig.inv.name}` : 'Search inventory…' }}</span>
                  <i class="fas fa-search" style="font-size:0.7rem; opacity:0.5;"></i>
                </div>
                <div v-if="additiveConfig.showAdditiveInvDropdown" class="inventory-dropdown">
                  <div class="dropdown-scope-selector">
                    <label class="checkbox-label"><input type="radio" value="Global" v-model="additiveConfig.invSearchScope"> Global</label>
                    <label class="checkbox-label"><input type="radio" value="Personal" v-model="additiveConfig.invSearchScope"> Personal</label>
                  </div>
                  <div class="dropdown-search"><input type="text" v-model="additiveConfig.invSearchQuery" placeholder="Filter…" @click.stop /></div>
                  <div class="dropdown-results">
                    <div v-for="inv in filterBlockInventory(additiveConfig.invSearchQuery, additiveConfig.invSearchScope)" :key="inv.id"
                      class="dropdown-item"
                      @mousedown.prevent="additiveConfig.inv = inv; additiveConfig.name = inv.name; additiveConfig.stockConc = inv.stock; additiveConfig.stockUnit = inv.stockUnit || 'mM'; additiveConfig.showAdditiveInvDropdown = false">
                      [{{ inv.code }}] {{ inv.name }} ({{ inv.stock }} {{ inv.stockUnit || 'µM' }})
                    </div>
                  </div>
                </div>
              </div>
              <button v-if="additiveConfig.inv" @click="additiveConfig.inv = null" style="background:none; border:none; cursor:pointer; color:#ef4444; font-size:0.75rem; padding:0 4px;" title="Clear">✕</button>
            </div>
          </div>
          <!-- Stock concentration + unit -->
          <div class="input-group" style="margin:0;">
            <label style="font-size:0.75rem;">Stock conc.</label>
            <div style="display:flex; gap:4px;">
              <input type="number" v-model.number="additiveConfig.stockConc" min="0" step="any" style="flex:1; font-size:0.82rem; padding:5px;" placeholder="100" />
              <select v-model="additiveConfig.stockUnit" class="unit-select" style="max-width:56px;">
                <option v-for="u in unitOptions" :key="u" :value="u">{{ u }}</option>
              </select>
            </div>
          </div>
          <!-- Volumes to add -->
          <div class="input-group" style="margin:0;">
            <label style="font-size:0.75rem;">Volumes to add (µL, comma-sep.)</label>
            <input type="text" v-model="additiveConfig.volumesText" placeholder="1, 2, 5, 10" style="font-size:0.82rem; padding:5px; width:100%;" />
          </div>
        </div>

        <!-- Summary line -->
        <div style="font-size:0.76rem; opacity:0.65; margin-bottom:10px;">
          <strong>{{ additiveBaseRows.length }}</strong> base rows × <strong>{{ additiveVolumes.length }}</strong> volumes
          = <strong>{{ additivePreviewRows.length }}</strong> wells
          | Base volume: <strong>{{ config.targetVolume }} µL</strong>
          | Stock: <strong>{{ additiveConfig.stockConc }} {{ additiveConfig.stockUnit }}</strong>
        </div>

        <!-- Preview table (first 12 rows) -->
        <div v-if="additivePreviewRows.length > 0" style="overflow-x:auto; margin-bottom:12px;">
          <table class="ledger-table" style="font-size:0.74rem; min-width:600px;">
            <thead>
              <tr>
                <th>Base ID</th>
                <th>+Vol (µL)</th>
                <th>{{ config.anionName || 'A' }} ({{ config.anionUnit }})</th>
                <th>{{ config.cationName || 'B' }} ({{ config.cationUnit }})</th>
                <th>{{ config.saltName || 'C' }} ({{ config.saltUnit }})</th>
                <th v-if="config.enableCompD">{{ config.compDName || 'D' }} ({{ config.compDUnit }})</th>
                <th>{{ additiveConfig.name || 'Additive' }} ({{ additiveConfig.stockUnit }})</th>
                <th>Total (µL)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, ri) in additivePreviewRows.slice(0, 24)" :key="ri" :style="ri % additiveVolumes.length === 0 ? 'border-top:2px solid var(--border-color,#e2e8f0);' : ''">
                <td style="opacity:0.6;">{{ row._baseId }}</td>
                <td><strong>{{ row._vAdd }}</strong></td>
                <td>{{ row.anion }}</td>
                <td>{{ row.cation }}</td>
                <td>{{ row.salt }}</td>
                <td v-if="config.enableCompD">{{ row.compD }}</td>
                <td style="color:#f59e0b; font-weight:600;">{{ row.additive }}</td>
                <td style="opacity:0.6;">{{ row._totalVol }}</td>
              </tr>
              <tr v-if="additivePreviewRows.length > 24">
                <td :colspan="config.enableCompD ? 8 : 7" style="text-align:center; opacity:0.45; font-style:italic;">
                  … {{ additivePreviewRows.length - 24 }} more rows not shown
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Export controls -->
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <span style="font-size:0.82rem; font-weight:600; opacity:0.7;">Export additive wells:</span>
          <select v-model="targetPlateId" class="compact-select">
            <option value="" disabled>Select Plate…</option>
            <option v-for="p in store.wellPlates" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <input type="text" v-model="targetStartWell" placeholder="A1" class="compact-input" />
          <button class="small" @click="exportAdditiveToPlate"
            style="background:#f59e0b; color:#000; border:none; padding:4px 14px; border-radius:4px; cursor:pointer; font-weight:600;">
            <i class="fas fa-arrow-down"></i> Send to Plate
          </button>
          <span style="font-size:0.72rem; opacity:0.5;">
            {{ additivePreviewRows.length }} wells → fills {{ Math.ceil(additivePreviewRows.length / 12) }} rows
          </span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick, watch } from 'vue'
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

// Colour scheme for the data points.
//  · 'categorical' — a distinct hue per phase (for independent phases: coacervates, aggregates…).
//  · 'gradient'    — a single-hue intensity ramp across phases (for gradations of one phase).
// RULES: Clear (phase 0) is ALWAYS red; no other phase may be red.
const colorMode = ref('categorical');

// Gradient ramp used for phases 1‥4 in 'gradient' mode. Runs light-teal → deep-violet,
// deliberately avoiding red (reserved for Clear). Values are [r,g,b].
const GRADIENT_START = [125, 211, 252]; // sky-300
const GRADIENT_END   = [76, 29, 149];   // violet-900
const gradientColorFor = (phase) => {
    const maxP = 4;
    const p = Math.min(Math.max(phase, 1), maxP);
    const t = maxP > 1 ? (p - 1) / (maxP - 1) : 0;
    const c = i => Math.round(GRADIENT_START[i] + (GRADIENT_END[i] - GRADIENT_START[i]) * t);
    return `rgba(${c(0)}, ${c(1)}, ${c(2)}, 1)`;
};
const getPhaseColor = (phase, alpha = 1) => {
    if (phase === undefined || phase === null) return 'transparent';
    let rgb;
    if (phase === 0) rgb = 'rgba(239, 68, 68, 1)';          // Clear — always red
    else if (phase === -1) rgb = 'rgba(59, 130, 246, 1)';    // Untested / AI target
    else if (colorMode.value === 'gradient' && phase >= 1) rgb = gradientColorFor(phase);
    else rgb = phaseColors[phase] || 'rgba(148, 163, 184, 1)';
    return rgb.replace('1)', `${alpha})`);
};

// --- State ---
const config = ref({
  anionName: 'Compound A', anionMin: 0, anionMax: 6, anionStep: 0.5, stockAnion: 100, anionUnit: 'mM', anionInv: null, anionSearchQuery: '', anionSearchScope: 'Global',
  cationName: 'Compound B', cationMin: 0, cationMax: 6, cationStep: 0.5, stockCation: 100, cationUnit: 'mM', cationInv: null, cationSearchQuery: '', cationSearchScope: 'Global',
  saltName: 'Compound C', saltMin: 0, saltMax: 200, saltStep: 10, stockSalt: 1000, saltUnit: 'mM', saltInv: null, saltSearchQuery: '', saltSearchScope: 'Global',
  // Optional 4th component
  enableCompD: false,
  compDName: 'Compound D', compDMin: 0, compDMax: 1, compDStep: 0.1, stockCompD: 100, compDUnit: 'mM', compDInv: null, compDSearchQuery: '', compDSearchScope: 'Global',
  targetVolume: 100,
  strategy: 'safe',
  numSuggestions: 96,
  minDistanceFactor: 0.05,
  // Advanced medium / background salt / pH settings
  showMediumSettings: false,
  anionMedium:  { type: 'water', bufName: '', naMM: 0, pH: 7.0 },
  cationMedium: { type: 'water', bufName: '', naMM: 0, pH: 7.0 },
  saltMedium:   { type: 'water', bufName: '', naMM: 0, pH: 7.0 },
  compDMedium:  { type: 'water', bufName: '', naMM: 0, pH: 7.0 },
  fillupMedium: { type: 'water', bufName: '', naMM: 0, pH: 7.0, inv: null, searchQuery: '', searchScope: 'Global' },
  // Component dependency links: target = source * factor + offset (stored-unit arithmetic)
  dependencies: [],
  showDependencies: false,
})

// Current D-slice value for the 4th-component slider in the 3D scatter plot.
// Points whose |compD − currentDSlice| ≤ compDStep/2 are shown in the scatter.
const currentDSlice = ref(0)

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

// ─── Additive Layer ────────────────────────────────────────────────────────
// Lets the user spike a new component into an already-prepared set of wells.
// User specifies volumes (µL) to add; concentrations of ALL existing components
// are automatically diluted: c_final = c_base × Vbase / (Vbase + Vadd).
// The additive component reaches: c_add = stockConc × Vadd / (Vbase + Vadd).
const additiveConfig = reactive({
  enabled: false,
  source: 'suggestions',       // 'suggestions' | 'experiments'
  name: 'Additive',
  stockConc: 100,
  stockUnit: 'mM',
  inv: null,
  invSearchQuery: '',
  invSearchScope: 'Global',
  medium: { type: 'water', bufName: '', naMM: 0, pH: 7.0 },
  volumesText: '1, 2, 5, 10',
  showAdditiveInvDropdown: false,
})

const additiveVolumes = computed(() =>
  (additiveConfig.volumesText || '')
    .split(',')
    .map(s => parseFloat(s.trim()))
    .filter(n => !isNaN(n) && n > 0)
    .sort((a, b) => a - b)
)

const additiveBaseRows = computed(() =>
  additiveConfig.source === 'experiments' ? experiments.value : suggestions.value
)

const additivePreviewRows = computed(() => {
  if (!additiveConfig.enabled) return []
  const Vbase = config.value.targetVolume
  const stockMM = getMM(additiveConfig.stockConc, additiveConfig.stockUnit)
  const rows = []
  additiveBaseRows.value.forEach(base => {
    additiveVolumes.value.forEach(vAdd => {
      const Vnew = Vbase + vAdd
      const dil = Vbase / Vnew
      rows.push({
        _baseId: base.sampleId,
        _vAdd: vAdd,
        _totalVol: +Vnew.toFixed(4),
        anion:    +(base.anion    * dil).toFixed(4),
        cation:   +(base.cation   * dil).toFixed(4),
        salt:     +(base.salt     * dil).toFixed(4),
        compD:    +((base.compD || 0) * dil).toFixed(4),
        additive: +((stockMM * vAdd) / Vnew).toFixed(4),
      })
    })
  })
  return rows
})

const exportAdditiveToPlate = () => {
  if (!targetPlateId.value || !targetStartWell.value) {
    alert('Please select a target plate and starting well.')
    return
  }
  if (additivePreviewRows.value.length === 0) {
    alert('No additive rows to export. Check that there are base rows and at least one valid volume.')
    return
  }
  const plate = store.wellPlates.find(p => p.id === targetPlateId.value)
  if (!plate) return

  const startWell = targetStartWell.value.toUpperCase().trim()
  const match = startWell.match(/^([A-Z]+)(\d+)$/)
  if (!match) { alert('Invalid well format. Use A1, B2, etc.'); return }

  let startRow = match[1].charCodeAt(0) - 65
  let startCol = parseInt(match[2]) - 1

  const fmt = n => Number(n).toFixed(2)
  const stockMM = getMM(additiveConfig.stockConc, additiveConfig.stockUnit)

  const addInvTag = (vol) => {
    const inv = additiveConfig.inv
    if (!inv) return `<strong>${esc(additiveConfig.name || 'Additive')}:</strong> ${esc(fmt(vol))} µL<br>`
    return `&nbsp;<span class="inv-ref" contenteditable="false" data-labware=""><i class="fas fa-tag"></i>&nbsp;[${esc(inv.code)}] ${esc(inv.name)} (${esc(store.formatNum(inv.stock))} ${esc(inv.stockUnit || 'µM')})&nbsp;<i class="fas fa-times inv-ref-remove" style="cursor:pointer; margin-left:4px; opacity: 0.7;"></i></span>&nbsp; ${esc(fmt(vol))} µL<br>`
  }

  additivePreviewRows.value.forEach((row, i) => {
    const rOffset = Math.floor((startCol + i) / 12)
    const cOffset  = (startCol + i) % 12
    const targetR  = startRow + rOffset
    const targetC  = cOffset
    if (targetR >= 8 || targetC >= 12) return

    const wId    = String.fromCharCode(65 + targetR) + (targetC + 1)
    const vAdd   = row._vAdd
    const Vnew   = row._totalVol
    const vStock = stockMM > 0 ? (row.additive * Vnew) / stockMM : vAdd

    let html = `<strong style="color:#f59e0b;">Add→[${esc(String(row._baseId))}]</strong><br>`
    html += addInvTag(vStock)
    html += `<span style="font-size:0.65rem; color:#64748b;">After addition (${fmt(Vnew)} µL total):</span><br>`
    html += `<span style="font-size:0.68rem;">`
    html += `${esc(config.value.anionName || 'A')}: ${fmt(row.anion)} `
    html += `${esc(config.value.cationName || 'B')}: ${fmt(row.cation)} `
    html += `${esc(config.value.saltName || 'C')}: ${fmt(row.salt)}`
    if (config.value.enableCompD) html += ` ${esc(config.value.compDName || 'D')}: ${fmt(row.compD)}`
    html += ` | ${esc(additiveConfig.name || 'Add')}: ${fmt(row.additive)} ${esc(additiveConfig.stockUnit)}</span>`

    plate.wells[wId] = html
  })

  alert(`Exported ${additivePreviewRows.value.length} additive wells to "${plate.name}" starting at ${startWell}.`)
}

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
    } else if (type === 'compD') {
        const { range, newStock } = rescale(config.value.compDMin, config.value.compDMax, config.value.compDStep, config.value.stockCompD);
        if (range) { config.value.compDMin = range.min; config.value.compDMax = range.max; config.value.compDStep = range.step; }
        config.value.stockCompD = newStock;
        config.value.compDUnit = newUnit;
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
    } else if (type === 'compD') {
        const scaled = rescaleRange(config.value.compDMin, config.value.compDMax, config.value.compDStep, config.value.compDUnit, newUnit);
        if (scaled) { config.value.compDMin = scaled.min; config.value.compDMax = scaled.max; config.value.compDStep = scaled.step; }
        config.value.compDName = `[${inv.code}] ${inv.name}`;
        config.value.stockCompD = inv.stock;
        config.value.compDUnit = newUnit;
        config.value.compDInv = inv;
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

// Compute per-well volumes for a suggestion, accounting for background salt and pH.
// Returns { vA, vB, vC, vFill, backgroundNa_mM, mixedPH, exceeds }
const computeWellVolumes = (sug) => {
  const V   = config.value.targetVolume
  const cfg = config.value

  const vA = cfg.stockAnion  > 0 ? (sug.anion  * V) / cfg.stockAnion  : 0
  const vB = cfg.stockCation > 0 ? (sug.cation * V) / cfg.stockCation : 0
  const vD = (cfg.enableCompD && cfg.stockCompD > 0) ? ((sug.compD || 0) * V) / cfg.stockCompD : 0

  const medA    = cfg.anionMedium
  const medB    = cfg.cationMedium
  const medC    = cfg.saltMedium
  const medFill = cfg.fillupMedium

  const naA    = medA.type    === 'buffer' ? (medA.naMM    || 0) : 0
  const naB    = medB.type    === 'buffer' ? (medB.naMM    || 0) : 0
  const naC    = medC.type    === 'buffer' ? (medC.naMM    || 0) : 0
  const naFill = medFill.type === 'buffer' ? (medFill.naMM || 0) : 0

  const hasBackground = naA > 0 || naB > 0 || naC > 0 || naFill > 0

  let vC
  if (hasBackground && cfg.stockSalt > 0) {
    // Solve for vC so that total Na+ in well equals target:
    //   target_Na*V = vA*naA + vB*naB + vC*(stockSalt_mM + naC) + (V-vA-vB-vC)*naFill
    const stockC_mM = getMM(cfg.stockSalt, cfg.saltUnit)
    const targetNa  = getMM(sug.salt,      cfg.saltUnit)
    const denom = stockC_mM + naC - naFill
    if (denom !== 0) {
      const numer = (targetNa - naFill) * V - vA * (naA - naFill) - vB * (naB - naFill)
      vC = Math.max(0, numer / denom)
    } else {
      vC = cfg.stockSalt > 0 ? (sug.salt * V) / cfg.stockSalt : 0
    }
  } else {
    vC = cfg.stockSalt > 0 ? (sug.salt * V) / cfg.stockSalt : 0
  }

  const vFill = V - vA - vB - vC - vD

  const medD = cfg.compDMedium || { type: 'water', naMM: 0, pH: 7.0 }
  const naD = (cfg.enableCompD && medD.type === 'buffer') ? (medD.naMM || 0) : 0

  // Background Na already in well from component solvents + fill-up
  const backgroundNa_mM = vFill > 0
    ? (naA * vA + naB * vB + naC * vC + naD * vD + naFill * Math.max(0, vFill)) / V
    : (naA * vA + naB * vB + naC * vC + naD * vD) / V

  // Volume-weighted pH estimate (H+ mixing approximation)
  const dActive = cfg.enableCompD && medD
  const pHEnabled = medA.type === 'buffer' || medB.type === 'buffer' || medC.type === 'buffer' || medFill.type === 'buffer' || (dActive && medD.type === 'buffer')
  let mixedPH = null
  if (pHEnabled && V > 0) {
    const pHA    = medA.type    === 'buffer' ? (medA.pH    || 7) : 7
    const pHB    = medB.type    === 'buffer' ? (medB.pH    || 7) : 7
    const pHC    = medC.type    === 'buffer' ? (medC.pH    || 7) : 7
    const pHD    = dActive && medD.type === 'buffer' ? (medD.pH || 7) : 7
    const pHFill = medFill.type === 'buffer' ? (medFill.pH || 7) : 7
    const totalH = vA * Math.pow(10, -pHA) + vB * Math.pow(10, -pHB)
                 + Math.max(0, vC) * Math.pow(10, -pHC)
                 + (dActive ? Math.max(0, vD) * Math.pow(10, -pHD) : 0)
                 + Math.max(0, vFill) * Math.pow(10, -pHFill)
    mixedPH = +((-Math.log10(totalH / V)).toFixed(2))
  }

  return { vA, vB, vC, vD, vFill: Math.max(0, vFill), backgroundNa_mM, mixedPH, exceeds: vFill < 0 }
}

// Apply component-dependency links to a (copied) experiment/suggestion object.
// Formula (stored-unit arithmetic): target = source * factor + offset
const COMP_KEYS = ['anion', 'cation', 'salt', 'compD']
const compLabel = (key) => ({
  anion: () => config.value.anionName || 'A',
  cation: () => config.value.cationName || 'B',
  salt: () => config.value.saltName || 'C',
  compD: () => config.value.compDName || 'D',
}[key]?.() ?? key)

const applyDependencies = (exp) => {
  const deps = config.value.dependencies || []
  deps.forEach(dep => {
    if (!dep.source || !dep.target || dep.source === dep.target) return
    const srcVal = Number(exp[dep.source]) || 0
    exp[dep.target] = +(srcVal * (dep.factor ?? 1) + (dep.offset ?? 0)).toFixed(6)
  })
  return exp
}

const addDependency = () => {
  if (!config.value.dependencies) config.value.dependencies = []
  config.value.dependencies.push({ source: 'salt', target: 'compD', factor: 1, offset: 0 })
  config.value.enableCompD = true
}
const removeDependency = (i) => { config.value.dependencies.splice(i, 1) }

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
    
    const fmt = n => Number(n).toFixed(2)
    suggestions.value.forEach((sug, i) => {
        let rOffset = Math.floor((startCol + i) / 12);
        let cOffset = (startCol + i) % 12;

        let targetR = startRow + rOffset;
        let targetC = cOffset;

        if (targetR < 8 && targetC < 12) {
            let wId = String.fromCharCode(65 + targetR) + (targetC + 1);

            const effectiveSug = applyDependencies({ ...sug })
            const { vA, vB, vC, vD, vFill, backgroundNa_mM, mixedPH, exceeds } = computeWellVolumes(effectiveSug)

            let warningHtml = exceeds ? `<br><span style="color:#ef4444; font-size:0.7rem;">⚠️ Vol Exceeds Limit</span>` : '';

            let bgHtml = ''
            if (backgroundNa_mM > 0.001) {
              bgHtml += `<span style="font-size:0.68rem; color:#f59e0b;">⊕ Background Na⁺: ${fmt(backgroundNa_mM)} mM</span><br>`
            }
            if (mixedPH !== null) {
              bgHtml += `<span style="font-size:0.68rem; color:#8b5cf6;">⊕ Est. pH: ${mixedPH}</span><br>`
            }

            const fillupInv = config.value.fillupMedium.inv
            let fillupHtml
            if (fillupInv) {
              fillupHtml = `&nbsp;<span class="inv-ref" contenteditable="false" data-labware=""><i class="fas fa-tag"></i>&nbsp;[${esc(fillupInv.code)}] ${esc(fillupInv.name)} (${esc(store.formatNum(fillupInv.stock))} ${esc(fillupInv.stockUnit || 'mM')})&nbsp;<i class="fas fa-times inv-ref-remove" style="cursor:pointer; margin-left:4px; opacity: 0.7;"></i></span>&nbsp; ${fmt(vFill)} µL<br>`
            } else {
              const fillupLabel = config.value.fillupMedium.type === 'buffer'
                ? (config.value.fillupMedium.bufName || 'Buffer')
                : 'MQ H₂O'
              fillupHtml = `<strong>${esc(fillupLabel)}:</strong> ${fmt(vFill)} µL<br>`
            }

            const dRowHtml = config.value.enableCompD
                ? getInventoryTag(config.value.compDInv, fmt(vD), effectiveSug.compD || 0)
                : '';

            let cellHtml = `<strong style="color: var(--primary);">AI Target [${sug.sampleId}]</strong><br>
                            ${getInventoryTag(config.value.anionInv, fmt(vA), effectiveSug.anion)}
                            ${getInventoryTag(config.value.cationInv, fmt(vB), effectiveSug.cation)}
                            ${getInventoryTag(config.value.saltInv, fmt(vC), effectiveSug.salt)}
                            ${dRowHtml}${bgHtml}${fillupHtml}${warningHtml}`;

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
      classTraces[i] = { type: 'scatter3d', mode: 'markers', x:[], y:[], z:[], text:[], name: phaseNames[i], marker: {color: getPhaseColor(i), size: 5, symbol: 'circle', line: {color: '#000', width: 1}} };
  }
  
  const traceUnknown = { type: 'scatter3d', mode: 'markers', x: [], y: [], z: [], text: [], name: 'Untested', marker: { color: '#94a3b8', size: 2, symbol: 'circle' } };
  const traceTarget = { type: 'scatter3d', mode: 'markers', x: [], y: [], z: [], text: [], name: 'AI Target', marker: { color: getPhaseColor(-1), size: 4, symbol: 'cross', line: { color: '#fff', width: 1 } } };

  const allData = [...experiments.value, ...suggestions.value]

  // When 4D is active, filter to points whose compD is within ±step/2 of the current D slice.
  const dEnabled = config.value.enableCompD
  const dSlice = currentDSlice.value
  const dHalf = (config.value.compDStep || 0.1) / 2
  const dataForPlot = dEnabled
    ? allData.filter(e => {
        const dv = (e.compD === undefined || e.compD === null) ? 0 : e.compD
        return Math.abs(dv - dSlice) <= dHalf
      })
    : allData

  dataForPlot.forEach(exp => {
    const statusName = exp.phase === -1 ? 'AI Target' : (phaseNames[exp.phase] || `Phase ${exp.phase}`);
    const dTxt = dEnabled ? ` | D: ${exp.compD ?? 0}` : '';
    const label = `ID: ${exp.sampleId || 'Manual'} | ${statusName} | A: ${exp.anion} | B: ${exp.cation} | C: ${exp.salt}${dTxt}`;

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

          const baseColor = getPhaseColor(pId);
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
      marker: { color: getPhaseColor(i), size: 8, symbol: 'circle', line: { color: '#fff', width: 0.5 } } }
  }
  const traceUnknown = { type: 'scatter', mode: 'markers', x: [], y: [], text: [], name: 'Untested',
    marker: { color: '#94a3b8', size: 4, symbol: 'circle' } }
  const traceTarget = { type: 'scatter', mode: 'markers', x: [], y: [], text: [], name: 'AI Target',
    marker: { color: getPhaseColor(-1), size: 7, symbol: 'cross', line: { color: '#fff', width: 1 } } }

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

      const baseColor = getPhaseColor(pId)
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

watch([experiments, suggestions, config, currentDSlice], () => { renderPlot() }, { deep: true })
watch(colorMode, () => { renderPlot() })

// When the 4th component is toggled on, snap the D slice to the midpoint of its range.
watch(() => config.value.enableCompD, (on) => {
  if (on) currentDSlice.value = (config.value.compDMin + config.value.compDMax) / 2
})

// ─── Named-dataset persistence ────────────────────────────────────────────
// All workspace state (experiments + suggestions + config) is saved as one
// JSONB blob in the `phase_datasets` table. The user clicks Save to persist
// a named snapshot, Load to switch to another snapshot, New to clear.

const datasets = ref([])              // [{ id, name, scope, ownerId, savedAt, experiments, suggestions, config }]
const activeDatasetId = ref(null)
const datasetNameInput = ref('')
const datasetScope = ref('Personal')  // 'Personal' | 'Global' — chosen scope for the next save
const isSavingData = ref(false)

// Only the owner of a Global dataset can overwrite or delete it.
const activeDataset = computed(() => datasets.value.find(d => d.id === activeDatasetId.value) || null)
const canMutateActive = computed(() => {
  const ds = activeDataset.value
  if (!ds) return true
  return ds.ownerId === store.user?.id
})

const fetchDatasets = async () => {
  if (!store.user?.id) return
  // Pull everything the RLS policy will let through (own rows + Global rows).
  const { data, error } = await db.from('phase_datasets').select('*')
  if (error) { console.error(error); return }
  datasets.value = (data || [])
    .map(row => ({ ...row.data, scope: row.scope || 'Personal', ownerId: row.owner_id }))
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
}

// Bootstrap from legacy `phase_data` table if the user has no datasets yet.
// This lets existing users see their old data and save it as their first dataset.
const bootstrapLegacy = async () => {
  if (!store.user?.id) return
  const { data, error } = await db.from('phase_data').select('*').eq('owner_id', store.user.id)
  if (error || !data || data.length === 0) return
  experiments.value = data.map(row => ({
    sampleId: row.sampleId ?? row.sampleid,
    anion: row.anion, cation: row.cation, salt: row.salt,
    compD: row.compD ?? row.compd ?? 0,
    phase: row.phase,
  }))
  datasetNameInput.value = 'Legacy Data'
}

const updateExperiment = () => { renderPlot() }

const addManualRow = () => {
  experiments.value.push({ sampleId: Math.floor(Math.random() * 9000), anion: 0, cation: 0, salt: 0, compD: 0, phase: -1 })
}

const removeRow = (index) => {
  experiments.value.splice(index, 1)
  renderPlot()
}

const clearLedger = () => {
  if (!confirm('Clear all data points from the workspace? Saved datasets are not affected.')) return
  experiments.value = []
  suggestions.value = []
  boundaryData.value = null
  renderPlot()
}

const importSuggestion = (sug) => {
  experiments.value.push({ ...sug })
  suggestions.value = suggestions.value.filter(s => s.sampleId !== sug.sampleId)
  renderPlot()
}

const importAllSuggestions = () => {
  experiments.value.push(...suggestions.value.map(s => ({ ...s })))
  suggestions.value = []
  renderPlot()
}

// Build a serializable snapshot of the current workspace.
const buildSnapshot = (id, name) => ({
  id,
  name,
  savedAt: Date.now(),
  config: JSON.parse(JSON.stringify(config.value)),
  experiments: JSON.parse(JSON.stringify(experiments.value)),
  suggestions: JSON.parse(JSON.stringify(suggestions.value)),
})

const persistDataset = async (snapshot, scope) => {
  if (!store.user?.id) { alert('You must be signed in to save.'); return false }
  const payload = {
    item_id: snapshot.id,
    owner_id: store.user.id,
    scope: scope || 'Personal',
    data: { ...snapshot, scope: scope || 'Personal' },
  }
  const { error } = await db.from('phase_datasets').upsert(payload, { onConflict: 'item_id' })
  if (error) { console.error(error); alert(`Save failed: ${error.message}`); return false }
  return true
}

const saveCurrentDataset = async () => {
  const name = (datasetNameInput.value || '').trim()
  if (!name) { alert('Please enter a name for this dataset.'); return }
  const scope = datasetScope.value === 'Global' ? 'Global' : 'Personal'
  isSavingData.value = true
  try {
    // Reuse the loaded dataset's id only if its name AND scope are unchanged.
    // Renaming or changing scope branches into a new dataset, matching the
    // "save creates a new dataset when you change something distinguishing" workflow.
    const existing = activeDataset.value
    const reuseId = existing
      && existing.name === name
      && (existing.scope || 'Personal') === scope
      && existing.ownerId === store.user.id
    const id = reuseId ? existing.id : `phds_${crypto.randomUUID()}`
    const snapshot = buildSnapshot(id, name)
    const ok = await persistDataset(snapshot, scope)
    if (!ok) return
    activeDatasetId.value = id
    await fetchDatasets()
    alert(reuseId ? `Updated dataset "${name}" (${scope}).` : `Saved as new ${scope} dataset "${name}".`)
  } finally {
    isSavingData.value = false
  }
}

const loadDataset = (id) => {
  const ds = datasets.value.find(d => d.id === id)
  if (!ds) return
  // Merge saved config into current config so any new fields keep defaults.
  config.value = { ...config.value, ...(ds.config || {}) }
  experiments.value = (ds.experiments || []).map(e => ({ ...e }))
  suggestions.value = (ds.suggestions || []).map(s => ({ ...s }))
  activeDatasetId.value = id
  datasetNameInput.value = ds.name || ''
  datasetScope.value = ds.scope || 'Personal'
  boundaryData.value = null
  renderPlot()
}

const newDataset = () => {
  if (experiments.value.length || suggestions.value.length) {
    if (!confirm('Start a new dataset? Any unsaved changes in the current workspace will be lost.')) return
  }
  experiments.value = []
  suggestions.value = []
  boundaryData.value = null
  activeDatasetId.value = null
  datasetNameInput.value = ''
  datasetScope.value = 'Personal'
  renderPlot()
}

const deleteDataset = async () => {
  const id = activeDatasetId.value
  if (!id) { alert('No dataset is currently loaded.'); return }
  const ds = activeDataset.value
  if (ds && ds.ownerId && ds.ownerId !== store.user?.id) {
    alert('You can only delete datasets you own.')
    return
  }
  if (!confirm(`Permanently delete dataset "${ds?.name || id}"?`)) return
  const { error } = await db.from('phase_datasets').delete().eq('item_id', id)
  if (error) { alert(`Delete failed: ${error.message}`); return }
  await fetchDatasets()
  newDataset()
}

// ──────────────────────────────────────────────────────────────────────────

const csvInputRef = ref(null)

// ─── Platereader Import ────────────────────────────────────────────────────
const ALL_WELLS_96 = (() => {
  const rows = ['A','B','C','D','E','F','G','H']
  return rows.flatMap(r => [1,2,3,4,5,6,7,8,9,10,11,12].map(c => `${r}${c}`))
})()

// OD_THRESHOLDS kept for backward compat references; display version is OD_THRESHOLDS_DISPLAY (computed).
const OD_THRESHOLDS = [
  { phase: 0, label: 'Clear',   range: '0 – 0.15',   max: 0.15 },
  { phase: 1, label: 'Phase 1', range: '0.15 – 0.3',  max: 0.30 },
  { phase: 2, label: 'Phase 2', range: '0.3 – 0.6',   max: 0.60 },
  { phase: 3, label: 'Phase 3', range: '0.6 – 0.9',   max: 0.90 },
  { phase: 4, label: 'Phase 4', range: '> 0.9',        max: Infinity },
]

const prInputRef  = ref(null)
const prODMap     = ref(null)
const prMapSource = ref('untested')
const prStartWell = ref('A1')
const prLinkedPlateId  = ref(null)
const prReaderType     = ref('reader2')
const prShowSettings   = ref(false)
const prDissolutionEnabled   = ref(false)
const prDissolutionThreshold = ref(0.10)

// Configurable OD-to-phase boundaries (upper limit of each phase).
const prPhaseBoundaries = reactive({ phase0max: 0.15, phase1max: 0.30, phase2max: 0.60, phase3max: 0.90 })

const OD_THRESHOLDS_DISPLAY = computed(() => [
  { phase: 0, label: 'Clear',   range: `0 – ${prPhaseBoundaries.phase0max}` },
  { phase: 1, label: 'Phase 1', range: `${prPhaseBoundaries.phase0max} – ${prPhaseBoundaries.phase1max}` },
  { phase: 2, label: 'Phase 2', range: `${prPhaseBoundaries.phase1max} – ${prPhaseBoundaries.phase2max}` },
  { phase: 3, label: 'Phase 3', range: `${prPhaseBoundaries.phase2max} – ${prPhaseBoundaries.phase3max}` },
  { phase: 4, label: 'Phase 4', range: `> ${prPhaseBoundaries.phase3max}` },
])

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

// Classify an OD reading using the current reactive boundaries + dissolution check.
// maxOD = peak OD (first 5 min); minAfterPeak = minimum OD recorded after the peak time.
function odToPhase(maxOD, minAfterPeak = Infinity) {
  // Dissolution: if OD later dropped below the threshold, classify as Clear regardless of peak.
  if (prDissolutionEnabled.value && minAfterPeak <= prDissolutionThreshold.value) return 0
  const b = prPhaseBoundaries
  if (maxOD < b.phase0max) return 0
  if (maxOD < b.phase1max) return 1
  if (maxOD < b.phase2max) return 2
  if (maxOD < b.phase3max) return 3
  return 4
}

function parsePlatereaderReader2(text) {
  // Format: semicolon-delimited, col 0 = HH:MM:SS time, col 1 = temperature, cols 2+ = A1..H12
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return null
  const delim = lines[0].includes(';') ? ';' : ','
  const rawHeaders = lines[0].split(delim).map(h => h.replace(/[^\x20-\x7E]/g, '').trim())
  const wellColIdx = {}
  rawHeaders.forEach((h, i) => { if (/^[A-H]\d{1,2}$/.test(h)) wellColIdx[h] = i })
  if (!Object.keys(wellColIdx).length) return null

  // Parse full time series — need both first-5-min window (maxOD) and full course (dissolution).
  const series = {}   // wellId → [{time, od}]
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delim)
    const parts = (cols[0] || '').trim().split(':')
    const timeMin = parts.length >= 2
      ? parseInt(parts[0] || 0) * 60 + parseInt(parts[1] || 0) + (parseInt(parts[2] || 0) / 60)
      : NaN
    if (isNaN(timeMin)) continue
    for (const [wId, cIdx] of Object.entries(wellColIdx)) {
      const od = parseFloat(cols[cIdx])
      if (!isNaN(od)) { if (!series[wId]) series[wId] = []; series[wId].push({ time: timeMin, od }) }
    }
  }

  const result = {}
  for (const [wId, pts] of Object.entries(series)) {
    if (!pts.length) continue
    pts.sort((a, b) => a.time - b.time)
    // maxOD from the first 5 minutes.
    const first5 = pts.filter(p => p.time <= 5.0)
    const maxOD = first5.length ? Math.max(...first5.map(p => p.od)) : Math.max(...pts.map(p => p.od))
    // minAfterPeak from the full time course (any point after the time of peak OD).
    const peakTime = pts.find(p => p.od === maxOD)?.time ?? 0
    const afterPeak = pts.filter(p => p.time > peakTime)
    const minAfterPeak = afterPeak.length ? Math.min(...afterPeak.map(p => p.od)) : Infinity
    result[wId] = { maxOD, minAfterPeak }
  }
  return Object.keys(result).length ? result : null
}

function parsePlatereaderCsv(text) {
  if (prReaderType.value === 'reader2') return parsePlatereaderReader2(text)
  // reader1 parser will be added when the template is provided.
  alert('Platereader 1 format is not yet configured.')
  return null
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

  const getOD = wellId => prODMap.value[wellId]   // returns {maxOD, minAfterPeak} or undefined

  // ── Plate-based mapping: concentrations come from wellplate HTML, OD from CSV ──
  if (prLinkedPlate.value) {
    const wellData = prWellData.value
    const sidToExp = prSampleIdToExp.value
    return Object.entries(prODMap.value)
      .map(([wellId, odData]) => {
        const wd = wellData[wellId]
        if (!wd) return null
        const exp = sidToExp[String(wd.sampleId)]
        if (prMapSource.value === 'untested' && exp && exp.phase !== -1) return null
        const newPhase = odToPhase(odData.maxOD, odData.minAfterPeak)
        return { wellId, wd, exp: exp || null, odData, newPhase }
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
    const odData = getOD(wellId)
    if (!odData) return null
    return { wellId, exp, odData, newPhase: odToPhase(odData.maxOD, odData.minAfterPeak) }
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
  const conc = item.wd ? `A: ${item.wd.anion} · B: ${item.wd.cation} · C: ${item.wd.salt} mM` : ''
  const status = item.exp ? (item.exp.phase === -1 ? 'untested' : `phase ${item.exp.phase}`) : 'new'
  const od = item.odData
  const dissolvedNote = (prDissolutionEnabled.value && od && od.minAfterPeak <= prDissolutionThreshold.value)
    ? `\n⬇ Dissolved (min after peak: ${od.minAfterPeak.toFixed(4)})`  : ''
  return `${row}${col} · Sample ${sid} (${status})\n${conc}\nMax OD = ${od?.maxOD?.toFixed(4) ?? '?'}${dissolvedNote}\n→ ${name}`
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

const importPlatereaderResults = () => {
  const items = prPreviewItems.value
  if (!items.length) return
  let updated = 0, created = 0

  for (const { exp, wd, newPhase } of items) {
    if (exp) {
      // Experiment already in the workspace — update its phase in-place.
      const target = experiments.value.find(e => e === exp || e.sampleId === exp.sampleId)
      if (target) { target.phase = newPhase; updated++ }
    } else if (wd) {
      // Experiment was never logged — create it now from wellplate concentrations.
      experiments.value.push({
        sampleId: wd.sampleId,
        anion: wd.anion, cation: wd.cation, salt: wd.salt,
        compD: 0, phase: newPhase,
      })
      created++
    }
  }

  renderPlot()
  prODMap.value = null
  const msg = [updated && `${updated} updated`, created && `${created} created`].filter(Boolean).join(', ') || 'no changes'
  alert(`Platereader import complete: ${msg}. Click Save to persist to the active dataset.`)
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
  let idxD = headers.findIndex(h => h === 'compd' || h === 'd');
  let idxPhase = headers.indexOf('phase');

  if (idxId === -1) idxId = 0;
  if (idxA === -1) idxA = 1;
  if (idxB === -1) idxB = 2;
  if (idxC === -1) idxC = 3;
  if (idxPhase === -1) idxPhase = idxD === -1 ? 4 : 5;

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
    const d = idxD !== -1 ? parseFloat(cols[idxD]) : NaN;
    const rawPhase = parseInt(cols[idxPhase], 10);

    if (isNaN(sId)) sId = Math.floor(Math.random() * 9000);
    if (isNaN(a) || isNaN(b) || isNaN(c) || isNaN(rawPhase)) continue;
    if (rawPhase < -1 || rawPhase > 4) continue;

    const row = { sampleId: sId, anion: Number(a.toFixed(4)), cation: Number(b.toFixed(4)), salt: Number(c.toFixed(4)), phase: rawPhase };
    if (!isNaN(d)) row.compd = Number(d.toFixed(4));
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

  // CSV rows are added to the in-memory workspace; click Save to persist
  // them to the active dataset.
  for (const row of uniqueToInsert) {
    experiments.value.push({
      sampleId: row.sampleId,
      anion: row.anion, cation: row.cation, salt: row.salt,
      compD: row.compd ?? 0,
      phase: row.phase,
    });
  }
  renderPlot();
  alert(`Imported ${uniqueToInsert.length} data points into the workspace. Click Save to persist to the active dataset.`);
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
    suggestions.value = data.suggestions.map(s => applyDependencies({ ...s }));
    
  } catch (err) {
    console.error("Active Learning Engine failed:", err);
    alert("Could not connect to the Python Active Learning engine. Ensure the backend is running.");
  } finally {
    isCalculating.value = false;
  }
}

onMounted(async () => {
  if (store.user?.id) {
    await fetchDatasets()
    // If the user has saved datasets, leave the workspace empty until they Load one.
    // Otherwise, bootstrap from the legacy `phase_data` table so old data is visible
    // and can be saved as the user's first dataset.
    if (datasets.value.length === 0) await bootstrapLegacy()
  }
  nextTick(() => { renderPlot() })
})
</script>

<style scoped>
.module-card { display: flex; flex-direction: column; gap: 10px; }

/* Point-colour mode toggle (Distinct hues vs. intensity Gradient) */
.color-mode-toggle { display: inline-flex; border: 1px solid var(--border-color, #cbd5e1); border-radius: 6px; overflow: hidden; }
.color-mode-toggle button { background: transparent; border: none; padding: 3px 9px; font-size: 0.72rem; cursor: pointer; color: inherit; opacity: 0.7; display: flex; align-items: center; gap: 4px; }
.color-mode-toggle button + button { border-left: 1px solid var(--border-color, #cbd5e1); }
.color-mode-toggle button.active { background: var(--primary, #3b82f6); color: #fff; opacity: 1; }

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