// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createCursorLabel } from '../src/labels.js';

describe('createCursorLabel', () => {
  it('shows the region name and positions near the cursor, hides on demand', () => {
    const overlay = document.createElement('div');
    document.body.appendChild(overlay);
    const label = createCursorLabel({ overlayEl: overlay });
    label.show('SÃO PAULO', 100, 200);
    const el = overlay.querySelector('.region-pill');
    expect(el).toBeTruthy();
    expect(el.textContent).toBe('SÃO PAULO');
    expect(el.classList.contains('visible')).toBe(true);
    label.hide();
    expect(el.classList.contains('visible')).toBe(false);
  });
});
