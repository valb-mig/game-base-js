import { groundHeightAt } from '../player/collision.js';
import { intervaloVertical } from '../world/caixagirada.js';

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

/**
 * Altura, tipo e gradiente do chão em (x, z).
 *
 * O degrau é o do VEÍCULO (`ficha.DEGRAU`), e o mesmo que `barrado` usa logo
 * abaixo. Ver o comentário de lá: quem decide o que é piso e quem decide o que
 * é parede não podem discordar.
 */
export function sondarDe(world, corpo, ficha) {
  const { terrain, colliders } = world;

  return function sondar(x, z) {
    const h = terrain.heightAt(x, z);
    return {
      // Topo de colisor conta como chão: é o que deixa o jipe passar em cima
      // da ponte em vez de atravessar o tabuleiro.
      altura: groundHeightAt(colliders, x, z, corpo.y, h, null, ficha.DEGRAU),
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
 *
 * O QUE É PISO NÃO PODE SER PAREDE, e era. `sondar` aceitava topo de colisor
 * até `corpo.y + 0,45` como chão (o `STEP_HEIGHT` do jogador mais uma folga) e
 * esta função barrava tudo acima de `corpo.y + 0,25`: entre os dois números
 * havia uma faixa de 20 cm em que a mesma laje era chão pra suspensão e muro
 * pra colisão, e o jipe simplesmente parava na frente de um meio-fio. Hoje as
 * duas leem `ficha.DEGRAU`, que é o raio da roda.
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
    // Topo abaixo disto é degrau, não parede: a roda sobe por cima.
    const baixo = corpo.y + ficha.DEGRAU;
    const cos = Math.cos(corpo.yaw);
    const sen = Math.sin(corpo.yaw);

    for (const [lx, lz] of PEGADA) {
      const px = x + lx * cos + lz * sen;
      const pz = z - lx * sen + lz * cos;
      const perto = colliders.perto ? colliders.perto(px, pz) : colliders;
      for (const c of perto) {
        if (c === proprio) continue;
        // A envolvente peneira primeiro: num colisor girado ela é maior que o
        // corpo, então nunca descarta o que valeria.
        if (c.box.max.y <= baixo || c.box.min.y >= alto) continue;

        if (c.girado) {
          // Parede tombada na diagonal: a caixa envolvente dela barraria o
          // jipe a metros da chapa. Mesma conta do jogador e da bala.
          const faixa = intervaloVertical(c.girado, px, pz, false);
          if (!faixa || faixa.sai <= baixo || faixa.entra >= alto) continue;
          return true;
        }

        if (px < c.box.min.x - 0.1 || px > c.box.max.x + 0.1) continue;
        if (pz < c.box.min.z - 0.1 || pz > c.box.max.z + 0.1) continue;
        return true;
      }
    }
    return false;
  };
}
