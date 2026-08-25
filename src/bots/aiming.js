/**
 * Mira de bot que dá pra enfrentar.
 *
 * O jeito fácil de fazer um bot letal é apontar o vetor exato pro alvo e
 * atirar. Isso não é dificuldade, é impossibilidade: o jogador morre sem ter
 * tido a chance de reagir, e a partida vira sorteio de quem apareceu primeiro
 * na tela do outro.
 *
 * Então tudo aqui é atraso e erro, de propósito:
 *
 *  - ele leva um tempo pra REAGIR depois de avistar;
 *  - a cabeça dele VIRA numa velocidade finita, então quem aparece pelo lado
 *    tem tempo de agir antes de estar na mira;
 *  - a mira nasce ABERTA e fecha enquanto ele te acompanha, sem nunca chegar
 *    a zero;
 *  - alvo em movimento e alvo longe abrem a mira de novo;
 *  - e ele não atira enquanto o cano ainda está torto.
 *
 * Sem three: são ângulos e segundos, e dá pra provar cada um num teste.
 */

export const AIM = {
  REACAO: 0.34,          // s entre avistar e o primeiro tiro
  GIRO: 3.2,             // rad/s: velocidade máxima de virar a cabeça
  GIRO_ALERTA: 5.0,      // já em combate ele acompanha mais rápido

  ERRO_INICIAL: 8.5,     // graus de abertura no instante em que avista
  ERRO_MINIMO: 1.1,      // e o que sobra pra sempre, mesmo parado e perto
  ASSENTA: 1.6,          // s pra mira fechar do inicial até o mínimo

  POR_VELOCIDADE: 0.85,  // graus a mais por m/s de alvo se mexendo
  POR_METRO: 0.03,       // graus a mais por metro de distância

  ANGULO_DE_TIRO: 0.11,  // rad: cano mais torto que isso, ele segura o tiro

  // Rajada: ele não segura o gatilho pra sempre. Isso dá janelas de avanço
  // pro jogador, que é o que torna um tiroteio jogável em vez de um chuveiro.
  RAJADA_MIN: 3,
  RAJADA_MAX: 6,
  RESPIRO_MIN: 0.42,
  RESPIRO_MAX: 0.95,

  // Depois de perder o alvo de vista, ele ainda mira onde viu por um tempo.
  MEMORIA: 2.5
};

/**
 * Abertura da mira, em graus.
 *
 * `acompanhando` é há quanto tempo ele está com o alvo na linha de visão.
 * Zero é o instante em que avistou: mira escancarada. O piso nunca é zero —
 * bot que acerta sempre não é difícil, é injusto.
 */
export function aimError(acompanhando, distancia, velocidadeDoAlvo) {
  const t = Math.min(1, Math.max(0, acompanhando / AIM.ASSENTA));

  // Fecha rápido no começo e devagar no fim: é como uma pessoa corrige,
  // e evita que o primeiro segundo pareça um bot cego.
  const fechamento = 1 - t * t;
  const base = AIM.ERRO_MINIMO + (AIM.ERRO_INICIAL - AIM.ERRO_MINIMO) * fechamento;

  return base
    + velocidadeDoAlvo * AIM.POR_VELOCIDADE
    + distancia * AIM.POR_METRO;
}

/**
 * Vira um ângulo na direção de outro, no máximo `passo` radianos.
 *
 * Pelo caminho curto: sem isso, virar de 179° pra -179° daria a volta inteira
 * e o bot ficaria olhando pro lado errado por meio segundo.
 */
export function turnToward(atual, desejado, passo) {
  let diferenca = desejado - atual;
  while (diferenca > Math.PI) diferenca -= Math.PI * 2;
  while (diferenca < -Math.PI) diferenca += Math.PI * 2;

  if (Math.abs(diferenca) <= passo) return desejado;
  return atual + Math.sign(diferenca) * passo;
}

/** Diferença angular entre dois ângulos, sempre em [0, π]. */
export function angleGap(a, b) {
  let diferenca = Math.abs(a - b) % (Math.PI * 2);
  if (diferenca > Math.PI) diferenca = Math.PI * 2 - diferenca;
  return diferenca;
}

/**
 * Estado de mira de um bot. Guarda quanto tempo ele está acompanhando e
 * quanto falta pra reagir — o resto do cérebro só pergunta "posso atirar?".
 */
export function createAim(rng = Math.random) {
  let acompanhando = 0;
  let reacao = AIM.REACAO;
  let naRajada = 0;
  let respiro = 0;
  let restamNaRajada = 0;

  function novaRajada() {
    restamNaRajada = Math.round(
      AIM.RAJADA_MIN + rng() * (AIM.RAJADA_MAX - AIM.RAJADA_MIN));
  }
  novaRajada();

  return {
    get tracking() { return acompanhando; },
    get reacting() { return reacao; },
    get resting() { return respiro; },

    /** Perdeu o alvo de vista: a mira reabre inteira. */
    reset() {
      acompanhando = 0;
      reacao = AIM.REACAO;
      naRajada = 0;
      novaRajada();
    },

    /** Um quadro com o alvo à vista. */
    track(delta) {
      acompanhando += delta;
      reacao = Math.max(0, reacao - delta);
      respiro = Math.max(0, respiro - delta);
    },

    /** Um quadro sem alvo à vista: o respiro continua correndo. */
    idle(delta) {
      respiro = Math.max(0, respiro - delta);
    },

    /** Abertura atual, em radianos. */
    spread(distancia, velocidadeDoAlvo) {
      return aimError(acompanhando, distancia, velocidadeDoAlvo) * Math.PI / 180;
    },

    /**
     * Pode puxar o gatilho? Só se já reagiu, não está no respiro entre
     * rajadas, e o cano está apontado o bastante pro alvo.
     */
    canFire(desvioDoCano) {
      return reacao <= 0 && respiro <= 0 && desvioDoCano <= AIM.ANGULO_DE_TIRO;
    },

    /** Contabiliza um tiro; ao fim da rajada, entra o respiro. */
    shot() {
      naRajada++;
      if (naRajada < restamNaRajada) return;
      naRajada = 0;
      novaRajada();
      respiro = AIM.RESPIRO_MIN + rng() * (AIM.RESPIRO_MAX - AIM.RESPIRO_MIN);
    }
  };
}
