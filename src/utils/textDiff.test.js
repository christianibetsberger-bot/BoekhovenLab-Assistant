import { describe, it, expect } from 'vitest'
import { htmlToLines, diffLines, diffStat } from './textDiff.js'

describe('htmlToLines', () => {
  it('strips tags and splits on block boundaries', () => {
    expect(htmlToLines('<p>one</p><p>two</p>')).toEqual(['one', 'two'])
    expect(htmlToLines('a<br>b')).toEqual(['a', 'b'])
  })
  it('collapses blank runs and decodes basic entities', () => {
    expect(htmlToLines('<p>a</p><p></p><p></p><p>b &amp; c</p>')).toEqual(['a', '', 'b & c'])
  })
})

describe('diffLines', () => {
  it('marks added, removed, and unchanged lines', () => {
    const ops = diffLines('<p>keep</p><p>old</p>', '<p>keep</p><p>new</p>')
    expect(ops).toEqual([
      { type: 'ctx', text: 'keep' },
      { type: 'del', text: 'old' },
      { type: 'add', text: 'new' },
    ])
  })
  it('is empty of changes for identical content', () => {
    const ops = diffLines('<p>same</p>', '<p>same</p>')
    expect(ops.every(o => o.type === 'ctx')).toBe(true)
  })
})

describe('diffStat', () => {
  it('counts additions and deletions', () => {
    expect(diffStat('<p>a</p><p>b</p>', '<p>a</p><p>b</p><p>c</p>')).toEqual({ add: 1, del: 0 })
    expect(diffStat('<p>a</p><p>b</p>', '<p>a</p>')).toEqual({ add: 0, del: 1 })
  })
})
