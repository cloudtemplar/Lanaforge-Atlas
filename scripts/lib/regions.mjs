import { geoCentroid, geoArea, geoContains } from 'd3-geo';
import { STATE_LEVEL, STATE_COUNTRY_LABEL, TERRITORY_REGIONS } from '../../src/config.js';

const iso2 = (p) => p.ISO_A2_EH || p.ISO_A2 || p.iso_a2_eh || p.iso_a2 || '';
const countryName = (p) => p.NAME || p.ADMIN || p.name || '';

// A polygon's TRUE area (steradians), winding-independent: a ring wound the "wrong" way
// is read by d3 as the sphere's complement (area > 2π), so fold it back.
function polyTrueArea(polygon) {
  const a = geoArea({ type: 'Polygon', coordinates: [polygon[0]] });
  return a > 2 * Math.PI ? 4 * Math.PI - a : a;
}

// Winding-safe total area (steradians) of a Polygon/MultiPolygon.
function geometryArea(geometry) {
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates
    : geometry.type === 'Polygon' ? [geometry.coordinates]
    : [];
  return polys.reduce((sum, poly) => sum + polyTrueArea(poly), 0);
}

// Same polygon with its exterior ring normalized to CCW winding, so geoCentroid reads
// the small interior (not the antipodal complement). Mirrors normalizeExteriorRing in
// scripts/lib/points.mjs.
function ccwPolygon(polygon) {
  const ext = polygon[0];
  const exterior = geoArea({ type: 'Polygon', coordinates: [ext] }) > 2 * Math.PI ? [...ext].reverse() : ext;
  return { type: 'Polygon', coordinates: [exterior, ...polygon.slice(1)] };
}

// Winding-safe point-in-geometry test for a Polygon/MultiPolygon (each ring normalized
// to CCW so geoContains reads the interior, not the sphere's complement).
function geomContains(geometry, point) {
  if (geometry.type === 'Polygon') return geoContains(ccwPolygon(geometry.coordinates), point);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some((poly) => geoContains(ccwPolygon(poly), point));
  return geoContains(geometry, point);
}

// Remove from a country's geometry every sub-polygon that lies inside one of its carved
// territories. The country's 50m polygon(s) for a detached territory are the SAME landmass
// as the 10m territory feature, so dropping them stops the parent from claiming the
// territory's dots ANYWHERE — interior, the coast sliver where the 50m/10m boundaries
// disagree, and the border seam (where the collect-all `assignRegionsNudged` would
// otherwise still find the parent). Each parent sub-polygon is matched by its OWN centroid
// falling within a territory's geometry, so a scattered archipelago (Azores, Canaries) —
// many parent polygons against one multi-island territory — is fully carved, not just the
// one polygon nearest the territory centroid. Mainland polygons sit outside every territory
// and are untouched. Only MultiPolygon parents have detached parts to cut.
function subtractTerritories(geometry, territoryGeometries) {
  if (geometry.type !== 'MultiPolygon') return geometry;
  const kept = geometry.coordinates.filter((poly) => {
    const centroid = geoCentroid(ccwPolygon(poly));
    return !territoryGeometries.some((tg) => geomContains(tg, centroid));
  });
  return { type: 'MultiPolygon', coordinates: kept };
}

// Centroid of a region's MAIN landmass. For a MultiPolygon, that's the largest polygon
// by area; for a Polygon, the whole thing. Used for country labels so a country's far
// detached parts (e.g. France's overseas territories) don't drag the area-weighted
// whole-geometry centroid out into the ocean.
function mainlandCentroid(geometry) {
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates
    : geometry.type === 'Polygon' ? [geometry.coordinates]
    : null;
  if (!polys) return geoCentroid({ type: 'Feature', geometry });
  let best = null, bestArea = -Infinity;
  for (const polygon of polys) {
    const area = polyTrueArea(polygon);
    if (area > bestArea) { bestArea = area; best = polygon; }
  }
  return geoCentroid(ccwPolygon(best));
}

export function buildRegions(countriesFC, statesFC) {
  const regions = [];
  const countryFeatures = [];
  const stateFeatures = [];
  const territoryFeatures = [];

  const territorySet = new Set(TERRITORY_REGIONS);
  const countryNameById = new Map(); // code -> display name, for prefixing sub-region names
  const territoryGeomsByParent = new Map(); // parent code -> [territory geometry, ...]

  // One admin-0 feature per ISO code: keep the largest by area. A few Natural Earth
  // features share a code (AU = Australia + Indian Ocean Ter. + Ashmore and Cartier Is.);
  // the largest IS the country, the rest are tiny detached dependencies we drop entirely.
  const bestByCode = new Map();
  for (const f of countriesFC.features) {
    const code = iso2(f.properties).toUpperCase();
    if (!code || code === '-99') continue;
    const area = geometryArea(f.geometry);
    const prev = bestByCode.get(code);
    if (!prev || area > prev.area) bestByCode.set(code, { feature: f, area });
  }

  // Non-state-level countries -> admin-0 region.
  for (const { feature: f } of bestByCode.values()) {
    const code = iso2(f.properties).toUpperCase();
    const name = countryName(f.properties);
    countryNameById.set(code, name);
    if (STATE_LEVEL.includes(code)) continue;
    const [lon, lat] = mainlandCentroid(f.geometry);
    regions.push({ id: code, name, centroid: { lat, lon } });
    countryFeatures.push({ id: code, geometry: f.geometry });
  }

  // admin-1 features: full split for STATE_LEVEL countries, plus the explicitly listed
  // detached territories of other countries.
  for (const f of statesFC.features) {
    const code = (f.properties.iso_3166_2 || '').toUpperCase();
    if (!code) continue;
    const parent = code.slice(0, 2);
    if (parent === code) continue;

    const addSub = (bucket) => {
      const [lon, lat] = geoCentroid(f);
      const prefix = STATE_COUNTRY_LABEL[parent] || countryNameById.get(parent) || parent;
      const subName = f.properties.name || code;
      regions.push({ id: code, name: `${prefix} - ${subName}`, centroid: { lat, lon } });
      bucket.push({ id: code, geometry: f.geometry });
    };

    if (STATE_LEVEL.includes(parent)) addSub(stateFeatures);
    else if (territorySet.has(code)) {
      addSub(territoryFeatures);
      if (!territoryGeomsByParent.has(parent)) territoryGeomsByParent.set(parent, []);
      territoryGeomsByParent.get(parent).push(f.geometry);
    }
  }

  // Cut each carved territory's landmass out of its parent country's geometry so the
  // parent stops claiming the territory's dots at every leak path (see subtractTerritories).
  for (const cf of countryFeatures) {
    const geoms = territoryGeomsByParent.get(cf.id);
    if (geoms) cf.geometry = subtractTerritories(cf.geometry, geoms);
  }

  // Territory features FIRST: assignRegion is first-match-wins, so any point the 10m
  // territory polygon covers beyond the parent's now-cut boundary still resolves to the
  // territory id rather than a neighbouring country.
  const features = [...territoryFeatures, ...countryFeatures, ...stateFeatures];
  return { regions, features };
}
