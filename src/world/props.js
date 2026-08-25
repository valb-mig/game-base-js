import * as THREE from 'three';
import { WORLD } from '../config.js';

// Geometrias compartilhadas: todo prop do mundo sai daqui, uma alocação só.
export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const CONE = new THREE.ConeGeometry(1, 1, 6);
export const PYRAMID = new THREE.ConeGeometry(1, 1, 4);
export const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 8);
export const ROCK = new THREE.IcosahedronGeometry(1, 0);

/**
 * Espalha `count` pontos pela ilha com rejeição: sorteia, e descarta o que cai
 * fora dos tipos de chão pedidos ou em área ocupada.
 *
 * Quem decide é o TIPO do chão, não a altura. Areia é deserta de propósito —
 * a praia de desembarque é o lugar mais aberto do mapa, e é isso que a faz
 * difícil. Com um limiar de altura, uma pedra pousava na areia e devolvia de
 * graça a cobertura que ela não tem.
 *
 * Mora aqui e não na floresta porque árvore, pedra e arbusto espalham do
 * mesmo jeito: duas cópias do laço se separariam no primeiro ajuste.
 */
export function espalhar(count, { heightAt, tipoAt, tipos, blocked, rng }) {
  const spots = [];
  const limite = WORLD.ISLAND_RADIUS * 0.99;
  let tentativas = 0;

  while (spots.length < count && tentativas < count * 40) {
    tentativas++;
    const angulo = rng() * Math.PI * 2;
    // raiz da uniforme espalha por área, não por raio — senão amontoa no centro
    const raio = Math.sqrt(rng()) * limite;
    const x = Math.cos(angulo) * raio;
    const z = Math.sin(angulo) * raio;

    if (!tipos.includes(tipoAt(x, z))) continue;
    if (blocked(x, z)) continue;
    spots.push({ x, y: heightAt(x, z), z, rng: rng() });
  }
  return spots;
}

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
  x, y, z, w, h, d, color, rotation = 0, standable = true, solid = true,
  settling = null
}) {
  const mesh = new THREE.Mesh(BOX, material(color));
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y + h / 2, z);
  mesh.rotation.y = rotation;
  scene.add(mesh);

  if (solid) {
    mesh.updateMatrixWorld(true);
    const collider = { box: new THREE.Box3().setFromObject(mesh), standable };
    colliders.push(collider);

    // Cavar embaixo de uma parede tem que derrubar a parede, não deixá-la
    // pendurada. Quem não passa `settling` simplesmente não desaba.
    settling?.register({
      x, z, baseY: y, radius: Math.max(w, d) * 0.5, collider,
      parts: [{ mesh }]
    });
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
