import * as THREE from 'three';
import { buildTrainingWorld } from '../../src/world/training-world.js';
import { Player } from '../../src/player/player.js';
import { initPlayerBody } from '../../src/player/body.js';
import { carregarSoldado, soldadoPronto } from '../../src/bots/model.js';
import { getClass } from '../../src/items/classes.js';
import { initInput } from '../../src/core/input.js';
import { suite, ok, near, note } from '../assert.js';

const DT = 1 / 60;

/** Extremos de uma malha do corpo ao longo do olhar, em metros. */
function aoLongoDoOlhar(grupo, nome, olho, frente) {
  const malha = grupo.getObjectByName(nome);
  if (!malha) return null;
  const caixa = new THREE.Box3().setFromObject(malha);
  const canto = new THREE.Vector3();
  let perto = Infinity, longe = -Infinity;
  for (const x of [caixa.min.x, caixa.max.x])
    for (const y of [caixa.min.y, caixa.max.y])
      for (const z of [caixa.min.z, caixa.max.z]) {
        const d = canto.set(x, y, z).sub(olho).dot(frente);
        perto = Math.min(perto, d);
        longe = Math.max(longe, d);
      }
  return { perto, longe, caixa };
}

export async function run() {
  initInput();

  suite('o corpo do jogador em primeira pessoa');

  await carregarSoldado();
  if (!soldadoPronto()) {
    ok('o modelo do soldado carregou', false);
    return;
  }

  const cena = new THREE.Scene();
  const mundo = buildTrainingWorld(cena);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 2000);
  const player = new Player(camera, null, mundo);
  cena.add(player.object);
  player.setClass(getClass('assault'));
  player.respawn();
  for (let i = 0; i < 40; i++) player.update(DT);

  const corpo = initPlayerBody(cena, player, { team: player.team });
  corpo.update();
  corpo.grupo.updateMatrixWorld(true);

  const olho = new THREE.Vector3(player.object.position.x, player.eyeY, player.object.position.z);
  const frente = new THREE.Vector3();
  player.object.getWorldDirection(frente);
  frente.y = 0;
  frente.normalize();

  // A regra que quebrou: o corpo nasceu virado pra dentro da câmera, e o
  // peito ficou 1,4 cm À FRENTE do olho — uma parede verde na tela inteira.
  const tronco = aoLongoDoOlhar(corpo.grupo, 'torso', olho, frente);
  ok('o peito existe no corpo', tronco !== null);
  note('peito ao longo do olhar (m)', `${tronco.perto.toFixed(3)} .. ${tronco.longe.toFixed(3)}`);
  // O peito é uma caixa de 29 cm centrada no tronco, e o olho fica dentro
  // dessa faixa como fica num corpo — o que não pode é o CENTRO dele vir
  // parar na frente do olho, que é o que acontecia com o corpo de costas.
  ok('o centro do peito fica atrás do olho', (tronco.perto + tronco.longe) / 2 < -0.02);

  const mochila = aoLongoDoOlhar(corpo.grupo, 'mochila', olho, frente);
  ok('e a mochila mais atrás que o peito', mochila.perto < tronco.perto);

  // E os pés na frente, senão olhar pra baixo não mostra perna nenhuma.
  const bota = aoLongoDoOlhar(corpo.grupo, 'bota_L', olho, frente);
  note('bota ao longo do olhar (m)', `${bota.perto.toFixed(3)} .. ${bota.longe.toFixed(3)}`);
  ok('a bota fica À FRENTE do olho', bota.longe > 0.05);

  // Altura: o corpo assenta nos pés do jogador, não na altura dos olhos.
  ok('a bota encosta no chão', Math.abs(bota.caixa.min.y - player.feetY) < 0.12);

  // A cabeça some: a câmera está dentro dela.
  for (const nome of ['cabeca', 'capacete']) {
    const malha = corpo.grupo.getObjectByName(nome);
    ok(`${nome} não é desenhado`, malha ? malha.visible === false : true);
  }

  // Só o giro, nunca a inclinação: olhar pro céu não deita o soldado.
  camera.rotation.x = -1.2;
  camera.updateMatrixWorld(true);
  corpo.update();
  near('olhar pra baixo não inclina o corpo', corpo.grupo.rotation.x, 0);

  // Espectador não tem corpo.
  player.spectating = true;
  corpo.update();
  ok('fantasma não desenha corpo', corpo.visible === false);
  player.spectating = false;
  corpo.update();
  ok('e de volta ao jogo ele volta', corpo.visible === true);
}
