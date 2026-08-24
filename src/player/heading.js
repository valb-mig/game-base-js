/**
 * Base horizontal da câmera — de onde sai a direção do movimento.
 *
 * Não dá pra usar camera.rotation.y como yaw: PointerLockControls compõe a
 * rotação em YXZ direto no quaternion, e camera.rotation decodifica em XYZ.
 * Olhando pra trás, rotation.y lê 0° em vez de 180°, e W manda o jogador pra
 * direção antiga. Já o eixo X local de um rig yaw+pitch é sempre horizontal,
 * então serve de referência e nunca degenera, nem mirando reto pra cima.
 *
 * Isto vive num módulo separado pra que o teste exercite o mesmo código que
 * o jogo usa, em vez de repetir a conta.
 */
export function horizontalRight(quaternion, out) {
  out.set(1, 0, 0).applyQuaternion(quaternion);
  out.y = 0;
  return out.normalize();
}

/** Frente = direita girada 90° no plano XZ. */
export function forwardX(right) {
  return right.z;
}

export function forwardZ(right) {
  return -right.x;
}

/**
 * Inclinação vertical do olhar, em radianos: positivo olhando pra cima.
 * Quem nada precisa disso — olhar pra baixo mergulha.
 */
export function lookPitch(quaternion, scratch) {
  scratch.set(0, 0, -1).applyQuaternion(quaternion);
  return Math.asin(Math.max(-1, Math.min(1, scratch.y)));
}

/**
 * Rumo da câmera em graus, 0 = norte, crescendo pro leste.
 *
 * Norte é o -Z do mundo: é onde fica a Base Norte, e é pra onde a câmera
 * aponta com yaw zero.
 */
export function headingDegrees(quaternion, scratch) {
  horizontalRight(quaternion, scratch);
  const degrees = Math.atan2(forwardX(scratch), -forwardZ(scratch)) * 180 / Math.PI;
  return (degrees + 360) % 360;
}
