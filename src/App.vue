<script setup>
import { onMounted, onUnmounted, watch, ref, computed, markRaw, nextTick } from 'vue'
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

// ── Free-placement grid layout — 12-column absolute grid ───────────────────
const ROW_HEIGHT = 60
const COL_COUNT  = 12
const gridLayout     = ref([])   // [{i, x, y, w, h}] one entry per visible module
const savedPositions = ref({})   // last position for modules that were hidden
const dragState      = ref(null) // live drag preview  {id, x, y}
const resizeState    = ref(null) // live resize preview {id, w, h}
const bumpedLayout   = ref(null) // collision-resolved layout computed during drag
const gridContainer  = ref(null)
const containerWidth = ref(1200)

function cw() { return containerWidth.value / COL_COUNT }

const containerHeight = computed(() => {
  if (!gridLayout.value.length) return 400
  return Math.max(...gridLayout.value.map(item => {
    const h = resizeState.value?.id === item.i ? resizeState.value.h : item.h
    let y
    if (dragState.value?.id === item.i) y = dragState.value.y
    else if (bumpedLayout.value) y = bumpedLayout.value.find(i => i.i === item.i)?.y ?? item.y
    else y = item.y
    return (y + h) * ROW_HEIGHT
  })) + 60
})

function getModuleStyle(item) {
  const isDragged = dragState.value?.id === item.i
  const isResized = resizeState.value?.id === item.i
  let x = item.x, y = item.y, w = item.w, h = item.h
  if (isDragged) {
    x = dragState.value.x; y = dragState.value.y
  } else if (isResized) {
    w = resizeState.value.w; h = resizeState.value.h
  } else if (bumpedLayout.value) {
    const bumped = bumpedLayout.value.find(i => i.i === item.i)
    if (bumped) { x = bumped.x; y = bumped.y }
  }
  const active = isDragged || isResized
  return {
    position: 'absolute',
    left: `${x * cw()}px`,
    top:  `${y * ROW_HEIGHT}px`,
    width: `${w * cw()}px`,
    height:`${h * ROW_HEIGHT}px`,
    zIndex: isDragged ? 100 : 1,
    transition: active ? 'none' : 'left 0.12s ease, top 0.12s ease',
  }
}

function getDefaultGridLayout() {
  return [
    { i: 'inventoryManager',  x: 0,  y: 0,   w: 6,  h: 14 },
    { i: 'labJournal',        x: 6,  y: 0,   w: 6,  h: 14 },
    { i: 'reactionPlan',      x: 0,  y: 14,  w: 6,  h: 12 },
    { i: 'matrixPlanner',     x: 6,  y: 14,  w: 6,  h: 12 },
    { i: 'standardStock',     x: 0,  y: 26,  w: 4,  h: 10 },
    { i: 'sequenceCalc',      x: 4,  y: 26,  w: 4,  h: 10 },
    { i: 'screeningPlanner',  x: 8,  y: 26,  w: 4,  h: 10 },
    { i: 'phasePredictor',    x: 0,  y: 36,  w: 12, h: 20 },
    { i: 'lidaKinetics',      x: 0,  y: 56,  w: 12, h: 18 },
    { i: 'wellPlateEditor',   x: 0,  y: 74,  w: 12, h: 14 },
    { i: 'timeTracker',       x: 0,  y: 88,  w: 6,  h: 12 },
    { i: 'archiveManager',    x: 6,  y: 88,  w: 6,  h: 12 },
    { i: 'globalSettings',    x: 0,  y: 100, w: 12, h: 10 },
  ]
}

const GL_KEY    = computed(() => store.user?.id ? `gl2_${store.user.id}`   : null)
const LMETA_KEY = computed(() => store.user?.id ? `lmeta_${store.user.id}` : null)

function loadGridLayout() {
  if (!GL_KEY.value) return
  const raw = localStorage.getItem(GL_KEY.value)
  try { if (raw) { gridLayout.value = JSON.parse(raw); return } } catch {}
  gridLayout.value = getDefaultGridLayout().filter(i => !isModuleHiddenForUser(i.i))
}
function saveGridLayout() {
  if (GL_KEY.value) localStorage.setItem(GL_KEY.value, JSON.stringify(gridLayout.value))
}

// Layout meta stores sidebar-hidden flags + sidebar position
const layoutMeta = ref({ sidebarHidden: {}, sidebarPosition: 'left' })
function loadLayoutMeta() {
  if (!LMETA_KEY.value) return
  const raw = localStorage.getItem(LMETA_KEY.value)
  if (raw) { try { layoutMeta.value = { ...layoutMeta.value, ...JSON.parse(raw) } } catch {} }
  else {
    // Migrate from old layout key
    const oldKey = store.user?.id ? `layout_${store.user.id}` : null
    if (oldKey) { const or = localStorage.getItem(oldKey); if (or) try {
      const old = JSON.parse(or)
      if (old.sidebarHidden)   layoutMeta.value.sidebarHidden   = old.sidebarHidden
      if (old.sidebarPosition) layoutMeta.value.sidebarPosition = old.sidebarPosition
    } catch {} }
  }
}
function saveLayoutMeta() {
  if (LMETA_KEY.value) localStorage.setItem(LMETA_KEY.value, JSON.stringify(layoutMeta.value))
}

