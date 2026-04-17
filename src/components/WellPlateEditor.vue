<script setup>
import { ref, nextTick } from 'vue'
import { useLabStore } from '../stores/labStore'

const store = useLabStore()
const activeDropdown = ref(null)

// --- Helper Functions ---
const getPlateRows = (format) => { 
    if (format === 'ibidi') return 3; if (format === 'pcr8') return 1; 
    return format === 384 ? 16 : (format === 48 ? 6 : (format === 24 ? 4 : 8)); 
}
const getPlateCols = (format) => { 
    if (format === 'ibidi') return 6; if (format === 'pcr8') return 8; 
    return format === 384 ? 24 : (format === 48 ? 8 : (format === 24 ? 6 : 12)); 
}
const getWellId = (r, c) => { return String.fromCharCode(65 + r) + (c + 1); }

const filterBlockInventory = (query, scope) => {
    const term = query ? query.toLowerCase() : '';
    const targetScope = scope || 'Global';
    return store.inventory.filter(item => 
        (item.scope === targetScope || (!item.scope && targetScope === 'Global')) &&
        ((!term) || (item.name && item.name.toLowerCase().includes(term)) || (item.code && item.code.toLowerCase().includes(term)) || (item.cas && item.cas.toLowerCase().includes(term)))
    );
}

// --- Plate Management Actions ---
const addWellPlate = () => { 
    store.wellPlates.unshift({ id: store.nextPlateId++, name: 'New Plate', format: 96, selectedWell: null, targetLabware: '201812181400', wells: {} }); 
}
const removeWellPlate = (index) => { store.wellPlates.splice(index, 1); }
const archivePlate = (index) => {
    if(confirm("Archive this well plate?")) store.archivedPlates.push(store.wellPlates.splice(index, 1)[0]);
}
const duplicateWellPlate = (index) => {
    const copy = JSON.parse(JSON.stringify(store.wellPlates[index]));
    copy.id = store.nextPlateId++; copy.name += ' (Copy)';
    store.wellPlates.splice(index + 1, 0, copy);
}
const updateDefaultLabware = (plate) => {
    if (plate.format === 384) plate.targetLabware = '201901101700';
    else if (plate.format === 96) plate.targetLabware = '201812181400';
    else if (plate.format === 24) plate.targetLabware = '201901101715';
    else plate.targetLabware = '';
}

// --- Editor Logic ---
const selectWell = (plate, wellId) => {
    plate.selectedWell = wellId;
    nextTick(() => {
        const editor = document.getElementById('wellEditor_' + plate.id);
        if (editor) editor.innerHTML = plate.wells[wellId] || '';
    });
}
const updateWellContent = (plate, event) => {
    if (!plate.selectedWell) return;
    plate.wells[plate.selectedWell] = event.target.innerHTML;
}
const formatWellDoc = (plate, cmd, value = null) => {
    const editor = document.getElementById('wellEditor_' + plate.id);
    if (editor) editor.focus();
    document.execCommand(cmd, false, value);
    updateWellContent(plate, { target: editor });
}
const insertInventoryRefToWell = (plate) => {
    if (!store.selectedWellInvRef || !plate.selectedWell) return;
    const item = store.inventory.find(i => i.id === store.selectedWellInvRef);
    const editor = document.getElementById('wellEditor_' + plate.id);
    if (item && editor) {
        editor.focus();
        const html = `&nbsp;<span class="inv-ref" contenteditable="false" data-labware=""><i class="fas fa-tag"></i>&nbsp;[${item.code}] ${item.name} (${store.formatNum(item.stock)} ${item.stockUnit || 'µM'})&nbsp;<i class="fas fa-times" style="cursor:pointer; margin-left:4px; opacity: 0.7;" onclick="let ce = this.closest('[contenteditable]'); this.parentElement.remove(); if(ce) ce.dispatchEvent(new Event('input', {bubbles: true}));" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7"></i></span>&nbsp;`;
        document.execCommand('insertHTML', false, html);
        plate.wells[plate.selectedWell] = editor.innerHTML;
    }
    store.selectedWellInvRef = '';
}

