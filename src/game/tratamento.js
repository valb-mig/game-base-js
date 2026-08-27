import { postOwner, postContested } from './teams.js';

/**
 * Cura como LUGAR: a enfermaria do posto, e o que ela faz com quem entra.
 *
 * Sem isto, levar tiro é permanente até morrer, e o único jeito de voltar a ter
 * vida cheia era renascer — que é grátis. Com enfermaria, a vida é recurso:
 * oito segundos fora da linha de tiro é a briga andando sem você.
 *
 * Sem three e sem arquivo, como `capture.js` e `suprimento.js`: dá pra tratar
 * um ferido num teste com postos de mentira, sem montar ilha nenhuma.
 *
 * A diferença em relação ao suprimento está no RAIO, e é deliberada:
 * reabastecer são 24 m do centro do posto porque é um toque de três segundos;
 * tratar são 3,4 m da TENDA porque são oito. Raio generoso curaria o pelotão
 * inteiro enquanto ele defende o ponto de dentro da cobertura, e aí levar tiro
 * deixaria de custar. Um é passagem, o outro é abrigo.
 */

export const TRATAMENTO = {
  /**
   * Distância da tenda em que se é tratado, em metros.
   *
   * 3,4 é a meia-diagonal da tenda (5,6 × 4,4) menos a lona: a zona não passa
   * do pano, e é isso que faz o objeto não mentir. Um metro a mais e trataria
   * quem está encostado do lado de fora, atirando.
   */
  RAIO: 3.4,

  /**
   * Fração da vida cheia devolvida por segundo, dentro da tenda.
   *
   * 0,125 dá oito segundos do quase-morto ao cheio. Medido nesta base, a 16 m
   * e sem revidar o jogador morre em 2,9 s: curar tem que custar mais do que
   * morrer, senão a tenda vira o lugar de onde se briga. E é de propósito mais
   * lento que reabastecer (3,3 s): bala é consumível, vida é você.
   */
  POR_SEGUNDO: 0.125,

  /**
   * Segundos sem levar tiro antes de a maca voltar a valer.
   *
   * A lona não para bala — a tenda esconde, não blinda. Sem esta espera, quem
   * está sendo alvejado dentro dela se curaria no ritmo em que leva dano, e o
   * pano viraria escudo. 2 s é mais que o `SOB_FOGO` do bot (1,4): o tempo em
   * que ele se considera sob fogo é tempo em que ninguém é tratado.
   */
  ESPERA_APOS_DANO: 2,

  /**
   * Abaixo desta fração de vida o bot vai procurar enfermaria.
   *
   * 0,65 é pouco mais que uma rajada curta: mais alto e ele passaria a partida
   * indo e voltando da tenda em vez de brigar.
   */
  FERIDO_ABAIXO: 0.65,

  /**
   * E só sai acima desta.
   *
   * É o gêmeo de `abastecido` em `suprimento.js`: `ferido` deixa de ser
   * verdadeiro no primeiro ponto de vida que entra, e sem trava o bot largaria
   * a maca com 66% pra voltar ferido dez metros à frente — a viagem por nada.
   */
  SAIR_ACIMA: 0.95
};

/**
 * Esta enfermaria trata este time?
 *
 * Base é sempre de quem é — não há captura de base. Posto tem que ser
 * DOMINADO e estar em paz, a mesma regra de `spawnableFor`: tratar dentro de
 * um ponto que está sendo tomado seria curar o defensor no lugar exato onde
 * ele está perdendo, e negar o ponto deixaria de negar coisa alguma.
 *
 * As duas perguntas moram aqui, e não numa função injetada como o `dono` do
 * suprimento: são DUAS, e passar duas funções por todo lado é o tipo de coisa
 * que se separa no primeiro ajuste.
 */
export function atende(zona, team) {
  if (!zona || !team) return false;
  if (!zona.post) return zona.team === team;
  return postOwner(zona.post) === team && !postContested(zona.post);
}

