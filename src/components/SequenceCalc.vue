<script setup>
import { computed } from 'vue'
import { useLabStore } from '../stores/labStore'

const store = useLabStore()

// --- Core Math Functions ---
const calcSeqExtinction = (rawSeq, type) => {
    if (!rawSeq) return 0;
    const seq = rawSeq.replace(/\[.*?\]/g, '').toUpperCase().replace(/[^ACGTU]/g, '').replace(/U/g, 'T');
    if (seq.length === 0) return 0;
    if (type === 'RNA') {
        const indRNA = { 'A': 15300, 'C': 7200, 'G': 11800, 'T': 9300, 'U': 9300 };
        const nnRNA = {
            'AA': 27400, 'AC': 21000, 'AG': 25000, 'AU': 24000,
            'CA': 21000, 'CC': 14200, 'CG': 17800, 'CU': 16200,
            'GA': 25200, 'GC': 17400, 'GG': 21600, 'GU': 21200,
            'UA': 23200, 'UC': 16000, 'UG': 19000, 'UU': 18400,
            'AT': 24000, 'TA': 23200, 'CT': 16200, 'TC': 16000, 'GT': 21200, 'TG': 19000, 'TT': 18400
        };
        let e = 0;
        const cleanRNA = seq.replace(/T/g, 'U');
        for (let i = 0; i < cleanRNA.length - 1; i++) e += nnRNA[cleanRNA.substring(i, i + 2)] || 0;
        for (let i = 1; i < cleanRNA.length - 1; i++) e -= indRNA[cleanRNA[i]] || 0;
        return e;
    } else {
        const ind = { 'A': 15400, 'C': 7400, 'G': 11500, 'T': 8700 };
        const nn = {
            'AA': 27400, 'AC': 21200, 'AG': 25000, 'AT': 22800,
            'CA': 21200, 'CC': 14600, 'CG': 18000, 'CT': 15200,
            'GA': 25200, 'GC': 17600, 'GG': 21600, 'GT': 20000,
            'TA': 23400, 'TC': 16200, 'TG': 19000, 'TT': 16800
        };
        let e = 0;
        for (let i = 0; i < seq.length - 1; i++) e += nn[seq.substring(i, i + 2)] || 0;
        for (let i = 1; i < seq.length - 1; i++) e -= ind[seq[i]] || 0;
        return e;
    }
}

const calcSeqMw = (rawSeq, type) => {
    if (!rawSeq) return 0;
    const seq = rawSeq.replace(/\[.*?\]/g, '').toUpperCase().replace(/[^ACGTU]/g, '');
    if (seq.length === 0) return 0;
    let a = 0, c = 0, g = 0, t = 0, u = 0;
    for (let i = 0; i < seq.length; i++) {
        if (seq[i] === 'A') a++; else if (seq[i] === 'C') c++; else if (seq[i] === 'G') g++; else if (seq[i] === 'T') t++; else if (seq[i] === 'U') u++;
    }
    if (type === 'RNA') return (a * 329.21) + (c * 305.18) + (g * 345.21) + (u * 306.2) - 61.96;
    else return (a * 313.21) + (c * 289.18) + (g * 329.21) + (t * 304.2) - 61.96;
}

const calcSeqTm = (rawSeq) => {
    if (!rawSeq) return 0;
    const seq = rawSeq.replace(/\[.*?\]/g, '').toUpperCase().replace(/[^ACGT]/g, '');
    const len = seq.length;
    if (len < 2) return 0;
    const nnParams = {
        'AA': { dH: -7.9, dS: -22.2 }, 'TT': { dH: -7.9, dS: -22.2 },
        'AT': { dH: -7.2, dS: -20.4 }, 'TA': { dH: -7.2, dS: -21.3 },
        'CA': { dH: -8.5, dS: -22.7 }, 'TG': { dH: -8.5, dS: -22.7 },
        'GT': { dH: -8.4, dS: -22.4 }, 'AC': { dH: -8.4, dS: -22.4 },
        'CT': { dH: -7.8, dS: -21.0 }, 'AG': { dH: -7.8, dS: -21.0 },
        'GA': { dH: -8.2, dS: -22.2 }, 'TC': { dH: -8.2, dS: -22.2 },
        'CG': { dH: -10.6, dS: -27.2 }, 'GC': { dH: -9.8, dS: -24.4 },
        'GG': { dH: -8.0, dS: -19.9 }, 'CC': { dH: -8.0, dS: -19.9 }
    };
    let dH = 0.2; let dS = -5.7;
    if (seq[0] === 'A' || seq[0] === 'T') { dH += 2.2; dS += 6.9; }
    if (seq[len-1] === 'A' || seq[len-1] === 'T') { dH += 2.2; dS += 6.9; }
    for (let i = 0; i < len - 1; i++) {
        const pair = seq.substring(i, i + 2);
        if (nnParams[pair]) { dH += nnParams[pair].dH; dS += nnParams[pair].dS; }
    }
    dS = dS + 0.368 * (len - 1) * Math.log(0.05); // 50mM Na+
    const tm = (dH * 1000) / (dS + 1.987 * Math.log(0.25e-6 / 4)) - 273.15; // 0.25uM oligo
    return Math.max(0, tm);
}

