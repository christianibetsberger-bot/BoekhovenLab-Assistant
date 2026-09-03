<script setup>
// Well plate → Opentrons OT-2 protocol.
//
// Everything a person decides lives in plate.ot2 (pipettes, deck, which liquid
// goes where, the steps after the plate is built) and is saved with the plate,
// so the next export of the same plate starts where the last one stopped. The
// Python itself is regenerated on every change by utils/opentronsExport and
// shown live, warnings first: a warning names something the robot will refuse
// or that a person should check before pressing Run.
import { computed, reactive, ref, watch, onBeforeUnmount } from 'vue'
import { useLabStore } from '../stores/labStore'
import {
  generateOpentronsProtocol, normalizeOt2Config, newOt2Step, plateDemands, wellNamesOf,
  labwareByName, targetLabwareOptions, defaultTargetLabware, sourceLabwareOptions, sampleLabwareOptions,
  tipRackOptions, opentronsFilename, fmtUl,
  OT2_PIPETTES, OT2_API_LEVELS, OT2_SLOTS, OT2_MODULES, OT2_STEP_TYPES,
} from '../utils/opentronsExport'

const props = defineProps({ plate: { type: Object, required: true } })
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
const lineCount = computed(() => (result.value.code.match(/\n/g) || []).length)

// ── Catalogue views ──
const pipetteChoices = computed(() => [{ name: '', label: '— none —' }, ...OT2_PIPETTES])
const targetOptions = computed(() => targetLabwareOptions(props.plate.format, cfg.target.on))
const sourceOptions = sourceLabwareOptions()
const sampleOptions = sampleLabwareOptions()
const stepTypes = OT2_STEP_TYPES
const stepMeta = (type) => stepTypes.find(t => t.type === type) || { label: type, icon: 'fa-circle' }
const pipetteLabel = (mount) => {
  const p = OT2_PIPETTES.find(x => x.name === cfg.pipettes[mount])
  return p ? `${p.label} (${p.min}–${p.max} µL)` : null
}
const singleMounts = computed(() => ['left', 'right'].filter(m => OT2_PIPETTES.find(p => p.name === cfg.pipettes[m])?.channels === 1))

// Changing where the plate sits changes which labware can hold it.
watch(() => cfg.target.on, (on) => {
  if (!targetLabwareOptions(props.plate.format, on).some(l => l.name === cfg.target.labware)) {
    cfg.target.labware = defaultTargetLabware(props.plate.format, on)
  }
})
watch(() => props.plate.format, (f) => { cfg.target.labware = defaultTargetLabware(f, cfg.target.on) })

// ── Liquids: everything the plate needs, with the position each one gets ──
const liquids = computed(() => {
  const s = result.value.summary
  const byKey = new Map((s?.sources || []).map(x => [x.key, x]))
  const rows = plateDemands(props.plate).map(d => ({
    key: d.key, name: d.name, code: d.code, stock: d.stock, unit: d.unit, isFill: d.isFill,
    linked: d.linked, unlinked: !!d.unlinked, wells: d.transfers.length, demandUl: d.totalUl,
    included: cfg.compounds[d.key]?.included !== false,
    ...(byKey.get(d.key) ? { rack: byKey.get(d.key).rack, well: byKey.get(d.key).well, loadUl: byKey.get(d.key).loadUl, overCapacity: byKey.get(d.key).overCapacity } : {}),
  }))
  for (const q of (s?.sources || []).filter(x => x.isQuench)) rows.push({ ...q, included: true, isQuench: true })
  return rows
})
const positionOptions = computed(() => {
  const st = labwareByName(cfg.stocksLabware), bk = labwareByName(cfg.bulkLabware)
  return [
    { value: '', label: 'auto' },
    ...(st ? wellNamesOf(st).map(w => ({ value: `stocks:${w}`, label: `Stocks ${w}` })) : []),
    ...(bk ? wellNamesOf(bk).map(w => ({ value: `bulk:${w}`, label: `Bulk ${w}` })) : []),
  ]
})
const setLiquid = (key, patch) => { cfg.compounds[key] = { ...(cfg.compounds[key] || {}), ...patch } }

