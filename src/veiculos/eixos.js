import { suspensao, forcasDoPneu, girar } from './roda.js';
import { aderenciaDe } from './aderencia.js';
import { PNEU, PNEU_INTEIRO } from './dano.js';

/**
 * As quatro rodas de um passo: quanto cada uma sustenta, quanto cada uma
 * empurra, e os momentos que isso faz no corpo.
 *
 * Ela mora à parte de `fisica.js` porque é um assunto só — o eixo — e porque é
 * onde está a ordem que não pode inverter: primeiro a CARGA que a mola está
 * segurando, e só então quanta força o pneu consegue passar pro chão. Força de
 * pneu que não depende de carga é o que faz carro de arcade colar na pista.
 *
 * Devolve as somas no sistema do CORPO (`fx` pra esquerda, `fz` pra frente),
 * mais a componente horizontal do apoio já no MUNDO — essa não passa pelo
 * corpo porque não depende de pra onde o veículo aponta: é o chão empurrando
 * ladeira abaixo.
 */
export function forcasDosEixos(ficha, corpo, cmd, {
  sondar, pneuDe, forcaMotor, esterco, torre, delta
}) {
  const rodas = corpo.rodas;
  const motrizes = rodas.filter((r) => r.config.motriz && r.noChao).length || 1;

  const soma = {
    fx: 0, fz: 0, fy: 0, fxMundo: 0, fzMundo: 0, tYaw: 0, tPitch: 0, tRoll: 0
  };

  for (let i = 0; i < rodas.length; i++) {
    const roda = rodas[i];
    const c = roda.config;

    // O volante move num ritmo; roda traseira não esterça.
    if (c.dianteira) {
      const passo = ficha.ESTERCO_TAXA * delta;
      roda.esterco += Math.max(-passo, Math.min(passo, esterco - roda.esterco));
    }

    /**
     * A torre vem da rotação COMPLETA do corpo, e é ela que acopla a atitude
     * às quatro molas: numa ladeira a torre da frente sobe, a mola estende, e
     * o nariz levanta sozinho. Deitado, ela vai pro lado e a mola simplesmente
     * não alcança mais o chão — é assim que a suspensão sai de cena quando o
     * jipe capota, sem nenhum caso especial.
     *
     * A força continua VERTICAL com o corpo torto. A componente ao longo da
     * haste seria mais honesta e custaria uma normalização por roda por passo;
     * o que ela mudaria é o quanto uma ladeira de 30° comprime a mola (13%), e
     * isso não se percebe dirigindo.
     */
    corpo.torreNoMundo(i, torre);
    const chao = sondar(torre.x, torre.z);
    roda.tipo = chao.tipo;

    const carga = suspensao(ficha, roda, torre.y, chao.altura, delta);
    roda.carga = carga;
    soma.fy += carga;

    /**
     * O apoio é perpendicular ao CHÃO, não vertical, e é isto que faz subir
     * custar caro.
     *
     * Sem esta parte, a força da mola era só vertical e a ladeira não
     * oferecia resistência nenhuma ao avanço: medido, o jipe subia uma rampa
     * de 80% a 55 km/h, o que é força de sobra que não vinha do motor. Com
     * ela, o horizontal é `carga · gradiente` — que na estática dá
     * exatamente `peso · tan(θ)`, a conta certa — e 20% já cobra metade da
     * potência.
     */
    soma.fxMundo -= carga * (chao.dhx ?? 0);
    soma.fzMundo -= carga * (chao.dhz ?? 0);
    // Mola na frente empurrando pra cima levanta o nariz, e `pitch` positivo
    // é nariz PRA BAIXO (é a convenção de rotação em X do three).
    soma.tPitch -= carga * c.z;
    soma.tRoll += carga * c.x;

    const pneu = PNEU[pneuDe?.(c.id)?.estado ?? PNEU_INTEIRO];
    const chaoAdere = aderenciaDe(chao.tipo);
    const rigidez = ficha.RIGIDEZ_LATERAL
      * (!c.dianteira && cmd.freioMao ? ficha.RIGIDEZ_MAO : 1);

    const forcas = forcasDoPneu(ficha, roda, {
      vx: corpo.deLado + corpo.yawRate * c.z,
      vz: corpo.aoLongo - corpo.yawRate * c.x,
      tracao: c.motriz ? forcaMotor / motrizes : 0,
      freio: ficha.FREIO * (cmd.freio ?? 0)
        + (!c.dianteira && cmd.freioMao ? ficha.FREIO_MAO : 0),
      atrito: chaoAdere.atrito * pneu.atrito,
      rolamento: chaoAdere.rolamento * pneu.rolamento,
      rigidez
    });
    soma.fx += forcas.fx;
    soma.fz += forcas.fz;
    // Momento em torno do eixo vertical: é a curva inteira, e é o que faz
    // pneu dianteiro furado puxar o jipe pro lado sem nenhum código de
    // "puxar pro lado".
    soma.tYaw += c.z * forcas.fx - c.x * forcas.fz;

    girar(ficha, roda, corpo.aoLongo - corpo.yawRate * c.x, delta);
  }

  return soma;
}
