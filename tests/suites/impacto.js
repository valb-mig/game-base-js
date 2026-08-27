import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { initFirearm } from '../../src/items/firearm.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { createBallistics } from '../../src/items/ballistics.js';
import { createDeform, DEFORM } from '../../src/world/deform.js';
import { turnedSoil } from '../../src/world/heightfield.js';
import {
  TERRAIN_BITE, PISTOL, MP40, KNIFE, SHOVEL, getClass
} from '../../src/items/classes.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;

/** Bancada: terreno plano escavável e uma balística ligada nele. */
function bancada() {
  const deform = createDeform();
  const terrain = { heightAt: (x, z) => deform.deltaAt(x, z) };
  const scene = new THREE.Scene();

  let impactos = 0;
  const ballistics = createBallistics(scene, [], {
    onTerrainImpact: (x, z, fundo) => {
      impactos++;
      deform.apply(x, z, -fundo);
    }
  });

  return {
    deform,
    terrain,
    ballistics,
    get impactos() { return impactos; },

    /** Dispara direto pra baixo, num ponto conhecido, e espera a bala chegar. */
    tiro(x, z, dig) {
      ballistics.spawn(
        new THREE.Vector3(x, 12, z),
        new THREE.Vector3(0, -1, 0),
        { damage: 10, range: 60, dig }
      );
      for (let i = 0; i < 60; i++) ballistics.update(DT, [], terrain);
    }
  };
}

/**
 * Põe o item na mão e ESPERA a troca terminar.
 *
 * Trocar de item leva tempo desde que guardar e sacar viraram animação: ler
 * `equipped` no mesmo quadro do `selectSlot` lê o item ANTIGO, porque a troca
 * acontece no fundo do movimento.
 */
function empunhar(player, indice) {
  player.selectSlot(indice);
  for (let i = 0; i < 600 && player.swapping; i++) player.advanceSwap(1 / 60);
  return player.equipped;
}

