<script setup>
// Well plate → Opentrons OT-2 protocol.
//
// Everything a person decides lives in plate.ot2 (pipettes, deck, which liquid
// goes where, the steps after the plate is built) and is saved with the plate,
// so the next export of the same plate starts where the last one stopped. The
// Python itself is regenerated on every change by utils/opentronsExport and
// shown live; warnings name what the robot will refuse or what a person should
// check before pressing Run.
//
// The dialog is four tabs over one persistent rail: the deck map and the run
// summary stay in view whatever is being edited, because most decisions here
// are about where things sit and how much of what is needed.
import { computed, reactive, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useLabStore } from '../stores/labStore'
import OtDeckMap from './OtDeckMap.vue'
import {
  generateOpentronsProtocol, normalizeOt2Config, newOt2Step, plateDemands, wellNamesOf,
  labwareByName, targetLabwareOptions, defaultTargetLabware, sourceLabwareOptions, sampleLabwareOptions,
  columnLabwareOptions, columnPositions, tipRackOptions, opentronsFilename, fmtUl,
  OT2_PIPETTES, OT2_API_LEVELS, OT2_SLOTS, OT2_MODULES, OT2_STEP_TYPES,
} from '../utils/opentronsExport'

const props = defineProps({ plate: { type: Object, required: true }, initialTab: { type: String, default: 'steps' }, initialAction: { type: Number, default: 0 } })
const emit = defineEmits(['close'])
const store = useLabStore()

// The config is part of the plate, so it travels with Save / Publish / Library.
props.plate.ot2 = normalizeOt2Config(props.plate.ot2, props.plate)
const cfg = reactive(props.plate.ot2)
props.plate.ot2 = cfg

let saveTimer = null
watch(cfg, () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => store.saveWorkspaceState(), 600)
}, { deep: true })
onBeforeUnmount(() => { clearTimeout(saveTimer); store.saveWorkspaceState() })

// ── Generated protocol (live) ──
const result = computed(() => generateOpentronsProtocol(props.plate, cfg))
const summary = computed(() => result.value.summary)
const lineCount = computed(() => (result.value.code.match(/\n/g) || []).length)

// ── Tabs ──
const TABS = [
  { id: 'robot', label: 'Robot', icon: 'fa-eye-dropper' },
  { id: 'deck', label: 'Deck & liquids', icon: 'fa-table-cells' },
  { id: 'steps', label: 'Steps', icon: 'fa-list-ol' },
  { id: 'preview', label: 'Run preview', icon: 'fa-play' },
  { id: 'code', label: 'Python', icon: 'fa-code' },
]
const tab = ref(TABS.some(t => t.id === props.initialTab) ? props.initialTab : 'steps')

// ── Catalogue views ──
const pipetteChoices = [{ name: '', label: '— none —' }, ...OT2_PIPETTES]
const targetOptions = computed(() => targetLabwareOptions(props.plate.format, cfg.target.on))
const sourceOptions = sourceLabwareOptions()
const sampleOptions = sampleLabwareOptions()
const columnOptions = columnLabwareOptions()
const stepTypes = OT2_STEP_TYPES
const stepMeta = (type) => stepTypes.find(t => t.type === type) || { label: type, icon: 'fa-circle', help: '' }
const pipetteDef = (mount) => OT2_PIPETTES.find(p => p.name === cfg.pipettes[mount]) || null
const hasMulti = computed(() => ['left', 'right'].some(m => pipetteDef(m)?.channels === 8))
const hasSingle = computed(() => ['left', 'right'].some(m => pipetteDef(m)?.channels === 1))
// Mounts a step may be pinned to. The generator falls back to the other mount
// for whatever the chosen one cannot do (single wells for an 8-channel).
const pipetteMounts = computed(() => ['left', 'right'].filter(m => pipetteDef(m)).map(m => {
  const d = pipetteDef(m)
  return { mount: m, label: `${m} · ${d.label.replace(' Single-Channel', '').replace(' 8-Channel', ' ×8')} (${d.min}–${d.max} µL)` }
}))

// Changing where the plate sits changes which labware can hold it.
watch(() => cfg.target.on, (on) => {
  if (!targetLabwareOptions(props.plate.format, on).some(l => l.name === cfg.target.labware)) {
    cfg.target.labware = defaultTargetLabware(props.plate.format, on)
  }
})
watch(() => props.plate.format, (f) => { cfg.target.labware = defaultTargetLabware(f, cfg.target.on) })

// ── Liquids: everything the plate needs, with the position each one gets ──
const liquids = computed(() => {
  const byKey = new Map((summary.value?.sources || []).map(x => [x.key, x]))
  const rows = plateDemands(props.plate).map(d => {
    const s = byKey.get(d.key)
    return {
      key: d.key, name: d.name, code: d.code, stock: d.stock, unit: d.unit, isFill: d.isFill,
      linked: d.linked, unlinked: !!d.unlinked, wells: d.transfers.length, demandUl: d.totalUl,
      included: cfg.compounds[d.key]?.included !== false,
      rack: s?.rack || '', well: s?.well || '', loadUl: s?.loadUl, overCapacity: !!s?.overCapacity, columns: s?.columns || 0,
    }
  })
  for (const q of (summary.value?.sources || []).filter(x => x.isQuench)) rows.push({ ...q, included: true, isQuench: true })
  return rows
})
const positionOptions = computed(() => {
  const st = labwareByName(cfg.stocksLabware), bk = labwareByName(cfg.bulkLabware), cl = labwareByName(cfg.columnLabware)
  return [
    { value: '', label: 'auto' },
    ...(st ? wellNamesOf(st).map(w => ({ value: `stocks:${w}`, label: `Stocks ${w}` })) : []),
    ...(bk ? wellNamesOf(bk).map(w => ({ value: `bulk:${w}`, label: `Bulk ${w}` })) : []),
    ...(cl && hasMulti.value ? columnPositions(cl).map(w => ({ value: `reservoir:${w}`, label: `Reservoir ${cl.rows === 1 ? w : 'column ' + w.slice(1)} (8-ch)` })) : []),
  ]
})
const setLiquid = (key, patch) => { cfg.compounds[key] = { ...(cfg.compounds[key] || {}), ...patch } }
const rackShort = { stocks: 'stocks', bulk: 'bulk', reservoir: 'reservoir' }

// ── Deck map ── drawn by OtDeckMap from summary.deck

// ── Steps ──
const collapsed = reactive({})
const addStep = (type) => { const s = newOt2Step(type); cfg.steps.push(s); collapsed[s.id] = false }
const removeStep = (i) => { cfg.steps.splice(i, 1) }
const moveStep = (i, dir) => {
  const j = i + dir
  if (j < 0 || j >= cfg.steps.length) return
  const [s] = cfg.steps.splice(i, 1)
  cfg.steps.splice(j, 0, s)
}
const duplicateStep = (i) => { cfg.steps.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(cfg.steps[i])), id: newOt2Step(cfg.steps[i].type).id }) }
const addProfileRow = (s) => { s.profile.push({ temp: 72, seconds: 30 }) }
const v = (x) => (x === '' || x == null ? null : x)
const stepSummary = (s) => {
  switch (s.type) {
    case 'build': return [s.newTip === 'once' ? 'one tip per stock' : 'new tip per well', s.mode === 'distribute' ? 'distribute' : '', hasMulti.value ? (s.multi === 'off' ? '8-channel off' : '8-channel for matching columns') : '', Number(s.mixAfterReps) > 0 ? 'mix after' : ''].filter(Boolean).join(' · ')
    case 'thermocycler': return [s.lid !== 'leave' ? `lid ${s.lid}` : '', v(s.blockTemp) != null ? `block ${s.blockTemp} °C${Number(s.holdMinutes) > 0 ? ` for ${s.holdMinutes} min` : ''}` : '', v(s.lidTemp) != null ? `lid ${s.lidTemp} °C` : '', s.deactivate ? 'then off' : ''].filter(Boolean).join(' · ') || 'no change'
    case 'tc_profile': return `${(s.profile || []).map(p => `${p.temp} °C ${p.seconds} s`).join(' → ')} × ${s.cycles}`
    case 'temperature': return s.deactivate ? 'off' : `${s.temp} °C`
    case 'heater_shaker': return s.deactivate ? 'off' : [v(s.temp) != null ? `${s.temp} °C` : '', v(s.rpm) != null ? (Number(s.rpm) > 0 ? `${s.rpm} rpm` : 'stop shaking') : ''].filter(Boolean).join(' · ') || 'no change'
    case 'magnetic': return s.action === 'disengage' ? 'magnets down' : `magnets up${v(s.height) != null ? ` (${s.height} mm)` : ''}`
    case 'delay': return `${Number(s.minutes) || 0} min ${Number(s.seconds) || 0} s`
    case 'pause': return s.message || ''
    case 'mix': return `${s.wells || 'all'} · ${s.reps} × ${s.volume || 'auto'} µL`
    case 'sample': return `${s.volume} µL from ${s.wells || 'all'}${s.quenchName ? ` onto ${s.quenchUl} µL ${s.quenchName}` : ''}`
    case 'series': return `${s.count} × every ${s.intervalMinutes} min · ${s.volume} µL from ${s.wells || 'all'}${s.quenchName ? ` onto ${s.quenchUl} µL ${s.quenchName}` : ''}`
    case 'comment': return s.text || ''
    case 'custom': return `${(s.code || '').split('\n').filter(l => l.trim()).length} lines`
    default: return ''
  }
}

