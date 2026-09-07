// Dev-only preview of the Well Plate editor outside the app shell and its login,
// with a fixture plate, a small inventory and a selected well.
//   plate.html?open=1   → opens the exchange menu on the first component row
//   &dark=1             → dark theme
import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import '../../src/style.css'
import WellPlateEditor from '../../src/components/WellPlateEditor.vue'
import { useLabStore } from '../../src/stores/labStore'
import { fixture } from './fixtures.js'

const params = new URLSearchParams(location.search)
// Surface runtime errors in the DOM so a headless dump can read them.
const errBox = document.createElement('pre'); errBox.id = 'preview-errors'; errBox.style.cssText = 'position:fixed;left:0;bottom:0;max-width:100%;font:11px monospace;background:#fee;color:#900;z-index:99999;margin:0;padding:4px;white-space:pre-wrap'
document.body.appendChild(errBox)
const logErr = (m) => { errBox.textContent += m + '\n' }
window.addEventListener('error', e => logErr('error: ' + e.message + ' @ ' + (e.filename || '') + ':' + e.lineno))
window.addEventListener('unhandledrejection', e => logErr('rejection: ' + (e.reason?.message || e.reason)))
if (params.get('dark')) { document.documentElement.classList.add('dark-mode'); document.body.classList.add('dark-mode') }

const pinia = createPinia()
const app = createApp({ render: () => h('div', { style: 'padding: 24px; max-width: 1200px;' }, [h(WellPlateEditor)]) })
app.use(pinia)
app.config.errorHandler = (err, inst, info) => logErr('vue: ' + (err?.message || err) + ' [' + info + ']')
const store = useLabStore()
store.user = { id: 'preview', email: 'preview@example.com' }
store.inventory = [
  { id: 'inv-C1', code: 'C1', name: 'K10 peptide', stock: 10, stockUnit: 'mM', scope: 'Global' },
  { id: 'inv-C2', code: 'C2', name: 'pU RNA', stock: 8, stockUnit: 'mM', scope: 'Global' },
  { id: 'inv-C3', code: 'C3', name: 'K12 peptide', stock: 5, stockUnit: 'mM', scope: 'Global' },
  { id: 'inv-C4', code: 'C4', name: 'R10 peptide', stock: 12, stockUnit: 'mM', scope: 'Global' },
  { id: 'inv-S1', code: 'S1', name: 'NaCl', stock: 5, stockUnit: 'M', scope: 'Global' },
  { id: 'inv-P1', code: 'P1', name: 'K10 peptide (fresh batch)', stock: 9.6, stockUnit: 'mM', scope: 'Personal' },
]
const { plate } = fixture('basic')
plate.selectedWell = 'A1'
plate.scope = 'Personal'
plate.owner_id = 'preview'
store.wellPlates = [plate]
app.mount('#app')

if (params.get('scroll')) setTimeout(() => document.querySelector('.well-editor-panel')?.scrollIntoView({ block: 'center', behavior: 'instant' }), 500)
if (params.get('open')) setTimeout(() => document.querySelector('[data-test="exchange-0"]')?.click(), 1400)
