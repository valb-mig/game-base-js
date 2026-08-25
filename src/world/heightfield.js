import { WORLD } from '../config.js';

/**
 * Campo de altura de Sainte-Mère. Matemática pura, sem three: é a fonte de
 * verdade tanto pra malha quanto pra colisão, e assim dá pra inspecionar e
 * testar fora do navegador.
 *
 * O terreno é a própria regra do mapa. De norte pra sul: mar, praia de
 * desembarque, a escarpa que domina essa praia, o planalto onde ficam a vila
 * e a fazenda, e o rio cortando na diagonal com duas pontes. Cada trecho
 * existe pra que um ponto de captura seja difícil de um jeito diferente —
 * a praia é aberta, a escarpa é alta, o rio é gargalo.
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
export function createHeightfield(flatZones = [], deform = null) {
  /**
   * Onde passa o leito do rio, no z, pra um dado x. Diagonal e com uma
   * ondulação: rio reto lê como vala, não como rio.
   */
  function leitoDoRio(x) {
    return WORLD.RIO_Z + WORLD.RIO_INCLINACAO * x
      + Math.sin(x * 0.0042) * WORLD.RIO_ONDA;
  }

  /** Perto de uma ponte o rio não é cavado: é por ali que se atravessa. */
  function fatorDePonte(x) {
    let aberto = 0;
    for (const ponte of WORLD.PONTES) {
      const perto = 1 - Math.min(1, Math.abs(x - ponte) / WORLD.PONTE_LARGURA);
      aberto = Math.max(aberto, smoothstep(perto));
    }
    return aberto;
  }

  /**
   * Onde uma ponte cruza o rio. É a única fonte de verdade sobre isso: quem
   * põe a ponte, o ponto de captura e a estrada leem daqui.
   */
  function pontes() {
    return WORLD.PONTES.map((x) => ({ x, z: leitoDoRio(x) }));
  }

  function naturalHeight(x, z) {
    // ------------------------------------------------------ perfil norte-sul
    let base;
    if (z <= WORLD.MAR_ATE) {
      // mar: fundo descendo conforme se afasta da praia
      const fundo = Math.min(1, (WORLD.MAR_ATE - z) / 260);
      base = -WORLD.SEA_DEPTH * smoothstep(fundo);
    } else if (z <= WORLD.PRAIA_ATE) {
      // praia: rampa suave da linha d'água até o pé da escarpa
      const t = (z - WORLD.MAR_ATE) / (WORLD.PRAIA_ATE - WORLD.MAR_ATE);
      base = smoothstep(t) * 3.4;
    } else if (z <= WORLD.ESCARPA_ATE) {
      // escarpa: é ela que faz a praia ser um lugar ruim de ficar parado
      const t = (z - WORLD.PRAIA_ATE) / (WORLD.ESCARPA_ATE - WORLD.PRAIA_ATE);
      base = 3.4 + smoothstep(t) * (WORLD.ALTURA_PLANALTO - 3.4);
    } else {
      base = WORLD.ALTURA_PLANALTO;
    }

    // ------------------------------------------------------------- colinas
    for (const colina of WORLD.COLINAS) {
      const d = Math.hypot(x - colina.x, z - colina.z) / colina.raio;
      if (d < 1) base += colina.altura * smoothstep(1 - d);
    }

    // ----------------------------------------------------------- ondulação
    // Some perto da água, senão a praia fica encaroçada, e some no mar.
    const mascara = Math.max(0, Math.min(1, (z - WORLD.MAR_ATE) / 180));
    base += fbm(x * WORLD.RELIEF_SCALE, z * WORLD.RELIEF_SCALE)
      * WORLD.RELIEF * mascara;

    // ---------------------------------------------------------------- rio
    // Cavado por último, pra que ele corte colina e ondulação em vez de ser
    // apagado por elas — rio que some numa lombada não é gargalo de nada.
    const doLeito = Math.abs(z - leitoDoRio(x));
    if (doLeito < WORLD.RIO_MARGEM) {
      const dentro = 1 - smoothstep(
        Math.max(0, doLeito - WORLD.RIO_LARGURA)
        / (WORLD.RIO_MARGEM - WORLD.RIO_LARGURA));
      const corte = (base - WORLD.RIO_FUNDO) * dentro * (1 - fatorDePonte(x));
      base -= Math.max(0, corte);
    }

    return base;
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
    const base = flatHeight * weight + natural * (1 - weight);
    // A escavação é uma camada por cima: a ilha continua sendo função pura,
    // e quem cavou fica registrado num lugar só.
    return deform ? base + deform.deltaAt(x, z) : base;
  }

  /** Profundidade da água em (x, z). 0 em terra seca. */
  function waterDepthAt(x, z) {
    return Math.max(0, WORLD.WATER_LEVEL - heightAt(x, z));
  }

  return { heightAt, waterDepthAt, naturalHeight, riverBedAt: leitoDoRio, bridges: pontes };
}

/** Cor do terreno pela altura: areia na praia, capim, e topo mais seco. */
export function colorAt(height) {
  if (height < WORLD.SAND_UNTIL) return WORLD.SAND_COLOR;
  if (height > WORLD.ALTURA_PLANALTO * 1.22) return WORLD.HIGHLAND_COLOR;
  return WORLD.GRASS_COLOR;
}

/**
 * Quanto o ponto parece terra revolvida, de 0 a 1.
 *
 * Sem isto uma trincheira fica com cor de capim no fundo e some visualmente:
 * o relevo muda mas o olho não percebe. Cavar tem que expor terra.
 *
 * `marca` é a camada de revolvido, e ela manda quando é maior: uma bala afunda
 * 2,6 cm e pela profundidade pintaria 5% de terra — o jogador atirava no chão
 * e jurava que nada tinha acontecido. Mover pouca terra e revolver toda ela
 * são coisas diferentes.
 */
export function turnedSoil(delta, marca = 0) {
  return Math.min(1, Math.max(Math.abs(delta) / 0.55, marca));
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