/**
 * A enfermaria em que este time está sendo tratado AGORA, ou null.
 *
 * Consulta, não estado — como `capture.targetAt`: jogador e bot leem a mesma
 * resposta no mesmo quadro sem um sobrescrever o outro.
 */
export function enfermariaEm(zonas, team, x, z) {
  let melhor = null;
  let menor = TRATAMENTO.RAIO;

  for (const zona of zonas ?? []) {
    if (!atende(zona, team)) continue;
    const distancia = Math.hypot(zona.x - x, zona.z - z);
    if (distancia > menor) continue;
    menor = distancia;
    melhor = zona;
  }
  return melhor;
}

/** A enfermaria do time mais perto no MAPA, sem raio: é pra onde se vai. */
export function enfermariaMaisPerto(zonas, team, x, z) {
  let melhor = null;
  let menor = Infinity;

  for (const zona of zonas ?? []) {
    if (!atende(zona, team)) continue;
    const distancia = Math.hypot(zona.x - x, zona.z - z);
    if (distancia >= menor) continue;
    menor = distancia;
    melhor = zona;
  }
  return melhor;
}

/**
 * Devolve vida a `alvo`. Devolve quanto entrou, que é zero quando não tratou.
 *
 * `desdeODano` são os segundos desde a última vez que ele levou dano: o bot já
 * mantém isso em `hurtFor`, e pro jogador quem conta é `criarTratamento`.
 *
 * Sem acumular fração, ao contrário de `reabastecer`: bala é inteira e meia
 * bala arredondada viraria sessenta por segundo, mas vida é número real e
 * somar 0,2 de ponto por quadro é exatamente o que se quer.
 */
export function tratar(alvo, fracao, desdeODano = Infinity) {
  if (!alvo?.alive || alvo.spectating) return 0;
  if (desdeODano < TRATAMENTO.ESPERA_APOS_DANO) return 0;

  const cheio = alvo.maxHealth ?? 0;
  if (!(cheio > 0) || alvo.health >= cheio) return 0;

  const antes = alvo.health;
  alvo.health = Math.min(cheio, alvo.health + cheio * fracao);
  return alvo.health - antes;
}

/** Machucado o bastante pra ir buscar tenda. */
export function ferido(alvo) {
  const cheio = alvo?.maxHealth ?? 0;
  return cheio > 0 && alvo.health < cheio * TRATAMENTO.FERIDO_ABAIXO;
}

/** E bom o bastante pra voltar pra briga. Nunca use `ferido` pra decidir isto. */
export function tratado(alvo) {
  const cheio = alvo?.maxHealth ?? 0;
  return !(cheio > 0) || alvo.health >= cheio * TRATAMENTO.SAIR_ACIMA;
}

/**
 * O tratamento de UM paciente ao longo do tempo.
 *
 * Existe por causa do `desdeODano`: o bot guarda `hurtFor` no corpo, o jogador
 * não guarda nada disso. Em vez de pendurar um campo novo nele, este objeto
 * olha a vida cair e conta os segundos — a mesma informação, vista de fora.
 */
export function criarTratamento(zonas) {
  let desdeODano = Infinity;
  let vidaAnterior = null;

  return {
    zonas,
    TRATAMENTO,
    get desdeODano() { return desdeODano; },

    /** Um quadro de enfermaria. Devolve quanta vida entrou. */
    atender(delta, { x, z, teamId, alvo }) {
      if (vidaAnterior !== null && alvo.health < vidaAnterior) desdeODano = 0;
      else desdeODano += delta;
      vidaAnterior = alvo.health;

      const zona = enfermariaEm(zonas, teamId, x, z);
      if (!zona) return 0;

      const entrou = tratar(alvo, TRATAMENTO.POR_SEGUNDO * delta, desdeODano);
      // Vida que subiu por tratamento não pode ser lida como dano no quadro
      // seguinte: o valor novo é o que vale a partir de agora.
      vidaAnterior = alvo.health;
      return entrou;
    }
  };
}
