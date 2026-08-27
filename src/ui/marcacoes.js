import { WORLD } from '../config.js';

/**
 * As marcações do jogador no mapa. Só dado — sem three, sem DOM.
 *
 * Elas existem pra que o jogador possa dizer alguma coisa pra si mesmo sobre
 * o terreno: "o ninho de metralhadora é ali", "vou por aqui". Num mapa de dois
 * quilômetros sem voz nem esquadrão nomeado, isso é a única forma de plano
 * que o jogo oferece — e por isso ela aparece no mapa grande E na bússola,
 * senão a marca é esquecida no instante em que a tela fecha.
 *
 * Mora num módulo próprio porque três telas leem a mesma lista: o mapa
 * grande, o radar e a bússola. Duas cópias se separariam na primeira marca.
 */

/**
 * Quantas cabem. Poucas de propósito.
 *
 * Marcação demais é o mesmo que nenhuma: com vinte pontos na tela, nenhum
 * deles quer dizer nada. Chegando no teto, a mais velha sai — quem marca um
 * ponto novo está dizendo que ele importa mais que o primeiro.
 */
export const MAX = 4;

const marcas = [];
let proximoId = 1;

/** Uma marca nova. Devolve a marca criada. */
export function marcar(x, z) {
  const marca = { id: proximoId++, x, z };
  marcas.push(marca);
  if (marcas.length > MAX) marcas.shift();
  return marca;
}

/**
 * Tira a marca mais perto de (x, z), se houver uma dentro de `raio`.
 *
 * É o mesmo clique que põe: clicar em cima de uma marca existente a apaga.
 * Um botão separado pra remover seria uma tecla a mais pra decorar num jogo
 * que já tem oito.
 */
export function desmarcar(x, z, raio) {
  let melhor = -1;
  let menor = raio;
  for (let i = 0; i < marcas.length; i++) {
    const d = Math.hypot(marcas[i].x - x, marcas[i].z - z);
    if (d > menor) continue;
    menor = d;
    melhor = i;
  }
  if (melhor < 0) return null;
  return marcas.splice(melhor, 1)[0];
}

/** Põe uma marca, ou tira a que já estava ali. Devolve o que aconteceu. */
export function alternar(x, z, raio) {
  const tirada = desmarcar(x, z, raio);
  if (tirada) return { acao: 'tirou', marca: tirada };
  return { acao: 'pos', marca: marcar(x, z) };
}

export function todas() {
  return marcas;
}

export function limpar() {
  marcas.length = 0;
}

/**
 * Fora dos limites do mapa não se marca.
 *
 * O canvas é retangular e a ilha é redonda: sem isto o jogador marca o mar
 * aberto ou o canto vazio, e a marca aponta pra um lugar aonde ele não pode
 * ir. Melhor o clique não fazer nada do que fazer uma promessa falsa.
 */
export function dentroDoMapa(x, z) {
  return Math.hypot(x, z) <= WORLD.ISLAND_RADIUS;
}
