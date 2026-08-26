import { isDown, axis } from '../core/input.js';
import {
  FORWARD_KEYS, BACK_KEYS, LEFT_KEYS, RIGHT_KEYS, JUMP_KEYS
} from '../player/constants.js';

/**
 * A entrada do jogador virando comando de veículo.
 *
 * Ela existe separada do veículo porque o veículo não sabe quem o dirige: um
 * bot que aprenda a dirigir vai produzir o MESMO objeto de comandos, e a
 * física não vai notar a diferença. É a mesma separação de `bots/aiming.js` —
 * quem decide é uma coisa, quem executa é outra.
 *
 * As teclas são as de andar, de propósito: W acelera, S freia e dá ré, A e D
 * esterçam, Espaço é o freio de mão. Aprender um segundo teclado pra entrar
 * num jipe é fricção que não compra nada.
 */
export function comandosDoTeclado() {
  const frente = Number(isDown(...FORWARD_KEYS));
  const tras = Number(isDown(...BACK_KEYS));

  return {
    // Ré e freio são a MESMA tecla, e quem decide é a velocidade: andando pra
    // frente, S é freio; parado ou quase, S é ré. Duas teclas separadas
    // obrigariam a soltar uma pra apertar a outra no meio de uma manobra.
    acelerar: frente - tras,
    esterco: axis(LEFT_KEYS, RIGHT_KEYS),
    freio: 0,
    freioMao: isDown(...JUMP_KEYS)
  };
}

/**
 * Os comandos com freio e ré já resolvidos pela velocidade atual.
 *
 * `aoLongo` é a velocidade ao longo do corpo, em m/s. O limiar existe porque
 * sem ele apertar S a 60 km/h dava ré e freio ao mesmo tempo, e o veículo
 * arava o chão sem parar.
 */
export function resolverComandos(cru, aoLongo) {
  const cmd = { ...cru };
  if (cmd.acelerar < 0 && aoLongo > 0.8) {
    cmd.freio = 1;
    cmd.acelerar = 0;
  } else if (cmd.acelerar > 0 && aoLongo < -0.8) {
    // e o contrário: acelerar de ré é frear
    cmd.freio = 1;
    cmd.acelerar = 0;
  }
  return cmd;
}


