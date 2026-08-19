<script setup>
// Storage Map — where everything physically IS: labs → fridges/freezers →
// shelves → cryo boxes → cells. The topology (units, boxes) lives in the
// storage_map table (run supabase/storage_map.sql once); an item's position
// lives ON the inventory item itself (item.storage = { boxId, cell, taken? }),
// so it needs no migration and travels with the item.
//
// Placing an item also writes the human-readable path into the item's existing
// location/sublocation strings, so printed labels and the inventory table show
// the structured position without knowing this module exists.
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useLabStore } from '../stores/labStore'
import { db } from '../services/supabase'
import { BOEKHOVEN_PALETTE, colorForKey } from '../utils/palette'
import { qrSvg } from '../utils/cryoLabels'
import { esc } from '../utils/htmlSafe'

const store = useLabStore()

// ── Topology (units + boxes) from the storage_map table ──
const docs = ref([])           // raw item_data objects
const docsLoaded = ref(false)  // gates the orphan banner: an empty docs list before/without a load is not evidence of deleted boxes
const loadError = ref('')

const units = computed(() => docs.value.filter(d => d.type === 'unit'))
const boxes = computed(() => docs.value.filter(d => d.type === 'box'))
const boxById = computed(() => Object.fromEntries(boxes.value.map(b => [b.id, b])))
const unitById = computed(() => Object.fromEntries(units.value.map(u => [u.id, u])))

async function loadDocs() {
  loadError.value = ''
  const { data, error } = await db.from('storage_map').select('*')
  if (error) { loadError.value = error.message; return }
  docs.value = (data || []).map(r => r.item_data).filter(Boolean)
  docsLoaded.value = true
}
onMounted(loadDocs)

// ── Live tracking ──
// Positions and taken-state save the moment they change; with Supabase Realtime
// enabled for `inventory` and `storage_map` (see storage_map.sql), OTHER open
// clients see them move live too. Without Realtime this subscription receives
// nothing and the view still refreshes on every own action and tab open.
let rtChannel = null
onMounted(() => {
  try {
    rtChannel = db.channel('storage-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const gone = payload.old?.item_id
          if (gone) store.inventory = store.inventory.filter(i => String(i.id) !== String(gone))
          return
        }
        const item = payload.new?.item_data
        if (!item?.id) return
        const idx = store.inventory.findIndex(i => i.id === item.id)
        if (idx >= 0) store.inventory.splice(idx, 1, item)
        else store.inventory.unshift(item)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'storage_map' }, () => loadDocs())
      .subscribe()
  } catch { /* realtime unavailable — everything still works, just not live-pushed */ }
})
onBeforeUnmount(() => { try { if (rtChannel) db.removeChannel(rtChannel) } catch { /* already gone */ } })

async function saveDoc(doc) {
  const plain = JSON.parse(JSON.stringify(doc))
  // Ownership follows the saver, like saveItemToCloud does for inventory — this
  // is what lets the tightened global_write RLS policy accept a colleague's edit.
  plain.owner_id = store.user.id
  const payload = { item_id: String(plain.id), owner_id: plain.owner_id, scope: plain.scope || 'Global', item_data: plain }
  const { error } = await db.from('storage_map').upsert(payload, { onConflict: 'item_id' })
  if (error) { alert('Could not save: ' + error.message); return false }
  const i = docs.value.findIndex(d => d.id === plain.id)
  if (i >= 0) docs.value[i] = plain; else docs.value.push(plain)
  return true
}
async function deleteDoc(id) {
  const { error } = await db.from('storage_map').delete().eq('item_id', id)
  if (error) { alert('Could not delete: ' + error.message); return false }
  docs.value = docs.value.filter(d => d.id !== id)
  return true
}

// ── Occupancy: which item sits in which cell (read off the inventory) ──
// cell → ARRAY of items: two people can race the same cell, and hiding the
// second occupant would silently lose a tube.
// A position can be coarse: { unitId } = "somewhere in Freezer 1",
// { boxId } without a cell = "in this box, cell not chosen yet" — both come
// from location conversion and location-QR scans, and refine later by clicking.
const itemsByBox = computed(() => {
  const m = {}
  for (const it of store.inventory) {
    const s = it.storage
    if (!s?.boxId || !s.cell) continue
    ;((m[s.boxId] ||= {})[s.cell] ||= []).push(it)
  }
  return m
})
// Items in a box with no cell yet.
const boxTray = computed(() => {
  const m = {}
  for (const it of store.inventory) {
    const s = it.storage
    if (s?.boxId && !s.cell) (m[s.boxId] ||= []).push(it)
  }
  return m
})
// Items in a unit with no box yet.
const unitTray = computed(() => {
  const m = {}
  for (const it of store.inventory) {
    const s = it.storage
    if (s?.unitId && !s.boxId) (m[s.unitId] ||= []).push(it)
  }
  return m
})
const boxCount = (boxId) => Object.values(itemsByBox.value[boxId] || {}).reduce((n, a) => n + a.length, 0)
const unitBoxes = (unitId) => boxes.value.filter(b => b.unitId === unitId)
const unitCount = (unitId) => unitBoxes(unitId).reduce((n, b) => n + boxCount(b.id), 0)

// Items marked taken out right now — shown as a checklist so nothing stays
// forgotten on a bench. Defaults to YOUR loans (the day-to-day question is
// "what do I still have out"), one tap away from the whole lab's.
const takenItems = computed(() => store.inventory.filter(i => i.storage?.taken))
const takenFilter = ref('mine')
const myTakenItems = computed(() => takenItems.value.filter(i =>
  String(i.storage.taken.by || '').toLowerCase() === String(store.user?.email || '').toLowerCase()))
const shownTaken = computed(() => takenFilter.value === 'mine' ? myTakenItems.value : takenItems.value)
// Positions pointing at a box we cannot see. Only meaningful once the topology
// actually loaded — before that (or after a failed load) an empty docs list
// would flag every placed item. A box can also be simply invisible (someone
// else's Personal box), so the banner says "not visible", not "deleted".
const orphanItems = computed(() => docsLoaded.value
  ? store.inventory.filter(i => i.storage?.boxId && !boxById.value[i.storage.boxId]) : [])

// ── Flat inventory locations ──
// Everything the inventory already records: items reference a named location
// (item.location string) plus a free-text sublocation. Visualized here so the
// existing data shows up without re-entering anything — grouped by location
// name, with counts and a per-item path/Place action. The group list is the
// union of managed locations (store.locations) and every name items actually
// use, so nothing recorded can hide.
const openLoc = ref(null)
const flatLocations = computed(() => {
  const groups = new Map()
  for (const l of store.visibleLocations?.() || []) groups.set(l.name, [])
  for (const it of store.inventory) {
    const name = (it.location || '').trim()
    if (!name) continue
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name).push(it)
  }
  return [...groups.entries()]
    .map(([name, items]) => ({ name, items }))
    .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name))
})
const unlocatedCount = computed(() =>
  store.inventory.filter(i => !(i.location || '').trim() && !i.storage?.boxId).length)

const labs = computed(() => {
  const names = [...new Set(units.value.map(u => (u.lab || '').trim() || 'Unassigned'))]
  return names.sort((a, b) => a.localeCompare(b))
})
const labUnits = (lab) => units.value.filter(u => ((u.lab || '').trim() || 'Unassigned') === lab)

const UNIT_KINDS = [
  ['freezer-80', '−80 °C freezer', 'fa-temperature-arrow-down'],
  ['freezer-20', '−20 °C freezer', 'fa-snowflake'],
  ['fridge', '4 °C fridge', 'fa-temperature-low'],
  ['ln2', 'LN₂ tank', 'fa-jar'],
  ['rt', 'RT shelf / cabinet', 'fa-box-open'],
]
const kindIcon = (k) => (UNIT_KINDS.find(x => x[0] === k) || UNIT_KINDS[4])[2]
const kindLabel = (k) => (UNIT_KINDS.find(x => x[0] === k) || UNIT_KINDS[4])[1]

// ── Navigation: Labs → unit → box, with breadcrumbs ──
const view = ref({ level: 'labs' })
function openUnit(u) { view.value = { level: 'unit', unitId: u.id } }
function openBox(b) { view.value = { level: 'box', boxId: b.id } }
const curUnit = computed(() => view.value.level === 'unit' ? unitById.value[view.value.unitId]
  : view.value.level === 'box' ? unitById.value[boxById.value[view.value.boxId]?.unitId] : null)
const curBox = computed(() => view.value.level === 'box' ? boxById.value[view.value.boxId] : null)
// One step up: box → its unit, unit → the labs overview.
function goBack() {
  if (view.value.level === 'box' && curUnit.value) openUnit(curUnit.value)
  else view.value = { level: 'labs' }
}
// Everything inside a box, cells or not — what a PLAIN box (no grid) lists.
const allInBox = (boxId) => store.inventory.filter(i => i.storage?.boxId === boxId)

// ── Grid helpers ──
const rowLetter = (r) => String.fromCharCode(64 + r)               // 1 → A
const cellId = (r, c) => rowLetter(r) + c
const classColor = (it) => colorForKey(BOEKHOVEN_PALETTE, it.itemClass || 'Other')
// Light palette slots (Okabe-Ito yellow, sky) make white chip text unreadable —
// pick the text colour from the background's luminance instead.
const textOn = (hex) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#fff'
  const n = parseInt(m[1], 16)
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return lum > 150 ? '#1c2030' : '#fff'
}
const chipStyle = (it) => { const c = classColor(it); return { background: c, color: textOn(c) } }

const pathOf = (item) => {
  const s = item.storage
  if (!s) return ''
  if (s.boxId) {
    const b = boxById.value[s.boxId]
    if (!b) return '(box not visible — deleted, or private to someone else)'
    const u = unitById.value[b.unitId]
    return [u?.lab, u?.name, `Shelf ${b.shelf}`, b.name, s.cell || (b.plain ? '' : '(no cell yet)')].filter(Boolean).join(' · ')
  }
  if (s.unitId) {
    const u = unitById.value[s.unitId]
    return u ? [u.lab, u.name, '(no box yet)'].filter(Boolean).join(' · ') : '(unit not visible)'
  }
  return ''
}

// ── Placement flow (also fed by search + scanner) ──
const placingItem = ref(null)
const pulse = ref('')          // boxId|cell — briefly highlighted
function startPlacing(item) {
  placingItem.value = item
  // Repositioning: jump straight to where it currently sits.
  if (item.storage?.boxId && boxById.value[item.storage.boxId]) openBox(boxById.value[item.storage.boxId])
  store.toast?.(`Placing [${item.code}] — open a box and click a cell (Esc cancels)`)
}
function cancelPlacing() { placingItem.value = null }
const onKeydown = (e) => { if (e.key === 'Escape') { cancelPlacing(); cellInfo.value = null; pickerCell.value = null } }
onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

