import { describe, it, expect } from 'vitest';
import { zoomTier, truncateList, labelScale, buildListHTML, shouldShowHoverLabel } from '../src/labels.js';

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

describe('shouldShowHoverLabel', () => {
  it('shows the cursor pill only at the far tier (labels hidden there)', () => {
    expect(shouldShowHoverLabel('far', 'DE')).toBe(true);
  });
  it('hides it at medium/near (the markers already name the country)', () => {
    expect(shouldShowHoverLabel('medium', 'DE')).toBe(false);
    expect(shouldShowHoverLabel('near', 'DE')).toBe(false);
  });
  it('hides it when nothing is hovered', () => {
    expect(shouldShowHoverLabel('far', null)).toBe(false);
  });
});

describe('buildListHTML', () => {
  const html = buildListHTML({ id: 'DE', name: 'Germany' }, ['Zoe','Ana','Cara','Bia','Eve','Dan','Fay']);
  it('shows the region name (always-visible header)', () => {
    expect(html).toContain('class="region-name"');
    expect(html).toContain('>Germany<');
  });
  it('shows a person icon and the total people count in the marker row', () => {
    expect(html).toContain('class="count-row"');
    expect(html).toContain('person-icon');
    expect(html).toContain('>7<'); // total people in this region
  });
  it('puts the names + "+N more" in a .names wrapper (top-5 shown)', () => {
    expect(html).toContain('class="names"');
    expect((html.match(/<li>/g) || []).length).toBe(5);
    expect(html).toContain('+2 more (7)');
  });
  it('omits the "+N more" button when nothing is hidden', () => {
    const small = buildListHTML({ id: 'X', name: 'X' }, ['Ana', 'Bia']);
    expect(small).not.toContain('more');
    expect((small.match(/<li>/g) || []).length).toBe(2);
  });
});
