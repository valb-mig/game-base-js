import { groundHeightAt } from '../player/collision.js';

/**
 * Como o veículo pergunta ao mundo, e nada mais.
 *
 * `fisica.js` não conhece three nem terreno: ele recebe duas funções, e são
 * estas. Manter a adaptação num arquivo só é o que deixa a física ser testada
 * com um chão de mentira de três linhas.
 */

/**
 * Sobre que distância o gradiente do terreno é medido, em metros.
 *
 * A malha tem 2,5 m por vértice; amostrar em milímetros devolve a curvatura do
 * ruído dentro do vértice em vez da ladeira, e o veículo tremeria em chão
 * liso.
 */
const PASSO = 0.6;

/** Altura, tipo e gradiente do chão em (x, z). */
export function sondarDe(world, corpo) {
  const { terrain, colliders } = world;

  return function sondar(x, z) {
    const h = terrain.heightAt(x, z);
    return {
      // Topo de colisor conta como chão: é o que deixa o jipe passar em cima
      // da ponte em vez de atravessar o tabuleiro.
      altura: groundHeightAt(colliders, x, z, corpo.y + 0.1, h),
      tipo: terrain.tipoAt(x, z),
      dhx: (terrain.heightAt(x + PASSO, z) - terrain.heightAt(x - PASSO, z)) / (2 * PASSO),
      dhz: (terrain.heightAt(x, z + PASSO) - terrain.heightAt(x, z - PASSO)) / (2 * PASSO)
    };
  };
}

/**
 * O corpo do veículo cabe em (x, z)?
 *
 * Testa os quatro cantos da pegada, GIRADOS. Uma caixa envolvente alinhada aos
 * eixos diria que um jipe atravessado numa rua de 4 m não passa — é o mesmo
 * problema do prop tombado na diagonal, e aqui o corpo gira sempre.
 */
export function barradoDe(ficha, world, corpo, proprio) {
  const { colliders } = world;
  const PEGADA = [
    [ficha.MEIA_LARGURA, ficha.MEIO_COMPRIMENTO],
    [-ficha.MEIA_LARGURA, ficha.MEIO_COMPRIMENTO],
    [ficha.MEIA_LARGURA, -ficha.MEIO_COMPRIMENTO],
    [-ficha.MEIA_LARGURA, -ficha.MEIO_COMPRIMENTO]
  ];

  return function barrado(x, z) {
    const alto = corpo.y + ficha.ALTURA;
    const baixo = corpo.y + 0.25;
    const cos = Math.cos(corpo.yaw);
    const sen = Math.sin(corpo.yaw);

    for (const [lx, lz] of PEGADA) {
      const px = x + lx * cos + lz * sen;
      const pz = z - lx * sen + lz * cos;
      const perto = colliders.perto ? colliders.perto(px, pz) : colliders;
      for (const c of perto) {
        if (c === proprio) continue;
        if (c.box.max.y <= baixo || c.box.min.y >= alto) continue;
        if (px < c.box.min.x - 0.1 || px > c.box.max.x + 0.1) continue;
        if (pz < c.box.min.z - 0.1 || pz > c.box.max.z + 0.1) continue;
        return true;
      }
    }
    return false;
  };
}
