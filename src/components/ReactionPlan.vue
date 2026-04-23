<script setup>
import { ref } from 'vue'
import { useLabStore } from '../stores/labStore'

const store = useLabStore()
const activeDropdown = ref(null)
const showCloudLibrary = ref(false)

// --- Helper Math ---
const getUM = (val, unit) => {
    if (!val) return 0;
    let m = 1;
    if (unit === 'M') m = 1e6;
    else if (unit === 'mM') m = 1e3;
    else if (unit === 'µM') m = 1;
    else if (unit === 'nM') m = 1e-3;
    else if (unit === 'mg/mL' || unit === 'µg/µL') m = 1;
    else if (unit === 'ng/µL') m = 1e-3;
    else if (unit === 'X') m = 1;
    else if (unit === 'U/µL') m = 1;
    else if (unit === '%') m = 1;
    else if (unit === 'L') m = 1e6;
    else if (unit === 'mL') m = 1e3;
    else if (unit === 'µL') m = 1;
    else if (unit === 'nL') m = 1e-3;
    return val * m;
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
        ((!term) || 
         (item.name && item.name.toLowerCase().includes(term)) || 
         (item.code && item.code.toLowerCase().includes(term)) ||
         (item.cas && item.cas.toLowerCase().includes(term)))
    );
}

// --- Reaction Logic ---
const addReaction = () => { 
    store.reactions.unshift({ 
        id: store.nextReactionId++, 
        name: 'New Protocol', 
        targetVolume: 30, 
        targetVolumeUnit: 'µL', 
        items: [], 
        targetPlateId: '', 
        targetWell: '',
        scope: 'Personal',
        owner_id: store.user.id 
    }); 
    store.saveWorkspaceState();
}

const loadFromCloud = (cloudReaction) => {
    const alreadyOpen = store.reactions.find(r => r.id === cloudReaction.id);
    if (!alreadyOpen) {
        store.reactions.unshift(JSON.parse(JSON.stringify(cloudReaction)));
    }
    showCloudLibrary.value = false; 
    store.saveWorkspaceState();
}

const removeReaction = (index) => { 
    store.reactions.splice(index, 1); 
    store.saveWorkspaceState();
}

const addItem = (reaction) => { reaction.items.push({ invId: '', searchQuery: '', searchScope: 'Global', target: 1, targetUnit: 'µM', isFixed: false, fixedVol: 1, fixedVolUnit: 'µL', labware: '' }); }
const removeItem = (reaction, itemIndex) => { reaction.items.splice(itemIndex, 1); }

const duplicateReaction = (index) => {
    const copy = JSON.parse(JSON.stringify(store.reactions[index]));
    copy.id = store.nextReactionId++;
    copy.name += ' (Copy)';
    copy.scope = 'Personal';
    copy.owner_id = store.user.id; 
    store.reactions.splice(index + 1, 0, copy);
    store.saveWorkspaceState();
}

const archiveReaction = async (index) => {
    if(confirm("Archive this reaction plan?")) {
        const item = store.reactions.splice(index, 1)[0];
        item.scope = 'Archived';
        store.archivedReactions.push(item);
        await store.saveToCloud('reactions', item);
    }
}

const calc1xVol = (reaction, item) => {
    if (item.isFixed) {
        const fVolBase = getUM(Number(item.fixedVol), item.fixedVolUnit || 'µL');
        const rVolBase = getUM(1, reaction.targetVolumeUnit || 'µL');
        return rVolBase ? fVolBase / rVolBase : 0;
    }
    if (!item.invId) return 0;
    const invItem = store.inventory.find(i => i.id === item.invId);
    if (!invItem || !invItem.stock) return 0;
    
    const targetConcBase = getUM(Number(item.target), item.targetUnit || 'µM');
    const stockConcBase = getUM(Number(invItem.stock), invItem.stockUnit || 'µM');
    
    if (stockConcBase === 0) return 0;
    return (targetConcBase * reaction.targetVolume) / stockConcBase;
}

