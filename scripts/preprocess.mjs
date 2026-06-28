import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegions } from './lib/regions.mjs';
import { generatePoints, ensureRegionDots } from './lib/points.mjs';
import { buildIsoReference } from './lib/reference.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = (n) => join(here, 'geo-src', n);
const readJSON = async (p) => JSON.parse(await readFile(p, 'utf8'));

console.log('Loading sources...');
const [countries, states, countryLines, stateLines, coastline] = await Promise.all([
  readJSON(src('countries.geojson')),
  readJSON(src('states.geojson')),
  readJSON(src('country-lines.geojson')),
  readJSON(src('state-lines.geojson')),
  readJSON(src('coastline.geojson')),
]);

console.log('Building regions...');
const { regions, features } = buildRegions(countries, states);

console.log(`Generating points for ${features.length} regions (this can take a minute)...`);
const points = ensureRegionDots(
  generatePoints(features, coastline, countryLines, stateLines),
  regions,
);

const outDir = join(root, 'public', 'data');
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'regions.json'), JSON.stringify(regions));
await writeFile(join(outDir, 'points.json'), JSON.stringify({ points }));
await writeFile(join(root, 'iso-reference.md'), buildIsoReference(regions));

const counts = {};
for (const p of points) counts[p.category] = (counts[p.category] || 0) + 1;
console.log(`Done. regions=${regions.length} total=${points.length}`, counts);
