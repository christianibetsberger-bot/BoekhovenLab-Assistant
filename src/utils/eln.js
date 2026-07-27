// .eln (ELN Consortium file format) import/export.
//
// An .eln file is a ZIP containing an RO-Crate: a single top-level directory
// with a `ro-crate-metadata.json` (JSON-LD) describing the notebook. Each
// experiment is a Dataset node whose `text` holds the HTML body — the shape
// eLabFTW reads and writes. See https://github.com/TheELNConsortium/TheELNFileFormat.
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'

const CRATE_ROOT = 'Boekhoven-Journal'
const META = 'ro-crate-metadata.json'

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v])
const typeIncludes = (node, t) => asArray(node && node['@type']).includes(t)
const firstDate = (v) => { const a = asArray(v).find(Boolean); return typeof a === 'string' ? a : '' }

const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif|tiff?)$/i
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif', tif: 'image/tiff', tiff: 'image/tiff', pdf: 'application/pdf', csv: 'text/csv', txt: 'text/plain', json: 'application/json' }
const mimeOf = (name) => { const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/); return (m && MIME[m[1]]) || 'application/octet-stream' }
const escAttr = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
function toBase64(bytes) {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  return (typeof btoa !== 'undefined') ? btoa(bin) : Buffer.from(bytes).toString('base64')
}
const dataUrlOf = (bytes, name) => `data:${mimeOf(name)};base64,${toBase64(bytes)}`

