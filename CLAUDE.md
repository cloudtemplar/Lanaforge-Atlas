# Lanaforge Atlas — project context for Claude

Minimalist, single-page **transparent dot-matrix 3D globe** that highlights the world
regions where the author met people.
(Originally prototyped under a different name; the project is now **Lanaforge Atlas** — no
other product name should appear anywhere.)

## Stack
Vite 5 · vanilla JS (ES modules) · three.js `^0.160` · d3-geo `^3` (build-time only) ·
Vitest (+ jsdom for DOM tests). **Node ≥ 18** (build script uses global `fetch`).

## Environment gotcha (Windows)
Node is installed at `C:\Program Files\nodejs`. If a shell reports `node` not found, it was
launched before Node was installed — open a NEW terminal, or prepend PATH:
PowerShell `$env:Path = "C:\Program Files\nodejs;" + $env:Path` · Bash `export PATH="/c/Program Files/nodejs:$PATH"`.

## Architecture
- **Build pipeline** (`scripts/`, Node): downloads Natural Earth GeoJSON → generates static
  JSON. **ALL point-in-polygon happens at build time**; the browser only renders precomputed data.
- **Runtime** (`src/`, browser): fetches the JSON, renders a transparent dot-matrix globe
  (three.js) + an HTML/CSS overlay for labels.

## Data flow
`npm run fetch-geo` → `scripts/geo-src/*.geojson` (gitignored) → `npm run data`
(`scripts/preprocess.mjs`) → `public/data/{regions,points}.json` (gitignored) + `iso-reference.md`
→ browser `fetch`es them. Author data (`data/highlights.json`) is a **static import**, not fetched.

## Region model
Region ids are **ISO 3166**: country = alpha-2 (`JP`, `FR`, `PT`); sub-region = ISO 3166-2
(`BR-SP`, `US-CA`, `JP-13`). Only **4 countries** are marked at state level (admin-1) —
`STATE_LEVEL = ['BR','US','CA','JP']` in `src/config.js`. Every other country (incl. all of
Europe/UK, AR, AU) is a whole-country admin-0 region. `iso-reference.md` (generated) lists all
valid ids.

## Dot system (v2 — the current visual design)
Spec: `docs/superpowers/specs/2026-06-25-lanaforge-atlas-dot-style.md`.
**Round** dots (custom `THREE.ShaderMaterial`, per-vertex `aSize`/`aOpacity`, round-discard in
fragment, depth fade dims the far hemisphere). **No border lines** — borders are dots. Three
categories (each point tagged `category`), tuned in `CATEGORY_STYLE` (`src/globe.js`):
- **coast** — coastline outline; biggest, strongest (size 2.6 / opacity 0.85); dense along coast (`coastline` source).
- **land** — uniform interior grid; small, faint (1.8 / 0.30); grid spacing ~1.5° (point-in-polygon).
- **border** — intra-continental country borders + the 4 countries' state borders; same size as
  land, a touch more opaque (1.8 / 0.45), **denser** (~0.7°) so it reads as a seam that separates
  neighbours (e.g. US/Canada). `regionId` is `null` for border dots (not highlighted).
