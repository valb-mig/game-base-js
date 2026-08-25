import * as THREE from 'three';
import { DROP, WORLD } from '../config.js';
import { consumePress } from '../core/input.js';
import { DROP_KEYS, PICK_KEYS, SLOT_KEYS } from '../player/constants.js';
import { restHeightAt } from '../player/collision.js';
import { createItemModel, restingRotation, disposeModel } from './models.js';

/**
 * Itens largados no mundo.
 *
 * O que sai da mão vira uma entidade de verdade: nasce à frente do rosto com
 * o embalo de quem soltou, cai, gira no ar e assenta deitado onde parar. A
 * lista `items` guarda o dado junto da malha, então quem for escrever o
 * apanhar depois já tem tudo o que precisa — posição e qual item é.
 *
 * Debaixo d'água a queda é lenta e termina no fundo do mar: soltar a faca no
 * raso continua sendo recuperável, no fundo é problema seu.
 */
export function initDrop(scene, player, viewmodel, world) {
  const items = [];
  const forward = new THREE.Vector3();

  function spawn(item) {
    const model = createItemModel(item);
    if (!model) return null;

    const camera = player.object;
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);

    model.position.copy(camera.position).addScaledVector(forward, DROP.REACH);
    model.rotation.set(0, Math.atan2(forward.x, forward.z), 0);
    scene.add(model);

    const entity = {
      item,
      mesh: model,
      // o item herda o embalo do jogador: largar correndo joga pra frente
      velocity: new THREE.Vector3(
        player.velocity.x + forward.x * DROP.FORWARD,
        DROP.LIFT,
        player.velocity.z + forward.z * DROP.FORWARD
      ),
      spin: (Math.random() - 0.5) * 2 * DROP.SPIN,
      resting: false,
      settle: 0
    };
    items.push(entity);
    return entity;
  }

  function terrainAt(x, z) {
    return world.terrain ? world.terrain.heightAt(x, z) : 0;
  }

  function step(entity, delta) {
    if (entity.resting) {
      if (entity.settle >= 1) return;
      // assenta deitado: o giro do ar vira pose de repouso
      entity.settle = Math.min(1, entity.settle + delta / DROP.SETTLE_TIME);
      const target = restingRotation(entity.item);
      entity.mesh.rotation.x = THREE.MathUtils.lerp(entity.mesh.rotation.x, target.x, entity.settle);
      entity.mesh.rotation.z = THREE.MathUtils.lerp(entity.mesh.rotation.z, target.z, entity.settle);
      return;
    }

    const position = entity.mesh.position;
    const underwater = position.y < WORLD.WATER_LEVEL;

    if (underwater) {
      // Arrasto só no plano; o vertical converge pra velocidade terminal.
      // Amortecer o Y nos dois lugares (arrasto e convergência) compunha, e a
      // terminal real virava metade da configurada — a faca afundava tão
      // devagar que não chegava ao fundo.
      const drag = Math.exp(-DROP.WATER_DRAG * delta);
      entity.velocity.x *= drag;
      entity.velocity.z *= drag;
      entity.velocity.y = THREE.MathUtils.lerp(entity.velocity.y, -DROP.WATER_SINK, 1 - drag);
    } else {
      entity.velocity.y -= DROP.GRAVITY * delta;
    }

    // Altura de antes do passo: sem ela, um item rápido some por dentro de
    // uma caixa. Num frame ele estaria acima do topo, no seguinte já abaixo,
    // e nenhum dos dois testes veria a superfície entre eles.
    const previousY = position.y;
    position.addScaledVector(entity.velocity, delta);
    entity.mesh.rotation.z += entity.spin * delta * (underwater ? 0.25 : 1);

    const floor = restHeightAt(
      player.colliders, position.x, position.z, Math.max(previousY, position.y),
      terrainAt(position.x, position.z)
    );

    if (position.y <= floor) {
      position.y = floor;
      entity.velocity.set(0, 0, 0);
      entity.resting = true;
      entity.settle = 0;
    }
  }

  /**
   * Item alcançável agora, ou null.
   *
   * Só conta o que já parou de cair: sem isso, largar e apanhar no mesmo
   * instante viraria um piscar. E o que decide é o SLOT estar livre, não a mão
   * estar vazia: largar a pistola e continuar com a faca na mão não pode
   * trancar a pistola no chão pra sempre, que era o bug.
   */
  function reachable() {
    const position = player.object.position;
    let best = null;
    let bestDistance = DROP.PICK_REACH;

    for (const entity of items) {
      if (!entity.resting) continue;
      if (!player.canTake(entity.item)) continue;

      // Alcance no plano, com folga de um corpo na vertical. Medir em 3D a
      // partir dos olhos gastava 1,7 m dos 2,4 só porque o item está no chão:
      // um item largado andando assentava já fora do alcance, e parecia que o
      // jogo tinha comido ele.
      const ground = entity.mesh.position;
      const rise = position.y - ground.y;
      if (rise < -0.5 || rise > player.height + 0.5) continue;

      const distance = Math.hypot(ground.x - position.x, ground.z - position.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = entity;
      }
    }
    return best;
  }

  /** Põe na mão o item alcançável mais perto. Devolve o item, ou null. */
  function pickUp() {
    const entity = reachable();
    if (!entity) return null;
    // slot ocupado recusa: melhor deixar no chão que sumir com o item
    if (!player.takeCarried(entity.item)) return null;

    items.splice(items.indexOf(entity), 1);
    scene.remove(entity.mesh);
    disposeModel(entity.mesh);

    viewmodel.setItem(entity.item);
    return entity.item;
  }

  /** Tira o item da mão e devolve a entidade que caiu, ou null. */
  function dropEquipped() {
    const item = player.equipped;
    if (!item) return null;

    const entity = spawn(item);
    if (!entity) return null;

    player.dropCarried();
    viewmodel.setItem(player.equipped);
    return entity;
  }

  return {
    items,
    dropEquipped,
    pickUp,
    reachable,

    update(delta) {
      if (player.isLocked) {
        for (let i = 0; i < SLOT_KEYS.length; i++) {
          if (consumePress(SLOT_KEYS[i]) && player.selectSlot(i)) {
            viewmodel.setItem(player.equipped);
          }
        }
        if (consumePress(...DROP_KEYS)) dropEquipped();
        if (consumePress(...PICK_KEYS)) pickUp();
      }
      for (const entity of items) step(entity, delta);
    }
  };
}
