import { geoContains, geoArea } from 'd3-geo';
import { STATE_LEVEL } from '../../src/config.js';

// alpha-3 -> alpha-2 for the four state-level countries only.
const ISO3_TO_ISO2 = { BRA: 'BR', USA: 'US', CAN: 'CA', JPN: 'JP' };

/**
 * Resolve the parent country alpha-2 code from a state-line feature's properties.
 * Handles two shapes:
 *   - Already-alpha-2 fields: iso_a2 / ISO_A2  (test fixtures, some older sources)
 *   - 3-letter ADM0_A3 / adm0_a3              (real 10m Natural Earth state-lines)
 */
function parentAlpha2(props) {
  const two = (props.iso_a2 || props.ISO_A2 || '').toUpperCase();
  if (two.length === 2) return two;
  const three = (props.ADM0_A3 || props.adm0_a3 || '').toUpperCase();
  return ISO3_TO_ISO2[three] || three.slice(0, 2);
}

// Normalize exterior ring to CCW winding so geoContains treats the polygon
// interior (not the rest of the world) as "inside". Natural Earth GeoJSON is
// already CCW, but synthetic test fixtures may be CW — detect and fix.
function normalizeExteriorRing(ring) {
  const area = geoArea({ type: 'Polygon', coordinates: [ring] });
  // area > 2π means the ring encloses more than half the sphere → it's inverted
  return area > 2 * Math.PI ? [...ring].reverse() : ring;
}

function normalizeGeometry(geom) {
  if (geom.type === 'Polygon') {
    return { ...geom, coordinates: [normalizeExteriorRing(geom.coordinates[0]), ...geom.coordinates.slice(1)] };
  }
  if (geom.type === 'MultiPolygon') {
    return {
      ...geom,
      coordinates: geom.coordinates.map((poly) => [normalizeExteriorRing(poly[0]), ...poly.slice(1)]),
    };
  }
  return geom;
}

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
  return features.map((f) => {
    const geom = normalizeGeometry(f.geometry);
    return { id: f.id, feature: { type: 'Feature', geometry: geom }, bbox: bbox(geom) };
  });
}

export function assignRegion(index, lon, lat) {
  for (const entry of index) {
    const b = entry.bbox;
    if (lon < b.minX || lon > b.maxX || lat < b.minY || lat > b.maxY) continue;
    if (geoContains(entry.feature, [lon, lat])) return entry.id;
  }
  return null;
}

/**
 * Like assignRegion but nudges the probe point by up to 0.08° in 8 directions
 * when the exact point misses (useful for coast dots sitting on land/ocean boundary).
 */
export function assignRegionNudged(index, lon, lat) {
  let id = assignRegion(index, lon, lat);
  if (id) return id;
  const d = 0.08;
  for (const [dx, dy] of [[d,0],[-d,0],[0,d],[0,-d],[d,d],[-d,-d],[d,-d],[-d,d]]) {
    id = assignRegion(index, lon + dx, lat + dy);
    if (id) return id;
  }
  return null; // open coast far from any kept polygon — render, but not highlightable
}

// Great-circle distance in degrees between two lon/lat points (haversine).
function segDistDeg(aLon, aLat, bLon, bLat) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return (2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 180) / Math.PI;
}

/**
 * Arc-length resampling along an open LineString (array of [lon, lat] coords).
 * Emits first vertex immediately, then one interpolated point every stepDeg of
 * great-circle distance, carrying leftover accumulator across edges.
 */
function resampleLine(coords, stepDeg, emitFn) {
  if (coords.length < 2) return;
  emitFn(coords[0][0], coords[0][1]);
  let acc = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[i + 1];
    const d = segDistDeg(lon1, lat1, lon2, lat2);
    if (d === 0) continue;
    let consumed = 0;
    while (acc + (d - consumed) >= stepDeg) {
      const advance = stepDeg - acc;
      consumed += advance;
      const t = consumed / d;
      emitFn(lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t);
      acc = 0;
    }
    acc += (d - consumed);
  }
}

/**
 * Walk a LineString or MultiLineString geometry, calling resampleLine on each line.
 */
function walkLineGeometry(geom, stepDeg, emitFn) {
  if (geom.type === 'LineString') {
    resampleLine(geom.coordinates, stepDeg, emitFn);
  } else if (geom.type === 'MultiLineString') {
    for (const line of geom.coordinates) {
      resampleLine(line, stepDeg, emitFn);
    }
  }
}

/**
 * Uniform interior grid, cosine-corrected to keep dot density even across latitudes.
 * Emits ONLY points inside a known region. Default spacing ~1.5°.
 */
export function generateLandPoints(index, stepDeg = 1.5) {
  const out = [];
  for (let lat = -89; lat <= 89; lat += stepDeg) {
    const lonStep = stepDeg / Math.max(Math.cos((lat * Math.PI) / 180), 0.15);
    for (let lon = -180; lon < 180; lon += lonStep) {
      const id = assignRegion(index, lon, lat);
      if (id) out.push({ lat, lon, regionId: id, category: 'land' });
    }
  }
  return out;
}

/**
 * Trace Natural Earth coastline FeatureCollection (LineString/MultiLineString) with
 * arc-length resampling. regionId assigned via nudged probe so coast dots remain
 * highlightable. Emits every dot even if regionId is null (open ocean coasts).
 * Default spacing ~0.45° (dense).
 */
export function generateCoastPoints(coastlineFC, index, stepDeg = 0.45) {
  const out = [];
  for (const f of coastlineFC.features) {
    walkLineGeometry(f.geometry, stepDeg, (lon, lat) => {
      const regionId = assignRegionNudged(index, lon, lat);
      out.push({ lat, lon, regionId, category: 'coast' });
    });
  }
  return out;
}

/**
 * Border dots from intra-continental country lines (all) and state/province lines
 * filtered to the 4 STATE_LEVEL countries. regionId is always null — borders are
 * shared separators and are not highlighted. Default spacing ~0.7°.
 */
export function generateBorderPoints(countryLinesFC, stateLinesFC, stepDeg = 0.7) {
  const out = [];
  for (const f of countryLinesFC.features) {
    walkLineGeometry(f.geometry, stepDeg, (lon, lat) => {
      out.push({ lat, lon, regionId: null, category: 'border' });
    });
  }
  for (const f of stateLinesFC.features) {
    if (!STATE_LEVEL.includes(parentAlpha2(f.properties))) continue;
    walkLineGeometry(f.geometry, stepDeg, (lon, lat) => {
      out.push({ lat, lon, regionId: null, category: 'border' });
    });
  }
  return out;
}

/**
 * Master point generator. Produces all three categories:
 *   coast  (0.45° spacing) – coastline traces with nudged regionId
 *   land   (1.5° spacing)  – uniform interior grid, inside regions only
 *   border (0.7° spacing)  – country + state boundary lines, regionId null
 */
export function generatePoints(features, coastlineFC, countryLinesFC, stateLinesFC) {
  const index = buildRegionIndex(features);
  return [
    ...generateCoastPoints(coastlineFC, index, 0.45),
    ...generateLandPoints(index, 1.5),
    ...generateBorderPoints(countryLinesFC, stateLinesFC, 0.7),
  ];
}
