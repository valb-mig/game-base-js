import * as THREE from 'three';
import { WORLD } from '../config.js';
import { addTestCourse, insideCourse } from './course.js';

// Geometrias compartilhadas entre todos os props — uma alocação só.
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CONE = new THREE.ConeGeometry(1, 1, 6);

function addGround(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.SIZE, WORLD.SIZE),
    new THREE.MeshLambertMaterial({ color: WORLD.GROUND_COLOR })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  scene.add(new THREE.GridHelper(WORLD.SIZE, WORLD.SIZE / 4, WORLD.GRID_COLOR, WORLD.GRID_COLOR));
}

// Sorteia uma posição no mapa deixando o spawn e a pista livres.
function randomSpot() {
  let x, z;
  do {
    x = (Math.random() - 0.5) * WORLD.SIZE * 0.9;
    z = (Math.random() - 0.5) * WORLD.SIZE * 0.9;
  } while (Math.hypot(x, z) < WORLD.SPAWN_CLEARANCE || insideCourse(x, z));
  return { x, z };
}

function createProp(index) {
  const isTree = Math.random() < 0.5;

  const mesh = new THREE.Mesh(
    isTree ? CONE : BOX,
    new THREE.MeshLambertMaterial({
      color: isTree ? WORLD.TREE_COLOR : WORLD.PALETTE[index % WORLD.PALETTE.length],
      flatShading: true
    })
  );

  // caixas ficam baixas o bastante pra virar plataforma pulável
  const height = isTree ? 3 + Math.random() * 5 : 0.6 + Math.random() * 2.2;
  const width = isTree ? 1 + Math.random() : 1 + Math.random() * 3;
  mesh.scale.set(width, height, width);

  const { x, z } = randomSpot();
  mesh.position.set(x, height / 2, z);

  // girar o cone não mudaria a AABB, então só as caixas rotacionam
  if (!isTree) mesh.rotation.y = Math.random() * Math.PI;

  return { mesh, isTree };
}

/**
 * Popula a cena e devolve a lista de colisores.
 * Cada colisor é uma AABB; `standable` diz se dá pra ficar em cima.
 */
export function buildWorld(scene) {
  addGround(scene);

  const colliders = [];
  addTestCourse(scene, colliders);

  for (let i = 0; i < WORLD.PROP_COUNT; i++) {
    const { mesh, isTree } = createProp(i);
    scene.add(mesh);
    mesh.updateMatrixWorld(true);

    colliders.push({
      box: new THREE.Box3().setFromObject(mesh),
      standable: !isTree
    });
  }

  return colliders;
}
