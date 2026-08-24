import { WORLD } from '../config.js';

/**
 * Campo de altura da ilha. Matemática pura, sem three: é a fonte de verdade
 * tanto pra malha quanto pra colisão, e assim dá pra inspecionar e testar
 * fora do navegador.
 *
 * O perfil é uma parábola suavizada: alta no centro, cruzando o nível da
 * água exatamente em ISLAND_RADIUS, e descendo pro fundo do mar depois
 * disso. Como o smoothstep é quase plano perto da borda, a faixa de praia
 * sai larga e em rampa sem precisar de caso especial.
 */

// Ruído de valor determinístico. Math.imul mantém a multiplicação em 32 bits,
// senão o hash perde precisão e o ruído vira faixa.
function hash(ix, iz) {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smoothstep(x - ix);
  const fz = smoothstep(z - iz);

  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);

  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

/** Três oitavas, resultado em -1..1. */
function fbm(x, z) {
  let sum = 0;
  let norm = 0;
  let amplitude = 1;
  let frequency = 1;

  for (let octave = 0; octave < 3; octave++) {
    sum += valueNoise(x * frequency, z * frequency) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.13;
  }
  return (sum / norm) * 2 - 1;
}

/**
 * @param {Array<{x, z, radius, blend, height}>} flatZones
 *   Áreas que o terreno tem que achatar — base militar e campo de treino não
 *   podem nascer numa ladeira. Dentro de `radius` a altura é exatamente
 *   `height`, e ela volta pro relevo natural ao longo de `blend`.
 */
export function createHeightfield(flatZones = []) {
  function naturalHeight(x, z) {
    const distance = Math.hypot(x, z) / WORLD.ISLAND_RADIUS;
    const inland = 1 - distance;

    let base;
    if (inland >= 0) {
      base = WORLD.ISLAND_HEIGHT * smoothstep(inland);
    } else {
      // fora da ilha: desce pro fundo ao longo de um terço do raio
      const out = Math.min(1, -inland * 3);
      base = -WORLD.SEA_DEPTH * smoothstep(out);
    }

    // o relevo some perto da água, senão a praia fica encaroçada
    const reliefMask = Math.max(0, Math.min(1, inland * 3));
    const relief = fbm(x * WORLD.RELIEF_SCALE, z * WORLD.RELIEF_SCALE)
      * WORLD.RELIEF * reliefMask;

    return base + relief;
  }

  /**
   * Vence a zona de maior influência, não a última da lista.
   *
   * Aplicar as zonas em sequência fazia cada uma puxar o resultado da
   * anterior: onde o platô da base e o do campo de treino se sobrepunham, a
   * base assentava na altura errada e o jogador nascia enterrado. Com o
   * máximo, o resultado não depende mais da ordem — e zonas que não se
   * cruzam (garantido por assertFlatZones) nunca disputam.
   */
  function heightAt(x, z) {
    const natural = naturalHeight(x, z);

    let weight = 0;
    let flatHeight = 0;

    for (const zone of flatZones) {
      const distance = Math.hypot(x - zone.x, z - zone.z);
      if (distance >= zone.radius + zone.blend) continue;

      const influence = distance <= zone.radius
        ? 1
        : 1 - smoothstep((distance - zone.radius) / zone.blend);

      if (influence > weight) {
        weight = influence;
        flatHeight = zone.height;
      }
    }
    return flatHeight * weight + natural * (1 - weight);
  }

  /** Profundidade da água em (x, z). 0 em terra seca. */
  function waterDepthAt(x, z) {
    return Math.max(0, WORLD.WATER_LEVEL - heightAt(x, z));
  }

  return { heightAt, waterDepthAt, naturalHeight };
}

/** Cor do terreno pela altura: areia na praia, capim, e topo mais seco. */
export function colorAt(height) {
  if (height < WORLD.SAND_UNTIL) return WORLD.SAND_COLOR;
  if (height > WORLD.ISLAND_HEIGHT * 0.62) return WORLD.HIGHLAND_COLOR;
  return WORLD.GRASS_COLOR;
}

/**
 * Zonas planas não podem se cruzar: onde duas se encontram, o terreno daria
 * um degrau seco entre dois platôs de alturas diferentes. Melhor estourar na
 * hora de montar o mapa do que descobrir isso caindo dentro do chão.
 */
export function assertFlatZones(zones) {
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const a = zones[i];
      const b = zones[j];
      const distance = Math.hypot(a.x - b.x, a.z - b.z);
      const reach = a.radius + a.blend + b.radius + b.blend;
      if (distance < reach) {
        throw new Error(
          `zonas planas se cruzam: (${a.x}, ${a.z}) e (${b.x}, ${b.z}) ` +
          `estão a ${distance.toFixed(1)}m, precisam de ${reach.toFixed(1)}m`
        );
      }
    }
  }
  return zones;
}
