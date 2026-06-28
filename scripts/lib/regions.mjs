import { geoCentroid, geoArea } from 'd3-geo';
import { STATE_LEVEL, STATE_COUNTRY_LABEL, TERRITORY_REGIONS } from '../../src/config.js';

const iso2 = (p) => p.ISO_A2_EH || p.ISO_A2 || p.iso_a2_eh || p.iso_a2 || '';
const countryName = (p) => p.NAME || p.ADMIN || p.name || '';

// A polygon's TRUE area (steradians), winding-independent: a ring wound the "wrong" way
// is read by d3 as the sphere's complement (area > 2π), so fold it back.
function polyTrueArea(polygon) {
  const a = geoArea({ type: 'Polygon', coordinates: [polygon[0]] });
  return a > 2 * Math.PI ? 4 * Math.PI - a : a;
}

// Same polygon with its exterior ring normalized to CCW winding, so geoCentroid reads
// the small interior (not the antipodal complement). Mirrors normalizeExteriorRing in
// scripts/lib/points.mjs.
function ccwPolygon(polygon) {
  const ext = polygon[0];
  const exterior = geoArea({ type: 'Polygon', coordinates: [ext] }) > 2 * Math.PI ? [...ext].reverse() : ext;
  return { type: 'Polygon', coordinates: [exterior, ...polygon.slice(1)] };
}

// Centroid of a region's MAIN landmass. For a MultiPolygon, that's the largest polygon
// by area; for a Polygon, the whole thing. Used for country labels so a country's far
// detached parts (e.g. France's overseas territories) don't drag the area-weighted
// whole-geometry centroid out into the ocean.
function mainlandCentroid(geometry) {
  if (geometry.type !== 'MultiPolygon' || geometry.coordinates.length < 2) {
    return geoCentroid({ type: 'Feature', geometry });
  }
  let best = null, bestArea = -Infinity;
  for (const polygon of geometry.coordinates) {
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

  // Non-state-level countries -> admin-0 region.
  for (const f of countriesFC.features) {
    const code = iso2(f.properties).toUpperCase();
    if (!code || code === '-99') continue;
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
    else if (territorySet.has(code)) addSub(territoryFeatures);
  }

  // Territory features FIRST: assignRegion is first-match-wins, so a point inside a
  // territory resolves to the territory id before the parent country's admin-0 polygon
  // (which still nominally contains the island) can claim it.
  const features = [...territoryFeatures, ...countryFeatures, ...stateFeatures];
  return { regions, features };
}
