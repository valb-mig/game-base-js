/**
 * Dano do veículo: componentes, pneus e as DUAS máquinas de estado.
 *
 * Sem three e sem arquivo, pelo mesmo motivo que `game/hitboxes.js`: regra de
 * dano tem que ser testável sem montar mundo nenhum.
 *
 * A decisão de projeto é não ter uma variável `estadoDoVeiculo` só. Elas são
 * três coisas independentes, e misturá-las apaga informação:
 *
 * - INTEGRIDADE (operacional → danificado → inutilizado → destruído): o que
 *   ele ainda consegue fazer.
 * - POSTURA (aprumado → inclinado → capotado → de cabeça): como ele está
 *   deitado no chão.
 * - PNEU, um por roda (inteiro → furado → arrebentado).
 *
 * Um jipe capotado pode estar operacional (e voltar a andar se destombar), e
 * um jipe aprumado pode estar inutilizado. Uma variável só teria que escolher
 * qual das duas contar.
 */

export const OPERACIONAL = 'operacional';
export const DANIFICADO = 'danificado';
export const INUTILIZADO = 'inutilizado';
export const DESTRUIDO = 'destruido';

export const PNEU_INTEIRO = 'inteiro';
export const PNEU_FURADO = 'furado';
export const PNEU_ARREBENTADO = 'arrebentado';

export const APRUMADO = 'aprumado';
export const INCLINADO = 'inclinado';
export const CAPOTADO = 'capotado';
export const DE_CABECA = 'de cabeça';

/** Vida de cada componente. O motor é pequeno e frágil; a carroceria é grande. */
export const VIDA = {
  motor: 60,
  transmissao: 50,
  tanque: 40,
  carroceria: 260,
  pneu: 30
};

/**
 * O que o pneu faz com a aderência e com o arrasto.
 *
 * Furado não é "roda destruída": ele ainda rola, ainda faz curva pior e ainda
 * arrasta muito mais. E como cada roda tem o seu, um dianteiro furado puxa o
 * jipe pro lado sozinho — não há código de "puxar pro lado", isso cai de
 * graça da assimetria entre as quatro rodas.
 */
export const PNEU = {
  [PNEU_INTEIRO]: { atrito: 1, rolamento: 1 },
  [PNEU_FURADO]: { atrito: 0.55, rolamento: 3.2 },
  [PNEU_ARREBENTADO]: { atrito: 0.28, rolamento: 6.5 }
};

/**
 * A que componente cada região de acerto pertence.
 *
 * As regiões são as MESMAS que a hitbox do veículo declara — quem atira
 * acerta uma região, e é aqui que ela vira dano em alguma coisa. Sem esta
 * tabela, `veiculo.js` precisaria repetir os nomes.
 */
export const COMPONENTE_DA_REGIAO = {
  motor: 'motor',
  tanque: 'tanque',
  carroceria: 'carroceria',
  // Para-lama é lataria: ele tem caixa própria porque a FORMA do jipe pede
  // (ele é largo e fica acima do pneu), não porque quebre por conta.
  para_lama: 'carroceria',
  roda_FL: 'pneu',
  roda_FR: 'pneu',
  roda_RL: 'pneu',
  roda_RR: 'pneu'
};

