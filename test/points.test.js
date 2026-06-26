import { describe, it, expect } from 'vitest';
import {
  buildRegionIndex, assignRegion, assignRegionNudged,
  generateLandPoints, generateCoastPoints, generateBorderPoints,
  thinByHierarchy,
} from '../scripts/lib/points.mjs';

const square = (cx, cy, r = 10) => ({
  type: 'Polygon',
  coordinates: [[[cx - r, cy - r], [cx + r, cy - r], [cx + r, cy + r], [cx - r, cy + r], [cx - r, cy - r]]],
});
const features = [
  { id: 'AA', geometry: square(0, 0, 10) },   // covers lon/lat in [-10,10]
  { id: 'BB', geometry: square(40, 40, 5) },  // covers lon/lat in [35,45]
];
const index = buildRegionIndex(features);

const line = (coords, props = {}) => ({
  type: 'Feature',
  properties: props,
  geometry: { type: 'LineString', coordinates: coords },
});

// ---------------------------------------------------------------------------
describe('assignRegion', () => {
  it('returns the region containing a point', () => {
    expect(assignRegion(index, 0, 0)).toBe('AA');
    expect(assignRegion(index, 41, 41)).toBe('BB');
  });
  it('returns null for points in no region (ocean)', () => {
    expect(assignRegion(index, 100, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('assignRegionNudged', () => {
  it('resolves a point just outside a square boundary to that square', () => {
    // AA covers [-10,10] x [-10,10]. A point at lon=10.05 is just beyond the edge
    // (within 0.08°) — nudged probe should hit AA.
    expect(assignRegionNudged(index, 10.05, 0)).toBe('AA');
  });
  it('returns null for a far-away ocean point', () => {
    expect(assignRegionNudged(index, 100, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('generateLandPoints', () => {
  const pts = generateLandPoints(index, 2);
  it('only emits points inside regions, tagged category:land with regionId set', () => {
    expect(pts.length).toBeGreaterThan(0);
    for (const p of pts) {
      expect(['AA', 'BB']).toContain(p.regionId);
      expect(p.category).toBe('land');
    }
  });
});

// ---------------------------------------------------------------------------
describe('generateCoastPoints', () => {
  const coastlineFC = {
    type: 'FeatureCollection',
    // A ~10-degree line inside region AA
    features: [line([[-5, 0], [5, 0]])],
  };

  it('emits points tagged category:coast', () => {
    const pts = generateCoastPoints(coastlineFC, index, 1);
    expect(pts.length).toBeGreaterThan(0);
    for (const p of pts) {
      expect(p.category).toBe('coast');
    }
  });

  it('arc-length spacing is independent of source vertex count', () => {
    function subdivide(x1, y1, x2, y2, n) {
      const coords = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        coords.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
      }
      return coords;
    }

    const coarseFC = {
      type: 'FeatureCollection',
      features: [line([[-5, 0], [5, 0]])],
    };
    const denseFC = {
      type: 'FeatureCollection',
      features: [line(subdivide(-5, 0, 5, 0, 50))],
    };

    const stepDeg = 1;
    const coarseCount = generateCoastPoints(coarseFC, index, stepDeg).length;
    const denseCount  = generateCoastPoints(denseFC, index, stepDeg).length;
    // Both trace the same ~10° line — counts must match within ±3 points.
    expect(Math.abs(coarseCount - denseCount)).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
describe('generateBorderPoints', () => {
  const countryLines = {
    type: 'FeatureCollection',
    features: [line([[0, 0], [1, 1], [2, 2]])],
  };
  const stateLines = {
    type: 'FeatureCollection',
    features: [
      line([[10, 10], [11, 11]], { iso_a2: 'US' }),    // KEPT (US in STATE_LEVEL)
      line([[20, 20], [21, 21]], { iso_a2: 'PT' }),    // DROPPED
      line([[30, 30], [31, 31]], { ADM0_A3: 'JPN' }), // KEPT (JP in STATE_LEVEL)
      line([[40, 40], [41, 41]], { ADM0_A3: 'PRT' }), // DROPPED
    ],
  };

  const pts = generateBorderPoints(countryLines, stateLines, 0.5);

  it('all output tagged category:border with regionId null', () => {
    expect(pts.length).toBeGreaterThan(0);
    for (const p of pts) {
      expect(p.category).toBe('border');
      expect(p.regionId).toBeNull();
    }
  });

  it('includes all country-line points', () => {
    // Country line: lon 0-2, lat 0-2 — must have points in that bbox.
    expect(pts.some(p => p.lon >= 0 && p.lon <= 2 && p.lat >= 0 && p.lat <= 2)).toBe(true);
  });

  it('keeps iso_a2:US (KEPT) and drops iso_a2:PT (DROPPED)', () => {
    expect(pts.some(p => p.lon >= 10 && p.lon <= 11 && p.lat >= 10 && p.lat <= 11)).toBe(true);
    expect(pts.some(p => p.lon >= 20 && p.lon <= 21 && p.lat >= 20 && p.lat <= 21)).toBe(false);
  });

  it('keeps ADM0_A3:JPN (KEPT) and drops ADM0_A3:PRT (DROPPED)', () => {
    expect(pts.some(p => p.lon >= 30 && p.lon <= 31 && p.lat >= 30 && p.lat <= 31)).toBe(true);
    expect(pts.some(p => p.lon >= 40 && p.lon <= 41 && p.lat >= 40 && p.lat <= 41)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('thinByHierarchy', () => {
  const at = (lon, lat, category) => ({ lon, lat, category, regionId: null });

  it('keeps every coast dot regardless of crowding', () => {
    const coast = [at(0, 0, 'coast'), at(0.01, 0, 'coast'), at(0.02, 0, 'coast')];
    const out = thinByHierarchy(coast, [], [], 0.6);
    expect(out.length).toBe(3);
  });

  it('drops a border dot near a kept coast dot, keeps a far one', () => {
    const coast = [at(0, 0, 'coast')];
    const border = [at(0.1, 0, 'border'), at(5, 0, 'border')];
    const out = thinByHierarchy(coast, border, [], 0.6);
    expect(out.some(p => p.category === 'border' && p.lon === 0.1)).toBe(false); // within clearance
    expect(out.some(p => p.category === 'border' && p.lon === 5)).toBe(true);    // far
  });

  it('drops a land dot near either a coast or a kept border dot', () => {
    const coast = [at(0, 0, 'coast')];
    const border = [at(10, 0, 'border')];
    const land = [
      at(0.2, 0, 'land'),  // near coast -> dropped
      at(10.2, 0, 'land'), // near kept border -> dropped
      at(50, 0, 'land'),   // isolated -> kept
    ];
    const out = thinByHierarchy(coast, border, land, 0.6);
    const lands = out.filter(p => p.category === 'land').map(p => p.lon);
    expect(lands).toEqual([50]);
  });

  it('finds neighbours across grid-cell boundaries at high latitude', () => {
    // longitude degrees shrink with cos(lat); a land dot 0.3° east of a coast dot
    // at lat 70 must still be detected as within a 0.6° great-circle clearance.
    const coast = [at(0, 70, 'coast')];
    const land = [at(0.3, 70, 'land')];
    const out = thinByHierarchy(coast, land.length ? [] : [], land, 0.6);
    expect(out.some(p => p.category === 'land')).toBe(false);
  });
});
