import * as THREE from 'three';
import { teamOf, postOwner } from '../game/teams.js';
import { islandFor, worldToMap } from '../world/minimap.js';
import { headingDegrees } from '../player/heading.js';
import { todas as marcacoes } from './marcacoes.js';
import { desenharPosto as desenharPostoNoMapa } from './simbolos.js';

/**
 * Radar do canto: um pedaço da ilha em volta do jogador, e as coordenadas
 * embaixo.
 *
 * Ele NÃO é uma imagem à parte. É a mesma ilha do mapa tático, recortada em
 * volta do jogador — mexer no relevo muda os dois juntos, que é a razão de o
 * mapa sair do campo de altura desde o começo.
 *
 * O RADAR GIRA COM O JOGADOR: o que está na frente dele está em cima. A versão
 * anterior era norte pra cima com a seta girando, e a razão declarada era boa
 * — referência fixa, sem reorientar a leitura a cada passo. A troca é
 * deliberada e tem um preço conhecido: o norte deixa de ser o topo do quadro, e
 * quem quiser rumo absoluto lê a bússola, que continua sendo a dona dessa
 * pergunta. O que se ganha é a leitura direta de "aquilo está à minha
 * esquerda" sem traduzir ângulo nenhum, que é a pergunta que se faz com o
 * inimigo já em contato. O MAPA na mão continua com o norte pra cima, e é lá
 * que mora a rosa dos ventos.
 *
 * O que aparece: o terreno, os postos com o dono de agora, o jogador, os
 * COMPANHEIROS e — só isto é novo — o inimigo SINALIZADO. Nada de onisciência:
 * o contato só entra se alguém do time o viu de fato, e some trinta segundos
 * depois de ninguém mais estar vendo. Ver `game/deteccao.js`.
 */

/**
 * Metros de ponta a ponta da janela do radar.
 *
 * Medido no mapa de verdade: do desembarque de Vestria, o posto mais próximo
 * está a 711 m e os outros passam de mil. Com a janela de 500 m que eu tinha
 * posto primeiro, o radar NUNCA mostrava um objetivo — só capim e a seta do
 * jogador. Alargar até caber tudo transformaria a ilha inteira num selo de
 * 158 px; a saída é a janela continuar apertada, mostrando o terreno em volta
 * com detalhe, e o que está fora ser marcado na BORDA, com a direção certa.
 */
const ALCANCE = 700;

const MARCA = 3.5;
const INK = '#e2dac2';
// Amarelo de estêncil: a única cor do radar que não é de time, e por isso
// não se confunde com posto nem com companheiro.
const MARCACAO = '#f2c14e';
// O que está além da borda do mundo. Ver `desenharTerreno`.
const FORA_DO_MAPA = '#171c18';

/**
 * Quanto o recorte da ilha cresce pra sobreviver ao giro.
 *
 * Girando um quadrado em torno do centro, o canto varre um círculo de raio
 * meia-diagonal: sem puxar √2 do terreno em volta, as quinas do radar ficariam
 * VAZIAS em todo rumo que não fosse múltiplo de 90°. É o mesmo motivo de o
 * anel do horizonte ser mais largo que a névoa.
 */
const DIAGONAL = Math.SQRT2;

