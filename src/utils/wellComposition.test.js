import { describe, it, expect } from 'vitest'
import { parseWellHtml, totalVolume, withFinalConcentrations, buildWellHtml,
         collectPlateStocks, unlinkedVolumes, scaleEntriesToTotal } from './wellComposition'

// Fixtures copied from the real producers' template literals. There was no test
// anywhere that fed a producer's own output to parseWellHtml, which is how five
// producers drifted out of step with it unnoticed — so these are verbatim shapes,
// not idealised ones.
const chip = (id, code, name, stock, unit) =>
  `<span class="inv-ref" contenteditable="false" data-inv-id="${id}" data-labware="">`
  + `<i class="fas fa-tag"></i>&nbsp;[${code}] ${name} (${stock} ${unit})`
  + `&nbsp;<i class="fas fa-times inv-ref-remove"></i></span>`

// PhasePredictor buildTargetWellHtml, 80 µL design, everything inventory-linked.
// A + B + C + EDC = 73.67 µL, fill-up = 6.33 µL. `fill` is the only variable.
const phaseWell = (fill) => `<strong style="color: var(--primary);">AI Target [9001]</strong><br>
            &nbsp;${chip('i1', 'C1', 'Peptide', '100', 'µM')}&nbsp; 40.00 µL (5 mM)<br>
            &nbsp;${chip('i2', 'C2', 'RNA', '100', 'µM')}&nbsp; 20.00 µL (4 mM)<br>
            &nbsp;${chip('i3', 'C3', 'NaCl', '1000', 'mM')}&nbsp; 9.67 µL (30 mM)<br>`
  + `&nbsp;${chip('i4', 'C4', 'EDC', '100', 'mM')}&nbsp; 4.00 µL (10 mM)<br>`
  + `<span style="font-size:0.68rem; color:#f59e0b;">⊕ Background Na⁺: 1.20 mM</span><br>${fill}`

describe('the fill-up is not always water', () => {
  // The reported bug, pinned to the number the user saw.
  it('regression: an 80 µL well filled up with buffer read 73.67 µL', () => {
    const buffered = phaseWell('<strong>MOPS pH 7:</strong> 6.33 µL<br>')
    expect(totalVolume(parseWellHtml(buffered))).toBeCloseTo(80.00, 2)

    const fill = parseWellHtml(buffered).find(e => e.kind === 'water')
    expect(fill).toMatchObject({ kind: 'water', name: 'MOPS pH 7', volume: 6.33 })
  })

  it('a water fill-up and a buffer fill-up now agree, which is the whole complaint', () => {
    const watered = totalVolume(parseWellHtml(phaseWell('<strong>MQ H₂O:</strong> 6.33 µL<br>')))
    const buffered = totalVolume(parseWellHtml(phaseWell('<strong>MOPS pH 7:</strong> 6.33 µL<br>')))
    expect(buffered).toBeCloseTo(watered, 6)
  })

  it('the buffer well no longer over-reports every concentration', () => {
    const rows = withFinalConcentrations(parseWellHtml(phaseWell('<strong>MOPS pH 7:</strong> 6.33 µL<br>')))
    const peptide = rows.find(r => r.name === 'Peptide')
    // 100 µM × 40 µL / 80 µL. Before the fix the denominator was 73.67, giving 54.3.
    expect(peptide.final).toBeCloseTo(50.00, 6)
  })

  it('an unnamed buffer defaults to the literal label PhasePredictor writes', () => {
    const e = parseWellHtml(phaseWell('<strong>Buffer:</strong> 6.33 µL<br>'))
    expect(e.find(x => x.kind === 'water')).toMatchObject({ name: 'Buffer', volume: 6.33 })
  })

  it('MatrixPlanner / ScreeningPlanner wrap the number in a span — count that too', () => {
    const mx = `&nbsp;${chip('i1', 'C1', 'Peptide', '100', 'µM')}&nbsp; 20.00 µL (10 µM)<br>`
      + `<div style="margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px;">`
      + `<strong>MQ H₂O:</strong> <span style="color: var(--primary); font-weight: bold;">30.00 µL</span></div>`
    expect(totalVolume(parseWellHtml(mx))).toBeCloseTo(50.00, 2)
  })
})

