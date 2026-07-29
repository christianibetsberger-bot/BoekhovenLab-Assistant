// One-click "look it up on the vendor" links for the lab's common suppliers.
// No scraping — each link opens the vendor's own site pre-loaded with the query,
// where pack/bottle sizes and prices are shown directly. The query prefers CAS
// (most precise), then the catalogue number, then the name.
//
// URL templates: Sigma-Aldrich is confirmed; the others use each vendor's
// standard search pattern (BLD Pharm resolves a CAS straight to its product
// page). If a vendor changes its search URL, fix it in one place here.

export const VENDORS = [
  { key: 'sigma', name: 'Sigma-Aldrich' },
  { key: 'merck', name: 'Merck' },
  { key: 'bld',   name: 'BLD Pharm' },
  { key: 'lumi',  name: 'Lumiprobe' },
]

const CAS_RE = /^\d{2,7}-\d{2}-\d$/

// Build a vendor search URL for one supplier. Returns null if there's nothing to
// search on.
export function vendorSearchUrl(vendor, { name = '', cas = '', catalogue = '' } = {}) {
  const q = String(cas || catalogue || name || '').trim()
  if (!q) return null
  const e = encodeURIComponent(q)
  switch (vendor) {
    case 'sigma':
      return `https://www.sigmaaldrich.com/DE/en/search/${e}?focus=products&page=1&perpage=30&sort=relevance&term=${e}&type=product`
    case 'merck':
      return `https://www.merckmillipore.com/DE/en/search/-?SearchTerm=${e}`
    case 'bld':
      // A CAS number maps straight to the product page; else keyword search.
      return CAS_RE.test(q) ? `https://www.bldpharm.com/products/${e}.html` : `https://www.bldpharm.com/search-home.html?keyword=${e}`
    case 'lumi':
      return `https://www.lumiprobe.com/search?q=${e}`
    default:
      return null
  }
}

// All vendor links for a chemical, ready to render as buttons.
export function vendorLinks(item) {
  return VENDORS.map(v => ({ ...v, url: vendorSearchUrl(v.key, item) })).filter(v => v.url)
}
