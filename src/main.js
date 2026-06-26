import * as THREE from 'three';
import {
  GLOBE_RADIUS, HIGHLIGHT_COLOR, HIGHLIGHT_OPACITY_BOOST,
  CAMERA_START_DIST, ROTATION_SPEED, RAYCAST_THRESHOLD,
} from './config.js';
import { createPointsObject } from './globe.js';
import { buildHighlightSet, applyHighlights } from './highlight.js';
import { createControls } from './controls.js';
import { createLabelLayer, createCursorLabel, zoomTier, shouldShowHoverLabel } from './labels.js';
import { createThemeController } from './theme.js';
import highlights from '../data/highlights.json';

// --- Module-scoped refs for recolor ----------------------------------------
let globe = null;
let loadedPoints = null;
let highlightSet = null;

// --- Theme setup -----------------------------------------------------------
let THEME;
const themeCtl = createThemeController({
  onChange: (colors) => {
    THEME = colors;
    if (globe) recolorGlobe(colors);
  },
});
THEME = themeCtl.colors();
document.getElementById('theme-toggle').addEventListener('click', () => themeCtl.toggle());

function recolorGlobe(colors) {
  if (!globe || !loadedPoints) return;
  const base = new THREE.Color(colors.dot);
  // All points get the same base color (no per-category tint)
  for (let i = 0; i < loadedPoints.length; i++) {
    globe.baseColors[i * 3]     = base.r;
    globe.baseColors[i * 3 + 1] = base.g;
    globe.baseColors[i * 3 + 2] = base.b;
  }
  applyHighlights(globe.geometry, globe.regionIndexMap, globe.baseColors, globe.baseOpacity, highlightSet || new Set(), HIGHLIGHT_COLOR, HIGHLIGHT_OPACITY_BOOST);
}

// --- Scene setup -----------------------------------------------------------
let labelLayer = null;
let vertexRegion = null;
let idToName = null;

const overlayEl = document.getElementById('overlay');
const cursorLabel = createCursorLabel({ overlayEl });
const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = RAYCAST_THRESHOLD;
const pointer = new THREE.Vector2();
let pointerPx = { x: 0, y: 0 };

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

renderer.domElement.addEventListener('pointermove', (e) => {
  pointerPx = { x: e.clientX, y: e.clientY };
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
camera.position.set(0, 0, CAMERA_START_DIST);

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

// --- Drag-only pause: auto-rotation pauses ONLY while left mouse button is held ---
let leftDown = false;
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.button === 0) leftDown = true; });
window.addEventListener('pointerup',     () => { leftDown = false; });
window.addEventListener('pointercancel', () => { leftDown = false; });

async function loadGlobe() {
  const data = await fetch('data/points.json').then((r) => r.json());
  loadedPoints = data.points;
  const obj = createPointsObject(data.points, GLOBE_RADIUS, THEME);
  root.add(obj.points);

  // Apply highlights
  const regions = await fetch('data/regions.json').then((r) => r.json());
  const validIds = new Set(regions.map((r) => r.id));
  const { set, unknown } = buildHighlightSet(highlights, validIds);
  if (unknown.length) console.warn('[highlights] unknown region ids ignored:', unknown);
  highlightSet = set;
  applyHighlights(obj.geometry, obj.regionIndexMap, obj.baseColors, obj.baseOpacity, set, HIGHLIGHT_COLOR, HIGHLIGHT_OPACITY_BOOST);

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
}

function animate() {
  // pause ONLY while the left mouse button is held (drag); scroll/zoom does not pause.
  if (!leftDown) root.rotation.y += ROTATION_SPEED;
  controls.update();
  renderer.render(scene, camera);
  if (labelLayer) labelLayer.update(camera, root, window.innerWidth, window.innerHeight, camera.position.length());

  // Update ShaderMaterial uniform for depth fade
  if (globe) {
    globe.points.material.uniforms.uCamDist.value = camera.position.length();
  }

  if (globe && vertexRegion) {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(globe.points, false);
    let hovered = null;
    for (const h of hits) {
      const id = vertexRegion[h.index];
      if (id) { hovered = id; break; }
    }
    // Only show the cursor pill when zoomed out (far tier); the markers name countries otherwise.
    if (shouldShowHoverLabel(zoomTier(camera.position.length()), hovered)) {
      cursorLabel.show((idToName.get(hovered) || hovered).toUpperCase(), pointerPx.x, pointerPx.y);
    } else {
      cursorLabel.hide();
    }
  }

  requestAnimationFrame(animate);
}

// Start rendering immediately (globe loads asynchronously)
animate();
loadGlobe().catch((err) => console.error('[globe] failed to load points:', err));
