import * as THREE from 'three';
import { WORLD } from '../config.js';
import { axis, isDown, consumePress } from '../core/input.js';
import { collides, groundHeightAt } from './collision.js';
import { horizontalRight, forwardX, forwardZ } from './heading.js';
import {
  STAND, CROUCH, PRONE,
  FORWARD_KEYS, BACK_KEYS, RIGHT_KEYS, LEFT_KEYS, JUMP_KEYS, RUN_KEYS
} from './constants.js';

// Move `vec` na direção de `target` no máximo `maxStep`. Trabalhar com o
// vetor inteiro (e não eixo a eixo) mantém a diagonal com a mesma resposta
// das direções retas.
function moveTowards(vec, target, maxStep) {
  const dx = target.x - vec.x;
  const dz = target.z - vec.z;
  const dist = Math.hypot(dx, dz);

  if (dist <= maxStep || dist === 0) {
    vec.x = target.x;
    vec.z = target.z;
    return;
  }
  vec.x += (dx / dist) * maxStep;
  vec.z += (dz / dist) * maxStep;
}

export function moveHorizontal(player, delta) {
  const { stats, velocity, wish, target, right } = player;
  const position = player.object.position;

  const forward = axis(FORWARD_KEYS, BACK_KEYS);
  const strafe = axis(RIGHT_KEYS, LEFT_KEYS);

  horizontalRight(player.object.quaternion, right);

  wish.set(
    forwardX(right) * forward + right.x * strafe,
    0,
    forwardZ(right) * forward + right.z * strafe
  );

  const wishLength = Math.hypot(wish.x, wish.z);
  const hasInput = wishLength > 1e-4;
  if (wishLength > 1) wish.multiplyScalar(1 / wishLength);

  if (stats.RUN_TOGGLE) {
    if (consumePress(...RUN_KEYS)) player.runLatched = !player.runLatched;
  } else {
    player.runLatched = isDown(...RUN_KEYS);
  }
  if (player.stance !== STAND) player.runLatched = false;

  player.running = player.runLatched && hasInput && player.stance === STAND;

  let maxSpeed = stats.WALK_SPEED;
  if (player.stance === PRONE) maxSpeed = stats.PRONE_SPEED;
  else if (player.stance === CROUCH) maxSpeed = stats.CROUCH_SPEED;
  else if (player.running) maxSpeed = stats.RUN_SPEED;
  if (forward < 0) maxSpeed *= stats.BACK_PENALTY;

  if (player.onGround) {
    target.set(wish.x * maxSpeed, 0, wish.z * maxSpeed);
    moveTowards(velocity, target, (hasInput ? stats.ACCEL : stats.DECEL) * delta);
  } else if (hasInput) {
    // No ar o jogador não perde o embalo com que saltou: o teto é o maior
    // entre a velocidade atual e a do modo pedido. Pular correndo mantém
    // a corrida mesmo se o Shift for solto no meio do salto.
    const cap = Math.max(player.speed, maxSpeed);
    target.set(wish.x * cap, 0, wish.z * cap);
    moveTowards(velocity, target, stats.AIR_ACCEL * delta);
  } else {
    target.set(0, 0, 0);
    moveTowards(velocity, target, stats.AIR_DRAG * delta);
  }

  const prevX = position.x;
  const prevZ = position.z;
  let nextX = prevX + velocity.x * delta;
  let nextZ = prevZ + velocity.z * delta;
  const feetY = player.feetY;

  // Resolve um eixo por vez pra deslizar na parede. Testar os dois
  // juntos travaria o jogador em qualquer aproximação diagonal.
  if (collides(player.colliders, nextX, prevZ, feetY, player.height)) {
    nextX = prevX;
    velocity.x = 0;
  }
  if (collides(player.colliders, nextX, nextZ, feetY, player.height)) {
    nextZ = prevZ;
    velocity.z = 0;
  }

  const limit = WORLD.SIZE / 2 - 1;
  position.x = THREE.MathUtils.clamp(nextX, -limit, limit);
  position.z = THREE.MathUtils.clamp(nextZ, -limit, limit);
  if (position.x !== nextX) velocity.x = 0;
  if (position.z !== nextZ) velocity.z = 0;
}

export function moveVertical(player, delta) {
  const { stats } = player;
  const position = player.object.position;
  let jumpedNow = false;

  player.coyote = player.onGround
    ? stats.COYOTE_TIME
    : Math.max(0, player.coyote - delta);

  player.jumpBuffer = consumePress(...JUMP_KEYS)
    ? stats.JUMP_BUFFER
    : Math.max(0, player.jumpBuffer - delta);

  if (player.jumpBuffer > 0 && player.coyote > 0) {
    player.verticalVelocity = stats.JUMP_SPEED;
    player.onGround = false;
    player.jumpBuffer = 0;
    player.coyote = 0;
    player.jumpCutPending = true;
    jumpedNow = true;
  }

  // Soltar o espaço no meio da subida encurta o pulo — mas nunca no frame
  // do próprio salto: num toque rápido o keyup cai entre dois frames e o
  // corte comia o pulo inteiro antes dele começar. E o corte tem piso, pra
  // que um toque curto continue sendo um pulo de verdade.
  if (player.jumpCutPending && !jumpedNow && player.verticalVelocity > 0
      && !isDown(...JUMP_KEYS)) {
    player.verticalVelocity = Math.max(
      player.verticalVelocity * stats.JUMP_CUT,
      Math.min(stats.JUMP_MIN_SPEED, player.verticalVelocity)
    );
    player.jumpCutPending = false;
  }

  // Integração trapezoidal: move pela média entre a velocidade antes e
  // depois da gravidade. Aplicando a gravidade primeiro e movendo com o
  // resultado, cada frame comia v0*dt/2 de altura — o pulo ficava mais baixo
  // quanto pior o framerate (1,20 m a 30 fps contra 1,31 a 144). Assim a
  // trajetória fecha com a física contínua em qualquer dt.
  const previousVertical = player.verticalVelocity;
  player.verticalVelocity -= stats.GRAVITY * delta;
  player.eyeY += (previousVertical + player.verticalVelocity) * 0.5 * delta;

  const floorY = groundHeightAt(player.colliders, position.x, position.z, player.feetY);
  const landingEyeY = floorY + player.height;

  // só aterrissa descendo — senão o jogador gruda em caixas ao subir raspando
  if (player.verticalVelocity <= 0 && player.eyeY <= landingEyeY) {
    if (!player.onGround) {
      const impact = Math.min(
        Math.abs(player.verticalVelocity) * stats.LAND_DIP,
        stats.LAND_DIP_MAX
      );
      player.viewOffset -= impact;
    }
    player.eyeY = landingEyeY;
    player.verticalVelocity = 0;
    player.onGround = true;
    player.jumpCutPending = false;
  } else {
    player.onGround = false;
  }

  // Subir um degrau teleporta os olhos. Descontar a subida do offset de
  // câmera deixa a subida contínua sem mentir pra física.
  if (player.onGround) {
    const climbed = floorY - player.floorY;
    if (climbed > 0.01) {
      player.viewOffset = Math.max(player.viewOffset - climbed, -stats.STEP_HEIGHT);
    }
    player.floorY = floorY;
  }
}
