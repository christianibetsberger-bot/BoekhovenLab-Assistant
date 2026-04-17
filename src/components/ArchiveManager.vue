<script setup>
import { ref, computed } from 'vue'
import { useLabStore } from '../stores/labStore'

const store = useLabStore()

// Local State
const archiveUpload = ref(null)
const archiveReactionSearch = ref('')

// Local Computed
const filteredArchivedReactions = computed(() => {
    if (!archiveReactionSearch.value) return store.archivedReactions;
    const term = archiveReactionSearch.value.toLowerCase();
    return store.archivedReactions.filter(item => 
        (item.name && item.name.toLowerCase().includes(term))
    );
})

// --- Archive Methods ---
const restoreReaction = (item) => {
    const idx = typeof item === 'number' ? item : store.archivedReactions.indexOf(item);
    if (idx !== -1) store.reactions.unshift(store.archivedReactions.splice(idx, 1)[0]);
}

const deleteArchivedReaction = (item) => {
    const idx = typeof item === 'number' ? item : store.archivedReactions.indexOf(item);
    if (idx !== -1) store.archivedReactions.splice(idx, 1);
}

const restoreMatrix = (index) => { store.matrices.unshift(store.archivedMatrices.splice(index, 1)[0]); }
const restoreReverseMatrix = (index) => { store.reverseMatrices.unshift(store.archivedReverseMatrices.splice(index, 1)[0]); }
const restorePlate = (index) => { store.wellPlates.unshift(store.archivedPlates.splice(index, 1)[0]); }

// --- Import / Export ---
const exportArchive = () => {
    const data = {
        reactions: store.archivedReactions,
        matrices: store.archivedMatrices,
        reverseMatrices: store.archivedReverseMatrices,
        plates: store.archivedPlates
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BoekhovenLab_Archive_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

const importArchive = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parsed = JSON.parse(e.target.result);
            if(parsed.reactions) store.archivedReactions.push(...parsed.reactions);
            if(parsed.matrices) store.archivedMatrices.push(...parsed.matrices);
            if(parsed.reverseMatrices) store.archivedReverseMatrices.push(...parsed.reverseMatrices);
            if(parsed.plates) store.archivedPlates.push(...parsed.plates);
            alert("Archive imported successfully!");
        } catch(err) {
            console.error(err);
            alert("Error parsing archive file. Ensure it is a valid JSON export.");
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}
</script>

<template>
  <div class="card">
    <div class="flex-between" style="border-bottom: 2px solid var(--bg); padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between;">
        <h2 style="border: none; padding: 0; margin: 0;"><i class="fas fa-box-archive"></i> Archive</h2>
        <div style="display: flex; gap: 10px;">
            <button class="small" @click="exportArchive"><i class="fas fa-file-export"></i> Export</button>
            <button class="small" @click="archiveUpload.click()"><i class="fas fa-file-import"></i> Import</button>
            <input type="file" ref="archiveUpload" @change="importArchive" accept=".json" style="display: none;">
        </div>
    </div>
    
    <div v-if="store.archivedReactions.length === 0 && store.archivedMatrices.length === 0 && store.archivedReverseMatrices.length === 0 && store.archivedPlates.length === 0" style="opacity: 0.6; text-align: center; padding: 20px;">Archive is empty.</div>
    
    <div v-if="store.archivedReactions.length > 0" style="margin-bottom: 15px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h4 style="margin: 0;">Archived Reactions</h4>
            <div class="search-box" style="margin-bottom: 0; width: 250px;">
                <i class="fas fa-search" style="top: 8px;"></i>
                <input type="text" v-model="archiveReactionSearch" placeholder="Search protocols..." style="padding: 6px 10px 6px 30px; font-size: 0.8rem; height: 30px;">
            </div>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <div v-for="item in filteredArchivedReactions" :key="'ar'+item.id" style="background: var(--panel-bg); padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius); display: flex; align-items: center; gap: 10px;">
                <span>{{ item.name }}</span>
                <button class="small success" @click="restoreReaction(item)" title="Restore"><i class="fas fa-arrow-rotate-left"></i></button>
                <button class="small danger" @click="deleteArchivedReaction(item)" title="Delete Permanently"><i class="fas fa-times"></i></button>
            </div>
            <div v-if="filteredArchivedReactions.length === 0" style="font-size: 0.85rem; opacity: 0.7;">No protocols found matching search.</div>
        </div>
    </div>

    <div v-if="store.archivedMatrices.length > 0" style="margin-bottom: 15px;">
        <h4>Archived Matrices</h4>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <div v-for="(item, i) in store.archivedMatrices" :key="'am'+i" style="background: var(--panel-bg); padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius); display: flex; align-items: center; gap: 10px;">
                <span>{{ item.name }}</span>
                <button class="small success" @click="restoreMatrix(i)" title="Restore"><i class="fas fa-arrow-rotate-left"></i></button>
                <button class="small danger" @click="store.archivedMatrices.splice(i, 1)" title="Delete Permanently"><i class="fas fa-times"></i></button>
            </div>
        </div>
    </div>

    <div v-if="store.archivedReverseMatrices.length > 0" style="margin-bottom: 15px;">
        <h4>Archived Screenings</h4>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <div v-for="(item, i) in store.archivedReverseMatrices" :key="'arm'+i" style="background: var(--panel-bg); padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius); display: flex; align-items: center; gap: 10px;">
                <span>{{ item.name }}</span>
                <button class="small success" @click="restoreReverseMatrix(i)" title="Restore"><i class="fas fa-arrow-rotate-left"></i></button>
                <button class="small danger" @click="store.archivedReverseMatrices.splice(i, 1)" title="Delete Permanently"><i class="fas fa-times"></i></button>
            </div>
        </div>
    </div>

    <div v-if="store.archivedPlates.length > 0">
        <h4>Archived Plates</h4>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <div v-for="(item, i) in store.archivedPlates" :key="'ap'+i" style="background: var(--panel-bg); padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius); display: flex; align-items: center; gap: 10px;">
                <span>{{ item.name }}</span>
                <button class="small success" @click="restorePlate(i)" title="Restore"><i class="fas fa-arrow-rotate-left"></i></button>
                <button class="small danger" @click="store.archivedPlates.splice(i, 1)" title="Delete Permanently"><i class="fas fa-times"></i></button>
            </div>
        </div>
    </div>
  </div>
</template>