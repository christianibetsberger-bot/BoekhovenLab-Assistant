<script setup>
import { onMounted, watch, ref, computed, markRaw } from 'vue'
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

// Module metadata — defines all 10 modules
const MODULE_META = {
  globalSettings:    { label: 'Settings',    icon: 'fa-cog',        component: markRaw(GlobalSettings) },
  standardStock:     { label: 'Stock Calc',  icon: 'fa-flask',      component: markRaw(StandardStock) },
  sequenceCalc:      { label: 'DNA Calc',    icon: 'fa-dna',        component: markRaw(SequenceCalc) },
  archiveManager:    { label: 'Archive',     icon: 'fa-archive',    component: markRaw(ArchiveManager) },
  inventoryManager:  { label: 'Inventory',   icon: 'fa-boxes',      component: markRaw(InventoryManager) },
  reactionPlan:      { label: 'Reaction',    icon: 'fa-vial',       component: markRaw(ReactionPlan) },
  matrixPlanner:     { label: 'Matrix',      icon: 'fa-th',         component: markRaw(MatrixPlanner) },
  screeningPlanner:  { label: 'Screening',   icon: 'fa-layer-group',component: markRaw(ScreeningPlanner) },
  phasePredictor:    { label: 'Phase Map',   icon: 'fa-chart-bar',  component: markRaw(PhasePredictor) },
  wellPlateEditor:   { label: 'Well Plate',  icon: 'fa-grip-horizontal', component: markRaw(WellPlateEditor) },
}

// Layout state — loaded from store (user-specific localStorage)
const layout = ref({ leftOrder: [], rightOrder: [], minimized: {} })

function loadLayout() {
  layout.value = store.loadModuleLayout()
}

function saveLayout() {
  store.saveModuleLayout(layout.value)
}

function toggleModule(id) {
  const current = layout.value.minimized[id]
  layout.value.minimized = { ...layout.value.minimized, [id]: !current }
  saveLayout()
}

function isMinimized(id) {
  return !!layout.value.minimized[id]
}

function resetLayout() {
  layout.value = store.getDefaultModuleLayout()
  saveLayout()
}

// Drag & drop reordering
const dragging = ref(null)
const dragOverId = ref(null)
const dragOverCol = ref(null)

function onDragStart(id, col) {
  dragging.value = { id, col }
}

function onDragOver(e, id, col) {
  e.preventDefault()
  dragOverId.value = id
  dragOverCol.value = col
}

function onDrop(e, targetId, targetCol) {
  e.preventDefault()
  if (!dragging.value) return
  const { id: srcId, col: srcCol } = dragging.value

  const srcList = srcCol === 'left' ? layout.value.leftOrder : layout.value.rightOrder
  const tgtList = targetCol === 'left' ? layout.value.leftOrder : layout.value.rightOrder

  const srcIdx = srcList.indexOf(srcId)
  const tgtIdx = tgtList.indexOf(targetId)

  if (srcCol === targetCol) {
    // Reorder within the same column
    srcList.splice(srcIdx, 1)
    srcList.splice(tgtIdx, 0, srcId)
  } else {
    // Move between columns
    srcList.splice(srcIdx, 1)
    tgtList.splice(tgtIdx, 0, srcId)
  }

  dragging.value = null
  dragOverId.value = null
  dragOverCol.value = null
  saveLayout()
}

function onDragEnd() {
  dragging.value = null
  dragOverId.value = null
  dragOverCol.value = null
}

// All 10 module ids in sidebar order (left then right)
const allModuleIds = computed(() => {
  const all = new Set([...layout.value.leftOrder, ...layout.value.rightOrder])
  return [...all]
})

// Auto-save drafts
let draftSaveTimeout
watch(
  [() => store.reactions, () => store.matrices, () => store.reverseMatrices, () => store.wellPlates, () => store.journal.entries],
  () => {
    clearTimeout(draftSaveTimeout)
    draftSaveTimeout = setTimeout(() => store.saveLocalDrafts(), 800)
  },
  { deep: true }
)

