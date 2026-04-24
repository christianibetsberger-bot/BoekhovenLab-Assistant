<script setup>
import { onMounted, watch, ref, computed, markRaw } from 'vue'
import { db } from './services/supabase'
import { useLabStore } from './stores/labStore'

import AuthLogin from './components/AuthLogin.vue'
import LabJournal from './components/LabJournal.vue'
import GlobalSettings from './components/GlobalSettings.vue'
import StandardStock from './components/StandardStock.vue'
import SequenceCalc from './components/SequenceCalc.vue'
import InventoryManager from './components/InventoryManager.vue'
import ReactionPlan from './components/ReactionPlan.vue'
import MatrixPlanner from './components/MatrixPlanner.vue'
import ScreeningPlanner from './components/ScreeningPlanner.vue'
import PhasePredictor from './components/PhasePredictor.vue'
import WellPlateEditor from './components/WellPlateEditor.vue'
import ArchiveManager from './components/ArchiveManager.vue'

const store = useLabStore()

// Icons match each component's actual <h2> fa- class
const MODULE_META = {
  labJournal:       { label: 'Lab Journal', icon: 'fa-book',             component: markRaw(LabJournal) },
  globalSettings:   { label: 'Settings',    icon: 'fa-sliders',          component: markRaw(GlobalSettings) },
  standardStock:    { label: 'Stock Calc',  icon: 'fa-flask-vial',       component: markRaw(StandardStock) },
  sequenceCalc:     { label: 'DNA Calc',    icon: 'fa-dna',              component: markRaw(SequenceCalc) },
  archiveManager:   { label: 'Archive',     icon: 'fa-box-archive',      component: markRaw(ArchiveManager) },
  inventoryManager: { label: 'Inventory',   icon: 'fa-boxes-stacked',    component: markRaw(InventoryManager) },
  reactionPlan:     { label: 'Reaction',    icon: 'fa-flask',            component: markRaw(ReactionPlan) },
  matrixPlanner:    { label: 'Matrix',      icon: 'fa-table-cells',      component: markRaw(MatrixPlanner) },
  screeningPlanner: { label: 'Screening',   icon: 'fa-table-cells-large',component: markRaw(ScreeningPlanner) },
  phasePredictor:   { label: 'Phase Map',   icon: 'fa-brain',            component: markRaw(PhasePredictor) },
  wellPlateEditor:  { label: 'Well Plate',  icon: 'fa-border-all',       component: markRaw(WellPlateEditor) },
}

const layout = ref({ topOrder: [], leftOrder: [], rightOrder: [], minimized: {} })

function loadLayout() { layout.value = store.loadModuleLayout() }
function saveLayout()  { store.saveModuleLayout(layout.value) }

function toggleModule(id) {
  layout.value.minimized = { ...layout.value.minimized, [id]: !layout.value.minimized[id] }
  saveLayout()
}
function isMinimized(id) { return !!layout.value.minimized[id] }
function resetLayout() { layout.value = store.getDefaultModuleLayout(); saveLayout() }

// Dynamic grid: collapses to 1-col when one side has nothing visible
const leftHasVisible  = computed(() => layout.value.leftOrder.some(id  => !isMinimized(id)))
const rightHasVisible = computed(() => layout.value.rightOrder.some(id => !isMinimized(id)))
const gridCols = computed(() => {
  if (leftHasVisible.value && rightHasVisible.value) return 'minmax(380px, 460px) minmax(0, 1fr)'
  return '1fr'
})

// Drag & drop via handle strip
const dragging   = ref(null)
const dragOverId  = ref(null)
const dragOverCol = ref(null)

function onDragStart(id, col) { dragging.value = { id, col } }
function onDragOver(e, id, col) { e.preventDefault(); dragOverId.value = id; dragOverCol.value = col }
function onDrop(e, targetId, targetCol) {
  e.preventDefault()
  if (!dragging.value) return
  const { id: srcId, col: srcCol } = dragging.value
  const getList = c => c === 'left' ? layout.value.leftOrder : c === 'right' ? layout.value.rightOrder : layout.value.topOrder
  const srcList = getList(srcCol)
  const tgtList = getList(targetCol)
  const srcIdx  = srcList.indexOf(srcId)
  const tgtIdx  = tgtList.indexOf(targetId)
  if (srcCol === targetCol) {
    srcList.splice(srcIdx, 1); srcList.splice(tgtIdx, 0, srcId)
  } else {
    srcList.splice(srcIdx, 1); tgtList.splice(tgtIdx, 0, srcId)
  }
  dragging.value = null; dragOverId.value = null; dragOverCol.value = null
  saveLayout()
}
function onDragEnd() { dragging.value = null; dragOverId.value = null; dragOverCol.value = null }

