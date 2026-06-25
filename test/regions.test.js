import { describe, it, expect } from 'vitest';
import { buildRegions } from '../scripts/lib/regions.mjs';

// Minimal fake FeatureCollections covering the cases we care about.
const square = (cx, cy) => ({
  type: 'Polygon',
  coordinates: [[[cx-1,cy-1],[cx+1,cy-1],[cx+1,cy+1],[cx-1,cy+1],[cx-1,cy-1]]],
});
const countries = { type: 'FeatureCollection', features: [
  { properties: { ISO_A2_EH: 'FR', NAME: 'France' }, geometry: square(2, 47) },   // one of the 14 -> excluded
  { properties: { ISO_A2_EH: 'PT', NAME: 'Portugal' }, geometry: square(-8, 39) },// not 14 -> included as country
]};
const states = { type: 'FeatureCollection', features: [
  { properties: { iso_3166_2: 'FR-IDF', name: 'Île-de-France', iso_a2: 'FR' }, geometry: square(2, 48) },
  { properties: { iso_3166_2: 'PT-11', name: 'Lisboa', iso_a2: 'PT' }, geometry: square(-9, 38) }, // not 14 -> excluded
]};

describe('buildRegions', () => {
  const { regions } = buildRegions(countries, states);
  const ids = regions.map(r => r.id);
  it('includes non-14 countries as admin-0 ids', () => {
    expect(ids).toContain('PT');
  });
  it('excludes the whole-country polygon for the 14', () => {
    expect(ids).not.toContain('FR');
  });
  it('includes admin-1 ids for the 14 countries', () => {
    expect(ids).toContain('FR-IDF');
  });
  it('excludes admin-1 ids for non-14 countries', () => {
    expect(ids).not.toContain('PT-11');
  });
  it('computes a centroid for every region', () => {
    for (const r of regions) {
      expect(typeof r.centroid.lat).toBe('number');
      expect(typeof r.centroid.lon).toBe('number');
    }
  });
});
