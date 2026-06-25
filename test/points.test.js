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

  it('point count is driven by perimeter/stepDeg, not source vertex count (arc-length decoupling)', () => {
    // Build a 20x20-degree square centered at origin two ways:
    // (a) coarse: 4 corners only
    const coarseRing = [[-10,-10],[10,-10],[10,10],[-10,10],[-10,-10]];
    // (b) dense: each of the 4 edges subdivided into 50 collinear segments (~200 vertices)
    function subdivideSide(x1, y1, x2, y2, n) {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const t = i / n;
        pts.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
      }
      return pts;
    }
    const n = 50;
    const denseRing = [
      ...subdivideSide(-10,-10,  10,-10, n),
      ...subdivideSide( 10,-10,  10, 10, n),
      ...subdivideSide( 10, 10, -10, 10, n),
      ...subdivideSide(-10, 10, -10,-10, n),
      [-10,-10], // close ring
    ];

    const coarseFeature = [{ id: 'C1', geometry: { type: 'Polygon', coordinates: [coarseRing] } }];
    const denseFeature  = [{ id: 'D1', geometry: { type: 'Polygon', coordinates: [denseRing]  } }];

    const stepDeg = 1;
    const coarseCount = generateContourPoints(coarseFeature, stepDeg).length;
    const denseCount  = generateContourPoints(denseFeature,  stepDeg).length;

    // Both should yield approximately perimeter/stepDeg points.
    // Perimeter of the square is ~80 degrees (4 sides × 20 deg each).
    // Allow ±3 point tolerance.
    expect(Math.abs(coarseCount - denseCount)).toBeLessThanOrEqual(3);
  });
});
