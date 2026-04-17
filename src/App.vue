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

// --- Advanced Planners ---
import ReactionPlan from './components/ReactionPlan.vue'
import MatrixPlanner from './components/MatrixPlanner.vue'
import ScreeningPlanner from './components/ScreeningPlanner.vue'

// --- Plate & Archive Management (Prepared) ---
import WellPlateEditor from './components/WellPlateEditor.vue'
import ArchiveManager from './components/ArchiveManager.vue'

const store = useLabStore()

onMounted(() => {
  // Check if user is already logged in on load
  db.auth.getSession().then(({ data }) => {
    if (data.session) {
      store.user = data.session.user
      store.loadCloudInventory()
    }
  })

  // Listen for login/logout events to switch UI
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
        
        <div class="full-width-header" style="text-align: right; margin-bottom: 15px; grid-column: 1 / -1;">
          <span style="opacity: 0.8; font-size: 0.9rem; margin-right: 10px;">
            Logged in as: <strong>{{ store.user.email }}</strong>
          </span>
          <button class="small danger" @click="signOut">
            <i class="fas fa-sign-out-alt"></i> Log Out
          </button>
        </div>
        
        <LabJournal />
        
        <GlobalSettings />
        <StandardStock />
        <SequenceCalc />
        <InventoryManager />
        
        <ReactionPlan />
        <MatrixPlanner />
        <ScreeningPlanner />

        <WellPlateEditor />
        <ArchiveManager />

      </template>
    </div>
  </div>
</template>

<style>
/* Any App-specific overrides can go here, but global CSS is in style.css */
</style>