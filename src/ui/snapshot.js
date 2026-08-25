import * as THREE from 'three';
import { consumePress } from '../core/input.js';

/**
 * P tira uma foto do jogo, com o estado escrito nela.
 *
 * Ela existe pra virar contexto: mandar a imagem já com posição, direção do
 * olhar e postura queimadas embaixo evita a pergunta seguinte, que é sempre
 * "onde você estava?". Pra bug de colisão isso é metade do relatório.
 *
 * O momento da captura NÃO é livre: `preserveDrawingBuffer` é false, então o
 * conteúdo do canvas só existe entre o `render` e o fim do quadro. Chamar
 * `toDataURL` em qualquer outro lugar devolve uma imagem preta — é a mesma
 * pegadinha das páginas de captura, que precisam de laço de render.
 */

const MARGEM = 10;

export function initSnapshot(renderer, player, extras = {}) {
  const { world = null, bots = null, capture = null } = extras;
  const folha = document.createElement('canvas');
  const ctx = folha.getContext('2d');

  let pedido = false;
  let ultima = null;
  const olhar = new THREE.Vector3();

  /** As linhas que vão queimadas na imagem. */
  function legenda() {
    const p = player.object.position;
    player.object.getWorldDirection(olhar);

    const linhas = [
      `x ${p.x.toFixed(1)}  z ${p.z.toFixed(1)}  pés ${player.feetY.toFixed(2)}`,
      `olhar ${olhar.x.toFixed(2)} ${olhar.y.toFixed(2)} ${olhar.z.toFixed(2)}`,
      `${player.stance} · ${player.onGround ? 'no chão' : 'no ar'}` +
        ` · ${player.speed.toFixed(1)} m/s · vida ${Math.round(player.health)}`,
      `${player.equipped?.name ?? 'mão vazia'} · time ${player.team}`
    ];

    if (bots) {
      const vivos = bots.aliveByTeam?.() ?? {};
      linhas.push(`bots de pé ${JSON.stringify(vivos)}`);
    }
    if (world) linhas.push(`colisores ${world.colliders.length}`);
    return linhas;
  }

  function escrever(largura, altura) {
    const linhas = legenda();
    const alturaLinha = 17;
    const caixa = linhas.length * alturaLinha + MARGEM * 2;

    ctx.fillStyle = 'rgba(8, 10, 8, 0.72)';
    ctx.fillRect(0, altura - caixa, largura, caixa);
    ctx.fillStyle = '#dfe8d4';
    ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'top';

    linhas.forEach((linha, i) => {
      ctx.fillText(linha, MARGEM, altura - caixa + MARGEM + i * alturaLinha);
    });
  }

  /** Nome do arquivo com a posição dentro: dá pra achar o lugar sem abrir. */
  function nome() {
    const p = player.object.position;
    const agora = new Date().toISOString().slice(11, 19).replace(/:/g, '');
    return `bf45-${agora}-x${Math.round(p.x)}z${Math.round(p.z)}.png`;
  }

  return {
    /** Lê a tecla. Roda cedo no quadro, junto com o resto da entrada. */
    poll() {
      if (consumePress('KeyP')) pedido = true;
    },

    /**
     * Grava, se pedido. Tem que ser chamada DEPOIS do render e antes do fim
     * do quadro — é a única janela em que o canvas tem conteúdo.
     */
    afterRender() {
      if (!pedido) return null;
      pedido = false;

      const tela = renderer.domElement;
      folha.width = tela.width;
      folha.height = tela.height;
      ctx.drawImage(tela, 0, 0);
      escrever(folha.width, folha.height);

      const url = folha.toDataURL('image/png');
      const arquivo = nome();

      const link = document.createElement('a');
      link.href = url;
      link.download = arquivo;
      link.click();

      ultima = arquivo;
      return arquivo;
    },

    /** Último arquivo gravado. Serve pra teste e pra depuração. */
    get last() {
      return ultima;
    }
  };
}
