import { MELEE } from '../config.js';

/**
 * Marca de acerto: o X que pisca na mira quando o golpe conecta.
 *
 * É o único retorno imediato que o jogador tem de que acertou — a barra do
 * alvo confirma depois, mas ela está longe do centro da atenção.
 */
export function initHitmarker(attack) {
  const element = document.getElementById('hitmarker');
  let remaining = 0;
  let killed = false;

  attack.onHit((result) => {
    remaining = MELEE.HIT_FLASH * (result.killed ? 2.2 : 1);
    killed = result.killed;
    element.classList.toggle('kill', killed);
    element.classList.add('visible');
  });

  return function updateHitmarker(delta) {
    if (remaining <= 0) return;

    remaining -= delta;
    if (remaining > 0) return;

    element.classList.remove('visible', 'kill');
  };
}
