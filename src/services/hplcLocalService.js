// Singleton wrapper around hplcWorker.js — mirrors metisLocalService.js.
//
// Exposes:
//   preloadHplcEngine(onProgress)         – warm up Pyodide + hplc-py
//   processChromatograms(files, params, onProgress, onFileDone) – Promise<results>
//
// `files`     : [{ name, text }]
// `params`    : { scanMin, scanMax, prominence, baselineWindow, useHplcPy }
// `onProgress`: (text) => void
// `onFileDone`: ({ index, total, result }) => void  – streamed per file

let worker = null
let readyPromise = null
let nextRequestId = 1

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/hplcWorker.js', import.meta.url))
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

export async function processChromatograms(files, params, onProgress, onFileDone) {
  await ensureReady(onProgress)
  const id = nextRequestId++
  const w = getWorker()
  return new Promise((resolve, reject) => {
    const handler = (e) => {
      const msg = e.data
      if (msg.type === 'progress' && onProgress) { onProgress(msg.text); return }
      if (msg.type === 'file-done' && msg.id === id) {
        if (onFileDone) onFileDone({ index: msg.index, total: msg.total, result: msg.result })
        return
      }
      if (msg.id !== id) return
      if (msg.type === 'result') {
        w.removeEventListener('message', handler)
        resolve(msg.results)
      }
      if (msg.type === 'error') {
        w.removeEventListener('message', handler)
        reject(new Error(msg.message))
      }
    }
    w.addEventListener('message', handler)
    w.postMessage({ type: 'process', id, files, params })
  })
}

export function preloadHplcEngine(onProgress) {
  return ensureReady(onProgress).catch(() => {})
}

export function isHplcEngineReady() {
  return readyPromise !== null && worker !== null
}
