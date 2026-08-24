import * as THREE from 'three';

// Geometrias compartilhadas: todo prop do mundo sai daqui, uma alocação só.
export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const CONE = new THREE.ConeGeometry(1, 1, 6);
export const PYRAMID = new THREE.ConeGeometry(1, 1, 4);
export const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 8);
export const ROCK = new THREE.IcosahedronGeometry(1, 0);

const materials = new Map();

/** Materiais são caros de duplicar e a paleta é pequena — cacheia por cor. */
export function material(color) {
  if (!materials.has(color)) {
    materials.set(color, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  }
  return materials.get(color);
}

/**
 * Caixa posicionada pela base, não pelo centro — é assim que se pensa em
 * construção: "essa parede começa no chão e sobe 2 metros".
 */
export function addBox(scene, colliders, {
  x, y, z, w, h, d, color, rotation = 0, standable = true, solid = true
}) {
  const mesh = new THREE.Mesh(BOX, material(color));
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y + h / 2, z);
  mesh.rotation.y = rotation;
  scene.add(mesh);

  if (solid) {
    mesh.updateMatrixWorld(true);
    colliders.push({ box: new THREE.Box3().setFromObject(mesh), standable });
  }
  return mesh;
}

/** Placa flutuante desenhada num canvas — decoração, sem colisor. */
export function addLabel(scene, text, x, y, z, width = 3.4) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(15, 20, 15, 0.75)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
  sprite.position.set(x, y, z);
  sprite.scale.set(width, width / 4, 1);
  scene.add(sprite);
  return sprite;
}
