<template>
  <div class="card module-card" @click="activeDropdown = null">
    <div class="full-width-header">
      <h2 style="display: flex; align-items: center; gap: 10px;">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 2.5v11h11"/><circle cx="5.5" cy="10.5" r="1"/><circle cx="8.5" cy="7" r="1"/><circle cx="11.5" cy="9" r="1"/></svg> Active Learning Phase Predictor
      </h2>
    </div>

    <div class="cond-bar">
      <span class="cond-blabel"><i class="fas fa-bookmark"></i> Saved conditions</span>
      <select v-model="selectedConditionId" @change="loadSelectedCondition" class="cond-select">
        <option value="">Load a preset…</option>
        <optgroup v-if="myConditions.length" label="Mine"><option v-for="c in myConditions" :key="c.item_id" :value="c.item_id">{{ c.name }}</option></optgroup>
        <optgroup v-if="globalConditions.length" label="Lab"><option v-for="c in globalConditions" :key="c.item_id" :value="c.item_id">{{ c.name }} · shared</option></optgroup>
      </select>
      <button class="cond-btn" @click="openSaveConditions"><i class="fas fa-floppy-disk"></i> Save conditions</button>
      <button v-if="selectedConditionId && selectedCondIsMine" class="cond-btn ghost" @click="deleteSelectedCondition" title="Delete this saved condition"><i class="fas fa-trash"></i></button>
    </div>

    <div class="layout-columns">
      
      <div class="col-left">
        <div class="internal-section">
          <div class="flex-between">
            <h3>Search Space, Steps &amp; Volumes</h3>
            <div class="target-vol-input">
              <label>Target Well Vol (µL):</label>
              <input type="number" v-model="config.targetVolume" @change="renderPlot" title="Total Volume per well in µL" />
            </div>
          </div>

          <!-- Shown while the ranges can still be fixed: the corner of the search space
               where every component sits at its maximum. Combinations past the well
               volume are excluded from the search, never suggested and never pipetted. -->
          <div v-if="worstCaseFill.frac > 1" style="margin-bottom:10px; padding:7px 10px; border-radius:6px; border:1px solid rgba(217,119,6,0.4); background:rgba(217,119,6,0.08); font-size:0.75rem; line-height:1.5;">
            <i class="fas fa-flask" style="opacity:0.7;"></i>
            At the top of every range a well needs <strong>{{ worstCaseFill.uL.toFixed(1) }} µL</strong>
            of {{ config.targetVolume }} µL. Those combinations can't be mixed, so the engine leaves them
            out of the search — use more concentrated stocks, lower the maxima, or raise the well volume
            to make them available.
          </div>


          <div class="config-grid-complex">
            <div class="input-group">
              <label>Component<select class="slot-select" :value="'anion'" @change="swapComponentTo('anion', $event.target.value)" title="Which letter this compound sits on. Pick another letter and the two swap places — ranges, stocks and every logged value move with them, so nothing changes meaning."><option v-for="k in COMP_KEYS" :key="k" :value="k">{{ SLOT_LETTER[k] }}</option></select> <select :value="config.anionUnit" @change="changeUnit('anion', config.anionUnit, $event.target.value)" class="unit-select"><option v-for="u in unitOptions" :key="u" :value="u">{{ u }}</option></select></label>
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
              <label>Component<select class="slot-select" :value="'cation'" @change="swapComponentTo('cation', $event.target.value)" title="Which letter this compound sits on. Pick another letter and the two swap places — ranges, stocks and every logged value move with them, so nothing changes meaning."><option v-for="k in COMP_KEYS" :key="k" :value="k">{{ SLOT_LETTER[k] }}</option></select> <select :value="config.cationUnit" @change="changeUnit('cation', config.cationUnit, $event.target.value)" class="unit-select"><option v-for="u in unitOptions" :key="u" :value="u">{{ u }}</option></select></label>
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
              <label>Component<select class="slot-select" :value="'salt'" @change="swapComponentTo('salt', $event.target.value)" title="Which letter this compound sits on. Pick another letter and the two swap places — ranges, stocks and every logged value move with them, so nothing changes meaning."><option v-for="k in COMP_KEYS" :key="k" :value="k">{{ SLOT_LETTER[k] }}</option></select> <select :value="config.saltUnit" @change="changeUnit('salt', config.saltUnit, $event.target.value)" class="unit-select"><option v-for="u in unitOptions" :key="u" :value="u">{{ u }}</option></select></label>
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

          <!-- ── 4th component (D) ── -->
          <div style="margin-top: 8px;">
            <button type="button"
              @click="toggleCompD"
              style="width:100%; text-align:left; background:transparent; border:1px dashed var(--border-color,#cbd5e1); border-radius:6px; padding:5px 10px; cursor:pointer; color:inherit; font-size:0.78rem; opacity:0.75; display:flex; align-items:center; gap:8px;">
              <i class="fas" :class="config.enableCompD ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
              <span title="Sweeps a 4th component through the design and adds a D slider to the 3D scatter. Opening this panel turns it on.">4th component (D)</span>
              <span v-if="config.enableCompD" style="margin-left:auto; background:rgba(139,92,246,0.2); color:#8b5cf6; border-radius:10px; padding:1px 7px; font-size:0.7rem;">on</span>
            </button>

            <div v-if="config.enableCompD" style="margin-top:8px; padding:10px 12px; border:1px solid var(--border-color,#e2e8f0); border-radius:6px;">
              <div class="input-group" style="margin:0;">
                <label>Component<select class="slot-select" :value="'compD'" @change="swapComponentTo('compD', $event.target.value)" title="Which letter this compound sits on. Pick another letter and the two swap places — ranges, stocks and every logged value move with them, so nothing changes meaning."><option v-for="k in COMP_KEYS" :key="k" :value="k">{{ SLOT_LETTER[k] }}</option></select> <select :value="config.compDUnit" @change="changeUnit('compD', config.compDUnit, $event.target.value)" class="unit-select"><option v-for="u in unitOptions" :key="u" :value="u">{{ u }}</option></select></label>
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
          </div>

          <!-- ── Constant components (same in every well) ── -->
          <div style="margin-top: 8px;">
            <button type="button"
              @click="config.showConstants = !config.showConstants"
              style="width:100%; text-align:left; background:transparent; border:1px dashed var(--border-color,#cbd5e1); border-radius:6px; padding:5px 10px; cursor:pointer; color:inherit; font-size:0.78rem; opacity:0.75; display:flex; align-items:center; gap:8px;">
              <i class="fas" :class="config.showConstants ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
              <span title="A fixed final concentration in every well (a dye, a background buffer), taken from the fill-up.">Constant components</span>
              <span v-if="config.constants && config.constants.length" style="margin-left:auto; background:rgba(139,92,246,0.2); color:#8b5cf6; border-radius:10px; padding:1px 7px; font-size:0.7rem;">{{ config.constants.length }}</span>
            </button>

            <div v-if="config.showConstants" style="margin-top:8px; padding:10px 12px; border:1px solid var(--border-color,#e2e8f0); border-radius:6px; font-size:0.8rem; display:flex; flex-direction:column; gap:8px;">
              <template v-if="config.constants && config.constants.length">
                <div style="display:grid; grid-template-columns:1.7fr 74px 66px 74px 66px 24px; gap:6px; font-size:0.66rem; font-weight:700; opacity:0.5; padding:0 2px;">
                  <span>Component</span><span>Final</span><span>unit</span><span>Stock</span><span>unit</span><span></span>
                </div>
                <div v-for="(k, i) in config.constants" :key="k.id" style="display:grid; grid-template-columns:1.7fr 74px 66px 74px 66px 24px; gap:6px; align-items:center;">
                  <div style="position:relative; display:flex; gap:4px; align-items:center; min-width:0;" @click.stop>
                    <div class="inventory-select-box" style="flex:1.2 1 0; min-width:0; font-size:0.78rem; padding:4px 8px; min-height:30px;"
                      :title="k.inv ? `[${k.inv.code}] ${k.inv.name} — chipped into every well` : 'Link an inventory item so this component reaches the wellplate, the lab journal and the usage log as a chip'"
                      @click="toggleConstantDropdown(k)">
                      <span class="truncate-text">{{ k.inv ? `[${k.inv.code}] ${k.inv.name}` : 'Link inventory…' }}</span>
                      <i class="fas" :class="k.inv ? 'fa-tag' : 'fa-search'" style="font-size:0.7rem; opacity:0.55;"></i>
                    </div>
                    <input v-if="!k.inv" type="text" v-model="k.name" placeholder="or free-text name…" style="flex:1 1 0; min-width:0; font-size:0.8rem; padding:5px;">
                    <button v-else @click="unlinkConstant(k)" title="Unlink from inventory (keeps the name)"
                      style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.75rem; padding:0 2px;">✕</button>
                    <div v-if="activeDropdown === 'const:' + k.id" class="inventory-dropdown">
                      <div class="dropdown-scope-selector">
                        <label class="checkbox-label"><input type="radio" value="Global" v-model="k.searchScope"> Global</label>
                        <label class="checkbox-label"><input type="radio" value="Personal" v-model="k.searchScope"> Personal</label>
                      </div>
                      <div class="dropdown-search">
                        <input type="text" v-model="k.searchQuery" placeholder="Filter inventory..." @click.stop>
                      </div>
                      <div class="dropdown-results">
                        <div v-for="inv in filterBlockInventory(k.searchQuery, k.searchScope)" :key="inv.id" class="dropdown-item" @mousedown.prevent="selectConstantInventory(k, inv)">
                          [{{ inv.code }}] {{ inv.name }} ({{ inv.stock }} {{ inv.stockUnit || 'µM' }})
                        </div>
                      </div>
                    </div>
                  </div>
                  <input type="number" v-model.number="k.conc" min="0" step="any" @change="renderPlot" style="font-size:0.8rem; padding:5px;" title="Final concentration in every well">
                  <select v-model="k.unit" @change="renderPlot" style="font-size:0.76rem; padding:4px;"><option v-for="u in CONST_UNITS" :key="u" :value="u">{{ u }}</option></select>
                  <input type="number" v-model.number="k.stockConc" min="0" step="any" @change="renderPlot" style="font-size:0.8rem; padding:5px;" title="Stock concentration">
                  <select v-model="k.stockUnit" @change="renderPlot" style="font-size:0.76rem; padding:4px;"><option v-for="u in CONST_UNITS" :key="u" :value="u">{{ u }}</option></select>
                  <button @click="removeConstant(i)" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.9rem;" title="Remove">✕</button>
                </div>
                <div style="font-size:0.72rem; opacity:0.6;" title="Linked components are written into every exported well as an inventory chip, so they carry through to the lab journal, the usage log and the robot protocols.">
                  Volume per well = final ÷ stock × {{ config.targetVolume }} µL.
                </div>
              </template>

              <div v-else style="font-size:0.75rem; opacity:0.45; text-align:center; padding:4px 0;">
                No constant components yet.
              </div>

              <button class="small" @click="addConstant" style="align-self:flex-start; padding:3px 10px; font-size:0.75rem;">
                <i class="fas fa-plus"></i> Add Constant
              </button>
            </div>
          </div>

          <!-- ── Component Links (dependencies) ── -->
          <div style="margin-top: 8px;">
            <button type="button"
              @click="config.showDependencies = !config.showDependencies"
              style="width:100%; text-align:left; background:transparent; border:1px dashed var(--border-color,#cbd5e1); border-radius:6px; padding:5px 10px; cursor:pointer; color:inherit; font-size:0.78rem; opacity:0.75; display:flex; align-items:center; gap:8px;">
              <i class="fas" :class="config.showDependencies ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
              <span title="Tie one component to another — either pinned to an exact value (D = 2 × C) or held within a range (D between 1× and 3× C). Values are in each component's configured unit.">Component Links</span>
              <span v-if="config.dependencies && config.dependencies.length" style="margin-left:auto; background:rgba(139,92,246,0.2); color:#8b5cf6; border-radius:10px; padding:1px 7px; font-size:0.7rem;">{{ config.dependencies.length }} link{{ config.dependencies.length > 1 ? 's' : '' }}</span>
            </button>

            <div v-if="config.showDependencies" style="margin-top:8px; padding:10px 12px; border:1px solid var(--border-color,#e2e8f0); border-radius:6px; font-size:0.8rem; display:flex; flex-direction:column; gap:8px;">
              <!-- Existing links -->
              <div v-for="(dep, di) in (config.dependencies || [])" :key="di"
                style="display:flex; gap:5px; align-items:center; flex-wrap:wrap;">
                <select v-model="dep.source" style="font-size:0.78rem; padding:3px 5px; flex:1 1 82px; min-width:0;">
                  <option v-for="k in COMP_KEYS" :key="k" :value="k">{{ compLabel(k) }}</option>
                </select>
                <span style="opacity:0.5;">→</span>
                <select v-model="dep.target" @change="dep.target === 'compD' && (config.enableCompD = true)" style="font-size:0.78rem; padding:3px 5px; flex:1 1 82px; min-width:0;">
                  <option v-for="k in COMP_KEYS" :key="k" :value="k" :disabled="k === dep.source">{{ compLabel(k) }}</option>
                </select>
                <select :value="dep.mode || 'fixed'" @change="setDependencyMode(dep, $event.target.value)"
                  style="font-size:0.78rem; padding:3px 5px; flex:0 0 78px;"
                  title="Fixed pins the target to one value. Range keeps it between two limits and lets the sweep explore in between.">
                  <option value="fixed">=</option>
                  <option value="range">between</option>
                </select>
                <span style="opacity:0.5; font-size:0.7rem;">×</span>
                <input type="number" v-model.number="dep.factor" step="any" style="font-size:0.78rem; padding:3px 5px; width:60px;" placeholder="factor" :title="(dep.mode === 'range' ? 'Lower-limit ' : '') + 'multiplier'">
                <span style="opacity:0.5; font-size:0.7rem;">+</span>
                <input type="number" v-model.number="dep.offset" step="any" style="font-size:0.78rem; padding:3px 5px; width:56px;" placeholder="offset" :title="(dep.mode === 'range' ? 'Lower-limit ' : '') + 'offset (target unit)'">
                <template v-if="dep.mode === 'range'">
                  <span style="opacity:0.5; font-size:0.7rem;">…&nbsp;×</span>
                  <input type="number" v-model.number="dep.factorMax" step="any" style="font-size:0.78rem; padding:3px 5px; width:60px;" placeholder="factor" title="Upper-limit multiplier">
                  <span style="opacity:0.5; font-size:0.7rem;">+</span>
                  <input type="number" v-model.number="dep.offsetMax" step="any" style="font-size:0.78rem; padding:3px 5px; width:56px;" placeholder="offset" title="Upper-limit offset (target unit)">
                </template>
                <label v-if="(dep.mode || 'fixed') !== 'range'" class="checkbox-label" style="font-size:0.7rem; opacity:0.75; gap:4px;"
                  :title="'Off (default): the ratio is kept exactly, so ' + compLabel(dep.target) + ' follows ' + compLabel(dep.source) + '\'s step. On: the derived value is rounded onto ' + compLabel(dep.target) + '\'s own step grid, which breaks the exact ratio.'">
                  <input type="checkbox" v-model="dep.snapStep"> snap to step
                </label>
                <button @click="removeDependency(di)" style="background:none; border:none; cursor:pointer; color:#ef4444; font-size:0.85rem; padding:0 4px; margin-left:auto;" title="Remove link">✕</button>
              </div>

              <div v-if="config.dependencies && config.dependencies.length" style="font-size:0.7rem; opacity:0.55; line-height:1.5;">
                A linked component is no longer swept independently: the engine only offers wells the link allows,
                so its own min/max still bound it but its step no longer sets its spacing (unless “snap to step” is on).
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
              <span title="Analysis only: reports the Na⁺ each well carries from the component solvents and the fill-up, and estimates the well pH from volume-weighted H⁺ mixing. Pipetted volumes are not affected.">Advanced: solvents · background Na⁺ · pH</span>
            </button>

            <div v-if="config.showMediumSettings" style="margin-top:8px; padding:12px; border:1px solid var(--border-color,#e2e8f0); border-radius:6px; font-size:0.8rem; display:flex; flex-direction:column; gap:10px;">
              <!-- Header row -->
              <div style="display:grid; grid-template-columns:120px 100px 1fr 130px 80px; gap:6px; align-items:center; font-size:0.7rem; font-weight:700; opacity:0.55; text-transform: none; letter-spacing:0.04em;">
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
                <PhaseBufferSelect v-if="config.anionMedium.type === 'buffer'" :medium="config.anionMedium" />
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
                <template v-if="config.anionMedium.type === 'buffer'">
                  <input v-if="!config.anionMedium.bufferId" type="number" v-model.number="config.anionMedium.naMM" step="any" min="0" placeholder="0" style="font-size:0.78rem; padding:3px 5px;">
                  <span v-else class="na-locked" title="Locked from the selected buffer"><i class="fas fa-lock"></i> {{ config.anionMedium.naMM }}</span>
                </template>
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
                <PhaseBufferSelect v-if="config.cationMedium.type === 'buffer'" :medium="config.cationMedium" />
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
                <template v-if="config.cationMedium.type === 'buffer'">
                  <input v-if="!config.cationMedium.bufferId" type="number" v-model.number="config.cationMedium.naMM" step="any" min="0" placeholder="0" style="font-size:0.78rem; padding:3px 5px;">
                  <span v-else class="na-locked" title="Locked from the selected buffer"><i class="fas fa-lock"></i> {{ config.cationMedium.naMM }}</span>
                </template>
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
                <input v-if="config.cationMedium.type === 'buffer'" type="number" v-model.number="config.cationMedium.pH" step="0.1" min="0" max="14" placeholder="7.0" style="font-size:0.78rem; padding:3px 5px;">
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
              </div>

              <!-- Component C -->
              <div style="display:grid; grid-template-columns:120px 100px 1fr 130px 80px; gap:6px; align-items:center;">
                <span style="font-size:0.78rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" :title="config.saltName">C: {{ config.saltName }}</span>
                <select v-model="config.saltMedium.type" style="font-size:0.78rem; padding:3px 5px;">
                  <option value="water">MQ Water</option>
                  <option value="buffer">Buffer</option>
                </select>
                <PhaseBufferSelect v-if="config.saltMedium.type === 'buffer'" :medium="config.saltMedium" />
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
                <template v-if="config.saltMedium.type === 'buffer'">
                  <input v-if="!config.saltMedium.bufferId" type="number" v-model.number="config.saltMedium.naMM" step="any" min="0" placeholder="0" style="font-size:0.78rem; padding:3px 5px;">
                  <span v-else class="na-locked" title="Locked from the selected buffer"><i class="fas fa-lock"></i> {{ config.saltMedium.naMM }}</span>
                </template>
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
                <PhaseBufferSelect v-if="config.compDMedium.type === 'buffer'" :medium="config.compDMedium" />
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
                <template v-if="config.compDMedium.type === 'buffer'">
                  <input v-if="!config.compDMedium.bufferId" type="number" v-model.number="config.compDMedium.naMM" step="any" min="0" placeholder="0" style="font-size:0.78rem; padding:3px 5px;">
                  <span v-else class="na-locked" title="Locked from the selected buffer"><i class="fas fa-lock"></i> {{ config.compDMedium.naMM }}</span>
                </template>
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
                <input v-if="config.compDMedium.type === 'buffer'" type="number" v-model.number="config.compDMedium.pH" step="0.1" min="0" max="14" placeholder="7.0" style="font-size:0.78rem; padding:3px 5px;">
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
              </div>

              <!-- Divider -->
              <div style="border-top:1px dashed var(--border-color,#cbd5e1); padding-top:8px; font-size:0.72rem; font-weight:700; opacity:0.55; text-transform: none; letter-spacing:0.04em;">Fill-up solution</div>

              <!-- Fill-up -->
              <div style="display:grid; grid-template-columns:120px 100px 1fr 130px 80px; gap:6px; align-items:center;">
                <span style="font-size:0.78rem;">Remainder</span>
                <select v-model="config.fillupMedium.type" style="font-size:0.78rem; padding:3px 5px;">
                  <option value="water">MQ Water</option>
                  <option value="buffer">Buffer</option>
                </select>
                <template v-if="config.fillupMedium.type === 'buffer'">
                  <div style="position:relative; display:flex; flex-direction:column; gap:3px;" @click.stop>
                    <PhaseBufferSelect :medium="config.fillupMedium" />
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
                <template v-if="config.fillupMedium.type === 'buffer'">
                  <input v-if="!config.fillupMedium.bufferId" type="number" v-model.number="config.fillupMedium.naMM" step="any" min="0" placeholder="0" style="font-size:0.78rem; padding:3px 5px;">
                  <span v-else class="na-locked" title="Locked from the selected buffer"><i class="fas fa-lock"></i> {{ config.fillupMedium.naMM }}</span>
                </template>
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
                <input v-if="config.fillupMedium.type === 'buffer'" type="number" v-model.number="config.fillupMedium.pH" step="0.1" min="0" max="14" placeholder="7.0" style="font-size:0.78rem; padding:3px 5px;">
                <span v-else style="opacity:0.3; font-size:0.72rem;">—</span>
              </div>

              <div style="border-top:1px solid var(--border-color,#e2e8f0); padding-top:8px; font-size:0.7rem; opacity:0.6;">
                These solvent settings are read-only analysis: they report the Na⁺ each well carries from the
                buffers and estimate its pH. Pipetted volumes are always the plain dilution from each stock.
              </div>

              <!-- Live preview for first suggestion -->
              <template v-if="suggestions.length > 0">
                <div style="border-top:1px solid var(--border-color,#e2e8f0); padding-top:8px;">
                  <div style="font-size:0.7rem; font-weight:700; opacity:0.55; text-transform: none; letter-spacing:0.04em; margin-bottom:4px;">Preview (first AI target)</div>
                  <div style="font-size:0.78rem; display:flex; gap:16px; flex-wrap:wrap;">
                    <span>A: <strong>{{ computeWellVolumes(suggestions[0]).vA.toFixed(2) }} µL</strong></span>
                    <span>B: <strong>{{ computeWellVolumes(suggestions[0]).vB.toFixed(2) }} µL</strong></span>
                    <span>C: <strong>{{ computeWellVolumes(suggestions[0]).vC.toFixed(2) }} µL</strong></span>
                    <span v-if="computeWellVolumes(suggestions[0]).vConst > 0.001">Const: <strong>{{ computeWellVolumes(suggestions[0]).vConst.toFixed(2) }} µL</strong></span>
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
          <!-- ── Additive Experiment Layer ── -->
          <div style="margin-top: 8px;">
            <button type="button"
              @click="additiveConfig.enabled = !additiveConfig.enabled"
              style="width:100%; text-align:left; background:transparent; border:1px dashed var(--border-color,#cbd5e1); border-radius:6px; padding:5px 10px; cursor:pointer; color:inherit; font-size:0.78rem; opacity:0.75; display:flex; align-items:center; gap:8px;">
              <i class="fas" :class="additiveConfig.enabled ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
              <span title="Spike a new component on top of existing wells. Concentrations of all existing components are automatically diluted by the added volume.">Additive Experiment Layer</span>
              <span v-if="additiveConfig.enabled && additivePreviewRows.length" style="margin-left:auto; background:rgba(139,92,246,0.2); color:#8b5cf6; border-radius:10px; padding:1px 7px; font-size:0.7rem;">{{ additivePreviewRows.length }} wells</span>
            </button>

            <div v-if="additiveConfig.enabled" style="margin-top:8px; padding:10px 12px; border:1px solid var(--border-color,#e2e8f0); border-radius:6px;">
              <!-- Row 1: source + additive component definition -->
              <!-- auto-fit: this panel now lives in the narrow left column, so the four
                   controls reflow onto as many rows as the width allows. -->
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; align-items:end; margin-bottom:12px;">
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
                  style="background:var(--wr); color:#fff; border:none; padding:4px 14px; border-radius:var(--rc); cursor:pointer; font-weight:600;">
                  <i class="fas fa-arrow-down"></i> Send to Plate
                </button>
                <span style="font-size:0.72rem; opacity:0.5;">
                  {{ additivePreviewRows.length }} wells → fills {{ Math.ceil(additivePreviewRows.length / 12) }} rows
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="internal-section" style="flex-grow: 1;">
          <div class="flex-between" style="margin-bottom: 6px;">
            <h3 style="margin: 0; border: none; padding: 0;">Experiment Ledger</h3>
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
                    <select v-model="exp.phase" @change="updateExperiment(exp)" class="small-select"
                      :title="exp.kin ? kinReceiptText(exp.kin) : 'Set the observed phase — microscopy beats the plate reader, so a value set here wins.'"
                      :style="{ backgroundColor: getPhaseColor(exp.phase, 0.2), borderColor: getPhaseColor(exp.phase, 1) }">
                      <option :value="-1">Untested</option>
                      <option v-for="p in PHASE_SLOTS" :key="p" :value="p">{{ phaseLabel(p) }}</option>
                    </select>
                    <i v-if="exp.kin" class="fas fa-wave-square" :title="kinReceiptText(exp.kin)"
                      style="font-size:0.62rem; opacity:0.45; margin-left:4px;"></i>
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
              <option value="reader2">Platereader 2 · endpoint CSV</option>
              <option value="reader1">Platereader 1 · kinetic XML (SkanIt)</option>
            </select>
            <div style="display:flex; gap:6px; align-items:center; min-width:0;">
              <button class="small" @click="prInputRef.click()">
                <i class="fas fa-upload"></i> Load {{ prIsKinetic ? 'XML' : 'CSV' }}
              </button>
              <input type="file" ref="prInputRef" :accept="prIsKinetic ? '.xml,.XML' : '.csv,.CSV,.txt'" style="display:none" @change="onPlatereaderCsvSelected" />
              <span v-if="prHasData" style="font-size:0.75rem; color:var(--success-color,#10b981); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                <i class="fas fa-check-circle"></i> {{ prWellCount }} wells loaded
              </span>
              <button v-if="prHasData" class="small danger-btn" @click="prODMap = null; clearKinetic()" style="padding:2px 8px;"><i class="fas fa-times"></i></button>
            </div>
            <button v-if="!prIsKinetic" class="small" @click="prShowSettings = !prShowSettings" :style="prShowSettings ? 'background:var(--primary);color:#fff;' : ''" style="white-space:nowrap; padding:4px 8px;">
              <i class="fas fa-sliders"></i> Settings
            </button>
          </div>

          <!-- Kinetic run header: what was actually measured -->
          <div v-if="prIsKinetic && prKinetic" style="margin-bottom:8px; padding:7px 10px; border-radius:6px; background:var(--summary-bg,#f1f5f9); font-size:0.72rem; line-height:1.5;">
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              <strong style="font-size:0.75rem;">{{ prKinFileName }}</strong>
              <select v-if="prKinetic.channels.length > 1" v-model="prChannelKey" style="font-size:0.72rem; padding:2px 5px;">
                <option v-for="c in prKinetic.channels" :key="c.key" :value="c.key">{{ c.label }}</option>
              </select>
              <span v-else style="opacity:.7;">{{ kinChannel?.label }}</span>
            </div>
            <div style="opacity:.7;">{{ kinRunSummary }}</div>
            <div v-if="prKinetic.meta.description" style="opacity:.55;">{{ prKinetic.meta.description }}</div>
          </div>

          <!-- Kinetic classes: the counts, then the dialog that lets you argue with them -->
          <div v-if="prIsKinetic && kinAnalysis" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
            <span v-for="c in KINETIC_CLASSES" :key="c.key"
              :title="`${c.label} → ${phaseLabel(kinPhaseOf(c.key))}`"
              :style="{ background: getPhaseColor(kinPhaseOf(c.key), 0.18), borderColor: getPhaseColor(kinPhaseOf(c.key), 1) }"
              style="display:inline-flex; align-items:center; gap:5px; font-size:0.72rem; padding:3px 8px; border-radius:999px; border-width:1px; border-style:solid; font-weight:600;">
              {{ kinCounts[c.key] }} {{ c.short }}
            </span>
            <span v-if="kinOverrideCount" style="font-size:0.7rem; opacity:.7;" title="Wells you classified by hand — thresholds no longer touch them.">
              <i class="fas fa-hand-pointer"></i> {{ kinOverrideCount }} by hand
            </span>
            <button class="small" @click="openKinReview" style="margin-left:auto; padding:4px 10px;">
              <i class="fas fa-chart-line"></i> Review curves &amp; thresholds
            </button>
          </div>

          <!-- Settings panel (endpoint reader only — the kinetic thresholds live in the review dialog) -->
          <div v-if="prShowSettings" style="border:1px solid var(--border-color,#e2e8f0); border-radius:6px; padding:10px; margin-bottom:8px; font-size:0.8rem; display:flex; flex-direction:column; gap:8px;">
            <div style="font-weight:700; font-size:0.75rem; text-transform: none; letter-spacing:.4px; opacity:.7;">OD → Phase Thresholds</div>
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
            <div style="font-weight:700; font-size:0.75rem; text-transform: none; letter-spacing:.4px; opacity:.7; margin-top:4px;">Dissolution Detection</div>
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;"
              title="If OD drops below the threshold after peaking, the well is classified as Clear (dissolved droplets).">
              <label class="checkbox-label" style="font-size:0.8rem;">
                <input type="checkbox" v-model="prDissolutionEnabled" /> Enable
              </label>
              <div v-if="prDissolutionEnabled" class="input-group" style="margin:0; display:flex; align-items:center; gap:6px;">
                <label style="font-size:0.75rem; white-space:nowrap;">OD drops below</label>
                <input type="number" step="0.01" min="0" max="2" v-model.number="prDissolutionThreshold" style="width:64px; padding:3px 5px; font-size:0.8rem;" />
                <span style="opacity:.6; font-size:0.75rem;">→ Clear</span>
              </div>
            </div>
          </div>

          <!-- Wellplate picker -->
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px; font-size:0.8rem;">
            <label style="white-space:nowrap; font-weight:600;">Wellplate used:</label>
            <select v-model="prLinkedPlateId" style="font-size:0.8rem; padding:3px 6px; flex:1; min-width:120px;">
              <option :value="null">— none (positional fallback) —</option>
              <option v-for="p in prAvailablePlates" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <span v-if="prLinkedPlateId && prMappedWellCount" style="color:var(--success-color,#10b981); white-space:nowrap;">
              <i class="fas fa-link"></i> {{ prMappedWellCount }} wells mapped
            </span>
          </div>
          <p v-if="prMapHint" style="font-size:0.72rem; line-height:1.5; margin:-4px 0 8px; padding:6px 9px; border-radius:6px; border:1px solid rgba(217,119,6,0.4); background:rgba(217,119,6,0.08);">
            <i class="fas fa-triangle-exclamation" style="opacity:.75;"></i> {{ prMapHint }}
          </p>

          <!-- What the plate turned out to be screening, when it had to be worked out -->
          <div v-if="prInference" style="margin:-4px 0 8px; padding:7px 10px; border-radius:6px; background:var(--summary-bg,#f1f5f9); font-size:0.72rem; line-height:1.6;">
            <div style="font-weight:700; opacity:.7;">Read from the plate — {{ prInference.wellCount }} wells</div>
            <div v-for="s in prInference.screened" :key="s.slot">
              <strong>{{ SLOT_LETTER[s.slot] }}</strong> = {{ s.name }}
              <span style="opacity:.7;">{{ fmtRange(s) }}</span>
              <span v-if="!s.inEveryWell" style="opacity:.55;">· absent from some wells</span>
            </div>
            <div v-if="prInference.constants.length" style="opacity:.65;">
              Same in every well: {{ prInference.constants.map(c => `${c.name} ${fmtConc(c.value)} ${c.unit}${c.stock == null ? ' (no stock recorded)' : ''}`).join(' · ') }}
            </div>
            <div v-if="prInference.fillup || prInference.wellVolume" style="opacity:.65;">
              <template v-if="prInference.fillup">Fill-up: {{ prInference.fillup.name }}<template v-if="!prInference.fillup.inEveryWell"> (missing from some wells)</template></template>
              <template v-if="prInference.fillup && prInference.wellVolume"> · </template>
              <template v-if="prInference.wellVolume">
                <template v-if="prInference.wellVolume.uniform">every well {{ prInference.wellVolume.max.toFixed(1) }} µL</template>
                <template v-else>well totals {{ prInference.wellVolume.min.toFixed(1) }}–{{ prInference.wellVolume.max.toFixed(1) }} µL</template>
              </template>
            </div>
            <div v-if="prInference.unmapped.length" style="color:#d97706;">
              <i class="fas fa-triangle-exclamation"></i>
              {{ prInference.unmapped.map(c => c.name).join(', ') }} also varies but there is no free component slot — only four fit.
            </div>
            <div v-for="u in prInference.unitClashes" :key="u.slot" style="color:#d97706;">
              <i class="fas fa-triangle-exclamation"></i>
              {{ u.name }} is recorded in {{ u.from }}, which cannot be converted to {{ u.to }} — component {{ SLOT_LETTER[u.slot] }} is imported in {{ u.from }}. Set its unit to match.
            </div>
            <button class="small" @click="adoptInferredComponents" style="margin-top:4px; padding:2px 8px; font-size:0.7rem;"
              title="Take the whole recipe from this plate: component names, inventory links, stocks and ranges, plus the constants, the fill-up and the well volume — so anything replated out of the phase map is pipetted the way this plate was.">
              <i class="fas fa-arrow-up"></i> Use this plate as the search space
            </button>
          </div>

          <template v-if="prHasData">
            <!-- Show/filter control -->
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px; font-size:0.8rem;">
              <template v-if="!prLinkedPlateId">
                <label>Map to:</label>
                <select v-model="prMapSource" style="font-size:0.8rem; padding:3px 6px;">
                  <option value="untested">Untested (phase = –1)</option>
                  <option value="all">All experiments</option>
                </select>
                <label>Starting well:</label>
                <input type="text" v-model="prStartWell" maxlength="3" style="width:46px; font-size:0.8rem; padding:3px 6px; text-transform: none;" placeholder="A1" />
              </template>
              <template v-else>
                <label>Import:</label>
                <select v-model="prMapSource" style="font-size:0.8rem; padding:3px 6px;">
                  <option value="untested">New + untested wells (skip already-classified)</option>
                  <option value="all">All matched wells (overwrite existing phase)</option>
                </select>
              </template>
            </div>

            <!-- Legend: OD bands for the endpoint reader, coacervation classes for the kinetic one -->
            <div v-if="!prIsKinetic" style="display:flex; gap:6px; flex-wrap:wrap; font-size:0.7rem; margin-bottom:8px; padding:5px 8px; background:var(--summary-bg,#f1f5f9); border-radius:4px;">
              <span v-for="t in OD_THRESHOLDS_DISPLAY" :key="t.phase" style="display:flex; align-items:center; gap:3px;">
                <span :style="{ display:'inline-block', width:'10px', height:'10px', borderRadius:'2px', background: getPhaseColor(t.phase, 0.35), border:`1px solid ${getPhaseColor(t.phase,1)}` }"></span>
                {{ t.label }}: {{ t.range }}
              </span>
              <span v-if="prDissolutionEnabled" style="display:flex; align-items:center; gap:3px; opacity:.75;">
                <i class="fas fa-arrow-down" style="font-size:0.65rem;"></i> Dissolved if OD&nbsp;≤&nbsp;{{ prDissolutionThreshold }} after peak
              </span>
            </div>
            <div v-else style="display:flex; gap:8px; flex-wrap:wrap; font-size:0.7rem; margin-bottom:8px; padding:5px 8px; background:var(--summary-bg,#f1f5f9); border-radius:4px;">
              <span v-for="c in KINETIC_CLASSES" :key="c.key" style="display:flex; align-items:center; gap:3px;">
                <span :style="{ display:'inline-block', width:'10px', height:'10px', borderRadius:'2px', background: getPhaseColor(kinPhaseOf(c.key), 0.35), border:`1px solid ${getPhaseColor(kinPhaseOf(c.key),1)}` }"></span>
                {{ c.label }} → {{ phaseLabel(kinPhaseOf(c.key)) }}
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
                    @click="openWellCurve(`${row}${c}`)"
                    style="flex:1; aspect-ratio:1; border-radius:50%; border-width:1px; border-style:solid; min-width:0;">
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

          <p v-if="!prHasData" style="font-size:0.75rem; opacity:0.6; margin:4px 0 0;"
            title="Concentrations are read directly from each well cell, so this works even if the AI suggestions were never logged to the active learning.">
            Select the wellplate that was used, then load
            <template v-if="prIsKinetic">the SkanIt <strong>.xml</strong> export — the whole kinetic run, one trace per well.</template>
            <template v-else>the plate-reader CSV.</template>
          </p>
        </div>
      </div>

      <div class="col-right">
        <div class="internal-section" style="display: flex; flex-direction: column;">
          <div class="flex-between" style="margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
            <h3 style="margin: 0; border: none; padding: 0;">Phase Map</h3>
            <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
              <span v-if="boundaryData" style="font-size: 0.75rem; opacity: 0.7;">
                {{ boundaryData.n_labeled }} pts · phases {{ boundaryData.phases_used?.join(', ') }}
              </span>
              <button v-if="experiments.length" class="small" @click="fitSearchSpaceToData()"
                title="Set each axis to the range the data actually covers, and the step to the spacing between the levels that were screened. The map only draws what is inside the search space."
                style="padding:4px 9px; font-size:0.72rem;">
                <i class="fas fa-compress-arrows-alt"></i> Fit to data
              </button>
              <div class="color-mode-toggle" title="3D puts three components on the axes and the fourth on a slider — one condition at a time. Slice grid puts two on shared axes and repeats the map across the other two, so the whole screen is visible at once.">
                <button type="button" :class="{ active: mapView === '3d' }" @click="mapView = '3d'">
                  <i class="fas fa-cube"></i> 3D
                </button>
                <button type="button" :class="{ active: mapView === 'grid' }" @click="mapView = 'grid'">
                  <i class="fas fa-table-cells"></i> Slice grid
                </button>
              </div>
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
              <button class="small" @click="exportPlot"
                :title="mapView === 'grid'
                  ? 'Save the slice grid as a standalone interactive HTML file — every panel as shown, hover included.'
                  : (config.enableCompD
                    ? `Save the map as a standalone interactive HTML file. The ${config.compDName || 'Component D'} slider comes with it, so you can rotate and step through the levels later without the app.`
                    : 'Save the map as a standalone interactive HTML file — open it in a browser to rotate.')"
                style="background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid #10b981; margin: 0;">
                <i class="fas fa-cube"></i> Export HTML
              </button>
            </div>
          </div>
          <!-- Slice-grid axis pickers: the two components NOT chosen here become the facets -->
          <div v-if="mapView === 'grid'" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px; padding:6px 10px; background:var(--summary-bg,#f1f5f9); border:1px solid var(--border-color,#e2e8f0); border-radius:6px; font-size:0.76rem;">
            <span style="font-weight:600;">Axes</span>
            <select v-model="gridXKey" @change="renderPlot" style="font-size:0.76rem; padding:3px 5px; max-width:150px;">
              <option v-for="k in activeComps" :key="'gx'+k" :value="k" :disabled="k === gridYKey">{{ compPickerLabel(k) }}</option>
            </select>
            <span style="opacity:0.5;">×</span>
            <select v-model="gridYKey" @change="renderPlot" style="font-size:0.76rem; padding:3px 5px; max-width:150px;">
              <option v-for="k in activeComps" :key="'gy'+k" :value="k" :disabled="k === gridXKey">{{ compPickerLabel(k) }}</option>
            </select>
            <span style="opacity:0.55; margin-left:4px;">
              panels:
              <template v-if="facetKeys.length">{{ facetKeys.map(compPickerLabel).join(' × ') }}</template>
              <template v-else>none — every component is on an axis</template>
            </span>
            <label v-if="facetKeys.length" style="display:flex; align-items:center; gap:5px; margin-left:auto;">
              <span style="opacity:0.7;">levels</span>
              <select v-model.number="gridBins" @change="renderPlot" style="font-size:0.76rem; padding:3px 5px;">
                <option :value="2">2</option>
                <option :value="3">3</option>
                <option :value="4">4</option>
              </select>
            </label>
          </div>

          <div class="plot-area" :style="mapView === 'grid' ? 'overflow:auto;' : (fixedAxis ? 'display:grid; grid-template-columns:38fr 62fr; gap:2px; overflow:hidden;' : '')">
            <template v-if="mapView === '3d'">
              <div v-if="fixedAxis" id="phase-2d-plot" style="height:100%; min-width:0; overflow:hidden;"></div>
              <div id="phase-ternary-plot" :style="fixedAxis ? 'height:100%; min-width:0; overflow:hidden;' : 'width:100%; height:100%;'"></div>
            </template>
            <div v-show="mapView === 'grid'" id="phase-slice-grid" style="width:100%;"></div>
          </div>

          <!-- The map draws the search space, so data that sits outside it — or in
               a sliver of it — is data you cannot read. Say so rather than leaving
               the map looking simply empty. -->
          <p v-if="searchSpaceIssues.length" style="margin:8px 0 0; padding:7px 10px; font-size:0.74rem; line-height:1.5; border-radius:6px; border:1px solid rgba(217,119,6,0.4); background:rgba(217,119,6,0.08); display:flex; gap:8px; align-items:baseline; flex-wrap:wrap;">
            <i class="fas fa-eye-slash" style="opacity:.75;"></i>
            <span>
              The axes are drawn over the search space, and the data does not fill it —
              <template v-for="(o, i) in searchSpaceIssues" :key="o.key">{{ i ? '; ' : '' }}{{ searchSpaceIssueText(o) }}</template>.
            </span>
            <button class="small" @click="fitSearchSpaceToData()" style="padding:2px 8px; font-size:0.7rem;">Fit to data</button>
          </p>
          <div v-if="config.enableCompD && mapView === '3d'" style="display:flex; align-items:center; gap:10px; margin-top:8px; padding:6px 10px; background:var(--summary-bg,#f1f5f9); border:1px solid var(--border-color,#e2e8f0); border-radius:6px; font-size:0.78rem;">
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
          <h3>Active Learning Engine</h3>
          
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

          <div v-if="suggestionNotes.length" style="margin-bottom:10px; padding:8px 10px; border-radius:6px; border:1px solid rgba(217,119,6,0.35); background:rgba(217,119,6,0.07); font-size:0.75rem; line-height:1.5;">
            <div style="font-weight:700; opacity:0.75; margin-bottom:2px;">
              <i class="fas fa-triangle-exclamation" style="opacity:0.7;"></i> Engine notes
            </div>
            <div v-for="(note, i) in suggestionNotes" :key="i" style="opacity:0.85;">· {{ note }}</div>
          </div>

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
      <div class="flex-between" style="border-bottom: 1px solid var(--border-color, #e2e8f0); padding-bottom: 8px; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
        <h3 style="margin: 0; border: none; padding: 0;">Wet Lab Mapping: 96-Well Plates</h3>
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

      <!-- Replate one phase: take every condition that came out as, say, transient,
           and lay it on a fresh plate with the volumes worked out for the new well
           volume — the way you go from "which of these coacervated" to "let me look
           at those properly". -->
      <div v-if="experiments.length" class="export-controls" style="margin-bottom: 15px; flex-wrap: wrap; padding: 8px 10px; background: var(--summary-bg,#f1f5f9); border-radius: 6px;">
        <span style="font-size: 0.85rem; font-weight: bold; opacity: 0.7;">
          <i class="fas fa-flask" style="opacity:.6;"></i> Replate one phase:
        </span>
        <select v-model.number="phaseExportPhase" class="compact-select"
          :style="{ borderColor: getPhaseColor(phaseExportPhase, 1), background: getPhaseColor(phaseExportPhase, 0.12) }">
          <option v-for="p in PHASE_SLOTS" :key="p" :value="p">{{ phaseLabel(p) }} ({{ phaseCounts[p] || 0 }})</option>
        </select>
        <select v-model="phaseExportPlateId" class="compact-select">
          <option value="" disabled>Select plate…</option>
          <option v-for="p in store.wellPlates" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <input type="text" v-model="phaseExportStartWell" placeholder="A1" class="compact-input" />
        <label v-if="prKinFileName" class="checkbox-label" style="font-size:0.75rem;"
          :title="`Only the wells that came from ${prKinFileName}, rather than everything in the ledger with this phase.`">
          <input type="checkbox" v-model="phaseExportRunOnly" /> this run only
        </label>
        <span style="font-size:0.75rem; opacity:0.7;">
          {{ phaseExportRows.length }} well{{ phaseExportRows.length === 1 ? '' : 's' }} · {{ config.targetVolume }} µL each
        </span>
        <button class="small" @click="addPhaseExtra" style="padding:4px 9px; font-size:0.72rem;"
          title="Add a compound to every replated well — the same final concentration in each. It comes out of the fill-up, so the well total stays at the target volume.">
          <i class="fas fa-plus"></i> Add component
        </button>
        <button class="small success-btn" @click="exportPhaseToPlate" :disabled="!phaseExportRows.length || !phaseExportPlateId">
          <i class="fas fa-arrow-down"></i> Send
        </button>
      </div>

      <!-- Added to every replated well. Dosed like a constant, taken out of the
           fill-up, so the total volume is untouched and the water is recomputed. -->
      <div v-if="phaseExtras.length" style="margin:-8px 0 15px; padding:10px 12px; border:1px solid var(--border-color,#e2e8f0); border-radius:6px; font-size:0.8rem; display:flex; flex-direction:column; gap:8px;">
        <div style="display:grid; grid-template-columns:1.7fr 74px 66px 74px 66px 64px 24px; gap:6px; font-size:0.66rem; font-weight:700; opacity:0.5; padding:0 2px;">
          <span>Added to every well</span><span>Final</span><span>unit</span><span>Stock</span><span>unit</span><span>µL/well</span><span></span>
        </div>
        <div v-for="(k, i) in phaseExtras" :key="k.id" style="display:grid; grid-template-columns:1.7fr 74px 66px 74px 66px 64px 24px; gap:6px; align-items:center;">
          <div style="position:relative; display:flex; gap:4px; align-items:center; min-width:0;" @click.stop>
            <div class="inventory-select-box" style="flex:1.2 1 0; min-width:0; font-size:0.78rem; padding:4px 8px; min-height:30px;"
              :title="k.inv ? `[${k.inv.code}] ${k.inv.name} — chipped into every well` : 'Link an inventory item so this component reaches the wellplate, the lab journal and the usage log as a chip'"
              @click="toggleConstantDropdown(k)">
              <span class="truncate-text">{{ k.inv ? `[${k.inv.code}] ${k.inv.name}` : 'Link inventory…' }}</span>
              <i class="fas" :class="k.inv ? 'fa-tag' : 'fa-search'" style="font-size:0.7rem; opacity:0.55;"></i>
            </div>
            <input v-if="!k.inv" type="text" v-model="k.name" placeholder="or free-text name…" style="flex:1 1 0; min-width:0; font-size:0.8rem; padding:5px;">
            <button v-else @click="unlinkConstant(k)" title="Unlink from inventory (keeps the name)"
              style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.75rem; padding:0 2px;">✕</button>
            <div v-if="activeDropdown === 'const:' + k.id" class="inventory-dropdown">
              <div class="dropdown-scope-selector">
                <label class="checkbox-label"><input type="radio" value="Global" v-model="k.searchScope"> Global</label>
                <label class="checkbox-label"><input type="radio" value="Personal" v-model="k.searchScope"> Personal</label>
              </div>
              <div class="dropdown-search">
                <input type="text" v-model="k.searchQuery" placeholder="Filter inventory..." @click.stop>
              </div>
              <div class="dropdown-results">
                <div v-for="inv in filterBlockInventory(k.searchQuery, k.searchScope)" :key="inv.id" class="dropdown-item" @mousedown.prevent="selectConstantInventory(k, inv)">
                  [{{ inv.code }}] {{ inv.name }} ({{ inv.stock }} {{ inv.stockUnit || 'µM' }})
                </div>
              </div>
            </div>
          </div>
          <input type="number" v-model.number="k.conc" min="0" step="any" style="font-size:0.8rem; padding:5px;" title="Final concentration in every replated well">
          <select v-model="k.unit" style="font-size:0.76rem; padding:4px;"><option v-for="u in CONST_UNITS" :key="u" :value="u">{{ u }}</option></select>
          <input type="number" v-model.number="k.stockConc" min="0" step="any" style="font-size:0.8rem; padding:5px;" title="Stock concentration">
          <select v-model="k.stockUnit" style="font-size:0.76rem; padding:4px;"><option v-for="u in CONST_UNITS" :key="u" :value="u">{{ u }}</option></select>
          <span style="font-size:0.75rem; opacity:0.75; font-variant-numeric:tabular-nums;">{{ phaseExtraVolume(k).toFixed(2) }}</span>
          <button @click="removePhaseExtra(i)" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.9rem;" title="Remove">✕</button>
        </div>
        <div style="font-size:0.72rem; opacity:0.65;">
          {{ phaseExtrasVolume.toFixed(2) }} µL of {{ config.targetVolume }} µL comes out of the fill-up — the well total does not change.
          These are added to this export only, not to the search space.
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

    <!-- ── Kinetics review: the curves, the thresholds that cut them, and the override ── -->
    <Teleport to="body">
    <div v-if="showKinReview" class="kin-modal" :class="{ 'dark-mode': store.isDarkMode }" @click.self="showKinReview = false">
      <div class="kin-dialog">
        <div class="kin-head">
          <span><i class="fas fa-chart-line"></i> Coacervation kinetics — {{ prKinFileName }}</span>
          <span class="kin-sub">{{ kinRunSummary }}</span>
          <button class="cond-x" @click="showKinReview = false">✕</button>
        </div>

        <!-- Thresholds. Every field re-classifies the whole plate as it is typed. -->
        <div class="kin-controls">
          <div class="kin-ctl">
            <label>Baseline</label>
            <select v-model="kinSettings.baselineMode" title="Each well against its own first reading, or against a blank you measured. Use the blank when wells were already turbid before the run began — their own first reading is not a blank.">
              <option value="first">the well's first reading</option>
              <option value="manual">a blank I measured</option>
            </select>
            <input v-if="kinSettings.baselineMode === 'manual'" type="number" step="0.001" min="0" v-model.number="kinSettings.baselineValue" />
            <span v-if="kinSettings.baselineMode === 'manual'" class="kin-unit">OD</span>
            <span v-else class="kin-unit">≈ {{ kinAnalysis ? kinAnalysis.blank.toFixed(4) : '—' }} across the plate</span>
          </div>

          <div class="kin-ctl">
            <label>Smoothing</label>
            <input type="number" min="1" step="2" v-model.number="kinSettings.smoothPoints" title="Moving median width in readings. A single bubble crossing the beam should not become a peak." />
            <span class="kin-unit">reads</span>
          </div>

          <div class="kin-ctl">
            <label>Coacervation</label>
            <select v-model="kinSettings.riseMode">
              <option value="delta">rises above baseline by</option>
              <option value="absolute">reaches OD</option>
            </select>
            <input v-if="kinSettings.riseMode === 'delta'" type="number" step="0.01" min="0" v-model.number="kinSettings.riseDelta" />
            <input v-else type="number" step="0.01" min="0" v-model.number="kinSettings.riseAbs" />
          </div>

          <div class="kin-ctl">
            <label>Dissolved</label>
            <select v-model="kinSettings.dropMode">
              <option value="delta">comes back to baseline +</option>
              <option value="absolute">drops below OD</option>
            </select>
            <input v-if="kinSettings.dropMode === 'delta'" type="number" step="0.001" min="0" v-model.number="kinSettings.dropDelta" />
            <input v-else type="number" step="0.001" min="0" v-model.number="kinSettings.dropAbs" />
            <span class="kin-unit">held for</span>
            <input type="number" min="1" step="1" v-model.number="kinSettings.sustainPoints" title="Consecutive readings below the level before the well counts as dissolved." />
            <span class="kin-unit">reads</span>
          </div>

          <div class="kin-ctl">
            <label>By</label>
            <input type="number" min="0" step="10" v-model.number="kinSettings.timeLimitMin" title="A well that has not dissolved by this time is metastable. Defaults to the length of the run." />
            <span class="kin-unit">min ({{ formatMinutes(kinSettings.timeLimitMin) }}) — later than this counts as metastable</span>
          </div>
        </div>

        <div class="kin-body">
          <!-- Plate -->
          <div class="kin-plate-col">
            <div class="kin-plate">
              <div class="kin-prow">
                <div class="kin-rlabel"></div>
                <div v-for="c in kinGrid.cols" :key="'kc'+c" class="kin-clabel">{{ c }}</div>
              </div>
              <div v-for="r in kinGrid.rows" :key="'kr'+r" class="kin-prow">
                <div class="kin-rlabel">{{ r }}</div>
                <div v-for="c in kinGrid.cols" :key="'kw'+r+c" class="kin-well"
                  :style="kinGridStyle(`${r}${c}`)" :title="kinWellTitle(`${r}${c}`)"
                  @click="kinAnalysis?.wells[`${r}${c}`] ? (kinSelected = `${r}${c}`, kinOverlayAll = false) : null"></div>
              </div>
            </div>
            <div class="kin-legend">
              <span v-for="c in KINETIC_CLASSES" :key="c.key">
                <span class="kin-dot" :style="{ background: getPhaseColor(kinPhaseOf(c.key), 0.5), borderColor: getPhaseColor(kinPhaseOf(c.key), 1) }"></span>
                {{ kinCounts[c.key] }} {{ c.label }}
              </span>
              <span v-if="kinOverrideCount" class="kin-manual-note">
                <i class="fas fa-hand-pointer"></i> {{ kinOverrideCount }} set by hand
                <button class="kin-linkbtn" @click="clearKinOverrides">reset</button>
              </span>
            </div>
          </div>

          <!-- Curve -->
          <div class="kin-plot-col">
            <div class="kin-plot-head">
              <div class="color-mode-toggle">
                <button type="button" :class="{ active: !kinOverlayAll }" @click="kinOverlayAll = false">One well</button>
                <button type="button" :class="{ active: kinOverlayAll }" @click="kinOverlayAll = true">All curves</button>
              </div>
              <span v-if="kinSelectedSummary?.wd" class="kin-sub">
                Sample {{ kinSelectedSummary.wd.sampleId }} · A {{ kinSelectedSummary.wd.anion }} · B {{ kinSelectedSummary.wd.cation }} · C {{ kinSelectedSummary.wd.salt }} mM
              </span>
            </div>
            <div :id="KIN_PLOT_ID" class="kin-plot"></div>

            <div v-if="kinSelectedSummary" class="kin-metrics">
              <div><span>Peak OD</span><strong>{{ kinSelectedSummary.w.peak.toFixed(4) }}</strong></div>
              <div><span>Baseline</span><strong>{{ kinSelectedSummary.w.baseline.toFixed(4) }}</strong></div>
              <div><span>Onset</span><strong>{{ formatMinutes(kinSelectedSummary.w.onsetMin) }}</strong></div>
              <div><span>Dissolved</span><strong>{{ formatMinutes(kinSelectedSummary.w.dissolvedMin) }}</strong></div>
              <div><span>Lifetime</span><strong>{{ formatMinutes(kinSelectedSummary.w.lifetimeMin) }}</strong></div>
              <div><span>End OD</span><strong>{{ kinSelectedSummary.w.endOD.toFixed(4) }}</strong></div>
            </div>

            <p v-if="kinSelectedSummary?.w.startsHigh" class="kin-warn">
              <i class="fas fa-triangle-exclamation"></i>
              Already turbid at the first reading — it may have coacervated during pipetting, so the onset and lifetime are lower bounds.
            </p>
            <p v-if="kinSelectedSummary?.w.lateDissolution" class="kin-warn">
              <i class="fas fa-clock"></i>
              Dissolved at {{ formatMinutes(kinSelectedSummary.w.dissolvedMin) }}, after your {{ formatMinutes(kinSettings.timeLimitMin) }} limit — counted as metastable.
            </p>

            <div v-if="kinSelectedSummary" class="kin-override">
              <span>{{ kinSelectedSummary.id }} is</span>
              <button v-for="c in KINETIC_CLASSES" :key="c.key" type="button"
                class="kin-cbtn" :class="{ active: kinSelectedSummary.cls === c.key }"
                :style="kinSelectedSummary.cls === c.key ? { background: getPhaseColor(kinPhaseOf(c.key), 0.85), borderColor: getPhaseColor(kinPhaseOf(c.key), 1), color: '#fff' } : {}"
                @click="setKinOverride(kinSelectedSummary.id, c.key)">{{ c.short }}</button>
              <button v-if="kinSelectedSummary.manual" type="button" class="kin-linkbtn"
                @click="setKinOverride(kinSelectedSummary.id, null)"
                :title="`Back to what the thresholds say: ${classMeta(kinSelectedSummary.auto)?.label}`">
                ↺ back to auto ({{ classMeta(kinSelectedSummary.auto)?.short }})
              </button>
              <span v-else class="kin-sub">from the thresholds — click a class to set it by hand (e.g. after microscopy)</span>
            </div>
          </div>
        </div>

        <!-- Every well, sortable, with the same override in reach -->
        <div class="kin-table-wrap">
          <table class="kin-table">
            <thead>
              <tr>
                <th class="kin-sortable" @click="kinSortBy = 'well'" :class="{ on: kinSortBy === 'well' }">Well</th>
                <th>Sample</th>
                <th>A · B · C (mM)</th>
                <th class="kin-sortable" @click="kinSortBy = 'peak'" :class="{ on: kinSortBy === 'peak' }">Peak OD</th>
                <th>Onset</th>
                <th class="kin-sortable" @click="kinSortBy = 'lifetime'" :class="{ on: kinSortBy === 'lifetime' }">Lifetime</th>
                <th class="kin-sortable" @click="kinSortBy = 'class'" :class="{ on: kinSortBy === 'class' }">Class</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in kinTableRows" :key="row.wellId"
                :class="{ sel: row.wellId === kinSelected }" @click="kinSelected = row.wellId; kinOverlayAll = false">
                <td>{{ row.wellId }}</td>
                <td>{{ row.wd ? row.wd.sampleId : '—' }}</td>
                <td>{{ row.wd ? `${row.wd.anion} · ${row.wd.cation} · ${row.wd.salt}` : '—' }}</td>
                <td>{{ row.w.peak.toFixed(4) }}<i v-if="row.w.startsHigh" class="fas fa-triangle-exclamation kin-flag" title="Already turbid at the first reading"></i></td>
                <td>{{ formatMinutes(row.w.onsetMin) }}</td>
                <td>{{ formatMinutes(row.w.lifetimeMin) }}</td>
                <td @click.stop>
                  <select class="kin-cls-select" :value="row.manual ? row.cls : 'auto'"
                    :style="{ borderColor: getPhaseColor(kinPhaseOf(row.cls), 1), background: getPhaseColor(kinPhaseOf(row.cls), 0.18) }"
                    @change="setKinOverride(row.wellId, $event.target.value)">
                    <option value="auto">{{ classMeta(row.auto)?.short }} (auto)</option>
                    <option v-for="c in KINETIC_CLASSES" :key="c.key" :value="c.key">{{ c.short }} ✋</option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="kin-foot">
          <div class="kin-map">
            <span v-for="c in KINETIC_CLASSES" :key="c.key" class="kin-mapitem">
              {{ c.short }} →
              <select v-model.number="kinClassPhase[c.key]">
                <option v-for="p in PHASE_SLOTS" :key="p" :value="p">{{ phaseLabel(p) }}</option>
              </select>
            </span>
            <label class="checkbox-label" title="Renames the phase slots in the map, the legend and the ledger dropdown so they read as coacervation outcomes.">
              <input type="checkbox" v-model="kinRenamePhases" /> name the phases after these classes
            </label>
          </div>
          <span v-if="kinPhaseClash" class="kin-clash"><i class="fas fa-triangle-exclamation"></i> {{ kinPhaseClash }}</span>
          <span class="kin-sub" style="margin-left:auto;">
            {{ kinLinkedCount }} of {{ kinWellIds.length }} wells matched to the plate<template v-if="kinAlreadyLogged">, {{ kinAlreadyLogged }} already in the ledger — applying again updates them</template>
          </span>
          <button class="cond-btn ghost" @click="showKinReview = false">Close</button>
          <button class="cond-btn" @click="importPlatereaderResults" :disabled="!prPreviewItems.length">
            <i class="fas fa-check"></i> Apply {{ prPreviewItems.length }} wells
          </button>
        </div>
      </div>
    </div>
    </Teleport>

    <!-- ── Save conditions dialog (teleported to centre on the viewport) ── -->
    <Teleport to="body">
    <div v-if="showSaveCond" class="cond-modal" :class="{ 'dark-mode': store.isDarkMode }" @click.self="showSaveCond = false">
      <div class="cond-dialog">
        <div class="cond-dhead"><span><i class="fas fa-floppy-disk"></i> Save conditions</span><button class="cond-x" @click="showSaveCond = false">✕</button></div>
        <div v-if="myConditions.length" class="cond-f"><span>Save to</span>
          <select v-model="saveCondTarget" @change="onSaveTargetChange">
            <option value="">＋ New preset</option>
            <option v-for="c in myConditions" :key="c.item_id" :value="c.item_id">Overwrite: {{ c.name }}</option>
          </select>
        </div>
        <label class="cond-f"><span>Name</span><input v-model="saveCondName" placeholder="e.g. CTI-117 coacervate screen" @keydown.enter="doSaveConditions"></label>
        <p v-if="suggestions.length" class="cond-note"><i class="fas fa-circle-info"></i> The generated grid-locked plate ({{ suggestions.length }} wells) will be saved with these conditions.</p>
        <div class="cond-f"><span>Scope</span>
          <div class="scope-chips">
            <button type="button" class="scope-chip" :class="{ active: saveCondScope === 'Personal' }" @click="saveCondScope = 'Personal'">Private</button>
            <button type="button" class="scope-chip" :class="{ active: saveCondScope === 'Global' }" @click="saveCondScope = 'Global'">Lab</button>
          </div>
        </div>
        <div class="cond-dfoot">
          <span v-if="saveCondMsg" class="cond-msg">{{ saveCondMsg }}</span>
          <button class="cond-btn ghost" style="margin-left:auto;" @click="showSaveCond = false">Cancel</button>
          <button class="cond-btn" @click="doSaveConditions"><i class="fas fa-check"></i> Save</button>
        </div>
      </div>
    </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick, watch } from 'vue'
