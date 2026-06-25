export const GLOBE_RADIUS = 1;
export const ZOOM_MIN = 1.15;
export const ZOOM_MAX = 2.6;
export const TIER_FAR = 2.0;   // camera distance > TIER_FAR => "far"
export const TIER_NEAR = 1.4;  // camera distance < TIER_NEAR => "near"
export const HIGHLIGHT_COLOR = '#ff5a1f';

// Countries represented ONLY by admin-1 sub-regions (their admin-0 polygon is excluded).
export const FOURTEEN = ['BR', 'AR', 'US', 'CA', 'AU', 'GB', 'DE', 'IT', 'FR', 'ES', 'NO', 'SE', 'FI', 'JP'];

const RAW = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
export const SOURCES = {
  countries:   `${RAW}/ne_50m_admin_0_countries.geojson`,
  states:      `${RAW}/ne_50m_admin_1_states_provinces.geojson`,
  countryLines:`${RAW}/ne_50m_admin_0_boundary_lines_land.geojson`,
  stateLines:  `${RAW}/ne_50m_admin_1_states_provinces_lines.geojson`,
};