const calcMMVol = (reaction, item) => { return calc1xVol(reaction, item) * store.globalSettings.mmReactions; }
const reactionTotalVol = (reaction) => { return reaction.items.reduce((sum, item) => sum + calc1xVol(reaction, item), 0); }

// --- Cross-Module Integrations ---
const saveReactionToJournal = (reaction) => {
    const activeJournalEntry = store.journal.entries.find(e => e.id === store.journal.activeId);
    if (!activeJournalEntry) { alert("Please select an active journal entry first."); return; }
    
    const unit = reaction.targetVolumeUnit || 'µL';
    let html = `<br><br><div style="border: 1px solid var(--border); padding: 15px; border-radius: var(--radius); background: var(--surface);">`;
    html += `<h3 style="margin-top: 0; color: var(--primary);"><i class="fas fa-flask"></i> Protocol: ${reaction.name || 'Untitled'}</h3>`;
    html += `<div class="table-responsive"><table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left; border: 1px solid var(--border);">`;
    html += `<thead><tr><th style="border: 1px solid var(--border); background: var(--summary-bg); padding: 8px;">Component</th><th style="border: 1px solid var(--border); background: var(--summary-bg); padding: 8px;">Target</th><th style="border: 1px solid var(--border); background: var(--summary-bg); padding: 8px;">1x Vol (${unit})</th><th style="border: 1px solid var(--border); background: var(--summary-bg); padding: 8px;">MM Vol (${unit})</th></tr></thead><tbody>`;
    
    let total1x = 0;
    reaction.items.forEach(item => {
        const invItem = store.inventory.find(i => i.id === item.invId);
        const nameTag = invItem ? `&nbsp;<span class="inv-ref" contenteditable="false"><i class="fas fa-tag"></i>&nbsp;[${invItem.code}] ${invItem.name} (${store.formatNum(invItem.stock)} ${invItem.stockUnit || 'µM'})&nbsp;<i class="fas fa-times" style="cursor:pointer; margin-left:4px; opacity: 0.7;" onclick="let ce = this.closest('[contenteditable]'); this.parentElement.remove(); if(ce) ce.dispatchEvent(new Event('input', {bubbles: true}));" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7"></i></span>&nbsp;` : 'Unknown';
        const target = item.isFixed ? 'Fixed' : `${item.target} ${item.targetUnit || 'µM'}`;
        const vol1x = calc1xVol(reaction, item);
        const volMM = calcMMVol(reaction, item);
        total1x += vol1x;
        html += `<tr><td style="border: 1px solid var(--border); padding: 8px;">${nameTag}</td><td style="border: 1px solid var(--border); padding: 8px;">${target}</td><td style="border: 1px solid var(--border); padding: 8px;">${store.formatNum(vol1x)}</td><td style="border: 1px solid var(--border); padding: 8px;">${store.formatNum(volMM)}</td></tr>`;
    });
    
    const h2o1x = Math.max(0, reaction.targetVolume - total1x);
    const h2oMM = h2o1x * store.globalSettings.mmReactions;
    
    html += `<tr><td style="border: 1px solid var(--border); padding: 8px;"><strong>MQ Water</strong></td><td style="border: 1px solid var(--border); padding: 8px;">-</td><td style="border: 1px solid var(--border); padding: 8px;">${store.formatNum(h2o1x)}</td><td style="border: 1px solid var(--border); padding: 8px;">${store.formatNum(h2oMM)}</td></tr>`;
    html += `<tr style="background-color: var(--summary-bg); font-weight: bold;"><td style="border: 1px solid var(--border); padding: 8px;">TOTAL</td><td style="border: 1px solid var(--border); padding: 8px;">-</td><td style="border: 1px solid var(--border); padding: 8px;">${store.formatNum(reaction.targetVolume)}</td><td style="border: 1px solid var(--border); padding: 8px;">${store.formatNum(reaction.targetVolume * store.globalSettings.mmReactions)}</td></tr>`;
    html += `</tbody></table></div></div><br>`;
    
    activeJournalEntry.content += html;
    alert(`Successfully appended Protocol to Lab Journal!`);
}

