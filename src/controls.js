import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ZOOM_MIN, ZOOM_MAX } from './config.js';

export function createControls(camera, domElement) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.8;
  controls.minDistance = ZOOM_MIN;
  controls.maxDistance = ZOOM_MAX;
  return controls;
}

export function makeIdleAutoRotate({ idleMs }) {
  let lastInteract = -Infinity;
  return {
    onInteract(now) { lastInteract = now; },
    shouldAutoRotate(now) { return now - lastInteract >= idleMs; },
  };
}
