# Lanaforge Atlas — project context for Claude

Minimalist, single-page **transparent dot-matrix 3D globe** that highlights the world
regions where the author met people.

> **The code is the source of truth.** This doc explains *structure, intent, and where things
> live* — not current values. Visual tuning numbers (dot sizes/opacities, spacings, colors, zoom
> limits, rotation speed, attenuation, thresholds, fade) change often; **always read them from the
> named constant in the file, never from here.** This file names the knob and its file; it does not
> quote its value. If you find a literal tuning value written below, treat it as stale and delete it.

## Stack
Vite 5 · vanilla JS (ES modules) · three.js `^0.160` · d3-geo `^3` (build-time only) ·
Vitest (+ jsdom for DOM tests). **Node ≥ 18** (build script uses global `fetch`).

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
(`BR-SP`, `US-CA`, `CA-ON`). Only **3 countries** are marked at state level (admin-1) —
`STATE_LEVEL = ['BR','US','CA']` in `src/config.js`. Every other country (incl. Japan, all of
Europe/UK, AR, AU) is a whole-country admin-0 region. `iso-reference.md` (generated) lists all
valid ids.

A short list of **detached territories** (`TERRITORY_REGIONS` in `src/config.js` — Azores `PT-20`,
Madeira `PT-30`, Canaries `ES-GC`/`ES-TF`, French overseas `FR-GF`/`FR-GP`/`FR-MQ`/`FR-RE`/`FR-YT`,
Dutch Caribbean `NL-BQ1`/`NL-BQ2`/`NL-BQ3`) is carved out of the parent country into its own ISO
3166-2 region, so highlighting e.g. `PT` lights only mainland Portugal, not the Azores. Mechanism:
`buildRegions` emits each from the 10m states layer, then **cuts the territory's landmass out of
its parent country's geometry** (`subtractTerritories` in `scripts/lib/regions.mjs`): every parent
admin-0 sub-polygon whose own centroid falls inside a carved territory's geometry is dropped, so a
scattered archipelago (Azores, Canaries) is fully removed, not just the polygon nearest the
territory centroid. This is the real fix — it stops the parent claiming the territory's dots on
ALL paths: interior, the coast sliver where the 50m coast and 10m territory boundaries disagree,
and the border seam (where the collect-all `assignRegionsNudged` would otherwise still find the
parent). The parent's label centroid is unaffected (`mainlandCentroid` already keys on the largest
polygon). Territory features are still ordered FIRST in the feature array so `assignRegion`
(first-match) resolves any point the 10m territory polygon covers beyond the parent's now-cut
boundary to the territory rather than a neighbouring country.

## Dot system (v2 — the current visual design)
Spec: `docs/superpowers/specs/2026-06-25-lanaforge-atlas-dot-style.md`.
**Round** dots (custom `THREE.ShaderMaterial`, per-vertex `aSize`/`aOpacity`, round-discard in
fragment, depth fade dims the far hemisphere). **No border lines** — borders are dots. Three
categories (each point tagged `category`); per-category size/opacity live in `CATEGORY_STYLE`
(`src/config.js`, consumed in `src/globe.js`), per-category spacing in `DOT_SPACING` (`src/config.js`,
consumed by `generatePoints` in `scripts/lib/points.mjs`):
- **coast** — coastline outline; the biggest, strongest category; densely traced along the
  coastline (`coastline` source).
- **land** — uniform interior grid filling each territory; small and faint (point-in-polygon).
- **border** — intra-continental country borders + the 3 state-level countries' state borders; sized like land
  but a touch more opaque and **denser**, so it reads as a seam that separates neighbours (e.g.
  US/Canada). Each border dot carries `regionIds` (an array of ALL regions adjacent to the boundary,
  via `assignRegionsNudged`), so highlighting either neighbour lights up the whole shared seam — not
  a patchy half. (coast/land carry a single `regionId`.)
After generation the three categories are **thinned by hierarchy** (`thinByHierarchy` in
`scripts/lib/points.mjs`): priority is coast > border > land, and a lower-priority dot is dropped
when it falls within a clearance radius (great-circle) of an already-kept higher-priority dot, so the
categories don't pile up in dense areas (e.g. Japan). The clearance is split per category:
`clearanceDeg` is how close a *border* dot may sit to a kept coast dot; `landClearanceDeg` is how
close a *land* dot may sit to a kept coast/border dot (so land can pack tighter than borders).
Coast also thins against itself via a separate
`coastGapDeg` (the big coast dots must not overlap each other — coast is generated finely and this
gap sets the even final coast spacing); border/land are not self-thinned. Thinning is build-time, so
changes need `npm run data`. All islands kept (no size filter). Dots are **world-anchored**
(perspective size attenuation via the `uRefDist` uniform in `src/globe.js`) so they grow on zoom-in.
**Highlight** (= author's choice "B"): a highlighted region's own dots switch to `HIGHLIGHT_COLOR`
(`src/config.js`) AND each dot's own base opacity is multiplied by a boost (clamped to 1; the
opacity-boost arg of `applyHighlights` in `main.js`) so the dots read over the faint base while
keeping the coast > border > land opacity hierarchy. The highlight color is constant across themes.