const saveReactionToWell = (reaction) => {
    if (!reaction.targetPlateId || !reaction.targetWell) { alert("Please select a target plate and well."); return; }
    const plate = store.wellPlates.find(p => p.id === reaction.targetPlateId);
    if (!plate) return;
    
    const wId = reaction.targetWell.toUpperCase().trim();
    const unit = reaction.targetVolumeUnit || 'µL';
    
    let html = `<strong style="color: var(--primary);">${reaction.name || 'Protocol'}</strong><br>`;
    reaction.items.forEach(item => {
        const invItem = store.inventory.find(i => i.id === item.invId);
        if (invItem) {
            const vol1x = calc1xVol(reaction, item);
            const targetText = item.isFixed ? '(Fixed)' : `(${item.target} ${item.targetUnit || 'µM'})`;
            html += `&nbsp;<span class="inv-ref" contenteditable="false" data-labware="${item.labware || ''}"><i class="fas fa-tag"></i>&nbsp;[${invItem.code}] ${invItem.name} (${store.formatNum(invItem.stock)} ${invItem.stockUnit || 'µM'})&nbsp;<i class="fas fa-times" style="cursor:pointer; margin-left:4px; opacity: 0.7;" onclick="let ce = this.closest('[contenteditable]'); this.parentElement.remove(); if(ce) ce.dispatchEvent(new Event('input', {bubbles: true}));" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7"></i></span>&nbsp; ${store.formatNum(vol1x)} ${unit} ${targetText}<br>`;
        }
    });
    const h2o1x = Math.max(0, reaction.targetVolume - reactionTotalVol(reaction));
    html += `<strong>MQ H₂O:</strong> ${store.formatNum(h2o1x)} ${unit}`;
    
    plate.wells[wId] = html;
    alert(`Successfully sent ${reaction.name || 'Protocol'} to Plate: ${plate.name}, Well: ${wId}`);
}
</script>

