<script setup>
import { onMounted, onUnmounted, watch, ref, computed, markRaw } from 'vue'
import { db } from './services/supabase'
import { useLabStore } from './stores/labStore'
import { useDynamicIcon } from './composables/useDynamicIcon.js'

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
import LidaKinetics from './components/LidaKinetics.vue'
import WellPlateEditor from './components/WellPlateEditor.vue'
import ArchiveManager from './components/ArchiveManager.vue'
import TimeTracker from './components/TimeTracker.vue'
import TopBarClock from './components/TopBarClock.vue'

import lidaIcon from './assets/lida-icon.svg?raw'

const store = useLabStore()
useDynamicIcon()

// Icons match each component's actual <h2> fa- class
const MODULE_META = {
  labJournal:       { label: 'Lab Journal', icon: 'fa-book',              component: markRaw(LabJournal) },
  globalSettings:   { label: 'Settings',    icon: 'fa-sliders',           component: markRaw(GlobalSettings) },
  standardStock:    { label: 'Stock Calc',  icon: 'fa-flask-vial',        component: markRaw(StandardStock) },
  sequenceCalc:     { label: 'DNA Calc',    icon: 'fa-dna',               component: markRaw(SequenceCalc) },
  archiveManager:   { label: 'Archive',     icon: 'fa-box-archive',       component: markRaw(ArchiveManager) },
  inventoryManager: { label: 'Inventory',   icon: 'fa-boxes-stacked',     component: markRaw(InventoryManager) },
  reactionPlan:     { label: 'Reaction',    icon: 'fa-flask',             component: markRaw(ReactionPlan) },
  matrixPlanner:    { label: 'Matrix',      icon: 'fa-table-cells',       component: markRaw(MatrixPlanner) },
  screeningPlanner: { label: 'Screening',   icon: 'fa-table-cells-large', component: markRaw(ScreeningPlanner) },
  phasePredictor:   { label: 'Phase Map',   icon: 'fa-brain',             component: markRaw(PhasePredictor) },
  lidaKinetics:     { label: 'LIDA Kinetics', icon: 'fa-dna',  svgIcon: lidaIcon, component: markRaw(LidaKinetics) },
  wellPlateEditor:  { label: 'Well Plate',  icon: 'fa-border-all',        component: markRaw(WellPlateEditor) },
  timeTracker:      { label: 'Time Tracker', icon: 'fa-clock',             component: markRaw(TimeTracker) },
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

// Per-user module visibility overrides — listed users never see these modules
// (TimeTracker is not relevant for the lab head).
const PER_USER_HIDDEN = {
  timeTracker: ['job.boekhoven@tum.de'],
}
function isModuleHiddenForUser(id) {
  const list = PER_USER_HIDDEN[id]
  if (!list) return false
  return list.includes(store.user?.email)
}
const visibleTimeTracker = computed(() => !isModuleHiddenForUser('timeTracker'))

// All module ids visible in the sidebar (excludes sidebarHidden); top → left → right order
const allModuleIds = computed(() => {
  const seen = new Set(); const result = []
  const hidden = layout.value.sidebarHidden || {}
  for (const id of [...layout.value.topOrder, ...layout.value.leftOrder, ...layout.value.rightOrder]) {
    if (seen.has(id)) continue
    if (hidden[id])  continue
    if (isModuleHiddenForUser(id)) continue
    seen.add(id); result.push(id)
  }
  return result
})

// Modules removed from sidebar (can be re-added via redock panel)
const removedModuleIds = computed(() =>
  Object.keys(layout.value.sidebarHidden || {}).filter(id => layout.value.sidebarHidden[id])
)

// Sidebar position and dock utilities
const POSITION_CYCLE = ['left', 'bottom', 'right']
const sidebarPosition = computed(() => layout.value.sidebarPosition || 'left')
const positionIconMap  = { left: 'fa-align-left', bottom: 'fa-align-center', right: 'fa-align-right' }
const positionIcon     = computed(() => positionIconMap[sidebarPosition.value])
function cyclePosition() {
  const cur = layout.value.sidebarPosition || 'left'
  layout.value.sidebarPosition = POSITION_CYCLE[(POSITION_CYCLE.indexOf(cur) + 1) % 3]
  saveLayout()
}

// Sidebar remove / redock
const showRedockPanel = ref(false)
function removeFromSidebar(id) {
  layout.value.sidebarHidden = { ...layout.value.sidebarHidden, [id]: true }
  saveLayout()
}
function redockModule(id) {
  const h = { ...layout.value.sidebarHidden }
  delete h[id]
  layout.value.sidebarHidden = h
  if (!Object.values(h).some(Boolean)) showRedockPanel.value = false
  saveLayout()
}

let draftSaveTimeout
watch(
  [() => store.reactions, () => store.matrices, () => store.reverseMatrices, () => store.wellPlates],
  () => { clearTimeout(draftSaveTimeout); draftSaveTimeout = setTimeout(() => store.saveLocalDrafts(), 800) },
  { deep: true }
)

// Persist globalSettings (mmReactions, decimals) whenever they change.
// These are mutated directly via v-model in GlobalSettings.vue with no explicit save call.
let _settingsSaveTimeout
watch(
  () => store.globalSettings,
  () => { clearTimeout(_settingsSaveTimeout); _settingsSaveTimeout = setTimeout(() => store.saveUserPreferences(), 400) },
  { deep: true }
)

async function initSession(user) {
  store.user = user
  // loadCloudSettings fetches prefs + layout from Supabase and writes them into
  // localStorage, so the subsequent loadLayout() call reads cloud-sourced data
  // regardless of whether this is a browser tab or an isolated PWA context.
  await store.loadCloudSettings()
  store.loadCloudInventory()
  loadLayout()
}

onMounted(() => {
  db.auth.getSession().then(({ data }) => {
    if (data.session) initSession(data.session.user)
  })
  db.auth.onAuthStateChange((event, session) => {
    if (session?.user) initSession(session.user)
    else store.user = null
  })
})

const signOut = async () => { await db.auth.signOut(); window.location.reload() }

// Close redock panel on any click outside the panel or its toggle button
const _closeRedock = () => { showRedockPanel.value = false }
onMounted(() => document.addEventListener('click', _closeRedock))
onUnmounted(() => document.removeEventListener('click', _closeRedock))
</script>

<template>
  <div id="body-wrapper" :class="{ 'dark-mode': store.isDarkMode }">

    <AuthLogin v-if="!store.user" />

    <template v-else>

      <!-- Auto-hide sidebar dock -->
      <nav class="module-sidebar" :class="`pos-${sidebarPosition}`">
        <div class="sidebar-modules">
          <button
            v-for="id in allModuleIds"
            :key="id"
            class="sidebar-btn"
            :class="{ 'is-active': !isMinimized(id), 'is-hidden': isMinimized(id) }"
            :title="MODULE_META[id].label"
            @click="toggleModule(id)"
          >
            <span class="sidebar-remove" @click.stop="removeFromSidebar(id)" title="Remove from sidebar">
              <i class="fas fa-xmark"></i>
            </span>
            <div class="sidebar-icon">
              <span v-if="MODULE_META[id].svgIcon" class="sidebar-svg" v-html="MODULE_META[id].svgIcon"></span>
              <i v-else class="fas" :class="MODULE_META[id].icon"></i>
            </div>
          </button>
        </div>

        <div class="sidebar-footer">
          <button v-if="removedModuleIds.length" class="sidebar-btn" title="Add hidden modules back"
            @click.stop="showRedockPanel = !showRedockPanel">
            <div class="sidebar-icon sidebar-icon-util"><i class="fas fa-plus"></i></div>
          </button>
          <button class="sidebar-btn" :title="`Dock position: ${sidebarPosition}`" @click="cyclePosition">
            <div class="sidebar-icon sidebar-icon-util"><i class="fas" :class="positionIcon"></i></div>
          </button>
          <button class="sidebar-btn" title="Reset layout" @click="resetLayout">
            <div class="sidebar-icon sidebar-icon-util"><i class="fas fa-rotate-left"></i></div>
          </button>
        </div>
      </nav>

      <!-- Redock picker — rendered at body level so it escapes the sidebar's overflow clip -->
      <Teleport to="body">
        <div v-show="showRedockPanel" class="redock-panel"
          :class="[`panel-${sidebarPosition}`, { 'dark-mode': store.isDarkMode }]"
          @click.stop>
          <p class="redock-title">Hidden modules</p>
          <div class="redock-grid">
            <button v-for="id in removedModuleIds" :key="id" class="redock-item"
              :title="MODULE_META[id].label" @click="redockModule(id)">
              <div class="sidebar-icon redock-icon">
                <span v-if="MODULE_META[id].svgIcon" class="sidebar-svg" v-html="MODULE_META[id].svgIcon"></span>
                <i v-else class="fas" :class="MODULE_META[id].icon"></i>
              </div>
              <span class="redock-label">{{ MODULE_META[id].label }}</span>
            </button>
          </div>
        </div>
      </Teleport>

      <!-- Main content -->
      <div class="app-main">

        <div class="top-bar">
          <TopBarClock v-if="visibleTimeTracker" />
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
              v-if="!isModuleHiddenForUser(id)"
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
                v-if="!isModuleHiddenForUser(id)"
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
                v-if="!isModuleHiddenForUser(id)"
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

/* ══ Sidebar dock — Liquid Glass, three positions ══ */
.module-sidebar {
  position: fixed;
  z-index: 500;
  background: rgba(235, 235, 245, 0.58);
  backdrop-filter: blur(64px) saturate(200%);
  -webkit-backdrop-filter: blur(64px) saturate(200%);
  box-shadow: 0 8px 40px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.55);
  display: flex;
  gap: 0;
  transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
  scrollbar-width: none;
}
.module-sidebar::-webkit-scrollbar { display: none; }
.dark-mode .module-sidebar {
  background: rgba(12, 12, 22, 0.62);
  box-shadow: 0 8px 48px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07);
}

