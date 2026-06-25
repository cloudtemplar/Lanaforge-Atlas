# Globo VRChat (dot-matrix 3D) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight, minimalist single-page 3D dot-matrix globe that highlights the world regions where the author met at least one VRChat person, with per-region people lists that appear intelligently on zoom.

**Architecture:** A build-time Node pipeline turns Natural Earth GeoJSON into static JSON (dot-matrix points tagged by region + tier, intra-continental border line segments, and per-region metadata). The browser loads those JSONs and renders a transparent dot-matrix globe with three.js; an HTML/CSS overlay draws labels (region pill following the cursor + centroid-anchored people lists) with zoom-tier visibility and screen-space collision culling.

**Tech Stack:** Vite 5, vanilla JavaScript (ES modules), three.js (`three` ^0.160), d3-geo (`d3-geo` ^3) for point-in-polygon/centroids, Vitest for unit tests. Node.js ≥ 18.

## Global Constraints

- **Node.js ≥ 18** required (uses global `fetch` in the fetch script). `node`/`npm` are NOT currently on PATH — install Node LTS before starting.
- **No backend, no database.** Fully static site; the only author-edited data file is `data/highlights.json`.
- **All point-in-polygon work happens at build time.** The browser never runs geometry tests — it only renders pre-computed JSON.
- **14 sub-region countries** (ISO 3166-1 alpha-2): `BR, AR, US, CA, AU, GB, DE, IT, FR, ES, NO, SE, FI, JP`. These are represented ONLY by their admin-1 regions (ISO 3166-2 ids like `BR-SP`); their whole-country admin-0 polygon is excluded. Every other country is represented by its admin-0 polygon (ISO 3166-1 alpha-2 id).
- **Region ids are ISO codes:** country = ISO 3166-1 alpha-2 (`JP`); sub-region = ISO 3166-2 (`BR-SP`, `US-CA`).
- **Highlight color is constant across themes:** orange `#ff5a1f`. A highlighted region recolors ALL its points (contour + fill) to orange.
- **Globe radius `R = 1`.** Zoom limits: `minDistance = 1.15`, `maxDistance = 2.6`. Zoom tiers by camera distance: Far `> 2.0`, Medium `1.4–2.0`, Near `< 1.4`.
- **Two point tiers:** `contour` (dense, bright/opaque, traces outlines) and `fill` (sparse, dim, fills interiors).
- **Font:** Rajdhani everywhere (region label heavier/uppercase; people lists lighter/smaller).
- **Spec:** `docs/superpowers/specs/2026-06-25-vrchat-globe-design.md`.

---

## File Structure

```
globe/
  package.json
  vite.config.js
  vitest.config.js
  index.html
  src/
    config.js          # constants: radius, zoom limits/tiers, colors, FOURTEEN list, source URLs
    geo.js             # lat/lon <-> THREE.Vector3, screen projection, distance helpers
    main.js            # scene/camera/renderer wiring + render loop
    globe.js           # build Points (per-point color attr) + LineSegments geometry
    controls.js        # OrbitControls config, zoom limits, autorotate pause/resume
    highlight.js       # build highlight set + recolor points by regionId
    labels.js          # HTML overlay: region cursor pill + people lists, zoom tiers, collisions
    theme.js           # light/dark resolution, toggle, localStorage, applies colors
    style.css
  data/
    highlights.json    # AUTHOR-EDITED: { regionId: [names...] }
  scripts/
    geo-src/           # downloaded Natural Earth GeoJSON (gitignored)
    fetch-geo.mjs      # downloads the 4 Natural Earth files
    preprocess.mjs     # orchestrates region/points/borders/reference generation
    lib/
      regions.mjs      # buildRegions(): unified region set + centroids
      points.mjs       # generateFillPoints(), generateContourPoints(), assignRegion()
      borders.mjs      # buildBorders(): line segments
      reference.mjs    # buildIsoReference(): markdown table
  public/
    data/              # GENERATED (gitignored): points.json, borders.json, regions.json
  iso-reference.md     # GENERATED: ISO code lookup table
  test/
    geo.test.js
    regions.test.js
    points.test.js
    borders.test.js
    highlight.test.js
    labels.test.js
    theme.test.js
```

**Pipeline source URLs** (Natural Earth 50m via nvkelso/natural-earth-vector raw GeoJSON), defined once in `src/config.js`:
- `ne_50m_admin_0_countries.geojson` — country polygons (props: `ISO_A2_EH`/`ISO_A2`, `NAME`/`ADMIN`)
- `ne_50m_admin_1_states_provinces.geojson` — state/province polygons (props: `iso_3166_2`, `name`, `iso_a2`)
- `ne_50m_admin_0_boundary_lines_land.geojson` — on-land country borders (excludes coastline)
- `ne_50m_admin_1_states_provinces_lines.geojson` — state/province border lines

---

## Task 1: Project scaffold + geo math module

**Files:**
- Create: `package.json`, `vite.config.js`, `vitest.config.js`, `index.html`, `.gitignore`
- Create: `src/config.js`, `src/geo.js`, `src/style.css`
- Test: `test/geo.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `src/config.js` exports: `GLOBE_RADIUS=1`, `ZOOM_MIN=1.15`, `ZOOM_MAX=2.6`, `TIER_FAR=2.0`, `TIER_NEAR=1.4`, `HIGHLIGHT_COLOR='#ff5a1f'`, `FOURTEEN=['BR','AR','US','CA','AU','GB','DE','IT','FR','ES','NO','SE','FI','JP']`, `SOURCES={countries,states,countryLines,stateLines}` (object of URL strings).
  - `src/geo.js` exports:
    - `latLonToVector3(lat, lon, radius) -> THREE.Vector3`
    - `vector3ToScreen(vec, camera, width, height) -> {x, y, visible}` (`visible=false` when behind camera / `z>1`)
    - `angularDistanceDeg(aLat, aLon, bLat, bLon) -> number` (great-circle degrees)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "vrchat-globe",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "npm run data && vite build",
    "preview": "vite preview",
    "fetch-geo": "node scripts/fetch-geo.mjs",
    "data": "node scripts/preprocess.mjs",
    "test": "vitest run"
  },
  "dependencies": {
    "three": "^0.160.0"
  },
  "devDependencies": {
    "d3-geo": "^3.1.0",
    "vite": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

- [ ] **Step 2: Create `vite.config.js`, `vitest.config.js`, `.gitignore`**

`vite.config.js`:
```js
import { defineConfig } from 'vite';
export default defineConfig({ base: './' });
```

`vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['test/**/*.test.js'] } });
```

`.gitignore`:
```
node_modules/
dist/
scripts/geo-src/
public/data/
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, three + d3-geo + vite + vitest present.

- [ ] **Step 4: Create `src/config.js`**

```js
export const GLOBE_RADIUS = 1;
export const ZOOM_MIN = 1.15;
export const ZOOM_MAX = 2.6;
export const TIER_FAR = 2.0;   // camera distance > TIER_FAR => "far"
export const TIER_NEAR = 1.4;  // camera distance < TIER_NEAR => "near"
export const HIGHLIGHT_COLOR = '#ff5a1f';

// Countries represented ONLY by admin-1 sub-regions (their admin-0 polygon is excluded).
export const FOURTEEN = ['BR', 'AR', 'US', 'CA', 'AU', 'GB', 'DE', 'IT', 'FR', 'ES', 'NO', 'SE', 'FI', 'JP'];

const RAW = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
export const SOURCES = {
  countries:   `${RAW}/ne_50m_admin_0_countries.geojson`,
  states:      `${RAW}/ne_50m_admin_1_states_provinces.geojson`,
  countryLines:`${RAW}/ne_50m_admin_0_boundary_lines_land.geojson`,
  stateLines:  `${RAW}/ne_50m_admin_1_states_provinces_lines.geojson`,
};
```

