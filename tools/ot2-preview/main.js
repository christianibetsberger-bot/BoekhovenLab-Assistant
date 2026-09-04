// Dev-only preview of the OT-2 export dialog, outside the app shell and its login.
// Serve with `npm run dev`, then open
//   /BoekhovenLab-Assistant/tools/ot2-preview/index.html?case=multi&tab=deck
// case: basic | multi | modules      tab: robot | deck | steps | code
import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import '../../src/style.css'
import Modal from '../../src/components/OpentronsExportModal.vue'
import { useLabStore } from '../../src/stores/labStore'
import { defaultOt2Config, newOt2Step } from '../../src/utils/opentronsExport.js'

const chip = (code, name, stock, unit) => `<span class="inv-ref" data-inv-id="inv-${code}" data-labware="">[${code}] ${name} (${stock} ${unit})</span>`
const linked = (code, name, stock, unit, vol) => `&nbsp;${chip(code, name, stock, unit)}&nbsp; ${vol} µL<br>`
const fill = (label, vol) => `<strong>${label}:</strong> ${vol} µL<br>`
const ROWS = 'ABCDEFGH'

function plate96({ name, peptide, rna, total = 80 }) {
  const wells = {}
  for (let r = 0; r < 8; r++) for (let c = 1; c <= 12; c++) {
    const a = peptide(r, c), b = rna(r, c)
    wells[`${ROWS[r]}${c}`] = linked('C1', 'K10 peptide', 10, 'mM', a.toFixed(2)) + linked('C2', 'pU RNA', 8, 'mM', b.toFixed(2)) + fill('MQ H₂O', (total - a - b).toFixed(2))
  }
  wells.A1 += '<strong>EDC:</strong> 4.00 µL (10 mM)<br>'
  return { name, format: 96, targetVolume: total, wells }
}

const params = new URLSearchParams(location.search)
const which = params.get('case') || 'basic'
let plate, cfg
if (which === 'multi') {
  plate = plate96({ name: 'Coacervate kinetics 12', peptide: (r, c) => 5 + c, rna: () => 10 })
  cfg = defaultOt2Config(plate)
  cfg.pipettes = { left: 'p300_multi_gen2', right: 'p20_single_gen2' }
  const series = newOt2Step('series'); Object.assign(series, { count: 6, intervalMinutes: 30, wells: 'A1-H2', volume: 25, quenchName: 'TFA 1 %', quenchUl: 30 })
  const mix = newOt2Step('mix'); Object.assign(mix, { wells: 'A3-H3', reps: 2, volume: 40 })
  cfg.steps = [newOt2Step('build'), series, mix]
} else if (which === 'modules') {
  plate = plate96({ name: 'PCR screen 4', peptide: (r) => 5 + r, rna: (r, c) => c * 2 })
  cfg = defaultOt2Config(plate)
  cfg.target = { on: 'thermocycler', labware: 'nest_96_wellplate_100ul_pcr_full_skirt' }
  const tc = newOt2Step('thermocycler'); Object.assign(tc, { lid: 'close', blockTemp: 30, lidTemp: 50, holdMinutes: 5 })
  const hs = newOt2Step('heater_shaker'); Object.assign(hs, { temp: 37, rpm: 500 })
  const tm = newOt2Step('temperature'); tm.temp = 4
  const series = newOt2Step('series'); Object.assign(series, { count: 4, intervalMinutes: 15, wells: 'A1-H1', volume: 5, quenchName: 'Quench', quenchUl: 20 })
  const off = newOt2Step('thermocycler'); Object.assign(off, { lid: 'open', deactivate: true })
  cfg.steps = [newOt2Step('build'), tc, hs, tm, series, off, newOt2Step('custom'), newOt2Step('pause')]
} else {
  plate = plate96({ name: 'Coacervate screen 3', peptide: (r) => 5 + r, rna: (r, c) => c * 2 })
  cfg = defaultOt2Config(plate)
  const d = newOt2Step('delay'); d.minutes = 30
  cfg.steps = [newOt2Step('build'), d, newOt2Step('sample')]
}
if (params.get('name')) plate.name = params.get('name')
if (params.get('pipettes') === 'p20') cfg.pipettes = { left: '', right: 'p20_single_gen2' }
plate.ot2 = cfg

const pinia = createPinia()
// Mounted inside a blurred .card like the real Well Plate editor, so the dialog
// is exercised with the same containing-block trap the app has.
const app = createApp({ render: () => h('div', { class: 'card', style: 'margin: 40px; min-height: 200px;' }, [
  h('h2', 'Well Plate (preview shell)'),
  h(Modal, { plate, initialTab: params.get('tab') || 'steps', onClose: () => {} }),
]) })
app.use(pinia)
const store = useLabStore()
store.user = { id: 'preview', email: 'preview@example.com' }
app.mount('#app')
