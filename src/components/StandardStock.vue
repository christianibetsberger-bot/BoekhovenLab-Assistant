<script setup>
import { computed, ref } from 'vue'
import { useLabStore } from '../stores/labStore'

const store = useLabStore()
const saveScope = ref('Global')

// Computed Properties for the Calculator
const stdConcUnitStr = computed(() => {
    if (store.stdCalc.concUnit === 1) return 'M';
    if (store.stdCalc.concUnit === 0.001) return 'mM';
    if (store.stdCalc.concUnit === 0.000001) return 'µM';
    if (store.stdCalc.concUnit === 0.000000001) return 'nM';
    return 'µM';
})

const calculatedStdMass = computed(() => {
    if (store.stdCalc.type !== 'liquid' || !store.stdCalc.vol || !store.stdCalc.density) return null;
    let massInGrams = (store.stdCalc.vol * store.stdCalc.volUnit * 1000) * store.stdCalc.density;
    if (massInGrams >= 1) return store.formatNum(massInGrams) + ' g';
    if (massInGrams >= 1e-3) return store.formatNum(massInGrams * 1e3) + ' mg';
    return store.formatNum(massInGrams * 1e6) + ' µg';
})

const calculatedPureConc = computed(() => {
    if (store.stdCalc.type !== 'liquid' || !store.stdCalc.density || !store.stdCalc.mw) return null;
    const molarity = (store.stdCalc.density * 1000) / store.stdCalc.mw;
    if (molarity >= 1) return store.formatNum(molarity) + ' M';
    if (molarity >= 1e-3) return store.formatNum(molarity * 1e3) + ' mM';
    return store.formatNum(molarity * 1e6) + ' µM';
})

const calculatedStdVolume = computed(() => {
    if (!store.stdCalc.mw || !store.stdCalc.conc) return '0.000 µL';
    let massInGrams = 0;
    if (store.stdCalc.type === 'liquid') {
        if (!store.stdCalc.vol || !store.stdCalc.density) return '0.000 µL';
        massInGrams = (store.stdCalc.vol * store.stdCalc.volUnit * 1000) * store.stdCalc.density;
    } else {
        if (!store.stdCalc.mass) return '0.000 µL';
        massInGrams = store.stdCalc.mass * store.stdCalc.massUnit;
    }
    const moles = massInGrams / store.stdCalc.mw;
    const concInMolar = store.stdCalc.conc * store.stdCalc.concUnit;
    const volumeInLiters = moles / concInMolar;
    if (volumeInLiters === Infinity || isNaN(volumeInLiters)) return 'Error';
    if (volumeInLiters >= 1) return store.formatNum(volumeInLiters) + ' L';
    if (volumeInLiters >= 1e-3) return store.formatNum(volumeInLiters * 1e3) + ' mL';
    if (volumeInLiters >= 1e-6) return store.formatNum(volumeInLiters * 1e6) + ' µL';
    return store.formatNum(volumeInLiters * 1e9) + ' nL';
})

// Save Method
const saveStdToInventory = () => {
    const newItem = {
        id: 'std_' + crypto.randomUUID(),
        code: store.stdCalc.saveCode || 'STD', 
        cas: store.stdCalc.saveCas, 
        itemClass: store.stdCalc.saveClass, 
        name: store.stdCalc.saveName, 
        stock: parseFloat(store.formatNum(store.stdCalc.conc)), 
        stockUnit: stdConcUnitStr.value, 
        location: '', 
        sublocation: '', 
        catalogNum: '', 
        unitSize: '', 
        scope: saveScope.value
    };
    store.inventory.unshift(newItem);
    store.saveItemToCloud(newItem);
    store.stdCalc.saveName = ''; store.stdCalc.saveCode = ''; store.stdCalc.saveCas = '';
}
</script>

