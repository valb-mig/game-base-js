const G = 9.81;

/**
 * A atitude do corpo: caimento, rolagem e giro.
 *
 * Ela mora à parte da integração linear porque é onde estão as duas contas
 * que fazem o veículo parecer pesado — a transferência de peso e o pêndulo
 * invertido — e as duas se leem melhor juntas do que espalhadas no meio da
 * soma de forças das rodas.
 *
 * Convenção, e ela vem do three: `pitch` positivo é NARIZ PRA BAIXO (rotação
 * em X leva +Z pra baixo) e `roll` positivo LEVANTA o lado +X, que é a
 * esquerda. Trocar um sinal aqui é o tipo de erro que só aparece como "o jipe
 * capota pro lado errado", então há teste pros dois.
 */
export function integrarAtitude(ficha, corpo, forcas, delta) {
  let { tPitch, tRoll, tYaw } = forcas;

  /**
   * Transferência de peso: a força do pneu age no CHÃO e o centro de massa
   * está a 62 cm dele. Frear joga o nariz pra baixo, acelerar levanta, e a
   * curva empurra o corpo pro lado de fora.
   *
   * É esta alavanca, com a bitola estreita do MB (0,65 m de meia-bitola
   * contra 0,62 m de CG), que capota o jipe numa curva rápida. Sem ela o
   * veículo faria curva em qualquer velocidade sem consequência.
   *
   * Os SINAIS saem de τ = r × F com o contato em r = (lx, -h, lz), e eu errei
   * o da rolagem na primeira vez: empurrar a base pra esquerda joga o topo pra
   * direita, ou seja LEVANTA o lado esquerdo. Com o sinal trocado o peso ia
   * pra roda de DENTRO da curva — medido, 5625 N na dianteira esquerda numa
   * curva à esquerda contra 755 N na direita, o oposto do que qualquer carro
   * faz — e como carga é o que limita atrito, a curva ficava errada inteira.
   */
  tPitch += -forcas.fz * ficha.ALTURA_CM;
  tRoll += forcas.fx * ficha.ALTURA_CM;

  /**
   * Gravidade em torno do apoio, e ela é INSTÁVEL de propósito: um pêndulo
   * invertido. Aprumado, as molas vencem com folga; com as rodas de um lado
   * no ar não há mola nenhuma pra vencer, e o tombo termina sozinho.
   *
   * É daqui que o capotamento sai — não de um "se inclinou mais que X, virou".
   * Por isso um encosto de leve numa pedra não capota nada, e uma curva a
   * 70 km/h numa encosta capota mesmo.
   */
  const pesoBraco = ficha.MASSA * G * ficha.ALTURA_CM;
  tRoll += pesoBraco * Math.sin(corpo.roll);
  tPitch += pesoBraco * Math.sin(corpo.pitch);

  corpo.rollRate += (tRoll / ficha.INERCIA_ROLL) * delta;
  corpo.pitchRate += (tPitch / ficha.INERCIA_PITCH) * delta;
  corpo.yawRate += (tYaw / ficha.INERCIA_YAW) * delta;

  // Amortecimento angular. A mola amortece translação vertical, não rotação:
  // sem isto a carroceria balança para sempre depois de cada lombada.
  const freia = 1 - Math.min(0.9, ficha.AMORTECE_ANGULAR * delta);
  corpo.rollRate *= freia;
  corpo.pitchRate *= freia;

  corpo.roll += corpo.rollRate * delta;
  corpo.pitch += corpo.pitchRate * delta;
  corpo.yaw += corpo.yawRate * delta;
}

/**
 * Força de tração que o motor entrega agora, em newtons.
 *
 * F = min(teto, potência / v) em vez de curva de torque, marcha e
 * diferencial. A hipérbole já dá a coisa que importa — força sobrando
 * embaixo, força faltando em cima — sem transformar o jogo num simulador de
 * transmissão, que é justamente o que este veículo não deve ser.
 */
export function forcaDoMotor(ficha, gas, aoLongo, torque = 1) {
  if (gas === 0 || torque === 0) return 0;

  if (gas < 0) {
    // A ré é curta e fraca no MB de verdade, e tem que ser desconfortável
    // aqui também: dar ré não pode ser um jeito de andar rápido pra trás.
    const cabe = -aoLongo < ficha.VEL_MAX_RE;
    return cabe ? -ficha.FORCA_RE * Math.abs(gas) * torque : 0;
  }

  const v = Math.max(Math.abs(aoLongo), 2);
  return Math.min(ficha.FORCA_MAX, ficha.POTENCIA / v) * gas * torque;
}

/**
 * Teto de esterçamento na velocidade atual, em radianos.
 *
 * Parado ele vira tudo; na velocidade cheia, um terço. Virar tudo a 80 km/h
 * não é só absurdo: é a maneira mais rápida de capotar sem entender por quê.
 */
export function tetoDeEsterco(ficha, aoLongo) {
  const rapidez = Math.min(1, Math.abs(aoLongo) / ficha.ESTERCO_VEL);
  return ficha.ESTERCO_MAX + (ficha.ESTERCO_MIN - ficha.ESTERCO_MAX) * rapidez;
}
