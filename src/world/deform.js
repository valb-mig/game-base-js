import { WORLD } from '../config.js';

/**
 * Terreno escavável.
 *
 * A ilha continua sendo uma função pura de altura; isto é uma camada de
 * deltas por cima. Cavar não cria geometria nova: mexe nos vértices que a
 * malha do terreno já tem. O custo em polígonos de escavar o mapa inteiro é
 * exatamente zero, e o custo por quadro também — só o instante da pazada
 * escreve alguma coisa.
 *
 * A grade coincide com os vértices da malha, um pra um. Isso é o que permite
 * a atualização parcial: uma pazada sabe exatamente quais índices tocar, e
 * escreve só neles, sem recriar buffer nem geometria.
 */

const LADO = WORLD.TERRAIN_SEGMENTS + 1;   // vértices por lado
const PASSO = WORLD.SIZE / WORLD.TERRAIN_SEGMENTS;

export const DEFORM = {
  // A malha tem 2,55 m por vértice, então uma pazada mexe uns poucos deles.
  // Isso fixa a escala do que dá pra construir: trincheira e parapeito, não
  // buraco de pá. Os valores são generosos de propósito — pazada tímida
  // desaparece na interpolação entre vértices e não constrói nada.
  RAIO: 3.0,          // raio da pazada, em metros
  FUNDO: 0.9,         // quanto uma pazada afunda no centro
  MONTE: 0.78,        // quanto uma pazada levanta no centro
  LIMITE: 4.2,        // afundamento máximo acumulado num ponto
  ALTURA_MAX: 3.4     // levantamento máximo acumulado num ponto
};

export function createDeform() {
  // Float32Array de 181x181: 131 KB, alocado uma vez e nunca mais.
  const grade = new Float32Array(LADO * LADO);

  const coluna = (x) => (x + WORLD.SIZE / 2) / PASSO;
  const linha = (z) => (z + WORLD.SIZE / 2) / PASSO;

  const dentro = (col, lin) => col >= 0 && col < LADO && lin >= 0 && lin < LADO;
  const ler = (col, lin) => (dentro(col, lin) ? grade[lin * LADO + col] : 0);

  /**
   * Delta interpolado em (x, z). Bilinear de propósito: a colisão amostra
   * esta função e a malha desenha os vértices, então os dois têm que
   * concordar — senão o jogador anda um palmo acima ou abaixo do buraco.
   */
  function deltaAt(x, z) {
    const cx = coluna(x);
    const cz = linha(z);
    const col = Math.floor(cx);
    const lin = Math.floor(cz);
    const fx = cx - col;
    const fz = cz - lin;

    const a = ler(col, lin);
    const b = ler(col + 1, lin);
    const c = ler(col, lin + 1);
    const d = ler(col + 1, lin + 1);

    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }

  /**
   * Aplica uma pazada em (x, z). `amount` negativo cava, positivo aterra.
   *
   * Devolve os índices de vértice tocados, pra que a malha atualize só eles.
   * Devolve lista vazia quando nada mudou — bater no limite não deve custar
   * uma atualização de buffer.
   */
  function apply(x, z, amount, radius = DEFORM.RAIO) {
    const cx = coluna(x);
    const cz = linha(z);
    const alcance = radius / PASSO;

    const de = Math.max(0, Math.floor(cx - alcance));
    const ate = Math.min(LADO - 1, Math.ceil(cx + alcance));
    const deL = Math.max(0, Math.floor(cz - alcance));
    const ateL = Math.min(LADO - 1, Math.ceil(cz + alcance));

    const tocados = [];

    for (let lin = deL; lin <= ateL; lin++) {
      for (let col = de; col <= ate; col++) {
        const dist = Math.hypot(col - cx, lin - cz) / alcance;
        if (dist >= 1) continue;

        // cosseno levantado: fundo suave no meio e beirada sem degrau
        const peso = 0.5 + 0.5 * Math.cos(dist * Math.PI);
        const indice = lin * LADO + col;
        const antes = grade[indice];

        const alvo = Math.max(-DEFORM.LIMITE,
          Math.min(DEFORM.ALTURA_MAX, antes + amount * peso));

        if (alvo === antes) continue;
        grade[indice] = alvo;
        tocados.push(indice);
      }
    }
    return tocados;
  }

  /** Quanto o ponto já foi mexido. Serve pra saber se ainda dá pra cavar. */
  function depthAt(x, z) {
    return deltaAt(x, z);
  }

  return {
    grade,
    lado: LADO,
    passo: PASSO,
    deltaAt,
    depthAt,
    apply,

    /** Coordenada de mundo do vértice de índice `i`. */
    posicaoDoVertice(i) {
      const col = i % LADO;
      const lin = Math.floor(i / LADO);
      return {
        x: -WORLD.SIZE / 2 + col * PASSO,
        z: -WORLD.SIZE / 2 + lin * PASSO
      };
    },

    /** Zera tudo. Usado só por teste e por recomeço de partida. */
    reset() {
      grade.fill(0);
    }
  };
}
