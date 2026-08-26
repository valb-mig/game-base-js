import { WORLD } from '../config.js';
import { isDown } from '../core/input.js';
import { horizontalRight, forwardX, forwardZ } from './heading.js';
import { collides, terrainUnder, waterLevelUnder } from './collision.js';
import { JUMP_KEYS, RUN_KEYS, CROUCH_KEYS, FORWARD_KEYS, BACK_KEYS, RIGHT_KEYS, LEFT_KEYS } from './constants.js';
import { axis } from '../core/input.js';

/**
 * Natação.
 *
 * É um modo de locomoção inteiro, não um redutor de velocidade: sem
 * gravidade, sem pulo, com movimento na direção do olhar (olhar pra baixo
 * mergulha) e empuxo puxando o corpo de volta pra superfície.
 *
 * A troca entre andar e nadar é decidida pela profundidade do fundo, não
 * pela altura do jogador — assim entrar no mar é gradual: primeiro a água
 * bate na canela e freia, depois o pé não alcança e ele passa a nadar.
 */

/** Fundo da água sob o jogador, ignorando caixa: água é sempre sobre terreno. */
export function waterDepthUnder(player, x, z) {
  return waterLevelUnder(player, x, z) - terrainUnder(player, x, z);
}

/**
 * Decide, a cada frame, se o jogador está nadando, com água pela cintura, ou
 * seco — e guarda em `player.waterY` a lâmina d'água DELE.
 *
 * O nível fica no jogador em vez de ser lido da constante em cinco lugares
 * porque ele depende de onde o jogador está: o mar corre a zero e o rio a
 * 7,9 m. Lido uma vez por quadro, ninguém pode discordar de ninguém no meio
 * do mesmo frame.
 */
export function updateWaterState(player) {
  const position = player.object.position;
  const nivel = waterLevelUnder(player, position.x, position.z);
  const bottom = nivel - terrainUnder(player, position.x, position.z);

  player.waterY = nivel;
  player.waterDepth = Math.max(0, bottom);
  player.submerged = Math.max(0, nivel - player.feetY);
  player.headUnderwater = player.eyeY < nivel;

  // Só nada onde o pé não alcança. Sair da água é o mesmo teste ao contrário,
  // então o jogador volta a andar sozinho ao chegar no raso.
  player.swimming = bottom > player.stats.SWIM_DEPTH
    && player.feetY < nivel;
}

export function swim(player, delta) {
  const { stats, velocity, wish, right } = player;
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
  if (wishLength > 1) wish.multiplyScalar(1 / wishLength);
  const hasInput = wishLength > 1e-4;

  // nadar pra frente segue o olhar: cabeça pra baixo mergulha
  const pitch = player.lookPitch;
  const maxSpeed = isDown(...RUN_KEYS) ? stats.SWIM_FAST_SPEED : stats.SWIM_SPEED;
  const horizontalScale = hasInput ? Math.cos(pitch) : 0;

  const targetX = wish.x * maxSpeed * Math.abs(horizontalScale);
  const targetZ = wish.z * maxSpeed * Math.abs(horizontalScale);
  const rate = (hasInput ? stats.SWIM_ACCEL : stats.SWIM_DRAG) * delta;

  velocity.x += Math.max(-rate, Math.min(rate, targetX - velocity.x));
  velocity.z += Math.max(-rate, Math.min(rate, targetZ - velocity.z));

  // vertical: o olhar mergulha, espaço sobe, C desce, e o empuxo devolve
  let verticalTarget = hasInput && forward !== 0
    ? Math.sin(pitch) * maxSpeed * Math.sign(forward)
    : 0;
  if (isDown(...JUMP_KEYS)) verticalTarget += stats.SWIM_RISE_SPEED;
  if (isDown(...CROUCH_KEYS)) verticalTarget -= stats.SWIM_RISE_SPEED;

  const surfaceEye = player.waterY + stats.FLOAT_EYE;
  if (verticalTarget === 0) {
    // boiar: sobe até os olhos ficarem na linha d'água e para
    const error = surfaceEye - player.eyeY;
    verticalTarget = Math.max(-stats.SWIM_RISE_SPEED,
      Math.min(stats.SWIM_RISE_SPEED, error * stats.BUOYANCY));
  }

  const verticalRate = stats.SWIM_ACCEL * delta;
  player.verticalVelocity += Math.max(-verticalRate,
    Math.min(verticalRate, verticalTarget - player.verticalVelocity));

  // nunca acima da linha d'água: sem isso o jogador salta pra fora boiando
  const previous = player.verticalVelocity;
  player.eyeY += previous * delta;
  if (player.eyeY > surfaceEye && player.verticalVelocity > 0 && !isDown(...JUMP_KEYS)) {
    player.eyeY = surfaceEye;
    player.verticalVelocity = 0;
  }

  const prevX = position.x;
  const prevZ = position.z;
  let nextX = prevX + velocity.x * delta;
  let nextZ = prevZ + velocity.z * delta;

  if (collides(player.colliders, nextX, prevZ, player.feetY, player.height)) {
    nextX = prevX;
    velocity.x = 0;
  }
  if (collides(player.colliders, nextX, nextZ, player.feetY, player.height)) {
    nextZ = prevZ;
    velocity.z = 0;
  }

  const limit = WORLD.SIZE / 2 - 1;
  position.x = Math.max(-limit, Math.min(limit, nextX));
  position.z = Math.max(-limit, Math.min(limit, nextZ));

  // não atravessa o fundo do mar
  const bottom = terrainUnder(player, position.x, position.z);
  if (player.feetY < bottom) {
    player.eyeY = bottom + player.height;
    if (player.verticalVelocity < 0) player.verticalVelocity = 0;
  }

  player.onGround = false;
  player.running = false;
  player.floorY = bottom;
}
