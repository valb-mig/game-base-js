import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { PLAYER } from '../../src/config.js';
import { suite, ok, note } from '../assert.js';

/**
 * Ladeira: subir e descer terreno inclinado sem tremer.
 *
 * A rampa aqui é analítica (`heightAt = x * inclinação`), sem malha e sem
 * aresta de polígono — se houver tremor, ele é da lógica de chão, não do
 * desenho do terreno.
 */

/** Rampa que sobe no +X a partir da origem. */
const rampa = (inclinacao) => ({
  heightAt: (x) => Math.max(0, x) * inclinacao,
  waterDepthAt: () => 0,
  nivelDaAguaAt: () => 0
});

export function run() {
  initInput();

  const down = (code) => dispatchEvent(new KeyboardEvent('keydown', { code }));
  const up = (code) => dispatchEvent(new KeyboardEvent('keyup', { code }));

  /**
   * Anda `frames` na rampa e devolve o que aconteceu com o chão e com a vista.
   *
   * `graus` é a inclinação; `paraCima` decide o sentido. O jogador olha pro
   * +X ou pro -X, então a subida acontece sempre andando pra frente.
   */
  const andar = ({ graus, paraCima = true, correndo = false, dt = 1 / 60, frames = 240 }) => {
    const inclinacao = Math.tan(graus * Math.PI / 180);
    const terrain = rampa(inclinacao);
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
    const player = new Player(camera, document.body, {
      colliders: [], terrain,
      spawn: new THREE.Vector3(paraCima ? 2 : 40, 0, 0)
    });
    player.respawn();

    // olhar pro +X (subindo) ou pro -X (descendo): forward = (-sin, 0, -cos)
    camera.rotation.set(0, paraCima ? -Math.PI / 2 : Math.PI / 2, 0);

    down('KeyW');
    if (correndo) { down('ShiftLeft'); up('ShiftLeft'); }

    const medida = {
      noAr: 0, afundou: 0, saltou: 0,
      degraus: 0, subida: 0, distancia: 0, offset: 0
    };
    for (let i = 0; i < frames; i++) {
      const antesX = camera.position.x;
      player.update(dt);
      endFrame();

      const chao = terrain.heightAt(camera.position.x);
      const ideal = chao + player.height;

      if (i < 20) continue;   // deixa a velocidade engatar antes de medir

      if (!player.onGround) medida.noAr++;
      medida.afundou = Math.max(medida.afundou, ideal - player.eyeY);
      medida.saltou = Math.max(medida.saltou, player.eyeY - ideal);
      medida.offset = Math.max(medida.offset, Math.abs(player.viewOffset));
      if (player.viewOffset < -0.001) medida.degraus++;
      medida.distancia += Math.abs(camera.position.x - antesX);
    }

    up('KeyW');
    medida.subida = terrain.heightAt(camera.position.x);
    medida.velocidade = player.speed;
    return medida;
  };

  suite('subir ladeira');

  for (const graus of [10, 25, 40]) {
    const m = andar({ graus, correndo: true });
    ok(`a ${graus}° o jogador não perde o chão`, m.noAr === 0, `${m.noAr} quadros no ar`);
    ok(`a ${graus}° os olhos não afundam no terreno`, m.afundou < 0.001,
      `${(m.afundou * 100).toFixed(1)} cm`);
    ok(`a ${graus}° a vista não trata ladeira como degrau`, m.degraus === 0,
      `${m.degraus} quadros descontando`);
    note(`subida a ${graus}°`,
      `${m.subida.toFixed(1)} m em ${m.distancia.toFixed(0)} m · ` +
      `${m.velocidade.toFixed(1)} m/s`);
  }

  suite('descer ladeira');

  for (const graus of [10, 25, 40]) {
    const m = andar({ graus, paraCima: false, correndo: true });
    ok(`a ${graus}° descer não vira série de quedas`, m.noAr === 0,
      `${m.noAr} quadros no ar`);
    ok(`a ${graus}° os olhos acompanham o chão`, m.saltou < 0.02,
      `${(m.saltou * 100).toFixed(1)} cm acima do ideal`);
    note(`descida a ${graus}°`, `salto máximo ${(m.saltou * 100).toFixed(1)} cm`);
  }

  suite('framerate não muda a ladeira');

  for (const dt of [1 / 144, 1 / 60, 1 / 30]) {
    const m = andar({ graus: 40, correndo: true, dt, frames: Math.ceil(4 / dt) });
    ok(`a ${Math.round(1 / dt)} fps a vista não desconta ladeira`, m.degraus === 0,
      `${m.degraus} quadros · offset ${(m.offset * 100).toFixed(1)} cm`);
  }

  suite('degrau continua sendo degrau');

  // Caixa alta o bastante pra ser degrau: a vista TEM que suavizar aqui, e é
  // o mesmo desconto que a ladeira não pode disparar.
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  // comprida o bastante pro jogador não passar dela nos 120 quadros
  const caixa = {
    box: new THREE.Box3(new THREE.Vector3(1, 0, -4), new THREE.Vector3(40, 0.3, 4)),
    standable: true
  };
  const player = new Player(camera, document.body, {
    colliders: [caixa], terrain: rampa(0), spawn: new THREE.Vector3(0, 0, 0)
  });
  player.respawn();
  camera.rotation.set(0, -Math.PI / 2, 0);

  down('KeyW');
  let desconto = 0;
  for (let i = 0; i < 120; i++) {
    player.update(1 / 60);
    endFrame();
    desconto = Math.min(desconto, player.viewOffset);
  }
  up('KeyW');

  ok('subiu no degrau', player.eyeY > 0.29 + PLAYER.HEIGHT - 0.01,
    `${player.eyeY.toFixed(2)} m`);
  ok('e a vista suavizou a subida', desconto < -0.05, `${(desconto * 100).toFixed(1)} cm`);

  suite('beirada continua sendo queda');

  // Colar o jogador no piso não pode virar "nunca cai": o que separa ladeira
  // de beirada é o piso baixar mais do que a velocidade do quadro explica.
  const penhasco = {
    heightAt: (x) => (x < 10 ? 5 : 0),
    waterDepthAt: () => 0,
  nivelDaAguaAt: () => 0
  };
  const cameraQueda = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  const caindo = new Player(cameraQueda, document.body, {
    colliders: [], terrain: penhasco, spawn: new THREE.Vector3(6, 0, 0)
  });
  caindo.respawn();
  cameraQueda.rotation.set(0, -Math.PI / 2, 0);

  down('KeyW');
  let noAr = 0;
  for (let i = 0; i < 120; i++) {
    caindo.update(1 / 60);
    endFrame();
    if (!caindo.onGround) noAr++;
  }
  up('KeyW');

  ok('andar pra fora do penhasco é queda', noAr > 5, `${noAr} quadros no ar`);
  ok('e o jogador chega no chão de baixo',
    Math.abs(caindo.eyeY - PLAYER.HEIGHT) < 0.01, `${caindo.eyeY.toFixed(2)} m`);
  note('penhasco de 5 m', `${noAr} quadros no ar`);
}
