import { describe, it, expect } from 'vitest';
import { buildRegions } from '../scripts/lib/regions.mjs';
import { buildRegionIndex, assignRegion } from '../scripts/lib/points.mjs';

// Minimal fake FeatureCollections covering the cases we care about.
const square = (cx, cy) => ({
  type: 'Polygon',
  coordinates: [[[cx-1,cy-1],[cx+1,cy-1],[cx+1,cy+1],[cx-1,cy+1],[cx-1,cy-1]]],
});
// A big mainland square + a small detached square far away (like France + an overseas
// territory). Mainland half-width 3°, far half-width 1°.
const ring = (cx, cy, r) => [[cx-r,cy-r],[cx+r,cy-r],[cx+r,cy+r],[cx-r,cy+r],[cx-r,cy-r]];
const mainlandPlusFar = (main, far) => ({
  type: 'MultiPolygon',
  coordinates: [[ring(main[0], main[1], 3)], [ring(far[0], far[1], 1)]],
});
const polyR = (cx, cy, r) => ({ type: 'Polygon', coordinates: [ring(cx, cy, r)] });
const countries = { type: 'FeatureCollection', features: [
  { properties: { ISO_A2_EH: 'US', NAME: 'United States' }, geometry: square(-98, 38) }, // state-level -> excluded
  { properties: { ISO_A2_EH: 'PT', NAME: 'Portugal' }, geometry: square(-8, 39) },        // not state-level -> included as country
  { properties: { ISO_A2_EH: 'FR', NAME: 'France' }, geometry: mainlandPlusFar([2, 47], [-53, 4]) }, // mainland + overseas
  // Three features sharing ISO 'AU' (tiny dependency FIRST to prove we keep by area, not order).
  { properties: { ISO_A2_EH: 'AU', NAME: 'Indian Ocean Ter.' }, geometry: polyR(105, -10, 0.5) },
  { properties: { ISO_A2_EH: 'AU', NAME: 'Australia' }, geometry: polyR(133, -25, 10) },
]};
const states = { type: 'FeatureCollection', features: [
  { properties: { iso_3166_2: 'US-CA', name: 'California', iso_a2: 'US' }, geometry: square(-119, 36) }, // parent US state-level -> included
  { properties: { iso_3166_2: 'PT-11', name: 'Lisboa', iso_a2: 'PT' }, geometry: square(-9, 38) },       // parent PT not state-level -> excluded
  { properties: { iso_3166_2: 'PT-20', name: 'Azores', iso_a2: 'PT' }, geometry: square(-27, 38) },     // TERRITORY_REGIONS -> carved out
  { properties: { iso_3166_2: 'FR-GF', name: 'French Guiana', iso_a2: 'FR' }, geometry: square(-53, 4) }, // carved overseas; overlaps FR's far polygon
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

describe('detached territory regions', () => {
  const { regions, features } = buildRegions(countries, states);
  const ids = regions.map((r) => r.id);

  it('emits a region for a TERRITORY_REGIONS code', () => {
    expect(ids).toContain('PT-20');
  });
  it('prefixes the territory name with the parent country name', () => {
    const az = regions.find((r) => r.id === 'PT-20');
    expect(az.name).toBe('Portugal - Azores');
  });
  it('still emits the parent country as its own region', () => {
    expect(ids).toContain('PT');
  });
  it('orders territory features before the parent country feature', () => {
    const fids = features.map((f) => f.id);
    expect(fids.indexOf('PT-20')).toBeLessThan(fids.indexOf('PT'));
  });
});

describe('duplicate ISO codes collapse to the largest feature', () => {
  const { regions, features } = buildRegions(countries, states);

  it('emits exactly one region for a code shared by several features', () => {
    expect(regions.filter((r) => r.id === 'AU')).toHaveLength(1);
  });
  it('keeps the largest feature (Australia), dropping the tiny dependencies', () => {
    expect(regions.find((r) => r.id === 'AU').name).toBe('Australia');
  });
  it('emits exactly one country feature for the code', () => {
    expect(features.filter((f) => f.id === 'AU')).toHaveLength(1);
  });
});

describe('parent country geometry excludes carved territories', () => {
  const { features } = buildRegions(countries, states);
  // Index ONLY the parent country (FR-GF removed) so first-match ordering can't mask
  // the leak — this asserts FR's own geometry no longer covers the territory.
  const frOnly = buildRegionIndex(features.filter((f) => f.id === 'FR'));

  it('the parent no longer contains its carved territory area', () => {
    expect(assignRegion(frOnly, -53, 4)).toBeNull();
  });
  it('the parent still contains its mainland', () => {
    expect(assignRegion(frOnly, 2, 47)).toBe('FR');
  });
});

describe('country centroid ignores detached territories', () => {
  const { regions } = buildRegions(countries, states);

  it('places the country centroid on its largest landmass, not dragged toward far parts', () => {
    const fr = regions.find((r) => r.id === 'FR');
    // Mainland square centred at (lon 2, lat 47); a far square at (lon -53, lat 4)
    // must NOT pull the label out into the ocean.
    expect(fr.centroid.lat).toBeCloseTo(47, 0);
    expect(fr.centroid.lon).toBeCloseTo(2, 0);
  });
});
