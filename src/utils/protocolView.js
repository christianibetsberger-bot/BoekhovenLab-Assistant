// Shared protocol renderers — used both to insert a protocol into a journal
// entry (Protocols.vue) and to show it inline under an instrument's logbook
// (InstrumentBooking.vue). Kept framework-free so either component can use it.
import { esc } from './htmlSafe'

// Types that use the recipe model (reaction scheme / sequence / reagents / steps).
export const RECIPE_TYPES = ['Synthesis', 'Peptide', 'DNA']
export function isRecipeType(t) { return RECIPE_TYPES.includes(t) }

// Full HTML card for a protocol (tables for HPLC method / gradient / peaks /
// parameters, plus the free-text procedure). Styles use the app's CSS vars so
// it renders correctly wherever it is dropped in.
export function protocolHtml(p) {
  const row = (k, v) => v || v === 0 ? `<tr><td style="padding:3px 8px;border:1px solid var(--border);"><strong>${esc(k)}</strong></td><td style="padding:3px 8px;border:1px solid var(--border);">${esc(String(v))}</td></tr>` : ''
  let html = `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin:10px 0;background:var(--surface);">`
  html += `<h3 style="margin:0 0 8px;color:var(--primary);"><i class="fas fa-vial-circle-check"></i> ${esc(p.name)} <span style="font-size:.7rem;opacity:.6;">· ${esc(p.type)} protocol${p.instrument ? ' · ' + esc(p.instrument) : ''}</span></h3>`
  if (p.type === 'HPLC') {
    html += `<table style="border-collapse:collapse;font-size:.8rem;margin-bottom:8px;">`
    html += row('Column', p.column) + row('Column lot', p.columnLot) + row('Temperature', p.temperature != null ? p.temperature + ' °C' : '') +
      row('Flow rate', p.flowRate != null ? p.flowRate + ' mL/min' : '') + row('Injection', p.injectionVolume != null ? p.injectionVolume + ' µL' : '') +
      row('Detection', p.detection) + row('Eluent A', p.eluents?.A) + row('Eluent B', p.eluents?.B) + row('Eluent C', p.eluents?.C) + row('Eluent D', p.eluents?.D)
    html += `</table>`
    if (p.gradient?.length) {
      html += `<div style="font-weight:600;font-size:.78rem;margin:6px 0 3px;">Gradient (Chromeleon)</div><table style="border-collapse:collapse;font-size:.78rem;margin-bottom:8px;"><thead><tr><th style="padding:3px 8px;border:1px solid var(--border);background:var(--summary-bg);">Time (min)</th><th style="padding:3px 8px;border:1px solid var(--border);background:var(--summary-bg);">%B</th><th style="padding:3px 8px;border:1px solid var(--border);background:var(--summary-bg);">Curve</th></tr></thead><tbody>`
      for (const r of p.gradient) html += `<tr><td style="padding:3px 8px;border:1px solid var(--border);">${esc(r.time)}</td><td style="padding:3px 8px;border:1px solid var(--border);">${esc(r.pctB)}</td><td style="padding:3px 8px;border:1px solid var(--border);">${esc(r.curve ?? 5)}</td></tr>`
      html += `</tbody></table>`
    }
    if (p.peaks?.length) {
      html += `<div style="font-weight:600;font-size:.78rem;margin:6px 0 3px;">Expected peaks</div><table style="border-collapse:collapse;font-size:.78rem;margin-bottom:8px;"><thead><tr><th style="padding:3px 8px;border:1px solid var(--border);background:var(--summary-bg);">Compound</th><th style="padding:3px 8px;border:1px solid var(--border);background:var(--summary-bg);">RT (min)</th></tr></thead><tbody>`
      for (const r of p.peaks) html += `<tr><td style="padding:3px 8px;border:1px solid var(--border);">${esc(r.name)}</td><td style="padding:3px 8px;border:1px solid var(--border);">${esc(r.rt)}</td></tr>`
      html += `</tbody></table>`
    }
  }
  // Synthesis / Peptide / DNA — reaction scheme, sequence, reagents, and a
  // recipe of numbered steps with their conditions (temperature, time, etc.).
  if (isRecipeType(p.type)) {
    if (p.scheme && p.scheme.img) {
      html += `<div style="margin:6px 0;"><img src="${esc(p.scheme.img)}" alt="Reaction scheme" style="max-width:100%;border:1px solid var(--border);border-radius:8px;background:#fff;padding:4px;"></div>`
    }
    const dir = p.type === 'DNA' ? "5'→3'" : p.type === 'Peptide' ? 'N→C' : ''
    if (p.sequence) html += `<div style="font-size:.82rem;margin:4px 0;"><strong>Sequence${dir ? ` (${dir})` : ''}:</strong> <code style="font-family:ui-monospace,monospace;word-break:break-all;">${esc(p.sequence)}</code></div>`
    if (p.scale != null && p.scale !== '') html += `<div style="font-size:.82rem;margin:4px 0;"><strong>Scale:</strong> ${esc(String(p.scale))} ${esc(p.scaleUnit || '')}</div>`
    const reagents = (p.reagents || []).filter(r => r.name || r.amount || r.equiv)
    if (reagents.length) {
      html += `<div style="font-weight:600;font-size:.78rem;margin:8px 0 3px;">Reagents</div><table style="border-collapse:collapse;font-size:.78rem;margin-bottom:8px;"><thead><tr><th style="padding:3px 8px;border:1px solid var(--border);background:var(--summary-bg);text-align:left;">Reagent</th><th style="padding:3px 8px;border:1px solid var(--border);background:var(--summary-bg);">Amount</th><th style="padding:3px 8px;border:1px solid var(--border);background:var(--summary-bg);">Equiv</th></tr></thead><tbody>`
      for (const r of reagents) html += `<tr><td style="padding:3px 8px;border:1px solid var(--border);">${esc(r.name)}</td><td style="padding:3px 8px;border:1px solid var(--border);">${esc(String(r.amount ?? ''))}</td><td style="padding:3px 8px;border:1px solid var(--border);">${esc(String(r.equiv ?? ''))}</td></tr>`
      html += `</tbody></table>`
    }
    const steps = (p.steps || []).filter(s => s.text || s.temp != null && s.temp !== '' || s.time || s.atmosphere)
    if (steps.length) {
      html += `<div style="font-weight:600;font-size:.78rem;margin:8px 0 3px;">Procedure steps</div><ol style="margin:0;padding-left:18px;font-size:.82rem;">`
      for (const s of steps) {
        const conds = []
        if (s.temp != null && s.temp !== '') conds.push(`${esc(String(s.temp))} °C`)
        if (s.time) conds.push(esc(String(s.time)))
        if (s.atmosphere) conds.push(esc(String(s.atmosphere)))
        html += `<li style="margin-bottom:4px;">${esc(s.text || '')}${conds.length ? ` <span style="opacity:.65;">— ${conds.join(' · ')}</span>` : ''}</li>`
      }
      html += `</ol>`
    }
  }
  if (p.params?.length) {
    html += `<table style="border-collapse:collapse;font-size:.8rem;margin-bottom:8px;">`
    for (const r of p.params) html += row(r.key, r.value)
    html += `</table>`
  }
  if (p.procedure) html += `<div style="font-size:.82rem;white-space:pre-wrap;">${esc(p.procedure)}</div>`
  html += `</div>`
  return html
}

