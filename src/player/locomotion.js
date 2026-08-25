import * as THREE from 'three';
import { WORLD } from '../config.js';
import { axis, isDown, consumePress } from '../core/input.js';
import { collides, groundHeightAt, terrainUnder, ceilingAbove } from './collision.js';
import { horizontalRight, forwardX, forwardZ } from './heading.js';
import {
  STAND, CROUCH, PRONE,
  FORWARD_KEYS, BACK_KEYS, RIGHT_KEYS, LEFT_KEYS, JUMP_KEYS, RUN_KEYS
} from './constants.js';

// Folga contra ruído de ponto flutuante quando o jogador está quase parado.
const SLOPE_EPSILON = 0.001;

// De onde saiu o piso deste quadro: preenchido por groundHeightAt.
const floorSource = { onCollider: false };

/**
 * Quanto o piso pode subir ou descer neste quadro e ainda ser ladeira.
 *
 * Sai da velocidade: numa rampa o chão só varia o que o jogador andou, vezes
 * a inclinação. Qualquer variação maior que isso é beirada (descendo) ou
 * degrau (subindo) — e a conta ser por quadro é o que faz o limite valer
 * igual a 30 e a 144 fps.
 */
function slopeReach(player, delta) {
  return player.speed * delta * player.stats.SNAP_SLOPE + SLOPE_EPSILON;
}

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

  // água pela canela já freia; na altura do peito o jogador passa a nadar
  if (player.submerged > 0) {
    const wade = Math.min(1, player.submerged / stats.SWIM_DEPTH);
    maxSpeed *= 1 - stats.WADE_PENALTY * wade;
  }

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

  // Já colidindo onde está? Então bloquear não protege nada — só prende.
  //
  // Quem termina dentro de geometria (uma queda que assenta debaixo de uma
  // laje, por exemplo) via toda direção ser recusada, inclusive a da saída.
  // Enquanto estiver assim, o movimento passa livre até ele sair sozinho.
  const encaixotado = collides(player.colliders, prevX, prevZ, feetY, player.height);

  if (!encaixotado) {
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

  const headBefore = player.eyeY;
  player.eyeY += (previousVertical + player.verticalVelocity) * 0.5 * delta;

  // Bater a cabeça. Sem isto o pulo atravessava qualquer laje: o movimento
  // vertical só olhava o piso, e subir por baixo de um teto levava o jogador
  // pra dentro dele — e, ao cair, pra cima dele.
  if (player.eyeY > headBefore) {
    const teto = ceilingAbove(
      player.colliders, position.x, position.z,
      player.feetY, headBefore, player.eyeY
    );
    if (teto < Infinity) {
      player.eyeY = teto;
      player.verticalVelocity = 0;
      player.jumpCutPending = false;
    }
  }

  const floorY = groundHeightAt(
    player.colliders, position.x, position.z, player.feetY,
    terrainUnder(player, position.x, position.z), floorSource
  );
  const landingEyeY = floorY + player.height;
  const reach = slopeReach(player, delta);

  // Descer ladeira não é cair. O piso baixa mais rápido do que a gravidade
  // puxa nos primeiros quadros, e sem isto o jogador passava a descida inteira
  // no ar: 214 de 220 quadros a 40°, com os olhos até 1 m acima do chão,
  // saltando e aterrissando sem parar — é este o tremor da ladeira.
  //
  // Colar só vale pra quem já estava no chão e não está subindo: pulo tem
  // verticalVelocity positiva, e beirada de verdade baixa mais que a
  // velocidade explica, então continua sendo queda.
  const dropped = player.eyeY - landingEyeY;
  if (player.onGround && player.verticalVelocity <= 0
      && dropped > 0 && dropped <= reach) {
    player.eyeY = landingEyeY;
  }

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

    // Só degrau de verdade desconta a câmera. Numa ladeira o jogador sobe um
    // tiquinho todo frame, e a vista ficaria permanentemente atrasada subindo
    // qualquer morro.
    //
    // O que separa um do outro é a FONTE do piso, não a altura: degrau é topo
    // de colisor, ladeira é terreno. Pela altura isso dependia do framerate —
    // a 30 fps a rampa de 40° sobe 23 cm por quadro, o limiar fixo de 12 cm
    // achava degrau onde não tinha, e a vista passava 100 quadros atrasada.
    // O terreno ainda pode dar um salto que nenhuma velocidade explica, e aí
    // a suavização volta a fazer sentido.
    const isStep = floorSource.onCollider || climbed > reach;
    if (isStep && climbed > stats.STEP_VIEW_MIN) {
      player.viewOffset = Math.max(player.viewOffset - climbed, -stats.STEP_HEIGHT);
    }
    player.floorY = floorY;
  }
}
