import * as THREE from 'three';
import { isMouseDown, consumeClick, consumePress, MOUSE_RIGHT } from '../core/input.js';
import { RELOAD_KEYS } from '../player/constants.js';
import { BULLET } from '../config.js';
import { muzzleShot, createShot, createMuzzle } from './muzzle.js';

/**
 * Arma de fogo: tiro, munição, recarga e mira de ferro.
 *
 * A arma não resolve acerto: ela dispara uma bala e acabou. Quem viaja,
 * cai e atinge é items/ballistics.js. Isso mantém a arma tratando do que é
 * dela — munição, cadência, recarga, mira — e deixa a balística num lugar só,
 * igual pra qualquer arma que venha depois.
 *
 * A abertura do tiro é um cone em volta da mira: largo do quadril, quase
 * nulo com a arma no olho. É o que dá sentido mecânico a mirar, além do
 * visual.
 *
 * A bala sai da boca do cano e segue o cano, não o olho e não a mira — quem
 * calcula isso é items/muzzle.js, lendo a arma na mão do viewmodel. Sem
 * viewmodel (suítes que só exercitam munição e cadência) o tiro sai do olho,
 * reto, como antes.
 */
export function initFirearm(player, world, ballistics, viewmodel = null) {
  const shot = createShot();
  const muzzle = createMuzzle();
  const scratch = new THREE.Vector3();

  const listeners = [];
  const state = player.gun;
  let rounds = 0;

  function fire(firearm) {
    const eye = player.object.position;

    if (viewmodel?.readMuzzle(muzzle)) {
      muzzleShot(shot, player.object, muzzle, BULLET.MUZZLE_BEND, BULLET.MUZZLE_RISE);
      // arma encostada em parede: a boca está do outro lado dela, e nascer
      // ali seria atirar através da parede
      if (ballistics.blocked(eye, shot.origin)) shot.origin.copy(eye);
    } else {
      shot.origin.copy(eye);
      shot.direction.set(0, 0, -1).applyQuaternion(player.object.quaternion);
    }

    // abertura: mais fechada quanto mais a arma estiver no olho
    const spread = THREE.MathUtils.lerp(
      firearm.hipSpread, firearm.adsSpread, state.aim) * Math.PI / 180;
    if (spread > 0) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * spread;
      scratch.set(Math.cos(angle), Math.sin(angle), 0)
        .applyQuaternion(player.object.quaternion);
      shot.direction.addScaledVector(scratch, Math.tan(radius)).normalize();
    }

    const item = player.equipped;
    item.ammo.loaded--;
    state.cooldown = firearm.fireInterval;
    state.flash = 0.045;
    state.kick = 1;

    // Traçante a cada tantos tiros, como nas fitas da guerra: o risco serve
    // pra corrigir a pontaria, não pra desenhar toda bala.
    rounds++;
    ballistics.spawn(shot.origin, shot.direction, {
      damage: firearm.damage,
      range: firearm.range,
      tracer: rounds % BULLET.TRACER_EVERY === 0
    });

    for (const listener of listeners) listener({ tracer: rounds % BULLET.TRACER_EVERY === 0 });
  }

  function startReload(firearm) {
    const item = player.equipped;
    if (item.ammo.reserve <= 0) return;
    if (item.ammo.loaded >= firearm.magazine + 1) return;

    state.reloading = firearm.reloadTime;
    state.reloadProgress = 0;
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

      // O tempo corre mesmo com a arma guardada. Descontando só enquanto ela
      // está na mão, guardar e sacar de novo encontrava o intervalo do último
      // tiro congelado, e o primeiro clique depois da troca não disparava.
      state.cooldown = Math.max(0, state.cooldown - delta);
      state.flash = Math.max(0, state.flash - delta);
      state.kick = Math.max(0, state.kick - delta * 9);

      if (!firearm) {
        state.aim = 0;
        state.reloading = 0;
        return;
      }

      // mirar é um estado contínuo: a arma sobe e desce do olho
      const wantsAim = player.isLocked && isMouseDown(MOUSE_RIGHT)
        && state.reloading <= 0 && !player.running;
      state.aim += ((wantsAim ? 1 : 0) - state.aim)
        * Math.min(1, delta / firearm.adsTime);

      if (state.reloading > 0) {
        state.reloading -= delta;
        state.reloadProgress = 1 - state.reloading / firearm.reloadTime;
        if (state.reloading <= 0) {
          state.reloading = 0;
          state.reloadProgress = 0;
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
