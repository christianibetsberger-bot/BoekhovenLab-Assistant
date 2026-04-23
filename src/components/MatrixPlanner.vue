<script setup>
import { ref } from 'vue'
import { useLabStore } from '../stores/labStore'

const store = useLabStore()
const activeDropdown = ref(null)
const showCloudLibrary = ref(false)

// --- Helper Functions ---
const getUM = (val, unit) => {
    if (!val) return 0;
    let m = 1;
    if (unit === 'M') m = 1e6; else if (unit === 'mM') m = 1e3; else if (unit === 'µM') m = 1; else if (unit === 'nM') m = 1e-3;
    else if (unit === 'mg/mL' || unit === 'µg/µL' || unit === 'X' || unit === 'U/µL' || unit === '%') m = 1;
    else if (unit === 'ng/µL') m = 1e-3; else if (unit === 'L') m = 1e6; else if (unit === 'mL') m = 1e3; else if (unit === 'µL') m = 1; else if (unit === 'nL') m = 1e-3;
    return val * m;
}

const filterBlockInventory = (query, scope) => {
    const term = query ? query.toLowerCase() : '';
    const targetScope = scope || 'Global';
    return store.inventory.filter(item => 
        (item.scope === targetScope || (!item.scope && targetScope === 'Global')) &&
        ((!term) || (item.name && item.name.toLowerCase().includes(term)) || (item.code && item.code.toLowerCase().includes(term)) || (item.cas && item.cas.toLowerCase().includes(term)))
    );
}

const getBlockName = (matrix, blockId) => {
    const block = matrix.customBlocks.find(b => b.id === blockId);
    return block ? block.name : 'Unknown Block';
}

const getPlateRows = (format) => { if (format === 'ibidi') return 3; if (format === 'pcr8') return 1; return format === 384 ? 16 : (format === 48 ? 6 : (format === 24 ? 4 : 8)); }
const getPlateCols = (format) => { if (format === 'ibidi') return 6; if (format === 'pcr8') return 8; return format === 384 ? 24 : (format === 48 ? 8 : (format === 24 ? 6 : 12)); }
const getWellId = (r, c) => { return String.fromCharCode(65 + r) + (c + 1); }

// --- Matrix Logic ---
const addMatrix = () => { 
    store.matrices.unshift({ 
        id: store.nextMatrixId++, 
        name: 'New Matrix Grid', 
        targetVolume: 30, 
        targetVolumeUnit: 'µL', 
        rowTargetConc: 2.8, 
        rowTargetConcUnit: 'µM', 
        colTargetConc: 1.4, 
        colTargetConcUnit: 'µM', 
        customBlocks: [], 
        fixedAdditives: [
            {name: 'Ligase buffer (10x)', vol: 3, searchQuery: '', searchScope: 'Global', labware: ''}, 
            {name: 'T4 DNA Ligase', vol: 2, searchQuery: '', searchScope: 'Global', labware: ''}
        ],
        selectedRows: [], 
        selectedCols: [], 
        targetPlateId: '', 
        targetStartWell: '',
        scope: 'Personal',
        owner_id: store.user.id
    }); 
    store.saveWorkspaceState(); 
}

const loadFromCloud = (cloudMatrix) => {
    const alreadyOpen = store.matrices.find(m => m.id === cloudMatrix.id);
    if (!alreadyOpen) {
        store.matrices.unshift(JSON.parse(JSON.stringify(cloudMatrix)));
    }
    showCloudLibrary.value = false;
    store.saveWorkspaceState(); 
}

const closePlanInWorkspace = (index) => {
    store.matrices.splice(index, 1);
    store.saveWorkspaceState(); 
}

const addBlockToMatrix = (matrix) => { matrix.customBlocks.push({ id: 'blk_' + store.nextBlockId++, name: 'New Block', itemIds: [], searchQuery: '', searchScope: 'Global', labware: '' }); }
const addFixedAdditive = (matrix) => {
    if(!matrix.fixedAdditives) matrix.fixedAdditives = [];
    matrix.fixedAdditives.push({ name: 'New Component', vol: 1, searchQuery: '', searchScope: 'Global', labware: '' });
}
const archiveMatrix = async (index) => {
    if(confirm("Archive this matrix?")) {
        const item = store.matrices.splice(index, 1)[0];
        item.scope = 'Archived';
        store.archivedMatrices.push(item);
        await store.saveToCloud('matrices', item);
    }
}
const duplicateMatrix = (index) => {
    const copy = JSON.parse(JSON.stringify(store.matrices[index]));
    copy.id = store.nextMatrixId++; 
    copy.name += ' (Copy)';
    copy.scope = 'Personal';
    copy.owner_id = store.user.id;
    store.matrices.splice(index + 1, 0, copy);
}

