import { describe, it, expect } from 'vitest'
import { reverseComplement, parseChromeleonFilename, parseNamedFilename, parseHplcFilename } from './hplcFilename.js'

describe('reverseComplement', () => {
  it('reverse-complements a DNA strand', () => {
    expect(reverseComplement('ATCGATCG')).toBe('CGATCGAT')
    expect(reverseComplement('AAAA')).toBe('TTTT')
  })

  it('is case-insensitive', () => {
    expect(reverseComplement('atcg')).toBe('CGAT')
  })

  it('maps unknown bases to N', () => {
    expect(reverseComplement('ATXG')).toBe('CNAT')
  })

  it('handles empty / nullish input', () => {
    expect(reverseComplement('')).toBe('')
    expect(reverseComplement(null)).toBe('')
  })
})

describe('parseChromeleonFilename', () => {
  it('parses the canonical schema', () => {
    const r = parseChromeleonFilename('ATCGATCG_AB_CGATCGAT_S1-30.txt')
    expect(r.error).toBeUndefined()
    expect(r).toMatchObject({
      ABseq: 'ATCGATCG',
      replicatorName: 'AB',
      ABprimeSeq: 'CGATCGAT',
      condition: 'S',
      replicate: 1,
      time: 30,
      isCanonicalRC: true,
    })
  })

  it('flags a non reverse-complementary second strand', () => {
    const r = parseChromeleonFilename('ATCG_AB_TAGC_S1-30.txt')
    expect(r.isCanonicalRC).toBe(false)
  })

  it('accepts multi-character replicator names', () => {
    expect(parseChromeleonFilename('ATCGATCG_Dzeta_CGATCGAT_S3-0.txt').replicatorName).toBe('Dzeta')
  })

  it('ignores the Chromeleon channel suffix after the time block', () => {
    const r = parseChromeleonFilename('ATCGATCG_EB_CGATCGAT_U2-60_05_UV_R_VIS_1.txt')
    expect(r).toMatchObject({ replicatorName: 'EB', condition: 'U', replicate: 2, time: 60 })
  })

  it('tolerates curly braces copied from the schema literally', () => {
    const r = parseChromeleonFilename('{ATCG}_AB_{TAGC}_{S}{1}-{30}.txt')
    expect(r).toMatchObject({ ABseq: 'ATCG', ABprimeSeq: 'TAGC', condition: 'S', replicate: 1, time: 30 })
  })

  it('parses a fractional (float) time', () => {
    expect(parseChromeleonFilename('ATCG_AB_CGAT_S1-2.5.txt').time).toBe(2.5)
  })

  it('strips a directory path before matching', () => {
    expect(parseChromeleonFilename('data/runs/ATCG_AB_CGAT_S1-30.txt').ABseq).toBe('ATCG')
  })

  it('returns an error object for a non-matching name', () => {
    expect(parseChromeleonFilename('garbage.txt').error).toBeTruthy()
    expect(parseChromeleonFilename('ATCG_AB_CGAT_S1-30').error).toBeTruthy() // missing .txt
  })
})

describe('parseNamedFilename', () => {
  it('parses code, seq name and hour time (→ minutes), ignoring the channel suffix', () => {
    const r = parseNamedFilename('CTI-117_Aalpha_4h_05_UV_R_VIS_1.txt')
    expect(r.error).toBeUndefined()
    expect(r).toMatchObject({ scheme: 'named', code: 'CTI-117', seqName: 'Aalpha', time: 240 })
  })

  it('parses explicit minute units and fractional hours', () => {
    expect(parseNamedFilename('CTI-118_Bbeta_30min.txt').time).toBe(30)
    expect(parseNamedFilename('CTI-9_Aalpha_90m.txt').time).toBe(90)
    expect(parseNamedFilename('CTI-117_Aalpha_2.5h.txt').time).toBe(150)
  })

  it('treats a bare (unit-less) time as minutes', () => {
    expect(parseNamedFilename('CTI-117_Aalpha_240.txt').time).toBe(240)
  })

  it('strips a directory path before matching', () => {
    expect(parseNamedFilename('runs/CTI-117_Aalpha_4h.txt').code).toBe('CTI-117')
  })

  it('errors on the strand schema and on garbage', () => {
    expect(parseNamedFilename('ATCGATCG_AB_CGATCGAT_S1-30.txt').error).toBeTruthy()
    expect(parseNamedFilename('garbage.txt').error).toBeTruthy()
    expect(parseNamedFilename('CTI-117_Aalpha.txt').error).toBeTruthy() // missing time
  })
})

describe('parseHplcFilename (unified)', () => {
  it('routes a named file to the named schema', () => {
    const r = parseHplcFilename('CTI-117_Aalpha_4h.txt')
    expect(r).toMatchObject({ scheme: 'named', code: 'CTI-117', seqName: 'Aalpha', time: 240 })
  })

  it('routes a strand file to the strand schema', () => {
    const r = parseHplcFilename('ATCGATCG_AB_CGATCGAT_S1-30.txt')
    expect(r).toMatchObject({ scheme: 'strands', ABseq: 'ATCGATCG', condition: 'S', time: 30 })
  })

  it('errors when neither schema matches', () => {
    expect(parseHplcFilename('garbage.txt').error).toBeTruthy()
  })
})