import { db } from '../services/supabase'
import { esc } from '../utils/htmlSafe'
import { sliceLevels } from '../utils/sliceLevels'
import { buildExportHtml } from '../utils/phaseMapExport'
import { invChip } from '../utils/invChip'
import { useLabStore } from '../stores/labStore'
import { filterInventory } from '../utils/inventoryFilter'
import {
  parseSkanItXml, analyzePlate, sortWellIds, formatMinutes,
  KINETIC_CLASSES, DEFAULT_KINETIC_SETTINGS, normalizeKineticSettings,
} from '../utils/plateReaderKinetics'
import { readPlateWells, levelSpacing } from '../utils/phaseWellMapping'
import { swapComponentSlots, COMPONENT_SLOTS as COMP_KEYS, SLOT_LETTERS as SLOT_LETTER } from '../utils/componentSlots'
import { fmtConc } from '../utils/wellComposition'
import PhaseBufferSelect from './PhaseBufferSelect.vue'
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

// A phase index is just a slot; what the slot MEANS belongs to the screen. Once a
// kinetic import has decided that phase 1 is "Transient coacervate", every legend,
// tooltip and dropdown in the module says so — a map labelled "Phase 1 / Phase 2"
// is unreadable a week later. Falls back to the generic names when unnamed.
const phaseLabel = (phase) => {
    if (phase === -1) return 'Untested'
    const custom = config.value?.phaseLabels?.[phase]
    return (typeof custom === 'string' && custom.trim()) || phaseNames[phase] || `Phase ${phase}`
}
const PHASE_SLOTS = [0, 1, 2, 3, 4]

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
  // Advanced medium / background salt / pH settings — reporting only, never volumes.
  showMediumSettings: false,
  anionMedium:  { type: 'water', bufName: '', naMM: 0, pH: 7.0, bufferId: null },
  cationMedium: { type: 'water', bufName: '', naMM: 0, pH: 7.0, bufferId: null },
  saltMedium:   { type: 'water', bufName: '', naMM: 0, pH: 7.0, bufferId: null },
  compDMedium:  { type: 'water', bufName: '', naMM: 0, pH: 7.0, bufferId: null },
  fillupMedium: { type: 'water', bufName: '', naMM: 0, pH: 7.0, bufferId: null, inv: null, searchQuery: '', searchScope: 'Global' },
  // Component dependency links: target = source * factor + offset (stored-unit arithmetic)
  dependencies: [],
  showDependencies: false,
  // Constant components — same final concentration in every well. Each:
  // { id, name, conc, unit, stockConc, stockUnit, inv, searchQuery, searchScope }.
  constants: [],
  showConstants: false,
  // What each phase index means in THIS screen, e.g. { 1: 'Transient coacervate' }.
  // Empty = the generic "Phase 1…4" names.
  phaseLabels: {},
})

