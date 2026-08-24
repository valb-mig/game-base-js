import * as THREE from 'three';
import { WORLD, PLAYER } from '../config.js';
import { axis, isDown } from '../core/input.js';
import {
  FORWARD_KEYS, BACK_KEYS, RIGHT_KEYS, LEFT_KEYS, JUMP_KEYS, CROUCH_KEYS, RUN_KEYS
} from './constants.js';

/**
 * Espectador: fantasma que voa pelo mapa.
 *
 * Não colide com nada e não tem gravidade — de propósito. Quem está
 * observando precisa atravessar a floresta e subir pra ver a partida, não
 * lutar com o cenário. O único limite é a caixa do mapa, pra não sumir no
 * vazio, e o fundo do mar, pra não ficar embaixo do terreno.
 *
 * Diferente do jogador vivo, aqui o movimento segue o olhar em 3D: olhar pra
 * cima e ir pra frente sobe.
 */

const SPEED = 22;
const FAST_SPEED = 60;
const ACCEL = 9;         // suavidade da resposta; voar duro embrulha o estômago
const VERTICAL_SPEED = 16;
const CEILING = 220;

export function spectate(player, delta) {
  const { velocity } = player;
  const position = player.object.position;

  const forwardInput = axis(FORWARD_KEYS, BACK_KEYS);
  const strafeInput = axis(RIGHT_KEYS, LEFT_KEYS);

  // base 3D: o espectador voa pra onde olha, inclusive pra cima
  const forward = player.wish.set(0, 0, -1).applyQuaternion(player.object.quaternion);
  const right = player.right.set(1, 0, 0).applyQuaternion(player.object.quaternion);

  const maxSpeed = isDown(...RUN_KEYS) ? FAST_SPEED : SPEED;

  const targetX = (forward.x * forwardInput + right.x * strafeInput) * maxSpeed;
  const targetY = (forward.y * forwardInput + right.y * strafeInput) * maxSpeed;
  const targetZ = (forward.z * forwardInput + right.z * strafeInput) * maxSpeed;

  let verticalIntent = 0;
  if (isDown(...JUMP_KEYS)) verticalIntent += VERTICAL_SPEED;
  if (isDown(...CROUCH_KEYS)) verticalIntent -= VERTICAL_SPEED;

  const rate = Math.min(1, ACCEL * delta);
  velocity.x += (targetX - velocity.x) * rate;
  velocity.z += (targetZ - velocity.z) * rate;
  player.verticalVelocity += ((targetY + verticalIntent) - player.verticalVelocity) * rate;

  position.x += velocity.x * delta;
  position.z += velocity.z * delta;
  player.eyeY += player.verticalVelocity * delta;

  const limit = WORLD.SIZE / 2 - 2;
  position.x = THREE.MathUtils.clamp(position.x, -limit, limit);
  position.z = THREE.MathUtils.clamp(position.z, -limit, limit);

  // não atravessa o chão: fantasma passa pelas árvores, não pela ilha
  const ground = player.terrain
    ? player.terrain.heightAt(position.x, position.z)
    : 0;
  const floor = Math.max(ground, -WORLD.SEA_DEPTH) + 1.2;
  player.eyeY = THREE.MathUtils.clamp(player.eyeY, floor, CEILING);

  position.y = player.eyeY;

  // estado que o resto do jogo lê, fixado pra ninguém confundir com jogo vivo
  player.onGround = false;
  player.running = false;
  player.swimming = false;
  player.submerged = 0;
  player.headUnderwater = player.eyeY < WORLD.WATER_LEVEL;
  player.height = PLAYER.HEIGHT;
  player.state = 'espectando';
}
