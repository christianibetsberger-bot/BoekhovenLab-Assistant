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

// Track which columns have at least one visible module (drives v-show on column divs)
const topHasVisible   = computed(() => layout.value.topOrder.some(id   => !isMinimized(id)))
const leftHasVisible  = computed(() => layout.value.leftOrder.some(id  => !isMinimized(id)))
const rightHasVisible = computed(() => layout.value.rightOrder.some(id => !isMinimized(id)))

// Drag & drop via handle strip
const dragging      = ref(null)
const dragOverId    = ref(null)
const dragOverCol   = ref(null)
const isDragging    = ref(false)
const dragOverEmpty = ref(null)   // 'top' | 'left' | 'right' | null

const getList = c => c === 'left' ? layout.value.leftOrder : c === 'right' ? layout.value.rightOrder : layout.value.topOrder

function clearDragState() {
  dragging.value = null; dragOverId.value = null; dragOverCol.value = null
  isDragging.value = false; dragOverEmpty.value = null
}

// Set isDragging on mousedown so columns expand BEFORE the browser initialises
// the native drag (dragstart fires after the drag ghost is captured).
function onHandleMouseDown()    { isDragging.value = true }
function onHandleMouseUp()      { if (!dragging.value) isDragging.value = false }

function onDragStart(id, col)   { dragging.value = { id, col }; isDragging.value = true }
function onDragEnd()            { clearDragState() }
function onDragOver(e, id, col) { e.preventDefault(); e.stopPropagation(); dragOverId.value = id; dragOverCol.value = col; dragOverEmpty.value = null }
function onDrop(e, targetId, targetCol) {
  e.preventDefault(); e.stopPropagation()
  if (!dragging.value) return
  const { id: srcId, col: srcCol } = dragging.value
  const srcList = getList(srcCol), tgtList = getList(targetCol)
  const srcIdx  = srcList.indexOf(srcId), tgtIdx = tgtList.indexOf(targetId)
  if (srcCol === targetCol) {
    srcList.splice(srcIdx, 1); srcList.splice(tgtIdx, 0, srcId)
  } else {
    srcList.splice(srcIdx, 1); tgtList.splice(tgtIdx, 0, srcId)
  }
  clearDragState(); saveLayout()
}

// Column-level drop: fires when dropping on empty column background (not on a module)
function onColDragOver(e, col) { e.preventDefault(); dragOverEmpty.value = col; dragOverId.value = null; dragOverCol.value = null }
function onColDrop(e, col) {
  e.preventDefault()
  if (!dragging.value) return
  const { id: srcId, col: srcCol } = dragging.value
  const srcList = getList(srcCol), tgtList = getList(col)
  const srcIdx = srcList.indexOf(srcId)
  if (srcIdx !== -1) srcList.splice(srcIdx, 1)
  if (!tgtList.includes(srcId)) tgtList.push(srcId)
  clearDragState(); saveLayout()
}

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

        <!-- Full-width top zone (Lab Journal etc.) — always rendered so it can receive drops -->
        <div
          class="top-zone"
          :class="{ 'drop-zone-hover': dragOverEmpty === 'top' }"
          @dragover="onColDragOver($event, 'top')"
          @drop="onColDrop($event, 'top')"
        >
          <template v-for="id in layout.topOrder" :key="id">
            <div
              v-show="!isMinimized(id)"
              class="module-wrapper top-module"
              :class="{ 'drag-over': dragOverId === id && dragOverCol === 'top' }"
              @dragover="onDragOver($event, id, 'top')"
              @drop="onDrop($event, id, 'top')"
            >
              <div class="drag-handle" draggable="true"
                @mousedown="onHandleMouseDown" @mouseup="onHandleMouseUp"
                @dragstart="onDragStart(id, 'top')" @dragend="onDragEnd" title="Drag to reorder">
                <i class="fas fa-grip-lines"></i>
              </div>
              <component :is="MODULE_META[id].component" />
            </div>
          </template>
          <div v-show="isDragging && !topHasVisible" class="empty-drop-hint"
            @dragover.prevent="onColDragOver($event, 'top')"
            @drop.prevent="onColDrop($event, 'top')">
            <i class="fas fa-arrows-left-right"></i> Drop here — full width
          </div>
        </div>

        <!-- Two-column workspace — flexbox so v-show:none removes column from flow -->
        <div class="workspace-row">

          <!-- Left column: always in DOM; CSS collapses when empty + not dragging -->
          <div
            class="ws-col ws-left"
            :class="{ 'col-has-content': leftHasVisible, 'col-drag-open': isDragging, 'drop-zone-hover': dragOverEmpty === 'left' }"
            @dragover="onColDragOver($event, 'left')"
            @drop="onColDrop($event, 'left')"
          >
            <template v-for="id in layout.leftOrder" :key="id">
              <div
                v-show="!isMinimized(id)"
                class="module-wrapper"
                :class="{ 'drag-over': dragOverId === id && dragOverCol === 'left' }"
                @dragover="onDragOver($event, id, 'left')"
                @drop="onDrop($event, id, 'left')"
              >
                <div class="drag-handle" draggable="true"
                  @mousedown="onHandleMouseDown" @mouseup="onHandleMouseUp"
                  @dragstart="onDragStart(id, 'left')" @dragend="onDragEnd" title="Drag to reorder">
                  <i class="fas fa-grip-lines"></i>
                </div>
                <component :is="MODULE_META[id].component" />
              </div>
            </template>
            <div v-show="isDragging && !leftHasVisible" class="empty-drop-hint"
              @dragover.prevent="onColDragOver($event, 'left')"
              @drop.prevent="onColDrop($event, 'left')">
              <i class="fas fa-compress-alt"></i> Drop here — narrow column
            </div>
          </div>

          <!-- Right column: always in DOM; CSS collapses when empty + not dragging -->
          <div
            class="ws-col ws-right"
            :class="{ 'col-has-content': rightHasVisible, 'col-drag-open': isDragging, 'drop-zone-hover': dragOverEmpty === 'right' }"
            @dragover="onColDragOver($event, 'right')"
            @drop="onColDrop($event, 'right')"
          >
            <template v-for="id in layout.rightOrder" :key="id">
              <div
                v-show="!isMinimized(id)"
                class="module-wrapper"
                :class="{ 'drag-over': dragOverId === id && dragOverCol === 'right' }"
                @dragover="onDragOver($event, id, 'right')"
                @drop="onDrop($event, id, 'right')"
              >
                <div class="drag-handle" draggable="true"
                  @mousedown="onHandleMouseDown" @mouseup="onHandleMouseUp"
                  @dragstart="onDragStart(id, 'right')" @dragend="onDragEnd" title="Drag to reorder">
                  <i class="fas fa-grip-lines"></i>
                </div>
                <component :is="MODULE_META[id].component" />
              </div>
            </template>
            <div v-show="isDragging && !rightHasVisible" class="empty-drop-hint"
              @dragover.prevent="onColDragOver($event, 'right')"
              @drop.prevent="onColDrop($event, 'right')">
              <i class="fas fa-expand-alt"></i> Drop here — wide column
            </div>
          </div>

        </div>
      </div>

    </template>
  </div>
