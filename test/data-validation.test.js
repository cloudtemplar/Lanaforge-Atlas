import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const has = existsSync('public/data/regions.json');
describe.skipIf(!has)('highlights reference real regions', () => {
  it('every highlight id exists in regions.json', () => {
    const regions = JSON.parse(readFileSync('public/data/regions.json', 'utf8'));
    const ids = new Set(regions.map((r) => r.id));
    const highlights = JSON.parse(readFileSync('data/highlights.json', 'utf8'));
    const unknown = Object.keys(highlights).filter((id) => !ids.has(id));
    expect(unknown).toEqual([]);
  });
});