// Placing an item into a cell. Placing IS returning: whatever was "taken"
// about it is cleared, because the tube is demonstrably back in a box.
function placeAt(box, cell, item = placingItem.value) {
  if (!item) return
  // cell = null → a PLAIN box (or a gridless drop): the item lives loose inside.
  if (cell) {
    const occ = (itemsByBox.value[box.id]?.[cell] || []).filter(o => o.id !== item.id)
    if (occ.length && !confirm(`${cell} already holds ${occ.map(o => `[${o.code}] ${o.name}`).join(', ')}.\n\nPlace [${item.code}] there anyway? (Both will show on the cell.)`)) return
  }
  item.storage = cell ? { boxId: box.id, cell } : { boxId: box.id }
  syncLocationStrings(item, box, cell || '')
  store.saveItemToCloud(item)
  placingItem.value = null
  if (cell) {
    pulse.value = box.id + '|' + cell
    setTimeout(() => { if (pulse.value === box.id + '|' + cell) pulse.value = '' }, 1600)
  }
  store.toast?.(`[${item.code}] → ${pathOf(item)}`)
}
// The structured position written into the strings the rest of the app (and
// the printed labels) already read.
function syncLocationStrings(item, box, cell) {
  const u = unitById.value[box.unitId]
  item.location = [u?.lab, u?.name].filter(Boolean).join(' · ')
  item.sublocation = ['Shelf ' + box.shelf, box.name, cell].filter(Boolean).join(' · ')
}
// Row-major first free cell of a box; null when full or when the box is plain.
function firstFreeCell(box) {
  if (box.plain) return null
  const occ = itemsByBox.value[box.id] || {}
  for (let r = 1; r <= box.rows; r++) for (let c = 1; c <= box.cols; c++) {
    const id = cellId(r, c)
    if (!(occ[id] || []).length) return id
  }
  return null
}
function unplace(item) {
  if (!confirm(`Remove [${item.code}] ${item.name} from its box position?`)) return
  item.storage = null
  // Clear the synced path strings so the label/table don't keep asserting a
  // position that no longer exists — but only if WE wrote them (the pattern is
  // ours); hand-typed locations are not touched.
  if (/^Shelf \d+ · /.test(item.sublocation || '')) { item.sublocation = ''; item.location = '' }
  store.saveItemToCloud(item)
  cellInfo.value = null
}
function toggleTaken(item) {
  const s = item.storage || (item.storage = {})
  if (s.taken) delete s.taken
  else s.taken = { by: store.user?.email || '', at: new Date().toISOString() }
  store.saveItemToCloud(item)
  return !!s.taken
}

// ── Cell popover + item picker ──
const cellInfo = ref(null)     // { box, cell, items }
const pickerCell = ref(null)   // { box, cell }
const pickerQuery = ref('')
function clickCell(box, cell) {
  if (placingItem.value) { placeAt(box, cell); return }
  const items = itemsByBox.value[box.id]?.[cell] || []
  if (items.length) cellInfo.value = { box, cell, items }
  else { pickerCell.value = { box, cell }; pickerQuery.value = '' }
}
const pickerMatches = computed(() => {
  const q = pickerQuery.value.trim().toLowerCase()
  const pool = store.inventory.filter(i => (i.scope || 'Global') !== 'Archived')
  const hit = q ? pool.filter(i => (i.code || '').toLowerCase().includes(q) || (i.name || '').toLowerCase().includes(q)) : pool
  // Unplaced first — that's what you're usually holding in your hand.
  return hit.slice().sort((a, b) => (!!a.storage?.boxId - !!b.storage?.boxId)).slice(0, 30)
})

// ── Search: where is X? ──
const searchQuery = ref('')
const searchMatches = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return []
  return store.inventory
    .filter(i => (i.code || '').toLowerCase().includes(q) || (i.name || '').toLowerCase().includes(q))
    .slice(0, 20)
})
function jumpTo(item) {
  searchQuery.value = ''
  const s = item.storage
  const b = s?.boxId ? boxById.value[s.boxId] : null
  const u = s?.unitId ? unitById.value[s.unitId] : null
  if (b) {
    openBox(b)
    if (s.cell) { pulse.value = b.id + '|' + s.cell; setTimeout(() => { pulse.value = '' }, 2500) }
  } else if (u) {
    openUnit(u)
  } else if (confirm(`[${item.code}] ${item.name} has no box position yet. Place it now?`)) {
    startPlacing(item)
  }
}

// ── Drag & drop ──
// Two draggable things, plain HTML5 DnD: a BOX (between shelves, or onto
// another box's shelf) and an ITEM (between cells of a grid, or from a tray
// onto a box tile — first free cell). placeAt does the saving/conflict work.
function boxDragStart(b, e) { e.dataTransfer.setData('text/sm-box', b.id); e.dataTransfer.effectAllowed = 'move' }
function itemDragStart(it, e) { e.dataTransfer.setData('text/sm-item', it.id); e.dataTransfer.effectAllowed = 'move' }
async function dropOnShelf(shelf, e) {
  const boxId = e.dataTransfer.getData('text/sm-box')
  if (!boxId) return
  const b = boxById.value[boxId]
  if (!b || b.shelf === shelf) return
  if (await saveDoc({ ...b, shelf })) store.toast?.(`"${b.name}" → Shelf ${shelf}`)
}
function boxTileDrop(b, e) {
  const itemId = e.dataTransfer.getData('text/sm-item')
  if (itemId) {
    const it = store.inventory.find(x => x.id === itemId)
    if (it) placeAt(b, firstFreeCell(b), it)
    return
  }
  const boxId = e.dataTransfer.getData('text/sm-box')
  if (boxId && boxId !== b.id) {
    const src = boxById.value[boxId]
    if (src && src.shelf !== b.shelf) dropOnShelf(b.shelf, e)
  }
}
function cellDrop(box, cell, e) {
  const id = e.dataTransfer.getData('text/sm-item')
  if (!id) return
  const it = store.inventory.find(x => x.id === id)
  if (!it || (it.storage?.boxId === box.id && it.storage?.cell === cell)) return
  placeAt(box, cell, it)
}

// ── Shelf management ──
// The unit dialog's shelf count still works; these are the direct handles: add
// a shelf at the bottom, remove an EMPTY shelf anywhere (lower shelves are
// renumbered up, and their boxes with them, so nothing is stranded).
async function addShelf() {
  const u = curUnit.value
  if (!u || u.shelves >= 20) return
  await saveDoc({ ...u, shelves: (Number(u.shelves) || 1) + 1 })
}
async function removeShelf(shelf) {
  const u = curUnit.value
  if (!u || u.shelves <= 1) return
  if (unitBoxes(u.id).some(b => b.shelf === shelf)) { alert('This shelf still has boxes — move them first.'); return }
  if (!confirm(`Remove shelf ${shelf}?${shelf < u.shelves ? ' Shelves below move up one.' : ''}`)) return
  for (const b of unitBoxes(u.id).filter(b => b.shelf > shelf)) await saveDoc({ ...b, shelf: b.shelf - 1 })
  await saveDoc({ ...u, shelves: u.shelves - 1 })
}

// ── Recognizing storage units in the flat inventory locations ──
// "Freezer 1" IS a storage unit — it just lives as a name string today. One
// click turns it into a real unit; the sublocations its items carry (that is
// how "Matrixbox in Freezer DNA Lab" is recorded: location = the freezer,
// sublocation = the box) are offered as boxes inside it. Items keep their
// assignment at the granularity we know: box without cell, or unit without
// box — refined later by clicking a cell.
function guessKind(name) {
  const n = String(name || '').toLowerCase()
  if (/[−-]\s?80|ultra/.test(n)) return 'freezer-80'
  if (/ln2|\bn2\b|liquid|dewar|cryo\s*tank/.test(n)) return 'ln2'
  if (/[−-]\s?20|freezer|frost|tk/.test(n)) return 'freezer-20'
  if (/fridge|kühl|cool|4\s*°?\s*c/.test(n)) return 'fridge'
  return 'rt'
}
const looksLikeUnit = (name) => guessKind(name) !== 'rt'
// Only items that don't already have a structured position get migrated.
const unstructured = (items) => items.filter(i => !i.storage?.boxId && !i.storage?.unitId)

async function makeUnitFromLocation(g) {
  const unit = { id: 'su_' + crypto.randomUUID(), type: 'unit', lab: '', name: g.name, kind: guessKind(g.name), shelves: 4, scope: 'Global', owner_id: store.user?.id }
  if (!await saveDoc(unit)) return
  const movable = unstructured(g.items)
  const subs = [...new Set(movable.map(i => (i.sublocation || '').trim()).filter(Boolean))]
  const boxBySub = {}
  if (subs.length && confirm(`"${g.name}" is now a storage unit.\n\nIts items carry ${subs.length} sublocation${subs.length === 1 ? '' : 's'}:\n${subs.join(', ')}\n\nCreate ${subs.length === 1 ? 'it' : 'them'} as box${subs.length === 1 ? '' : 'es'} inside? (Plain boxes without a grid — turn on a grid per box later if wanted.)`)) {
    for (const sub of subs) {
      const box = { id: 'sb_' + crypto.randomUUID(), type: 'box', unitId: unit.id, shelf: 1, name: sub, rows: 9, cols: 9, plain: true, scope: 'Global', owner_id: store.user?.id }
      if (await saveDoc(box)) boxBySub[sub] = box
    }
  }
  for (const it of movable) {
    const box = boxBySub[(it.sublocation || '').trim()]
    it.storage = box ? { boxId: box.id } : { unitId: unit.id }
    store.saveItemToCloud(it)
  }
  store.toast?.(`"${g.name}" recognized as a storage unit — ${movable.length} item${movable.length === 1 ? '' : 's'} carried over`)
  openLoc.value = null
  openUnit(unit)
}

