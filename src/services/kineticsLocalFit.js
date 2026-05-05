// Singleton wrapper around kineticsFitWorker.js.
//
// Exposes a Promise-based API that mirrors the shape of callBackend(ENDPOINTS.fit)
// so the call site in LidaKinetics.vue can swap engines without other changes:
//
//   const result = await fitKineticsLocal(payload, msg => fitNote.value = msg)
//   applyFits(result.fits)
//
// The worker is created lazily on first use, then kept alive for the lifetime
// of the page so subsequent fits skip the ~10 s Pyodide bootstrap.

let worker = null
let readyPromise = null
let nextRequestId = 1

// Note: classic worker (no { type: 'module' }) — Pyodide uses importScripts which
// requires a classic worker. The new URL(...) form lets Vite bundle the file.
function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/kineticsFitWorker.js', import.meta.url))
  }
  return worker
}

function ensureReady(onProgress) {
  if (readyPromise) {
    // Reuse the existing init promise but pipe progress through the new callback.
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
        // Init-time error (no request id attached).
        w.removeEventListener('message', handler)
        readyPromise = null  // allow retry on next call
        reject(new Error(msg.message))
      }
    }
    w.addEventListener('message', handler)
    w.postMessage({ type: 'init' })
  })

  return readyPromise
}

// Attaches a progress listener that fires on subsequent loads if init is already
// in flight from a different caller.
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
 * Run the LIDA replication-kinetics fit locally via Pyodide.
 *
 * @param {object} payload  - { experiments, limit_uM, A0, B0 }
 * @param {function?} onProgress - called with stage strings ('Downloading…', etc.)
 * @returns {Promise<{ fits: Array }>}  same shape as the /api/kinetics-fit response
 */
export async function fitKineticsLocal(payload, onProgress) {
  await ensureReady(onProgress)

  const id = nextRequestId++
  const w = getWorker()

  return new Promise((resolve, reject) => {
    const handler = (e) => {
      const msg = e.data
      if (msg.id !== id && msg.type !== 'progress') return
      if (msg.type === 'progress' && onProgress) {
        onProgress(msg.text)
        return
      }
      if (msg.type === 'result' && msg.id === id) {
        w.removeEventListener('message', handler)
        resolve({ fits: msg.fits })
      }
      if (msg.type === 'error' && msg.id === id) {
        w.removeEventListener('message', handler)
        reject(new Error(msg.message))
      }
    }
    w.addEventListener('message', handler)
    w.postMessage({ type: 'fit', id, payload })
  })
}

/** Whether Pyodide finished bootstrapping at least once this page load. */
export function isLocalEngineReady() {
  return readyPromise !== null && worker !== null
}

/** Pre-warm the engine in the background (e.g., on module mount). */
export function preloadLocalEngine(onProgress) {
  return ensureReady(onProgress).catch(() => {})
}
