import { WORLD } from '../config.js';
import { createOutpost } from './outpost.js';

/**
 * Os seis pontos de Sainte-Mère, na ordem em que a frente avança.
 *
 * A ordem é a regra do modo: 01 é a praia de desembarque e 06 é o moinho que
 * domina a base inimiga. Cada ponto só pode ser tomado quando o anterior já
 * caiu, então a partida é uma linha que anda pelo mapa em vez de seis brigas
 * soltas.
 *
 * As posições são fixas e decoráveis, e cada uma é difícil de um jeito
 * diferente — a praia é aberta, a colina é alta, o rio é gargalo. É o terreno
 * que faz isso, não um número de dificuldade.
 */

export const PONTOS = [
  {
    id: 'praia', numero: 1, name: 'Praia',
    x: -88, z: -790,
    nota: 'desembarque · aberta, sem cobertura'
  },
  {
    id: 'colina', numero: 2, name: 'Bunker da Colina',
    x: -549, z: -418,
    nota: 'domina a praia e a vila'
  },
  {
    id: 'vila', numero: 3, name: 'Vila Central',
    x: -44, z: -173,
    nota: 'urbano · curta e média distância'
  },
  {
    id: 'fazenda', numero: 4, name: 'Fazenda La Haye',
    x: 490, z: -453,
    nota: 'aberto, com muros e celeiros'
  },
  {
    id: 'ponte', numero: 5, name: 'Ponte do Rio',
    x: -473, z: 0,        // o z sai do leito: ver posicionar()
    nota: 'gargalo · fácil de defender'
  },
  {
    id: 'moinho', numero: 6, name: 'Moinho',
    x: 301, z: 351,
    nota: 'elevado · vista da base inimiga'
  }
];

/** Ponto no mar, ou em cima de outro, é bug de mapa e estoura na montagem. */
function assertPontos(pontos, terrain, ocupado) {
  for (const ponto of pontos) {
    const chao = terrain.heightAt(ponto.x, ponto.z);
    if (chao < WORLD.SAND_UNTIL - 0.4) {
      throw new Error(
        `ponto "${ponto.name}" (${ponto.x}, ${ponto.z}) está na água: ${chao.toFixed(2)} m`
      );
    }
    for (const zona of ocupado) {
      const distancia = Math.hypot(ponto.x - zona.x, ponto.z - zona.z);
      if (distancia < zona.radius) {
        throw new Error(
          `ponto "${ponto.name}" encosta em ${zona.name}: ${distancia.toFixed(1)} m`
        );
      }
    }
    ocupado.push({ x: ponto.x, z: ponto.z, radius: 62, name: `ponto ${ponto.name}` });
  }
  return pontos;
}

/**
 * O ponto da ponte fica ONDE A PONTE ESTÁ, e a ponte sai do leito do rio.
 * Fixar o z na tabela criaria uma segunda fonte de verdade sobre onde o rio
 * passa, e as duas se separariam no primeiro ajuste do leito.
 */
function posicionar(pontos, campo) {
  const ponte = campo.bridges()[0];
  return pontos.map((ponto) => (ponto.id === 'ponte'
    ? { ...ponto, x: ponte.x, z: ponte.z + 44 }
    : ponto));
}

export function addOutposts(scene, colliders, { terrain, settling, occupied, campo }) {
  const postos = posicionar(PONTOS, campo);
  assertPontos(postos, terrain, occupied);

  // Todos começam neutros: quem os tomou por último é a partida, não o mapa.
  // O 01 nasce do atacante porque é a cabeça de praia — sem ela ele não teria
  // por onde entrar.
  return postos.map((ponto, i) => createOutpost(scene, colliders, {
    ...ponto,
    team: i === 0 ? 'vestria' : 'karnia',
    terrain,
    settling
  }));
}
