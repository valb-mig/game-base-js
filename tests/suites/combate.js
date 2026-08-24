import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { initAttack } from '../../src/items/attack.js';
import { initFirearm } from '../../src/items/firearm.js';
import { createDummy } from '../../src/world/dummy.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { PISTOL, KNIFE, getClass } from '../../src/items/classes.js';
import { MELEE } from '../../src/config.js';
import { suite, ok, eq, note } from '../assert.js';

const DT = 1 / 60;

/**
 * Corpo a corpo e arma de fogo rodando juntos, na mesma ordem do main.js.
 *
 * Os dois leem o mesmo botão do mouse, e testar cada um sozinho esconde
 * exatamente o que dá errado: o primeiro a rodar consumia o clique mesmo com
 * o item do outro na mão, e o tiro simplesmente não saía.
 */
export function run() {
  initInput();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  const scene = new THREE.Scene();
  const colliders = [];

  const player = new Player(camera, document.body, {
    colliders, terrain: { heightAt: () => 0 }, spawn: new THREE.Vector3(0, 0, 0)
  });
  player.setClass(getClass('assault'));
  player.controls.isLocked = true;

  const alvo = createDummy(scene, colliders, { x: 0, z: -10, ground: 0 });
  const world = { targets: [alvo] };

  const attack = initAttack(player, world);
  const gun = initFirearm(player, world);

  // a ordem é a do main.js: golpe antes de tiro
  const passo = (n = 1) => {
    for (let i = 0; i < n; i++) {
      attack.update(DT);
      gun.update(DT);
      for (const t of world.targets) t.update(DT);
      endFrame();
    }
  };
  const clicar = () => {
    dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
  };
  const empunhar = (item) => {
    player.selectSlot(player.carried.indexOf(item));
    passo(2);
  };
  const reporAlvo = () => {
    alvo.health = alvo.maxHealth;
    alvo.alive = true;
    alvo.collider.box.max.y = 2;
  };

  player.object.position.set(0, 1.25, 0);
  camera.quaternion.setFromEuler(new THREE.Euler(0, 0, 0, 'YXZ'));

  suite('um clique, um sistema');

  // Regressão: o corpo a corpo consumia o clique antes de olhar o que estava
  // na mão, então com a pistola empunhada o tiro nunca saía.
  empunhar(PISTOL);
  PISTOL.ammo.loaded = 8;
  clicar(); passo(1);

  eq('com a pistola, o clique atira', PISTOL.ammo.loaded, 7);
  eq('e não vira golpe', player.swing.active, false);
  eq('nem fica guardado no buffer do golpe', player.swing.buffered, 0);

  empunhar(KNIFE);
  const municao = PISTOL.ammo.loaded;
  clicar(); passo(1);

  eq('com a faca, o clique golpeia', player.swing.active, true);
  eq('e não gasta bala', PISTOL.ammo.loaded, municao);
  passo(Math.ceil((MELEE.SWING_TIME + MELEE.COOLDOWN) / DT) + 6);

  suite('trocar de item no meio da briga');

  reporAlvo();
  empunhar(PISTOL);
  PISTOL.ammo.loaded = 8;

  // dispara, troca pra faca antes do intervalo acabar, e golpeia
  clicar(); passo(1);
  eq('atirou', PISTOL.ammo.loaded, 7);

  empunhar(KNIFE);
  eq('trocar cancela a mira', player.gun.aim, 0);
  clicar(); passo(1);
  ok('e o golpe sai normal', player.swing.active);
  passo(Math.ceil((MELEE.SWING_TIME + MELEE.COOLDOWN) / DT) + 6);

  // trocar no meio de um golpe não deixa golpe pendurado
  clicar(); passo(3);
  ok('golpe em andamento', player.swing.active);
  empunhar(PISTOL);
  eq('trocar de item corta o golpe', player.swing.active, false);
  note('ordem no main.js', 'player, drops, attack, firearm');

  suite('mão vazia não faz nada');

  player.carried = [];
  player.equipped = null;
  const antes = PISTOL.ammo.loaded;
  clicar(); passo(2);
  eq('sem item, o clique não atira', PISTOL.ammo.loaded, antes);
  eq('e não golpeia', player.swing.active, false);

  player.controls.isLocked = false;
}
