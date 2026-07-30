<script setup>
// Dropdown of the user's saved buffers for a Phase Predictor Na⁺ medium.
// Selecting a saved buffer writes its name / Na⁺ / pH into the medium and records
// bufferId, which the parent uses to lock the Na⁺ field. "Custom" keeps the old
// free-text behaviour; "＋ Add buffer" saves a new buffer to the library.
import { ref } from 'vue'
import { useLabStore } from '../stores/labStore'

const props = defineProps({ medium: { type: Object, required: true } })
const store = useLabStore()

const adding = ref(false)
const draft = ref({ name: '', naMM: null, pH: 7.0 })

function currentValue() {
  if (props.medium.bufferId) return props.medium.bufferId
  return props.medium.bufName ? '__custom__' : ''
}
function onChange(e) {
  const v = e.target.value
  if (v === '__add__') {
    draft.value = { name: props.medium.bufName || '', naMM: props.medium.naMM || null, pH: props.medium.pH ?? 7.0 }
    adding.value = true
    return
  }
  if (v === '') { props.medium.bufferId = null; props.medium.bufName = ''; return }
  if (v === '__custom__') { props.medium.bufferId = null; return }   // keep name/Na⁺ editable
  const buf = store.buffers.find(b => b.id === v)
  if (buf) applyBuffer(buf)
}
function applyBuffer(buf) {
  props.medium.bufferId = buf.id
  props.medium.bufName = buf.name
  props.medium.naMM = Number(buf.naMM) || 0
  props.medium.pH = buf.pH == null ? 7.0 : Number(buf.pH)
}
function saveDraft() {
  if (!draft.value.name.trim()) return
  const buf = store.addBuffer(draft.value)
  applyBuffer(buf)
  adding.value = false
}
</script>

<template>
  <div class="pbuf" @click.stop>
    <select :value="currentValue()" @change="onChange" class="pbuf-select">
      <option value="">Select buffer…</option>
      <option v-for="b in store.buffers" :key="b.id" :value="b.id">{{ b.name }} · {{ b.naMM }} mM Na⁺</option>
      <option value="__custom__">Custom (type manually)</option>
      <option value="__add__">＋ Add buffer…</option>
    </select>
    <input v-if="!medium.bufferId && !adding" type="text" v-model="medium.bufName" placeholder="buffer name" class="pbuf-name">
    <div v-if="adding" class="pbuf-add">
      <input v-model="draft.name" placeholder="Name" class="pbuf-af name">
      <input v-model.number="draft.naMM" type="number" step="any" min="0" placeholder="Na⁺ mM" class="pbuf-af">
      <input v-model.number="draft.pH" type="number" step="0.1" min="0" max="14" placeholder="pH" class="pbuf-af">
      <button type="button" @click="saveDraft" class="pbuf-btn">Save</button>
      <button type="button" @click="adding = false" class="pbuf-btn ghost">✕</button>
    </div>
  </div>
</template>

<style scoped>
.pbuf { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pbuf-select, .pbuf-name { font-size: 0.78rem; padding: 3px 5px; }
.pbuf-add { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; }
.pbuf-af { font-size: 0.72rem; padding: 2px 4px; width: 62px; }
.pbuf-af.name { width: 90px; }
.pbuf-btn { font-size: 0.68rem; padding: 2px 7px; border: none; border-radius: 5px; background: var(--acc); color: #fff; cursor: pointer; box-shadow: none; }
.pbuf-btn.ghost { background: var(--fl); color: var(--tx2); }
</style>
