import * as THREE from 'three';
import { latLonToVector3 } from './geo.js';

// Per-category visual style (CSS px sizes + base opacity)
const CATEGORY_STYLE = {
  coast:  { size: 5.0, opacity: 0.70 },
  land:   { size: 3.3, opacity: 0.25 },
  border: { size: 4.2, opacity: 0.40 },
};
const CATEGORY_FALLBACK = { size: 3.3, opacity: 0.35 };

export function buildPointsGeometry(points, radius) {
  const n = points.length;
  const positions = new Float32Array(n * 3);
  const colors    = new Float32Array(n * 3);
  const sizes     = new Float32Array(n);
  const opacities = new Float32Array(n);
  const regionIndexMap = new Map();

  for (let i = 0; i < n; i++) {
    const p = points[i];
    const v = latLonToVector3(p.lat, p.lon, radius);
    positions[i * 3]     = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;

    const style = CATEGORY_STYLE[p.category] ?? CATEGORY_FALLBACK;
    sizes[i]     = style.size;
    opacities[i] = style.opacity;

    // Only index non-null regionIds
    if (p.regionId != null) {
      if (!regionIndexMap.has(p.regionId)) regionIndexMap.set(p.regionId, []);
      regionIndexMap.get(p.regionId).push(i);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color',    new THREE.BufferAttribute(colors,    3));
  geometry.setAttribute('aSize',    new THREE.BufferAttribute(sizes,     1));
  geometry.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1));
  return { geometry, regionIndexMap };
}

export function createPointsObject(points, radius, theme) {
  const { geometry, regionIndexMap } = buildPointsGeometry(points, radius);

  // Set base color = theme.dot for ALL points
  const base = new THREE.Color(theme.dot);
  const colorAttr = geometry.getAttribute('color');
  for (let i = 0; i < points.length; i++) {
    colorAttr.setXYZ(i, base.r, base.g, base.b);
  }
  const baseColors  = Float32Array.from(colorAttr.array);
  const aOpacityAttr = geometry.getAttribute('aOpacity');
  const baseOpacity = Float32Array.from(aOpacityAttr.array);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uCamDist:   { value: 2.4 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uRefDist:   { value: 1.4 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float aSize;
      attribute float aOpacity;
      attribute vec3 color;
      uniform float uCamDist;
      uniform float uPixelRatio;
      uniform float uRefDist;
      varying float vDepth;
      varying float vOpacity;
      varying vec3 vColor;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = mv.z + uCamDist;     // ~+1 near pole, ~-1 far pole (radius 1)
        vOpacity = aOpacity;
        vColor = color;
        float atten = uRefDist / max(-mv.z, 0.1);
        gl_PointSize = aSize * uPixelRatio * atten;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying float vDepth;
      varying float vOpacity;
      varying vec3 vColor;
      void main() {
        vec2 d = gl_PointCoord - vec2(0.5);
        if (dot(d, d) > 0.25) discard;            // round dot
        float depthFade = smoothstep(-1.0, 1.0, vDepth);
        float alpha = vOpacity * mix(0.25, 1.0, depthFade); // far side dimmer
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
  });

  const pointsObj = new THREE.Points(geometry, material);
  return { points: pointsObj, geometry, regionIndexMap, baseColors, baseOpacity };
}
