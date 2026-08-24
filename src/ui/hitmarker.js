import { MELEE } from '../config.js';

/**
 * Marca de acerto: o X que pisca na mira quando o golpe conecta.
 *
 * É o único retorno imediato que o jogador tem de que acertou — a barra do
 * alvo confirma depois, mas ela está longe do centro da atenção.
 */
export function initHitmarker(...sources) {
  const element = document.getElementById('hitmarker');
  let remaining = 0;
  let killed = false;

  const marcar = (result) => {
    if (!result.target) return;   // tiro que não acertou nada não marca
    remaining = MELEE.HIT_FLASH * (result.killed ? 2.2 : 1);
    killed = result.killed;
    element.classList.toggle('kill', killed);
    element.classList.add('visible');
  };

  for (const source of sources) {
    source.onHit?.(marcar);

  }

  return function updateHitmarker(delta) {
    if (remaining <= 0) return;

    remaining -= delta;
    if (remaining > 0) return;

    element.classList.remove('visible', 'kill');
  };
}
