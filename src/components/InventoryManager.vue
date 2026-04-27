<script setup>
import { ref, computed } from 'vue'
import { useLabStore } from '../stores/labStore'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'

const store = useLabStore()

// Local state
const inventoryMode = ref('Global')
const importTargetMode = ref('Global')
const inventorySearch = ref('')
const viewingItem = ref(null)
const excelUpload = ref(null)

// --- Local Computed ---
const filteredInventory = computed(() => {
    const term = inventorySearch.value.toLowerCase();
    return store.inventory.filter(item =>
        (item.scope === inventoryMode.value || (!item.scope && inventoryMode.value === 'Global')) &&
        ((item.name && item.name.toLowerCase().includes(term)) ||
         (item.code && item.code.toLowerCase().includes(term)) ||
         (item.cas && item.cas.toLowerCase().includes(term)))
    );
})

// --- Math Functions (Needed for imports) ---
const calcSeqExtinction = (rawSeq, type) => {
    if (!rawSeq) return 0;
    const seq = rawSeq.replace(/\[.*?\]/g, '').toUpperCase().replace(/[^ACGTU]/g, '').replace(/U/g, 'T');
    if (seq.length === 0) return 0;
    if (type === 'RNA') {
        const indRNA = { 'A': 15300, 'C': 7200, 'G': 11800, 'T': 9300, 'U': 9300 };
        const nnRNA = {
            'AA': 27400, 'AC': 21000, 'AG': 25000, 'AU': 24000, 'CA': 21000, 'CC': 14200, 'CG': 17800, 'CU': 16200,
            'GA': 25200, 'GC': 17400, 'GG': 21600, 'GU': 21200, 'UA': 23200, 'UC': 16000, 'UG': 19000, 'UU': 18400,
            'AT': 24000, 'TA': 23200, 'CT': 16200, 'TC': 16000, 'GT': 21200, 'TG': 19000, 'TT': 18400
        };
        let e = 0; const cleanRNA = seq.replace(/T/g, 'U');
        for (let i = 0; i < cleanRNA.length - 1; i++) e += nnRNA[cleanRNA.substring(i, i + 2)] || 0;
        for (let i = 1; i < cleanRNA.length - 1; i++) e -= indRNA[cleanRNA[i]] || 0;
        return e;
    } else {
        const ind = { 'A': 15400, 'C': 7400, 'G': 11500, 'T': 8700 };
        const nn = {
            'AA': 27400, 'AC': 21200, 'AG': 25000, 'AT': 22800, 'CA': 21200, 'CC': 14600, 'CG': 18000, 'CT': 15200,
            'GA': 25200, 'GC': 17600, 'GG': 21600, 'GT': 20000, 'TA': 23400, 'TC': 16200, 'TG': 19000, 'TT': 16800
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
        'AA': { dH: -7.9, dS: -22.2 }, 'TT': { dH: -7.9, dS: -22.2 }, 'AT': { dH: -7.2, dS: -20.4 }, 'TA': { dH: -7.2, dS: -21.3 },
        'CA': { dH: -8.5, dS: -22.7 }, 'TG': { dH: -8.5, dS: -22.7 }, 'GT': { dH: -8.4, dS: -22.4 }, 'AC': { dH: -8.4, dS: -22.4 },
        'CT': { dH: -7.8, dS: -21.0 }, 'AG': { dH: -7.8, dS: -21.0 }, 'GA': { dH: -8.2, dS: -22.2 }, 'TC': { dH: -8.2, dS: -22.2 },
        'CG': { dH: -10.6, dS: -27.2 }, 'GC': { dH: -9.8, dS: -24.4 }, 'GG': { dH: -8.0, dS: -19.9 }, 'CC': { dH: -8.0, dS: -19.9 }
    };
    let dH = 0.2; let dS = -5.7;
    if (seq[0] === 'A' || seq[0] === 'T') { dH += 2.2; dS += 6.9; }
    if (seq[len-1] === 'A' || seq[len-1] === 'T') { dH += 2.2; dS += 6.9; }
    for (let i = 0; i < len - 1; i++) {
        const pair = seq.substring(i, i + 2);
        if (nnParams[pair]) { dH += nnParams[pair].dH; dS += nnParams[pair].dS; }
    }
    dS = dS + 0.368 * (len - 1) * Math.log(0.05);
    const tm = (dH * 1000) / (dS + 1.987 * Math.log(0.25e-6 / 4)) - 273.15;
    return Math.max(0, tm);
}

// --- Component Methods ---
const updateManualSequence = (item) => {
    if (!item.sequence) item.sequence = '';
    const cleanSeq = item.sequence.replace(/\[.*?\]/g, '').toUpperCase().replace(/[^ACGTU]/g, '');
    if (!item.oligoType) item.oligoType = 'DNA';
    item.length = cleanSeq.length;
    item.extinction = calcSeqExtinction(item.sequence, item.oligoType);
    const calcMw = calcSeqMw(item.sequence, item.oligoType);
    item.mw = item.manualMw ? item.manualMw : calcMw;
    item.tm = calcSeqTm(item.sequence);
    if (cleanSeq.length > 0) {
        let gcCount = 0;
        for (let i = 0; i < cleanSeq.length; i++) if (cleanSeq[i] === 'G' || cleanSeq[i] === 'C') gcCount++;
        item.gc = (gcCount / cleanSeq.length) * 100;
    } else item.gc = 0;
}

const calculatedGcFallback = (sequence) => {
    const seq = sequence.replace(/\[.*?\]/g, '').toUpperCase().replace(/[^ACGTU]/g, '');
    if (!seq.length) return 0;
    let gc = 0;
    for (let i = 0; i < seq.length; i++) if (seq[i] === 'G' || seq[i] === 'C') gc++;
    return (gc / seq.length) * 100;
}

const viewProperties = (item) => { viewingItem.value = item; }
const toggleScope = (item) => { item.scope = (item.scope || 'Global') === 'Personal' ? 'Global' : 'Personal'; }
const addInventoryItem = () => {
    const newItem = { id: 'inv_' + crypto.randomUUID(), code: 'NEW', cas: '', itemClass: 'Other', name: 'New Stock', stock: 100, stockUnit: 'µM', location: '', sequence: '', oligoType: 'DNA', manualMw: null, tm: 0, scope: inventoryMode.value };
    store.inventory.unshift(newItem);
    store.saveItemToCloud(newItem);
}
const removeInventoryItem = (id) => {
    const idx = store.inventory.findIndex(i => i.id === id);
    if (idx !== -1) store.inventory.splice(idx, 1);
    store.deleteItemFromCloud(id);
}
const createAliquot = (parentItem) => {
    let newItem = JSON.parse(JSON.stringify(parentItem));
    newItem.id = 'inv_aliq_' + crypto.randomUUID();
    newItem.scope = parentItem.scope || 'Global';
    let suffixNum = 1;
    let baseCode = parentItem.code;
    let newCode = `${baseCode}-A${suffixNum}`;
    while (store.inventory.some(i => i.code === newCode)) { suffixNum++; newCode = `${baseCode}-A${suffixNum}`; }
    newItem.code = newCode;
    store.inventory.unshift(newItem);
    store.saveItemToCloud(newItem);
}

const processImports = (importedItems, sourceName) => {
    if (importedItems.length === 0) return alert("No valid items found to import from " + sourceName + ".");
    let duplicates = []; let novelItems = [];
    for (let i = 0; i < importedItems.length; i++) {
        let newItem = importedItems[i];
        newItem.scope = importTargetMode.value;
        let cleanNewSeq = (newItem.sequence || '').replace(/\[.*?\]/g, '').toUpperCase().replace(/[^ACGTU]/g, '');
        let existingIdx = -1;
        if (cleanNewSeq.length > 0) {
            existingIdx = store.inventory.findIndex(existing => {
                let cleanExisting = (existing.sequence || '').replace(/\[.*?\]/g, '').toUpperCase().replace(/[^ACGTU]/g, '');
                let existingScope = existing.scope || 'Global';
                return existingScope === importTargetMode.value && cleanExisting === cleanNewSeq && cleanExisting.length > 0;
            });
        }
        if (existingIdx !== -1 && cleanNewSeq.length > 0) duplicates.push({ new: newItem, existingIdx: existingIdx });
        else novelItems.push(newItem);
    }
    let replacedCount = 0; let addedCount = novelItems.length;
    if (duplicates.length > 0) {
        let replaceAll = confirm(`Found ${duplicates.length} items with sequences already existing in the ${importTargetMode.value} inventory.\n\nClick 'OK' to REPLACE existing items.\nClick 'Cancel' to ADD them as duplicates.`);
        if (replaceAll) {
            duplicates.forEach(dup => {
                let existingItem = store.inventory[dup.existingIdx];
                dup.new.id = existingItem.id;
                store.inventory.splice(dup.existingIdx, 1, dup.new);
                store.saveItemToCloud(dup.new);
                replacedCount++;
            });
        } else {
            duplicates.forEach(dup => { store.inventory.unshift(dup.new); store.saveItemToCloud(dup.new); addedCount++; });
        }
    }
    novelItems.forEach(item => { store.inventory.unshift(item); store.saveItemToCloud(item); });
    alert(`Successfully added ${addedCount} new items and replaced ${replacedCount} items into ${importTargetMode.value} inventory from ${sourceName}!`);
}

const importInventory = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    if (file.name.toLowerCase().endsWith('.txt')) {
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const lines = text.split('\n');
                let importedItems = [];
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i].trim();
                    line = line.replace(/\\s*/g, '');
                    if (!line || line.toLowerCase().startsWith('name') || line.toLowerCase().startsWith('sequence')) continue;
                    let parts = line.split(/\t+|\s{2,}/);
                    if (parts.length >= 3) {
                        let name = parts[0], seq = "", massStr, concStr;
                        const seqMatch = name.match(/^(.*?)\s+((?:\[[a-zA-Z0-9_'-]+\]|[ACGTU])+)$/i);
                        if (seqMatch && parts.length < 5) {
                            name = seqMatch[1].trim(); seq = seqMatch[2].trim();
                            massStr = parts[1]; concStr = parts[parts.length - 1];
                        } else {
                            name = parts[0].trim(); seq = parts[1] ? parts[1].trim() : "";
                            massStr = parts[2]; concStr = parts[parts.length - 1];
                        }
                        let conc = parseFloat(concStr); let mass = parseFloat(massStr);
                        if (!name && !seq) continue;
                        let formattedSeq = seq;
                        if (formattedSeq && !formattedSeq.startsWith("5'")) formattedSeq = `5'-${formattedSeq}-3'`;
                        let oligoType = seq.toUpperCase().includes('U') ? 'RNA' : 'DNA';
                        let parsedLength = seq.replace(/\[.*?\]/g, '').replace(/[^a-zA-Z]/g, '').length;
                        let parsedMw = !isNaN(mass) ? mass : null;
                        importedItems.push({
                            id: 'inv_txt_' + crypto.randomUUID(), code: 'TXT', cas: '', itemClass: 'DNA', name: name,
                            stock: !isNaN(conc) ? conc : 100, stockUnit: 'µM', location: '', sequence: formattedSeq,
                            length: parsedLength, gc: calculatedGcFallback(seq), tm: calcSeqTm(seq),
                            mw: parsedMw !== null ? parsedMw : calcSeqMw(seq, oligoType), oligoType: oligoType,
                            extinction: calcSeqExtinction(seq, oligoType), manualMw: parsedMw
                        });
                    }
                }
                processImports(importedItems, 'TXT');
            } catch(err) { alert("Error parsing TXT file."); }
            event.target.value = '';
        };
        reader.readAsText(file);
        return;
    }
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            let importedItems = [];
            workbook.SheetNames.forEach(sheetName => {
                if (!store.classOptions.includes(sheetName)) store.classOptions.push(sheetName);
                const worksheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(worksheet, {header: 1});
                if(rows.length < 2) return;
                let headerRowIndex = -1;
                for(let i = 0; i < Math.min(10, rows.length); i++) {
                    if(rows[i] && rows[i].some(cell => typeof cell === 'string' && (cell.trim().toLowerCase().includes('name') || cell.trim().toLowerCase() === 'identifier' || cell.trim().toLowerCase() === 'serial number'))) {
                        headerRowIndex = i; break;
                    }
                }
                if (headerRowIndex === -1) return;
                const headers = rows[headerRowIndex].map(h => h ? h.toString().trim().toLowerCase() : '');
                const dataRows = rows.slice(headerRowIndex + 1);
                const getCol = (row, names) => {
                    for (let n of names) {
                        let idx = headers.indexOf(n);
                        if (idx !== -1 && row[idx] !== undefined && row[idx] !== null && row[idx] !== '') return row[idx];
                    }
                    return '';
                };
                dataRows.forEach(row => {
                    if(!row || row.length === 0) return;
                    let name = getCol(row, ['item name *', 'name', 'item name']);
                    let code = getCol(row, ['serial number', 'identifier', 'number', 'code']);
                    let box = getCol(row, ['location', 'box']);
                    let subloc = getCol(row, ['sub-location', 'sublocation']);
                    let catalog = getCol(row, ['catalog #', 'catalog number', 'catalog num']);
                    let uSize = getCol(row, ['unit size', 'size']);
                    let casNum = getCol(row, ['cas number', 'cas # *', 'cas']);
                    let seq = getCol(row, ["sequence (5'->3')", 'sequence']);
                    let length = getCol(row, ['length [nt]', 'length']);
                    let mw = getCol(row, ['molecular weight', 'mw [g/mol]', 'mw']);
                    let gc = getCol(row, ['gc content', 'gc']);
                    if (typeof gc === 'string') gc = gc.replace('%','').replace(',','.');
                    let dnaType = getCol(row, ['dna type', 'type']);
                    let concStr = getCol(row, ['amount in stock', 'dilution', 'stock conc.', 'stock']);
                    let concUnitQuartzy = getCol(row, ['amount in stock units']);
                    if (!name && !code && !seq) return;
                    if (!name && code) name = code;
                    let stock = 100; let unit = 'µM';
                    if (concStr) {
                        let s = concStr.toString().trim();
                        const numMatch = s.match(/^[\d\.,]+/);
                        if (numMatch) {
                            stock = parseFloat(numMatch[0].replace(',', '.'));
                            let u = s.substring(numMatch[0].length).trim();
                            if (u) unit = u;
                        } else stock = parseFloat(s) || 100;
                    }
                    if (concUnitQuartzy) unit = concUnitQuartzy.toString().trim();
                    let isRna = dnaType && typeof dnaType === 'string' && dnaType.toUpperCase().includes('RNA');
                    let itemClass = sheetName;
                    let oligoType = isRna ? 'RNA' : 'DNA';
                    let parsedMw = mw ? parseFloat(mw.toString().replace(',','.')) : null;
                    if (isNaN(parsedMw)) parsedMw = null;
                    let rawSeq = seq ? seq.toString().trim() : '';
                    let formattedSeq = rawSeq;
                    if (formattedSeq && !formattedSeq.startsWith("5'")) formattedSeq = `5'-${formattedSeq}-3'`;
                    let parsedLength = length ? parseFloat(length) : (rawSeq ? rawSeq.replace(/\[.*?\]/g, '').replace(/[^a-zA-Z]/g, '').length : 0);
                    let parsedGc = gc ? parseFloat(gc) : (rawSeq ? calculatedGcFallback(rawSeq) : 0);
                    let calcExt = rawSeq ? calcSeqExtinction(rawSeq, oligoType) : 0;
                    let calcMw = rawSeq ? calcSeqMw(rawSeq, oligoType) : 0;
                    importedItems.push({
                        id: 'inv_imp_' + crypto.randomUUID(), code: code || 'IMP', cas: casNum || '', itemClass: itemClass, name: name || 'Unnamed',
                        stock: stock, stockUnit: unit, location: box ? box.toString() : '', sublocation: subloc || '', catalogNum: catalog || '', unitSize: uSize || '',
                        sequence: formattedSeq, length: parsedLength, gc: parsedGc, tm: calcSeqTm(rawSeq), mw: parsedMw !== null ? parsedMw : calcMw,
                        oligoType: oligoType, extinction: calcExt, manualMw: parsedMw
                    });
                });
            });
            processImports(importedItems, 'Excel');
        } catch(err) { alert("Error importing file. Ensure it is valid Excel/CSV."); }
        event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}

