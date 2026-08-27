import { renderIsland, worldToMap, mapToWorld } from '../world/minimap.js';
import { desenharPosto as desenharPosto3 } from './simbolos.js';
import { alternar, todas, dentroDoMapa, MAX } from './marcacoes.js';

/**
 * O mapa grande, que M abre.
 *
 * O radar do canto mostra quinhentos metros e o mapa tático da tela de deploy
 * é pequeno e serve pra escolher onde nascer. Faltava a vista inteira: um
 * mapa de dois quilômetros em que se possa OLHAR e decidir, e no qual se
 * possa deixar dito o que se decidiu.
 *
 * A ilha sai do MESMO `renderIsland` do radar e do mapa tático — memoizado
 * por terreno, então abrir o mapa não custa uma amostragem nova do campo de
 * altura. Mexer no relevo move os três juntos.
 */

/** Raio do clique que apaga uma marca, em metros de mundo. */
const APAGA_RAIO = 55;

const CORES = {
  fundo: '#0e1412',
  grade: 'rgba(220, 235, 225, 0.09)',
  marca: '#f2c14e',
  jogador: '#eef4ee'
};

export function initMapa(terrain, world, player) {
  const canvas = document.getElementById('map-canvas');
  const ctx = canvas.getContext('2d');
  const ilha = renderIsland(terrain);

  canvas.width = ilha.width;
  canvas.height = ilha.height;

  const paraTela = (x, z) => {
    const { u, v } = worldToMap(x, z);
    return { x: u * canvas.width, y: v * canvas.height };
  };

  /** Losango de waypoint, com o número dentro. */
  function desenharMarca(marca, indice) {
    const p = paraTela(marca.x, marca.z);
    const r = 11;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.78, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.78, 0);
    ctx.closePath();
    ctx.fillStyle = CORES.marca;
    ctx.fill();
    ctx.strokeStyle = 'rgba(20, 24, 20, 0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#1a1e19';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(indice + 1), 0, 0);
    ctx.restore();
  }

  /** Seta do jogador, apontando pra onde ele olha. */
  function desenharJogador() {
    const pos = player.object.position;
    const p = paraTela(pos.x, pos.z);

    // O yaw sai do EIXO X da câmera, não de `rotation.y`: num rig yaw+pitch
    // `rotation` decodifica em XYZ e lê zero olhando pra trás.
    const m = player.object.matrixWorld.elements;
    const rumo = Math.atan2(-m[8], -m[10]);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-rumo);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(6.5, 8);
    ctx.lineTo(0, 4.5);
    ctx.lineTo(-6.5, 8);
    ctx.closePath();
    ctx.fillStyle = CORES.jogador;
    ctx.fill();
    ctx.strokeStyle = 'rgba(20, 24, 20, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }

  function desenharPosto(posto, tempo) {
    const p = paraTela(posto.x, posto.z);
    // Símbolo compartilhado com o radar e com o mapa tático: disco no tom de
    // quem manda, número no meio, anel de progresso enquanto está em disputa.
    desenharPosto3(ctx, p.x, p.y, posto, { raio: 13, tempo });
  }

  function desenhar() {
    ctx.fillStyle = CORES.fundo;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(ilha, 0, 0);

    // Grade de 200 m: sem referência de escala, um mapa de dois quilômetros
    // não diz se aquilo ali é longe.
    const passo = canvas.width / 10;
    ctx.strokeStyle = CORES.grade;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 10; i++) {
      ctx.moveTo(i * passo, 0);
      ctx.lineTo(i * passo, canvas.height);
      ctx.moveTo(0, i * passo);
      ctx.lineTo(canvas.width, i * passo);
    }
    ctx.stroke();

    const tempo = (typeof performance !== 'undefined' ? performance.now() : 0);
    for (const posto of world.outposts) desenharPosto(posto, tempo);
    todas().forEach(desenharMarca);
    if (player.alive) desenharJogador();
  }

  /** Onde o clique caiu, em coordenada de mundo. */
  function mundoDoEvento(evento) {
    const rect = canvas.getBoundingClientRect();
    const u = (evento.clientX - rect.left) / rect.width;
    const v = (evento.clientY - rect.top) / rect.height;
    return mapToWorld(u, v);
  }

  canvas.addEventListener('click', (evento) => {
    const { x, z } = mundoDoEvento(evento);
    // Fora da ilha o clique não faz nada: marca no mar aberto aponta pra um
    // lugar aonde ele não pode ir.
    if (!dentroDoMapa(x, z)) return;
    alternar(x, z, APAGA_RAIO);
    desenhar();
  });

  return { desenhar, canvas, MAX };
}