// ── Run preview ──
// The generator's action list, walked one action at a time. The deck map gets
// an overlay for the current action; the wells filled and the tips used so far
// are accumulated from every action before it, so scrubbing backwards is exact.
const actions = computed(() => result.value.actions || [])
const clearance = computed(() => result.value.clearance || [])
const clearanceOk = computed(() => clearance.value.filter(c => c.ok).length)
const cursor = ref(0)
const playing = ref(false)
const speed = ref(60)            // × real time, per action, clamped to something watchable
const current = computed(() => actions.value[cursor.value] || null)
watch(actions, (list) => { if (cursor.value > list.length - 1) cursor.value = Math.max(0, list.length - 1) })

const fmtClock = (sec) => {
  const s = Math.max(0, Math.round(sec || 0))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}
const KIND_ICON = { transfer: 'fa-eye-dropper', distribute: 'fa-eye-dropper', mix: 'fa-blender', tc: 'fa-temperature-half', temp: 'fa-snowflake', hs: 'fa-water', mag: 'fa-magnet', wait: 'fa-hourglass-half', pause: 'fa-hand', refill: 'fa-hand-holding', swap: 'fa-arrows-rotate', comment: 'fa-message', custom: 'fa-code' }
const kindIcon = (k) => KIND_ICON[k] || 'fa-circle'

// Everything the deck should show at the cursor.
const overlay = computed(() => {
  const list = actions.value
  const a = current.value
  if (!a) return null
  const filled = {}
  const spent = {}          // pipette var -> tips spent since its last refill
  for (let i = 0; i <= cursor.value; i++) {
    const x = list[i]
    if ((x.kind === 'transfer' || x.kind === 'distribute') && x.dst?.slot) {
      (filled[x.dst.slot] ||= new Set())
      for (const w of x.dst.wells) filled[x.dst.slot].add(w)
    }
    if (x.kind === 'refill' && x.pipette) spent[x.pipette] = 0
    if (x.kind === 'swap' && x.dst?.slot) filled[x.dst.slot] = new Set()   // a fresh sample plate
    if (x.tipsUsed && x.pipette) spent[x.pipette] = (spent[x.pipette] || 0) + x.tipsUsed
  }
  const tips = {}
  for (const p of summary.value?.pipettes || []) {
    let left = spent[p.var] || 0
    p.tipSlots.forEach(slot => { tips[slot] = { used: Math.min(p.perRack, Math.max(0, left)), columns: p.channels === 8 }; left -= p.perRack })
  }
  const st = a.state || {}
  const banner = a.userAction ? { kind: 'user', text: a.text }
    : a.kind === 'wait' ? { kind: 'wait', text: `${a.text} (${fmtClock(a.durationSec)})` }
    : null
  return {
    src: a.src?.slot ? { slot: a.src.slot, wells: a.src.wells } : null,
    dst: a.dst?.slot && a.dst.wells?.length ? { slot: a.dst.slot, wells: a.dst.wells } : (a.dst?.slot ? { slot: a.dst.slot, wells: [] } : null),
    filled: Object.fromEntries(Object.entries(filled).map(([k, v]) => [k, [...v]])),
    tips,
    modules: { tcLid: st.tcLid, tcBlock: st.tcBlock, tcLidTemp: st.tcLidTemp, temp: st.temp, hsTemp: st.hsTemp, hsRpm: st.hsRpm, mag: st.mag },
    banner,
  }
})

// Moving through the run.
const goTo = (i) => { cursor.value = Math.min(Math.max(0, i), Math.max(0, actions.value.length - 1)) }
const stepStart = (i) => { const a = actions.value[i]; if (!a) return 0; let k = i; while (k > 0 && actions.value[k - 1].step === a.step) k--; return k }
const restartStep = () => goTo(stepStart(cursor.value))
const nextUserAction = () => { const i = actions.value.findIndex((a, k) => k > cursor.value && a.userAction); if (i >= 0) goTo(i); else store.toast?.('No further action of yours in this run') }
const repeatStep = () => {
  const a = current.value
  if (!a?.stepId) return
  const i = cfg.steps.findIndex(s => s.id === a.stepId)
  if (i < 0) return
  duplicateStep(i)
  store.toast?.(`Step ${i + 1} will run again right after itself — see Steps`)
}
const stepLabel = (a) => a?.stepType === 'setup' ? 'Setup' : `Step ${a?.step}: ${stepMeta(a?.stepType).label}`

// Play: one action per tick, paced by its estimated duration; it stops on
// anything the person must do, like the robot would.
let timer = null
const pace = (a) => Math.min(2500, Math.max(350, ((a?.durationSec || 0) * 1000) / speed.value))
const tick = () => {
  timer = null
  if (!playing.value) return
  if (cursor.value >= actions.value.length - 1) { playing.value = false; return }
  cursor.value++
  if (current.value?.userAction) { playing.value = false; return }
  timer = setTimeout(tick, pace(current.value))
}
const togglePlay = () => {
  if (playing.value) { playing.value = false; return }
  if (cursor.value >= actions.value.length - 1) cursor.value = 0
  playing.value = true
  timer = setTimeout(tick, pace(current.value))
}
watch(playing, (on) => { if (!on && timer) { clearTimeout(timer); timer = null } })
watch(tab, (t) => { if (t !== 'preview') playing.value = false })

// Keep the active row in view.
const rowRefs = new Map()
const setRowRef = (i, el) => { if (el) rowRefs.set(i, el); else rowRefs.delete(i) }
// Keep the current row in view by scrolling the run log itself — scrollIntoView
// would also scroll the tab body and hide the controls.
watch(cursor, (i) => nextTick(() => {
  const el = rowRefs.get(i), list = el?.closest('.ot-pv-list')
  if (!el || !list) return
  const top = el.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop
  if (top < list.scrollTop + 40 || top + el.offsetHeight > list.scrollTop + list.clientHeight - 40) list.scrollTo({ top: Math.max(0, top - list.clientHeight / 2), behavior: 'smooth' })
}))

// Keyboard: arrows step, space plays, Home/End jump, U finds the next thing to do.
const onKey = (e) => {
  if (tab.value !== 'preview') return
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName)) return
  if (e.key === 'ArrowRight') { goTo(cursor.value + 1); e.preventDefault() }
  else if (e.key === 'ArrowLeft') { goTo(cursor.value - 1); e.preventDefault() }
  else if (e.key === 'Home') { goTo(0); e.preventDefault() }
  else if (e.key === 'End') { goTo(actions.value.length - 1); e.preventDefault() }
  else if (e.key === ' ') { togglePlay(); e.preventDefault() }
  else if (e.key === 'u' || e.key === 'U') nextUserAction()
}
onMounted(() => { window.addEventListener('keydown', onKey); if (props.initialAction) goTo(props.initialAction) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); playing.value = false })

const userActionCount = computed(() => actions.value.filter(a => a.userAction).length)

// ── Summary tiles ──
const fills = computed(() => (summary.value?.sources || []).filter(s => !s.isQuench).reduce((a, s) => a + s.wells, 0))
const columnsBy8 = computed(() => (summary.value?.sources || []).reduce((a, s) => a + (s.columns || 0), 0))
const hasSampling = computed(() => cfg.steps.some(s => s.type === 'sample' || s.type === 'series'))
const usesModule = (m) => !!summary.value?.modules?.[m]

