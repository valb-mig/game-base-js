import { WORLD } from '../config.js';

/**
 * A malha viária de Sainte-Mère. Matemática pura, sem three.
 *
 * Estrada aqui é PINTURA no terreno, não geometria: uma função (x, z) -> peso
 * que a malha e o mapa tático leem pra trocar a cor do chão. Nenhum triângulo
 * novo, nenhum colisor, e ela acompanha o relevo exatamente — uma faixa de
 * malha por cima seria a mesma coisa que o campo de altura já desenha, só que
 * flutuando ou enterrada em toda lombada.
 *
 * O traçado é a leitura do mapa, não enfeite:
 *
 * - O ASFALTO é a rota principal, e ela liga a praia de desembarque à vila e
 *   dali à ponte do meio. É o caminho rápido e é o caminho ÓBVIO: quem anda
 *   por ele chega antes e é visto antes, e essa troca é a razão de ele
 *   existir. Sem estrada nenhuma, atravessar campo aberto e atravessar mata
 *   custavam a mesma coisa em decisão.
 * - Os caminhos de TERRA ligam os flancos — colina, fazenda — e as outras
 *   duas pontes. São a rota que não passa pelo meio do mapa.
 * - Toda travessia do rio cai numa ponte. Estrada que atravessasse o leito
 *   contaria uma mentira: ali não se passa, se nada.
 */

const ASFALTO = 'asfalto';
const TERRA_BATIDA = 'terra';

/**
 * Meia-largura da pista e a borda em que ela se desfaz no capim, em metros.
 *
 * O asfalto tem borda CURTA e o caminho de terra tem borda longa, e isso é a
 * diferença entre os dois: asfalto tem meio-fio, terra é o capim que foi sendo
 * pisado até sumir. Com os 3,5 m de desmanche que o asfalto tinha, a pista
 * ficava com 15 m de largura aparente e lia como um rio de piche cortando o
 * mapa.
 */
const PERFIL = {
  [ASFALTO]: { meia: 3.2, borda: 1.6, cor: () => WORLD.ASFALTO },
  [TERRA_BATIDA]: { meia: 2.6, borda: 2.4, cor: () => WORLD.TERRA_BATIDA }
};

/**
 * Onde as pistas passam sobre as pontes.
 *
 * O X sai da tabela de pontes e o Z do leito, como tudo que fala do rio. O
 * ±46 cobre o tabuleiro inteiro com folga: a ponte tem uns 38 m de cada lado
 * do leito, e a pista precisa encostar nas duas cabeceiras — pista que para
 * antes vira um degrau de capim na entrada da ponte.
 */
const SOBRE_A_PONTE = 46;

function travessia(indice, leitoDoRio) {
  const x = WORLD.PONTES[indice];
  const z = leitoDoRio(x);
  return [[x, z - SOBRE_A_PONTE], [x, z + SOBRE_A_PONTE]];
}

/**
 * As rotas, em ordem de importância. Os pontos intermediários existem pra que
 * a estrada CURVE: reta de ponta a ponta lê como risco de régua no mapa, e
 * estrada de verdade contorna o que não vale a pena subir.
 */
export function rotas(leitoDoRio) {
  const [oesteN, oesteS] = travessia(0, leitoDoRio);
  const [centroN, centroS] = travessia(1, leitoDoRio);
  const [lesteN, lesteS] = travessia(2, leitoDoRio);

  return [
    // ------------------------------------------------------------ asfalto
    // A artéria: sobe da praia pela escarpa, cruza a vila e desce pro rio.
    {
      nome: 'estrada da praia', tipo: ASFALTO,
      pontos: [[-88, -790], [-124, -652], [-96, -470], [-58, -300], [-44, -173]]
    },
    {
      nome: 'estrada do rio', tipo: ASFALTO,
      pontos: [[-44, -173], [-70, -20], [-104, 110], centroN, centroS,
        [-118, 330], [-146, 430]]
    },
    {
      nome: 'estrada da base sul', tipo: ASFALTO,
      pontos: [[-146, 430], [-330, 520], [-520, 612], [-693, 672]]
    },
    {
      nome: 'estrada do moinho', tipo: ASFALTO,
      pontos: [centroS, [40, 290], [190, 322], [301, 351], [452, 470],
        [560, 620], [638, 721]]
    },

    // -------------------------------------------------------------- terra
    {
      nome: 'trilha da colina', tipo: TERRA_BATIDA,
      pontos: [[-44, -173], [-206, -230], [-380, -318], [-549, -418]]
    },
    {
      nome: 'trilha da fazenda', tipo: TERRA_BATIDA,
      pontos: [[-44, -173], [140, -244], [330, -352], [490, -453]]
    },
    {
      nome: 'trilha da ponte leste', tipo: TERRA_BATIDA,
      pontos: [[490, -453], [498, -220], [462, -40], lesteN, lesteS,
        [400, 250], [301, 351]]
    },
    {
      nome: 'trilha da ponte oeste', tipo: TERRA_BATIDA,
      pontos: [[-549, -418], [-596, -190], [-570, 30], [-588, 180],
        oesteN, oesteS, [-640, 470], [-693, 672]]
    }
  ];
}

