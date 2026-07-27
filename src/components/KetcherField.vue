<script setup>
// Thin Vue wrapper that mounts the React-based Ketcher editor. Loaded lazily
// (defineAsyncComponent) so React + Ketcher only ship when the user actually
// opens the structure editor — they stay out of the main bundle otherwise.
import { ref, onMounted, onBeforeUnmount, shallowRef } from 'vue'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Editor } from 'ketcher-react'
import { StandaloneStructServiceProvider } from 'ketcher-standalone'
import 'ketcher-react/dist/index.css'

const props = defineProps({ initialKet: { type: String, default: '' } })
const emit = defineEmits(['ready'])

const host = ref(null)
let root = null
const ketcher = shallowRef(null)
const structServiceProvider = new StandaloneStructServiceProvider()

onMounted(() => {
  root = createRoot(host.value)
  root.render(
    React.createElement(Editor, {
      staticResourcesUrl: '',
      structServiceProvider,
      errorHandler: (m) => console.error('Ketcher:', m),
      onInit: (k) => {
        ketcher.value = k
        if (props.initialKet) { Promise.resolve().then(() => { try { k.setMolecule(props.initialKet) } catch (e) { /* ignore bad payload */ } }) }
        emit('ready', k)
      },
    }),
  )
})
onBeforeUnmount(() => { if (root) root.unmount() })

defineExpose({ ketcher })
</script>

<template>
  <div ref="host" class="ketcher-host"></div>
</template>

<style scoped>
.ketcher-host { width: 100%; height: 460px; position: relative; }
.ketcher-host :deep(.Ketcher-root),
.ketcher-host :deep(.Ketcher-window) { height: 100%; width: 100%; }
</style>