describe('what must NOT be read as a fill-up', () => {
  it('the well-total footer buildWellHtml writes is not a volume', () => {
    const once = buildWellHtml(parseWellHtml(phaseWell('<strong>MOPS pH 7:</strong> 6.33 µL<br>')),
                               { inventory: [], showFinal: true, targetVolume: 80 })
    expect(once).toContain('Σ 80.00 µL of 80 µL')
    // Re-parse and rebuild: the total must not grow by reading its own footer.
    const twice = buildWellHtml(parseWellHtml(once), { inventory: [], showFinal: true, targetVolume: 80 })
    expect(totalVolume(parseWellHtml(twice))).toBeCloseTo(80.00, 2)
  })

  it('an unchipped component is reported, not summed', () => {
    const html = `&nbsp;${chip('i1', 'C1', 'Peptide', '100', 'µM')}&nbsp; 40.00 µL (5 mM)<br>`
      + `<strong>Unknown Component:</strong> 12.34 µL (5 mM)<br>`
      + `<strong>MQ H₂O:</strong> 27.66 µL<br>`
    expect(totalVolume(parseWellHtml(html))).toBeCloseTo(67.66, 2)
    expect(unlinkedVolumes(html)).toEqual([{ name: 'Unknown Component', volume: 12.34 }])
  })

  it("LidaKinetics' double <strong> is counted once, and only as unlinked", () => {
    const html = `<strong>T4-Ligase:</strong> <strong>Manual:</strong> 3.00 µL (5.00 U)<br>`
      + `<strong>MQ H₂O:</strong> 47.00 µL`
    expect(totalVolume(parseWellHtml(html))).toBeCloseTo(47.00, 2)
    expect(unlinkedVolumes(html)).toEqual([{ name: 'T4-Ligase', volume: 3 }])
  })

  it('a chipped row label is not a fill-up (MatrixPlanner Row:/Col:)', () => {
    const html = `<strong>Row:</strong> &nbsp;${chip('i1', 'C1', 'Peptide', '100', 'µM')}&nbsp; 20.00 µL (10 µM)<br>`
    const e = parseWellHtml(html)
    expect(e).toHaveLength(1)
    expect(e[0]).toMatchObject({ kind: 'reagent', name: 'Peptide', volume: 20 })
  })

  it('a typed note with no volume unit stays a note', () => {
    expect(parseWellHtml('<strong>pH:</strong> 7.4<br>')).toEqual([])
    expect(parseWellHtml('<strong>Blank</strong><br>')).toEqual([])
    expect(parseWellHtml('<strong>Note:</strong> 3 replicates<br>')).toEqual([])
  })

  it('a header with a style attribute is never a fill-up', () => {
    expect(parseWellHtml('<strong style="color: var(--primary);">Ligation 20.00 µL</strong><br>')).toEqual([])
  })

  it('an explicit MQ H₂O line still wins over any other labelled volume', () => {
    const html = `<strong>Overlay:</strong> 5.00 µL<br><strong>MQ H₂O:</strong> 30.00 µL<br>`
    const fill = parseWellHtml(html).filter(e => e.kind === 'water')
    expect(fill).toHaveLength(1)
    expect(fill[0]).toMatchObject({ name: 'MQ H₂O', volume: 30 })
  })
})