// ── Constant components (same in every well) ─────────────────────────────────
// A constant is a real dosing step, so it is an inventory reference like every
// other component: linking one makes the wellplate export write an inv-ref chip
// instead of a plain label, which is what carries the compound through to the
// lab journal, the usage log and the robot protocols. Free text still works for
// anything that isn't stocked.
// Units mirror InventoryManager's list so any stock unit can be represented.
const CONST_UNITS = ['M', 'mM', 'µM', 'nM', 'mg/mL', 'µg/µL', 'ng/µL', 'X', 'U/µL', '%']

const addConstant = () => {
  if (!config.value.constants) config.value.constants = []
  config.value.constants.push({ id: 'k_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36)), name: '', conc: 0, unit: 'mM', stockConc: 100, stockUnit: 'mM', inv: null, searchQuery: '', searchScope: 'Global' })
}
const removeConstant = (i) => { config.value.constants.splice(i, 1); renderPlot() }

// Constants saved before the inventory link existed have no search fields — seed
// them on first open rather than migrating, so old presets keep loading as-is.
const toggleConstantDropdown = (k) => {
  const key = 'const:' + k.id
  if (activeDropdown.value === key) { activeDropdown.value = null; return }
  if (!k.searchScope) k.searchScope = 'Global'
  if (k.searchQuery === undefined) k.searchQuery = ''
  activeDropdown.value = key
}

const selectConstantInventory = (k, inv) => {
  k.inv = inv
  k.name = inv.name
  k.stockConc = inv.stock
  k.stockUnit = inv.stockUnit || 'µM'
  activeDropdown.value = null
  renderPlot()
}

// Keeps the name so the well still says what was added, just untraceably.
const unlinkConstant = (k) => { k.inv = null; renderPlot() }

// Opening the 4th-component panel is what switches D on — one gesture, matching the
// other disclosures, so there is no separate checkbox to drift out of sync with it.
// D's configured range/stock survive a collapse; only the enable flag flips.
const toggleCompD = () => {
  config.value.enableCompD = !config.value.enableCompD
  renderPlot()
}

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
// What the engine had to do to satisfy the ranges/steps/links — shown under the queue
// so a thinned grid or a link that removed wells is never silent.
const suggestionNotes = ref([])
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
    return `&nbsp;${invChip(inv, { unit: 'µM', fmt: store.formatNum })}&nbsp; ${esc(fmt(vol))} µL<br>`
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

// ── Phase-map view ───────────────────────────────────────────────────────────
// '3d'   — one scatter, three components on the axes, the 4th on a slider.
// 'grid' — the same map repeated across the other two components. Two components
//          on shared axes, the remaining one or two binned into columns and rows,
//          so a whole four-component screen is on screen at once and a boundary
//          that moves between panels reads as movement instead of memory.
const mapView = ref('3d')
const gridXKey = ref('salt')
const gridYKey = ref('cation')
const gridBins = ref(3)

const activeComps = computed(() =>
  config.value.enableCompD ? COMP_KEYS : COMP_KEYS.filter(k => k !== 'compD'))
const facetKeys = computed(() =>
  activeComps.value.filter(k => k !== gridXKey.value && k !== gridYKey.value))

// Keep the two axis choices distinct and inside the active components.
watch([() => config.value.enableCompD, gridXKey, gridYKey], () => {
  const comps = activeComps.value
  if (!comps.includes(gridXKey.value)) gridXKey.value = comps.find(k => k !== gridYKey.value) || comps[0]
  if (!comps.includes(gridYKey.value) || gridYKey.value === gridXKey.value) {
    gridYKey.value = comps.find(k => k !== gridXKey.value) || comps[0]
  }
})

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

const filterBlockInventory = (query, scope) => filterInventory(store.inventory, query, scope)

// Compute per-well volumes for a suggestion, accounting for background salt and pH.
// Returns { vA, vB, vC, vFill, backgroundNa_mM, mixedPH, exceeds }
// `extras` are components added for one export only — a compound stirred into the
// replated wells that was not part of the original screen. They are dosed exactly
// like constants (same final concentration in every well) and they come out of the
// fill-up, so the well total is unchanged and the water is recomputed around them.
const computeWellVolumes = (sug, extras = []) => {
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

  // Every component is a plain dilution from its stock: c_target · V / c_stock.
  // The solvent Na⁺ figures below are REPORTING ONLY — they say how much sodium each
  // well carries from the buffers, and never change a pipetted volume. (They used to:
  // C's volume was solved so the well's total Na⁺ hit C's target, which is only
  // meaningful if C is itself the sodium salt. With anything else in that slot —
  // pU, a polymer, a dye — it silently pipetted 0 µL, or more stock than the well holds.)
  const vC = cfg.stockSalt > 0 ? (sug.salt * V) / cfg.stockSalt : 0

  // Constant components — the same final concentration in every well. Each adds a
  // fixed volume that reduces the fill-up. (Treated as inert for the Na⁺ balance;
  // uniform Na⁺ buffers belong in the fill-up/medium fields above.)
  const consts = [...(Array.isArray(cfg.constants) ? cfg.constants : []), ...(extras || [])]
  const constVols = consts.map(k => {
    const stockMM = getMM(k.stockConc, k.stockUnit)
    const cMM = getMM(k.conc, k.unit)
    return stockMM > 0 ? (cMM / stockMM) * V : 0
  })
  const vConst = constVols.reduce((a, b) => a + b, 0)

  const vFill = V - vA - vB - vC - vD - vConst

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

  return { vA, vB, vC, vD, vConst, constVols, vFill: Math.max(0, vFill), backgroundNa_mM, mixedPH, exceeds: vFill < 0 }
}

// Apply component-dependency links to a (copied) experiment/suggestion object.
// Stored-unit arithmetic, two modes:
//   fixed — target  = source * factor + offset
//   range — target ∈ [source * factor + offset, source * factorMax + offsetMax]
// Share of the well a composition needs: Σ(target/stock) + the constants' fixed share.
// Reuses computeWellVolumes so there is one definition of the volume maths; the target
// volume cancels out, which is why the engine can filter on it without knowing V.
// > 1 means the components alone overflow the tube — the concentrations in that well
// would be wrong whatever you do, so it is not a well the engine is allowed to propose.
const wellVolumeFraction = (exp) => {
  const V = Number(config.value.targetVolume)
  if (!isFinite(V) || V <= 0) return 0
  const { vA, vB, vC, vD, vConst } = computeWellVolumes(exp)
  return (vA + vB + vC + vD + vConst) / V
}

// The worst case the current ranges allow — the corner where every component is at its
// maximum. Shown before anything is generated, so an impossible search space is visible
// while it can still be fixed rather than after a plate is pipetted.
const worstCaseFill = computed(() => {
  const cfg = config.value
  const frac = wellVolumeFraction({
    anion: Number(cfg.anionMax) || 0,
    cation: Number(cfg.cationMax) || 0,
    salt: Number(cfg.saltMax) || 0,
    compD: cfg.enableCompD ? (Number(cfg.compDMax) || 0) : 0,
  })
  return { frac, uL: frac * (Number(cfg.targetVolume) || 0) }
})


// Move a compound onto another letter. Whoever was on that letter takes this one's
// place, and everything either of them owned — range, step, stock, unit, inventory
// link, solvent and every value already logged against them — goes with them, so
// the dataset means exactly what it meant before, just under different letters.
const swapComponentTo = (from, to) => {
  if (!to || from === to) return
  const other = compLabel(to)
  if (experiments.value.length &&
      !confirm(`Move ${compLabel(from)} onto ${SLOT_LETTER[to]} and ${other} onto ${SLOT_LETTER[from]}?\n\n`
        + `Their ranges, stocks and all ${experiments.value.length} logged values swap with them, so nothing changes meaning.`)) return

  swapComponentSlots(config.value, [...experiments.value, ...suggestions.value], from, to)

  // D is where a swapped-in compound would go invisible: its axis is only drawn
  // when the fourth component is switched on.
  if (from === 'compD' || to === 'compD') {
    config.value.enableCompD = true
    currentDSlice.value = Number(config.value.compDMin) || 0
  }
  // The slice grid names its axes by slot, so keep it pointing at the same compounds.
  for (const axis of [gridXKey, gridYKey]) {
    if (axis.value === from) axis.value = to
    else if (axis.value === to) axis.value = from
  }
  renderPlot()
}

const compLabel = (key) => ({
  anion: () => config.value.anionName || 'A',
  cation: () => config.value.cationName || 'B',
  salt: () => config.value.saltName || 'C',
  compD: () => config.value.compDName || 'D',
}[key]?.() ?? key)

// "A · K10 peptide (mM)" — the letter first, because that is what the pickers, the
// ledger columns and the replate control all name, and the name second, because
// that is what is in the tube.
const compAxisTitle = (key) => `${SLOT_LETTER[key] || '?'} · ${compLabel(key)} (${config.value[key + 'Unit'] || ''})`
const compPickerLabel = (key) => `${SLOT_LETTER[key] || '?'} · ${compLabel(key)}`

// A component's own [min, max], ordered.
const EPS = 1e-9
const axisBounds = (key) => {
  const a = Number(config.value[key + 'Min'])
  const b = Number(config.value[key + 'Max'])
  if (!isFinite(a) || !isFinite(b)) return null
  return { lo: Math.min(a, b), hi: Math.max(a, b) }
}

// Never let a linked value leave the component's configured range — an out-of-range
// concentration here is pipetted for real by the plate export.
const clampToAxis = (key, v) => {
  const b = axisBounds(key)
  if (!b) return v
  return Math.min(Math.max(v, b.lo), b.hi)
}

// Nearest point on a component's own grid (min + n·step) inside [lo, hi], approached
// from the given edge. Keeps a clamped value grid-locked like the rest of the plate;
// when the band is narrower than one step, fall back to the edge clamped into the
// component's own range rather than to the raw edge (which can sit far outside it).
const snapIntoBand = (key, edge, lo, hi) => {
  const min  = Number(config.value[key + 'Min'])
  const step = Number(config.value[key + 'Step'])
  const b    = axisBounds(key)
  if (!isFinite(min) || !isFinite(step) || step <= 0) return clampToAxis(key, edge)
  const n = edge <= lo
    ? Math.ceil((lo - min) / step - EPS)
    : Math.floor((hi - min) / step + EPS)
  const snapped = min + n * step
  if (snapped < lo - EPS || snapped > hi + EPS) return clampToAxis(key, edge)
  if (b && (snapped < b.lo - EPS || snapped > b.hi + EPS)) return clampToAxis(key, edge)
  return snapped
}

// The engine now builds its candidate grid on the linked manifold, so for suggestions
// this is a safety net that should change nothing. It still matters for hand-entered
// rows and for suggestions from an older backend, and it is what guarantees no linked
// value ever leaves its component's configured range.
// `clamped` counts values that had to be pulled back into range — the caller reports it.
const applyDependencies = (exp, stats = null) => {
  const deps = config.value.dependencies || []
  deps.forEach(dep => {
    if (!dep.source || !dep.target || dep.source === dep.target) return
    const srcVal = Number(exp[dep.source]) || 0
    if (dep.mode === 'range') {
      // A range link CONSTRAINS rather than determines: the engine's own value for the
      // target is kept whenever it already sits inside the band, so the sweep still
      // explores the target. Only out-of-band values are pulled to the nearer edge.
      // Missing max coefficients fall back to the min side, collapsing to a fixed link.
      const a = srcVal * (dep.factor ?? 1) + (dep.offset ?? 0)
      const b = srcVal * (dep.factorMax ?? dep.factor ?? 1) + (dep.offsetMax ?? dep.offset ?? 0)
      // The band only means anything where it overlaps the component's own range.
      const bounds = axisBounds(dep.target)
      let lo = Math.min(a, b), hi = Math.max(a, b)
      if (bounds) { lo = Math.max(lo, bounds.lo); hi = Math.min(hi, bounds.hi) }
      const cur = Number(exp[dep.target]) || 0
      if (lo > hi) { // band and range do not overlap at all — stay inside the range
        if (stats) stats.clamped++
        exp[dep.target] = +clampToAxis(dep.target, cur).toFixed(6)
        return
      }
      if (cur >= lo - EPS && cur <= hi + EPS) return
      if (stats) stats.clamped++
      exp[dep.target] = +snapIntoBand(dep.target, cur < lo ? lo : hi, lo, hi).toFixed(6)
      return
    }
    // Fixed link: the ratio determines the target. `snapStep` trades ratio accuracy
    // for a target that also sits on its own step grid.
    let val = srcVal * (dep.factor ?? 1) + (dep.offset ?? 0)
    if (dep.snapStep) {
      const min  = Number(config.value[dep.target + 'Min'])
      const step = Number(config.value[dep.target + 'Step'])
      if (isFinite(min) && isFinite(step) && step > 0) val = min + Math.round((val - min) / step) * step
    }
    const clamped = clampToAxis(dep.target, val)
    if (stats && Math.abs(clamped - val) > EPS) stats.clamped++
    exp[dep.target] = +clamped.toFixed(6)
  })
  return exp
}

const addDependency = () => {
  if (!config.value.dependencies) config.value.dependencies = []
  config.value.dependencies.push({ source: 'salt', target: 'compD', mode: 'fixed', factor: 1, offset: 0, factorMax: 2, offsetMax: 0, snapStep: false })
  config.value.enableCompD = true
}
// Seeds the upper limit on first switch so a link saved before ranges existed —
// or one left at its defaults — starts as a real band rather than a collapsed point.
const setDependencyMode = (dep, mode) => {
  dep.mode = mode
  if (mode !== 'range') return
  if (dep.factorMax === undefined || dep.factorMax === null) dep.factorMax = (dep.factor ?? 1) * 2
  if (dep.offsetMax === undefined || dep.offsetMax === null) dep.offsetMax = dep.offset ?? 0
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
  const statusName = s.phase === -1 ? 'AI TARGET' : phaseLabel(s.phase);
  return `ID: ${s.sampleId} [${statusName}]\nA: ${s.anion} | B: ${s.cation} | C: ${s.salt}`
}

// One well's worth of HTML: the chips, the volumes each component needs to reach
// its concentration in the target well volume, and the fill-up. Shared by the
// suggestion export and the phase export so a re-plated condition is written in
// exactly the same shape — which is what lets the robot exporters, the usage
// tracker and this module's own plate reader read it back.
const buildTargetWellHtml = (sample, { header, extras = [] }) => {
    const getInventoryTag = (inv, vol, targetConc) => {
        if (!inv) return `<strong>Unknown Component:</strong> ${esc(vol)} µL (${esc(targetConc)} mM)<br>`;
        return `&nbsp;${invChip(inv, { unit: 'µM', fmt: store.formatNum })}&nbsp; ${esc(vol)} µL (${esc(targetConc)} mM)<br>`;
    };
    const fmt = n => Number(n).toFixed(2)
    const { vA, vB, vC, vD, vFill, constVols, backgroundNa_mM, mixedPH, exceeds } = computeWellVolumes(sample, extras)

    const warningHtml = exceeds ? `<br><span style="color:#ef4444; font-size:0.7rem;">⚠️ Vol Exceeds Limit</span>` : '';

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
      fillupHtml = `&nbsp;${invChip(fillupInv, { unit: 'mM', fmt: store.formatNum })}&nbsp; ${fmt(vFill)} µL<br>`
    } else {
      const fillupLabel = config.value.fillupMedium.type === 'buffer'
        ? (config.value.fillupMedium.bufName || 'Buffer')
        : 'MQ H₂O'
      fillupHtml = `<strong>${esc(fillupLabel)}:</strong> ${fmt(vFill)} µL<br>`
    }

    const dRowHtml = config.value.enableCompD
        ? getInventoryTag(config.value.compDInv, fmt(vD), sample.compD || 0)
        : '';

    // Constants are emitted in the same `chip → volume → (target conc)` shape as
    // A–D, so the journal, the usage tracker and the robot exporters all read them
    // the same way. A zero-volume constant gets the plain label instead: a chip
    // would claim the compound was used in a well that never receives any.
    // These lines stay AFTER the A/B/C(/D) rows — the platereader importer reads
    // the first three "µL (x mM)" pairs back out as the component concentrations.
    let constHtml = '';
    [...(config.value.constants || []), ...extras].forEach((k, ci) => {
        const v = (constVols && constVols[ci]) || 0;
        const target = `(${esc(String(k.conc))} ${esc(k.unit)})`;
        constHtml += (k.inv && v > 0)
            ? `&nbsp;${invChip(k.inv, { unit: k.stockUnit || 'µM', fmt: store.formatNum })}&nbsp; ${fmt(v)} µL ${target}<br>`
            : `<strong>${esc(k.name || 'Constant')}:</strong> ${fmt(v)} µL ${target}<br>`;
    });

    return `<strong style="color: var(--primary);">${header}</strong><br>
            ${getInventoryTag(config.value.anionInv, fmt(vA), sample.anion)}
            ${getInventoryTag(config.value.cationInv, fmt(vB), sample.cation)}
            ${getInventoryTag(config.value.saltInv, fmt(vC), sample.salt)}
            ${dRowHtml}${constHtml}${bgHtml}${fillupHtml}${warningHtml}`;
}

// Lay a list of conditions onto a plate from a starting well, reading across rows.
// Returns how many were written and how many did not fit.
const writeRowsToPlate = (rows, plate, startWell, headerOf, extras = []) => {
    const match = String(startWell || '').toUpperCase().trim().match(/^([A-Z]+)(\d+)$/)
    if (!match) return null
    const startRow = match[1].charCodeAt(0) - 65
    const startCol = parseInt(match[2]) - 1
    let written = 0, overflow = 0
    rows.forEach((row, i) => {
        const targetR = startRow + Math.floor((startCol + i) / 12)
        const targetC = (startCol + i) % 12
        if (targetR >= 8 || targetC >= 12) { overflow++; return }
        const wId = String.fromCharCode(65 + targetR) + (targetC + 1)
        plate.wells[wId] = buildTargetWellHtml(row, { header: headerOf(row), extras })
        written++
    })
    return { written, overflow }
}

// ── Replate one phase ────────────────────────────────────────────────────────
// The point of classifying a plate is to go back into one of the classes. These
// are conditions that were already measured, so nothing about them is recomputed:
// the concentrations are the recorded ones, dependency links are NOT reapplied
// (that would move a measured point onto the line it was supposed to sit on), and
// only the volumes are worked out fresh — c · V / c_stock against whatever target
// well volume the new plate is being made at.
const phaseExportPhase = ref(1)
const phaseExportPlateId = ref('')
const phaseExportStartWell = ref('A1')
const phaseExportRunOnly = ref(false)

const phaseCounts = computed(() => {
  const counts = {}
  for (const exp of experiments.value) counts[exp.phase] = (counts[exp.phase] || 0) + 1
  return counts
})

const phaseExportRows = computed(() =>
  experiments.value
    .filter(e => e.phase === phaseExportPhase.value)
    .filter(e => !phaseExportRunOnly.value || (e.kin && e.kin.source && e.kin.source === prKinFileName.value))
    .sort((a, b) => Number(a.sampleId) - Number(b.sampleId))
)

// Components added to the replated wells only — the reason to go back into a phase
// is usually to do something new to it. Each is dosed to the same final
// concentration in every well and comes out of the fill-up, so the well total stays
// at the target volume and the water is recomputed around them. They belong to the
// export, not to the search space, so they never touch the AI suggestions.
const phaseExtras = ref([])
const addPhaseExtra = () => {
  phaseExtras.value.push({
    id: 'x_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36)),
    name: '', conc: 0, unit: 'mM', stockConc: 100, stockUnit: 'mM',
    inv: null, searchQuery: '', searchScope: 'Global',
  })
}
const removePhaseExtra = (i) => phaseExtras.value.splice(i, 1)

// What each addition costs the fill-up, so it is visible before anything is written.
const phaseExtraVolume = (k) => {
  const stockMM = getMM(k.stockConc, k.stockUnit)
  const cMM = getMM(k.conc, k.unit)
  return stockMM > 0 ? (cMM / stockMM) * (Number(config.value.targetVolume) || 0) : 0
}
const phaseExtrasVolume = computed(() => phaseExtras.value.reduce((s, k) => s + phaseExtraVolume(k), 0))

const exportPhaseToPlate = () => {
  const rows = phaseExportRows.value
  if (!rows.length) { alert(`No wells are classified as ${phaseLabel(phaseExportPhase.value)}.`); return }
  const plate = store.wellPlates.find(p => p.id === phaseExportPlateId.value)
  if (!plate) { alert('Pick the plate to send them to.'); return }

  // An addition with no name would reach the plate as an anonymous volume.
  const extras = phaseExtras.value.filter(k => (k.inv || (k.name || '').trim()) && phaseExtraVolume(k) > 0)
  const ignored = phaseExtras.value.length - extras.length

  const result = writeRowsToPlate(rows, plate, phaseExportStartWell.value,
    r => `Sample [${r.sampleId}] · ${phaseLabel(phaseExportPhase.value)}`, extras)
  if (!result) { alert('Invalid well format. Use A1, B2, etc.'); return }

  const overfilled = rows.filter(r => computeWellVolumes(r, extras).exceeds).length
  alert(`${result.written} ${phaseLabel(phaseExportPhase.value)} condition${result.written === 1 ? '' : 's'} sent to "${plate.name}" from ${phaseExportStartWell.value.toUpperCase()},`
    + ` at ${config.value.targetVolume} µL per well.`
    + (extras.length ? `\n\nAdded to every well: ${extras.map(k => `${k.inv ? k.inv.name : k.name} ${k.conc} ${k.unit}`).join(', ')} — ${phaseExtrasVolume.value.toFixed(2)} µL taken out of the fill-up.` : '')
    + (ignored ? `\n\n${ignored} addition${ignored === 1 ? '' : 's'} skipped: no compound named, or a concentration of zero.` : '')
    + (result.overflow ? `\n\n${result.overflow} did not fit on the plate — send the rest from another starting well.` : '')
    + (overfilled ? `\n\n⚠️ ${overfilled} need more volume than the well holds; they are marked on the plate.` : ''))
}

const exportSuggestionsToPlate = () => {
    if (!targetPlateId.value || !targetStartWell.value) { alert("Please select a target plate and starting well."); return; }
    const plate = store.wellPlates.find(p => p.id === targetPlateId.value);
    if (!plate) return;

    // Suggestions are proposals, so the dependency links are applied on the way out;
    // a measured condition is not touched — see exportPhaseToPlate.
    const rows = suggestions.value.map(sug => ({ ...applyDependencies({ ...sug }), sampleId: sug.sampleId }))
    const result = writeRowsToPlate(rows, plate, targetStartWell.value, r => `AI Target [${r.sampleId}]`)
    if (!result) { alert("Invalid well format. Use A1, B2, etc."); return; }
    alert(`Successfully sent pipetting volumes to Plate: ${plate.name} starting at ${targetStartWell.value.toUpperCase().trim()}`
        + (result.overflow ? `\n\n${result.overflow} did not fit on the plate.` : ''));
}

// The scene's point traces at one Component-D level. Pulled out of renderPlot so
// the HTML export can rebuild the same scene at every level without keeping a
// second copy of the rules that sort a point into result, proposal or untested.
//
// `keepEmpty` holds on to phases that have no points in this slice. The exported
// slider redraws on every step, and a legend that gains and loses rows as you
// drag it is not one you can read a boundary off.
const buildSceneTraces = (dSlice, { keepEmpty = false } = {}) => {
  const classTraces = {};
  for(let i=0; i<=4; i++) {
      classTraces[i] = { type: 'scatter3d', mode: 'markers', x:[], y:[], z:[], text:[], name: phaseLabel(i), marker: {color: getPhaseColor(i), size: 5, symbol: 'circle', line: {color: '#000', width: 1}} };
  }

  const traceUnknown = { type: 'scatter3d', mode: 'markers', x: [], y: [], z: [], text: [], name: 'Untested', marker: { color: '#94a3b8', size: 2, symbol: 'circle' } };
  const traceTarget = { type: 'scatter3d', mode: 'markers', x: [], y: [], z: [], text: [], name: 'AI Target', marker: { color: getPhaseColor(-1), size: 4, symbol: 'cross', line: { color: '#fff', width: 1 } } };

  const allData = [...experiments.value, ...suggestions.value]

  // When 4D is active, filter to points whose compD is within ±step/2 of the current D slice.
  const dEnabled = config.value.enableCompD
  const dHalf = (config.value.compDStep || 0.1) / 2
  const dataForPlot = dEnabled
    ? allData.filter(e => {
        const dv = (e.compD === undefined || e.compD === null) ? 0 : e.compD
        return Math.abs(dv - dSlice) <= dHalf
      })
    : allData

  dataForPlot.forEach(exp => {
    const statusName = exp.phase === -1 ? 'AI Target' : phaseLabel(exp.phase);
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

  return [...Object.values(classTraces).filter(t => keepEmpty || t.x.length > 0), traceUnknown, traceTarget];
}

// MATHEMATICALLY ROBUST DYNAMIC ISOSURFACE RENDERING
//
// The fitted boundaries are modelled over A/B/C only, so the same surfaces stand
// whichever D slice is on screen. That is what lets the export serialise them
// once and concatenate them onto every frame, instead of repeating a voxel grid
// per phase per slice and producing a file nobody can open.
const buildBoundaryTraces = () => {
  const traces = []
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
              name: `${phaseLabel(pId)} Boundary`,
              showscale: false,
              hoverinfo: 'none'
          };
          traces.push(traceSurface);
      });
  }
  return traces
}

