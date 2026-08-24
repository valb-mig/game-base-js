import { STAND, CROUCH, PRONE } from './constants.js';

/**
 * Acabamento de câmera. Puro visual: a física manda em eyeY, e só aqui isso
 * vira camera.position.y, somado ao atraso do degrau, à afundada da
 * aterrissagem e ao balanço do passo.
 */
export function updateView(player, delta) {
  const { stats } = player;
  player.viewOffset *= Math.exp(-stats.VIEW_RECOVER * delta);

  let bob = 0;
  if (player.onGround) {
    const ratio = Math.min(player.speed / stats.RUN_SPEED, 1);
    player.bobPhase += player.speed * stats.BOB_FREQUENCY * delta;
    bob = Math.sin(player.bobPhase) * stats.BOB_AMPLITUDE * ratio;
  }

  player.object.position.y = player.eyeY + player.viewOffset + bob;
}

/** Rótulo legível do que o jogador está fazendo. Só o painel de debug usa. */
export function describeState(player) {
  const still = player.speed < 0.15;

  if (!player.onGround) {
    return player.stance === STAND ? 'no ar' : `no ar ${player.stance}`;
  }
  if (player.stance === PRONE) return still ? 'deitado' : 'rastejando';
  if (player.stance === CROUCH) return still ? 'agachado' : 'andando agachado';
  if (still) return 'parado';
  return player.running ? 'correndo' : 'andando';
}
