<script setup>
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { useLabStore } from '../stores/labStore'
import { db } from '../services/supabase' // Using your Supabase client
import * as XLSX from 'xlsx'
import html2pdf from 'html2pdf.js'

const store = useLabStore()
const journalEditor = ref(null)

// --- Computed Properties ---
const activeJournalEntry = computed(() => store.journal.entries.find(e => e.id === store.journal.activeId))
const sortedJournalEntries = computed(() => [...store.journal.entries].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))

// --- Auto-Save Logic (Debounced to prevent spamming DB) ---
let saveTimeout;
const saveToDb = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        // Only save to DB if it's a valid Supabase UUID (string)
        if (activeJournalEntry.value && activeJournalEntry.value.id && typeof activeJournalEntry.value.id === 'string') {
            // Map the Vue state into your JSONB 'data' column format
            await db.from('journals').update({
                data: {
                    content: activeJournalEntry.value.content,
                    expId: activeJournalEntry.value.expId,
                    date: activeJournalEntry.value.date
                }
            }).eq('id', activeJournalEntry.value.id);
        }
    }, 1000); // Saves 1 second after you stop typing
}

// Watchers for Title and Date changes
const updateHeaderAndSave = () => {
    saveToDb();
}

// --- Methods ---
const formatDoc = (cmd, value = null) => {
    if (journalEditor.value) journalEditor.value.focus();
    document.execCommand(cmd, false, value);
    updateRtfContent();
}

const updateRtfContent = () => {
    if (activeJournalEntry.value && journalEditor.value) {
        activeJournalEntry.value.content = journalEditor.value.innerHTML;
        saveToDb(); // Trigger auto-save
    }
}

const syncEditor = () => {
    if (journalEditor.value && activeJournalEntry.value) {
        journalEditor.value.innerHTML = activeJournalEntry.value.content || '';
    }
}

