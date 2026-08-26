import { criarRoda } from './roda.js';
import { forcasDosEixos } from './eixos.js';
import { integrarAtitude, forcaDoMotor, tetoDeEsterco } from './atitude.js';
import { pontoDoCasco, contatoDoCasco } from './casco.js';

const G = 9.81;
// Passo fixo da integração. A mola de 34 kN/m sob 1130 kg oscila a 10,4 rad/s,
// e o BATENTE é sete vezes mais rígido: com o delta do quadro (que chega a
// 0,1 s vindo de aba em segundo plano) a suspensão explodiria. Passo fixo
// também é o que faz o jipe andar igual em qualquer framerate.
const PASSO = 1 / 120;

const DOIS_PI = Math.PI * 2;

/** Ângulo trazido pra -π..π. */
function embrulhar(a) {
  const r = (a + Math.PI) % DOIS_PI;
  return (r < 0 ? r + DOIS_PI : r) - Math.PI;
}

/**
 * O corpo do veículo: motor, rodas, suspensão e o que sai delas.
 *
 * Sem three de propósito, como `game/capture.js` e `game/hitboxes.js`: dá pra
 * dirigir o jipe inteiro num teste, sobre um terreno de mentira, sem montar
 * ilha nenhuma. O mundo entra por duas funções — `sondar(x, z)` diz altura e
 * tipo do chão, e `barrado(x, z, y)` diz se o corpo cabe ali.
 *
 * O fluxo é o pedido: entrada → motor → rodas → forças → corpo. Nada aqui
 * escreve posição direto a partir de tecla.
 */