// --- Integrations ---
const savePlateToJournal = (plate) => {
    const activeJournalEntry = store.journal.entries.find(e => e.id === store.journal.activeId);
    if (!activeJournalEntry) { alert("Please select an active journal entry first."); return; }
    
    let html = `<br><br><div style="border: 1px solid var(--border); padding: 15px; border-radius: var(--radius); background: var(--surface);">`;
    html += `<h3 style="margin-top: 0; color: var(--primary);"><i class="fas fa-border-all"></i> Plate Map: ${plate.name} (${plate.format}-Well)</h3>`;
    html += `<div class="table-responsive"><table style="width: 100%; border-collapse: collapse; font-size: 0.75rem; text-align: left; border: 1px solid var(--border);">`;
    
    const rows = getPlateRows(plate.format);
    const cols = getPlateCols(plate.format);
    
    html += `<tr><th style="border: 1px solid var(--border); background: var(--summary-bg); padding: 4px; text-align: center;"></th>`;
    for (let c = 0; c < cols; c++) html += `<th style="border: 1px solid var(--border); background: var(--summary-bg); padding: 4px; text-align: center; min-width: 80px;">${c + 1}</th>`;
    html += `</tr>`;
    
    let filledWells = 0;
    for (let r = 0; r < rows; r++) {
        const rowLabel = String.fromCharCode(65 + r);
        html += `<tr><th style="border: 1px solid var(--border); background: var(--summary-bg); padding: 4px; text-align: center;">${rowLabel}</th>`;
        for (let c = 0; c < cols; c++) {
            const wId = getWellId(r, c);
            const content = plate.wells[wId];
            if (content && content.trim() !== '') filledWells++;
            html += `<td style="border: 1px solid var(--border); padding: 4px; vertical-align: top;">${content || ''}</td>`;
        }
        html += `</tr>`;
    }
    html += `</table></div>`;
    if (filledWells === 0) html += `<p style="opacity: 0.7; font-style: italic; margin-top: 10px;">Plate is completely empty.</p>`;
    html += `</div><br>`;
    
    activeJournalEntry.content += html;
    alert(`Successfully appended Plate Map to Lab Journal!`);
}