/**
 * Índice espacial por célula.
 *
 * Sem ele cada um dos 641 mil vértices da malha testaria os ~40 trechos da
 * rede, o que são 25 milhões de distâncias ponto-segmento só pra pintar o
 * chão uma vez. Com célula de 64 m sobra menos de um trecho por célula, e o
 * custo passa a ser o tamanho da rede perto do vértice, não o dela inteira.
 * É a mesma ideia do índice de arbustos.
 */
const CELULA = 64;

/**
 * Chave NUMÉRICA, não string.
 *
 * A malha consulta a rede uma vez por vértice, e são 641 mil: com
 * `${cx},${cz}` isso é 641 mil strings alocadas só pra montar o chão. O
 * deslocamento de 512 põe as células negativas em índice positivo, e 1024
 * cabe folgado no mapa de 2 km com célula de 64 m.
 */
function chave(cx, cz) {
  return (cx + 512) * 1024 + (cz + 512);
}

export function createEstradas(leitoDoRio) {
  const trechos = [];
  for (const rota of rotas(leitoDoRio)) {
    const perfil = PERFIL[rota.tipo];
    for (let i = 1; i < rota.pontos.length; i++) {
      const [ax, az] = rota.pontos[i - 1];
      const [bx, bz] = rota.pontos[i];
      trechos.push({
        ax, az, bx, bz,
        dx: bx - ax, dz: bz - az,
        comprimento2: (bx - ax) ** 2 + (bz - az) ** 2,
        tipo: rota.tipo, meia: perfil.meia, borda: perfil.borda
      });
    }
  }

  const grade = new Map();
  for (let i = 0; i < trechos.length; i++) {
    const t = trechos[i];
    const alcance = t.meia + t.borda;
    const cx0 = Math.floor((Math.min(t.ax, t.bx) - alcance) / CELULA);
    const cx1 = Math.floor((Math.max(t.ax, t.bx) + alcance) / CELULA);
    const cz0 = Math.floor((Math.min(t.az, t.bz) - alcance) / CELULA);
    const cz1 = Math.floor((Math.max(t.az, t.bz) + alcance) / CELULA);

    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const k = chave(cx, cz);
        if (!grade.has(k)) grade.set(k, []);
        grade.get(k).push(i);
      }
    }
  }

  /** Distância de (x, z) ao trecho, no plano. */
  function aoTrecho(t, x, z) {
    let s = 0;
    if (t.comprimento2 > 0) {
      s = ((x - t.ax) * t.dx + (z - t.az) * t.dz) / t.comprimento2;
      s = Math.max(0, Math.min(1, s));
    }
    return Math.hypot(x - (t.ax + t.dx * s), z - (t.az + t.dz * s));
  }

  /**
   * O trecho de maior peso em (x, z), ou null.
   *
   * Vence o de MAIOR peso, não o último testado: onde duas rotas se cruzam o
   * resultado não pode depender da ordem da tabela — e no entroncamento da
   * vila cruzam quatro.
   */
  function melhorTrecho(x, z) {
    const perto = grade.get(chave(Math.floor(x / CELULA), Math.floor(z / CELULA)));
    if (!perto) return null;

    let melhor = null;
    let peso = 0;
    for (const i of perto) {
      const t = trechos[i];
      const d = aoTrecho(t, x, z);
      if (d >= t.meia + t.borda) continue;

      const p = d <= t.meia ? 1 : 1 - (d - t.meia) / t.borda;
      if (p > peso) {
        peso = p;
        melhor = t;
      }
    }
    return melhor && { peso, tipo: melhor.tipo };
  }

  return {
    /** Quanto (x, z) é estrada, de 0 a 1. Zero na esmagadora maioria do mapa. */
    estradaAt: (x, z) => melhorTrecho(x, z)?.peso ?? 0,

    /**
     * Cor da pista em (x, z), ou null fora dela.
     *
     * Consulta separada em vez de `estradaAt` guardar o tipo do último ponto
     * num campo do módulo: quem pergunta tem que dizer de onde pergunta. Esse
     * atalho já custou um bug nesta base — `capture` guardava o último alvo, e
     * o painel do jogador passou a mostrar a bandeira que um bot estava
     * trocando a sessenta metros dali. É barato porque só quem já sabe que
     * está na estrada chama, e estrada é 2% do mapa.
     */
    corDeEstradaAt(x, z) {
      const achado = melhorTrecho(x, z);
      return achado ? PERFIL[achado.tipo].cor() : null;
    },

    trechos
  };
}

export { ASFALTO, TERRA_BATIDA };
