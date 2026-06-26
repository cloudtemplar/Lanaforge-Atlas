import { describe, it, expect } from 'vitest';
import { buildRegions } from '../scripts/lib/regions.mjs';

// Minimal fake FeatureCollections covering the cases we care about.
const square = (cx, cy) => ({
  type: 'Polygon',
  coordinates: [[[cx-1,cy-1],[cx+1,cy-1],[cx+1,cy+1],[cx-1,cy+1],[cx-1,cy-1]]],
});
const countries = { type: 'FeatureCollection', features: [
  { properties: { ISO_A2_EH: 'US', NAME: 'United States' }, geometry: square(-98, 38) }, // state-level -> excluded
  { properties: { ISO_A2_EH: 'PT', NAME: 'Portugal' }, geometry: square(-8, 39) },        // not state-level -> included as country
]};
const states = { type: 'FeatureCollection', features: [
  { properties: { iso_3166_2: 'US-CA', name: 'California', iso_a2: 'US' }, geometry: square(-119, 36) }, // parent US state-level -> included
  { properties: { iso_3166_2: 'PT-11', name: 'Lisboa', iso_a2: 'PT' }, geometry: square(-9, 38) },       // parent PT not state-level -> excluded
]};

describe('buildRegions', () => {
  const { regions } = buildRegions(countries, states);
  const ids = regions.map(r => r.id);
  it('includes non-state-level countries as admin-0 ids', () => {
    expect(ids).toContain('PT');
  });
  it('excludes the whole-country polygon for state-level countries', () => {
    expect(ids).not.toContain('US');
  });
  it('includes admin-1 ids for state-level countries', () => {
    expect(ids).toContain('US-CA');
  });
  it('excludes admin-1 ids for non-state-level countries', () => {
    expect(ids).not.toContain('PT-11');
  });
  it('computes a centroid for every region', () => {
    for (const r of regions) {
      expect(typeof r.centroid.lat).toBe('number');
      expect(typeof r.centroid.lon).toBe('number');
    }
  });
  it('prefixes admin-1 names with the country label', () => {
    const ca = regions.find(r => r.id === 'US-CA');
    expect(ca.name).toBe('US - California');
  });
  it('leaves non-state-level country names unprefixed', () => {
    const pt = regions.find(r => r.id === 'PT');
    expect(pt.name).toBe('Portugal');
  });
});