function isInGrid(id)  { return gridLayout.value.some(item => item.i === id) }

function toggleModule(id) {
  if (isInGrid(id)) {
    const item = gridLayout.value.find(i => i.i === id)
    if (item) savedPositions.value[id] = { x: item.x, y: item.y, w: item.w, h: item.h }
    gridLayout.value = gridLayout.value.filter(i => i.i !== id)
  } else {
    const def = getDefaultGridLayout().find(i => i.i === id) || { x: 0, y: 0, w: 6, h: 10 }
    const w   = savedPositions.value[id]?.w ?? def.w
    const h   = savedPositions.value[id]?.h ?? def.h
    // Always re-add at the very top of the page (y=0, full width)
    gridLayout.value = [...gridLayout.value, { i: id, x: 0, y: 0, w, h }]
  }
  saveGridLayout()
}

function resetLayout() {
  gridLayout.value = getDefaultGridLayout().filter(i => !isModuleHiddenForUser(i.i))
  savedPositions.value = {}
  sidebarGroups.value = []
  saveSidebarGroups()
  saveGridLayout()
}

// ── Gravity: each module floats up to fill vertical gaps above it ──
function applyGravity(layout) {
  const result = layout.map(i => ({...i}))
  let changed = true; let iter = 0
  while (changed && iter++ < 100) {
    changed = false
    for (const item of result) {
      // highest bottom-edge of any module that shares x-space and sits above this one
      const ceiling = result
        .filter(o => o.i !== item.i && o.x < item.x + item.w && o.x + o.w > item.x && o.y + o.h <= item.y)
        .reduce((max, o) => Math.max(max, o.y + o.h), 0)
      if (item.y > ceiling) { item.y = ceiling; changed = true }
    }
  }
  return result
}

// ── Collision detection & resolution ──
function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y
}

// Push all non-moved modules downward to resolve overlaps with the moved module
// and with each other. The moved module is absolute authority.
function resolveCollisions(layout, movedId) {
  const result = layout.map(i => ({...i}))
  let changed = true
  for (let iter = 0; iter < 50 && changed; iter++) {
    changed = false
    for (const b of result) {
      if (b.i === movedId) continue
      for (const a of result) {
        if (a.i === b.i) continue
        if (!overlaps(a, b)) continue
        // a has priority over b when a is the dragged module or sits higher (lower y)
        if (a.i === movedId || a.y <= b.y) {
          const newY = a.y + a.h
          if (b.y < newY) { b.y = newY; changed = true }
        }
      }
    }
  }
  return result
}

