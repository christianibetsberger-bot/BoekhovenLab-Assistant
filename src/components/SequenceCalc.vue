<script setup>
import { computed, ref } from 'vue'
import { useLabStore } from '../stores/labStore'
import { calcSeqExtinction, calcSeqMw, calcSeqTm, calcSeqGc } from '../utils/seqUtils'

const store = useLabStore()
const saveScope = ref('Global')
const useBlank = ref(false)
const a260Blank = ref(null)

// --- Computed Properties ---
const calculatedLength = computed(() => store.dnaCalc.sequence.replace(/\[.*?\]/g, '').replace(/[^a-zA-Z]/g, '').length)
const calculatedGc = computed(() => calcSeqGc(store.dnaCalc.sequence))
const calculatedTm = computed(() => calcSeqTm(store.dnaCalc.sequence))
const calculatedExtinction = computed(() => calcSeqExtinction(store.dnaCalc.sequence, store.dnaCalc.type))
const calculatedMw = computed(() => calcSeqMw(store.dnaCalc.sequence, store.dnaCalc.type))
const activeMw = computed(() => store.dnaCalc.manualMw ? store.dnaCalc.manualMw : calculatedMw.value)

const correctedA260 = computed(() => {
    const raw = store.dnaCalc.a260 || 0
    if (!useBlank.value || !a260Blank.value) return raw
    return Math.max(0, raw - a260Blank.value)
})

const dnaConcentration = computed(() => {
    if (!correctedA260.value) return 0;
    const l = store.dnaCalc.pathLength || 0.05;
    if (calculatedExtinction.value) return (correctedA260.value / (calculatedExtinction.value * l)) * 1000000;
    if (store.dnaCalc.manualMw) return ((correctedA260.value * 33 * (1/l)) * 1000) / store.dnaCalc.manualMw;
    return 0;
})

const dnaMassConcentration = computed(() => {
    if (!dnaConcentration.value) return 0;
    return (dnaConcentration.value * activeMw.value) / 1000;
})

// --- Saving Method ---
const saveDnaToInventory = () => {
    const rawSeq = store.dnaCalc.sequence.trim();
    const newItem = {
        id: 'mod_' + crypto.randomUUID(), code: store.dnaCalc.saveCode || 'CALC', cas: '',
        itemClass: store.dnaCalc.saveClass, name: store.dnaCalc.saveName, 
        stock: parseFloat(store.formatNum(dnaConcentration.value)), stockUnit: 'µM', 
        location: '', sublocation: '', catalogNum: '', unitSize: '', 
        sequence: rawSeq.startsWith("5'") ? rawSeq : `5'-${rawSeq}-3'`, 
        length: calculatedLength.value, gc: calculatedGc.value, tm: calculatedTm.value, 
        mw: activeMw.value, extinction: calculatedExtinction.value, oligoType: store.dnaCalc.type, 
        manualMw: store.dnaCalc.manualMw || null, scope: saveScope.value
    };
    store.inventory.unshift(newItem);
    store.saveItemToCloud(newItem);
    store.dnaCalc.saveName = ''; store.dnaCalc.saveCode = ''; store.dnaCalc.a260 = null; 
    store.dnaCalc.sequence = ''; store.dnaCalc.manualMw = null;
}
</script>

