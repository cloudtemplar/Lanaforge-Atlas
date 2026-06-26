import { TIER_FAR, TIER_NEAR, GLOBE_RADIUS, LABEL_REF_DIST } from './config.js';
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

export function truncateList(names, limit = 5) {
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  const shown = sorted.slice(0, limit);
  return { shown, total: sorted.length, hiddenCount: Math.max(0, sorted.length - limit) };
}

function overlaps(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

// Greedy: keep highest priority first, drop lower-priority boxes overlapping a kept one.
export function cullCollisions(candidates) {
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  const kept = [];
  const keptIdx = new Set();
  for (const c of sorted) {
    if (kept.some((k) => overlaps(k, c))) continue;
    kept.push(c);
    keptIdx.add(c.index);
  }
  return keptIdx;
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

  // One list element per highlighted region, reused across frames (avoids rebuilding DOM each frame).
  const nodes = new Map();
  for (const r of active) {
    const el = document.createElement('div');
    el.className = 'people-list';
    el.style.position = 'absolute';
    overlayEl.appendChild(el);
    nodes.set(r.id, el);
  }

  function buildListHTML(r, allNames) {
    const { shown, total, hiddenCount } = truncateList(allNames);
    const items = shown.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
    const more = hiddenCount > 0
      ? `<button class="more" data-region="${r.id}">+${hiddenCount} more (${total})</button>` : '';
    return `<div class="region-name">${escapeHtml(r.name)}</div><ul>${items}</ul>${more}`;
  }

  // Track which elements have had their DOM built.
  const builtSet = new Set();

  // Delegate expand-click to the overlay element (single listener, avoids per-node listeners).
  overlayEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button.more');
    if (!btn) return;
    const regionId = btn.dataset.region;
    const r = active.find((x) => x.id === regionId);
    if (!r) return;
    const el = nodes.get(r.id);
    if (!el) return;
    const allNames = (peopleByRegion[r.id] || []).slice().sort((a, b) => a.localeCompare(b));
    const ul = el.querySelector('ul');
    if (ul) ul.innerHTML = allNames.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
    btn.remove();
  });

  // Hide a label: fade it out (CSS handles the transition) and drop its built flag so it
  // re-enters collapsed (top-5 + "+N more"), never stuck expanded after a zoom-out.
  function hide(el, id) {
    el.classList.remove('visible');
    builtSet.delete(id);
  }

  function update(camera, root, width, height, cameraDistance) {
    const tier = zoomTier(cameraDistance);

    // Far tier: fade everything out, no projection needed.
    if (tier === 'far') {
      for (const [id, el] of nodes) hide(el, id);
      return;
    }

    // Project centroids; build collision candidates for on-screen, front-facing regions.
    const candidates = [];
    const screenById = new Map();
    const scaleById = new Map();

    for (const r of active) {
      const local = latLonToVector3(r.centroid.lat, r.centroid.lon, GLOBE_RADIUS);
      const world = local.clone().applyMatrix4(root.matrixWorld);
      // Limb cull: skip regions on the back hemisphere (dot product < R²).
      if (world.dot(camera.position) <= GLOBE_RADIUS * GLOBE_RADIUS) {
        screenById.set(r.id, null);
        continue;
      }
      const s = vector3ToScreen(world, camera, width, height);
      if (!s.visible || s.x < 0 || s.y < 0 || s.x > width || s.y > height) {
        screenById.set(r.id, null);
        continue;
      }
      screenById.set(r.id, s);
      // World-anchored size: scale by the centroid's view-space depth (matches the dots).
      const viewDepth = -world.clone().applyMatrix4(camera.matrixWorldInverse).z;
      const scale = labelScale(viewDepth, LABEL_REF_DIST);
      scaleById.set(r.id, scale);
      const count = (peopleByRegion[r.id] || []).length;
      // Estimate bounding box height: region name row + up to 5 name rows. Scale with the
      // label so the medium-tier collision cull stays correct as labels grow.
      const w = 130 * scale;
      const h = (20 + Math.min(count, 5) * 16 + (count > 5 ? 18 : 0)) * scale;
      // Priority: more people = more interesting; ties broken by region id (stable).
      candidates.push({ index: r.id, x: s.x - w / 2, y: s.y - h / 2, w, h, priority: count + 1 });
    }

    // Near tier: show all visible labels; medium: cull collisions.
    const kept = tier === 'near'
      ? new Set(candidates.map((c) => c.index))
      : cullCollisions(candidates);

    for (const r of active) {
      const el = nodes.get(r.id);
      const s = screenById.get(r.id);

      if (!s || !kept.has(r.id)) {
        hide(el, r.id);
        continue;
      }

      // Build DOM once; if already expanded don't re-render (would remove expanded names).
      if (!builtSet.has(r.id)) {
        const allNames = peopleByRegion[r.id] || [];
        el.innerHTML = buildListHTML(r, allNames);
        builtSet.add(r.id);
      }

      const scale = scaleById.get(r.id);
      el.classList.add('visible');
      el.style.left = `${Math.round(s.x)}px`;
      el.style.top = `${Math.round(s.y)}px`;
      el.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }
  }

  return { update };
}
