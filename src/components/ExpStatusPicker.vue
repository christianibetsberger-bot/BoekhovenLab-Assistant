<script setup>
// Compact experiment-status picker — the same four labels as the Lab Journal
// (in progress / success / failure / to be repeated). Used by the planners so a
// saved plan can be marked finished; anything other than "in progress" logs the
// plan's compounds into the inventory usage history.
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({ modelValue: { type: String, default: 'in_progress' } })
const emit = defineEmits(['update:modelValue'])

const STATUSES = [
  { id: 'in_progress', label: 'In progress', icon: 'fa-spinner', color: '#C77700' },
  { id: 'success', label: 'Success', icon: 'fa-circle-check', color: '#009E73' },
  { id: 'failure', label: 'Failure', icon: 'fa-circle-xmark', color: '#D55E00' },
  { id: 'repeat', label: 'To be repeated', icon: 'fa-rotate-right', color: '#0072B2' },
]
const open = ref(false)
const rootEl = ref(null)
const current = computed(() => STATUSES.find(s => s.id === props.modelValue) || STATUSES[0])
function pick(id) { emit('update:modelValue', id); open.value = false }
function onDocClick(e) { if (rootEl.value && !rootEl.value.contains(e.target)) open.value = false }
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="rootEl" class="esp-wrap" :title="'Experiment status — anything other than “In progress” logs the compounds used into their usage history'">
    <button class="esp-pill" :style="{ '--esp': current.color }" @click.stop="open = !open">
      <i class="fas" :class="current.icon"></i> {{ current.label }} <i class="fas fa-caret-down" style="opacity:.6;"></i>
    </button>
    <div v-if="open" class="esp-menu">
      <button v-for="s in STATUSES" :key="s.id" class="esp-item" :class="{ on: s.id === current.id }" @click.stop="pick(s.id)">
        <i class="fas" :class="s.icon" :style="{ color: s.color }"></i> {{ s.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.esp-wrap { position: relative; display: inline-flex; }
.esp-pill { display: inline-flex; align-items: center; gap: 5px; font-size: 0.72rem; font-weight: 600; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--esp); color: var(--esp); background: color-mix(in srgb, var(--esp) 12%, transparent); cursor: pointer; box-shadow: none; line-height: 1.4; }
.esp-menu { position: absolute; top: calc(100% + 4px); left: 0; z-index: 50; min-width: 160px; background: var(--modal, #fff); border: 1px solid var(--ln, #e2e8f0); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.18); padding: 4px; display: flex; flex-direction: column; }
.esp-item { display: flex; align-items: center; gap: 8px; font-size: 0.78rem; padding: 7px 10px; border: none; background: transparent; color: inherit; text-align: left; border-radius: 7px; cursor: pointer; box-shadow: none; }
.esp-item:hover { background: var(--fl, #f1f5f9); }
.esp-item.on { font-weight: 700; }
</style>