// ── Label Printing ────────────────────────────────────────────────────────────

const showLabelModal  = ref(false)
const labelQueue      = ref([])   // [{ item, copies }]
const startHermaLabel = ref(1)    // 1–12
const printerXShift   = ref(0)    // mm
const printerYShift   = ref(0)    // mm
const labelSearch     = ref('')
const labelDragFrom   = ref(null)

const dnaRnaItems = computed(() => {
    const term = labelSearch.value.toLowerCase()
    return store.inventory.filter(item => {
        const cls = item.itemClass || ''
        if (cls !== 'DNA' && cls !== 'RNA') return false
        if (!term) return true
        return (item.code?.toLowerCase().includes(term)) || (item.name?.toLowerCase().includes(term))
    })
})

const isInQueue = (itemId) => labelQueue.value.some(e => e.item.id === itemId)

const toggleLabelItem = (item) => {
    const idx = labelQueue.value.findIndex(e => e.item.id === item.id)
    if (idx === -1) labelQueue.value.push({ item, copies: 1 })
    else labelQueue.value.splice(idx, 1)
}

const labelCapacity = computed(() => {
    const total = labelQueue.value.reduce((s, e) => s + (e.copies || 1), 0)
    if (total === 0) return null
    const offset = (startHermaLabel.value - 1) * 12
    const pages   = Math.ceil((total + offset) / 144)
    const lastPos = Math.min(12, Math.ceil((total + offset) / 12))
    return { total, pages, startPos: startHermaLabel.value, lastPos }
})

