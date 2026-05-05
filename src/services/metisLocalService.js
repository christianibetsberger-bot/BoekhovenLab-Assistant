// Singleton wrapper around metisWorker.js.
//
// Exposes Promise-based API matching the shape of callBackend(ENDPOINTS.suggest)
// and callBackend(ENDPOINTS.sequencePredict) so LidaKinetics.vue can swap
// engines without restructuring the call sites.

let worker = null
let readyPromise = null
let nextRequestId = 1

function getWorker() {
  if (!worker) {
    // Classic worker required — Pyodide uses importScripts.
    worker = new Worker(new URL('../workers/metisWorker.js', import.meta.url))
  }
  return worker
}

function ensureReady(onProgress) {
  if (readyPromise) {
    if (onProgress) attachProgressListener(onProgress)
    return readyPromise
  }

  readyPromise = new Promise((resolve, reject) => {
    const w = getWorker()
    const handler = (e) => {
      const msg = e.data
      if (msg.type === 'progress' && onProgress) onProgress(msg.text)
      if (msg.type === 'ready') {
        w.removeEventListener('message', handler)
        resolve()
      }
      if (msg.type === 'error' && msg.id == null) {
        w.removeEventListener('message', handler)
        readyPromise = null
        reject(new Error(msg.message))
      }
    }
    w.addEventListener('message', handler)
    w.postMessage({ type: 'init' })
  })

  return readyPromise
}

function attachProgressListener(onProgress) {
  const w = getWorker()
  const handler = (e) => {
    if (e.data.type === 'progress') onProgress(e.data.text)
    if (e.data.type === 'ready' || e.data.type === 'error') {
      w.removeEventListener('message', handler)
    }
  }
  w.addEventListener('message', handler)
}

/**
 * Run METIS Suggest Next locally via Pyodide.
 * @param {object} payload  - { experiments, ranges, nSuggestions, explorationCoeff, ensembleSize, poolSize }
 * @param {function?} onProgress
 * @returns {Promise<{ suggestions: Array, note?: string }>}
 */
export async function suggestNextLocal(payload, onProgress) {
  await ensureReady(onProgress)

  const id = nextRequestId++
  const w = getWorker()
  const cloneable = JSON.parse(JSON.stringify(payload))

  return new Promise((resolve, reject) => {
    const handler = (e) => {
      const msg = e.data
      if (msg.type === 'progress' && onProgress) { onProgress(msg.text); return }
      if (msg.id !== id) return
      if (msg.type === 'result') {
        w.removeEventListener('message', handler)
        resolve({ suggestions: msg.suggestions, note: msg.note })
      }
      if (msg.type === 'error') {
        w.removeEventListener('message', handler)
        reject(new Error(msg.message))
      }
    }
    w.addEventListener('message', handler)
    w.postMessage({ type: 'suggest', id, payload: cloneable })
  })
}

/**
 * Run METIS Predict Sequence locally via Pyodide.
 * @param {object} payload  - { experiments, topK, ensembleSize, poolSize }
 * @param {function?} onProgress
 * @returns {Promise<{ candidates: Array }>}
 */
export async function predictSequenceLocal(payload, onProgress) {
  await ensureReady(onProgress)

  const id = nextRequestId++
  const w = getWorker()
  const cloneable = JSON.parse(JSON.stringify(payload))

  return new Promise((resolve, reject) => {
    const handler = (e) => {
      const msg = e.data
      if (msg.type === 'progress' && onProgress) { onProgress(msg.text); return }
      if (msg.id !== id) return
      if (msg.type === 'result') {
        w.removeEventListener('message', handler)
        resolve({ candidates: msg.candidates })
      }
      if (msg.type === 'error') {
        w.removeEventListener('message', handler)
        reject(new Error(msg.message))
      }
    }
    w.addEventListener('message', handler)
    w.postMessage({ type: 'sequence-predict', id, payload: cloneable })
  })
}

export function isMetisEngineReady() {
  return readyPromise !== null && worker !== null
}

export function preloadMetisEngine(onProgress) {
  return ensureReady(onProgress).catch(() => {})
}
