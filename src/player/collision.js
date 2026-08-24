import { PLAYER } from '../config.js';

// O player é um cilindro. Em vez de testar cilindro-vs-caixa, a AABB do
// colisor é inflada em RADIUS no plano XZ e o centro do player vira um
// ponto — mesmo resultado, muito mais barato (soma de Minkowski).
//
// RADIUS e STEP_HEIGHT são globais de propósito: valem pro mundo inteiro, e
// classe nenhuma deve sobrescrever (ver classes.js).
function overlapsXZ(box, x, z) {
  return x >= box.min.x - PLAYER.RADIUS
      && x <= box.max.x + PLAYER.RADIUS
      && z >= box.min.z - PLAYER.RADIUS
      && z <= box.max.z + PLAYER.RADIUS;
}

/**
 * O corpo do player em (x, z), com os pés em feetY e `height` de altura,
 * cruza algum colisor? A altura é parâmetro porque agachar encolhe o corpo.
 */
export function collides(colliders, x, z, feetY, height) {
  const headY = feetY + height;
  const climbY = feetY + PLAYER.STEP_HEIGHT;

  for (const { box } of colliders) {
    if (!overlapsXZ(box, x, z)) continue;
    // degraus baixos passam por baixo do teste, viram "subida"
    if (climbY < box.max.y && headY > box.min.y) return true;
  }
  return false;
}

/**
 * Altura do piso sob o player: o terreno, ou o topo do colisor mais alto que
 * ele ainda alcança. `terrainY` é o chão de verdade — sem ele o jogador
 * afundaria na ilha, porque antes o terreno era um plano em y=0.
 */
export function groundHeightAt(colliders, x, z, feetY, terrainY = 0) {
  const reach = feetY + PLAYER.STEP_HEIGHT;
  let highest = terrainY;

  for (const { box, standable } of colliders) {
    if (!standable) continue;
    if (box.max.y <= highest || box.max.y > reach) continue;
    if (!overlapsXZ(box, x, z)) continue;
    highest = box.max.y;
  }
  return highest;
}

/** Altura do terreno sob o player, ou 0 se ele não tem terreno. */
export function terrainUnder(player, x, z) {
  return player.terrain ? player.terrain.heightAt(x, z) : 0;
}

/** O player cabe na altura pedida, aqui onde ele está? */
export function fits(player, height) {
  const position = player.object.position;
  // No chão os pés estão fixos no piso e a cabeça é que sobe.
  // No ar a cabeça é que fica parada e os pés é que descem.
  const feetY = player.onGround ? player.feetY : player.eyeY - height;
  return !collides(player.colliders, position.x, position.z, feetY, height);
}
