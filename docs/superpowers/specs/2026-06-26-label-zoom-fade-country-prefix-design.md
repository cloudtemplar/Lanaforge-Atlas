# Label zoom-scaling, fade transitions & state country-prefix — design

Date: 2026-06-26
Status: approved design, pending spec review

## Goal

Three UX refinements to the people-list labels (and one follow-on), all on the HTML/CSS
overlay layer + one build-time data change:

1. **Fade-in / fade-out** of the people-list labels on every show/hide transition
   (instead of the current hard `display:none`/`block` pop), mirroring how the dots fade.
2. **World-anchored size growth**: the list grows progressively as the camera zooms in,
   proportional to the globe (same semantics as the dots' size attenuation), with **no
   min/max clamp** (author chose "100% world-anchored").
3. **Country prefix on state names**: state-level regions read `Brazil - São Paulo`,
   `US - California`, `Canada - Ontario`.
4. **Auto-collapse `+N more`**: an expanded list collapses back to top-5 once it disappears
   (zoom-out / collision-cull / limb-cull), so it never stays stuck open.

## Non-goals

- No change to the dot rendering, tier thresholds, or collision-cull algorithm itself.
- No new label content; only formatting, sizing, opacity, and expand-state lifecycle.

---

## Part 1 — Country prefix on state names (BUILD-TIME)

**Where:** `src/config.js` + `scripts/lib/regions.mjs`. Baked into `regions.json` →
**requires `npm run data`**.

- New config export:
  ```js
  // Short country label prefixed onto admin-1 region names (e.g. "Brazil - São Paulo").
  export const STATE_COUNTRY_LABEL = { BR: 'Brazil', US: 'US', CA: 'Canada' };
  ```
- In `buildRegions`, the admin-1 branch sets:
  ```js
  const prefix = STATE_COUNTRY_LABEL[parent] || parent;
  const stateName = f.properties.name || code;
  regions.push({ id: code, name: `${prefix} - ${stateName}`, centroid: { lat, lon } });
  ```
- Separator is `" - "` (space-hyphen-space).
- Because `name` flows through `idToName` everywhere, both the people-list `region-name`
  row **and** the hover cursor pill inherit the prefix automatically (pill upper-cases it →
  `BRAZIL - SÃO PAULO`, which is fine).

**Tests (`test/regions.test.js`):** add assertion that the `US-CA` region's `name` is
`'US - California'`; non-state-level country names (e.g. `PT`) are unchanged.

---

## Part 2 — World-anchored label size (RUNTIME)

**Where:** `src/config.js` + `src/labels.js` (+ CSS base font). Runtime, hot-reloads.

- New config exports (tunable knobs, values live in code):
  ```js
  // Reference camera-depth for label size attenuation: scale = LABEL_REF_DIST / viewDepth.
  // Same semantics as DOT_REF_DIST for dots. No clamp (size tracks the globe directly).
  export const LABEL_REF_DIST = <sensible default, ≈ TIER_NEAR..1.6>;
  ```
  (Base font size stays in CSS as today; the scale multiplies it.)
- New pure, exported helper for testability:
  ```js
  export function labelScale(viewDepth, refDist) { return refDist / viewDepth; }
  ```
- In `update()`, for each on-screen region we already compute its world centroid. Transform
  it to view space (`world.clone().applyMatrix4(camera.matrixWorldInverse)`) and take
  `viewDepth = -viewPos.z`. This matches the dot shader, which scales by `uRefDist / -mv.z`.
- Apply the scale to the whole list block via transform (uniform, GPU-friendly):
  ```js
  el.style.transform = `translate(-50%, -50%) scale(${labelScale(depth, LABEL_REF_DIST)})`;
  ```
  This replaces the current fixed `translate(-50%, -50%)`.
- **Collision boxes scale too:** the candidate `w`/`h` are multiplied by the same per-region
  scale so the medium-tier cull stays correct as labels grow. (Near tier shows all, so cull
  is moot there, but keep it consistent.)

**Tests (`test/labels.test.js`):** unit-test `labelScale` (e.g. `labelScale(1.4, 1.4) === 1`,
larger depth → smaller, smaller depth → larger).

---

## Part 3 — Fade-in / fade-out (RUNTIME)

**Where:** `src/style.css` + `src/labels.js`.

- CSS:
  ```css
  .people-list {
    opacity: 0;
    transition: opacity <~200ms> ease;
    pointer-events: none;
  }
  .people-list.visible { opacity: 1; pointer-events: auto; }
  ```
  (Existing `.people-list` rules merge in; the `.more` button still works because the
  visible list re-enables `pointer-events`.)
- In `labels.js update()`:
  - Far tier / culled / limb-culled / off-screen → `el.classList.remove('visible')`
    (instead of `el.style.display = 'none'`). The element stays in the DOM and fades out
    in place at its last position.
  - Shown → `el.classList.add('visible')`, set `left`/`top`/`transform` as today.
  - Remove all `el.style.display = ...` assignments.
- Fade duration is a CSS knob (single value); covers tier far→medium transitions, collision
  cull, and limb cull uniformly.

**Note on transitions:** because hidden elements keep their last `left`/`top`, a label fades
out where it was, not at a jumped position. Position only updates while shown.

---

## Part 4 — Auto-collapse expanded list on hide (RUNTIME)

**Where:** `src/labels.js`.

- Problem today: clicking `+N more` rewrites the `ul` and removes the button; `builtSet`
  then prevents any rebuild, so the list is stuck expanded forever.
- Fix: in the **hide branch** of `update()` (the path that now removes `.visible`), also
  `builtSet.delete(r.id)`. This is idempotent and cheap (no DOM work while hidden — building
  only happens in the show branch).
- Consequence: while a list is visible it stays expanded (the user is looking at it); once
  it disappears, the next time it re-enters the viewport `builtSet` misses → it rebuilds in
  the **collapsed** state (top-5 + `+N more`). No mid-fade content flip, because the rebuild
  happens on re-entry, not during fade-out.

**Tests:** the expand/collapse lifecycle is DOM/camera-driven and hard to unit-test in
isolation; covered by the existing structure + manual verification. (`buildListHTML` and
`truncateList` are already unit-tested.)

---

## Files touched

| File | Change | When |
|------|--------|------|
| `src/config.js` | add `STATE_COUNTRY_LABEL`, `LABEL_REF_DIST` | — |
| `scripts/lib/regions.mjs` | prefix admin-1 names | build-time |
| `src/labels.js` | `labelScale` export; view-depth scale; transform; scaled cull boxes; `.visible` toggle; `builtSet.delete` on hide | runtime |
| `src/style.css` | `.people-list` opacity/transition/pointer-events + `.visible` | runtime |
| `test/regions.test.js` | assert `US-CA` name `'US - California'` | — |
| `test/labels.test.js` | unit-test `labelScale` | — |

## Build / verify

- `npm run data` (regenerate `regions.json` with prefixed names) — needs `scripts/geo-src/`
  present (`npm run fetch-geo` first if missing).
- `npm test` (regions + labels unit tests).
- Manual: `npm run dev` — zoom in/out to confirm fade, growth tracking the globe, prefixed
  state names in list + hover pill, and `+N more` collapsing after zoom-out.

## Tuning knobs added (values in code, per project convention)

- `LABEL_REF_DIST` (`src/config.js`) — label size attenuation reference depth.
- Fade duration — the `transition` ms in `.people-list` (`src/style.css`).
- `STATE_COUNTRY_LABEL` (`src/config.js`) — the 3 country prefixes + separator (in regions.mjs).
