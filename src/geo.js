import * as THREE from 'three';

// Standard sphere mapping: lon=0,lat=0 -> +X; lat=+90 -> +Y.
export function latLonToVector3(lat, lon, radius) {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  return new THREE.Vector3(
    radius * cosPhi * Math.cos(lambda),
    radius * Math.sin(phi),
    -radius * cosPhi * Math.sin(lambda),
  );
}

// Project a world-space point to screen pixels. visible=false if behind camera.
export function vector3ToScreen(vec, camera, width, height) {
  const p = vec.clone().project(camera);
  return {
    x: (p.x * 0.5 + 0.5) * width,
    y: (-p.y * 0.5 + 0.5) * height,
    visible: p.z < 1,
  };
}

export function angularDistanceDeg(aLat, aLon, bLat, bLon) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return (2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 180) / Math.PI;
}
