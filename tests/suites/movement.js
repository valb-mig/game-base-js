import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { PLAYER, WORLD } from '../../src/config.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;

export function run() {
  initInput();
  const player = new Player(new THREE.PerspectiveCamera(70, 1, 0.1, 400), document.body, { colliders: [] });

  const down = (code) => dispatchEvent(new KeyboardEvent('keydown', { code }));
  const up = (code) => dispatchEvent(new KeyboardEvent('keyup', { code }));
  const tap = (code) => { down(code); up(code); };
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) { player.update(DT); endFrame(); }
  };
  const recenter = () => {
    player.object.position.set(0, player.eyeY, 0);
  };

  // ---------------------------------------------------------------- andar
  suite('velocidade por postura');

  down('KeyW'); step(60);
  near('andando chega na velocidade de caminhada', player.speed, PLAYER.WALK_SPEED, 0.01);

  tap('ShiftLeft'); step(60);
  near('Shift em toque liga a corrida', player.speed, PLAYER.RUN_SPEED, 0.01);
  ok('estado diz correndo', player.state === 'correndo', player.state);

  tap('KeyC'); step(45);
  near('agachado usa a velocidade de agachado', player.speed, PLAYER.CROUCH_SPEED, 0.01);
  ok('agachar desliga a corrida', player.runLatched === false);

  tap('KeyZ'); step(60);
  near('deitado usa a velocidade de rastejo', player.speed, PLAYER.PRONE_SPEED, 0.01);
  near('altura do corpo deitado', player.height, PLAYER.PRONE_HEIGHT, 1e-6);
  ok('continua no chão ao deitar', player.onGround === true);

  tap('KeyZ'); step(60);
  near('levantar volta pra caminhada', player.speed, PLAYER.WALK_SPEED, 0.01);
  near('altura do corpo de pé', player.height, PLAYER.HEIGHT, 1e-6);

  // ------------------------------------------------------- inércia e freio
  suite('inércia');
  recenter();
  up('KeyW'); step(60);
  near('soltar a tecla para o jogador', player.speed, 0, 0.01);

  down('KeyW'); step(1);
  ok('não sai na velocidade máxima no primeiro frame', player.speed < PLAYER.WALK_SPEED);
  note('velocidade após 1 frame', `${player.speed.toFixed(2)} m/s`);

  // ------------------------------------------------------------ ré e limite
  suite('ré e borda do mundo');
  recenter();
  up('KeyW'); step(40);
  down('KeyS'); step(60);
  near('andar de ré aplica a penalidade',
    player.speed, PLAYER.WALK_SPEED * PLAYER.BACK_PENALTY, 0.01);
  up('KeyS');

  const limit = WORLD.SIZE / 2 - 1;   // derivado do mapa, não fixo no teste
  player.object.position.z = -limit + 0.5;
  down('KeyW'); step(60);
  between('não atravessa a borda do mundo', player.object.position.z, -limit, -limit + 0.51);
  near('bater na borda zera a velocidade', player.speed, 0, 0.01);
  up('KeyW'); step(10);
}