// A location that is itself a box ("Matrixbox") goes INSIDE an existing unit.
const convertBox = ref(null)   // { g, unitId, shelf }
function openConvertBox(g) {
  if (!units.value.length) { alert('Create the storage unit first (e.g. the freezer this box sits in) — then convert this location into a box inside it.'); return }
  convertBox.value = { g, unitId: units.value[0].id, shelf: 1 }
}
async function makeBoxFromLocation() {
  const { g, unitId, shelf } = convertBox.value
  const unit = unitById.value[unitId]
  if (!unit) return
  const box = { id: 'sb_' + crypto.randomUUID(), type: 'box', unitId, shelf: Math.max(1, Math.min(unit.shelves, Number(shelf) || 1)), name: g.name, rows: 9, cols: 9, plain: true, scope: unit.scope || 'Global', owner_id: store.user?.id }
  if (!await saveDoc(box)) return
  const movable = unstructured(g.items)
  for (const it of movable) { it.storage = { boxId: box.id }; store.saveItemToCloud(it) }
  store.toast?.(`"${g.name}" is now a box in ${unit.name} — ${movable.length} item${movable.length === 1 ? '' : 's'} inside (plain box; enable a grid in its settings if wanted)`)
  convertBox.value = null
  openLoc.value = null
  openBox(box)
}

// ── Location QR labels ──
// Every unit and box has a scannable identity (payload 'SLOC:<id>') so the
// relocate workflow can pair a place with a stock in one scanning mask. The
// modal shows a printable label.
const locQr = ref(null)   // { uri, title, sub }
function showLocQr(doc) {
  const { uri } = qrSvg('SLOC:' + doc.id, 'M')
  const u = doc.type === 'box' ? unitById.value[doc.unitId] : null
  locQr.value = {
    uri,
    title: doc.name,
    sub: doc.type === 'box'
      ? [u?.lab, u?.name, 'Shelf ' + doc.shelf].filter(Boolean).join(' · ')
      : [doc.lab, kindLabel(doc.kind)].filter(Boolean).join(' · '),
  }
}
function printLocQr() {
  const w = window.open('', '_blank', 'width=420,height=520')
  if (!w) return
  w.document.write(`<html><head><title>${locQr.value.title}</title></head>
    <body style="font-family:sans-serif;text-align:center;padding:24px;">
    <img src="${locQr.value.uri}" style="width:220px;height:220px;"><br>
    <strong style="font-size:20px;">${locQr.value.title}</strong><br>
    <span style="font-size:13px;color:#555;">${locQr.value.sub}</span>
    <script>window.onload = () => { window.print(); }<\/script></body></html>`)
  w.document.close()
}

// ── Merging inventory locations ──
// Two names for the same place ("Freezer 1" / "freezer1 old") unify: every item
// carrying the source name is rewritten to the target, and the now-unused
// managed location entry can be deleted (own entries only — RLS guards the rest).
const mergeLoc = ref(null)   // { from, target }
const allLocationNames = computed(() => [...new Set([
  ...(store.visibleLocations?.() || []).map(l => l.name),
  ...flatLocations.value.map(g => g.name),
])].sort((a, b) => a.localeCompare(b)))
function openMergeLoc(g) {
  mergeLoc.value = { from: g.name, target: allLocationNames.value.find(n => n !== g.name) || '' }
}
async function doMergeLoc() {
  const { from, target } = mergeLoc.value
  if (!target || target === from) { alert('Pick a different target location.'); return }
  const items = store.inventory.filter(i => (i.location || '').trim() === from)
  for (const it of items) { it.location = target; store.saveItemToCloud(it) }
  const row = (store.locations || []).find(l => l.name === from)
  if (row && confirm(`"${from}" now holds nothing — also delete the location entry itself?\n(Only possible for entries you created.)`)) {
    try { await store.deleteLocation(row.id) } catch { /* someone else's entry — it simply stays, unused */ }
  }
  store.toast?.(`${items.length} item${items.length === 1 ? '' : 's'} moved: "${from}" → "${target}"`)
  mergeLoc.value = null
  openLoc.value = target
}

// One print job: the unit's own QR label plus a label for every box inside it —
// stick the sheet on the fridge and its boxes in one pass.
function printUnitLabels(unit) {
  const blocks = [
    { title: unit.name, sub: [unit.lab, kindLabel(unit.kind)].filter(Boolean).join(' · '), uri: qrSvg('SLOC:' + unit.id, 'M').uri },
    ...unitBoxes(unit.id).slice().sort((a, b) => a.shelf - b.shelf || a.name.localeCompare(b.name))
      .map(b => ({ title: b.name, sub: `${unit.name} · Shelf ${b.shelf}`, uri: qrSvg('SLOC:' + b.id, 'M').uri })),
  ]
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) { alert('The print window was blocked — allow pop-ups for this site.'); return }
  w.document.write(`<html><head><title>Storage labels — ${esc(unit.name)}</title>
    <style>body{font-family:sans-serif;display:flex;flex-wrap:wrap;gap:14px;padding:16px;}
    .lb{border:1px dashed #bbb;border-radius:8px;padding:12px;text-align:center;width:180px;page-break-inside:avoid;}
    .lb img{width:150px;height:150px;} .lb b{display:block;font-size:15px;margin-top:6px;}
    .lb span{font-size:11px;color:#555;}</style></head><body>`
    + blocks.map(x => `<div class="lb"><img src="${x.uri}"><b>${esc(x.title)}</b><span>${esc(x.sub)}</span></div>`).join('')
    + `<script>window.onload = () => window.print()<\/script></body></html>`)
  w.document.close()
}

// ── Unit / box dialogs ──
const unitDialog = ref(null)   // { mode, unit }
const boxDialog = ref(null)    // { mode, box }
function newUnit() {
  unitDialog.value = { mode: 'new', unit: { id: 'su_' + crypto.randomUUID(), type: 'unit', lab: labs.value[0] === 'Unassigned' ? '' : (labs.value[0] || ''), name: '', kind: 'freezer-80', shelves: 4, scope: 'Global', owner_id: store.user?.id } }
}
function editUnit(u) { unitDialog.value = { mode: 'edit', unit: { ...u } } }
async function saveUnit() {
  const u = unitDialog.value.unit
  if (!u.name.trim()) { alert('Give the unit a name (e.g. "−80 #2").'); return }
  u.shelves = Math.max(1, Math.min(20, Number(u.shelves) || 1))
  // A shelf that still carries boxes cannot be removed — the boxes would render
  // nowhere and become unreachable (this also catches an emptied input → 1).
  const maxShelf = Math.max(0, ...unitBoxes(u.id).map(b => Number(b.shelf) || 1))
  if (u.shelves < maxShelf) { alert(`Shelf ${maxShelf} still has boxes — move or delete them first, or keep at least ${maxShelf} shelves.`); return }
  const prevScope = unitById.value[u.id]?.scope
  if (await saveDoc(u)) {
    // Visibility is a property of the fridge, not of each box: flipping the unit
    // takes its boxes along, otherwise colleagues see items pointing at boxes
    // that are invisible to them.
    if (prevScope && prevScope !== u.scope) {
      for (const b of unitBoxes(u.id)) await saveDoc({ ...b, scope: u.scope })
    }
    unitDialog.value = null
  }
}
async function removeUnit(u) {
  const bs = unitBoxes(u.id)
  const n = bs.reduce((x, b) => x + boxCount(b.id), 0)
  if (n > 0) { alert(`"${u.name}" still holds ${n} placed item${n === 1 ? '' : 's'} — move or unplace them first.`); return }
  if (!confirm(`Delete "${u.name}"${bs.length ? ` and its ${bs.length} (empty) box${bs.length === 1 ? '' : 'es'}` : ''}?`)) return
  for (const b of bs) await deleteDoc(b.id)
  if (await deleteDoc(u.id)) { unitDialog.value = null; view.value = { level: 'labs' } }
}
function newBox(unit, shelf) {
  boxDialog.value = { mode: 'new', box: { id: 'sb_' + crypto.randomUUID(), type: 'box', unitId: unit.id, shelf, name: '', rows: 9, cols: 9, scope: unit.scope || 'Global', owner_id: store.user?.id } }
}
function editBox(b) { boxDialog.value = { mode: 'edit', box: { ...b } } }
async function saveBox() {
  const b = boxDialog.value.box
  if (!b.name.trim()) { alert('Give the box a name (e.g. "Peptides 1").'); return }
  const u = unitById.value[b.unitId]
  if (u) b.shelf = Math.max(1, Math.min(u.shelves, Number(b.shelf) || 1))
  // Relocating the box into another unit: it adopts that unit's visibility, so
  // a box can't stay lab-visible inside a private freezer (or vice versa).
  if (u) b.scope = u.scope || b.scope || 'Global'
  if (!b.plain) {
    b.rows = Math.max(1, Math.min(26, Number(b.rows) || 9))
    b.cols = Math.max(1, Math.min(24, Number(b.cols) || 9))
    // Shrinking must not strand an occupied cell outside the rendered grid — the
    // item would keep its position but become invisible and unclickable.
    const outside = Object.entries(itemsByBox.value[b.id] || {})
      .filter(([cell]) => { const m = /^([A-Z])(\d+)$/.exec(cell); return !m || m[1].charCodeAt(0) - 64 > b.rows || Number(m[2]) > b.cols })
      .flatMap(([cell, items]) => items.map(i => `[${i.code}] at ${cell}`))
    if (outside.length) { alert(`Can't shrink "${b.name}" to ${b.rows}×${b.cols} — ${outside.join(', ')} would fall outside the grid. Move or unplace ${outside.length === 1 ? 'it' : 'them'} first.`); return }
  }
  if (await saveDoc(b)) boxDialog.value = null
}
async function removeBox(b) {
  const n = boxCount(b.id)
  if (n > 0) { alert(`"${b.name}" still holds ${n} item${n === 1 ? '' : 's'} — move or unplace them first.`); return }
  if (!confirm(`Delete box "${b.name}"?`)) return
  if (await deleteDoc(b.id)) { boxDialog.value = null; if (curBox.value?.id === b.id) openUnit(unitById.value[b.unitId]) }
}

// ── QR scanner: BarcodeDetector natively, jsQR (lazy) everywhere else ──
const scanner = ref(null)      // { mode: 'lookup' | 'take' | 'relocate' }
// Relocate: one mask, two kinds of codes. Scan a location label (stays ARMED)
// and then stock after stock — each is re-assigned to that location instantly.
// Boxes take the first free cell; units hold the item until a box is chosen.
const relocate = ref({ loc: null, item: null })
const scanResult = ref(null)   // { item } | { unknown: code }
const scanMsg = ref('')
const videoRef = ref(null)
let scanStream = null, scanTimer = 0, scanBusy = false
let detector = null, jsqrFn = null, scanCanvas = null
let lastScan = { code: '', at: 0 }

