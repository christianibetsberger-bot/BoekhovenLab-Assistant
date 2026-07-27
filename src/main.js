import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'

// ── Node-global shims for ketcher-react ──
// The structure editor and its bundled deps reach for Node globals (global,
// process, Buffer) that don't exist in the browser. Define minimal stand-ins
// before anything imports Ketcher so those references resolve instead of
// throwing a ReferenceError (which otherwise leaves the editor blank).
if (typeof globalThis.global === 'undefined') globalThis.global = globalThis
if (typeof globalThis.process === 'undefined') {
  globalThis.process = {
    env: {}, browser: true, version: '', versions: {}, platform: 'browser',
    nextTick: (cb, ...a) => Promise.resolve().then(() => cb(...a)),
    emit() {}, on() {}, once() {}, off() {}, addListener() {}, removeListener() {}, cwd: () => '/',
  }
}
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = { isBuffer: () => false, from: (v) => v, alloc: () => [] }
}

// crypto.randomUUID() only exists in a *secure context* (HTTPS or localhost).
// When the dev server is opened on a phone via http://<lan-ip>:5173 it is not
// secure, so randomUUID is undefined and any "add" (well plate, reaction, …)
// throws. Polyfill it from getRandomValues, which is available everywhere.
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  const uuid = () =>
    '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
      (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
    )
  try { crypto.randomUUID = uuid } catch { try { Object.defineProperty(crypto, 'randomUUID', { value: uuid }) } catch { /* noop */ } }
}

const app = createApp(App)
app.use(createPinia()) // This turns on your global store!
app.mount('#app')