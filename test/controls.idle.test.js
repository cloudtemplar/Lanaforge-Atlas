import { describe, it, expect } from 'vitest';
import { makeIdleAutoRotate } from '../src/controls.js';

describe('makeIdleAutoRotate', () => {
  it('suspends auto-rotation right after interaction and resumes after idleMs', () => {
    const idle = makeIdleAutoRotate({ idleMs: 1000 });
    idle.onInteract(5000);
    expect(idle.shouldAutoRotate(5500)).toBe(false); // 500ms later, still interacting
    expect(idle.shouldAutoRotate(6001)).toBe(true);  // >1000ms later, resume
  });
  it('auto-rotates by default before any interaction', () => {
    const idle = makeIdleAutoRotate({ idleMs: 1000 });
    expect(idle.shouldAutoRotate(0)).toBe(true);
  });
});