<template>
  <div class="card">
    <h2><i class="fas fa-dna"></i> Sequence Calculator</h2>
    
    <div class="grid-2">
        <div class="input-group">
            <label>Sequence Type</label>
            <select v-model="store.dnaCalc.type">
                <option value="DNA">DNA</option>
                <option value="RNA">RNA</option>
            </select>
        </div>
        <div class="input-group">
            <label>A260 Measurement</label>
            <input type="number" v-model.number="store.dnaCalc.a260" step="any" placeholder="e.g. 0.5">
            <div style="margin-top: 6px; display: flex; align-items: center; gap: 8px;">
                <label class="checkbox-label" style="font-size: 0.78rem; font-weight: normal; opacity: 0.85;">
                    <input type="checkbox" v-model="useBlank" style="width: auto; appearance: auto; -webkit-appearance: auto;">
                    Blank subtraction
                </label>
                <input v-if="useBlank" type="number" v-model.number="a260Blank" step="any"
                    placeholder="blank A260"
                    style="flex: 1; min-width: 0; padding: 5px 8px; font-size: 0.82rem;">
            </div>
        </div>
    </div>
    
    <div class="input-group">
        <label>Sequence (5' to 3') <span class="icon-muted" style="font-size: 0.7rem;">[Modifications] allowed</span></label>
        <textarea :value="store.formatSeqTriplets(store.dnaCalc.sequence)" @input="store.dnaCalc.sequence = $event.target.value.replace(/\s+/g, '')" rows="3" placeholder="Paste sequence (ATGC...) or [DSPC]ATGC..."></textarea>
    </div>
    
    <div class="grid-2">
        <div class="input-group">
            <label>Manual Mass/Mw (Da)</label>
            <input type="number" v-model.number="store.dnaCalc.manualMw" step="any" placeholder="Optional override">
        </div>
        <div class="input-group">
            <label>Path Length</label>
            <div style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
                <button type="button" @click="store.dnaCalc.pathLength = 1"
                    :style="store.dnaCalc.pathLength === 1 ? 'background:var(--primary);color:#fff;border-color:var(--primary);' : 'background:var(--input-bg);color:var(--text);border:1px solid var(--border);'"
                    style="padding:4px 7px;font-size:0.7rem;font-weight:600;border-radius:6px;cursor:pointer;"
                    title="Nanodrop — 1 cm pathlength">ND 1 cm</button>
                <button type="button" @click="store.dnaCalc.pathLength = 0.05"
                    :style="store.dnaCalc.pathLength === 0.05 ? 'background:var(--primary);color:#fff;border-color:var(--primary);' : 'background:var(--input-bg);color:var(--text);border:1px solid var(--border);'"
                    style="padding:4px 7px;font-size:0.7rem;font-weight:600;border-radius:6px;cursor:pointer;"
                    title="Microdrop — 0.05 cm pathlength">µD 0.05 cm</button>
                <input type="number" v-model.number="store.dnaCalc.pathLength" step="any" placeholder="cm" style="flex:1;min-width:50px;">
            </div>
        </div>
    </div>
    
    <div style="font-size: 0.85rem; background: var(--input-bg); padding: 10px; border-radius: var(--radius); margin-bottom: 15px; border: 1px solid var(--border);">
        <div class="grid-2">
            <div><i class="fas fa-ruler icon-muted"></i> Length: <strong>{{ calculatedLength }}</strong> nt</div>
            <div><i class="fas fa-chart-pie icon-muted"></i> GC Content: <strong>{{ store.formatNum(calculatedGc) }}</strong>%</div>
            <div><i class="fas fa-calculator icon-muted"></i> Ext. Coeff: <strong>{{ store.formatNum(calculatedExtinction) }}</strong> L/(mol·cm)</div>
            <div><i class="fas fa-weight-scale icon-muted"></i> Active Mw: <strong>{{ store.formatNum(activeMw) }}</strong> Da <span v-if="store.dnaCalc.manualMw" style="color: var(--primary);">(Manual)</span><span v-else>(Auto)</span></div>
            <div><i class="fas fa-temperature-half icon-muted"></i> Tm: <strong>{{ store.formatNum(calculatedTm) }}</strong> °C</div>
            <div v-if="useBlank && a260Blank" style="color: var(--primary);">
                <i class="fas fa-circle-minus icon-muted"></i> Corrected A260: <strong>{{ store.formatNum(correctedA260) }}</strong>
            </div>
        </div>
    </div>
    
    <div class="summary-panel" style="margin-top: 0; margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between;">
        <strong><i class="fas fa-droplet" style="color: var(--primary)"></i> Calculated Conc: </strong> 
        <span style="font-size: 1.2rem; color: var(--primary); font-weight: bold; display: flex; align-items: center; white-space: nowrap;">
            {{ store.formatNum(dnaConcentration) }} µM
            <span v-if="dnaMassConcentration > 0" style="margin-left: 10px; padding-left: 10px; border-left: 2px solid var(--border);">
                {{ store.formatNum(dnaMassConcentration) }} ng/µL
            </span>
        </span>
    </div>
    
    <div style="background: var(--panel-bg); padding: 15px; border: 1px solid var(--border); border-radius: var(--radius);">
        <h4>Save DNA to Inventory</h4>
        <div class="grid-2" style="margin-bottom: 10px;">
            <div class="input-group" style="margin: 0;">
                <input type="text" v-model="store.dnaCalc.saveCode" placeholder="Code (e.g., Mod-01)">
            </div>
            <div class="input-group" style="margin: 0;">
                <select v-model="store.dnaCalc.saveClass">
                    <option v-for="cls in store.classOptions" :key="cls" :value="cls">{{ cls }}</option>
                </select>
            </div>
        </div>
        <div class="input-group" style="margin-bottom: 10px;">
            <input type="text" v-model="store.dnaCalc.saveName" placeholder="Oligo Name">
        </div>
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;padding:7px 10px;background:var(--input-bg);border-radius:6px;border:1px solid var(--border);">
            <span style="font-size:0.73rem;opacity:0.6;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;">Save to:</span>
            <label class="checkbox-label"><input type="radio" value="Global" v-model="saveScope"> Global</label>
            <label class="checkbox-label"><input type="radio" value="Personal" v-model="saveScope"> Personal</label>
        </div>
        <button style="width: 100%" @click="saveDnaToInventory" :disabled="!dnaConcentration || !store.dnaCalc.saveName">
            <i class="fas fa-download"></i> Save to Inventory
        </button>
    </div>
  </div>
</template>