export function criarFisica(ficha, { sondar = null, barrado = null, pneuDe = null } = {}) {
  const rodas = ficha.RODAS.map(criarRoda);

  const corpo = {
    ficha,
    rodas,
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    yaw: 0, pitch: 0, roll: 0,
    yawRate: 0, pitchRate: 0, rollRate: 0,

    // O que o quadro sofreu, pra quem transforma isso em dano. Zerado por
    // quem lê: a física não sabe o que é vida.
    impacto: 0,
    queda: 0,
    // Velocidade no eixo do corpo. Quem desenha painel e quem decide
    // atropelamento leem daqui em vez de recalcular.
    aoLongo: 0,
    deLado: 0,

    get velocidade() {
      return Math.hypot(corpo.vx, corpo.vz);
    },

    /** Onde a torre da suspensão da roda `i` está, no mundo. */
    torreNoMundo(i, saida = {}) {
      const r = rodas[i].config;
      return pontoDoCasco(ficha, corpo, r.x, ficha.TORRE, r.z, saida);
    },

    /**
     * Põe o veículo num lugar, parado e ALINHADO COM O CHÃO.
     *
     * Alinhar não é enfeite. Posto com caimento zero numa ladeira de 40%, a
     * roda da frente nascia meio metro dentro do barranco: o batente respondia
     * com 58 kN — cinco vezes o peso do jipe — e o que se via era ele explodir
     * pra cima girando. O ângulo sai de sondar as quatro rodas, que é a mesma
     * fonte que a suspensão vai usar no quadro seguinte.
     */
    assentar(x, z, yaw = 0) {
      corpo.x = x;
      corpo.z = z;
      corpo.yaw = yaw;
      corpo.pitch = 0;
      corpo.roll = 0;
      corpo.vx = corpo.vy = corpo.vz = 0;
      corpo.yawRate = corpo.pitchRate = corpo.rollRate = 0;

      corpo.y = 0;
      const alturas = rodas.map((_, i) => {
        corpo.torreNoMundo(i, torre);
        return sondar(torre.x, torre.z).altura;
      });
      const [fe, fd, te, td] = alturas;
      corpo.y = (fe + fd + te + td) / 4;

      const entreEixos = ficha.RODAS[0].z - ficha.RODAS[2].z;
      const bitola = ficha.RODAS[0].x - ficha.RODAS[1].x;
      // Nariz mais alto que a traseira é caimento NEGATIVO, e lado esquerdo
      // mais alto é rolagem POSITIVA — as duas convenções do three.
      corpo.pitch = -Math.atan2((fe + fd) / 2 - (te + td) / 2, entreEixos);
      corpo.roll = Math.atan2((fe + te) / 2 - (fd + td) / 2, bitola);
    },

    /**
     * Liga o corpo ao mundo depois de construído.
     *
     * Existe porque as duas funções que o mundo fornece LEEM o corpo — a
     * sondagem precisa da altura atual e a colisão precisa do giro — e não dá
     * pra passar no construtor uma função que fala do objeto que ele está
     * construindo. Quem testa continua podendo passar tudo de uma vez.
     */
    mundo(fnSondar, fnBarrado, fnPneu) {
      sondar = fnSondar;
      barrado = fnBarrado;
      pneuDe = fnPneu;
      return corpo;
    },

    step(delta, comandos) {
      const passos = Math.max(1, Math.ceil(delta / PASSO));
      const dt = delta / passos;
      for (let i = 0; i < passos; i++) integrar(dt, comandos);
    }
  };

  const torre = {};

  function integrar(dt, cmd) {
    const cos = Math.cos(corpo.yaw);
    const sen = Math.sin(corpo.yaw);

    // Velocidade no sistema do corpo: `aoLongo` é pra frente, `deLado` é pra
    // esquerda. Toda a conta de pneu vive neste sistema.
    corpo.aoLongo = corpo.vx * sen + corpo.vz * cos;
    corpo.deLado = corpo.vx * cos - corpo.vz * sen;

    // --- esterçamento: o teto cai com a velocidade, e o volante tem inércia
    const alvo = (cmd.esterco ?? 0) * tetoDeEsterco(ficha, corpo.aoLongo);

    // --- motor: uma força só, e quem a reparte entre as rodas motrizes no
    // chão é `eixos.js` — sem roda no chão não há por onde ela sair.
    const forcaMotor = forcaDoMotor(
      ficha, cmd.acelerar ?? 0, corpo.aoLongo, cmd.torque ?? 1);

    const eixos = forcasDosEixos(ficha, corpo, cmd, {
      sondar, pneuDe, forcaMotor, esterco: alvo, torre, delta: dt
    });
    let { fx, fz, fy, fxMundo, fzMundo, tYaw, tPitch, tRoll } = eixos;

    // A carroceria raspando o chão: é ela que segura o jipe capotado, que sem
    // isto afundava pelo terreno pra sempre.
    const casco = contatoDoCasco(ficha, corpo, sondar, dt);
    fy += casco.fy;
    tPitch += casco.tPitch;
    tRoll += casco.tRoll;
    // Chapa no chão arrasta muito mais que pneu: capotado ele desliza uns
    // metros e para, em vez de escorregar de lado até o fim do mapa.
    if (casco.fy > 0) {
      fx -= corpo.deLado * 900;
      fz -= corpo.aoLongo * 900;
    }
    /**
     * Chapa muito enterrada sai por POSIÇÃO, não por força.
     *
     * Acima do que o teto de força consegue devolver (a 260 kN/m, 4,3 cm já
     * sustentam o jipe inteiro), insistir na mola arremessaria o veículo. É o
     * caso de estado inválido: veículo posto capotado, ou um buraco cavado sob
     * ele. Tirar do chão é a resolução certa, e é o que todo solucionador de
     * contato faz com penetração profunda.
     */
    if (casco.fundura > 0.16) {
      corpo.y += casco.fundura - 0.16;
      if (corpo.vy < 0) corpo.vy = 0;
    }

    // Arrasto do ar. O jipe é um armário, e é o que decide a velocidade final.
    fz -= ficha.ARRASTO * corpo.aoLongo * Math.abs(corpo.aoLongo);
    fx -= ficha.ARRASTO * corpo.deLado * Math.abs(corpo.deLado);

    integrarAtitude(ficha, corpo, { tPitch, tRoll, tYaw, fx, fz }, dt);

    // Ângulos embrulhados em -π..π. Sem isto o tombo ACUMULA voltas: um jipe
    // que rolou duas vezes e assentou aprumado ficava com roll = 6,28 rad, e
    // quem lê postura pelo módulo do ângulo dizia "de cabeça pra baixo".
    corpo.roll = embrulhar(corpo.roll);
    corpo.pitch = embrulhar(corpo.pitch);
    corpo.yaw = embrulhar(corpo.yaw);

    // --- integração vertical, trapezoidal
    const antes = corpo.vy;
    corpo.vy += (fy / ficha.MASSA - G) * dt;
    corpo.y += (antes + corpo.vy) * 0.5 * dt;

    // Pousada: o batente já devolveu a força, mas o dano precisa saber com
    // que velocidade o corpo chegou.
    const noChao = rodas.some((r) => r.noChao);
    if (noChao && antes < -2.5) {
      corpo.queda = Math.max(corpo.queda, -antes);
      corpo.vy = Math.max(corpo.vy, antes * 0.2);
    }

    // --- integração horizontal, com colisão por eixo
    const ax = (fx * cos + fz * sen + fxMundo) / ficha.MASSA;
    const az = (-fx * sen + fz * cos + fzMundo) / ficha.MASSA;
    corpo.vx += ax * dt;
    corpo.vz += az * dt;

    const nx = corpo.x + corpo.vx * dt;
    const nz = corpo.z + corpo.vz * dt;
    if (barrado && barrado(nx, corpo.z, corpo.y)) {
      corpo.impacto = Math.max(corpo.impacto, Math.abs(corpo.vx));
      corpo.vx *= -0.12;
    } else {
      corpo.x = nx;
    }
    if (barrado && barrado(corpo.x, nz, corpo.y)) {
      corpo.impacto = Math.max(corpo.impacto, Math.abs(corpo.vz));
      corpo.vz *= -0.12;
    } else {
      corpo.z = nz;
    }
  }

  return corpo;
}