export function run() {
  suite('a escala de quem cava mais');

  // A ordem é a regra; os valores são só o jeito de expressá-la.
  ok('a pá cava mais que a primária', TERRAIN_BITE.SHOVEL > TERRAIN_BITE.PRIMARY,
    `${TERRAIN_BITE.SHOVEL} > ${TERRAIN_BITE.PRIMARY}`);
  ok('a primária cava mais que a secundária', TERRAIN_BITE.PRIMARY > TERRAIN_BITE.SECONDARY,
    `${TERRAIN_BITE.PRIMARY} > ${TERRAIN_BITE.SECONDARY}`);
  ok('a secundária cava mais que o corpo a corpo',
    TERRAIN_BITE.SECONDARY > TERRAIN_BITE.MELEE,
    `${TERRAIN_BITE.SECONDARY} > ${TERRAIN_BITE.MELEE}`);
  eq('e o corpo a corpo não cava nada', TERRAIN_BITE.MELEE, 0);

  eq('a pazada da pá usa a mesma escala', DEFORM.FUNDO, TERRAIN_BITE.SHOVEL);
  eq('a MP40 é a primária', MP40.firearm.dig, TERRAIN_BITE.PRIMARY);
  eq('a Colt é a secundária', PISTOL.firearm.dig, TERRAIN_BITE.SECONDARY);
  eq('a faca não tem mordida de terreno', KNIFE.melee.dig ?? 0, 0);
  eq('e nem é arma de fogo', KNIFE.firearm ?? null, null);

  suite('a arma na mão passa a mordida pra bala');

  // Regressão que só apareceu jogando: a balística marcava o terreno, a suíte
  // inteira passava, e no jogo não acontecia nada — porque firearm.js nunca
  // punha `dig` na bala. Todo teste daqui disparava a bala direto e informava
  // o valor na mão, ou seja exercitava a conta em vez do caminho. Este vai do
  // clique até a bala.
  initInput();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  const cena = new THREE.Scene();
  const chao = { heightAt: () => 0, waterDepthAt: () => 0, nivelDaAguaAt: () => 0 };

  const jogador = new Player(camera, document.body,
    { colliders: [], terrain: chao, spawn: new THREE.Vector3(0, 0, 0) });
  jogador.controls.isLocked = true;
  jogador.setClass(getClass('assault'));
  empunhar(jogador, jogador.carried.findIndex((item) => item?.firearm));

  const disparadas = [];
  const espiao = createBallistics(cena, []);
  const spawnOriginal = espiao.spawn;
  espiao.spawn = (origem, direcao, opcoes) => {
    disparadas.push(opcoes);
    return spawnOriginal(origem, direcao, opcoes);
  };

  const arma = initFirearm(jogador, { targets: [] }, espiao);

  const dispararCom = (id) => {
    disparadas.length = 0;
    empunhar(jogador, jogador.carried.findIndex((item) => item?.id === id));
    jogador.equipped.ammo.loaded = jogador.equipped.firearm.magazine;
    jogador.gun.cooldown = 0;
    jogador.gun.reloading = 0;
    dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    arma.update(DT);
    endFrame();
    return disparadas[0];
  };

  const daMao = dispararCom('m1911');
  eq('a pistola está na mão', jogador.equipped?.name, PISTOL.name);
  eq('um clique dispara uma bala', disparadas.length, 1);
  eq('e a bala leva a mordida da arma que a disparou', daMao?.dig, PISTOL.firearm.dig);
  ok('não zero', daMao?.dig > 0, `${daMao?.dig}`);

  // A escala não vale só nos números do catálogo: ela tem que chegar na bala
  // trocando de arma na mão, que é como o jogador a percebe.
  const daPrimaria = dispararCom('mp40');
  eq('trocando pra primária, a bala leva a mordida dela',
    daPrimaria?.dig, MP40.firearm.dig);
  ok('e a primária marca mais que a secundária',
    daPrimaria.dig > daMao.dig, `${daPrimaria.dig} > ${daMao.dig}`);

  suite('tiro no chão marca o terreno');

  const b = bancada();
  const antes = b.terrain.heightAt(0, 0);
  near('o chão começa plano', antes, 0, 1e-9);

  b.tiro(0, 0, PISTOL.firearm.dig);
  eq('a bala no chão vira impacto de terreno', b.impactos, 1);
  ok('e o chão afunda', b.terrain.heightAt(0, 0) < antes,
    `${(b.terrain.heightAt(0, 0) - antes).toFixed(3)} m`);

  suite('primária afunda mais que secundária');

  const c = bancada();
  c.tiro(-40, -40, PISTOL.firearm.dig);
  const daColt = -c.terrain.heightAt(-40, -40);

  c.tiro(40, 40, MP40.firearm.dig);
  const daMP40 = -c.terrain.heightAt(40, 40);

  ok('um tiro de primária cava mais fundo que um de secundária',
    daMP40 > daColt, `${daMP40.toFixed(3)} contra ${daColt.toFixed(3)}`);
  near('e na mesma proporção dos números',
    daMP40 / daColt, TERRAIN_BITE.PRIMARY / TERRAIN_BITE.SECONDARY, 0.02);
  note('um tiro', `Colt ${(daColt * 100).toFixed(1)} cm · MP40 ${(daMP40 * 100).toFixed(1)} cm`);

  suite('bala sem mordida não marca');

  const d = bancada();
  d.tiro(0, 0, 0);
  eq('bala com dig zero não chama impacto de terreno', d.impactos, 0);
  near('e o chão fica intacto', d.terrain.heightAt(0, 0), 0, 1e-9);

  suite('uma pazada vale muitos tiros');

  const e = bancada();
  let tiros = 0;
  while (-e.terrain.heightAt(0, 0) < DEFORM.FUNDO && tiros < 200) {
    e.tiro(0, 0, PISTOL.firearm.dig);
    tiros++;
  }
  between('afundar o que a pá faz numa pazada custa muitos tiros', tiros, 8, 200);
  note('tiros de pistola por pazada', `${tiros}`);

  suite('tiro raso ainda assim aparece');

  // Regressão do que dava pra ver jogando: a bala afundava o chão de verdade,
  // mas a cor saía da PROFUNDIDADE, e 2,6 cm pintavam 5% de terra. O tiro
  // funcionava e ninguém enxergava. Mover pouca terra e revolver toda ela são
  // coisas diferentes, e por isso o revolvido é camada à parte.
  const g = bancada();
  g.tiro(20, -20, PISTOL.firearm.dig);

  const fundo = -g.terrain.heightAt(20, -20);
  const revolvido = g.deform.revolvidoAt(20, -20);

  ok('um tiro só afunda pouquíssimo', fundo < 0.05, `${(fundo * 100).toFixed(1)} cm`);
  ok('pela profundidade sozinha a marca seria invisível',
    turnedSoil(fundo) < 0.1, `${(turnedSoil(fundo) * 100).toFixed(0)}% de terra`);
  ok('mas o chão fica revolvido do mesmo jeito',
    turnedSoil(fundo, revolvido) > 0.6,
    `${(turnedSoil(fundo, revolvido) * 100).toFixed(0)}% de terra`);

  // A marca não afina pra beirada — na resolução desta malha não há formato
  // abaixo da célula —, mas ela acaba: dois metros ao lado o capim está limpo.
  ok('e o chão longe do tiro continua limpo',
    turnedSoil(0, g.deform.revolvidoAt(26, -20)) < 0.1,
    `${(g.deform.revolvidoAt(26, -20) * 100).toFixed(0)}% a 6 m`);

  suite('a marca tem largura mínima');

  // Regressão: abaixo do espaçamento da malha, a marca caía entre dois
  // vértices e não registrava — dois tiros iguais faziam coisas diferentes
  // conforme onde caíssem na grade.
  const f = bancada();
  let registrou = 0;
  for (let i = 0; i < 12; i++) {
    const x = -60 + i * 0.37;   // desliza dentro de uma célula da grade
    const alturaAntes = f.terrain.heightAt(x, 20);
    f.tiro(x, 20, PISTOL.firearm.dig);
    if (f.terrain.heightAt(x, 20) < alturaAntes - 1e-6) registrou++;
  }
  eq('todo tiro no chão deixa marca, caia onde cair', registrou, 12);

  suite('a pazada também revolve');

  const h = bancada();
  h.deform.apply(0, 60, -DEFORM.FUNDO);
  ok('cavar com a pá expõe terra', h.deform.revolvidoAt(0, 60) > 0.6,
    `${h.deform.revolvidoAt(0, 60).toFixed(2)}`);

  h.deform.apply(0, 90, DEFORM.MONTE);
  ok('e aterrar também: monte de terra fresca é terra',
    h.deform.revolvidoAt(0, 90) > 0.6, `${h.deform.revolvidoAt(0, 90).toFixed(2)}`);

  const i = bancada();
  eq('chão intocado não tem marca nenhuma', i.deform.revolvidoAt(0, 0), 0);
}
