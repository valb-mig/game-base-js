import * as THREE from 'three';
import { headingDegrees } from '../player/heading.js';

/**
 * Fita de bússola no topo. Desenhada em canvas porque é tudo régua: risco
 * a cada 5°, risco alto a cada 15°, e rosa dos ventos a cada 45°.
 *
 * O canvas só é redesenhado quando o rumo muda de verdade — girar a cabeça
 * devagar não custa um redesenho por frame.
 */

const SPAN = 130;        // graus visíveis de ponta a ponta da fita
const ROSE = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];

const INK = '#ddd4b6';
const DIM = 'rgba(221, 212, 182, 0.45)';

export function initCompass(camera) {
  const canvas = document.getElementById('compass');
  const ctx = canvas.getContext('2d');
  const scratch = new THREE.Vector3();

  let lastHeading = null;
  let width = 0;
  let height = 0;

  function resize() {
    const ratio = Math.min(devicePixelRatio, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    lastHeading = null; // força redesenho no novo tamanho
  }

  function draw(heading) {
    ctx.clearRect(0, 0, width, height);

    const pixelsPerDegree = width / SPAN;
    const center = width / 2;
    const first = Math.ceil(heading - SPAN / 2);
    const last = Math.floor(heading + SPAN / 2);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let degree = first; degree <= last; degree++) {
      if (degree % 5 !== 0) continue;

      const x = center + (degree - heading) * pixelsPerDegree;
      const wrapped = (degree % 360 + 360) % 360;
      const isRose = wrapped % 45 === 0;
      const isMajor = wrapped % 15 === 0;

      ctx.fillStyle = isRose ? INK : DIM;
      const tick = isRose ? 13 : isMajor ? 10 : 6;
      ctx.fillRect(Math.round(x), height - tick, isRose ? 2 : 1, tick);

      if (isRose) {
        ctx.fillStyle = INK;
        ctx.font = '600 13px "Arial Narrow", "Roboto Condensed", system-ui, sans-serif';
        ctx.fillText(ROSE[wrapped / 45], x, 1);
      }
    }
  }

  resize();
  addEventListener('resize', resize);

  return function updateCompass() {
    const heading = headingDegrees(camera.quaternion, scratch);
    if (lastHeading !== null && Math.abs(heading - lastHeading) < 0.15) return;
    lastHeading = heading;
    draw(heading);
  };
}
