import { addBox, sorteioFixo } from './props.js';
import { WORLD } from '../config.js';
import { sacaria } from './militar.js';
import { assentar, paredeComVao, tambor, CONCRETO, CONCRETO_ESCURO, MADEIRA, TERRA_REMEXIDA } from './construcao.js';

/**
 * Casamata de concreto enterrada no morro, com seteira virada pro norte.
 *
 * A SETEIRA é a peça. Um bunker fechado seria só um bloco; a fresta é o que
 * transforma o ponto num lugar de onde se atira sem ser atingido, e por isso
 * ela é um vão de verdade, com verga baixa: quem está dentro atira de pé, e
 * quem está fora precisa acertar uma faixa de sessenta centímetros.
 *
 * Ela olha pro -Z porque é de lá que vem o ataque: a praia é ao norte, e o
 * ponto 02 é o que domina a praia e a vila.
 */
export function addBunker(scene, colliders, { x, z, terrain, settling = null }) {
  const rng = sorteioFixo(20250906);
  const W = 13;
  const D = 8.5;
  const H = 2.8;
  // A casamata fica 19 m ao NORTE do ponto: o quadrado de mastros tem 9 m e a
  // zona de nascimento fica em (x, z+7). E ao norte é pra onde ela atira — a
  // praia que ela domina está lá.
  const cz = z - 19;
  const { base } = assentar(terrain, x, cz, 9);
  const y = base - 0.5;

  // Frente com a seteira. Verga em 1,55 m: passa a arma e a cabeça de quem
  // está de pé, e nada mais.
  paredeComVao(scene, colliders, {
    settling, x, z: cz - D / 2, y, largura: W, altura: H + 0.5, espessura: 0.75, soleira: 0.5,
    cor: CONCRETO, aoLongoDeX: true, vaoLargura: 5.4, vaoAltura: 0.85,
    peitoril: 1.05
  });
  // Fundo com a porta, virada pro lado de quem defende.
  paredeComVao(scene, colliders, {
    settling, x, z: cz + D / 2, y, largura: W, altura: H + 0.5, espessura: 0.6, soleira: 0.5,
    cor: CONCRETO, aoLongoDeX: true, vaoLargura: 1.3, vaoAltura: 1.9,
    vaoEm: W * 0.28
  });
  for (const lado of [-1, 1]) {
    addBox(scene, colliders, {
      settling, x: x + lado * W / 2, z: cz, y, w: 0.7, h: H + 0.5, d: D,
      color: CONCRETO_ESCURO
    });
  }
  addBox(scene, colliders, {
    settling, x, z: cz, y: y + H + 0.5, w: W + 0.9, h: 0.7, d: D + 0.9,
    color: CONCRETO
  });

  // A cobertura de terra.
  //
  // Duas tentativas erradas antes desta, e as duas pelo mesmo motivo: a
  // cobertura tem que engolir TRÊS lados e deixar o quarto à mostra, e nenhum
  // sólido simétrico faz isso. Três lajes chatas empilhadas por cima viraram
  // uma pilha de panquecas marrom no meio de um morro verde; uma pirâmide
  // larga o bastante pra cobrir o teto engoliu a seteira junto, e o bunker
  // sumiu inteiro — vista da praia, a posição de tiro deixou de existir.
  //
  // O que funciona é berma: degraus de terra encostados nos flancos e no
  // fundo, subindo até acima da laje, e a frente sem nada. Bunker some no
  // terreno menos pela boca de fogo, que é o único lado que ele não pode
  // esconder.
  const teto = y + H + 0.5 + 0.7;
  const DEGRAUS = 3;
  const DEGRAU = 2.6;

  addBox(scene, colliders, {
    settling, x, z: cz, y: teto, w: W + 1.4, h: 0.7, d: D + 1.4,
    color: WORLD.GRASS_COLOR
  });

  for (let i = 0; i < DEGRAUS; i++) {
    const alto = (teto - y) - i * 1.15;
    for (const lado of [-1, 1]) {
      addBox(scene, colliders, {
        settling,
        x: x + lado * (W / 2 + 0.7 + DEGRAU * (i + 0.5)),
        z: cz + 1.1, y,
        w: DEGRAU + 0.15, h: alto, d: D + 2.2 + i * 2.2,
        color: i === 0 ? TERRA_REMEXIDA : WORLD.GRASS_COLOR
      });
    }
    addBox(scene, colliders, {
      settling, x, z: cz + D / 2 + 0.7 + DEGRAU * (i + 0.5), y,
      w: W + 1.4 + (DEGRAUS - i) * DEGRAU * 2, h: alto, d: DEGRAU + 0.15,
      color: i === 0 ? TERRA_REMEXIDA : WORLD.GRASS_COLOR
    });
  }

  // Muretas de terra flanqueando a seteira: elas estreitam o ângulo de quem
  // atira DE FORA sem estreitar o de quem atira de dentro, e são o que faz o
  // bunker valer a subida.
  for (const lado of [-1, 1]) {
    addBox(scene, colliders, {
      settling, x: x + lado * (W / 2 + 2.6), z: cz - D / 2 - 1.6, y,
      w: 5, h: 1.7, d: 3, color: TERRA_REMEXIDA
    });
  }

  // Trincheira de sacos: a linha de tiro que cobre a aproximação ao bunker.
  // Sem ela o ponto é uma caixa com uma fresta, e quem chega a vinte metros
  // já está do lado de dentro.
  sacaria(scene, colliders, { terrain, settling, x: x - 16, z: cz - 7, comprimento: 13, aoLongoDeX: true });
  sacaria(scene, colliders, { terrain, settling, x: x + 16, z: cz - 7, comprimento: 13, aoLongoDeX: true });
  sacaria(scene, colliders, { terrain, settling, x: x - 22, z: cz + 8, comprimento: 16, aoLongoDeX: false });

  for (let i = 0; i < 6; i++) {
    const px = x + (rng() * 2 - 1) * 22;
    const pz = z + 8 + rng() * 16;
    tambor(scene, colliders, {
      x: px, z: pz, ground: terrain.heightAt(px, pz), cor: rng() < 0.5 ? 0x4c5b3a : MADEIRA
    });
  }
}
