import { describe, it, expect } from 'vitest';
import { buildRegions } from '../scripts/lib/regions.mjs';

// Minimal fake FeatureCollections covering the cases we care about.
const square = (cx, cy) => ({
  type: 'Polygon',
  coordinates: [[[cx-1,cy-1],[cx+1,cy-1],[cx+1,cy+1],[cx-1,cy+1],[cx-1,cy-1]]],
});
const countries = { type: 'FeatureCollection', features: [
  { properties: { ISO_A2_EH: 'US', NAME: 'United States' }, geometry: square(-98, 38) }, // one of the 4 -> excluded
  { properties: { ISO_A2_EH: 'PT', NAME: 'Portugal' }, geometry: square(-8, 39) },        // not in 4 -> included as country
]};
const states = { type: 'FeatureCollection', features: [
  { properties: { iso_3166_2: 'US-CA', name: 'California', iso_a2: 'US' }, geometry: square(-119, 36) }, // parent US in 4 -> included
  { properties: { iso_3166_2: 'PT-11', name: 'Lisboa', iso_a2: 'PT' }, geometry: square(-9, 38) },       // parent PT not in 4 -> excluded
]};

describe('buildRegions', () => {
  const { regions } = buildRegions(countries, states);
  const ids = regions.map(r => r.id);
  it('includes non-4 countries as admin-0 ids', () => {
    expect(ids).toContain('PT');
  });
  it('excludes the whole-country polygon for the 4 state-level countries', () => {
    expect(ids).not.toContain('US');
  });
  it('includes admin-1 ids for the 4 state-level countries', () => {
    expect(ids).toContain('US-CA');
  });
  it('excludes admin-1 ids for non-4 countries', () => {
    expect(ids).not.toContain('PT-11');
  });
  it('computes a centroid for every region', () => {
    for (const r of regions) {
      expect(typeof r.centroid.lat).toBe('number');
      expect(typeof r.centroid.lon).toBe('number');
    }
  });
});
