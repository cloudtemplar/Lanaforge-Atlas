import { geoContains, geoArea } from 'd3-geo';

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

// Great-circle distance in degrees between two lon/lat points (haversine).
function segDistDeg(aLon, aLat, bLon, bLat) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return (2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 180) / Math.PI;
}

// Dense outline points sampled along every ring of every region polygon.
// Arc-length resampling: emits one dot every stepDeg of great-circle distance
// along the concatenated perimeter, independent of source vertex density.
export function generateContourPoints(features, stepDeg) {
  const out = [];
  const emitRing = (ring, id) => {
    if (ring.length < 2) return;
    out.push({ lon: ring[0][0], lat: ring[0][1], regionId: id, tier: 'contour' });
    let acc = 0; // distance accumulated since the last emitted point
    for (let i = 0; i < ring.length - 1; i++) {
      const [lon1, lat1] = ring[i];
      const [lon2, lat2] = ring[i + 1];
      const d = segDistDeg(lon1, lat1, lon2, lat2);
      if (d === 0) continue;
      let consumed = 0; // distance along THIS edge already passed
      while (acc + (d - consumed) >= stepDeg) {
        const advance = stepDeg - acc;
        consumed += advance;
        const t = consumed / d;
        out.push({ lon: lon1 + (lon2 - lon1) * t, lat: lat1 + (lat2 - lat1) * t, regionId: id, tier: 'contour' });
        acc = 0;
      }
      acc += (d - consumed);
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
    ...generateContourPoints(features, 0.5),
    ...generateFillPoints(index, 1.0),
  ];
}