// --- Computed Properties ---
const calculatedLength = computed(() => store.dnaCalc.sequence.replace(/\[.*?\]/g, '').replace(/[^a-zA-Z]/g, '').length)
const calculatedGc = computed(() => {
    const seq = store.dnaCalc.sequence.replace(/\[.*?\]/g, '').toUpperCase().replace(/[^ACGTU]/g, '');
    if (!seq.length) return 0;
    let gc = 0;
    for (let i = 0; i < seq.length; i++) if (seq[i] === 'G' || seq[i] === 'C') gc++;
    return (gc / seq.length) * 100;
})
const calculatedTm = computed(() => calcSeqTm(store.dnaCalc.sequence))
const calculatedExtinction = computed(() => calcSeqExtinction(store.dnaCalc.sequence, store.dnaCalc.type))
const calculatedMw = computed(() => calcSeqMw(store.dnaCalc.sequence, store.dnaCalc.type))
const activeMw = computed(() => store.dnaCalc.manualMw ? store.dnaCalc.manualMw : calculatedMw.value)

const dnaConcentration = computed(() => {
    if (!store.dnaCalc.a260) return 0;
    const l = store.dnaCalc.pathLength || 0.05;
    if (calculatedExtinction.value) return (store.dnaCalc.a260 / (calculatedExtinction.value * l)) * 1000000;
    if (store.dnaCalc.manualMw) return ((store.dnaCalc.a260 * 33 * (1/l)) * 1000) / store.dnaCalc.manualMw;
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
        manualMw: store.dnaCalc.manualMw || null, scope: store.inventoryMode
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
        </div>
    </div>
    
    <div class="input-group">
        <label>Sequence (5' to 3') <span class="icon-muted" style="font-size: 0.7rem;">[Modifications] allowed</span></label>
        <textarea v-model="store.dnaCalc.sequence" rows="3" placeholder="Paste sequence (ATGC...) or [DSPC]ATGC..."></textarea>
    </div>
    
    <div class="grid-2">
        <div class="input-group">
            <label>Manual Mass/Mw (Da)</label>
            <input type="number" v-model.number="store.dnaCalc.manualMw" step="any" placeholder="Optional override">
        </div>
        <div class="input-group">
            <label>Path Length (cm)</label>
            <input type="number" v-model.number="store.dnaCalc.pathLength" step="any" placeholder="e.g. 0.05">
        </div>
    </div>
    
    <div style="font-size: 0.85rem; background: var(--input-bg); padding: 10px; border-radius: var(--radius); margin-bottom: 15px; border: 1px solid var(--border);">
        <div class="grid-2">
            <div><i class="fas fa-ruler icon-muted"></i> Length: <strong>{{ calculatedLength }}</strong> nt</div>
            <div><i class="fas fa-chart-pie icon-muted"></i> GC Content: <strong>{{ store.formatNum(calculatedGc) }}</strong>%</div>
            <div><i class="fas fa-calculator icon-muted"></i> Ext. Coeff: <strong>{{ store.formatNum(calculatedExtinction) }}</strong> L/(mol·cm)</div>
            <div><i class="fas fa-weight-scale icon-muted"></i> Active Mw: <strong>{{ store.formatNum(activeMw) }}</strong> Da <span v-if="store.dnaCalc.manualMw" style="color: var(--primary);">(Manual)</span><span v-else>(Auto)</span></div>
            <div><i class="fas fa-temperature-half icon-muted"></i> Tm: <strong>{{ store.formatNum(calculatedTm) }}</strong> °C</div>
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
        <div class="input-group" style="margin-bottom: 15px;">
            <input type="text" v-model="store.dnaCalc.saveName" placeholder="Oligo Name">
        </div>
        <button style="width: 100%" @click="saveDnaToInventory" :disabled="!dnaConcentration || !store.dnaCalc.saveName">
            <i class="fas fa-download"></i> Save to Inventory
        </button>
    </div>
  </div>
</template>