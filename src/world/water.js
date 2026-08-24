import * as THREE from 'three';
import { WORLD } from '../config.js';

/**
 * Superfície do mar: um plano translúcido no nível da água, com ondulação
 * leve nos vértices. Vai bem além do mapa pra não aparecer borda no
 * horizonte, e é `DoubleSide` porque de dentro d'água se olha por baixo.
 */
export function createWater() {
  const size = WORLD.SIZE * 2.2;
  const geometry = new THREE.PlaneGeometry(size, size, 48, 48);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;
  const base = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    base[i * 2] = position.getX(i);
    base[i * 2 + 1] = position.getZ(i);
  }

  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
    color: WORLD.WATER_COLOR,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    flatShading: true
  }));
  mesh.position.y = WORLD.WATER_LEVEL;
  mesh.name = 'mar';

  function update(time) {
    for (let i = 0; i < position.count; i++) {
      const x = base[i * 2];
      const z = base[i * 2 + 1];
      position.setY(i,
        Math.sin(x * 0.035 + time * 0.9) * 0.16 +
        Math.sin(z * 0.052 - time * 1.3) * 0.12);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  return { mesh, update, applyUnderwater };
}

/**
 * Troca a névoa e o fundo quando a cabeça passa da linha d'água. É o que
 * vende o mergulho: sem isso, submergir não muda nada na tela.
 */
let submergedNow = false;
let dryFog = null;

export function applyUnderwater(scene, underwater) {
  if (underwater === submergedNow) return;
  submergedNow = underwater;

  if (underwater) {
    dryFog = { color: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far };
    scene.fog.color.setHex(WORLD.DEEP_WATER_COLOR);
    scene.fog.near = 0.4;
    scene.fog.far = 26;
    scene.background.setHex(WORLD.DEEP_WATER_COLOR);
    return;
  }

  scene.fog.color.copy(dryFog.color);
  scene.fog.near = dryFog.near;
  scene.fog.far = dryFog.far;
  scene.background.setHex(WORLD.SKY_COLOR);
}
