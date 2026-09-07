import { describe, it, expect } from 'vitest'
import { parseWellHtml, totalVolume, withFinalConcentrations, buildWellHtml, exchangeEntry, exchangeOnPlate, wellExtras,
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

describe('rebuilds never destroy traceability', () => {
  it('regression: an entry whose item is NOT in the live inventory keeps its data-inv-id', () => {
    // Archived compound, or a colleague's private stock: the item is absent from
    // the inventory passed in, but the chip's id is what the usage tracker keys
    // on — the old textChip fallback silently dropped it on every rebuild.
    const out = buildWellHtml(parseWellHtml(phaseWell('<strong>MQ H₂O:</strong> 6.33 µL<br>')), { inventory: [] })
    expect(out).toContain('data-inv-id="i1"')
    expect(out).toContain('data-inv-id="i4"')
  })

  it('and the round-trip through a rebuild still parses to the same ids', () => {
    const once = buildWellHtml(parseWellHtml(phaseWell('<strong>MQ H₂O:</strong> 6.33 µL<br>')), { inventory: [] })
    const ids = parseWellHtml(once).filter(e => e.kind === 'reagent').map(e => e.invId)
    expect(ids).toEqual(['i1', 'i2', 'i3', 'i4'])
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

describe('exchangeEntry', () => {
  const chipX = (code, name, stock, unit, id = `inv-${code}`) =>
    `<span class="inv-ref" data-inv-id="${id}" data-labware="lw-1">[${code}] ${name} (${stock} ${unit})</span>&nbsp; 40.00 µL<br>`
  const html = chipX('C1', 'K10 peptide', 10, 'mM') + '<strong>MQ H₂O:</strong> 40.00 µL<br>'
  const k12 = { id: 'inv-C3', code: 'C3', name: 'K12 peptide', stock: '5', stockUnit: 'mM' }

  it('swaps identity and stock, keeps the volume and the labware', () => {
    const entries = parseWellHtml(html)
    const out = exchangeEntry(entries, 0, k12)
    expect(out[0]).toMatchObject({ kind: 'reagent', invId: 'inv-C3', code: 'C3', name: 'K12 peptide', stock: 5, unit: 'mM', volume: 40, labware: 'lw-1' })
    expect(entries[0].invId).toBe('inv-C1')   // input untouched
    expect(out[1]).toEqual(entries[1])
  })
  it('recomputes what the well holds from the new bottle', () => {
    const out = withFinalConcentrations(exchangeEntry(parseWellHtml(html), 0, k12))
    expect(out[0].final).toBeCloseTo(2.5)      // 5 mM × 40 / 80
  })
  it('leaves fill-ups, other rows and bad indexes alone, and copes with a bottle without a stock', () => {
    const entries = parseWellHtml(html)
    expect(exchangeEntry(entries, 1, k12)[1]).toEqual(entries[1])
    expect(exchangeEntry(entries, 7, k12)).toEqual(entries)
    expect(exchangeEntry(entries, 0, null)).toEqual(entries)
    const noStock = exchangeEntry(entries, 0, { id: 'inv-X', code: 'X', name: 'Mystery', stock: '' })[0]
    expect(noStock.stock).toBeNull()
    expect(noStock.unit).toBe('mM')            // keeps the unit it had
  })
  it('survives a rebuild: the new chip carries the new inventory id', () => {
    const rebuilt = buildWellHtml(exchangeEntry(parseWellHtml(html), 0, k12), { showFinal: true })
    const again = parseWellHtml(rebuilt)
    expect(again[0]).toMatchObject({ invId: 'inv-C3', name: 'K12 peptide', stock: 5, volume: 40 })
    expect(rebuilt).toContain('data-inv-id="inv-C3"')
    expect(rebuilt).not.toContain('inv-C1')
  })
})

describe('wellExtras — what a rebuild must not lose', () => {
  const chipX = (code, name, stock, unit, vol, id = `inv-${code}`) =>
    `&nbsp;<span class="inv-ref" data-inv-id="${id}" data-labware="">[${code}] ${name} (${stock} ${unit})</span>&nbsp; ${vol} µL (${(stock * vol / 80).toFixed(2)} ${unit})<br>`
  const html = `<strong style="color: var(--primary);">Sample [9001]</strong><br>`
    + chipX('C1', 'K10 peptide', 10, 'mM', 40)
    + `<strong>T4-Ligase:</strong> 3.00 µL (5 U)<br>`
    + `note: keep cold<br>`
    + `<strong>MQ H₂O:</strong> 37.00 µL<br>`
  const k12 = { id: 'inv-C3', code: 'C3', name: 'K12 peptide', stock: '5', stockUnit: 'mM' }

  it('keeps headers, unlinked reagent lines and notes, and drops what the parser models', () => {
    const x = wellExtras(html)
    expect(x).toContain('Sample [9001]')
    expect(x).toContain('<strong>T4-Ligase:</strong> 3.00 µL (5 U)')
    expect(x).toContain('note: keep cold')
    expect(x).not.toContain('inv-ref')
    expect(x).not.toContain('MQ H₂O')
    expect(x).not.toContain('40')
  })
  it('an exchange in one well leaves the unlinked ligase and the header in place', () => {
    const rebuilt = buildWellHtml(exchangeEntry(parseWellHtml(html), 0, k12), { showFinal: true, extra: wellExtras(html) })
    expect(unlinkedVolumes(rebuilt)).toEqual([{ name: 'T4-Ligase', volume: 3 }])
    expect(rebuilt).toContain('Sample [9001]')
    expect(rebuilt).toContain('note: keep cold')
    expect(parseWellHtml(rebuilt).map(e => e.name)).toEqual(['K12 peptide', 'MQ H₂O'])
    // Order: composition, then the extras, then the total.
    expect(rebuilt.indexOf('inv-C3')).toBeLessThan(rebuilt.indexOf('T4-Ligase'))
    expect(rebuilt.indexOf('T4-Ligase')).toBeLessThan(rebuilt.indexOf('well-total'))
  })
  it('is stable: rebuilding twice changes nothing', () => {
    const once = buildWellHtml(parseWellHtml(html), { showFinal: true, extra: wellExtras(html) })
    const twice = buildWellHtml(parseWellHtml(once), { showFinal: true, extra: wellExtras(once) })
    expect(twice).toBe(once)
    expect(wellExtras(once)).toBe(wellExtras(twice))
  })
  it('is empty for a well made only of what the parser models', () => {
    const plain = buildWellHtml(parseWellHtml(chipX('C1', 'K10 peptide', 10, 'mM', 40) + '<strong>MQ H₂O:</strong> 40.00 µL<br>'), { showFinal: true })
    expect(wellExtras(plain)).toBe('')
    expect(wellExtras('')).toBe('')
  })
})

describe('exchangeOnPlate', () => {
  const chipX = (code, name, stock, unit, vol, id) =>
    `<span class="inv-ref"${id ? ` data-inv-id="${id}"` : ''} data-labware="">[${code}] ${name} (${stock} ${unit})</span>&nbsp; ${vol} µL<br>`
  const wells = {
    A1: chipX('C1', 'K10 peptide', 10, 'mM', 40, 'inv-C1') + '<strong>EDC:</strong> 4.00 µL (10 mM)<br><strong>MQ H₂O:</strong> 40.00 µL<br>',
    A2: chipX('C1', 'K10 peptide', 10, 'mM', 20, '') + '<strong>MQ H₂O:</strong> 60.00 µL<br>',   // an unlinked copy
    B1: chipX('C2', 'pU RNA', 8, 'mM', 10, 'inv-C2') + '<strong>MQ H₂O:</strong> 70.00 µL<br>',
  }
  const k12 = { id: 'inv-C3', code: 'C3', name: 'K12 peptide', stock: '5', stockUnit: 'mM' }

  it('exchanges the linked and the unlinked copies, leaves other compounds alone, keeps extras', () => {
    const { wells: out, wellsChanged, entriesChanged } = exchangeOnPlate(wells, 'inv:inv-C1', k12, { oldName: 'K10 peptide' })
    expect(wellsChanged).toBe(2)
    expect(entriesChanged).toBe(2)
    expect(parseWellHtml(out.A1)[0]).toMatchObject({ invId: 'inv-C3', name: 'K12 peptide', stock: 5, volume: 40 })
    expect(parseWellHtml(out.A2)[0]).toMatchObject({ invId: 'inv-C3', name: 'K12 peptide', stock: 5, volume: 20 })
    expect(out.B1).toBe(wells.B1)
    expect(unlinkedVolumes(out.A1)).toEqual([{ name: 'EDC', volume: 4 }])
  })
  it('a bottle without a recorded stock leaves the concentration unknown everywhere, not the old value', () => {
    const { wells: out } = exchangeOnPlate(wells, 'inv:inv-C1', { id: 'inv-X', code: 'X', name: 'Mystery', stock: null }, { oldName: 'K10 peptide' })
    for (const id of ['A1', 'A2']) {
      const e = parseWellHtml(out[id])[0]
      expect(e).toMatchObject({ invId: 'inv-X', name: 'Mystery', stock: null })
      expect(withFinalConcentrations(parseWellHtml(out[id]))[0].final).toBeNull()
      expect(out[id]).not.toContain('( mM)')
    }
  })
})

describe('wellExtras — the shapes the producers really write', () => {
  const chip = (code, name, stock, unit, id = `inv-${code}`) =>
    `<span class="inv-ref" contenteditable="false" data-inv-id="${id}" data-labware="">[${code}] ${name} (${stock} ${unit})</span>`
  const roundtrip = (x) => {
    const y = buildWellHtml(parseWellHtml(x), { showFinal: true, extra: wellExtras(x) })
    const z = buildWellHtml(parseWellHtml(y), { showFinal: true, extra: wellExtras(y) })
    return { y, z }
  }
  const same = (x) => {
    const { y, z } = roundtrip(x)
    expect(z).toBe(y)
    expect(parseWellHtml(y)).toEqual(parseWellHtml(x))
    expect(unlinkedVolumes(y)).toEqual(unlinkedVolumes(x))
    return y
  }

  it('two labelled buffer lines and no water: the fill-up stays the last volume, nothing flips', () => {
    const x = `&nbsp;${chip('C1', 'Peptide', 100, 'µM')}&nbsp; 10 µL<br><strong>Buffer A:</strong> 20 µL<br><strong>Buffer B:</strong> 30 µL<br>`
    const y = same(x)
    expect(parseWellHtml(y).find(e => e.kind === 'water')).toMatchObject({ name: 'Buffer B', volume: 30 })
    expect(y.indexOf('Buffer A')).toBeLessThan(y.indexOf('Buffer B'))
    expect(totalVolume(parseWellHtml(y))).toBe(40)
  })
  it('a chip without a volume does not swallow the next chip', () => {
    const x = `&nbsp;${chip('C1', 'Peptide', 100, 'µM')}&nbsp;<br>&nbsp;${chip('C2', 'RNA', 100, 'µM')}&nbsp; 20 µL<br><strong>MQ H₂O:</strong> 60 µL`
    expect(parseWellHtml(x).map(e => e.name)).toEqual(['RNA', 'MQ H₂O'])
    const y = same(x)
    expect(y).toContain('inv-C1')
    expect(y).toContain('inv-C2')
  })
  it('Matrix and Lida labels stay on their chip line', () => {
    const x = `<strong>Row:</strong> &nbsp;${chip('C1', 'Peptide', 10, 'mM')}&nbsp; 4.00 µL (5 mM)<br><strong>Col:</strong> &nbsp;${chip('C2', 'RNA', 8, 'mM')}&nbsp; 8.00 µL (5 mM)<br><strong>MQ H₂O:</strong> 68.00 µL<br>`
    const y = same(x)
    expect(parseWellHtml(y).map(e => e.label)).toEqual(['Row', 'Col', undefined])
    expect(y).toMatch(/<strong>Row:<\/strong> <span class="inv-ref"/)
    expect(wellExtras(x)).toBe('')
  })
  it("Screening's nested '(5 µL (Fixed))' leaves no stray parenthesis; a typed note in parentheses is kept", () => {
    const fixed = `&nbsp;${chip('C1', 'Peptide', 10, 'mM')}&nbsp; 5.00 µL (5 µL (Fixed))<br><div style="margin-top: 8px;"><strong>MQ H₂O:</strong> <span style="font-weight: bold;">45.00 µL</span></div>`
    expect(wellExtras(fixed)).not.toContain(')')
    same(fixed)
    const note = `&nbsp;${chip('C1', 'Peptide', 10, 'mM')}&nbsp; 10 µL (add last)<br><strong>MQ H₂O:</strong> 60 µL`
    expect(wellExtras(note)).toBe('(add last)')
    expect(same(note)).toContain('(add last)')
  })
  it('pretty-printed markup converges on the first rebuild', () => {
    const x = `<strong style="x">H</strong>\n  <br>\n &nbsp;&nbsp;\n${chip('C1', 'Peptide', 10, 'mM')}\n&nbsp;\n10 µL\n<br>\n&nbsp;&nbsp;note&nbsp;&nbsp;<br>\n<strong>MQ H₂O:</strong>\n60 µL\n`
    const y = same(x)
    expect(y).toContain('note')
    expect(wellExtras(y)).not.toContain('\n')
  })
  it('a code-only chip is an entry, and a name with parentheses keeps them', () => {
    const codeOnly = `<span class="inv-ref" data-inv-id="i9" data-labware="">[C9] (10 mM)</span>&nbsp; 10 µL<br><strong>MQ H₂O:</strong> 60 µL`
    expect(parseWellHtml(codeOnly)[0]).toMatchObject({ invId: 'i9', code: 'C9', name: 'C9', stock: 10, volume: 10 })
    expect(same(codeOnly)).toContain('data-inv-id="i9"')
    const poly = `&nbsp;${chip('C8', 'Poly(U) RNA', 50, 'mM')}&nbsp; 5.00 µL<br><strong>MQ H₂O:</strong> 45.00 µL`
    expect(parseWellHtml(poly)[0]).toMatchObject({ name: 'Poly(U) RNA', stock: 50, unit: 'mM' })
    same(poly)
  })
  it('a note typed after a volume on the same line survives on its own line', () => {
    const x = `&nbsp;${chip('C1', 'Peptide', 10, 'mM')}&nbsp; 5 µL, add slowly<br><strong>MQ H₂O:</strong> 45 µL`
    const y = same(x)
    expect(y).toContain('add slowly')
    expect(y).not.toContain('<br>, add')
  })
})
