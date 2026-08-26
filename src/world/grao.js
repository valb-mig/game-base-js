import { WORLD } from '../config.js';
import { fbmTileavel } from './noise.js';

/**
 * Grão do chão: uma imagem de LUMINÂNCIA que multiplica a cor que `ground.js`
 * já calcula por vértice.
 *
 * Ela não sabe o que é grama e o que é areia, e é isso que a mantém barata e
 * sem risco: os cinco tipos de chão, a transição grama↔terra, o escurecimento
 * debaixo d'água, a mistura da estrada e a terra revolvida da pazada continuam
 * saindo todos do vertexColor, sem uma linha mudada. O grão só quebra o
 * chapado dos 2,5 m entre vértices.
 *
 * Gerada, não carregada, pelo mesmo motivo do céu: o projeto abre offline, e
 * sob `--virtual-time-budget` o relógio congela depois do PRIMEIRO fetch — um
 * asset novo cegaria toda bancada que medisse depois dele.
 *
 * Matemática pura, sem three: quem embrulha isso numa textura é `terrain.js`.
 */

/** Lado da imagem em pixels. Potência de dois por causa do mipmap e do wrap. */
export const LADO = 256;

/**
 * Período do ruído, em células da imagem. É ele que faz a imagem fechar, e
 * também o tamanho da mancha mais grossa: 8 células em 256 px são 32 px de
 * borrão na oitava de baixo, e 3,6 px na de cima.
 */
export const CELULAS = 8;

export const OITAVAS = 3;

/**
 * Tamanho do tile no mundo, em metros.
 *
 * Duas restrições, as duas medidas.
 *
 * NÃO pode ser múltiplo nem submúltiplo do passo da malha. São 2000/800 =
 * 2,5 m por vértice, e um tile de 2,5 / 5 / 7,5 m casa a repetição da textura
 * com a quebra do triângulo: a grade da malha aparece desenhada no chão, e o
 * grão que existe pra esconder a resolução passa a anunciá-la.
 *
 * E a FEIÇÃO tem que sobreviver ao mipmap. Com 3,1 m a mancha mais grossa era
 * de 39 cm e a mais fina de 4 cm: medido contra o render, o chão escurecia os
 * 2,4% previstos e o desvio de brilho CAÍA de 18,70 pra 18,02 — ou seja o mip
 * entregava a média da textura e variação nenhuma. Num FPS o chão é visto
 * quase sempre entre 5 e 50 m, e ali só sobrevive feição de ordem de metro.
 * Com 16 m a mancha grossa é de 2 m e a fina de 22 cm.
 */
export const METROS = 16;

/**
 * Quanto o grão escurece, no máximo. O multiplicador vive em 1-AMPLITUDE..1 —
 * byte não passa de 255, então o teto é 1 e todo grão escurece a média. É por
 * isso que a compensação de brilho é medida depois, não deduzida antes.
 */
export const AMPLITUDE = 0.22;

/**
 * Percentis do ruído usados pra esticar o contraste.
 *
 * Ruído de valor tem distribuição de SINO, e a mesma armadilha de
 * `densidade.js` vale aqui: medido sobre esta textura, o p5 é 0,2224 e o p95 é
 * 0,7211 — metade da faixa nominal. Usando o valor cru, os 22% de amplitude
 * declarada viravam 11% de modulação real, e o chão lia como liso.
 *
 * Esticar p5..p95 pra 0..1 dobra o contraste (2,01× medido) sem tocar na
 * amplitude. Mexer nas oitavas, no período ou no lado exige remedir estes dois
 * números — eles são medida, não escolha.
 */
export const P5 = 0.2224;
export const P95 = 0.7211;

/** Quantas vezes o tile cabe no mapa. */
export function repeticoes() {
  return WORLD.SIZE / METROS;
}

/**
 * Multiplicador de luminância em (u, v), com u e v em células.
 *
 * O ruído é ESTICADO pelos percentis antes de virar sombra, não elevado ao
 * quadrado. A primeira versão usava `n²` pra concentrar o escuro em manchas
 * esparsas, imitando chão de verdade; medido, o pixel típico ficava em 0,98 e
 * o chão lia como liso — concentrar sobre uma distribuição que já é de sino
 * concentra duas vezes. O esticão devolve os 22% de amplitude declarada.
 */
export function grauEm(u, v) {
  const cru = (fbmTileavel(u, v, CELULAS, OITAVAS) + 1) / 2;
  const n = Math.min(1, Math.max(0, (cru - P5) / (P95 - P5)));
  return 1 - AMPLITUDE * n;
}

/**
 * A imagem inteira em RGBA, pronta pra `putImageData`.
 *
 * Cinza nos três canais em vez de um canal só: three não tem formato de uma
 * componente que sirva de `map` sem shader próprio, e 256² RGBA com mipmap são
 * 350 KB de VRAM — não vale um shader pra economizar isso.
 */
export function desenharGrao(lado = LADO) {
  const dados = new Uint8ClampedArray(lado * lado * 4);
  const escala = CELULAS / lado;

  for (let py = 0; py < lado; py++) {
    for (let px = 0; px < lado; px++) {
      const valor = Math.round(grauEm(px * escala, py * escala) * 255);
      const i = (py * lado + px) * 4;
      dados[i] = valor;
      dados[i + 1] = valor;
      dados[i + 2] = valor;
      dados[i + 3] = 255;
    }
  }
  return dados;
}

/** Brilho médio da imagem, 0..1. É a compensação que o terreno vai precisar. */
export function brilhoMedio(lado = LADO) {
  const dados = desenharGrao(lado);
  let soma = 0;
  for (let i = 0; i < dados.length; i += 4) soma += dados[i];
  return soma / (dados.length / 4) / 255;
}