## People overlay (labels)
HTML/CSS overlay (`src/labels.js` + `src/style.css`) listing the people met per highlighted region,
drawn over the dots and gated by zoom tier (`zoomTier`). Per region:
- Regions with **>= `MARKER_MIN_COUNT` names** collapse to a small **marker** (country name + a
  `--dot`-coloured person icon + count). Click the **country name only** (the sole click target — a
  small caret signals it) to expand the full list (country + top-5 names + "+N more"); click again to
  collapse. The names list and icon are NOT click targets (only its own "+N more" button is). Smaller
  regions show their list directly (no marker, not collapsible). Multiple regions expand independently;
  an expanded marker auto-resets to collapsed when its label fades out on zoom-out.
- Labels **fade in/out** and are **world-anchored**: size = `labelScale(viewDepth, LABEL_REF_DIST)`
  (same semantics as the dots' `uRefDist`), so they grow on zoom-in. **No collision culling** — only
  far-hemisphere limb + off-screen culls; every front-facing region is shown (markers separate on zoom).
- A hover **cursor pill** (`createCursorLabel`) shows a region name under the pointer, but only at the
  far tier (`shouldShowHoverLabel`), where the per-region markers aren't drawn.
- admin-1 region names carry a country prefix via `STATE_COUNTRY_LABEL` (build-time, in `regions.mjs`).

## Key files
- `src/config.js` — **the single home for all tuning/structure constants** (see "Tunable visual
  knobs"): geometry/camera (`GLOBE_RADIUS`, `ZOOM_MIN`/`ZOOM_MAX`, `TIER_FAR`/`TIER_NEAR`,
  `CAMERA_START_DIST`), dot style (`CATEGORY_STYLE`, `CATEGORY_FALLBACK`, `DOT_REF_DIST`,
  `FAR_FADE_FLOOR`), people overlay (`LABEL_REF_DIST`, `MARKER_MIN_COUNT`, `STATE_COUNTRY_LABEL`),
  highlight (`HIGHLIGHT_COLOR`, `HIGHLIGHT_OPACITY_BOOST`), interaction
  (`ROTATION_SPEED`, `RAYCAST_THRESHOLD`), build-time spacing/thinning (`DOT_SPACING`, `THINNING`,
  `REGION_PROBE_NUDGE_DEG`), `STATE_LEVEL`, and `SOURCES` (5 Natural Earth URLs: admin-0 countries
  50m, admin-1 states **10m**, admin-0 boundary_lines_land 50m, admin-1 lines **10m**, coastline
  50m). Read current values from the file.
- `src/geo.js` — `latLonToVector3`, `vector3ToScreen`, `angularDistanceDeg`.
- `src/globe.js` — `buildPointsGeometry` (position/color/aSize/aOpacity; `regionIndexMap` only for
  non-null regionId), `createPointsObject` (round-dot ShaderMaterial w/ `uRefDist` size attenuation;
  returns `{points,geometry,regionIndexMap,baseColors,baseOpacity}`).
- `src/highlight.js` — `buildHighlightSet`, `applyHighlights(geometry, regionIndexMap, baseColors,
  baseOpacity, set, colorHex, highlightOpacity)`.
- `src/controls.js` — `createControls` (OrbitControls; min/max distance; pan disabled).
- `src/labels.js` — `zoomTier`, `truncateList`, `labelScale`, `buildListHTML`,
  `shouldShowHoverLabel`, `createLabelLayer`, `createCursorLabel`. Builds the people overlay (see
  "People overlay" above) — collapsible per-region markers, world-anchored fade, NO collision cull.
  Names are HTML-escaped (`escapeHtml`).
- `src/theme.js` — `resolveTheme`, `THEMES` (dark/light), `createThemeController` (localStorage +
  `prefers-color-scheme` + CSS vars `--bg`/`--text`/`--dot`).
- `src/main.js` — scene/render-loop wiring (see conventions below).
- `scripts/lib/regions.mjs` — `buildRegions(countriesFC, statesFC) → {regions, features}`; admin-1
  names get a `STATE_COUNTRY_LABEL` country prefix.
- `scripts/lib/points.mjs` — `buildRegionIndex`, `assignRegion`, `assignRegionNudged`,
  `assignRegionsNudged` (all adjacent regions, for borders), `generateLandPoints`,
  `generateCoastPoints`, `generateBorderPoints(…, index, stepDeg)` (border dots get `regionIds`),
  `thinByHierarchy(coast, border, land, clearanceDeg, coastGapDeg, landClearanceDeg)` (priority cull + coast
  self-spacing, see Dot system), `generatePoints(features, coastlineFC, countryLinesFC, stateLinesFC)`.
  Point = `{lat,lon,category}` + `regionId` (coast/land) or `regionIds` (border). `ISO3_TO_ISO2` map
  (BRA/USA/CAN) filters state lines.
- `scripts/lib/reference.mjs` — `buildIsoReference` → `iso-reference.md`.
- `scripts/preprocess.mjs` — orchestrator (writes regions.json, points.json, iso-reference.md;
  **no borders.json** in v2).
- `data/highlights.json` — AUTHOR-EDITED, committed, `{ regionId: [names] }`.
- `public/data/` & `scripts/geo-src/` — GENERATED, gitignored.
- `test/` — geo, regions, points, highlight, labels, labels.cursor, labels.lifecycle, theme,
  globe.buildgeom, data-validation.

## Conventions & gotchas (don't relearn these the hard way)
- **No top-level `await` in `src/main.js`** — Vite's es2020 target rejects it. Do async work
  inside `loadGlobe()` and call it as `loadGlobe().catch(...)`. Module-scoped refs
  (`globe`, `loadedPoints`, `highlightSet`, …) are declared BEFORE the theme controller (which
  fires `onChange` synchronously) to avoid a TDZ crash.
- **`data/highlights.json` lives at repo ROOT** (committed) and is imported as a module — NOT
  under the gitignored `public/data/`.
- **admin-1 must be 10m**: the 50m admin-1 set omits subdivisions for most countries. admin-0 +
  coastline stay 50m (lighter). State-line features key parent country on `ADM0_A3` (3-letter,
  e.g. `BRA`) — use the `ISO3_TO_ISO2` map, not `.slice(0,2)`.
- **Fresh checkout**: `public/data/` and `scripts/geo-src/` are gitignored, so `npm run fetch-geo`
  + `npm run data` must run before `npm run build` (build = `data && vite build`).
- Auto-rotation spins the `root` group (not the camera) at a slow constant rate (the literal is in
  `src/main.js`); it pauses ONLY while the left mouse button is held (`leftDown` flag), not on zoom.
  Per frame, main.js updates the shader uniform `uCamDist = camera.position.length()`.

## Commands
`npm run dev` · `npm run build` (= `npm run data && vite build`) · `npm run preview` ·
`npm run fetch-geo` · `npm run data` · `npm test` (Vitest).

## Tunable visual knobs (names + locations only — values live in the code)
**ALL tunable constants live in `src/config.js`** (imported by both the browser runtime and the
build-time scripts). Below: the config export → where it's consumed.
- **Dot size & opacity** per category — `CATEGORY_STYLE` (+ `CATEGORY_FALLBACK`); consumed in
  `src/globe.js`. Runtime (hot-reloads in `npm run dev`).
- **Dot spacing** per category — `DOT_SPACING` ({coast,land,border}); consumed in `generatePoints`
  (`scripts/lib/points.mjs`). **Build-time — re-run `npm run data`** (baked into `points.json`).
- **Hierarchy thinning** — `THINNING.clearanceDeg` (border vs kept coast), `THINNING.landClearanceDeg`
  (land vs kept coast/border; lower = land packs closer), and `THINNING.coastGapDeg` (coast
  self-spacing / non-overlap; also the de-facto coast-density knob); consumed by `thinByHierarchy`
  in `generatePoints`. Bigger = more aggressive removal. **Build-time — re-run `npm run data`.**
- **Region probe nudge** — `REGION_PROBE_NUDGE_DEG`; consumed by `assignRegion*Nudged`
  (`scripts/lib/points.mjs`). **Build-time.**
- **Detached territories** — `TERRITORY_REGIONS` (list of ISO 3166-2 codes carved into their own
  region); consumed by `buildRegions` (`scripts/lib/regions.mjs`). **Build-time — re-run `npm run data`.**
- **Dot size attenuation** (world-anchored growth on zoom) — `DOT_REF_DIST` → `uRefDist` uniform
  (`src/globe.js`); lower = smaller dots overall. Formula `gl_PointSize = aSize*uPixelRatio*(uRefDist/-mv.z)`.
- **Far-hemisphere fade** — `FAR_FADE_FLOOR` → the `mix(...)` floor in the fragment shader
  (`src/globe.js`).
- **Highlight color & opacity boost** — `HIGHLIGHT_COLOR` + `HIGHLIGHT_OPACITY_BOOST` (consumed via
  `applyHighlights` in `src/main.js`).
- **Camera start / rotation speed / raycaster threshold** — `CAMERA_START_DIST`, `ROTATION_SPEED`,
  `RAYCAST_THRESHOLD`; consumed in `src/main.js` (`CAMERA_START_DIST` also seeds `uCamDist`).
- **Zoom limits / label tiers** — `ZOOM_MIN`/`ZOOM_MAX`, `TIER_FAR`/`TIER_NEAR`.

## Status
v1 (14-country, square contour/fill dots, border lines) shipped, then revised to **v2** (this doc):
3 state-level countries (BR/US/CA), round 3-category dots, no border lines, slower drag-pause
rotation, renamed Lanaforge Atlas. Visual fine-tuning with the author is ongoing — treat the knobs above as
adjustable. Process notes & per-task history live in `.superpowers/sdd/progress.md` (gitignored scratch).
