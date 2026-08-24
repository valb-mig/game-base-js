import * as THREE from 'three';
import { WORLD } from '../config.js';
import { createTerrain } from './terrain.js';
import { createHeightfield, assertFlatZones } from './heightfield.js';
import { createWater } from './water.js';
import { addForest } from './forest.js';
import { addBase } from './base.js';
import { addTrainingCourse } from './course.js';

/** Sorteio determinístico: o mapa tem que sair igual toda vez. */
function seededRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const BASE_PLATFORM = 24;   // raio achatado sob cada base
const COURSE_PLATFORM = 30;

/**
 * Monta a ilha e devolve o que o resto do jogo precisa: os colisores, o
 * campo de altura (a colisão amostra ele) e o ponto de nascimento.
 *
 * A ordem importa: as zonas planas precisam ser decididas antes do terreno,
 * porque é o terreno que as aplica. Por isso um campo de sondagem sem zona
 * nenhuma é criado primeiro, só pra ler a altura natural onde as bases vão.
 */
export function buildWorld(scene) {
  const probe = createHeightfield([]);
  const north = { x: 0, z: -WORLD.BASE_DISTANCE };
  const south = { x: 0, z: WORLD.BASE_DISTANCE };
  const course = WORLD.COURSE_ORIGIN;

  const flatZones = assertFlatZones([
    { ...north, radius: BASE_PLATFORM, blend: 18, height: probe.naturalHeight(north.x, north.z) },
    { ...south, radius: BASE_PLATFORM, blend: 18, height: probe.naturalHeight(south.x, south.z) },
    { ...course, radius: COURSE_PLATFORM, blend: 18, height: probe.naturalHeight(course.x, course.z) }
  ]);

  const terrain = createTerrain(flatZones);
  scene.add(terrain.buildMesh());

  const water = createWater();
  scene.add(water.mesh);

  const colliders = [];

  const northGround = terrain.heightAt(north.x, north.z);
  const southGround = terrain.heightAt(south.x, south.z);
  addBase(scene, colliders, {
    name: 'BASE NORTE', ...north, ground: northGround, facing: 1, color: 0xd94f4f
  });
  addBase(scene, colliders, {
    name: 'BASE SUL', ...south, ground: southGround, facing: -1, color: 0x3f7ad9
  });

  const courseGround = terrain.heightAt(course.x, course.z);
  addTrainingCourse(scene, colliders, { origin: course, ground: courseGround });

  // nada de árvore dentro de base, do campo de treino, ou no caminho entre eles
  const occupied = [
    { ...north, radius: BASE_PLATFORM + 4 },
    { ...south, radius: BASE_PLATFORM + 4 },
    { x: course.x, z: course.z, radius: COURSE_PLATFORM + 4 }
  ];
  const blocked = (x, z) => occupied.some(
    (zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius
  );

  const counts = addForest(scene, colliders, {
    heightAt: terrain.heightAt,
    blocked,
    rng: seededRandom(20250824)
  });

  return {
    colliders,
    terrain,
    water,
    bases: [
      { id: 'norte', short: 'Norte', name: 'Base Norte', position: new THREE.Vector3(north.x, northGround, north.z) },
      { id: 'sul', short: 'Sul', name: 'Base Sul', position: new THREE.Vector3(south.x, southGround, south.z) }
    ],
    spawn: new THREE.Vector3(north.x, northGround, north.z + 12),
    stats: { ...counts, colliders: colliders.length }
  };
}
