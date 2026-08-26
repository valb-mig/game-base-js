import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { updateView } from '../../src/player/view.js';
import { horizontalRight, headingDegrees } from '../../src/player/heading.js';
import { VIEW, CAMERA } from '../../src/config.js';
import { initInput } from '../../src/core/input.js';
import { suite, ok, eq, near, note } from '../assert.js';

const DT = 1 / 60;
const chao = { heightAt: () => 0, waterDepthAt: () => 0, nivelDaAguaAt: () => 0 };
const GRAU = Math.PI / 180;

/** Rolagem da câmera, em graus. Decodificada como o jogo compõe: YXZ. */
function rolagem(camera) {
  return new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').z / GRAU;
}

function inclinacao(camera) {
  return new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').x / GRAU;
}

export function run() {
  initInput();
  const camera = new THREE.PerspectiveCamera(CAMERA.FOV, 1, 0.1, 400);
  const player = new Player(camera, document.body, {
    colliders: [], terrain: chao, spawn: new THREE.Vector3(0, 0, 0)
  });
  player.controls.isLocked = true;
  const rodar = (n) => { for (let i = 0; i < n; i++) updateView(player, DT); };
  const parar = () => {
    player.velocity.set(0, 0, 0);
    player.recoil.pendente = 0;
    player.recoil.aplicado = 0;
    player.shake = 0;
    player.lean = 0;
    player.rollImpulse = 0;
    player.bobPhase = 0;
    camera.quaternion.identity();
    rodar(30);
  };

  suite('a vista inclina pra quem anda de lado');

  parar();
  near('parado a câmera está reta', rolagem(camera), 0, 0.05);

  // Andar de lado é o que inclina, e o LADO decide o sinal: com os dois iguais
  // a inclinação vira enfeite simétrico e não conta nada.
  player.velocity.set(player.stats.RUN_SPEED, 0, 0);   // direita do mundo, olhando pro norte
  rodar(60);
  const paraDireita = rolagem(camera);
  ok('andando pra direita ela inclina', Math.abs(paraDireita) > 0.5,
    `${paraDireita.toFixed(2)}°`);

  player.velocity.set(-player.stats.RUN_SPEED, 0, 0);
  rodar(60);
  const paraEsquerda = rolagem(camera);
  ok('e pro outro lado ela inclina ao contrário', paraDireita * paraEsquerda < 0,
    `${paraEsquerda.toFixed(2)}°`);
  ok('sem passar do teto declarado',
    Math.abs(paraDireita) <= VIEW.LEAN_MAX + 0.3
    && Math.abs(paraEsquerda) <= VIEW.LEAN_MAX + 0.3);
  note('teto de inclinação', `${VIEW.LEAN_MAX}°`);

  player.velocity.set(0, 0, 0);
  rodar(90);
  near('parar devolve a câmera ao prumo', rolagem(camera), 0, 0.1);

  suite('a inclinação não vira direção de movimento');

  // O eixo X local da câmera sai do horizontal assim que a vista rola, e por
  // isso a direção do movimento passou a sair do yaw decodificado em YXZ. Com
  // a câmera rolada E inclinada, o rumo tem que continuar o mesmo.
  const reto = new THREE.Vector3();
  const rolado = new THREE.Vector3();
  const q = new THREE.Euler(0, 0, 0, 'YXZ');

  q.set(-45 * GRAU, 30 * GRAU, 0);
  camera.quaternion.setFromEuler(q);
  horizontalRight(camera.quaternion, reto);
  const rumoReto = headingDegrees(camera.quaternion, new THREE.Vector3());

  q.set(-45 * GRAU, 30 * GRAU, 8 * GRAU);   // exagerado de propósito
  camera.quaternion.setFromEuler(q);
  horizontalRight(camera.quaternion, rolado);
  const rumoRolado = headingDegrees(camera.quaternion, new THREE.Vector3());

  near('a direita horizontal não muda com a vista rolada',
    rolado.angleTo(reto) / GRAU, 0, 0.001);
  near('nem o rumo da bússola', rumoRolado, rumoReto, 0.001);
  note('rolagem do teste', '8° com o olhar 45° pra baixo');

  suite('o tiro levanta a mira, e ela volta sozinha');

  parar();
  const antes = inclinacao(camera);
  player.recoil.pendente = 1.5 * GRAU;
  rodar(12);
  const noPico = inclinacao(camera);
  ok('o coice sobe a mira', noPico > antes + 0.3, `${(noPico - antes).toFixed(2)}°`);

  rodar(120);
  const depois = inclinacao(camera);
  ok('e ela desce de volta', depois < noPico - 0.3, `${(depois - antes).toFixed(2)}° do início`);
  near('até onde estava', depois, antes, 0.15);

  // Ele SOBE em ritmo, não de uma vez: um salto seco some entre dois quadros
  // numa rajada e o jogador só vê a mira longe de onde deixou.
  parar();
  player.recoil.pendente = 20 * GRAU;
  updateView(player, DT);
  const umQuadro = inclinacao(camera);
  ok('nenhum quadro leva a mira embora sozinho', umQuadro < VIEW.RECOIL_RISE * DT + 0.05,
    `${umQuadro.toFixed(2)}° num quadro`);
  note('ritmo do coice', `${VIEW.RECOIL_RISE}°/s`);

  suite('levar tiro treme a vista, mas não a mira');

  parar();
  player.damage(10);
  eq('o dano arma o tremor', player.shake, 1);

  let picoTremor = 0;
  let picoPitch = 0;
  const miraAntes = inclinacao(camera);
  for (let i = 0; i < 60; i++) {
    updateView(player, DT);
    picoTremor = Math.max(picoTremor, Math.abs(rolagem(camera)));
    picoPitch = Math.max(picoPitch, Math.abs(inclinacao(camera) - miraAntes));
  }
  ok('a vista treme', picoTremor > 0.5, `${picoTremor.toFixed(2)}°`);
  ok('e o tremor é só rolagem: a mira de quem apanhou fica onde estava',
    picoPitch < 0.001, `${picoPitch.toFixed(4)}° de desvio`);

  rodar(180);
  near('o tremor passa', rolagem(camera), 0, 0.1);

  suite('correr abre o campo de visão');

  parar();
  eq('parado ele está fechado', player.viewSprint, 0);
  player.running = true;
  player.velocity.set(0, 0, -player.stats.RUN_SPEED);
  rodar(120);
  ok('correndo ele abre', player.viewSprint > 0.9, player.viewSprint.toFixed(2));
  note('abertura', `+${VIEW.SPRINT_FOV}° sobre ${CAMERA.FOV}°`);

  player.running = false;
  player.velocity.set(0, 0, 0);
  rodar(120);
  ok('e fecha de volta ao parar', player.viewSprint < 0.05, player.viewSprint.toFixed(2));

  suite('renascer limpa a vista');

  player.recoil.pendente = 3 * GRAU;
  player.recoil.aplicado = 3 * GRAU;
  player.shake = 1;
  player.rollImpulse = 0.05;
  player.respawn();
  eq('sem coice pendurado', player.recoil.pendente + player.recoil.aplicado, 0);
  eq('sem tremor', player.shake, 0);
  eq('sem solavanco', player.rollImpulse, 0);
}