/* ── Left dock ── */
.module-sidebar.pos-left {
  left: 0; top: 50%;
  transform: translateY(-50%) translateX(calc(-100% + 6px));
  flex-direction: column;
  padding: 10px 7px;
  width: 56px;
  border-radius: 0 18px 18px 0;
  border: 1px solid rgba(255,255,255,0.42); border-left: none;
  max-height: calc(100vh - 80px);
  overflow-y: auto; overflow-x: hidden;
}
.module-sidebar.pos-left:hover { transform: translateY(-50%) translateX(0); }

/* ── Right dock ── */
.module-sidebar.pos-right {
  right: 0; left: auto; top: 50%;
  transform: translateY(-50%) translateX(calc(100% - 6px));
  flex-direction: column;
  padding: 10px 7px;
  width: 56px;
  border-radius: 18px 0 0 18px;
  border: 1px solid rgba(255,255,255,0.42); border-right: none;
  max-height: calc(100vh - 80px);
  overflow-y: auto; overflow-x: hidden;
}
.module-sidebar.pos-right:hover { transform: translateY(-50%) translateX(0); }

/* ── Bottom dock ── */
.module-sidebar.pos-bottom {
  bottom: 0; top: auto; left: 50%;
  transform: translateX(-50%) translateY(calc(100% - 6px));
  flex-direction: row;
  padding: 7px 10px;
  height: 56px;
  width: auto; max-width: calc(100vw - 80px);
  border-radius: 18px 18px 0 0;
  border: 1px solid rgba(255,255,255,0.42); border-bottom: none;
  overflow-x: auto; overflow-y: hidden;
}
.module-sidebar.pos-bottom:hover { transform: translateX(-50%) translateY(0); }