const buildSceneLayout = () => ({
  scene: {
    xaxis: { range: [config.value.anionMin, config.value.anionMax], title: { text: compAxisTitle('anion'), font: { color: '#ffffff', size: 12 } }, backgroundcolor: "#000000", gridcolor: "#444444", showbackground: true, zerolinecolor: "#888888", tickfont: { color: '#dddddd', size: 10 } },
    yaxis: { range: [config.value.cationMin, config.value.cationMax], title: { text: compAxisTitle('cation'), font: { color: '#ffffff', size: 12 } }, backgroundcolor: "#000000", gridcolor: "#444444", showbackground: true, zerolinecolor: "#888888", tickfont: { color: '#dddddd', size: 10 } },
    zaxis: { range: [config.value.saltMin, config.value.saltMax], title: { text: compAxisTitle('salt'), font: { color: '#ffffff', size: 12 } }, backgroundcolor: "#000000", gridcolor: "#444444", showbackground: true, zerolinecolor: "#888888", tickfont: { color: '#dddddd', size: 10 } }
  },
  paper_bgcolor: '#000000',
  margin: { l: 0, r: fixedAxis.value ? 110 : 0, b: 0, t: 0 },
  showlegend: true,
  legend: fixedAxis.value
    ? { orientation: 'v', x: 1.02, xanchor: 'left', y: 0.5, yanchor: 'middle', font: { color: '#ffffff', size: 9 } }
    : { orientation: 'h', y: 0.05, x: 0.5, xanchor: 'center', font: { color: '#ffffff', size: 10 } }
})