// --- Calculators ---
const calculateMatrixCell = (matrix, rowBlockId, colBlockId) => {
    const rowBlock = matrix.customBlocks.find(b => b.id === rowBlockId);
    const colBlock = matrix.customBlocks.find(b => b.id === colBlockId);
    const tv = matrix.targetVolume;
    const unit = matrix.targetVolumeUnit || 'µL';

    if (!rowBlock || !colBlock) return "Error";
    
    let htmlStr = "";
    let totalVol = 0;

    const rowTargetUM = getUM(matrix.rowTargetConc, matrix.rowTargetConcUnit || 'µM');
    const colTargetUM = getUM(matrix.colTargetConc, matrix.colTargetConcUnit || 'µM');

    rowBlock.itemIds.forEach(itemId => {
        const item = store.inventory.find(i => i.id === itemId);
        if(item) {
            const stockUM = getUM(item.stock, item.stockUnit || 'µM');
            let v = stockUM ? (rowTargetUM * tv) / stockUM : 0;
            totalVol += v;
            htmlStr += `<strong>Row:</strong> &nbsp;<span class="inv-ref" contenteditable="false" data-labware="${rowBlock.labware || ''}"><i class="fas fa-tag"></i>&nbsp;[${item.code}] ${item.name} (${store.formatNum(item.stock)} ${item.stockUnit || 'µM'})&nbsp;<i class="fas fa-times" style="cursor:pointer; margin-left:4px; opacity: 0.7;" onclick="let ce = this.closest('[contenteditable]'); this.parentElement.remove(); if(ce) ce.dispatchEvent(new Event('input', {bubbles: true}));" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7"></i></span>&nbsp; ${store.formatNum(v)} ${unit} (${matrix.rowTargetConc} ${matrix.rowTargetConcUnit || 'µM'})<br>`;
        }
    });
    
    colBlock.itemIds.forEach(itemId => {
        const item = store.inventory.find(i => i.id === itemId);
        if(item) {
            const stockUM = getUM(item.stock, item.stockUnit || 'µM');
            let v = stockUM ? (colTargetUM * tv) / stockUM : 0;
            totalVol += v;
            htmlStr += `<strong>Col:</strong> &nbsp;<span class="inv-ref" contenteditable="false" data-labware="${colBlock.labware || ''}"><i class="fas fa-tag"></i>&nbsp;[${item.code}] ${item.name} (${store.formatNum(item.stock)} ${item.stockUnit || 'µM'})&nbsp;<i class="fas fa-times" style="cursor:pointer; margin-left:4px; opacity: 0.7;" onclick="let ce = this.closest('[contenteditable]'); this.parentElement.remove(); if(ce) ce.dispatchEvent(new Event('input', {bubbles: true}));" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7"></i></span>&nbsp; ${store.formatNum(v)} ${unit} (${matrix.colTargetConc} ${matrix.colTargetConcUnit || 'µM'})<br>`;
        }
    });
    
    let fixedVolTotal = 0; let fixedHtml = "";
    if(matrix.fixedAdditives) {
        matrix.fixedAdditives.forEach(add => {
            let vol = Number(add.vol) || 0;
            fixedVolTotal += vol;
            fixedHtml += `&nbsp;<span class="inv-ref" contenteditable="false" data-labware="${add.labware || ''}" style="background-color: #6b7280;"><i class="fas fa-flask"></i>&nbsp;${add.name}&nbsp;<i class="fas fa-times" style="cursor:pointer; margin-left:4px; opacity: 0.7;" onclick="let ce = this.closest('[contenteditable]'); this.parentElement.remove(); if(ce) ce.dispatchEvent(new Event('input', {bubbles: true}));" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7"></i></span>&nbsp; ${store.formatNum(vol)} ${unit}<br>`;
        });
    }
    
    totalVol += fixedVolTotal;
    const h2o = tv - totalVol;

    if (h2o < 0) return `<span class="error"><i class="fas fa-triangle-exclamation"></i> Exceeds Vol (${store.formatNum(totalVol)}${unit})</span><br>${htmlStr}`;

    htmlStr += fixedHtml;
    htmlStr += `<div style="margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px;"><strong>MQ H₂O:</strong> <span style="color: var(--primary); font-weight: bold;">${store.formatNum(h2o)} ${unit}</span></div>`;
    return htmlStr;
}

