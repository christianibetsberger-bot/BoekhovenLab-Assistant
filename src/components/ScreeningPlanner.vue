<script setup>
import { ref } from 'vue'
import { useLabStore } from '../stores/labStore'
import { concentrationRatio, compatibleUnits, dimsCompatible, defaultUnitForDim, CONC_UNITS } from '../utils/units.js'
import { esc } from '../utils/htmlSafe'

const store = useLabStore()
const activeDropdown = ref(null)
const showCloudLibrary = ref(false)

// --- Unit helpers ---
const targetUnitsForComp = (comp) => {
    if (!comp.invId) return CONC_UNITS
    const inv = store.inventory.find(i => i.id === comp.invId)
    if (!inv) return CONC_UNITS
    const compat = compatibleUnits(inv.stockUnit || 'µM').filter(u => CONC_UNITS.includes(u))
    if (comp.targetUnit && !compat.includes(comp.targetUnit)) return [comp.targetUnit, ...compat]
    return compat
}

const isCompUnitMismatch = (comp) => {
    if (!comp.invId || comp.inputType === 'vol') return false
    const inv = store.inventory.find(i => i.id === comp.invId)
    if (!inv) return false
    return !dimsCompatible(comp.targetUnit || 'µM', inv.stockUnit || 'µM')
}

const selectCompItem = (comp, inv) => {
    comp.invId = inv.id
    if (!dimsCompatible(comp.targetUnit || 'µM', inv.stockUnit || 'µM')) {
        comp.targetUnit = defaultUnitForDim(inv.stockUnit || 'µM')
    }
}

const getInvName = (id) => {
    const inv = store.inventory.find(i => i.id === id);
    if (inv) return `[${inv.code}] ${inv.name} (${store.formatNum(inv.stock)} ${inv.stockUnit || 'µM'})`;
    return 'Select...';
}

const filterBlockInventory = (query, scope) => {
    const term = query ? query.toLowerCase() : '';
    const targetScope = scope || 'Global';
    return store.inventory.filter(item => 
        (item.scope === targetScope || (!item.scope && targetScope === 'Global')) &&
        ((!term) || (item.name && item.name.toLowerCase().includes(term)) || (item.code && item.code.toLowerCase().includes(term)) || (item.cas && item.cas.toLowerCase().includes(term)))
    );
}

const getPlateRows = (format) => { if (format === 'ibidi') return 3; if (format === 'pcr8') return 1; return format === 384 ? 16 : (format === 48 ? 6 : (format === 24 ? 4 : 8)); }
const getPlateCols = (format) => { if (format === 'ibidi') return 6; if (format === 'pcr8') return 8; return format === 384 ? 24 : (format === 48 ? 8 : (format === 24 ? 6 : 12)); }
const getWellId = (r, c) => { return String.fromCharCode(65 + r) + (c + 1); }

// --- Screening Logic ---
const addReverseMatrix = () => {
    store.reverseMatrices.unshift({
        id: crypto.randomUUID(),
        name: 'New Screening', 
        targetVolume: 30, 
        targetVolumeUnit: 'µL',
        rows: 8, 
        cols: 12, 
        components: [], 
        activeComponentId: null, 
        targetPlateId: '', 
        targetStartWell: 'A1',
        scope: 'Personal',
        owner_id: store.user.id
    })
    store.saveWorkspaceState();
}

const loadFromCloud = (cloudRM) => {
    const alreadyOpen = store.reverseMatrices.find(m => m.id === cloudRM.id);
    if (!alreadyOpen) {
        store.reverseMatrices.unshift(JSON.parse(JSON.stringify(cloudRM)));
    }
    showCloudLibrary.value = false;
    store.saveWorkspaceState();
}

const closePlanInWorkspace = (index) => {
    store.reverseMatrices.splice(index, 1);
    store.saveWorkspaceState();
}

// Fixed: Added persistence
const removeReverseMatrix = (index) => { 
    store.reverseMatrices.splice(index, 1); 
    store.saveWorkspaceState();
}

const archiveReverseMatrix = async (index) => {
    if(confirm("Archive this screening?")) {
        const item = store.reverseMatrices.splice(index, 1)[0];
        item.scope = 'Archived';
        store.archivedReverseMatrices.push(item);
        await store.saveToCloud('screenings', item);
    }
}

