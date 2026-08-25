import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { initFirearm } from '../../src/items/firearm.js';
import { createBallistics } from '../../src/items/ballistics.js';
import { createDummy } from '../../src/world/dummy.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { CLASSES, PISTOL, KNIFE, SLOT_ORDER, getClass } from '../../src/items/classes.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;
const chao = { heightAt: () => 0, waterDepthAt: () => 0 };

export function run() {
  initInput();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  const scene = new THREE.Scene();
  const colliders = [];

  const player = new Player(camera, document.body, {
    colliders, terrain: chao, spawn: new THREE.Vector3(0, 0, 0)
  });
  player.controls.isLocked = true;

  const alvo = createDummy(scene, colliders, { x: 0, z: -14, ground: 0, name: 'alvo' });
  const world = { targets: [alvo] };
  const ballistics = createBallistics(scene, colliders);
  const gun = initFirearm(player, world, ballistics);

  const tiros = [];
  const acertos = [];
  gun.onShot((r) => tiros.push(r));
  ballistics.onHit((r) => acertos.push(r));

  const clicar = () => {
    dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
  };
  const segurarDireito = (down) => dispatchEvent(
    new MouseEvent(down ? 'mousedown' : 'mouseup', { button: 2 }));
  const tecla = (code) => {
    dispatchEvent(new KeyboardEvent('keydown', { code }));
    dispatchEvent(new KeyboardEvent('keyup', { code }));
  };
  const passo = (n = 1) => {
    for (let i = 0; i < n; i++) {
      gun.update(DT);
      ballistics.update(DT, world.targets, null);
      for (const t of world.targets) t.update(DT);
      endFrame();
    }
  };
  const reporAlvo = () => {
    alvo.health = alvo.maxHealth;
    alvo.alive = true;
    alvo.collider.box.max.y = 2;
  };

  suite('a pistola é só da Assault');

  const comPistola = CLASSES.filter((c) => c.loadout.includes(PISTOL));
  eq('uma classe só carrega a M1911A1', comPistola.length, 1);
  eq('e é a Assault', comPistola[0].id, 'assault');
  eq('sete no carregador mais uma na câmara', PISTOL.ammo.loaded, PISTOL.firearm.magazine + 1);

  suite('inventário e troca');

  player.setClass(getClass('assault'));
  eq('um slot de mão por tecla', player.carried.length, SLOT_ORDER.length);
  eq('a primária ainda não existe, e o slot fica vazio', player.carried[0], null);
  eq('a pistola é o slot 2', player.carried[1], PISTOL);
  eq('a faca é o slot 3', player.carried[2], KNIFE);
  ok('e a mão começa no primeiro slot que existe', player.equipped === PISTOL);
  eq('tecla no slot vazio não faz nada', player.selectSlot(0), false);

  const indicePistola = player.carried.indexOf(PISTOL);
  player.selectSlot(indicePistola);
  eq('dá pra empunhar a pistola', player.equipped.id, PISTOL.id);
  player.selectSlot(player.carried.indexOf(KNIFE));
  eq('e voltar pra faca', player.equipped.id, KNIFE.id);
  player.selectSlot(indicePistola);

  suite('tiro e munição');

  PISTOL.ammo.loaded = PISTOL.firearm.magazine + 1;
  PISTOL.ammo.reserve = 21;
  player.object.position.set(0, 1.25, 0);
  camera.quaternion.setFromEuler(new THREE.Euler(0, 0, 0, 'YXZ'));   // mirando o alvo

  const carga = PISTOL.ammo.loaded;
  clicar(); passo(1);
  eq('um clique gasta uma bala', PISTOL.ammo.loaded, carga - 1);
  eq('e sai um tiro', tiros.length, 1);
  // a bala viaja: 14 m a 253 m/s levam ~4 quadros
  eq('sem tempo de voo, ainda não acertou', acertos.length, 0);
  passo(8);
  ok('e depois do voo acerta o alvo a 14 m',
    acertos.at(-1)?.target === alvo, `${acertos.at(-1)?.amount} de dano`);

  clicar(); passo(1);
  eq('clicar antes do intervalo não dispara', PISTOL.ammo.loaded, carga - 1);

  passo(Math.ceil(PISTOL.firearm.fireInterval / DT) + 2);
  clicar(); passo(1);
  eq('depois do intervalo dispara de novo', PISTOL.ammo.loaded, carga - 2);

  suite('recarga');

  reporAlvo();
  PISTOL.ammo.loaded = 2;
  PISTOL.ammo.reserve = 21;
  tecla('KeyR'); passo(1);
  ok('R começa a recarga', player.gun.reloading > 0);

  clicar(); passo(2);
  eq('não dá pra atirar recarregando', PISTOL.ammo.loaded, 2);

  passo(Math.ceil(PISTOL.firearm.reloadTime / DT) + 4);
  eq('a recarga completa o carregador', PISTOL.ammo.loaded, PISTOL.firearm.magazine + 1);
  eq('e tira do que estava guardado', PISTOL.ammo.reserve, 21 - 6);
  note('capacidade', `${PISTOL.firearm.magazine} + 1 na câmara`);

  PISTOL.ammo.loaded = 0;
  PISTOL.ammo.reserve = 7;
  clicar(); passo(2);
  ok('clicar com o carregador vazio já recarrega', player.gun.reloading > 0);
  passo(Math.ceil(PISTOL.firearm.reloadTime / DT) + 4);
  eq('e sem nada na câmara entram sete', PISTOL.ammo.loaded, PISTOL.firearm.magazine);

  suite('mira de ferro');

  eq('em repouso a arma está no quadril', player.gun.aim, 0);
  segurarDireito(true);
  passo(Math.ceil(PISTOL.firearm.adsTime / DT) * 3);
  ok('segurar o botão direito leva a arma ao olho', player.gun.aim > 0.9,
    player.gun.aim.toFixed(2));

  segurarDireito(false);
  passo(Math.ceil(PISTOL.firearm.adsTime / DT) * 3);
  ok('soltar desce a arma', player.gun.aim < 0.1, player.gun.aim.toFixed(2));

  ok('mirar fecha a abertura do tiro',
    PISTOL.firearm.adsSpread < PISTOL.firearm.hipSpread,
    `${PISTOL.firearm.adsSpread}° contra ${PISTOL.firearm.hipSpread}° do quadril`);

  suite('a bala respeita o que está na frente');

  reporAlvo();
  PISTOL.ammo.loaded = 8;
  const parede = {
    box: new THREE.Box3(new THREE.Vector3(-3, 0, -7.1), new THREE.Vector3(3, 4, -6.9)),
    standable: false
  };
  colliders.push(parede);

  const antes = alvo.health;
  passo(Math.ceil(PISTOL.firearm.fireInterval / DT) + 2);
  clicar(); passo(10);
  eq('parede no caminho segura o tiro', alvo.health, antes);

  colliders.pop();
  passo(Math.ceil(PISTOL.firearm.fireInterval / DT) + 2);
  clicar(); passo(10);
  ok('tirando a parede, acerta', alvo.health < antes);

  suite('faca na mão não atira');

  player.selectSlot(player.carried.indexOf(KNIFE));
  const municao = PISTOL.ammo.loaded;
  clicar(); passo(2);
  eq('sem arma de fogo, o clique não gasta bala', PISTOL.ammo.loaded, municao);
  eq('e a mira não sobe', player.gun.aim, 0);

  player.controls.isLocked = false;
}
