import * as THREE from 'three';
import { isMouseDown, consumeClick, consumePress, MOUSE_RIGHT } from '../core/input.js';
import { RELOAD_KEYS } from '../player/constants.js';

/**
 * Arma de fogo: tiro, munição, recarga e mira de ferro.
 *
 * O tiro é hitscan — a bala chega no instante do disparo. Numa pistola a
 * .45 a 55 m isso é indistinguível de projétil viajando, e evita todo um
 * sistema de balas em voo pra ganhar nada.
 *
 * A abertura do tiro é um cone em volta da mira: largo do quadril, quase
 * nulo com a arma no olho. É o que dá sentido mecânico a mirar, além do
 * visual.
 */
export function initFirearm(player, world) {
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const scratch = new THREE.Vector3();

  const listeners = [];
  const state = player.gun;

  /**
   * Distância até o colisor mais próximo na direção do tiro.
   *
   * `ignore` existe pelo mesmo motivo que no corpo a corpo: o colisor do
   * alvo fica entre o atirador e o centro dele, e sem essa exceção a bala
   * "bate na parede" que é o próprio boneco. Antes disso o acerto dependia
   * de a abertura do tiro escapar pela lateral da caixa — era sorte.
   */
  function wallDistance(from, dir, limit, ignore) {
    const ray = new THREE.Ray(from, dir);
    let nearest = limit;

    for (const collider of player.colliders) {
      if (collider === ignore) continue;
      const hit = ray.intersectBox(collider.box, scratch);
      if (!hit) continue;
      const distance = from.distanceTo(hit);
      if (distance < nearest) nearest = distance;
    }
    return nearest;
  }

  /**
   * Primeiro alvo atingido pelo raio, se nada estiver na frente dele.
   *
   * A ordem importa: acha o alvo primeiro, e só então pergunta se há parede
   * mais perto que ele. O contrário obrigaria a saber qual colisor ignorar
   * antes de saber em quem se está atirando.
   */
  function traceTarget(firearm) {
    let best = null;
    let bestDistance = firearm.range;

    for (const target of world.targets ?? []) {
      if (!target.alive) continue;

      toTarget.copy(target.center()).sub(origin);
      const along = toTarget.dot(direction);
      if (along <= 0 || along > bestDistance) continue;

      // distância do centro do alvo até a linha do tiro
      const miss = Math.sqrt(Math.max(0, toTarget.lengthSq() - along * along));
      if (miss > target.radius) continue;

      best = target;
      bestDistance = along;
    }

    if (!best) return null;
    return wallDistance(origin, direction, firearm.range, best.collider) < bestDistance
      ? null
      : best;
  }

  function fire(firearm) {
    origin.copy(player.object.position);
    direction.set(0, 0, -1).applyQuaternion(player.object.quaternion);

    // abertura: mais fechada quanto mais a arma estiver no olho
    const spread = THREE.MathUtils.lerp(
      firearm.hipSpread, firearm.adsSpread, state.aim) * Math.PI / 180;
    if (spread > 0) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * spread;
      scratch.set(Math.cos(angle), Math.sin(angle), 0)
        .applyQuaternion(player.object.quaternion);
      direction.addScaledVector(scratch, Math.tan(radius)).normalize();
    }

    const item = player.equipped;
    item.ammo.loaded--;
    state.cooldown = firearm.fireInterval;
    state.flash = 0.045;
    state.kick = 1;

    const target = traceTarget(firearm);
    const result = target
      ? target.damage(firearm.damage)
      : { target: null, amount: 0, killed: false };

    for (const listener of listeners) listener({ ...result, fired: true });
  }

  function startReload(firearm) {
    const item = player.equipped;
    if (item.ammo.reserve <= 0) return;
    if (item.ammo.loaded >= firearm.magazine + 1) return;

    state.reloading = firearm.reloadTime;
  }

  function finishReload(firearm) {
    const item = player.equipped;
    // uma na câmara continua lá: o carregador cheio soma oito
    const capacity = firearm.magazine + (item.ammo.loaded > 0 ? 1 : 0);
    const wanted = Math.min(capacity - item.ammo.loaded, item.ammo.reserve);

    item.ammo.loaded += wanted;
    item.ammo.reserve -= wanted;
  }

  return {
    onShot(listener) {
      listeners.push(listener);
    },

    update(delta) {
      const item = player.equipped;
      const firearm = item?.firearm;

      if (!firearm) {
        state.aim = 0;
        state.reloading = 0;
        return;
      }

      state.cooldown = Math.max(0, state.cooldown - delta);
      state.flash = Math.max(0, state.flash - delta);
      state.kick = Math.max(0, state.kick - delta * 9);

      // mirar é um estado contínuo: a arma sobe e desce do olho
      const wantsAim = player.isLocked && isMouseDown(MOUSE_RIGHT)
        && state.reloading <= 0 && !player.running;
      state.aim += ((wantsAim ? 1 : 0) - state.aim)
        * Math.min(1, delta / firearm.adsTime);

      if (state.reloading > 0) {
        state.reloading -= delta;
        if (state.reloading <= 0) {
          state.reloading = 0;
          finishReload(firearm);
        }
        consumeClick();   // clique durante a recarga não fica guardado
        return;
      }

      if (!player.isLocked) return;

      if (consumePress(...RELOAD_KEYS)) {
        startReload(firearm);
        return;
      }

      // ação simples: um tiro por clique, sem automático
      if (!consumeClick()) return;
      if (state.cooldown > 0) return;

      if (item.ammo.loaded <= 0) {
        startReload(firearm);
        return;
      }
      fire(firearm);
    }
  };
}
