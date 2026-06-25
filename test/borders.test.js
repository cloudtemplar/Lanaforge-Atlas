import { describe, it, expect } from 'vitest';
import { buildBorders } from '../scripts/lib/borders.mjs';

const line = (coords, props = {}) => ({
  type: 'Feature',
  properties: props,
  geometry: { type: 'LineString', coordinates: coords },
});

const countryLines = {
  type: 'FeatureCollection',
  features: [line([[0, 0], [1, 1], [2, 2]])],
};

const stateLines = {
  type: 'FeatureCollection',
  features: [
    // Brief's original cases (lowercase iso_a2 / already-alpha-2 form):
    line([[10, 10], [11, 11]], { iso_a2: 'US' }), // one of the 4 -> KEPT
    line([[20, 20], [21, 21]], { iso_a2: 'PT' }), // not in 4 -> DROPPED

    // Real-data cases (uppercase ADM0_A3, 3-letter ISO):
    line([[30, 30], [31, 31]], { ADM0_A3: 'JPN' }), // Japan (JP) -> KEPT; in the 4
    line([[40, 40], [41, 41]], { ADM0_A3: 'PRT' }), // Portugal -> DROPPED
  ],
};

describe('buildBorders', () => {
  const segs = buildBorders(countryLines, stateLines);

  it('emits paired endpoints as [lat,lon]', () => {
    // first country line: (0,0)-(1,1) and (1,1)-(2,2) => 4 endpoints
    // GeoJSON coords are [lon, lat]; output must be [lat, lon]
    expect(segs[0]).toEqual([0, 0]); // [lat=0, lon=0]
    expect(segs.length % 2).toBe(0);
  });

  it('keeps all country lines', () => {
    // country line has 3 points -> 2 segments -> 4 endpoints
    // check first endpoint is [lat,lon] from [lon=0,lat=0]
    expect(segs[0]).toEqual([0, 0]);
  });

  it('keeps only state lines belonging to the 4 state-level countries (iso_a2 form)', () => {
    const flat = JSON.stringify(segs);
    expect(flat).toContain('[10,10]'); // US iso_a2 kept
    expect(flat).not.toContain('[20,20]'); // PT iso_a2 dropped
  });

  it('keeps state line with ADM0_A3="JPN" (3-letter Japan, JP is in the 4)', () => {
    const flat = JSON.stringify(segs);
    expect(flat).toContain('[30,30]'); // JPN -> JP -> KEPT
  });

  it('drops state line with ADM0_A3="PRT" (3-letter Portugal, not in the 4)', () => {
    const flat = JSON.stringify(segs);
    expect(flat).not.toContain('[40,40]'); // PRT -> PT -> DROPPED
  });
});