// Fixed: Added persistence because duplicating adds a new item to screen
const duplicateReverseMatrix = (index) => {
    const copy = JSON.parse(JSON.stringify(store.reverseMatrices[index]));
    copy.id = crypto.randomUUID();
    copy.name += ' (Copy)';
    copy.scope = 'Personal';
    copy.owner_id = store.user.id;
    store.reverseMatrices.splice(index + 1, 0, copy);
    store.saveWorkspaceState();
}

const addReverseMatrixComponent = (rm) => {
    rm.components.push({ 
        id: 'rmc_' + crypto.randomUUID(), invId: '', searchQuery: '', searchScope: 'Global',
        inputType: 'conc', targetUnit: 'µM', labware: '', grid: {},
        quickRow: '', quickRowVal: null, quickCol: '', quickColVal: null,
        gradDir: 'none', gradIndex: '', gradStart: null, gradEnd: null, gradStep: null
    }); 
    if(!rm.activeComponentId) rm.activeComponentId = rm.components[0].id;
}

// --- Grid Tools ---
const fillRmRow = (rm, comp) => {
    if (!comp.quickRow || comp.quickRowVal === undefined || comp.quickRowVal === null) return;
    const r = comp.quickRow - 1;
    for (let c = 0; c < rm.cols; c++) comp.grid[r + '_' + c] = comp.quickRowVal;
}
const fillRmCol = (rm, comp) => {
    if (!comp.quickCol || comp.quickColVal === undefined || comp.quickColVal === null) return;
    const c = comp.quickCol - 1;
    for (let r = 0; r < rm.rows; r++) comp.grid[r + '_' + c] = comp.quickColVal;
}
const clearRmGrid = (rm, comp) => {
    if(confirm('Clear all concentrations for this component?')) {
        for (let key in comp.grid) comp.grid[key] = null;
    }
}
const applyRmGradient = (rm, comp) => {
    if (comp.gradStart === undefined || comp.gradStart === null || comp.gradStart === '') return;
    if ((comp.gradEnd === undefined || comp.gradEnd === null || comp.gradEnd === '') && (comp.gradStep === undefined || comp.gradStep === null || comp.gradStep === '')) return;

    const dir = comp.gradDir || 'all_row';
    const startVal = Number(comp.gradStart);

    const getStepVal = (steps) => {
        if (comp.gradStep !== null && comp.gradStep !== undefined && comp.gradStep !== '') return Number(comp.gradStep);
        const endVal = Number(comp.gradEnd);
        return steps > 0 ? (endVal - startVal) / steps : 0;
    };

    if (dir === 'row') {
        if (!comp.gradIndex) return;
        const r = comp.gradIndex - 1; const stepVal = getStepVal(rm.cols - 1);
        for (let c = 0; c < rm.cols; c++) comp.grid[r + '_' + c] = parseFloat((startVal + (stepVal * c)).toFixed(4));
    } else if (dir === 'col') {
        if (!comp.gradIndex) return;
        const c = comp.gradIndex - 1; const stepVal = getStepVal(rm.rows - 1);
        for (let r = 0; r < rm.rows; r++) comp.grid[r + '_' + c] = parseFloat((startVal + (stepVal * r)).toFixed(4));
    } else if (dir === 'all_row') {
        const stepVal = getStepVal(rm.cols - 1);
        for (let r = 0; r < rm.rows; r++) {
            for (let c = 0; c < rm.cols; c++) comp.grid[r + '_' + c] = parseFloat((startVal + (stepVal * c)).toFixed(4));
        }
    } else if (dir === 'all_col') {
        const stepVal = getStepVal(rm.rows - 1);
        for (let c = 0; c < rm.cols; c++) {
            for (let r = 0; r < rm.rows; r++) comp.grid[r + '_' + c] = parseFloat((startVal + (stepVal * r)).toFixed(4));
        }
    }
}

