// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { createLabelLayer } from '../src/labels.js';
import { LABEL_REF_DIST } from '../src/config.js';

// Regions whose centroids map near world (0,0,1): lat~0, lon~-90 (see geo.js mapping).
// They project to nearly the same screen point -> would collide under the old cull.
const regions = [
  { id: 'DE', name: 'Germany', centroid: { lat: 0, lon: -90 } },   // 7 names -> collapsible
  { id: 'BE', name: 'Belgium', centroid: { lat: 0.4, lon: -90 } }, // 4 names -> collapsible
  { id: 'LU', name: 'Luxembourg', centroid: { lat: 0.8, lon: -90 } }, // 2 names -> NOT collapsible
];
const peopleByRegion = {
  DE: ['Ana', 'Bia', 'Cara', 'Dan', 'Eve', 'Fay', 'Gus'], // 7 -> "+2 more"
  BE: ['Hugo', 'Ines', 'Jan', 'Kim'],                      // 4
  LU: ['Leo', 'Mia'],                                      // 2 -> shown as a list, no marker
};

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
    highlightSet: new Set(['DE', 'BE', 'LU']),
    peopleByRegion,
  });
  const node = (id) => overlay.querySelector(`.people-list[data-region="${id}"]`);
  return { overlay, layer, node };
}

const W = 800, H = 600;

describe('people markers (two-state label)', () => {
  let overlay, layer, node;
  beforeEach(() => {
    document.body.innerHTML = '';
    ({ overlay, layer, node } = setup());
  });

  it('defaults to a collapsed marker (count-row visible, not expanded)', () => {
    const cam = makeCamera(2.0);
    layer.update(cam, makeRoot(), W, H, cam.position.length());
    const de = node('DE');
    expect(de.classList.contains('visible')).toBe(true);
    expect(de.classList.contains('expanded')).toBe(false);
    expect(de.querySelector('.count-row')).toBeTruthy();
    expect(de.querySelector('.count-row .person-icon')).toBeTruthy();
    expect(de.querySelector('.count-row').textContent).toContain('7');
    // world-anchored scale still applied (viewDepth=1 -> scale=LABEL_REF_DIST)
    expect(de.style.transform).toContain(`scale(${LABEL_REF_DIST})`);
  });

  it('shows ALL overlapping markers (no collision culling)', () => {
    const cam = makeCamera(2.0);
    layer.update(cam, makeRoot(), W, H, cam.position.length());
    expect(node('DE').classList.contains('visible')).toBe(true);
    expect(node('BE').classList.contains('visible')).toBe(true);
  });

  it('collapses to a marker only when there are 3+ names', () => {
    const cam = makeCamera(2.0);
    layer.update(cam, makeRoot(), W, H, cam.position.length());
    // DE (7) and BE (4) are collapsible -> default collapsed marker.
    expect(node('DE').classList.contains('collapsible')).toBe(true);
    expect(node('DE').classList.contains('expanded')).toBe(false);
    expect(node('BE').classList.contains('collapsible')).toBe(true);
    expect(node('BE').classList.contains('expanded')).toBe(false);
    // LU (2) is below the threshold -> shown directly as a list, never a marker.
    expect(node('LU').classList.contains('collapsible')).toBe(false);
    expect(node('LU').classList.contains('expanded')).toBe(true);
    expect(node('LU').querySelectorAll('.names li').length).toBe(2);
  });

  it('ignores clicks on a below-threshold region (stays an open list)', () => {
    const cam = makeCamera(2.0);
    layer.update(cam, makeRoot(), W, H, cam.position.length());
    const lu = node('LU');
    lu.querySelector('.region-name').dispatchEvent(new window.Event('click', { bubbles: true }));
    expect(lu.classList.contains('expanded')).toBe(true); // unchanged — no marker to collapse into
  });

  it('marks collapsible regions with the .collapsible clickable affordance', () => {
    const cam = makeCamera(2.0);
    layer.update(cam, makeRoot(), W, H, cam.position.length());
    expect(node('DE').classList.contains('collapsible')).toBe(true);
    expect(node('LU').classList.contains('collapsible')).toBe(false);
  });

  it('expands to the names list on click and collapses on a second click', () => {
    const cam = makeCamera(2.0);
    layer.update(cam, makeRoot(), W, H, cam.position.length());
    const de = node('DE');

    de.querySelector('.region-name').dispatchEvent(new window.Event('click', { bubbles: true }));
    expect(de.classList.contains('expanded')).toBe(true);
    expect(de.querySelectorAll('.names li').length).toBe(5);

    de.querySelector('.region-name').dispatchEvent(new window.Event('click', { bubbles: true }));
    expect(de.classList.contains('expanded')).toBe(false);
  });

  it('never rebuilds the country-name element across toggles (no flicker)', () => {
    const cam = makeCamera(2.0);
    layer.update(cam, makeRoot(), W, H, cam.position.length());
    const de = node('DE');
    const name1 = de.querySelector('.region-name');

    de.querySelector('.region-name').dispatchEvent(new window.Event('click', { bubbles: true })); // expand
    const name2 = de.querySelector('.region-name');
    // re-render the frame while expanded
    layer.update(cam, makeRoot(), W, H, cam.position.length());
    const name3 = de.querySelector('.region-name');

    expect(name2).toBe(name1);
    expect(name3).toBe(name1);
    expect(name1.textContent).toBe('Germany');
  });

  it('"+N more" reveals all names within the expanded list', () => {
    const cam = makeCamera(2.0);
    layer.update(cam, makeRoot(), W, H, cam.position.length());
    const de = node('DE');
    de.querySelector('.region-name').dispatchEvent(new window.Event('click', { bubbles: true })); // expand
    const moreBtn = de.querySelector('button.more');
    expect(moreBtn).toBeTruthy();
    moreBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
    expect(de.querySelectorAll('.names li').length).toBe(7);
    expect(de.querySelector('button.more')).toBeNull();
  });

  it('auto-collapses to a fresh marker after it disappears (far tier)', () => {
    const med = makeCamera(2.0);
    layer.update(med, makeRoot(), W, H, med.position.length());
    const de = node('DE');

    // expand + reveal all names
    de.querySelector('.region-name').dispatchEvent(new window.Event('click', { bubbles: true }));
    de.querySelector('button.more').dispatchEvent(new window.Event('click', { bubbles: true }));
    expect(de.querySelectorAll('.names li').length).toBe(7);

    // zoom out -> hidden
    const far = makeCamera(2.5);
    layer.update(far, makeRoot(), W, H, far.position.length());
    expect(de.classList.contains('visible')).toBe(false);

    // back in -> collapsed marker, names reset to top-5 + "+N more"
    layer.update(med, makeRoot(), W, H, med.position.length());
    expect(de.classList.contains('expanded')).toBe(false);
    expect(de.querySelectorAll('.names li').length).toBe(5);
    expect(de.querySelector('button.more')).toBeTruthy();
  });
});
