import * as THREE from 'three';
import { GLOBE_RADIUS, HIGHLIGHT_COLOR } from './config.js';
import { createPointsObject, createBordersObject } from './globe.js';
import { buildHighlightSet, applyHighlights } from './highlight.js';
import { createControls, makeIdleAutoRotate } from './controls.js';
import { createLabelLayer, createCursorLabel } from './labels.js';
import highlights from '../data/highlights.json';

const THEME = { bg: '#0d0d0f', dot: '#f2f2f2', border: '#555', text: '#f2f2f2' };

let labelLayer = null;
let globe = null;
let vertexRegion = null;
let idToName = null;

const overlayEl = document.getElementById('overlay');
const cursorLabel = createCursorLabel({ overlayEl });
const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 0.012;
const pointer = new THREE.Vector2();
let pointerPx = { x: 0, y: 0 };

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
camera.position.set(0, 0, 2.4);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const root = new THREE.Group();
scene.add(root);

const controls = createControls(camera, renderer.domElement);
const idle = makeIdleAutoRotate({ idleMs: 2500 });
controls.addEventListener('start', () => idle.onInteract(performance.now()));
controls.addEventListener('change', () => idle.onInteract(performance.now()));

async function loadGlobe() {
  const data = await fetch('data/points.json').then((r) => r.json());
  const obj = createPointsObject(data.points, GLOBE_RADIUS, THEME);
  root.add(obj.points);
  const borderData = await fetch('data/borders.json').then((r) => r.json());
  root.add(createBordersObject(borderData.segments, GLOBE_RADIUS, THEME));

  // Apply highlights: fetch valid region ids then recolor highlighted regions
  const regions = await fetch('data/regions.json').then((r) => r.json());
  const validIds = new Set(regions.map((r) => r.id));
  const { set, unknown } = buildHighlightSet(highlights, validIds);
  if (unknown.length) console.warn('[highlights] unknown region ids ignored:', unknown);
  applyHighlights(obj.geometry, obj.regionIndexMap, obj.baseColors, set, HIGHLIGHT_COLOR);

  labelLayer = createLabelLayer({
    overlayEl,
    regions,
    highlightSet: set,
    peopleByRegion: highlights,
  });

  // Build per-vertex regionId lookup for raycasting (highlighted regions only).
  idToName = new Map(regions.map((r) => [r.id, r.name]));
  const count = obj.geometry.getAttribute('position').count;
  const vr = new Array(count).fill(null);
  for (const id of set) {
    for (const i of (obj.regionIndexMap.get(id) || [])) {
      vr[i] = id;
    }
  }
  vertexRegion = vr;
  globe = obj;

  // Register pointermove after globe is loaded (renderer.domElement exists from start).
  renderer.domElement.addEventListener('pointermove', (e) => {
    pointerPx = { x: e.clientX, y: e.clientY };
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });
}

function animate() {
  const now = performance.now();
  if (idle.shouldAutoRotate(now)) root.rotation.y += 0.0009;
  controls.update();
  renderer.render(scene, camera);
  if (labelLayer) labelLayer.update(camera, root, window.innerWidth, window.innerHeight, camera.position.length());

  if (globe && vertexRegion) {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(globe.points, false);
    let hovered = null;
    for (const h of hits) {
      const id = vertexRegion[h.index];
      if (id) { hovered = id; break; }
    }
    if (hovered) cursorLabel.show((idToName.get(hovered) || hovered).toUpperCase(), pointerPx.x, pointerPx.y);
    else cursorLabel.hide();
  }

  requestAnimationFrame(animate);
}

// Start rendering immediately (globe loads asynchronously)
animate();
loadGlobe().catch((err) => console.error('[globe] failed to load points:', err));