async function openScanner(mode) {
  const session = { mode }
  scanner.value = session
  scanResult.value = null
  scanMsg.value = ''
  relocate.value = { loc: null, item: null }
  await nextTick()
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    // The permission prompt keeps this await pending while the modal can be
    // closed (or reopened) — a stream that arrives for a dead session must be
    // stopped HERE, or the camera stays on with no UI able to reach it.
    if (scanner.value !== session) { stream.getTracks().forEach(t => t.stop()); return }
    scanStream = stream
    videoRef.value.srcObject = scanStream
    await videoRef.value.play()
    if ('BarcodeDetector' in window) { try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }) } catch { detector = null } }
    if (!detector && !jsqrFn) jsqrFn = (await import('jsqr')).default
    scanTimer = setInterval(decodeFrame, 180)
  } catch (e) {
    scanMsg.value = 'Camera unavailable: ' + ((e && e.message) || e) + '. Scanning needs camera permission and HTTPS (or localhost).'
  }
}
function closeScanner() {
  clearInterval(scanTimer); scanTimer = 0
  scanStream?.getTracks().forEach(t => t.stop()); scanStream = null
  scanner.value = null; scanResult.value = null
}
onBeforeUnmount(closeScanner)

async function decodeFrame() {
  const video = videoRef.value
  if (!video || video.readyState < 2 || scanBusy || scanResult.value) return
  scanBusy = true
  try {
    let raw = ''
    if (detector) {
      const codes = await detector.detect(video)
      raw = codes?.[0]?.rawValue || ''
    } else if (jsqrFn) {
      scanCanvas ||= document.createElement('canvas')
      const scale = Math.min(1, 640 / (video.videoWidth || 640))
      scanCanvas.width = (video.videoWidth || 640) * scale
      scanCanvas.height = (video.videoHeight || 480) * scale
      const ctx = scanCanvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height)
      const img = ctx.getImageData(0, 0, scanCanvas.width, scanCanvas.height)
      raw = jsqrFn(img.data, img.width, img.height)?.data || ''
    }
    if (raw) onScan(raw)
  } catch { /* a bad frame is not an error — the next one comes in 180 ms */ }
  finally { scanBusy = false }
}