- [ ] **Step 5: Write the failing test `test/geo.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { latLonToVector3, angularDistanceDeg } from '../src/geo.js';

describe('latLonToVector3', () => {
  it('maps (0,0) to +X axis on the sphere of given radius', () => {
    const v = latLonToVector3(0, 0, 1);
    expect(v.x).toBeCloseTo(1, 5);
    expect(v.y).toBeCloseTo(0, 5);
    expect(v.z).toBeCloseTo(0, 5);
  });
  it('maps the north pole (90,0) to +Y', () => {
    const v = latLonToVector3(90, 0, 1);
    expect(v.y).toBeCloseTo(1, 5);
  });
  it('keeps points on the sphere radius', () => {
    const v = latLonToVector3(33, -70, 2);
    expect(v.length()).toBeCloseTo(2, 5);
  });
});

describe('angularDistanceDeg', () => {
  it('is 0 for identical points', () => {
    expect(angularDistanceDeg(10, 20, 10, 20)).toBeCloseTo(0, 5);
  });
  it('is 90 between equator point and north pole', () => {
    expect(angularDistanceDeg(0, 0, 90, 0)).toBeCloseTo(90, 4);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- geo`
Expected: FAIL — `src/geo.js` has no such exports.

- [ ] **Step 7: Implement `src/geo.js`**

```js
import * as THREE from 'three';

// Standard sphere mapping: lon=0,lat=0 -> +X; lat=+90 -> +Y.
export function latLonToVector3(lat, lon, radius) {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  return new THREE.Vector3(
    radius * cosPhi * Math.cos(lambda),
    radius * Math.sin(phi),
    -radius * cosPhi * Math.sin(lambda),
  );
}

// Project a world-space point to screen pixels. visible=false if behind camera.
export function vector3ToScreen(vec, camera, width, height) {
  const p = vec.clone().project(camera);
  return {
    x: (p.x * 0.5 + 0.5) * width,
    y: (-p.y * 0.5 + 0.5) * height,
    visible: p.z < 1,
  };
}

export function angularDistanceDeg(aLat, aLon, bLat, bLon) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return (2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 180) / Math.PI;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- geo`
Expected: PASS (5 assertions).

- [ ] **Step 9: Create `index.html` + minimal `src/style.css` + placeholder `src/main.js`**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>VRChat Globe</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link
      href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <canvas id="scene"></canvas>
    <div id="overlay"></div>
    <button id="theme-toggle" aria-label="Toggle theme">◐</button>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

`src/style.css`:
```css
:root {
  --bg: #0d0d0f;
  --text: #f2f2f2;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; background: var(--bg); }
#scene { display: block; width: 100vw; height: 100vh; }
#overlay { position: fixed; inset: 0; pointer-events: none; font-family: 'Rajdhani', sans-serif; }
#theme-toggle {
  position: fixed; top: 16px; right: 16px; z-index: 10;
  background: transparent; border: 1px solid var(--text); color: var(--text);
  width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 18px;
}
```

`src/main.js` (placeholder, replaced in Task 6):
```js
console.log('VRChat Globe — scaffold');
```

- [ ] **Step 10: Verify dev server runs**

Run: `npm run dev` (then Ctrl-C)
Expected: Vite serves on localhost with no errors; page is blank with a theme button.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: scaffold project + geo math module"
```

---

## Task 2: Fetch Natural Earth source data

**Files:**
- Create: `scripts/fetch-geo.mjs`

**Interfaces:**
- Consumes: `SOURCES` from `src/config.js`.
- Produces: 4 files in `scripts/geo-src/`: `countries.geojson`, `states.geojson`, `country-lines.geojson`, `state-lines.geojson`.

- [ ] **Step 1: Implement `scripts/fetch-geo.mjs`**

```js
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
```

- [ ] **Step 2: Run the fetch**

Run: `npm run fetch-geo`
Expected: prints "Fetching ... ok" for all 4 files; `scripts/geo-src/` contains 4 valid GeoJSON files.

- [ ] **Step 3: Verify the files are usable FeatureCollections**

Run:
```bash
node -e "const fs=require('fs');for(const f of ['countries','states','country-lines','state-lines']){const j=JSON.parse(fs.readFileSync('scripts/geo-src/'+f+'.geojson'));console.log(f, j.type, j.features.length)}"
```
Expected: each prints `FeatureCollection` and a positive feature count (countries ~240, states ~4500).

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-geo.mjs
git commit -m "feat: add Natural Earth fetch script"
```

---

## Task 3: Preprocessing — region set + ISO reference

**Files:**
- Create: `scripts/lib/regions.mjs`, `scripts/lib/reference.mjs`
- Test: `test/regions.test.js`

**Interfaces:**
- Consumes: `FOURTEEN` from `src/config.js`; GeoJSON FeatureCollections.
- Produces:
  - `regions.mjs` exports `buildRegions(countriesFC, statesFC) -> { regions, features }` where
    - `regions`: array of `{ id, name, centroid: { lat, lon } }`
    - `features`: array of `{ id, geometry }` (GeoJSON Polygon/MultiPolygon) for point assignment — same order/ids as `regions`.
  - `reference.mjs` exports `buildIsoReference(regions) -> string` (markdown).

- [ ] **Step 1: Write the failing test `test/regions.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { buildRegions } from '../scripts/lib/regions.mjs';

// Minimal fake FeatureCollections covering the cases we care about.
const square = (cx, cy) => ({
  type: 'Polygon',
  coordinates: [[[cx-1,cy-1],[cx+1,cy-1],[cx+1,cy+1],[cx-1,cy+1],[cx-1,cy-1]]],
});
const countries = { type: 'FeatureCollection', features: [
  { properties: { ISO_A2_EH: 'FR', NAME: 'France' }, geometry: square(2, 47) },   // one of the 14 -> excluded
  { properties: { ISO_A2_EH: 'PT', NAME: 'Portugal' }, geometry: square(-8, 39) },// not 14 -> included as country
]};
const states = { type: 'FeatureCollection', features: [
  { properties: { iso_3166_2: 'FR-IDF', name: 'Île-de-France', iso_a2: 'FR' }, geometry: square(2, 48) },
  { properties: { iso_3166_2: 'PT-11', name: 'Lisboa', iso_a2: 'PT' }, geometry: square(-9, 38) }, // not 14 -> excluded
]};

describe('buildRegions', () => {
  const { regions } = buildRegions(countries, states);
  const ids = regions.map(r => r.id);
  it('includes non-14 countries as admin-0 ids', () => {
    expect(ids).toContain('PT');
  });
  it('excludes the whole-country polygon for the 14', () => {
    expect(ids).not.toContain('FR');
  });
  it('includes admin-1 ids for the 14 countries', () => {
    expect(ids).toContain('FR-IDF');
  });
  it('excludes admin-1 ids for non-14 countries', () => {
    expect(ids).not.toContain('PT-11');
  });
  it('computes a centroid for every region', () => {
    for (const r of regions) {
      expect(typeof r.centroid.lat).toBe('number');
      expect(typeof r.centroid.lon).toBe('number');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- regions`
Expected: FAIL — `buildRegions` not defined.

- [ ] **Step 3: Implement `scripts/lib/regions.mjs`**

