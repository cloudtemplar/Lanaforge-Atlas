import { geoCentroid } from 'd3-geo';
import { FOURTEEN } from '../../src/config.js';

const iso2 = (p) => p.ISO_A2_EH || p.ISO_A2 || p.iso_a2_eh || p.iso_a2 || '';
const countryName = (p) => p.NAME || p.ADMIN || p.name || '';

export function buildRegions(countriesFC, statesFC) {
  const regions = [];
  const features = [];

  // Non-14 countries -> admin-0 region.
  for (const f of countriesFC.features) {
    const code = iso2(f.properties).toUpperCase();
    if (!code || code === '-99' || FOURTEEN.includes(code)) continue;
    const [lon, lat] = geoCentroid(f);
    regions.push({ id: code, name: countryName(f.properties), centroid: { lat, lon } });
    features.push({ id: code, geometry: f.geometry });
  }

  // 14 countries -> admin-1 regions only.
  for (const f of statesFC.features) {
    const parent = (f.properties.iso_a2 || f.properties.iso_3166_2 || '').slice(0, 2).toUpperCase();
    const code = (f.properties.iso_3166_2 || '').toUpperCase();
    if (!FOURTEEN.includes(parent) || !code || code === parent) continue;
    const [lon, lat] = geoCentroid(f);
    regions.push({ id: code, name: f.properties.name || code, centroid: { lat, lon } });
    features.push({ id: code, geometry: f.geometry });
  }

  return { regions, features };
}
