import * as THREE from 'three';

export function buildHighlightSet(highlightsData, validIds) {
  const set = new Set();
  const unknown = [];
  for (const id of Object.keys(highlightsData)) {
    if (validIds.has(id)) set.add(id);
    else unknown.push(id);
  }
  return { set, unknown };
}

export function applyHighlights(geometry, regionIndexMap, baseColors, set, colorHex) {
  const attr = geometry.getAttribute('color');
  attr.array.set(baseColors); // restore everything first
  const c = new THREE.Color(colorHex);
  for (const id of set) {
    const indices = regionIndexMap.get(id);
    if (!indices) continue;
    for (const i of indices) attr.setXYZ(i, c.r, c.g, c.b);
  }
  attr.needsUpdate = true;
}
