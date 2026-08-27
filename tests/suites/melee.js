import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { initAttack } from '../../src/items/attack.js';
import { createDummy } from '../../src/world/dummy.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { MELEE } from '../../src/config.js';
import { KNIFE } from '../../src/items/classes.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;
const chao = { heightAt: () => 0, waterDepthAt: () => 0, nivelDaAguaAt: () => 0 };

/**
 * Põe o item na mão e ESPERA a troca terminar.
 *
 * Trocar de item leva tempo desde que guardar e sacar viraram animação: ler
 * `equipped` no mesmo quadro do `selectSlot` lê o item ANTIGO, porque a troca
 * acontece no fundo do movimento.
 */
function empunhar(player, indice) {
  player.selectSlot(indice);
  for (let i = 0; i < 600 && player.swapping; i++) player.advanceSwap(1 / 60);
  return player.equipped;
}

export function run() {
  initInput();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  const scene = new THREE.Scene();
  const colliders = [];

  const player = new Player(camera, document.body, {
    colliders, terrain: chao, spawn: new THREE.Vector3(0, 0, 0)
  });
  player.controls.isLocked = true;
  // a Assault nasce com a pistola na mão; este suite é sobre a faca
  empunhar(player, player.carried.indexOf(KNIFE));

  // boneco 1,4 m à frente (o -Z é a frente com yaw zero)
  const alvo = createDummy(scene, colliders, { x: 0, z: -1.4, ground: 0, name: 'alvo' });
  const world = { targets: [alvo] };
  const attack = initAttack(player, world);

  const acertos = [];
  attack.onHit((r) => acertos.push(r));

  const clique = () => dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
  const soltar = () => dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
  const passo = (n = 1) => {
    for (let i = 0; i < n; i++) {
      attack.update(DT);
      for (const t of world.targets) t.update(DT);
      endFrame();
    }
  };
  const olharPara = (yawGraus) => camera.quaternion.setFromEuler(
    new THREE.Euler(0, yawGraus * Math.PI / 180, 0, 'YXZ'));

  // dois golpes matam (55 de 100), então o alvo é reposto entre as seções
  const reporAlvo = () => {
    alvo.health = alvo.maxHealth;
    alvo.alive = true;
    alvo.collider.box.max.y = 2;
  };

  const posicionar = (x, z, yaw = 0) => {
    player.object.position.set(x, 1.7, z);
    player.eyeY = 1.7;
    olharPara(yaw);
  };

  suite('o golpe é uma linha do tempo');

  posicionar(0, 0);
  clique(); soltar(); passo(1);
  eq('o clique começa o golpe', player.swing.active, true);
  eq('mas o dano ainda não caiu', acertos.length, 0);
  eq('e o alvo continua inteiro', alvo.health, alvo.maxHealth);

  // avança até logo antes do quadro de dano
  const quadrosAteODano = Math.floor(MELEE.DAMAGE_AT * MELEE.SWING_TIME / DT);
  passo(quadrosAteODano - 2);
  eq('nada de dano antes da hora', acertos.length, 0);

  passo(3);
  eq('o dano cai no meio do golpe', acertos.length, 1);
  eq('e tira a vida do item', alvo.health, alvo.maxHealth - KNIFE.melee.damage);
  note('dano da faca', `${KNIFE.melee.damage} de ${alvo.maxHealth}`);

  passo(120);
  eq('um golpe só causa um dano', acertos.length, 1);
  eq('e o golpe termina', player.swing.active, false);

  suite('cadência');

  reporAlvo();

  // Regressão: o clique era consumido durante o respiro e sumia, então
  // clicar um pouco cedo não produzia golpe nenhum.
  reporAlvo();
  player.swing.cooldown = MELEE.BUFFER * 0.5;
  const marcaCedo = acertos.length;
  clique(); soltar(); passo(Math.ceil((MELEE.SWING_TIME + MELEE.COOLDOWN) / DT) + 10);
  eq('clique um tiquinho cedo ainda vale', acertos.length, marcaCedo + 1);

  reporAlvo();
  const antes = acertos.length;
  clique(); soltar(); passo(1);
  eq('clicar de novo golpeia', player.swing.active, true);
  clique(); soltar(); passo(2);
  eq('clicar no meio não empilha golpe', acertos.length, antes);
  passo(120);
  eq('e só um dano saiu', acertos.length, antes + 1);
  note('golpe completo', `${MELEE.SWING_TIME}s + ${MELEE.COOLDOWN}s de respiro`);

  suite('alcance e cone');

  reporAlvo();

  const golpear = () => {
    const marca = acertos.length;
    clique(); soltar();
    // folga generosa: golpe + respiro, e sobrando
    passo(Math.ceil((MELEE.SWING_TIME + MELEE.COOLDOWN) / DT) + 10);
    return acertos.length > marca;
  };

  // longe, mas olhando pro alvo: tem que falhar por distância, não por mira
  posicionar(0, -1.4 + KNIFE.melee.reach + alvo.radius + 1.2, 0);
  eq('longe demais não acerta', golpear(), false);

  posicionar(0, -1.2, 0);
  eq('de frente e perto acerta', golpear(), true);

  posicionar(0, -1.2, 180);
  eq('de costas pro alvo não acerta', golpear(), false);

  // fora do cone: ao lado, dentro do alcance
  const lado = Math.tan((KNIFE.melee.arc + 22) * Math.PI / 180) * 1.2;
  posicionar(lado, -1.2, 0);
  eq('fora do arco não acerta', golpear(), false);

  posicionar(0, -1.2, 0);
  eq('mirando de novo acerta', golpear(), true);

  suite('parede no meio');

  reporAlvo();
  posicionar(0, -0.6, 0);

  const parede = {
    box: new THREE.Box3(new THREE.Vector3(-2, 0, -1.1), new THREE.Vector3(2, 2.5, -0.9)),
    standable: false
  };
  colliders.push(parede);
  eq('não atravessa parede', golpear(), false);

  colliders.pop();
  eq('tirando a parede, acerta', golpear(), true);

  suite('abate e volta');

  reporAlvo();
  alvo.health = KNIFE.melee.damage;   // um golpe pra abater
  posicionar(0, -1.2, 0);
  ok('o golpe que zera a vida abate', golpear() && !alvo.alive);
  eq('o último acerto veio marcado como abate', acertos.at(-1).killed, true);
  eq('vida no zero', alvo.health, 0);

  eq('caído não pode ser golpeado de novo', golpear(), false);

  passo(Math.ceil(5 / DT));
  eq('mas se levanta sozinho depois', alvo.alive, true);
  eq('com a vida cheia', alvo.health, alvo.maxHealth);

  suite('sem item na mão');

  player.carried = [];
  player.equipped = null;
  const marca = acertos.length;
  clique(); soltar(); passo(4);
  eq('de mão vazia não há golpe', player.swing.active, false);
  eq('nem dano', acertos.length, marca);

  player.controls.isLocked = false;
}
