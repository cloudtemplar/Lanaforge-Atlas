# Lanaforge Atlas — project context for Claude

Minimalist single-page **transparent dot-matrix 3D globe** highlighting the world regions where the
author met people.

> **The code is the source of truth.** This doc explains *structure, intent, and where things live* —
> NOT current values. Visual tuning numbers (sizes, opacities, spacings, colors, zoom limits, speed,
> thresholds, fade) change often: **always read them from the named constant in the file.** This doc
> names the knob and its file; it never quotes the value. A literal tuning value written here is stale —
> delete it.

## Stack
Vite 5 · vanilla JS (ES modules) · three.js `^0.160` · d3-geo `^3` (build-time only) · Vitest (+ jsdom).
**Node ≥ 18** (build uses global `fetch`).

## Architecture & data flow
- **Build** (`scripts/`, Node): downloads Natural Earth GeoJSON → generates static JSON. **ALL
  point-in-polygon happens at build time**; the browser only renders precomputed data.
- **Runtime** (`src/`, browser): fetches the JSON, renders the three.js dot globe + an HTML/CSS label overlay.
- Flow: `npm run fetch-geo` → `scripts/geo-src/*.geojson` (gitignored) → `npm run data`
  (`scripts/preprocess.mjs`) → `public/data/{regions,points}.json` (gitignored) + `iso-reference.md` →
  browser fetches them. Author data `data/highlights.json` is a **static import**, not fetched.

## Region model
Region ids are **ISO 3166**: country = alpha-2 (`JP`,`FR`,`PT`); sub-region = ISO 3166-2 (`BR-SP`,`US-CA`).
Only **3 countries** are state-level (admin-1): `STATE_LEVEL = ['BR','US','CA']` (`src/config.js`); every
other country is whole-country admin-0. `iso-reference.md` (generated) lists valid ids.
- When several admin-0 features share one ISO code (e.g. `AU`), `buildRegions` keeps only the **largest
  by area** and drops the tiny dependencies, so each id maps to exactly one region.
- Every region is guaranteed highlightable: `ensureRegionDots` (build-time, after thinning) appends one
  centroid dot for any region too small for the grid to land on (Vatican, Monaco, Saba…).
- **Detached territories** (`TERRITORY_REGIONS` in `src/config.js`: Azores, Madeira, Canaries, French
  overseas, Dutch Caribbean) are carved into their own ISO 3166-2 region so highlighting e.g. `PT` lights
  only the mainland. `buildRegions` emits each from the 10m states layer, then `subtractTerritories`
  (`scripts/lib/regions.mjs`) **cuts the territory's landmass out of the parent**: any parent admin-0
  sub-polygon whose centroid falls inside a carved territory is dropped (so scattered archipelagos are
  fully removed, not just the nearest polygon) — stops the parent claiming territory dots on every path
  (interior, coast sliver, border seam). Parent label centroid is unaffected (`mainlandCentroid` keys on
  the largest polygon). Territory features are ordered FIRST so `assignRegion` (first-match) resolves
  border points to the territory, not a neighbour.

## Dot system (v2 — current design)
Spec: `docs/superpowers/specs/2026-06-25-lanaforge-atlas-dot-style.md`. **Round** dots (custom
`THREE.ShaderMaterial`, per-vertex `aSize`/`aOpacity`, round-discard + depth fade in fragment). **No
border lines — borders are dots.** Three categories (each point tagged `category`); per-category
size/opacity in `CATEGORY_STYLE` (consumed in `src/globe.js`), spacing in `DOT_SPACING` (consumed by
`generatePoints` in `scripts/lib/points.mjs`):
- **coast** — coastline outline; biggest/strongest; densely traced (`coastline` source).
- **land** — uniform interior grid; small and faint (point-in-polygon).
- **border** — intra-continental + the 3 state-level countries' state borders; sized like land but more
  opaque and **denser** (reads as a seam, e.g. US/Canada). Each border dot carries `regionIds` (ALL
  adjacent regions, via `assignRegionsNudged`) so highlighting either neighbour lights the whole seam.
  (coast/land carry a single `regionId`.)

