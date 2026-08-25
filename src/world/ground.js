import { WORLD } from '../config.js';

/**
 * Que tipo de chão é cada ponto do mapa. Matemática pura, sem three: é a
 * fonte de verdade tanto pra cor da malha quanto pra onde nasce vegetação.
 *
 * São três, e cada um é uma regra de jogo, não um enfeite:
 *
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
 * Altura manda primeiro: areia perto da água acontece mesmo em barranco, que
 * é justamente a duna. Só depois a declividade separa terra de grama.
 */
export function tipoDoChao(altura, declividade) {
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
export function colorAt(altura, declividade = 0) {
  if (altura < WORLD.SAND_UNTIL) return WORLD.SAND_COLOR;

  const inicio = WORLD.DECLIVE_TERRA * 0.55;
  const t = Math.max(0, Math.min(1,
    (declividade - inicio) / (WORLD.DECLIVE_TERRA - inicio)));
  return mistura(WORLD.GRASS_COLOR, WORLD.DIRT_COLOR, t * t * (3 - 2 * t));
}
