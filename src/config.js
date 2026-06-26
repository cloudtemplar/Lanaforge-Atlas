// ── Globe geometry & camera limits ──────────────────────────────────────────
export const GLOBE_RADIUS = 1;
export const ZOOM_MIN = 1.15;
export const ZOOM_MAX = 2.6;
export const TIER_FAR = 2.0;   // camera distance > TIER_FAR => "far"
export const TIER_NEAR = 1.4;  // camera distance < TIER_NEAR => "near"

// Initial camera distance (camera.position.z + uCamDist seed). Consumed in src/main.js.
export const CAMERA_START_DIST = 2.4;

// ── Region model ─────────────────────────────────────────────────────────────
// Countries represented ONLY by admin-1 sub-regions (their admin-0 polygon is excluded).
export const STATE_LEVEL = ['BR', 'US', 'CA'];
// Short country label prefixed onto admin-1 region names, e.g. "Brazil - São Paulo".
// (BUILD-TIME; consumed by buildRegions in scripts/lib/regions.mjs. Re-run `npm run data`.)
export const STATE_COUNTRY_LABEL = { BR: 'Brazil', US: 'US', CA: 'Canada' };

// ── Dot visual style (RUNTIME; consumed in src/globe.js) ─────────────────────
// CSS-px size + base opacity per category. coast = biggest/strongest, land =
// small/faint, border = land-sized but a touch more opaque (reads as a seam).
export const CATEGORY_STYLE = {
  coast:  { size: 5.0, opacity: 0.70 },
  land:   { size: 3.3, opacity: 0.25 },
  border: { size: 4.2, opacity: 0.60 },
};
// Style for any point whose category is unrecognised.
export const CATEGORY_FALLBACK = { size: 3.3, opacity: 0.35 };

// World-anchored size attenuation: gl_PointSize = aSize*pixelRatio*(DOT_REF_DIST/-mv.z).
// Lower = smaller dots overall. (src/globe.js uRefDist uniform.)
export const DOT_REF_DIST = 1.4;

// Far-hemisphere fade: alpha floor for the back side of the globe (fragment-shader
// mix() floor in src/globe.js). 0 = back fully transparent, 1 = no fade.
export const FAR_FADE_FLOOR = 0.25;

// World-anchored people-list label size: scale = LABEL_REF_DIST / viewDepth (same
// semantics as DOT_REF_DIST for dots; consumed via labelScale in src/labels.js).
// No clamp — labels grow/shrink with the globe. Higher = larger labels overall.
export const LABEL_REF_DIST = 1.5;

// ── Highlight (RUNTIME; src/highlight.js via src/main.js) ────────────────────
// A highlighted region's dots switch to this color (constant across themes).
export const HIGHLIGHT_COLOR = '#ff5a1f';
// Multiplier on a highlighted dot's base opacity (clamped to 1) so the orange
// reads over the faint base while keeping the coast > border > land hierarchy.
export const HIGHLIGHT_OPACITY_BOOST = 1.7;

// ── Interaction (RUNTIME; src/main.js) ───────────────────────────────────────
export const ROTATION_SPEED = 0.00015;   // auto-rotation rad/frame (root.rotation.y)
export const RAYCAST_THRESHOLD = 0.012;  // Points raycaster hover threshold

// ── Dot spacing & thinning (BUILD-TIME; scripts/lib/points.mjs) ──────────────
// These are baked into points.json — re-run `npm run data` after changing them.
// Generation spacing (great-circle degrees) per category.
export const DOT_SPACING = {
  coast: 0.2,    // fine sampling; final coast spacing is set by THINNING.coastGapDeg
  land: 1.1,
  border: 0.65,
};
// Hierarchy thinning radii (great-circle degrees). See thinByHierarchy.
export const THINNING = {
  clearanceDeg: 0.6,  // how far border/land must stay from a kept higher-priority dot
  coastGapDeg: 0.4,   // min coast-to-coast separation (de-facto coast density knob)
};
// Probe nudge for region assignment on/near boundaries (assignRegion*Nudged).
export const REGION_PROBE_NUDGE_DEG = 0.08;

// ── Natural Earth sources (BUILD-TIME) ───────────────────────────────────────
const RAW = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
// admin-0 (countries/boundary lines) at 50m: light and complete for all ~240 countries.
// admin-1 (states/state lines) at 10m: used for the 3 state-level countries (BR/US/CA).
export const SOURCES = {
  countries:   `${RAW}/ne_50m_admin_0_countries.geojson`,
  states:      `${RAW}/ne_10m_admin_1_states_provinces.geojson`,
  countryLines:`${RAW}/ne_50m_admin_0_boundary_lines_land.geojson`,
  stateLines:  `${RAW}/ne_10m_admin_1_states_provinces_lines.geojson`,
  coastline:   `${RAW}/ne_50m_coastline.geojson`,
};