After generation, `thinByHierarchy` (`scripts/lib/points.mjs`) culls by priority **coast > border > land**:
a lower-priority dot within a great-circle clearance of a kept higher-priority dot is dropped (stops
pile-up, e.g. Japan). Clearances: `clearanceDeg` (border vs kept coast), `landClearanceDeg` (land vs kept
coast/border; lower = land packs tighter), `coastGapDeg` (coast self-spacing — the de-facto coast-density
knob). border/land not self-thinned. All islands kept. Thinning is build-time (`npm run data`).
Dots are **world-anchored** (size attenuation via `uRefDist` in `src/globe.js`) so they grow on zoom-in.
**Highlight** (author's choice "B"): a region's own dots switch to `HIGHLIGHT_COLOR` AND each dot's base
opacity is multiplied by a boost (clamped to 1; the opacity-boost arg of `applyHighlights`), reading over
the faint base while keeping the coast>border>land hierarchy. Highlight color is constant across themes.

## People overlay (labels)
HTML/CSS overlay (`src/labels.js` + `src/style.css`) listing people met per highlighted region, gated by
`zoomTier`:
- **Every** region is a collapsed **marker**: header = country name + people **count** (left of a caret),
  no person icon. Click the **header only** (the sole click target) to expand to country + top-5 names +
  "+N more"; click again to collapse. The names list is NOT clickable (only its "+N more" button). No
  minimum-count threshold. Markers expand independently; auto-reset to collapsed when the label fades on
  zoom-out.
- Labels **fade in/out**, **world-anchored** (`labelScale(viewDepth, LABEL_REF_DIST)`, same semantics as
  dots' `uRefDist`). **No collision culling** — only far-limb + off-screen culls.
- Hover **cursor pill** (`createCursorLabel`) shows a region name under the pointer, but only at the far
  tier (`shouldShowHoverLabel`) where markers aren't drawn.
- admin-1 names carry a country prefix via `STATE_COUNTRY_LABEL` (build-time, `regions.mjs`).

## Key files
- `src/config.js` — **single home for all tuning/structure constants** (see Knobs table). Includes
  `SOURCES` (5 Natural Earth URLs: admin-0 countries 50m, admin-1 states **10m**, admin-0
  boundary_lines_land 50m, admin-1 lines **10m**, coastline 50m) and `STATE_LEVEL`.
- `src/geo.js` — `latLonToVector3`, `vector3ToScreen`, `angularDistanceDeg`.
- `src/globe.js` — `buildPointsGeometry` (`regionIndexMap` only for non-null regionId), `createPointsObject`
  (round-dot ShaderMaterial w/ `uRefDist`; returns `{points,geometry,regionIndexMap,baseColors,baseOpacity}`).
- `src/highlight.js` — `buildHighlightSet`, `applyHighlights(geometry, regionIndexMap, baseColors,
  baseOpacity, set, colorHex, highlightOpacity)`.
- `src/controls.js` — `createControls` (OrbitControls; min/max distance; pan disabled).
- `src/labels.js` — `zoomTier`, `truncateList`, `labelScale`, `buildListHTML`, `shouldShowHoverLabel`,
  `createLabelLayer`, `createCursorLabel`. Names HTML-escaped (`escapeHtml`).
- `src/theme.js` — `resolveTheme`, `THEMES` (dark/light), `createThemeController` (localStorage +
  `prefers-color-scheme` + CSS vars `--bg`/`--text`/`--dot`).
- `src/main.js` — scene/render-loop wiring (see Conventions).
- `scripts/lib/regions.mjs` — `buildRegions(countriesFC, statesFC) → {regions, features}`; admin-1 names get
  a `STATE_COUNTRY_LABEL` prefix; `subtractTerritories`.
- `scripts/lib/points.mjs` — `buildRegionIndex`, `assignRegion`, `assignRegionNudged`, `assignRegionsNudged`
  (all adjacent regions, for borders), `generateLandPoints`, `generateCoastPoints`, `generateBorderPoints`,
  `thinByHierarchy(coast, border, land, clearanceDeg, coastGapDeg, landClearanceDeg)`, `generatePoints(features,
  coastlineFC, countryLinesFC, stateLinesFC)`, `ensureRegionDots(points, regions)`. Point =
  `{lat,lon,category}` + `regionId` (coast/land) or `regionIds` (border). `ISO3_TO_ISO2` (BRA/USA/CAN)
  filters state lines.
- `scripts/lib/reference.mjs` — `buildIsoReference` → `iso-reference.md`.
- `scripts/preprocess.mjs` — orchestrator (writes regions.json, points.json, iso-reference.md; **no
  borders.json** in v2). Wraps `generatePoints` in `ensureRegionDots`.
- `data/highlights.json` — AUTHOR-EDITED, committed, `{ regionId: [names] }`.
- `public/data/` & `scripts/geo-src/` — GENERATED, gitignored.
- `test/` — geo, regions, points, highlight, labels, labels.cursor, labels.lifecycle, theme,
  globe.buildgeom, data-validation.

## Conventions & gotchas
- **No top-level `await` in `src/main.js`** (Vite es2020 rejects it): do async work in `loadGlobe()`,
  call as `loadGlobe().catch(...)`. Module-scoped refs (`globe`, `loadedPoints`, `highlightSet`…) are
  declared BEFORE the theme controller (which fires `onChange` synchronously) to avoid a TDZ crash.
- **`data/highlights.json` lives at repo ROOT** (committed), imported as a module — NOT under gitignored
  `public/data/`.
- **admin-1 must be 10m** (the 50m set omits most subdivisions); admin-0 + coastline stay 50m. State-line
  features key parent country on `ADM0_A3` (3-letter) — use `ISO3_TO_ISO2`, not `.slice(0,2)`.
- **Fresh checkout**: `public/data/` + `scripts/geo-src/` are gitignored, so `npm run fetch-geo` + `npm run
  data` must run before `npm run build` (build = `data && vite build`).
- Auto-rotation spins the `root` group (not the camera) at a slow constant rate (literal in `src/main.js`);
  pauses ONLY while the left mouse button is held (`leftDown`), not on zoom. Per frame main.js sets uniform
  `uCamDist = camera.position.length()`.

## Commands
`npm run dev` · `npm run build` (= `npm run data && vite build`) · `npm run preview` · `npm run fetch-geo` ·
`npm run data` · `npm test` (Vitest).

## Tunable knobs (names + locations only — values live in code)
All constants in `src/config.js` (imported by runtime + build scripts). **Runtime** = hot-reloads in
`npm run dev`; **Build** = re-run `npm run data`.

| Knob | Constant | Consumed in | When |
|---|---|---|---|
| Dot size/opacity per category | `CATEGORY_STYLE` (+ `CATEGORY_FALLBACK`) | `src/globe.js` | Runtime |
| Dot size attenuation (zoom growth) | `DOT_REF_DIST` → `uRefDist` uniform (`gl_PointSize = aSize*uPixelRatio*(uRefDist/-mv.z)`) | `src/globe.js` | Runtime |
| Far-hemisphere fade | `FAR_FADE_FLOOR` → fragment `mix()` floor | `src/globe.js` | Runtime |
| Highlight color & opacity boost | `HIGHLIGHT_COLOR`, `HIGHLIGHT_OPACITY_BOOST` | `applyHighlights` (`src/main.js`) | Runtime |
| Camera start / rotation / raycast | `CAMERA_START_DIST` (also seeds `uCamDist`), `ROTATION_SPEED`, `RAYCAST_THRESHOLD` | `src/main.js` | Runtime |
| Zoom limits / label tiers | `ZOOM_MIN`/`ZOOM_MAX`, `TIER_FAR`/`TIER_NEAR` | runtime | Runtime |
| Label world-anchor | `LABEL_REF_DIST` | `src/labels.js` | Runtime |
| Dot spacing per category | `DOT_SPACING` {coast,land,border} | `generatePoints` (`points.mjs`) | Build |
| Hierarchy thinning | `THINNING.clearanceDeg` / `.landClearanceDeg` (lower = land tighter) / `.coastGapDeg` (coast density) | `thinByHierarchy` | Build |
| Region probe nudge | `REGION_PROBE_NUDGE_DEG` | `assignRegion*Nudged` (`points.mjs`) | Build |
| Detached territories | `TERRITORY_REGIONS` | `buildRegions` (`regions.mjs`) | Build |

## Status
v1 (14-country, square dots, border lines) shipped, then revised to **v2** (this doc): 3 state-level
countries (BR/US/CA), round 3-category dots, no border lines, drag-pause rotation, renamed Lanaforge
Atlas. Visual fine-tuning is ongoing — treat knobs as adjustable. Process notes & per-task history live in
`.superpowers/sdd/progress.md` (gitignored scratch).