// ── Output ──
const copied = ref(false)
const copyCode = async () => {
  try {
    await navigator.clipboard.writeText(result.value.code)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1800)
  } catch {
    store.toast?.('Could not copy — select the preview text and copy it by hand')
  }
}
const download = () => {
  const blob = new Blob([result.value.code], { type: 'text/x-python;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = opentronsFilename(props.plate, new Date().toISOString().slice(0, 10))
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
  const n = result.value.warnings.length
  store.toast?.(`Downloaded ${a.download}${n ? ` — ${n} thing${n === 1 ? '' : 's'} to check first` : ''}`)
}
</script>

<template>
  <!-- Teleported to <body>: inside a blurred card, position: fixed would be
       measured from the card, and the shell's dock and toolbar sit above 2000. -->
  <Teleport to="body">
  <div class="ot-overlay" @click.self="emit('close')">
    <div class="ot-modal">

      <!-- ── Header: what, tabs, close ── -->
      <header class="ot-head">
        <div class="ot-title">
          <span class="ot-title-ic"><i class="fas fa-robot"></i></span>
          <div>
            <div class="ot-title-name">{{ plate.name }}</div>
            <div class="ot-title-sub">OT-2 protocol · {{ plate.format }}-well · {{ lineCount }} lines</div>
          </div>
        </div>
        <nav class="ot-tabs">
          <button v-for="t in TABS" :key="t.id" class="ot-tab" :class="{ on: tab === t.id }" @click="tab = t.id">
            <i class="fas" :class="t.icon"></i> {{ t.label }}
            <span v-if="t.id === 'steps'" class="ot-tab-n">{{ cfg.steps.length }}</span>
            <span v-else-if="t.id === 'code' && result.warnings.length" class="ot-tab-n warn">{{ result.warnings.length }}</span>
          </button>
        </nav>
        <button class="ot-btn icon danger" @click="emit('close')" title="Close"><i class="fas fa-times"></i></button>
      </header>

      <div class="ot-body">
        <!-- ── Main: the active tab ── -->
        <main class="ot-main">

          <!-- Robot -->
          <div v-if="tab === 'robot'" class="ot-stack">
            <section class="ot-card">
              <h4><i class="fas fa-file-code"></i> Protocol</h4>
              <div class="ot-grid2">
                <label>Name <input type="text" v-model="cfg.protocolName" /></label>
                <label>Author <input type="text" v-model="cfg.author" placeholder="you" /></label>
              </div>
              <label>Description <input type="text" v-model="cfg.description" :placeholder="`Well plate ${plate.name}`" /></label>
              <div class="ot-grid2">
                <label title="Must not be newer than what your robot's software accepts. A Protocol Designer file from your OT-2 App shows the level it runs.">
                  apiLevel
                  <select v-model="cfg.apiLevel"><option v-for="l in OT2_API_LEVELS" :key="l" :value="l">{{ l }}</option></select>
                </label>
                <label title="Extra volume to load in every source beyond what the plate consumes, so the last well is not pipetted from an empty tube. Reservoir troughs need more than tubes.">
                  Headroom % <input type="number" min="0" max="200" step="5" v-model.number="cfg.headroomPct" />
                </label>
              </div>
            </section>

            <section class="ot-card">
              <h4><i class="fas fa-eye-dropper"></i> Pipettes</h4>
              <div class="ot-mounts">
                <div v-for="mount in ['left', 'right']" :key="mount" class="ot-mount" :class="{ empty: !cfg.pipettes[mount] }">
                  <div class="ot-mount-head">
                    <span class="ot-mount-name">{{ mount === 'left' ? 'Left' : 'Right' }} mount</span>
                    <template v-if="pipetteDef(mount)">
                      <span class="ot-chip">{{ pipetteDef(mount).min }}–{{ pipetteDef(mount).max }} µL</span>
                      <span class="ot-chip" :class="{ acc: pipetteDef(mount).channels === 8 }">{{ pipetteDef(mount).channels === 8 ? '8-channel' : 'single' }}</span>
                    </template>
                  </div>
                  <select v-model="cfg.pipettes[mount]">
                    <option v-for="p in pipetteChoices" :key="p.name" :value="p.name">{{ p.label }}{{ p.min ? ` · ${p.min}–${p.max} µL` : '' }}</option>
                  </select>
                  <div v-if="cfg.pipettes[mount]" class="ot-grid3" style="margin-top: 8px;">
                    <label>Tip rack
                      <select v-model="cfg.tipRacks[mount]">
                        <option value="">default</option>
                        <option v-for="t in tipRackOptions(cfg.pipettes[mount])" :key="t.name" :value="t.name">{{ t.label }}</option>
                      </select>
                    </label>
                    <label title="Empty = the pipette's default">Aspirate µL/s <input type="number" min="0" step="1" v-model="cfg.flowRates[mount].aspirate" placeholder="default" /></label>
                    <label title="Empty = the pipette's default">Dispense µL/s <input type="number" min="0" step="1" v-model="cfg.flowRates[mount].dispense" placeholder="default" /></label>
                  </div>
                </div>
              </div>
              <ul class="ot-rules">
                <li>Each volume goes to the smallest pipette that covers it in one stroke; a P20 and a P300 together cover 1–300 µL.</li>
                <li>An <strong>8-channel</strong> fills a whole column in one stroke wherever all eight wells get the same liquid at the same volume, drawing from the reservoir. Whole-column selections are also sampled and mixed eight at a time. Anything else goes to the single-channel.</li>
                <li v-if="hasMulti && !hasSingle" class="warn">Only an 8-channel is loaded: wells that are not whole matching columns cannot be pipetted. Add a single-channel on the other mount.</li>
              </ul>
            </section>
          </div>

          <!-- Deck & liquids -->
          <div v-else-if="tab === 'deck'" class="ot-stack">
            <section class="ot-card">
              <h4><i class="fas fa-border-all"></i> Plate</h4>
              <div class="ot-grid3">
                <label>Sits
                  <select v-model="cfg.target.on">
                    <option value="deck">on the deck</option>
                    <option value="thermocycler">on the Thermocycler</option>
                    <option value="temperature">on the Temperature Module</option>
                    <option value="heater_shaker">on the Heater-Shaker</option>
                  </select>
                </label>
                <label v-if="cfg.target.on === 'deck'">Slot
                  <select v-model="cfg.target.slot"><option v-for="s in OT2_SLOTS" :key="s" :value="s">{{ s }}</option></select>
                </label>
                <label v-else-if="cfg.target.on === 'thermocycler'">Model
                  <select v-model="cfg.modules.thermocycler"><option v-for="[m, l] in OT2_MODULES.thermocycler.models" :key="m" :value="m">{{ l }}</option></select>
                </label>
                <label v-else-if="cfg.target.on === 'temperature'">Slot
                  <select v-model="cfg.deck.temperature"><option v-for="s in OT2_SLOTS" :key="s" :value="s">{{ s }}</option></select>
                </label>
                <label v-else>Slot
                  <select v-model="cfg.deck.heaterShaker"><option v-for="s in OT2_MODULES.heater_shaker.slots" :key="s" :value="s">{{ s }}</option></select>
                </label>
                <label style="grid-column: span 3;">Labware
                  <select v-model="cfg.target.labware">
                    <option v-for="l in targetOptions" :key="l.name" :value="l.name">{{ l.label }}</option>
                  </select>
                </label>
              </div>
            </section>

            <section class="ot-card">
              <h4><i class="fas fa-vials"></i> Sources</h4>
              <div class="ot-src">
                <label>Stock tubes <select v-model="cfg.stocksLabware"><option v-for="l in sourceOptions" :key="l.name" :value="l.name">{{ l.label }}</option></select></label>
                <label>Slot <select v-model="cfg.deck.stocks"><option v-for="s in OT2_SLOTS" :key="s" :value="s">{{ s }}</option></select></label>
              </div>
              <div class="ot-src">
                <label title="Water and buffers: anything that does not fit a stock tube goes here by itself">Bulk liquids <select v-model="cfg.bulkLabware"><option v-for="l in sourceOptions" :key="l.name" :value="l.name">{{ l.label }}</option></select></label>
                <label>Slot <select v-model="cfg.deck.bulk"><option v-for="s in OT2_SLOTS" :key="s" :value="s">{{ s }}</option></select></label>
              </div>
              <div class="ot-src" v-if="hasMulti">
                <label title="Where the 8-channel draws from: a reservoir trough, or a column of an 8-row labware">8-channel reservoir <select v-model="cfg.columnLabware"><option v-for="l in columnOptions" :key="l.name" :value="l.name">{{ l.label }}</option></select></label>
                <label>Slot <select v-model="cfg.deck.column"><option v-for="s in OT2_SLOTS" :key="s" :value="s">{{ s }}</option></select></label>
              </div>
              <div class="ot-src" v-if="hasSampling">
                <label>Sample labware <select v-model="cfg.samplesLabware"><option v-for="l in sampleOptions" :key="l.name" :value="l.name">{{ l.label }}</option></select></label>
                <label>Slot <select v-model="cfg.deck.samples"><option v-for="s in OT2_SLOTS" :key="s" :value="s">{{ s }}</option></select></label>
              </div>
              <div class="ot-hint">Tip racks fill the free slots by themselves, as many as the tip count needs. Liquids are placed automatically; pin one to a position in the table below.</div>
            </section>

            <section v-if="(usesModule('temperature') && cfg.target.on !== 'temperature') || (usesModule('heaterShaker') && cfg.target.on !== 'heater_shaker') || (usesModule('thermocycler') && cfg.target.on !== 'thermocycler') || usesModule('magnetic')" class="ot-card">
              <h4><i class="fas fa-microchip"></i> Modules</h4>
              <div class="ot-src" v-if="usesModule('temperature') && cfg.target.on !== 'temperature'">
                <label>Temperature Module <select v-model="cfg.modules.temperature"><option v-for="[m, l] in OT2_MODULES.temperature.models" :key="m" :value="m">{{ l }}</option></select></label>
                <label>Slot <select v-model="cfg.deck.temperature"><option v-for="s in OT2_SLOTS" :key="s" :value="s">{{ s }}</option></select></label>
              </div>
              <div class="ot-src" v-if="usesModule('heaterShaker') && cfg.target.on !== 'heater_shaker'">
                <label>Heater-Shaker <select v-model="cfg.modules.heaterShaker"><option v-for="[m, l] in OT2_MODULES.heater_shaker.models" :key="m" :value="m">{{ l }}</option></select></label>
                <label>Slot <select v-model="cfg.deck.heaterShaker"><option v-for="s in OT2_MODULES.heater_shaker.slots" :key="s" :value="s">{{ s }}</option></select></label>
              </div>
              <div class="ot-src" v-if="usesModule('thermocycler') && cfg.target.on !== 'thermocycler'">
                <label>Thermocycler <select v-model="cfg.modules.thermocycler"><option v-for="[m, l] in OT2_MODULES.thermocycler.models" :key="m" :value="m">{{ l }}</option></select></label>
                <span class="ot-hint" style="align-self: end; margin: 0 0 8px;">slots 7, 8, 10, 11</span>
              </div>
              <div class="ot-src" v-if="usesModule('magnetic')">
                <label>Magnetic Module <select v-model="cfg.modules.magnetic"><option v-for="[m, l] in OT2_MODULES.magnetic.models" :key="m" :value="m">{{ l }}</option></select></label>
                <label>Slot <select v-model="cfg.deck.magnetic"><option v-for="s in OT2_SLOTS" :key="s" :value="s">{{ s }}</option></select></label>
              </div>
            </section>

            <section class="ot-card">
              <h4><i class="fas fa-droplet"></i> Liquids <span class="ot-muted">{{ liquids.filter(l => l.included).length }} of {{ liquids.length }} pipetted</span></h4>
              <div class="ot-liq-head"><span></span><span>Liquid</span><span>Wells</span><span>Load ≥</span><span>Position</span></div>
              <div v-for="l in liquids" :key="l.key" class="ot-liq" :class="{ off: !l.included }">
                <input type="checkbox" :checked="l.included" :disabled="l.isQuench" @change="setLiquid(l.key, { included: $event.target.checked })" />
                <span class="ot-liq-name" :title="l.name">
                  <i class="fas" :class="l.isFill ? 'fa-droplet' : l.isQuench ? 'fa-flask' : 'fa-tag'"></i>
                  {{ l.code ? `[${l.code}] ` : '' }}{{ l.name }}<span v-if="l.stock != null" class="ot-muted"> {{ l.stock }} {{ l.unit }}</span>
                  <span v-if="l.columns" class="ot-chip acc" :title="`${l.columns} column${l.columns === 1 ? '' : 's'} go in one stroke each with the 8-channel`">×8 · {{ l.columns }} col</span>
                  <i v-if="l.unlinked" class="fas fa-link-slash ot-warn-ic" title="No inventory chip — the volume is real; you assign its tube"></i>
                </span>
                <span class="ot-muted">{{ l.isQuench ? 'samples' : l.wells }}</span>
                <span :class="{ 'ot-red': l.overCapacity }" :title="l.overCapacity ? 'Does not fit one position of that labware' : `${fmtUl(l.demandUl)} consumed`">{{ l.included && l.loadUl ? fmtUl(l.loadUl) : '—' }}</span>
                <select :value="cfg.compounds[l.key]?.position || ''" @change="setLiquid(l.key, { position: $event.target.value })" :disabled="!l.included" :title="l.rack ? `Now: ${l.rack} ${l.well}` : ''">
                  <option v-for="o in positionOptions" :key="o.value" :value="o.value">{{ o.value === '' ? (l.rack ? `auto → ${rackShort[l.rack]} ${l.well}` : 'auto') : o.label }}</option>
                </select>
              </div>
              <div v-if="!liquids.length" class="ot-hint">This plate has no volumes to pipette.</div>
            </section>
          </div>

          <!-- Steps -->
          <div v-else-if="tab === 'steps'" class="ot-stack">
            <section class="ot-card">
              <h4><i class="fas fa-list-ol"></i> Steps <span class="ot-muted">run top to bottom</span></h4>

              <div class="ot-tl">
                <div v-for="(s, i) in cfg.steps" :key="s.id" class="ot-step" :class="{ open: !collapsed[s.id] }">
                  <div class="ot-step-head" @click="collapsed[s.id] = !collapsed[s.id]">
                    <span class="ot-step-n">{{ i + 1 }}</span>
                    <i class="fas ot-step-ic" :class="stepMeta(s.type).icon"></i>
                    <span class="ot-step-title">{{ stepMeta(s.type).label }}</span>
                    <span class="ot-step-sum">{{ stepSummary(s) }}</span>
                    <span class="ot-step-tools" @click.stop>
                      <button class="ot-mini" @click="moveStep(i, -1)" :disabled="i === 0" title="Move up"><i class="fas fa-chevron-up"></i></button>
                      <button class="ot-mini" @click="moveStep(i, 1)" :disabled="i === cfg.steps.length - 1" title="Move down"><i class="fas fa-chevron-down"></i></button>
                      <button class="ot-mini" @click="duplicateStep(i)" title="Duplicate"><i class="fas fa-copy"></i></button>
                      <button class="ot-mini danger" @click="removeStep(i)" title="Remove"><i class="fas fa-times"></i></button>
                    </span>
                  </div>

                  <div v-if="!collapsed[s.id]" class="ot-step-body">
                    <div class="ot-hint" style="margin: 0 0 8px;">{{ stepMeta(s.type).help }}</div>

                    <!-- Build plate -->
                    <template v-if="s.type === 'build'">
                      <div class="ot-grid4">
                        <label>Pipette
                          <select v-model="s.pipette"><option value="auto">by volume</option><option v-for="m in pipetteMounts" :key="m.mount" :value="m.mount">{{ m.label }}</option></select>
                        </label>
                        <label v-if="hasMulti" title="Whole columns where all eight wells get the same liquid at the same volume are one 8-channel stroke each">8-channel
                          <select v-model="s.multi"><option value="auto">for matching columns</option><option value="off">off</option></select>
                        </label>
                        <label title="A new tip for every well is safest. One tip per stock is faster but the tip re-enters the stock after each well — fine for water, risky for reactive components.">Tips
                          <select v-model="s.newTip"><option value="always">new tip per well</option><option value="once">one tip per stock</option></select>
                        </label>
                        <label title="Transfer: aspirate once per well. Distribute: fill the tip once and dispense into several wells (faster, no mixing in the wells).">Mode
                          <select v-model="s.mode"><option value="transfer">transfer</option><option value="distribute">distribute</option></select>
                        </label>
                      </div>
                      <div class="ot-grid4">
                        <label>Mix after ×<input type="number" min="0" step="1" v-model="s.mixAfterReps" placeholder="0" /></label>
                        <label>Mix µL<input type="number" min="0" step="1" v-model="s.mixAfterUl" placeholder="auto" /></label>
                        <label>Air gap µL<input type="number" min="0" step="0.5" v-model="s.airGapUl" placeholder="0" /></label>
                        <label class="ot-checks"><span><input type="checkbox" v-model="s.blowOut" /> blow out</span><span><input type="checkbox" v-model="s.touchTip" /> touch tip</span></label>
                      </div>
                    </template>

                    <!-- Thermocycler state -->
                    <template v-else-if="s.type === 'thermocycler'">
                      <div class="ot-grid4">
                        <label>Lid <select v-model="s.lid"><option value="leave">leave as is</option><option value="close">close</option><option value="open">open</option></select></label>
                        <label>Block °C <input type="number" step="0.5" v-model="s.blockTemp" placeholder="leave" /></label>
                        <label title="The protocol waits here until the hold is over">Hold min <input type="number" min="0" step="1" v-model="s.holdMinutes" placeholder="no hold" /></label>
                        <label>Lid °C <input type="number" step="1" v-model="s.lidTemp" placeholder="leave" /></label>
                      </div>
                      <label class="ot-checks"><span><input type="checkbox" v-model="s.deactivate" /> switch block and lid off afterwards</span></label>
                      <div class="ot-hint">Block {{ OT2_MODULES.thermocycler.blockMin }}–{{ OT2_MODULES.thermocycler.blockMax }} °C, lid {{ OT2_MODULES.thermocycler.lidMin }}–{{ OT2_MODULES.thermocycler.lidMax }} °C. Without a hold the protocol continues as soon as the temperature is reached — add a Wait to incubate.</div>
                    </template>

                    <!-- Thermocycler profile -->
                    <template v-else-if="s.type === 'tc_profile'">
                      <div v-for="(p, pi) in s.profile" :key="pi" class="ot-grid4 ot-prof">
                        <label>Step {{ pi + 1 }} °C <input type="number" step="0.5" v-model="p.temp" /></label>
                        <label>Seconds <input type="number" min="0" step="1" v-model="p.seconds" /></label>
                        <span></span>
                        <button class="ot-mini danger" @click="s.profile.splice(pi, 1)" :disabled="s.profile.length <= 1" title="Remove"><i class="fas fa-times"></i></button>
                      </div>
                      <button class="ot-btn small" @click="addProfileRow(s)"><i class="fas fa-plus"></i> Add temperature step</button>
                      <div class="ot-grid4" style="margin-top: 8px;">
                        <label>Repetitions <input type="number" min="1" step="1" v-model="s.cycles" /></label>
                        <label>Lid °C <input type="number" step="1" v-model="s.lidTemp" placeholder="leave" /></label>
                        <label title="Volume per well, for the ramp calculation — defaults to the plate's well volume">Block max µL <input type="number" min="0" v-model="s.blockMaxUl" :placeholder="plate.targetVolume ? String(plate.targetVolume) : '—'" /></label>
                        <label title="Hold at this temperature when the profile is done (e.g. 4 °C)">Then hold °C <input type="number" step="0.5" v-model="s.finalTemp" placeholder="none" /></label>
                      </div>
                    </template>

                    <!-- Temperature module -->
                    <template v-else-if="s.type === 'temperature'">
                      <div class="ot-grid4">
                        <label>Target °C <input type="number" step="0.5" v-model="s.temp" :disabled="s.deactivate" /></label>
                        <label class="ot-checks"><span><input type="checkbox" v-model="s.deactivate" /> switch off</span></label>
                      </div>
                      <div class="ot-hint">{{ OT2_MODULES.temperature.min }}–{{ OT2_MODULES.temperature.max }} °C. The protocol waits until the temperature is reached.</div>
                    </template>

                    <!-- Heater-Shaker -->
                    <template v-else-if="s.type === 'heater_shaker'">
                      <div class="ot-grid4">
                        <label>°C <input type="number" step="0.5" v-model="s.temp" placeholder="leave" :disabled="s.deactivate" /></label>
                        <label title="0 stops shaking; empty leaves it as it is">rpm <input type="number" min="0" step="50" v-model="s.rpm" placeholder="leave" :disabled="s.deactivate" /></label>
                        <label class="ot-checks"><span><input type="checkbox" v-model="s.deactivate" /> heater and shaker off</span></label>
                      </div>
                      <div class="ot-hint">Up to {{ OT2_MODULES.heater_shaker.max }} °C (no cooling), {{ OT2_MODULES.heater_shaker.rpmMin }}–{{ OT2_MODULES.heater_shaker.rpmMax }} rpm. Shaking is stopped automatically around any pipetting and restarted afterwards.</div>
                    </template>

                    <!-- Magnetic -->
                    <template v-else-if="s.type === 'magnetic'">
                      <div class="ot-grid4">
                        <label>Action <select v-model="s.action"><option value="engage">engage</option><option value="disengage">disengage</option></select></label>
                        <label v-if="s.action === 'engage'" title="Height above the labware base; empty uses the labware's default">Height mm <input type="number" step="0.5" v-model="s.height" placeholder="default" /></label>
                      </div>
                    </template>

                    <!-- Wait -->
                    <template v-else-if="s.type === 'delay'">
                      <div class="ot-grid4">
                        <label>Minutes <input type="number" min="0" step="1" v-model="s.minutes" /></label>
                        <label>Seconds <input type="number" min="0" step="1" v-model="s.seconds" /></label>
                        <label style="grid-column: span 2;">Shown in the app <input type="text" v-model="s.message" placeholder="incubating…" /></label>
                      </div>
                    </template>

                    <!-- Pause -->
                    <template v-else-if="s.type === 'pause'">
                      <label>Message <input type="text" v-model="s.message" placeholder="Continue when ready" /></label>
                    </template>

                    <!-- Mix -->
                    <template v-else-if="s.type === 'mix'">
                      <div class="ot-grid4">
                        <label style="grid-column: span 2;">Wells <input type="text" v-model="s.wells" placeholder="all, or A1 B2 C1-C6" /></label>
                        <label>Repetitions <input type="number" min="1" step="1" v-model="s.reps" /></label>
                        <label>µL <input type="number" min="0" step="1" v-model="s.volume" placeholder="auto" /></label>
                      </div>
                      <div class="ot-grid4">
                        <label>Pipette <select v-model="s.pipette"><option value="auto">by volume</option><option v-for="m in pipetteMounts" :key="m.mount" :value="m.mount">{{ m.label }}</option></select></label>
                        <label>Tips <select v-model="s.newTip"><option value="always">new tip per well</option><option value="once">one tip for all</option></select></label>
                      </div>
                      <div v-if="hasMulti" class="ot-hint">Whole columns (A1-H1, or A1-H3) are mixed eight wells at a time with the 8-channel.</div>
                    </template>

                    <!-- Take samples / series -->
                    <template v-else-if="s.type === 'sample' || s.type === 'series'">
                      <div v-if="s.type === 'series'" class="ot-grid4">
                        <label>Time points <input type="number" min="1" step="1" v-model="s.count" /></label>
                        <label>Every … min <input type="number" min="0" step="1" v-model="s.intervalMinutes" /></label>
                        <label class="ot-checks" style="grid-column: span 2;"><span><input type="checkbox" v-model="s.firstAtZero" /> first sample right away (t = 0)</span></label>
                        <label title="The robot pauses before every Nth time point so you can top up the quench, swap tubes, check the plate — 0 = never">Pause every … time points <input type="number" min="0" step="1" v-model.number="s.pauseEvery" /></label>
                        <label style="grid-column: span 2;">Pause message <input type="text" v-model="s.pauseMessage" :disabled="!s.pauseEvery" placeholder="Top up the quench, check the plate …" /></label>
                      </div>
                      <div class="ot-grid4">
                        <label style="grid-column: span 2;">From wells <input type="text" v-model="s.wells" placeholder="all, or A1-H1" /></label>
                        <label>Sample µL <input type="number" min="0" step="0.5" v-model="s.volume" /></label>
                        <label>Pipette <select v-model="s.pipette"><option value="auto">by volume</option><option v-for="m in pipetteMounts" :key="m.mount" :value="m.mount">{{ m.label }}</option></select></label>
                      </div>
                      <div class="ot-grid4">
                        <label>Tips <select v-model="s.newTip"><option value="always">new tip per well</option><option value="once">one tip per time point</option></select></label>
                        <label>Mix before ×<input type="number" min="0" step="1" v-model="s.mixBeforeReps" placeholder="0" /></label>
                        <label>Mix µL <input type="number" min="0" step="1" v-model="s.mixBeforeUl" placeholder="auto" /></label>
                        <span></span>
                      </div>
                      <div class="ot-grid4">
                        <label style="grid-column: span 2;" title="Put into each sample well BEFORE the sample, from its own tube (e.g. acid to stop a reaction). Empty = none.">Quench liquid <input type="text" v-model="s.quenchName" placeholder="none" /></label>
                        <label>Quench µL <input type="number" min="0" step="1" v-model="s.quenchUl" :disabled="!s.quenchName" /></label>
                      </div>
                      <div class="ot-hint">
                        Samples go into the sample labware column by column, each time point into the next free wells; when the plate is full the robot pauses for a fresh one<template v-if="summary"> — {{ summary.sampleWellsUsed }} wells over {{ summary.samplePlates || 1 }} plate{{ summary.samplePlates > 1 ? 's' : '' }}{{ summary.sampleSwaps ? `, ${summary.sampleSwaps} plate change${summary.sampleSwaps === 1 ? '' : 's'} scheduled` : '' }}</template>.
                        <template v-if="hasMulti"> Whole columns (A1-H1, A1-H2, …) are taken eight at a time with the 8-channel, one sample column per plate column.</template>
                        <template v-if="s.type === 'series'"> Intervals are measured from the start of the series, so the time sampling takes does not drift them.</template>
                      </div>
                    </template>

                    <!-- Comment -->
                    <template v-else-if="s.type === 'comment'">
                      <label>Text <input type="text" v-model="s.text" /></label>
                    </template>

                    <!-- Custom Python -->
                    <template v-else-if="s.type === 'custom'">
                      <textarea v-model="s.code" class="ot-code" rows="6" spellcheck="false" placeholder="protocol.comment(&quot;hello&quot;)&#10;p20.transfer(5, stocks[&quot;A1&quot;], plate[&quot;A1&quot;])"></textarea>
                      <div class="ot-hint">In scope: <code>protocol</code>, <code>plate</code>, <code>stocks</code>, <code>bulk</code>, <code>reservoir</code>, <code>samples</code>, the pipettes (<code v-for="p in summary?.pipettes || []" :key="p.var">{{ p.var }} </code>) and any module (<code>tc</code>, <code>temp_mod</code>, <code>hs</code>, <code>mag</code>). Indented into <code>run()</code> as written.</div>
                    </template>
                  </div>
                </div>
              </div>

              <div class="ot-add">
                <div class="ot-add-title">Add a step</div>
                <div class="ot-addgrid">
                  <button v-for="t in stepTypes" :key="t.type" class="ot-addbtn" @click="addStep(t.type)" :title="t.help">
                    <i class="fas" :class="t.icon"></i><span>{{ t.label }}</span>
                  </button>
                </div>
              </div>
            </section>
          </div>

          <!-- Run preview -->
          <div v-else-if="tab === 'preview'" class="ot-stack ot-previewtab">
            <section class="ot-card ot-pv-controls">
              <div class="ot-pv-row">
                <button class="ot-btn icon" @click="goTo(0)" :disabled="!actions.length || cursor === 0" title="First action (Home)"><i class="fas fa-backward-fast"></i></button>
                <button class="ot-btn icon" @click="goTo(cursor - 1)" :disabled="cursor === 0" title="Previous action (←)"><i class="fas fa-backward-step"></i></button>
                <button class="ot-btn primary" @click="togglePlay" :disabled="!actions.length" :title="playing ? 'Pause (space)' : current?.userAction ? 'Carry on after this stop (space)' : 'Play (space) — stops wherever you must do something'">
                  <i class="fas" :class="playing ? 'fa-pause' : 'fa-play'"></i> {{ playing ? 'Pause' : current?.userAction && cursor < actions.length - 1 ? 'Resume' : 'Play' }}
                </button>
                <button class="ot-btn icon" @click="goTo(cursor + 1)" :disabled="cursor >= actions.length - 1" title="Next action (→)"><i class="fas fa-forward-step"></i></button>
                <button class="ot-btn icon" @click="goTo(actions.length - 1)" :disabled="!actions.length || cursor >= actions.length - 1" title="Last action (End)"><i class="fas fa-forward-fast"></i></button>
                <label class="ot-pv-speed">speed
                  <select v-model.number="speed"><option :value="10">10×</option><option :value="60">60×</option><option :value="600">600×</option><option :value="6000">6000×</option></select>
                </label>
                <span class="ot-pv-spacer"></span>
                <button class="ot-btn" @click="nextUserAction" :disabled="!userActionCount" title="Jump to the next point where you must do something (U)"><i class="fas fa-hand"></i> Next: your turn <span v-if="userActionCount" class="ot-chip">{{ userActionCount }}</span></button>
                <button class="ot-btn" @click="restartStep" :disabled="!current" title="Go back to the start of this step and watch it again"><i class="fas fa-rotate-left"></i> Restart step</button>
                <button class="ot-btn" @click="repeatStep" :disabled="!current?.stepId" title="Add a copy of this step right after it, so the robot does it again"><i class="fas fa-repeat"></i> Repeat step in protocol</button>
              </div>
              <div v-if="current" class="ot-pv-now" :class="{ user: current.userAction, wait: current.kind === 'wait' }">
                <i class="fas ot-pv-ic" :class="kindIcon(current.kind)"></i>
                <div class="ot-pv-text">
                  <div class="ot-pv-title">{{ current.text }}</div>
                  <div class="ot-pv-sub">
                    {{ stepLabel(current) }} · action {{ cursor + 1 }} of {{ actions.length }} · t = {{ fmtClock(current.clockSec) }}<template v-if="current.durationSec"> · ~{{ fmtClock(current.durationSec) }}</template>
                    <template v-if="current.pipette"> · {{ current.pipette }}<template v-if="current.tipsUsed"> · {{ current.tipsUsed }} tip{{ current.tipsUsed === 1 ? '' : 's' }}</template></template>
                    <template v-if="current.count"> · {{ current.count }} well{{ current.count === 1 ? '' : 's' }}</template>
                  </div>
                  <div v-if="current.userAction" class="ot-pv-hint">The robot stops here until someone presses Resume in the Opentrons App. Press Resume above (or space) to carry on with the preview.</div>
                </div>
                <div class="ot-pv-state">
                  <span v-for="p in summary?.pipettes || []" :key="p.var" class="ot-chip" :title="`${p.name}: tips left in its racks`">{{ p.var }} · {{ current.state?.tipsLeft?.[p.var] ?? '–' }} {{ p.channels === 8 ? 'col' : 'tips' }}</span>
                  <span v-if="summary?.modules?.thermocycler" class="ot-chip">TC {{ current.state?.tcLid }}{{ current.state?.tcBlock != null ? ` · ${current.state.tcBlock} °C` : '' }}</span>
                  <span v-if="summary?.modules?.temperature" class="ot-chip">temp {{ current.state?.temp != null ? current.state.temp + ' °C' : 'idle' }}</span>
                  <span v-if="summary?.modules?.heaterShaker" class="ot-chip">HS {{ current.state?.hsTemp != null ? current.state.hsTemp + ' °C' : '' }}{{ current.state?.hsRpm ? ` ${current.state.hsRpm} rpm` : (current.state?.hsTemp != null ? '' : 'idle') }}</span>
                  <span v-if="summary?.modules?.magnetic" class="ot-chip">magnets {{ current.state?.mag }}</span>
                </div>
              </div>
              <div v-else class="ot-hint">Nothing to preview yet — add a Build plate step.</div>
            </section>

            <section class="ot-card ot-pv-clear">
              <h4><i class="fas fa-clipboard-check"></i> Run clearance <span class="ot-muted">{{ clearanceOk }} of {{ clearance.length }} checks clear · what the Opentrons App's analysis would refuse, plus what only this side can know</span></h4>
              <ul class="ot-clear-list">
                <li v-for="c in clearance" :key="c.id" :class="c.ok ? 'ok' : 'bad'">
                  <i class="fas" :class="c.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'"></i>
                  <b>{{ c.label }}</b>
                  <span class="ot-clear-info">{{ c.info }}</span>
                  <div v-for="(n, i) in c.notes" :key="i" class="ot-clear-note">{{ n }}</div>
                </li>
              </ul>
            </section>

            <section class="ot-card ot-pv-listcard">
              <h4><i class="fas fa-list-check"></i> Run log <span class="ot-muted">{{ actions.length }} actions · est. {{ fmtClock(summary?.runSec) }} · click a row to jump there · ← → keys step</span></h4>
              <div class="ot-pv-list">
                <template v-for="(a, i) in actions" :key="a.id">
                  <div v-if="i === 0 || a.step !== actions[i - 1].step" class="ot-pv-step">{{ stepLabel(a) }}</div>
                  <div class="ot-pv-item" :class="{ on: i === cursor, done: i < cursor, user: a.userAction, wait: a.kind === 'wait' }" :ref="el => setRowRef(i, el)" @click="goTo(i)">
                    <span class="ot-pv-t">{{ fmtClock(a.clockSec) }}</span>
                    <i class="fas" :class="kindIcon(a.kind)"></i>
                    <span class="ot-pv-txt">{{ a.text }}</span>
                    <span v-if="a.userAction" class="ot-pv-tag">your turn</span>
                    <span v-else-if="a.durationSec >= 60" class="ot-pv-dur">{{ fmtClock(a.durationSec) }}</span>
                  </div>
                </template>
              </div>
            </section>
          </div>

          <!-- Python -->
          <div v-else class="ot-stack ot-codetab">
            <section v-if="result.warnings.length" class="ot-card ot-warnings">
              <h4><i class="fas fa-triangle-exclamation"></i> Check before running <span class="ot-muted">{{ result.warnings.length }}</span></h4>
              <ul><li v-for="w in result.warnings" :key="w">{{ w }}</li></ul>
            </section>
            <section v-else-if="result.code" class="ot-card ot-ok">
              <i class="fas fa-circle-check"></i> Nothing to flag. Simulate it once with <code>opentrons_simulate</code> or the Opentrons App before the first real run.
            </section>
            <section class="ot-card ot-codecard">
              <h4><i class="fas fa-code"></i> Python <span class="ot-muted">{{ lineCount }} lines · regenerated on every change</span></h4>
              <pre class="ot-preview">{{ result.code || '# nothing to export' }}</pre>
            </section>
          </div>
        </main>

        <!-- ── Rail: the deck and the run at a glance ── -->
        <aside class="ot-rail">
          <div class="ot-rail-title">Deck <span class="ot-rail-sub">front of the robot is at the bottom</span></div>
          <OtDeckMap :deck="summary?.deck || []" :overlay="tab === 'preview' ? overlay : null" />
          <div v-if="tab === 'preview'" class="ot-legend">
            <span><i class="source"></i>drawing from</span><span><i class="plate"></i>dispensing into</span><span><i class="filledw"></i>filled so far</span><span><i class="usedtip"></i>tips used</span>
          </div>
          <div v-else class="ot-legend">
            <span><i class="plate"></i>plate</span><span><i class="source"></i>liquids</span><span><i class="samples"></i>samples</span><span><i class="module"></i>modules</span><span><i class="tips"></i>tips</span>
          </div>

          <div class="ot-rail-title">This run</div>
          <div class="ot-tiles">
            <div class="ot-tile"><b>{{ fills }}</b><span>well fills</span></div>
            <div class="ot-tile" :class="{ dim: !columnsBy8 }"><b>{{ columnsBy8 }}</b><span>columns ×8</span></div>
            <div v-for="p in summary?.pipettes || []" :key="p.var" class="ot-tile" :title="`${p.tipsNeeded} ${p.channels === 8 ? 'tip columns' : 'tips'} in ${p.tipSlots.length} rack${p.tipSlots.length === 1 ? '' : 's'}`">
              <b>{{ p.tipsNeeded }}</b><span>{{ p.channels === 8 ? 'columns' : 'tips' }} · {{ p.var }}</span>
            </div>
            <div v-if="hasSampling" class="ot-tile" :title="summary?.sampleSwaps ? `${summary.sampleSwaps} sample-plate change${summary.sampleSwaps === 1 ? '' : 's'} scheduled` : 'sample wells used on the sample labware'"><b>{{ summary?.sampleWellsUsed ?? 0 }}<small v-if="(summary?.samplePlates || 0) <= 1">/{{ summary?.sampleCapacity ?? 0 }}</small></b><span>sample wells<template v-if="summary?.samplePlates > 1"> · {{ summary.samplePlates }} plates</template></span></div>
            <div class="ot-tile" title="Rough estimate from typical OT-2 speeds plus every wait"><b>{{ fmtClock(summary?.runSec) }}</b><span>est. run time<template v-if="userActionCount"> · {{ userActionCount }}× your turn</template></span></div>
          </div>

          <button v-if="result.warnings.length" class="ot-warnpill" @click="tab = 'code'">
            <i class="fas fa-triangle-exclamation"></i> {{ result.warnings.length }} thing{{ result.warnings.length === 1 ? '' : 's' }} to check
          </button>
          <div v-else class="ot-okpill"><i class="fas fa-circle-check"></i> nothing to flag</div>
        </aside>
      </div>

      <!-- ── Footer: the way out ── -->
      <footer class="ot-foot">
        <span class="ot-foot-note">Upload the .py in the Opentrons App; the header lists what to load where.</span>
        <div class="ot-actions">
          <button class="ot-btn" @click="copyCode" :title="copied ? 'Copied' : 'Copy the Python to the clipboard'">
            <i class="fas" :class="copied ? 'fa-check' : 'fa-copy'"></i> {{ copied ? 'Copied' : 'Copy' }}
          </button>
          <button class="ot-btn primary" @click="download" title="Download the .py file">
            <i class="fas fa-download"></i> Download .py
          </button>
        </div>
      </footer>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
.ot-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; z-index: 12000; padding: 14px; font-size: 14px; line-height: 1.4; }
.ot-modal {
  width: min(1360px, 100%); height: min(94vh, 1020px);
  background: var(--modal, var(--surface)); color: var(--tx, inherit);
  border: 1px solid var(--ln2); border-radius: var(--r, 14px); box-shadow: var(--sh);
  display: flex; flex-direction: column; overflow: hidden;
}

/* Header */
.ot-head { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--ln2); }
.ot-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
.ot-title > div { min-width: 0; }   /* lets a long plate name clip instead of running under the tabs */
.ot-title-ic { width: 34px; height: 34px; border-radius: 10px; background: var(--acc); color: #fff; display: flex; align-items: center; justify-content: center; flex: none; box-shadow: 0 3px 10px var(--acsh); }
.ot-title-name { font-weight: 700; font-size: .95rem; color: var(--tx); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ot-title-sub { font-size: .7rem; color: var(--tx2); }
.ot-tabs { display: flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--fl); }
.ot-tab { height: 30px; padding: 0 12px; border-radius: 8px; border: none; background: transparent; color: var(--tx2); font-size: .76rem; font-weight: 600; display: inline-flex; align-items: center; gap: 7px; cursor: pointer; box-shadow: none; }
.ot-tab:hover { color: var(--tx); filter: none; }
.ot-tab.on { background: var(--cd); color: var(--acc); box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.ot-tab-n { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--acs); color: var(--acc); font-size: .66rem; display: inline-flex; align-items: center; justify-content: center; }
.ot-tab-n.warn { background: rgba(217,119,6,.15); color: #b45309; }
.ot-head > .ot-btn { justify-self: end; }

/* Body: main + rail */
.ot-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 340px; }
.ot-main { overflow-y: auto; padding: 14px 16px; min-width: 0; }
.ot-rail { overflow-y: auto; padding: 14px; border-left: 1px solid var(--ln2); background: var(--fl); display: flex; flex-direction: column; gap: 10px; }
.ot-rail-sub { font-weight: 500; letter-spacing: 0; text-transform: none; color: var(--tx3); margin-left: 4px; }
.ot-rail-title { font-size: .66rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--tx3); }
.ot-stack { display: flex; flex-direction: column; gap: 12px; }
.ot-card { border: 1px solid var(--ln2); border-radius: var(--rc, 10px); background: var(--cd); padding: 12px 14px; }
.ot-card h4 { margin: 0 0 10px; font-size: .8rem; display: flex; align-items: center; gap: 7px; color: var(--tx); }
.ot-card h4 i { color: var(--primary); width: 14px; }
.ot-muted { font-size: .72rem; color: var(--tx2); font-weight: 400; }

