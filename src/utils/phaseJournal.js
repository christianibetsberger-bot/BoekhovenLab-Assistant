import { esc } from './htmlSafe'

/**
 * Journal cards for the Phase Map module.
 *
 * These build the HTML that gets appended into a Lab Journal entry. They are
 * pure on purpose — no store, no DOM, no Plotly — so the markup can be tested
 * without a browser, which is the only way it gets tested at all here.
 *
 * Everything the caller supplies is user data: component names, plate names,
 * file names off disk. All of it goes through esc(). The journal is sanitised
 * again on the way into the database, but a card that only survives because
 * something downstream cleans up after it is a card with a bug in it.
 *
 * Colours and phase names are injected rather than imported so a card always
 * matches the legend the user was looking at when they pressed the button —
 * including phases they renamed after a kinetic run.
 */

const ROW_LETTERS = 'ABCDEFGH'

// Journal entries are read in both themes and printed. Inline styles are the
// only thing that survives the sanitiser's attribute allowlist, so the cards
// carry their own colours rather than relying on the app's CSS variables.
const CARD = 'border:1px solid rgba(128,128,128,0.35); border-radius:6px; padding:12px 14px; margin:14px 0;'
const H = 'font-weight:700; font-size:0.95rem; margin-bottom:2px;'
const SUB = 'font-size:0.75rem; opacity:0.7; line-height:1.5;'

/** One "label: value" line, skipped entirely when there is no value. */
const metaLine = (rows) => (rows || [])
  .filter(r => r && r.value !== '' && r.value != null)
  .map(r => `<div><strong>${esc(r.label)}:</strong> ${esc(String(r.value))}</div>`)
  .join('')

/**
 * A figure captured from one of the Plotly views.
 *
 * @param {object} o
 * @param {string} o.title    heading shown above the image
 * @param {string} o.dataUrl  a data: URL from Plotly.toImage
 * @param {string} [o.caption]
 * @param {Array<{label:string,value:any}>} [o.meta]
 * @returns {string} HTML, or '' when there is no image to show
 */
export function buildFigureCard({ title, dataUrl, caption = '', meta = [] } = {}) {
  if (!dataUrl || !String(dataUrl).startsWith('data:image/')) return ''
  const lines = metaLine(meta)
  return `<div style="${CARD}">`
    + `<div style="${H}">${esc(title || 'Figure')}</div>`
    + (caption ? `<div style="${SUB}">${esc(caption)}</div>` : '')
    + (lines ? `<div style="${SUB}margin-top:4px;">${lines}</div>` : '')
    + `<img src="${esc(dataUrl)}" alt="${esc(title || 'Figure')}" `
    + `style="max-width:100%; height:auto; margin-top:10px; border-radius:4px;" />`
    + `</div>`
}

/**
 * The plate as it was read: one cell per well, coloured by measured phase.
 *
 * This is the record of what the reader actually said, so an empty well is
 * drawn as empty rather than skipped — a gap in the plate is a result too, and
 * a grid with holes in it is the honest picture of a partial run.
 *
 * @param {object} o
 * @param {Array<{wellId:string, phase:number, manual?:boolean, detail?:string}>} o.items
 * @param {(phase:number)=>string} o.phaseName
 * @param {(phase:number, alpha?:number)=>string} o.phaseColor
 * @param {string} [o.title]
 * @param {Array<{label:string,value:any}>} [o.meta]
 * @param {number} [o.cols=12]
 * @param {number} [o.rows=8]
 * @returns {string} HTML, or '' when there is nothing to draw
 */