// A label QR carries one of three payloads (cryoLabels.labelPayload): the full
// deep link (…?qr=CODE), a short-host redirect (boek.li/CODE), or the bare code.
function qrToCode(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  const m = s.match(/[?&]qr=([^&#]+)/)
  if (m) { try { return decodeURIComponent(m[1]) } catch { return m[1] } }
  if (/^https?:\/\//i.test(s) || /^[\w.-]+\.[a-z]{2,}\//i.test(s)) {
    // Short-host form is host/CODE with the code verbatim — take everything
    // after the host, so a code that itself contains '/' survives.
    const path = s.replace(/^https?:\/\//i, '').split(/[?#]/)[0]
    return path.split('/').slice(1).join('/') || s
  }
  return s
}

function onScan(raw) {
  const code = qrToCode(raw)
  const now = Date.now()
  if (!code || (code === lastScan.code && now - lastScan.at < 2500)) return
  lastScan = { code, at: now }
  navigator.vibrate?.(60)

  // Location labels (SLOC:<id>) — printed from the unit/box QR button.
  if (code.startsWith('SLOC:')) {
    const doc = docs.value.find(d => d.id === code.slice(5))
    if (!doc) { scanMsg.value = 'Unknown location label — was its unit or box deleted?'; return }
    scanMsg.value = ''
    if (scanner.value?.mode === 'relocate') {
      const armed = relocate.value.loc
      // A UNIT armed + a BOX scanned = move the WHOLE box into that unit —
      // the physical "carry a box to another freezer" workflow. The unit stays
      // armed, so several boxes can be carried over in one scan run.
      if (armed?.type === 'unit' && doc.type === 'box' && doc.unitId !== armed.id) {
        const moved = { ...doc, unitId: armed.id, shelf: Math.max(1, Math.min(armed.shelves || 1, doc.shelf || 1)), scope: armed.scope || doc.scope }
        saveDoc(moved).then(ok => { if (ok) store.toast?.(`Box "${doc.name}" → ${armed.name}, shelf ${moved.shelf} (everything inside came along)`) })
      } else {
        relocate.value.loc = doc
        store.toast?.(`Location armed: ${doc.name} — now scan the stocks that go there`)
        if (relocate.value.item) commitRelocate()
      }
    } else if (scanner.value?.mode === 'take') {
      // Quick take is a tube-after-tube flow — navigating away mid-rack would
      // break it. Location labels only navigate in the normal Scan mode.
      scanMsg.value = `"${doc.name}" is a location label — scan it in Scan mode to open it, or in Relocate mode to arm it.`
    } else {
      closeScanner()
      doc.type === 'box' ? openBox(doc) : openUnit(doc)
      store.toast?.(`${doc.type === 'box' ? 'Box' : 'Unit'} "${doc.name}" opened`)
    }
    return
  }

  const item = store.inventory.find(i =>
    (i.code && String(i.code).toLowerCase() === code.toLowerCase()) || i.id === code)
  if (!item) { scanMsg.value = `No inventory item with code "${code}".`; return }
  scanMsg.value = ''
  if (scanner.value?.mode === 'relocate') {
    relocate.value.item = item
    if (relocate.value.loc) commitRelocate()
    else store.toast?.(`[${item.code}] scanned — now scan the location label it goes to`)
  } else if (scanner.value?.mode === 'take') {
    // Quick mode: every scan toggles taken/returned and keeps scanning —
    // built for working through a rack tube by tube.
    const taken = toggleTaken(item)
    store.toast?.(taken
      ? `[${item.code}] taken out${pathOf(item) ? ' — belongs at ' + pathOf(item) : ''}`
      : `[${item.code}] returned${pathOf(item) ? ' to ' + pathOf(item) : ''}`)
  } else {
    scanResult.value = { item }
  }
}
// The relocate commit: the armed location stays armed, so a whole rack can be
// scanned into one box in a row. This is the "real-time" tracking: the position
// is saved the instant the pair completes (and mirrors to other clients when
// Supabase Realtime is enabled for the tables).
function commitRelocate() {
  const { loc, item } = relocate.value
  if (!loc || !item) return
  if (loc.type === 'box') {
    const cell = firstFreeCell(loc)
    item.storage = cell ? { boxId: loc.id, cell } : { boxId: loc.id }
    syncLocationStrings(item, loc, cell || '')
    store.toast?.(cell || loc.plain
      ? `[${item.code}] → ${pathOf(item)}`
      : `[${item.code}] → ${loc.name} is FULL — placed without a cell, pick one in the box view`)
  } else {
    item.storage = { unitId: loc.id }
    item.location = [loc.lab, loc.name].filter(Boolean).join(' · ')
    item.sublocation = ''
    store.toast?.(`[${item.code}] → ${pathOf(item)}`)
  }
  store.saveItemToCloud(item)
  navigator.vibrate?.(120)
  relocate.value = { loc, item: null }   // location stays armed for the next stock
}

function scanPlace(item) { closeScanner(); startPlacing(item) }
function scanShow(item) {
  closeScanner()
  if (item.storage?.boxId && boxById.value[item.storage.boxId]) jumpTo(item)
}

const fmtTaken = (t) => t ? `${(t.by || '').split('@')[0] || 'someone'} · ${new Date(t.at).toLocaleString()}` : ''
</script>

<template>
  <!-- Embedded as the Storage tab of the Inventory module — no own card chrome. -->
  <div>
    <div style="margin-bottom: 14px; display: flex; justify-content: flex-end; align-items: center; gap: 10px; flex-wrap: wrap;">
      <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
        <div style="position: relative;">
          <input type="text" v-model="searchQuery" placeholder="Where is… (code or name)" style="width: 210px; padding: 6px 10px;">
          <div v-if="searchMatches.length" class="sm-search-drop">
            <div v-for="it in searchMatches" :key="it.id" class="sm-search-row" @mousedown.prevent="jumpTo(it)">
              <span class="sm-chip" :style="chipStyle(it)">{{ it.code }}</span>
              <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ it.name }}</span>
              <span style="font-size: 0.7rem; opacity: 0.6; white-space: nowrap;">
                <i v-if="it.storage?.taken" class="fas fa-hand" style="color: #d97706;"></i>
                {{ pathOf(it) || 'unplaced' }}
              </span>
            </div>
          </div>
        </div>
        <button class="sm-btn" @click="openScanner('lookup')" title="Scan a tube's QR: see where it belongs, take it out, or re-place it"><i class="fas fa-qrcode"></i> Scan</button>
        <button class="sm-btn" @click="openScanner('take')" title="Rapid mode: every scan toggles taken ↔ returned, and keeps scanning"><i class="fas fa-bolt"></i> Quick take</button>
        <button class="sm-btn" @click="openScanner('relocate')" title="Scan a location label once, then stock after stock — each is re-assigned there instantly"><i class="fas fa-arrows-rotate"></i> Relocate</button>
        <button class="sm-btn primary" @click="newUnit"><i class="fas fa-plus"></i> Storage unit</button>
      </div>
    </div>

    <div v-if="loadError" style="padding: 10px 14px; border: 1px solid #ef4444; border-radius: var(--radius); color: #ef4444; font-size: 0.85rem; margin-bottom: 14px;">
      <i class="fas fa-triangle-exclamation"></i> {{ loadError }} — is the <code>storage_map</code> table set up? Run <code>supabase/storage_map.sql</code> once.
    </div>

    <!-- Placement banner -->
    <div v-if="placingItem" class="sm-placing">
      <i class="fas fa-arrows-to-dot"></i>
      Placing <span class="sm-chip" :style="chipStyle(placingItem)">{{ placingItem.code }}</span>
      <strong>{{ placingItem.name }}</strong> — open a box and click a cell
      <button class="sm-btn small" style="margin-left: auto;" @click="cancelPlacing"><i class="fas fa-times"></i> Cancel (Esc)</button>
    </div>

    <!-- Breadcrumbs + back -->
    <div class="sm-crumbs">
      <button v-if="view.level !== 'labs'" class="sm-btn small" @click="goBack" title="Back to the previous page">
        <i class="fas fa-arrow-left"></i> Back
      </button>
      <span class="sm-crumb" :class="{ on: view.level === 'labs' }" @click="view = { level: 'labs' }"><i class="fas fa-door-open"></i> Labs</span>
      <template v-if="curUnit"><i class="fas fa-chevron-right sm-sep"></i>
        <span class="sm-crumb" :class="{ on: view.level === 'unit' }" @click="openUnit(curUnit)"><i class="fas" :class="kindIcon(curUnit.kind)"></i> {{ curUnit.name }}</span></template>
      <template v-if="curBox"><i class="fas fa-chevron-right sm-sep"></i>
        <span class="sm-crumb on"><i class="fas fa-border-all"></i> Shelf {{ curBox.shelf }} · {{ curBox.name }}</span></template>
    </div>

    <!-- ════ Labs overview ════ -->
    <template v-if="view.level === 'labs'">
      <div v-if="!units.length && !loadError" style="text-align: center; padding: 40px 20px; opacity: 0.55;">
        No storage units yet. Add your first fridge or freezer — then boxes on its shelves, then scan tubes into cells.
      </div>
      <div v-for="lab in labs" :key="lab" style="margin-bottom: 22px;">
        <h3 style="margin: 0 0 10px; font-size: 1rem; opacity: 0.8;"><i class="fas fa-door-open" style="opacity: 0.5;"></i> {{ lab }}</h3>
        <div class="sm-unit-grid">
          <div v-for="u in labUnits(lab)" :key="u.id" class="sm-unit-card" @click="openUnit(u)">
            <div class="sm-unit-ic"><i class="fas" :class="kindIcon(u.kind)"></i></div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 700;">{{ u.name }}</div>
              <div style="font-size: 0.72rem; opacity: 0.6;">{{ kindLabel(u.kind) }} · {{ u.shelves }} shelves · {{ unitBoxes(u.id).length }} boxes · {{ unitCount(u.id) }} items</div>
            </div>
            <button class="sm-btn small" @click.stop="showLocQr(u)" title="Location QR label — print and stick it on the unit; scanning it in Relocate mode sends stocks here"><i class="fas fa-qrcode"></i></button>
            <button class="sm-btn small" @click.stop="printUnitLabels(u)" title="Print ALL labels for this unit at once — its own plus one per box"><i class="fas fa-print"></i></button>
            <button class="sm-btn small" @click.stop="editUnit(u)" title="Edit unit"><i class="fas fa-pen"></i></button>
          </div>
        </div>
      </div>

      <!-- Currently taken out -->
      <div v-if="takenItems.length" style="margin-top: 8px; padding: 12px 14px; border: 1px dashed #d97706; border-radius: var(--radius);">
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
          <span style="font-weight: 700; font-size: 0.85rem; color: #d97706;"><i class="fas fa-hand"></i> Loaned out right now</span>
          <span style="flex: 1;"></span>
          <button class="sm-btn small" :class="{ primary: takenFilter === 'mine' }" @click="takenFilter = 'mine'">Mine ({{ myTakenItems.length }})</button>
          <button class="sm-btn small" :class="{ primary: takenFilter === 'all' }" @click="takenFilter = 'all'">Everyone ({{ takenItems.length }})</button>
        </div>
        <div v-if="!shownTaken.length" style="font-size: 0.78rem; opacity: 0.55; font-style: italic;">Nothing loaned out by you.</div>
        <div v-for="it in shownTaken" :key="it.id" style="display: flex; gap: 8px; align-items: center; padding: 3px 0; font-size: 0.82rem;">
          <span class="sm-chip" :style="chipStyle(it)">{{ it.code }}</span>
          <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ it.name }}</span>
          <span style="font-size: 0.7rem; opacity: 0.55;">{{ fmtTaken(it.storage.taken) }}</span>
          <span style="font-size: 0.7rem; opacity: 0.7;">{{ pathOf(it) || 'no position' }}</span>
          <button class="sm-btn small" @click="toggleTaken(it)" title="Mark as returned to its cell"><i class="fas fa-rotate-left"></i> Return</button>
          <button class="sm-btn small" @click="startPlacing(it)" title="Put it somewhere else"><i class="fas fa-arrows-to-dot"></i> Re-place</button>
        </div>
      </div>

      <!-- Flat locations straight from the inventory: every named location and
           what sits in it, whether or not it has a structured fridge/box yet. -->
      <div style="margin-top: 22px;">
        <h3 style="margin: 0 0 10px; font-size: 1rem; opacity: 0.8;">
          <i class="fas fa-location-dot" style="opacity: 0.5;"></i> Inventory locations
          <span v-if="unlocatedCount" style="font-size: 0.72rem; font-weight: 400; opacity: 0.6;">· {{ unlocatedCount }} items have no location at all</span>
        </h3>
        <div v-if="!flatLocations.length" style="font-size: 0.8rem; opacity: 0.5; font-style: italic;">No locations recorded on any inventory item yet.</div>
        <div class="sm-loc-grid">
          <button v-for="g in flatLocations" :key="g.name" class="sm-loc-card" :class="{ open: openLoc === g.name }"
                  @click="openLoc = openLoc === g.name ? null : g.name">
            <span class="sm-unit-ic sm-loc-ic"><i class="fas" :class="looksLikeUnit(g.name) ? kindIcon(guessKind(g.name)) : 'fa-location-dot'"></i></span>
            <span class="sm-loc-main">
              <span class="sm-loc-name">{{ g.name }}</span>
              <span class="sm-loc-meta">
                {{ g.items.length }} item{{ g.items.length === 1 ? '' : 's' }} · {{ g.items.filter(i => i.storage?.boxId).length }} in a box
              </span>
              <span v-if="looksLikeUnit(g.name)" class="sm-loc-hint">looks like a {{ kindLabel(guessKind(g.name)) }}</span>
            </span>
            <i class="fas sm-loc-chev" :class="openLoc === g.name ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
          </button>
        </div>

        <div v-if="openLoc && flatLocations.find(g => g.name === openLoc)" class="sm-loc-panel">
          <div class="sm-loc-panel-head">
            <span style="font-weight: 700;"><i class="fas fa-location-dot" style="opacity: 0.5;"></i> {{ openLoc }}</span>
            <span style="flex: 1;"></span>
            <button class="sm-btn small" @click="makeUnitFromLocation(flatLocations.find(g => g.name === openLoc))"
                    title="Recognize this location as a storage unit — its items carry over, and their sublocations are offered as boxes inside it">
              <i class="fas fa-snowflake"></i> Make storage unit
            </button>
            <button class="sm-btn small" @click="openConvertBox(flatLocations.find(g => g.name === openLoc))"
                    title="This location is itself a box (e.g. Matrixbox) — put it inside one of the storage units">
              <i class="fas fa-border-all"></i> Make box in a unit…
            </button>
            <button class="sm-btn small" @click="openMergeLoc(flatLocations.find(g => g.name === openLoc))"
                    title="Unify with another location: every item recorded here moves to the target name">
              <i class="fas fa-object-group"></i> Merge into…
            </button>
          </div>
          <div class="sm-loc-items">
            <div v-for="it in flatLocations.find(g => g.name === openLoc).items" :key="it.id" class="sm-loc-row">
              <span class="sm-chip" :style="chipStyle(it)">{{ it.code }}</span>
              <span class="sm-loc-row-name" :title="it.name">{{ it.name }}</span>
              <span class="sm-loc-row-path" :title="it.storage?.boxId ? pathOf(it) : (it.sublocation || '')">
                <i v-if="it.storage?.taken" class="fas fa-hand" style="color: #d97706; margin-right: 4px;" :title="'In use by ' + fmtTaken(it.storage.taken)"></i>
                {{ it.storage?.boxId ? pathOf(it) : (it.sublocation || 'no box position') }}
              </span>
              <span class="sm-loc-row-actions">
                <button v-if="it.storage?.boxId" class="sm-btn small" @click.stop="jumpTo(it)" title="Show in its box"><i class="fas fa-eye"></i></button>
                <button class="sm-btn small" @click.stop="startPlacing(it)" :title="it.storage?.boxId ? 'Move to another cell' : 'Give it a box position'"><i class="fas fa-arrows-to-dot"></i></button>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="orphanItems.length" style="margin-top: 12px; padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius); font-size: 0.8rem; opacity: 0.85;">
        <i class="fas fa-triangle-exclamation" style="color: #d97706;"></i>
        {{ orphanItems.length }} item{{ orphanItems.length === 1 ? '' : 's' }} point at a box you can't see (deleted, or private to someone else):
        <span v-for="it in orphanItems" :key="it.id" style="margin-left: 6px;">
          <span class="sm-chip" :style="chipStyle(it)">{{ it.code }}</span>
          <button class="sm-btn small" @click="startPlacing(it)" style="margin-left: 3px;">re-place</button>
        </span>
      </div>
    </template>

    <!-- ════ Unit (fridge cross-section: shelves top → bottom) ════ -->
    <template v-else-if="view.level === 'unit' && curUnit">
      <div class="sm-fridge">
        <div v-for="shelf in curUnit.shelves" :key="shelf" class="sm-shelf">
          <div class="sm-shelf-label">
            Shelf {{ shelf }}
            <i v-if="!unitBoxes(curUnit.id).some(b => b.shelf === shelf) && curUnit.shelves > 1"
               class="fas fa-times sm-shelf-x" @click="removeShelf(shelf)" title="Remove this empty shelf"></i>
          </div>
          <div class="sm-shelf-boxes" @dragover.prevent @drop="dropOnShelf(shelf, $event)">
            <div v-for="b in unitBoxes(curUnit.id).filter(x => x.shelf === shelf)" :key="b.id" class="sm-box-tile"
                 draggable="true" @dragstart="boxDragStart(b, $event)"
                 @dragover.prevent @drop.stop="boxTileDrop(b, $event)"
                 title="Drag onto another shelf to move it; drag a stock onto it to drop the stock in"
                 @click="openBox(b)">
              <div v-if="b.plain" class="sm-box-plain-ic"><i class="fas fa-box-open"></i></div>
              <div v-else class="sm-box-mini" :style="{ gridTemplateColumns: `repeat(${b.cols}, 1fr)` }">
                <template v-for="r in b.rows" :key="r">
                  <span v-for="c in b.cols" :key="c" class="sm-mini-dot"
                        :style="(itemsByBox[b.id]?.[cellId(r, c)] || []).length ? { background: classColor(itemsByBox[b.id][cellId(r, c)][0]), opacity: 1 } : {}"></span>
                </template>
              </div>
              <div style="min-width: 0;">
                <div style="font-weight: 700; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ b.name }}</div>
                <div style="font-size: 0.7rem; opacity: 0.6;">
                  {{ b.plain ? allInBox(b.id).length + ' item' + (allInBox(b.id).length === 1 ? '' : 's') : `${b.rows}×${b.cols} · ${boxCount(b.id)}/${b.rows * b.cols}` }}
                </div>
              </div>
              <button class="sm-btn small" @click.stop="showLocQr(b)" title="Location QR label for this box"><i class="fas fa-qrcode"></i></button>
              <button class="sm-btn small" @click.stop="editBox(b)" title="Edit box"><i class="fas fa-pen"></i></button>
            </div>
            <button class="sm-add-box" @click="newBox(curUnit, shelf)" title="Add a box on this shelf"><i class="fas fa-plus"></i> Box</button>
          </div>
        </div>
      </div>
      <button class="sm-add-box" style="margin-top: 8px; width: 100%;" @click="addShelf" :disabled="curUnit.shelves >= 20" title="Add a shelf at the bottom">
        <i class="fas fa-plus"></i> Add shelf
      </button>

      <!-- Items assigned to this unit but not yet to a box -->
      <div v-if="(unitTray[curUnit.id] || []).length" style="margin-top: 12px; padding: 10px 14px; border: 1px dashed var(--border); border-radius: var(--radius);">
        <div style="font-weight: 700; font-size: 0.82rem; margin-bottom: 6px; opacity: 0.75;">
          <i class="fas fa-box-open"></i> In {{ curUnit.name }}, no box yet ({{ (unitTray[curUnit.id] || []).length }})
        </div>
        <div v-for="it in unitTray[curUnit.id]" :key="it.id" style="display: flex; gap: 8px; align-items: center; padding: 3px 0; font-size: 0.82rem;"
             draggable="true" @dragstart="itemDragStart(it, $event)" title="Drag onto a box tile to drop it in">
          <span class="sm-chip" :style="chipStyle(it)">{{ it.code }}</span>
          <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ it.name }}</span>
          <i v-if="it.storage?.taken" class="fas fa-hand" style="color: #d97706;" :title="'In use by ' + fmtTaken(it.storage.taken)"></i>
          <button class="sm-btn small" @click="startPlacing(it)" title="Pick a box and cell"><i class="fas fa-arrows-to-dot"></i> Place in a box</button>
        </div>
      </div>
    </template>

    <!-- ════ Box (the cryo grid, or a plain container) ════ -->
    <template v-else-if="view.level === 'box' && curBox && curBox.plain">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
        <span style="font-size: 0.8rem; opacity: 0.6;"><i class="fas fa-box-open"></i> Plain box — items live loose inside, no grid positions.</span>
        <span style="flex: 1;"></span>
        <button v-if="placingItem" class="sm-btn primary" @click="placeAt(curBox, null)">
          <i class="fas fa-arrows-to-dot"></i> Put [{{ placingItem.code }}] in this box
        </button>
        <button class="sm-btn" @click="pickerCell = { box: curBox, cell: null }; pickerQuery = ''"><i class="fas fa-plus"></i> Add stock</button>
      </div>
      <div v-if="!allInBox(curBox.id).length" style="text-align: center; padding: 30px; opacity: 0.5; border: 1px dashed var(--border); border-radius: var(--radius);">
        Empty box. Add stocks here, or scan its QR label in Relocate mode.
      </div>
      <div v-else style="border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 12px;">
        <div v-for="it in allInBox(curBox.id)" :key="it.id" style="display: flex; gap: 8px; align-items: center; padding: 4px 0; font-size: 0.84rem; border-bottom: 1px solid var(--bg);">
          <span class="sm-chip" :style="chipStyle(it)">{{ it.code }}</span>
          <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ it.name }}</span>
          <span v-if="it.stock != null" style="font-size: 0.74rem; opacity: 0.6;">{{ it.stock }} {{ it.stockUnit }}</span>
          <span v-if="it.storage?.taken" style="font-size: 0.72rem; color: #d97706;" :title="fmtTaken(it.storage.taken)"><i class="fas fa-hand"></i> in use</span>
          <button class="sm-btn small" @click="toggleTaken(it)">
            <i class="fas" :class="it.storage?.taken ? 'fa-rotate-left' : 'fa-hand'"></i> {{ it.storage?.taken ? 'Return' : 'Take out' }}
          </button>
          <button class="sm-btn small" @click="startPlacing(it)" title="Move somewhere else"><i class="fas fa-arrows-to-dot"></i></button>
          <button class="sm-btn small" @click="unplace(it)" title="Remove from this box"><i class="fas fa-eraser"></i></button>
        </div>
      </div>
    </template>

    <!-- ════ Box (the cryo grid) ════ -->
    <template v-else-if="view.level === 'box' && curBox">
      <div style="overflow-x: auto; padding-bottom: 6px;">
        <div class="sm-grid" :style="{ gridTemplateColumns: `26px repeat(${curBox.cols}, minmax(44px, 1fr))` }">
          <div></div>
          <div v-for="c in curBox.cols" :key="'h' + c" class="sm-grid-label">{{ c }}</div>
          <template v-for="r in curBox.rows" :key="'r' + r">
            <div class="sm-grid-label">{{ rowLetter(r) }}</div>
            <div v-for="c in curBox.cols" :key="'c' + r + '-' + c" class="sm-cell"
                 :class="{ pulse: pulse === curBox.id + '|' + cellId(r, c), placing: !!placingItem }"
                 @dragover.prevent @drop="cellDrop(curBox, cellId(r, c), $event)"
                 @click="clickCell(curBox, cellId(r, c))">
              <template v-if="(itemsByBox[curBox.id]?.[cellId(r, c)] || []).length">
                <span class="sm-cell-chip" :class="{ taken: itemsByBox[curBox.id][cellId(r, c)][0].storage?.taken }"
                      draggable="true" @dragstart="itemDragStart(itemsByBox[curBox.id][cellId(r, c)][0], $event)"
                      :style="chipStyle(itemsByBox[curBox.id][cellId(r, c)][0])"
                      :title="itemsByBox[curBox.id][cellId(r, c)].map(i => `[${i.code}] ${i.name}${i.storage?.taken ? ' — in use by ' + fmtTaken(i.storage.taken) : ''}`).join('\n')">
                  {{ itemsByBox[curBox.id][cellId(r, c)][0].code }}
                </span>
                <span v-if="itemsByBox[curBox.id][cellId(r, c)].length > 1" class="sm-cell-more">+{{ itemsByBox[curBox.id][cellId(r, c)].length - 1 }}</span>
              </template>
            </div>
          </template>
        </div>
      </div>
      <div style="font-size: 0.72rem; opacity: 0.55; margin-top: 6px;">
        Click an empty cell to place a stock there; click an occupied cell for details. Dimmed = currently taken out.
      </div>

      <!-- Items in this box that have no cell yet (from location conversion / relocate scans into a full box) -->
      <div v-if="(boxTray[curBox.id] || []).length" style="margin-top: 10px; padding: 10px 14px; border: 1px dashed var(--border); border-radius: var(--radius);">
        <div style="font-weight: 700; font-size: 0.82rem; margin-bottom: 6px; opacity: 0.75;">
          <i class="fas fa-inbox"></i> In this box, cell not chosen yet ({{ (boxTray[curBox.id] || []).length }})
        </div>
        <div v-for="it in boxTray[curBox.id]" :key="it.id" style="display: flex; gap: 8px; align-items: center; padding: 3px 0; font-size: 0.82rem;"
             draggable="true" @dragstart="itemDragStart(it, $event)" title="Drag onto a cell to place it">
          <span class="sm-chip" :style="chipStyle(it)">{{ it.code }}</span>
          <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ it.name }}</span>
          <i v-if="it.storage?.taken" class="fas fa-hand" style="color: #d97706;" :title="'In use by ' + fmtTaken(it.storage.taken)"></i>
          <button class="sm-btn small" @click="startPlacing(it)" title="Click the cell it sits in"><i class="fas fa-arrows-to-dot"></i> Pick cell</button>
        </div>
      </div>
    </template>

    <!-- ── Cell details popover ── -->
    <div v-if="cellInfo" class="sm-modal" @click.self="cellInfo = null">
      <div class="sm-modal-box">
        <div class="flex-between" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h3 style="margin: 0; color: var(--primary);">{{ cellInfo.box.name }} · {{ cellInfo.cell }}</h3>
          <button class="danger small" @click="cellInfo = null"><i class="fas fa-times"></i></button>
        </div>
        <div v-for="it in cellInfo.items" :key="it.id" style="border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px; margin-bottom: 8px;">
          <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 4px;">
            <span class="sm-chip" :style="chipStyle(it)">{{ it.code }}</span>
            <strong style="flex: 1; min-width: 0;">{{ it.name }}</strong>
            <span v-if="it.stock != null" style="font-size: 0.78rem; opacity: 0.7;">{{ it.stock }} {{ it.stockUnit }}</span>
          </div>
          <div v-if="it.storage?.taken" style="font-size: 0.75rem; color: #d97706; margin-bottom: 6px;">
            <i class="fas fa-hand"></i> Taken out — {{ fmtTaken(it.storage.taken) }}
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="sm-btn small" @click="toggleTaken(it)">
              <i class="fas" :class="it.storage?.taken ? 'fa-rotate-left' : 'fa-hand'"></i> {{ it.storage?.taken ? 'Return' : 'Take out' }}
            </button>
            <button class="sm-btn small" @click="cellInfo = null; startPlacing(it)"><i class="fas fa-arrows-to-dot"></i> Move</button>
            <button class="sm-btn small" @click="unplace(it)"><i class="fas fa-eraser"></i> Unplace</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Item picker for an empty cell ── -->
    <div v-if="pickerCell" class="sm-modal" @click.self="pickerCell = null">
      <div class="sm-modal-box">
        <div class="flex-between" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h3 style="margin: 0; color: var(--primary);">Place into {{ pickerCell.box.name }}{{ pickerCell.cell ? ' · ' + pickerCell.cell : '' }}</h3>
          <button class="danger small" @click="pickerCell = null"><i class="fas fa-times"></i></button>
        </div>
        <input type="text" v-model="pickerQuery" placeholder="Search inventory (code or name)…" style="width: 100%; padding: 7px 10px; margin-bottom: 8px;" autofocus>
        <div style="max-height: 320px; overflow-y: auto;">
          <div v-for="it in pickerMatches" :key="it.id" class="sm-search-row" @click="placeAt(pickerCell.box, pickerCell.cell, it); pickerCell = null">
            <span class="sm-chip" :style="chipStyle(it)">{{ it.code }}</span>
            <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ it.name }}</span>
            <span style="font-size: 0.7rem; opacity: 0.55;">{{ pathOf(it) || 'unplaced' }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Unit dialog ── -->
    <div v-if="unitDialog" class="sm-modal" @click.self="unitDialog = null">
      <div class="sm-modal-box">
        <h3 style="margin: 0 0 12px; color: var(--primary);">{{ unitDialog.mode === 'new' ? 'New storage unit' : 'Edit storage unit' }}</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
          <div class="input-group" style="margin: 0;">
            <label style="font-size: 0.75rem; font-weight: bold;">Laboratory</label>
            <input type="text" v-model="unitDialog.unit.lab" list="sm-labs" placeholder="e.g. Lab 2">
            <datalist id="sm-labs"><option v-for="l in labs.filter(x => x !== 'Unassigned')" :key="l" :value="l" /></datalist>
          </div>
          <div class="input-group" style="margin: 0;">
            <label style="font-size: 0.75rem; font-weight: bold;">Name</label>
            <input type="text" v-model="unitDialog.unit.name" placeholder='e.g. "−80 #2"'>
          </div>
          <div class="input-group" style="margin: 0;">
            <label style="font-size: 0.75rem; font-weight: bold;">Type</label>
            <select v-model="unitDialog.unit.kind" style="width: 100%;">
              <option v-for="k in UNIT_KINDS" :key="k[0]" :value="k[0]">{{ k[1] }}</option>
            </select>
          </div>
          <div class="input-group" style="margin: 0;">
            <label style="font-size: 0.75rem; font-weight: bold;">Shelves</label>
            <input type="number" min="1" max="20" v-model.number="unitDialog.unit.shelves">
          </div>
          <div class="input-group" style="margin: 0;">
            <label style="font-size: 0.75rem; font-weight: bold;">Visibility</label>
            <select v-model="unitDialog.unit.scope" style="width: 100%;">
              <option value="Global">Lab (shared)</option>
              <option value="Personal">Private</option>
            </select>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <button v-if="unitDialog.mode === 'edit'" class="danger small" @click="removeUnit(unitDialog.unit)"><i class="fas fa-trash"></i> Delete</button>
          <span v-else></span>
          <button class="small" @click="saveUnit"><i class="fas fa-check"></i> Save</button>
        </div>
      </div>
    </div>

    <!-- ── Box dialog ── -->
    <div v-if="boxDialog" class="sm-modal" @click.self="boxDialog = null">
      <div class="sm-modal-box">
        <h3 style="margin: 0 0 12px; color: var(--primary);">{{ boxDialog.mode === 'new' ? 'New box' : 'Edit box' }}</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
          <div class="input-group" style="margin: 0; grid-column: span 2;">
            <label style="font-size: 0.75rem; font-weight: bold;">Name</label>
            <input type="text" v-model="boxDialog.box.name" placeholder='e.g. "Peptides 1"'>
          </div>
          <div class="input-group" style="margin: 0; grid-column: span 2;">
            <label style="font-size: 0.75rem; font-weight: bold;">Inside unit <span style="font-weight: 400; opacity: 0.6;">(change to relocate the whole box)</span></label>
            <select v-model="boxDialog.box.unitId" style="width: 100%;">
              <option v-for="u in units" :key="u.id" :value="u.id">{{ [u.lab, u.name].filter(Boolean).join(' · ') }}</option>
            </select>
          </div>
          <label style="grid-column: span 2; display: flex; gap: 8px; align-items: center; font-size: 0.82rem; cursor: pointer;">
            <input type="checkbox" v-model="boxDialog.box.plain" style="width: 15px; height: 15px;">
            Just a box — no grid, items live loose inside
          </label>
          <div v-if="!boxDialog.box.plain" class="input-group" style="margin: 0;">
            <label style="font-size: 0.75rem; font-weight: bold;">Rows</label>
            <input type="number" min="1" max="26" v-model.number="boxDialog.box.rows">
          </div>
          <div v-if="!boxDialog.box.plain" class="input-group" style="margin: 0;">
            <label style="font-size: 0.75rem; font-weight: bold;">Columns</label>
            <input type="number" min="1" max="24" v-model.number="boxDialog.box.cols">
          </div>
          <div class="input-group" style="margin: 0;">
            <label style="font-size: 0.75rem; font-weight: bold;">Shelf</label>
            <input type="number" min="1" :max="unitById[boxDialog.box.unitId]?.shelves || 20" v-model.number="boxDialog.box.shelf">
          </div>
        </div>
        <div v-if="!boxDialog.box.plain" style="display: flex; gap: 4px; margin-bottom: 12px;">
          <button v-for="p in [[9, 9, '9×9'], [10, 10, '10×10'], [8, 12, '8×12 (plate rack)']]" :key="p[2]" class="sm-btn small"
                  @click="boxDialog.box.rows = p[0]; boxDialog.box.cols = p[1]">{{ p[2] }}</button>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <button v-if="boxDialog.mode === 'edit'" class="danger small" @click="removeBox(boxDialog.box)"><i class="fas fa-trash"></i> Delete</button>
          <span v-else></span>
          <button class="small" @click="saveBox"><i class="fas fa-check"></i> Save</button>
        </div>
      </div>
    </div>

    <!-- ── Convert a location into a box inside a unit ── -->
    <div v-if="convertBox" class="sm-modal" @click.self="convertBox = null">
      <div class="sm-modal-box" style="max-width: 420px;">
        <h3 style="margin: 0 0 6px; color: var(--primary);">"{{ convertBox.g.name }}" → box</h3>
        <p style="margin: 0 0 12px; font-size: 0.8rem; opacity: 0.7;">
          This location is itself a box — pick the storage unit it physically sits in.
          Its {{ convertBox.g.items.length }} item{{ convertBox.g.items.length === 1 ? '' : 's' }} carry over;
          cells are assigned later by clicking.
        </p>
        <div style="display: grid; grid-template-columns: 1fr 90px; gap: 10px; margin-bottom: 14px;">
          <div class="input-group" style="margin: 0;">
            <label style="font-size: 0.75rem; font-weight: bold;">Inside unit</label>
            <select v-model="convertBox.unitId" style="width: 100%;">
              <option v-for="u in units" :key="u.id" :value="u.id">{{ [u.lab, u.name].filter(Boolean).join(' · ') }}</option>
            </select>
          </div>
          <div class="input-group" style="margin: 0;">
            <label style="font-size: 0.75rem; font-weight: bold;">Shelf</label>
            <input type="number" min="1" :max="unitById[convertBox.unitId]?.shelves || 20" v-model.number="convertBox.shelf">
          </div>
        </div>
        <div style="display: flex; justify-content: flex-end;">
          <button class="small" @click="makeBoxFromLocation"><i class="fas fa-check"></i> Create box</button>
        </div>
      </div>
    </div>

    <!-- ── Merge a location into another ── -->
    <div v-if="mergeLoc" class="sm-modal" @click.self="mergeLoc = null">
      <div class="sm-modal-box" style="max-width: 400px;">
        <h3 style="margin: 0 0 6px; color: var(--primary);">Merge "{{ mergeLoc.from }}"</h3>
        <p style="margin: 0 0 12px; font-size: 0.8rem; opacity: 0.7;">
          Every item recorded at "{{ mergeLoc.from }}" is rewritten to the target location —
          use this to unify two names for the same physical place. Structured box positions are untouched.
        </p>
        <div class="input-group" style="margin: 0 0 14px;">
          <label style="font-size: 0.75rem; font-weight: bold;">Into location</label>
          <select v-model="mergeLoc.target" style="width: 100%;">
            <option v-for="n in allLocationNames.filter(x => x !== mergeLoc.from)" :key="n" :value="n">{{ n }}</option>
          </select>
        </div>
        <div style="display: flex; justify-content: flex-end;">
          <button class="small" @click="doMergeLoc"><i class="fas fa-object-group"></i> Merge</button>
        </div>
      </div>
    </div>

    <!-- ── Location QR label ── -->
    <div v-if="locQr" class="sm-modal" @click.self="locQr = null">
      <div class="sm-modal-box" style="max-width: 340px; text-align: center;">
        <img :src="locQr.uri" style="width: 200px; height: 200px; background: #fff; border-radius: 8px; padding: 8px;">
        <div style="font-weight: 700; font-size: 1.05rem; margin-top: 8px;">{{ locQr.title }}</div>
        <div style="font-size: 0.78rem; opacity: 0.65; margin-bottom: 12px;">{{ locQr.sub }}</div>
        <div style="display: flex; gap: 8px; justify-content: center;">
          <button class="sm-btn" @click="printLocQr"><i class="fas fa-print"></i> Print label</button>
          <button class="sm-btn" @click="locQr = null"><i class="fas fa-times"></i> Close</button>
        </div>
        <div style="font-size: 0.7rem; opacity: 0.55; margin-top: 10px;">
          Stick it on the unit or box. Scanning it in <strong>Relocate</strong> mode arms it as the
          destination — every stock scanned after lands there.
        </div>
      </div>
    </div>

    <!-- ── Scanner ── -->
    <div v-if="scanner" class="sm-modal" @click.self="closeScanner">
      <div class="sm-modal-box" style="max-width: 440px;">
        <div class="flex-between" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h3 style="margin: 0; color: var(--primary);">
            <i class="fas" :class="scanner.mode === 'take' ? 'fa-bolt' : scanner.mode === 'relocate' ? 'fa-arrows-rotate' : 'fa-qrcode'"></i>
            {{ scanner.mode === 'take' ? 'Quick take — scan to toggle taken/returned'
               : scanner.mode === 'relocate' ? 'Relocate — scan a location, then stocks' : 'Scan a tube' }}
          </h3>
          <button class="danger small" @click="closeScanner"><i class="fas fa-times"></i></button>
        </div>
        <div style="position: relative; border-radius: var(--radius); overflow: hidden; background: #000;">
          <video ref="videoRef" playsinline muted style="width: 100%; display: block; max-height: 320px; object-fit: cover;"></video>
          <div class="sm-scan-frame"></div>
        </div>
        <div v-if="scanMsg" style="margin-top: 8px; font-size: 0.8rem; color: #d97706;">{{ scanMsg }}</div>

        <!-- Lookup result -->
        <div v-if="scanResult?.item" style="margin-top: 10px; border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px;">
          <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 4px;">
            <span class="sm-chip" :style="chipStyle(scanResult.item)">{{ scanResult.item.code }}</span>
            <strong style="flex: 1;">{{ scanResult.item.name }}</strong>
            <span v-if="scanResult.item.stock != null" style="font-size: 0.78rem; opacity: 0.7;">{{ scanResult.item.stock }} {{ scanResult.item.stockUnit }}</span>
          </div>
          <div style="font-size: 0.8rem; opacity: 0.75; margin-bottom: 4px;">
            <i class="fas fa-location-dot"></i> {{ pathOf(scanResult.item) || 'No box position yet' }}
          </div>
          <div v-if="scanResult.item.storage?.taken" style="font-size: 0.75rem; color: #d97706; margin-bottom: 6px;">
            <i class="fas fa-hand"></i> Taken out — {{ fmtTaken(scanResult.item.storage.taken) }}
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="sm-btn small" @click="toggleTaken(scanResult.item); scanResult = null">
              <i class="fas" :class="scanResult.item.storage?.taken ? 'fa-rotate-left' : 'fa-hand'"></i>
              {{ scanResult.item.storage?.taken ? 'Return' : 'Take out' }}
            </button>
            <button class="sm-btn small" @click="scanPlace(scanResult.item)"><i class="fas fa-arrows-to-dot"></i> {{ scanResult.item.storage?.boxId ? 'Re-place' : 'Place' }}</button>
            <button v-if="scanResult.item.storage?.boxId" class="sm-btn small" @click="scanShow(scanResult.item)"><i class="fas fa-eye"></i> Show in box</button>
            <button class="sm-btn small" style="margin-left: auto;" @click="scanResult = null"><i class="fas fa-qrcode"></i> Scan next</button>
          </div>
        </div>
        <div v-else-if="scanner.mode === 'take'" style="margin-top: 8px; font-size: 0.75rem; opacity: 0.6;">
          Point at a label — each scan flips the stock between taken and returned. The camera stays on.
        </div>
        <div v-else-if="scanner.mode === 'relocate'" style="margin-top: 10px;">
          <div style="display: flex; gap: 8px; align-items: center; padding: 8px 10px; border: 1.5px dashed var(--border); border-radius: var(--radius);">
            <i class="fas fa-location-dot" :style="relocate.loc ? 'color: var(--acc, #2563eb);' : 'opacity: 0.4;'"></i>
            <template v-if="relocate.loc">
              <strong style="flex: 1;">{{ relocate.loc.name }}</strong>
              <span style="font-size: 0.7rem; opacity: 0.6;">{{ relocate.loc.type === 'box' ? 'box — first free cell is used' : 'unit' }} · armed</span>
              <button class="sm-btn small" @click="relocate.loc = null" title="Disarm"><i class="fas fa-times"></i></button>
            </template>
            <span v-else style="font-size: 0.8rem; opacity: 0.6;">Scan a <strong>location label</strong> (QR button on any unit or box) to arm the destination…</span>
          </div>
          <div style="font-size: 0.72rem; opacity: 0.6; margin-top: 6px;">
            {{ relocate.loc ? (relocate.loc.type === 'unit'
                 ? 'Scan stocks to re-assign them here — or scan BOX labels to move whole boxes (contents included) into this unit.'
                 : 'Now scan stock after stock — each is re-assigned there instantly and stays tracked in real time.')
               : 'Then every stock you scan is re-assigned there in one go.' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sm-btn {
  height: 30px; padding: 0 11px; border-radius: 8px; font-size: 0.74rem; font-weight: 600;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  background: var(--btn2, rgba(0,0,0,.05)); color: var(--tx, inherit);
  border: 1px solid var(--ln2, rgba(0,0,0,.12)); cursor: pointer; box-shadow: none;
}
.sm-btn:hover { filter: brightness(1.06); }
.sm-btn.primary { background: var(--acc, #2563eb); border-color: transparent; color: #fff; }
.sm-btn.small { height: 24px; padding: 0 8px; font-size: 0.68rem; }

.sm-chip {
  display: inline-flex; align-items: center; padding: 1px 7px; border-radius: 9px;
  color: #fff; font-size: 0.68rem; font-weight: 700; white-space: nowrap; flex: none;
}

.sm-placing {
  display: flex; align-items: center; gap: 8px; margin-bottom: 14px; padding: 9px 13px;
  border: 1.5px dashed var(--acc, #2563eb); border-radius: var(--radius);
  background: var(--acs, rgba(37,99,235,.08)); font-size: 0.85rem;
}

.sm-crumbs { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; font-size: 0.85rem; }
.sm-crumb { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; opacity: 0.65; }
.sm-crumb:hover { opacity: 1; }
.sm-crumb.on { opacity: 1; font-weight: 700; color: var(--primary); cursor: default; }
.sm-sep { font-size: 0.6rem; opacity: 0.35; }

.sm-unit-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
.sm-unit-card {
  display: flex; gap: 10px; align-items: center; padding: 12px 14px; cursor: pointer;
  background: var(--panel-bg); border: 1px solid var(--border); border-radius: 12px;
}
.sm-unit-card:hover { filter: brightness(1.04); }
.sm-unit-ic {
  flex: none; width: 40px; height: 40px; border-radius: 10px; font-size: 1rem;
  background: var(--acs, rgba(37,99,235,.12)); color: var(--acc, #2563eb);
  display: inline-flex; align-items: center; justify-content: center;
}

/* Fridge cross-section */
.sm-fridge { border: 2px solid var(--border); border-radius: 14px; overflow: hidden; }
.sm-shelf { display: flex; border-bottom: 3px solid var(--border); min-height: 86px; }
.sm-shelf:last-child { border-bottom: none; }
.sm-shelf-label {
  flex: none; width: 64px; display: flex; flex-direction: column; gap: 4px; align-items: center; justify-content: center;
  font-size: 0.72rem; font-weight: 700; opacity: 0.55; border-right: 1px solid var(--ln);
  background: var(--panel-bg); text-align: center;
}
.sm-shelf-x { cursor: pointer; opacity: 0.4; font-size: 0.65rem; }
.sm-shelf-x:hover { opacity: 1; color: #ef4444; }
.sm-add-box:disabled { opacity: 0.3; cursor: default; }
.sm-shelf-boxes { flex: 1; display: flex; gap: 10px; padding: 10px; flex-wrap: wrap; align-items: center; }
.sm-box-tile {
  display: flex; gap: 8px; align-items: center; padding: 8px 10px; cursor: pointer;
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px; max-width: 240px;
}
.sm-box-tile:hover { filter: brightness(1.04); }
.sm-box-mini { flex: none; display: grid; gap: 1px; width: 52px; }
.sm-box-plain-ic {
  flex: none; width: 52px; height: 40px; border-radius: 8px; font-size: 1rem;
  background: var(--acs, rgba(37,99,235,.1)); color: var(--acc, #2563eb);
  display: inline-flex; align-items: center; justify-content: center;
}
.sm-mini-dot { width: 100%; aspect-ratio: 1; border-radius: 50%; background: var(--ln2, rgba(0,0,0,.14)); opacity: 0.6; }
.sm-add-box {
  height: 34px; padding: 0 12px; border-radius: 10px; font-size: 0.72rem; font-weight: 600;
  background: transparent; color: inherit; opacity: 0.55; cursor: pointer;
  border: 1.5px dashed var(--ln2, rgba(0,0,0,.2)); box-shadow: none;
}
.sm-add-box:hover { opacity: 1; border-color: var(--acc, #2563eb); color: var(--acc, #2563eb); }

/* Cryo box grid */
.sm-grid { display: grid; gap: 3px; min-width: 420px; }
.sm-grid-label { display: flex; align-items: center; justify-content: center; font-size: 0.68rem; font-weight: 700; opacity: 0.45; }
.sm-cell {
  aspect-ratio: 1; border-radius: 50%; border: 1.5px solid var(--ln2, rgba(0,0,0,.12));
  background: var(--panel-bg); cursor: pointer; position: relative;
  display: flex; align-items: center; justify-content: center; overflow: hidden; min-height: 40px;
}
.sm-cell:hover { border-color: var(--acc, #2563eb); }
.sm-cell.placing { border-style: dashed; }
.sm-cell.pulse { animation: sm-pulse 0.8s ease 2; border-color: var(--acc, #2563eb); }
@keyframes sm-pulse { 0% { box-shadow: 0 0 0 0 rgba(37,99,235,.55); } 100% { box-shadow: 0 0 0 12px rgba(37,99,235,0); } }
.sm-cell-chip {
  max-width: 92%; padding: 1px 5px; border-radius: 8px; color: #fff;
  font-size: 0.62rem; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sm-cell-chip.taken { opacity: 0.4; outline: 1.5px dashed currentColor; }
.sm-cell-more {
  position: absolute; right: 2px; bottom: 2px; font-size: 0.55rem; font-weight: 700;
  background: #ef4444; color: #fff; border-radius: 7px; padding: 0 4px;
}

/* Inventory locations — clean card faces; actions live in the expanded panel. */
.sm-loc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
.sm-loc-card {
  display: flex; gap: 10px; align-items: center; text-align: left; padding: 10px 12px;
  background: var(--panel-bg); border: 1px solid var(--border); border-radius: 12px;
  cursor: pointer; color: inherit; box-shadow: none; font: inherit; min-width: 0;
}
.sm-loc-card:hover { filter: brightness(1.04); }
.sm-loc-card.open { border-color: var(--acc, #2563eb); }
.sm-loc-ic { width: 34px; height: 34px; font-size: 0.9rem; }
.sm-loc-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.sm-loc-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sm-loc-meta { font-size: 0.7rem; opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sm-loc-hint { font-size: 0.68rem; color: var(--acc, #2563eb); }
.sm-loc-chev { flex: none; font-size: 0.7rem; opacity: 0.4; }

.sm-loc-panel { margin-top: 10px; border: 1px solid var(--acc, #2563eb); border-radius: var(--radius); overflow: hidden; }
.sm-loc-panel-head {
  display: flex; gap: 8px; align-items: center; padding: 9px 12px; font-size: 0.85rem;
  background: var(--acs, rgba(37,99,235,.07)); border-bottom: 1px solid var(--border);
}
.sm-loc-items { max-height: 300px; overflow-y: auto; padding: 6px 12px; }
.sm-loc-row {
  display: grid; grid-template-columns: auto minmax(120px, 1.4fr) minmax(140px, 1fr) auto;
  gap: 10px; align-items: center; padding: 4px 0; font-size: 0.82rem;
  border-bottom: 1px solid var(--bg);
}
.sm-loc-row:last-child { border-bottom: none; }
.sm-loc-row-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sm-loc-row-path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.72rem; opacity: 0.65; }
.sm-loc-row-actions { display: flex; gap: 4px; }

/* Search dropdown + modals */
.sm-search-drop {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 1200; max-height: 300px; overflow-y: auto;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: 0 6px 18px rgba(0,0,0,.15);
}
.sm-search-row {
  display: flex; gap: 8px; align-items: center; padding: 7px 10px; cursor: pointer;
  border-bottom: 1px solid var(--bg); font-size: 0.82rem;
}
.sm-search-row:hover { background: var(--summary-bg); }

.sm-modal {
  position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 2000;
  display: flex; align-items: center; justify-content: center;
}
.sm-modal-box {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 20px 22px; max-width: 520px; width: 92%; max-height: 85vh; overflow-y: auto;
}

.sm-scan-frame {
  position: absolute; inset: 12%; border: 2px solid rgba(255,255,255,.75); border-radius: 14px;
  pointer-events: none;
  mask: linear-gradient(#000 0 0);
}
</style>
