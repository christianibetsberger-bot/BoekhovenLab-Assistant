<script setup>
import { onMounted } from 'vue'
import { db } from './services/supabase'
import { useLabStore } from './stores/labStore'

// --- Core Modules ---
import AuthLogin from './components/AuthLogin.vue'
import LabJournal from './components/LabJournal.vue'
import GlobalSettings from './components/GlobalSettings.vue'
import StandardStock from './components/StandardStock.vue'
import SequenceCalc from './components/SequenceCalc.vue'
import InventoryManager from './components/InventoryManager.vue'

// --- Planners ---
import ReactionPlan from './components/ReactionPlan.vue'
import MatrixPlanner from './components/MatrixPlanner.vue'
import ScreeningPlanner from './components/ScreeningPlanner.vue'

// --- Plates & Archive ---
import WellPlateEditor from './components/WellPlateEditor.vue'
import ArchiveManager from './components/ArchiveManager.vue'

const store = useLabStore()

onMounted(() => {
  db.auth.getSession().then(({ data }) => {
    if (data.session) {
      store.user = data.session.user
      store.loadCloudInventory()
    }
  })

  db.auth.onAuthStateChange((event, session) => {
    store.user = session?.user || null
    if (store.user) {
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
        
        <div class="header-row" style="grid-column: 1 / -1; display: flex; justify-content: flex-end; align-items: center; padding: 10px 0; gap: 15px;">
          <span style="opacity: 0.7; font-size: 0.85rem;">User: <strong>{{ store.user.email }}</strong></span>
          <button class="small danger" @click="signOut"><i class="fas fa-sign-out-alt"></i> Logout</button>
        </div>
        
        <div style="grid-column: 1 / -1;">
          <LabJournal />
        </div>
        
        <div class="sidebar-col" style="grid-column: 1; display: flex; flex-direction: column; gap: 20px;">
          <GlobalSettings />
          <StandardStock />
          <SequenceCalc />
          <ArchiveManager />
        </div>

        <div class="workspace-col" style="grid-column: 2; display: flex; flex-direction: column; gap: 20px;">
          <InventoryManager />
          <ReactionPlan />
          <MatrixPlanner />
          <ScreeningPlanner />
          <WellPlateEditor />
        </div>

      </template>
    </div>
  </div>
</template>

<style>
/* Ensuring the grid behaves correctly. 
  Column 1 is for the small calculators, Column 2 is for the big planners.
*/
.container {
  display: grid;
  grid-template-columns: 350px 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 1000px) {
  .container {
    grid-template-columns: 1fr;
  }
  .sidebar-col, .workspace-col {
    grid-column: 1 / -1 !important;
  }
}
</style>