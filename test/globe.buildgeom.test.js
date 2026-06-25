import { describe, it, expect } from 'vitest';
import { buildPointsGeometry } from '../src/globe.js';

const points = [
  { lat: 0, lon: 0, regionId: 'AA', tier: 'contour' },
  { lat: 10, lon: 10, regionId: 'AA', tier: 'fill' },
  { lat: -5, lon: 20, regionId: 'BB', tier: 'fill' },
];

describe('buildPointsGeometry', () => {
  const { geometry, regionIndexMap } = buildPointsGeometry(points, 1);
  it('creates position and color attributes of the right length', () => {
    expect(geometry.getAttribute('position').count).toBe(3);
    expect(geometry.getAttribute('color').count).toBe(3);
  });
  it('maps region ids to their vertex indices', () => {
    expect(regionIndexMap.get('AA')).toEqual([0, 1]);
    expect(regionIndexMap.get('BB')).toEqual([2]);
  });
});