// Rewrite relative <img src="…"> to embedded data-URLs using the crate's files.
function inlineImages(html, fileMap, consumed) {
  if (!html) return html
  return html.replace(/(<img\b[^>]*\bsrc\s*=\s*)(["'])(.*?)\2/gi, (m, pre, q, src) => {
    if (/^(data:|https?:|cid:)/i.test(src)) return m
    const clean = decodeURIComponent(src.trim()).replace(/^\.?\//, '').split(/[?#]/)[0]
    let key = clean, f = fileMap[key]
    if (!f) { const base = clean.split('/').pop(); key = Object.keys(fileMap).find((k) => k.split('/').pop() === base); f = key ? fileMap[key] : null }
    if (f) { consumed.add(key); return `${pre}${q}${dataUrlOf(f.bytes, f.name)}${q}` }
    return m
  })
}
const slugify = (s, fallback) => {
  const base = String(s || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return base || fallback
}
const toIso = (v) => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? '' : d.toISOString() }
const wrapHtml = (title, body) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`

// Build a .eln archive (Uint8Array) from journal entries.
// entries: [{ expId, date, content, created_at }]; user: { email, name }.
export function buildEln(entries, user = {}) {
  const files = {}
  const graph = []
  const now = new Date().toISOString()
  const authorId = user.email ? `#author-${slugify(user.email, 'user')}` : ''
  const parts = []

  entries.forEach((e, i) => {
    const name = e.expId || `Entry ${i + 1}`
    const slug = `${slugify(name, 'entry')}-${i + 1}`
    const dir = `./${slug}/`
    parts.push({ '@id': dir })
    files[`${CRATE_ROOT}/${slug}/entry.html`] = strToU8(wrapHtml(name, e.content || ''))
    const ds = {
      '@id': dir,
      '@type': 'Dataset',
      name,
      text: e.content || '',
      dateCreated: toIso(e.created_at) || toIso(e.date) || now,
      dateModified: now,
      keywords: 'Boekhoven Lab Assistant',
      encodingFormat: 'text/html',
      hasPart: [{ '@id': `${dir}entry.html` }],
    }
    if (authorId) ds.author = { '@id': authorId }
    graph.push(ds)
    graph.push({ '@id': `${dir}entry.html`, '@type': 'File', name: 'entry.html', encodingFormat: 'text/html' })
  })

  graph.unshift({ '@id': './', '@type': 'Dataset', name: 'Boekhoven Lab Journal', hasPart: parts })
  graph.unshift({
    '@id': META,
    '@type': 'CreativeWork',
    about: { '@id': './' },
    conformsTo: { '@id': 'https://w3id.org/ro/crate/1.1' },
    dateCreated: now,
    sdPublisher: { '@type': 'Organization', name: 'Boekhoven Lab Assistant' },
    version: '1.0',
  })
  if (authorId) graph.push({ '@id': authorId, '@type': 'Person', identifier: user.email, name: user.name || user.email })

  files[`${CRATE_ROOT}/${META}`] = strToU8(JSON.stringify({ '@context': 'https://w3id.org/ro/crate/1.1/context', '@graph': graph }, null, 2))
  return zipSync(files, { level: 6 })
}

// Parse a .eln archive (Uint8Array) → [{ name, html, date }].
export function parseEln(buf) {
  const unzipped = unzipSync(buf)
  const metaKey = Object.keys(unzipped).find((k) => k.endsWith(META))
  if (!metaKey) throw new Error('No ro-crate-metadata.json found — not a valid .eln file.')
  const rootPrefix = metaKey.slice(0, metaKey.length - META.length) // e.g. "Crate/"
  const crate = JSON.parse(strFromU8(unzipped[metaKey]))
  const graph = crate['@graph'] || []
  const byId = {}
  for (const n of graph) byId[n['@id']] = n

  const metaNode = graph.find((n) => typeIncludes(n, 'CreativeWork') && n.about) || {}
  const rootId = (metaNode.about && metaNode.about['@id']) || './'
  const root = byId[rootId] || byId['./']

  let datasets = asArray(root && root.hasPart).map((p) => byId[p['@id']]).filter((n) => n && typeIncludes(n, 'Dataset'))
  if (!datasets.length) datasets = graph.filter((n) => typeIncludes(n, 'Dataset') && n['@id'] !== rootId && n['@id'] !== './')

  // Every binary in the crate, keyed by path relative to the crate root.
  const fileMap = {}
  for (const key of Object.keys(unzipped)) {
    if (key === metaKey) continue
    if (rootPrefix && !key.startsWith(rootPrefix)) continue
    const rel = rootPrefix ? key.slice(rootPrefix.length) : key
    if (!rel || rel.endsWith('/')) continue
    fileMap[rel] = { bytes: unzipped[key], name: rel.split('/').pop() }
  }

  return datasets.map((d) => {
    let html = typeof d.text === 'string' ? d.text : ''
    let bodyRel = ''
    if (!html) {
      for (const p of asArray(d.hasPart)) {
        const rel = String(p['@id']).replace(/^\.\//, '')
        if (/\.html?$/i.test(rel) && fileMap[rel]) {
          const raw = strFromU8(fileMap[rel].bytes)
          const m = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
          html = m ? m[1] : raw
          bodyRel = rel
          break
        }
      }
    }

    // Inline any images the body references, then append the remaining
    // attachments (images inline, other files as downloadable chips) so
    // nothing from the .eln is lost.
    const consumed = new Set()
    html = inlineImages(html, fileMap, consumed)
    const extras = []
    for (const p of asArray(d.hasPart)) {
      const rel = String(p['@id']).replace(/^\.\//, '')
      if (rel === bodyRel || consumed.has(rel) || /\.html?$/i.test(rel)) continue
      const f = fileMap[rel]
      if (!f) continue
      if (IMG_EXT.test(rel)) {
        extras.push(`<div><img src="${dataUrlOf(f.bytes, f.name)}" alt="${escAttr(f.name)}" style="max-width:100%;height:auto;border-radius:6px;"></div>`)
      } else {
        extras.push(`<span class="file-attach" contenteditable="false" data-file="${toBase64(f.bytes)}" data-type="${mimeOf(f.name)}" data-name="${escAttr(f.name)}"><i class="fas fa-paperclip"></i> ${escAttr(f.name)}</span>`)
      }
    }
    if (extras.length) html += `<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;">${extras.join('')}</div>`

    return {
      name: d.name || d.identifier || d['@id'],
      html,
      date: (firstDate(d.dateCreated) || firstDate(d.dateModified) || '').slice(0, 10),
    }
  })
}
