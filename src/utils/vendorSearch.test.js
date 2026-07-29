import { describe, it, expect } from 'vitest'
import { vendorSearchUrl, vendorLinks } from './vendorSearch.js'

describe('vendorSearchUrl', () => {
  it('prefers CAS, then catalogue, then name for the query', () => {
    const item = { name: 'Fluorescein', cas: '2321-07-5', catalogue: 'F6377' }
    expect(vendorSearchUrl('sigma', item)).toContain('2321-07-5')
    expect(vendorSearchUrl('sigma', { name: 'x', catalogue: 'C1' })).toContain('C1')
    expect(vendorSearchUrl('sigma', { name: 'Acetone' })).toContain('Acetone')
  })

  it('sends a CAS straight to the BLD Pharm product page, else keyword search', () => {
    expect(vendorSearchUrl('bld', { cas: '2321-07-5' })).toBe('https://www.bldpharm.com/products/2321-07-5.html')
    expect(vendorSearchUrl('bld', { name: 'Cy3 azide' })).toContain('/search-home.html?keyword=Cy3%20azide')
  })

  it('URL-encodes the query', () => {
    expect(vendorSearchUrl('merck', { name: 'sodium chloride' })).toContain('SearchTerm=sodium%20chloride')
    expect(vendorSearchUrl('lumi', { name: 'Cy5 NHS' })).toContain('q=Cy5%20NHS')
  })

  it('returns null when there is nothing to search', () => {
    expect(vendorSearchUrl('sigma', {})).toBeNull()
    expect(vendorSearchUrl('unknown', { name: 'x' })).toBeNull()
  })
})

describe('vendorLinks', () => {
  it('returns all four vendors with URLs', () => {
    const links = vendorLinks({ name: 'Fluorescein', cas: '2321-07-5' })
    expect(links.map(l => l.key)).toEqual(['sigma', 'merck', 'bld', 'lumi'])
    expect(links.every(l => l.url.startsWith('https://'))).toBe(true)
  })
  it('is empty when the item has no searchable fields', () => {
    expect(vendorLinks({})).toEqual([])
  })
})