// --- Andrew+ Export Engine ---
const exportAndrewPlus = (plate) => {
    if (plate.format === 'ibidi' || plate.format === 'pcr8') {
        alert("Export to Andrew+ is not available for Ibidi gamma chambers or 8 PCR strips.");
        return;
    }
    if (!plate || !plate.wells || Object.keys(plate.wells).length === 0) {
        alert("Plate is empty.");
        return;
    }

    const md5 = function(d) {
        let r = /[\x80-\xFF]/g;
        if (r.test(d)) d = unescape(encodeURI(d));
        let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476;
        const rots = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
        const k = [];
        for (let i = 0; i <= 63; i++) k[i] = (Math.abs(Math.sin(i + 1)) * 0x100000000) | 0;
        let words = [];
        for (let i = 0; i < d.length; i++) words[i >> 2] |= (d.charCodeAt(i) & 0xFF) << ((i % 4) * 8);
        let len = d.length * 8;
        words[len >> 5] |= 0x80 << (len % 32);
        words[(((len + 64) >>> 9) << 4) + 14] = len;
        for (let i = 0; i < words.length; i += 16) {
            let a = h0, b = h1, c = h2, d2 = h3;
            for (let j = 0; j <= 63; j++) {
                let f, g = j;
                if (j < 16) { f = (b & c) | ((~b) & d2); }
                else if (j < 32) { f = (d2 & b) | ((~d2) & c); g = (5 * j + 1) % 16; }
                else if (j < 48) { f = b ^ c ^ d2; g = (3 * j + 5) % 16; }
                else { f = c ^ (b | (~d2)); g = (7 * j) % 16; }
                let temp = d2; d2 = c; c = b;
                let x = a + f + k[j] + (words[i + g] || 0);
                let rot = rots[(Math.floor(j / 16) * 4) + (j % 4)];
                b = b + ((x << rot) | (x >>> (32 - rot)));
                a = temp;
            }
            h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d2) | 0;
        }
        const hex = (x) => {
            let s = '';
            for (let i = 0; i < 4; i++) s += ((x >> (i * 8)) & 0xFF).toString(16).padStart(2, '0');
            return s;
        };
        return hex(h0) + hex(h1) + hex(h2) + hex(h3);
    };

    const transfers = [];
    const parser = new DOMParser();

    for (const [wId, html] of Object.entries(plate.wells)) {
        if (!html || html.trim() === '') continue;
        const doc = parser.parseFromString(html, 'text/html');

        const row = wId.charCodeAt(0) - 64;
        const col = parseInt(wId.substring(1));
        const destCavity = { row, column: col };

        const refs = doc.querySelectorAll('.inv-ref');
        refs.forEach(ref => {
            let text = ref.innerText;
            let labwareAttr = ref.getAttribute('data-labware');
            let labwareUuid = (labwareAttr && labwareAttr.trim() !== '') ? labwareAttr : 'eda1c3ac-a089-4244-b0bc-9e5beb322475';

            let nameMatch = text.match(/\]\s*(.*?)\s*\(/);
            let name = nameMatch ? nameMatch[1].trim() : text.replace(/\[.*?\]/, '').replace(/\(.*?\)/, '').trim();

            let concValue = 100; let concUnit = "uM";
            let concMatch = text.match(/\(([\d\.,]+)\s*([^)]+)\)/);
            if (concMatch) {
                concValue = parseFloat(concMatch[1].replace(',', '.'));
                concUnit = concMatch[2].trim().replace('µ', 'u');
            }

            let nextText = ref.nextSibling ? ref.nextSibling.textContent : "";
            let volMatch = nextText.match(/([\d\.]+)\s*(µL|mL|L)/);
            if (name && volMatch) {
                let vol = parseFloat(volMatch[1]);
                if (volMatch[2] === 'mL') vol *= 1000;
                if (volMatch[2] === 'L') vol *= 1000000;
                if (vol > 0) transfers.push({ sourceName: name, destCavity, volume: vol, type: 'reagent', concValue: concValue, concUnit: concUnit, labwareUuid: labwareUuid });
            }
        });

        const strongs = doc.querySelectorAll('strong');
        strongs.forEach(st => {
            if (st.innerText.includes('MQ H₂O') || st.innerText.includes('MQ Water')) {
                let volText = "";
                if (st.nextElementSibling && st.nextElementSibling.tagName === 'SPAN') volText = st.nextElementSibling.innerText;
                else if (st.nextSibling && st.nextSibling.nodeType === Node.TEXT_NODE) volText = st.nextSibling.textContent;
                
                let volMatch = volText.match(/([\d\.]+)\s*(µL|mL|L)/);
                if (volMatch) {
                    let vol = parseFloat(volMatch[1]);
                    if(volMatch[2] === 'mL') vol *= 1000;
                    if(volMatch[2] === 'L') vol *= 1000000;
                    if (vol > 0) transfers.push({ sourceName: 'Water', destCavity, volume: vol, type: 'water', labwareUuid: '201812181100' });
                }
            }
        });
    }

    if (transfers.length === 0) { alert("No pipetting transfers found in the plate."); return; }

    const generateHex = (len) => [...Array(len)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    const generateUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });

    const targetPlateRef = generateHex(16);
    const waterLabwareRef = generateHex(16);
    const waterReagentRef = generateHex(16);

    let defaultTargetUuid = plate.format === 384 ? '201901101700' : (plate.format === 24 ? '201901101715' : '201812181400');
    const targetLabwareUuid = plate.targetLabware || defaultTargetUuid;

    const labwares = [
        {
            ref: targetPlateRef, name: plate.name || "Target Plate", presentation: { position: { x: 3810, y: 3940 } },
            isTarget: false, throwAwayTipsAfterUse: false, labware: { uuid: targetLabwareUuid } 
        }
    ];

    const reagents = [];
    const sourceMap = {}; 
    const sourceDataMap = {};

    transfers.forEach(t => {
        if (t.type === 'reagent' && !sourceDataMap[t.sourceName]) sourceDataMap[t.sourceName] = { concValue: t.concValue, concUnit: t.concUnit };
        const sourceKey = t.sourceName + '_' + t.labwareUuid;
        if (!sourceMap[sourceKey]) {
            sourceMap[sourceKey] = {
                labwareRef: t.type === 'water' ? waterLabwareRef : generateHex(16),
                reagentRef: t.type === 'water' ? waterReagentRef : generateHex(16),
                labwareUuid: t.labwareUuid, sourceName: t.sourceName, isWater: t.type === 'water'
            };
        }
        t.sourceKey = sourceKey;
    });

    let idx = 0;
    for (const [key, data] of Object.entries(sourceMap)) {
        labwares.push({
            ref: data.labwareRef, name: data.isWater ? "Water" : data.sourceName,
            presentation: { position: { x: 3860 + (idx * 220 % 800), y: 3700 + Math.floor(idx/4)*180 } },
            isTarget: false, throwAwayTipsAfterUse: false, labware: { uuid: data.labwareUuid } 
        });

        const reagentPayload = {
            uuid: data.isWater ? "44fb2f8b-7d33-4bc0-8b51-0a1fd26b63ec" : generateUUID(), 
            name: data.isWater ? "Water" : data.sourceName,
            concentrationValue: data.isWater ? "1.000" : (sourceDataMap[data.sourceName] ? sourceDataMap[data.sourceName].concValue.toString() : "100.000"),
            concentrationUnit: data.isWater ? "au" : (sourceDataMap[data.sourceName] ? sourceDataMap[data.sourceName].concUnit : "uM"),
            color: Math.floor(Math.random() * 16777215), sample: false
        };

        if (!data.isWater) { reagentPayload.description = ""; reagentPayload.link = ""; }
        reagents.push({ isReagent: true, ref: data.reagentRef, reagent: reagentPayload });
        idx++;
    }

    const initialVolumes = {};
    transfers.forEach(t => { initialVolumes[t.sourceKey] = (initialVolumes[t.sourceKey] || 0) + t.volume; });

    const labwareStates = {};
    labwareStates[targetPlateRef] = { labwareRef: targetPlateRef, cavityStates: {}, inError: false };

    for (const [key, data] of Object.entries(sourceMap)) {
        const totalVol = Number((initialVolumes[key] * 1.2).toFixed(3)); 
        labwareStates[data.labwareRef] = {
            labwareRef: data.labwareRef,
            cavityStates: {
                "1-1": {
                    cavity: { row: 1, column: 1 },
                    solution: {
                        volume: { value: totalVol, unit: "uL" },
                        color: reagents.find(r => r.ref === data.reagentRef).reagent.color,
                        content: {
                            [data.reagentRef]: {
                                reagentRef: data.reagentRef, origins: [`${data.labwareRef}_A1`], dilutionFactor: 1,
                                volume: { value: totalVol, unit: "uL" }, color: reagents.find(r => r.ref === data.reagentRef).reagent.color
                            }
                        }
                    },
                    auto: true
                }
            },
            inError: false
        };
    }

    const steps = [{ index: 0, state: { labwareStates, errors: [], warnings: [] }, ref: generateHex(16), groupStepRefs: [] }];

    const groupedTransfers = {};
    transfers.forEach(t => {
        const formattedVol = Number(t.volume.toFixed(3));
        const key = `${t.sourceKey}_${formattedVol}`;
        if (!groupedTransfers[key]) groupedTransfers[key] = { sourceKey: t.sourceKey, volume: formattedVol, cavities: [] };
        groupedTransfers[key].cavities.push(t.destCavity);
    });

    let stepIdx = 1;
    for (const group of Object.values(groupedTransfers)) {
        const srcData = sourceMap[group.sourceKey];
        steps.push({
            index: stepIdx++, actionTypeId: "PIPETTING",
            action: {
                type: "PIPETTING",
                sources: [{ labwareRef: srcData.labwareRef, cavities: [{ row: 1, column: 1 }], customPipettingPolicy: false }],
                destinations: [{ labwareRef: targetPlateRef, cavities: group.cavities, customPipettingPolicy: false }],
                params: {
                    volume: { value: group.volume, unit: "uL" }, mode: "forward", aspirationSpeed: "normal", dispensingSpeed: "normal",
                    airTopCushion: false, airBottomCushion: false, tipChangeBeginning: true, tipChangeBetween: true, tipWithFilter: false,
                    movingSpeed: "normal", verifyTip: false, blowOut: true, blowOutPause: false, tipTouch: false, armSpeed: "normal",
                    preciseAspirationSpeed: 5, preciseDispensingSpeed: 5, preciseFluidicSpeedEnabled: false
                },
                mixingSource: { enabled: false, times: 3, speed: "normal", volume: { value: 0, unit: "uL" }, preciseSpeed: 5, preciseSpeedEnabled: false },
                tipPositionSource: { position: "liquid", customHeight: false, customHeightValue: 0, avoidTouch: false },
                mixingDest: { enabled: false, times: 3, speed: "normal", volume: { value: 0, unit: "uL" }, preciseSpeed: 5, preciseSpeedEnabled: false },
                tipPositionDest: { position: "bottom", customHeight: false, customHeightValue: 0, avoidTouch: false }
            },
            ref: generateHex(16), groupStepRefs: []
        });
    }

    const baseProtocol = {
        name: plate.name || "Exported Protocol", description: "Exported from BoekhovenLab Calculator",
        params: { pipettingPolicy: "rbr", filterTips: false, safeTipOverfly: false }, errors: 0,
        steps: steps, labwares: labwares, reagents: reagents, samples: [], pipettingPolicy: "rbr", isDynamic: false, version: "1.2.0"
    };

    const jsonStr = JSON.stringify(baseProtocol);
    baseProtocol.checksum = md5(jsonStr);

    const blob = new Blob([JSON.stringify(baseProtocol)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `AndrewPlus_${plate.name.replace(/\s+/g, '_')}.onp`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}
</script>

<template>
  <div class="card">
    <div class="flex-between" style="border-bottom: 2px solid var(--bg); padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between;">
        <h2 style="border: none; padding: 0; margin: 0;"><i class="fas fa-border-all"></i> Well Plate</h2>
        <button @click="addWellPlate" class="small"><i class="fas fa-plus"></i> New Plate</button>
    </div>

    <div v-for="(plate, pIndex) in store.wellPlates" :key="plate.id" style="background: var(--panel-bg); border: 1px solid var(--border); padding: 20px; border-radius: var(--radius); margin-bottom: 30px;">
        <div class="flex-between" style="margin-bottom: 20px; display: flex; justify-content: space-between;">
            <input type="text" v-model="plate.name" style="font-size: 1.2rem; font-weight: bold; width: 40%; background: transparent; border: none; border-bottom: 2px solid var(--primary); padding-left: 0; color: var(--primary);">
            <div style="display: flex; gap: 10px; align-items: center;">
                <select v-model="plate.format" @change="updateDefaultLabware(plate)" style="width: 120px; height: 32px; padding: 4px 8px; font-size: 0.85rem;">
                    <option :value="24">24-Well</option>
                    <option :value="48">48-Well</option>
                    <option :value="96">96-Well</option>
                    <option :value="384">384-Well</option>
                    <option :value="'ibidi'">Ibidi gamma chambers</option>
                    <option :value="'pcr8'">8 PCR strips</option>
                </select>
                <select v-model="plate.targetLabware" style="width: 180px; height: 32px; padding: 4px 8px; font-size: 0.8rem; margin-left: 10px;">
                    <option value="">Default Target Plate</option>
                    <option v-for="lw in store.targetLabwares.filter(l => l.format === plate.format)" :value="lw.uuid" :key="lw.uuid">{{ lw.name }}</option>
                </select>
                <button class="small" @click="savePlateToJournal(plate)" title="Append plate map to active journal entry"><i class="fas fa-file-import"></i> Log to Journal</button>
                <button class="small" @click="exportAndrewPlus(plate)" title="Export protocol for Andrew+"><i class="fas fa-robot"></i> Export Andrew+</button>
                <button class="secondary small" @click="duplicateWellPlate(pIndex)" style="margin-right: 5px;" title="Duplicate"><i class="fas fa-copy"></i></button>
                <button class="secondary small" @click="archivePlate(pIndex)" style="margin-right: 5px;" title="Archive"><i class="fas fa-box-archive"></i></button>
                <button class="danger small" @click="removeWellPlate(pIndex)"><i class="fas fa-trash"></i></button>
            </div>
        </div>

        <div class="plate-container">
            <div class="plate-grid" :style="{ gridTemplateColumns: `30px repeat(${getPlateCols(plate.format)}, minmax(${plate.format === 384 ? '20px' : '30px'}, 1fr))` }">
                <div></div>
                <div v-for="c in getPlateCols(plate.format)" :key="'h'+c" class="plate-label">{{ c }}</div>
                
                <template v-for="r in getPlateRows(plate.format)" :key="'r'+r">
                    <div class="plate-label">{{ String.fromCharCode(64 + r) }}</div>
                    <div v-for="c in getPlateCols(plate.format)" :key="'w'+r+'-'+c" 
                         :class="['well', { 'selected': plate.selectedWell === getWellId(r-1, c-1), 'has-content': plate.wells[getWellId(r-1, c-1)] && plate.wells[getWellId(r-1, c-1)].trim() !== '' }]"
                         @click="selectWell(plate, getWellId(r-1, c-1))"
                         :title="getWellId(r-1, c-1)">
                    </div>
                </template>
            </div>
        </div>

        <div v-if="plate.selectedWell" class="well-editor-panel">
            <div style="background: var(--summary-bg); padding: 8px 15px; border-bottom: 1px solid var(--border); font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
                <span><i class="fas fa-crosshairs"></i> Editing Well: <span style="color: var(--primary); font-size: 1.1rem;">{{ plate.selectedWell }}</span></span>
                <span style="font-size: 0.8rem; font-weight: normal; opacity: 0.7;">Click any well above to edit</span>
            </div>
            <div class="rtf-toolbar" style="border-bottom: 1px solid var(--border);">
                <button class="rtf-btn" @click.prevent="formatWellDoc(plate, 'bold')" title="Bold"><i class="fas fa-bold"></i></button>
                <button class="rtf-btn" @click.prevent="formatWellDoc(plate, 'italic')" title="Italic"><i class="fas fa-italic"></i></button>
                <button class="rtf-btn" @click.prevent="formatWellDoc(plate, 'underline')" title="Underline"><i class="fas fa-underline"></i></button>
                <div style="width: 1px; background: var(--border); margin: 0 4px; height: 24px;"></div>
                <div style="position: relative; margin-left: auto;" @click.stop>
                    <div @click="activeDropdown = activeDropdown === 'plate_ref_' + plate.id ? null : 'plate_ref_' + plate.id" style="padding: 4px 8px; font-size: 0.85rem; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; height: 32px; display: flex; align-items: center; gap: 6px;">
                        <span>+ Reference Stock</span>
                        <i class="fas fa-chevron-down" style="opacity: 0.5;"></i>
                    </div>
                    <div v-if="activeDropdown === 'plate_ref_' + plate.id" style="position: absolute; top: 100%; right: 0; z-index: 1000; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: var(--radius); min-width: 250px; display: flex; flex-direction: column;">
                        <div style="display: flex; gap: 5px; padding: 5px; border-bottom: 1px solid var(--border);">
                            <label class="checkbox-label" style="font-weight: bold; font-size: 0.75rem;"><input type="radio" value="Global" v-model="store.plateRefSearchScope"> Global</label>
                            <label class="checkbox-label" style="font-weight: bold; font-size: 0.75rem;"><input type="radio" value="Personal" v-model="store.plateRefSearchScope"> Personal</label>
                        </div>
                        <input type="text" v-model="store.wellRtfSearchQuery" placeholder="Search inventory..." style="margin: 5px; width: calc(100% - 10px); padding: 4px; border: 1px solid var(--border); border-radius: var(--radius);" @click.stop>
                        <div style="overflow-y: auto; max-height: 200px;">
                            <div v-for="inv in filterBlockInventory(store.wellRtfSearchQuery, store.plateRefSearchScope)" :key="inv.id" @mousedown.prevent="store.selectedWellInvRef = inv.id; insertInventoryRefToWell(plate); activeDropdown = null" style="padding: 6px 10px; cursor: pointer; font-size: 0.85rem; border-bottom: 1px solid var(--bg);" onmouseover="this.style.background='var(--summary-bg)'" onmouseout="this.style.background='transparent'">
                                [{{ inv.code }}] {{ inv.name }} ({{store.formatNum(inv.stock)}} {{inv.stockUnit || 'µM'}})
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="journal-textarea rtf-editor" 
                 contenteditable="true" 
                 placeholder="Type contents, concentrations, or insert stock references..."
                 style="border: none; border-radius: 0; outline: none; min-height: 100px;"
                 @input="updateWellContent(plate, $event)"
                 @blur="updateWellContent(plate, $event)"
                 :id="'wellEditor_' + plate.id">
            </div>
        </div>
        <div v-else style="margin-top: 15px; text-align: center; padding: 20px; background: var(--surface); border: 1px dashed var(--border); border-radius: var(--radius); opacity: 0.6;">
            Select a well to edit its contents.
        </div>
    </div>
  </div>
</template>