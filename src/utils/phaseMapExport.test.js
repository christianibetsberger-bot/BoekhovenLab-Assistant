import { describe, it, expect } from 'vitest'
import { buildExportHtml, EXPORT_PLOTLY_VERSION } from './phaseMapExport'

// The inline <script> of the exported document. Everything the file does lives
// here, and a syntax error in it is invisible until someone opens the download —
// so the tests below parse it rather than pattern-matching it.
const inlineScript = (html) => {
  const open = html.lastIndexOf('<script>')
  const close = html.indexOf('</script>', open)
  expect(open).toBeGreaterThan(-1)
  expect(close).toBeGreaterThan(open)
  return html.slice(open + '<script>'.length, close)
}

const parses = (js) => {
  // eslint-disable-next-line no-new-func
  new Function(js)
  return true
}

const base = {
  title: 'PhaseMap_2026-08-06',
  frames: [[{ type: 'scatter3d', x: [1], y: [2], z: [3] }]],
  layout: { paper_bgcolor: '#000' },
}

describe('buildExportHtml', () => {
  it('writes a complete document that loads the Plotly it was built against', () => {
    const html = buildExportHtml(base)
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html.trimEnd().endsWith('</html>')).toBe(true)
    expect(html).toContain(`plotly-${EXPORT_PLOTLY_VERSION}.min.js`)
  })

  it('emits an inline script that is valid JavaScript', () => {
    expect(parses(inlineScript(buildExportHtml(base)))).toBe(true)
  })

  it('adds a slider only when there is more than one level to visit', () => {
    const one = buildExportHtml({ ...base, levels: [5] })
    expect(one).not.toContain('id="slider"')

    const many = buildExportHtml({
      ...base,
      frames: [[], [], []],
      levels: [0, 10, 20],
      startIndex: 2,
      sliderLabel: 'EDC',
      unit: 'mM',
    })
    expect(many).toContain('id="slider"')
    expect(many).toContain('max="2"')
    expect(many).toContain('value="2"')
    expect(many).toContain('<strong>EDC</strong>')
    expect(parses(inlineScript(many))).toBe(true)
  })

  it('opens on a real frame even if startIndex is out of range or junk', () => {
    for (const startIndex of [99, -4, NaN, undefined, 1.7]) {
      const html = buildExportHtml({ ...base, frames: [[], []], levels: [1, 2], startIndex })
      const call = html.match(/draw\((\d+)\);/)
      expect(call).not.toBeNull()
      expect(Number(call[1])).toBeGreaterThanOrEqual(0)
      expect(Number(call[1])).toBeLessThanOrEqual(1)
    }
  })

  it('cannot be broken out of by a closing script tag in the data', () => {
    // A hover label carries whatever the user typed into a component name.
    const nasty = '</script><img src=x onerror=alert(1)>'
    const html = buildExportHtml({
      ...base,
      frames: [[{ type: 'scatter3d', text: [nasty], name: nasty }]],
      layout: { title: nasty },
    })

    // Exactly one script block is opened and one closed: the Plotly tag and the
    // inline tag, and nothing the data smuggled in.
    expect(html.match(/<\/script>/g)).toHaveLength(2)
    expect(html).not.toContain('<img src=x')
    expect(parses(inlineScript(html))).toBe(true)

    // Escaped, not dropped — the label still says what it said.
    const data = JSON.parse(inlineScript(html).match(/var FRAMES = (\[[\s\S]*?\]);/)[1])
    expect(data[0][0].text[0]).toBe(nasty)
  })

  it('escapes the title and the slider label into the markup', () => {
    const html = buildExportHtml({
      ...base,
      title: 'A & B <script>',
      levels: [1, 2],
      frames: [[], []],
      sliderLabel: '<b>EDC</b>',
    })
    expect(html).toContain('<title>A &amp; B &lt;script&gt;</title>')
    expect(html).toContain('&lt;b&gt;EDC&lt;/b&gt;')
    expect(html.match(/<\/script>/g)).toHaveLength(2)
  })

  it('keeps boundary surfaces out of every frame and concatenates them instead', () => {
    const surface = { type: 'isosurface', value: [0, 1] }
    const html = buildExportHtml({
      ...base,
      frames: [[{ type: 'scatter3d' }], [{ type: 'scatter3d' }]],
      levels: [1, 2],
      staticTraces: [surface],
    })
    // Serialised once, not once per frame.
    expect(html.match(/isosurface/g)).toHaveLength(1)
    expect(inlineScript(html)).toContain('.concat(STATIC)')
  })

  it('lets the grid view scroll instead of pinning it to the viewport', () => {
    expect(buildExportHtml({ ...base, gridView: true })).not.toContain('height:100vh;')
    expect(buildExportHtml({ ...base, gridView: false })).toContain('height:100vh;')
  })

  it('survives being handed nothing at all', () => {
    const html = buildExportHtml()
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(parses(inlineScript(html))).toBe(true)
  })
})
