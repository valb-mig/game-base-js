import { STAMINA } from '../config.js';

/**
 * Fôlego do jogador.
 *
 * Correr drena, pular cobra de uma vez, e parar recupera depois de um
 * respiro. O peso do item na mão entra nos dois gastos: atravessar campo
 * aberto com a MP40 custa quase o dobro do que custa com a faca, e é isso que
 * torna guardar a arma uma decisão em vez de um detalhe.
 *
 * Fôlego zerado não trava ninguém — tira a corrida e o pulo, e devolve os
 * dois assim que respirar. Jogador parado sem poder fazer nada é punição, não
 * mecânica.
 */

/** Quanto o item na mão pesa. Mão vazia não pesa nada. */
export function carriedWeight(player) {
  return player.equipped?.weight ?? 0;
}

/** Fôlego que um pulo custa agora, já com o peso na conta. */
export function jumpCost(player) {
  return STAMINA.PULO + carriedWeight(player) * STAMINA.PULO_POR_KG;
}

/** Dá pra arrancar? Cansado, ele precisa recuperar um mínimo antes. */
export function canRun(player) {
  return player.running
    ? player.stamina > 0
    : player.stamina >= STAMINA.MINIMO_PRA_CORRER;
}

/** Dá pra pular? Só se o fôlego pagar o pulo inteiro. */
export function canJump(player) {
  return player.stamina >= jumpCost(player);
}

/** Cobra o pulo. Chamado por quem decide que o pulo aconteceu. */
export function spendJump(player) {
  player.stamina = Math.max(0, player.stamina - jumpCost(player));
  player.staminaRest = 0;
}

/**
 * Um quadro de fôlego.
 *
 * Roda ANTES da locomoção: é ela que vai perguntar se dá pra correr, e a
 * resposta tem que ser a deste quadro.
 */
export function updateStamina(player, delta) {
  if (player.spectating) {
    player.stamina = STAMINA.MAX;
    return;
  }

  const correndo = player.running && player.onGround
    && player.speed > 0.5;

  if (correndo) {
    const gasto = STAMINA.CORRIDA + carriedWeight(player) * STAMINA.CORRIDA_POR_KG;
    player.stamina = Math.max(0, player.stamina - gasto * delta);
    player.staminaRest = 0;

    // Ficou sem: a corrida cai sozinha, e o jogador vira andando.
    if (player.stamina <= 0) player.running = false;
    return;
  }

  // O respiro existe pra que largar o Shift por um instante no meio da fuga
  // não devolva fôlego: recuperar tem que custar parar de verdade.
  player.staminaRest += delta;
  if (player.staminaRest < STAMINA.ESPERA) return;

  player.stamina = Math.min(STAMINA.MAX, player.stamina + STAMINA.RECUPERA * delta);
}
