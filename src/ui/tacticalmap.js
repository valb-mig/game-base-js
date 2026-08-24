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

export function initTacticalMap(terrain, zones, onSelect) {
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

      ctx.beginPath();
      ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? 'rgba(147, 189, 94, 0.85)' : 'rgba(20, 24, 18, 0.6)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isSelected || isHovered ? '#e2dac2' : 'rgba(226, 218, 194, 0.55)';
      ctx.stroke();

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
