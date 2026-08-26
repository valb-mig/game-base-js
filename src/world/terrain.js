import * as THREE from 'three';
import { WORLD } from '../config.js';
import { createHeightfield, turnedSoil } from './heightfield.js';
import { colorAt } from './ground.js';

/**
 * Malha do terreno. A geometria é só o desenho do campo de altura — a
 * colisão amostra `heightAt` direto, então o jogador pisa exatamente onde o
 * terreno aparenta estar, independente da resolução da malha.
 */
const SOIL = new THREE.Color(WORLD.SOIL_COLOR);
const LADO = WORLD.TERRAIN_SEGMENTS + 1;   // vértices por lado
const PASSO = WORLD.SIZE / WORLD.TERRAIN_SEGMENTS;

export function createTerrain(flatZones = [], deform = null, perfil = 'sainte-mere') {
  const field = createHeightfield(flatZones, deform, perfil);

  function buildMesh() {
    const geometry = new THREE.PlaneGeometry(
      WORLD.SIZE, WORLD.SIZE, WORLD.TERRAIN_SEGMENTS, WORLD.TERRAIN_SEGMENTS
    );
    geometry.rotateX(-Math.PI / 2); // o plano nasce em pé

    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const color = new THREE.Color();

    // Alturas indexadas pela GRADE, não pelo buffer.
    //
    // A cor do vértice depende da declividade, e declividade é diferença
    // entre vizinhos: sem saber quem é vizinho de quem, cada vértice pagaria
    // quatro consultas novas ao campo de altura, e os 641 mil vértices desta
    // malha transformariam isso em segundos de boot. Aqui a altura é lida uma
    // vez, guardada na grade, e a declividade sai de subtração.
    const alturas = new Float32Array(LADO * LADO);

    // Mapa índice-da-grade -> vértice do buffer, feito uma vez.
    //
    // O sentido importa: com o mapa ao contrário, cada pazada varreria os 641
    // mil vértices atrás dos poucos que mudaram. Assim ela vai direto neles,
    // e o custo passa a ser o tamanho da pazada, não o do mapa.
    const verticeDaGrade = new Int32Array(LADO * LADO).fill(-1);

    const coluna = (x) => Math.round((x + WORLD.SIZE / 2) / PASSO);
    const linha = (z) => Math.round((z + WORLD.SIZE / 2) / PASSO);
    const dentro = (v) => Math.min(LADO - 1, Math.max(0, v));
    const alturaNa = (col, lin) => alturas[dentro(lin) * LADO + dentro(col)];

    /** Declividade em metro por metro, por diferença central na grade. */
    function declive(col, lin) {
      const dx = (alturaNa(col + 1, lin) - alturaNa(col - 1, lin)) / (2 * PASSO);
      const dz = (alturaNa(col, lin + 1) - alturaNa(col, lin - 1)) / (2 * PASSO);
      return Math.hypot(dx, dz);
    }

    /** Pinta o vértice pelo tipo de chão, escurecendo onde foi mexido. */
    function pintar(i, x, z, altura, declividade) {
      // Sob a lâmina LOCAL, não sob a constante: o leito do rio está a 10 m,
      // muito acima do zero do mar, e comparado com `WATER_LEVEL` ele saía
      // com cor de capim seco por baixo de dois metros e meio de água.
      const submerso = altura < field.nivelDaAguaAt(x, z);

      // Estrada não é pintada debaixo d'água. A pista cruza o rio POR CIMA,
      // na ponte, e asfaltar o leito contaria a mentira de que dá pra passar
      // ali a pé — que é exatamente o que a ponte existe pra desmentir.
      const estrada = submerso ? 0 : field.estradaAt(x, z);
      color.set(colorAt(altura, declividade, estrada,
        estrada > 0 ? field.corDeEstradaAt(x, z) : null));
      if (submerso) color.multiplyScalar(0.62);
      if (deform) {
        color.lerp(SOIL, turnedSoil(deform.deltaAt(x, z), deform.revolvidoAt(x, z)));
      }
      color.toArray(colors, i * 3);
    }

    // Altura primeiro, cor depois: a cor de um vértice depende dos vizinhos,
    // e pintar no mesmo laço leria vizinho de altura zero à direita e abaixo.
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const altura = field.heightAt(x, z);
      position.setY(i, altura);

      const grade = linha(z) * LADO + coluna(x);
      alturas[grade] = altura;
      verticeDaGrade[grade] = i;
    }

    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const col = coluna(x);
      const lin = linha(z);
      pintar(i, x, z, alturas[lin * LADO + col], declive(col, lin));
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    );
    mesh.name = 'terreno';

    /**
     * Reescreve os vértices afetados por uma pazada.
     *
     * Custo proporcional ao tamanho da pazada, não ao do mapa: meia dúzia de
     * vértices, uma faixa do buffer marcada como suja e nada mais. Nenhum
     * polígono novo entra na cena — escavar o mapa inteiro não muda a
     * contagem de triângulos em um.
     *
     * A cor sai um anel além do que a pazada tocou: a declividade de um
     * vértice depende dos vizinhos, então afundar um ponto muda a cor de quem
     * está em volta dele mesmo sem mudar a altura deles. Sem esse anel, a
     * borda do buraco ficava com a cor da grama que já não existe ali.
     */
    function applyEdit(indices) {
      if (!deform || indices.length === 0) return 0;

      // altura de todos os tocados antes de qualquer declividade: um vértice
      // do meio da pazada tem vizinho que também mudou neste mesmo quadro
      let mexidos = 0;
      for (const grade of indices) {
        const i = verticeDaGrade[grade];
        if (i < 0) continue;
        const altura = field.heightAt(position.getX(i), position.getZ(i));
        position.setY(i, altura);
        alturas[grade] = altura;
        mexidos++;
      }
      if (mexidos === 0) return 0;

      let menor = Infinity;
      let maior = -Infinity;
      const pintados = new Set();

      for (const grade of indices) {
        const col = grade % LADO;
        const lin = (grade - col) / LADO;

        for (let dl = -1; dl <= 1; dl++) {
          for (let dc = -1; dc <= 1; dc++) {
            const vizinho = dentro(lin + dl) * LADO + dentro(col + dc);
            if (pintados.has(vizinho)) continue;
            pintados.add(vizinho);

            const i = verticeDaGrade[vizinho];
            if (i < 0) continue;

            const x = position.getX(i);
            const z = position.getZ(i);
            pintar(i, x, z, alturas[vizinho],
              declive(vizinho % LADO, (vizinho - vizinho % LADO) / LADO));

            if (i < menor) menor = i;
            if (i > maior) maior = i;
          }
        }
      }

      position.addUpdateRange(menor * 3, (maior - menor + 1) * 3);
      position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;

      // Nem normais nem esfera envolvente são recalculadas de propósito:
      //
      // O terreno é flatShading, e nesse modo o shader deriva a normal por
      // face a partir da própria posição — o atributo de normal é ignorado.
      // Recalculá-lo varria os vértices todos e custava 11,7 ms por pazada,
      // contra 0,04 ms sem ele.
      //
      // A esfera envolvente cobre a ilha inteira desde a montagem, e uma
      // pazada mexe centímetros dentro dela: refazê-la seria outra varredura
      // completa pra não mudar nada que o descarte por frustum enxergue.
      return mexidos;
    }

    return { mesh, applyEdit };
  }

  return { ...field, buildMesh };
}