// ── Deck map ──
const DECK_ROWS = [['10', '11', '12'], ['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3']]
const deckLabel = (slot) => {
  if (slot === '12') return 'trash'
  const row = result.value.summary?.deck.find(d => d.slot === slot)
  if (!row) return ''
  const w = row.what
  if (/^the plate/.test(w)) return 'plate'
  if (/Thermocycler/.test(w)) return 'thermo-cycler'
  if (/Temperature/.test(w)) return 'temp module'
  if (/Heater-Shaker/.test(w)) return 'heater-shaker'
  if (/Magnetic/.test(w)) return 'magnet'
  if (/stock rack/.test(w)) return 'stocks'
  if (/bulk/.test(w)) return 'bulk'
  if (/sample/.test(w)) return 'samples'
  const m = /\((\w+)\)$/.exec(w)
  return m ? `tips ${m[1]}` : w
}
const deckKind = (slot) => {
  const l = deckLabel(slot)
  if (!l) return ''
  if (l === 'plate') return 'plate'
  if (l === 'trash') return 'trash'
  if (/tips/.test(l)) return 'tips'
  if (/stocks|bulk|samples/.test(l)) return 'source'
  return 'module'
}
const usedSlotsBy = computed(() => {
  const out = {}
  for (const d of result.value.summary?.deck || []) out[d.slot] = d.what
  return out
})

// ── Steps ──
const addType = ref('thermocycler')
const addStep = () => { cfg.steps.push(newOt2Step(addType.value)) }
const removeStep = (i) => { cfg.steps.splice(i, 1) }
const moveStep = (i, dir) => {
  const j = i + dir
  if (j < 0 || j >= cfg.steps.length) return
  const [s] = cfg.steps.splice(i, 1)
  cfg.steps.splice(j, 0, s)
}
const duplicateStep = (i) => { cfg.steps.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(cfg.steps[i])), id: newOt2Step(cfg.steps[i].type).id }) }
const addProfileRow = (s) => { s.profile.push({ temp: 72, seconds: 30 }) }
const stepSummary = (s) => {
  const v = (x) => (x === '' || x == null ? null : x)
  switch (s.type) {
    case 'build': return `${s.newTip === 'once' ? 'one tip per stock' : 'new tip per well'}${s.mode === 'distribute' ? ', distribute' : ''}${Number(s.mixAfterReps) > 0 ? ', mix after' : ''}`
    case 'thermocycler': return [s.lid !== 'leave' ? `lid ${s.lid}` : '', v(s.blockTemp) != null ? `block ${s.blockTemp} °C${Number(s.holdMinutes) > 0 ? ` for ${s.holdMinutes} min` : ''}` : '', v(s.lidTemp) != null ? `lid ${s.lidTemp} °C` : '', s.deactivate ? 'then off' : ''].filter(Boolean).join(' · ') || 'no change'
    case 'tc_profile': return `${(s.profile || []).map(p => `${p.temp} °C ${p.seconds} s`).join(' → ')} × ${s.cycles}`
    case 'temperature': return s.deactivate ? 'off' : `${s.temp} °C`
    case 'heater_shaker': return s.deactivate ? 'off' : [v(s.temp) != null ? `${s.temp} °C` : '', v(s.rpm) != null ? (Number(s.rpm) > 0 ? `${s.rpm} rpm` : 'stop shaking') : ''].filter(Boolean).join(' · ') || 'no change'
    case 'magnetic': return s.action === 'disengage' ? 'magnets down' : `magnets up${v(s.height) != null ? ` (${s.height} mm)` : ''}`
    case 'delay': return `${Number(s.minutes) || 0} min ${Number(s.seconds) || 0} s`
    case 'pause': return s.message || ''
    case 'mix': return `${s.wells || 'all'} · ${s.reps} × ${s.volume || 'auto'} µL`
    case 'sample': return `${s.volume} µL from ${s.wells || 'all'}${s.quenchName ? ` into ${s.quenchUl} µL ${s.quenchName}` : ''}`
    case 'series': return `${s.count} × every ${s.intervalMinutes} min · ${s.volume} µL from ${s.wells || 'all'}${s.quenchName ? ` into ${s.quenchUl} µL ${s.quenchName}` : ''}`
    case 'comment': return s.text || ''
    case 'custom': return `${(s.code || '').split('\n').filter(l => l.trim()).length} lines`
    default: return ''
  }
}
const collapsed = reactive({})

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
  store.toast?.(`Downloaded ${a.download}${result.value.warnings.length ? ` — ${result.value.warnings.length} thing${result.value.warnings.length === 1 ? '' : 's'} to check first` : ''}`)
}

