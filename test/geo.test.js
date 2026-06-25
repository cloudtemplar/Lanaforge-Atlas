import { describe, it, expect } from 'vitest';
import { latLonToVector3, angularDistanceDeg } from '../src/geo.js';

describe('latLonToVector3', () => {
  it('maps (0,0) to +X axis on the sphere of given radius', () => {
    const v = latLonToVector3(0, 0, 1);
    expect(v.x).toBeCloseTo(1, 5);
    expect(v.y).toBeCloseTo(0, 5);
    expect(v.z).toBeCloseTo(0, 5);
  });
  it('maps the north pole (90,0) to +Y', () => {
    const v = latLonToVector3(90, 0, 1);
    expect(v.y).toBeCloseTo(1, 5);
  });
  it('keeps points on the sphere radius', () => {
    const v = latLonToVector3(33, -70, 2);
    expect(v.length()).toBeCloseTo(2, 5);
  });
});

describe('angularDistanceDeg', () => {
  it('is 0 for identical points', () => {
    expect(angularDistanceDeg(10, 20, 10, 20)).toBeCloseTo(0, 5);
  });
  it('is 90 between equator point and north pole', () => {
    expect(angularDistanceDeg(0, 0, 90, 0)).toBeCloseTo(90, 4);
  });
});