</template>

<style>
body { padding: 0 !important; margin: 0 !important; }

/* #app is the Vue mount point inside <body>. Must fill full viewport width. */
#app { width: 100%; }

#body-wrapper { display: flex; min-height: 100vh; width: 100%; }

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

/* ══ Workspace — flexbox so v-show:display:none removes a column from layout ══ */
.workspace-row {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  width: 100%;
}

.ws-col {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

/* ── Column visibility: CSS-class driven so elements stay in DOM ──
   Columns without content and not in a drag collapse to nothing.
   col-has-content / col-drag-open are set by Vue bindings. */
.ws-left.col-has-content,
.ws-left.col-drag-open  { flex: 0 0 460px; }

.ws-right.col-has-content,
.ws-right.col-drag-open  { flex: 1; min-width: 0; }

/* Collapse when neither class is present */
.ws-col:not(.col-has-content):not(.col-drag-open) {
  flex: 0 0 0 !important;
  min-width: 0 !important;
  overflow: hidden;
  gap: 0 !important;
}

/* ══ Module wrappers ══ */
.module-wrapper {
  border-radius: var(--radius);
  transition: box-shadow 0.15s;
  /* Container context so child elements can respond to the module's own width */
  container-type: inline-size;
}
.module-wrapper.drag-over { box-shadow: 0 0 0 2px var(--primary); }

/* ── Responsive card headers at narrow widths ──
   Targets .flex-between pattern used in all module card headers.
   !important overrides inline display:flex;justify-content:space-between styles. */
@container (max-width: 520px) {
  .flex-between {
    flex-wrap: wrap !important;
    row-gap: 8px !important;
    align-items: flex-start !important;
  }
  /* Button rows inside the header also wrap */
  .flex-between > div {
    flex-wrap: wrap !important;
    row-gap: 6px !important;
  }
  /* Shrink h2 title slightly to give buttons more room */
  .card h2 { font-size: 1.05rem; }
}

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
  .workspace-row { flex-direction: column; }
  .ws-left.col-has-content,
  .ws-left.col-drag-open { flex: 1 1 auto; }
}

/* ══ Top zone wrapper ══ */
.top-zone {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ══ Empty-column drop hints ══ */
.empty-drop-hint {
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  padding: 28px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 80px;
  color: var(--text);
  font-size: 0.82rem;
  opacity: 0.4;
  transition: opacity 0.15s, border-color 0.15s, color 0.15s;
  cursor: copy;
}

.ws-col.drop-zone-hover,
.top-zone.drop-zone-hover {
  background: color-mix(in srgb, var(--primary) 6%, transparent);
  border-radius: var(--radius);
}

.ws-col.drop-zone-hover .empty-drop-hint,
.top-zone.drop-zone-hover .empty-drop-hint {
  opacity: 0.9;
  border-color: var(--primary);
  color: var(--primary);
}
</style>