onMounted(() => {
  db.auth.getSession().then(({ data }) => {
    if (data.session) {
      store.user = data.session.user
      store.loadUserPreferences()
      store.loadCloudInventory()
      loadLayout()
    }
  })

  db.auth.onAuthStateChange((event, session) => {
    store.user = session?.user || null
    if (store.user) {
      store.loadUserPreferences()
      store.loadCloudInventory()
      loadLayout()
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

    <AuthLogin v-if="!store.user" />

    <template v-else>

      <!-- ───── Module Sidebar ───── -->
      <nav class="module-sidebar">
        <div class="sidebar-logo">
          <i class="fas fa-atom"></i>
        </div>

        <div class="sidebar-modules">
          <button
            v-for="id in allModuleIds"
            :key="id"
            class="sidebar-btn"
            :class="{ 'is-minimized': isMinimized(id), 'is-active': !isMinimized(id) }"
            :title="MODULE_META[id].label + (isMinimized(id) ? ' (hidden — click to show)' : ' (click to hide)')"
            @click="toggleModule(id)"
          >
            <i class="fas" :class="MODULE_META[id].icon"></i>
            <span class="sidebar-label">{{ MODULE_META[id].label }}</span>
          </button>
        </div>

        <div class="sidebar-footer">
          <button class="sidebar-btn sidebar-reset" title="Reset layout to default" @click="resetLayout">
            <i class="fas fa-undo"></i>
            <span class="sidebar-label">Reset</span>
          </button>
        </div>
      </nav>

      <!-- ───── Main Content ───── -->
      <div class="app-main">

        <!-- Top bar -->
        <div class="top-bar">
          <span class="user-info">
            <i class="fas fa-user-circle"></i>
            {{ store.user.email }}
          </span>
          <button class="small danger" @click="signOut">
            <i class="fas fa-sign-out-alt"></i> Log Out
          </button>
        </div>

        <!-- Lab Journal always full width -->
        <div class="journal-row">
          <LabJournal />
        </div>

        <!-- Two-column workspace -->
        <div class="workspace-grid">

          <!-- Left column -->
          <div class="workspace-col" id="col-left">
            <template v-for="id in layout.leftOrder" :key="id">
              <div
                class="module-wrapper"
                :class="{
                  'is-minimized': isMinimized(id),
                  'drag-over': dragOverId === id && dragOverCol === 'left'
                }"
                @dragover="onDragOver($event, id, 'left')"
                @drop="onDrop($event, id, 'left')"
              >
                <div
                  class="drag-handle"
                  draggable="true"
                  @dragstart="onDragStart(id, 'left')"
                  @dragend="onDragEnd"
                  title="Drag to reorder"
                >
                  <i class="fas fa-grip-lines"></i>
                </div>
                <div v-if="isMinimized(id)" class="minimized-placeholder" @click="toggleModule(id)">
                  <i class="fas" :class="MODULE_META[id].icon"></i>
                  <span>{{ MODULE_META[id].label }}</span>
                  <i class="fas fa-expand-alt expand-icon"></i>
                </div>
                <component :is="MODULE_META[id].component" v-show="!isMinimized(id)" />
              </div>
            </template>
          </div>

          <!-- Right column -->
          <div class="workspace-col" id="col-right">
            <template v-for="id in layout.rightOrder" :key="id">
              <div
                class="module-wrapper"
                :class="{
                  'is-minimized': isMinimized(id),
                  'drag-over': dragOverId === id && dragOverCol === 'right'
                }"
                @dragover="onDragOver($event, id, 'right')"
                @drop="onDrop($event, id, 'right')"
              >
                <div
                  class="drag-handle"
                  draggable="true"
                  @dragstart="onDragStart(id, 'right')"
                  @dragend="onDragEnd"
                  title="Drag to reorder"
                >
                  <i class="fas fa-grip-lines"></i>
                </div>
                <div v-if="isMinimized(id)" class="minimized-placeholder" @click="toggleModule(id)">
                  <i class="fas" :class="MODULE_META[id].icon"></i>
                  <span>{{ MODULE_META[id].label }}</span>
                  <i class="fas fa-expand-alt expand-icon"></i>
                </div>
                <component :is="MODULE_META[id].component" v-show="!isMinimized(id)" />
              </div>
            </template>
          </div>

        </div>
      </div>

    </template>
  </div>
</template>

<style>
/* ── Reset body padding for new sidebar layout ── */
body {
  padding: 0 !important;
  margin: 0 !important;
}

/* ── Layout shell ── */
#body-wrapper {
  display: flex;
  min-height: 100vh;
}

.module-sidebar {
  width: 72px;
  flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  z-index: 100;
  transition: background 0.3s, border-color 0.3s;
}

.sidebar-logo {
  font-size: 1.4rem;
  color: var(--primary);
  padding: 10px 0 16px;
  border-bottom: 1px solid var(--border);
  width: 100%;
  text-align: center;
}

.sidebar-modules {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 0;
  width: 100%;
}

.sidebar-footer {
  border-top: 1px solid var(--border);
  padding: 8px 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.sidebar-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  width: 60px;
  padding: 8px 4px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--text);
  cursor: pointer;
  font-size: 0.65rem;
  text-transform: none;
  letter-spacing: 0;
  transition: all 0.15s;
}

.sidebar-btn i {
  font-size: 1.1rem;
}

.sidebar-btn .sidebar-label {
  font-size: 0.6rem;
  opacity: 0.8;
  text-align: center;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 58px;
}

.sidebar-btn.is-active {
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  border-color: color-mix(in srgb, var(--primary) 30%, transparent);
  color: var(--primary);
}

.sidebar-btn.is-minimized {
  opacity: 0.45;
}

.sidebar-btn:hover {
  filter: none;
  background: color-mix(in srgb, var(--primary) 18%, transparent);
  border-color: color-mix(in srgb, var(--primary) 40%, transparent);
  color: var(--primary);
  opacity: 1;
}

.sidebar-reset {
  color: #6b7280;
}

/* ── Main content area ── */
.app-main {
  flex: 1;
  min-width: 0;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.user-info {
  font-size: 0.9rem;
  opacity: 0.8;
  display: flex;
  align-items: center;
  gap: 6px;
}

.journal-row {
  width: 100%;
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(380px, 460px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.workspace-col {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

/* ── Module wrappers ── */
.module-wrapper {
  border-radius: var(--radius);
  transition: box-shadow 0.15s;
}

.module-wrapper.drag-over {
  box-shadow: 0 0 0 2px var(--primary);
}

.drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: var(--radius) var(--radius) 0 0;
  cursor: grab;
  opacity: 0.5;
  transition: opacity 0.15s;
  font-size: 0.7rem;
  color: var(--text);
}

.drag-handle:hover {
  opacity: 1;
  background: color-mix(in srgb, var(--primary) 8%, var(--panel-bg));
}

.drag-handle:active {
  cursor: grabbing;
}

.minimized-placeholder {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-top: 4px solid var(--primary);
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--primary);
  opacity: 0.75;
  transition: opacity 0.15s;
}

.minimized-placeholder:hover {
  opacity: 1;
}

.minimized-placeholder i:first-child {
  font-size: 1rem;
}

.expand-icon {
  margin-left: auto;
  font-size: 0.75rem;
  opacity: 0.6;
}

/* ── Responsive ── */
@media (max-width: 1200px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .module-sidebar {
    width: 56px;
  }
  .sidebar-btn {
    width: 46px;
  }
  .sidebar-label {
    display: none;
  }
}
</style>
