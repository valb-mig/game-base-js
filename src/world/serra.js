import { WORLD } from '../config.js';
import { fbm, smoothstep } from './noise.js';

/**
 * O relevo de MENTIRA que fecha o horizonte. Matemática pura, sem three.
 *
 * O mapa jogável é um quadrado de 2 km e o jogador está preso dentro dele
 * (`locomotion.js` prende em `SIZE/2 - 1`). Fora dele a malha simplesmente
 * acabava, e o que se via era a borda do mundo: medido numa foto do alto do
 * Bunker da Colina olhando pro sul, o capim terminava numa reta e o pixel
 * saltava 233 níveis somados de uma vez, de (123,134,101) pra (193,197,201).
 *
 * Este anel existe pra fechar aquilo, e ele NÃO é mapa:
 *
 * - não entra em `colisores.js`, não é `standable`, não recebe pazada;
 * - `heightfield.js` não sabe que ele existe — a seta aponta num sentido só.
 *   Ele LÊ `naturalHeight`; ninguém lê ele. Duas fontes de verdade sobre
 *   altura se separariam no primeiro ajuste, e a que manda é a do terreno.
 *
 * A base do anel é a PRÓPRIA `naturalHeight` da ilha, continuada pra fora do
 * quadrado. Ela é definida em todo (x, z) — nada nela para na borda — e por
 * isso a costura fecha por construção, sem constante de emenda: medido em 2000
 * pontos do perímetro, `heightAt` e `naturalHeight` batem em 0,00 m (nenhuma
 * zona plana chega perto da borda; a mais próxima é a Base Karnia, a 255 m).
 * A serra é o que se SOMA a isso, e ela sobe de zero.
 */

/** Meia-largura do quadrado jogável: onde a malha do terreno acaba. */
export const BORDA = WORLD.SIZE / 2;

/**
 * Largura do anel, e ela sai da NÉVOA — não de gosto.
 *
 * A névoa é linear de `FOG_NEAR` a `FOG_FAR`: em `FOG_FAR` o quadro é EXATAMENTE
 * a cor do horizonte, que é a mesma cor do céu naquela linha. Ou seja um anel
 * mais largo que 1050 m tem a borda de fora invisível de qualquer ponto do
 * mapa, e um mais estreito devolve a reta que ele existe pra apagar — só mais
 * longe. Os 60 m de folga são pra que a última fileira já esteja saturada, e
 * não exatamente no limite.
 *
 * É a mesma conta que decide `CAMERA.FAR`: névoa e plano distante têm que
 * concordar, senão um dos dois corta o que o outro não terminou.
 */
export const LARGURA = WORLD.FOG_FAR + 60;

/**
 * Metros por vértice. É 10× o passo do terreno (2,5 m) de propósito.
 *
 * O anel só é visto entre 130 e 1050 m — dentro de 130 não há anel e além de
 * 1050 a névoa saturou. A crista mais PERTO que o jogador consegue enxergar
 * está a ~350 m da borda, e ali uma célula de 25 m subtende 25/350 = 4,1°, ou
 * 75 px numa tela de 1280 px com os 70° de FOV do jogo. Custa 44.820
 * triângulos, 2,6% dos 1,71 M da cena. Metade do passo quadruplicaria isso
 * pra ganhar detalhe que a névoa come.
 *
 * E o passo NÃO é múltiplo nem submúltiplo de 2,5 por acidente: é 10×, o que
 * alinha. Aqui isso não custa nada — o anel não tem textura repetida, que é
 * onde alinhar com a malha desenha grade no chão (ver `grao.js`).
 */
export const PASSO = 25;