// One-line human summary for compact lists (logbook rows, etc.).
export function protocolSummary(p) {
  if (p.type === 'HPLC') {
    const parts = []
    if (p.column) parts.push(p.column)
    const g = (p.gradient || []).filter(r => r.pctB != null)
    if (g.length) parts.push(`${g[0].pctB}→${g[g.length - 1].pctB}% B / ${g[g.length - 1].time} min`)
    if (p.flowRate != null) parts.push(`${p.flowRate} mL/min`)
    return parts.join(' · ')
  }
  if (isRecipeType(p.type)) {
    const parts = []
    if (p.sequence) parts.push(p.sequence.length > 26 ? p.sequence.slice(0, 26) + '…' : p.sequence)
    const nSteps = (p.steps || []).filter(s => s.text).length
    if (nSteps) parts.push(`${nSteps} step${nSteps > 1 ? 's' : ''}`)
    if (p.scale != null && p.scale !== '') parts.push(`${p.scale} ${p.scaleUnit || ''}`.trim())
    if (p.scheme && p.scheme.img) parts.push('scheme')
    if (parts.length) return parts.join(' · ')
  }
  if (p.params?.length) return p.params.map(r => r.key).filter(Boolean).slice(0, 3).join(' · ')
  return (p.procedure || '').replace(/\s+/g, ' ').trim().slice(0, 80)
}