// ── Drag to move ──
function startDrag(id, e) {
  e.preventDefault()
  const item = gridLayout.value.find(i => i.i === id)
  if (!item) return
  const smx = e.clientX, smy = e.clientY, sx = item.x, sy = item.y, scw = cw()
  dragState.value = { id, x: sx, y: sy }
  const onMove = (me) => {
    const nx = Math.max(0, Math.min(COL_COUNT - item.w, Math.round(sx + (me.clientX - smx) / scw)))
    const ny = Math.max(0, Math.round(sy + (me.clientY - smy) / ROW_HEIGHT))
    dragState.value = { id, x: nx, y: ny }
    const preview = gridLayout.value.map(i => i.i === id ? {...i, x: nx, y: ny} : {...i})
    bumpedLayout.value = resolveCollisions(preview, id)
  }
  const onUp = () => {
    if (!dragState.value) return
    const { x, y } = dragState.value; dragState.value = null
    const base = bumpedLayout.value ?? gridLayout.value.map(i => i.i === id ? {...i, x, y} : {...i})
    bumpedLayout.value = null
    gridLayout.value = applyGravity(base)
    saveGridLayout()
    window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
}

// ── Resize from bottom-right corner ──
function startGridResize(id, e) {
  e.preventDefault(); e.stopPropagation()
  const item = gridLayout.value.find(i => i.i === id)
  if (!item) return
  const smx = e.clientX, smy = e.clientY, sw = item.w, sh = item.h, scw = cw()
  resizeState.value = { id, w: sw, h: sh }
  const onMove = (me) => {
    const nw = Math.max(2, Math.min(COL_COUNT - item.x, Math.round(sw + (me.clientX - smx) / scw)))
    const nh = Math.max(4, Math.round(sh + (me.clientY - smy) / ROW_HEIGHT))
    resizeState.value = { id, w: nw, h: nh }
    const preview = gridLayout.value.map(i => i.i === id ? {...i, w: nw, h: nh} : {...i})
    bumpedLayout.value = resolveCollisions(preview, id)
  }
  const onUp = () => {
    if (!resizeState.value) return
    const { w, h } = resizeState.value; resizeState.value = null
    const base = bumpedLayout.value ?? gridLayout.value.map(i => i.i === id ? {...i, w, h} : {...i})
    bumpedLayout.value = null
    gridLayout.value = applyGravity(base)
    saveGridLayout()
    window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
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

// All module ids visible in the sidebar (all MODULE_META keys, minus sidebarHidden + per-user hidden)
const allModuleIds = computed(() =>
  Object.keys(MODULE_META).filter(id => !layoutMeta.value.sidebarHidden?.[id] && !isModuleHiddenForUser(id))
)

// Modules removed from sidebar (can be re-added via redock panel)
const removedModuleIds = computed(() =>
  Object.keys(layoutMeta.value.sidebarHidden || {}).filter(id => layoutMeta.value.sidebarHidden[id])
)

// Sidebar position and dock utilities
const POSITION_CYCLE = ['left', 'bottom', 'right']
const sidebarPosition = computed(() => layoutMeta.value.sidebarPosition || 'left')
const positionIconMap  = { left: 'fa-align-left', bottom: 'fa-align-center', right: 'fa-align-right' }
const positionIcon     = computed(() => positionIconMap[sidebarPosition.value])
function cyclePosition() {
  const cur = layoutMeta.value.sidebarPosition || 'left'
  layoutMeta.value.sidebarPosition = POSITION_CYCLE[(POSITION_CYCLE.indexOf(cur) + 1) % 3]
  saveLayoutMeta()
}

// Sidebar remove / redock
const showRedockPanel = ref(false)
function removeFromSidebar(id) {
  layoutMeta.value.sidebarHidden = { ...layoutMeta.value.sidebarHidden, [id]: true }
  removeModuleFromGroups(id)
  saveLayoutMeta()
}
function redockModule(id) {
  const h = { ...layoutMeta.value.sidebarHidden }
  delete h[id]
  layoutMeta.value.sidebarHidden = h
  if (!Object.values(h).some(Boolean)) showRedockPanel.value = false
  saveLayoutMeta()
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

// ══════════════════════════════════════════════════════════════════════════
// SIDEBAR GROUPS — purely cosmetic grouping of sidebar icons
// ══════════════════════════════════════════════════════════════════════════

const SB_GROUP_ICONS = [
  'fa-flask', 'fa-vial', 'fa-microscope', 'fa-dna', 'fa-atom',
  'fa-fire', 'fa-bolt', 'fa-snowflake', 'fa-temperature-high', 'fa-eye-dropper',
  'fa-magnet', 'fa-chart-line', 'fa-calculator', 'fa-boxes-stacked', 'fa-clock',
  'fa-brain', 'fa-star', 'fa-book', 'fa-layer-group', 'fa-wave-square',
]

// sidebarGroups: Array<{ id, name, icon, moduleIds[] }>
const sidebarGroups = ref([])

// Which groups are expanded (showing their member icons inline)
const expandedGroups = ref(new Set())

function sbGroupsKey() {
  return store.user?.id ? 'sbg_' + store.user.id : null
}

function loadSidebarGroups() {
  const key = sbGroupsKey()
  if (!key) return
  try {
    const raw = localStorage.getItem(key)
    if (raw) sidebarGroups.value = JSON.parse(raw)
  } catch { sidebarGroups.value = [] }
}

function saveSidebarGroups() {
  const key = sbGroupsKey()
  if (!key) return
  localStorage.setItem(key, JSON.stringify(sidebarGroups.value))
}

function generateGroupId() {
  return 'g_' + Math.random().toString(36).slice(2, 9)
}

// Helper: find the group containing a moduleId
function findGroupForModule(moduleId) {
  return sidebarGroups.value.find(g => g.moduleIds.includes(moduleId)) || null
}

// Helper: remove a module from whatever group it is in (and disband if only 1 left)
function removeModuleFromGroups(moduleId) {
  sidebarGroups.value = sidebarGroups.value
    .map(g => ({ ...g, moduleIds: g.moduleIds.filter(m => m !== moduleId) }))
    .filter(g => g.moduleIds.length >= 2)  // disband single-member groups
  saveSidebarGroups()
}

function toggleGroupExpanded(groupId) {
  const s = new Set(expandedGroups.value)
  if (s.has(groupId)) s.delete(groupId)
  else s.add(groupId)
  expandedGroups.value = s
}

// Computed sidebar items: ordered mix of 'module' and 'group' items
const sidebarItems = computed(() => {
  const items = []
  const groupedModuleIds = new Set(sidebarGroups.value.flatMap(g => g.moduleIds))
  const emittedGroupIds = new Set()

  for (const id of allModuleIds.value) {
    if (groupedModuleIds.has(id)) {
      // Find which group owns this id
      const group = sidebarGroups.value.find(g => g.moduleIds.includes(id))
      if (group && !emittedGroupIds.has(group.id)) {
        emittedGroupIds.add(group.id)
        items.push({ type: 'group', group })
      }
      // Module itself is hidden from flat list (represented by the group button)
    } else {
      items.push({ type: 'module', id })
    }
  }
  return items
})

// ── Group editor modal ──
const groupEditor = ref(null)  // { group, anchorEl } | null
const groupEditorName = ref('')
const groupEditorIcon = ref('')

function openGroupEditor(group, event) {
  event?.stopPropagation()
  groupEditorName.value = group.name
  groupEditorIcon.value = group.icon
  groupEditor.value = { group: { ...group } }
}

function closeGroupEditor() {
  groupEditor.value = null
}

function saveGroupEditor() {
  if (!groupEditor.value) return
  const idx = sidebarGroups.value.findIndex(g => g.id === groupEditor.value.group.id)
  if (idx !== -1) {
    sidebarGroups.value[idx] = {
      ...sidebarGroups.value[idx],
      name: groupEditorName.value.trim() || 'Group',
      icon: groupEditorIcon.value,
    }
    saveSidebarGroups()
  }
  closeGroupEditor()
}

function disbandGroup(groupId) {
  sidebarGroups.value = sidebarGroups.value.filter(g => g.id !== groupId)
  expandedGroups.value.delete(groupId)
  saveSidebarGroups()
  closeGroupEditor()
}

function removeMemberFromGroup(groupId, moduleId) {
  const idx = sidebarGroups.value.findIndex(g => g.id === groupId)
  if (idx === -1) return
  const newIds = sidebarGroups.value[idx].moduleIds.filter(m => m !== moduleId)
  if (newIds.length < 2) {
    // Group would have 0 or 1 member — disband it
    disbandGroup(groupId)
  } else {
    sidebarGroups.value[idx] = { ...sidebarGroups.value[idx], moduleIds: newIds }
    saveSidebarGroups()
  }
}

// Close editor on Escape
function onKeydown(e) {
  if (e.key === 'Escape' && groupEditor.value) closeGroupEditor()
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

// ── Sidebar drag-to-group ──
const sidebarDragging   = ref(null)   // { moduleId }
const sidebarDragOver   = ref(null)   // moduleId being hovered as drop target

function sbDragStart(moduleId, e) {
  e.stopPropagation()
  sidebarDragging.value = { moduleId }
  // Use a minimal drag image so it doesn't conflict with layout dragging
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', moduleId)
  }
}

function sbDragEnd(e) {
  e.stopPropagation()
  sidebarDragging.value = null
  sidebarDragOver.value = null
}

function sbDragOver(targetId, e) {
  e.stopPropagation()
  e.preventDefault()
  if (!sidebarDragging.value) return
  const srcId = sidebarDragging.value.moduleId
  if (srcId === targetId) return
  sidebarDragOver.value = targetId
}

function sbDrop(targetId, e) {
  e.stopPropagation()
  e.preventDefault()
  if (!sidebarDragging.value) return
  const srcId = sidebarDragging.value.moduleId
  sidebarDragging.value = null
  sidebarDragOver.value = null
  if (srcId === targetId) return

  const srcGroup = findGroupForModule(srcId)
  const tgtGroup = findGroupForModule(targetId)

  if (srcGroup && tgtGroup && srcGroup.id === tgtGroup.id) return // same group, no-op

  if (!srcGroup && !tgtGroup) {
    // Neither is in a group — create a new group with both
    const newGroup = {
      id: generateGroupId(),
      name: 'Group',
      icon: 'fa-layer-group',
      moduleIds: [srcId, targetId],
    }
    sidebarGroups.value.push(newGroup)
    saveSidebarGroups()
    // Open editor so the user can name it
    nextTick(() => openGroupEditor(newGroup, null))
  } else if (tgtGroup && !srcGroup) {
    // Target is in a group: add source to that group
    const idx = sidebarGroups.value.findIndex(g => g.id === tgtGroup.id)
    if (idx !== -1 && !sidebarGroups.value[idx].moduleIds.includes(srcId)) {
      sidebarGroups.value[idx].moduleIds.push(srcId)
      saveSidebarGroups()
    }
  } else if (srcGroup && !tgtGroup) {
    // Source is in a group; move it out and create new group with target
    removeModuleFromGroups(srcId)
    const newGroup = {
      id: generateGroupId(),
      name: 'Group',
      icon: 'fa-layer-group',
      moduleIds: [srcId, targetId],
    }
    sidebarGroups.value.push(newGroup)
    saveSidebarGroups()
    nextTick(() => openGroupEditor(newGroup, null))
  } else if (srcGroup && tgtGroup) {
    // Both are in different groups: move src to target's group
    const srcIdx = sidebarGroups.value.findIndex(g => g.id === srcGroup.id)
    if (srcIdx !== -1) {
      sidebarGroups.value[srcIdx].moduleIds = sidebarGroups.value[srcIdx].moduleIds.filter(m => m !== srcId)
      if (sidebarGroups.value[srcIdx].moduleIds.length < 2) {
        // Disband source group
        sidebarGroups.value.splice(srcIdx, 1)
      }
    }
    const tgtIdx = sidebarGroups.value.findIndex(g => g.id === tgtGroup.id)
    if (tgtIdx !== -1 && !sidebarGroups.value[tgtIdx].moduleIds.includes(srcId)) {
      sidebarGroups.value[tgtIdx].moduleIds.push(srcId)
    }
    saveSidebarGroups()
  }
}

// Drop a module onto an existing group button (adds module to that group)
function sbDropOnGroup(groupId, e) {
  e.stopPropagation()
  e.preventDefault()
  if (!sidebarDragging.value) return
  const srcId = sidebarDragging.value.moduleId
  sidebarDragging.value = null
  sidebarDragOver.value = null

  const idx = sidebarGroups.value.findIndex(g => g.id === groupId)
  if (idx === -1) return
  if (sidebarGroups.value[idx].moduleIds.includes(srcId)) return  // already a member

  // Remove from any other group (may disband that group if it shrinks to 1)
  removeModuleFromGroups(srcId)

  // Re-find after potential splice in removeModuleFromGroups
  const idx2 = sidebarGroups.value.findIndex(g => g.id === groupId)
  if (idx2 !== -1 && !sidebarGroups.value[idx2].moduleIds.includes(srcId)) {
    sidebarGroups.value[idx2].moduleIds.push(srcId)
    saveSidebarGroups()
  }
}

// Drag a module OUT of an expanded group onto the sidebar background
function sbGroupMemberDragOver(e) {
  e.stopPropagation()
  e.preventDefault()
  sidebarDragOver.value = null
}

function sbSidebarBackgroundDrop(e) {
  e.stopPropagation()
  e.preventDefault()
  if (!sidebarDragging.value) return
  const srcId = sidebarDragging.value.moduleId
  sidebarDragging.value = null
  sidebarDragOver.value = null
  // If dragging from a group, remove from group (makes it standalone)
  const srcGroup = findGroupForModule(srcId)
  if (srcGroup) removeModuleFromGroups(srcId)
}

async function initSession(user) {
  store.user = user
  await store.loadCloudSettings()
  store.loadCloudInventory()
  loadLayoutMeta()
  loadGridLayout()
  loadSidebarGroups()
}

onMounted(() => {
  db.auth.getSession().then(({ data }) => {
    if (data.session) initSession(data.session.user)
  })
  db.auth.onAuthStateChange((event, session) => {
    if (session?.user) initSession(session.user)
    else store.user = null
  })
  // Keep containerWidth in sync so column widths are always accurate
  const onResize = () => { containerWidth.value = (gridContainer.value?.offsetWidth || window.innerWidth) - 4 }
  onResize()
  window.addEventListener('resize', onResize)
  onUnmounted(() => window.removeEventListener('resize', onResize))
})

const signOut = async () => { await db.auth.signOut(); window.location.reload() }

// Close redock panel on any click outside the panel or its toggle button
const _closeRedock = () => { showRedockPanel.value = false }
onMounted(() => document.addEventListener('click', _closeRedock))
onUnmounted(() => document.removeEventListener('click', _closeRedock))

// Close group editor on outside click
const groupEditorRef = ref(null)
function onDocClick(e) {
  if (groupEditor.value && groupEditorRef.value && !groupEditorRef.value.contains(e.target)) {
    saveGroupEditor()
  }
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onUnmounted(() => document.removeEventListener('mousedown', onDocClick))
</script>

<template>
  <div id="body-wrapper" :class="{ 'dark-mode': store.isDarkMode }">

    <AuthLogin v-if="!store.user" />

    <template v-else>

      <!-- Auto-hide sidebar dock -->
      <nav class="module-sidebar" :class="`pos-${sidebarPosition}`"
        @dragover.prevent="sbGroupMemberDragOver"
        @drop.prevent="sbSidebarBackgroundDrop"
      >
        <div class="sidebar-modules">

          <template v-for="item in sidebarItems" :key="item.type === 'module' ? item.id : item.group.id">

            <!-- ── Regular module button ── -->
            <template v-if="item.type === 'module'">
              <button
                class="sidebar-btn"
                :class="{
                  'is-active': isInGrid(item.id),
                  'is-hidden': !isInGrid(item.id),
                  'sg-drop-target': sidebarDragOver === item.id && sidebarDragging?.moduleId !== item.id,
                }"
                :title="MODULE_META[item.id].label"
                draggable="true"
                @click="toggleModule(item.id)"
                @dragstart.stop="sbDragStart(item.id, $event)"
                @dragend.stop="sbDragEnd"
                @dragover.stop.prevent="sbDragOver(item.id, $event)"
                @drop.stop.prevent="sbDrop(item.id, $event)"
              >
                <span class="sidebar-remove" @click.stop="removeFromSidebar(item.id)" title="Remove from sidebar">
                  <i class="fas fa-xmark"></i>
                </span>
                <div class="sidebar-icon">
                  <span v-if="MODULE_META[item.id].svgIcon" class="sidebar-svg" v-html="MODULE_META[item.id].svgIcon"></span>
                  <i v-else class="fas" :class="MODULE_META[item.id].icon"></i>
                </div>
              </button>
            </template>

            <!-- ── Group button ── -->
            <template v-else-if="item.type === 'group'">
              <div class="sg-group-wrapper">
                <!-- Group icon button (collapsed state) -->
                <button
                  class="sidebar-btn sg-group-item"
                  :class="{ 'sg-drop-target': sidebarDragOver === item.group.id && sidebarDragging }"
                  :title="item.group.name"
                  @click="toggleGroupExpanded(item.group.id)"
                  @contextmenu.prevent="openGroupEditor(item.group, $event)"
                  @dragover.stop.prevent="sbDragOver(item.group.id, $event)"
                  @drop.stop.prevent="sbDropOnGroup(item.group.id, $event)"
                >
                  <div class="sidebar-icon sg-group-icon">
                    <i class="fas" :class="item.group.icon"></i>
                  </div>
                  <span class="sg-badge">{{ item.group.moduleIds.length }}</span>
                </button>

                <!-- Expanded inline container -->
                <div
                  v-if="expandedGroups.has(item.group.id)"
                  class="sg-expanded"
                  :class="`sg-expanded-${sidebarPosition}`"
                >
                  <button
                    v-for="memberId in item.group.moduleIds.filter(mid => allModuleIds.includes(mid))"
                    :key="memberId"
                    class="sidebar-btn sg-member-btn"
                    :class="{
                      'is-active': isInGrid(memberId),
                      'is-hidden': !isInGrid(memberId),
                      'sg-drop-target': sidebarDragOver === memberId && sidebarDragging?.moduleId !== memberId,
                    }"
                    :title="MODULE_META[memberId]?.label"
                    draggable="true"
                    @click="toggleModule(memberId)"
                    @dragstart.stop="sbDragStart(memberId, $event)"
                    @dragend.stop="sbDragEnd"
                    @dragover.stop.prevent="sbDragOver(memberId, $event)"
                    @drop.stop.prevent="sbDrop(memberId, $event)"
                  >
                    <div class="sidebar-icon sg-member-icon">
                      <span v-if="MODULE_META[memberId]?.svgIcon" class="sidebar-svg" v-html="MODULE_META[memberId].svgIcon"></span>
                      <i v-else class="fas" :class="MODULE_META[memberId]?.icon"></i>
                    </div>
                  </button>
                </div>
              </div>
            </template>

          </template>
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

        <!-- Group editor floating panel -->
        <div
          v-if="groupEditor"
          ref="groupEditorRef"
          class="sg-editor"
          :class="[`sg-editor-${sidebarPosition}`, { 'dark-mode': store.isDarkMode }]"
          @click.stop
          @mousedown.stop
        >
          <p class="sg-editor-title">Edit Group</p>

          <label class="sg-editor-label">Name</label>
          <input
            class="sg-editor-input"
            v-model="groupEditorName"
            placeholder="Group name"
            maxlength="24"
            @keydown.enter.prevent="saveGroupEditor"
            @keydown.escape.prevent="closeGroupEditor"
          />

          <label class="sg-editor-label">Icon</label>
          <div class="sg-icon-picker">
            <button
              v-for="ic in SB_GROUP_ICONS"
              :key="ic"
              class="sg-icon-option"
              :class="{ 'sg-icon-selected': groupEditorIcon === ic }"
              :title="ic.replace('fa-','')"
              @click="groupEditorIcon = ic"
            >
              <i class="fas" :class="ic"></i>
            </button>
          </div>

          <label class="sg-editor-label">Members</label>
          <div class="sg-member-chips">
            <span
              v-for="mid in (sidebarGroups.find(g => g.id === groupEditor.group.id)?.moduleIds ?? [])"
              :key="mid"
              class="sg-member-chip"
              :title="MODULE_META[mid]?.label"
            >
              <i class="fas" :class="MODULE_META[mid]?.icon" style="font-size:0.7rem;"></i>
              {{ MODULE_META[mid]?.label ?? mid }}
              <button
                class="sg-chip-remove"
                @click="removeMemberFromGroup(groupEditor.group.id, mid)"
                title="Remove from group"
              >×</button>
            </span>
          </div>

          <div class="sg-editor-actions">
            <button class="sg-editor-save" @click="saveGroupEditor">Save</button>
            <button class="sg-editor-disband" @click="disbandGroup(groupEditor.group.id)">Disband</button>
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

        <!-- Free-placement 12-column grid workspace -->
        <div ref="gridContainer" class="grid-workspace" :style="{ height: containerHeight + 'px' }">
          <template v-for="item in gridLayout" :key="item.i">
            <div
              v-if="!isModuleHiddenForUser(item.i)"
              class="grid-module"
              :class="{ 'grid-module--active': dragState?.id === item.i || resizeState?.id === item.i }"
              :data-grid-id="item.i"
              :style="getModuleStyle(item)"
            >
              <div class="drag-handle" @mousedown.prevent="startDrag(item.i, $event)" title="Drag to move">
                <i class="fas fa-grip-lines"></i>
              </div>
              <div class="grid-module-content">
                <component :is="MODULE_META[item.i].component" />
              </div>
              <div class="grid-resize-handle" @mousedown.prevent="startGridResize(item.i, $event)" title="Drag to resize"></div>
            </div>
          </template>
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

/* ══ Free-placement grid workspace ══ */
.grid-workspace {
  position: relative;
  width: 100%;
}

.grid-module {
  position: absolute;
  box-sizing: border-box;
  overflow: hidden;
  border-radius: var(--radius);
  container-type: inline-size;
  display: flex;
  flex-direction: column;
}

.grid-module--active { z-index: 100; }

.grid-module-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.grid-resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 18px;
  height: 18px;
  cursor: se-resize;
  background: linear-gradient(135deg, transparent 50%, color-mix(in srgb, var(--primary) 40%, transparent) 50%);
  border-radius: 0 0 var(--radius) 0;
  opacity: 0.5;
  transition: opacity 0.15s;
  flex-shrink: 0;
  user-select: none;
  z-index: 2;
}
.grid-resize-handle:hover { opacity: 1; }

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
  flex-shrink: 0;
  background: var(--panel-bg);
  border: 1px solid var(--border); border-bottom: none;
  border-radius: var(--radius) var(--radius) 0 0;
  cursor: grab; opacity: 0.35;
  transition: opacity 0.15s;
  font-size: 0.65rem; color: var(--text);
  z-index: 2;
  position: relative;
}
.drag-handle:hover  { opacity: 0.9; }
.drag-handle:active { cursor: grabbing; }

/* ══════════════════════════════════════════════════════════════════════
   SIDEBAR GROUPS
   ══════════════════════════════════════════════════════════════════════ */

/* Group wrapper — positions the expanded container relative to the group button */
.sg-group-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

/* Group icon button: same squircle style but with a coloured ring */
.sg-group-item .sidebar-icon.sg-group-icon {
  background: color-mix(in srgb, var(--primary) 38%, rgba(80, 120, 255, 0.18));
  border: 2px solid color-mix(in srgb, var(--primary) 70%, rgba(255,255,255,0.4));
  box-shadow:
    0 2px 8px rgba(0,0,0,0.18),
    0 0 0 1px color-mix(in srgb, var(--primary) 30%, transparent),
    inset 0 1px 0 rgba(255,255,255,0.26);
}

/* Count badge — top-right corner of group button */
.sg-badge {
  position: absolute;
  top: -3px; right: -3px;
  min-width: 16px; height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--primary) 90%, rgba(0,0,0,0.2));
  color: #fff;
  font-size: 0.58rem;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  box-shadow: 0 1px 4px rgba(0,0,0,0.28);
  z-index: 12;
  pointer-events: none;
}