/**
 * Quantos passos de anel cabem na largura, e a meia-largura que sai disso.
 *
 * `FORA` sai de uma contagem INTEIRA de passos, e não o contrário. É o que faz
 * a grade do anel ser uniforme de ponta a ponta e cair exatamente em ±BORDA e
 * em ±(BORDA + PASSO): sem isso o trecho de fora dividia 1110 m em 44 passos de
 * 25,227 enquanto o do meio usava 25,0, e a banda de transição de `costura.js`
 * não tinha como encostar na fileira interna do anel sem sobrar fenda.
 */
export const ABAS = Math.ceil(LARGURA / PASSO);
export const FORA = BORDA + ABAS * PASSO;



/**
 * A serra só começa depois desta faixa, contada da borda pra fora.
 *
 * Ela existe por dois motivos. Um: quem está encostado na borda tem o anel a
 * um metro do pé, e crista nascendo ali seria uma montanha brotando do chão
 * plano do planalto. Dois: uma faixa QUASE PLANA facetada em células de 25 m
 * não mostra faceta nenhuma — plano é plano em qualquer resolução —, e é isso
 * que deixa o passo grosso passar justamente onde ele estaria mais perto do
 * olho.
 */
export const PLATAFORMA = 160;

/** Sobre quantos metros a serra sai de zero até a altura cheia. */
export const RAMPA = 440;

/**
 * Quanto a crista sobe acima do chão em que ela nasce.
 *
 * Medido do olho do jogador em pé no planalto (24 m de chão, olho a 25,7): uma
 * crista de +92 m tem o topo a 116 m, ou seja 90 m ACIMA do olho, e a 700 m de
 * distância isso são 7,3° — 133 px de silhueta acima da linha do horizonte
 * numa tela de 720 px de altura. Menos que uns 40 m e a crista não passa do
 * olho: ela some atrás da própria linha do horizonte e o anel volta a ser um
 * tapete. Não é serra de alpe de propósito — o Cotentin é planalto agrícola,
 * e o que se quer é fechar o quadro, não inventar montanha.
 */
export const ALTURA = 92;

/** Escala do ruído que decide onde há serra e onde há passagem. */
export const ESCALA_MASSA = 0.00055;
/** Escala do ruído que recorta o topo da crista. */
export const ESCALA_CRISTA = 0.0018;
/** Quanto do total a crista recortada responde. */
export const RECORTE = 0.26;

/**
 * Ruído de valor tem distribuição de SINO, e os 22% do grão já viraram 11%
 * nesta base por causa disso. Medido sobre 19 mil pontos DO ANEL com
 * `ESCALA_MASSA` e duas oitavas: p5 = -0,411 e p95 = 0,514, ou seja os 2,0 de
 * faixa nominal entregavam 0,925 — 46% da amplitude declarada. Esticar p5..p95
 * pra 0..1 devolve a serra inteira, e há teste que recalcula os dois
 * percentis: mexer na escala, nas oitavas ou na largura do anel exige remedir.
 */
export const P5 = -0.411;
export const P95 = 0.514;

const trava = (v) => Math.max(0, Math.min(1, v));

/** Distância pra FORA do quadrado jogável. Negativa dentro dele. */
export function distanciaDaBorda(x, z) {
  return Math.max(Math.abs(x), Math.abs(z)) - BORDA;
}

/** Está no anel? Fora do quadrado jogável e dentro da borda de fora. */
export function noAnel(x, z) {
  const fora = distanciaDaBorda(x, z);
  return fora > 0 && Math.max(Math.abs(x), Math.abs(z)) <= FORA;
}

/** Perfil da crista em (x, z), em metros acima da base. Nunca negativo. */
export function perfilDaSerra(x, z) {
  const massa = trava(
    (fbm(x * ESCALA_MASSA, z * ESCALA_MASSA, 2) - P5) / (P95 - P5));
  const crista = fbm(x * ESCALA_CRISTA, z * ESCALA_CRISTA, 3);
  // Nada de elevar ao quadrado pra "concentrar as cristas": concentrar sobre
  // uma distribuição que já é de sino concentra duas vezes, e foi o que deixou
  // o grão em 0,98 no pixel típico.
  return Math.max(0, ALTURA * (massa + RECORTE * crista));
}

