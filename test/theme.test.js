// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveTheme, THEMES, createThemeController } from '../src/theme.js';

describe('resolveTheme', () => {
  it('prefers stored value over system', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
  it('falls back to system when nothing stored', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });
});

describe('createThemeController', () => {
  beforeEach(() => localStorage.clear());
  it('toggles and persists', () => {
    let received = null;
    const c = createThemeController({ onChange: (cols) => (received = cols) });
    const first = c.current();
    c.toggle();
    expect(c.current()).not.toBe(first);
    expect(localStorage.getItem('theme')).toBe(c.current());
    expect(received).toEqual(THEMES[c.current()]);
  });
  it('exposes the dot colour as a --dot CSS var (for the marker icon)', () => {
    const c = createThemeController({ onChange: () => {} });
    expect(document.documentElement.style.getPropertyValue('--dot')).toBe(THEMES[c.current()].dot);
  });
});
