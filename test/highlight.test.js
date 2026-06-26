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
  it('recolors highlighted region points (color + opacity) and restores others', () => {
    // 3 vertices: region AA (idx 0,1), region BB (idx 2)
    const colorArr   = new Float32Array(9);
    const opacityArr = new Float32Array(3);

    // Mock geometry exposes both 'color' and 'aOpacity' attributes
    const colorAttr = {
      array: colorArr,
      needsUpdate: false,
      set(a)          { colorArr.set(a); },
      setXYZ(i,r,g,b) { colorArr[i*3]=r; colorArr[i*3+1]=g; colorArr[i*3+2]=b; },
    };
    const opacityAttr = {
      array: opacityArr,
      needsUpdate: false,
      set(a) { opacityArr.set(a); },
    };
    const geometry = {
      getAttribute(name) {
        if (name === 'color')    return colorAttr;
        if (name === 'aOpacity') return opacityAttr;
      },
    };

    const baseColors  = new Float32Array([0.5,0.5,0.5, 0.5,0.5,0.5, 0.5,0.5,0.5]);
    // idx0 faint (land-like), idx1 strong (coast-like) — hierarchy must survive boost.
    const baseOpacity = new Float32Array([0.2, 0.6, 0.3]);
    const map = new Map([['AA',[0,1]],['BB',[2]]]);

    applyHighlights(geometry, map, baseColors, baseOpacity, new Set(['AA']), '#ff5a1f', 2.0);

    // AA points -> orange-ish (r > g) AND each dot's own base opacity * boost (clamped)
    expect(colorArr[0]).toBeGreaterThan(colorArr[1]);       // idx0 red dominates
    expect(opacityArr[0]).toBeCloseTo(0.4, 5);              // 0.2 * 2.0 (faint stays fainter)
    expect(opacityArr[1]).toBeCloseTo(1.0, 5);              // 0.6 * 2.0 clamped to 1
    expect(opacityArr[0]).toBeLessThan(opacityArr[1]);      // hierarchy preserved

    // BB -> restored to base color and base opacity
    expect(colorArr[6]).toBeCloseTo(0.5, 5);          // idx2 color restored
    expect(opacityArr[2]).toBeCloseTo(0.3, 5);        // idx2 opacity restored
  });
});
