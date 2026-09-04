// Renders one deck-map component over three fixture decks, light or dark.
//   deck.html?cand=A            → src/components/deckCandidates/OtDeckMapA.vue
//   deck.html?cand=current      → src/components/OtDeckMap.vue
//   &dark=1                     → dark theme
import { createApp, h } from 'vue'
import '../../src/style.css'
import { generateOpentronsProtocol } from '../../src/utils/opentronsExport.js'
import { fixture } from './fixtures.js'

const params = new URLSearchParams(location.search)
const cand = params.get('cand') || 'current'
if (params.get('dark')) { document.documentElement.classList.add('dark-mode'); document.body.classList.add('dark-mode') }

const candidates = import.meta.glob('../../src/components/deckCandidates/*.vue')
const load = cand === 'current'
  ? import('../../src/components/OtDeckMap.vue')
  : candidates[`../../src/components/deckCandidates/OtDeckMap${cand}.vue`]()

load.then(mod => {
  const Comp = mod.default
  const cases = ['basic', 'multi', 'modules'].map(which => {
    const { plate, cfg } = fixture(which)
    return { which, deck: generateOpentronsProtocol(plate, cfg).summary.deck }
  })
  createApp({ render: () => h('div', [
    h('h1', `Deck map candidate: ${cand}`),
    h('div', { class: 'row' }, cases.map(c => h('div', { class: 'cell' }, [h('div', { class: 'cap' }, c.which), h(Comp, { deck: c.deck })]))),
  ]) }).mount('#app')
})
