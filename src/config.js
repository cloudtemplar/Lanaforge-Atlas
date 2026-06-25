export const GLOBE_RADIUS = 1;
export const ZOOM_MIN = 1.15;
export const ZOOM_MAX = 2.6;
export const TIER_FAR = 2.0;   // camera distance > TIER_FAR => "far"
export const TIER_NEAR = 1.4;  // camera distance < TIER_NEAR => "near"
export const HIGHLIGHT_COLOR = '#ff5a1f';

// Countries represented ONLY by admin-1 sub-regions (their admin-0 polygon is excluded).
export const STATE_LEVEL = ['BR', 'US', 'CA', 'JP'];

const RAW = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
// admin-0 (countries/boundary lines) at 50m: light and complete for all ~240 countries.
// admin-1 (states/state lines) at 10m: used for the 4 state-level countries (BR/US/CA/JP).
export const SOURCES = {
  countries:   `${RAW}/ne_50m_admin_0_countries.geojson`,
  states:      `${RAW}/ne_10m_admin_1_states_provinces.geojson`,
  countryLines:`${RAW}/ne_50m_admin_0_boundary_lines_land.geojson`,
  stateLines:  `${RAW}/ne_10m_admin_1_states_provinces_lines.geojson`,
  coastline:   `${RAW}/ne_50m_coastline.geojson`,
};
