import { describe, it, expect } from 'vitest';
import { zoomTier, truncateList, cullCollisions, labelScale } from '../src/labels.js';

describe('zoomTier', () => {
  it('classifies by camera distance', () => {
    expect(zoomTier(2.3)).toBe('far');
    expect(zoomTier(1.7)).toBe('medium');
    expect(zoomTier(1.2)).toBe('near');
  });
});

describe('truncateList', () => {
  it('returns all when under limit', () => {
    expect(truncateList(['Ana','Bia'])).toEqual({ shown: ['Ana','Bia'], total: 2, hiddenCount: 0 });
  });
  it('shows top-5 alphabetical + hidden count when over limit', () => {
    const r = truncateList(['Zoe','Ana','Cara','Bia','Eve','Dan','Fay']);
    expect(r.shown).toEqual(['Ana','Bia','Cara','Dan','Eve']);
    expect(r.total).toBe(7);
    expect(r.hiddenCount).toBe(2);
  });
});

describe('labelScale', () => {
  it('returns 1 when depth equals the reference distance', () => {
    expect(labelScale(1.4, 1.4)).toBe(1);
  });
  it('shrinks as the region gets farther (larger depth)', () => {
    expect(labelScale(2.8, 1.4)).toBe(0.5);
  });
  it('grows as the region gets closer (smaller depth)', () => {
    expect(labelScale(0.7, 1.4)).toBe(2);
  });
});

describe('cullCollisions', () => {
  it('drops lower-priority boxes that overlap a kept one', () => {
    const kept = cullCollisions([
      { index: 0, x: 0, y: 0, w: 50, h: 20, priority: 10 },   // big/isolated, high priority
      { index: 1, x: 10, y: 5, w: 50, h: 20, priority: 1 },   // overlaps 0 -> dropped
      { index: 2, x: 200, y: 200, w: 50, h: 20, priority: 1 },// far away -> kept
    ]);
    expect(kept.has(0)).toBe(true);
    expect(kept.has(1)).toBe(false);
    expect(kept.has(2)).toBe(true);
  });
});
