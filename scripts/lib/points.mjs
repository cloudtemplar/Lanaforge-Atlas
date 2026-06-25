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

// Dense outline points sampled along every ring of every region polygon.
export function generateContourPoints(features, stepDeg) {
  const out = [];
  const emitRing = (ring, id) => {
    for (let i = 0; i < ring.length - 1; i++) {
      const [lon1, lat1] = ring[i];
      const [lon2, lat2] = ring[i + 1];
      const segLen = Math.hypot(lon2 - lon1, lat2 - lat1);
      const n = Math.max(1, Math.round(segLen / stepDeg));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        out.push({ lon: lon1 + (lon2 - lon1) * t, lat: lat1 + (lat2 - lat1) * t, regionId: id, tier: 'contour' });
      }
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
    ...generateContourPoints(features, 0.45),
    ...generateFillPoints(index, 1.4),
  ];
}