/* Expanded inline module container */
.sg-expanded {
  display: flex;
  gap: 4px;
  padding: 5px 4px;
  border-radius: 12px;
  background: rgba(200, 200, 220, 0.26);
  border: 1px solid rgba(180, 180, 200, 0.38);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 2px 10px rgba(0,0,0,0.10);
  margin-top: 3px;
  z-index: 10;
}
.dark-mode .sg-expanded {
  background: rgba(30, 30, 50, 0.52);
  border-color: rgba(255,255,255,0.10);
}

/* Left/right sidebar: expanded container is a column */
.sg-expanded-left,
.sg-expanded-right {
  flex-direction: column;
}

/* Bottom sidebar: expanded container is a row, positioned above */
.sg-expanded-bottom {
  flex-direction: row;
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  margin-top: 0;
}

/* Member icon size: slightly smaller than standard for compact appearance */
.sg-member-btn .sidebar-icon.sg-member-icon {
  width: 32px;
  height: 32px;
  font-size: 0.88rem;
}
.sg-member-btn .sidebar-icon.sg-member-icon i {
  font-size: 0.88rem;
}

/* Drop-target glow: shown when a module is dragged over another to group them */
.sg-drop-target .sidebar-icon {
  box-shadow:
    0 0 0 2px #22c55e,
    0 0 14px 3px rgba(34, 197, 94, 0.55),
    inset 0 1px 0 rgba(255,255,255,0.22);
  border-color: #22c55e !important;
  transform: scale(1.10);
}

