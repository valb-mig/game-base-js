import * as THREE from 'three';
import { WORLD } from '../config.js';
import { createTerrain } from './terrain.js';
import { createDeform } from './deform.js';
import { createHeightfield, assertFlatZones } from './heightfield.js';
import { PLAYER } from '../config.js';
import { spawnIsClear } from '../player/collision.js';
import { createWater } from './water.js';
import { addForest } from './forest.js';
import { addBase } from './base.js';
import { addTrainingCourse } from './course.js';

/**
 * Zona de nascimento dentro de geometria faz o jogador aparecer preso, sem
 * nada que ele possa fazer. Melhor estourar montando o mapa do que descobrir
 * jogando — foi assim que o campo de treino nasceu dentro de uma plataforma.
 */
function assertSpawnZones(zones, colliders, terrain) {
  for (const zone of zones) {
    const ground = terrain.heightAt(zone.x, zone.z);
    if (spawnIsClear(colliders, zone.x, zone.z, ground, PLAYER.HEIGHT)) continue;
    throw new Error(
      `zona de nascimento "${zone.name}" (${zone.x}, ${zone.z}) está dentro de geometria`
    );
  }
  return zones;
}

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

  // Camada escavável: a ilha continua sendo função pura de altura, e cavar
  // é um delta por cima dela. A malha e a colisão leem a mesma coisa.
  const deform = createDeform();
  const terrain = createTerrain(flatZones, deform);
  const chao = terrain.buildMesh();
  scene.add(chao.mesh);

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
  const targets = addTrainingCourse(scene, colliders, { origin: course, ground: courseGround });

  // nada de árvore dentro de base, do campo de treino, ou no caminho entre eles
  const occupied = [
    { ...north, radius: BASE_PLATFORM + 4 },
    { ...south, radius: BASE_PLATFORM + 4 },
    { x: course.x, z: course.z, radius: COURSE_PLATFORM + 4 }
  ];
  const blocked = (x, z) => occupied.some(
    (zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius
  );

  // Zonas de nascimento. Ficam sobre terreno seco, longe de construção —
  // é o que a tela de deploy oferece como escolha de onde entrar.
  const spawnZones = [
    { id: 'norte', name: 'Base Norte', x: north.x, z: north.z + 16, radius: 16 },
    { id: 'treino', name: 'Campo de treino', x: course.x - 16, z: course.z + 14, radius: 18 },
    { id: 'sul', name: 'Base Sul', x: south.x, z: south.z - 16, radius: 16 },
    { id: 'praia-leste', name: 'Praia leste', x: 128, z: 0, radius: 14 },
    { id: 'praia-oeste', name: 'Praia oeste', x: -128, z: 0, radius: 14 },
    { id: 'morro', name: 'Alto da ilha', x: 20, z: 40, radius: 14 }
  ];

  const counts = addForest(scene, colliders, {
    heightAt: terrain.heightAt,
    blocked,
    rng: seededRandom(20250824)
  });

  assertSpawnZones(spawnZones, colliders, terrain);

  return {
    colliders,
    terrain,
    deform,

    /**
     * Cava (amount negativo) ou aterra (positivo) em (x, z).
     * Devolve true se o terreno mudou de fato.
     */
    reshape(x, z, amount, radius) {
      const tocados = deform.apply(x, z, amount, radius);
      if (tocados.length === 0) return false;
      chao.applyEdit(tocados);
      return true;
    },

    water,
    targets,
    spawnZones,
    bases: [
      { id: 'norte', short: 'Norte', name: 'Base Norte', position: new THREE.Vector3(north.x, northGround, north.z) },
      { id: 'sul', short: 'Sul', name: 'Base Sul', position: new THREE.Vector3(south.x, southGround, south.z) }
    ],
    spawn: new THREE.Vector3(north.x, northGround, north.z + 12),
    stats: { ...counts, alvos: targets.length, colliders: colliders.length }
  };
}
