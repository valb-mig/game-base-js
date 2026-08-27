import * as THREE from 'three';
import { WORLD } from '../config.js';
import { colorAt, declividadeAt } from './ground.js';
import * as serra from './serra.js';

/**
 * A banda de transição entre a malha FINA do terreno e a GROSSA do anel.
 *
 * Ela existe por causa de uma fenda que a primeira captura mostrou como uma
 * linha azul atravessando o quadro na altura da borda do mapa — era o MAR
 * aparecendo entre o terreno e o anel.
 *
 * A causa não é bug, é resolução. O terreno é amostrado a 2,5 m e o anel a 25:
 * nos 25 m entre dois vértices do anel a aresta dele é uma CORDA reta enquanto
 * a do terreno segue a curva, e onde as duas não coincidem sobra buraco.
 * Medido nas 320 cordas do perímetro: mediana 1,9 cm e p90 9,9 cm (invisível),
 * mas p99 1,25 m e pior 2,46 m — e as onze cordas acima de 30 cm estão TODAS
 * nas duas fozes do rio, nas bordas leste e oeste, onde o canal desce 0,27 numa
 * faixa de 26 m que uma corda de 25 m não vê.
 *
 * Duas saídas foram tentadas e descartadas, as duas MEDIDAS:
 *
 * - Uma cortina vertical descendo da borda tapava a fenda pra BAIXO e não pra
 *   cima, e o que se via passou de linha azul a linha escura — trocar o mar
 *   pela saia não é consertar.
 * - Prender a fileira interna do anel no MÍNIMO da aresta sobre a própria
 *   célula torna a desigualdade um teorema, mas o preço é o anel afundar o
 *   relevo local de 50 m: medido, 43 dos 324 vértices da fileira afundavam mais
 *   de 1 m, 23 mais de 2 e o pior 8,4 — uma vala cavada ao longo da escarpa e
 *   das duas fozes, que é pior que a fenda.
 *
 * O que fecha é não ter transição de resolução em aresta nenhuma. Esta banda
 * tem 25 m de largura, a aresta de DENTRO amostrada no passo do TERRENO (então
 * é a mesma poligonal dele, vértice por vértice) e a de FORA no passo do ANEL
 * (então é a mesma poligonal do anel). O leque de triângulos entre as duas é o
 * único lugar do mapa onde as duas resoluções se encontram, e ali elas se
 * encontram DENTRO de uma superfície, não numa borda livre. Zero fenda por
 * construção, e não "fenda pequena".
 */
export function addCostura(scene, terrain) {
  const { BORDA, PASSO, BANDA } = serra;
  const MATA = new THREE.Color(WORLD.FOLHA_COLOR);

  // O passo do TERRENO. Ele é quem manda na aresta de dentro.
  const FINO = WORLD.SIZE / WORLD.TERRAIN_SEGMENTS;
  const finos = Math.round((2 * BORDA) / FINO);      // segmentos da aresta fina
  const grossos = Math.round((2 * BORDA) / PASSO);   // segmentos da aresta grossa
  const porGrosso = finos / grossos;                 // finos dentro de um grosso

  const altura = (x, z) => serra.alturaDoHorizonte(terrain.naturalHeight, x, z);

  /**
   * Os quatro lados, como (t, fora) -> (x, z), com t em 0..1 ao longo da borda
   * e `fora` em metros pra fora do quadrado.
   */
  const lados = [
    (t, fora) => [-BORDA + t * 2 * BORDA, -BORDA - fora],
    (t, fora) => [-BORDA + t * 2 * BORDA, BORDA + fora],
    (t, fora) => [-BORDA - fora, -BORDA + t * 2 * BORDA],
    (t, fora) => [BORDA + fora, -BORDA + t * 2 * BORDA]
  ];

  const porLado = (finos + 1) + (grossos + 1);
  const posicoes = new Float32Array(lados.length * porLado * 3);
  const cores = new Float32Array(lados.length * porLado * 3);
  const indices = new Uint32Array(lados.length * grossos * (porGrosso + 1) * 3);
  const cor = new THREE.Color();

  let v = 0;
  let n = 0;

  /** Área com sinal no plano XZ. Positiva = anti-horário visto de cima. */
  const area = (a, b, c) => {
    const ax = posicoes[a * 3];
    const az = posicoes[a * 3 + 2];
    return (posicoes[b * 3] - ax) * (posicoes[c * 3 + 2] - az)
      - (posicoes[c * 3] - ax) * (posicoes[b * 3 + 2] - az);
  };

  /**
   * Emite o triângulo já com o enrolamento certo.
   *
   * O sinal sai da GEOMETRIA e não de um `if` por lado. São quatro lados com
   * orientações diferentes, e o `flatShading` deriva a normal do enrolamento:
   * errar num deles pinta aquela borda de preto, e é o tipo de erro que passa
   * por qualquer teste que só conte triângulo.
   */
  const emite = (a, b, c) => {
    const [p, q] = area(a, b, c) < 0 ? [c, b] : [b, c];
    indices[n++] = a; indices[n++] = p; indices[n++] = q;
  };

  for (const lado of lados) {
    const baseFina = v;
    for (let k = 0; k <= finos; k++) {
      const [x, z] = lado(k / finos, 0);
      // `naturalHeight` e não `heightAt`: medido em 2000 pontos do perímetro os
      // dois dão exatamente a mesma altura ali (nenhuma zona plana chega perto
      // da borda), e é o que o anel também usa — uma fonte só pros dois lados.
      const y = terrain.naturalHeight(x, z);
      posicoes[v * 3] = x;
      posicoes[v * 3 + 1] = y;
      posicoes[v * 3 + 2] = z;
      // A declividade no passo do terreno, como no anel e na malha do chão: é a
      // única medida de declividade do projeto.
      cor.set(colorAt(y, declividadeAt(altura, x, z)));
      cor.lerp(MATA, serra.mataAt(x, z));
      cor.toArray(cores, v * 3);
      v++;
    }

    const baseGrossa = v;
    for (let k = 0; k <= grossos; k++) {
      const [x, z] = lado(k / grossos, BANDA);
      const y = altura(x, z);
      posicoes[v * 3] = x;
      posicoes[v * 3 + 1] = y;
      posicoes[v * 3 + 2] = z;
      cor.set(colorAt(y, declividadeAt(altura, x, z)));
      cor.lerp(MATA, serra.mataAt(x, z));
      cor.toArray(cores, v * 3);
      v++;
    }

    // O leque: cada segmento grosso abraça os `porGrosso` finos debaixo dele.
    for (let k = 0; k < grossos; k++) {
      const fora = baseGrossa + k;
      for (let s = 0; s < porGrosso; s++) {
        const dentro = baseFina + k * porGrosso + s;
        emite(fora, dentro, dentro + 1);
      }
      emite(fora, baseFina + (k + 1) * porGrosso, fora + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
    vertexColors: true, flatShading: true
  }));
  mesh.name = 'costura';
  mesh.frustumCulled = false;
  scene.add(mesh);

  return {
    mesh,
    stats: {
      fino: FINO, grosso: PASSO, largura: BANDA,
      vertices: v, triangulos: n / 3
    }
  };
}
