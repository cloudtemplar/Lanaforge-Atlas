import { describe, it, expect } from 'vitest';
import { buildPointsGeometry } from '../src/globe.js';

const points = [
  { lat: 0,  lon: 0,  regionId: 'AA', category: 'coast' },
  { lat: 10, lon: 10, regionId: 'AA', category: 'land'  },
  { lat: -5, lon: 20, regionId: 'BB', category: 'land'  },
  { lat: 30, lon: 40, regionId: null, category: 'border' }, // null regionId — must not appear in map
];

describe('buildPointsGeometry', () => {
  const { geometry, regionIndexMap } = buildPointsGeometry(points, 1);

  it('creates position and color attributes of the right length', () => {
    expect(geometry.getAttribute('position').count).toBe(4);
    expect(geometry.getAttribute('color').count).toBe(4);
  });

  it('creates aSize and aOpacity attributes of the right length', () => {
    expect(geometry.getAttribute('aSize').count).toBe(4);
    expect(geometry.getAttribute('aOpacity').count).toBe(4);
  });

  it('maps non-null region ids to their vertex indices', () => {
    expect(regionIndexMap.get('AA')).toEqual([0, 1]);
    expect(regionIndexMap.get('BB')).toEqual([2]);
  });

  it('excludes null-regionId points from regionIndexMap', () => {
    // No entry for null; map should only have AA and BB
    expect(regionIndexMap.has(null)).toBe(false);
    expect([...regionIndexMap.keys()]).toEqual(['AA', 'BB']);
  });
});
