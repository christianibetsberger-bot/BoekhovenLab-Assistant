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

// Format a volume given in litres into a human-friendly string.
const fmtVol = (L) => {
    if (L == null || isNaN(L) || !isFinite(L)) return '—';
    if (L >= 1) return store.formatNum(L) + ' L';
    if (L >= 1e-3) return store.formatNum(L * 1e3) + ' mL';
    if (L >= 1e-6) return store.formatNum(L * 1e6) + ' µL';
    return store.formatNum(L * 1e9) + ' nL';
}

// Total required stock volume, as a raw number in litres (null if inputs incomplete).
const stdTotalVolumeL = computed(() => {
    if (!store.stdCalc.mw || !store.stdCalc.conc) return null;
    let massInGrams = 0;
    if (store.stdCalc.type === 'liquid') {
        if (!store.stdCalc.vol || !store.stdCalc.density) return null;
        massInGrams = (store.stdCalc.vol * store.stdCalc.volUnit * 1000) * store.stdCalc.density;
    } else {
        if (!store.stdCalc.mass) return null;
        massInGrams = store.stdCalc.mass * store.stdCalc.massUnit;
    }
    const moles = massInGrams / store.stdCalc.mw;
    const concInMolar = store.stdCalc.conc * store.stdCalc.concUnit;
    const V = moles / concInMolar;
    return (isFinite(V) && V > 0) ? V : null;
})

const calculatedStdVolume = computed(() => {
    if (!store.stdCalc.mw || !store.stdCalc.conc) return '0.000 µL';
    const V = stdTotalVolumeL.value;
    return V == null ? '0.000 µL' : fmtVol(V);
})

// ── Buffer diluent ─────────────────────────────────────────────────────────────
// Prepare the stock in buffer instead of pure water: take a concentrated buffer stock
// and dilute it to the desired in-stock buffer concentration, filling the rest with water.
const bufferItems = computed(() => store.inventory.filter(i => i.itemClass === 'Buffer'))

const UNIT_MULT = { 'M': 1, 'mM': 0.001, 'µM': 0.000001, 'uM': 0.000001, 'nM': 1e-9, '×': 1, 'x': 1, 'X': 1 }
const onBufferSelect = () => {
    const item = store.inventory.find(i => i.id === store.stdCalc.bufferItemId)
    if (item) {
        store.stdCalc.bufferStockConc = item.stock ?? null
        // Normalise the inventory unit string to one our selector offers.
        const u = item.stockUnit || 'mM'
        store.stdCalc.bufferStockUnit = ['M','mM','µM','nM','×'].includes(u) ? u : (u === 'uM' ? 'µM' : (UNIT_MULT[u] != null ? '×' : 'mM'))
    }
}

const bufferStockConcM = computed(() => (store.stdCalc.bufferStockConc || 0) * (UNIT_MULT[store.stdCalc.bufferStockUnit] ?? 1))
const bufferTargetConcM = computed(() => (store.stdCalc.bufferTargetConc || 0) * (UNIT_MULT[store.stdCalc.bufferTargetUnit] ?? 1))

// Volume of the liquid compound itself (litres) — it occupies part of the total.
const compoundVolumeL = computed(() =>
    store.stdCalc.type === 'liquid' && store.stdCalc.vol ? store.stdCalc.vol * store.stdCalc.volUnit : 0
)

// Buffer stock volume needed = total × (desired buffer conc / buffer stock conc).
const bufferVolumeL = computed(() => {
    if (store.stdCalc.diluent !== 'buffer') return null
    const Vt = stdTotalVolumeL.value
    if (!Vt || !bufferStockConcM.value || !bufferTargetConcM.value) return null
    return Vt * (bufferTargetConcM.value / bufferStockConcM.value)
})

// Water to fill up to the total volume (litres). Accounts for the liquid compound volume.
const fillWaterVolumeL = computed(() => {
    const Vt = stdTotalVolumeL.value
    if (!Vt) return null
    const buf = store.stdCalc.diluent === 'buffer' ? (bufferVolumeL.value || 0) : 0
    return Vt - buf - compoundVolumeL.value
})

// Warnings: desired buffer conc can't exceed the stock, and buffer+compound can't exceed total.
const bufferWarning = computed(() => {
    if (store.stdCalc.diluent !== 'buffer' || !stdTotalVolumeL.value) return ''
    if (bufferStockConcM.value && bufferTargetConcM.value && bufferTargetConcM.value > bufferStockConcM.value)
        return 'Desired buffer concentration exceeds the buffer stock — dilution is impossible.'
    if (fillWaterVolumeL.value != null && fillWaterVolumeL.value < -1e-15)
        return 'Buffer (plus compound volume) exceeds the total volume — reduce the buffer concentration.'
    return ''
})