describe('the fill-up survives a rebuild under its own name', () => {
  const buffered = phaseWell('<strong>MOPS pH 7:</strong> 6.33 µL<br>')

  it('a buffer fill-up is never rewritten as MQ H₂O', () => {
    const out = buildWellHtml(parseWellHtml(buffered), { inventory: [], showFinal: false })
    expect(out).toContain('<strong>MOPS pH 7:</strong> 6.33 µL')
    // The .onp exporters key `MQ H₂O` to the water position on the deck. A buffer
    // must never acquire that label on a rebuild.
    expect(out).not.toContain('MQ H₂O')
  })

  it('rebuilding is idempotent for the fill-up', () => {
    const once = buildWellHtml(parseWellHtml(buffered), { inventory: [], showFinal: false })
    const twice = buildWellHtml(parseWellHtml(once), { inventory: [], showFinal: false })
    expect(twice).toBe(once)
  })

  it('a water fill-up rebuilds byte-identically to before', () => {
    const out = buildWellHtml([{ kind: 'water', name: 'MQ H₂O', volume: 30 }], { showFinal: false })
    expect(out).toBe('<strong>MQ H₂O:</strong> 30.00 µL<br>')
  })

  it('a fill-up entry with no name still rebuilds as water (older saved plates)', () => {
    const out = buildWellHtml([{ kind: 'water', volume: 30 }], { showFinal: false })
    expect(out).toBe('<strong>MQ H₂O:</strong> 30.00 µL<br>')
  })
})

describe('scaling a well to a new total volume', () => {
  const well = phaseWell('<strong>MQ H₂O:</strong> 6.33 µL<br>')   // Σ 80.00 µL

  it('hits the requested total and scales every entry, fill-up included', () => {
    const scaled = scaleEntriesToTotal(parseWellHtml(well), 40)
    expect(totalVolume(scaled)).toBeCloseTo(40, 6)
    expect(scaled.find(e => e.name === 'Peptide').volume).toBeCloseTo(20.0, 6)
    expect(scaled.find(e => e.kind === 'water').volume).toBeCloseTo(3.165, 6)
  })

  it('keeps every final concentration exactly what it was — the point of scaling', () => {
    const before = withFinalConcentrations(parseWellHtml(well))
    const after = withFinalConcentrations(scaleEntriesToTotal(parseWellHtml(well), 40))
    before.forEach((e, i) => {
      if (e.final == null) expect(after[i].final).toBeNull()
      else expect(after[i].final).toBeCloseTo(e.final, 9)
    })
  })

  it('survives the HTML round-trip: rebuild, reparse, and the concentrations still agree', () => {
    const html = buildWellHtml(scaleEntriesToTotal(parseWellHtml(well), 40), { inventory: [] })
    const rows = withFinalConcentrations(parseWellHtml(html))
    const ref = withFinalConcentrations(parseWellHtml(well))
    // Rebuild rounds volumes to 0.01 µL, so agreement is to pipetting precision,
    // not exact — within 0.5% relative of the original concentration.
    rows.filter(e => e.kind === 'reagent').forEach(e => {
      const r = ref.find(x => x.name === e.name)
      expect(Math.abs(e.final - r.final) / r.final).toBeLessThan(0.005)
    })
  })

  it('scaling up works the same as scaling down', () => {
    const scaled = scaleEntriesToTotal(parseWellHtml(well), 160)
    expect(totalVolume(scaled)).toBeCloseTo(160, 6)
    expect(scaled.find(e => e.name === 'EDC').volume).toBeCloseTo(8.0, 6)
  })

  it('refuses an empty well and a nonsense target instead of writing garbage', () => {
    expect(scaleEntriesToTotal([], 40)).toBeNull()
    expect(scaleEntriesToTotal(parseWellHtml(well), 0)).toBeNull()
    expect(scaleEntriesToTotal(parseWellHtml(well), -5)).toBeNull()
    expect(scaleEntriesToTotal(parseWellHtml(well), NaN)).toBeNull()
  })
})

describe('the fill-up does not become a plate stock', () => {
  it('a buffer fill-up adds no row to the plate stock list', () => {
    const stocks = collectPlateStocks({
      A1: phaseWell('<strong>MOPS pH 7:</strong> 6.33 µL<br>'),
      A2: phaseWell('<strong>MOPS pH 7:</strong> 16.33 µL<br>'),
    })
    expect(stocks.map(s => s.name).sort()).toEqual(['EDC', 'NaCl', 'Peptide', 'RNA'])
  })
})