const renderPlot = () => {
  if (mapView.value === 'grid') { nextTick(() => renderSliceGrid()); return }

  const plotDiv = document.getElementById('phase-ternary-plot')
  if (!plotDiv) return

  const traces = [...buildSceneTraces(currentDSlice.value), ...buildBoundaryTraces()]
  Plotly.react('phase-ternary-plot', traces, buildSceneLayout(), { displayModeBar: false, responsive: true })
  nextTick(() => render2DPlot())
}

// ── Slice grid ───────────────────────────────────────────────────────────────
// Bins for a facet component. When the screen only visits a handful of levels for
// that component (a 3-level EDC sweep), each level becomes its own panel — binning
// them into ranges would invent a spread the experiment never had.
const buildBins = (key, data) => {
  const lo = Number(config.value[key + 'Min'])
  const hi = Number(config.value[key + 'Max'])
  const unit = config.value[key + 'Unit'] || ''
  const name = compLabel(key)
  const n = Math.max(1, Math.min(4, gridBins.value))
  const vals = [...new Set(data.map(d => Number(d[key] ?? 0)).filter(v => isFinite(v)))].sort((a, b) => a - b)

  // `value` is what each panel is labelled with; `label` keeps the component name
  // for anywhere the bin is described on its own.
  if (vals.length && vals.length <= n) {
    return vals.map(v => ({ exact: true, lo: v, hi: v, value: `${+v.toFixed(3)}`, label: `${name} ${+v.toFixed(3)} ${unit}` }))
  }
  if (!isFinite(lo) || !isFinite(hi) || hi <= lo) {
    return [{ exact: false, lo: -Infinity, hi: Infinity, value: 'all', label: name }]
  }
  const step = (hi - lo) / n
  // Label the edges at the precision the component is dosed at — "5–33.333" is a
  // consequence of dividing by three, not a concentration anyone pipettes.
  const dose = Number(config.value[key + 'Step'])
  const dec = !isFinite(dose) || dose <= 0 ? 1 : Math.min(3, Math.max(0, Math.ceil(-Math.log10(dose))))
  const round = v => +v.toFixed(dec)
  return Array.from({ length: n }, (_, i) => {
    const bLo = round(lo + i * step)
    const bHi = round(i === n - 1 ? hi : lo + (i + 1) * step)
    return { exact: false, lo: lo + i * step, hi: i === n - 1 ? hi : lo + (i + 1) * step,
             value: `${bLo}–${bHi}`, label: `${name} ${bLo}–${bHi} ${unit}` }
  })
}

// Half-open bins ([lo, hi) except the last, which closes) so a well sitting exactly
// on a bin edge lands in one panel, never two.
const inBin = (value, bin) => {
  const v = Number(value ?? 0)
  if (bin.exact) return Math.abs(v - bin.lo) < 1e-9
  if (!isFinite(bin.lo) || !isFinite(bin.hi)) return true
  const axisMax = Number(config.value[bin.key + 'Max'])
  const isLast = isFinite(axisMax) && Math.abs(bin.hi - axisMax) < 1e-9
  return v >= bin.lo - 1e-9 && (isLast ? v <= bin.hi + 1e-9 : v < bin.hi - 1e-9)
}

const renderSliceGrid = () => {
  const div = document.getElementById('phase-slice-grid')
  if (!div) return

  const xKey = gridXKey.value, yKey = gridYKey.value
  const data = [...experiments.value, ...suggestions.value]
  const facets = facetKeys.value
  const colBins = facets[0] ? buildBins(facets[0], data).map(b => ({ ...b, key: facets[0] })) : [null]
  const rowBins = facets[1] ? buildBins(facets[1], data).map(b => ({ ...b, key: facets[1] })) : [null]

  // Titled by letter AND name. The rest of the module talks in A/B/C/D — the
  // component pickers, the replate control, the fit-to-data summary — so an axis
  // labelled only "K10 peptide" makes the reader do the lookup themselves.
  const xLabel = compAxisTitle(xKey)
  const yLabel = compAxisTitle(yKey)

  // Ticks sit on the values the screen actually visited, not on Plotly's round
  // numbers — so the axis itself tells you which concentrations were pipetted.
  // Every visited value gets a gridline; only every k-th gets a label, which is
  // what stops the numbers from colliding on a small panel.
  const screenedTicks = (key, maxLabels) => {
    // Logged wells define the lattice — proposals are not screened concentrations
    // yet, and letting them add ticks would answer the wrong question.
    const source = experiments.value.length ? experiments.value : data
    const vals = [...new Set(source.map(d => Number(d[key])).filter(v => isFinite(v)))].sort((a, b) => a - b)
    if (!vals.length || vals.length > 24) return null
    const stride = Math.ceil(vals.length / maxLabels)
    const last = vals.length - 1
    // The last value is labelled too, but only when it isn't crowding the label
    // before it — otherwise "27.5" and "30" end up shoulder to shoulder.
    const labelLast = last % stride !== 0 && last - Math.floor(last / stride) * stride >= stride / 2
    return {
      tickmode: 'array',
      tickvals: vals,
      ticktext: vals.map((v, i) => (i % stride === 0 || (i === last && labelLast)) ? String(+v.toFixed(3)) : '')
    }
  }
  const pad = (key, vals) => {
    const lo = Number(config.value[key + 'Min']), hi = Number(config.value[key + 'Max'])
    if (!vals || !vals.length) return [lo, hi]
    const dLo = Math.min(lo, ...vals), dHi = Math.max(hi, ...vals)
    const m = (dHi - dLo) * 0.06 || 1
    return [dLo - m, dHi + m]
  }
  // "C = 30 mM" for a single level, "C 30–60 mM" for a binned range.
  const facetStripLabel = (bin) => {
    const unit = config.value[bin.key + 'Unit'] || ''
    const letter = SLOT_LETTER[bin.key] || '?'
    const value = String(bin.value)
    return /[–\-—]/.test(value) ? `${letter} ${value} ${unit}` : `${letter} = ${value} ${unit}`
  }

  const xTicks = screenedTicks(xKey, 4)
  const yTicks = screenedTicks(yKey, 4)
  const xRange = pad(xKey, xTicks?.tickvals)
  const yRange = pad(yKey, yTicks?.tickvals)

  const C = colBins.length, R = rowBins.length
  // Panels get a floor height so labels always have room; the container scrolls
  // rather than squeezing nine panels into whatever height is left over.
  const H = Math.max(380, R * 215 + 140)
  div.style.height = H + 'px'

  // Marker size follows the busiest panel: at plate densities the dots have to be
  // small enough that the screened lattice still shows through them.
  const busiest = Math.max(1, ...(function () {
    const counts = []
    ;(rowBins.length ? rowBins : [null]).forEach(rb => (colBins.length ? colBins : [null]).forEach(cb => {
      counts.push(data.filter(d => (!cb || inBin(d[cb.key], cb)) && (!rb || inBin(d[rb.key], rb))).length)
    }))
    return counts
  })())
  const dotSize = busiest > 200 ? 4 : busiest > 90 ? 5 : busiest > 40 ? 6 : 7.5

  const gapX = C > 1 ? 0.06 : 0, gapY = R > 1 ? 0.14 : 0
  const traces = []
  const layout = {
    height: H,
    paper_bgcolor: '#000000',
    plot_bgcolor: '#0b0b0b',
    margin: { l: 74, r: R > 1 ? 112 : 26, t: C > 1 ? 56 : 18, b: 84 },
    showlegend: true,
    legend: { orientation: 'h', y: -0.13, yanchor: 'top', x: 0.5, xanchor: 'center',
              font: { color: '#ffffff', size: 10 } },
    annotations: [],
    hovermode: 'closest'
  }

  const legendSeen = new Set()
  rowBins.forEach((rBin, ri) => {
    colBins.forEach((cBin, ci) => {
      const n = ri * C + ci + 1
      const ax = n === 1 ? 'x' : 'x' + n
      const ay = n === 1 ? 'y' : 'y' + n
      const xDom = [ci / C + gapX / 2, (ci + 1) / C - gapX / 2]
      const yTop = 1 - ri / R, yBot = 1 - (ri + 1) / R
      const yDom = [yBot + gapY / 2, yTop - gapY / 2]
      const bottomRow = ri === R - 1, leftCol = ci === 0

      // Axis titles are drawn once for the whole grid as annotations below, so a
      // per-panel title can never collide with a neighbour's tick labels.
      layout['xaxis' + (n === 1 ? '' : n)] = {
        domain: xDom, anchor: ay, range: xRange, gridcolor: '#242424', zerolinecolor: '#3a3a3a',
        tickfont: { color: '#b8b8b8', size: 8.5 }, showticklabels: bottomRow, ticklen: 3,
        ...(xTicks || {})
      }
      layout['yaxis' + (n === 1 ? '' : n)] = {
        domain: yDom, anchor: ax, range: yRange, gridcolor: '#242424', zerolinecolor: '#3a3a3a',
        tickfont: { color: '#b8b8b8', size: 8.5 }, showticklabels: leftCol, ticklen: 3,
        ...(yTicks || {})
      }

      const cell = data.filter(d =>
        (!cBin || inBin(d[cBin.key], cBin)) && (!rBin || inBin(d[rBin.key], rBin)))

      // Plotly only draws an axis that something is plotted on, so an empty panel
      // would lose its frame and gridlines and the grid would look broken where
      // coverage is missing. This invisible point keeps every panel a panel.
      traces.push({
        type: 'scatter', mode: 'markers', xaxis: ax, yaxis: ay,
        x: [xRange[0]], y: [yRange[0]], hoverinfo: 'skip', showlegend: false,
        marker: { size: 0.1, color: 'rgba(0,0,0,0)' }
      })

      const byPhase = {}
      const targets = { x: [], y: [], text: [] }
      cell.forEach(d => {
        const label = `ID ${d.sampleId || 'manual'}<br>${compPickerLabel(xKey)} ${d[xKey]} · ${compPickerLabel(yKey)} ${d[yKey]}` +
          facets.map(f => `<br>${compPickerLabel(f)} ${d[f] ?? 0}`).join('')
        if (d.phase >= 0 && d.phase <= 4) {
          (byPhase[d.phase] = byPhase[d.phase] || { x: [], y: [], text: [] })
          byPhase[d.phase].x.push(d[xKey]); byPhase[d.phase].y.push(d[yKey]); byPhase[d.phase].text.push(label)
        } else {
          targets.x.push(d[xKey]); targets.y.push(d[yKey]); targets.text.push(label)
        }
      })

      Object.keys(byPhase).sort().forEach(p => {
        const pid = Number(p)
        const first = !legendSeen.has(pid)
        legendSeen.add(pid)
        traces.push({
          type: 'scatter', mode: 'markers', xaxis: ax, yaxis: ay,
          x: byPhase[p].x, y: byPhase[p].y, text: byPhase[p].text, hoverinfo: 'text',
          name: phaseLabel(pid), legendgroup: 'phase' + pid, showlegend: first, legendrank: pid + 1,
          marker: { color: getPhaseColor(pid), size: dotSize, line: { color: '#000', width: 0.4 } }
        })
      })
      if (targets.x.length) {
        const first = !legendSeen.has('target')
        legendSeen.add('target')
        traces.push({
          type: 'scatter', mode: 'markers', xaxis: ax, yaxis: ay,
          x: targets.x, y: targets.y, text: targets.text, hoverinfo: 'text',
          name: 'AI Target', legendgroup: 'target', showlegend: first, legendrank: 99,
          marker: { color: getPhaseColor(-1), size: Math.max(4, dotSize - 1), symbol: 'cross' }
        })
      }

      // Each strip names its own component: "C = 30 mM", not a bare "30". A number
      // on top of a panel and another down its side is two numbers with nothing
      // saying which compound either belongs to.
      if (ri === 0 && cBin) {
        layout.annotations.push({ text: facetStripLabel(cBin), xref: 'paper', yref: 'paper',
          x: (xDom[0] + xDom[1]) / 2, y: 1.008, xanchor: 'center', yanchor: 'bottom',
          showarrow: false, font: { color: '#e2e8f0', size: 10 } })
      }
      if (ci === C - 1 && rBin) {
        layout.annotations.push({ text: facetStripLabel(rBin), xref: 'paper', yref: 'paper',
          x: 1.006, y: (yDom[0] + yDom[1]) / 2, xanchor: 'left', yanchor: 'middle',
          showarrow: false, font: { color: '#e2e8f0', size: 10 } })
      }
      if (!cell.length) {
        layout.annotations.push({ text: 'no wells', xref: 'paper', yref: 'paper',
          x: (xDom[0] + xDom[1]) / 2, y: (yDom[0] + yDom[1]) / 2, xanchor: 'center', yanchor: 'middle',
          showarrow: false, font: { color: '#555555', size: 10 } })
      }
    })
  })

  // One title per axis of the grid, and one per facet dimension — placed in the
  // margins, where nothing else is competing for the space.
  layout.annotations.push(
    { text: xLabel, xref: 'paper', yref: 'paper', x: 0.5, y: -0.055, xanchor: 'center', yanchor: 'top',
      showarrow: false, font: { color: '#ffffff', size: 12 } },
    { text: yLabel, xref: 'paper', yref: 'paper', x: -0.055, y: 0.5, xanchor: 'right', yanchor: 'middle',
      showarrow: false, textangle: -90, font: { color: '#ffffff', size: 12 } }
  )
  if (facets[0]) {
    layout.annotations.push({
      text: `columns: ${compAxisTitle(facets[0])}`,
      xref: 'paper', yref: 'paper', x: 0.5, y: 1.055, xanchor: 'center', yanchor: 'bottom',
      showarrow: false, font: { color: '#cbd5e1', size: 10.5 } })
  }
  if (facets[1]) {
    layout.annotations.push({
      text: `rows: ${compAxisTitle(facets[1])}`,
      xref: 'paper', yref: 'paper', x: 1.052, y: 0.5, xanchor: 'left', yanchor: 'middle',
      showarrow: false, textangle: 90, font: { color: '#cbd5e1', size: 10.5 } })
  }

  Plotly.react('phase-slice-grid', traces, layout, { displayModeBar: false, responsive: true })
}

