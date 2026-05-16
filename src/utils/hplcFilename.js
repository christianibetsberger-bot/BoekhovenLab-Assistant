// Filename schema for ThermoFisher Chromeleon `.txt` exports used by the
// HPLC import in LidaKinetics: `{ABseq}_AB_{ABprimeSeq}_{cond}{rep}-{time}.txt`.
// Anything after the time block (e.g. Chromeleon's `_05_UV_R_VIS_1`) is ignored.
//
// Example: `ATCGATCG_AB_CGATCGAT_S1-30_05_UV_R_VIS_1.txt`
//   ABseq        = ATCGATCG
//   ABprimeSeq   = CGATCGAT
//   condition    = S       (S = seeded, U = unseeded)
//   replicate    = 1
//   time         = 30      (minutes)

const FILENAME_RE = /^([ACGT]+)_AB_([ACGT]+)_([SU])(\d+)-(\d+(?:\.\d+)?)(?:_.*)?\.txt$/i

const COMPLEMENT = { A: 'T', T: 'A', C: 'G', G: 'C' }

export function reverseComplement(seq) {
  const s = String(seq || '').toUpperCase()
  let out = ''
  for (let i = s.length - 1; i >= 0; i--) {
    out += COMPLEMENT[s[i]] || 'N'
  }
  return out
}

// Returns { ABseq, ABprimeSeq, condition: 'S'|'U', replicate, time, isCanonicalRC }
// or { error: '...' } if the filename does not match the schema.
export function parseChromeleonFilename(filename) {
  const base = String(filename || '').split('/').pop()
  const m = base.match(FILENAME_RE)
  if (!m) {
    return { error: `Filename does not match {ABseq}_AB_{A'B'seq}_{S|U}{rep}-{time}.txt` }
  }
  const ABseq = m[1].toUpperCase()
  const ABprimeSeq = m[2].toUpperCase()
  const condition = m[3].toUpperCase()
  const replicate = parseInt(m[4], 10)
  const time = parseFloat(m[5])
  const isCanonicalRC = reverseComplement(ABseq) === ABprimeSeq
  return { ABseq, ABprimeSeq, condition, replicate, time, isCanonicalRC, raw: base }
}

export const HPLC_FILENAME_REGEX_SOURCE = FILENAME_RE.source
