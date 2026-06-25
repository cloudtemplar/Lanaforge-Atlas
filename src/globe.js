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

  // Depth cue: fade alpha for far-hemisphere points. uCamDist updated per frame from main.js.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCamDist = { value: 2.4 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uCamDist;\nvarying float vDepth;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vDepth = mvPosition.z + uCamDist;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vDepth;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );',
               'float depthFade = smoothstep(-1.0, 1.0, vDepth);\n  vec4 diffuseColor = vec4( diffuse, opacity * mix(0.2, 1.0, depthFade) );');
    material.userData.shader = shader;
  };

  const pointsObj = new THREE.Points(geometry, material);
  return { points: pointsObj, geometry, regionIndexMap, baseColors };
}

export function createBordersObject(segments, radius, theme) {
  const positions = new Float32Array(segments.length * 3);
  for (let i = 0; i < segments.length; i++) {
    const [lat, lon] = segments[i];
    const v = latLonToVector3(lat, lon, radius * 1.001); // a hair above the dots
    positions[i * 3] = v.x; positions[i * 3 + 1] = v.y; positions[i * 3 + 2] = v.z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(theme.border), transparent: true, opacity: 0.35, depthWrite: false,
  });
  return new THREE.LineSegments(geometry, material);
}