// --- Integrations ---
const saveMatrixToJournal = (matrix) => {
    const activeJournalEntry = store.journal.entries.find(e => e.id === store.journal.activeId);
    if (!activeJournalEntry) { alert("Please select an active journal entry first."); return; }
    
    const unit = matrix.targetVolumeUnit || 'µL';
    let html = `<br><br><div style="border: 1px solid var(--border); padding: 15px; border-radius: var(--radius); background: var(--surface);">`;
    html += `<h3 style="margin-top: 0; color: var(--primary);"><i class="fas fa-table-cells"></i> Matrix Grid: ${matrix.name || 'Untitled'}</h3>`;
    html += `<p style="font-size: 0.85rem; margin-bottom: 10px;">Row Target: ${matrix.rowTargetConc} ${matrix.rowTargetConcUnit || 'µM'} | Col Target: ${matrix.colTargetConc} ${matrix.colTargetConcUnit || 'µM'}</p>`;
    
    let fixedText = [];
    if(matrix.fixedAdditives && matrix.fixedAdditives.length > 0) {
        matrix.fixedAdditives.forEach(add => {
            let vol = Number(add.vol) || 0;
            fixedText.push(`&nbsp;<span class="inv-ref" contenteditable="false" style="background-color: #6b7280;"><i class="fas fa-flask"></i>&nbsp;${add.name}&nbsp;</span>&nbsp; (${store.formatNum(vol)} ${unit})`);
        });
        html += `<p style="font-size: 0.85rem; margin-bottom: 15px;"><strong>Fixed Additives:</strong> ${fixedText.join(', ')}</p>`;
    }

    if (matrix.selectedRows.length > 0 && matrix.selectedCols.length > 0) {
        html += `<div class="table-responsive"><table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left; border: 1px solid var(--border);">`;
        html += `<thead><tr><th style="border: 1px solid var(--border); background: var(--summary-bg); padding: 8px;"></th>`;
        matrix.selectedCols.forEach(colId => {
            html += `<th style="border: 1px solid var(--border); background: var(--summary-bg); padding: 8px; text-align: center;">${getBlockName(matrix, colId)} (Col)</th>`;
        });
        html += `</tr></thead><tbody>`;
        
        matrix.selectedRows.forEach(rowId => {
            html += `<tr><th style="border: 1px solid var(--border); background: var(--summary-bg); padding: 8px; text-align: center;">${getBlockName(matrix, rowId)} (Row)</th>`;
            matrix.selectedCols.forEach(colId => {
                let cellHtml = calculateMatrixCell(matrix, rowId, colId);
                html += `<td style="border: 1px solid var(--border); padding: 8px; vertical-align: top;">${cellHtml}</td>`;
            });
            html += `</tr>`;
        });
        html += `</tbody></table></div>`;
    } else {
        html += `<p style="opacity: 0.7; font-style: italic;">Matrix is empty (select row and column blocks).</p>`;
    }
    html += `</div><br>`;
    activeJournalEntry.content += html;
    alert(`Successfully appended Matrix to Lab Journal!`);
}

const saveMatrixToPlate = (matrix) => {
    if (!matrix.targetPlateId || !matrix.targetStartWell) { alert("Please select a target plate and starting well."); return; }
    const plate = store.wellPlates.find(p => p.id === matrix.targetPlateId);
    if (!plate) return;
    
    const startWell = matrix.targetStartWell.toUpperCase().trim();
    const match = startWell.match(/^([A-Z]+)(\d+)$/);
    if (!match) { alert("Invalid well format. Use A1, B2, etc."); return; }
    
    let startRow = match[1].charCodeAt(0) - 65; 
    let startCol = parseInt(match[2]) - 1;
    
    matrix.selectedRows.forEach((rowBlockId, rIdx) => {
        matrix.selectedCols.forEach((colBlockId, cIdx) => {
            let targetR = startRow + rIdx;
            let targetC = startCol + cIdx;
            
            if (targetR < getPlateRows(plate.format) && targetC < getPlateCols(plate.format)) {
                let wId = getWellId(targetR, targetC);
                let cellHtml = calculateMatrixCell(matrix, rowBlockId, colBlockId);
                plate.wells[wId] = cellHtml;
            }
        });
    });
    alert(`Successfully sent matrix to Plate: ${plate.name} starting at ${startWell}`);
}
</script>

