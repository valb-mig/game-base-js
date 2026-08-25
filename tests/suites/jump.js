import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { PLAYER } from '../../src/config.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;

export function run() {
  initInput();
  const player = new Player(new THREE.PerspectiveCamera(70, 1, 0.1, 400), document.body, { colliders: [] });

  const down = (code) => dispatchEvent(new KeyboardEvent('keydown', { code }));
  const up = (code) => dispatchEvent(new KeyboardEvent('keyup', { code }));
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) { player.update(DT); endFrame(); }
  };

  /** Altura máxima de um pulo com o espaço segurado por `holdFrames`. */
  function jumpApex(holdFrames, dt = DT) {
    player.eyeY = PLAYER.HEIGHT;
    player.verticalVelocity = 0;
    player.onGround = true;
    player.jumpCutPending = false;
    up('Space'); player.update(dt); endFrame();

    down('Space');
    let apex = 0;
    for (let i = 0; i < Math.ceil(1.5 / dt); i++) {
      if (i === holdFrames) up('Space');
      player.update(dt);
      endFrame();
      apex = Math.max(apex, player.eyeY);
    }
    up('Space'); player.update(dt); endFrame();
    return apex - PLAYER.HEIGHT;
  }

  suite('pulo');

  const theoretical = (PLAYER.JUMP_SPEED ** 2) / (2 * PLAYER.GRAVITY);
  const full = jumpApex(999);
  near('pulo cheio bate com a física', full, theoretical, 0.01);
  note('altura do pulo cheio', `${full.toFixed(3)} m (teórico ${theoretical.toFixed(3)})`);

  // Regressão: com a gravidade aplicada antes do movimento, a altura do pulo
  // dependia do framerate. Tem que dar a mesma coisa em qualquer dt.
  const at30 = jumpApex(999, 1 / 30);
  const at144 = jumpApex(999, 1 / 144);
  near('mesma altura a 30 fps', at30, theoretical, 0.01);
  near('mesma altura a 144 fps', at144, theoretical, 0.01);
  note('altura por framerate', `30fps ${at30.toFixed(3)} · 60fps ${full.toFixed(3)} · 144fps ${at144.toFixed(3)}`);

  // Regressão: o corte de altura variável rodava no frame do próprio salto,
  // então um toque rápido virava um tropeço de 24 cm em vez de um pulo.
  const tapped = jumpApex(0);
  between('toque rápido ainda é um pulo de verdade', tapped, 0.5, 0.8);
  ok('toque rápido pula menos que segurar', tapped < full);
  note('altura do toque rápido', `${tapped.toFixed(2)} m`);

  const mid = jumpApex(5);
  ok('altura é progressiva com o tempo de tecla', tapped < mid && mid <= full);
  note('altura segurando 83 ms', `${mid.toFixed(2)} m`);

  suite('cabeça bate no teto');

  // Regressão: o movimento vertical só olhava o piso. Pular por baixo de uma
  // laje levava a cabeça pra dentro dela e, ao cair, o jogador pousava em
  // cima — "embaixo do teto, atravesso e subo em cima".
  const comTeto = (de, ate) => {
    const teto = {
      box: new THREE.Box3(new THREE.Vector3(-6, de, -6), new THREE.Vector3(6, ate, 6)),
      standable: true
    };
    const sujeito = new Player(new THREE.PerspectiveCamera(70, 1, 0.1, 400),
      document.body, {
        colliders: [teto],
        terrain: { heightAt: () => 0, waterDepthAt: () => 0 },
        spawn: new THREE.Vector3(0, 0, 0)
      });
    sujeito.controls.isLocked = true;
    sujeito.respawn();

    // Espaço segurado o tempo todo: pulo cheio, sem o corte de altura
    // variável interferir na conta. E a medição começa no quadro zero — a
    // primeira versão deste teste pulava os três primeiros e perdia o pico,
    // que é exatamente onde a cabeça encosta no teto.
    down('Space');

    let maiorCabeca = 0;
    for (let i = 0; i < 140; i++) {
      sujeito.update(DT);
      endFrame();
      maiorCabeca = Math.max(maiorCabeca, sujeito.eyeY);
    }
    up('Space');
    sujeito.update(DT);
    endFrame();

    return { maiorCabeca, pes: sujeito.feetY };
  };

  const raspando = comTeto(2, 3);
  near('a cabeça para exatamente no teto', raspando.maiorCabeca, 2, 0.001);
  near('e o jogador volta pro chão', raspando.pes, 0, 0.001);

  const rente = comTeto(PLAYER.HEIGHT + 0.05, PLAYER.HEIGHT + 1);
  ok('teto rente mal deixa sair do chão',
    rente.maiorCabeca <= PLAYER.HEIGHT + 0.05 + 1e-6,
    `${rente.maiorCabeca.toFixed(2)}`);

  const alto = comTeto(8, 9);
  near('teto longe não atrapalha o pulo',
    alto.maiorCabeca - PLAYER.HEIGHT, theoretical, 0.01);
  note('pulo livre', `${(alto.maiorCabeca - PLAYER.HEIGHT).toFixed(2)} m`);

  suite('coyote time e buffer');

  // sai da borda sem pular: ainda dá pra pular por COYOTE_TIME
  player.eyeY = PLAYER.HEIGHT + 0.02;
  player.onGround = false;
  player.coyote = PLAYER.COYOTE_TIME;
  player.verticalVelocity = 0;
  down('Space'); step(1); up('Space');
  ok('coyote time deixa pular logo após sair do chão', player.verticalVelocity > 0);
  step(60);

  // aperta antes de tocar o chão: o buffer segura o comando
  player.eyeY = PLAYER.HEIGHT + 0.25;
  player.onGround = false;
  player.coyote = 0;
  player.verticalVelocity = -1;
  down('Space'); step(1); up('Space');
  ok('pulo antecipado não some', player.jumpBuffer > 0 || player.verticalVelocity > 0);
  step(20);
  ok('buffer dispara o pulo ao encostar no chão', player.verticalVelocity > 0 || player.onGround);
  step(60);
}
