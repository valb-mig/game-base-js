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
