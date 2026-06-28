// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';

// These lifecycle tests describe the collapsed-by-default interaction model, so they pin
// COLLAPSE_ALL_NAME_LISTS = true here (the rest of config.js is kept real). This decouples them
// from the committed flag value — flipping it in config.js can never make these tests fail.
vi.mock('../src/config.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, COLLAPSE_ALL_NAME_LISTS: true };
});

import { createLabelLayer } from '../src/labels.js';
import { LABEL_REF_DIST } from '../src/config.js';

// Regions whose centroids map near world (0,0,1): lat~0, lon~-90 (see geo.js mapping).
// They project to nearly the same screen point -> would collide under the old cull.
const regions = [
  { id: 'DE', name: 'Germany', centroid: { lat: 0, lon: -90 } },   // 7 names
  { id: 'BE', name: 'Belgium', centroid: { lat: 0.4, lon: -90 } }, // 4 names
  { id: 'LU', name: 'Luxembourg', centroid: { lat: 0.8, lon: -90 } }, // 2 names
];
const peopleByRegion = {
  DE: ['Ana', 'Bia', 'Cara', 'Dan', 'Eve', 'Fay', 'Gus'], // 7 -> "+2 more"
  BE: ['Hugo', 'Ines', 'Jan', 'Kim'],                      // 4
  LU: ['Leo', 'Mia'],                                      // 2
};
// Every region is a collapsible marker now (no minimum-count threshold).

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

  it('defaults to a collapsed marker (count in the header, not expanded)', () => {
    const cam = makeCamera(2.0);
    layer.update(cam, makeRoot(), W, H, cam.position.length());
    const de = node('DE');
    expect(de.classList.contains('visible')).toBe(true);
    expect(de.classList.contains('collapsible')).toBe(true);
    expect(de.classList.contains('expanded')).toBe(false);
    // count lives in the name header; no person icon / separate count-row
    expect(de.querySelector('.count-row')).toBeNull();
    expect(de.querySelector('.person-icon')).toBeNull();
    expect(de.querySelector('.region-name .count').textContent).toBe('7');
    // world-anchored scale still applied (viewDepth=1 -> scale=LABEL_REF_DIST)
    expect(de.style.transform).toContain(`scale(${LABEL_REF_DIST})`);
  });

  it('shows ALL overlapping markers (no collision culling)', () => {
    const cam = makeCamera(2.0);
    layer.update(cam, makeRoot(), W, H, cam.position.length());
    expect(node('DE').classList.contains('visible')).toBe(true);
    expect(node('BE').classList.contains('visible')).toBe(true);
  });

  it('makes every region a collapsed marker regardless of name count', () => {
    const cam = makeCamera(2.0);
    layer.update(cam, makeRoot(), W, H, cam.position.length());
    for (const id of ['DE', 'BE', 'LU']) {
      expect(node(id).classList.contains('collapsible')).toBe(true);
      expect(node(id).classList.contains('expanded')).toBe(false);
    }
  });

  it('expands a small (2-name) region on click, just like the larger ones', () => {
    const cam = makeCamera(2.0);
    layer.update(cam, makeRoot(), W, H, cam.position.length());
    const lu = node('LU');
    expect(lu.classList.contains('expanded')).toBe(false);
    lu.querySelector('.region-name').dispatchEvent(new window.Event('click', { bubbles: true }));
    expect(lu.classList.contains('expanded')).toBe(true);
    expect(lu.querySelectorAll('.names li').length).toBe(2);
  });

  it('toggles via the name header (count included), not the names list', () => {
    const cam = makeCamera(2.0);
    layer.update(cam, makeRoot(), W, H, cam.position.length());
    const de = node('DE');
    // The count lives in the header, so clicking it toggles like the name.
    de.querySelector('.region-name .count').dispatchEvent(new window.Event('click', { bubbles: true }));
    expect(de.classList.contains('expanded')).toBe(true);
  });

  it('collapses only via the country name, not by clicking the names list', () => {
    const cam = makeCamera(2.0);
    layer.update(cam, makeRoot(), W, H, cam.position.length());
    const de = node('DE');
    de.querySelector('.region-name').dispatchEvent(new window.Event('click', { bubbles: true })); // expand
    expect(de.classList.contains('expanded')).toBe(true);
    // Clicking a name in the list must NOT collapse the marker.
    de.querySelector('.names li').dispatchEvent(new window.Event('click', { bubbles: true }));
    expect(de.classList.contains('expanded')).toBe(true);
    // The country name still collapses it.
    de.querySelector('.region-name').dispatchEvent(new window.Event('click', { bubbles: true }));
    expect(de.classList.contains('expanded')).toBe(false);
  });

  it('marks every region with the .collapsible clickable affordance', () => {
    const cam = makeCamera(2.0);
    layer.update(cam, makeRoot(), W, H, cam.position.length());
    expect(node('DE').classList.contains('collapsible')).toBe(true);
    expect(node('LU').classList.contains('collapsible')).toBe(true);
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
    // header preserved (name + count); first child node is the country-name text
    expect(name1.firstChild.textContent).toBe('Germany');
    expect(name1.querySelector('.count').textContent).toBe('7');
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