// Queue drag-to-reorder (native HTML drag)
const onQueueDragStart = (idx) => { labelDragFrom.value = idx }
const onQueueDrop      = (idx) => {
    if (labelDragFrom.value === null || labelDragFrom.value === idx) return
    const moved = labelQueue.value.splice(labelDragFrom.value, 1)[0]
    labelQueue.value.splice(idx, 0, moved)
    labelDragFrom.value = null
}

const cleanSeqForLabel = (seq) => {
    if (!seq) return ''
    return seq.replace(/^5'-?/i, '').replace(/-?3'$/i, '').trim()
}

const wrapSeq = (seq, maxChars = 14) => {
    if (!seq) return []
    const lines = []
    let rem = seq
    while (rem.length > 0) { lines.push(rem.substring(0, maxChars)); rem = rem.substring(maxChars) }
    return lines
}

const generateLabelsPDF = () => {
    if (labelQueue.value.length === 0) return

    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

    // HERMA 4363 geometry (mm)
    const lw = 105, lh = 48
    const topMargin = 4, leftMargin = 0
    const hCols = 2
    const tw = 24, th = 13
    const tinyCols = 4, tinyRows = 3
    const tinyPerHerma = tinyCols * tinyRows   // 12
    const totalPerPage = hCols * 6 * tinyPerHerma  // 144
    const padX = (lw - tinyCols * tw) / 2     // 4.5 mm
    const padY = (lh - tinyRows * th) / 2     // 4.5 mm
    const offset  = (startHermaLabel.value - 1) * tinyPerHerma
    const xShift  = parseFloat(printerXShift.value) || 0
    const yShift  = parseFloat(printerYShift.value) || 0

    // Expand queue entries by their copies count
    const items = []
    labelQueue.value.forEach(entry => {
        for (let c = 0; c < (entry.copies || 1); c++) items.push(entry.item)
    })

    let currentPage = 0

    items.forEach((item, dataIdx) => {
        const physI      = dataIdx + offset
        const page       = Math.floor(physI / totalPerPage)
        const pagePhysI  = physI % totalPerPage
        const masterIdx  = Math.floor(pagePhysI / tinyPerHerma)
        const hr         = Math.floor(masterIdx / hCols)
        const hc         = masterIdx % hCols
        const tinyIdx    = pagePhysI % tinyPerHerma
        const tr         = Math.floor(tinyIdx / tinyCols)
        const tc         = tinyIdx % tinyCols

        const masterX = leftMargin + hc * lw + xShift
        const masterY = topMargin  + hr * lh + yShift
        const tinyX   = masterX + padX + tc * tw
        const tinyY   = masterY + padY + tr * th

        while (currentPage < page) { doc.addPage(); currentPage++ }

        // Dotted border
        doc.setLineDash([0.4, 0.4])
        doc.setDrawColor(170, 170, 170)
        doc.setLineWidth(0.1)
        doc.rect(tinyX, tinyY, tw, th)
        doc.setLineDash([])

        const px   = tinyX + 0.8
        const maxW = tw - 1.6   // 22.4 mm usable width

        // Name — bold, 6 pt — largest element
        const nameStr = item.name || ''
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6)
        doc.setTextColor(10, 10, 10)
        doc.text(doc.splitTextToSize(nameStr, maxW)[0] || '', px, tinyY + 2.0)

        // Code — small, 3.5 pt, muted
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(3.5)
        doc.setTextColor(100, 100, 100)
        doc.text(item.code || '', px, tinyY + 3.7)

        // Conc | MW — 4 pt
        const mwDisplay = item.mw ? Math.round(item.mw) : ''
        const concBase  = `${item.stock ?? ''} ${item.stockUnit || 'µM'}`.trim()
        const concStr   = mwDisplay ? `${concBase}  |  ${mwDisplay} Da` : concBase
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(4)
        doc.setTextColor(20, 20, 20)
        doc.text(concStr, px, tinyY + 5.1)

        // Sequence — courier 3.5 pt, one line if it fits, wraps only if needed
        const seq = cleanSeqForLabel(item.sequence)
        if (seq) {
            doc.setFont('courier', 'normal')
            doc.setFontSize(3.5)
            doc.setTextColor(40, 40, 40)
            const seqLines = doc.splitTextToSize(seq, maxW)
            seqLines.forEach((line, li) => {
                const lineY = tinyY + 6.7 + li * 1.5
                if (lineY < tinyY + th - 0.4) doc.text(line, px, lineY)
            })
        }
    })

    const dateStr = new Date().toISOString().split('T')[0]
    doc.save(`labels_${dateStr}.pdf`)
}
</script>