/**
 * Quanto da serra vale em (x, z), de 0 a 1. É a rampa da distância vezes a
 * máscara de terra.
 *
 * Serra não nasce do mar. O norte do mapa é o Canal — medido, os 400 pontos da
 * borda norte dão -9,7 m, chapados, e 28% do perímetro inteiro está debaixo da
 * lâmina. Montanha subindo da água ali seria uma costa que a Normandia de 1944
 * não tem de frente pro desembarque; o que fecha aquele lado é a própria
 * névoa, e mar aberto que se dissolve na bruma é a resposta honesta: dali não
 * vem nada.
 */
export function pesoDaSerra(x, z, base) {
  const fora = distanciaDaBorda(x, z);
  if (fora <= 0) return 0;
  const rampa = smoothstep(trava((fora - PLATAFORMA) / RAMPA));
  const terra = trava((base - WORLD.WATER_LEVEL) / 8);
  return rampa * terra;
}

/**
 * Altura do relevo falso em (x, z). `natural` é a `naturalHeight` da ilha, que
 * continua valendo pra fora do quadrado — é ela que fecha a costura.
 */
export function alturaDoHorizonte(natural, x, z) {
  const base = natural(x, z);
  const peso = pesoDaSerra(x, z, base);
  return peso === 0 ? base : base + perfilDaSerra(x, z) * peso;
}

/**
 * Quanto o anel está coberto de MATA, de 0 na costura a 1 lá fora.
 *
 * Não é enfeite, é a única forma de vegetação que ele pode ter. A serra sobe
 * 92 m em 440, ou seja 0,21 de declividade média — acima de `DECLIVE_TERRA`
 * (0,16) —, e pela regra de `ground.js` isso é TERRA. Medido na primeira
 * captura, o resultado foi uma cinta de barranco pelado de um quilômetro de
 * largura em volta do mapa, marrom contra o verde do planalto: a regra estava
 * certa e a resposta estava errada, porque ali não há as 4200 árvores que fazem
 * o resto do relevo ser verde. Colina distante é coberta de mato, e o mato tem
 * que estar na COR — é a mesma decisão de `paleta-vegetacao.py`, que pôs a
 * oliva na fonte em vez de esperar da gradação.
 *
 * A rampa é CURTA (260 m) e isso é medido, não afoiteza: a mistura quase não
 * mexe na grama e só age na terra. Medido nos bytes, uma mistura de 0,3 desloca
 * a grama em 5 níveis (invisível) e a terra em 9; em 0,9 desloca a grama em 16
 * e a terra em 27 — e nesse ponto a terra deixa de ser marrom, porque o
 * vermelho passa a ficar ABAIXO do verde (124>100 vira 97<114). Ou seja: a
 * mistura é um verdejador de barranco, e apressá-la não esverdeia o capim.
 *
 * Amarrá-la ao PESO da serra em vez da distância foi tentado e é pior: no flanco
 * de baixo o peso ainda é 0,11 enquanto a declividade local já passa de 0,12, e
 * era justamente ali que a cinta marrom aparecia.
 *
 * E ela sai de ZERO na costura de propósito: o mapa já não tem árvore no
 * último anel (`props.js` para em `ISLAND_RADIUS * 0,99`), então mata pintada
 * rente à borda desenharia uma linha onde não há nenhuma.
 */
export const MATA_ATE = 260;
export const MATA_MAX = 0.90;

export function mataAt(x, z) {
  const fora = distanciaDaBorda(x, z);
  if (fora <= 0) return 0;
  return smoothstep(trava(fora / MATA_ATE)) * MATA_MAX;
}

/**
 * A banda de transição tem UM passo de anel de largura. Ver `costura.js`, que é
 * quem a desenha e quem tem a medida da fenda que ela existe pra fechar.
 */
export const BANDA = PASSO;