// --- Calculators & Exporters ---
const calcRMCellHTML = (rm, rIndex, cIndex) => {
    let htmlStr = "";
    let totalVol = 0;
    const unit = rm.targetVolumeUnit || 'µL';
    const tv = Number(rm.targetVolume);
    
    rm.components.forEach(comp => {
        const targetVal = Number(comp.grid[rIndex + '_' + cIndex] || 0);
        if (targetVal > 0 && comp.invId) {
            const invItem = store.inventory.find(i => i.id === comp.invId);
            if (invItem) {
                let v = 0; let displayTarget = '';
                if (comp.inputType === 'vol') {
                    v = targetVal; displayTarget = `${esc(targetVal)} ${esc(unit)} (Fixed)`;
                } else {
                    const ratio = concentrationRatio(targetVal, comp.targetUnit, Number(invItem.stock), invItem.stockUnit || 'µM');
                    if (ratio === null) {
                        htmlStr += `<span style="color: var(--danger); font-size: 0.85rem;"><i class="fas fa-triangle-exclamation"></i> ${esc(invItem.code)}: unit mismatch (stock: ${esc(invItem.stockUnit || 'µM')} vs target: ${esc(comp.targetUnit)})</span><br>`;
                        return;
                    }
                    v = ratio * tv;
                    displayTarget = `${esc(targetVal)} ${esc(comp.targetUnit)}`;
                }
                totalVol += v;
                htmlStr += `&nbsp;<span class="inv-ref" contenteditable="false" data-labware="${esc(comp.labware || '')}"><i class="fas fa-tag"></i>&nbsp;[${esc(invItem.code)}] ${esc(invItem.name)} (${esc(store.formatNum(invItem.stock))} ${esc(invItem.stockUnit || 'µM')})&nbsp;<i class="fas fa-times inv-ref-remove" style="cursor:pointer; margin-left:4px; opacity: 0.7;"></i></span>&nbsp; ${esc(store.formatNum(v))} ${esc(unit)} (${displayTarget})<br>`;
            }
        }
    });
    
    if (totalVol === 0) return "";
    const h2o = tv - totalVol;
    if (h2o < 0) return `<span class="error"><i class="fas fa-triangle-exclamation"></i> Exceeds Vol (${store.formatNum(totalVol)}${unit})</span><br>${htmlStr}`;
    
    htmlStr += `<div style="margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px;"><strong>MQ H₂O:</strong> <span style="color: var(--primary); font-weight: bold;">${store.formatNum(h2o)} ${unit}</span></div>`;
    return htmlStr;
}

const saveReverseMatrixToJournal = (rm) => {
    if (!store.journal.activeId) { alert("Please select an active journal entry first."); return; }
    const unit = rm.targetVolumeUnit || 'µL';
    const tv = Number(rm.targetVolume);
    let html = `<br><br><div style="border: 1px solid var(--border); padding: 15px; border-radius: var(--radius); background: var(--surface);">`;
    html += `<h3 style="margin-top: 0; color: var(--primary);"><i class="fas fa-table-cells-large"></i> Screening: ${esc(rm.name || 'Untitled')}</h3>`;
    html += `<div class="table-responsive"><table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left; border: 1px solid var(--border);">`;
    html += `<thead><tr><th style="border: 1px solid var(--border); background: var(--summary-bg); padding: 8px;">Well</th>`;

    rm.components.forEach(comp => {
        const name = comp.invId ? getInvName(comp.invId).split(' (')[0] : 'Unknown';
        const targetUnitLabel = comp.inputType === 'vol' ? unit : (comp.targetUnit || 'µM');
        html += `<th style="border: 1px solid var(--border); background: var(--summary-bg); padding: 8px;">${esc(name)} Target (${esc(targetUnitLabel)})</th>`;
        html += `<th style="border: 1px solid var(--border); background: var(--summary-bg); padding: 8px;">${esc(name)} Vol (${esc(unit)})</th>`;
    });
    html += `<th style="border: 1px solid var(--border); background: var(--summary-bg); padding: 8px;">MQ H₂O (${esc(unit)})</th></tr></thead><tbody>`;
    
    for (let r = 0; r < rm.rows; r++) {
        for (let c = 0; c < rm.cols; c++) {
            let cellHasContent = false;
            rm.components.forEach(comp => { if(Number(comp.grid[r + '_' + c]) > 0) cellHasContent = true; });
            
            if (cellHasContent) {
                const rowLabel = String.fromCharCode(65 + r);
                html += `<tr><td style="border: 1px solid var(--border); padding: 8px; font-weight: bold;">${rowLabel}${c+1}</td>`;
                let totalVol = 0;
                
                rm.components.forEach(comp => {
                    const targetVal = Number(comp.grid[r + '_' + c] || 0);
                    const invItem = store.inventory.find(i => i.id === comp.invId);
                    let v = 0;
                    if (targetVal > 0 && invItem) {
                        if (comp.inputType === 'vol') v = targetVal;
                        else {
                            const ratio = concentrationRatio(targetVal, comp.targetUnit, Number(invItem.stock), invItem.stockUnit || 'µM');
                            v = ratio !== null ? ratio * tv : 0;
                        }
                        totalVol += v;
                    }
                    html += `<td style="border: 1px solid var(--border); padding: 8px;">${targetVal > 0 ? targetVal : '-'}</td>`;
                    html += `<td style="border: 1px solid var(--border); padding: 8px; color: var(--primary);">${targetVal > 0 ? store.formatNum(v) : '-'}</td>`;
                });
                
                const h2o = tv - totalVol;
                html += `<td style="border: 1px solid var(--border); padding: 8px; font-weight: bold;">${h2o < 0 ? 'Error (Exceeds TV)' : store.formatNum(h2o)}</td></tr>`;
            }
        }
    }
    html += `</tbody></table></div></div><br>`;
    store.appendToActiveJournal(html);
    alert(`Successfully appended Screening to Lab Journal!`);
}

