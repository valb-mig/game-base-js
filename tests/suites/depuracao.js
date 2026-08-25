import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { initDebug } from '../../src/ui/debug.js';
import { initDebugView } from '../../src/ui/debugview.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { getClass } from '../../src/items/classes.js';
import { suite, ok, eq, between, note } from '../assert.js';

const DT = 1 / 60;
const chao = { heightAt: () => 0, waterDepthAt: () => 0 };

/** Painel de depuração precisa dos elementos do HUD pra existir. */
function palco() {
  const holder = document.createElement('div');
  holder.style.display = 'none';
  holder.innerHTML = '<div id="debug"></div>';
  document.body.appendChild(holder);
  return holder;
}

function caixa(x, z, altura, standable = false) {
  return {
    box: new THREE.Box3(
      new THREE.Vector3(x - 1, 0, z - 1),
      new THREE.Vector3(x + 1, altura, z + 1)
    ),
    standable
  };
}

export function run() {
  suite('F2 liga e desliga a depuração');

  initInput();
  const holder = palco();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  const player = new Player(camera, document.body,
    { colliders: [], terrain: chao, spawn: new THREE.Vector3(0, 0, 0) });
  player.setClass(getClass('assault'));
  player.respawn();

  const painel = document.getElementById('debug');
  const debug = initDebug(player);

  // Nasce DESLIGADO. Painel aceso por padrão vira parte do HUD sem ninguém
  // decidir isso — e foi assim que ele passou meses com um `display: none`
  // duplicado que ninguém notava, porque ninguém esperava vê-lo.
  ok('começa desligado', !debug.on);
  ok('e o painel não está visível', !painel.classList.contains('visivel'));

  const tecla = (code) => {
    dispatchEvent(new KeyboardEvent('keydown', { code }));
    dispatchEvent(new KeyboardEvent('keyup', { code }));
  };

  tecla('F2');
  debug.update(DT);
  endFrame();
  ok('F2 liga', debug.on);
  ok('e o painel aparece', painel.classList.contains('visivel'));
  ok('com o estado do jogador escrito', painel.textContent.includes('velocidade'));
  ok('e o time dele', painel.textContent.includes(player.team));

  tecla('F2');
  debug.update(DT);
  endFrame();
  ok('F2 de novo desliga', !debug.on);
  ok('e o painel some', !painel.classList.contains('visivel'));

  // A crase continua servindo: quem já decorou não perde a tecla.
  tecla('Backquote');
  debug.update(DT);
  endFrame();
  ok('a crase também liga', debug.on);

  suite('as caixas de colisão saem de uma malha só');

  const cena = new THREE.Scene();
  const colisores = [caixa(0, 0, 2), caixa(6, 0, 1, true), caixa(-6, 4, 3)];
  const centro = new THREE.Vector3();
  const alvo = {
    alive: true, radius: 0.5, team: 'karnia',
    center: () => centro.set(0, 1.1, 0)
  };
  const mundo = { colliders: colisores, targets: [alvo], terrain: chao };
  const tropa = { soldiers: [], stateOf: () => null };

  const antes = cena.children.length;
  const desenhar = initDebugView(cena, mundo, tropa);

  // Um helper por colisor seriam oitocentos objetos na cena, e o custo de
  // desenhar isso esconderia justamente o que se quer investigar.
  eq('a cena ganha um grupo só', cena.children.length, antes + 1);
  const grupo = cena.children[antes];
  ok('e ele nasce invisível', !grupo.visible);

  desenhar(true);
  ok('ligado, ele aparece', grupo.visible);

  const linhas = grupo.children.filter((o) => o.isLineSegments);
  eq('com duas malhas de linha: caixas e esferas', linhas.length, 2);

  // 3 caixas × 12 arestas × 2 pontas
  const pontos = linhas[0].geometry.getAttribute('position').count;
  eq('todas as caixas cabem numa malha', pontos, 3 * 12 * 2);

  desenhar(false);
  ok('desligado, some', !grupo.visible);

  suite('desligado não refaz trabalho nenhum');

  // Medir MILISSEGUNDOS aqui não prova nada: a suíte roda sob
  // --virtual-time-budget, e ali performance.now() não anda — qualquer
  // asserção de tempo passa com 0,000 ms e fica verde sem testar nada.
  // O que dá pra provar é comportamento: desligado, ele não toca no buffer.
  const buffer = linhas[0].geometry.getAttribute('position');

  desenhar(true);
  const marcador = buffer.array[0];
  buffer.array[0] = 12345;

  desenhar(false);
  eq('desligado, o buffer fica como estava', buffer.array[0], 12345);

  desenhar(true);
  eq('e ligado ele é reescrito', buffer.array[0], marcador);

  holder.remove();
}
