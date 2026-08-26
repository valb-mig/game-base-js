import * as THREE from 'three';
import { WORLD } from '../config.js';
import { espalhar, material, ROCK, sorteioFixo } from './props.js';
import { GRAMA, TERRA } from './ground.js';
import { densidadeFloresta } from './densidade.js';
import { addArvores } from './arvores.js';

/**
 * Floresta e pedras.
 *
 * São centenas de objetos iguais, então vão como InstancedMesh: sete draw
 * calls pro mato inteiro em vez de uma por planta. As árvores em si moram em
 * `arvores.js` — são duas espécies em três portes, e isso já é arquivo.
 */

export function addForest(scene, colliders, { heightAt, tipoAt, blocked, rng, settling = null }) {
  // Árvore só em grama, e ainda por cima só onde a máscara de floresta deixa:
  // a mesma conta de árvores concentrada em manchas em vez de espalhada
  // parelha. É o que faz existir campo aberto pra atravessar e mata pra se
  // meter dentro. Água e estrada saem de graça — `tipoAt` já as classifica
  // como chão que não é grama.
  //
  // Pedra NÃO segue a máscara, de propósito: ela não é vegetação, e no campo
  // aberto é a única cobertura que sobra. Amarrar pedra à floresta deixaria o
  // campo sem nada atrás de que se agachar. Pedra também nasce em terra:
  // barranco pelado com pedra solta é o que barranco parece.
  const trees = espalhar(WORLD.TREE_COUNT,
    { heightAt, tipoAt, tipos: [GRAMA], blocked, rng, densidade: densidadeFloresta });
  const rocks = espalhar(WORLD.ROCK_COUNT,
    { heightAt, tipoAt, tipos: [GRAMA, TERRA], blocked, rng });

  // Sorteio PRÓPRIO pra espécie e porte. O `rng` do ponto já foi gasto
  // decidindo se ele vingava contra a máscara de densidade; reusá-lo amarraria
  // o porte da árvore à densidade da mata em volta, e a mata fechada nasceria
  // toda de um tamanho só.
  const especies = addArvores(scene, colliders, {
    spots: trees, dado: sorteioFixo(20250901), settling
  });

  const stones = new THREE.InstancedMesh(ROCK, material(WORLD.ROCK_COLOR), rocks.length);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const escala = new THREE.Vector3();
  const eixoY = new THREE.Vector3(0, 1, 0);

  rocks.forEach((rock, i) => {
    const size = 0.5 + rock.rng * 1.5;
    position.set(rock.x, rock.y + size * 0.35, rock.z);
    quaternion.setFromAxisAngle(eixoY, rock.rng * 6);
    escala.set(size, size * 0.7, size * 1.1);
    stones.setMatrixAt(i, matrix.compose(position, quaternion, escala));

    const collider = {
      box: new THREE.Box3(
        new THREE.Vector3(rock.x - size, rock.y, rock.z - size),
        new THREE.Vector3(rock.x + size, rock.y + size * 0.9, rock.z + size)
      ),
      standable: true
    };
    colliders.push(collider);

    settling?.register({
      x: rock.x, z: rock.z, baseY: rock.y, radius: size, collider,
      parts: [{ mesh: stones, index: i, instanced: true }]
    });
  });

  stones.instanceMatrix.needsUpdate = true;
  scene.add(stones);

  return { trees: trees.length, rocks: rocks.length, ...especies };
}