const render2DPlot = () => {
  const plotDiv = document.getElementById('phase-2d-plot')
  if (!plotDiv || !fixedAxis.value) return

  const fixed = fixedAxis.value
  const [xKey, yKey] = ['anion', 'cation', 'salt'].filter(a => a !== fixed)
  const xLabel = compAxisTitle(xKey)
  const yLabel = compAxisTitle(yKey)
  const fixedLabel = `${SLOT_LETTER[fixed] || '?'} · ${compLabel(fixed)} = ${config.value[fixed + 'Min']} ${config.value[fixed + 'Unit']}`

  const classTraces = {}
  for (let i = 0; i <= 4; i++) {
    classTraces[i] = { type: 'scatter', mode: 'markers', x: [], y: [], text: [], name: phaseLabel(i),
      marker: { color: getPhaseColor(i), size: 8, symbol: 'circle', line: { color: '#fff', width: 0.5 } } }
  }
  const traceUnknown = { type: 'scatter', mode: 'markers', x: [], y: [], text: [], name: 'Untested',
    marker: { color: '#94a3b8', size: 4, symbol: 'circle' } }
  const traceTarget = { type: 'scatter', mode: 'markers', x: [], y: [], text: [], name: 'AI Target',
    marker: { color: getPhaseColor(-1), size: 7, symbol: 'cross', line: { color: '#fff', width: 1 } } }

  const allData = [...experiments.value, ...suggestions.value]
  allData.forEach(exp => {
    const statusName = exp.phase === -1 ? 'AI Target' : phaseLabel(exp.phase)
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
// Switching view swaps which plot divs exist, so redraw only once the DOM has them.
watch([mapView, gridXKey, gridYKey, gridBins], () => { nextTick(() => renderPlot()) })

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

// ── Saved condition presets (the config/search-space setup only) ──────────────
// Distinct from datasets (which also carry experiment points): a named, reusable
// search-space configuration, Private to you or shared Lab-wide.
const savedConditions = ref([])
const selectedConditionId = ref('')
const showSaveCond = ref(false)
const saveCondName = ref('')
const saveCondScope = ref('Personal')
const saveCondMsg = ref('')
const saveCondTarget = ref('')   // '' = new preset, else an existing item_id to overwrite
const myConditions = computed(() => savedConditions.value.filter(c => c.owner_id === store.user?.id))
const globalConditions = computed(() => savedConditions.value.filter(c => c.scope === 'Global' && c.owner_id !== store.user?.id))
const selectedCondIsMine = computed(() => savedConditions.value.find(c => c.item_id === selectedConditionId.value)?.owner_id === store.user?.id)

async function loadConditionsList() {
  try {
    const { data, error } = await db.from('phase_conditions').select('*').order('created_at', { ascending: false })
    if (!error && data) savedConditions.value = data.map(r => ({ item_id: r.item_id, owner_id: r.owner_id, scope: r.scope, name: r.name, data: r.data }))
  } catch { /* table may not exist yet */ }
}
function openSaveConditions() {
  // Default to overwriting the currently-loaded preset (if it's yours), else new.
  const cur = savedConditions.value.find(c => c.item_id === selectedConditionId.value && c.owner_id === store.user?.id)
  saveCondTarget.value = cur ? cur.item_id : ''
  saveCondName.value = cur ? cur.name : ''
  saveCondScope.value = cur ? cur.scope : 'Personal'
  saveCondMsg.value = ''
  showSaveCond.value = true
}
function onSaveTargetChange() {
  const t = savedConditions.value.find(c => c.item_id === saveCondTarget.value)
  if (t) { saveCondName.value = t.name; saveCondScope.value = t.scope }
}
async function doSaveConditions() {
  const name = saveCondName.value.trim()
  if (!name) { saveCondMsg.value = 'Give it a name.'; return }
  if (!store.user?.id) { saveCondMsg.value = 'Sign in to save.'; return }
  saveCondMsg.value = 'Saving…'
  const existing = saveCondTarget.value ? savedConditions.value.find(c => c.item_id === saveCondTarget.value) : null
  const item_id = existing ? existing.item_id : ('cond_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36)))
  const payload = {
    item_id, owner_id: store.user.id, scope: saveCondScope.value, name,
    // Save the config AND the generated grid-locked plate (suggestions) so loading
    // restores both. Older presets stored a flat config — handled on load.
    data: {
      config: JSON.parse(JSON.stringify(config.value)),
      suggestions: JSON.parse(JSON.stringify(suggestions.value || [])),
    },
  }
  const { error } = await db.from('phase_conditions').upsert(payload, { onConflict: 'item_id' })
  if (error) { saveCondMsg.value = 'Save failed: ' + error.message; return }
  showSaveCond.value = false
  selectedConditionId.value = item_id
  await loadConditionsList()
  store.toast?.(existing ? 'Conditions overwritten' : 'Conditions saved')
}
function loadSelectedCondition() {
  const c = savedConditions.value.find(x => x.item_id === selectedConditionId.value)
  if (!c || !c.data) return
  const d = c.data
  const cfg = d.config || d   // new {config,suggestions} shape, or a legacy flat config
  config.value = { ...config.value, ...JSON.parse(JSON.stringify(cfg)) }
  if (Array.isArray(d.suggestions)) suggestions.value = JSON.parse(JSON.stringify(d.suggestions))
  nextTick(() => renderPlot())
  const withPlate = Array.isArray(d.suggestions) && d.suggestions.length
  store.toast?.(`Loaded "${c.name}"${withPlate ? ' + grid-locked plate' : ''}`)
}
async function deleteSelectedCondition() {
  const id = selectedConditionId.value
  if (!id || !confirm('Delete this saved condition?')) return
  const { error } = await db.from('phase_conditions').delete().eq('item_id', id)
  if (error) { alert('Delete failed: ' + error.message); return }
  selectedConditionId.value = ''
  await loadConditionsList()
}
onMounted(loadConditionsList)

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

// Changing a phase by hand outranks whatever the plate reader said — microscopy
// usually is the reason. Keep the measurements on the point, but stop the receipt
// claiming a class the point no longer carries.
const updateExperiment = (exp) => {
  if (exp && exp.kin && exp.kin.phase !== undefined && exp.kin.phase !== exp.phase) {
    exp.kin = { ...exp.kin, cls: null, manual: true, phase: exp.phase }
  }
  renderPlot()
}

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
  suggestionNotes.value = []
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
  suggestionNotes.value = []
  renderPlot()
}

// Build a serializable snapshot of the current workspace.
//
// The kinetic thresholds and any hand-set classifications travel with the dataset;
// the traces themselves do not — a 16-hour run is ~1 MB of readings per plate, and
// the XML is the archive for that. Reload the file and the same thresholds apply.
const buildSnapshot = (id, name) => ({
  id,
  name,
  savedAt: Date.now(),
  config: JSON.parse(JSON.stringify(config.value)),
  experiments: JSON.parse(JSON.stringify(experiments.value)),
  suggestions: JSON.parse(JSON.stringify(suggestions.value)),
  kinetics: {
    settings: { ...kinSettings },
    classPhase: { ...kinClassPhase },
    overrides: { ...kinOverrides.value },
    plateId: prLinkedPlateId.value || null,
  },
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
  if (!config.value.phaseLabels) config.value.phaseLabels = {}
  experiments.value = (ds.experiments || []).map(e => ({ ...e }))
  suggestions.value = (ds.suggestions || []).map(s => ({ ...s }))
  // Thresholds saved before a field existed fall back to its default rather than
  // to undefined, which would classify every well as none.
  Object.assign(kinSettings, normalizeKineticSettings(ds.kinetics?.settings))
  Object.assign(kinClassPhase, { none: 0, transient: 1, metastable: 2 }, ds.kinetics?.classPhase || {})
  kinOverrides.value = { ...(ds.kinetics?.overrides || {}) }
  if (ds.kinetics?.plateId) prLinkedPlateId.value = ds.kinetics.plateId
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
  // Hand-set classifications describe another screen's wells; loadDataset brings
  // each dataset's own back.
  kinOverrides.value = {}
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
  { phase: 0, label: phaseLabel(0), range: `0 – ${prPhaseBoundaries.phase0max}` },
  { phase: 1, label: phaseLabel(1), range: `${prPhaseBoundaries.phase0max} – ${prPhaseBoundaries.phase1max}` },
  { phase: 2, label: phaseLabel(2), range: `${prPhaseBoundaries.phase1max} – ${prPhaseBoundaries.phase2max}` },
  { phase: 3, label: phaseLabel(3), range: `${prPhaseBoundaries.phase2max} – ${prPhaseBoundaries.phase3max}` },
  { phase: 4, label: phaseLabel(4), range: `> ${prPhaseBoundaries.phase3max}` },
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

// The screen's components, as the well reader needs to recognise them: the
// inventory link when one was chosen, the typed name otherwise.
const prComponents = computed(() => {
  const c = config.value
  return [
    { key: 'anion',  invId: c.anionInv?.id  || '', name: c.anionInv?.name  || c.anionName,  unit: c.anionUnit },
    { key: 'cation', invId: c.cationInv?.id || '', name: c.cationInv?.name || c.cationName, unit: c.cationUnit },
    { key: 'salt',   invId: c.saltInv?.id   || '', name: c.saltInv?.name   || c.saltName,   unit: c.saltUnit },
    { key: 'compD',  invId: c.compDInv?.id  || '', name: c.compDInv?.name  || c.compDName,  unit: c.compDUnit },
  ]
})

// Wells that say something about this screen. Plates written by "Send to plate"
// are read from their sample id and target concentrations; any other plate —
// hand-built, or rebuilt from an .onp — has its design inferred from what is in
// it: whatever was pipetted at the same volume into every well is a constant, and
// whatever changes between wells is an axis. See phaseWellMapping.js.
const prPlateRead = computed(() => {
  if (!prLinkedPlate.value) return { wells: {}, inference: null }
  return readPlateWells(prLinkedPlate.value.wells, {
    components: prComponents.value,
    plateId: prLinkedPlate.value.id,
    hasD: !!config.value.enableCompD,
  })
})

const prWellData = computed(() => prPlateRead.value.wells)
const prInference = computed(() => prPlateRead.value.inference)
const prMappedWellCount = computed(() => Object.keys(prWellData.value).length)

// fmtConc, not the global fixed-decimals formatter: an axis running 0.008–0.064 mM
// is real, and two decimals would print it as "0.01–0.06".
const fmtRange = (s) => (Math.abs(s.max - s.min) < 1e-12
  ? `${fmtConc(s.max)} ${s.unit}`
  : `${fmtConc(s.min)}–${fmtConc(s.max)} ${s.unit}`)

// A plate that maps nothing has nothing that varies, or nothing readable at all.
const prMapHint = computed(() => {
  if (!prLinkedPlate.value || prMappedWellCount.value) return ''
  const filled = Object.values(prLinkedPlate.value.wells || {}).filter(Boolean).length
  if (!filled) return 'That plate has no filled wells.'
  return `Nothing in those ${filled} wells varies between them — every compound was pipetted at the same volume from the same stock, so there is no axis to map. Check you picked the right plate.`
})

const prSampleIdToExp = computed(() => {
  const map = {}
  for (const exp of experiments.value) map[String(exp.sampleId)] = exp
  return map
})

// Take the plate's word for what the components are: their names, their units and
// their inventory links, so the phase map's axes say "K10 peptide" rather than
// "Compound A". Ranges and stocks are left alone — those drive the suggestion
// engine and are the user's design decision, not the plate's.
const NAME_KEY  = { anion: 'anionName',  cation: 'cationName',  salt: 'saltName',  compD: 'compDName' }
const UNIT_KEY  = { anion: 'anionUnit',  cation: 'cationUnit',  salt: 'saltUnit',  compD: 'compDUnit' }
const INV_KEY   = { anion: 'anionInv',   cation: 'cationInv',   salt: 'saltInv',   compD: 'compDInv' }
const STOCK_KEY = { anion: 'stockAnion', cation: 'stockCation', salt: 'stockSalt', compD: 'stockCompD' }
const MIN_KEY   = { anion: 'anionMin',   cation: 'cationMin',   salt: 'saltMin',   compD: 'compDMin' }
const MAX_KEY   = { anion: 'anionMax',   cation: 'cationMax',   salt: 'saltMax',   compD: 'compDMax' }
const STEP_KEY  = { anion: 'anionStep',  cation: 'cationStep',  salt: 'saltStep',  compD: 'compDStep' }

// Every axis is drawn over the configured range and nothing else, which loses data
// two ways. A point outside the range is drawn nowhere at all. A screen whose
// concentrations are far smaller than the range — the usual case when the ranges
// are still on their defaults and the plate was dosed from µM stocks — is drawn
// inside it, but squeezed into a corner a few percent wide, which reads as an
// empty map. Both are the same fix, so both are reported.
const CRAMPED_FRACTION = 0.15

const searchSpaceIssues = computed(() => {
  const issues = []
  for (const key of COMP_KEYS) {
    if (key === 'compD' && !config.value.enableCompD) continue
    const lo = Number(config.value[MIN_KEY[key]]), hi = Number(config.value[MAX_KEY[key]])
    if (!isFinite(lo) || !isFinite(hi)) continue
    const values = experiments.value.map(e => Number(e[key] ?? 0)).filter(v => isFinite(v))
    if (!values.length) continue
    const outside = values.filter(v => v < lo - 1e-9 || v > hi + 1e-9).length
    const min = Math.min(...values), max = Math.max(...values)
    const axisSpan = hi - lo, dataSpan = max - min
    const cramped = !outside && dataSpan > 0 && axisSpan > 0 && dataSpan / axisSpan < CRAMPED_FRACTION
    if (outside || cramped) issues.push({ key, outside, cramped, lo, hi, min, max })
  }
  return issues
})

const searchSpaceIssueText = (o) => {
  const unit = config.value[UNIT_KEY[o.key]]
  return o.outside
    ? `${o.outside} point${o.outside === 1 ? '' : 's'} outside ${SLOT_LETTER[o.key]} ${fmtConc(o.lo)}–${fmtConc(o.hi)} ${unit}`
    : `${SLOT_LETTER[o.key]} only covers ${fmtConc(o.min)}–${fmtConc(o.max)} of a ${fmtConc(o.lo)}–${fmtConc(o.hi)} ${unit} axis`
}

// Set each axis to the ground the data actually covers. An axis the data never
// varied on keeps its range — there is no extent to read off a single value —
// but is widened if that value sits outside it, because a point off the axis is
// a point that was measured and cannot be seen.
const fitSearchSpaceToData = ({ silent = false } = {}) => {
  if (!experiments.value.length) return false
  const changed = []
  for (const key of COMP_KEYS) {
    if (key === 'compD' && !config.value.enableCompD) continue
    const values = experiments.value.map(e => Number(e[key] ?? 0)).filter(v => isFinite(v))
    const spacing = levelSpacing(values)
    if (!spacing) continue
    const unit = config.value[UNIT_KEY[key]]
    if (spacing.levels.length < 2) {
      const v = spacing.min
      const lo = Math.min(Number(config.value[MIN_KEY[key]]), v)
      const hi = Math.max(Number(config.value[MAX_KEY[key]]), v)
      if (lo !== Number(config.value[MIN_KEY[key]]) || hi !== Number(config.value[MAX_KEY[key]])) {
        config.value[MIN_KEY[key]] = lo
        config.value[MAX_KEY[key]] = hi
        changed.push(`${SLOT_LETTER[key]} widened to ${fmtConc(lo)}–${fmtConc(hi)} ${unit} (every point sits at ${fmtConc(v)})`)
      }
      continue
    }
    config.value[MIN_KEY[key]] = spacing.min
    config.value[MAX_KEY[key]] = spacing.max
    if (spacing.step > 0) config.value[STEP_KEY[key]] = spacing.step
    changed.push(`${SLOT_LETTER[key]} ${fmtConc(spacing.min)}–${fmtConc(spacing.max)} ${unit}, step ${fmtConc(spacing.step)}`
      + ` (${spacing.levels.length} level${spacing.levels.length === 1 ? '' : 's'} measured`
      + `${spacing.capped ? ', step kept coarser to keep the suggestion grid workable' : ''})`)
  }
  renderPlot()
  if (!silent && changed.length) alert(`Search space fitted to the data:\n\n${changed.map(c => '· ' + c).join('\n')}`)
  return changed.length > 0
}

// Take the plate's word for the whole recipe, not just the axes: what varied and
// over what ground, what was the same in every well, what made the volume up, and
// how big a well was. Everything a replated condition needs to be pipetted the
// way the original was.
//
// Units are left alone on purpose — changing an axis unit does not restate the
// points already in the ledger, so switching it here would silently rescale the
// whole dataset.
const adoptInferredComponents = () => {
  const inf = prInference.value
  if (!inf || !inf.screened.length) return

  const lines = inf.screened.map(s =>
    `${SLOT_LETTER[s.slot]} = ${s.name}  ${fmtConc(s.min)}–${fmtConc(s.max)} ${s.unit}` +
    (s.levels.length > 1 ? ` (${s.levels.length} levels)` : ''))

  // A constant with no stock recorded cannot be reproduced: the volume that gets
  // it to its concentration is unknowable. Those are named, not invented.
  const usable = (inf.constants || []).filter(c => c.stock != null && isFinite(c.stock) && c.stock > 0)
  const unusable = (inf.constants || []).filter(c => !usable.includes(c))
  if (usable.length) lines.push('', `Constants in every well: ${usable.map(c => `${c.name} ${fmtConc(c.value)} ${c.unit}`).join(', ')}`)
  if (inf.fillup) lines.push(`Fill-up: ${inf.fillup.name}`)
  if (inf.wellVolume?.uniform) lines.push(`Well volume: ${inf.wellVolume.max.toFixed(1)} µL`)

  const warn = unusable.length
    ? `\n\n${unusable.map(c => c.name).join(', ')} ${unusable.length === 1 ? 'is' : 'are'} the same in every well but ${unusable.length === 1 ? 'has' : 'have'} no stock recorded, so ${unusable.length === 1 ? 'it' : 'they'} cannot be added as a constant — set the stock on the plate first.`
    : ''

  if (!confirm(`Set up the search space from this plate?\n\n${lines.join('\n')}\n\nNames, inventory links, stocks and ranges are taken from the plate. Units are not changed.${warn}`)) return

  for (const s of inf.screened) {
    config.value[NAME_KEY[s.slot]] = s.name
    if (s.stock != null && isFinite(s.stock)) config.value[STOCK_KEY[s.slot]] = s.stock
    if (isFinite(s.min) && isFinite(s.max) && s.max > s.min) {
      config.value[MIN_KEY[s.slot]] = s.min
      config.value[MAX_KEY[s.slot]] = s.max
      if (s.step > 0) config.value[STEP_KEY[s.slot]] = s.step
    }
    const inv = s.invId ? (store.inventory || []).find(i => String(i.id) === String(s.invId)) : null
    if (inv) config.value[INV_KEY[s.slot]] = inv
  }
  if (inf.screened.some(s => s.slot === 'compD')) config.value.enableCompD = true

  // Constants: replace rather than merge. They describe one recipe, and half of
  // this plate's constants beside half of the last one's is not a recipe.
  config.value.constants = usable.map(c => ({
    id: 'k_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.round(c.value * 1e6)),
    name: c.name,
    conc: Number(Number(c.value).toPrecision(6)),
    unit: c.unit || 'mM',
    stockConc: c.stock,
    stockUnit: c.unit || 'mM',
    inv: c.invId ? (store.inventory || []).find(i => String(i.id) === String(c.invId)) || null : null,
    searchQuery: '', searchScope: 'Global',
  }))
  if (usable.length) config.value.showConstants = true

  if (inf.fillup?.kind === 'water') {
    config.value.fillupMedium = { ...config.value.fillupMedium, type: 'water', bufName: '', inv: null, bufferId: null }
  }
  // Only when every well was made up to the same volume — a plate with mixed
  // totals has no single well volume to adopt.
  if (inf.wellVolume?.uniform && inf.wellVolume.max > 0) {
    config.value.targetVolume = Number(inf.wellVolume.max.toFixed(2))
  }

  renderPlot()
}

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

// ─── Platereader 1 · kinetic runs (SkanIt XML) ─────────────────────────────
// Reader 2 hands over one number per well. Reader 1 hands over a 16-hour trace,
// which is a different question: not "how turbid was it" but "did it coacervate,
// and did the coacervate survive". The verdict is therefore a class — none /
// transient / metastable — and the class is what becomes a phase.
//
// Thresholds live here rather than in the parser because they are the
// experimenter's call; microscopy overrides live here too, and they outrank the
// thresholds, because a picture of the well beats a number from it.
const prKinetic     = ref(null)   // { channels, meta } straight from the XML
const prKinFileName = ref('')
const prChannelKey  = ref('')
const kinSettings   = reactive({ ...DEFAULT_KINETIC_SETTINGS })
const kinClassPhase = reactive({ none: 0, transient: 1, metastable: 2 })
const kinOverrides  = ref({})     // wellId → class key, set by hand after microscopy
const kinRenamePhases = ref(true)
const showKinReview = ref(false)
const kinSelected   = ref(null)
const kinOverlayAll = ref(false)
const kinSortBy     = ref('well')

const prIsKinetic = computed(() => prReaderType.value === 'reader1')

const kinChannel = computed(() => {
  const chs = prKinetic.value?.channels || []
  return chs.find(c => c.key === prChannelKey.value) || chs[0] || null
})

// Re-runs on every threshold keystroke: a 96 × 481 plate takes ~15 ms, so the
// grid, the counts and the traces all move as the number is typed.
const kinAnalysis = computed(() => kinChannel.value ? analyzePlate(kinChannel.value.wells, kinSettings) : null)

const kinWellIds = computed(() => kinAnalysis.value ? sortWellIds(Object.keys(kinAnalysis.value.wells)) : [])

const kinClassOf = (wellId) => kinOverrides.value[wellId] || kinAnalysis.value?.wells[wellId]?.cls || null

const kinCounts = computed(() => {
  const counts = { none: 0, transient: 0, metastable: 0 }
  for (const id of kinWellIds.value) { const c = kinClassOf(id); if (c) counts[c]++ }
  return counts
})
const kinOverrideCount = computed(() => Object.keys(kinOverrides.value).length)

const classMeta = (key) => KINETIC_CLASSES.find(c => c.key === key) || null
const kinPhaseOf = (key) => (key && kinClassPhase[key] !== undefined ? kinClassPhase[key] : 0)

// Two classes pointing at the same phase index would land on the same colour and
// the same label — say so rather than quietly merging them in the map.
const kinPhaseClash = computed(() => {
  const used = {}
  for (const c of KINETIC_CLASSES) {
    const p = kinPhaseOf(c.key)
    if (used[p]) return `${classMeta(used[p]).short} and ${c.short} both map to ${phaseLabel(p)} — they will be indistinguishable in the map.`
    used[p] = c.key
  }
  return ''
})

const setKinOverride = (wellId, cls) => {
  const next = { ...kinOverrides.value }
  if (!cls || cls === 'auto') delete next[wellId]
  else next[wellId] = cls
  kinOverrides.value = next
}
const clearKinOverrides = () => {
  if (!kinOverrideCount.value) return
  if (!confirm(`Drop all ${kinOverrideCount.value} manual classifications and go back to the thresholds?`)) return
  kinOverrides.value = {}
}

const onKineticXmlSelected = async (file) => {
  const parsed = parseSkanItXml(await file.text())
  if (!parsed) {
    alert('That does not look like a SkanIt result export. Expected a .xml with <ResultStep> blocks holding one <Coordinate> per well.')
    return
  }
  prKinetic.value = parsed
  prKinFileName.value = file.name
  prChannelKey.value = parsed.channels[0].key
  kinOverrides.value = {}
  kinSelected.value = null
  // The deadline for dissolution defaults to the run the user actually did —
  // a limit longer than the measurement would promise an answer nobody has.
  if (!kinSettings.timeLimitMin) kinSettings.timeLimitMin = Math.round(parsed.channels[0].durationMin)
  prODMap.value = null
}

// Dropping the file drops the hand-set classifications with it — they belong to
// that plate. Only the ✕ does this; applying leaves the run loaded so the traces
// stay available for a second look.
const clearKinetic = () => {
  prKinetic.value = null
  prKinFileName.value = ''
  prChannelKey.value = ''
  kinOverrides.value = {}
  kinSelected.value = null
}

const kinRunSummary = computed(() => {
  const ch = kinChannel.value
  if (!ch) return ''
  const m = prKinetic.value?.meta || {}
  return [
    `${ch.wellCount} wells`,
    `${ch.readings} reads`,
    formatMinutes(ch.durationMin),
    ch.intervalMin ? `every ${formatMinutes(ch.intervalMin)}` : '',
    m.instrument,
  ].filter(Boolean).join(' · ')
})

// The well table in the review dialog. Sorting by lifetime is the point of the
// whole run, so it is one of the sort keys.
const kinTableRows = computed(() => {
  const a = kinAnalysis.value
  if (!a) return []
  const wellData = prWellData.value
  const rows = kinWellIds.value.map(id => {
    const w = a.wells[id]
    const cls = kinClassOf(id)
    return {
      wellId: id, w, cls,
      manual: !!kinOverrides.value[id],
      wd: wellData[id] || null,
      auto: w.cls,
    }
  })
  const by = kinSortBy.value
  if (by === 'lifetime') rows.sort((x, y) => (y.w.lifetimeMin ?? -1) - (x.w.lifetimeMin ?? -1))
  else if (by === 'peak') rows.sort((x, y) => y.w.peak - x.w.peak)
  else if (by === 'class') rows.sort((x, y) => KINETIC_CLASSES.findIndex(c => c.key === x.cls) - KINETIC_CLASSES.findIndex(c => c.key === y.cls))
  return rows
})

const kinLinkedCount = computed(() => {
  const wd = prWellData.value
  return kinWellIds.value.filter(id => wd[id]).length
})

// How much of this run is already a point in the ledger — the difference between
// "apply" meaning import and "apply" meaning revise.
const kinAlreadyLogged = computed(() => {
  const wd = prWellData.value
  const sidToExp = prSampleIdToExp.value
  return kinWellIds.value.filter(id => wd[id] && sidToExp[String(wd[id].sampleId)]).length
})

// ── Trace plot ──────────────────────────────────────────────────────────────
const KIN_PLOT_ID = 'kin-trace-plot'

const kinTraceLayout = (title) => ({
  paper_bgcolor: '#000000',
  plot_bgcolor: '#000000',
  margin: { l: 52, r: 12, b: 40, t: 22 },
  title: { text: title, font: { color: '#e2e8f0', size: 11 }, x: 0.01, xanchor: 'left' },
  xaxis: { title: { text: 'Time (min)', font: { color: '#cbd5e1', size: 10 } }, gridcolor: '#1f2937', zerolinecolor: '#334155', tickfont: { color: '#94a3b8', size: 9 } },
  yaxis: { title: { text: 'OD', font: { color: '#cbd5e1', size: 10 } }, gridcolor: '#1f2937', zerolinecolor: '#334155', tickfont: { color: '#94a3b8', size: 9 } },
  showlegend: false,
  hovermode: 'closest',
})

const renderKinTrace = () => {
  const el = document.getElementById(KIN_PLOT_ID)
  const ch = kinChannel.value, a = kinAnalysis.value
  if (!el || !ch || !a) return

  const shapes = [], traces = []
  const limit = kinSettings.timeLimitMin

  if (kinOverlayAll.value) {
    // One trace per class rather than per well — 96 separate WebGL traces is a lot
    // of context for a picture whose only job is to show where the classes split.
    // A null between wells breaks the line so the runs do not join up.
    const byClass = {}
    for (const id of kinWellIds.value) {
      const cls = kinClassOf(id)
      if (id === kinSelected.value) continue
      const bucket = byClass[cls] || (byClass[cls] = { x: [], y: [] })
      bucket.x.push(...ch.wells[id].t, null)
      bucket.y.push(...ch.wells[id].v, null)
    }
    for (const [cls, pts] of Object.entries(byClass)) {
      traces.push({
        type: 'scattergl', mode: 'lines', name: classMeta(cls)?.short || cls,
        x: pts.x, y: pts.y, hoverinfo: 'skip',
        line: { color: getPhaseColor(kinPhaseOf(cls), 0.45), width: 1 },
      })
    }
    const sel = kinSelected.value
    if (sel && ch.wells[sel]) {
      traces.push({
        type: 'scattergl', mode: 'lines', x: ch.wells[sel].t, y: ch.wells[sel].v,
        line: { color: getPhaseColor(kinPhaseOf(kinClassOf(sel)), 1), width: 2.4 },
        hovertemplate: `${sel} · %{y:.4f} @ %{x:.0f} min<extra></extra>`,
      })
    }
  } else if (kinSelected.value && ch.wells[kinSelected.value]) {
    const id = kinSelected.value, w = a.wells[id], trace = ch.wells[id]
    const colour = getPhaseColor(kinPhaseOf(kinClassOf(id)), 1)
    traces.push({ type: 'scattergl', mode: 'lines', x: trace.t, y: trace.v, line: { color: 'rgba(148,163,184,0.5)', width: 1 }, hoverinfo: 'skip' })
    traces.push({
      type: 'scattergl', mode: 'lines', x: trace.t, y: w.smoothed,
      line: { color: colour, width: 2.2 },
      hovertemplate: '%{y:.4f} @ %{x:.0f} min<extra></extra>',
    })
    const hline = (y, color, dash, label) => shapes.push({
      type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: y, y1: y,
      line: { color, width: 1, dash }, label: { text: label, font: { color, size: 9 }, textposition: 'end', yanchor: 'bottom' },
    })
    hline(w.baseline, '#64748b', 'dot', 'baseline')
    hline(w.riseLevel, '#f59e0b', 'dash', 'coacervation')
    if (w.dropLevel !== null) hline(w.dropLevel, '#38bdf8', 'dash', 'dissolution')
    const vline = (x, color, label) => shapes.push({
      type: 'line', yref: 'paper', y0: 0, y1: 1, xref: 'x', x0: x, x1: x,
      line: { color, width: 1, dash: 'dot' }, label: { text: label, font: { color, size: 9 }, textposition: 'top center' },
    })
    if (w.onsetMin !== null) vline(w.onsetMin, '#f59e0b', 'onset')
    if (w.dissolvedMin !== null) vline(w.dissolvedMin, '#38bdf8', 'dissolved')
  }

  if (limit && limit > 0 && limit < ch.durationMin) {
    shapes.push({
      type: 'rect', xref: 'x', yref: 'paper', x0: limit, x1: ch.durationMin, y0: 0, y1: 1,
      fillcolor: 'rgba(148,163,184,0.10)', line: { width: 0 }, layer: 'below',
    })
  }

  const title = kinOverlayAll.value
    ? `All ${kinWellIds.value.length} wells · coloured by class`
    : kinSelected.value ? `${kinSelected.value} · ${classMeta(kinClassOf(kinSelected.value))?.label || ''}` : 'Pick a well'
  Plotly.react(KIN_PLOT_ID, traces, { ...kinTraceLayout(title), shapes }, { displayModeBar: false, responsive: true })
}

watch([kinSelected, kinOverlayAll, kinAnalysis, showKinReview], () => {
  if (showKinReview.value) nextTick(renderKinTrace)
})

// v-if takes the div away with the WebGL context still attached to it; hand it
// back to Plotly first so reopening the dialog does not leak a context each time.
watch(showKinReview, (open, wasOpen) => {
  if (!open && wasOpen) { try { Plotly.purge(KIN_PLOT_ID) } catch { /* never rendered */ } }
})

// The grid in the review dialog follows the plate that was actually read, so a
// 384-well run is not squeezed into an 8 × 12 picture of itself.
const kinGrid = computed(() => {
  const ids = kinWellIds.value
  const rows = [], cols = []
  for (const id of ids) {
    const m = /^([A-Z]+)(\d+)$/.exec(id)
    if (!m) continue
    if (!rows.includes(m[1])) rows.push(m[1])
    const c = parseInt(m[2], 10)
    if (!cols.includes(c)) cols.push(c)
  }
  cols.sort((a, b) => a - b)
  return { rows, cols }
})

const kinGridStyle = (wellId) => {
  const cls = kinClassOf(wellId)
  if (!cls) return { background: 'transparent', borderColor: 'var(--border-color,#334155)', cursor: 'default' }
  const phase = kinPhaseOf(cls)
  const style = {
    background: getPhaseColor(phase, wellId === kinSelected.value ? 0.85 : 0.45),
    borderColor: getPhaseColor(phase, 1),
    cursor: 'pointer',
  }
  if (kinOverrides.value[wellId]) style.borderWidth = '2.5px'
  if (wellId === kinSelected.value) style.boxShadow = '0 0 0 2px rgba(255,255,255,0.8)'
  return style
}

const kinWellTitle = (wellId) => {
  const w = kinAnalysis.value?.wells[wellId]
  if (!w) return `${wellId} — not read`
  const wd = prWellData.value[wellId]
  const lines = [`${wellId} · ${classMeta(kinClassOf(wellId))?.label || ''}${kinOverrides.value[wellId] ? ' (by hand)' : ''}`]
  if (wd) lines.push(`Sample ${wd.sampleId} · A ${wd.anion} · B ${wd.cation} · C ${wd.salt} mM`)
  lines.push(`Peak OD ${w.peak.toFixed(4)} · baseline ${w.baseline.toFixed(4)}`)
  if (w.lifetimeMin !== null) lines.push(`Lifetime ${formatMinutes(w.lifetimeMin)}`)
  return lines.join('\n')
}

const kinSelectedSummary = computed(() => {
  const id = kinSelected.value
  const w = id ? kinAnalysis.value?.wells[id] : null
  if (!w) return null
  return { id, w, cls: kinClassOf(id), auto: w.cls, manual: !!kinOverrides.value[id], wd: prWellData.value[id] || null }
})

const openKinReview = () => {
  if (!kinSelected.value && kinWellIds.value.length) {
    // Open on something worth looking at rather than on A1's buffer blank.
    kinSelected.value = kinWellIds.value.find(id => kinClassOf(id) !== 'none') || kinWellIds.value[0]
  }
  showKinReview.value = true
  nextTick(renderKinTrace)
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

const onPlatereaderCsvSelected = async (event) => {
  const file = event.target.files[0]; event.target.value = ''
  if (!file) return
  if (prIsKinetic.value) { await onKineticXmlSelected(file); return }
  const result = parsePlatereaderReader2(await file.text())
  if (!result) { alert('Could not parse platereader CSV. Expected semicolon- or comma-delimited file with well columns (A1–H12) and time in HH:MM:SS format.'); return }
  prKinetic.value = null
  prODMap.value = result
}

// Whatever the reader was, the result is one verdict per well: a phase plus the
// evidence behind it. Everything downstream — the preview grid, the tooltips, the
// import — reads this and no longer cares which instrument produced the file.
const prPhaseByWell = computed(() => {
  const map = {}
  if (prIsKinetic.value) {
    const a = kinAnalysis.value
    if (!a) return map
    for (const wellId of kinWellIds.value) {
      const cls = kinClassOf(wellId)
      map[wellId] = { phase: kinPhaseOf(cls), cls, kin: a.wells[wellId], manual: !!kinOverrides.value[wellId] }
    }
    return map
  }
  for (const [wellId, odData] of Object.entries(prODMap.value || {})) {
    map[wellId] = { phase: odToPhase(odData.maxOD, odData.minAfterPeak), odData }
  }
  return map
})

const prHasData = computed(() => Object.keys(prPhaseByWell.value).length > 0)
const prWellCount = computed(() => Object.keys(prPhaseByWell.value).length)

const prPreviewItems = computed(() => {
  const byWell = prPhaseByWell.value
  if (!prHasData.value) return []

  // ── Plate-based mapping: concentrations come from the wellplate, phase from the run ──
  if (prLinkedPlate.value) {
    const wellData = prWellData.value
    const sidToExp = prSampleIdToExp.value
    return Object.entries(byWell)
      .map(([wellId, res]) => {
        const wd = wellData[wellId]
        if (!wd) return null
        const exp = sidToExp[String(wd.sampleId)]
        if (prMapSource.value === 'untested' && exp && exp.phase !== -1) return null
        return { wellId, wd, exp: exp || null, ...res, newPhase: res.phase }
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
    const res = byWell[wellId]
    if (!res) return null
    return { wellId, exp, ...res, newPhase: res.phase }
  }).filter(Boolean)
})

const prWellLookup = computed(() => {
  const map = {}; for (const item of prPreviewItems.value) map[item.wellId] = item; return map
})

const prWellStyle = (row, col) => {
  const wellId = `${row}${col}`
  const item = prWellLookup.value[wellId]
  const clickable = prIsKinetic.value && !!kinAnalysis.value?.wells[wellId]
  const base = item
    ? { background: getPhaseColor(item.newPhase, 0.4), borderColor: getPhaseColor(item.newPhase, 1) }
    : { background: 'transparent', borderColor: 'var(--border-color,#e2e8f0)' }
  // A hand-set well wears a heavier ring: the thresholds no longer speak for it.
  if (item?.manual) { base.borderWidth = '2px'; base.boxShadow = '0 0 0 1px rgba(15,23,42,0.35)' }
  base.cursor = clickable ? 'pointer' : 'default'
  return base
}

// Clicking a well in the compact preview jumps straight to its curve.
const openWellCurve = (wellId) => {
  if (!prIsKinetic.value || !kinAnalysis.value?.wells[wellId]) return
  kinSelected.value = wellId
  kinOverlayAll.value = false
  openKinReview()
}

const prWellTooltip = (row, col) => {
  const item = prWellLookup.value[`${row}${col}`]
  if (!item) return `${row}${col} — no data`
  const sid = item.wd?.sampleId ?? item.exp?.sampleId ?? '?'
  const conc = item.wd ? `A: ${item.wd.anion} · B: ${item.wd.cation} · C: ${item.wd.salt} mM` : ''
  const status = item.exp ? (item.exp.phase === -1 ? 'untested' : phaseLabel(item.exp.phase)) : 'new'
  const lines = [`${row}${col} · Sample ${sid} (${status})`, conc]
  if (item.kin) {
    const k = item.kin
    lines.push(`Peak OD ${k.peak.toFixed(4)} over a ${k.baseline.toFixed(4)} baseline`)
    if (k.onsetMin !== null) lines.push(`Onset ${formatMinutes(k.onsetMin)}`)
    if (k.dissolvedMin !== null) lines.push(`${k.lateDissolution ? 'Dissolved (past the limit)' : 'Dissolved'} ${formatMinutes(k.dissolvedMin)}`)
    if (k.lifetimeMin !== null) lines.push(`Lifetime ${formatMinutes(k.lifetimeMin)}`)
    if (k.startsHigh) lines.push('⚠ already turbid at the first reading')
    if (item.manual) lines.push('✋ set by hand')
  } else if (item.odData) {
    const od = item.odData
    lines.push(`Max OD = ${od.maxOD?.toFixed(4) ?? '?'}`)
    if (prDissolutionEnabled.value && od.minAfterPeak <= prDissolutionThreshold.value) {
      lines.push(`⬇ Dissolved (min after peak: ${od.minAfterPeak.toFixed(4)})`)
    }
  }
  lines.push(`→ ${phaseLabel(item.newPhase)}`)
  return lines.filter(Boolean).join('\n')
}

const prStatsText = computed(() => {
  const items = prPreviewItems.value
  if (!items.length) return 'No wells matched. Check the plate has AI Target cells.'
  const newCount = items.filter(i => !i.exp).length
  const updateCount = items.length - newCount
  const phaseCounts = {}
  for (const { newPhase } of items) {
    const n = phaseLabel(newPhase)
    phaseCounts[n] = (phaseCounts[n] || 0) + 1
  }
  const phaseStr = Object.entries(phaseCounts).map(([n, c]) => `${c}× ${n}`).join(' · ')
  const actionStr = [newCount && `${newCount} new`, updateCount && `${updateCount} update`].filter(Boolean).join(', ')
  return `${phaseStr}  ·  ${actionStr}`
})

// Round-trip the evidence, not the raw trace: a phase point in the ledger should
// still be able to say why it is that phase months later, but 96 × 481 readings
// do not belong in every saved dataset.
// Why this point is the phase it is, for the hover in the ledger.
const kinReceiptText = (k) => {
  if (!k) return ''
  const cls = classMeta(k.cls)
  const lines = [cls ? `${cls.label}${k.manual ? ' — set by hand' : ''}` : 'Set by hand, over the plate-reader call']
  if (k.peak != null) lines.push(`Peak OD ${k.peak} over ${k.baseline} baseline`)
  if (k.onsetMin != null) lines.push(`Onset ${formatMinutes(k.onsetMin)}`)
  if (k.dissolvedMin != null) lines.push(`Dissolved ${formatMinutes(k.dissolvedMin)}`)
  if (k.lifetimeMin != null) lines.push(`Lifetime ${formatMinutes(k.lifetimeMin)}`)
  if (k.startsHigh) lines.push('⚠ already turbid at the first reading')
  if (k.source) lines.push(`${k.source}${k.channel ? ` · ${k.channel}` : ''}`)
  return lines.join('\n')
}

const kinReceipt = (item) => {
  if (!item.kin) return null
  const k = item.kin
  const r = (v, d = 4) => (v === null || v === undefined || !isFinite(v) ? null : Number(v.toFixed(d)))
  return {
    cls: item.cls,
    manual: !!item.manual,
    phase: item.newPhase,
    peak: r(k.peak), baseline: r(k.baseline),
    onsetMin: r(k.onsetMin, 1), dissolvedMin: r(k.dissolvedMin, 1), lifetimeMin: r(k.lifetimeMin, 1),
    startsHigh: !!k.startsHigh,
    source: prKinFileName.value || null,
    channel: kinChannel.value?.label || null,
  }
}

const importPlatereaderResults = () => {
  const items = prPreviewItems.value
  if (!items.length) return
  let updated = 0, created = 0

  for (const item of items) {
    const { exp, wd, newPhase } = item
    const kin = kinReceipt(item)
    if (exp) {
      // Experiment already in the workspace — update its phase in-place.
      const target = experiments.value.find(e => e === exp || e.sampleId === exp.sampleId)
      if (target) { target.phase = newPhase; if (kin) target.kin = kin; updated++ }
    } else if (wd) {
      // Experiment was never logged — create it now from wellplate concentrations.
      experiments.value.push({
        sampleId: wd.sampleId,
        anion: wd.anion, cation: wd.cation, salt: wd.salt,
        compD: wd.compD || 0, phase: newPhase,
        ...(kin ? { kin } : {}),
      })
      created++
    }
  }

  // Name the phase slots after the classes that just filled them, so the map,
  // the legend and the ledger dropdown all read as coacervation outcomes.
  if (prIsKinetic.value && kinRenamePhases.value) {
    const labels = { ...(config.value.phaseLabels || {}) }
    for (const c of KINETIC_CLASSES) labels[kinPhaseOf(c.key)] = c.label
    config.value.phaseLabels = labels
  }

  renderPlot()

  // The run stays loaded. Applying is not the end of looking at a plate: a class
  // is worth arguing with after the map has been seen, and the traces are the
  // argument. Re-applying with different thresholds updates the same points, so
  // the filter moves off "skip already-classified" once there is something to
  // update — otherwise the second apply would silently do nothing.
  if ((updated || created) && prMapSource.value === 'untested') prMapSource.value = 'all'

  const msg = [updated && `${updated} updated`, created && `${created} created`].filter(Boolean).join(', ') || 'no changes'

  // Landing the data in the ledger and nowhere visible on the map reads as a
  // failed import, so offer the fix at the moment it matters rather than leaving
  // the user to find the ranges themselves.
  const issues = searchSpaceIssues.value
  if (issues.length) {
    const detail = issues.map(o => '· ' + searchSpaceIssueText(o)).join('\n')
    if (confirm(`Platereader import complete: ${msg}.\n\nThe phase map draws the search space, and this data does not sit in it:\n\n${detail}\n\nFit the search space to the data now?`)) {
      fitSearchSpaceToData({ silent: true })
    }
    return
  }
  alert(`Platereader import complete: ${msg}. Click Save to persist to the active dataset.`
    + `\n\nThe run stays loaded — reopen "Review curves & thresholds" any time, and apply again to push a changed classification to these same points.`)
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
  // The components are labelled A/B/C in the UI; the older anion/cation/salt headers
  // stay accepted so CSVs exported before the rename still import.
  let idxA = headers.findIndex(h => h === 'a' || h === 'anion');
  let idxB = headers.findIndex(h => h === 'b' || h === 'cation');
  let idxC = headers.findIndex(h => h === 'c' || h === 'salt');
  let idxD = headers.findIndex(h => h === 'd' || h === 'compd');
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
    alert('No valid rows found in the CSV. Check that columns A, B, C and Phase exist.');
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

// The D levels the exported slider steps through — see sliceLevels for why the
// screened values win over an even sweep whenever there are few enough of them.
const exportDLevels = () => sliceLevels(
  [...experiments.value, ...suggestions.value].map(e => e.compD ?? 0),
  { min: config.value.compDMin, max: config.value.compDMax, fallback: currentDSlice.value }
)

const exportPlot = () => {
  const gridView = mapView.value === 'grid'
  const liveDiv = document.getElementById(gridView ? 'phase-slice-grid' : 'phase-ternary-plot')
  if (!liveDiv || !liveDiv.data) { alert('Nothing to export — generate the phase map first.'); return; }

  const date = new Date().toISOString().split('T')[0];
  const filename = `PhaseMap_${date}`;

  // A slider only earns its place in the 3D export. The slice grid already has
  // every D level side by side on one screen — that is the whole point of it —
  // so there it exports exactly what is being looked at.
  const sliced = !gridView && config.value.enableCompD
  const levels = sliced ? exportDLevels() : []
  const frames = sliced
    ? levels.map(v => buildSceneTraces(v, { keepEmpty: true }))
    : [liveDiv.data]
  const staticTraces = sliced ? buildBoundaryTraces() : []
  const layout = sliced ? buildSceneLayout() : liveDiv.layout

  // Open on the slice that is on screen, so the file starts where the export was
  // asked for rather than at whichever level happens to sort first.
  let startIndex = 0
  if (sliced && levels.length) {
    let best = Infinity
    levels.forEach((v, i) => {
      const d = Math.abs(v - Number(currentDSlice.value))
      if (d < best) { best = d; startIndex = i }
    })
  }

  const html = buildExportHtml({
    title: filename,
    frames,
    staticTraces,
    layout,
    levels,
    startIndex,
    unit: config.value.compDUnit || '',
    tolerance: sliced ? (Number(config.value.compDStep) || 0) / 2 : 0,
    sliderLabel: config.value.compDName || 'Component D',
    gridView,
  })

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
  suggestionNotes.value = []

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

    // A 4xx/5xx is the engine talking, not a dead server — show what it said.
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      const err = new Error(body?.error || `Engine returned HTTP ${response.status}. A very fine step over a wide range can exceed its memory — try a coarser step.`)
      err.fromEngine = true
      throw err
    }

    const data = await response.json();
    const stats = { clamped: 0 }
    const asked = config.value.numSuggestions || 96
    const linked = data.suggestions.map(s => applyDependencies({ ...s }, stats))

    // Links can map several engine picks onto the same well; keep one of each so the
    // plate does not silently fill with unintended replicates.
    const seen = new Set()
    const unique = linked.filter(s => {
      const key = COMP_KEYS.map(k => Number(s[k] ?? 0).toFixed(6)).join('|')
      if (seen.has(key)) return false
      seen.add(key); return true
    })
    // Safety net: the engine already excludes wells that cannot be mixed in the target
    // volume, but a link applied here could push one over. An overfilled well has the
    // wrong concentrations in it, so it is dropped rather than suggested.
    const fits = unique.filter(s => wellVolumeFraction(s) <= 1 + 1e-9)
    const overfilled = unique.length - fits.length
    fits.forEach((s, i) => { s.sampleId = nextStartId + i })
    suggestions.value = fits

    const notes = (data.warnings || []).map(w => w.message)
    if (linked.length - unique.length > 0) notes.push(`${linked.length - unique.length} duplicate well(s) removed after applying the links`)
    if (overfilled > 0) notes.push(`${overfilled} well(s) dropped: a link pushed them past the ${config.value.targetVolume} µL well volume`)
    if (stats.clamped > 0) notes.push(`${stats.clamped} linked value(s) pulled back into their component's min/max`)
    if (fits.length < asked && !(data.warnings || []).some(w => w.axis === 'count')) {
      notes.push(`${fits.length} of ${asked} requested wells available`)
    }
    suggestionNotes.value = notes

  } catch (err) {
    console.error("Active Learning Engine failed:", err);
    alert(err?.fromEngine
      ? err.message
      : "Could not reach the Python Active Learning engine. Ensure the backend is running.");
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
/* flex-shrink:0 — the segmented control has no room to give; without it the label
   text inside gets clipped by the wrapper's overflow:hidden when the row is tight. */
.color-mode-toggle { display: inline-flex; flex-shrink: 0; border: 1px solid var(--border-color, #cbd5e1); border-radius: 6px; overflow: hidden; }
.color-mode-toggle button { background: transparent; border: none; padding: 3px 9px; font-size: 0.72rem; cursor: pointer; color: inherit; opacity: 0.7; display: flex; align-items: center; gap: 4px; white-space: nowrap; }
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
/* The letter a component sits on — a picker, because the allocation is a choice
   and an imported plate does not always guess it right. */
.slot-select { display: inline-block; font-size: 0.78rem; font-weight: 700; text-transform: none; letter-spacing: 0; background: rgba(139, 92, 246, 0.14); color: #8b5cf6; border: 1px solid rgba(139, 92, 246, 0.35); border-radius: 3px; padding: 1px 2px 1px 4px; margin-left: 4px; cursor: pointer; width: auto; outline: none; vertical-align: middle; }
.slot-select option { text-transform: none; color: var(--text); background: var(--surface); font-weight: 600; }

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
.na-locked { display: inline-flex; align-items: center; gap: 4px; font-size: 0.76rem; font-weight: 600; color: var(--acc, #2563eb); font-variant-numeric: tabular-nums; }
.na-locked i { font-size: 0.62rem; opacity: 0.7; }

/* Saved conditions toolbar + dialog */
.cond-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 4px 0 14px; }
.cond-blabel { font-size: 0.78rem; font-weight: 700; opacity: 0.6; display: inline-flex; align-items: center; gap: 6px; }
.cond-select { min-width: 180px; padding: 5px 8px; font-size: 0.8rem; border: 1px solid var(--border-color, #cbd5e1); border-radius: 6px; background: var(--fl, transparent); color: inherit; }
.cond-btn { display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; padding: 6px 12px; border: none; border-radius: 6px; background: var(--acc, #2563eb); color: #fff; cursor: pointer; box-shadow: none; }
.cond-btn.ghost { background: var(--fl, #eef2f7); color: var(--tx2, #64748b); }
.cond-modal { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 16px; }
.cond-dialog { background: var(--modal, #fff); border: 1px solid var(--cdl, #e2e8f0); border-radius: var(--r, 14px); box-shadow: var(--sh, 0 10px 40px rgba(0,0,0,.2)); width: 100%; max-width: 400px; padding: 16px; color: var(--tx, inherit); }
.cond-dhead { display: flex; align-items: center; justify-content: space-between; font-weight: 600; margin-bottom: 14px; }
.cond-x { width: 28px; height: 28px; border-radius: 50%; background: var(--fl, #eef2f7); color: var(--tx2, #64748b); border: none; cursor: pointer; box-shadow: none; }
.cond-f { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; font-size: 0.8rem; }
.cond-f > span { font-size: 0.72rem; font-weight: 600; opacity: 0.7; }
.cond-f input { padding: 7px 9px; border: 1px solid var(--border-color, #cbd5e1); border-radius: 6px; background: var(--fl, transparent); color: inherit; }
.cond-dfoot { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.cond-msg { font-size: 0.76rem; color: var(--wr, #dc2626); }
.cond-note { font-size: 0.72rem; opacity: 0.7; margin: 0 0 12px; display: flex; gap: 6px; align-items: baseline; }

/* Kinetics review dialog */
.kin-modal { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 16px; }
.kin-dialog { background: var(--modal, #fff); border: 1px solid var(--cdl, #e2e8f0); border-radius: var(--r, 14px); box-shadow: var(--sh, 0 10px 40px rgba(0,0,0,.25)); width: 100%; max-width: 1120px; max-height: 92vh; padding: 14px 16px; color: var(--tx, inherit); display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
.kin-head { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 0.92rem; }
.kin-head .cond-x { margin-left: auto; }
.kin-sub { font-size: 0.72rem; opacity: 0.6; font-weight: 400; }

.kin-controls { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 8px 10px; border: 1px solid var(--cdl, #e2e8f0); border-radius: 8px; font-size: 0.75rem; }
.kin-ctl { display: flex; align-items: center; gap: 5px; }
.kin-ctl > label { font-weight: 700; opacity: 0.75; }
.kin-ctl select { font-size: 0.75rem; padding: 2px 4px; border: 1px solid var(--cdl, #cbd5e1); border-radius: 4px; background: transparent; color: inherit; }
.kin-ctl input[type=number] { width: 62px; font-size: 0.75rem; padding: 2px 4px; border: 1px solid var(--cdl, #cbd5e1); border-radius: 4px; background: transparent; color: inherit; }
.kin-unit { opacity: 0.6; }

.kin-body { display: grid; grid-template-columns: minmax(260px, 0.9fr) 1.35fr; gap: 14px; align-items: start; }
@media (max-width: 900px) { .kin-body { grid-template-columns: 1fr; } }

.kin-plate-col { display: flex; flex-direction: column; gap: 8px; }
.kin-plate { background: #0f172a; border-radius: 10px; padding: 10px 8px; display: flex; flex-direction: column; gap: 2px; }
.kin-prow { display: flex; gap: 2px; align-items: center; }
.kin-rlabel { width: 14px; color: #94a3b8; font-size: 0.6rem; font-weight: 800; text-align: center; flex: none; }
.kin-clabel { flex: 1; text-align: center; color: #94a3b8; font-size: 0.55rem; font-weight: 700; min-width: 0; }
.kin-well { flex: 1; aspect-ratio: 1; min-width: 0; border-radius: 50%; border: 1px solid #334155; transition: transform .1s; }
.kin-well:hover { transform: scale(1.18); }
.kin-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 0.72rem; }
.kin-legend > span { display: inline-flex; align-items: center; gap: 5px; }
.kin-dot { width: 10px; height: 10px; border-radius: 3px; border-width: 1px; border-style: solid; display: inline-block; }
.kin-manual-note { opacity: 0.75; }
.kin-linkbtn { background: none; border: none; color: var(--acc, #2563eb); font-size: 0.72rem; cursor: pointer; padding: 0 2px; text-decoration: underline; box-shadow: none; }

.kin-plot-col { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.kin-plot-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.kin-plot { height: 250px; background: #000; border-radius: 8px; border: 1px solid var(--cdl, #e2e8f0); }
.kin-metrics { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
@media (max-width: 700px) { .kin-metrics { grid-template-columns: repeat(3, 1fr); } }
.kin-metrics > div { display: flex; flex-direction: column; gap: 1px; padding: 5px 7px; background: var(--fl, #f1f5f9); border-radius: 6px; }
.kin-metrics span { font-size: 0.62rem; opacity: 0.6; text-transform: none; }
.kin-metrics strong { font-size: 0.8rem; font-variant-numeric: tabular-nums; }
.kin-warn { margin: 0; font-size: 0.72rem; line-height: 1.45; padding: 6px 9px; border-radius: 6px; border: 1px solid rgba(217,119,6,0.4); background: rgba(217,119,6,0.08); display: flex; gap: 7px; align-items: baseline; }
.kin-override { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 0.75rem; }
.kin-cbtn { font-size: 0.72rem; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--cdl, #cbd5e1); background: transparent; color: inherit; cursor: pointer; box-shadow: none; }
.kin-cbtn.active { font-weight: 700; }

.kin-table-wrap { max-height: 210px; overflow-y: auto; border: 1px solid var(--cdl, #e2e8f0); border-radius: 8px; }
.kin-table { width: 100%; border-collapse: collapse; font-size: 0.74rem; }
.kin-table th, .kin-table td { padding: 4px 8px; text-align: left; border-bottom: 1px solid var(--ln, #f1f5f9); white-space: nowrap; }
.kin-table th { position: sticky; top: 0; background: var(--surface-solid, #f8fafc); font-weight: 700; z-index: 2; }
.kin-table tbody tr { cursor: pointer; }
.kin-table tbody tr:hover { background: rgba(59,130,246,0.08); }
.kin-table tbody tr.sel { background: rgba(59,130,246,0.16); }
.kin-sortable { cursor: pointer; }
.kin-sortable.on { color: var(--acc, #2563eb); }
.kin-flag { color: #d97706; font-size: 0.6rem; margin-left: 4px; }
.kin-cls-select { font-size: 0.7rem; padding: 1px 3px; border-width: 1px; border-style: solid; border-radius: 4px; color: inherit; }

.kin-foot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.kin-map { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 0.73rem; }
.kin-mapitem { display: inline-flex; align-items: center; gap: 4px; }
.kin-mapitem select { font-size: 0.72rem; padding: 1px 3px; border: 1px solid var(--cdl, #cbd5e1); border-radius: 4px; background: transparent; color: inherit; }
.kin-clash { font-size: 0.72rem; color: #d97706; }
</style>