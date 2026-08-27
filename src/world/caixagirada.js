/**
 * Uma caixa que ACOMPANHA o corpo, em vez de envolvê-lo.
 *
 * É a mesma ideia que o veículo já usava (`veiculos/casco.js`): em vez de
 * levar a caixa pro mundo — onde ela vira um retângulo alinhado aos eixos, e
 * portanto muito maior que o corpo diagonal —, leva-se a PERGUNTA pro sistema
 * do corpo, onde a caixa continua sendo a caixa.
 *
 * Antes disso, prop tombado era FATIADO: oito caixas curtas em escada ao longo
 * do corpo, 2,0 vezes o volume dele em vez de 6,2. Melhor que uma caixa só e
 * ainda assim errado — o jogador esbarrava nos degraus da escada, ficava de pé
 * no ar em cima deles, e cada prop derrubado custava sete colisores a mais
 * numa lista que a colisão varre todo quadro. Uma caixa girada é EXATA e é
 * uma só.
 *
 * Sem three de propósito, como `game/hitboxes.js` e `veiculos/casco.js`: são
 * dezesseis números e aritmética, e é isso que deixa `player/collision.js`
 * continuar sendo testável sem montar mundo nenhum.
 *
 * A matriz que entra tem que ser RÍGIDA (rotação e translação, sem escala) —
 * é o caso da queda de prop. Com escala, a inversa não é a transposta e tudo
 * aqui mente em silêncio.
 */

const EPS = 1e-9;

export function criarCaixaGirada(caixaLocal, folgaBase = 0) {
  return {
    // A caixa no sistema DO CORPO: é a pegada dele de pé, e não muda nunca.
    caixa: { ...caixaLocal },

    /**
     * Quanto inflar cada eixo LOCAL pra representar o cilindro do jogador.
     *
     * A soma de Minkowski de uma caixa com um cilindro vertical não é uma
     * caixa, e a aproximação de sempre desta base — inflar em `RADIUS` no
     * plano XZ — só vale enquanto os eixos da caixa SÃO o plano XZ. Girada,
     * cada eixo local aponta pra uma direção com mais ou menos horizontal, e é
     * essa fração que decide quanto ele leva: eixo deitado leva a folga
     * inteira, eixo em pé não leva nada. De pé o resultado é idêntico ao de
     * antes, que é o que se quer — a esmagadora maioria dos props nunca cai.
     */
    folga: { x: folgaBase, y: 0, z: folgaBase },
    folgaBase,

    // Rotação transposta (= inversa) e a translação, prontas pra usar.
    r: new Float64Array(9),
    t: new Float64Array(3),

    /** Escreve a pose a partir dos 16 elementos de uma Matrix4 (coluna a coluna). */
    escrever(e) {
      // Colunas da rotação: o eixo local X, Y e Z vistos do mundo.
      this.r.set([e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]]);
      this.t.set([e[12], e[13], e[14]]);

      // A verticalidade de cada eixo é a componente Y dele; o que sobra é a
      // horizontal, e é ela que multiplica a folga.
      const h = (ey) => Math.sqrt(Math.max(0, 1 - ey * ey));
      this.folga.x = folgaBase * h(e[1]);
      this.folga.y = folgaBase * h(e[5]);
      this.folga.z = folgaBase * h(e[9]);
      return this;
    },

    /** Um PONTO do mundo no sistema do corpo. */
    paraLocal(px, py, pz, saida = {}) {
      const dx = px - this.t[0];
      const dy = py - this.t[1];
      const dz = pz - this.t[2];
      const r = this.r;
      saida.x = dx * r[0] + dy * r[1] + dz * r[2];
      saida.y = dx * r[3] + dy * r[4] + dz * r[5];
      saida.z = dx * r[6] + dy * r[7] + dz * r[8];
      return saida;
    },

    /** Um VETOR do mundo no sistema do corpo (sem a translação). */
    vetorParaLocal(vx, vy, vz, saida = {}) {
      const r = this.r;
      saida.x = vx * r[0] + vy * r[1] + vz * r[2];
      saida.y = vx * r[3] + vy * r[4] + vz * r[5];
      saida.z = vx * r[6] + vy * r[7] + vz * r[8];
      return saida;
    },

    /** O caminho de volta: um ponto do corpo levado pro mundo. */
    paraMundo(lx, ly, lz, saida = {}) {
      const r = this.r;
      saida.x = lx * r[0] + ly * r[3] + lz * r[6] + this.t[0];
      saida.y = lx * r[1] + ly * r[4] + lz * r[7] + this.t[1];
      saida.z = lx * r[2] + ly * r[5] + lz * r[8] + this.t[2];
      return saida;
    }
  };
}