/* Fields */
.ot-card label { display: block; font-size: .7rem; font-weight: 600; color: var(--tx2); margin-bottom: 8px; }
.ot-card label input[type="text"], .ot-card label input[type="number"], .ot-card label select, .ot-mount > select { display: block; width: 100%; margin-top: 3px; padding: 6px 8px; font-size: .78rem; font-weight: 400; }
.ot-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ot-grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
.ot-grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.ot-src { display: grid; grid-template-columns: 1fr 90px; gap: 10px; }
.ot-hint { font-size: .7rem; color: var(--tx2); margin: 4px 0 8px; line-height: 1.45; }
.ot-hint code, .ot-ok code { font-size: .68rem; background: var(--fl); padding: 0 4px; border-radius: 4px; color: var(--tx); }
/* Checkbox groups sit on the input row of the grid they share with text
   fields: same height as an input, bottom-aligned, so the boxes line up with
   the fields beside them instead of with their captions. (Specificity matches
   the generic card label rule above, which would otherwise win.) */
.ot-card label.ot-checks { display: flex; align-items: center; gap: 16px; align-self: end; height: 34px; margin-bottom: 8px; font-weight: 500; color: var(--tx); }
.ot-card label.ot-checks span { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.ot-card label.ot-checks input { width: 14px; height: 14px; margin: 0; }
.ot-chip { display: inline-flex; align-items: center; height: 18px; padding: 0 7px; border-radius: 9px; background: var(--fl); color: var(--tx2); font-size: .64rem; font-weight: 700; white-space: nowrap; }
.ot-chip.acc { background: var(--acs); color: var(--acc); }

/* Pipette mounts */
.ot-mounts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ot-mount { border: 1px solid var(--ln2); border-radius: var(--rc, 10px); padding: 10px 12px; background: var(--fl); }
.ot-mount.empty { border-style: dashed; }
.ot-mount-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.ot-mount-name { font-size: .74rem; font-weight: 700; color: var(--tx); flex: 1; }
.ot-rules { margin: 10px 0 0; padding-left: 18px; font-size: .72rem; color: var(--tx2); line-height: 1.5; }
.ot-rules li.warn { color: #b45309; }

/* Buttons echo the plate toolbar: one height, one radius, one filled action. */
.ot-btn {
  height: 32px; padding: 0 13px; border-radius: 9px; font-size: .76rem; font-weight: 600; line-height: 1; white-space: nowrap;
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  background: var(--btn2, rgba(0,0,0,.05)); color: var(--tx, inherit); border: 1px solid var(--ln2); box-shadow: none; cursor: pointer;
}
.ot-btn:hover:not(:disabled) { filter: brightness(1.06); }
.ot-btn.primary { background: var(--acc, #2563eb); border-color: transparent; color: #fff; box-shadow: 0 3px 10px var(--acsh); }
.ot-btn.icon { width: 32px; padding: 0; }
.ot-btn.small { height: 26px; font-size: .7rem; padding: 0 9px; }
.ot-btn.danger:hover { background: var(--danger-color); border-color: transparent; color: #fff; filter: none; }
.ot-mini { width: 24px; height: 24px; padding: 0; border-radius: 6px; background: transparent; color: var(--tx2); border: 1px solid transparent; box-shadow: none; font-size: .7rem; cursor: pointer; }
.ot-mini:hover:not(:disabled) { background: var(--fl); color: var(--tx); filter: none; }
.ot-mini:disabled { opacity: .3; cursor: default; }
.ot-mini.danger:hover:not(:disabled) { background: var(--danger-bg); color: var(--danger-color); }

.ot-legend { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: .64rem; color: var(--tx2); }
.ot-legend span { display: inline-flex; align-items: center; gap: 4px; }
.ot-legend i { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
.ot-legend i.plate { background: var(--acc); }
.ot-legend i.source { background: #009E73; }
.ot-legend i.samples { background: #CC79A7; }
.ot-legend i.module { background: #E69F00; }
.ot-legend i.tips { background: var(--ln2); }

/* Summary tiles */
.ot-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.ot-tile { border-radius: 9px; background: var(--cd); border: 1px solid var(--ln2); padding: 8px 10px; display: flex; flex-direction: column; gap: 1px; }
.ot-tile b { font-size: 1.05rem; color: var(--tx); font-variant-numeric: tabular-nums; }
.ot-tile b small { font-size: .7rem; color: var(--tx3); font-weight: 500; }
.ot-tile span { font-size: .64rem; color: var(--tx2); }
.ot-tile.dim b { color: var(--tx3); }
.ot-warnpill, .ot-okpill { height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: .74rem; font-weight: 600; }
.ot-warnpill { border: 1px solid rgba(217,119,6,.5); background: rgba(217,119,6,.1); color: #b45309; cursor: pointer; box-shadow: none; }
.ot-warnpill:hover { filter: brightness(1.04); }
.ot-okpill { color: var(--ok); background: transparent; }

/* Liquids table */
.ot-liq-head, .ot-liq { display: grid; grid-template-columns: 18px 1fr 48px 72px 170px; gap: 8px; align-items: center; font-size: .78rem; }
.ot-liq-head { font-size: .64rem; font-weight: 700; color: var(--tx3); padding-bottom: 4px; }
.ot-liq { padding: 5px 0; border-top: 1px solid var(--ln); }
.ot-liq.off { opacity: .45; }
.ot-liq input[type="checkbox"] { width: 14px; height: 14px; margin: 0; }
.ot-liq select { padding: 3px 5px; font-size: .72rem; width: 100%; }
.ot-liq-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
.ot-liq-name i.fas { color: var(--tx3); font-size: .66rem; width: 12px; flex: none; }
.ot-warn-ic { color: #d97706 !important; }
.ot-red { color: var(--danger-color); font-weight: 700; }

/* Steps timeline */
.ot-tl { position: relative; display: flex; flex-direction: column; gap: 8px; padding-left: 4px; }
.ot-tl::before { content: ''; position: absolute; left: 15px; top: 16px; bottom: 16px; width: 2px; background: var(--ln2); }
.ot-step { position: relative; border: 1px solid var(--ln2); border-radius: var(--rc, 10px); background: var(--cd); margin-left: 22px; }
.ot-step.open { border-color: var(--acc); }
.ot-step-head { display: flex; align-items: center; gap: 8px; padding: 9px 10px 9px 12px; cursor: pointer; font-size: .82rem; }
.ot-step-n { position: absolute; left: -22px; top: 8px; width: 24px; height: 24px; border-radius: 50%; background: var(--acc); color: #fff; font-size: .68rem; font-weight: 700; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 3px var(--modal, var(--surface)); }
.ot-step-ic { color: var(--primary); width: 14px; text-align: center; }
.ot-step-title { font-weight: 700; color: var(--tx); }
.ot-step-sum { flex: 1; min-width: 0; font-size: .72rem; color: var(--tx2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ot-step-tools { display: flex; gap: 2px; flex: none; }
.ot-step-body { padding: 6px 14px 10px; border-top: 1px solid var(--ln); }
.ot-prof { align-items: end; }
.ot-prof .ot-mini { margin-bottom: 10px; }
.ot-add { margin-top: 14px; }
.ot-add-title { font-size: .66rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--tx3); margin-bottom: 6px; }
.ot-addgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 6px; }
.ot-addbtn { height: 52px; border-radius: 9px; border: 1px dashed var(--ln2); background: transparent; color: var(--tx2); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font-size: .68rem; font-weight: 600; cursor: pointer; box-shadow: none; }
.ot-addbtn i { font-size: .85rem; color: var(--primary); }
.ot-addbtn:hover { background: var(--acs); border-color: var(--acc); color: var(--acc); filter: none; }
.ot-code { width: 100%; font: 12px/1.45 ui-monospace, Menlo, Consolas, monospace; padding: 8px; border-radius: 8px; border: 1px solid var(--ln2); background: var(--fl); color: var(--tx); resize: vertical; }

/* Run preview */
.ot-pv-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ot-pv-speed { display: inline-flex !important; align-items: center; gap: 6px; margin: 0 0 0 4px !important; font-size: .7rem !important; }
.ot-pv-speed select { width: auto !important; margin: 0 !important; padding: 4px 22px 4px 8px !important; }
.ot-pv-spacer { flex: 1; }
.ot-pv-now { display: flex; align-items: flex-start; gap: 12px; margin-top: 12px; padding: 12px 14px; border-radius: var(--rc, 10px); background: var(--fl); border: 1px solid var(--ln2); }
.ot-pv-now.user { background: rgba(217,119,6,.10); border-color: rgba(217,119,6,.55); }
.ot-pv-hint { font-size: 12px; color: var(--tx2); margin-top: 5px; }
.ot-pv-clear h4 .ot-muted { font-weight: 500; }
.ot-clear-list { list-style: none; margin: 10px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 6px 12px; }
.ot-clear-list li { display: grid; grid-template-columns: 16px 1fr; column-gap: 8px; align-items: baseline; align-content: start; font-size: 12.5px; padding: 7px 9px; border-radius: 9px; background: var(--fl); border: 1px solid transparent; }
.ot-clear-list li b { color: var(--tx); font-weight: 600; }
.ot-clear-list li i { font-size: 12px; }
.ot-clear-list li.ok i { color: #059669; }
.ot-clear-list li.bad { background: rgba(217,119,6,.10); border-color: rgba(217,119,6,.45); }
.ot-clear-list li.bad i { color: #d97706; }
.ot-clear-info { grid-column: 2; font-size: 11.5px; color: var(--tx3); }
.ot-clear-note { grid-column: 2; font-size: 12px; color: var(--tx); margin-top: 4px; line-height: 1.4; }
.ot-pv-now.wait { background: var(--acs); border-color: var(--acc); }
.ot-pv-ic { width: 30px; height: 30px; border-radius: 9px; background: var(--acc); color: #fff; display: flex; align-items: center; justify-content: center; flex: none; font-size: .85rem; }
.ot-pv-now.user .ot-pv-ic { background: #d97706; }
.ot-pv-text { flex: 1; min-width: 0; }
.ot-pv-title { font-size: .88rem; font-weight: 700; color: var(--tx); line-height: 1.35; }
.ot-pv-sub { font-size: .72rem; color: var(--tx2); margin-top: 3px; }
.ot-pv-state { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; max-width: 240px; }
.ot-pv-listcard { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.ot-pv-list { overflow-y: auto; max-height: 520px; border: 1px solid var(--ln2); border-radius: var(--rc, 10px); background: var(--cd); }
.ot-pv-step { position: sticky; top: 0; z-index: 1; padding: 5px 12px; font-size: .66rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--tx3); background: var(--surface-solid, var(--cd)); border-bottom: 1px solid var(--ln); }
.ot-pv-item { display: grid; grid-template-columns: 54px 16px 1fr auto; gap: 8px; align-items: center; padding: 5px 12px; font-size: .76rem; color: var(--tx2); border-bottom: 1px solid var(--ln); cursor: pointer; }
.ot-pv-item:hover { background: var(--fl); }
.ot-pv-item.done { opacity: .6; }
.ot-pv-item.on { background: var(--acs); color: var(--tx); opacity: 1; box-shadow: inset 3px 0 0 var(--acc); }
.ot-pv-item.user .fas { color: #d97706; }
.ot-pv-item.user.on { background: rgba(217,119,6,.14); box-shadow: inset 3px 0 0 #d97706; }
.ot-pv-t { font-variant-numeric: tabular-nums; color: var(--tx3); font-size: .7rem; }
.ot-pv-txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ot-pv-tag { font-size: .62rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #b45309; background: rgba(217,119,6,.14); padding: 1px 6px; border-radius: 6px; }
.ot-pv-dur { font-size: .68rem; color: var(--tx3); font-variant-numeric: tabular-nums; }
.ot-legend i.filledw { background: var(--acc); opacity: .35; }
.ot-legend i.usedtip { background: var(--ln2); opacity: .5; }

/* Python tab */
.ot-codetab { height: 100%; }
.ot-warnings { border-color: rgba(217,119,6,.5); background: rgba(217,119,6,.08); }
.ot-warnings h4, .ot-warnings h4 i { color: #b45309; }
.ot-warnings ul { margin: 0; padding-left: 18px; font-size: .76rem; line-height: 1.45; }
.ot-ok { font-size: .76rem; color: var(--ok); display: flex; gap: 8px; align-items: center; }
.ot-codecard { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.ot-preview {
  margin: 0; flex: 1; min-height: 320px; overflow: auto; padding: 12px 14px; border-radius: var(--rc, 10px);
  font: 11.5px/1.45 ui-monospace, Menlo, Consolas, monospace; background: var(--surface-solid, #EDF1F7); color: var(--tx); border: 1px solid var(--ln2);
  white-space: pre; tab-size: 4;
}

/* Footer */
.ot-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; border-top: 1px solid var(--ln2); background: var(--fl); }
.ot-foot-note { font-size: .7rem; color: var(--tx2); }
.ot-actions { display: flex; gap: 8px; }

@media (max-width: 980px) {
  .ot-head { grid-template-columns: 1fr auto; }
  .ot-tabs { grid-column: 1 / -1; order: 3; justify-content: space-between; }
  .ot-body { grid-template-columns: 1fr; overflow-y: auto; }
  .ot-main { overflow: visible; }
  .ot-rail { border-left: none; border-top: 1px solid var(--ln2); }
  .ot-grid4, .ot-mounts { grid-template-columns: 1fr 1fr; }
  .ot-liq-head, .ot-liq { grid-template-columns: 18px 1fr 40px 64px 130px; }
}
</style>