<template>
  <div class="card">
    <h2><i class="fas fa-flask-vial"></i> Standard Stock Calculator</h2>
    
    <div style="display: flex; gap: 15px; margin-bottom: 15px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
        <label class="checkbox-label" style="font-weight: bold;"><input type="radio" value="solid" v-model="store.stdCalc.type"> Solid (Mass)</label>
        <label class="checkbox-label" style="font-weight: bold;"><input type="radio" value="liquid" v-model="store.stdCalc.type"> Liquid (Volume & Density)</label>
    </div>

    <div class="input-group">
        <label>Molar Mass (Da / g/mol)</label>
        <input type="number" v-model.number="store.stdCalc.mw" placeholder="e.g. 500" step="any">
    </div>
    
    <div class="grid-2">
        <div class="input-group" v-if="store.stdCalc.type === 'solid'">
            <label>Amount (Mass)</label>
            <div class="input-with-select">
                <input type="number" v-model.number="store.stdCalc.mass" placeholder="5" step="any">
                <select v-model="store.stdCalc.massUnit">
                    <option :value="1">g</option>
                    <option :value="0.001">mg</option>
                    <option :value="0.000001">µg</option>
                    <option :value="0.000000001">ng</option>
                </select>
            </div>
        </div>
        
        <div v-else style="display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; gap: 10px;">
                <div class="input-group" style="flex-grow: 1; margin-bottom: 0;">
                    <label>Density (g/mL)</label>
                    <input type="number" v-model.number="store.stdCalc.density" placeholder="e.g. 1.2" step="any">
                </div>
                <div class="input-group" style="flex-grow: 1; margin-bottom: 0;">
                    <label>Amount (Volume)</label>
                    <div class="input-with-select">
                        <input type="number" v-model.number="store.stdCalc.vol" placeholder="10" step="any">
                        <select v-model="store.stdCalc.volUnit" style="width: 65px; border-left: 1px solid var(--border);">
                            <option :value="1">L</option>
                            <option :value="0.001">mL</option>
                            <option :value="0.000001">µL</option>
                        </select>
                    </div>
                </div>
            </div>
            <div v-if="calculatedStdMass" style="font-size: 0.8rem; background: var(--summary-bg); padding: 8px; border-radius: var(--radius); border: 1px solid var(--border);">
                Calculated Mass: <strong style="color: var(--primary);">{{ calculatedStdMass }}</strong>
                <span v-if="calculatedPureConc"> | Pure Conc: <strong style="color: var(--primary);">{{ calculatedPureConc }}</strong></span>
            </div>
        </div>

        <div class="input-group">
            <label>Target Conc</label>
            <div class="input-with-select">
                <input type="number" v-model.number="store.stdCalc.conc" placeholder="10" step="any">
                <select v-model="store.stdCalc.concUnit">
                    <option :value="1">M</option>
                    <option :value="0.001">mM</option>
                    <option :value="0.000001">µM</option>
                    <option :value="0.000000001">nM</option>
                </select>
            </div>
        </div>
    </div>

    <div class="summary-panel" style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px; margin-bottom: 15px;">
        <strong><i class="fas fa-fill-drip" style="color: var(--primary)"></i> Req. Total Volume: </strong> 
        <span style="font-size: 1.4rem; color: var(--primary); font-weight: bold;">{{ calculatedStdVolume }}</span>
    </div>

    <div style="background: var(--panel-bg); padding: 15px; border: 1px solid var(--border); border-radius: var(--radius);">
        <h4>Save Stock to Inventory</h4>
        <div class="grid-2" style="margin-bottom: 10px;">
            <div class="input-group" style="margin: 0;">
                <input type="text" v-model="store.stdCalc.saveCode" placeholder="Code (e.g., C-01)">
            </div>
            <div class="input-group" style="margin: 0;">
                <input type="text" v-model="store.stdCalc.saveCas" placeholder="CAS (Optional)">
            </div>
        </div>
        <div class="grid-2" style="margin-bottom: 15px;">
            <div class="input-group" style="margin: 0;">
                <input type="text" v-model="store.stdCalc.saveName" placeholder="Compound Name">
            </div>
            <div class="input-group" style="margin: 0;">
                <select v-model="store.stdCalc.saveClass">
                    <option v-for="cls in store.classOptions" :key="cls" :value="cls">{{ cls }}</option>
                </select>
            </div>
        </div>
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;padding:7px 10px;background:var(--input-bg);border-radius:6px;border:1px solid var(--border);">
            <span style="font-size:0.73rem;opacity:0.6;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;">Save to:</span>
            <label class="checkbox-label"><input type="radio" value="Global" v-model="saveScope"> Global</label>
            <label class="checkbox-label"><input type="radio" value="Personal" v-model="saveScope"> Personal</label>
        </div>
        <button style="width: 100%" @click="saveStdToInventory" :disabled="!store.stdCalc.conc || !store.stdCalc.saveName">
            <i class="fas fa-download"></i> Save As Stock
        </button>
    </div>
  </div>
</template>