export function criarDano(rodas) {
  const componentes = {
    motor: VIDA.motor,
    transmissao: VIDA.transmissao,
    tanque: VIDA.tanque,
    carroceria: VIDA.carroceria
  };
  const pneus = new Map(rodas.map((r) => [r.id, { vida: VIDA.pneu, estado: PNEU_INTEIRO }]));

  const dano = {
    componentes,
    pneus,
    integridade: OPERACIONAL,
    postura: APRUMADO,

    /**
     * Motor morto não dá torque. E a transmissão importa por si: ela pode
     * quebrar com o motor inteiro, e aí o motor gira sem levar nada pra roda.
     */
    get torque() {
      if (componentes.motor <= 0 || componentes.transmissao <= 0) return 0;
      if (dano.integridade === INUTILIZADO || dano.integridade === DESTRUIDO) return 0;
      // Motor ferido perde força antes de parar: é o aviso de que ele vai
      // parar, e é o que dá ao jogador a chance de sair antes.
      return componentes.motor / VIDA.motor > 0.4 ? 1 : 0.45;
    },

    /** O jipe ainda anda? Quem pergunta é quem decide se vale entrar nele. */
    get andando() {
      return dano.torque > 0 && dano.postura === APRUMADO;
    },

    pneuDe(id) {
      return pneus.get(id);
    },

    /**
     * Aplica dano numa região. `roda` diz qual pneu, quando a região é de roda.
     *
     * Devolve o que MUDOU, não o estado inteiro: quem escuta (fagulha, fumaça,
     * som) só se interessa por transição.
     */
    aplicar(regiao, quanto, roda = null) {
      const componente = COMPONENTE_DA_REGIAO[regiao] ?? 'carroceria';

      if (componente === 'pneu') {
        const pneu = pneus.get(roda ?? regiao.slice(5));
        if (!pneu) return null;
        const antes = pneu.estado;
        pneu.vida = Math.max(0, pneu.vida - quanto);
        pneu.estado = pneu.vida <= 0 ? PNEU_ARREBENTADO
          : (pneu.vida < VIDA.pneu * 0.7 ? PNEU_FURADO : PNEU_INTEIRO);
        return pneu.estado === antes ? null : { pneu: roda, estado: pneu.estado };
      }

      const antes = dano.integridade;
      componentes[componente] = Math.max(0, componentes[componente] - quanto);
      // O tanque furado leva a carroceria junto: combustível vazando e fogo é
      // o que transforma um jipe ferido em sucata.
      if (componente === 'tanque' && componentes.tanque <= 0) {
        componentes.carroceria = Math.max(0, componentes.carroceria - quanto * 2);
      }
      dano.reavaliar();
      return dano.integridade === antes ? null : { integridade: dano.integridade };
    },

    /** A integridade sai dos componentes; ela não é escrita à mão em lugar nenhum. */
    reavaliar() {
      const corpo = componentes.carroceria / VIDA.carroceria;
      if (corpo <= 0) dano.integridade = DESTRUIDO;
      else if (dano.torque === 0) dano.integridade = INUTILIZADO;
      else if (corpo < 0.5 || componentes.motor < VIDA.motor) dano.integridade = DANIFICADO;
      else dano.integridade = OPERACIONAL;
    }
  };
  return dano;
}

/**
 * Dano por CASTIGO: bater, cair e capotar.
 *
 * Fica aqui e não no veículo porque é regra de dano, e regra de dano nesta base
 * não conhece three nem mundo. Os limiares existem pra que encostar num muro a
 * 10 km/h não quebre nada: fragilidade absurda o jogador lê como bug, e um
 * veículo que morre de esbarrão nunca sai da base.
 *
 * `corpo` traz o que o quadro sofreu e é ZERADO aqui — quem lê é quem zera,
 * porque a física não sabe o que é vida.
 */
const DANO_POR_IMPACTO = 9;
const IMPACTO_MINIMO = 3.5;      // m/s: abaixo disto é um toque
const DANO_POR_QUEDA = 7;
const QUEDA_MINIMA = 5;          // m/s de velocidade vertical
// Capotar machuca por si: é o teto batendo, não uma velocidade de impacto.
const DANO_POR_CAPOTAR = 55;

export function danoDeCastigo(dano, corpo) {
  const antes = dano.postura;
  dano.postura = posturaDe(corpo.roll, corpo.pitch);
  if (antes === APRUMADO && dano.postura === CAPOTADO) {
    dano.aplicar('carroceria', DANO_POR_CAPOTAR);
  }

  if (corpo.impacto > IMPACTO_MINIMO) {
    dano.aplicar('carroceria', (corpo.impacto - IMPACTO_MINIMO) * DANO_POR_IMPACTO);
  }
  if (corpo.queda > QUEDA_MINIMA) {
    dano.aplicar('carroceria', (corpo.queda - QUEDA_MINIMA) * DANO_POR_QUEDA);
  }
  corpo.impacto = 0;
  corpo.queda = 0;
}

/**
 * A postura a partir da rolagem e do caimento, em radianos.
 *
 * O limiar de 60° não é o de "capotou": é o de "não volta sozinho". Abaixo
 * dele a suspensão ainda tem uma roda no chão e o jipe se aprumar é
 * plausível; acima, ele está apoiado na lateral.
 */
export function posturaDe(roll, pitch) {
  const inclinacao = Math.max(Math.abs(roll), Math.abs(pitch));
  if (inclinacao > 2.4) return DE_CABECA;   // 137°
  if (inclinacao > 1.05) return CAPOTADO;   // 60°
  if (inclinacao > 0.44) return INCLINADO;  // 25°
  return APRUMADO;
}