```js
import { geoCentroid } from 'd3-geo';
import { FOURTEEN } from '../../src/config.js';

const iso2 = (p) => p.ISO_A2_EH || p.ISO_A2 || p.iso_a2_eh || p.iso_a2 || '';
const countryName = (p) => p.NAME || p.ADMIN || p.name || '';

export function buildRegions(countriesFC, statesFC) {
  const regions = [];
  const features = [];

  // Non-14 countries -> admin-0 region.
  for (const f of countriesFC.features) {
    const code = iso2(f.properties).toUpperCase();
    if (!code || code === '-99' || FOURTEEN.includes(code)) continue;
    const [lon, lat] = geoCentroid(f);
    regions.push({ id: code, name: countryName(f.properties), centroid: { lat, lon } });
    features.push({ id: code, geometry: f.geometry });
  }

  // 14 countries -> admin-1 regions only.
  for (const f of statesFC.features) {
    const parent = (f.properties.iso_a2 || f.properties.iso_3166_2 || '').slice(0, 2).toUpperCase();
    const code = (f.properties.iso_3166_2 || '').toUpperCase();
    if (!FOURTEEN.includes(parent) || !code || code === parent) continue;
    const [lon, lat] = geoCentroid(f);
    regions.push({ id: code, name: f.properties.name || code, centroid: { lat, lon } });
    features.push({ id: code, geometry: f.geometry });
  }

  return { regions, features };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- regions`
Expected: PASS (5 assertions).

- [ ] **Step 5: Implement `scripts/lib/reference.mjs`**

```js
import { FOURTEEN } from '../../src/config.js';

export function buildIsoReference(regions) {
  const countries = regions.filter((r) => r.id.length === 2).sort((a, b) => a.id.localeCompare(b.id));
  const subs = regions.filter((r) => r.id.length > 2).sort((a, b) => a.id.localeCompare(b.id));

  let md = '# ISO 3166 Reference\n\n';
  md += 'Use these ids as keys in `data/highlights.json`.\n\n';
  md += '## Countries (ISO 3166-1 alpha-2)\n\n| id | name |\n|----|------|\n';
  for (const r of countries) md += `| ${r.id} | ${r.name} |\n`;
  md += `\n## Sub-regions of the 14 countries (ISO 3166-2)\n\n`;
  md += `Parent countries: ${FOURTEEN.join(', ')}\n\n| id | name |\n|----|------|\n`;
  for (const r of subs) md += `| ${r.id} | ${r.name} |\n`;
  return md;
}
```

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/regions.mjs scripts/lib/reference.mjs test/regions.test.js
git commit -m "feat: build unified region set + ISO reference"
```

---

## Task 4: Preprocessing — dot-matrix point generation (fill + contour)

**Files:**
- Create: `scripts/lib/points.mjs`
- Test: `test/points.test.js`

**Interfaces:**
- Consumes: `features` from `buildRegions` (`[{ id, geometry }]`); `geo.angularDistanceDeg` is NOT used here (Node-side uses d3-geo).
- Produces: `points.mjs` exports:
  - `buildRegionIndex(features) -> index` (opaque; bbox-accelerated container lookup)
  - `assignRegion(index, lon, lat) -> regionId | null`
  - `generateFillPoints(index, stepDeg) -> [{ lat, lon, regionId, tier:'fill' }]`
  - `generateContourPoints(features, stepDeg) -> [{ lat, lon, regionId, tier:'contour' }]`
  - `generatePoints(features) -> [{ lat, lon, regionId, tier }]` (fill stepDeg≈1.4, contour stepDeg≈0.45)

- [ ] **Step 1: Write the failing test `test/points.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { buildRegionIndex, assignRegion, generateFillPoints, generateContourPoints } from '../scripts/lib/points.mjs';

const square = (cx, cy, r=10) => ({
  type: 'Polygon',
  coordinates: [[[cx-r,cy-r],[cx+r,cy-r],[cx+r,cy+r],[cx-r,cy+r],[cx-r,cy-r]]],
});
const features = [
  { id: 'AA', geometry: square(0, 0, 10) },     // covers lon/lat in [-10,10]
  { id: 'BB', geometry: square(40, 40, 5) },    // covers lon/lat in [35,45]
];
const index = buildRegionIndex(features);

describe('assignRegion', () => {
  it('returns the region containing a point', () => {
    expect(assignRegion(index, 0, 0)).toBe('AA');
    expect(assignRegion(index, 41, 41)).toBe('BB');
  });
  it('returns null for points in no region (ocean)', () => {
    expect(assignRegion(index, 100, 0)).toBeNull();
  });
});

describe('generateFillPoints', () => {
  const pts = generateFillPoints(index, 2);
  it('only emits points inside regions, tagged fill', () => {
    expect(pts.length).toBeGreaterThan(0);
    for (const p of pts) {
      expect(['AA', 'BB']).toContain(p.regionId);
      expect(p.tier).toBe('fill');
    }
  });
});

describe('generateContourPoints', () => {
  const pts = generateContourPoints(features, 1);
  it('emits contour points tagged with their region and tier', () => {
    expect(pts.length).toBeGreaterThan(0);
    expect(pts.every(p => p.tier === 'contour')).toBe(true);
    expect(pts.some(p => p.regionId === 'AA')).toBe(true);
  });
  it('is denser than fill for the same area', () => {
    const fill = generateFillPoints(index, 1);
    const contour = generateContourPoints(features, 1);
    // contour traces perimeters at fine spacing; expect a healthy count
    expect(contour.length).toBeGreaterThan(10);
    expect(fill.length).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- points`
Expected: FAIL — exports not defined.

- [ ] **Step 3: Implement `scripts/lib/points.mjs`**

```js
import { geoContains } from 'd3-geo';

function bbox(geometry) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const scan = (coords) => {
    for (const c of coords) {
      if (Array.isArray(c[0])) scan(c);
      else {
        const [x, y] = c;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  };
  scan(geometry.coordinates);
  return { minX, minY, maxX, maxY };
}

export function buildRegionIndex(features) {
  return features.map((f) => ({ id: f.id, feature: { type: 'Feature', geometry: f.geometry }, bbox: bbox(f.geometry) }));
}

export function assignRegion(index, lon, lat) {
  for (const entry of index) {
    const b = entry.bbox;
    if (lon < b.minX || lon > b.maxX || lat < b.minY || lat > b.maxY) continue;
    if (geoContains(entry.feature, [lon, lat])) return entry.id;
  }
  return null;
}

// Sparse interior fill via a lon/lat grid jittered by cosine(lat) to keep density even.
export function generateFillPoints(index, stepDeg) {
  const out = [];
  for (let lat = -89; lat <= 89; lat += stepDeg) {
    const lonStep = stepDeg / Math.max(Math.cos((lat * Math.PI) / 180), 0.15);
    for (let lon = -180; lon < 180; lon += lonStep) {
      const id = assignRegion(index, lon, lat);
      if (id) out.push({ lat, lon, regionId: id, tier: 'fill' });
    }
  }
  return out;
}

// Dense outline points sampled along every ring of every region polygon.
export function generateContourPoints(features, stepDeg) {
  const out = [];
  const emitRing = (ring, id) => {
    for (let i = 0; i < ring.length - 1; i++) {
      const [lon1, lat1] = ring[i];
      const [lon2, lat2] = ring[i + 1];
      const segLen = Math.hypot(lon2 - lon1, lat2 - lat1);
      const n = Math.max(1, Math.round(segLen / stepDeg));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        out.push({ lon: lon1 + (lon2 - lon1) * t, lat: lat1 + (lat2 - lat1) * t, regionId: id, tier: 'contour' });
      }
    }
  };
  const walk = (coords, id, depth) => {
    if (depth === 0) emitRing(coords, id); // a ring: array of [lon,lat]
    else for (const c of coords) walk(c, id, depth - 1);
  };
  for (const f of features) {
    const g = f.geometry;
    if (g.type === 'Polygon') walk(g.coordinates, f.id, 1);
    else if (g.type === 'MultiPolygon') walk(g.coordinates, f.id, 2);
  }
  return out;
}

export function generatePoints(features) {
  const index = buildRegionIndex(features);
  return [
    ...generateContourPoints(features, 0.45),
    ...generateFillPoints(index, 1.4),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- points`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/points.mjs test/points.test.js