const hasSampling = computed(() => cfg.steps.some(s => s.type === 'sample' || s.type === 'series'))
const usesModule = (m) => !!result.value.summary?.modules?.[m]
</script>

<template>
  <div class="ot-overlay" @click.self="emit('close')">
    <div class="ot-modal">
      <!-- Header -->
      <div class="ot-head">
        <div class="ot-title">
          <i class="fas fa-robot"></i>
          <span>OT-2 protocol — <strong>{{ plate.name }}</strong></span>
          <span class="ot-muted">{{ plate.format }}-well · {{ lineCount }} lines of Python</span>
        </div>
        <div class="ot-actions">
          <button class="ot-btn" @click="copyCode" :title="copied ? 'Copied' : 'Copy the Python to the clipboard'">
            <i class="fas" :class="copied ? 'fa-check' : 'fa-copy'"></i> {{ copied ? 'Copied' : 'Copy' }}
          </button>
          <button class="ot-btn primary" @click="download" title="Download the .py file — upload it in the Opentrons App">
            <i class="fas fa-download"></i> Download .py
          </button>
          <button class="ot-btn icon danger" @click="emit('close')" title="Close"><i class="fas fa-times"></i></button>
        </div>
      </div>

      <div class="ot-body">
        <!-- ── Left: robot setup ── -->
        <div class="ot-col ot-setup">

          <section class="ot-sec">
            <h4><i class="fas fa-file-code"></i> Protocol</h4>
            <div class="ot-grid2">
              <label>Name <input type="text" v-model="cfg.protocolName" /></label>
              <label>Author <input type="text" v-model="cfg.author" placeholder="you" /></label>
            </div>
            <label>Description <input type="text" v-model="cfg.description" :placeholder="`Well plate ${plate.name}`" /></label>
            <div class="ot-grid2">
              <label title="Must not be newer than what your robot's software supports. Protocol Designer files from your OT-2 App show the level it accepts.">
                apiLevel
                <select v-model="cfg.apiLevel"><option v-for="l in OT2_API_LEVELS" :key="l" :value="l">{{ l }}</option></select>
              </label>
              <label title="Extra volume to load in every source beyond what the plate consumes, so the last well is not pipetted from an empty tube.">
                Headroom % <input type="number" min="0" max="200" step="5" v-model.number="cfg.headroomPct" />
              </label>
            </div>
          </section>

          <section class="ot-sec">
            <h4><i class="fas fa-eye-dropper"></i> Pipettes</h4>
            <div v-for="mount in ['left', 'right']" :key="mount" class="ot-mount">
              <label>{{ mount === 'left' ? 'Left' : 'Right' }} mount
                <select v-model="cfg.pipettes[mount]">
                  <option v-for="p in pipetteChoices" :key="p.name" :value="p.name">{{ p.label }}{{ p.min ? ` · ${p.min}–${p.max} µL` : '' }}</option>
                </select>
              </label>
              <div v-if="cfg.pipettes[mount]" class="ot-grid3 ot-sub">
                <label>Tip rack
                  <select v-model="cfg.tipRacks[mount]">
                    <option value="">default</option>
                    <option v-for="t in tipRackOptions(cfg.pipettes[mount])" :key="t.name" :value="t.name">{{ t.label }}</option>
                  </select>
                </label>
                <label title="Leave empty for the pipette's default flow rate">Aspirate µL/s <input type="number" min="0" step="1" v-model="cfg.flowRates[mount].aspirate" placeholder="default" /></label>
                <label title="Leave empty for the pipette's default flow rate">Dispense µL/s <input type="number" min="0" step="1" v-model="cfg.flowRates[mount].dispense" placeholder="default" /></label>
              </div>
            </div>
            <div class="ot-hint">Each volume goes to the smallest pipette that covers it. Two single-channel pipettes (P20 + P300) cover 1–300 µL in one stroke.</div>
          </section>

          <section class="ot-sec">
            <h4><i class="fas fa-table-cells"></i> Deck</h4>
            <div class="ot-grid2">
              <label>Plate sits
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
            </div>
            <label>Plate labware
              <select v-model="cfg.target.labware">
                <option v-for="l in targetOptions" :key="l.name" :value="l.name">{{ l.label }}</option>
              </select>
            </label>
            <div class="ot-grid2">
              <label>Stock tubes <select v-model="cfg.stocksLabware"><option v-for="l in sourceOptions" :key="l.name" :value="l.name">{{ l.label }}</option></select></label>
              <label>Slot <select v-model="cfg.deck.stocks"><option v-for="s in OT2_SLOTS" :key="s" :value="s">{{ s }}</option></select></label>
            </div>
            <div class="ot-grid2">
              <label title="Water and buffers: anything that does not fit a stock tube goes here">Bulk liquids <select v-model="cfg.bulkLabware"><option v-for="l in sourceOptions" :key="l.name" :value="l.name">{{ l.label }}</option></select></label>
              <label>Slot <select v-model="cfg.deck.bulk"><option v-for="s in OT2_SLOTS" :key="s" :value="s">{{ s }}</option></select></label>
            </div>
            <div class="ot-grid2" v-if="hasSampling">
              <label>Sample labware <select v-model="cfg.samplesLabware"><option v-for="l in sampleOptions" :key="l.name" :value="l.name">{{ l.label }}</option></select></label>
              <label>Slot <select v-model="cfg.deck.samples"><option v-for="s in OT2_SLOTS" :key="s" :value="s">{{ s }}</option></select></label>
            </div>
            <template v-if="usesModule('temperature') && cfg.target.on !== 'temperature'">
              <div class="ot-grid2">
                <label>Temperature Module <select v-model="cfg.modules.temperature"><option v-for="[m, l] in OT2_MODULES.temperature.models" :key="m" :value="m">{{ l }}</option></select></label>
                <label>Slot <select v-model="cfg.deck.temperature"><option v-for="s in OT2_SLOTS" :key="s" :value="s">{{ s }}</option></select></label>
              </div>
            </template>
            <template v-if="usesModule('heaterShaker') && cfg.target.on !== 'heater_shaker'">
              <div class="ot-grid2">
                <label>Heater-Shaker <select v-model="cfg.modules.heaterShaker"><option v-for="[m, l] in OT2_MODULES.heater_shaker.models" :key="m" :value="m">{{ l }}</option></select></label>
                <label>Slot <select v-model="cfg.deck.heaterShaker"><option v-for="s in OT2_MODULES.heater_shaker.slots" :key="s" :value="s">{{ s }}</option></select></label>
              </div>
            </template>
            <template v-if="usesModule('thermocycler') && cfg.target.on !== 'thermocycler'">
              <label>Thermocycler <select v-model="cfg.modules.thermocycler"><option v-for="[m, l] in OT2_MODULES.thermocycler.models" :key="m" :value="m">{{ l }}</option></select></label>
            </template>
            <template v-if="usesModule('magnetic')">
              <div class="ot-grid2">
                <label>Magnetic Module <select v-model="cfg.modules.magnetic"><option v-for="[m, l] in OT2_MODULES.magnetic.models" :key="m" :value="m">{{ l }}</option></select></label>
                <label>Slot <select v-model="cfg.deck.magnetic"><option v-for="s in OT2_SLOTS" :key="s" :value="s">{{ s }}</option></select></label>
              </div>
            </template>

            <!-- Deck map: 10 11 12 at the back, 1 2 3 at the front, as the robot sees it -->
            <div class="ot-deck">
              <div v-for="row in DECK_ROWS" :key="row[0]" class="ot-deck-row">
                <div v-for="s in row" :key="s" class="ot-slot" :class="deckKind(s)" :title="usedSlotsBy[s] || (s === '12' ? 'Fixed trash' : 'empty')">
                  <span class="ot-slot-n">{{ s }}</span>
                  <span class="ot-slot-l">{{ deckLabel(s) }}</span>
                </div>
              </div>
            </div>
            <div class="ot-hint">Tip racks fill the free slots by themselves — as many as the tip count needs.</div>
          </section>

          <section class="ot-sec">
            <h4><i class="fas fa-vials"></i> Liquids <span class="ot-muted">{{ liquids.filter(l => l.included).length }} of {{ liquids.length }}</span></h4>
            <div class="ot-liq-head"><span></span><span>Liquid</span><span>Wells</span><span>Load ≥</span><span>Position</span></div>
            <div v-for="l in liquids" :key="l.key" class="ot-liq" :class="{ off: !l.included }">
              <input type="checkbox" :checked="l.included" :disabled="l.isQuench" @change="setLiquid(l.key, { included: $event.target.checked })" />
              <span class="ot-liq-name" :title="l.name">
                <i class="fas" :class="l.isFill ? 'fa-droplet' : l.isQuench ? 'fa-flask' : 'fa-tag'"></i>
                {{ l.code ? `[${l.code}] ` : '' }}{{ l.name }}<span v-if="l.stock != null" class="ot-muted"> {{ l.stock }} {{ l.unit }}</span>
                <i v-if="l.unlinked" class="fas fa-link-slash ot-warn-ic" title="No inventory chip — the volume is real, you assign its tube"></i>
              </span>
              <span class="ot-muted">{{ l.isQuench ? 'samples' : l.wells }}</span>
              <span :class="{ 'ot-red': l.overCapacity }" :title="l.overCapacity ? 'Does not fit one position of that labware' : `${fmtUl(l.demandUl)} consumed`">{{ l.included && l.loadUl ? fmtUl(l.loadUl) : '—' }}</span>
              <select :value="cfg.compounds[l.key]?.position || ''" @change="setLiquid(l.key, { position: $event.target.value })" :disabled="!l.included" :title="l.rack ? `Now: ${l.rack} ${l.well}` : ''">
                <option v-for="o in positionOptions" :key="o.value" :value="o.value">{{ o.value === '' ? (l.rack ? `auto → ${l.rack} ${l.well}` : 'auto') : o.label }}</option>
              </select>
            </div>
            <div v-if="!liquids.length" class="ot-hint">This plate has no volumes to pipette.</div>
          </section>
        </div>

        <!-- ── Right: steps + output ── -->
        <div class="ot-col ot-main">
          <section class="ot-sec">
            <h4><i class="fas fa-list-ol"></i> Steps <span class="ot-muted">run in this order</span></h4>

            <div v-for="(s, i) in cfg.steps" :key="s.id" class="ot-step">
              <div class="ot-step-head" @click="collapsed[s.id] = !collapsed[s.id]">
                <span class="ot-step-n">{{ i + 1 }}</span>
                <i class="fas ot-step-ic" :class="stepMeta(s.type).icon"></i>
                <strong>{{ stepMeta(s.type).label }}</strong>
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
                  <div class="ot-grid3">
                    <label>Pipette
                      <select v-model="s.pipette"><option value="auto">by volume</option><option v-for="m in singleMounts" :key="m" :value="m">{{ m }} · {{ pipetteLabel(m) }}</option></select>
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
                  <div class="ot-hint">{{ OT2_MODULES.heater_shaker.min }}–{{ OT2_MODULES.heater_shaker.max }} °C, {{ OT2_MODULES.heater_shaker.rpmMin }}–{{ OT2_MODULES.heater_shaker.rpmMax }} rpm. Shaking is stopped automatically around any pipetting and restarted afterwards.</div>
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
                    <label>Pipette <select v-model="s.pipette"><option value="auto">by volume</option><option v-for="m in singleMounts" :key="m" :value="m">{{ m }} · {{ pipetteLabel(m) }}</option></select></label>
                    <label>Tips <select v-model="s.newTip"><option value="always">new tip per well</option><option value="once">one tip for all</option></select></label>
                  </div>
                </template>

                <!-- Take samples / series -->
                <template v-else-if="s.type === 'sample' || s.type === 'series'">
                  <div v-if="s.type === 'series'" class="ot-grid4">
                    <label>Time points <input type="number" min="1" step="1" v-model="s.count" /></label>
                    <label>Every … min <input type="number" min="0" step="1" v-model="s.intervalMinutes" /></label>
                    <label class="ot-checks" style="grid-column: span 2;"><span><input type="checkbox" v-model="s.firstAtZero" /> first sample right away (t = 0)</span></label>
                  </div>
                  <div class="ot-grid4">
                    <label style="grid-column: span 2;">From wells <input type="text" v-model="s.wells" placeholder="all, or A1-H1" /></label>
                    <label>Sample µL <input type="number" min="0" step="0.5" v-model="s.volume" /></label>
                    <label>Pipette <select v-model="s.pipette"><option value="auto">by volume</option><option v-for="m in singleMounts" :key="m" :value="m">{{ m }} · {{ pipetteLabel(m) }}</option></select></label>
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
                    Samples go into the sample labware column by column (A1, B1, … H1, A2, …), each time point into the next free wells
                    <template v-if="result.summary"> — {{ result.summary.sampleWellsUsed }} of {{ result.summary.sampleCapacity }} used</template>.
                    <template v-if="s.type === 'series'">Intervals are measured from the start of the series, so the time sampling takes does not drift them.</template>
                  </div>
                </template>

                <!-- Comment -->
                <template v-else-if="s.type === 'comment'">
                  <label>Text <input type="text" v-model="s.text" /></label>
                </template>

                <!-- Custom Python -->
                <template v-else-if="s.type === 'custom'">
                  <textarea v-model="s.code" class="ot-code" rows="6" spellcheck="false" placeholder="protocol.comment(&quot;hello&quot;)&#10;p20.transfer(5, stocks[&quot;A1&quot;], plate[&quot;A1&quot;])"></textarea>
                  <div class="ot-hint">In scope: <code>protocol</code>, <code>plate</code>, <code>stocks</code>, <code>bulk</code>, <code>samples</code>, the pipettes (<code v-for="p in result.summary?.pipettes || []" :key="p.var">{{ p.var }} </code>) and any module (<code>tc</code>, <code>temp_mod</code>, <code>hs</code>, <code>mag</code>). Indented into <code>run()</code> as written.</div>
                </template>
              </div>
            </div>

            <div class="ot-add">
              <select v-model="addType">
                <option v-for="t in stepTypes" :key="t.type" :value="t.type">{{ t.label }}</option>
              </select>
              <button class="ot-btn" @click="addStep"><i class="fas fa-plus"></i> Add step</button>
              <span class="ot-hint" style="margin: 0;">{{ stepMeta(addType).help }}</span>
            </div>
          </section>

          <section v-if="result.warnings.length" class="ot-sec ot-warnings">
            <h4><i class="fas fa-triangle-exclamation"></i> Check before running <span class="ot-muted">{{ result.warnings.length }}</span></h4>
            <ul><li v-for="w in result.warnings" :key="w">{{ w }}</li></ul>
          </section>
          <section v-else-if="result.code" class="ot-sec ot-ok">
            <i class="fas fa-circle-check"></i> Nothing to flag. Simulate it once with <code>opentrons_simulate</code> or the Opentrons App before the first real run.
          </section>

          <section class="ot-sec">
            <h4><i class="fas fa-code"></i> Python preview</h4>
            <pre class="ot-preview">{{ result.code || '# nothing to export' }}</pre>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ot-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 16px; }
