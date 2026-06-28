import { TIER_FAR, TIER_NEAR, GLOBE_RADIUS, LABEL_REF_DIST, COLLAPSE_ALL_NAME_LISTS } from './config.js';
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

// Full two-state label, built ONCE per region. The .region-name header (country name + a
// people .count just left of the caret) is never rebuilt (no flicker); expand/collapse only
// toggles the .expanded class, and the .names wrapper is the only part rewritten when names change.
export function buildListHTML(region, allNames) {
  const total = allNames.length;
  return (
    `<div class="region-name">${escapeHtml(region.name)}<span class="count">${total}</span></div>` +
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

  // Every highlighted region is a clickable marker. COLLAPSE_ALL_NAME_LISTS picks the default
  // state: collapsed header (country name + count + caret) or pre-expanded with its names list.
  const nodes = new Map();
  for (const r of active) {
    const el = document.createElement('div');
    el.className = 'people-list collapsible';
    el.style.position = 'absolute';
    el.dataset.region = r.id;
    overlayEl.appendChild(el);
    nodes.set(r.id, el);
  }

  const builtSet = new Set();   // structure built once (never torn down)
  // ids currently showing the names list. Seeded from COLLAPSE_ALL_NAME_LISTS: when the flag is
  // false every marker starts expanded, so the default set holds all active ids.
  const expanded = new Set(COLLAPSE_ALL_NAME_LISTS ? [] : active.map((r) => r.id));
  const dirty = new Set();      // ids whose state the user changed away from the default

  const applyOpen = (el, id) => el.classList.toggle('expanded', expanded.has(id));

  // Rewrite the .names block back to the top-5 + "+N more" view (undoing any "+N more" reveal).
  function resetNames(el, id) {
    const namesEl = el.querySelector('.names');
    if (namesEl) namesEl.innerHTML = namesInnerCollapsed(byId.get(id), peopleByRegion[id] || []);
  }

  // Restore a marker to the flag-selected DEFAULT (expanded or collapsed) + top-5 names. Called
  // when a label fades out, so it re-enters in its default state (never stuck on the user's last toggle).
  function resetToDefault(el, id) {
    if (COLLAPSE_ALL_NAME_LISTS) expanded.delete(id);
    else expanded.add(id);
    el.classList.toggle('expanded', expanded.has(id));
    resetNames(el, id);
    dirty.delete(id);
  }

  // Single delegated listener: "+N more" reveals all names; clicking the COUNTRY NAME header
  // (country name + count) toggles it. The names list is NOT a toggle target, so the clickable
  // hit area stays tight to the header (the list stays non-interactive apart from "+N more").
  overlayEl.addEventListener('click', (e) => {
    const moreBtn = e.target.closest('button.more');
    if (moreBtn) {
      const id = moreBtn.dataset.region;
      const el = nodes.get(id);
      const namesEl = el && el.querySelector('.names');
      if (namesEl) namesEl.innerHTML = namesInnerAll(peopleByRegion[id] || []);
      dirty.add(id);
      return;
    }
    const nameEl = e.target.closest('.region-name');
    if (!nameEl) return;
    const listEl = nameEl.closest('.people-list');
    if (!listEl) return;
    const id = listEl.dataset.region;
    if (!nodes.has(id)) return;
    if (expanded.has(id)) { expanded.delete(id); resetNames(listEl, id); }
    else expanded.add(id);
    dirty.add(id);
    applyOpen(listEl, id);
  });

  // Hide a label: fade it out and, if the user moved it off its default, reset it so it
  // re-enters in the default state (never stuck on the user's last toggle after a zoom-out).
  function hide(el, id) {
    el.classList.remove('visible');
    if (dirty.has(id)) resetToDefault(el, id);
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
      applyOpen(el, r.id); // reflect the marker's collapsed/expanded toggle state
      el.classList.add('visible');
      el.style.left = `${Math.round(s.x)}px`;
      el.style.top = `${Math.round(s.y)}px`;
      el.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }
  }

  return { update };
}
