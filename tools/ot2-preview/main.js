// Dev-only preview of the OT-2 export dialog, outside the app shell and its login.
// Serve with `npm run dev`, then open
//   /BoekhovenLab-Assistant/tools/ot2-preview/index.html?case=multi&tab=deck
// case: basic | multi | modules      tab: robot | deck | steps | code
import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import '../../src/style.css'
import Modal from '../../src/components/OpentronsExportModal.vue'
import { useLabStore } from '../../src/stores/labStore'

import { fixture } from './fixtures.js'

const params = new URLSearchParams(location.search)
const { plate, cfg } = fixture(params.get('case') || 'basic')
if (params.get('name')) plate.name = params.get('name')
if (params.get('pipettes') === 'p20') cfg.pipettes = { left: '', right: 'p20_single_gen2' }
plate.ot2 = cfg

const pinia = createPinia()
// Mounted inside a blurred .card like the real Well Plate editor, so the dialog
// is exercised with the same containing-block trap the app has.
const app = createApp({ render: () => h('div', { class: 'card', style: 'margin: 40px; min-height: 200px;' }, [
  h('h2', 'Well Plate (preview shell)'),
  h(Modal, { plate, initialTab: params.get('tab') || 'steps', initialAction: Number(params.get('action') || 0), onClose: () => {} }),
]) })
app.use(pinia)
const store = useLabStore()
store.user = { id: 'preview', email: 'preview@example.com' }
app.mount('#app')