.ot-modal {
  width: min(1240px, 100%); height: min(92vh, 980px);
  background: var(--modal, var(--surface)); color: var(--tx, inherit);
  border: 1px solid var(--ln2); border-radius: var(--r, 14px); box-shadow: var(--sh);
  display: flex; flex-direction: column; overflow: hidden;
}
.ot-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--ln2); }
.ot-title { display: flex; align-items: center; gap: 10px; font-size: 1rem; color: var(--primary); min-width: 0; }
.ot-title strong { color: var(--tx); }
.ot-actions { display: flex; gap: 6px; flex: none; }
.ot-muted { font-size: .74rem; color: var(--tx2); font-weight: 400; }

.ot-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 400px 1fr; }
.ot-col { overflow-y: auto; padding: 12px 14px; min-width: 0; }
.ot-setup { border-right: 1px solid var(--ln2); background: var(--fl); }

.ot-sec { margin-bottom: 14px; }
.ot-sec h4 { margin: 0 0 8px; font-size: .8rem; display: flex; align-items: center; gap: 7px; color: var(--tx); }
.ot-sec h4 i { color: var(--primary); width: 14px; }
.ot-sec label { display: block; font-size: .7rem; font-weight: 600; color: var(--tx2); margin-bottom: 6px; }
.ot-sec label input[type="text"], .ot-sec label input[type="number"], .ot-sec label select { display: block; width: 100%; margin-top: 3px; padding: 5px 7px; font-size: .78rem; font-weight: 400; }
.ot-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ot-grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.ot-grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.ot-sub { margin: -2px 0 8px; padding-left: 10px; border-left: 2px solid var(--ln2); }
.ot-mount { margin-bottom: 4px; }
.ot-hint { font-size: .7rem; color: var(--tx2); margin: 4px 0 8px; line-height: 1.4; }
.ot-hint code { font-size: .68rem; background: var(--fl); padding: 0 4px; border-radius: 4px; }
.ot-checks { display: flex; gap: 12px; align-items: flex-end; padding-bottom: 6px; font-weight: 500; }
.ot-checks span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.ot-checks input { width: 14px; height: 14px; margin: 0; }

