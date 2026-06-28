import { describe, it, expect } from 'vitest';
import { buildIsoReference } from '../scripts/lib/reference.mjs';

const regions = [
  { id: 'PT', name: 'Portugal', centroid: { lat: 39, lon: -8 } },
  { id: 'PT-20', name: 'Portugal - Azores', centroid: { lat: 38, lon: -27 } },
  { id: 'US-CA', name: 'US - California', centroid: { lat: 37, lon: -119 } },
];

describe('buildIsoReference', () => {
  const md = buildIsoReference(regions);

  it('lists a country in the countries table', () => {
    expect(md).toContain('| PT | Portugal |');
  });
  it('lists a detached territory id in the sub-regions table', () => {
    expect(md).toContain('| PT-20 | Portugal - Azores |');
  });
  it('describes the sub-regions section as covering detached territories too', () => {
    expect(md).toMatch(/detached territories/i);
  });
});
