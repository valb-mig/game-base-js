import * as THREE from 'three';
import { teamOf, postOwner } from '../game/teams.js';
import { headingDegrees } from '../player/heading.js';
import { worldToMap, mapToWorld } from '../world/minimap.js';
import { topografiaDe } from '../world/topografia.js';
import { desenharPosto, progressoDePosto } from './simbolos.js';
import { todas as marcacoes } from './marcacoes.js';

/**
 * O desenho do mapa que o soldado abre na mão.
 *
 * Ele não é uma tela: é uma textura. Quem o segura é `items/mapamao.js` e quem
 * decide quando ele aparece é o laço — aqui só se desenha, num canvas que não
 * está no documento. Isso é o que permite o mesmo desenho servir a um papel em
 * 3D hoje e a qualquer outra superfície depois, sem mexer numa linha de HUD.
 *
 * O que ele conta, e nada além disso: a altitude em cinco níveis, os pontos de
 * captura COM NOME e com quanto já andou a tomada, a tropa que o time enxerga
 * — a própria e o que a sinalização entregou do inimigo —, as marcações, e pra
 * onde o jogador está virado DE FATO. A rosa dos ventos fica no canto de
 * baixo, à direita.
 */

const PAPEL = '#e6dcbd';
const TINTA = '#3a3226';
const TINTA_FRACA = 'rgba(58, 50, 38, 0.34)';
const MARCACAO = '#c8892a';

/** Metros entre linhas da grade. Sem escala, dois quilômetros não dizem nada. */
const GRADE = 200;

