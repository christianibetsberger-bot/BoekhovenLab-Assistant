// RDKit.js loader + descriptor helpers. The wasm/glue live in public/rdkit/ and
// are loaded on first use (≈7 MB), so nothing ships until a structure is drawn.
//
// molDescriptors() returns the average molecular weight (RDKit's `amw`, the
// equivalent of Descriptors.MolWt) and the Hill-system molecular formula
// (the equivalent of rdMolDescriptors.CalcMolFormula, computed here from the
// hydrogen-added molblock since RDKit_minimal exposes no formula method).

let rdkitPromise = null

export function loadRDKit() {
  if (rdkitPromise) return rdkitPromise
  rdkitPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') { reject(new Error('no window')); return }
    if (window.RDKit) { resolve(window.RDKit); return }
    const base = import.meta.env.BASE_URL || '/'
    const start = () => window.initRDKitModule({ locateFile: () => base + 'rdkit/RDKit_minimal.wasm' })
      .then((RDKit) => { window.RDKit = RDKit; resolve(RDKit) })
      .catch(reject)
    if (window.initRDKitModule) { start(); return }
    const s = document.createElement('script')
    s.src = base + 'rdkit/RDKit_minimal.js'
    s.async = true
    s.onload = start
    s.onerror = () => reject(new Error('Failed to load RDKit'))
    document.head.appendChild(s)
  })
  return rdkitPromise
}

// Count element occurrences from a molblock (handles both V2000 and V3000).
function countAtoms(molblock) {
  const counts = {}
  const lines = String(molblock || '').split(/\r?\n/)
  if (molblock.includes('V3000')) {
    let inAtom = false
    for (const ln of lines) {
      if (ln.includes('BEGIN ATOM')) { inAtom = true; continue }
      if (ln.includes('END ATOM')) break
      if (inAtom) {
        const m = ln.match(/^M\s+V30\s+\d+\s+([A-Za-z][a-z]?)/)
        if (m) counts[m[1]] = (counts[m[1]] || 0) + 1
      }
    }
  } else {
    const n = parseInt((lines[3] || '').slice(0, 3).trim(), 10)
    for (let i = 0; i < n; i++) {
      const sym = (lines[4 + i] || '').slice(31, 34).trim()
      if (sym) counts[sym] = (counts[sym] || 0) + 1
    }
  }
  return counts
}

// Assemble a formula in Hill order: C, H, then the rest alphabetically
// (all elements alphabetical when there is no carbon).
function hillFormula(counts) {
  const keys = Object.keys(counts)
  if (!keys.length) return ''
  let order
  if (counts.C) {
    const rest = keys.filter((e) => e !== 'C' && e !== 'H').sort()
    order = ['C', ...(counts.H ? ['H'] : []), ...rest]
  } else {
    order = keys.slice().sort()
  }
  return order.map((e) => (counts[e] > 1 ? `${e}${counts[e]}` : e)).join('')
}

// input: a SMILES string or a molblock. Returns { mw, formula, smiles } or null.
export async function molDescriptors(input) {
  if (!input) return null
  let RDKit
  try { RDKit = await loadRDKit() } catch { return null }
  let mol = null
  try {
    mol = RDKit.get_mol(String(input))
    if (!mol || (mol.is_valid && !mol.is_valid())) { mol?.delete?.(); return null }
    let mw = null
    try { mw = JSON.parse(mol.get_descriptors())?.amw ?? null } catch { /* ignore */ }
    let formula = ''
    try { formula = hillFormula(countAtoms(mol.add_hs())) } catch { /* ignore */ }
    let smiles = ''
    try { smiles = mol.get_smiles() } catch { /* ignore */ }
    return { mw, formula, smiles }
  } catch {
    return null
  } finally {
    try { mol?.delete?.() } catch { /* ignore */ }
  }
}