/* ── Group editor floating panel ── */
.sg-editor {
  position: fixed;
  z-index: 700;
  width: 230px;
  background: rgba(235,235,245,0.94);
  backdrop-filter: blur(48px) saturate(180%);
  -webkit-backdrop-filter: blur(48px) saturate(180%);
  border: 1px solid rgba(255,255,255,0.52);
  border-radius: 16px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.60);
  padding: 14px 14px 12px;
}
.sg-editor.dark-mode {
  background: rgba(16,16,30,0.94);
  border-color: rgba(255,255,255,0.11);
  box-shadow: 0 16px 48px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.06);
}

/* Position the editor near the relevant dock edge */
.sg-editor-left   { left: 68px;  top: 50%; transform: translateY(-50%); }
.sg-editor-right  { right: 68px; top: 50%; transform: translateY(-50%); }
.sg-editor-bottom { bottom: 68px; left: 50%; transform: translateX(-50%); }

.sg-editor-title {
  font-size: 0.65rem; font-weight: 700;
  color: var(--text); opacity: 0.50;
  margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.07em;
}

.sg-editor-label {
  display: block;
  font-size: 0.62rem; font-weight: 600;
  color: var(--text); opacity: 0.55;
  margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.05em;
}

.sg-editor-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(120,120,140,0.28);
  background: rgba(255,255,255,0.55);
  color: var(--text);
  font-size: 0.82rem;
  margin-bottom: 12px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.sg-editor-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 24%, transparent);
}
.dark-mode .sg-editor-input {
  background: rgba(30,30,50,0.60);
  border-color: rgba(255,255,255,0.14);
  color: var(--text);
}

