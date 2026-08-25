import * as THREE from 'three';
import { WORLD } from '../config.js';
import { createTerrain } from './terrain.js';
import { createDeform, DEFORM } from './deform.js';
import { createSettling } from './settling.js';
import { createHeightfield, assertFlatZones } from './heightfield.js';
import { PLAYER } from '../config.js';
import { spawnIsClear } from '../player/collision.js';
import { createWater } from './water.js';
import { addForest } from './forest.js';
import { addBase } from './base.js';
import { addOutposts } from './outposts.js';
import { TEAMS } from '../game/teams.js';

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
  const north = WORLD.BASE_KARNIA;
  const south = WORLD.BASE_VESTRIA;

  const flatZones = assertFlatZones([
    { ...north, radius: BASE_PLATFORM, blend: 18, height: probe.naturalHeight(north.x, north.z) },
    { ...south, radius: BASE_PLATFORM, blend: 18, height: probe.naturalHeight(south.x, south.z) },
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

  // Quem perde o chão desaba. Registrado na construção do mapa pra que a
  // pazada só precise perguntar "o que tem por perto".
  // A lista de colisores vai junto: prop que tomba na diagonal ganha caixas
  // extras, e elas precisam entrar no mundo.
  const settling = createSettling(terrain, colliders);

  const northGround = terrain.heightAt(north.x, north.z);
  const southGround = terrain.heightAt(south.x, south.z);
  addBase(scene, colliders, {
    name: TEAMS.karnia.short, ...north, ground: northGround,
    facing: -1, color: TEAMS.karnia.color, settling
  });
  addBase(scene, colliders, {
    name: TEAMS.vestria.short, ...south, ground: southGround,
    facing: -1, color: TEAMS.vestria.color, settling
  });

  // Sem campo de treino aqui: ele é um mapa à parte, com regra própria.
  const targets = [];

  // nada de árvore dentro de base, do campo de treino, ou no caminho entre eles
  const occupied = [
    { ...north, radius: BASE_PLATFORM + 4, name: 'Base Karnia' },
    { ...south, radius: BASE_PLATFORM + 4, name: 'Base Vestria' },
  ];

  // Os doze postos entram antes da floresta: eles empurram árvore, não o
  // contrário. `occupied` cresce dentro de addOutposts com o raio de cada um.
  const outposts = addOutposts(scene, colliders,
    { terrain, settling, occupied, campo: probe });
  const blocked = (x, z) => occupied.some(
    (zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius
  );

  // Zonas de nascimento. Ficam sobre terreno seco, longe de construção —
  // é o que a tela de deploy oferece como escolha de onde entrar.
  // Onde dá pra desembarcar: a base principal de cada time, que é sempre
  // dela, mais um ponto por posto. Quais postos valem AGORA é decisão da
  // partida, não do mapa — aqui só existe o lugar.
  const spawnZones = [
    {
      id: 'base-karnia', name: `Base ${TEAMS.karnia.short}`, team: 'karnia',
      base: true, x: north.x, z: north.z - 30, radius: 16
    },
    {
      id: 'base-vestria', name: `Base ${TEAMS.vestria.short}`, team: 'vestria',
      base: true, x: south.x, z: south.z - 30, radius: 16
    },
    ...outposts.map((posto) => ({
      id: posto.id, name: `${posto.numero}. ${posto.name}`, team: posto.startTeam,
      base: false, post: posto, x: posto.x, z: posto.z + 7, radius: 10
    }))
  ];

  const counts = addForest(scene, colliders, {
    heightAt: terrain.heightAt,
    blocked,
    rng: seededRandom(20250824),
    settling
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
    settling,

    reshape(x, z, amount, radius = DEFORM.RAIO) {
      const tocados = deform.apply(x, z, amount, radius);
      if (tocados.length === 0) return false;
      chao.applyEdit(tocados);
      // o que ficou sem chão em volta começa a desabar
      settling.disturb(x, z, radius);
      return true;
    },

    water,
    targets,
    outposts,
    spawnZones,
    bases: [
      { id: 'norte', short: 'Norte', name: 'Base Norte', position: new THREE.Vector3(north.x, northGround, north.z) },
      { id: 'sul', short: 'Sul', name: 'Base Sul', position: new THREE.Vector3(south.x, southGround, south.z) }
    ],
    spawn: new THREE.Vector3(north.x, northGround, north.z + 12),
    stats: {
      ...counts, alvos: targets.length, postos: outposts.length,
      colliders: colliders.length
    }
  };
}
