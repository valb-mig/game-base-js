import { PLAYER } from '../config.js';

/**
 * A lista de colisores com índice espacial.
 *
 * Medido antes de existir: varrer a lista inteira custa 1,05 ms por quadro
 * com mil colisores e 5,12 ms com quatro mil — linear, e são umas 40
 * varreduras por quadro entre o jogador e os nove bots. Com os ~2000
 * colisores que o mapa já tinha, a colisão sozinha comia 13% do orçamento a
 * 60 fps, e qualquer árvore ou casa a mais saía desse mesmo bolso.
 *
 * Com célula de 32 m sobram uns poucos colisores por célula, e uma consulta
 * olha UMA célula: os colisores são inseridos em todas as células que a caixa
 * toca, então o ponto consultado não pode estar em duas.
 *
 * Ela não é um Array: é uma coleção que sabe `push`, iterar e responder
 * `perto`. Os poucos métodos de array que o resto usa estão delegados. Quem
 * recebe um Array simples continua funcionando — `collides` e companhia
 * testam se há `perto` e caem no laço linear quando não há, que é o caso de
 * todo dublê de teste.
 */

const CELULA = 32;

/**
 * Folga na inserção, em metros.
 *
 * A consulta é um PONTO, mas `overlapsXZ` infla a caixa em `PLAYER.RADIUS`
 * antes de testar — o jogador é um cilindro. Sem essa mesma folga na
 * inserção, um colisor encostado na divisa da célula seria achado pelo laço
 * linear e perdido pelo índice, e o jogador atravessaria a parede em faixas
 * de meio metro espalhadas pelo mapa.
 */
const MARGEM = PLAYER.RADIUS + 0.6;

/**
 * Acima disto o colisor não entra na grade.
 *
 * Uma laje muito grande cairia em centenas de células, e o custo de mantê-la
 * indexada passa o de simplesmente testá-la sempre. São pouquíssimos — o
 * tabuleiro das pontes e não muito mais.
 */
const MAX_CELULAS = 80;

function chave(cx, cz) {
  return (cx + 512) * 1024 + (cz + 512);
}

export class ListaDeColisores {
  constructor() {
    this.itens = [];
    this.grade = new Map();
    this.grandes = [];
    this.celulasDe = new Map();
  }

  get length() {
    return this.itens.length;
  }

  [Symbol.iterator]() {
    return this.itens[Symbol.iterator]();
  }

  filter(fn) { return this.itens.filter(fn); }
  map(fn) { return this.itens.map(fn); }
  some(fn) { return this.itens.some(fn); }

  push(...novos) {
    for (const colisor of novos) {
      this.itens.push(colisor);
      this.indexar(colisor);
    }
    return this.itens.length;
  }

