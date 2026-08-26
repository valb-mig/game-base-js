import { WORLD } from '../config.js';

/**
 * Que tipo de chão é cada ponto do mapa. Matemática pura, sem three: é a
 * fonte de verdade tanto pra cor da malha quanto pra onde nasce vegetação.
 *
 * São cinco, e cada um é uma regra de jogo, não um enfeite:
 *
 * - AGUA, onde há lâmina em cima. Manda antes de todos os outros: o leito do
 *   rio é plano, e sem esta regra a declividade o classificava como grama —
 *   com o rio cheio, pinheiro nascia de pé dentro da correnteza.
 *
 * - ESTRADA, onde passa a rota. Deserta como a areia, e pelo mesmo motivo ao
 *   contrário: mato no meio da pista devolveria de graça a cobertura que a
 *   estrada não tem, e é a falta dela que faz o caminho rápido ser o caminho
 *   perigoso.
 * - AREIA, perto da água. Deserta de propósito: nada nasce ali. A praia de
 *   desembarque é o lugar mais aberto do mapa e é isso que a faz difícil —
 *   um arbusto na areia devolveria de graça a cobertura que ela não tem.
 * - TERRA, onde a declividade é forte. Grama não pega em barranco: a escarpa
 *   atrás da praia e as margens do rio ficam pelados, e quem sobe barranco
 *   não tem onde se esconder.
 * - GRAMA, o resto. É o único chão em que nasce árvore e arbusto.
 *
 * O tipo é discreto de propósito — quem pergunta "dá pra nascer mato aqui?"
 * precisa de sim ou não. A COR tem transição, senão a fronteira entre grama e
 * terra vira recorte de papel.
 */

export const AGUA = 'agua';
export const ESTRADA = 'estrada';
export const AREIA = 'areia';
export const TERRA = 'terra';
export const GRAMA = 'grama';

/**
 * Sobre que distância a declividade é medida, em metros.
 *
 * É o passo da malha do terreno de propósito, não um número solto: medida em
 * 2,5 m a escarpa dá 0,21 e medida em 7,7 m dá outra coisa, e aí a malha e o
 * mapa tático discordariam sobre onde acaba a grama. Uma medida só, um
 * resultado só.
 */
export const PASSO_DECLIVE = WORLD.SIZE / WORLD.TERRAIN_SEGMENTS;

/** Módulo do gradiente do terreno em (x, z), em metro por metro. */
export function declividadeAt(heightAt, x, z, passo = PASSO_DECLIVE) {
  const dx = (heightAt(x + passo, z) - heightAt(x - passo, z)) / (2 * passo);
  const dz = (heightAt(x, z + passo) - heightAt(x, z - passo)) / (2 * passo);
  return Math.hypot(dx, dz);
}

/**
 * A água manda antes de tudo. O leito do rio é PLANO, então pela declividade
 * ele é grama — e grama é onde nasce árvore: com o rio cheio, os pinheiros
 * ficaram plantados dentro d'água, de pé no meio da correnteza.
 *
 * Ela vem por fora (`lamina`) e não da altura porque são duas águas neste
 * mapa: o mar no zero e o rio a 12,4 m. Comparar a altura com uma constante
 * acertava o mar e errava o rio, que é justamente o caso novo.
 *
 * Depois dela, a altura: areia perto da água acontece mesmo em barranco, que
 * é justamente a duna. E só então a declividade separa terra de grama.
 */
export function tipoDoChao(altura, declividade, lamina = 0, estrada = 0) {
  if (lamina > 0) return AGUA;
  // Meia pista já é pista: o tipo é discreto porque quem pergunta quer saber
  // se pode nascer mato ali, e a resposta é sim ou não. A COR é que tem
  // transição, senão a beira do asfalto vira recorte de papel.
  if (estrada >= 0.5) return ESTRADA;
  if (altura < WORLD.SAND_UNTIL) return AREIA;
  return declividade >= WORLD.DECLIVE_TERRA ? TERRA : GRAMA;
}

function mistura(a, b, t) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = Math.round(ar + (((b >> 16) & 255) - ar) * t);
  const g = Math.round(ag + (((b >> 8) & 255) - ag) * t);
  const azul = Math.round(ab + ((b & 255) - ab) * t);
  return (r << 16) | (g << 8) | azul;
}

/**
 * Cor do chão. Areia tem borda seca — é a linha d'água, e linha d'água é
 * nítida. Grama e terra se misturam ao longo da subida, porque ali não há
 * fronteira nenhuma no mundo, só o capim rareando.
 */
export function colorAt(altura, declividade = 0, estrada = 0, corEstrada = null) {
  // Sem IIFE aqui: a malha chama isto uma vez por vértice, e um closure por
  // chamada são 641 mil objetos jogados no coletor só pra montar o chão.
  let chao;
  if (altura < WORLD.SAND_UNTIL) {
    chao = WORLD.SAND_COLOR;
  } else {
    const inicio = WORLD.DECLIVE_TERRA * 0.55;
    const t = Math.max(0, Math.min(1,
      (declividade - inicio) / (WORLD.DECLIVE_TERRA - inicio)));
    chao = mistura(WORLD.GRASS_COLOR, WORLD.DIRT_COLOR, t * t * (3 - 2 * t));
  }

  if (estrada <= 0 || corEstrada === null) return chao;
  // A pista tem miolo cheio e beira desfeita: o peso já vem com a transição
  // da borda, então misturar por ele dá a orla de capim pisado sozinha.
  return mistura(chao, corEstrada, estrada);
}