.dark-mode .module-sidebar.pos-left,
.dark-mode .module-sidebar.pos-right,
.dark-mode .module-sidebar.pos-bottom { border-color: rgba(255,255,255,0.10); }

/* Sidebar sections */
.sidebar-modules {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 5px;
}
.pos-left .sidebar-modules, .pos-right .sidebar-modules { flex-direction: column; }
.pos-bottom .sidebar-modules { flex-direction: row; }

.sidebar-footer {
  display: flex;
  align-items: center;
  gap: 5px;
}
.pos-left  .sidebar-footer, .pos-right .sidebar-footer {
  flex-direction: column;
  border-top: 1px solid rgba(120,120,140,0.22);
  padding-top: 6px; margin-top: 4px;
}
.pos-bottom .sidebar-footer {
  flex-direction: row;
  border-left: 1px solid rgba(120,120,140,0.22);
  padding-left: 6px; margin-left: 4px;
}
.dark-mode .sidebar-footer { border-color: rgba(255,255,255,0.08) !important; }

/* ── Button ── */
.sidebar-btn {
  display: flex; align-items: center; justify-content: center;
  background: transparent; border: none; border-radius: 10px;
  cursor: pointer; position: relative; padding: 2px; flex-shrink: 0;
}
.sidebar-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

/* Remove ×  (appears on hover over each icon) */
.sidebar-remove {
  position: absolute;
  top: -2px; right: -2px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: rgba(50,50,70,0.72);
  color: rgba(255,255,255,0.92);
  font-size: 0.52rem;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none;
  transition: opacity 0.15s;
  z-index: 10; cursor: pointer; line-height: 1;
}
.sidebar-btn:hover .sidebar-remove { opacity: 1; pointer-events: auto; }

