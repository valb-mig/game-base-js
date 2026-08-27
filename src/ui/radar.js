import * as THREE from 'three';
import { teamOf, postOwner, postContested } from '../game/teams.js';
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
 * Norte pra cima, e quem gira é a seta. Radar que roda junto com a cabeça
 * obriga a reorientar a leitura a cada passo, e o valor de olhar o canto é
 * justamente ter uma referência que não se mexe — é a bússola que já conta
 * pra onde ele está virado.
 *
 * O que aparece: o terreno, os postos com o dono de agora, o jogador e os
 * COMPANHEIROS. Inimigo não entra. Um radar que mostra quem está atrás do
 * morro apaga o flanqueamento, a cobertura e a emboscada — ou seja, apaga o
 * jogo. Quem quiser saber onde o inimigo está tem que olhar.
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

export function initRadar(player, camera, world, bots = null) {
  const canvas = document.getElementById('radar');
  const coords = document.getElementById('coords');
  if (!canvas) return { update() {} };

  const ctx = canvas.getContext('2d');
  const island = islandFor(world.terrain);
  const olhar = new THREE.Vector3();

  let width = 0;
  let height = 0;

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

  /** Mundo -> pixel do radar, com o jogador no centro. */
  function paraTela(x, z, cx, cz) {
    return {
      x: width / 2 + (x - cx) / ALCANCE * width,
      y: height / 2 + (z - cz) / ALCANCE * height
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

  function update() {
    if ((!width || width !== canvas.clientWidth) && !measure()) return;

    const pos = player.object.position;
    ctx.clearRect(0, 0, width, height);

    // O recorte da ilha em volta do jogador. `worldToMap` é a mesma conversão
    // que o mapa tático usa — duas contas sobre onde fica cada coisa se
    // separariam no primeiro ajuste do tamanho do mundo.
    const centro = worldToMap(pos.x, pos.z);
    const fracao = worldToMap(pos.x + ALCANCE / 2, pos.z + ALCANCE / 2);
    const meia = (fracao.u - centro.u) * island.width;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      island,
      centro.u * island.width - meia, centro.v * island.height - meia,
      meia * 2, meia * 2,
      0, 0, width, height
    );

    // O relógio do pulso do anel de disputa. Lido uma vez por quadro: seis
    // postos pedindo a hora dariam seis valores um tiquinho diferentes, e os
    // anéis piscariam fora de sincronia.
    const agora = typeof performance !== 'undefined' ? performance.now() : 0;

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
        tempo: agora
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

    // Companheiros, e só eles. Ver o inimigo no canto da tela apagaria o
    // flanqueamento e a emboscada — o radar diria o que o jogo quer que se
    // descubra olhando.
    for (const bot of bots?.soldiers ?? []) {
      if (!bot.alive || bot.team !== player.team) continue;
      const p = paraTela(bot.x, bot.z, pos.x, pos.z);
      if (!dentro(p)) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = teamOf(player.team).css;
      ctx.fill();
    }

    // O jogador é uma seta, e é ela que gira: o mapa fica com o norte pra
    // cima. O rumo sai de `headingDegrees`, nunca de `camera.rotation.y` —
    // olhando pra trás ele lê 0° em vez de 180°.
    const rumo = headingDegrees(camera.quaternion, olhar);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(rumo * Math.PI / 180);
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