const addJournalEntry = async () => {
    const { data: { user } } = await db.auth.getUser();
    if (!user) {
        alert("Authentication error: Please log in to save entries.");
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    const newExpId = 'EXP-' + String(store.journal.entries.length + 1).padStart(3, '0');

    // Insert into your specific 'journals' table structure
    const { data, error } = await db.from('journals').insert([{
        owner_id: user.id,
        scope: 'Personal', // Assuming journal entries are personal by default
        data: {
            expId: newExpId,
            date: today,
            content: ''
        }
    }]).select();

    if (!error && data && data[0]) {
        store.journal.entries.unshift({
            id: data[0].id,
            expId: data[0].data.expId,
            date: data[0].data.date,
            content: data[0].data.content,
            created_at: data[0].created_at
        });
        store.journal.activeId = data[0].id;
        nextTick(() => syncEditor());
    } else {
        console.error("Error creating entry:", error);
    }
}

const deleteJournalEntry = async (id) => {
    if(confirm("Are you sure you want to delete this journal entry?")) {
        // Cancel any pending saves so they don't block the delete
        clearTimeout(saveTimeout); 
        
        // If the ID is a string, it's a Supabase UUID. If not, it's old local storage data.
        if (typeof id === 'string') {
            // Delete from Supabase AND return the deleted row to confirm it worked
            const { data, error } = await db.from('journals').delete().eq('id', id).select();
            
            if (error) {
                console.error("Server delete failed:", error);
                alert("Failed to delete from database. See console for details.");
                return;
            }

            // If Supabase returns empty data, the RLS policy blocked the deletion
            if (!data || data.length === 0) {
                alert("Database blocked the deletion! You need to add the DELETE policy in the Supabase SQL Editor.");
                return;
            }
        }
        
        // Unconditionally remove from local state so the UI updates instantly
        const idx = store.journal.entries.findIndex(e => e.id === id);
        if (idx !== -1) {
            store.journal.entries.splice(idx, 1);
            store.journal.activeId = store.journal.entries.length > 0 ? store.journal.entries[0].id : null;
            nextTick(() => syncEditor());
        }
    }
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

const insertInventoryRef = () => {
    if (!store.selectedInvRef) return;
    const item = store.inventory.find(i => i.id === store.selectedInvRef);
    if (item) {
        if (journalEditor.value) journalEditor.value.focus();
        const html = `&nbsp;<span class="inv-ref" contenteditable="false"><i class="fas fa-tag"></i>&nbsp;[${item.code}] ${item.name} (${store.formatNum(item.stock)} ${item.stockUnit || 'µM'})&nbsp;<i class="fas fa-times" style="cursor:pointer; margin-left:4px; opacity: 0.7;" onclick="let ce = this.closest('[contenteditable]'); this.parentElement.remove(); if(ce) ce.dispatchEvent(new Event('input', {bubbles: true}));" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7"></i></span>&nbsp;`;
        document.execCommand('insertHTML', false, html);
        updateRtfContent();
    }
    store.selectedInvRef = '';
}

const insertDateHeader = () => {
    const dateStr = new Date().toLocaleDateString();
    const html = `<br><h3><i class="far fa-calendar-alt"></i> ${dateStr}</h3><br>`;
    formatDoc('insertHTML', html);
}

const insertTable = () => {
    const rowsInput = prompt("Enter number of rows:", "3");
    const colsInput = prompt("Enter number of columns:", "3");
    if (!rowsInput || !colsInput) return;
    const rows = parseInt(rowsInput) || 3;
    const cols = parseInt(colsInput) || 3;
    let html = `<br><table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; border: 1px solid var(--border);"><thead><tr>`;
    for(let c=0; c<cols; c++) html += `<th style="border: 1px solid var(--border); padding: 8px; background-color: var(--input-bg);">Header ${c+1}</th>`;
    html += `</tr></thead><tbody>`;
    for(let r=0; r<rows; r++) {
        html += `<tr>`;
        for(let c=0; c<cols; c++) html += `<td style="border: 1px solid var(--border); padding: 8px;">Data</td>`;
        html += `</tr>`;
    }
    html += `</tbody></table><br>`;
    formatDoc('insertHTML', html);
}

const exportJournal = (type) => {
    if (!activeJournalEntry.value || !activeJournalEntry.value.content) {
        alert("Journal entry is empty.");
        return;
    }
    const filename = `Lab_Journal_${activeJournalEntry.value.expId || 'Export'}`;
    
    if (type === 'word') {
        const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export HTML To Doc</title></head><body>";
        const footer = "</body></html>";
        const html = header + journalEditor.value.innerHTML + footer;
        const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = filename + '.doc';
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } else if (type === 'pdf') {
        const opt = {
            margin:       10,
            filename:     filename + '.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(journalEditor.value).save();
    } else if (type === 'excel') {
        const tables = journalEditor.value.querySelectorAll('table');
        let wb = XLSX.utils.book_new();
        if (tables.length > 0) {
            tables.forEach((tbl, idx) => {
                const ws = XLSX.utils.table_to_sheet(tbl);
                XLSX.utils.book_append_sheet(wb, ws, `Table_${idx+1}`);
            });
        } else {
            const ws = XLSX.utils.aoa_to_sheet([[journalEditor.value.innerText]]);
            XLSX.utils.book_append_sheet(wb, ws, 'JournalText');
        }
        XLSX.writeFile(wb, filename + '.xlsx');
    }
}

// --- Fetch from Supabase on Mount ---
onMounted(async () => {
    const { data: { user } } = await db.auth.getUser();

    if (user) {
        const { data, error } = await db.from('journals')
            .select('*')
            .eq('owner_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Failed to load journal entries from server:", error);
            return;
        }

        const cloudEntries = (data || []).map(row => ({
            id: row.id,
            expId: row.data?.expId || 'Untitled',
            date: row.data?.date || '',
            content: row.data?.content || '',
            created_at: row.created_at
        }));

        // Prefer local draft content — it has the user's latest typing even if Supabase hasn't caught up
        try {
            const draftRaw = localStorage.getItem(`lab_local_drafts_${user.id}`);
            const draftEntries = draftRaw ? JSON.parse(draftRaw).journalEntries : null;
            if (draftEntries?.length > 0) {
                const draftMap = new Map(draftEntries.map(e => [e.id, e]));
                store.journal.entries = cloudEntries.map(e => draftMap.get(e.id) || e);
            } else {
                store.journal.entries = cloudEntries;
            }
        } catch (e) {
            store.journal.entries = cloudEntries;
        }

        if (store.journal.entries.length > 0) {
            store.journal.activeId = store.journal.entries[0].id;
            nextTick(() => syncEditor());
        }
    }
});
</script>

<template>
  <div class="card full-width-header">
    <div class="flex-between" style="border-bottom: 2px solid var(--bg); padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between;">
        <h2 style="border: none; padding: 0; margin: 0;"><i class="fas fa-book"></i> Lab Journal</h2>
        <button @click="addJournalEntry" class="small"><i class="fas fa-file-circle-plus"></i> New Entry</button>
    </div>

    <div class="journal-container" v-if="store.journal.entries.length > 0">
        <div class="journal-sidebar">
            <div style="padding: 15px; border-bottom: 1px solid var(--border); font-weight: bold; opacity: 0.8; text-transform: uppercase; font-size: 0.85rem;">
                Logged Experiments
            </div>
            <div class="journal-list">
                <div v-for="entry in sortedJournalEntries" :key="entry.id" 
                     :class="['journal-item', { active: store.journal.activeId === entry.id }]"
                     @click="store.journal.activeId = entry.id; syncEditor()">
                    <div class="journal-item-title">{{ entry.expId || 'Untitled Exp' }}</div>
                    <div class="journal-item-date"><i class="far fa-calendar-alt"></i> {{ entry.date }}</div>
                </div>
            </div>
        </div>

        <div class="journal-editor" v-if="activeJournalEntry">
            <div class="journal-editor-header">
                <div style="flex-grow: 1; min-width: 150px;">
                    <label style="font-weight: bold; font-size: 0.85rem; opacity: 0.7; text-transform: uppercase;">Running No. / Exp ID</label>
                    <input type="text" v-model="activeJournalEntry.expId" @input="updateHeaderAndSave" placeholder="CTI-114" style="font-size: 1.1rem; font-weight: bold; color: var(--primary); border: none; border-bottom: 2px solid var(--primary); border-radius: 0; background: transparent; padding-left: 0;">
                </div>
                <div style="width: 150px;">
                    <label style="font-weight: bold; font-size: 0.85rem; opacity: 0.7; text-transform: uppercase;">Date</label>
                    <input type="date" v-model="activeJournalEntry.date" @change="updateHeaderAndSave">
                </div>
                <div style="display: flex; align-items: flex-end; gap: 8px;">
                    <button class="small" @click="exportJournal('pdf')" title="Export to PDF"><i class="fas fa-file-pdf"></i></button>
                    <button class="small" @click="exportJournal('word')" title="Export to Word"><i class="fas fa-file-word"></i></button>
                    <button class="small" @click="exportJournal('excel')" title="Export to Excel"><i class="fas fa-file-excel"></i></button>
                    <button class="danger small" @click="deleteJournalEntry(activeJournalEntry.id)"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            
            <label style="font-weight: bold; font-size: 0.85rem; opacity: 0.7; text-transform: uppercase; margin-bottom: 5px;">Documentation Log</label>
            
            <div style="display: flex; flex-direction: column; flex-grow: 1; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background: var(--input-bg);">
                <div class="rtf-toolbar">
                    <button class="rtf-btn" @click.prevent="formatDoc('bold')" title="Bold"><i class="fas fa-bold"></i></button>
                    <button class="rtf-btn" @click.prevent="formatDoc('italic')" title="Italic"><i class="fas fa-italic"></i></button>
                    <button class="rtf-btn" @click.prevent="formatDoc('underline')" title="Underline"><i class="fas fa-underline"></i></button>
                    <button class="rtf-btn" @click.prevent="formatDoc('strikeThrough')" title="Strikethrough"><i class="fas fa-strikethrough"></i></button>
                    <div style="width: 1px; background: var(--border); margin: 0 4px; height: 24px;"></div>
                    <button class="rtf-btn" @click.prevent="insertDateHeader" title="Insert Date Header"><i class="fas fa-calendar-day"></i></button>
                    <div style="width: 1px; background: var(--border); margin: 0 4px; height: 24px;"></div>
                    <button class="rtf-btn" @click.prevent="formatDoc('insertUnorderedList')" title="Bullet List"><i class="fas fa-list-ul"></i></button>
                    <button class="rtf-btn" @click.prevent="formatDoc('insertOrderedList')" title="Numbered List"><i class="fas fa-list-ol"></i></button>
                    <div style="width: 1px; background: var(--border); margin: 0 4px; height: 24px;"></div>
                    <button class="rtf-btn" @click.prevent="formatDoc('justifyLeft')" title="Align Left"><i class="fas fa-align-left"></i></button>
                    <button class="rtf-btn" @click.prevent="formatDoc('justifyCenter')" title="Align Center"><i class="fas fa-align-center"></i></button>
                    <button class="rtf-btn" @click.prevent="formatDoc('justifyRight')" title="Align Right"><i class="fas fa-align-right"></i></button>
                    
                    <div style="width: 1px; background: var(--border); margin: 0 4px; height: 24px;"></div>
                    <button class="rtf-btn" @click.prevent="insertTable" title="Insert Table"><i class="fas fa-table"></i></button>
                    
                    <div style="width: 1px; background: var(--border); margin: 0 4px; height: 24px;"></div>
                    
                    <div style="position: relative; margin-left: auto;" @click.stop>
                        <div @click="store.activeDropdown = store.activeDropdown === 'journal_ref' ? null : 'journal_ref'" style="padding: 4px 8px; font-size: 0.85rem; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; height: 32px; display: flex; align-items: center; gap: 6px;">
                            <span>+ Reference Stock</span>
                            <i class="fas fa-chevron-down" style="opacity: 0.5;"></i>
                        </div>
                        <div v-if="store.activeDropdown === 'journal_ref'" style="position: absolute; top: 100%; right: 0; z-index: 100; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: var(--radius); min-width: 250px; display: flex; flex-direction: column;">
                            <div style="display: flex; gap: 5px; padding: 5px; border-bottom: 1px solid var(--border);">
                                <label class="checkbox-label" style="font-weight: bold; font-size: 0.75rem;"><input type="radio" value="Global" v-model="store.journalRefSearchScope"> Global</label>
                                <label class="checkbox-label" style="font-weight: bold; font-size: 0.75rem;"><input type="radio" value="Personal" v-model="store.journalRefSearchScope"> Personal</label>
                            </div>
                            <input type="text" v-model="store.rtfSearchQuery" placeholder="Search inventory..." style="margin: 5px; width: calc(100% - 10px); padding: 4px; border: 1px solid var(--border); border-radius: var(--radius);" @click.stop>
                            <div style="overflow-y: auto; max-height: 200px;">
                                <div v-for="inv in filterBlockInventory(store.rtfSearchQuery, store.journalRefSearchScope)" :key="inv.id" @mousedown.prevent="store.selectedInvRef = inv.id; insertInventoryRef(); store.activeDropdown = null" style="padding: 6px 10px; cursor: pointer; font-size: 0.85rem; border-bottom: 1px solid var(--bg);" onmouseover="this.style.background='var(--summary-bg)'" onmouseout="this.style.background='transparent'">
                                    [{{ inv.code }}] {{ inv.name }} ({{inv.stock}} {{inv.stockUnit || 'µM'}})
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="journal-textarea rtf-editor" 
                     contenteditable="true" 
                     placeholder="Document your procedure here. Click 'Log to Journal' on any planner to append data tables instantly..."
                     style="border: none; border-radius: 0; outline: none; overflow-y: auto; white-space: pre-wrap;"
                     @input="updateRtfContent"
                     @blur="updateRtfContent"
                     ref="journalEditor">
                </div>
            </div>
        </div>
    </div>
    <div v-else style="text-align: center; padding: 40px; opacity: 0.5; background: var(--input-bg); border-radius: var(--radius);">
        <i class="fas fa-book-open fa-3x" style="margin-bottom: 15px;"></i><br>
        Your lab journal is empty. Create a new entry to start documenting.
    </div>
  </div>
</template>