// All module ids for sidebar (top → left → right order)
const allModuleIds = computed(() => {
  const seen = new Set(); const result = []
  for (const id of [...layout.value.topOrder, ...layout.value.leftOrder, ...layout.value.rightOrder]) {
    if (!seen.has(id)) { seen.add(id); result.push(id) }
  }
  return result
})

let draftSaveTimeout
watch(
  [() => store.reactions, () => store.matrices, () => store.reverseMatrices, () => store.wellPlates, () => store.journal.entries],
  () => { clearTimeout(draftSaveTimeout); draftSaveTimeout = setTimeout(() => store.saveLocalDrafts(), 800) },
  { deep: true }
)

onMounted(() => {
  db.auth.getSession().then(({ data }) => {
    if (data.session) { store.user = data.session.user; store.loadUserPreferences(); store.loadCloudInventory(); loadLayout() }
  })
  db.auth.onAuthStateChange((event, session) => {
    store.user = session?.user || null
    if (store.user) { store.loadUserPreferences(); store.loadCloudInventory(); loadLayout() }
  })
})

const signOut = async () => { await db.auth.signOut(); window.location.reload() }
</script>

<template>
  <div id="body-wrapper" :class="{ 'dark-mode': store.isDarkMode }">

    <AuthLogin v-if="!store.user" />

    <template v-else>

      <!-- Auto-hide sidebar -->
      <nav class="module-sidebar">
        <div class="sidebar-modules">
          <button
            v-for="id in allModuleIds"
            :key="id"
            class="sidebar-btn"
            :class="{ 'is-active': !isMinimized(id), 'is-hidden': isMinimized(id) }"
            :title="MODULE_META[id].label"
            @click="toggleModule(id)"
          >
            <i class="fas" :class="MODULE_META[id].icon"></i>
            <span class="sidebar-label">{{ MODULE_META[id].label }}</span>
          </button>
        </div>

        <div class="sidebar-footer">
          <button class="sidebar-btn sidebar-reset" title="Reset layout" @click="resetLayout">
            <i class="fas fa-rotate-left"></i>
            <span class="sidebar-label">Reset</span>
          </button>
        </div>
      </nav>

      <!-- Main content -->
      <div class="app-main">

        <div class="top-bar">
          <span class="user-info"><i class="fas fa-user-circle"></i> {{ store.user.email }}</span>
          <button class="small danger" @click="signOut"><i class="fas fa-sign-out-alt"></i> Log Out</button>
        </div>

        <!-- Full-width top modules (Lab Journal etc.) -->
        <template v-for="id in layout.topOrder" :key="id">
          <div
            v-show="!isMinimized(id)"
            class="module-wrapper top-module"
            :class="{ 'drag-over': dragOverId === id && dragOverCol === 'top' }"
            @dragover="onDragOver($event, id, 'top')"
            @drop="onDrop($event, id, 'top')"
          >
            <div class="drag-handle" draggable="true" @dragstart="onDragStart(id, 'top')" @dragend="onDragEnd" title="Drag to reorder">
              <i class="fas fa-grip-lines"></i>
            </div>
            <component :is="MODULE_META[id].component" />
          </div>
        </template>

        <!-- Two-column workspace (collapses when one side empty) -->
        <div class="workspace-grid" :style="{ gridTemplateColumns: gridCols }">

          <div class="workspace-col" id="col-left" v-show="leftHasVisible">
            <template v-for="id in layout.leftOrder" :key="id">
              <div
                v-show="!isMinimized(id)"
                class="module-wrapper"
                :class="{ 'drag-over': dragOverId === id && dragOverCol === 'left' }"
                @dragover="onDragOver($event, id, 'left')"
                @drop="onDrop($event, id, 'left')"
              >
                <div class="drag-handle" draggable="true" @dragstart="onDragStart(id, 'left')" @dragend="onDragEnd" title="Drag to reorder">
                  <i class="fas fa-grip-lines"></i>
                </div>
                <component :is="MODULE_META[id].component" />
              </div>
            </template>
          </div>

          <div class="workspace-col" id="col-right" v-show="rightHasVisible">
            <template v-for="id in layout.rightOrder" :key="id">
              <div
                v-show="!isMinimized(id)"
                class="module-wrapper"
                :class="{ 'drag-over': dragOverId === id && dragOverCol === 'right' }"
                @dragover="onDragOver($event, id, 'right')"
                @drop="onDrop($event, id, 'right')"
              >
                <div class="drag-handle" draggable="true" @dragstart="onDragStart(id, 'right')" @dragend="onDragEnd" title="Drag to reorder">
                  <i class="fas fa-grip-lines"></i>
                </div>
                <component :is="MODULE_META[id].component" />
              </div>
            </template>
          </div>

        </div>
      </div>

    </template>
  </div>
