import * as THREE from 'three';

/**
 * De onde a bala sai e pra onde ela vai.
 *
 * Duas coisas, e as duas vêm da arma, não da câmera:
 *
 *  - a bala nasce na boca do cano. É o que faz o traçante sair da arma em vez
 *    de brotar no meio da tela;
 *  - a direção é a do cano. Com a arma fora de posição — correndo com ela
 *    baixada, no meio do coice, com a mão atrasada numa virada — o tiro sai
 *    torto de verdade, e não só parece torto.
 *
 * O desvio é medido contra a orientação ZERADA da arma, que é como ela está
 * sendo segurada pra atirar (descanso misturado com a mira de ferro), NÃO
 * contra a frente da câmera. Medir contra a câmera transformaria o caimento
 * de 6° que a pose de descanso tem só por estética num erro fixo pra
 * esquerda em todo tiro do quadril — isso lê como bug, não como recuo.
 *
 * Sem three além da matemática: dá pra conferir a conta fora do navegador.
 */

const FORWARD = new THREE.Vector3(0, 0, -1);

const inverse = new THREE.Quaternion();
const drift = new THREE.Quaternion();
const scaled = new THREE.Quaternion();

/**
 * Preenche `shot` (origin e direction, em espaço de mundo) a partir da boca
 * da arma em espaço de câmera.
 *
 * `muzzle.position` e `muzzle.quaternion` são a boca como ela está agora;
 * `muzzle.zero` é a mesma boca na orientação zerada. `bend` de 0 a 1 é quanto
 * do desvio entre as duas a bala herda.
 */
export function muzzleShot(shot, camera, muzzle, bend = 1) {
  shot.origin.copy(muzzle.position)
    .applyQuaternion(camera.quaternion)
    .add(camera.position);

  // desvio do cano: onde ele está contra onde ele deveria estar
  inverse.copy(muzzle.zero).invert();
  drift.copy(muzzle.quaternion).multiply(inverse);

  // Amortecer é interpolar da identidade até o desvio — escalar o ângulo na
  // mão daria eixo errado assim que o desvio deixasse de ser pequeno, e a
  // pose de corrida joga a arma uns 40° pro lado.
  if (bend < 1) drift.copy(scaled.identity().slerp(drift, bend));

  shot.direction.copy(FORWARD)
    .applyQuaternion(drift)
    .applyQuaternion(camera.quaternion)
    .normalize();

  return shot;
}

/** Par de vetores reaproveitável pra quem chama `muzzleShot` todo tiro. */
export function createShot() {
  return { origin: new THREE.Vector3(), direction: new THREE.Vector3() };
}

/** Boca em espaço de câmera, preenchida pelo viewmodel a cada tiro. */
export function createMuzzle() {
  return {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    zero: new THREE.Quaternion()
  };
}