export function initRadar(player, camera, world, bots = null, deteccao = null) {
  const canvas = document.getElementById('radar');
  const coords = document.getElementById('coords');
  if (!canvas) return { update() {} };

  const ctx = canvas.getContext('2d');
  const island = islandFor(world.terrain);
  const olhar = new THREE.Vector3();

  let width = 0;
  let height = 0;
  let cos = 1;
  let sin = 0;

  /**
   * Nada de medir uma vez só: o HUD nasce oculto esperando o desembarque, e
   * quem mede na inicialização fica 0x0 pra sempre. Foi assim que a bússola
   * existiu sem nunca desenhar.
   */
  function measure() {
    const ratio = Math.min(devicePixelRatio, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    if (!width || !height) return false;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return true;
  }

  /**
   * Mundo -> pixel do radar, com o jogador no centro e o rumo dele PRA CIMA.
   *
   * O giro entra aqui e não num `ctx.rotate` em volta de tudo por uma razão
   * prática: girando o contexto, o SÍMBOLO gira junto — o número do posto
   * sairia de cabeça pra baixo sempre que o jogador olhasse pro sul. A imagem
   * do terreno pode girar (ela não tem lado certo), o resto não.
   */
  function paraTela(x, z, cx, cz) {
    const dx = x - cx;
    const dz = z - cz;
    return {
      x: width / 2 + (dx * cos - dz * sin) / ALCANCE * width,
      y: height / 2 + (dx * sin + dz * cos) / ALCANCE * height
    };
  }

  function dentro(p) {
    return p.x >= MARCA && p.x <= width - MARCA && p.y >= MARCA && p.y <= height - MARCA;
  }

  /**
   * Puxa um ponto de fora da janela até encostar na borda, mantendo a
   * direção. É o rumo que importa: a distância exata de um objetivo a mais de
   * um quilômetro não cabe num quadrado de 158 px, e a direção cabe.
   */
  function grudarNaBorda(p) {
    const dx = p.x - width / 2;
    const dy = p.y - height / 2;
    const limiteX = width / 2 - MARCA;
    const limiteY = height / 2 - MARCA;
    // A maior das duas razões diz qual borda o raio cruza primeiro.
    const escala = Math.max(Math.abs(dx) / limiteX, Math.abs(dy) / limiteY);
    if (escala <= 1) return;
    p.x = width / 2 + dx / escala;
    p.y = height / 2 + dy / escala;
  }

  /** O recorte da ilha, girado pro rumo do jogador ficar em cima. */
  function desenharTerreno(pos, rumoRad) {
    // `worldToMap` é a mesma conversão que o mapa tático usa — duas contas
    // sobre onde fica cada coisa se separariam no primeiro ajuste do tamanho
    // do mundo.
    const centro = worldToMap(pos.x, pos.z);
    const fracao = worldToMap(pos.x + ALCANCE / 2, pos.z + ALCANCE / 2);
    const meia = (fracao.u - centro.u) * island.width * DIAGONAL;

    /**
     * Fora do mapa é PINTADO, não deixado transparente.
     *
     * Com o radar girando, o recorte √2 maior passa da borda do mundo em
     * qualquer rumo diagonal, e ali `drawImage` não escreve pixel nenhum — o
     * que aparecia era o fundo do HUD, uma faixa cinza clara que lia como
     * buraco na tela. Um tom escuro no lugar diz o que aquilo é: terra que o
     * mapa não cobre.
     */
    ctx.fillStyle = FORA_DO_MAPA;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // O clipe é o que impede o recorte ampliado de vazar por cima do resto do
    // HUD: ele é √2 maior que a janela de propósito.
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();

    ctx.translate(width / 2, height / 2);
    ctx.rotate(-rumoRad);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      island,
      centro.u * island.width - meia, centro.v * island.height - meia,
      meia * 2, meia * 2,
      -width * DIAGONAL / 2, -height * DIAGONAL / 2,
      width * DIAGONAL, height * DIAGONAL
    );
    ctx.restore();
  }

  /** Uma bolinha de tropa. Cheia é contato à vista; vazada é memória. */
  function marcarTropa(p, css, { fresco = true, raio = 2 } = {}) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, raio, 0, Math.PI * 2);
    if (fresco) {
      ctx.fillStyle = css;
      ctx.fill();
      return;
    }
    // Vazado: o contato velho é um lugar onde alguém ESTAVA, e apagar a cor
    // apagaria de que time era — que é a informação que ainda vale.
    ctx.fillStyle = 'rgba(18, 22, 18, 0.55)';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = css;
    ctx.stroke();
  }

  function update() {
    if ((!width || width !== canvas.clientWidth) && !measure()) return;

    const pos = player.object.position;
    ctx.clearRect(0, 0, width, height);

    // O rumo sai de `headingDegrees`, nunca de `camera.rotation.y` — olhando
    // pra trás ele lê 0° em vez de 180°. É o primeiro invariante desta base, e
    // agora ele decide o quadro INTEIRO e não só uma setinha.
    const rumo = headingDegrees(camera.quaternion, olhar);
    const rumoRad = rumo * Math.PI / 180;
    cos = Math.cos(-rumoRad);
    sin = Math.sin(-rumoRad);

    desenharTerreno(pos, rumoRad);

    // O relógio do pulso do anel de disputa. Lido uma vez por quadro: seis
    // postos pedindo a hora dariam seis valores um tiquinho diferentes, e os
    // anéis piscariam fora de sincronia.
    const tempo = typeof performance !== 'undefined' ? performance.now() : 0;

    // Postos: disco com a cor de quem manda AGORA e anel de progresso no que
    // está sendo tomado. Mesma leitura do mapa tático, de propósito — e agora
    // do mesmo desenho, não de dois parecidos.
    //
    // O que está fora da janela não some: encosta na borda, na direção certa.
    // Posto que desaparece do radar deixa o jogador sem saber pra que lado
    // fica o objetivo — que é a única pergunta que ele faz ao canto da tela.
    for (const posto of world.outposts ?? []) {
      const p = paraTela(posto.x, posto.z, pos.x, pos.z);
      const dono = postOwner(posto);
      const fora = !dentro(p);
      if (fora) grudarNaBorda(p);

      // O MESMO símbolo do mapa grande, só menor. Antes era um losango aqui e
      // um círculo lá, e o comentário acima já prometia "mesma leitura" — a
      // promessa agora sai de uma função só.
      desenharPostoNoMapa(ctx, p.x, p.y, posto, {
        raio: fora ? MARCA * 0.8 : MARCA * 1.15,
        dono,
        tempo
      });
    }

    /**
     * As marcações do jogador, em losango amarelo com o número dentro.
     *
     * Elas encostam na borda como os postos: marca que some do radar deixa de
     * ser plano e vira lembrança. O plano só existe enquanto se sabe pra que
     * lado ele fica — é essa a razão de o radar existir.
     */
    marcacoes().forEach((marca, i) => {
      const p = paraTela(marca.x, marca.z, pos.x, pos.z);
      const fora = !dentro(p);
      if (fora) grudarNaBorda(p);

      const r = fora ? 4 : 5.5;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.78, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.78, 0);
      ctx.closePath();
      ctx.fillStyle = MARCACAO;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = INK;
      ctx.stroke();

      if (!fora) {
        ctx.fillStyle = '#1a1e19';
        ctx.font = 'bold 7px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), 0, 0.5);
      }
      ctx.restore();
    });

    // Companheiros. Eles aparecem sempre: o time sabe onde o próprio time
    // está, e é isso que faz o radar servir pra não atirar nas costas de
    // ninguém.
    for (const bot of bots?.soldiers ?? []) {
      if (!bot.alive || bot.team !== player.team) continue;
      const p = paraTela(bot.x, bot.z, pos.x, pos.z);
      if (!dentro(p)) continue;
      marcarTropa(p, teamOf(player.team).css);
    }

    /**
     * O inimigo SINALIZADO, e só ele.
     *
     * Isto é o oposto de mostrar tudo: o contato só existe porque alguém do
     * time o viu com os próprios olhos, e a marca envelhece — cheia enquanto
     * está sendo visto, vazada depois, e apagada em trinta segundos. Quem
     * correr atrás de uma bolinha vazada chega onde ele ESTAVA, e é isso que
     * mantém o flanqueamento valendo alguma coisa.
     *
     * Ela NÃO encosta na borda como o posto: um contato fora da janela viraria
     * uma promessa de rumo que a distância não sustenta, e num radar de 700 m
     * "tem inimigo pra lá, em algum lugar" é ruído.
     */
    for (const contato of deteccao?.lista(player.team) ?? []) {
      const p = paraTela(contato.x, contato.z, pos.x, pos.z);
      if (!dentro(p)) continue;
      marcarTropa(p, teamOf(contato.time).css,
        { fresco: contato.fresco, raio: 2.6 });
    }

    /**
     * O jogador é uma seta, e ela NÃO gira mais: quem gira é o mundo em volta.
     * A ponta dela é o topo do quadro, e o topo do quadro é pra onde ele está
     * olhando.
     */
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.restore();

    if (coords) {
      coords.textContent =
        `X ${Math.round(pos.x)}  Z ${Math.round(pos.z)}  ALT ${Math.round(player.eyeY)}`;
    }
  }

  return { update };
}