export function buildPlateCard({
  items, phaseName, phaseColor, title = 'Plate read', meta = [], cols = 12, rows = 8,
} = {}) {
  const list = (items || []).filter(i => i && i.wellId)
  if (!list.length) return ''

  const name = typeof phaseName === 'function' ? phaseName : (p) => `Phase ${p}`
  const colour = typeof phaseColor === 'function' ? phaseColor : () => 'transparent'

  const byWell = new Map(list.map(i => [String(i.wellId).toUpperCase(), i]))
  const nRows = Math.max(1, Math.min(ROW_LETTERS.length, rows))
  const nCols = Math.max(1, cols)

  const th = 'border:none; font-size:0.62rem; opacity:0.55; padding:1px 2px; text-align:center; font-weight:600;'
  let html = `<div style="${CARD}">`
    + `<div style="${H}">${esc(title)}</div>`

  const lines = metaLine([...meta, { label: 'Wells classified', value: list.length }])
  if (lines) html += `<div style="${SUB}margin-top:2px;">${lines}</div>`

  html += `<div style="overflow-x:auto; margin-top:10px;">`
    + `<table style="border-collapse:separate; border-spacing:2px; table-layout:fixed;"><tbody>`
    + `<tr><td style="${th}"></td>`
  for (let c = 1; c <= nCols; c++) html += `<td style="${th}">${c}</td>`
  html += `</tr>`

  for (let r = 0; r < nRows; r++) {
    const letter = ROW_LETTERS[r]
    html += `<tr><td style="${th}">${letter}</td>`
    for (let c = 1; c <= nCols; c++) {
      const item = byWell.get(`${letter}${c}`)
      if (!item) {
        html += `<td style="border:1px solid rgba(128,128,128,0.22); border-radius:3px;`
          + ` width:26px; height:20px;"></td>`
        continue
      }
      const p = Number(item.phase)
      // A hand-set class outranks the thresholds, so it is drawn as one — a
      // solid ring. Otherwise a reader looking back cannot tell which calls
      // were the instrument's and which were somebody's judgement.
      const ring = item.manual ? '2px solid' : '1px solid'
      const tip = [`${letter}${c}`, name(p), item.manual ? 'set by hand' : '', item.detail || '']
        .filter(Boolean).join(' · ')
      html += `<td title="${esc(tip)}" style="background:${esc(colour(p, 0.42))};`
        + ` border:${ring} ${esc(colour(p, 1))}; border-radius:3px;`
        + ` width:26px; height:20px;"></td>`
    }
    html += `</tr>`
  }
  html += `</tbody></table></div>`

  // Legend, in the order the phases appear on the plate rather than numerically —
  // it reads as a summary of this run, not of the whole phase vocabulary.
  const seen = []
  for (const i of list) if (!seen.includes(Number(i.phase))) seen.push(Number(i.phase))
  const counts = seen.map(p => ({ p, n: list.filter(i => Number(i.phase) === p).length }))
  html += `<div style="display:flex; flex-wrap:wrap; gap:4px 14px; margin-top:9px; ${SUB}">`
  for (const { p, n } of counts) {
    html += `<span><span style="display:inline-block; width:9px; height:9px; border-radius:2px;`
      + ` background:${esc(colour(p, 0.42))}; border:1px solid ${esc(colour(p, 1))};`
      + ` margin-right:5px;"></span>${esc(name(p))} — ${n}</span>`
  }
  const manual = list.filter(i => i.manual).length
  if (manual) html += `<span style="opacity:0.75;">${manual} set by hand</span>`
  html += `</div></div>`
  return html
}

/**
 * Well HTML for a plate that records what was measured.
 *
 * Deliberately additive: the composition the well already carried is kept
 * verbatim above the phase line, because the plate is only worth saving if it
 * still says what was in the well as well as what happened in it.
 */
export function buildMeasuredWellHtml({ existingHtml = '', phase, phaseName, phaseColor, manual = false, detail = '' } = {}) {
  const name = typeof phaseName === 'function' ? phaseName : (p) => `Phase ${p}`
  const colour = typeof phaseColor === 'function' ? phaseColor : () => 'transparent'
  const p = Number(phase)
  const banner = `<div style="margin-top:4px; padding:2px 6px; border-radius:3px;`
    + ` background:${esc(colour(p, 0.28))}; border-left:3px solid ${esc(colour(p, 1))};`
    + ` font-size:0.7rem;"><strong>${esc(name(p))}</strong>`
    + (manual ? ` <span style="opacity:0.7;">(set by hand)</span>` : '')
    + (detail ? ` <span style="opacity:0.7;">${esc(detail)}</span>` : '')
    + `</div>`
  return `${existingHtml || ''}${banner}`
}