<template>
  <div>

    <!-- ── Properties modal ───────────────────────────────────────────────── -->
    <div v-if="viewingItem" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;">
        <div style="background: var(--surface); padding: 25px; border-radius: var(--radius); border: 1px solid var(--border); max-width: 500px; width: 90%;">
            <template v-if="viewingItem.itemClass === 'DNA' || viewingItem.itemClass === 'RNA'">
                <h3 style="margin-top: 0; color: var(--primary); border-bottom: 2px solid var(--bg); padding-bottom: 10px;"><i class="fas fa-dna"></i> Sequence Properties</h3>
                <div class="grid-2" style="margin-top: 15px;">
                    <p style="margin: 0;"><strong>Name:</strong> {{ viewingItem.name }}</p>
                    <div class="input-group" style="margin: 0;">
                        <label style="font-size: 0.6rem;">Type</label>
                        <select v-model="viewingItem.oligoType" @change="updateManualSequence(viewingItem)" style="padding: 4px;">
                            <option value="DNA">DNA</option>
                            <option value="RNA">RNA</option>
                        </select>
                    </div>
                </div>
                <div class="input-group" style="margin-top: 15px;">
                    <label>Manual Sequence (5' to 3')</label>
                    <textarea v-model="viewingItem.sequence" rows="3" @input="updateManualSequence(viewingItem)" placeholder="Paste sequence (ATGC...) or [Mod]ATGC..."></textarea>
                </div>
                <div class="input-group">
                    <label>Manual Mass/Mw (Da)</label>
                    <input type="number" v-model.number="viewingItem.manualMw" @input="updateManualSequence(viewingItem)" step="any" placeholder="Optional override">
                </div>
                <div class="grid-2" style="background: var(--panel-bg); padding: 15px; border-radius: var(--radius); border: 1px solid var(--border);">
                    <div><strong>Length:</strong> {{ viewingItem.length || 0 }} nt</div>
                    <div><strong>GC%:</strong> {{ store.formatNum(viewingItem.gc || 0) }}%</div>
                    <div><strong>Mw:</strong> {{ store.formatNum(viewingItem.mw || 0) }} Da <span v-if="viewingItem.manualMw" style="color: var(--primary); font-size: 0.75rem;">(Manual)</span></div>
                    <div><strong>Ext. Coeff:</strong> {{ store.formatNum(viewingItem.extinction || 0) }}</div>
                    <div><strong>Tm:</strong> {{ store.formatNum(viewingItem.tm || 0) }} °C</div>
                </div>
            </template>
            <template v-else>
                <h3 style="margin-top: 0; color: var(--primary); border-bottom: 2px solid var(--bg); padding-bottom: 10px;"><i class="fas fa-flask"></i> Chemical Properties</h3>
                <div class="grid-2" style="margin-top: 15px;">
                    <p style="margin: 0;"><strong>Name:</strong> {{ viewingItem.name }}</p>
                    <p style="margin: 0;"><strong>Code:</strong> {{ viewingItem.code }}</p>
                </div>
                <div class="grid-2" style="background: var(--panel-bg); padding: 15px; border-radius: var(--radius); border: 1px solid var(--border); margin-top: 15px;">
                    <div><strong>Sub-location:</strong><br> <input type="text" v-model="viewingItem.sublocation" placeholder="e.g. Box 2" style="padding: 4px; margin-top: 4px; width: 100%;"></div>
                    <div><strong>Catalog Number:</strong><br> <input type="text" v-model="viewingItem.catalogNum" placeholder="e.g. C1234" style="padding: 4px; margin-top: 4px; width: 100%;"></div>
                    <div><strong>Unit Size:</strong><br> <input type="text" v-model="viewingItem.unitSize" placeholder="e.g. 500g" style="padding: 4px; margin-top: 4px; width: 100%;"></div>
                    <div><strong>CAS Number:</strong><br> <input type="text" v-model="viewingItem.cas" placeholder="e.g. 50-00-0" style="padding: 4px; margin-top: 4px; width: 100%;"></div>
                </div>
            </template>
            <button @click="viewingItem = null" style="margin-top: 20px; width: 100%;">Save & Close</button>
        </div>
    </div>

    <!-- ── Label printing modal ───────────────────────────────────────────── -->
    <div v-if="showLabelModal" style="position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000;">
      <div style="background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); width: 92%; max-width: 960px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden;">

        <!-- Header -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0;">
          <h3 style="margin: 0; color: var(--primary);"><i class="fas fa-tag"></i> Print DNA / RNA Labels — HERMA 4363</h3>
          <button class="danger small" @click="showLabelModal = false; labelQueue = []; labelSearch = ''"><i class="fas fa-times"></i></button>
        </div>

        <!-- Body -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 260px; gap: 0; flex: 1; overflow: hidden;">

          <!-- Left: item picker -->
          <div style="border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden;">
            <div style="padding: 12px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0;">
              <div style="font-size: 0.78rem; font-weight: 600; opacity: 0.7; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">DNA / RNA Inventory</div>
              <div class="search-box" style="margin: 0;">
                <i class="fas fa-search"></i>
                <input type="text" v-model="labelSearch" placeholder="Search code or name…">
              </div>
            </div>
            <div style="overflow-y: auto; flex: 1; padding: 6px 0;">
              <div v-if="dnaRnaItems.length === 0" style="padding: 20px; text-align: center; opacity: 0.45; font-size: 0.82rem;">No DNA / RNA items found</div>
              <div
                v-for="item in dnaRnaItems"
                :key="item.id"
                @click="toggleLabelItem(item)"
                style="display: flex; align-items: center; gap: 10px; padding: 8px 14px; cursor: pointer; border-bottom: 1px solid var(--bg); transition: background 0.12s;"
                :style="{ background: isInQueue(item.id) ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent' }"
                onmouseover="this.style.background=this.style.background||'var(--panel-bg)'"
                onmouseout="this.style.background=''"
              >
                <div style="width: 16px; height: 16px; border-radius: 3px; border: 1.5px solid; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 0.65rem;"
                  :style="{ borderColor: isInQueue(item.id) ? 'var(--primary)' : 'var(--border)', background: isInQueue(item.id) ? 'var(--primary)' : 'transparent', color: 'white' }">
                  <i v-if="isInQueue(item.id)" class="fas fa-check"></i>
                </div>
                <div style="min-width: 0; flex: 1;">
                  <div style="font-weight: 600; font-size: 0.82rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ item.code }}</div>
                  <div style="font-size: 0.72rem; opacity: 0.65; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ item.name }}</div>
                </div>
                <div style="font-size: 0.7rem; opacity: 0.6; flex-shrink: 0;">{{ item.stock }} {{ item.stockUnit }}</div>
              </div>
            </div>
          </div>

          <!-- Middle: print queue -->
          <div style="border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden;">
            <div style="padding: 12px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0;">
              <div style="font-size: 0.78rem; font-weight: 600; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.05em;">Print Queue</div>
              <div style="font-size: 0.72rem; opacity: 0.5; margin-top: 3px;">Drag to reorder</div>
            </div>
            <div style="overflow-y: auto; flex: 1; padding: 6px 0;">
              <div v-if="labelQueue.length === 0" style="padding: 24px 14px; text-align: center; opacity: 0.4; font-size: 0.82rem;">
                <i class="fas fa-arrow-left" style="margin-right: 6px;"></i>Select items from the list
              </div>
              <div
                v-for="(entry, idx) in labelQueue"
                :key="entry.item.id"
                draggable="true"
                @dragstart="onQueueDragStart(idx)"
                @dragover.prevent
                @drop="onQueueDrop(idx)"
                style="display: flex; align-items: center; gap: 8px; padding: 7px 14px; border-bottom: 1px solid var(--bg); cursor: grab;"
              >
                <i class="fas fa-grip-vertical" style="opacity: 0.35; font-size: 0.75rem; flex-shrink: 0;"></i>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-weight: 600; font-size: 0.82rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ entry.item.code }}</div>
                  <div style="font-size: 0.7rem; opacity: 0.55; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ entry.item.stock }} {{ entry.item.stockUnit }}</div>
                </div>
                <!-- Copies spinner -->
                <div style="display: flex; align-items: center; gap: 3px; flex-shrink: 0;">
                  <button @click="entry.copies = Math.max(1, entry.copies - 1)" style="width: 20px; height: 20px; padding: 0; font-size: 0.7rem; border-radius: 3px;">−</button>
                  <span style="font-size: 0.78rem; font-weight: 600; min-width: 18px; text-align: center;">{{ entry.copies }}</span>
                  <button @click="entry.copies = Math.min(20, entry.copies + 1)" style="width: 20px; height: 20px; padding: 0; font-size: 0.7rem; border-radius: 3px;">+</button>
                </div>
                <button class="danger small" @click="toggleLabelItem(entry.item)" style="flex-shrink: 0; width: 22px; height: 22px; padding: 0; font-size: 0.65rem;">
                  <i class="fas fa-times"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- Right: settings -->
          <div style="display: flex; flex-direction: column; overflow-y: auto; padding: 14px;">

            <!-- HERMA picker -->
            <div style="font-size: 0.78rem; font-weight: 600; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Start Position</div>
            <div style="font-size: 0.7rem; opacity: 0.55; margin-bottom: 10px;">Which HERMA label block on the sheet is free?</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 16px;">
              <div
                v-for="n in 12"
                :key="n"
                @click="startHermaLabel = n"
                style="padding: 6px 4px; border-radius: 4px; border: 1.5px solid; text-align: center; font-size: 0.72rem; font-weight: 600; cursor: pointer; transition: all 0.12s; user-select: none;"
                :style="{
                  borderColor: n === startHermaLabel ? 'var(--primary)' : 'var(--border)',
                  background:  n === startHermaLabel ? 'var(--primary)' : n < startHermaLabel ? 'var(--bg)' : 'var(--panel-bg)',
                  color:       n === startHermaLabel ? 'white' : 'var(--text)',
                  opacity:     n < startHermaLabel ? 0.35 : 1,
                }"
              >{{ n }}</div>
            </div>

            <!-- Printer calibration -->
            <div style="font-size: 0.78rem; font-weight: 600; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Printer Calibration</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px;">
              <div>
                <div style="font-size: 0.7rem; opacity: 0.65; margin-bottom: 3px;">X shift (mm)</div>
                <input type="number" v-model.number="printerXShift" step="0.5" style="width: 100%; padding: 5px; font-size: 0.8rem;">
              </div>
              <div>
                <div style="font-size: 0.7rem; opacity: 0.65; margin-bottom: 3px;">Y shift (mm)</div>
                <input type="number" v-model.number="printerYShift" step="0.5" style="width: 100%; padding: 5px; font-size: 0.8rem;">
              </div>
            </div>

            <!-- Capacity preview -->
            <div v-if="labelCapacity" style="background: var(--panel-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px; font-size: 0.78rem; margin-bottom: 16px; line-height: 1.6;">
              <div><strong>{{ labelCapacity.total }}</strong> label{{ labelCapacity.total !== 1 ? 's' : '' }}</div>
              <div><strong>{{ labelCapacity.pages }}</strong> page{{ labelCapacity.pages !== 1 ? 's' : '' }}</div>
              <div style="opacity: 0.6; font-size: 0.72rem; margin-top: 4px;">
                HERMA {{ labelCapacity.startPos }}
                <span v-if="labelCapacity.lastPos > labelCapacity.startPos"> → {{ labelCapacity.lastPos }}</span>
                on page 1
              </div>
            </div>
            <div v-else style="opacity: 0.4; font-size: 0.75rem; margin-bottom: 16px;">Add items to see preview</div>

            <button
              @click="generateLabelsPDF"
              :disabled="labelQueue.length === 0"
              style="width: 100%; padding: 10px; font-weight: bold;"
            >
              <i class="fas fa-file-pdf" style="margin-right: 6px;"></i>Generate PDF
            </button>
          </div>

        </div>
      </div>
    </div>

    <!-- ── Main inventory card ────────────────────────────────────────────── -->
    <div class="card">
        <h2><i class="fas fa-boxes-stacked"></i> Inventory</h2>

        <div style="display: flex; gap: 15px; margin-bottom: 15px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
            <label class="checkbox-label" style="font-weight: bold;"><input type="radio" value="Global" v-model="inventoryMode"> Global Inventory</label>
            <label class="checkbox-label" style="font-weight: bold;"><input type="radio" value="Personal" v-model="inventoryMode"> Personal Inventory</label>
        </div>

        <div class="search-box">
            <i class="fas fa-search"></i>
            <input type="text" v-model="inventorySearch" placeholder="Search by name, CAS, or code...">
        </div>
        <div class="table-responsive" style="max-height: 500px; border: 1px solid var(--border); background: var(--surface);">
            <table style="margin-bottom: 0;">
                <thead style="position: sticky; top: 0; z-index: 1;">
                    <tr>
                        <th>Code</th>
                        <th>CAS</th>
                        <th>Class</th>
                        <th>Component Name</th>
                        <th>Conc / Unit</th>
                        <th>Location</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="item in filteredInventory" :key="item.id">
                        <td><input type="text" v-model="item.code" style="width: 55px; padding: 6px;"></td>
                        <td><input type="text" v-model="item.cas" placeholder="-" style="width: 70px; padding: 6px; font-size:0.8rem;"></td>
                        <td>
                            <select v-model="item.itemClass" style="width: 80px; padding: 6px; font-size:0.8rem;">
                                <option v-for="cls in store.classOptions" :key="cls" :value="cls">{{ cls }}</option>
                            </select>
                        </td>
                        <td><input type="text" v-model="item.name" style="padding: 6px; min-width: 120px;"></td>
                        <td>
                            <div class="input-with-select">
                                <input type="number" v-model.number="item.stock" step="any" style="width: 70px; padding: 6px;">
                                <select v-model="item.stockUnit" style="padding: 6px; font-size: 0.8rem; width: 65px; border-left: none;">
                                    <option value="M">M</option><option value="mM">mM</option><option value="µM">µM</option><option value="nM">nM</option>
                                    <option value="mg/mL">mg/mL</option><option value="µg/µL">µg/µL</option><option value="ng/µL">ng/µL</option>
                                    <option value="X">X</option><option value="U/µL">U/µL</option><option value="%">%</option>
                                </select>
                            </div>
                        </td>
                        <td><input type="text" v-model="item.location" placeholder="e.g., Box 1" style="width: 100px; padding: 6px;"></td>
                        <td style="white-space: nowrap;">
                            <button class="secondary small" @click="toggleScope(item)" :title="(item.scope || 'Global') === 'Personal' ? 'Move to Global' : 'Move to Personal'" style="margin-right: 5px;">
                                <i class="fas" :class="(item.scope || 'Global') === 'Personal' ? 'fa-globe' : 'fa-user'"></i>
                            </button>
                            <button class="secondary small" @click="createAliquot(item)" title="Create Aliquot" style="margin-right: 5px;"><i class="fas fa-vial"></i></button>
                            <button class="secondary small" @click="viewProperties(item)" title="View Properties" style="margin-right: 5px;"><i class="fas fa-info-circle"></i></button>
                            <button class="danger small" @click="removeInventoryItem(item.id)"><i class="fas fa-times"></i></button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div style="display: flex; gap: 10px; margin-top: 15px;">
            <button @click="addInventoryItem" style="flex-grow: 1; height: 40px;"><i class="fas fa-plus"></i> Add to {{ inventoryMode }}</button>
            <button @click="importTargetMode = inventoryMode; excelUpload.click()" style="flex-grow: 1; height: 40px;">
                <i class="fas fa-file-excel"></i> Import
            </button>
            <button @click="showLabelModal = true" style="flex-grow: 1; height: 40px;">
                <i class="fas fa-tag"></i> Print Labels
            </button>
            <input type="file" ref="excelUpload" @change="importInventory" accept=".xlsx, .xls, .csv, .txt" style="display: none;">
        </div>
    </div>
  </div>
</template>