  /** As chaves de célula que a caixa toca, ou null se ela é grande demais. */
  celulas(box) {
    const cx0 = Math.floor((box.min.x - MARGEM) / CELULA);
    const cx1 = Math.floor((box.max.x + MARGEM) / CELULA);
    const cz0 = Math.floor((box.min.z - MARGEM) / CELULA);
    const cz1 = Math.floor((box.max.z + MARGEM) / CELULA);
    if ((cx1 - cx0 + 1) * (cz1 - cz0 + 1) > MAX_CELULAS) return null;

    const saida = [];
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) saida.push(chave(cx, cz));
    }
    return saida;
  }

  indexar(colisor) {
    const chaves = this.celulas(colisor.box);
    if (!chaves) {
      this.grandes.push(colisor);
      this.celulasDe.set(colisor, null);
      return;
    }
    for (const k of chaves) {
      let celula = this.grade.get(k);
      if (!celula) {
        celula = [];
        this.grade.set(k, celula);
      }
      celula.push(colisor);
    }
    this.celulasDe.set(colisor, chaves);
  }

  /**
   * O colisor mudou de lugar — tira das células velhas e põe nas novas.
   *
   * Prop que perde o chão desaba e TOMBA, e a caixa dele pode andar dezenas
   * de metros. Sem esta chamada o índice continuaria apontando pro lugar onde
   * a árvore estava de pé: ela barraria o jogador no ar e ele atravessaria o
   * tronco caído. Quem move a caixa avisa.
   */
  moveu(colisor) {
    const antigas = this.celulasDe.get(colisor);
    if (antigas === undefined) return;

    /**
     * Não mexeu de célula, não mexeu no índice.
     *
     * O colisor de um bot é reescrito TODO QUADRO, e são trezentos deles:
     * tirar e repor cada um em cada quadro seria `indexOf` mais `splice` por
     * célula, seiscentas vezes por segundo. Andando um metro, quase sempre a
     * resposta é "as mesmas células" — e aí não há nada a fazer.
     */
    const novas = this.celulas(colisor.box);
    if (antigas === null ? novas === null : (novas && novas.length === antigas.length
      && novas.every((k, i) => k === antigas[i]))) {
      return;
    }

    if (antigas === null) {
      const i = this.grandes.indexOf(colisor);
      if (i >= 0) this.grandes.splice(i, 1);
    } else {
      for (const k of antigas) {
        const celula = this.grade.get(k);
        if (!celula) continue;
        const i = celula.indexOf(colisor);
        if (i >= 0) celula.splice(i, 1);
      }
    }
    this.indexar(colisor);
  }

  /**
   * Os colisores dentro de `raio` de (x, z), em `saida` (reaproveitado).
   *
   * `perto` responde por um PONTO; quem procura quina pra se esconder precisa
   * de uma vizinhança. Sem isto, `acharCobertura` varria os 5505 colisores do
   * mapa por bot por quadro — com 300 bots são 1,6 milhão de caixas visitadas
   * pra achar uma esquina a catorze metros.
   *
   * Um colisor grande pode cair em mais de uma célula do trecho varrido, então
   * ele entra repetido; quem consome procura o mais perto e não se importa.
   */
  emVolta(x, z, raio, saida) {
    saida.length = 0;
    const c0 = Math.floor((x - raio) / CELULA);
    const c1 = Math.floor((x + raio) / CELULA);
    const z0 = Math.floor((z - raio) / CELULA);
    const z1 = Math.floor((z + raio) / CELULA);

    for (let cx = c0; cx <= c1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const celula = this.grade.get(chave(cx, cz));
        if (celula) saida.push(...celula);
      }
    }
    if (this.grandes.length) saida.push(...this.grandes);
    return saida;
  }

  /**
   * Os colisores ao longo do trecho (ax, az) -> (bx, bz), em `saida`.
   *
   * É a consulta que a BALA faz, e a que o olho do bot faz pra saber se há
   * parede no caminho. Sem ela, `wallHit` percorria a lista inteira: medido
   * num tiroteio de 300 bots, 747 balas no ar vezes 5505 colisores dão 4,1
   * milhões de testes raio-caixa por quadro, e o quadro ia a 258 ms.
   *
   * É um DDA de grade — anda de fronteira em fronteira e visita EXATAMENTE
   * as células que o trecho cruza, cada uma uma vez. A primeira versão
   * amostrava o trecho em passos e pegava as oito vizinhas de cada amostra
   * pra não perder nada: nove vezes mais células, com busca linear pra
   * desduplicar. Vizinha não é necessária — a inserção já registra o colisor
   * em TODAS as células que a caixa inflada toca, então um raio que passa
   * pela célula C só pode acertar caixa registrada em C.
   */
  aoLongoDe(ax, az, bx, bz, saida) {
    saida.length = 0;

    let cx = Math.floor(ax / CELULA);
    let cz = Math.floor(az / CELULA);
    const fimX = Math.floor(bx / CELULA);
    const fimZ = Math.floor(bz / CELULA);

    const dx = bx - ax;
    const dz = bz - az;
    const passoX = dx > 0 ? 1 : -1;
    const passoZ = dz > 0 ? 1 : -1;

    // Quanto de `t` (0..1 ao longo do trecho) custa cruzar uma célula inteira,
    // e quanto falta pra próxima fronteira. Eixo sem movimento nunca cruza.
    const porCelulaX = dx === 0 ? Infinity : Math.abs(CELULA / dx);
    const porCelulaZ = dz === 0 ? Infinity : Math.abs(CELULA / dz);
    let proximoX = dx === 0 ? Infinity
      : ((dx > 0 ? (cx + 1) * CELULA - ax : ax - cx * CELULA) / Math.abs(dx));
    let proximoZ = dz === 0 ? Infinity
      : ((dz > 0 ? (cz + 1) * CELULA - az : az - cz * CELULA) / Math.abs(dz));

    // Teto de células: trecho degenerado ou número inválido não pode virar
    // laço infinito no meio de um tiroteio.
    for (let i = 0; i < 512; i++) {
      const celula = this.grade.get(chave(cx, cz));
      if (celula) {
        // `push(...celula)` aloca a lista de argumentos, e isto roda centenas
        // de vezes por quadro.
        for (let k = 0; k < celula.length; k++) saida.push(celula[k]);
      }
      if (cx === fimX && cz === fimZ) break;

      if (proximoX < proximoZ) {
        cx += passoX;
        proximoX += porCelulaX;
      } else {
        cz += passoZ;
        proximoZ += porCelulaZ;
      }
      if (proximoX > 1 && proximoZ > 1) break;
    }

    for (let k = 0; k < this.grandes.length; k++) saida.push(this.grandes[k]);
    return saida;
  }

  /** Os colisores que podem cobrir (x, z). */
  perto(x, z) {
    const celula = this.grade.get(
      chave(Math.floor(x / CELULA), Math.floor(z / CELULA)));
    if (!celula) return this.grandes;
    if (this.grandes.length === 0) return celula;
    return celula.concat(this.grandes);
  }
}
