import { pontoDoSlot } from './formacao.js';
import { activePostFor } from '../game/teams.js';
import { densidadeFloresta } from '../world/densidade.js';

/**
 * Pelotões: quem anda com quem, e em que formação.
 *
 * Sem eles, trezentos bots são trezentas decisões independentes que por acaso
 * apontam pro mesmo lugar — e o resultado é uma multidão andando por cima de
 * si mesma até o objetivo. Com pelotão, a decisão de PRA ONDE IR é de um só
 * (o líder), e os outros ocupam um lugar em volta dele. É o que transforma
 * uma massa numa frente.
 *
 * O cérebro do pelotão é lento de propósito — duas vezes por segundo. Escolher
 * objetivo e formação é decisão de minutos, não de quadro, e sessenta vezes
 * por segundo seriam dezenas de milhares de decisões idênticas.
 *
 * Combate CANCELA a formação. Quem está trocando tiro não anda em cunha: ele
 * se move pela quina mais perto. A formação é o que fazer enquanto não há
 * briga, que é a maior parte do tempo de um mapa de dois quilômetros.
 */

const TAMANHO = 8;          // homens por pelotão
const PENSA_A_CADA = 0.5;   // segundos entre decisões do pelotão

/** Distância do objetivo em que o pelotão para de avançar e se planta. */
const CHEGOU = 26;

export function createPelotoes(mundo, { tamanho = TAMANHO } = {}) {
  const pelotoes = [];
  const porBot = new Map();
  const ponto = { x: 0, z: 0 };

  function criar(team) {
    const pelotao = {
      id: pelotoes.length + 1,
      team,
      membros: [],
      formacao: 'cunha',
      objetivo: null,
      rumo: 0
    };
    pelotoes.push(pelotao);
    return pelotao;
  }

  /**
   * Põe o bot num pelotão do time dele que ainda tenha vaga.
   *
   * Sem reorganizar quando alguém morre: o pelotão encolhe e continua. Remendar
   * a lista a cada baixa faria o soldado trocar de grupo no meio da briga, e o
   * lugar dele na formação mudaria embaixo dos pés.
   */
  function alistar(bot) {
    let pelotao = pelotoes.find(
      (p) => p.team === bot.team && p.membros.length < tamanho);
    if (!pelotao) pelotao = criar(bot.team);

    bot.slot = pelotao.membros.length;
    pelotao.membros.push(bot);
    porBot.set(bot, pelotao);
    return pelotao;
  }

  /** O primeiro vivo da lista. Morreu o líder, o próximo assume. */
  function liderDe(pelotao) {
    for (const membro of pelotao.membros) {
      if (membro.alive) return membro;
    }
    return null;
  }

  /**
   * Que formação cabe aqui.
   *
   * Cada regra é uma razão de campo, não um enfeite:
   *
   * - Em ESTRADA ou dentro de MATA FECHADA, coluna: a frente é estreita e o
   *   terreno já obriga a andar em fila. Cunha na mata é o pelotão inteiro
   *   entalado em tronco.
   * - Chegando no objetivo, quadrado: quem tomou o ponto olha pra fora, e é
   *   isso que faz atacar um posto dominado custar caro.
   * - No resto, cunha: fogo pra frente e pros dois flancos sem ninguém na
   *   linha de tiro de ninguém. É a formação de quem não sabe de onde vem.
   */
  function escolherFormacao(lider, distancia) {
    if (distancia < CHEGOU) return 'quadrado';
    if (mundo.terrain.estradaAt(lider.x, lider.z) > 0.4) return 'coluna';
    if (densidadeFloresta(lider.x, lider.z) >= 0.7) return 'coluna';
    return 'cunha';
  }

  let ateP = 0;
  function pensar(delta) {
    ateP -= delta;
    if (ateP > 0) return;
    ateP = PENSA_A_CADA;

    for (const pelotao of pelotoes) {
      const lider = liderDe(pelotao);
      if (!lider) continue;

      const post = activePostFor(mundo.outposts, pelotao.team);
      pelotao.objetivo = post;
      if (!post) continue;

      const dx = post.x - lider.x;
      const dz = post.z - lider.z;
      const distancia = Math.hypot(dx, dz);

      // O rumo da formação é pra onde o pelotão VAI, não pra onde o líder
      // está olhando. Ele vira a cabeça pra checar um barulho e a cunha
      // inteira giraria com ele.
      if (distancia > 1) pelotao.rumo = Math.atan2(dx, dz);
      pelotao.formacao = escolherFormacao(lider, distancia);
    }
  }

  /**
   * Onde este bot deveria estar, ou null.
   *
   * Null quando ele é o líder (o lugar dele é o objetivo), quando não há
   * pelotão, ou quando o pelotão perdeu o líder — aí cada um por si, que é
   * melhor que todo mundo parado esperando ordem que não vem.
   */
  function alvoDe(bot, saida) {
    const pelotao = porBot.get(bot);
    if (!pelotao) return null;
    const lider = liderDe(pelotao);
    if (!lider || lider === bot) return null;

    pontoDoSlot(pelotao.formacao, bot.slot, pelotao.membros.length,
      lider, pelotao.rumo, ponto);
    saida.x = ponto.x;
    saida.z = ponto.z;
    return saida;
  }

  return {
    pelotoes,
    alistar,
    pensar,
    alvoDe,
    de: (bot) => porBot.get(bot) ?? null,
    /** Quantos pelotões cada time tem. Pra depuração e pro teste. */
    contagem() {
      const por = {};
      for (const p of pelotoes) por[p.team] = (por[p.team] ?? 0) + 1;
      return por;
    }
  };
}
