import { isDown, consumePress } from '../core/input.js';
import { fits } from './collision.js';
import { STAND, CROUCH, PRONE, CROUCH_KEYS, PRONE_KEYS, JUMP_KEYS } from './constants.js';

/**
 * Postura: de pé, agachado (C) ou deitado (Z).
 *
 * C é segurar (ou alternar, via CROUCH_TOGGLE); Z alterna, porque ninguém
 * segura uma tecla pra continuar deitado. C cancela o deitado, e espaço
 * levanta em vez de pular — de barriga no chão não dá pra saltar.
 */
export function updateStance(player, delta) {
  const { stats } = player;
  const crouchPressed = consumePress(...CROUCH_KEYS);

  // Z alterna deitado. Deitar desarma o agachamento: sem isso, com C em
  // modo alternado o próprio C ainda travado cancelaria o deitado no
  // mesmo frame, e Z não funcionaria a partir de agachado.
  if (consumePress(...PRONE_KEYS)) {
    player.prone = !player.prone;
    if (player.prone) player.crouchLatched = false;
  }

  if (stats.CROUCH_TOGGLE) {
    if (crouchPressed) {
      if (player.prone) {
        player.prone = false;      // deitado, C sobe um degrau só
        player.crouchLatched = true;
      } else {
        player.crouchLatched = !player.crouchLatched;
      }
    }
  } else {
    if (player.prone && crouchPressed) player.prone = false;
    player.crouchLatched = isDown(...CROUCH_KEYS);
  }

  // consumir o espaço aqui impede que o mesmo toque também vire pulo
  if (player.prone && consumePress(...JUMP_KEYS)) player.prone = false;

  let goal = stats.HEIGHT;
  if (player.prone) goal = stats.PRONE_HEIGHT;
  else if (player.crouchLatched) goal = stats.CROUCH_HEIGHT;

  // Teto em cima? Encolhe até caber.
  //
  // Isso vale nos dois sentidos, e o segundo é o que importa: não é só
  // impedir de levantar debaixo de uma laje, é abaixar quem já está de pé e
  // não cabe. De pé sob um teto de 70 cm o corpo cruza a laje inteira, e aí
  // toda direção horizontal colide — inclusive a da saída. O jogador fica
  // preso sem nada a fazer além de descobrir sozinho que deitar resolve.
  if (!fits(player, goal)) {
    const menores = [stats.CROUCH_HEIGHT, stats.PRONE_HEIGHT]
      .filter((altura) => altura < goal);

    // se nem deitado couber, mantém a altura atual: quem tira o jogador
    // dali é a regra de destravamento da locomoção
    goal = menores.find((altura) => fits(player, altura)) ?? player.height;
  }

  player.stance = goal <= stats.PRONE_HEIGHT + 1e-3
    ? PRONE
    : (goal < stats.HEIGHT - 1e-3 ? CROUCH : STAND);

  // Deitar/levantar é mais lento que agachar. O tempo é do trajeto inteiro
  // (de pé <-> deitado), não de cada trecho, senão a transição arrasta.
  const throughProne = Math.min(goal, player.height) < stats.CROUCH_HEIGHT - 1e-3;
  const rate = throughProne
    ? (stats.HEIGHT - stats.PRONE_HEIGHT) / stats.PRONE_TIME
    : (stats.HEIGHT - stats.CROUCH_HEIGHT) / stats.CROUCH_TIME;
  const step = rate * delta;

  const before = player.height;
  if (Math.abs(goal - player.height) <= step) player.height = goal;
  else player.height += Math.sign(goal - player.height) * step;

  // No chão os pés ficam plantados: a cabeça é que desce, então eyeY
  // acompanha a altura. Sem isso o corpo encolhe embaixo do jogador, ele
  // passa a flutuar e vira "no ar" só de agachar — perdendo coyote time,
  // controle no ar e a chance de pular durante a transição.
  if (player.onGround) player.eyeY += player.height - before;

  // No ar, eyeY não muda: encolher o corpo *levanta os pés*. É isso que
  // faz o crouch-jump alcançar plataformas que o pulo normal não alcança.
  // No chão, quem manda é o piso — o ajuste acontece em moveVertical.
}