/**
 * Rascunhos de módulo. As consultas abaixo rodam por colisor por consulta, e a
 * colisão consulta dezenas de vezes por quadro por corpo: um literal novo aqui
 * seria lixo por quadro, que é a mesma armadilha da closure em `colorAt` e da
 * chave de grade em texto. Quem chama consome a resposta na hora.
 */
const origem = {};
const rumo = {};
const faixa = { entra: 0, sai: 0 };

/**
 * Onde a VERTICAL que passa por (x, z) entra e sai da caixa, em Y de mundo.
 *
 * É a pergunta que a colisão do jogador faz três vezes com nomes diferentes —
 * "isto barra o corpo?", "qual o topo pra pisar?", "qual o teto pra bater?" —,
 * e todas as três se respondem com o mesmo intervalo. Devolve `null` quando a
 * vertical passa ao largo.
 *
 * Um teste de sobreposição em XZ não serve aqui: o retângulo que a caixa
 * girada projeta no chão é um hexágono, e testar contra o retângulo dele é
 * voltar exatamente à caixa envolvente que se está tentando evitar.
 */
export function intervaloVertical(g, x, z, comFolga = true) {
  g.paraLocal(x, 0, z, origem);
  g.vetorParaLocal(0, 1, 0, rumo);

  const fx = comFolga ? g.folga.x : 0;
  const fy = comFolga ? g.folga.y : 0;
  const fz = comFolga ? g.folga.z : 0;

  let entra = -Infinity;
  let sai = Infinity;

  // Fatias (slabs) nos três eixos locais. O `t` que sai daqui é o Y do mundo,
  // porque a origem do raio é o ponto (x, 0, z).
  const eixos = [
    [origem.x, rumo.x, g.caixa.minX - fx, g.caixa.maxX + fx],
    [origem.y, rumo.y, g.caixa.minY - fy, g.caixa.maxY + fy],
    [origem.z, rumo.z, g.caixa.minZ - fz, g.caixa.maxZ + fz]
  ];

  for (const [o, d, min, max] of eixos) {
    if (Math.abs(d) < EPS) {
      // Paralelo à fatia: ou está dentro dela pra sempre, ou nunca.
      if (o < min || o > max) return null;
      continue;
    }
    let t0 = (min - o) / d;
    let t1 = (max - o) / d;
    if (t0 > t1) { const troca = t0; t0 = t1; t1 = troca; }
    if (t0 > entra) entra = t0;
    if (t1 < sai) sai = t1;
    if (entra > sai) return null;
  }

  if (entra === -Infinity || sai === Infinity) return null;
  faixa.entra = entra;
  faixa.sai = sai;
  return faixa;
}

/**
 * Um raio qualquer contra a caixa girada. Devolve a distância até a entrada
 * (em unidades de `dx,dy,dz`), ou `null`.
 *
 * É o mesmo teste de fatias de cima, com o raio no lugar da vertical. A bala
 * precisa dele pelo mesmo motivo que o corpo: a caixa envolvente de uma parede
 * tombada para o tiro metros antes da chapa.
 */
export function raioNaCaixa(g, ox, oy, oz, dx, dy, dz, comFolga = false) {
  g.paraLocal(ox, oy, oz, origem);
  g.vetorParaLocal(dx, dy, dz, rumo);

  const fx = comFolga ? g.folga.x : 0;
  const fy = comFolga ? g.folga.y : 0;
  const fz = comFolga ? g.folga.z : 0;

  let entra = 0;
  let sai = Infinity;

  const eixos = [
    [origem.x, rumo.x, g.caixa.minX - fx, g.caixa.maxX + fx],
    [origem.y, rumo.y, g.caixa.minY - fy, g.caixa.maxY + fy],
    [origem.z, rumo.z, g.caixa.minZ - fz, g.caixa.maxZ + fz]
  ];

  for (const [o, d, min, max] of eixos) {
    if (Math.abs(d) < EPS) {
      if (o < min || o > max) return null;
      continue;
    }
    let t0 = (min - o) / d;
    let t1 = (max - o) / d;
    if (t0 > t1) { const troca = t0; t0 = t1; t1 = troca; }
    if (t0 > entra) entra = t0;
    if (t1 < sai) sai = t1;
    if (entra > sai) return null;
  }
  return entra;
}
