import { geoCentroid } from 'd3-geo';
import { STATE_LEVEL, STATE_COUNTRY_LABEL, TERRITORY_REGIONS } from '../../src/config.js';

const iso2 = (p) => p.ISO_A2_EH || p.ISO_A2 || p.iso_a2_eh || p.iso_a2 || '';
const countryName = (p) => p.NAME || p.ADMIN || p.name || '';

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
    const [lon, lat] = geoCentroid(f);
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
