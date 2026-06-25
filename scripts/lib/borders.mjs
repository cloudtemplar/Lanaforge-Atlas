import { FOURTEEN } from '../../src/config.js';

// alpha-3 -> alpha-2 for the 14 sub-region countries.
// Real 10m state-lines GeoJSON uses ADM0_A3 (3-letter ISO), not iso_a2.
// Slicing the first 2 chars of a 3-letter code is broken — e.g. 'SWE'.slice(0,2) === 'SW' !== 'SE'.
const ISO3_TO_ISO2 = {
  BRA: 'BR', ARG: 'AR', USA: 'US', CAN: 'CA', AUS: 'AU', GBR: 'GB', DEU: 'DE',
  ITA: 'IT', FRA: 'FR', ESP: 'ES', NOR: 'NO', SWE: 'SE', FIN: 'FI', JPN: 'JP',
};

/**
 * Resolve the parent country alpha-2 code from a state-line feature's properties.
 * Handles two shapes:
 *   - Already-alpha-2 fields: iso_a2 / ISO_A2  (test fixtures, some older sources)
 *   - 3-letter ADM0_A3 / adm0_a3              (real 10m Natural Earth state-lines)
 */
function parentAlpha2(props) {
  // Already-alpha-2 forms:
  const two = (props.iso_a2 || props.ISO_A2 || '').toUpperCase();
  if (two.length === 2) return two;
  // Real 10m state-lines: 3-letter ADM0_A3.
  const three = (props.ADM0_A3 || props.adm0_a3 || '').toUpperCase();
  return ISO3_TO_ISO2[three] || three.slice(0, 2); // map covers all 14; fallback for others
}

/**
 * Push consecutive endpoints of a LineString as discrete segment pairs ([lat,lon] each).
 * GeoJSON coords are [lon, lat]; output uses [lat, lon] ordering.
 */
function pushLine(coords, out) {
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[i + 1];
    out.push([lat1, lon1], [lat2, lon2]);
  }
}

function pushGeometry(geom, out) {
  if (!geom) return;
  if (geom.type === 'LineString') {
    pushLine(geom.coordinates, out);
  } else if (geom.type === 'MultiLineString') {
    for (const l of geom.coordinates) pushLine(l, out);
  }
}

/**
 * Build a flat array of [lat,lon] endpoints for THREE.LineSegments.
 * Consecutive pairs form one segment.
 *
 * Includes:
 *   - ALL country-level boundary lines (intra-continental, no coastlines — that's
 *     what ne_50m_admin_0_boundary_lines_land contains).
 *   - State/province lines ONLY for the 14 sub-region countries (FOURTEEN).
 *
 * @param {object} countryLinesFC  GeoJSON FeatureCollection of country boundary lines
 * @param {object} stateLinesFC    GeoJSON FeatureCollection of state/province lines
 * @returns {Array<[number,number]>} flat array of [lat,lon] pairs
 */
export function buildBorders(countryLinesFC, stateLinesFC) {
  const out = [];

  // All country boundary lines (already filtered to land boundaries in the source file).
  for (const f of countryLinesFC.features) {
    pushGeometry(f.geometry, out);
  }

  // State lines filtered to the 14 sub-region countries only.
  for (const f of stateLinesFC.features) {
    if (!FOURTEEN.includes(parentAlpha2(f.properties))) continue;
    pushGeometry(f.geometry, out);
  }

  return out;
}
