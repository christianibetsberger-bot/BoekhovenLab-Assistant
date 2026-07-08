// Two filename schemas are supported for the HPLC import in LidaKinetics.
//
// 1. STRAND schema (legacy) — the two DNA strands are embedded in the name:
//      `{seq1}_{ReplicatorName}_{seq2}_{cond}{rep}-{time}.txt`
//    The replicator name can be anything starting with a letter (AB, EB, Dzeta…).
//    Anything after the time block (e.g. `_05_UV_R_VIS_1`) is ignored.
//      ATCGATCG_AB_CGATCGAT_S1-30_05_UV_R_VIS_1.txt   → replicatorName = AB
//      ATCGATCG_EB_CGATCGAT_U2-60.txt                 → replicatorName = EB
//      ATCGATCG_Dzeta_CGATCGAT_S3-0.txt               → replicatorName = Dzeta
//    seq1/seq2 = strand sequences (ACGT), condition = S|U, replicate = int,
//    time = float (minutes).
//
// 2. NAMED schema — the file carries a sample code and a *sequence name* that is
//    resolved to strands against the user's sequence library at import time:
//      `{CODE}_{SeqName}_{time}{unit?}_…ignored….txt`
//      CTI-117_Aalpha_4h_05_UV_R_VIS_1.txt   → code=CTI-117, seqName=Aalpha, 4 h
//      CTI-118_Bbeta_30min.txt               → code=CTI-118, seqName=Bbeta, 30 min
//    CODE    = sample/run code (letters + '-' + digits, e.g. CTI-117); also used
//              as the replicate id so runs of the same sequence group together.
//    SeqName = library key (e.g. Aalpha), resolved to AB / A'B' strands elsewhere.
//    time    = number with optional unit — h/hr/hrs/hour(s) → hours (×60),
//              min/mins/m or no unit → minutes. Stored in MINUTES.
//    The Chromeleon channel suffix after the time block is ignored.

const FILENAME_RE = /^([ACGT]+)_([A-Za-z][A-Za-z0-9]*)_([ACGT]+)_([SU])(\d+)-(\d+(?:\.\d+)?)(?:_.*)?\.txt$/i

const NAMED_RE = /^([A-Za-z][A-Za-z0-9]*-\d+)_([A-Za-z][A-Za-z0-9]*)_(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|mins?|m)?(?:_.*)?\.txt$/i

// Convert a parsed time value + optional unit to minutes.
function timeToMinutes(value, unit) {
  const v = parseFloat(value)
  if (!isFinite(v)) return NaN
  const u = String(unit || '').toLowerCase()
  return u.startsWith('h') ? v * 60 : v   // hours → ×60; min / m / bare → minutes
}

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
  return { scheme: 'strands', ABseq, ABprimeSeq, replicatorName, condition, replicate, time, isCanonicalRC, raw: base }
}

// Parse the NAMED schema (`{CODE}_{SeqName}_{time}{unit?}….txt`). Returns
// { scheme:'named', code, seqName, time (minutes), raw } or { error }.
// The seqName still has to be resolved to strands against the sequence library.
export function parseNamedFilename(filename) {
  const base = String(filename || '').split('/').pop().replace(/[{}]/g, '')
  const m = base.match(NAMED_RE)
  if (!m) {
    return { error: `Filename must look like CTI-117_Aalpha_4h.txt  (code · _SeqName_ · time[h/min]).` }
  }
  return {
    scheme: 'named',
    code: m[1],
    seqName: m[2],
    time: timeToMinutes(m[3], m[4]),
    raw: base,
  }
}

// Unified entry point: try the NAMED schema first (its `CODE-####` prefix is
// distinctive and never collides with the ACGT-only strand schema), then fall
// back to the legacy STRAND schema. Returns a scheme-tagged meta or { error }.
export function parseHplcFilename(filename) {
  const named = parseNamedFilename(filename)
  if (!named.error) return named
  const strand = parseChromeleonFilename(filename)
  if (!strand.error) return strand
  return {
    error: 'Filename must match either CTI-117_Aalpha_4h.txt (code · name · time) ' +
           'or ATCGATCG_AB_CGATCGAT_S1-30.txt (seq · replicator · seq · S/U · rep · t).',
  }
}

export const HPLC_FILENAME_REGEX_SOURCE = FILENAME_RE.source
