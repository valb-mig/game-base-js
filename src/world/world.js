import * as THREE from 'three';
import { WORLD } from '../config.js';
import { createTerrain } from './terrain.js';
import { createDeform, DEFORM } from './deform.js';
import { createSettling } from './settling.js';
import { createHeightfield, assertFlatZones } from './heightfield.js';
import { PLAYER } from '../config.js';
import { spawnIsClear } from '../player/collision.js';
import { createWater } from './water.js';
import { createRiver } from './river.js';
import { addHorizonte } from './horizonte.js';
import { addCostura } from './costura.js';
import { addBridges } from './bridge.js';
import { addForest } from './forest.js';
import { addBushes } from './bushes.js';
import { sorteioFixo } from './props.js';
import { ListaDeColisores } from './colisores.js';
import { addBase } from './base.js';
import { addOutposts } from './outposts.js';
import { addLogistica } from './logistica.js';
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

/**
 * Bandeira dentro de parede não se captura.
 *
 * Cada ponto agora ergue o próprio cenário — casa, celeiro, casamata — e os
 * quatro mastros continuam no miolo dele. Uma construção que avance sobre o
 * quadrado deixa a bandeira inalcançável, e o sintoma disso é um ponto que
 * simplesmente não pode ser tomado: nenhum erro, nenhuma pista, e a partida
 * inteira trava num objetivo impossível. Melhor estourar montando o mapa.
 *
 * O teste é o do NASCIMENTO, e não por acaso: quem captura tem que caber em
 * pé ao lado do mastro pra segurar o F, que é exatamente o que ele mede.
 */
function assertFlagsClear(outposts, colliders, terrain) {
  for (const posto of outposts) {
    for (const flag of posto.flags) {
      const chao = terrain.heightAt(flag.x, flag.z);
      if (spawnIsClear(colliders, flag.x, flag.z, chao, PLAYER.HEIGHT)) continue;
      throw new Error(
        `bandeira de "${posto.name}" em (${flag.x.toFixed(0)}, ${flag.z.toFixed(0)}) ` +
        'está dentro de geometria: o ponto não poderia ser capturado'
      );
    }
  }
  return outposts;
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

  // O rio tem lâmina própria, 7,9 m acima do mar. Duas malhas porque são duas
  // águas: um plano só não pode estar em dois níveis.
  const river = createRiver(terrain.riverBedAt);
  scene.add(river.mesh);

  /**
   * O relevo falso que fecha o horizonte, e a saia que fecha a costura dele.
   *
   * Não entra em `colliders` nem em `settling`, e não é consultado por
   * `heightAt`: ele fica FORA do quadrado jogável, onde `locomotion.js` já
   * prende o jogador. Ver `serra.js` — a seta aponta num sentido só.
   */
  addHorizonte(scene, terrain);
  addCostura(scene, terrain);

  const colliders = new ListaDeColisores();

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

  /**
   * A logística das duas bases: tenda de tratamento e paiol de munição.
   *
   * Base entra aqui e não em `addBase` porque ela é a mesma peça dos postos, e
   * duas cópias do desenho se separariam no primeiro ajuste. Depois de
   * `addBase`, de propósito: a tenda confere se o miolo dela está livre, e pra
   * isso o perímetro, a torre e o bunker já têm que estar na lista.
   */
  const logisticaDeBase = [
    { team: 'karnia', ...north, onde: `Base ${TEAMS.karnia.short}` },
    { team: 'vestria', ...south, onde: `Base ${TEAMS.vestria.short}` }
  ].map((base) => ({
    team: base.team,
    ...addLogistica(scene, colliders, {
      id: 'base', x: base.x, z: base.z, terrain, settling, onde: base.onde
    })
  }));

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
  // As pontes entram DEPOIS dos postos: o ponto 05 é posicionado pelo leito e
  // teria estourado o teste de ocupação contra a própria ponte que ele guarda.
  // Elas entram no `occupied` logo em seguida, e como `blocked` lê a lista na
  // hora da chamada, a floresta (montada abaixo) já as respeita.
  const bridges = addBridges(scene, colliders, { terrain });
  for (const ponte of bridges) {
    occupied.push({
      x: ponte.x, z: ponte.z, name: 'ponte',
      radius: ponte.comprimento / 2 + 14
    });
  }

  // O que se mexe sozinho no mapa. Hoje são as pás do moinho; o laço de
  // render chama todos sem saber o que são.
  const animados = outposts
    .map((posto) => posto.local?.update)
    .filter(Boolean);

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

  /**
   * As zonas de tratamento do mapa, numa lista só.
   *
   * `game/tratamento.js` não conhece posto nem base: ele pergunta de quem é a
   * zona, e quem responde é o `post` (dominado e em paz) ou o `team` fixo da
   * base — não há captura de base, então quem manda ali não muda. A lista é de
   * DADO: x, z e de quem é. Nada de malha atravessa essa fronteira.
   */
  const enfermarias = [
    ...logisticaDeBase.map((base) => ({
      x: base.enfermaria.x, z: base.enfermaria.z, team: base.team, post: null
    })),
    ...outposts.filter((posto) => posto.enfermaria).map((posto) => ({
      x: posto.enfermaria.x, z: posto.enfermaria.z, team: null, post: posto
    }))
  ];

  const counts = addForest(scene, colliders, {
    heightAt: terrain.heightAt,
    tipoAt: terrain.tipoAt,
    blocked,
    rng: sorteioFixo(20250824),
    settling
  });

  // Arbusto não entra em `colliders` nem em `settling`: ele não barra
  // ninguém, e descalçado ele vem abaixo em vez de tombar.
  const bushes = addBushes(scene, {
    heightAt: terrain.heightAt,
    tipoAt: terrain.tipoAt,
    blocked,
    rng: sorteioFixo(20250825)
  });

  assertSpawnZones(spawnZones, colliders, terrain);
  assertFlagsClear(outposts, colliders, terrain);

  return {
    colliders,
    terrain,
    deform,

    /**
     * Onde há veículo no mapa, e é o MAPA que diz — como ele já diz onde se
     * desembarca e o que existe em cada ponto. Um em cada base: num mapa de
     * dois quilômetros, o jipe é a diferença entre entrar na briga e caminhar
     * até ela. Nariz pra fora da base, que é pra onde se vai.
     */
    garagem: [
      { x: north.x + 14, z: north.z + 4, yaw: Math.PI },
      { x: south.x + 14, z: south.z + 4, yaw: Math.PI }
    ],

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
      bushes.disturb(x, z, radius);
      return true;
    },

    water,
    river,
    bridges,
    enfermarias,
    animados,
    bushes,
    targets,
    outposts,
    spawnZones,
    bases: [
      { id: 'norte', short: 'Norte', name: 'Base Norte', position: new THREE.Vector3(north.x, northGround, north.z) },
      { id: 'sul', short: 'Sul', name: 'Base Sul', position: new THREE.Vector3(south.x, southGround, south.z) }
    ],
    spawn: new THREE.Vector3(north.x, northGround, north.z + 12),
    stats: {
      ...counts, arbustos: bushes.count,
      alvos: targets.length, postos: outposts.length, pontes: bridges.length,
      enfermarias: enfermarias.length,
      colliders: colliders.length
    }
  };
}
