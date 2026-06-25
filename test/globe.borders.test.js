import { describe, it, expect } from 'vitest';
import { createBordersObject } from '../src/globe.js';

describe('createBordersObject', () => {
  const segs = [[0,0],[1,1],[2,2],[3,3]]; // two segments
  const obj = createBordersObject(segs, 1, { border: '#888' });
  it('builds a position attribute with one vertex per endpoint', () => {
    expect(obj.geometry.getAttribute('position').count).toBe(4);
  });
});