<template>
  <div class="card">
    
    <div v-if="showCloudLibrary" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 2000;">
        <div style="background: var(--surface); padding: 25px; border-radius: var(--radius); border: 1px solid var(--border); max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
            <div class="flex-between" style="border-bottom: 2px solid var(--bg); padding-bottom: 10px; margin-bottom: 15px;">
                <h3 style="margin: 0; color: var(--primary);"><i class="fas fa-cloud"></i> Matrix Library</h3>
                <button class="danger small" @click="showCloudLibrary = false"><i class="fas fa-times"></i></button>
            </div>

            <h4 style="margin-bottom: 10px; color: var(--success);"><i class="fas fa-globe"></i> Global Lab Feed</h4>
            <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 25px;">
                <div v-for="mat in store.cloudMatrices.filter(m => m.scope === 'Global')" :key="'cloud_mg_'+mat.id" style="display: flex; justify-content: space-between; align-items: center; background: var(--panel-bg); padding: 10px; border-radius: var(--radius); border: 1px solid var(--border);">
                    <div>
                        <strong style="font-size: 1.05rem;">{{ mat.name }}</strong>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button class="small" @click="loadFromCloud(mat)"><i class="fas fa-download"></i> Open</button>
                        <button v-if="mat.owner_id === store.user.id" class="danger small" @click="store.deleteFromCloud('matrices', mat.id)"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div v-if="store.cloudMatrices.filter(m => m.scope === 'Global').length === 0" style="font-size: 0.85rem; opacity: 0.5; font-style: italic;">No global matrices published yet.</div>
            </div>

            <h4 style="margin-bottom: 10px;"><i class="fas fa-lock"></i> My Personal Drafts</h4>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div v-for="mat in store.cloudMatrices.filter(m => m.scope === 'Personal')" :key="'cloud_mp_'+mat.id" style="display: flex; justify-content: space-between; align-items: center; background: var(--panel-bg); padding: 10px; border-radius: var(--radius); border: 1px solid var(--border);">
                    <div>
                        <strong style="font-size: 1.05rem;">{{ mat.name }}</strong>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button class="small secondary" @click="loadFromCloud(mat)"><i class="fas fa-folder-open"></i> Open</button>
                        <button class="danger small" @click="store.deleteFromCloud('matrices', mat.id)"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div v-if="store.cloudMatrices.filter(m => m.scope === 'Personal').length === 0" style="font-size: 0.85rem; opacity: 0.5; font-style: italic;">No personal drafts saved.</div>
            </div>
        </div>
    </div>

    <div class="flex-between" style="border-bottom: 2px solid var(--bg); padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between;">
        <h2 style="border: none; padding: 0; margin: 0;"><i class="fas fa-table-cells"></i> Matrix</h2>
        <div style="display: flex; gap: 10px;">
            <button @click="showCloudLibrary = true" class="secondary small"><i class="fas fa-cloud"></i> Library</button>
            <button @click="addMatrix" class="small"><i class="fas fa-plus"></i> New Matrix</button>
        </div>
    </div>
    
    <div v-for="(matrix, mIndex) in store.matrices" :key="matrix.id" style="background: var(--panel-bg); border: 1px solid var(--border); padding: 20px; border-radius: var(--radius); margin-bottom: 30px;">
        <div class="flex-between" style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end;">
            <div style="width: 45%; display: flex; gap: 15px; align-items: center;">
                <input type="text" v-model="matrix.name" style="font-size: 1.2rem; font-weight: bold; flex-grow: 1; background: transparent; border: none; border-bottom: 2px solid var(--primary); padding-left: 0; color: var(--primary);">
                <div class="input-group" style="margin-bottom: 0; min-width: 150px;">
                    <label style="font-size: 0.7rem; margin-bottom: 2px;">Target Vol</label>
                    <div class="input-with-select">
                        <input type="number" v-model.number="matrix.targetVolume" step="any" style="padding: 6px;">
                        <select v-model="matrix.targetVolumeUnit" style="padding: 6px; font-size: 0.8rem; width: 60px;">
                            <option value="L">L</option><option value="mL">mL</option><option value="µL">µL</option><option value="nL">nL</option>
                        </select>
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 5px; align-items: center;">
                <span v-if="matrix.scope === 'Global'" style="font-size: 0.75rem; color: var(--success); font-weight: bold; margin-right: 10px;">
                    <i class="fas fa-globe"></i> Global
                </span>
                <span v-else style="font-size: 0.75rem; opacity: 0.7; font-weight: bold; margin-right: 10px;">
                    <i class="fas fa-lock"></i> Personal
                </span>

                <button class="success small" @click="store.saveToCloud('matrices', matrix)" title="Save to Cloud">
                    <i class="fas fa-cloud-arrow-up"></i> Save
                </button>

                <template v-if="matrix.owner_id === store.user.id">
                    <button class="secondary small" @click="matrix.scope = 'Personal'; store.saveToCloud('matrices', matrix)" v-if="matrix.scope === 'Global'" title="Make Private">
                        <i class="fas fa-user-lock"></i> Private
                    </button>
                    <button class="secondary small" @click="matrix.scope = 'Global'; store.saveToCloud('matrices', matrix)" v-if="matrix.scope !== 'Global'" title="Publish to Global Lab Feed">
                        <i class="fas fa-bullhorn"></i> Publish
                    </button>
                </template>
                
                <div style="width: 1px; height: 24px; background: var(--border); margin: 0 5px;"></div>

                <button class="small" @click="saveMatrixToJournal(matrix)" title="Append table to active journal entry"><i class="fas fa-file-import"></i> Log</button>
                <button class="secondary small" @click="duplicateMatrix(mIndex)" title="Duplicate"><i class="fas fa-copy"></i></button>
                <button class="secondary small" @click="archiveMatrix(mIndex)" title="Local Archive"><i class="fas fa-box-archive"></i></button>
                <button class="danger small" @click="closePlanInWorkspace(mIndex)" title="Remove from screen only"><i class="fas fa-times"></i></button>
            </div>
            </div>

        <div style="background: var(--surface); padding: 15px; border: 1px solid var(--border); margin-bottom: 20px; border-radius: var(--radius);">
            <h3><i class="fas fa-cubes"></i> 1. Define Component Blocks</h3>
            <p style="font-size: 0.85rem; opacity: 0.8; margin-top: -10px;">Manually group items (e.g., Strand + Counter-strand) for matrix Row/Col selection.</p>
            
            <div class="table-responsive" style="display: flex; gap: 10px; padding-bottom: 10px; overflow-x: auto; min-height: 250px;">
                <div v-for="(block, bIndex) in matrix.customBlocks" :key="block.id" style="min-width: 250px; border: 1px solid var(--border); padding: 10px; background: var(--input-bg); border-radius: var(--radius);">
                    <div class="flex-between" style="margin-bottom: 10px; display: flex; justify-content: space-between;">
                        <input type="text" v-model="block.name" placeholder="Block Name" style="font-weight: bold; font-size: 0.9rem; padding: 4px;">
                        <button class="danger small" @click="matrix.customBlocks.splice(bIndex, 1)" style="padding: 4px 6px; margin-left: 5px;"><i class="fas fa-times"></i></button>
                    </div>
                    <div style="display: flex; gap: 5px; margin-bottom: 8px;">
                        <label class="checkbox-label" style="font-weight: bold; font-size: 0.7rem;"><input type="radio" value="Global" v-model="block.searchScope"> Global</label>
                        <label class="checkbox-label" style="font-weight: bold; font-size: 0.7rem;"><input type="radio" value="Personal" v-model="block.searchScope"> Personal</label>
                    </div>
                    <select v-model="block.labware" style="margin-bottom: 8px; padding: 4px; font-size: 0.75rem; width: 100%; border-radius: var(--radius); border: 1px solid var(--border);">
                        <option value="">Default (0.5mL Tube)</option>
                        <option v-for="lw in store.sourceLabwares" :value="lw.uuid" :key="lw.uuid">{{ lw.name }}</option>
                    </select>
                    <input type="text" v-model="block.searchQuery" placeholder="Search inventory..." style="margin-bottom: 8px; padding: 4px 8px; font-size: 0.8rem; height: 28px; width: 100%; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text);">
                    <div class="checkbox-list" style="max-height: 120px;">
                        <label v-for="inv in filterBlockInventory(block.searchQuery, block.searchScope)" :key="inv.id">
                            <input type="checkbox" :value="inv.id" v-model="block.itemIds">
                            [{{ inv.code }}] {{ inv.name }}
                        </label>
                    </div>
                </div>
                <button @click="addBlockToMatrix(matrix)" style="min-width: 150px; height: auto;"><i class="fas fa-plus"></i> Add Block</button>
            </div>
        </div>

        <div style="background: var(--surface); padding: 15px; border: 1px solid var(--border); margin-bottom: 20px; border-radius: var(--radius);">
            <div class="flex-between" style="margin-bottom: 10px; display: flex; justify-content: space-between;">
                <h3 style="margin: 0;"><i class="fas fa-fill"></i> 2. Fixed Additives</h3>
                <button class="small" @click="addFixedAdditive(matrix)"><i class="fas fa-plus"></i> Component</button>
            </div>
            
            <div v-if="matrix.fixedAdditives && matrix.fixedAdditives.length > 0">
                <div v-for="(add, aIdx) in matrix.fixedAdditives" :key="aIdx" style="display: flex; gap: 10px; margin-bottom: 8px; align-items: flex-end;">
                    <div style="flex-grow: 1; position: relative;" @click.stop>
                        <div @click="activeDropdown = activeDropdown === 'matrix_fixed_' + mIndex + '_' + aIdx ? null : 'matrix_fixed_' + mIndex + '_' + aIdx" style="border: 1px solid var(--border); padding: 6px; background: var(--input-bg); cursor: pointer; border-radius: var(--radius); font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center; min-height: 32px;">
                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ add.name || 'Select or type...' }}</span>
                            <i class="fas fa-chevron-down" style="opacity: 0.5;"></i>
                        </div>
                        <div v-if="activeDropdown === 'matrix_fixed_' + mIndex + '_' + aIdx" style="position: absolute; top: 100%; left: 0; z-index: 1000; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: var(--radius); width: 100%; min-width: 250px; display: flex; flex-direction: column;">
                            <div style="display: flex; gap: 5px; padding: 5px; border-bottom: 1px solid var(--border);">
                                <label class="checkbox-label" style="font-weight: bold; font-size: 0.75rem;"><input type="radio" value="Global" v-model="add.searchScope"> Global</label>
                                <label class="checkbox-label" style="font-weight: bold; font-size: 0.75rem;"><input type="radio" value="Personal" v-model="add.searchScope"> Personal</label>
                            </div>
                            <div style="padding: 5px; display: flex; gap: 5px;">
                                <input type="text" v-model="add.searchQuery" placeholder="Search or type name..." style="flex-grow: 1; padding: 4px; border: 1px solid var(--border); border-radius: var(--radius);" @click.stop>
                                <button class="small" @click="add.name = add.searchQuery; activeDropdown = null">Use Text</button>
                            </div>
                            <div style="overflow-y: auto; max-height: 180px;">
                                <div v-for="inv in filterBlockInventory(add.searchQuery, add.searchScope)" :key="inv.id" @mousedown.prevent="add.name = '[' + inv.code + '] ' + inv.name; activeDropdown = null" style="padding: 6px 10px; cursor: pointer; font-size: 0.8rem; border-bottom: 1px solid var(--bg);" onmouseover="this.style.background='var(--summary-bg)'" onmouseout="this.style.background='transparent'">
                                    [{{ inv.code }}] {{ inv.name }}
                                </div>
                            </div>
                        </div>
                    </div>
                    <select v-model="add.labware" style="width: 140px; padding: 6px; font-size: 0.75rem; border-radius: var(--radius); border: 1px solid var(--border);">
                        <option value="">Default (0.5mL)</option>
                        <option v-for="lw in store.sourceLabwares" :value="lw.uuid" :key="lw.uuid">{{ lw.name }}</option>
                    </select>
                    <div class="input-with-select" style="width: 180px;">
                        <input type="number" v-model.number="add.vol" step="any" placeholder="Volume">
                        <select disabled style="opacity: 1; color: var(--text);"><option>{{ matrix.targetVolumeUnit || 'µL' }}</option></select>
                    </div>
                    <button class="danger small" style="margin-bottom: 2px;" @click="matrix.fixedAdditives.splice(aIdx, 1)"><i class="fas fa-times"></i></button>
                </div>
            </div>
        </div>

        <div class="grid-2" style="margin-bottom: 20px;">
            <div style="background: var(--surface); padding: 15px; border: 1px solid var(--border); border-radius: var(--radius);">
                <h3><i class="fas fa-arrows-left-right"></i> 3. Select Row Blocks</h3>
                <div class="input-group">
                    <label>Target Conc</label>
                    <div class="input-with-select">
                        <input type="number" v-model.number="matrix.rowTargetConc" step="any" style="border-right: none; border-top-right-radius: 0; border-bottom-right-radius: 0;">
                        <select v-model="matrix.rowTargetConcUnit" style="width: 80px; padding: 6px; font-size: 0.8rem; border-left: 1px solid var(--border); border-top-left-radius: 0; border-bottom-left-radius: 0;">
                            <option value="M">M</option><option value="mM">mM</option><option value="µM">µM</option><option value="nM">nM</option>
                        </select>
                    </div>
                </div>
                <div class="checkbox-list">
                    <label v-for="block in matrix.customBlocks" :key="'r'+block.id">
                        <input type="checkbox" :value="block.id" v-model="matrix.selectedRows">
                        <strong>{{ block.name || 'Unnamed Block' }}</strong>
                    </label>
                </div>
            </div>
            
            <div style="background: var(--surface); padding: 15px; border: 1px solid var(--border); border-radius: var(--radius);">
                <h3><i class="fas fa-arrows-up-down"></i> 4. Select Column Blocks</h3>
                <div class="input-group">
                    <label>Target Conc</label>
                    <div class="input-with-select">
                        <input type="number" v-model.number="matrix.colTargetConc" step="any" style="border-right: none; border-top-right-radius: 0; border-bottom-right-radius: 0;">
                        <select v-model="matrix.colTargetConcUnit" style="width: 80px; padding: 6px; font-size: 0.8rem; border-left: 1px solid var(--border); border-top-left-radius: 0; border-bottom-left-radius: 0;">
                            <option value="M">M</option><option value="mM">mM</option><option value="µM">µM</option><option value="nM">nM</option>
                        </select>
                    </div>
                </div>
                <div class="checkbox-list">
                    <label v-for="block in matrix.customBlocks" :key="'c'+block.id">
                        <input type="checkbox" :value="block.id" v-model="matrix.selectedCols">
                        <strong>{{ block.name || 'Unnamed Block' }}</strong>
                    </label>
                </div>
            </div>
        </div>

        <div class="table-responsive" style="background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);">
            <table class="matrix-table" v-if="matrix.selectedRows.length > 0 && matrix.selectedCols.length > 0" style="margin-bottom: 0;">
                <thead>
                    <tr>
                        <th><i class="fas fa-grip icon-muted"></i></th>
                        <th v-for="colId in matrix.selectedCols" :key="colId" style="border-bottom: 2px solid var(--primary);">
                            {{ getBlockName(matrix, colId) }}<br>
                            <span style="font-weight: normal; font-size: 0.75rem; opacity: 0.7;">(Col)</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="rowId in matrix.selectedRows" :key="rowId">
                        <th style="border-right: 2px solid var(--primary);">
                            {{ getBlockName(matrix, rowId) }}<br>
                            <span style="font-weight: normal; font-size: 0.75rem; opacity: 0.7;">(Row)</span>
                        </th>
                        <td v-for="colId in matrix.selectedCols" :key="colId">
                            <div class="matrix-cell">
                                <div v-html="calculateMatrixCell(matrix, rowId, colId)"></div>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed var(--border); display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
            <span style="font-size: 0.85rem; font-weight: bold; opacity: 0.7;">Send to Plate:</span>
            <select v-model="matrix.targetPlateId" style="width: 150px; padding: 6px;">
                <option value="" disabled>Select Plate...</option>
                <option v-for="p in store.wellPlates" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <input type="text" v-model="matrix.targetStartWell" placeholder="Start Well (e.g. A1)" style="width: 140px; padding: 6px;">
            <button class="small" @click="saveMatrixToPlate(matrix)"><i class="fas fa-arrow-down"></i> To Plate</button>
        </div>
    </div>
  </div>
</template>