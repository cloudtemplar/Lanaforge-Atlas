import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from '../src/config.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'geo-src');

const TARGETS = {
  'countries.geojson': SOURCES.countries,
  'states.geojson': SOURCES.states,
  'country-lines.geojson': SOURCES.countryLines,
  'state-lines.geojson': SOURCES.stateLines,
  'coastline.geojson': SOURCES.coastline,
};

await mkdir(outDir, { recursive: true });
for (const [name, url] of Object.entries(TARGETS)) {
  process.stdout.write(`Fetching ${name}... `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const text = await res.text();
  JSON.parse(text); // validate it parses
  await writeFile(join(outDir, name), text);
  console.log('ok');
}
console.log('Done.');
