# Lanaforge Atlas — project context for Claude

Minimalist, single-page **transparent dot-matrix 3D globe** that highlights the world
regions where the author met people.
(Originally prototyped under a different name; the project is now **Lanaforge Atlas** — no
other product name should appear anywhere.)

> **The code is the source of truth.** This doc explains *structure, intent, and where things
> live* — not current values. Visual tuning numbers (dot sizes/opacities, spacings, colors, zoom
> limits, rotation speed, attenuation, thresholds, fade) change often; **always read them from the
> named constant in the file, never from here.** This file names the knob and its file; it does not
> quote its value. If you find a literal tuning value written below, treat it as stale and delete it.

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
categories (each point tagged `category`); per-category size/opacity live in `CATEGORY_STYLE`
(`src/globe.js`), per-category spacing in `generatePoints` (`scripts/lib/points.mjs`):
- **coast** — coastline outline; the biggest, strongest category; densely traced along the
  coastline (`coastline` source).
- **land** — uniform interior grid filling each territory; small and faint (point-in-polygon).
- **border** — intra-continental country borders + the 4 countries' state borders; sized like land
  but a touch more opaque and **denser**, so it reads as a seam that separates neighbours (e.g.
  US/Canada). Each border dot carries `regionIds` (an array of ALL regions adjacent to the boundary,
  via `assignRegionsNudged`), so highlighting either neighbour lights up the whole shared seam — not
  a patchy half. (coast/land carry a single `regionId`.)
After generation the three categories are **thinned by hierarchy** (`thinByHierarchy` in
`scripts/lib/points.mjs`): priority is coast > border > land, and a lower-priority dot is dropped
when it falls within `clearanceDeg` (great-circle) of an already-kept higher-priority dot, so the
categories don't pile up in dense areas (e.g. Japan). Coast also thins against itself via a separate
`coastGapDeg` (the big coast dots must not overlap each other — coast is generated finely and this
gap sets the even final coast spacing); border/land are not self-thinned. Thinning is build-time, so
changes need `npm run data`. All islands kept (no size filter). Dots are **world-anchored**
(perspective size attenuation via the `uRefDist` uniform in `src/globe.js`) so they grow on zoom-in.
**Highlight** (= author's choice "B"): a highlighted region's own dots switch to `HIGHLIGHT_COLOR`
(`src/config.js`) AND each dot's own base opacity is multiplied by a boost (clamped to 1; the
opacity-boost arg of `applyHighlights` in `main.js`) so the dots read over the faint base while
keeping the coast > border > land opacity hierarchy. The highlight color is constant across themes.

## Key files
- `src/config.js` — tuning/structure constants: `GLOBE_RADIUS`, `ZOOM_MIN`/`ZOOM_MAX`,
  `TIER_FAR`/`TIER_NEAR` (label zoom tiers), `HIGHLIGHT_COLOR`, `STATE_LEVEL`, `SOURCES` (5 Natural
  Earth URLs: admin-0 countries 50m, admin-1 states **10m**, admin-0 boundary_lines_land 50m,
  admin-1 lines **10m**, coastline 50m). Read current values from the file.
- `src/geo.js` — `latLonToVector3`, `vector3ToScreen`, `angularDistanceDeg`.
- `src/globe.js` — `buildPointsGeometry` (position/color/aSize/aOpacity; `regionIndexMap` only for
  non-null regionId), `createPointsObject` (round-dot ShaderMaterial w/ `uRefDist` size attenuation;
  returns `{points,geometry,regionIndexMap,baseColors,baseOpacity}`).
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
  `assignRegionsNudged` (all adjacent regions, for borders), `generateLandPoints`,
  `generateCoastPoints`, `generateBorderPoints(…, index, stepDeg)` (border dots get `regionIds`),
  `thinByHierarchy(coast, border, land, clearanceDeg, coastGapDeg)` (priority cull + coast
  self-spacing, see Dot system), `generatePoints(features, coastlineFC, countryLinesFC, stateLinesFC)`.
  Point = `{lat,lon,category}` + `regionId` (coast/land) or `regionIds` (border). `ISO3_TO_ISO2` map
  (BRA/USA/CAN/JPN) filters state lines.
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
- Auto-rotation spins the `root` group (not the camera) at a slow constant rate (the literal is in
  `src/main.js`); it pauses ONLY while the left mouse button is held (`leftDown` flag), not on zoom.
  Per frame, main.js updates the shader uniform `uCamDist = camera.position.length()`.

## Commands
`npm run dev` · `npm run build` (= `npm run data && vite build`) · `npm run preview` ·
`npm run fetch-geo` · `npm run data` · `npm test` (Vitest).

## Tunable visual knobs (names + locations only — values live in the code)
- **Dot size & opacity** per category — `CATEGORY_STYLE` (`src/globe.js`).
- **Dot spacing** per category — args in `generatePoints` (`scripts/lib/points.mjs`); **re-run
  `npm run data`** after (spacing is baked into `points.json`). Everything else here is runtime
  (hot-reloads in `npm run dev`).
- **Hierarchy thinning** — `clearanceDeg` (cross-category) and `coastGapDeg` (coast self-spacing /
  non-overlap; also the de-facto coast-density knob) args of `thinByHierarchy` in `generatePoints`
  (`scripts/lib/points.mjs`); bigger = more aggressive removal. Build-time — **re-run `npm run data`**.
- **Dot size attenuation** (world-anchored growth on zoom) — `uRefDist` uniform (`src/globe.js`);
  lower = smaller dots overall. Formula `gl_PointSize = aSize*uPixelRatio*(uRefDist/-mv.z)`.
- **Far-hemisphere fade** — the `mix(...)` floor in the fragment shader (`src/globe.js`).
- **Highlight color & opacity boost** — `HIGHLIGHT_COLOR` (`src/config.js`) + `HIGHLIGHT_OPACITY_BOOST`
  (the opacity-boost multiplier arg to `applyHighlights`, `src/main.js`).
- **Rotation speed** & **raycaster `Points.threshold`** — `src/main.js`.
- **Zoom limits / label tiers** — `ZOOM_MIN`/`ZOOM_MAX`, `TIER_FAR`/`TIER_NEAR` (`src/config.js`).

## Status
v1 (14-country, square contour/fill dots, border lines) shipped, then revised to **v2** (this doc):
4 state-level countries, round 3-category dots, no border lines, slower drag-pause rotation,
renamed Lanaforge Atlas. Visual fine-tuning with the author is ongoing — treat the knobs above as
adjustable. Process notes & per-task history live in `.superpowers/sdd/progress.md` (gitignored scratch).
