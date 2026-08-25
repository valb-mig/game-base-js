import * as THREE from 'three';
import { WORLD } from '../config.js';
import { createHeightfield, colorAt, turnedSoil } from './heightfield.js';

/**
 * Malha do terreno. A geometria é só o desenho do campo de altura — a
 * colisão amostra `heightAt` direto, então o jogador pisa exatamente onde o
 * terreno aparenta estar, independente da resolução da malha.
 */
const SOIL = new THREE.Color(WORLD.SOIL_COLOR);

export function createTerrain(flatZones = [], deform = null, perfil = 'sainte-mere') {
  const field = createHeightfield(flatZones, deform, perfil);

  /** Pinta o vértice pela altura, escurecendo pra terra onde foi mexido. */
  function paint(color, x, z, altura) {
    color.set(colorAt(altura));
    if (altura < WORLD.WATER_LEVEL) color.multiplyScalar(0.62);
    if (deform) {
      color.lerp(SOIL, turnedSoil(deform.deltaAt(x, z), deform.revolvidoAt(x, z)));
    }
    return color;
  }

  function buildMesh() {
    const geometry = new THREE.PlaneGeometry(
      WORLD.SIZE, WORLD.SIZE, WORLD.TERRAIN_SEGMENTS, WORLD.TERRAIN_SEGMENTS
    );
    geometry.rotateX(-Math.PI / 2); // o plano nasce em pé

    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const color = new THREE.Color();

    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const height = field.heightAt(x, z);
      position.setY(i, height);
      paint(color, x, z, height).toArray(colors, i * 3);
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    );
    mesh.name = 'terreno';

    // Mapa índice-da-grade -> vértice do buffer, feito uma vez.
    //
    // O sentido importa: com o mapa ao contrário, cada pazada varreria os 32
    // mil vértices atrás dos quatro que mudaram. Assim ela vai direto neles,
    // e o custo passa a ser o tamanho da pazada, não o do mapa.
    const verticeDaGrade = deform ? new Int32Array(deform.lado * deform.lado).fill(-1) : null;
    if (deform) {
      const passo = WORLD.SIZE / WORLD.TERRAIN_SEGMENTS;
      for (let i = 0; i < position.count; i++) {
        const col = Math.round((position.getX(i) + WORLD.SIZE / 2) / passo);
        const lin = Math.round((position.getZ(i) + WORLD.SIZE / 2) / passo);
        verticeDaGrade[lin * deform.lado + col] = i;
      }
    }

    /**
     * Reescreve os vértices afetados por uma pazada.
     *
     * Custo proporcional ao tamanho da pazada, não ao do mapa: meia dúzia de
     * vértices, uma faixa do buffer marcada como suja e nada mais. Nenhum
     * polígono novo entra na cena — escavar o mapa inteiro não muda a
     * contagem de triângulos em um.
     */
    function applyEdit(indices) {
      if (!deform || indices.length === 0) return 0;

      let menor = Infinity;
      let maior = -Infinity;
      let mexidos = 0;

      for (const grade of indices) {
        const i = verticeDaGrade[grade];
        if (i < 0) continue;

        const x = position.getX(i);
        const z = position.getZ(i);
        const altura = field.heightAt(x, z);
        position.setY(i, altura);
        paint(color, x, z, altura).toArray(colors, i * 3);

        if (i < menor) menor = i;
        if (i > maior) maior = i;
        mexidos++;
      }

      if (mexidos === 0) return 0;

      position.addUpdateRange(menor * 3, (maior - menor + 1) * 3);
      position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;

      // Nem normais nem esfera envolvente são recalculadas de propósito:
      //
      // O terreno é flatShading, e nesse modo o shader deriva a normal por
      // face a partir da própria posição — o atributo de normal é ignorado.
      // Recalculá-lo varria os 32 mil vértices e custava 11,7 ms por pazada,
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
