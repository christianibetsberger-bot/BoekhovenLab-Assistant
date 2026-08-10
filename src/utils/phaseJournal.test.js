import { describe, it, expect } from 'vitest'
import { buildFigureCard, buildPlateCard, buildMeasuredWellHtml } from './phaseJournal'

const name = (p) => ({ 0: 'Clear', 1: 'Transient coacervate', 2: 'Metastable / aggregate' }[p] || `Phase ${p}`)
const colour = (p, a = 1) => `rgba(${p * 40},100,200,${a})`
const PNG = 'data:image/png;base64,iVBORw0KGgo='

describe('buildFigureCard', () => {
  it('embeds the image with its title and caption', () => {
    const html = buildFigureCard({ title: 'Coacervation kinetics', dataUrl: PNG, caption: '96 wells, 16 h' })
    expect(html).toContain(PNG)
    expect(html).toContain('Coacervation kinetics')
    expect(html).toContain('96 wells, 16 h')
    expect(html).toContain('<img')
  })

  it('renders meta lines and skips empty ones', () => {
    const html = buildFigureCard({
      title: 'Map', dataUrl: PNG,
      meta: [{ label: 'Run', value: 'CTI-132.xml' }, { label: 'Plate', value: '' }, { label: 'Nope', value: null }],
    })
    expect(html).toContain('Run:')
    expect(html).toContain('CTI-132.xml')
    expect(html).not.toContain('Plate:')
    expect(html).not.toContain('Nope')
  })

  it('returns nothing when there is no image, rather than an empty frame', () => {
    expect(buildFigureCard({ title: 'x', dataUrl: '' })).toBe('')
    expect(buildFigureCard({ title: 'x' })).toBe('')
    expect(buildFigureCard()).toBe('')
  })

  it('refuses anything that is not an image data URL', () => {
    // A journal entry is rendered as HTML, so a src nobody vetted is a way in.
    expect(buildFigureCard({ title: 'x', dataUrl: 'javascript:alert(1)' })).toBe('')
    expect(buildFigureCard({ title: 'x', dataUrl: 'https://example.com/a.png' })).toBe('')
    expect(buildFigureCard({ title: 'x', dataUrl: 'data:text/html,<script>' })).toBe('')
  })

  it('escapes a title that came from a file name', () => {
    const html = buildFigureCard({ title: '<img src=x onerror=alert(1)>', dataUrl: PNG })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
  })
})

describe('buildPlateCard', () => {
  const items = [
    { wellId: 'A1', phase: 1 },
    { wellId: 'A2', phase: 0 },
    { wellId: 'B1', phase: 2, manual: true },
  ]

  it('draws a full grid, including the wells that were never read', () => {
    const html = buildPlateCard({ items, phaseName: name, phaseColor: colour })
    // 8 row labels + 12 column labels are always present, so the plate reads as
    // a plate rather than as a list of the wells that happened to work.
    for (const r of 'ABCDEFGH') expect(html).toContain(`>${r}</td>`)
    expect(html).toContain('>12</td>')
  })

  it('counts each phase in the legend', () => {
    const html = buildPlateCard({ items, phaseName: name, phaseColor: colour })
    expect(html).toContain('Transient coacervate — 1')
    expect(html).toContain('Clear — 1')
    expect(html).toContain('Metastable / aggregate — 1')
  })

  it('marks hand-set wells, in the grid and in the legend', () => {
    const html = buildPlateCard({ items, phaseName: name, phaseColor: colour })
    expect(html).toContain('2px solid')     // the thicker ring on B1
    expect(html).toContain('1 set by hand')
    expect(html).toContain('set by hand')
  })

  it('puts the well, its phase and any detail in the tooltip', () => {
    const html = buildPlateCard({
      items: [{ wellId: 'C4', phase: 1, detail: 'onset 42 min' }],
      phaseName: name, phaseColor: colour,
    })
    expect(html).toContain('title="C4 · Transient coacervate · onset 42 min"')
  })

  it('reports how many wells were classified', () => {
    expect(buildPlateCard({ items, phaseName: name, phaseColor: colour }))
      .toContain('Wells classified:')
  })

  it('handles a 384-well width without losing the row labels', () => {
    const html = buildPlateCard({ items, phaseName: name, phaseColor: colour, cols: 24 })
    expect(html).toContain('>24</td>')
    expect(html).toContain('>H</td>')
  })

  it('is case-insensitive about well ids', () => {
    const html = buildPlateCard({ items: [{ wellId: 'a1', phase: 1 }], phaseName: name, phaseColor: colour })
    expect(html).toContain('title="A1 · Transient coacervate"')
  })

  it('returns nothing when no well was classified', () => {
    expect(buildPlateCard({ items: [], phaseName: name, phaseColor: colour })).toBe('')
    expect(buildPlateCard()).toBe('')
  })

  it('survives missing colour and name helpers rather than throwing', () => {
    const html = buildPlateCard({ items })
    expect(html).toContain('Phase 1')
    expect(html).toContain('<table')
  })

  it('escapes a plate name typed by the user', () => {
    const html = buildPlateCard({
      items, phaseName: name, phaseColor: colour,
      title: 'Plate </td><script>alert(1)</script>',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('buildMeasuredWellHtml', () => {
  it('keeps the composition and adds the phase underneath', () => {
    const existing = '<strong>K10:</strong> 40.00 µL (5 mM)<br>'
    const html = buildMeasuredWellHtml({ existingHtml: existing, phase: 1, phaseName: name, phaseColor: colour })
    expect(html.startsWith(existing)).toBe(true)
    expect(html).toContain('Transient coacervate')
  })

  it('notes when the call was made by hand', () => {
    const html = buildMeasuredWellHtml({ phase: 2, phaseName: name, phaseColor: colour, manual: true })
    expect(html).toContain('set by hand')
  })

  it('works on an empty well', () => {
    expect(buildMeasuredWellHtml({ phase: 0, phaseName: name, phaseColor: colour })).toContain('Clear')
  })

  it('escapes the detail string', () => {
    const html = buildMeasuredWellHtml({ phase: 1, phaseName: name, phaseColor: colour, detail: '<b>x</b>' })
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;')
  })
})
