import * as THREE from 'three';
import { WORLD } from '../config.js';
import { colorAt, declividadeAt } from './ground.js';
import * as serra from './serra.js';

/**
 * A malha do relevo falso: um anel RETANGULAR em volta do quadrado jogável.
 *
 * Retangular e não circular, e isso não é preguiça. O terreno é um quadrado de
 * 2 km: um anel de raio interno 1000 deixaria os cantos do quadrado (que estão
 * a 1414 m do centro) atravessando ele, duas superfícies quase coplanares
 * disputando o mesmo pixel; e um anel circular que começasse além dos cantos
 * deixaria um vazio de 414 m no meio de cada lado. É a mesma razão pela qual
 * ponte e casa giram 0° ou 90° nesta base — a geometria segue o eixo porque o
 * mapa segue o eixo.
 *
 * E é UMA grade só, com as linhas de ±BORDA cravadas nela, não quatro faixas
 * costuradas. A primeira versão eram quatro, e elas rachavam nas quinas: a
 * faixa norte dividia 4220 m em 169 passos (24,97 m) e a oeste dividia 1110 m
 * em 44 (25,23 m), então a aresta compartilhada tinha vértice em lugar
 * diferente nas duas. Numa grade única a fenda não existe pra ser consertada.
 *
 * O que este arquivo NÃO faz, de propósito:
 *
 * - não registra colisor: o anel é inalcançável (`locomotion.js` prende o
 *   jogador em `SIZE/2 - 1`) e caixa nenhuma dele existe pra a bala, pro corpo
 *   ou pro `standable`;
 * - não mexe em `heightfield.js` nem em `ground.js`: ele LÊ os dois, e nenhum
 *   dos dois sabe que ele existe;
 * - não entra em `settling` nem em `deform`: pazada não o alcança.
 *
 * A banda que fecha a costura com o terreno mora em `costura.js`: ela tem uma
 * aresta no passo do TERRENO e a outra no passo deste anel, e por isso é
 * assunto separado. O anel deixa a primeira fileira de células livre pra ela.
 */
export function addHorizonte(scene, terrain) {
  const { PASSO, BORDA, FORA, ABAS } = serra;
  const MATA = new THREE.Color(WORLD.FOLHA_COLOR);

  const altura = (x, z) => serra.alturaDoHorizonte(terrain.naturalHeight, x, z);

  /**
   * A grade é UNIFORME e o passo é exato: `FORA` sai de uma contagem inteira de
   * passos (ver `serra.ABAS`), então ±BORDA e ±(BORDA + PASSO) caem em cima de
   * linhas dela. É o que deixa a banda de `costura.js` encostar sem sobra.
   */
  const vao = Math.round((2 * BORDA) / PASSO);
  const meio = ABAS;              // índice da linha em -BORDA
  const fim = ABAS + vao;         // índice da linha em +BORDA
  const N = fim + ABAS + 1;       // coordenadas por eixo

  const eixo = new Float64Array(N);
  for (let k = 0; k < N; k++) eixo[k] = -FORA + k * PASSO;

  /**
   * O que o anel NÃO desenha: o quadrado jogável, mais a primeira fileira de
   * células em volta dele — essa é da banda de transição, e desenhá-la duas
   * vezes seria duas superfícies disputando o mesmo pixel.
   */
  const daBanda = (i, j) =>
    ((i >= meio && i < fim) && (j === meio - 1 || j === fim))
    || ((j >= meio && j < fim) && (i === meio - 1 || i === fim));
  const celulaDoAnel = (i, j) =>
    !(i >= meio && i < fim && j >= meio && j < fim) && !daBanda(i, j);
  // Vértice serve quando alguma célula em volta dele é do anel. Os de dentro
  // ficam sem calcular: são milhares de consultas de altura que ninguém desenha.
  const vertUsado = (i, j) => !(i > meio && i < fim && j > meio && j < fim);

  /** O vértice está na fileira interna, ou seja encostado na borda do mapa? */
  const posicoes = new Float32Array(N * N * 3);
  const cores = new Float32Array(N * N * 3);
  // Uma cor só, reusada. `colorAt` roda uma vez por vértice, e objeto novo aí
  // dentro é o que jogou 641 mil deles no coletor quando o chão foi pintado.
  const cor = new THREE.Color();

  // ------------------------------------------------------------------ tapete
  let vertices = 0;
  let triangulos = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      if (!vertUsado(i, j)) continue;
      const x = eixo[i];
      const z = eixo[j];
      const y = altura(x, z);
      const v = j * N + i;

      posicoes[v * 3] = x;
      posicoes[v * 3 + 1] = y;
      posicoes[v * 3 + 2] = z;

      // A declividade é medida no PASSO DO TERRENO (2,5 m), não no desta
      // malha. É a única medida de declividade do projeto, e a diferença não é
      // acadêmica: medido na fileira da costura, o passo de 25 m lê 0,168 onde
      // o de 2,5 lê 0,014 na foz do rio a oeste, e a cor pula 33 níveis de
      // grama pra terra num vértice só — a costura desenhada em marrom.
      cor.set(colorAt(y, declividadeAt(altura, x, z)));
      cor.lerp(MATA, serra.mataAt(x, z));
      cor.toArray(cores, v * 3);
      vertices++;
    }
  }

  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) if (celulaDoAnel(i, j)) triangulos += 2;
  }

  const indices = new Uint32Array(triangulos * 3);
  let n = 0;
  // Sentido anti-horário visto de CIMA: cross((d-a),(b-a)) aponta pro +Y. Ao
  // contrário o anel só apareceria de baixo, ou seja nunca.
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      if (!celulaDoAnel(i, j)) continue;
      const a = j * N + i;
      indices[n++] = a; indices[n++] = a + N; indices[n++] = a + 1;
      indices[n++] = a + 1; indices[n++] = a + N; indices[n++] = a + N + 1;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  // Mesmo material do terreno, MENOS a textura de grão: a mancha grossa do
  // grão é de 2 m, e a partir de umas dezenas de metros o mip entrega a média
  // dela — um filtro escuro uniforme, que é o que a medida do grão já mostrou.
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
    vertexColors: true, flatShading: true
  }));
  mesh.name = 'horizonte';
  // Ele nunca sai de vista e é uma malha só: testar o frustum dele é trabalho
  // por nada, e a esfera envolvente cobriria o mapa inteiro de qualquer jeito.
  mesh.frustumCulled = false;
  scene.add(mesh);

  return {
    mesh,
    /** O que a bancada precisa pra dizer se o anel vale o que custa. */
    stats: {
      malhas: 1,
      vertices,
      triangulos: n / 3,
      passo: PASSO,
      dentro: BORDA,
      fora: FORA
    }
  };
}
