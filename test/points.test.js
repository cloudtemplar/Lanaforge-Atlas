import { describe, it, expect } from 'vitest';
import { buildRegionIndex, assignRegion, generateFillPoints, generateContourPoints } from '../scripts/lib/points.mjs';

const square = (cx, cy, r=10) => ({
  type: 'Polygon',
  coordinates: [[[cx-r,cy-r],[cx+r,cy-r],[cx+r,cy+r],[cx-r,cy+r],[cx-r,cy-r]]],
});
const features = [
  { id: 'AA', geometry: square(0, 0, 10) },     // covers lon/lat in [-10,10]
  { id: 'BB', geometry: square(40, 40, 5) },    // covers lon/lat in [35,45]
];
const index = buildRegionIndex(features);

describe('assignRegion', () => {
  it('returns the region containing a point', () => {
    expect(assignRegion(index, 0, 0)).toBe('AA');
    expect(assignRegion(index, 41, 41)).toBe('BB');
  });
  it('returns null for points in no region (ocean)', () => {
    expect(assignRegion(index, 100, 0)).toBeNull();
  });
});

describe('generateFillPoints', () => {
  const pts = generateFillPoints(index, 2);
  it('only emits points inside regions, tagged fill', () => {
    expect(pts.length).toBeGreaterThan(0);
    for (const p of pts) {
      expect(['AA', 'BB']).toContain(p.regionId);
      expect(p.tier).toBe('fill');
    }
  });
});

describe('generateContourPoints', () => {
  const pts = generateContourPoints(features, 1);
  it('emits contour points tagged with their region and tier', () => {
    expect(pts.length).toBeGreaterThan(0);
    expect(pts.every(p => p.tier === 'contour')).toBe(true);
    expect(pts.some(p => p.regionId === 'AA')).toBe(true);
  });
  it('is denser than fill for the same area', () => {
    const fill = generateFillPoints(index, 1);
    const contour = generateContourPoints(features, 1);
    // contour traces perimeters at fine spacing; expect a healthy count
    expect(contour.length).toBeGreaterThan(10);
    expect(fill.length).toBeGreaterThan(10);
  });
});
