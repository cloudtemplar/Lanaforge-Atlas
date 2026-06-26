// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { createLabelLayer } from '../src/labels.js';
import { LABEL_REF_DIST } from '../src/config.js';

// A region whose centroid maps to world (0,0,1): lat=0, lon=-90 (see geo.js mapping).
const regions = [{ id: 'US-CA', name: 'US - California', centroid: { lat: 0, lon: -90 } }];
const peopleByRegion = { 'US-CA': ['Ana', 'Bia', 'Cara', 'Dan', 'Eve', 'Fay', 'Gus'] }; // 7 -> "+2 more"

function makeCamera(dist) {
  const cam = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  cam.position.set(0, 0, dist);
  cam.updateMatrixWorld(true);
  cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  cam.updateProjectionMatrix();
  return cam;
}

function makeRoot() {
  const root = new THREE.Group();
  root.updateMatrixWorld(true);
  return root;
}

function setup() {
  const overlay = document.createElement('div');
  document.body.appendChild(overlay);
  const layer = createLabelLayer({
    overlayEl: overlay,
    regions,
    highlightSet: new Set(['US-CA']),
    peopleByRegion,
  });
  const el = () => overlay.querySelector('.people-list');
  return { overlay, layer, el };
}

const W = 800, H = 600;

describe('label lifecycle (fade / scale / collapse)', () => {
  let overlay, layer, el;
  beforeEach(() => {
    document.body.innerHTML = '';
    ({ overlay, layer, el } = setup());
  });

  it('adds .visible and a world-anchored scale transform when front-facing in view', () => {
    const cam = makeCamera(2.0); // medium tier; centroid at z=1 -> viewDepth=1
    layer.update(cam, makeRoot(), W, H, cam.position.length());
    const node = el();
    expect(node.classList.contains('visible')).toBe(true);
    // viewDepth = 1 -> scale = LABEL_REF_DIST / 1
    expect(node.style.transform).toContain(`scale(${LABEL_REF_DIST})`);
  });

  it('grows (larger scale) as the camera zooms in', () => {
    const far = makeCamera(2.0);   // viewDepth 1.0
    layer.update(far, makeRoot(), W, H, far.position.length());
    const scaleFar = parseFloat(el().style.transform.match(/scale\(([\d.]+)\)/)[1]);

    const near = makeCamera(1.6);  // viewDepth 0.6 -> bigger scale
    layer.update(near, makeRoot(), W, H, near.position.length());
    const scaleNear = parseFloat(el().style.transform.match(/scale\(([\d.]+)\)/)[1]);

    expect(scaleNear).toBeGreaterThan(scaleFar);
  });

  it('removes .visible (fades out) at far tier', () => {
    const med = makeCamera(2.0);
    layer.update(med, makeRoot(), W, H, med.position.length());
    expect(el().classList.contains('visible')).toBe(true);

    const far = makeCamera(2.5); // > TIER_FAR
    layer.update(far, makeRoot(), W, H, far.position.length());
    expect(el().classList.contains('visible')).toBe(false);
  });

  it('auto-collapses an expanded list after it disappears', () => {
    const med = makeCamera(2.0);
    layer.update(med, makeRoot(), W, H, med.position.length());

    // Initially collapsed: top-5 + a "+N more" button.
    expect(el().querySelectorAll('li').length).toBe(5);
    const moreBtn = el().querySelector('button.more');
    expect(moreBtn).toBeTruthy();

    // Expand via the delegated click handler on the overlay.
    moreBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
    expect(el().querySelectorAll('li').length).toBe(7);
    expect(el().querySelector('button.more')).toBeNull();

    // Zoom out so it disappears...
    const far = makeCamera(2.5);
    layer.update(far, makeRoot(), W, H, far.position.length());
    expect(el().classList.contains('visible')).toBe(false);

    // ...and back in: it should rebuild collapsed, not stay expanded.
    layer.update(med, makeRoot(), W, H, med.position.length());
    expect(el().querySelectorAll('li').length).toBe(5);
    expect(el().querySelector('button.more')).toBeTruthy();
  });
});
