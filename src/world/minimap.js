import { WORLD } from '../config.js';
import { colorAt } from './heightfield.js';

/**
 * Mapa tático: a ilha vista de cima, desenhada amostrando o mesmo campo de
 * altura que o terreno usa.
 *
 * Não é uma imagem à parte que pode divergir do mapa — é o próprio relevo
 * lido de outro ângulo. Mexer no terreno muda o mapa junto, sem ninguém
 * precisar lembrar de atualizar nada.
 */

const RESOLUTION = 260;   // amostras por lado; o canvas é ampliado por CSS

function shade(hex, factor) {
  const r = Math.round(((hex >> 16) & 255) * factor);
  const g = Math.round(((hex >> 8) & 255) * factor);
  const b = Math.round((hex & 255) * factor);
  return [r, g, b];
}

/**
 * @param {{heightAt: Function}} terrain
 * @returns {HTMLCanvasElement} imagem da ilha, pronta pra desenhar em cima
 */
export function renderIsland(terrain) {
  const canvas = document.createElement('canvas');
  canvas.width = RESOLUTION;
  canvas.height = RESOLUTION;

  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(RESOLUTION, RESOLUTION);
  const data = image.data;

  const span = WORLD.SIZE;
  const step = span / RESOLUTION;
  const deep = shade(WORLD.DEEP_WATER_COLOR, 1);
  const shallow = shade(WORLD.WATER_COLOR, 1);

  for (let row = 0; row < RESOLUTION; row++) {
    // o mapa é visto de cima com o norte pra cima: -Z do mundo vira topo
    const z = -span / 2 + row * step;

    for (let col = 0; col < RESOLUTION; col++) {
      const x = -span / 2 + col * step;
      const height = terrain.heightAt(x, z);
      const index = (row * RESOLUTION + col) * 4;

      let rgb;
      if (height >= WORLD.WATER_LEVEL) {
        // sombreado pela inclinação: sem isso a ilha vira uma mancha chapada
        const slope = terrain.heightAt(x + step, z) - height;
        rgb = shade(colorAt(height), 1 + Math.max(-0.35, Math.min(0.35, slope * 0.5)));
      } else {
        const depth = Math.min(1, -height / WORLD.SEA_DEPTH);
        rgb = [
          shallow[0] + (deep[0] - shallow[0]) * depth,
          shallow[1] + (deep[1] - shallow[1]) * depth,
          shallow[2] + (deep[2] - shallow[2]) * depth
        ];
      }

      data[index] = rgb[0];
      data[index + 1] = rgb[1];
      data[index + 2] = rgb[2];
      data[index + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Converte coordenada de mundo em fração 0..1 do mapa (x para a direita, z para baixo). */
export function worldToMap(x, z) {
  return {
    u: (x + WORLD.SIZE / 2) / WORLD.SIZE,
    v: (z + WORLD.SIZE / 2) / WORLD.SIZE
  };
}

/** O inverso: fração do mapa de volta pra coordenada de mundo. */
export function mapToWorld(u, v) {
  return {
    x: u * WORLD.SIZE - WORLD.SIZE / 2,
    z: v * WORLD.SIZE - WORLD.SIZE / 2
  };
}