All islands kept (no size filter). **Highlight** (= author's choice "B"): a highlighted region's
own dots turn orange `#ff5a1f` AND opacity is boosted to ~0.9 so it reads over faint dots
(`applyHighlights` sets color + opacity). Orange is constant across themes.

## Key files
- `src/config.js` — `GLOBE_RADIUS=1`, `ZOOM_MIN=1.15`, `ZOOM_MAX=2.6`, `TIER_FAR=2.0`,
  `TIER_NEAR=1.4`, `HIGHLIGHT_COLOR='#ff5a1f'`, `STATE_LEVEL`, `SOURCES` (5 Natural Earth URLs:
  admin-0 countries 50m, admin-1 states **10m**, admin-0 boundary_lines_land 50m, admin-1 lines
  **10m**, coastline 50m).
- `src/geo.js` — `latLonToVector3`, `vector3ToScreen`, `angularDistanceDeg`.
- `src/globe.js` — `buildPointsGeometry` (position/color/aSize/aOpacity; `regionIndexMap` only for
  non-null regionId), `createPointsObject` (round-dot ShaderMaterial; returns
  `{points,geometry,regionIndexMap,baseColors,baseOpacity}`).
- `src/highlight.js` — `buildHighlightSet`, `applyHighlights(geometry, regionIndexMap, baseColors,
  baseOpacity, set, colorHex, highlightOpacity)`.
- `src/controls.js` — `createControls` (OrbitControls; min/max distance; pan disabled).
- `src/labels.js` — `zoomTier`, `truncateList`, `cullCollisions`, `createLabelLayer` (people lists
  by zoom tier + screen-space collision cull + far-hemisphere limb cull + top-5/expand),
  `createCursorLabel` (hover pill). Names are HTML-escaped (`escapeHtml`).
- `src/theme.js` — `resolveTheme`, `THEMES` (dark/light), `createThemeController` (localStorage +
  `prefers-color-scheme` + CSS vars `--bg`/`--text`).
- `src/main.js` — scene/render-loop wiring (see conventions below).
- `scripts/lib/regions.mjs` — `buildRegions(countriesFC, statesFC) → {regions, features}`.
- `scripts/lib/points.mjs` — `buildRegionIndex`, `assignRegion`, `assignRegionNudged`,
  `generateLandPoints`, `generateCoastPoints`, `generateBorderPoints`,
  `generatePoints(features, coastlineFC, countryLinesFC, stateLinesFC)`. Point =
  `{lat,lon,regionId,category}`. `ISO3_TO_ISO2` map (BRA/USA/CAN/JPN) filters state lines.
- `scripts/lib/reference.mjs` — `buildIsoReference` → `iso-reference.md`.
- `scripts/preprocess.mjs` — orchestrator (writes regions.json, points.json, iso-reference.md;
  **no borders.json** in v2).
- `data/highlights.json` — AUTHOR-EDITED, committed, `{ regionId: [names] }`.
- `public/data/` & `scripts/geo-src/` — GENERATED, gitignored.
- `test/` — geo, regions, points, highlight, labels, labels.cursor, theme, globe.buildgeom,
  data-validation.

## Conventions & gotchas (don't relearn these the hard way)
- **No top-level `await` in `src/main.js`** — Vite's es2020 target rejects it. Do async work
  inside `loadGlobe()` and call it as `loadGlobe().catch(...)`. Module-scoped refs
  (`globe`, `loadedPoints`, `highlightSet`, …) are declared BEFORE the theme controller (which
  fires `onChange` synchronously) to avoid a TDZ crash.
- **`data/highlights.json` lives at repo ROOT** (committed) and is imported as a module — NOT
  under the gitignored `public/data/`.
- **admin-1 must be 10m**: the 50m admin-1 set omits subdivisions for most countries. admin-0 +
  coastline stay 50m (lighter). State-line features key parent country on `ADM0_A3` (3-letter,
  e.g. `JPN`) — use the `ISO3_TO_ISO2` map, not `.slice(0,2)`.
- **Fresh checkout**: `public/data/` and `scripts/geo-src/` are gitignored, so `npm run fetch-geo`
  + `npm run data` must run before `npm run build` (build = `data && vite build`).
- Auto-rotation spins the `root` group (not the camera) at `0.00027` rad/frame; it pauses ONLY
  while the left mouse button is held (`leftDown` flag), not on zoom. Per frame, main.js updates
  the shader uniform `uCamDist = camera.position.length()`.

## Commands
`npm run dev` · `npm run build` (= `npm run data && vite build`) · `npm run preview` ·
`npm run fetch-geo` · `npm run data` · `npm test` (Vitest).

## Tunable visual knobs
`CATEGORY_STYLE` sizes/opacities (`src/globe.js`) · dot spacings in `generatePoints` (`scripts/lib/points.mjs`,
re-run `npm run data` after) · depth-fade floor `mix(0.25,1.0,…)` in the fragment shader
(`src/globe.js`) · **dot size attenuation** `uRefDist` uniform (`src/globe.js`, default `1.4`): dots are
world-anchored (perspective `gl_PointSize = aSize*uPixelRatio*(uRefDist/-mv.z)`) so they grow on zoom-in;
lower `uRefDist` = smaller dots overall · highlight opacity (`applyHighlights(..., 0.9)` in `main.js`) ·
rotation speed `0.00027` and raycaster `Points.threshold = 0.012` (`src/main.js`).

## Status
v1 (14-country, square contour/fill dots, border lines) shipped, then revised to **v2** (this doc):
4 state-level countries, round 3-category dots, no border lines, slower drag-pause rotation,
renamed Lanaforge Atlas. Visual fine-tuning with the author is ongoing — treat the knobs above as
adjustable. Process notes & per-task history live in `.superpowers/sdd/progress.md` (gitignored scratch).
