// Strips modification blocks (e.g. [DSPC]), 5'/3' notation, and non-base chars,
// then returns an uppercase DNA/RNA string ready for calculations.
function cleanSeq(rawSeq, keepU = false) {
  const stripped = (rawSeq || '').replace(/\[.*?\]/g, '').toUpperCase().replace(/[^ACGTU]/g, '')
  return keepU ? stripped : stripped
}

// GC content (%). Returns 0 for empty or all-modifier sequences.
export function calcSeqGc(rawSeq) {
  const seq = (rawSeq || '').replace(/\[.*?\]/g, '').toUpperCase().replace(/[^ACGTU]/g, '')
  if (!seq.length) return 0
  let gc = 0
  for (let i = 0; i < seq.length; i++) if (seq[i] === 'G' || seq[i] === 'C') gc++
  return (gc / seq.length) * 100
}

// Nearest-neighbor extinction coefficient (L mol⁻¹ cm⁻¹).
// DNA: Cavaluzzi & Borer (2004); RNA: Puglisi & Tinoco (1989).
export function calcSeqExtinction(rawSeq, type) {
  if (!rawSeq) return 0
  const seq = rawSeq.replace(/\[.*?\]/g, '').toUpperCase().replace(/[^ACGTU]/g, '').replace(/U/g, 'T')
  if (seq.length === 0) return 0
  if (type === 'RNA') {
    const indRNA = { A: 15300, C: 7200, G: 11800, T: 9300, U: 9300 }
    const nnRNA = {
      AA: 27400, AC: 21000, AG: 25000, AU: 24000,
      CA: 21000, CC: 14200, CG: 17800, CU: 16200,
      GA: 25200, GC: 17400, GG: 21600, GU: 21200,
      UA: 23200, UC: 16000, UG: 19000, UU: 18400,
      AT: 24000, TA: 23200, CT: 16200, TC: 16000, GT: 21200, TG: 19000, TT: 18400,
    }
    let e = 0
    const cleanRNA = seq.replace(/T/g, 'U')
    for (let i = 0; i < cleanRNA.length - 1; i++) e += nnRNA[cleanRNA.substring(i, i + 2)] || 0
    for (let i = 1; i < cleanRNA.length - 1; i++) e -= indRNA[cleanRNA[i]] || 0
    return e
  } else {
    const ind = { A: 15400, C: 7400, G: 11500, T: 8700 }
    const nn = {
      AA: 27400, AC: 21200, AG: 25000, AT: 22800,
      CA: 21200, CC: 14600, CG: 18000, CT: 15200,
      GA: 25200, GC: 17600, GG: 21600, GT: 20000,
      TA: 23400, TC: 16200, TG: 19000, TT: 16800,
    }
    let e = 0
    for (let i = 0; i < seq.length - 1; i++) e += nn[seq.substring(i, i + 2)] || 0
    for (let i = 1; i < seq.length - 1; i++) e -= ind[seq[i]] || 0
    return e
  }
}

// Molecular weight (Da) including terminal water correction (−61.96 Da).
// DNA nucleotide weights: A=313.21, C=289.18, G=329.21, T=304.2
// RNA nucleotide weights: A=329.21, C=305.18, G=345.21, U=306.2
export function calcSeqMw(rawSeq, type) {
  if (!rawSeq) return 0
  const seq = rawSeq.replace(/\[.*?\]/g, '').toUpperCase().replace(/[^ACGTU]/g, '')
  if (seq.length === 0) return 0
  let a = 0, c = 0, g = 0, t = 0, u = 0
  for (let i = 0; i < seq.length; i++) {
    if (seq[i] === 'A') a++
    else if (seq[i] === 'C') c++
    else if (seq[i] === 'G') g++
    else if (seq[i] === 'T') t++
    else if (seq[i] === 'U') u++
  }
  if (type === 'RNA') return (a * 329.21) + (c * 305.18) + (g * 345.21) + (u * 306.2) - 61.96
  return (a * 313.21) + (c * 289.18) + (g * 329.21) + (t * 304.2) - 61.96
}

// Nearest-neighbor Tm (°C), SantaLucia (1998).
// Conditions: 50 mM Na⁺, 0.25 µM oligonucleotide. DNA only.
export function calcSeqTm(rawSeq) {
  if (!rawSeq) return 0
  const seq = rawSeq.replace(/\[.*?\]/g, '').toUpperCase().replace(/[^ACGT]/g, '')
  const len = seq.length
  if (len < 2) return 0
  const nnParams = {
    AA: { dH: -7.9, dS: -22.2 }, TT: { dH: -7.9, dS: -22.2 },
    AT: { dH: -7.2, dS: -20.4 }, TA: { dH: -7.2, dS: -21.3 },
    CA: { dH: -8.5, dS: -22.7 }, TG: { dH: -8.5, dS: -22.7 },
    GT: { dH: -8.4, dS: -22.4 }, AC: { dH: -8.4, dS: -22.4 },
    CT: { dH: -7.8, dS: -21.0 }, AG: { dH: -7.8, dS: -21.0 },
    GA: { dH: -8.2, dS: -22.2 }, TC: { dH: -8.2, dS: -22.2 },
    CG: { dH: -10.6, dS: -27.2 }, GC: { dH: -9.8, dS: -24.4 },
    GG: { dH: -8.0, dS: -19.9 }, CC: { dH: -8.0, dS: -19.9 },
  }
  let dH = 0.2, dS = -5.7
  if (seq[0] === 'A' || seq[0] === 'T') { dH += 2.2; dS += 6.9 }
  if (seq[len - 1] === 'A' || seq[len - 1] === 'T') { dH += 2.2; dS += 6.9 }
  for (let i = 0; i < len - 1; i++) {
    const pair = seq.substring(i, i + 2)
    if (nnParams[pair]) { dH += nnParams[pair].dH; dS += nnParams[pair].dS }
  }
  dS = dS + 0.368 * (len - 1) * Math.log(0.05)       // 50 mM Na⁺ correction
  const tm = (dH * 1000) / (dS + 1.987 * Math.log(0.25e-6 / 4)) - 273.15  // 0.25 µM oligo
  return Math.max(0, tm)
}
