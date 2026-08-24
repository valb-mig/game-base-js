import * as THREE from 'three';
import { WORLD } from '../config.js';

// Geometria compartilhada por todas as caixas da pista.
const BOX = new THREE.BoxGeometry(1, 1, 1);

/** A pista fica num corredor reservado; props aleatórios não caem em cima. */
export function insideCourse(x, z) {
  return Math.abs(x) < WORLD.COURSE_HALF_WIDTH && z < 2 && z > WORLD.COURSE_END_Z;
}

/** Caixa alinhada aos eixos posicionada pela base, não pelo centro. */
function addSlab(scene, colliders, { x, z, y, w, d, h, color, standable = true }) {
  const mesh = new THREE.Mesh(
    BOX,
    new THREE.MeshLambertMaterial({ color, flatShading: true })
  );
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y + h / 2, z);
  scene.add(mesh);
  mesh.updateMatrixWorld(true);

  colliders.push({ box: new THREE.Box3().setFromObject(mesh), standable });
  return mesh;
}

// Placa flutuante desenhada num canvas — só decoração, sem colisor.
function addLabel(scene, text, x, y, z) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(15, 20, 15, 0.75)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
  sprite.position.set(x, y, z);
  sprite.scale.set(3.4, 0.85, 1);
  scene.add(sprite);
}

/**
 * Pista reta na frente do spawn (o jogador nasce olhando pro -Z).
 * Cada estação isola uma combinação de comandos:
 *   escada       -> degrau automático enquanto anda ou corre
 *   salto largo  -> vão de 3,2 m: só passa correndo + pulando
 *   túnel        -> teto a 1,05 m: só passa agachado
 *   passagem alta-> plataforma a 1 m sob teto a 2,4 m: só passa pulando agachado
 *   rastejo      -> teto a 0,7 m: agachado não passa, só deitado
 */
export function addTestCourse(scene, colliders) {
  const [RED, AMBER, BLUE, PURPLE, BONE] = WORLD.PALETTE;

  // 1. escada — 5 degraus de 0,3 m (STEP_HEIGHT sobe sozinho)
  for (let i = 0; i < 5; i++) {
    addSlab(scene, colliders, {
      x: 0, z: -8 - i * 1.2, y: 0, w: 4, d: 1.2, h: 0.3 * (i + 1), color: BONE
    });
  }
  addSlab(scene, colliders, { x: 0, z: -15.2, y: 0, w: 4, d: 2.4, h: 1.5, color: BONE });
  addLabel(scene, 'escada · andar/correr', 0, 3.2, -11);

  // 2. salto largo — 4 m de vão livre entre plataformas de 1,5 m.
  // Andando o alcance é ~3,3 m; correndo, ~5,6 m. Só passa correndo.
  addSlab(scene, colliders, { x: 0, z: -23.2, y: 0, w: 4, d: 4, h: 1.5, color: AMBER });
  addLabel(scene, 'salto largo · correr + pular', 0, 3.6, -19);

  // 3. túnel agachado — vão livre de 1,05 m (de pé são 1,7)
  addSlab(scene, colliders, { x: -2.5, z: -30, y: 0, w: 1, d: 4, h: 2.4, color: BLUE });
  addSlab(scene, colliders, { x: 2.5, z: -30, y: 0, w: 1, d: 4, h: 2.4, color: BLUE });
  addSlab(scene, colliders, {
    x: 0, z: -30, y: 1.05, w: 6, d: 4, h: 1.35, color: BLUE, standable: false
  });
  addLabel(scene, 'tunel · agachar (Ctrl)', 0, 3.6, -27.5);

  // 4. passagem alta — degrau de 1 m sob teto de 2,4 m. De pé a cabeça bate
  // (1 + 1,7); agachado no ar cabe (1 + 0,95). É o crouch-jump.
  addSlab(scene, colliders, { x: 0, z: -38, y: 0, w: 5, d: 4, h: 1, color: PURPLE });
  addSlab(scene, colliders, {
    x: 0, z: -38, y: 2.4, w: 5, d: 4, h: 0.6, color: PURPLE, standable: false
  });
  addSlab(scene, colliders, { x: -3, z: -38, y: 0, w: 1, d: 4, h: 3, color: PURPLE });
  addSlab(scene, colliders, { x: 3, z: -38, y: 0, w: 1, d: 4, h: 3, color: PURPLE });
  addLabel(scene, 'passagem alta · pular agachado', 0, 4.5, -35);

  // 5. rastejo — vão livre de 0,7 m: agachado (0,95) não passa, deitado (0,5) sim
  addSlab(scene, colliders, { x: -2.5, z: -46, y: 0, w: 1, d: 5, h: 1.6, color: RED });
  addSlab(scene, colliders, { x: 2.5, z: -46, y: 0, w: 1, d: 5, h: 1.6, color: RED });
  addSlab(scene, colliders, {
    x: 0, z: -46, y: 0.7, w: 6, d: 5, h: 0.9, color: RED, standable: false
  });
  addLabel(scene, 'rastejo · deitar (Z)', 0, 3.2, -43);

  // 6. reta livre pra sentir aceleração e inércia
  addSlab(scene, colliders, { x: -4, z: -52, y: 0, w: 0.4, d: 0.4, h: 2, color: BONE });
  addSlab(scene, colliders, { x: 4, z: -52, y: 0, w: 0.4, d: 0.4, h: 2, color: BONE });
  addLabel(scene, 'reta · soltar tecla e deslizar', 0, 3.2, -52);
}
