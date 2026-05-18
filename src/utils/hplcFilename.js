// Filename schema for ThermoFisher Chromeleon `.txt` exports used by the
// HPLC import in LidaKinetics:
//   `{seq1}_{ReplicatorName}_{seq2}_{cond}{rep}-{time}.txt`
//
// The replicator name can be anything that starts with a letter (AB, EB, Dzeta, …).
// Anything after the time block (e.g. Chromeleon's `_05_UV_R_VIS_1`) is ignored.
//
// Examples:
//   ATCGATCG_AB_CGATCGAT_S1-30_05_UV_R_VIS_1.txt   → replicatorName = AB
//   ATCGATCG_EB_CGATCGAT_U2-60.txt                 → replicatorName = EB
//   ATCGATCG_Dzeta_CGATCGAT_S3-0.txt               → replicatorName = Dzeta
//
//   seq1            = first strand sequence  (ACGT only)
//   seq2            = second strand sequence (ACGT only)
//   replicatorName  = arbitrary label starting with a letter
//   condition       = S (seeded) or U (unseeded)
//   replicate       = integer
//   time            = float (minutes)

const FILENAME_RE = /^([ACGT]+)_([A-Za-z][A-Za-z0-9]*)_([ACGT]+)_([SU])(\d+)-(\d+(?:\.\d+)?)(?:_.*)?\.txt$/i

const COMPLEMENT = { A: 'T', T: 'A', C: 'G', G: 'C' }

export function reverseComplement(seq) {
  const s = String(seq || '').toUpperCase()
  let out = ''
  for (let i = s.length - 1; i >= 0; i--) {
    out += COMPLEMENT[s[i]] || 'N'
  }
  return out
}

// Returns { ABseq, ABprimeSeq, replicatorName, condition: 'S'|'U', replicate, time, isCanonicalRC }
// or { error: '...' } if the filename does not match the schema.
//
// ABseq / ABprimeSeq are kept as aliases for seq1 / seq2 for backward compatibility.
//
// Tolerates curly braces around any field — users often copy the schema
// literally and end up with names like `{ATCG}_AB_{TAGC}_{S}{1}-{30}.txt`.
export function parseChromeleonFilename(filename) {
  const base = String(filename || '').split('/').pop().replace(/[{}]/g, '')
  const m = base.match(FILENAME_RE)
  if (!m) {
    return { error: `Filename must look like ATCGATCG_AB_CGATCGAT_S1-30.txt  (seq · _ReplicatorName_ · seq · S/U · rep · -t). Any name works: AB, EB, Dzeta, …` }
  }
  const ABseq          = m[1].toUpperCase()
  const replicatorName = m[2]
  const ABprimeSeq     = m[3].toUpperCase()
  const condition      = m[4].toUpperCase()
  const replicate      = parseInt(m[5], 10)
  const time           = parseFloat(m[6])
  const isCanonicalRC  = reverseComplement(ABseq) === ABprimeSeq
  return { ABseq, ABprimeSeq, replicatorName, condition, replicate, time, isCanonicalRC, raw: base }
}

export const HPLC_FILENAME_REGEX_SOURCE = FILENAME_RE.source
