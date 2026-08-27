import { WORLD } from '../config.js';

/**
 * A ilha como CARTA TOPOGRÁFICA: cinco níveis de altitude e a linha entre
 * eles. Nada da cor do chão entra aqui.
 *
 * O mapa tático e o radar pintam o terreno com a cor que ele TEM — grama,
 * areia, barranco, asfalto — porque ali a pergunta é "o que é aquilo". O mapa
 * que o soldado abre na mão responde outra: onde é ALTO. Cor de vegetação num
 * mapa de papel de 1945 não existiria, e pior, ela esconde exatamente o dado
 * que decide a briga — quem está por cima de quem.
 *
 * Continua saindo do MESMO campo de altura do terreno, como o mapa tático:
 * mexer no relevo move os dois juntos. Não é imagem à parte.
 */

const RESOLUCAO = 300;   // amostras por lado; o papel amplia isso

/** Quantas faixas de altitude. Cinco é o que se lê de relance; dez é ruído. */
export const NIVEIS = 5;

// Papel envelhecido: do vale claro ao alto escuro. É uma rampa só, e é ela que
// faz a leitura ser de ALTITUDE e não de tipo de chão.
const TERRA = [
  [222, 210, 178],
  [209, 194, 156],
  [194, 176, 132],
  [176, 155, 108],
  [156, 133, 86]
];

const AGUA = [124, 143, 152];
const LINHA = [96, 80, 52];

const cache = new WeakMap();

/**
 * Os cinco cortes de altitude, medidos.
 *
 * Faixas iguais entre o mínimo e o máximo absolutos dariam quatro níveis
 * vazios e um com tudo: o relevo é ruído de valor, e ruído de valor tem
 * distribuição de SINO — é a quarta vez que isto aparece nesta base. Os cortes
 * saem dos percentis 2 e 98 da terra amostrada, que é onde o relevo de fato
 * mora.
 */
function cortes(alturas) {
  alturas.sort((a, b) => a - b);
  const p = (f) => alturas[Math.min(alturas.length - 1,
    Math.max(0, Math.round(f * (alturas.length - 1))))];
  const baixo = p(0.02);
  const alto = p(0.98);
  const passo = (alto - baixo) / NIVEIS;
  const lista = [];
  for (let i = 1; i < NIVEIS; i++) lista.push(baixo + passo * i);
  return lista;
}

function nivelDe(altura, limites) {
  let n = 0;
  while (n < limites.length && altura >= limites[n]) n++;
  return n;
}

/** Memoizada por terreno: são 90 mil consultas de altura, e há três telas. */
export function topografiaDe(terrain) {
  let pronta = cache.get(terrain);
  if (!pronta) {
    pronta = renderTopografia(terrain);
    cache.set(terrain, pronta);
  }
  return pronta;
}

export function renderTopografia(terrain) {
  const span = WORLD.SIZE;
  const passo = span / RESOLUCAO;

  // Duas varreduras: a primeira mede o relevo, a segunda pinta. Sem a
  // primeira os cortes teriam que ser constantes escritas à mão, e elas
  // mentiriam no dia em que o mapa mudasse de relevo — que é a mesma razão de
  // a hitbox sair da malha.
  const alturas = new Float32Array(RESOLUCAO * RESOLUCAO);
  const seco = new Uint8Array(RESOLUCAO * RESOLUCAO);
  const terra = [];

  for (let linha = 0; linha < RESOLUCAO; linha++) {
    const z = -span / 2 + linha * passo;
    for (let coluna = 0; coluna < RESOLUCAO; coluna++) {
      const x = -span / 2 + coluna * passo;
      const i = linha * RESOLUCAO + coluna;
      const h = terrain.heightAt(x, z);
      alturas[i] = h;
      seco[i] = h >= terrain.nivelDaAguaAt(x, z) ? 1 : 0;
      if (seco[i]) terra.push(h);
    }
  }

  const limites = cortes(terra);

  const niveis = new Uint8Array(RESOLUCAO * RESOLUCAO);
  for (let i = 0; i < niveis.length; i++) {
    niveis[i] = seco[i] ? nivelDe(alturas[i], limites) : 255;
  }

  const canvas = document.createElement('canvas');
  canvas.width = RESOLUCAO;
  canvas.height = RESOLUCAO;
  const ctx = canvas.getContext('2d');
  const imagem = ctx.createImageData(RESOLUCAO, RESOLUCAO);
  const dados = imagem.data;

  for (let linha = 0; linha < RESOLUCAO; linha++) {
    for (let coluna = 0; coluna < RESOLUCAO; coluna++) {
      const i = linha * RESOLUCAO + coluna;
      const n = niveis[i];

      // A curva de nível é a FRONTEIRA entre duas faixas, e ela sai de
      // comparar com o vizinho — não há como desenhá-la depois, porque depois
      // a faixa já é um bloco de cor só.
      const direita = coluna + 1 < RESOLUCAO ? niveis[i + 1] : n;
      const abaixo = linha + 1 < RESOLUCAO ? niveis[i + RESOLUCAO] : n;
      const borda = direita !== n || abaixo !== n;

      const cor = borda ? LINHA : (n === 255 ? AGUA : TERRA[n]);
      const j = i * 4;
      dados[j] = cor[0];
      dados[j + 1] = cor[1];
      dados[j + 2] = cor[2];
      dados[j + 3] = 255;
    }
  }

  ctx.putImageData(imagem, 0, 0);
  canvas.limites = limites;
  return canvas;
}
