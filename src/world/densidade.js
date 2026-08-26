import { WORLD } from '../config.js';
import { fbm } from './noise.js';

/**
 * Quanta floresta cabe em cada ponto do mapa. Matemática pura, sem three.
 *
 * Sem isto, `espalhar` sorteia uniforme por área e as 1400 árvores saem
 * parelhas sobre os 2,6 km² de grama: um tapete de mesma espessura em todo
 * lugar. Aí a floresta deixa de ser terreno e vira textura — nunca há uma
 * decisão de entrar na mata ou contorná-la, porque mata e campo são a mesma
 * coisa em qualquer direção que se olhe.
 *
 * A densidade não substitui a regra do chão, ela se soma a ela: areia
 * continua deserta e barranco continua pelado (`ground.js` decide isso), e a
 * máscara só redistribui o que já podia nascer na grama. A geografia autoral
 * — praia, escarpa, planalto, rio — sai intacta.
 *
 * As faixas são DISCRETAS pelo mesmo motivo que o tipo do chão é: quem
 * pergunta "isso aqui é campo aberto?" precisa de sim ou não. Um gradiente
 * contínuo faria o mapa inteiro ser "médio" e nenhum lugar ser um lugar.
 */

export const CAMPO = 'campo';
export const ARVOREDO = 'arvoredo';
export const BOSQUE = 'bosque';
export const MATA = 'mata';
export const MATA_FECHADA = 'mata-fechada';

/**
 * Os cortes saem de MEDIR o ruído, não de escolher números redondos.
 *
 * Duas oitavas de ruído de valor têm distribuição de SINO, não uniforme:
 * amostrado de 5 em 5 m sobre a ilha inteira, o p5 é 0,241 e o p95 é 0,779 —
 * quase tudo se aperta no meio. Os cortes "óbvios" de 0,30 e 0,80 deixariam
 * 10,7% do mapa em campo aberto e 3,8% em mata fechada, ou seja a ilha
 * inteira em bosque: o tapete de novo, com outro nome.
 *
 * Estes cortes são os percentis 30, 50, 75 e 92, medidos com a escala e as
 * oitavas de `WORLD`. Mexer numa das duas exige remedir: o formato do sino
 * não muda, mas os cortes deixam de cair onde se quer.
 *
 * Medido depois de fixá-los, sobre a ilha: 30,3% / 19,4% / 25,1% / 17,1% /
 * 8,2%. E a repartição da GRAMA sozinha bate com a da ilha em menos de meio
 * ponto — a máscara não conhece o chão, então nenhuma faixa cai preferindo
 * praia ou barranco.
 *
 * O que a repartição quer dizer em jogo: 30% do mapa é campo aberto de
 * verdade (atravessar é decisão), 20% é campo com árvore solta (cobertura
 * que dá pra usar mas não pra sumir), 25% é bosque, 17% é mata e 8% é mata
 * fechada — perto o bastante do combate a 25 m pra que entrar ali troque a
 * briga de tiro por briga de faca.
 */
const FAIXAS = [
  { nome: CAMPO,        ate: 0.41,     densidade: 0 },
  { nome: ARVOREDO,     ate: 0.50,     densidade: 0.15 },
  { nome: BOSQUE,       ate: 0.62,     densidade: 0.40 },
  { nome: MATA,         ate: 0.74,     densidade: 0.75 },
  { nome: MATA_FECHADA, ate: Infinity, densidade: 1 }
];

/**
 * O campo bruto, em 0..1.
 *
 * O deslocamento de 9000 existe pra que esta máscara NÃO ande junto com o
 * relevo: os dois saem do mesmo `hash`, e amostrados na mesma vizinhança a
 * floresta nasceria sempre no mesmo flanco de toda lombada. Longe na grade do
 * ruído, eles não se conhecem.
 */
function bruto(x, z) {
  const e = WORLD.FLORESTA_ESCALA;
  return (fbm(x * e + 9000, z * e + 9000, WORLD.FLORESTA_OITAVAS) + 1) / 2;
}

/** Qual das cinco faixas é (x, z). */
export function faixaDeFloresta(x, z) {
  const valor = bruto(x, z);
  for (const faixa of FAIXAS) {
    if (valor < faixa.ate) return faixa.nome;
  }
  return MATA_FECHADA;
}

/**
 * Chance de uma árvore vingar em (x, z), de 0 a 1.
 *
 * É probabilidade, não cota: `espalhar` sorteia contra ela. Por isso a borda
 * da mata sai esgarçada sozinha, sem nenhum código de transição — o doc pede
 * fronteira suave entre bioma e bioma, e ela é consequência de sortear em vez
 * de contar.
 */
export function densidadeFloresta(x, z) {
  const valor = bruto(x, z);
  for (const faixa of FAIXAS) {
    if (valor < faixa.ate) return faixa.densidade;
  }
  return 1;
}

/** A densidade de cada faixa, pra quem quer conferir a tabela sem sondar. */
export function densidadeDaFaixa(nome) {
  return FAIXAS.find((faixa) => faixa.nome === nome)?.densidade ?? 0;
}
