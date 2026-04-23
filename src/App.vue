<script setup>
import { onMounted, watch } from 'vue'
import { db } from './services/supabase'
import { useLabStore } from './stores/labStore'

// --- Core Modules ---
import AuthLogin from './components/AuthLogin.vue'
import LabJournal from './components/LabJournal.vue'
import GlobalSettings from './components/GlobalSettings.vue'
import StandardStock from './components/StandardStock.vue'
import SequenceCalc from './components/SequenceCalc.vue'
import InventoryManager from './components/InventoryManager.vue'

// --- Advanced Planners ---
import ReactionPlan from './components/ReactionPlan.vue'
import MatrixPlanner from './components/MatrixPlanner.vue'
import ScreeningPlanner from './components/ScreeningPlanner.vue'
import PhasePredictor from './components/PhasePredictor.vue'

// --- Plate & Archive Management ---
import WellPlateEditor from './components/WellPlateEditor.vue'
import ArchiveManager from './components/ArchiveManager.vue'

const store = useLabStore()

// Auto-save full workspace state per user so unsaved items/blocks survive refresh
let draftSaveTimeout
watch(
  [() => store.reactions, () => store.matrices, () => store.reverseMatrices, () => store.wellPlates],
  () => {
    clearTimeout(draftSaveTimeout)
    draftSaveTimeout = setTimeout(() => store.saveLocalDrafts(), 800)
  },
  { deep: true }
)

onMounted(() => {
  // Check if user is already logged in on load
  db.auth.getSession().then(({ data }) => {
    if (data.session) {
      store.user = data.session.user
      store.loadUserPreferences()
      store.loadCloudInventory()
    }
  })

  // Listen for login/logout events to switch UI
  db.auth.onAuthStateChange((event, session) => {
    store.user = session?.user || null
    if (store.user) {
        store.loadUserPreferences()
        store.loadCloudInventory()
    }
  })
})

const signOut = async () => {
  await db.auth.signOut()
  window.location.reload()
}
</script>

<template>
  <div id="body-wrapper" :class="{ 'dark-mode': store.isDarkMode }">
    <div class="container">
      
      <AuthLogin v-if="!store.user" />
      
      <template v-else>
        
        <div class="full-width-header" style="text-align: right; margin-bottom: 15px; grid-column: 1 / -1;">
          <span style="opacity: 0.8; font-size: 0.9rem; margin-right: 10px;">
            Logged in as: <strong>{{ store.user.email }}</strong>
          </span>
          <button class="small danger" @click="signOut">
            <i class="fas fa-sign-out-alt"></i> Log Out
          </button>
        </div>
        
        <div style="grid-column: 1 / -1;">
          <LabJournal />
        </div>
        
        <div class="sidebar-col" style="grid-column: 1; display: flex; flex-direction: column; gap: 20px;">
          <GlobalSettings />
          <StandardStock />
          <SequenceCalc />
          <ArchiveManager />
          <InventoryManager />
        </div>

        <div class="workspace-col" style="grid-column: 2; display: flex; flex-direction: column; gap: 20px;">
          <ReactionPlan />
          <MatrixPlanner />
          <ScreeningPlanner />
          <PhasePredictor />
          <WellPlateEditor />
        </div>

      </template>
    </div>
  </div>
</template>

<style>
/* MASTER LAYOUT DEFINITION
  Column 1 (Sidebar): 450px
  Column 2 (Workspace): Flexible remainder
*/
.container {
  display: grid;
  grid-template-columns: 450px 1fr;
  gap: 25px;
  align-items: start;
  max-width: 100%;
  padding: 0 20px;
}

/* Internal column containers */
.sidebar-col, .workspace-col {
  min-width: 0;
}

/* Responsive adjustment for laptops/smaller monitors */
@media (max-width: 1300px) {
  .container {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .sidebar-col, .workspace-col {
    grid-column: 1 / -1 !important;
  }
}
</style>