/* ── Icon tile — translucent primary-color squircle ── */
.sidebar-icon {
  width: 38px; height: 38px;
  border-radius: 22%;
  display: flex; align-items: center; justify-content: center;
  position: relative; overflow: hidden; flex-shrink: 0;
  background: color-mix(in srgb, var(--primary) 28%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 44%, rgba(255,255,255,0.16));
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.22);
  transition:
    transform  0.22s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.22s ease,
    opacity    0.18s ease,
    filter     0.18s ease;
}
/* Diagonal gloss */
.sidebar-icon::after {
  content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: linear-gradient(148deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.07) 42%, rgba(255,255,255,0) 65%);
}
.sidebar-icon i {
  font-size: 1.0rem;
  color: rgba(255,255,255,0.95);
  text-shadow: 0 1px 3px rgba(0,0,0,0.28);
  position: relative; z-index: 1;
}
.sidebar-svg {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px;
  color: rgba(255,255,255,0.95);
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.28));
  position: relative; z-index: 1;
}
.sidebar-svg svg { width: 100%; height: 100%; display: block; }

/* Hover: spring lift */
.sidebar-btn:hover .sidebar-icon {
  transform: scale(1.13) translateY(-2px);
  box-shadow: 0 8px 20px rgba(0,0,0,0.24), 0 2px 6px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.26);
}

/* Inactive module: dimmed + desaturated */
.sidebar-btn.is-hidden .sidebar-icon { opacity: 0.36; filter: saturate(0.35); }

/* Active indicator dot */
.sidebar-btn.is-active::after {
  content: ''; position: absolute; bottom: 0; left: 50%; transform: translateX(-50%);
  width: 3px; height: 3px; border-radius: 50%;
  background: color-mix(in srgb, var(--primary) 80%, rgba(255,255,255,0.6));
}

/* Utility icons (position toggle, reset, redock add) */
.sidebar-icon-util {
  background: color-mix(in srgb, var(--primary) 12%, rgba(120,120,140,0.10));
  border-color: rgba(120,120,140,0.22);
  opacity: 0.60;
}
.sidebar-btn:hover .sidebar-icon-util { opacity: 1; transform: scale(1.10) translateY(-1px); }

/* ── Redock picker panel ── */
.redock-panel {
  position: fixed; z-index: 600;
  background: rgba(235,235,245,0.90);
  backdrop-filter: blur(48px) saturate(180%);
  -webkit-backdrop-filter: blur(48px) saturate(180%);
  border: 1px solid rgba(255,255,255,0.50);
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.55);
  padding: 12px 14px 14px;
  min-width: 160px;
}
.redock-panel.dark-mode {
  background: rgba(18,18,32,0.90);
  border-color: rgba(255,255,255,0.10);
  box-shadow: 0 12px 40px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.06);
}
/* Positions relative to each dock edge */
.panel-left   { left: 64px;  bottom: 80px; }
.panel-right  { right: 64px; bottom: 80px; }
.panel-bottom { bottom: 64px; left: 50%; transform: translateX(-50%); }

.redock-title {
  font-size: 0.65rem; font-weight: 600;
  color: var(--text); opacity: 0.55;
  margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.06em;
}
.redock-grid { display: flex; flex-wrap: wrap; gap: 8px; max-width: 220px; }
.redock-item {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  background: transparent; border: none; cursor: pointer;
  border-radius: 10px; padding: 6px 4px;
  transition: background 0.15s;
}
.redock-item:hover { background: rgba(0,0,0,0.06); }
.redock-panel.dark-mode .redock-item:hover { background: rgba(255,255,255,0.06); }
.redock-icon { width: 34px !important; height: 34px !important; }
.redock-label {
  font-size: 0.58rem; color: var(--text); opacity: 0.72;
  white-space: nowrap; max-width: 52px;
  overflow: hidden; text-overflow: ellipsis; text-align: center;
}

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
  display: flex; align-items: center; gap: 12px;
}
.top-bar .user-info { margin-left: auto; }
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
