import { WORLD } from '../config.js';
import { createOutpost } from './outpost.js';

/**
 * Onde ficam os doze postos, seis de cada lado.
 *
 * As posições são fixas, não sorteadas: o mapa de um jogo de território tem
 * que ser decorável. Quem aprendeu que o posto do Farol fica na ponta leste
 * não pode chegar lá numa partida e não achar nada.
 *
 * Cada lado tem os seus na metade dele, e os dois postos de linha de frente
 * ficam perto do meio da ilha — é onde a briga começa.
 */

const NOMES_KARNIA = ['Farol', 'Pedreira', 'Ponte Norte', 'Cabo Frio', 'Vigia', 'Trincheira'];
const NOMES_VESTRIA = ['Enseada', 'Serraria', 'Ponte Sul', 'Duna', 'Torre', 'Paiol'];

// Fila de cada lado, do fundo pra frente. O z é multiplicado pelo lado, então
// a mesma tabela serve pros dois — o mapa fica simétrico e legível.
// Os x e z saíram de sondar o campo de altura de verdade, com as zonas planas
// aplicadas, e nos DOIS lados: a ilha não é simétrica, porque o ruído do
// relevo não é. Um par de postos de fundo que dava 3,3 m no sul dava 2,35 no
// norte, ou seja praia — e a montagem estourou por isso.
const FORMACAO = [
  { x: -52, z: 86 },    // fundo, canto oeste
  { x: 52, z: 86 },     // fundo, canto leste
  { x: -46, z: 58 },    // meio
  { x: 46, z: 58 },
  { x: -30, z: 30 },    // linha de frente, perto do meio da ilha
  { x: 30, z: 30 }
];

// Karnia no norte (z negativo), Vestria no sul. As bases principais ficam
// atrás dos postos de cada um.
const LADO = { karnia: -1, vestria: 1 };

/** Longe demais de tudo pra ser posto: mar, ou beirada de praia. */
const ALTURA_MINIMA = WORLD.SAND_UNTIL + 0.8;

/**
 * Posto no mar, ou em cima de base, é bug de mapa e tem que estourar na
 * montagem. Descobrir isso jogando custou uma sessão inteira quando o campo
 * de treino nasceu dentro de uma plataforma.
 */
function assertPostos(postos, terrain, ocupado) {
  for (const posto of postos) {
    const chao = terrain.heightAt(posto.x, posto.z);
    if (chao < ALTURA_MINIMA) {
      throw new Error(
        `posto "${posto.name}" (${posto.x}, ${posto.z}) está na água: altura ${chao.toFixed(2)}`
      );
    }
    for (const zona of ocupado) {
      const distancia = Math.hypot(posto.x - zona.x, posto.z - zona.z);
      if (distancia < zona.radius) {
        throw new Error(
          `posto "${posto.name}" encosta em ${zona.name}: ${distancia.toFixed(1)} m`
        );
      }
    }
    ocupado.push({ x: posto.x, z: posto.z, radius: 26, name: `posto ${posto.name}` });
  }
  return postos;
}

export function addOutposts(scene, colliders, { terrain, settling, occupied }) {
  const postos = [];

  for (const [team, sinal] of Object.entries(LADO)) {
    const nomes = team === 'karnia' ? NOMES_KARNIA : NOMES_VESTRIA;

    FORMACAO.forEach((lugar, i) => {
      postos.push({
        id: `${team}-${i}`,
        name: nomes[i],
        x: lugar.x,
        z: lugar.z * sinal,
        team
      });
    });
  }

  assertPostos(postos, terrain, occupied);

  return postos.map((posto) => createOutpost(scene, colliders, {
    ...posto, terrain, settling
  }));
}
