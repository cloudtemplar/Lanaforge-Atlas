import { describe, it, expect } from 'vitest';
import { buildHighlightSet, applyHighlights } from '../src/highlight.js';

describe('buildHighlightSet', () => {
  it('keeps valid ids and reports unknown ones', () => {
    const { set, unknown } = buildHighlightSet({ 'BR-SP': ['A'], 'ZZ-99': ['B'] }, new Set(['BR-SP', 'PT']));
    expect(set.has('BR-SP')).toBe(true);
    expect(set.has('ZZ-99')).toBe(false);
    expect(unknown).toEqual(['ZZ-99']);
  });
});

describe('applyHighlights', () => {
  it('recolors highlighted region points and restores others', () => {
    // 3 vertices: region AA (idx 0,1), region BB (idx 2)
    const colorArr = new Float32Array(9);
    const geometry = { getAttribute: () => ({ array: colorArr, needsUpdate: false, set(a){ colorArr.set(a); }, setXYZ(i,r,g,b){ colorArr[i*3]=r;colorArr[i*3+1]=g;colorArr[i*3+2]=b; } }) };
    const baseColors = new Float32Array([0.5,0.5,0.5, 0.5,0.5,0.5, 0.5,0.5,0.5]);
    const map = new Map([['AA',[0,1]],['BB',[2]]]);
    applyHighlights(geometry, map, baseColors, new Set(['AA']), '#ff5a1f');
    // AA points -> orange-ish (r>g,b); BB -> restored base
    expect(colorArr[0]).toBeGreaterThan(colorArr[1]); // idx0 red dominates
    expect(colorArr[6]).toBeCloseTo(0.5, 5);          // idx2 restored
  });
});
