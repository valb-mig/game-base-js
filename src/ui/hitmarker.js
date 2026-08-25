import { MELEE } from '../config.js';

/**
 * Marca de acerto: o X que pisca na mira quando o golpe conecta.
 *
 * É o único retorno imediato que o jogador tem de que acertou — a barra do
 * alvo confirma depois, mas ela está longe do centro da atenção.
 *
 * `dono` é o jogador visto como alvo, e existe porque a balística é de todo
 * mundo: sem filtrar, cada acerto de bot acendia a marca na mira dele. Medido
 * antes de corrigir: 128 quadros de marca acesa com o jogador a sessenta
 * metros da briga, parado.
 *
 * Acerto sem dono declarado passa: é o corpo a corpo, que hoje só o jogador
 * tem.
 */
export function initHitmarker(dono, ...sources) {
  const element = document.getElementById('hitmarker');
  let remaining = 0;
  let killed = false;

  const marcar = (result) => {
    if (!result.target) return;   // tiro que não acertou nada não marca
    if (result.owner != null && result.owner !== dono) return;
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
