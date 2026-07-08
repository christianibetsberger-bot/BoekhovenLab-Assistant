// Sequence library for the LidaKinetics HPLC import.
//
// A library entry maps a human-readable *name* (e.g. "Aalpha") to the two
// product strands of that LIDA sequence: AB and A'B'. Chromatogram files named
// with the NAMED schema (`CTI-117_Aalpha_4h….txt`) carry only the name; the
// strands are looked up here so the concentration math has both extinction
// coefficients.
//
// Import format is a CSV / TSV with a header row. Recognised columns:
//   name          — the sequence name / library key            (required)
//   seqAB         — the AB product strand (ACGT)                (required)
//   seqAprimeBprime — the A'B' product strand (ACGT)            (optional)
// If the A'B' column is omitted (or blank) it defaults to the reverse
// complement of AB, which is the canonical LIDA case.

import { reverseComplement } from './hplcFilename.js'

function detectDelimiter(text) {
  const firstLine = String(text || '').split(/\r?\n/)[0] || ''
  if (firstLine.includes('\t')) return '\t'
  if (firstLine.split(';').length > firstLine.split(',').length) return ';'
  return ','
}

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/[\s\-_'"+()]/g, '')
}

const HEADER_ALIASES = {
  name: 'name', seqname: 'name', id: 'name', dnaname: 'name', label: 'name',
  seqab: 'seqAB', ab: 'seqAB', sequence: 'seqAB', seq: 'seqAB', strand1: 'seqAB',
  dnasequence: 'seqAB', strand: 'seqAB', seqa: 'seqAB', abstrand: 'seqAB',
  seqaprimebprime: 'seqABprime', aprimebprime: 'seqABprime', seq2: 'seqABprime',
  abprime: 'seqABprime', strand2: 'seqABprime', seqaprime: 'seqABprime',
  complement: 'seqABprime', abprimestrand: 'seqABprime',
}

const isDna = s => /^[ACGT]+$/.test(s)

// Parse a CSV/TSV string into library entries. Returns
// { entries: [{ name, seqAB, seqABprime, isCanonicalRC }], errors: [string] }.
export function parseSeqLibraryCsv(text) {
  const errors = []
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (!lines.length) return { entries: [], errors: ['File is empty.'] }

  const delim = detectDelimiter(text)
  const header = lines[0].split(delim).map(normalizeHeader)
  const colOf = key => header.findIndex(h => HEADER_ALIASES[h] === key)
  const iName = colOf('name')
  const iAB   = colOf('seqAB')
  const iABp  = colOf('seqABprime')

  if (iName === -1 || iAB === -1) {
    return { entries: [], errors: ['Header must include a Name column and a Sequence (AB) column.'] }
  }

  const entries = []
  const seen = new Set()
  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r].split(delim)
    const name = String(cols[iName] ?? '').trim()
    const seqAB = String(cols[iAB] ?? '').trim().toUpperCase()
    let seqABprime = iABp !== -1 ? String(cols[iABp] ?? '').trim().toUpperCase() : ''

    if (!name && !seqAB) continue          // blank line
    if (!name) { errors.push(`Row ${r + 1}: missing name.`); continue }
    if (!isDna(seqAB)) { errors.push(`Row ${r + 1} (${name}): "${seqAB}" is not a DNA sequence.`); continue }
    if (seqABprime && !isDna(seqABprime)) {
      errors.push(`Row ${r + 1} (${name}): A'B' "${seqABprime}" is not a DNA sequence.`); continue
    }
    if (!seqABprime) seqABprime = reverseComplement(seqAB)

    const key = name.toLowerCase()
    if (seen.has(key)) { errors.push(`Row ${r + 1}: duplicate name "${name}" — keeping the first.`); continue }
    seen.add(key)

    entries.push({ name, seqAB, seqABprime, isCanonicalRC: reverseComplement(seqAB) === seqABprime })
  }

  if (!entries.length && !errors.length) errors.push('No sequence rows found.')
  return { entries, errors }
}