git commit -m "feat: generate dot-matrix fill + contour points by region"
```

---

## Task 5: Preprocessing — border line segments

**Files:**
- Create: `scripts/lib/borders.mjs`
- Test: `test/borders.test.js`

**Interfaces:**
- Consumes: `country-lines.geojson` + `state-lines.geojson` FeatureCollections; `FOURTEEN`.
- Produces: `borders.mjs` exports `buildBorders(countryLinesFC, stateLinesFC) -> [[lat,lon],[lat,lon], ...]` — a flat array of segment endpoints (pairs of consecutive entries form one segment), ready for `THREE.LineSegments`.

- [ ] **Step 1: Write the failing test `test/borders.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { buildBorders } from '../scripts/lib/borders.mjs';

const line = (coords) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
const countryLines = { type: 'FeatureCollection', features: [ line([[0,0],[1,1],[2,2]]) ] };
const stateLines = { type: 'FeatureCollection', features: [
  { type:'Feature', properties:{ iso_a2:'US' }, geometry:{ type:'LineString', coordinates:[[10,10],[11,11]] } },
  { type:'Feature', properties:{ iso_a2:'PT' }, geometry:{ type:'LineString', coordinates:[[20,20],[21,21]] } }, // non-14 -> dropped
]};

describe('buildBorders', () => {
  const segs = buildBorders(countryLines, stateLines);
  it('emits paired endpoints as [lat,lon]', () => {
    // first country line: (0,0)-(1,1) and (1,1)-(2,2) => 4 endpoints
    expect(segs[0]).toEqual([0, 0]); // [lat, lon] of [lon=0,lat=0]
    expect(segs.length % 2).toBe(0);
  });
  it('keeps only state lines belonging to the 14 countries', () => {
    const flat = JSON.stringify(segs);
    expect(flat).toContain('[10,10]'); // US kept
    expect(flat).not.toContain('[20,20]'); // PT dropped
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- borders`
Expected: FAIL — `buildBorders` not defined.

- [ ] **Step 3: Implement `scripts/lib/borders.mjs`**

```js
import { FOURTEEN } from '../../src/config.js';

// Push consecutive endpoints of a LineString as discrete segments ([lat,lon] each).
function pushLine(coords, out) {
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[i + 1];
    out.push([lat1, lon1], [lat2, lon2]);
  }
}

function pushGeometry(geom, out) {
  if (!geom) return;
  if (geom.type === 'LineString') pushLine(geom.coordinates, out);
  else if (geom.type === 'MultiLineString') for (const l of geom.coordinates) pushLine(l, out);
}

export function buildBorders(countryLinesFC, stateLinesFC) {
  const out = [];
  for (const f of countryLinesFC.features) pushGeometry(f.geometry, out);
  for (const f of stateLinesFC.features) {
    const parent = (f.properties.iso_a2 || f.properties.adm0_a3 || '').slice(0, 2).toUpperCase();
    if (!FOURTEEN.includes(parent)) continue;
    pushGeometry(f.geometry, out);
  }
  return out;
}
```

Note: the `state-lines.geojson` from Natural Earth tags features with an `iso_a2`-like parent property. During Step 5 wiring, log a sample feature's properties and confirm the parent key; if it is not `iso_a2`, adjust the `parent` extraction accordingly (e.g., `adm0_name` mapped through a name→ISO table). Keep the test green.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- borders`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/borders.mjs test/borders.test.js
git commit -m "feat: build intra-continental border segments"
```

---

## Task 6: Preprocessing orchestrator

**Files:**
- Create: `scripts/preprocess.mjs`

**Interfaces:**
- Consumes: all `scripts/lib/*` modules + `scripts/geo-src/*.geojson`.
- Produces (written files):
  - `public/data/regions.json` = `[{ id, name, centroid: { lat, lon } }]`
  - `public/data/points.json` = `{ points: [{ lat, lon, regionId, tier }] }`
  - `public/data/borders.json` = `{ segments: [[lat,lon], ...] }`
  - `iso-reference.md`

- [ ] **Step 1: Implement `scripts/preprocess.mjs`**

```js
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegions } from './lib/regions.mjs';
import { generatePoints } from './lib/points.mjs';
import { buildBorders } from './lib/borders.mjs';
import { buildIsoReference } from './lib/reference.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = (n) => join(here, 'geo-src', n);
const readJSON = async (p) => JSON.parse(await readFile(p, 'utf8'));

console.log('Loading sources...');
const [countries, states, countryLines, stateLines] = await Promise.all([
  readJSON(src('countries.geojson')),
  readJSON(src('states.geojson')),
  readJSON(src('country-lines.geojson')),
  readJSON(src('state-lines.geojson')),
]);

console.log('Building regions...');
const { regions, features } = buildRegions(countries, states);

console.log(`Generating points for ${features.length} regions (this can take a minute)...`);
const points = generatePoints(features);

console.log('Building borders...');
const segments = buildBorders(countryLines, stateLines);

const outDir = join(root, 'public', 'data');
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'regions.json'), JSON.stringify(regions));
await writeFile(join(outDir, 'points.json'), JSON.stringify({ points }));
await writeFile(join(outDir, 'borders.json'), JSON.stringify({ segments }));
await writeFile(join(root, 'iso-reference.md'), buildIsoReference(regions));

console.log(`Done. regions=${regions.length} points=${points.length} segments=${segments.length / 2}`);
```

- [ ] **Step 2: Run the full pipeline**

Run: `npm run fetch-geo && npm run data`
Expected: prints region/point/segment counts (points likely 40k–120k); creates `public/data/*.json` and `iso-reference.md`.

- [ ] **Step 3: Sanity-check generated ids**

Run:
```bash
node -e "const r=require('./public/data/regions.json');const ids=r.map(x=>x.id);console.log('BR-SP', ids.includes('BR-SP'));console.log('US-CA', ids.includes('US-CA'));console.log('JP whole', ids.includes('JP'));console.log('PT', ids.includes('PT'))"
```
Expected: `BR-SP true`, `US-CA true`, `JP whole false`, `PT true`.

- [ ] **Step 4: Open `iso-reference.md` and confirm** it lists countries and the 14 countries' sub-region codes. If point count is very large (> 200k) making the browser sluggish, increase the fill `stepDeg` (Task 4 `generatePoints`) from `1.4` toward `1.8` and re-run.

- [ ] **Step 5: Commit**

```bash
git add scripts/preprocess.mjs
git commit -m "feat: preprocessing orchestrator generating all globe data"
```

---

## Task 7: Render the dot-matrix globe (points)

**Files:**
- Create: `src/globe.js`
- Rewrite: `src/main.js`
- Test: `test/globe.buildgeom.test.js` (pure geometry builder only)

**Interfaces:**
- Consumes: `latLonToVector3` from `geo.js`; `GLOBE_RADIUS` from `config.js`; `public/data/points.json`.
- Produces: `globe.js` exports:
  - `buildPointsGeometry(points, radius) -> { geometry: THREE.BufferGeometry, regionIndexMap: Map<regionId, number[]> }` where geometry has `position` (Float32 ×3) and `color` (Float32 ×3) attributes; `regionIndexMap` maps each regionId to the list of vertex indices belonging to it (used by Task 9).
  - `createPointsObject(points, radius, theme) -> { points: THREE.Points, geometry, regionIndexMap, baseColors: Float32Array }`
  - `baseColors` is a copy of the unhighlighted colors (per tier brightness) so highlight/unhighlight can restore.

- [ ] **Step 1: Write the failing test `test/globe.buildgeom.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { buildPointsGeometry } from '../src/globe.js';

const points = [
  { lat: 0, lon: 0, regionId: 'AA', tier: 'contour' },
  { lat: 10, lon: 10, regionId: 'AA', tier: 'fill' },
  { lat: -5, lon: 20, regionId: 'BB', tier: 'fill' },
];

describe('buildPointsGeometry', () => {
  const { geometry, regionIndexMap } = buildPointsGeometry(points, 1);
  it('creates position and color attributes of the right length', () => {
    expect(geometry.getAttribute('position').count).toBe(3);
    expect(geometry.getAttribute('color').count).toBe(3);
  });
  it('maps region ids to their vertex indices', () => {
    expect(regionIndexMap.get('AA')).toEqual([0, 1]);
    expect(regionIndexMap.get('BB')).toEqual([2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- buildgeom`
Expected: FAIL — `buildPointsGeometry` not defined.

- [ ] **Step 3: Implement `src/globe.js`**

```js
import * as THREE from 'three';
import { latLonToVector3 } from './geo.js';

// Per-tier base appearance (theme-aware base color is applied in createPointsObject).
const TIER_INTENSITY = { contour: 1.0, fill: 0.45 };

export function buildPointsGeometry(points, radius) {
  const n = points.length;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const regionIndexMap = new Map();

  for (let i = 0; i < n; i++) {
    const p = points[i];
    const v = latLonToVector3(p.lat, p.lon, radius);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
    if (!regionIndexMap.has(p.regionId)) regionIndexMap.set(p.regionId, []);
    regionIndexMap.get(p.regionId).push(i);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return { geometry, regionIndexMap };
}

export function createPointsObject(points, radius, theme) {
  const { geometry, regionIndexMap } = buildPointsGeometry(points, radius);
  const base = new THREE.Color(theme.dot);
  const colorAttr = geometry.getAttribute('color');
  for (let i = 0; i < points.length; i++) {
    const k = TIER_INTENSITY[points[i].tier] ?? 0.6;
    colorAttr.setXYZ(i, base.r * k, base.g * k, base.b * k);
  }
  const baseColors = Float32Array.from(colorAttr.array);

  const material = new THREE.PointsMaterial({
    size: 0.01,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,      // transparent globe: far-side points show through
    sizeAttenuation: true,
  });
  const pointsObj = new THREE.Points(geometry, material);
  return { points: pointsObj, geometry, regionIndexMap, baseColors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- buildgeom`
Expected: PASS.

- [ ] **Step 5: Rewrite `src/main.js` to render the globe**

```js
import * as THREE from 'three';
import { GLOBE_RADIUS } from './config.js';
import { createPointsObject } from './globe.js';

const THEME = { bg: '#0d0d0f', dot: '#f2f2f2', border: '#555', text: '#f2f2f2' };

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
camera.position.set(0, 0, 2.4);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const root = new THREE.Group();
scene.add(root);

const { points } = await loadGlobe();
async function loadGlobe() {
  const data = await fetch('data/points.json').then((r) => r.json());
  const obj = createPointsObject(data.points, GLOBE_RADIUS, THEME);
  root.add(obj.points);
  return obj;
}

function animate() {
  root.rotation.y += 0.0009; // slow auto-rotation
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
```

- [ ] **Step 6: Visual verification**

Run: `npm run dev`
Expected: a transparent dot-matrix globe slowly auto-rotates; far-side points are visible through the near side. Continents are recognizable; outlines (contour) read denser/brighter than interiors (fill).

- [ ] **Step 7: Commit**

```bash
git add src/globe.js src/main.js test/globe.buildgeom.test.js
git commit -m "feat: render transparent dot-matrix globe"
```

---

## Task 8: Render border lines

**Files:**
- Modify: `src/globe.js` (add `createBordersObject`)
- Modify: `src/main.js` (load borders.json, add to scene)
- Test: `test/globe.borders.test.js`

**Interfaces:**
- Consumes: `public/data/borders.json` (`{ segments: [[lat,lon], ...] }`); `latLonToVector3`.
- Produces: `globe.js` exports `createBordersObject(segments, radius, theme) -> THREE.LineSegments`.

- [ ] **Step 1: Write the failing test `test/globe.borders.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { createBordersObject } from '../src/globe.js';

describe('createBordersObject', () => {
  const segs = [[0,0],[1,1],[2,2],[3,3]]; // two segments
  const obj = createBordersObject(segs, 1, { border: '#888' });
  it('builds a position attribute with one vertex per endpoint', () => {
    expect(obj.geometry.getAttribute('position').count).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- globe.borders`
Expected: FAIL — `createBordersObject` not defined.

- [ ] **Step 3: Add `createBordersObject` to `src/globe.js`**

```js
export function createBordersObject(segments, radius, theme) {
  const positions = new Float32Array(segments.length * 3);
  for (let i = 0; i < segments.length; i++) {
    const [lat, lon] = segments[i];
    const v = latLonToVector3(lat, lon, radius * 1.001); // a hair above the dots
    positions[i * 3] = v.x; positions[i * 3 + 1] = v.y; positions[i * 3 + 2] = v.z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(theme.border), transparent: true, opacity: 0.35, depthWrite: false,
  });
  return new THREE.LineSegments(geometry, material);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- globe.borders`
Expected: PASS.

- [ ] **Step 5: Wire into `src/main.js`** — after the points load, add:

```js
import { createPointsObject, createBordersObject } from './globe.js';
// ... inside loadGlobe(), after adding points:
const borderData = await fetch('data/borders.json').then((r) => r.json());
root.add(createBordersObject(borderData.segments, GLOBE_RADIUS, THEME));
```

- [ ] **Step 6: Visual verification**

Run: `npm run dev`
Expected: thin border lines appear for intra-continental country borders + the 14 countries' state borders; coastlines have NO redundant line (defined only by dots).

- [ ] **Step 7: Commit**

```bash
git add src/globe.js src/main.js test/globe.borders.test.js
git commit -m "feat: render intra-continental border lines"
```

---

## Task 9: Highlight system

**Files:**
- Create: `src/highlight.js`, `data/highlights.json`
- Modify: `src/main.js`
- Test: `test/highlight.test.js`

**Interfaces:**
- Consumes: `regionIndexMap` + `baseColors` + `geometry` from `createPointsObject`; `HIGHLIGHT_COLOR`; valid region ids from `regions.json`.
- Produces: `highlight.js` exports:
  - `buildHighlightSet(highlightsData, validIds) -> { set: Set<string>, unknown: string[] }`
  - `applyHighlights(geometry, regionIndexMap, baseColors, set, colorHex) -> void` (recolors all points of highlighted regions; restores others from baseColors)

- [ ] **Step 1: Create `data/highlights.json` (seed sample)**

```json
{
  "BR-SP": ["Alice", "Bruno"],
  "JP-13": ["Kenji"],
  "PT": ["Diogo"]
}
```

- [ ] **Step 2: Write the failing test `test/highlight.test.js`**

```js
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
  it('recolors highlighted region points and restores others', () => {
    // 3 vertices: region AA (idx 0,1), region BB (idx 2)
    const colorArr = new Float32Array(9);
    const geometry = { getAttribute: () => ({ array: colorArr, needsUpdate: false, set(a){ colorArr.set(a); }, setXYZ(i,r,g,b){ colorArr[i*3]=r;colorArr[i*3+1]=g;colorArr[i*3+2]=b; } }) };
    const baseColors = new Float32Array([0.5,0.5,0.5, 0.5,0.5,0.5, 0.5,0.5,0.5]);
    const map = new Map([['AA',[0,1]],['BB',[2]]]);
    applyHighlights(geometry, map, baseColors, new Set(['AA']), '#ff5a1f');
    // AA points -> orange-ish (r>g,b); BB -> restored base
    expect(colorArr[0]).toBeGreaterThan(colorArr[1]); // idx0 red dominates
    expect(colorArr[6]).toBeCloseTo(0.5, 5);          // idx2 restored
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- highlight`
Expected: FAIL — exports not defined.

- [ ] **Step 4: Implement `src/highlight.js`**

```js
import * as THREE from 'three';

export function buildHighlightSet(highlightsData, validIds) {
  const set = new Set();
  const unknown = [];
  for (const id of Object.keys(highlightsData)) {
    if (validIds.has(id)) set.add(id);
    else unknown.push(id);
  }
  return { set, unknown };
}

export function applyHighlights(geometry, regionIndexMap, baseColors, set, colorHex) {
  const attr = geometry.getAttribute('color');
  attr.array.set(baseColors); // restore everything first
  const c = new THREE.Color(colorHex);
  for (const id of set) {
    const indices = regionIndexMap.get(id);
    if (!indices) continue;
    for (const i of indices) attr.setXYZ(i, c.r, c.g, c.b);
  }
  attr.needsUpdate = true;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- highlight`
Expected: PASS.

- [ ] **Step 6: Wire into `src/main.js`**

```js
import { HIGHLIGHT_COLOR } from './config.js';
import { buildHighlightSet, applyHighlights } from './highlight.js';
// after globe + regions loaded:
const regions = await fetch('data/regions.json').then((r) => r.json());
const validIds = new Set(regions.map((r) => r.id));
const highlights = await fetch('/data/highlights.json').then((r) => r.json());
const { set, unknown } = buildHighlightSet(highlights, validIds);
if (unknown.length) console.warn('[highlights] unknown region ids ignored:', unknown);
applyHighlights(globe.geometry, globe.regionIndexMap, globe.baseColors, set, HIGHLIGHT_COLOR);
```
(Adjust `loadGlobe` to return the full `obj` as `globe` so these fields are accessible. Note `data/highlights.json` lives at project root `data/`; import it via Vite by placing it under `public/` OR add `resolve` — simplest: move seed file to `public/data/highlights.json` and fetch `data/highlights.json`. Keep the AUTHOR-EDITED copy at `public/data/highlights.json` so it ships verbatim.)

- [ ] **Step 7: Visual verification**

Run: `npm run dev`
Expected: São Paulo (BR-SP), Tokyo (JP-13), and Portugal (PT) glow orange across their full shape (contour + fill). Console shows no unknown-id warning for the seed file.

- [ ] **Step 8: Commit**

```bash
git add src/highlight.js public/data/highlights.json src/main.js test/highlight.test.js
git commit -m "feat: highlight regions from highlights.json"
```

---

## Task 10: Controls (OrbitControls, zoom limits, autorotate pause/resume)

**Files:**
- Create: `src/controls.js`
- Modify: `src/main.js`
- Test: `test/controls.idle.test.js`

**Interfaces:**
- Consumes: `ZOOM_MIN`, `ZOOM_MAX` from config; three's `OrbitControls`.
- Produces: `controls.js` exports:
  - `createControls(camera, domElement) -> OrbitControls` (configured: damping, min/max distance, zoom + rotate enabled, pan disabled).
  - `makeIdleAutoRotate({ idleMs }) -> { onInteract(), shouldAutoRotate(now) }` — pure helper: after an interaction, auto-rotation resumes only once `idleMs` has elapsed.

- [ ] **Step 1: Write the failing test `test/controls.idle.test.js`**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- controls.idle`
Expected: FAIL — `makeIdleAutoRotate` not defined.

- [ ] **Step 3: Implement `src/controls.js`**

```js
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ZOOM_MIN, ZOOM_MAX } from './config.js';

export function createControls(camera, domElement) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.8;
  controls.minDistance = ZOOM_MIN;
  controls.maxDistance = ZOOM_MAX;
  return controls;
}

export function makeIdleAutoRotate({ idleMs }) {
  let lastInteract = -Infinity;
  return {
    onInteract(now) { lastInteract = now; },
    shouldAutoRotate(now) { return now - lastInteract >= idleMs; },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- controls.idle`
Expected: PASS.

- [ ] **Step 5: Wire into `src/main.js`** — replace the manual rotation:

```js
import { createControls, makeIdleAutoRotate } from './controls.js';
const controls = createControls(camera, renderer.domElement);
const idle = makeIdleAutoRotate({ idleMs: 2500 });
controls.addEventListener('start', () => idle.onInteract(performance.now()));
controls.addEventListener('change', () => idle.onInteract(performance.now()));

function animate() {
  const now = performance.now();
  if (idle.shouldAutoRotate(now)) root.rotation.y += 0.0009;
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
```
Add to `index.html` import map (so `three/addons` resolves) — or rely on Vite resolving `three/addons/...` (works with three ^0.160 via the package's exports). If it fails to resolve, import from `'three/examples/jsm/controls/OrbitControls.js'` instead.

- [ ] **Step 6: Visual verification**

Run: `npm run dev`
Expected: left-drag rotates; scroll zooms but stops at the configured min/max; auto-rotation pauses while interacting and resumes ~2.5s after release.

- [ ] **Step 7: Commit**

```bash
git add src/controls.js src/main.js test/controls.idle.test.js
git commit -m "feat: orbit controls with zoom limits + idle auto-rotation"
```

---

## Task 11: Label overlay — zoom tiers, people lists, collision culling, top-5

**Files:**
- Create: `src/labels.js`
- Modify: `src/main.js`, `src/style.css`
- Test: `test/labels.test.js`

**Interfaces:**
- Consumes: `regions.json`; `public/data/highlights.json`; `vector3ToScreen`, `latLonToVector3` from `geo.js`; `TIER_FAR`, `TIER_NEAR`, `GLOBE_RADIUS` from config; the highlight `set`.
- Produces: `labels.js` exports:
  - `zoomTier(cameraDistance) -> 'far' | 'medium' | 'near'`
  - `truncateList(names, limit=5) -> { shown: string[], total: number, hiddenCount: number }`
  - `cullCollisions(candidates) -> Set<index>` where each candidate is `{ index, x, y, w, h, priority }`; returns the set of indices that survive (higher `priority` wins; lower priority dropped when overlapping a kept box).
  - `createLabelLayer({ overlayEl, regions, highlightSet, peopleByRegion }) -> { update(camera, root, width, height, cameraDistance) }` — builds/updates DOM each frame.

- [ ] **Step 1: Write the failing test `test/labels.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { zoomTier, truncateList, cullCollisions } from '../src/labels.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- labels`
Expected: FAIL — exports not defined.

- [ ] **Step 3: Implement `src/labels.js`**

```js
import { TIER_FAR, TIER_NEAR, GLOBE_RADIUS } from './config.js';
import { latLonToVector3, vector3ToScreen } from './geo.js';

export function zoomTier(d) {
  if (d > TIER_FAR) return 'far';
  if (d < TIER_NEAR) return 'near';
  return 'medium';
}

export function truncateList(names, limit = 5) {
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  const shown = sorted.slice(0, limit);
  return { shown, total: sorted.length, hiddenCount: Math.max(0, sorted.length - limit) };
}

function overlaps(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

// Greedy: keep highest priority first, drop lower-priority boxes overlapping a kept one.
export function cullCollisions(candidates) {
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  const kept = [];
  const keptIdx = new Set();
  for (const c of sorted) {
    if (kept.some((k) => overlaps(k, c))) continue;
    kept.push(c);
    keptIdx.add(c.index);
  }
  return keptIdx;
}

export function createLabelLayer({ overlayEl, regions, highlightSet, peopleByRegion }) {
  const active = regions.filter((r) => highlightSet.has(r.id));
  // One list element per highlighted region, reused across frames.
  const nodes = new Map();
  for (const r of active) {
    const el = document.createElement('div');
    el.className = 'people-list';
    el.style.position = 'absolute';
    overlayEl.appendChild(el);
    nodes.set(r.id, el);
  }

  function renderListHTML(r) {
    const names = peopleByRegion[r.id] || [];
    const { shown, total, hiddenCount } = truncateList(names);
    const items = shown.map((n) => `<li>${n}</li>`).join('');
    const more = hiddenCount > 0
      ? `<button class="more" data-region="${r.id}">+${hiddenCount} more (${total})</button>` : '';
    return `<div class="region-name">${r.name}</div><ul>${items}</ul>${more}`;
  }

  // expand state per region
  const expanded = new Set();
  overlayEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button.more');
    if (!btn) return;
    expanded.add(btn.dataset.region);
    const r = active.find((x) => x.id === btn.dataset.region);
    const el = nodes.get(r.id);
    const names = (peopleByRegion[r.id] || []).slice().sort((a, b) => a.localeCompare(b));
    el.querySelector('ul').innerHTML = names.map((n) => `<li>${n}</li>`).join('');
    btn.remove();
  });

  function update(camera, root, width, height, cameraDistance) {
    const tier = zoomTier(cameraDistance);
    if (tier === 'far') { for (const el of nodes.values()) el.style.display = 'none'; return; }

    // Project centroids; build collision candidates among on-screen, front-facing regions.
    const candidates = [];
    const screenById = new Map();
    for (const r of active) {
      const local = latLonToVector3(r.centroid.lat, r.centroid.lon, GLOBE_RADIUS);
      const world = local.applyMatrix4(root.matrixWorld);
      const s = vector3ToScreen(world, camera, width, height);
      if (!s.visible || s.x < 0 || s.y < 0 || s.x > width || s.y > height) { screenById.set(r.id, null); continue; }
      screenById.set(r.id, s);
      const count = (peopleByRegion[r.id] || []).length;
      const w = 120, h = 24 + Math.min(count, 5) * 16;
      // priority: bigger area on screen (isolated/large regions) win; using inverse of nearby density via simple count
      candidates.push({ index: r.id, x: s.x - w / 2, y: s.y - h / 2, w, h, priority: count + 1 });
    }

    const kept = tier === 'near' ? new Set(candidates.map((c) => c.index)) : cullCollisions(candidates);

    for (const r of active) {
      const el = nodes.get(r.id);
      const s = screenById.get(r.id);
      if (!s || !kept.has(r.id)) { el.style.display = 'none'; continue; }
      if (el.dataset.built !== '1' || !expanded.has(r.id)) { el.innerHTML = renderListHTML(r); el.dataset.built = '1'; }
      el.style.display = 'block';
      el.style.left = `${s.x}px`;
      el.style.top = `${s.y}px`;
      el.style.transform = 'translate(-50%, -50%)';
    }
  }

  if (!root) { /* root provided per-frame */ }
  return { update };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- labels`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Add list styles to `src/style.css`**

```css
.people-list {
  pointer-events: auto;
  text-align: center;
  color: var(--text);
  font-weight: 400;
  font-size: 13px;
  line-height: 1.25;
  text-shadow: 0 1px 3px rgba(0,0,0,0.6);
}
.people-list .region-name { font-weight: 600; letter-spacing: 0.04em; font-size: 14px; }
.people-list ul { list-style: none; }
.people-list .more {
  margin-top: 2px; background: transparent; border: none; color: var(--text);
  opacity: 0.7; cursor: pointer; font-family: inherit; font-size: 12px;
}
```

- [ ] **Step 6: Wire into `src/main.js`**

```js
import { createLabelLayer } from './labels.js';
import { GLOBE_RADIUS as R } from './config.js';
const overlayEl = document.getElementById('overlay');
const labelLayer = createLabelLayer({ overlayEl, regions, highlightSet: set, peopleByRegion: highlights });
// in animate(), after controls.update():
const dist = camera.position.length();
labelLayer.update(camera, root, window.innerWidth, window.innerHeight, dist);
```

- [ ] **Step 7: Visual verification**

Run: `npm run dev`
Expected: far zoom shows no lists; zooming to medium reveals lists only where they don't overlap (isolated regions first); zooming near reveals all visible lists; a region with > 5 names shows top-5 + a "+N more (total)" button that expands on click.

- [ ] **Step 8: Commit**

```bash
git add src/labels.js src/main.js src/style.css test/labels.test.js
git commit -m "feat: people-list overlay with zoom tiers, collision culling, top-5"
```

---

## Task 12: Region cursor label (hover pill + fade)

**Files:**
- Modify: `src/labels.js` (add `createCursorLabel`), `src/main.js`, `src/style.css`
- Test: `test/labels.cursor.test.js`

**Interfaces:**
- Consumes: `regionIndexMap` (to know which points belong to a region) OR a raycast against the points; `regions` (id→name); the highlight `set`.
- Produces: `labels.js` exports `createCursorLabel({ overlayEl }) -> { show(name, x, y), hide() }` (a pill element that fades in/out and follows the cursor). Raycasting + region lookup is wired in `main.js`.

- [ ] **Step 1: Write the failing test `test/labels.cursor.test.js`** (jsdom)

```js
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
```

- [ ] **Step 2: Add jsdom + run test to verify it fails**

Run: `npm i -D jsdom && npm test -- labels.cursor`
Expected: FAIL — `createCursorLabel` not defined.

- [ ] **Step 3: Add `createCursorLabel` to `src/labels.js`**

```js
export function createCursorLabel({ overlayEl }) {
  const el = document.createElement('div');
  el.className = 'region-pill';
  overlayEl.appendChild(el);
  return {
    show(name, x, y) {
      el.textContent = name;
      el.style.left = `${x}px`;
      el.style.top = `${y - 18}px`; // pinned just above the cursor
      el.classList.add('visible');
    },
    hide() { el.classList.remove('visible'); },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- labels.cursor`
Expected: PASS.

- [ ] **Step 5: Add pill styles to `src/style.css`**

```css
.region-pill {
  position: absolute; transform: translate(-50%, -100%);
  background: rgba(20,20,24,0.85); color: #fff;
  padding: 4px 10px; border-radius: 999px;
  font-weight: 600; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase;
  white-space: nowrap; pointer-events: none;
  opacity: 0; transition: opacity 160ms ease;
}
.region-pill.visible { opacity: 1; }
```

- [ ] **Step 6: Wire raycasting into `src/main.js`**

```js
import { createCursorLabel } from './labels.js';
const cursorLabel = createCursorLabel({ overlayEl });
const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 0.012;
const pointer = new THREE.Vector2();
let pointerPx = { x: 0, y: 0 };
const idToName = new Map(regions.map((r) => [r.id, r.name]));

// Build a per-vertex regionId lookup once (vertex index -> regionId), only for highlighted regions.
const vertexRegion = new Array(globe.geometry.getAttribute('position').count).fill(null);
for (const id of set) for (const i of (globe.regionIndexMap.get(id) || [])) vertexRegion[i] = id;

renderer.domElement.addEventListener('pointermove', (e) => {
  pointerPx = { x: e.clientX, y: e.clientY };
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

// in animate():
raycaster.setFromCamera(pointer, camera);
const hits = raycaster.intersectObject(globe.points, false);
let hovered = null;
for (const h of hits) { const id = vertexRegion[h.index]; if (id) { hovered = id; break; } }
if (hovered) cursorLabel.show((idToName.get(hovered) || hovered).toUpperCase(), pointerPx.x, pointerPx.y);
else cursorLabel.hide();
```

- [ ] **Step 7: Visual verification**

Run: `npm run dev`
Expected: hovering an orange (highlighted) region fades in a pill with the region name pinned just above the cursor; moving off fades it out. Non-highlighted regions show nothing.

- [ ] **Step 8: Commit**

```bash
git add src/labels.js src/main.js src/style.css test/labels.cursor.test.js package.json
git commit -m "feat: hover region pill label following the cursor"
```

---

## Task 13: Light/Dark theme

**Files:**
- Create: `src/theme.js`
- Modify: `src/main.js`, `src/style.css`
- Test: `test/theme.test.js`

**Interfaces:**
- Consumes: `localStorage`, `matchMedia('(prefers-color-scheme: dark)')`.
- Produces: `theme.js` exports:
  - `resolveTheme(stored, systemPrefersDark) -> 'light' | 'dark'`
  - `THEMES = { dark: {bg,dot,border,text}, light: {...} }`
  - `createThemeController({ onChange }) -> { current(), toggle(), colors() }` (persists to localStorage, applies CSS vars, calls `onChange(colors)`).

- [ ] **Step 1: Write the failing test `test/theme.test.js`** (jsdom)

```js
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- theme`
Expected: FAIL — exports not defined.

- [ ] **Step 3: Implement `src/theme.js`**

```js
export const THEMES = {
  dark:  { bg: '#0d0d0f', dot: '#f2f2f2', border: '#555555', text: '#f2f2f2' },
  light: { bg: '#f4f4f6', dot: '#1a1a1e', border: '#9a9aa2', text: '#1a1a1e' },
};

export function resolveTheme(stored, systemPrefersDark) {
  if (stored === 'light' || stored === 'dark') return stored;
  return systemPrefersDark ? 'dark' : 'light';
}

export function createThemeController({ onChange }) {
  const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  let theme = resolveTheme(localStorage.getItem('theme'), prefersDark());

  function apply() {
    const c = THEMES[theme];
    const root = document.documentElement;
    root.style.setProperty('--bg', c.bg);
    root.style.setProperty('--text', c.text);
    onChange?.(c);
  }
  apply();

  return {
    current: () => theme,
    colors: () => THEMES[theme],
    toggle() {
      theme = theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', theme);
      apply();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- theme`
Expected: PASS.

- [ ] **Step 5: Add light-theme CSS var defaults to `src/style.css`** (optional — controller sets vars at runtime; ensure pill/list use `var(--text)`/`var(--bg)`; already done).

- [ ] **Step 6: Wire into `src/main.js`** — replace the hardcoded `THEME` const:

```js
import { createThemeController } from './theme.js';

let THEME;
const themeCtl = createThemeController({
  onChange: (colors) => {
    THEME = colors;
    if (globe) {
      // recolor dots base + reapply highlights
      recolorGlobe(colors);
    }
  },
});
THEME = themeCtl.colors();
document.getElementById('theme-toggle').addEventListener('click', () => themeCtl.toggle());
```
Add a `recolorGlobe(colors)` helper in `main.js` that rebuilds `baseColors` from the new `dot` color per tier and calls `applyHighlights(...)` again, and updates the border `LineBasicMaterial.color` + points material if needed. (Rebuild base: iterate points, set per-tier intensity × new dot color into `baseColors`, then `applyHighlights`.) Store the loaded `data.points` array on a module variable so `recolorGlobe` can recompute tiers.

- [ ] **Step 7: Visual verification**

Run: `npm run dev`
Expected: the toggle button flips between dark (light dots on dark bg) and light (dark dots on light bg); orange highlights stay orange in both; choice persists across reload.

- [ ] **Step 8: Commit**

```bash
git add src/theme.js src/main.js src/style.css test/theme.test.js
git commit -m "feat: light/dark theme with persistence"
```

---

## Task 14: Data validation test, README, production build verification

**Files:**
- Create: `test/data-validation.test.js`, `README.md`

**Interfaces:**
- Consumes: generated `public/data/regions.json` + author `public/data/highlights.json`.
- Produces: a guard test ensuring every highlight id is a real region; `README.md` documenting how to add a region and build.

- [ ] **Step 1: Write `test/data-validation.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const has = existsSync('public/data/regions.json');
describe.skipIf(!has)('highlights reference real regions', () => {
  it('every highlight id exists in regions.json', () => {
    const regions = JSON.parse(readFileSync('public/data/regions.json', 'utf8'));
    const ids = new Set(regions.map((r) => r.id));
    const highlights = JSON.parse(readFileSync('public/data/highlights.json', 'utf8'));
    const unknown = Object.keys(highlights).filter((id) => !ids.has(id));
    expect(unknown).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run fetch-geo && npm run data && npm test -- data-validation`
Expected: PASS (seed ids BR-SP / JP-13 / PT all exist). If it lists unknown ids, fix `public/data/highlights.json` using `iso-reference.md`.

- [ ] **Step 3: Write `README.md`**

````markdown
# VRChat Globe

A minimalist transparent dot-matrix 3D globe (three.js) highlighting world regions
where I met at least one person in VRChat.

## Setup
```bash
npm install
npm run fetch-geo   # downloads Natural Earth data (once)
npm run data        # generates public/data/*.json + iso-reference.md
npm run dev         # http://localhost:5173
```

## Add / highlight a region
1. Find the ISO code in `iso-reference.md` (country = `JP`; state of a 14-country = `BR-SP`).
2. Edit `public/data/highlights.json`:
   ```json
   { "BR-SP": ["Alice", "Bob"], "JP-13": ["Kenji"] }
   ```
3. `npm run dev` (or rebuild). Unknown ids are warned in the console and ignored.

The 14 countries are marked at **state** level only (never whole-country):
BR, AR, US, CA, AU, GB, DE, IT, FR, ES, NO, SE, FI, JP.

## Build & deploy
```bash
npm run build       # runs data generation + vite build -> dist/
npm run preview
```
Deploy `dist/` to any static host (GitHub Pages / Vercel / Netlify).
````

- [ ] **Step 4: Production build verification**

Run: `npm run build && npm run preview` (then Ctrl-C)
Expected: build succeeds; preview serves the working globe (rotation, zoom tiers, highlights, hover pill, theme toggle) with no console errors.

- [ ] **Step 5: Full test suite**

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 6: Commit**

```bash
git add test/data-validation.test.js README.md
git commit -m "test: data validation guard + docs"
```

---

## Self-Review Notes (coverage vs spec)

- Spec §2 granularity → Task 3 (`buildRegions` excludes 14-country admin-0, includes admin-1; test-covered).
- Spec §3 dot-matrix + two tiers + transparent globe + exact-shape orange → Tasks 4, 7, 9.
- Spec §3 intra-continental borders (no coastline lines) → Task 5/8 (uses `boundary_lines_land` + state lines).
- Spec §4 light/dark with constant orange + persistence → Task 13.
- Spec §5 controls + zoom limits + 3 tiers + collision-hide + cursor pill + top-5/expand/counter → Tasks 10, 11, 12.
- Spec §6 ISO data model + reference table → Tasks 3, 9, 14.
- Spec §7 stack + build pipeline + runtime modules → Tasks 1–14 (file structure matches).
- Spec §8 error handling (unknown id warn, empty list, collision only for visible) → Task 9 (warn), Task 11 (empty list renders region name only; visible-only projection).
- Spec §10 testing → unit tests in Tasks 1,3,4,5,7,8,9,10,11,12,13 + data validation Task 14 + manual visual steps.

**Known data nuance to confirm during Task 5/6:** the parent-country property key on `state-lines.geojson` and `states.geojson` (Natural Earth sometimes uses `iso_a2`, `adm0_a3`, or a name). Confirm by logging one feature's `properties` and adjust the extraction; tests assert behavior, not the source key.
