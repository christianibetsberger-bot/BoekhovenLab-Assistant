import { describe, it, expect } from 'vitest'
import { parseSeqLibraryCsv } from './seqLibrary.js'

describe('parseSeqLibraryCsv', () => {
  it('parses Name + both strand columns', () => {
    const { entries, errors } = parseSeqLibraryCsv(
      'Name,SeqAB,SeqAprimeBprime\nAalpha,ATCG,CGAT\nBbeta,GGGG,CCCC'
    )
    expect(errors).toEqual([])
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ name: 'Aalpha', seqAB: 'ATCG', seqABprime: 'CGAT', isCanonicalRC: true })
    expect(entries[1]).toMatchObject({ name: 'Bbeta', seqAB: 'GGGG', seqABprime: 'CCCC', isCanonicalRC: true })
  })

  it("defaults A'B' to the reverse complement when the column is missing", () => {
    const { entries } = parseSeqLibraryCsv('Name,Sequence\nAalpha,ATCG')
    expect(entries[0].seqABprime).toBe('CGAT')
    expect(entries[0].isCanonicalRC).toBe(true)
  })

  it("defaults A'B' to reverse complement when the cell is blank", () => {
    const { entries } = parseSeqLibraryCsv('Name,SeqAB,SeqAprimeBprime\nAalpha,ATCG,')
    expect(entries[0].seqABprime).toBe('CGAT')
  })

  it('flags a non reverse-complementary second strand', () => {
    const { entries } = parseSeqLibraryCsv('Name,SeqAB,SeqAprimeBprime\nAalpha,ATCG,TTTT')
    expect(entries[0].isCanonicalRC).toBe(false)
  })

  it('is case-insensitive and lower-cases nothing but normalises sequence to upper', () => {
    const { entries } = parseSeqLibraryCsv('name,sequence\nAalpha,atcg')
    expect(entries[0].seqAB).toBe('ATCG')
  })

  it('supports tab and semicolon delimiters', () => {
    expect(parseSeqLibraryCsv('Name\tSequence\nAalpha\tATCG').entries[0].seqAB).toBe('ATCG')
    expect(parseSeqLibraryCsv('Name;Sequence\nAalpha;ATCG').entries[0].seqAB).toBe('ATCG')
  })

  it('skips invalid DNA and reports it', () => {
    const { entries, errors } = parseSeqLibraryCsv('Name,Sequence\nGood,ATCG\nBad,ATXZ')
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('Good')
    expect(errors.some(e => /Bad/.test(e))).toBe(true)
  })

  it('drops duplicate names, keeping the first', () => {
    const { entries, errors } = parseSeqLibraryCsv('Name,Sequence\nAalpha,ATCG\nAalpha,GGGG')
    expect(entries).toHaveLength(1)
    expect(entries[0].seqAB).toBe('ATCG')
    expect(errors.some(e => /duplicate/i.test(e))).toBe(true)
  })

  it('errors when required columns are absent', () => {
    const { entries, errors } = parseSeqLibraryCsv('Foo,Bar\n1,2')
    expect(entries).toEqual([])
    expect(errors[0]).toMatch(/Name column/)
  })

  it('errors on empty input', () => {
    expect(parseSeqLibraryCsv('').errors[0]).toMatch(/empty/i)
  })
})
