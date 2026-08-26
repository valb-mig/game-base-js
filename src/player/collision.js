import { PLAYER } from '../config.js';

// O player é um cilindro. Em vez de testar cilindro-vs-caixa, a AABB do
// colisor é inflada em RADIUS no plano XZ e o centro do player vira um
// ponto — mesmo resultado, muito mais barato (soma de Minkowski).
//
// RADIUS e STEP_HEIGHT são globais de propósito: valem pro mundo inteiro, e
// classe nenhuma deve sobrescrever (ver classes.js).
/**
 * Os colisores que podem cobrir (x, z).
 *
 * Uma `ListaDeColisores` responde `perto` e devolve só a célula da grade —
 * uns poucos em vez de milhares. Um Array simples não responde, e aí o laço é
 * a lista inteira: é o caso de todo dublê de teste, e continua correto, só
 * mais caro. Medido no mapa de verdade, a varredura linear com 2000 colisores
 * já custava 13% do orçamento a 60 fps.
 */
function candidatos(colliders, x, z) {
  return colliders.perto ? colliders.perto(x, z) : colliders;
}

function overlapsXZ(box, x, z, radius = PLAYER.RADIUS) {
  return x >= box.min.x - radius
      && x <= box.max.x + radius
      && z >= box.min.z - radius
      && z <= box.max.z + radius;
}

/**
 * O corpo do player em (x, z), com os pés em feetY e `height` de altura,
 * cruza algum colisor? A altura é parâmetro porque agachar encolhe o corpo.
 */
export function collides(colliders, x, z, feetY, height) {
  const headY = feetY + height;
  const climbY = feetY + PLAYER.STEP_HEIGHT;

  for (const { box } of candidatos(colliders, x, z)) {
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
 *
 * `out`, quando vem, recebe de onde saiu o piso: degrau é topo de colisor,
 * ladeira é terreno. Quem suaviza a vista precisa saber a fonte, e sair daqui
 * é de graça — a alternativa era percorrer os colisores uma segunda vez.
 */
export function groundHeightAt(colliders, x, z, feetY, terrainY = 0, out = null) {
  const reach = feetY + PLAYER.STEP_HEIGHT;
  let highest = terrainY;
  let onCollider = false;

  for (const { box, standable } of candidatos(colliders, x, z)) {
    if (!standable) continue;
    if (box.max.y <= highest || box.max.y > reach) continue;
    if (!overlapsXZ(box, x, z)) continue;
    highest = box.max.y;
    onCollider = true;
  }
  if (out) out.onCollider = onCollider;
  return highest;
}

/**
 * Teto mais baixo que a cabeça atravessa ao subir de `fromHeadY` até
 * `toHeadY`, ou Infinity se o caminho está livre.
 *
 * O trecho inteiro é considerado, não só onde a cabeça parou: pulando, ela
 * sobe vários centímetros por quadro, e testar só o fim deixaria a laje fina
 * passar entre dois quadros.
 *
 * Caixa cujo topo está ao alcance do degrau não conta — aquilo é piso pra
 * subir, não teto pra bater.
 */
export function ceilingAbove(colliders, x, z, feetY, fromHeadY, toHeadY) {
  const climbY = feetY + PLAYER.STEP_HEIGHT;
  let lowest = Infinity;

  for (const { box } of candidatos(colliders, x, z)) {
    if (box.max.y <= climbY) continue;          // é piso, não teto
    if (box.min.y < fromHeadY || box.min.y >= toHeadY) continue;
    if (!overlapsXZ(box, x, z)) continue;
    if (box.min.y < lowest) lowest = box.min.y;
  }
  return lowest;
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

/**
 * Superfície de apoio para um objeto solto no mundo, vindo de cima.
 *
 * Diferente de groundHeightAt: não infla pelo raio do jogador (um objeto no
 * chão é praticamente um ponto) e não tem STEP_HEIGHT — nada de subir degrau.
 */
export function restHeightAt(colliders, x, z, fromY, terrainY = 0) {
  // `fromY` é o topo do trecho percorrido no frame, não a posição final:
  // é o que impede o objeto de atravessar uma superfície entre dois frames.
  let highest = terrainY;

  for (const { box, standable } of colliders) {
    if (!standable) continue;
    if (box.max.y <= highest || box.max.y > fromY + 0.001) continue;
    if (!overlapsXZ(box, x, z, 0)) continue;
    highest = box.max.y;
  }
  return highest;
}

/**
 * O ponto está livre pra um jogador de pé nascer ali?
 *
 * Vale como porteiro de mapa: zona de nascimento dentro de geometria faz o
 * jogador aparecer preso, e não há nada que ele possa fazer a respeito.
 */
export function spawnIsClear(colliders, x, z, groundY, height) {
  return !collides(colliders, x, z, groundY, height);
}