const saveReverseMatrixToPlate = (rm) => {
    if (!rm.targetPlateId || !rm.targetStartWell) { alert("Please select a target plate and starting well."); return; }
    const plate = store.wellPlates.find(p => p.id === rm.targetPlateId);
    if (!plate) return;
    const startWell = rm.targetStartWell.toUpperCase().trim();
    const match = startWell.match(/^([A-Z]+)(\d+)$/);
    if (!match) { alert("Invalid well format. Use A1, B2, etc."); return; }
    let startRow = match[1].charCodeAt(0) - 65; 
    let startCol = parseInt(match[2]) - 1;
    
    for (let r = 0; r < rm.rows; r++) {
        for (let c = 0; c < rm.cols; c++) {
            let targetR = startRow + r;
            let targetC = startCol + c;
            if (targetR < getPlateRows(plate.format) && targetC < getPlateCols(plate.format)) {
                let wId = getWellId(targetR, targetC);
                let cellHtml = calcRMCellHTML(rm, r, c);
                if (cellHtml) plate.wells[wId] = cellHtml;
            }
        }
    }
    alert(`Successfully sent screening to Plate: ${plate.name} starting at ${startWell}`);
}
</script>

<template>
  <div class="card">

    <div v-if="showCloudLibrary" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 2000;">
        <div style="background: var(--surface); padding: 25px; border-radius: var(--radius); border: 1px solid var(--border); max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
            <div class="flex-between" style="border-bottom: 2px solid var(--bg); padding-bottom: 10px; margin-bottom: 15px;">
                <h3 style="margin: 0; color: var(--primary);"><i class="fas fa-cloud"></i> Screening Library</h3>
                <button class="danger small" @click="showCloudLibrary = false"><i class="fas fa-times"></i></button>
            </div>

            <h4 style="margin-bottom: 10px; color: var(--success);"><i class="fas fa-globe"></i> Global Lab Feed</h4>
            <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 25px;">
                <div v-for="rm in store.cloudReverseMatrices.filter(m => m.scope === 'Global')" :key="'cloud_rmg_'+rm.id" style="display: flex; justify-content: space-between; align-items: center; background: var(--panel-bg); padding: 10px; border-radius: var(--radius); border: 1px solid var(--border);">
                    <div>
                        <strong style="font-size: 1.05rem;">{{ rm.name }}</strong>
                        <div style="font-size: 0.75rem; opacity: 0.7;">{{ rm.rows }}x{{ rm.cols }} Grid • {{ rm.components.length }} Components</div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button class="small" @click="loadFromCloud(rm)"><i class="fas fa-download"></i> Open</button>
                        <button v-if="rm.owner_id === store.user.id" class="danger small" @click="store.deleteFromCloud('screenings', rm.id)"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div v-if="store.cloudReverseMatrices.filter(m => m.scope === 'Global').length === 0" style="font-size: 0.85rem; opacity: 0.5; font-style: italic;">No global screenings published yet.</div>
            </div>

            <h4 style="margin-bottom: 10px;"><i class="fas fa-lock"></i> My Personal Drafts</h4>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div v-for="rm in store.cloudReverseMatrices.filter(m => m.scope === 'Personal')" :key="'cloud_rmp_'+rm.id" style="display: flex; justify-content: space-between; align-items: center; background: var(--panel-bg); padding: 10px; border-radius: var(--radius); border: 1px solid var(--border);">
                    <div>
                        <strong style="font-size: 1.05rem;">{{ rm.name }}</strong>
                        <div style="font-size: 0.75rem; opacity: 0.7;">{{ rm.rows }}x{{ rm.cols }} Grid • {{ rm.components.length }} Components</div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button class="small secondary" @click="loadFromCloud(rm)"><i class="fas fa-folder-open"></i> Open</button>
                        <button class="danger small" @click="store.deleteFromCloud('screenings', rm.id)"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div v-if="store.cloudReverseMatrices.filter(m => m.scope === 'Personal').length === 0" style="font-size: 0.85rem; opacity: 0.5; font-style: italic;">No personal drafts saved.</div>
            </div>
        </div>
    </div>

    <div class="flex-between" style="border-bottom: 2px solid var(--bg); padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between;">
        <h2 style="border: none; padding: 0; margin: 0;"><i class="fas fa-table-cells-large"></i> Screening</h2>
        <div style="display: flex; gap: 10px;">
            <button @click="showCloudLibrary = true" class="secondary small"><i class="fas fa-cloud"></i> Library</button>
            <button @click="addReverseMatrix" class="small"><i class="fas fa-plus"></i> New Screening</button>
        </div>
    </div>

    <div v-for="(rm, rmIndex) in store.reverseMatrices" :key="rm.id" style="background: var(--panel-bg); border: 1px solid var(--border); padding: 20px; border-radius: var(--radius); margin-bottom: 30px;">
        <div class="flex-between" style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end;">
            <div style="width: 45%; display: flex; gap: 15px; align-items: center;">
                <input type="text" v-model="rm.name" style="font-size: 1.2rem; font-weight: bold; flex-grow: 1; background: transparent; border: none; border-bottom: 2px solid var(--primary); padding-left: 0; color: var(--primary);" placeholder="Screening Name">
                <div class="input-group" style="margin-bottom: 0; min-width: 150px;">
                    <label style="font-size: 0.7rem; margin-bottom: 2px;">Target Vol / Well</label>
                    <div class="input-with-select">
                        <input type="number" v-model.number="rm.targetVolume" step="any" style="padding: 6px;">
                        <select v-model="rm.targetVolumeUnit" style="padding: 6px; font-size: 0.8rem; width: 60px;">
                            <option value="L">L</option><option value="mL">mL</option><option value="µL">µL</option><option value="nL">nL</option>
                        </select>
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 5px; align-items: center;">
                <span v-if="rm.scope === 'Global'" style="font-size: 0.75rem; color: var(--success); font-weight: bold; margin-right: 5px;"><i class="fas fa-globe"></i> Global</span>
                <span v-else style="font-size: 0.75rem; opacity: 0.7; font-weight: bold; margin-right: 5px;"><i class="fas fa-lock"></i> Personal</span>

                <button class="success small" @click="store.saveToCloud('screenings', rm)" title="Save to Cloud"><i class="fas fa-cloud-arrow-up"></i> Save</button>
                
                <template v-if="rm.owner_id === store.user.id">
                    <button v-if="rm.scope !== 'Global'" class="secondary small" @click="rm.scope = 'Global'; store.saveToCloud('screenings', rm)" title="Make Global"><i class="fas fa-bullhorn"></i> Publish</button>
                    <button v-else class="secondary small" @click="rm.scope = 'Personal'; store.saveToCloud('screenings', rm)" title="Make Private"><i class="fas fa-user-lock"></i> Private</button>
                </template>
                
                <div style="width: 1px; height: 24px; background: var(--border); margin: 0 5px;"></div>
                <button class="small" @click="saveReverseMatrixToJournal(rm)"><i class="fas fa-file-import"></i> Log</button>
                <button class="secondary small" @click="duplicateReverseMatrix(rmIndex)"><i class="fas fa-copy"></i></button>
                <button class="secondary small" @click="archiveReverseMatrix(rmIndex)" title="Local Archive"><i class="fas fa-box-archive"></i></button>
                <button class="danger small" @click="closePlanInWorkspace(rmIndex)" title="Remove from screen only"><i class="fas fa-times"></i></button>
            </div>
            </div>

        <div style="background: var(--surface); padding: 15px; border: 1px solid var(--border); margin-bottom: 20px; border-radius: var(--radius); overflow: visible; min-height: 250px;">
            <h3><i class="fas fa-vial"></i> 1. Select Reference Stocks</h3>
            <div v-for="(comp, cIdx) in rm.components" :key="comp.id" style="display: flex; gap: 10px; margin-bottom: 8px; align-items: flex-end;">
                <div style="flex-grow: 1; position: relative;" @click.stop>
                    <div @click="activeDropdown = activeDropdown === 'rm_comp_' + rmIndex + '_' + cIdx ? null : 'rm_comp_' + rmIndex + '_' + cIdx" style="border: 1px solid var(--border); padding: 6px; background: var(--input-bg); cursor: pointer; border-radius: var(--radius); font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center; min-height: 32px;">
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ comp.invId ? getInvName(comp.invId) : 'Select Stock...' }}</span>
                        <i class="fas fa-chevron-down" style="opacity: 0.5;"></i>
                    </div>
                    <div v-if="activeDropdown === 'rm_comp_' + rmIndex + '_' + cIdx" style="position: absolute; top: 100%; left: 0; z-index: 1000; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: var(--radius); width: 100%; min-width: 250px; display: flex; flex-direction: column;">
                        <div style="display: flex; gap: 5px; padding: 5px; border-bottom: 1px solid var(--border);">
                            <label class="checkbox-label" style="font-weight: bold; font-size: 0.75rem;"><input type="radio" value="Global" v-model="comp.searchScope"> Global</label>
                            <label class="checkbox-label" style="font-weight: bold; font-size: 0.75rem;"><input type="radio" value="Personal" v-model="comp.searchScope"> Personal</label>
                        </div>
                        <input type="text" v-model="comp.searchQuery" placeholder="Search inventory..." style="margin: 5px; width: calc(100% - 10px); padding: 4px; border: 1px solid var(--border); border-radius: var(--radius);" @click.stop>
                        <div style="overflow-y: auto; max-height: 180px;">
                            <div v-for="inv in filterBlockInventory(comp.searchQuery, comp.searchScope)" :key="inv.id" @mousedown.prevent="selectCompItem(comp, inv); activeDropdown = null" style="padding: 6px 10px; cursor: pointer; font-size: 0.8rem; border-bottom: 1px solid var(--bg);" onmouseover="this.style.background='var(--summary-bg)'" onmouseout="this.style.background='transparent'">
                                [{{ inv.code }}] {{ inv.name }} ({{store.formatNum(inv.stock)}} {{inv.stockUnit || 'µM'}})
                            </div>
                        </div>
                    </div>
                </div>
                <div class="input-group" style="margin-bottom: 0;">
                    <label style="font-size: 0.7rem; margin-bottom: 2px;">Source Labware</label>
                    <select v-model="comp.labware" style="padding: 6px; font-size: 0.75rem; height: 32px; width: 130px; border-radius: var(--radius); border: 1px solid var(--border);">
                        <option value="">Default (0.5mL)</option>
                        <option v-for="lw in store.sourceLabwares" :value="lw.uuid" :key="lw.uuid">{{ lw.name }}</option>
                    </select>
                </div>
                <div class="input-group" style="margin-bottom: 0;">
                    <label style="font-size: 0.7rem; margin-bottom: 2px;">Input</label>
                    <select v-model="comp.inputType" style="padding: 6px; font-size: 0.8rem; height: 32px; width: 90px;">
                        <option value="conc">Target Conc</option><option value="vol">Fixed Vol</option>
                    </select>
                </div>
                <div class="input-group" style="margin-bottom: 0;" v-if="comp.inputType !== 'vol'">
                    <label style="font-size: 0.7rem; margin-bottom: 2px;">Target Unit</label>
                    <select v-model="comp.targetUnit" style="padding: 6px; font-size: 0.8rem; height: 32px; width: 80px;" :style="isCompUnitMismatch(comp) ? 'border-color: var(--danger);' : ''">
                        <option v-for="u in targetUnitsForComp(comp)" :key="u" :value="u">{{ u }}</option>
                    </select>
                    <div v-if="isCompUnitMismatch(comp)" style="font-size: 0.65rem; color: var(--danger); margin-top: 2px; white-space: nowrap;"><i class="fas fa-triangle-exclamation"></i> Mismatch</div>
                </div>
                <div class="input-group" style="margin-bottom: 0;" v-else>
                    <label style="font-size: 0.7rem; margin-bottom: 2px;">Unit</label>
                    <div style="padding: 6px; font-size: 0.8rem; height: 32px; width: 80px; display: flex; align-items: center; border: 1px solid var(--border); background: var(--summary-bg); border-radius: var(--radius); opacity: 0.7;">{{ rm.targetVolumeUnit || 'µL' }}</div>
                </div>
                <button class="danger small" style="height: 32px;" @click="rm.components.splice(cIdx, 1); if(rm.activeComponentId === comp.id) rm.activeComponentId = null;"><i class="fas fa-times"></i></button>
            </div>
            <button class="small" @click="addReverseMatrixComponent(rm)" style="margin-top: 10px;"><i class="fas fa-plus"></i> Add Component</button>
        </div>

        <div style="background: var(--surface); padding: 15px; border: 1px solid var(--border); margin-bottom: 20px; border-radius: var(--radius);">
            <h3><i class="fas fa-border-all"></i> 2. Grid Dimensions</h3>
            <div style="display: flex; gap: 15px;">
                <div class="input-group" style="margin: 0; width: 150px;">
                    <label>Rows</label><input type="number" v-model.number="rm.rows" min="1" max="24">
                </div>
                <div class="input-group" style="margin: 0; width: 150px;">
                    <label>Columns</label><input type="number" v-model.number="rm.cols" min="1" max="36">
                </div>
            </div>
        </div>

        <div style="background: var(--surface); padding: 15px; border: 1px solid var(--border); margin-bottom: 20px; border-radius: var(--radius);" v-if="rm.components.length > 0">
            <div class="flex-between" style="margin-bottom: 15px;">
                <h3 style="margin: 0;"><i class="fas fa-edit"></i> 3. Set Target Concentrations</h3>
                <select v-model="rm.activeComponentId" style="width: auto; padding: 6px; font-weight: bold; color: var(--primary);">
                    <option value="" disabled>Select Component</option>
                    <option v-for="comp in rm.components" :key="comp.id" :value="comp.id">
                        {{ comp.invId ? getInvName(comp.invId).split(' (')[0] : 'Unselected' }} ({{ comp.inputType === 'vol' ? (rm.targetVolumeUnit || 'µL') : comp.targetUnit }})
                    </option>
                </select>
            </div>

            <div class="table-responsive" style="border: 1px solid var(--border); border-radius: var(--radius); padding: 15px; background: var(--panel-bg);">
                <template v-for="comp in rm.components" :key="'grid_'+comp.id">
                    <div v-show="comp.id === rm.activeComponentId">
                        <div style="margin-bottom: 15px; display: flex; gap: 15px; flex-wrap: wrap; background: var(--surface); padding: 10px; border: 1px solid var(--border); border-radius: var(--radius);">
                            <div style="display: flex; gap: 5px; align-items: center;">
                                <select v-model="comp.quickRow" style="width: 70px; padding: 4px; font-size: 0.8rem;">
                                    <option disabled value="">Row</option>
                                    <option v-for="r in rm.rows" :key="r" :value="r">{{ String.fromCharCode(64 + r) }}</option>
                                </select>
                                <input type="number" v-model.number="comp.quickRowVal" step="any" placeholder="Val" style="width: 70px; padding: 4px; font-size: 0.8rem;">
                                <button class="small" @click="fillRmRow(rm, comp)">Fill</button>
                            </div>
                            <div style="display: flex; gap: 5px; align-items: center;">
                                <select v-model="comp.quickCol" style="width: 70px; padding: 4px; font-size: 0.8rem;">
                                    <option disabled value="">Col</option>
                                    <option v-for="c in rm.cols" :key="c" :value="c">{{ c }}</option>
                                </select>
                                <input type="number" v-model.number="comp.quickColVal" step="any" placeholder="Val" style="width: 70px; padding: 4px; font-size: 0.8rem;">
                                <button class="small" @click="fillRmCol(rm, comp)">Fill</button>
                            </div>
                            <div style="display: flex; gap: 5px; align-items: center; border-left: 1px solid var(--border); padding-left: 15px;">
                                <span style="font-size: 0.8rem; font-weight: bold;">Gradient:</span>
                                <select v-model="comp.gradDir" style="width: 95px; padding: 4px; font-size: 0.8rem;">
                                    <option value="none">None</option><option value="row">Across Row</option><option value="col">Down Col</option><option value="all_row">All Rows</option><option value="all_col">All Cols</option>
                                </select>
                                <template v-if="comp.gradDir !== 'none'">
                                    <select v-model="comp.gradIndex" style="width: 70px; padding: 4px; font-size: 0.8rem;" v-if="comp.gradDir === 'row' || comp.gradDir === 'col'">
                                        <option disabled value="">Index</option>
                                        <option v-for="r in rm.rows" :key="r" :value="r">{{ String.fromCharCode(64 + r) }}</option>
                                    </select>
                                    <input type="number" v-model.number="comp.gradStart" step="any" placeholder="Start" style="width: 60px; padding: 4px; font-size: 0.8rem;">
                                    <input type="number" v-model.number="comp.gradEnd" step="any" placeholder="End" style="width: 60px; padding: 4px; font-size: 0.8rem;" title="Target End Value">
                                    <input type="number" v-model.number="comp.gradStep" step="any" placeholder="Step" style="width: 60px; padding: 4px; font-size: 0.8rem;" title="Step Size">
                                    <button class="small" @click="applyRmGradient(rm, comp)">Apply</button>
                                </template>
                            </div>
                            <button class="small danger" @click="clearRmGrid(rm, comp)" style="margin-left: auto;">Clear All</button>
                        </div>
                        <div class="table-responsive" style="border: 1px solid var(--border); background: var(--surface);">
                            <table class="matrix-table" style="margin-bottom: 0;">
                                <thead>
                                    <tr>
                                        <th><i class="fas fa-grip icon-muted"></i></th>
                                        <th v-for="c in rm.cols" :key="c" style="border-bottom: 2px solid var(--primary);">Col {{ c }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="r in rm.rows" :key="r">
                                        <th style="border-right: 2px solid var(--primary);">Row {{ String.fromCharCode(64 + r) }}</th>
                                        <td v-for="c in rm.cols" :key="c" style="padding: 4px;">
                                            <input type="number" step="any" v-model.number="comp.grid[(r-1)+'_'+(c-1)]" style="width: 100%; min-width: 60px; padding: 6px; font-size: 0.85rem; text-align: center;">
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </template>
            </div>
        </div>

        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed var(--border); display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
            <span style="font-size: 0.85rem; font-weight: bold; opacity: 0.7;">Send to Plate:</span>
            <select v-model="rm.targetPlateId" style="width: 150px; padding: 6px;">
                <option value="" disabled>Select Plate...</option>
                <option v-for="p in store.wellPlates" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <input type="text" v-model="rm.targetStartWell" placeholder="Start Well (e.g. A1)" style="width: 140px; padding: 6px;">
            <button class="small" @click="saveReverseMatrixToPlate(rm)"><i class="fas fa-arrow-down"></i> To Plate</button>
        </div>
    </div>
  </div>
</template>