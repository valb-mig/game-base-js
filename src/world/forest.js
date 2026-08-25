import * as THREE from 'three';
import { WORLD } from '../config.js';
import { material, CONE, CYLINDER, ROCK } from './props.js';

/**
 * Floresta e pedras.
 *
 * São centenas de objetos iguais, então vão como InstancedMesh: três draw
 * calls pra floresta inteira em vez de uma por árvore. Cada tronco entra na
 * lista de colisores como AABB — a copa não, senão o jogador bate no ar.
 */

// espalha com rejeição: sorteia, e descarta o que cai em água, praia ou área ocupada
function scatter(count, { heightAt, minHeight, blocked, rng }) {
  const spots = [];
  const limit = WORLD.ISLAND_RADIUS * 0.99;
  let attempts = 0;

  while (spots.length < count && attempts < count * 40) {
    attempts++;
    const angle = rng() * Math.PI * 2;
    // raiz da uniforme espalha por área, não por raio — senão amontoa no centro
    const radius = Math.sqrt(rng()) * limit;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const y = heightAt(x, z);
    if (y < minHeight) continue;
    if (blocked(x, z)) continue;
    spots.push({ x, y, z, rng: rng() });
  }
  return spots;
}

export function addForest(scene, colliders, { heightAt, blocked, rng, settling = null }) {
  const trees = scatter(WORLD.TREE_COUNT, { heightAt, minHeight: WORLD.TREE_LINE, blocked, rng });
  const rocks = scatter(WORLD.ROCK_COUNT, { heightAt, minHeight: 0.2, blocked, rng });

  const trunks = new THREE.InstancedMesh(CYLINDER, material(WORLD.TRUNK_COLOR), trees.length);
  const lower = new THREE.InstancedMesh(CONE, material(WORLD.TREE_COLOR), trees.length);
  const upper = new THREE.InstancedMesh(CONE, material(WORLD.TREE_COLOR), trees.length);
  const stones = new THREE.InstancedMesh(ROCK, material(WORLD.ROCK_COLOR), rocks.length);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  const place = (mesh, index, x, y, z, sx, sy, sz, spin = 0) => {
    position.set(x, y, z);
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin);
    scale.set(sx, sy, sz);
    mesh.setMatrixAt(index, matrix.compose(position, quaternion, scale));
  };

  trees.forEach((tree, i) => {
    const size = 0.75 + tree.rng * 0.9;
    const trunkHeight = 2.6 * size;
    const trunkRadius = 0.2 * size;
    const canopy = 5.4 * size;
    const spin = tree.rng * Math.PI * 2;

    place(trunks, i, tree.x, tree.y + trunkHeight / 2, tree.z, trunkRadius, trunkHeight, trunkRadius, spin);
    place(lower, i, tree.x, tree.y + trunkHeight + canopy * 0.28, tree.z,
      1.9 * size, canopy * 0.62, 1.9 * size, spin);
    place(upper, i, tree.x, tree.y + trunkHeight + canopy * 0.66, tree.z,
      1.3 * size, canopy * 0.55, 1.3 * size, spin + 0.4);

    // colisor só do tronco, com folga: bater na copa seria bater no ar
    const half = trunkRadius * 1.5;
    const collider = {
      box: new THREE.Box3(
        new THREE.Vector3(tree.x - half, tree.y, tree.z - half),
        new THREE.Vector3(tree.x + half, tree.y + trunkHeight + canopy, tree.z + half)
      ),
      standable: false
    };
    colliders.push(collider);

    // Uma árvore são três instâncias que têm que cair juntas. Descalçá-la
    // com a pá derruba as três e o colisor.
    settling?.register({
      x: tree.x, z: tree.z, baseY: tree.y, radius: 1.1 * size, collider,
      parts: [
        { mesh: trunks, index: i, instanced: true },
        { mesh: lower, index: i, instanced: true },
        { mesh: upper, index: i, instanced: true }
      ]
    });
  });

  rocks.forEach((rock, i) => {
    const size = 0.5 + rock.rng * 1.5;
    place(stones, i, rock.x, rock.y + size * 0.35, rock.z, size, size * 0.7, size * 1.1, rock.rng * 6);
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

  for (const mesh of [trunks, lower, upper, stones]) {
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }

  return { trees: trees.length, rocks: rocks.length };
}