export function criarMapaDesenho({
  terrain, world, player, bots = null, deteccao = null, lado = 768
}) {
  const canvas = document.createElement('canvas');
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext('2d');
  const topo = topografiaDe(terrain);

  // rascunho de `headingDegrees`, que roda uma vez por desenho
  const olhar = new THREE.Vector3();

  /** Mundo -> pixel do papel. */
  function paraTela(x, z) {
    const { u, v } = worldToMap(x, z);
    return { x: u * lado, y: v * lado };
  }

  /** O inverso, pra saber onde o dedo do jogador caiu no papel. */
  function mundoDe(u, v) {
    return mapToWorld(u, v);
  }

  function desenharGrade() {
    // O passo em pixels sai da MESMA conversão do resto: duas contas sobre
    // quantos metros cabem no papel se separariam no primeiro ajuste do mundo.
    const zero = paraTela(0, 0);
    const um = paraTela(GRADE, GRADE);
    const passoX = um.x - zero.x;
    const passoY = um.y - zero.y;

    ctx.strokeStyle = TINTA_FRACA;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = zero.x % passoX; x < lado; x += passoX) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, lado);
    }
    for (let y = zero.y % passoY; y < lado; y += passoY) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(lado, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }

  /**
   * O ponto de captura com NOME e com quanto já andou.
   *
   * O símbolo é o mesmo das outras três telas (`ui/simbolos.js`) — o disco no
   * tom de quem manda e o anel de progresso. O que este mapa acrescenta é o
   * nome do lugar: numa tela de deploy o jogador tem a lista ao lado, aqui ele
   * tem só o papel, e "o 3" não diz nada pra quem ainda não decorou os seis.
   */
  function desenharPontoDeCaptura(posto, tempo) {
    const p = paraTela(posto.x, posto.z);
    desenharPosto(ctx, p.x, p.y, posto, { raio: 15, tempo });

    const { fracao, emDisputa } = progressoDePosto(posto);
    const dono = postOwner(posto);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const nome = (posto.name ?? '').toUpperCase();
    ctx.font = 'bold 14px ui-monospace, monospace';
    // Halo do papel por baixo: sobre a curva de nível escura, letra fina some.
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(230, 220, 189, 0.9)';
    ctx.strokeText(nome, p.x, p.y + 19);
    ctx.fillStyle = TINTA;
    ctx.fillText(nome, p.x, p.y + 19);

    if (emDisputa && fracao > 0.001) {
      const texto = `${Math.round(fracao * 100)}%`;
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.strokeText(texto, p.x, p.y + 35);
      ctx.fillStyle = dono ? teamOf(dono).css : TINTA;
      ctx.fillText(texto, p.x, p.y + 35);
    }
  }

  /** Um soldado no papel. Cheio é contato à vista; vazado é memória. */
  function marcarTropa(x, z, css, { fresco = true, raio = 4.5 } = {}) {
    const p = paraTela(x, z);
    ctx.beginPath();
    ctx.arc(p.x, p.y, raio, 0, Math.PI * 2);
    if (fresco) {
      ctx.fillStyle = css;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(28, 24, 18, 0.8)';
      ctx.stroke();
    } else {
      // Vazado, e não translúcido: contato velho continua sendo um lugar
      // exato onde alguém estava, e apagar a cor apagaria de que time era.
      ctx.fillStyle = 'rgba(230, 220, 189, 0.75)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = css;
      ctx.stroke();
    }
  }

  function desenharTropa() {
    for (const bot of bots?.soldiers ?? []) {
      if (!bot.alive || bot.team !== player.team) continue;
      marcarTropa(bot.x, bot.z, teamOf(bot.team).css, { raio: 4 });
    }

    // O inimigo só entra pelo que o time VIU. É a mesma regra do radar: o
    // mapa não conta o que o jogo quer que se descubra olhando.
    for (const contato of deteccao?.lista(player.team) ?? []) {
      marcarTropa(contato.x, contato.z, teamOf(contato.time).css,
        { fresco: contato.fresco, raio: 5 });
    }
  }

  function desenharMarcacoes() {
    marcacoes().forEach((marca, i) => {
      const p = paraTela(marca.x, marca.z);
      const r = 9;
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
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = TINTA;
      ctx.stroke();
      ctx.fillStyle = '#20180c';
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), 0, 0.5);
      ctx.restore();
    });
  }

  /**
   * O jogador, apontando pra onde ele OLHA de verdade.
   *
   * O rumo sai de `headingDegrees`, a MESMA função do radar e da bússola, e
   * não de uma conta local. A versão à mão que estava aqui — herdada do mapa
   * de tela — fazia `atan2(-m[8], -m[10])` e girava por `-rumo`, e isso é
   * exatamente 180° errado em TODO rumo: com o jogador olhando pro norte a
   * seta apontava pro sul. Girar por `+rumo` é o que casa com o canvas, que
   * tem o Y pra baixo: a seta é desenhada apontando pra `-y`, e girada de
   * `rumo` ela vai parar em `(sen rumo, −cos rumo)`, que é `(fx, fz)`.
   *
   * Duas contas sobre "pra onde ele está virado" se separam no primeiro
   * ajuste, e esta já tinha se separado antes de alguém olhar.
   */
  function desenharJogador() {
    const pos = player.object.position;
    const p = paraTela(pos.x, pos.z);
    const rumo = headingDegrees(player.object.quaternion, olhar) * Math.PI / 180;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(rumo);

    // O cone do olhar: a seta diz o rumo, o cone diz o campo. Num mapa de dois
    // quilômetros saber pra onde se está virado é metade da orientação.
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 34, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62);
    ctx.closePath();
    ctx.fillStyle = 'rgba(240, 236, 220, 0.28)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 9);
    ctx.lineTo(0, 5);
    ctx.lineTo(-7, 9);
    ctx.closePath();
    ctx.fillStyle = '#f4f0e2';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = TINTA;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Rosa dos ventos, canto de baixo à direita.
   *
   * Ela NÃO gira: o papel é desenhado com o norte pra cima e a rosa é a prova
   * disso. Quem gira é a seta do jogador — mesma divisão de trabalho do radar,
   * ao contrário.
   */
  function desenharRosa() {
    const r = lado * 0.058;
    const cx = lado - r - lado * 0.045;
    const cy = lado - r - lado * 0.045;

    ctx.save();
    ctx.translate(cx, cy);

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(230, 220, 189, 0.86)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = TINTA;
    ctx.stroke();

    // Agulha: a metade norte cheia, a sul vazada — é assim que se lê de
    // relance qual ponta é qual.
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.78);
    ctx.lineTo(r * 0.22, 0);
    ctx.lineTo(-r * 0.22, 0);
    ctx.closePath();
    ctx.fillStyle = '#8c2f22';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, r * 0.78);
    ctx.lineTo(r * 0.22, 0);
    ctx.lineTo(-r * 0.22, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(230, 220, 189, 0.9)';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = TINTA;
    ctx.stroke();

    ctx.fillStyle = TINTA;
    ctx.font = `bold ${Math.round(r * 0.42)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, -r * 0.86);
    ctx.fillText('S', 0, r * 0.88);
    ctx.fillText('L', r * 0.86, 0);
    ctx.fillText('O', -r * 0.86, 0);
    ctx.restore();
  }

  /**
   * `tempo` é o relógio do pulso do anel de disputa, em milissegundos. A idade
   * do contato inimigo NÃO vem daqui: ela é do relógio de `game/deteccao.js`,
   * que anda pelo delta do quadro. Misturar os dois faria o contato apagar mil
   * vezes mais rápido, e sob tempo virtual nunca apagar.
   */
  function desenhar(tempo = 0) {
    ctx.fillStyle = PAPEL;
    ctx.fillRect(0, 0, lado, lado);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(topo, 0, 0, lado, lado);

    desenharGrade();

    for (const posto of world.outposts ?? []) desenharPontoDeCaptura(posto, tempo);
    desenharTropa();
    desenharMarcacoes();
    if (player.alive && !player.spectating) desenharJogador();
    desenharRosa();

    // Vinco e borda do papel: o mapa acaba em algum lugar, e sem a moldura ele
    // parece uma tela recortada em vez de uma folha.
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(90, 76, 52, 0.55)';
    ctx.strokeRect(3, 3, lado - 6, lado - 6);
  }

  return { canvas, desenhar, paraTela, mundoDe, lado };
}