<template>
  <div class="card">
    
    <div v-if="showCloudLibrary" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 2000;">
        <div style="background: var(--surface); padding: 25px; border-radius: var(--radius); border: 1px solid var(--border); max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
            <div class="flex-between" style="border-bottom: 2px solid var(--bg); padding-bottom: 10px; margin-bottom: 15px;">
                <h3 style="margin: 0; color: var(--primary);"><i class="fas fa-cloud"></i> Protocol Library</h3>
                <button class="danger small" @click="showCloudLibrary = false"><i class="fas fa-times"></i></button>
            </div>

            <h4 style="margin-bottom: 10px; color: var(--success);"><i class="fas fa-globe"></i> Global Lab Feed</h4>
            <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 25px;">
                <div v-for="rxn in store.cloudReactions.filter(r => r.scope === 'Global')" :key="'cloud_g_'+rxn.id" style="display: flex; justify-content: space-between; align-items: center; background: var(--panel-bg); padding: 10px; border-radius: var(--radius); border: 1px solid var(--border);">
                    <div>
                        <strong style="font-size: 1.05rem;">{{ rxn.name }}</strong>
                        <div style="font-size: 0.75rem; opacity: 0.7;">{{ rxn.targetVolume }} {{ rxn.targetVolumeUnit }} • {{ rxn.items.length }} Components</div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button class="small" @click="loadFromCloud(rxn)"><i class="fas fa-download"></i> Open</button>
                        <button v-if="rxn.owner_id === store.user.id" class="danger small" @click="store.deleteFromCloud('reactions', rxn.id)"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div v-if="store.cloudReactions.filter(r => r.scope === 'Global').length === 0" style="font-size: 0.85rem; opacity: 0.5; font-style: italic;">No global protocols published yet.</div>
            </div>

            <h4 style="margin-bottom: 10px;"><i class="fas fa-lock"></i> My Personal Drafts</h4>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div v-for="rxn in store.cloudReactions.filter(r => r.scope === 'Personal')" :key="'cloud_p_'+rxn.id" style="display: flex; justify-content: space-between; align-items: center; background: var(--panel-bg); padding: 10px; border-radius: var(--radius); border: 1px solid var(--border);">
                    <div>
                        <strong style="font-size: 1.05rem;">{{ rxn.name }}</strong>
                        <div style="font-size: 0.75rem; opacity: 0.7;">{{ rxn.targetVolume }} {{ rxn.targetVolumeUnit }} • {{ rxn.items.length }} Components</div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button class="small secondary" @click="loadFromCloud(rxn)"><i class="fas fa-folder-open"></i> Open</button>
                        <button class="danger small" @click="store.deleteFromCloud('reactions', rxn.id)"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div v-if="store.cloudReactions.filter(r => r.scope === 'Personal').length === 0" style="font-size: 0.85rem; opacity: 0.5; font-style: italic;">No personal drafts saved.</div>
            </div>
        </div>
    </div>

    <div class="flex-between" style="border-bottom: 2px solid var(--bg); padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between;">
        <h2 style="border: none; padding: 0; margin: 0;"><i class="fas fa-flask"></i> Reaction Plan</h2>
        <div style="display: flex; gap: 10px;">
            <button @click="showCloudLibrary = true" class="secondary small"><i class="fas fa-book"></i> Library</button>
            <button @click="addReaction" class="small"><i class="fas fa-plus"></i> New Plan</button>
        </div>
    </div>
    
    <div v-for="(reaction, rIndex) in store.reactions" :key="reaction.id" style="background: var(--panel-bg); border: 1px solid var(--border); padding: 20px; border-radius: var(--radius); margin-bottom: 20px;">
        <div class="flex-between" style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end;">
            <div style="width: 60%; display: flex; gap: 15px; align-items: center;">
                <input type="text" v-model="reaction.name" style="font-size: 1.2rem; font-weight: bold; flex-grow: 1; background: transparent; border: none; border-bottom: 2px solid var(--primary); padding-left: 0; color: var(--primary);" placeholder="Reaction Name">
                <div class="input-group" style="margin-bottom: 0; min-width: 150px;">
                    <label style="font-size: 0.7rem; margin-bottom: 2px;">Target Vol</label>
                    <div class="input-with-select">
                        <input type="number" v-model.number="reaction.targetVolume" step="any" style="padding: 6px;">
                        <select v-model="reaction.targetVolumeUnit" style="padding: 6px; font-size: 0.8rem; width: 60px;">
                            <option value="L">L</option><option value="mL">mL</option><option value="µL">µL</option><option value="nL">nL</option>
                        </select>
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 5px; align-items: center;">
                <span v-if="reaction.scope === 'Global'" style="font-size: 0.75rem; color: var(--success); font-weight: bold; margin-right: 10px;">
                    <i class="fas fa-globe"></i> Global
                </span>
                <span v-else style="font-size: 0.75rem; opacity: 0.7; font-weight: bold; margin-right: 10px;">
                    <i class="fas fa-lock"></i> Personal
                </span>

                <button class="success small" @click="store.saveToCloud('reactions', reaction)" title="Save to Cloud">
                    <i class="fas fa-cloud-arrow-up"></i> Save
                </button>

                <template v-if="reaction.owner_id === store.user.id">
                    <button class="secondary small" @click="reaction.scope = 'Personal'; store.saveToCloud('reactions', reaction)" v-if="reaction.scope === 'Global'" title="Make Private">
                        <i class="fas fa-user-lock"></i> Private
                    </button>
                    <button class="secondary small" @click="reaction.scope = 'Global'; store.saveToCloud('reactions', reaction)" v-if="reaction.scope !== 'Global'" title="Publish to Global Lab Feed">
                        <i class="fas fa-bullhorn"></i> Publish
                    </button>
                </template>
                
                <div style="width: 1px; height: 24px; background: var(--border); margin: 0 5px;"></div>

                <button class="small" @click="saveReactionToJournal(reaction)" title="Append table to active journal entry"><i class="fas fa-file-import"></i> Log</button>
                <button class="secondary small" @click="duplicateReaction(rIndex)" title="Duplicate"><i class="fas fa-copy"></i></button>
                <button class="secondary small" @click="archiveReaction(rIndex)" title="Local Archive"><i class="fas fa-box-archive"></i></button>
                
                <button class="danger small" @click="removeReaction(rIndex)" title="Close from workspace"><i class="fas fa-times"></i></button>
            </div>
        </div>
        
        <div class="table-responsive" style="min-height: 250px; overflow: visible;">
            <table>
                <thead>
                    <tr>
                        <th>Stock</th><th>Source Labware</th><th>Target Conc</th><th>Fixed?</th><th>1x Vol</th><th>MM Vol</th><th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(item, iIndex) in reaction.items" :key="iIndex">
                        <td>
                            <div style="position: relative;" @click.stop>
                                <div @click="activeDropdown = activeDropdown === 'reaction_' + rIndex + '_' + iIndex ? null : 'reaction_' + rIndex + '_' + iIndex" style="border: 1px solid var(--border); padding: 6px; background: var(--input-bg); cursor: pointer; border-radius: var(--radius); min-width: 150px; font-size: 0.8rem; display: flex; justify-content: space-between; align-items: center;">
                                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;">{{ item.invId ? getInvName(item.invId) : 'Select...' }}</span>
                                    <i class="fas fa-chevron-down" style="opacity: 0.5;"></i>
                                </div>
                                <div v-if="activeDropdown === 'reaction_' + rIndex + '_' + iIndex" style="position: absolute; top: 100%; left: 0; z-index: 1000; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: var(--radius); min-width: 250px; display: flex; flex-direction: column;">
                                    <div style="display: flex; gap: 5px; padding: 5px; border-bottom: 1px solid var(--border);">
                                        <label class="checkbox-label" style="font-weight: bold; font-size: 0.75rem;"><input type="radio" value="Global" v-model="item.searchScope"> Global</label>
                                        <label class="checkbox-label" style="font-weight: bold; font-size: 0.75rem;"><input type="radio" value="Personal" v-model="item.searchScope"> Personal</label>
                                    </div>
                                    <input type="text" v-model="item.searchQuery" placeholder="Search inventory..." style="margin: 5px; width: calc(100% - 10px); padding: 4px; border: 1px solid var(--border); border-radius: var(--radius);" @click.stop>
                                    <div style="overflow-y: auto; max-height: 180px;">
                                        <div v-for="inv in filterBlockInventory(item.searchQuery, item.searchScope)" :key="inv.id" @mousedown.prevent="item.invId = inv.id; activeDropdown = null" style="padding: 6px 10px; cursor: pointer; font-size: 0.8rem; border-bottom: 1px solid var(--bg);" onmouseover="this.style.background='var(--summary-bg)'" onmouseout="this.style.background='transparent'">
                                            [{{ inv.code }}] {{ inv.name }} ({{inv.stock}} {{inv.stockUnit || 'µM'}})
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </td>
                        <td style="vertical-align: top;">
                            <select v-model="item.labware" style="width: 140px; padding: 6px; font-size: 0.75rem; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface);">
                                <option value="">Default (0.5mL)</option>
                                <option v-for="lw in store.sourceLabwares" :value="lw.uuid" :key="lw.uuid">{{ lw.name }}</option>
                            </select>
                        </td>
                        <td style="vertical-align: top;">
                            <div v-if="!item.isFixed" class="input-with-select">
                                <input type="number" v-model.number="item.target" step="any" style="width: 70px; border-right: none; border-top-right-radius: 0; border-bottom-right-radius: 0;">
                                <select v-model="item.targetUnit" style="width: 80px; padding: 6px; font-size: 0.8rem; border-left: 1px solid var(--border); border-top-left-radius: 0; border-bottom-left-radius: 0;">
                                    <option value="M">M</option><option value="mM">mM</option><option value="µM">µM</option><option value="nM">nM</option>
                                    <option value="mg/mL">mg/mL</option><option value="µg/µL">µg/µL</option><option value="ng/µL">ng/µL</option>
                                    <option value="X">X</option><option value="U/µL">U/µL</option><option value="%">%</option>
                                </select>
                            </div>
                            <span v-else class="icon-muted">-</span>
                        </td>
                        <td style="vertical-align: top;">
                            <label class="checkbox-label" style="justify-content: center;">
                                <input type="checkbox" v-model="item.isFixed">
                            </label>
                        </td>
                        <td style="vertical-align: top;">
                            <div v-if="item.isFixed" class="input-with-select">
                                <input type="number" v-model.number="item.fixedVol" step="any" style="width: 70px; border-right: none; border-top-right-radius: 0; border-bottom-right-radius: 0;">
                                <select v-model="item.fixedVolUnit" style="width: 65px; padding: 6px; font-size: 0.8rem; border-left: 1px solid var(--border); border-top-left-radius: 0; border-bottom-left-radius: 0;">
                                    <option value="L">L</option><option value="mL">mL</option><option value="µL">µL</option><option value="nL">nL</option>
                                </select>
                            </div>
                            <span v-else>{{ store.formatNum(calc1xVol(reaction, item)) }} {{ reaction.targetVolumeUnit || 'µL' }}</span>
                        </td>
                        <td style="vertical-align: top;"><strong style="color: var(--primary);">{{ store.formatNum(calcMMVol(reaction, item)) }} {{ reaction.targetVolumeUnit || 'µL' }}</strong></td>
                        <td style="vertical-align: top;"><button class="danger small" @click="removeItem(reaction, iIndex)"><i class="fas fa-times"></i></button></td>
                    </tr>
                </tbody>
            </table>
        </div>
        <button class="small" @click="addItem(reaction)" style="margin-top: 10px;"><i class="fas fa-plus"></i> Add Component</button>

        <div :class="['summary-panel', { 'error': reactionTotalVol(reaction) > reaction.targetVolume }]">
            <div class="summary-box">
                <div>Total 1x Vol ({{ reaction.targetVolumeUnit || 'µL' }})</div>
                <strong>{{ store.formatNum(reactionTotalVol(reaction)) }}</strong>
            </div>
            <div class="summary-box">
                <div>1x MQ Water ({{ reaction.targetVolumeUnit || 'µL' }})</div>
                <strong>{{ store.formatNum(Math.max(0, reaction.targetVolume - reactionTotalVol(reaction))) }}</strong>
            </div>
            <div class="summary-box">
                <div>Total MM Vol ({{ reaction.targetVolumeUnit || 'µL' }})</div>
                <strong>{{ store.formatNum(reactionTotalVol(reaction) * store.globalSettings.mmReactions) }}</strong>
            </div>
            <div class="summary-box">
                <div>MM MQ Water ({{ reaction.targetVolumeUnit || 'µL' }})</div>
                <strong>{{ store.formatNum(Math.max(0, reaction.targetVolume - reactionTotalVol(reaction)) * store.globalSettings.mmReactions) }}</strong>
            </div>
        </div>
        
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed var(--border); display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
            <span style="font-size: 0.85rem; font-weight: bold; opacity: 0.7;">Send to Plate:</span>
            <select v-model="reaction.targetPlateId" style="width: 150px; padding: 6px;">
                <option value="" disabled>Select Plate...</option>
                <option v-for="p in store.wellPlates" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <input type="text" v-model="reaction.targetWell" placeholder="Well (e.g. A1)" style="width: 100px; padding: 6px;">
            <button class="small" @click="saveReactionToWell(reaction)"><i class="fas fa-arrow-down"></i> To Plate</button>
        </div>
    </div>
  </div>
</template>