import * as THREE from 'three';
import { latLonToVector3 } from './geo.js';

// Per-tier base appearance (theme-aware base color is applied in createPointsObject).
export const TIER_INTENSITY = { contour: 1.0, fill: 0.45 };

export function buildPointsGeometry(points, radius) {
  const n = points.length;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const regionIndexMap = new Map();

  for (let i = 0; i < n; i++) {
    const p = points[i];
    const v = latLonToVector3(p.lat, p.lon, radius);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
    if (!regionIndexMap.has(p.regionId)) regionIndexMap.set(p.regionId, []);
    regionIndexMap.get(p.regionId).push(i);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return { geometry, regionIndexMap };
}

export function createPointsObject(points, radius, theme) {
  const { geometry, regionIndexMap } = buildPointsGeometry(points, radius);
  const base = new THREE.Color(theme.dot);
  const colorAttr = geometry.getAttribute('color');
  for (let i = 0; i < points.length; i++) {
    const k = TIER_INTENSITY[points[i].tier] ?? 0.6;
    colorAttr.setXYZ(i, base.r * k, base.g * k, base.b * k);
  }
  const baseColors = Float32Array.from(colorAttr.array);

  const material = new THREE.PointsMaterial({
    size: 0.01,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,      // transparent globe: far-side points show through
    sizeAttenuation: true,
  });
  const pointsObj = new THREE.Points(geometry, material);
  return { points: pointsObj, geometry, regionIndexMap, baseColors };
}