/* Icon picker grid */
.sg-icon-picker {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
  margin-bottom: 12px;
}

.sg-icon-option {
  display: flex; align-items: center; justify-content: center;
  width: 34px; height: 34px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: rgba(120,120,140,0.08);
  cursor: pointer;
  font-size: 0.88rem;
  color: var(--text);
  opacity: 0.65;
  transition: background 0.13s, opacity 0.13s, border-color 0.13s, transform 0.13s;
}
.sg-icon-option:hover {
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  opacity: 1;
  transform: scale(1.10);
}
.sg-icon-option.sg-icon-selected {
  background: color-mix(in srgb, var(--primary) 28%, transparent);
  border-color: color-mix(in srgb, var(--primary) 55%, transparent);
  opacity: 1;
  color: var(--primary);
}

/* Editor action buttons */
.sg-editor-actions {
  display: flex;
  gap: 6px;
}
.sg-editor-save {
  flex: 1;
  padding: 6px 0;
  border-radius: 8px;
  border: none;
  background: var(--primary);
  color: #fff;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
}
.sg-editor-save:hover { opacity: 0.88; transform: translateY(-1px); }

.sg-editor-disband {
  flex: 1;
  padding: 6px 0;
  border-radius: 8px;
  border: 1px solid rgba(220,50,50,0.35);
  background: rgba(220,50,50,0.10);
  color: #e03535;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;
}
.sg-editor-disband:hover { background: rgba(220,50,50,0.20); transform: translateY(-1px); }
.dark-mode .sg-editor-disband { color: #f87171; border-color: rgba(248,113,113,0.30); background: rgba(248,113,113,0.08); }
.dark-mode .sg-editor-disband:hover { background: rgba(248,113,113,0.18); }

/* Member chips inside group editor */
.sg-member-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 12px;
  min-height: 28px;
}
.sg-member-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px 3px 7px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 35%, transparent);
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
}
.sg-chip-remove {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  line-height: 1;
  padding: 0 1px;
  color: inherit;
  opacity: 0.5;
  transition: opacity 0.12s;
}
.sg-chip-remove:hover { opacity: 1; color: #e03535; }
</style>
