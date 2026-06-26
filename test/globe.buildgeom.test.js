import { describe, it, expect } from 'vitest';
import { buildPointsGeometry } from '../src/globe.js';

const points = [
  { lat: 0,  lon: 0,  regionId: 'AA', category: 'coast' },
  { lat: 10, lon: 10, regionId: 'AA', category: 'land'  },
  { lat: -5, lon: 20, regionId: 'BB', category: 'land'  },
  { lat: 30, lon: 40, regionId: null, category: 'border' }, // null regionId — must not appear in map
  { lat: 5,  lon: 5,  regionIds: ['AA', 'BB'], category: 'border' }, // border dot on AA/BB seam
];

describe('buildPointsGeometry', () => {
  const { geometry, regionIndexMap } = buildPointsGeometry(points, 1);

  it('creates position and color attributes of the right length', () => {
    expect(geometry.getAttribute('position').count).toBe(5);
    expect(geometry.getAttribute('color').count).toBe(5);
  });

  it('creates aSize and aOpacity attributes of the right length', () => {
    expect(geometry.getAttribute('aSize').count).toBe(5);
    expect(geometry.getAttribute('aOpacity').count).toBe(5);
  });

  it('maps single + multi region ids to their vertex indices', () => {
    // AA: land/coast idx 0,1 + the multi-region border dot idx 4
    expect(regionIndexMap.get('AA')).toEqual([0, 1, 4]);
    // BB: land idx 2 + the multi-region border dot idx 4 (appears in both)
    expect(regionIndexMap.get('BB')).toEqual([2, 4]);
  });

  it('excludes null-regionId points from regionIndexMap', () => {
    // No entry for null; map should only have AA and BB
    expect(regionIndexMap.has(null)).toBe(false);
    expect([...regionIndexMap.keys()]).toEqual(['AA', 'BB']);
  });
});
