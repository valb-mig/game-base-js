import { teamOf, postOwner, postContested } from '../game/teams.js';
import { renderIsland, worldToMap } from '../world/minimap.js';

/**
 * Mapa tático da tela de deploy: a ilha vista de cima, com as zonas de
 * nascimento marcadas e clicáveis.
 *
 * A imagem da ilha é gerada uma vez a partir do terreno e reaproveitada; o
 * que é redesenhado a cada interação são só as marcas por cima.
 */

const MARKER = 9;
const SELECTED = 13;

export function initTacticalMap(terrain, zones, onSelect, partida = {}) {
  const canvas = document.getElementById('tactical-map');
  const ctx = canvas.getContext('2d');
  const island = renderIsland(terrain);

  canvas.width = island.width;
  canvas.height = island.height;

  let selected = null;
  let hovered = null;

  const points = zones.map((zone) => {
    const { u, v } = worldToMap(zone.x, zone.z);
    return { zone, x: u * canvas.width, y: v * canvas.height };
  });

  function draw() {
    ctx.drawImage(island, 0, 0);

    for (const point of points) {
      const isSelected = selected === point.zone;
      const isHovered = hovered === point.zone;
      const size = isSelected ? SELECTED : MARKER;

      // Cor de quem manda no posto agora, e não a de quem começou dono: o
      // mapa tem que contar como está a partida, senão ele é enfeite.
      const dono = point.zone.post ? postOwner(point.zone.post) : point.zone.team;
      const emDisputa = point.zone.post ? postContested(point.zone.post) : false;
      const disponivel = partida.valid ? partida.valid(point.zone) : true;

      ctx.beginPath();
      ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
      ctx.fillStyle = dono
        ? (disponivel ? teamOf(dono).css : 'rgba(20, 24, 18, 0.75)')
        : 'rgba(20, 24, 18, 0.6)';
      ctx.fill();

      // Anel tracejado no que está sendo tomado: é a leitura de "aqui não
      // dá pra nascer" sem precisar de legenda.
      ctx.lineWidth = 2;
      ctx.setLineDash(emDisputa ? [3, 3] : []);
      ctx.strokeStyle = isSelected || isHovered
        ? '#e2dac2'
        : (dono ? teamOf(dono).css : 'rgba(226, 218, 194, 0.55)');
      ctx.stroke();
      ctx.setLineDash([]);

      // Base principal leva um pino no meio: ela é sempre sua, e é a única
      // que não some quando a partida vira.
      if (point.zone.base) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#e2dac2';
        ctx.fill();
      }

      if (isSelected || isHovered) {
        ctx.font = 'bold 11px "Arial Narrow", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e2dac2';
        ctx.fillText(point.zone.name.toUpperCase(), point.x, point.y - size - 5);
      }
    }
  }

  /** Zona sob o cursor, se o clique caiu perto o bastante de alguma. */
  function pick(event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * canvas.width;
    const y = (event.clientY - rect.top) / rect.height * canvas.height;

    let best = null;
    let bestDistance = SELECTED * 2;

    for (const point of points) {
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = point.zone;
      }
    }
    return best;
  }

  canvas.addEventListener('mousemove', (event) => {
    const zone = pick(event);
    if (zone === hovered) return;
    hovered = zone;
    canvas.style.cursor = zone ? 'pointer' : 'default';
    draw();
  });

  canvas.addEventListener('mouseleave', () => {
    hovered = null;
    draw();
  });

  canvas.addEventListener('click', (event) => {
    const zone = pick(event);
    if (!zone) return;
    selected = zone;
    draw();
    onSelect(zone);
  });

  draw();

  return {
    get selected() {
      return selected;
    },

    select(zone) {
      selected = zone;
      draw();
    },

    redraw: draw
  };
}
