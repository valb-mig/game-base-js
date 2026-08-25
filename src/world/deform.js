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
  ALTURA_MAX: 3.4,    // levantamento máximo acumulado num ponto

  // Raio mínimo de qualquer marca. Abaixo disso a marca cai entre dois
  // vértices e simplesmente não registra: dois tiros iguais no mesmo lugar
  // fariam coisas diferentes conforme onde caíssem na grade. Craterinha de
  // bala é mais larga do que deveria por causa disso — é o preço de um
  // terreno de 2,55 m por vértice, e é o preço certo a pagar.
  RAIO_MIN: 1.9
};

export function createDeform() {
  // Float32Array de 181x181: 131 KB, alocado uma vez e nunca mais.
  const grade = new Float32Array(LADO * LADO);

  // Quanto o ponto está revolvido, de 0 a 1 — camada à parte de propósito.
  // Derivar isto da profundidade ligava duas coisas que não andam juntas:
  // uma bala mal move terra e revolve toda ela, enquanto um aterro fundo e
  // antigo já devia estar coberto. Sem esta camada, o tiro afundava 2,6 cm,
  // pintava 5% de terra e o jogador jurava que não tinha acontecido nada.
  const revolvido = new Float32Array(LADO * LADO);

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
  function apply(x, z, amount, radius = DEFORM.RAIO, marca = 1) {
    const cx = coluna(x);
    const cz = linha(z);
    const alcance = Math.max(radius, DEFORM.RAIO_MIN) / PASSO;

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
        const sujoAntes = revolvido[indice];

        const alvo = Math.max(-DEFORM.LIMITE,
          Math.min(DEFORM.ALTURA_MAX, antes + amount * peso));

        // A marca quase não afina pra beirada, e isso é de propósito. Uma
        // primeira versão elevava o peso ao cubo pra concentrar a terra no
        // ponto do impacto; com 2,55 m entre vértices, o tiro cai longe de
        // todos eles, cada um pegava peso baixo e a marca inteira diluía
        // pra 49% — de novo invisível. Abaixo da célula da malha não existe
        // formato pra modelar: ou a célula está revolvida ou não está.
        if (marca > 0) {
          revolvido[indice] = Math.min(1, sujoAntes + (0.55 + 0.45 * peso) * marca);
        }

        // Vale atualizar o vértice se a cor mudou, mesmo com a altura no
        // limite: é a marca que o jogador enxerga.
        if (alvo === antes && revolvido[indice] === sujoAntes) continue;
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

  /** Quanto o ponto está revolvido, de 0 a 1. Interpolado como a altura. */
  function revolvidoAt(x, z) {
    const cx = coluna(x);
    const cz = linha(z);
    const col = Math.floor(cx);
    const lin = Math.floor(cz);
    const fx = cx - col;
    const fz = cz - lin;

    const dentroSujo = (c, l) =>
      (c >= 0 && c < LADO && l >= 0 && l < LADO ? revolvido[l * LADO + c] : 0);

    const a = dentroSujo(col, lin);
    const b = dentroSujo(col + 1, lin);
    const c = dentroSujo(col, lin + 1);
    const d = dentroSujo(col + 1, lin + 1);

    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }

  return {
    grade,
    revolvido,
    lado: LADO,
    passo: PASSO,
    deltaAt,
    depthAt,
    revolvidoAt,
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
      revolvido.fill(0);
    }
  };
}
