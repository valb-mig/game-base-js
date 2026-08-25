import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { initDebug } from '../../src/ui/debug.js';
import { initDebugView } from '../../src/ui/debugview.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { getClass } from '../../src/items/classes.js';
import { createBallistics } from '../../src/items/ballistics.js';
import { BULLET } from '../../src/config.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

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
  const vista = initDebugView(cena, mundo, tropa);
  const desenhar = (ligado) => vista.update(ligado);

  // Um helper por colisor seriam oitocentos objetos na cena, e o custo de
  // desenhar isso esconderia justamente o que se quer investigar.
  eq('a cena ganha um grupo só', cena.children.length, antes + 1);
  const grupo = cena.children[antes];
  ok('e ele nasce invisível', !grupo.visible);

  desenhar(true);
  ok('ligado, ele aparece', grupo.visible);

  const linhas = grupo.children.filter((o) => o.isLineSegments);
  eq('três malhas de segmentos: caixas, esferas e balas no ar', linhas.length, 3);

  // Arco e reta de referência são Line, não LineSegments: são um caminho
  // contínuo, e não pares soltos.
  eq('e duas linhas contínuas: o arco e a reta sem gravidade',
    grupo.children.filter((o) => o.isLine && !o.isLineSegments).length, 2);

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

  suite('a trajetória prevista da bala');

  // Chão plano bem abaixo, pra a bala voar sem bater em nada e a queda poder
  // ser conferida contra a fórmula.
  const fundo = { heightAt: () => -50, waterDepthAt: () => 0 };
  const cenaT = new THREE.Scene();
  const mundoT = { colliders: [], targets: [], terrain: fundo };
  const atirador = new Player(new THREE.PerspectiveCamera(70, 1, 0.1, 400),
    document.body, { colliders: [], terrain: fundo, spawn: new THREE.Vector3(0, 0, 0) });
  atirador.setClass(getClass('assault'));
  atirador.respawn();
  atirador.object.position.set(0, 0, 0);
  atirador.object.rotation.set(0, 0, 0);   // olhando pro -Z, no horizonte

  const balisticaT = createBallistics(cenaT, []);
  const vistaT = initDebugView(cenaT, mundoT, { soldiers: [], stateOf: () => null },
    { player: atirador, viewmodel: null, ballistics: balisticaT });

  ok('desligada, não há tiro previsto', vistaT.shot === null);

  vistaT.update(true);
  const tiro = vistaT.shot;
  ok('ligada, ela calcula o tiro', Boolean(tiro));

  // A queda tem que ser POSITIVA. Já saiu negativa: a conta media contra o
  // ponto grudado no chão em vez da parábola, e a reta de referência já
  // estava enterrada. Queda negativa é bala subindo.
  ok('a bala cai, não sobe', tiro.queda > 0, `${(tiro.queda * 100).toFixed(1)} cm`);

  // E bate com a fórmula: metade da gravidade pelo tempo de voo ao quadrado.
  const voo = tiro.distancia / BULLET.SPEED;
  const esperado = 0.5 * BULLET.GRAVITY * voo * voo;
  near('e cai o que a gravidade manda', tiro.queda, esperado, esperado * 0.12,
    `${(tiro.queda * 100).toFixed(1)} cm contra ${(esperado * 100).toFixed(1)} previstos`);
  note('tiro no horizonte',
    `${tiro.distancia.toFixed(0)} m · cai ${(tiro.queda * 100).toFixed(0)} cm`);

  // Com a arma parada e sem viewmodel, o tiro sai exatamente na linha do
  // olhar: desvio de cano só existe com a arma fora de posição.
  near('cano parado não desvia da mira', tiro.desvio, 0, 1e-6);

  vistaT.update(false);
  ok('desligando, o tiro previsto some', vistaT.shot === null);

  holder.remove();
}
