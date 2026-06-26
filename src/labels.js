import { TIER_FAR, TIER_NEAR, GLOBE_RADIUS, LABEL_REF_DIST, MARKER_MIN_COUNT } from './config.js';
import { latLonToVector3, vector3ToScreen } from './geo.js';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function zoomTier(d) {
  if (d > TIER_FAR) return 'far';
  if (d < TIER_NEAR) return 'near';
  return 'medium';
}

// World-anchored label size factor: same semantics as the dot shader's uRefDist/-mv.z.
// viewDepth = -(centroid in view space).z; refDist = LABEL_REF_DIST.
export function labelScale(viewDepth, refDist) {
  return refDist / viewDepth;
}

// The hover cursor pill is only useful when zoomed out (far tier) — at medium/near the
// people markers already label each country, so the pill would be redundant.
export function shouldShowHoverLabel(tier, hovered) {
  return tier === 'far' && !!hovered;
}

export function truncateList(names, limit = 5) {
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  const shown = sorted.slice(0, limit);
  return { shown, total: sorted.length, hiddenCount: Math.max(0, sorted.length - limit) };
}

// Inline person glyph; coloured via CSS (.person-icon { fill: var(--dot) }) to match the dots.
const PERSON_ICON =
  '<svg class="person-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5z"/></svg>';

// The names block (top-5 + "+N more"); rebuilt on collapse/expand-all without touching the header.
function namesInnerCollapsed(region, allNames) {
  const { shown, total, hiddenCount } = truncateList(allNames);
  const items = shown.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
  const more = hiddenCount > 0
    ? `<button class="more" data-region="${region.id}">+${hiddenCount} more (${total})</button>` : '';
  return `<ul>${items}</ul>${more}`;
}

function namesInnerAll(allNames) {
  const sorted = [...allNames].sort((a, b) => a.localeCompare(b));
  return `<ul>${sorted.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`;
}

// Full two-state label, built ONCE per region. The .region-name header and .count-row marker
// are never rebuilt (no flicker); expand/collapse only toggles the .expanded class, and the
// .names wrapper is the only part rewritten when names change.
export function buildListHTML(region, allNames) {
  const total = allNames.length;
  return (
    `<div class="region-name">${escapeHtml(region.name)}</div>` +
    `<div class="count-row">${PERSON_ICON}<span class="count">${total}</span></div>` +
    `<div class="names">${namesInnerCollapsed(region, allNames)}</div>`
  );
}

export function createCursorLabel({ overlayEl }) {
  const el = document.createElement('div');
  el.className = 'region-pill';
  overlayEl.appendChild(el);
  return {
    show(name, x, y) {
      el.textContent = name;
      el.style.left = `${x}px`;
      el.style.top = `${y - 18}px`; // pinned just above the cursor
      el.classList.add('visible');
    },
    hide() { el.classList.remove('visible'); },
  };
}

export function createLabelLayer({ overlayEl, regions, highlightSet, peopleByRegion }) {
  const active = regions.filter((r) => highlightSet.has(r.id));
  const byId = new Map(active.map((r) => [r.id, r]));

  // A region collapses into a clickable marker only if it has enough people; smaller ones
  // are always shown as a plain list (no marker, not toggleable).
  const collapsibleIds = new Set(
    active.filter((r) => (peopleByRegion[r.id] || []).length >= MARKER_MIN_COUNT).map((r) => r.id),
  );

  // One element per highlighted region, reused across frames. Collapsible regions default to
  // a marker (country + person-icon count) and carry .collapsible (the click affordance).
  const nodes = new Map();
  for (const r of active) {
    const el = document.createElement('div');
    el.className = collapsibleIds.has(r.id) ? 'people-list collapsible' : 'people-list';
    el.style.position = 'absolute';
    el.dataset.region = r.id;
    overlayEl.appendChild(el);
    nodes.set(r.id, el);
  }

  const builtSet = new Set();   // structure built once (never torn down)
  const expanded = new Set();   // collapsible ids currently showing the full names list

  // Open = below-threshold (always a list) OR a collapsible region the user expanded.
  const isOpen = (id) => !collapsibleIds.has(id) || expanded.has(id);
  const applyOpen = (el, id) => el.classList.toggle('expanded', isOpen(id));

  // Collapse a marker back to its fresh state: drop expansion and reset .names to top-5 + "+N more".
  function collapse(el, id) {
    expanded.delete(id);
    el.classList.remove('expanded');
    const namesEl = el.querySelector('.names');
    if (namesEl) namesEl.innerHTML = namesInnerCollapsed(byId.get(id), peopleByRegion[id] || []);
  }

  // Single delegated listener: "+N more" reveals all names; clicking a collapsible label toggles it.
  overlayEl.addEventListener('click', (e) => {
    const moreBtn = e.target.closest('button.more');
    if (moreBtn) {
      const el = nodes.get(moreBtn.dataset.region);
      const namesEl = el && el.querySelector('.names');
      if (namesEl) namesEl.innerHTML = namesInnerAll(peopleByRegion[moreBtn.dataset.region] || []);
      return;
    }
    const listEl = e.target.closest('.people-list');
    if (!listEl) return;
    const id = listEl.dataset.region;
    if (!nodes.has(id) || !collapsibleIds.has(id)) return; // below-threshold: not toggleable
    if (expanded.has(id)) collapse(listEl, id);
    else expanded.add(id);
    applyOpen(listEl, id);
  });

  // Hide a label: fade it out and, if it was an expanded marker, reset it so it re-enters
  // collapsed (respects the zoom logic; never stuck open after a zoom-out).
  function hide(el, id) {
    el.classList.remove('visible');
    if (collapsibleIds.has(id) && expanded.has(id)) collapse(el, id);
  }

  function update(camera, root, width, height, cameraDistance) {
    const tier = zoomTier(cameraDistance);

    // Far tier: fade everything out, no projection needed.
    if (tier === 'far') {
      for (const [id, el] of nodes) hide(el, id);
      return;
    }

    // Markers are never collision-culled — every front-facing, on-screen region is shown.
    for (const r of active) {
      const el = nodes.get(r.id);
      const local = latLonToVector3(r.centroid.lat, r.centroid.lon, GLOBE_RADIUS);
      const world = local.clone().applyMatrix4(root.matrixWorld);
      // Limb cull: skip regions on the back hemisphere (dot product < R²).
      if (world.dot(camera.position) <= GLOBE_RADIUS * GLOBE_RADIUS) {
        hide(el, r.id);
        continue;
      }
      const s = vector3ToScreen(world, camera, width, height);
      if (!s.visible || s.x < 0 || s.y < 0 || s.x > width || s.y > height) {
        hide(el, r.id);
        continue;
      }

      // Build the two-state DOM once.
      if (!builtSet.has(r.id)) {
        el.innerHTML = buildListHTML(r, peopleByRegion[r.id] || []);
        builtSet.add(r.id);
      }

      // World-anchored size: scale by the centroid's view-space depth (matches the dots).
      const viewDepth = -world.clone().applyMatrix4(camera.matrixWorldInverse).z;
      const scale = labelScale(viewDepth, LABEL_REF_DIST);
      applyOpen(el, r.id); // below-threshold regions show their list; collapsible reflect toggle state
      el.classList.add('visible');
      el.style.left = `${Math.round(s.x)}px`;
      el.style.top = `${Math.round(s.y)}px`;
      el.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }
  }

  return { update };
}
