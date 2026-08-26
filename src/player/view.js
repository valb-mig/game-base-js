import * as THREE from 'three';
import { VIEW } from '../config.js';
import { STAND, CROUCH, PRONE } from './constants.js';
import { horizontalRight } from './heading.js';

/**
 * Acabamento de câmera. Puro visual — com uma exceição declarada, o coice —,
 * e a física continua mandando em eyeY.
 *
 * Aqui é onde o jogo conta pelo corpo o que ele já conta pelo HUD: que o
 * passo bate, que a queda doeu, que a arma pulou, que o tiro veio. No meio de
 * um tiroteio ninguém lê o canto da tela; a câmera é o painel que não precisa
 * ser procurado.
 *
 * A ORIENTAÇÃO é escrita aqui, e só aqui. A decodificação é em YXZ, a mesma
 * ordem em que o PointerLockControls compõe: assim yaw, inclinação e rolagem
 * saem exatos e voltam exatos, e a rolagem que este módulo adiciona sobrevive
 * ao próximo movimento de mouse em vez de brigar com ele.
 */

const grausPra = Math.PI / 180;
// Um triz abaixo de 90°: exatamente na vertical a decodificação YXZ degenera
// e o yaw troca de valor junto com a rolagem — a vista daria um giro seco ao
// mirar reto pra cima. Seis centésimos de grau a menos não se vê.
const PITCH_LIMITE = Math.PI / 2 - 0.001;

const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const direita = new THREE.Vector3();

export function updateView(player, delta) {
  const { stats } = player;
  player.viewOffset *= Math.exp(-stats.VIEW_RECOVER * delta);

  let bob = 0;
  let rollDoPasso = 0;
  if (player.onGround) {
    const ratio = Math.min(player.speed / stats.RUN_SPEED, 1);
    player.bobPhase += player.speed * stats.BOB_FREQUENCY * delta;
    bob = Math.sin(player.bobPhase) * stats.BOB_AMPLITUDE * ratio;
    // Metade da frequência do sobe-e-desce: a cabeça faz um oito, que é como
    // ela anda. Em fase com o balanço vira um pêndulo, e pêndulo enjoa.
    rollDoPasso = Math.sin(player.bobPhase * 0.5) * VIEW.STEP_ROLL * grausPra * ratio;
  }

  player.object.position.y = player.eyeY + player.viewOffset + bob;

  updateOrientation(player, delta, rollDoPasso);
}

/**
 * Inclinação de quem anda de lado.
 *
 * Sai da velocidade PROJETADA na direita da câmera, não da tecla apertada:
 * quem corre pra frente e gira o mouse também desliza de lado, e a vista tem
 * que acompanhar isso do mesmo jeito.
 */
function leanAlvo(player) {
  if (!player.onGround || player.swimming) return 0;
  horizontalRight(player.object.quaternion, direita);
  const lateral = player.velocity.x * direita.x + player.velocity.z * direita.z;
  const ratio = THREE.MathUtils.clamp(lateral / player.stats.RUN_SPEED, -1, 1);
  return -ratio * VIEW.LEAN_MAX * grausPra;
}

function updateOrientation(player, delta, rollDoPasso) {
  // --- coice: sobe agora, volta depois ---
  //
  // A subida é em ritmo (graus por segundo), não de uma vez: o salto seco
  // some entre dois quadros numa rajada rápida e o jogador só vê a mira longe
  // de onde deixou. A volta é exponencial e nunca termina de verdade — quem
  // reencosta a mira no alvo é o jogador, e é isso que faz rajada longa
  // custar alguma coisa.
  const passo = VIEW.RECOIL_RISE * grausPra * delta;
  const sobe = Math.min(player.recoil.pendente, passo);
  player.recoil.pendente -= sobe;
  player.recoil.aplicado += sobe;

  const volta = player.recoil.aplicado * (1 - Math.exp(-VIEW.RECOIL_RECOVER * delta));
  player.recoil.aplicado -= volta;
  const pitchDelta = sobe - volta;

  // --- inclinação lateral, que entra e sai suave ---
  const alvo = leanAlvo(player);
  player.lean += (alvo - player.lean) * Math.min(1, VIEW.LEAN_SPEED * delta);

  // --- impulsos: a queda joga a vista pro lado, o tiro levado treme ---
  player.rollImpulse *= Math.exp(-player.stats.VIEW_RECOVER * delta);

  player.shake *= Math.exp(-VIEW.SHAKE_DECAY * delta);
  if (player.shake < 0.001) player.shake = 0;
  player.shakePhase += delta * VIEW.SHAKE_FREQ;
  const tremor = Math.sin(player.shakePhase) * VIEW.SHAKE_ROLL * grausPra * player.shake;

  const roll = player.lean + rollDoPasso + player.rollImpulse + tremor;

  // Escreve a orientação inteira de uma vez, em vez de guardar "quanto eu já
  // tinha somado" — que é o estado que sai de sincronia no primeiro caminho
  // que esquecer de zerar. Custa um euler por quadro.
  euler.setFromQuaternion(player.object.quaternion);
  euler.x = THREE.MathUtils.clamp(euler.x + pitchDelta, -PITCH_LIMITE, PITCH_LIMITE);
  euler.z = roll;
  player.object.quaternion.setFromEuler(euler);

  // Correr abre o campo de visão: velocidade tem que se ver. Quem mira fecha
  // de volta, senão a mira de ferro herda a abertura da corrida no quadro em
  // que a arma sobe.
  const correndo = player.running && player.onGround
    && player.speed > player.stats.WALK_SPEED * 0.6 ? 1 : 0;
  player.viewSprint += (correndo - player.viewSprint)
    * Math.min(1, VIEW.SPRINT_FOV_SPEED * delta);
}

/** Rótulo legível do que o jogador está fazendo. Só o painel de debug usa. */
export function describeState(player) {
  const still = player.speed < 0.15;

  if (player.swimming) {
    if (player.headUnderwater) return 'mergulhando';
    return still ? 'boiando' : 'nadando';
  }
  if (player.submerged > 0.25) return still ? 'na água' : 'atravessando a água';

  if (!player.onGround) {
    return player.stance === STAND ? 'no ar' : `no ar ${player.stance}`;
  }
  if (player.stance === PRONE) return still ? 'deitado' : 'rastejando';
  if (player.stance === CROUCH) return still ? 'agachado' : 'andando agachado';
  if (still) return 'parado';
  return player.running ? 'correndo' : 'andando';
}
