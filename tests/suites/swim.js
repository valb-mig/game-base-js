import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { PLAYER, WORLD } from '../../src/config.js';
import { headingDegrees } from '../../src/player/heading.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;

/**
 * Terreno de teste: uma rampa reta que desce no +Z, cruzando a linha d'água
 * em z=0. Assim dá pra caminhar do seco pro fundo e conferir cada estágio.
 */
const rampa = {
  heightAt: (x, z) => -z * 0.2,
  waterDepthAt: (x, z) => Math.max(0, WORLD.WATER_LEVEL + z * 0.2),
  nivelDaAguaAt: () => WORLD.WATER_LEVEL
};

export function run() {
  initInput();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  const player = new Player(camera, document.body, {
    colliders: [],
    terrain: rampa,
    spawn: new THREE.Vector3(0, 0, -20)
  });

  const down = (code) => dispatchEvent(new KeyboardEvent('keydown', { code }));
  const up = (code) => dispatchEvent(new KeyboardEvent('keyup', { code }));
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) { player.update(DT); endFrame(); }
  };
  const moveTo = (z) => {
    player.object.position.z = z;
    player.eyeY = rampa.heightAt(0, z) + player.height;
    player.verticalVelocity = 0;
    player.velocity.set(0, 0, 0);
    step(2);
  };

  suite('entrada na água');

  moveTo(-20);
  eq('em terra seca não nada', player.swimming, false);
  eq('em terra seca não há submersão', Math.round(player.submerged * 100) / 100, 0);

  // a rampa desce no +Z: z positivo é que tem água
  moveTo(2);    // 40 cm de água, na canela
  eq('água rasa ainda é caminhada', player.swimming, false);
  between('água rasa conta como submersão', player.submerged, 0.2, 0.6);

  moveTo(5);    // 1 m de água, na cintura — ainda raso pra nadar
  eq('água pela cintura ainda é caminhada', player.swimming, false);
  down('KeyW'); step(50);
  const wadeSpeed = player.speed;
  up('KeyW'); step(20);
  ok('água pela cintura freia quem anda',
    wadeSpeed < PLAYER.WALK_SPEED * 0.8, `${wadeSpeed.toFixed(2)} m/s contra ${PLAYER.WALK_SPEED} em seco`);

  moveTo(20);   // 4 m de fundo
  eq('fundo que o pé não alcança vira natação', player.swimming, true);

  suite('nadar');

  step(90);
  near("boiando, os olhos param na linha da água",
    player.eyeY, WORLD.WATER_LEVEL + PLAYER.FLOAT_EYE, 0.1);
  eq('boiando não está no chão', player.onGround, false);
  eq('estado diz boiando', player.state, 'boiando');

  const beforeJump = player.eyeY;
  down('Space'); step(20); up('Space');
  ok('espaço sobe na água em vez de pular', player.eyeY >= beforeJump - 0.01);
  ok('subir não arremessa pra fora da água',
    player.eyeY < WORLD.WATER_LEVEL + 1.2, `${player.eyeY.toFixed(2)} m`);
  step(60);

  down('KeyC'); step(45);
  ok('C mergulha', player.eyeY < WORLD.WATER_LEVEL, `${player.eyeY.toFixed(2)} m`);
  eq('cabeça submersa é detectada', player.headUnderwater, true);
  eq('estado diz mergulhando', player.state, 'mergulhando');

  down('KeyC'); step(180); up('KeyC');
  ok('não atravessa o fundo do mar',
    player.feetY >= rampa.heightAt(0, player.object.position.z) - 0.01);
  step(120);

  suite('saída da água');

  moveTo(-1);
  eq('no raso volta a andar', player.swimming, false);
  ok('e volta a pisar no chão', player.onGround, `${player.onGround}`);
  eq('postura volta pra de pé', player.stance, 'de pé');

  suite('rumo da bússola');

  const scratch = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const headingFor = (yawDegrees) => {
    euler.set(0, -yawDegrees * Math.PI / 180, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
    return headingDegrees(camera.quaternion, scratch);
  };
  near('yaw zero aponta pro norte', headingFor(0), 0, 1e-6);
  near('virar à direita vai pro leste', headingFor(90), 90, 1e-6);
  near('de costas é o sul', headingFor(180), 180, 1e-6);
  near('e o oeste fecha a volta', headingFor(270), 270, 1e-6);
  note('norte do mundo', 'eixo -Z, onde fica a Base Norte');
}
