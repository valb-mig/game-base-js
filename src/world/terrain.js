import * as THREE from 'three';
import { WORLD } from '../config.js';
import { createHeightfield, colorAt } from './heightfield.js';

/**
 * Malha do terreno. A geometria é só o desenho do campo de altura — a
 * colisão amostra `heightAt` direto, então o jogador pisa exatamente onde o
 * terreno aparenta estar, independente da resolução da malha.
 */
export function createTerrain(flatZones = []) {
  const field = createHeightfield(flatZones);

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

      // areia mais escura debaixo d'água, pra beirada ficar legível
      color.set(colorAt(height));
      if (height < WORLD.WATER_LEVEL) color.multiplyScalar(0.62);
      color.toArray(colors, i * 3);
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    );
    mesh.name = 'terreno';
    return mesh;
  }

  return { ...field, buildMesh };
}
