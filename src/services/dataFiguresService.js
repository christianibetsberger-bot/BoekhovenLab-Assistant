// Data & Figures service: (1) a singleton wrapper around pyAnalysisWorker.js,
// and (2) scoped Supabase CRUD for the module's shareable entities.
//
// Entities all live in one table `datafig_items` (item_id / owner_id / scope /
// data jsonb) and are discriminated by data.kind:
//   'analysis_set' | 'plot_preset' | 'palette' | 'dataset'
// This mirrors the kinetics_data pattern (scope Personal/Global + RLS).

import { db } from './supabase'

// ── Pyodide worker wrapper (mirrors hplcLocalService.js) ─────────────────────
let worker = null
let readyPromise = null
let nextRequestId = 1

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/pyAnalysisWorker.js', import.meta.url))
  }
  return worker
}

function ensureReady(onProgress) {
  if (readyPromise) return readyPromise
  readyPromise = new Promise((resolve, reject) => {
    const w = getWorker()
    const handler = (e) => {
      const msg = e.data
      if (msg.type === 'progress' && onProgress) onProgress(msg.text)
      if (msg.type === 'ready') { w.removeEventListener('message', handler); resolve() }
      if (msg.type === 'error' && msg.id == null) {
        w.removeEventListener('message', handler); readyPromise = null; reject(new Error(msg.message))
      }
    }
    w.addEventListener('message', handler)
    w.postMessage({ type: 'init' })
  })
  return readyPromise
}

export function preloadAnalysisEngine(onProgress) {
  return ensureReady(onProgress).catch(() => {})
}

// Run a Python analysis set: code defines analyze(files, params). Resolves with
// the contract dict { columns, rows, traces }.
export async function runPythonAnalysis(code, files, params, packages, onProgress) {
  await ensureReady(onProgress)
  const id = nextRequestId++
  const w = getWorker()
  return new Promise((resolve, reject) => {
    const handler = (e) => {
      const msg = e.data
      if (msg.type === 'progress' && onProgress) { onProgress(msg.text); return }
      if (msg.id !== id) return
      if (msg.type === 'result') { w.removeEventListener('message', handler); resolve(msg.result) }
      if (msg.type === 'error') { w.removeEventListener('message', handler); reject(new Error(msg.message)) }
    }
    w.addEventListener('message', handler)
    w.postMessage({ type: 'analyze', id, code, files, params, packages })
  })
}

// Render a publication figure via matplotlib. `styleCode` from
// plotStyle.matplotlibStyleCode; `spec` = { type, data }. Resolves with a
// data URL ready for <img> / download.
export async function renderFigure(styleCode, spec, format = 'png', plotCode = null, onProgress) {
  await ensureReady(onProgress)
  const id = nextRequestId++
  const w = getWorker()
  return new Promise((resolve, reject) => {
    const handler = (e) => {
      const msg = e.data
      if (msg.type === 'progress' && onProgress) { onProgress(msg.text); return }
      if (msg.id !== id) return
      if (msg.type === 'image') {
        w.removeEventListener('message', handler)
        const mime = msg.format === 'svg' ? 'image/svg+xml' : msg.format === 'pdf' ? 'application/pdf' : 'image/png'
        resolve({ format: msg.format, dataUrl: `data:${mime};base64,${msg.dataBase64}`, base64: msg.dataBase64, mime })
      }
      if (msg.type === 'error') { w.removeEventListener('message', handler); reject(new Error(msg.message)) }
    }
    w.addEventListener('message', handler)
    w.postMessage({ type: 'renderFigure', id, styleCode, spec, format, plotCode })
  })
}

// ── Supabase CRUD (scoped Personal/Global) ───────────────────────────────────
const TABLE = 'datafig_items'

// List all items of a kind visible to the current user (own + Global via RLS).
export async function listItems(kind) {
  const { data, error } = await db.from(TABLE).select('*')
  if (error) { console.warn('[dataFigures] list failed:', error.message); return [] }
  return (data || [])
    .map(row => ({ ...row.data, owner_id: row.owner_id }))
    .filter(obj => !kind || obj.kind === kind)
}

// Upsert an item. `obj` must carry { id, kind, scope, ... }.
export async function saveItem(obj, ownerId) {
  const payload = {
    item_id: String(obj.id),
    owner_id: ownerId,
    scope: obj.scope || 'Personal',
    data: { ...obj, owner_id: ownerId },
  }
  const { error } = await db.from(TABLE).upsert(payload, { onConflict: 'item_id' })
  if (error) throw new Error(error.message)
  return payload.data
}

export async function deleteItem(id) {
  const { error } = await db.from(TABLE).delete().eq('item_id', String(id))
  if (error) throw new Error(error.message)
}
