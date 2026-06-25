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

export function applyHighlights(geometry, regionIndexMap, baseColors, baseOpacity, set, colorHex, highlightOpacity) {
  const colorAttr   = geometry.getAttribute('color');
  const opacityAttr = geometry.getAttribute('aOpacity');

  // Restore everything first
  colorAttr.array.set(baseColors);
  opacityAttr.array.set(baseOpacity);

  const c = new THREE.Color(colorHex);
  for (const id of set) {
    const indices = regionIndexMap.get(id);
    if (!indices) continue;
    for (const i of indices) {
      colorAttr.setXYZ(i, c.r, c.g, c.b);
      opacityAttr.array[i] = highlightOpacity;
    }
  }

  colorAttr.needsUpdate   = true;
  opacityAttr.needsUpdate = true;
}
