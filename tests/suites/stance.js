import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { PLAYER } from '../../src/config.js';
import { collides } from '../../src/player/collision.js';
import { suite, ok, near, eq } from '../assert.js';

const DT = 1 / 60;

/** Caixa de teste posicionada pela base, no formato que o mundo produz. */
const slab = (x, z, y, w, d, h, standable = true) => ({
  box: {
    min: { x: x - w / 2, y, z: z - d / 2 },
    max: { x: x + w / 2, y: y + h, z: z + d / 2 }
  },
  standable
});

export function run() {
  initInput();
  const player = new Player(new THREE.PerspectiveCamera(70, 1, 0.1, 400), document.body, []);

  const down = (code) => dispatchEvent(new KeyboardEvent('keydown', { code }));
  const up = (code) => dispatchEvent(new KeyboardEvent('keyup', { code }));
  const tap = (code) => { down(code); up(code); };
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) { player.update(DT); endFrame(); }
  };

  suite('máquina de postura');

  tap('KeyC'); step(30);
  eq('C alterna pra agachado', player.stance, 'agachado');
  tap('KeyC'); step(30);
  eq('C de novo volta pra de pé', player.stance, 'de pé');

  tap('KeyZ'); step(45);
  eq('Z alterna pra deitado', player.stance, 'deitado');
  tap('KeyZ'); step(45);
  eq('Z de novo levanta', player.stance, 'de pé');

  // Regressão: com C alternado e travado, o próprio C cancelava o deitado no
  // mesmo frame do Z, e não dava pra deitar partindo de agachado.
  tap('KeyC'); step(30);
  tap('KeyZ'); step(45);
  eq('dá pra deitar partindo de agachado', player.stance, 'deitado');

  tap('KeyC'); step(30);
  eq('deitado, C sobe só um degrau', player.stance, 'agachado');
  tap('KeyC'); step(30);
  eq('C de novo chega em de pé', player.stance, 'de pé');

  tap('KeyZ'); step(45);
  const before = player.verticalVelocity;
  down('Space'); step(2); up('Space');
  ok('espaço deitado levanta em vez de pular', player.onGround && player.verticalVelocity <= before);
  step(45);

  // -------------------------------------------------------------- folgas
  suite('folgas da pista de teste');

  const tunnel = [
    slab(-2.5, -30, 0, 1, 4, 2.4),
    slab(2.5, -30, 0, 1, 4, 2.4),
    slab(0, -30, 1.05, 6, 4, 1.35, false)
  ];
  ok('túnel: de pé não passa', collides(tunnel, 0, -30, 0, PLAYER.HEIGHT));
  ok('túnel: agachado passa', !collides(tunnel, 0, -30, 0, PLAYER.CROUCH_HEIGHT));

  const crawl = [
    slab(-2.5, -46, 0, 1, 5, 1.6),
    slab(2.5, -46, 0, 1, 5, 1.6),
    slab(0, -46, 0.7, 6, 5, 0.9, false)
  ];
  ok('rastejo: agachado não passa', collides(crawl, 0, -46, 0, PLAYER.CROUCH_HEIGHT));
  ok('rastejo: deitado passa', !collides(crawl, 0, -46, 0, PLAYER.PRONE_HEIGHT));

  const pass = [
    slab(0, -38, 0, 5, 4, 1),
    slab(0, -38, 2.4, 5, 4, 0.6, false),
    slab(-3, -38, 0, 1, 4, 3),
    slab(3, -38, 0, 1, 4, 3)
  ];
  ok('passagem alta: andar por baixo de pé cabe', !collides(pass, 0, -40.5, 0, PLAYER.HEIGHT));
  ok('passagem alta: pular de pé bate a cabeça', collides(pass, 0, -38, 1.0, PLAYER.HEIGHT));
  ok('passagem alta: crouch-jump entra', !collides(pass, 0, -38, 1.0, PLAYER.CROUCH_HEIGHT));

  // a escada precisa ser subível só andando, degrau a degrau
  suite('degrau automático');
  const stairs = Array.from({ length: 5 }, (_, i) => slab(0, -8 - i * 1.2, 0, 4, 1.2, 0.3 * (i + 1)));
  let feet = 0;
  let blocked = false;
  for (let i = 0; i < 5; i++) {
    const z = -8 - i * 1.2;
    if (collides(stairs, 0, z, feet, PLAYER.HEIGHT)) blocked = true;
    feet = 0.3 * (i + 1);
  }
  ok('escada sobe sem pular', !blocked);
  near('escada termina no topo', feet, 1.5, 1e-9);
}
