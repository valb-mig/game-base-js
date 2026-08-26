import { WORLD } from '../config.js';
import { declividadeAt, tipoDoChao } from './ground.js';
import { fbm, smoothstep } from './noise.js';
import { createEstradas } from './estradas.js';

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

/**
 * @param {Array<{x, z, radius, blend, height}>} flatZones
 *   Áreas que o terreno tem que achatar — base militar e campo de treino não
 *   podem nascer numa ladeira. Dentro de `radius` a altura é exatamente
 *   `height`, e ela volta pro relevo natural ao longo de `blend`.
 */
export function createHeightfield(flatZones = [], deform = null, perfil = 'sainte-mere') {
  /**
   * Onde passa o leito do rio, no z, pra um dado x. Diagonal e com uma
   * ondulação: rio reto lê como vala, não como rio.
   */
  function leitoDoRio(x) {
    return WORLD.RIO_Z + WORLD.RIO_INCLINACAO * x
      + Math.sin(x * 0.0042) * WORLD.RIO_ONDA;
  }

  /**
   * Onde uma ponte cruza o rio. É a única fonte de verdade sobre isso: quem
   * põe a ponte, o ponto de captura e a estrada leem daqui.
   */
  function pontes() {
    return WORLD.PONTES.map((x) => ({ x, z: leitoDoRio(x) }));
  }

  /**
   * Campo de treinamento: chão plano.
   *
   * Plano de propósito. Treinar distância num terreno que sobe e desce mede
   * a ladeira junto com a arma, e aí "errei a 90 m" deixa de ser um dado.
   */
  function alturaDeTreino(x, z) {
    return 4 + fbm(x * 0.006, z * 0.006) * 0.35;
  }

  function naturalHeight(x, z) {
    if (perfil === 'treino') return alturaDeTreino(x, z);

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
    //
    // Dois cortes, nesta ordem: primeiro o VALE, largo e raso, que baixa o
    // planalto inteiro numa rampa suave o bastante pra grama pegar; depois o
    // CANAL, estreito e fundo, onde está a água. Com um corte só a margem
    // ficava íngreme demais em toda a largura e o rio corria dentro de um
    // paredão de barro — vala, não vale.
    const doLeito = Math.abs(z - leitoDoRio(x));

    if (doLeito < WORLD.VALE_MARGEM) {
      const dentro = 1 - smoothstep(
        Math.max(0, doLeito - WORLD.RIO_MARGEM)
        / (WORLD.VALE_MARGEM - WORLD.RIO_MARGEM));
      base -= WORLD.VALE_PROFUNDIDADE * dentro;
    }

    if (doLeito < WORLD.RIO_MARGEM) {
      const dentro = 1 - smoothstep(
        Math.max(0, doLeito - WORLD.RIO_LARGURA)
        / (WORLD.RIO_MARGEM - WORLD.RIO_LARGURA));
      // O rio é cavado até o fim, inclusive sob as pontes: elas o ATRAVESSAM
      // por cima, em concreto. Abrir um vão no leito onde a ponte passa dava
      // uma língua de grama cortando o rio — e aí a ponte não segurava nada,
      // porque dava pra andar por baixo dela em terra seca.
      const corte = (base - WORLD.RIO_FUNDO) * dentro;
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

  // O campo de treino não tem rede viária: ele é plano e medido de propósito,
  // e uma estrada cruzando a linha de tiro seria enfeite no único lugar do
  // jogo em que tudo tem que ser medida.
  const estradas = perfil === 'treino' ? null : createEstradas(leitoDoRio);

  /**
   * Altura da lâmina d'água em (x, z). Duas águas, não uma.
   *
   * O mar está no zero e o rio corre a 7,9 m — rio corre EM CIMA do
   * continente, e tratar tudo como um nível só deixava o leito seco (o mar
   * não sobe até lá) ou afogava a ilha inteira (se o nível subisse até o
   * rio). Quem pergunta a profundidade pergunta aqui, e não pra a constante:
   * `WATER_LEVEL` sozinho é a resposta certa em todo lugar menos no rio.
   */
  function nivelDaAguaAt(x, z) {
    if (perfil === 'treino') return WORLD.WATER_LEVEL;
    const doLeito = Math.abs(z - leitoDoRio(x));
    if (doLeito > WORLD.RIO_MARGEM) return WORLD.WATER_LEVEL;
    return WORLD.RIO_NIVEL;
  }

  /** Profundidade da água em (x, z). 0 em terra seca. */
  function waterDepthAt(x, z) {
    return Math.max(0, nivelDaAguaAt(x, z) - heightAt(x, z));
  }

  return {
    heightAt,
    nivelDaAguaAt,
    waterDepthAt,

    // A rede viária. Quem pinta o chão e quem semeia mato leem daqui, e é a
    // mesma fonte: estrada que aparece na malha mas não afasta a árvore
    // deixaria pinheiro plantado no meio do asfalto.
    estradaAt: (x, z) => (estradas ? estradas.estradaAt(x, z) : 0),
    corDeEstradaAt: (x, z) => (estradas ? estradas.corDeEstradaAt(x, z) : null),
    trechosDeEstrada: () => (estradas ? estradas.trechos : []),
    naturalHeight,
    riverBedAt: leitoDoRio,
    bridges: pontes,

    // Que chão é cada ponto sai daqui e de nenhum outro lugar: a malha pinta
    // por isto, a floresta nasce por isto e o mapa tático desenha por isto.
    // Duas fontes de verdade sobre o mesmo chão se separariam no primeiro
    // ajuste da declividade.
    declividadeAt: (x, z) => declividadeAt(heightAt, x, z),
    tipoAt: (x, z) => tipoDoChao(
      heightAt(x, z), declividadeAt(heightAt, x, z), waterDepthAt(x, z),
      estradas ? estradas.estradaAt(x, z) : 0)
  };
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

/**
 * `colorAt` mudou de casa pra `world/ground.js`, onde ela virou classificação
 * de terreno e não só cor. O reexport fica aqui pra que quem ainda importa
 * daqui não quebre no meio da mudança — pode sumir quando ninguém mais o usar.
 */
export { colorAt } from './ground.js';
