import { STATE_LEVEL } from '../../src/config.js';

export function buildIsoReference(regions) {
  const countries = regions.filter((r) => r.id.length === 2).sort((a, b) => a.id.localeCompare(b.id));
  const subs = regions.filter((r) => r.id.length > 2).sort((a, b) => a.id.localeCompare(b.id));

  let md = '# ISO 3166 Reference\n\n';
  md += 'Use these ids as keys in `data/highlights.json`.\n\n';
  md += '## Countries (ISO 3166-1 alpha-2)\n\n| id | name |\n|----|------|\n';
  for (const r of countries) md += `| ${r.id} | ${r.name} |\n`;
  md += `\n## Sub-regions (ISO 3166-2)\n\n`;
  md += `State-level countries (${STATE_LEVEL.join(', ')}) are split into all their sub-regions; `;
  md += `a few detached territories of other countries (Azores, Madeira, Canaries, French overseas, `;
  md += `Dutch Caribbean) are also separated.\n\n| id | name |\n|----|------|\n`;
  for (const r of subs) md += `| ${r.id} | ${r.name} |\n`;
  return md;
}
