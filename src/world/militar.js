import { addBox, sorteioFixo } from './props.js';
import {
  assentar, duasAguas, paredeComVao, tambor,
  PEDRA, MADEIRA, MADEIRA_ESCURA, SACO, SACO_ESCURO, LONA
} from './construcao.js';

/**
 * Peças de campanha e o Posto do Rio.
 *
 * `sacaria` e `cabana` são compartilhadas: a praia usa as duas e o bunker usa
 * a primeira. O Posto do Rio mora aqui porque é a guarnição que elas montam.
 *
 * O que ele defende é a PASSAGEM, e é isso que o distingue do bunker: o
 * bunker é difícil de tomar, o posto é difícil de atravessar. Um se defende
 * de cima, o outro de frente, e a construção diz isso sem nenhuma placa.
 */

/** Fileira de sacos de areia. Cobertura baixa: agachado ela te esconde. */
export function sacaria(scene, colliders, {
  x, z, comprimento, aoLongoDeX, terrain, altura = 1.1, settling = null
}) {
  const unidade = 1.6;
  const quantos = Math.max(1, Math.round(comprimento / unidade));
  for (let i = 0; i < quantos; i++) {
    const passo = (i - (quantos - 1) / 2) * unidade;
    const px = x + (aoLongoDeX ? passo : 0);
    const pz = z + (aoLongoDeX ? 0 : passo);
    addBox(scene, colliders, {
      settling, x: px, z: pz, y: terrain.heightAt(px, pz) - 0.12,
      w: aoLongoDeX ? unidade : 0.75, h: altura, d: aoLongoDeX ? 0.75 : unidade,
      color: i % 2 ? SACO : SACO_ESCURO
    });
  }
}

/** Cabana de campanha: estrado de madeira, paredes baixas e lona por cima. */
export function cabana(scene, colliders, {
  x, z, terrain, settling = null, largura = 5.4, fundo = 3.8
}) {
  const { base } = assentar(terrain, x, z, 4);
  const y = base - 0.3;
  const H = 2.2;

  paredeComVao(scene, colliders, {
    settling, x, z: z + fundo / 2, y, largura, altura: H + 0.3, espessura: 0.24, soleira: 0.3,
    cor: MADEIRA, aoLongoDeX: true, vaoLargura: 1.1, vaoAltura: 1.95
  });
  addBox(scene, colliders, {
    settling, x, z: z - fundo / 2, y, w: largura, h: H + 0.3, d: 0.24, color: MADEIRA
  });
  for (const lado of [-1, 1]) {
    addBox(scene, colliders, {
      settling, x: x + lado * largura / 2, z, y, w: 0.24, h: H + 0.3, d: fundo,
      color: MADEIRA_ESCURA
    });
  }
  duasAguas(scene, colliders, {
    x, y: y + H + 0.3, z, w: largura, d: fundo, altura: 1.2, cor: LONA,
    beiral: 0.25, aoLongoDeX: true
  });
}

/**
 * Posto do Rio: casa de observação virada pra ponte, mais a guarnição.
 *
 * A casa é de PEDRA e tem dois pisos de altura porque o que ela faz é ver: da
 * cabeceira, ela alcança a ponte inteira e as duas margens. As cabanas ficam
 * atrás dela, do lado de quem defende — guarnição na frente da posição de
 * tiro seria a própria tropa tapando a linha.
 */
export function addPostoDoRio(scene, colliders, { x, z, terrain, settling = null }) {
  const rng = sorteioFixo(20250907);
  const W = 7.4;
  const D = 6.2;
  const H = 6.2;
  const { base } = assentar(terrain, x, z - 14, 7);
  const y = base - 0.4;

  // Frente virada pro rio (-Z): a fresta larga é o posto de observação.
  paredeComVao(scene, colliders, {
    settling, x, z: z - 14 - D / 2, y, largura: W, altura: H + 0.4,
    espessura: 0.4, soleira: 0.4, cor: PEDRA, aoLongoDeX: true,
    vaoLargura: 3.4, vaoAltura: 2.4, peitoril: 1.1
  });
  paredeComVao(scene, colliders, {
    settling, x, z: z - 14 + D / 2, y, largura: W, altura: H + 0.4,
    espessura: 0.4, soleira: 0.4, cor: PEDRA, aoLongoDeX: true, vaoLargura: 1.2, vaoAltura: 2.1
  });
  for (const lado of [-1, 1]) {
    paredeComVao(scene, colliders, {
      settling, x: x + lado * W / 2, z: z - 14, y, largura: D, altura: H + 0.4,
      espessura: 0.4, soleira: 0.4, cor: PEDRA, aoLongoDeX: false,
      vaoLargura: 1.1, vaoAltura: 1.15, peitoril: 0.95
    });
  }
  duasAguas(scene, colliders, {
    x, y: y + H + 0.4, z: z - 14, w: W, d: D, altura: 2.6, aoLongoDeX: true
  });

  cabana(scene, colliders, { x: x - 13, z: z + 6, terrain, settling });
  cabana(scene, colliders, { x: x + 12, z: z + 8, terrain, settling });
  cabana(scene, colliders, { x: x - 4, z: z + 21, terrain, settling, largura: 6.6 });

  sacaria(scene, colliders, { terrain, settling, x: x - 9, z: z - 22, comprimento: 11, aoLongoDeX: true });
  sacaria(scene, colliders, { terrain, settling, x: x + 9, z: z - 22, comprimento: 11, aoLongoDeX: true });

  for (let i = 0; i < 5; i++) {
    const px = x + (rng() * 2 - 1) * 16;
    const pz = z + 12 + rng() * 10;
    tambor(scene, colliders, { x: px, z: pz, ground: terrain.heightAt(px, pz) });
  }
}