// Build the preparation summary stored on the inventory item's notes/info field.
const buildStockNotes = () => {
    const lines = ['Prepared with Standard Stock Calculator'];
    if (stdTotalVolumeL.value) lines.push(`Total volume: ${fmtVol(stdTotalVolumeL.value)}`);
    if (store.stdCalc.diluent === 'buffer') {
        const src = store.inventory.find(i => i.id === store.stdCalc.bufferItemId);
        if (store.stdCalc.bufferTargetConc)
            lines.push(`Buffer conc: ${store.formatNum(store.stdCalc.bufferTargetConc)} ${store.stdCalc.bufferTargetUnit}${src ? ` (${src.name})` : ''}`);
        if (bufferVolumeL.value != null)
            lines.push(`Buffer volume: ${fmtVol(bufferVolumeL.value)} (from ${store.formatNum(store.stdCalc.bufferStockConc)} ${store.stdCalc.bufferStockUnit} stock)`);
        if (fillWaterVolumeL.value != null)
            lines.push(`Fill-up water: ${fmtVol(fillWaterVolumeL.value)}`);
    } else {
        lines.push('Diluent: water');
        if (fillWaterVolumeL.value != null) lines.push(`Water volume: ${fmtVol(fillWaterVolumeL.value)}`);
    }
    if (store.stdCalc.pH != null && store.stdCalc.pH !== '') lines.push(`pH: ${store.stdCalc.pH}`);
    return lines.join('\n');
}

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
        notes: buildStockNotes(),
        pH: (store.stdCalc.pH != null && store.stdCalc.pH !== '') ? store.stdCalc.pH : null,
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

    <!-- Diluent: pure water or a buffer, plus pH -->
    <div style="display: flex; gap: 15px; align-items: center; margin-top: 12px; margin-bottom: 10px; flex-wrap: wrap;">
        <span style="font-size: 0.8rem; font-weight: bold; opacity: 0.75;">Diluent:</span>
        <label class="checkbox-label"><input type="radio" value="water" v-model="store.stdCalc.diluent"> Water</label>
        <label class="checkbox-label"><input type="radio" value="buffer" v-model="store.stdCalc.diluent"> Buffer</label>
        <div style="display: flex; align-items: center; gap: 6px; margin-left: auto;">
            <span style="font-size: 0.8rem; font-weight: bold; opacity: 0.75;">pH:</span>
            <input type="number" step="any" v-model.number="store.stdCalc.pH" placeholder="e.g. 7.4" style="width: 90px;">
        </div>
    </div>

    <div v-if="store.stdCalc.diluent === 'buffer'" style="background: var(--panel-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 10px;">
        <div class="input-group" style="margin: 0;">
            <label>Buffer (from inventory)</label>
            <select v-model="store.stdCalc.bufferItemId" @change="onBufferSelect">
                <option value="">— Manual entry —</option>
                <option v-for="b in bufferItems" :key="b.id" :value="b.id">
                    {{ b.code ? '[' + b.code + '] ' : '' }}{{ b.name }} ({{ store.formatNum(b.stock) }} {{ b.stockUnit || 'µM' }})
                </option>
            </select>
        </div>
        <div class="grid-2">
            <div class="input-group" style="margin: 0;">
                <label>Buffer stock conc</label>
                <div class="input-with-select">
                    <input type="number" step="any" v-model.number="store.stdCalc.bufferStockConc" placeholder="e.g. 10">
                    <select v-model="store.stdCalc.bufferStockUnit">
                        <option value="M">M</option>
                        <option value="mM">mM</option>
                        <option value="µM">µM</option>
                        <option value="nM">nM</option>
                        <option value="×">×</option>
                    </select>
                </div>
            </div>
            <div class="input-group" style="margin: 0;">
                <label>Desired buffer conc in stock</label>
                <div class="input-with-select">
                    <input type="number" step="any" v-model.number="store.stdCalc.bufferTargetConc" placeholder="e.g. 1">
                    <select v-model="store.stdCalc.bufferTargetUnit">
                        <option value="M">M</option>
                        <option value="mM">mM</option>
                        <option value="µM">µM</option>
                        <option value="nM">nM</option>
                        <option value="×">×</option>
                    </select>
                </div>
            </div>
        </div>
        <p v-if="bufferWarning" style="margin: 0; font-size: 0.78rem; color: #ef4444; display: flex; align-items: center; gap: 6px;">
            <i class="fas fa-triangle-exclamation"></i> {{ bufferWarning }}
        </p>
    </div>

    <div class="summary-panel" style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px; margin-bottom: 15px;">
        <strong><i class="fas fa-fill-drip" style="color: var(--primary)"></i> Req. Total Volume: </strong>
        <span style="font-size: 1.4rem; color: var(--primary); font-weight: bold;">{{ calculatedStdVolume }}</span>
    </div>

    <!-- Buffer / water breakdown -->
    <div v-if="store.stdCalc.diluent === 'buffer' && stdTotalVolumeL" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
        <div style="background: var(--input-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px; text-align: center;">
            <div style="font-size: 0.72rem; opacity: 0.65; text-transform: uppercase; letter-spacing: 0.03em;">Buffer volume</div>
            <div style="font-size: 1.15rem; font-weight: bold; color: var(--primary);">{{ fmtVol(bufferVolumeL) }}</div>
            <div style="font-size: 0.68rem; opacity: 0.6;">from {{ store.formatNum(store.stdCalc.bufferStockConc) }} {{ store.stdCalc.bufferStockUnit }} stock</div>
        </div>
        <div style="background: var(--input-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px; text-align: center;">
            <div style="font-size: 0.72rem; opacity: 0.65; text-transform: uppercase; letter-spacing: 0.03em;">Fill-up water</div>
            <div style="font-size: 1.15rem; font-weight: bold; color: var(--primary);"
                 :style="{ color: (fillWaterVolumeL != null && fillWaterVolumeL < 0) ? '#ef4444' : 'var(--primary)' }">
                {{ fmtVol(fillWaterVolumeL) }}
            </div>
            <div v-if="store.stdCalc.type === 'liquid' && compoundVolumeL" style="font-size: 0.68rem; opacity: 0.6;">after {{ fmtVol(compoundVolumeL) }} compound</div>
        </div>
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