</template>

<style>
body { padding: 0 !important; margin: 0 !important; }

#body-wrapper { display: flex; min-height: 100vh; }

/* ══ Auto-hide sidebar ══ */
.module-sidebar {
  position: fixed;
  left: 0; top: 0;
  height: 100vh;
  width: 96px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  box-shadow: 4px 0 16px rgba(0,0,0,0.18);
  display: flex;
  flex-direction: column;
  padding: 10px 0;
  z-index: 500;
  transform: translateX(calc(-96px + 5px));
  transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  overflow-y: auto;
  overflow-x: hidden;
}
.module-sidebar:hover { transform: translateX(0); }

/* Coloured peek strip */
.module-sidebar::before {
  content: '';
  position: absolute;
  right: 0; top: 0;
  width: 5px; height: 100%;
  background: var(--primary);
  opacity: 0.55;
  pointer-events: none;
  transition: opacity 0.22s;
}
.module-sidebar:hover::before { opacity: 0; }

.sidebar-modules {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 8px;
  width: 100%;
}
.sidebar-footer {
  border-top: 1px solid var(--border);
  padding: 8px 8px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Rectangular sidebar button */
.sidebar-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--text);
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.sidebar-btn i { font-size: 0.95rem; width: 16px; text-align: center; flex-shrink: 0; }
.sidebar-label  { font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; }

.sidebar-btn.is-active {
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  border-color: color-mix(in srgb, var(--primary) 35%, transparent);
  color: var(--primary);
}
.sidebar-btn.is-hidden { opacity: 0.4; }
.sidebar-btn:hover {
  filter: none;
  background: color-mix(in srgb, var(--primary) 20%, transparent);
  border-color: color-mix(in srgb, var(--primary) 45%, transparent);
  color: var(--primary);
  opacity: 1;
}
.sidebar-reset { opacity: 0.5; }
.sidebar-reset:hover { opacity: 1; }

/* ══ Main content ══ */
.app-main {
  flex: 1;
  min-width: 0;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.top-bar {
  display: flex; align-items: center; justify-content: flex-end; gap: 12px;
}
.user-info { font-size: 0.9rem; opacity: 0.8; display: flex; align-items: center; gap: 6px; }

/* ══ Workspace grid — columns collapse when empty ══ */
.workspace-grid {
  display: grid;
  gap: 20px;
  align-items: start;
  /* gridTemplateColumns set dynamically via :style */
}

.workspace-col {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

/* ══ Module wrappers ══ */
.module-wrapper { border-radius: var(--radius); transition: box-shadow 0.15s; }
.module-wrapper.drag-over { box-shadow: 0 0 0 2px var(--primary); }

.drag-handle {
  display: flex; align-items: center; justify-content: center;
  height: 14px;
  background: var(--panel-bg);
  border: 1px solid var(--border); border-bottom: none;
  border-radius: var(--radius) var(--radius) 0 0;
  cursor: grab; opacity: 0.35;
  transition: opacity 0.15s;
  font-size: 0.65rem; color: var(--text);
}
.drag-handle:hover  { opacity: 0.9; }
.drag-handle:active { cursor: grabbing; }

@media (max-width: 1200px) {
  .workspace-grid { grid-template-columns: 1fr !important; }
}
</style>
