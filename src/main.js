import * as THREE from 'three';
import { GLOBE_RADIUS } from './config.js';
import { createPointsObject, createBordersObject } from './globe.js';

const THEME = { bg: '#0d0d0f', dot: '#f2f2f2', border: '#555', text: '#f2f2f2' };

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

async function loadGlobe() {
  const data = await fetch('data/points.json').then((r) => r.json());
  const obj = createPointsObject(data.points, GLOBE_RADIUS, THEME);
  root.add(obj.points);
  const borderData = await fetch('data/borders.json').then((r) => r.json());
  root.add(createBordersObject(borderData.segments, GLOBE_RADIUS, THEME));
  return obj;
}

function animate() {
  root.rotation.y += 0.0009; // slow auto-rotation
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// Start rendering immediately (globe loads asynchronously)
animate();
loadGlobe().catch((err) => console.error('[globe] failed to load points:', err));