/* Buttons echo the plate toolbar: one height, one radius, one filled action. */
.ot-btn {
  height: 30px; padding: 0 11px; border-radius: 8px; font-size: .74rem; font-weight: 600; line-height: 1; white-space: nowrap;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  background: var(--btn2, rgba(0,0,0,.05)); color: var(--tx, inherit); border: 1px solid var(--ln2); box-shadow: none; cursor: pointer;
}
.ot-btn:hover:not(:disabled) { filter: brightness(1.06); }
.ot-btn.primary { background: var(--acc, #2563eb); border-color: transparent; color: #fff; }
.ot-btn.icon { width: 30px; padding: 0; }
.ot-btn.small { height: 26px; font-size: .7rem; padding: 0 9px; }
.ot-btn.danger:hover { background: var(--danger-color); border-color: transparent; color: #fff; filter: none; }
.ot-mini { width: 24px; height: 24px; padding: 0; border-radius: 6px; background: transparent; color: var(--tx2); border: 1px solid transparent; box-shadow: none; font-size: .7rem; cursor: pointer; }
.ot-mini:hover:not(:disabled) { background: var(--fl); color: var(--tx); filter: none; }
.ot-mini:disabled { opacity: .3; cursor: default; }
.ot-mini.danger:hover:not(:disabled) { background: var(--danger-bg); color: var(--danger-color); }

/* Deck map */
.ot-deck { display: flex; flex-direction: column; gap: 4px; margin: 10px 0 4px; }
.ot-deck-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.ot-slot { height: 40px; border-radius: 7px; border: 1px dashed var(--ln2); display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: .62rem; color: var(--tx3); line-height: 1.1; text-align: center; padding: 2px; }
.ot-slot-n { font-weight: 700; font-size: .66rem; }
.ot-slot-l { color: var(--tx2); }
.ot-slot.plate { border-style: solid; background: var(--acs); border-color: var(--acc); color: var(--acc); }
.ot-slot.plate .ot-slot-l { color: var(--acc); font-weight: 600; }
.ot-slot.module { border-style: solid; background: rgba(230,159,0,.14); border-color: #E69F00; }
.ot-slot.source { border-style: solid; background: rgba(0,158,115,.12); border-color: #009E73; }
.ot-slot.tips { border-style: solid; background: var(--fl); }
.ot-slot.trash { background: transparent; }

/* Liquids table */
.ot-liq-head, .ot-liq { display: grid; grid-template-columns: 18px 1fr 40px 64px 118px; gap: 6px; align-items: center; font-size: .76rem; }
.ot-liq-head { font-size: .64rem; font-weight: 700; color: var(--tx3); padding-bottom: 3px; }
.ot-liq { padding: 3px 0; border-top: 1px solid var(--ln); }
.ot-liq.off { opacity: .45; }
.ot-liq input[type="checkbox"] { width: 14px; height: 14px; margin: 0; }
.ot-liq select { padding: 2px 4px; font-size: .7rem; width: 100%; }
.ot-liq-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ot-liq-name i.fas { color: var(--tx3); font-size: .66rem; width: 12px; }
.ot-warn-ic { color: #d97706 !important; margin-left: 4px; }
.ot-red { color: var(--danger-color); font-weight: 700; }

/* Steps */
.ot-step { border: 1px solid var(--ln2); border-radius: var(--rc, 10px); background: var(--cd); margin-bottom: 8px; }
.ot-step-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: pointer; font-size: .82rem; }
.ot-step-n { width: 20px; height: 20px; border-radius: 50%; background: var(--acc); color: #fff; font-size: .66rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex: none; }
.ot-step-ic { color: var(--primary); width: 14px; text-align: center; }
.ot-step-sum { flex: 1; min-width: 0; font-size: .72rem; color: var(--tx2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ot-step-tools { display: flex; gap: 2px; flex: none; }
.ot-step-body { padding: 4px 12px 10px; border-top: 1px solid var(--ln); }
.ot-prof { align-items: end; }
.ot-prof .ot-mini { margin-bottom: 8px; }
.ot-add { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.ot-add select { width: 200px; padding: 5px 7px; font-size: .78rem; }
.ot-code { width: 100%; font: 12px/1.45 ui-monospace, Menlo, Consolas, monospace; padding: 8px; border-radius: 8px; border: 1px solid var(--ln2); background: var(--fl); color: var(--tx); resize: vertical; }

.ot-warnings { border: 1px solid rgba(217,119,6,.5); background: rgba(217,119,6,.08); border-radius: var(--rc, 10px); padding: 10px 12px; }
.ot-warnings h4 { color: #b45309; }
.ot-warnings h4 i { color: #b45309; }
.ot-warnings ul { margin: 0; padding-left: 18px; font-size: .76rem; line-height: 1.45; }
.ot-ok { font-size: .76rem; color: var(--ok); display: flex; gap: 8px; align-items: center; }
.ot-ok code { font-size: .7rem; background: var(--fl); padding: 0 4px; border-radius: 4px; color: var(--tx); }
.ot-preview {
  margin: 0; max-height: 520px; overflow: auto; padding: 12px 14px; border-radius: var(--rc, 10px);
  font: 11.5px/1.45 ui-monospace, Menlo, Consolas, monospace; background: var(--surface-solid, #EDF1F7); color: var(--tx); border: 1px solid var(--ln2);
  white-space: pre; tab-size: 4;
}

@media (max-width: 900px) {
  .ot-body { grid-template-columns: 1fr; overflow-y: auto; }
  .ot-col { overflow: visible; }
  .ot-setup { border-right: none; border-bottom: 1px solid var(--ln2); }
  .ot-grid4 { grid-template-columns: 1fr 1fr; }
}
</style>
