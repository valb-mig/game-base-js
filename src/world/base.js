import * as THREE from 'three';
import { addBox, addLabel, material, PYRAMID, CYLINDER } from './props.js';

/**
 * Base militar de 1945: perímetro de sacos de areia com portão, torre de
 * observação com rampa, bunker, barracas e engradados.
 *
 * Tudo é caixa alinhada aos eixos, porque a colisão só entende AABB. A
 * rampa da torre sobe em degraus de 0,3 m, abaixo do STEP_HEIGHT, então o
 * jogador sobe andando — sem precisar de escada de verdade.
 */

const SANDBAG = 0x8a8259;
const SANDBAG_DARK = 0x736c49;
const WOOD = 0x6b4f33;
const WOOD_DARK = 0x4a3524;
const CANVAS_TENT = 0x707a52;
const CONCRETE = 0x8d8d84;

const HALF = 22;          // meia-largura do perímetro
const WALL_HEIGHT = 1.1;
const WALL_THICK = 0.7;
const GATE_HALF = 3.5;    // vão do portão

/** Fileira de sacos de areia, alternando o tom pra dar textura sem textura. */
function sandbagRun(scene, colliders, { settling, x, z, length, height, along, ground }) {
  const unit = 1.6;
  const count = Math.max(1, Math.round(length / unit));

  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * unit;
    const px = along === 'x' ? x + offset : x;
    const pz = along === 'x' ? z : z + offset;
    addBox(scene, colliders, {
      settling,
      x: px, y: ground, z: pz,
      w: along === 'x' ? unit : WALL_THICK,
      h: height,
      d: along === 'x' ? WALL_THICK : unit,
      color: i % 2 ? SANDBAG : SANDBAG_DARK
    });
  }
}

/** Torre de observação com rampa em degraus pra subir andando. */
function watchtower(scene, colliders, { settling, x, z, ground, color }) {
  const HEIGHT = 5.4;
  const LEG = 0.35;
  const PLATFORM = 3.2;

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addBox(scene, colliders, {
        settling,
        x: x + sx * (PLATFORM / 2 - LEG / 2), y: ground, z: z + sz * (PLATFORM / 2 - LEG / 2),
        w: LEG, h: HEIGHT, d: LEG, color: WOOD_DARK
      });
    }
  }

  addBox(scene, colliders, {
    settling,
    x, y: ground + HEIGHT, z, w: PLATFORM, h: 0.25, d: PLATFORM, color: WOOD
  });

  // guarda-corpo, aberto no lado da rampa
  const rail = 0.9;
  const edge = PLATFORM / 2 - 0.15;
  addBox(scene, colliders, { settling, x, y: ground + HEIGHT + 0.25, z: z - edge, w: PLATFORM, h: rail, d: 0.16, color: WOOD });
  addBox(scene, colliders, { settling, x: x - edge, y: ground + HEIGHT + 0.25, z, w: 0.16, h: rail, d: PLATFORM, color: WOOD });
  addBox(scene, colliders, { settling, x: x + edge, y: ground + HEIGHT + 0.25, z, w: 0.16, h: rail, d: PLATFORM, color: WOOD });

  // telhado
  addBox(scene, colliders, {
    settling,
    x, y: ground + HEIGHT + 2.2, z, w: PLATFORM + 0.6, h: 0.2, d: PLATFORM + 0.6, color: WOOD_DARK
  });
  for (const sx of [-1, 1]) {
    addBox(scene, colliders, {
      settling,
      x: x + sx * edge, y: ground + HEIGHT + 0.25, z: z + edge,
      w: 0.14, h: 1.95, d: 0.14, color: WOOD_DARK
    });
  }

  // rampa: degraus de 0,3 m, dentro do STEP_HEIGHT
  const STEP = 0.3;
  const steps = Math.round((HEIGHT + 0.25) / STEP);
  for (let i = 1; i <= steps; i++) {
    addBox(scene, colliders, {
      settling,
      x, y: ground, z: z + PLATFORM / 2 + (steps - i) * 0.55 + 0.4,
      w: 1.5, h: STEP * i, d: 0.55, color: i % 2 ? WOOD : WOOD_DARK
    });
  }

  // mastro com bandeira do time, visível de longe
  addBox(scene, colliders, {
    settling,
    x: x + edge, y: ground + HEIGHT + 2.4, z: z - edge,
    w: 0.1, h: 3.4, d: 0.1, color: WOOD_DARK, solid: false
  });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), material(color));
  flag.material.side = THREE.DoubleSide;
  flag.position.set(x + edge + 0.95, ground + HEIGHT + 5.1, z - edge);
  scene.add(flag);
}

/** Bunker de concreto com vão de porta — dois blocos e uma verga. */
function bunker(scene, colliders, { settling, x, z, ground }) {
  const W = 7;
  const D = 5;
  const H = 2.6;
  const DOOR = 1.4;

  addBox(scene, colliders, { settling, x, y: ground, z: z - D / 2, w: W, h: H, d: 0.5, color: CONCRETE });
  addBox(scene, colliders, { settling, x: x - W / 2, y: ground, z, w: 0.5, h: H, d: D, color: CONCRETE });
  addBox(scene, colliders, { settling, x: x + W / 2, y: ground, z, w: 0.5, h: H, d: D, color: CONCRETE });

  const side = (W - DOOR) / 2;
  for (const sx of [-1, 1]) {
    addBox(scene, colliders, {
      settling,
      x: x + sx * (DOOR / 2 + side / 2), y: ground, z: z + D / 2,
      w: side, h: H, d: 0.5, color: CONCRETE
    });
  }
  // verga acima da porta: passa agachado, não de pé
  addBox(scene, colliders, {
    settling,
    x, y: ground + 1.5, z: z + D / 2, w: DOOR, h: H - 1.5, d: 0.5, color: CONCRETE
  });
  addBox(scene, colliders, { settling, x, y: ground + H, z, w: W + 0.4, h: 0.4, d: D + 0.4, color: CONCRETE });
}

/** Barraca de campanha: pirâmide de lona sobre um estrado. */
function tent(scene, colliders, { settling, x, z, ground }) {
  addBox(scene, colliders, { settling, x, y: ground, z, w: 3.4, h: 0.9, d: 3.4, color: CANVAS_TENT });
  const roof = new THREE.Mesh(PYRAMID, material(CANVAS_TENT));
  roof.scale.set(2.7, 1.7, 2.7);
  roof.position.set(x, ground + 0.9 + 0.85, z);
  roof.rotation.y = Math.PI / 4;
  scene.add(roof);
}

/** Tambor de combustível deitado ou em pé. */
function barrel(scene, colliders, { settling, x, z, ground, color }) {
  const mesh = new THREE.Mesh(CYLINDER, material(color));
  mesh.scale.set(0.32, 0.9, 0.32);
  mesh.position.set(x, ground + 0.45, z);
  scene.add(mesh);
  mesh.updateMatrixWorld(true);
  colliders.push({ box: new THREE.Box3().setFromObject(mesh), standable: true });
}

/**
 * @param {object} options
 * @param {number} options.z      posição no eixo norte-sul
 * @param {number} options.ground altura do platô onde a base assenta
 * @param {number} options.facing +1 se a frente aponta pro +Z, -1 pro -Z
 */
export function addBase(scene, colliders, { name, x = 0, z, ground, facing, color, settling = null }) {
  const front = facing;

  // perímetro: dois lados inteiros, e a frente partida pelo portão
  sandbagRun(scene, colliders, { settling, x, z: z - HALF, length: HALF * 2, height: WALL_HEIGHT, along: 'x', ground });
  sandbagRun(scene, colliders, { settling, x: x - HALF, z, length: HALF * 2, height: WALL_HEIGHT, along: 'z', ground });
  sandbagRun(scene, colliders, { settling, x: x + HALF, z, length: HALF * 2, height: WALL_HEIGHT, along: 'z', ground });

  const wing = HALF - GATE_HALF;
  for (const sx of [-1, 1]) {
    sandbagRun(scene, colliders, {
      settling, x: x + sx * (GATE_HALF + wing / 2), z: z + HALF,
      length: wing, height: WALL_HEIGHT, along: 'x', ground
    });
  }
  // torres do portão
  for (const sx of [-1, 1]) {
    addBox(scene, colliders, {
      settling,
      x: x + sx * GATE_HALF, y: ground, z: z + HALF,
      w: 1, h: 2.6, d: 1, color: WOOD_DARK
    });
  }

  watchtower(scene, colliders, { settling, x: x - 11, z: z - 9 * front, ground, color });
  bunker(scene, colliders, { settling, x: x + 8, z: z - 6 * front, ground });
  tent(scene, colliders, { settling, x: x - 4, z: z + 8 * front, ground });
  tent(scene, colliders, { settling, x: x + 3, z: z + 10 * front, ground });

  // engradados empilhados perto do portão
  const crates = [[10, 4, 1], [11.4, 4.6, 1], [10.7, 4.3, 2]];
  for (const [cx, cz, level] of crates) {
    addBox(scene, colliders, {
      settling,
      x: x - cx, y: ground + (level - 1) * 0.9, z: z + cz * front,
      w: 1.1, h: 0.9, d: 1.1, color: WOOD, rotation: level * 0.3
    });
  }
  for (let i = 0; i < 4; i++) {
    barrel(scene, colliders, {
      settling, x: x + 13 + (i % 2) * 0.8, z: z + (5 + Math.floor(i / 2) * 0.9) * front,
      ground, color: i % 2 ? 0x4c5b3a : 0x6b4f33
    });
  }

  addLabel(scene, name, x, ground + 9.5, z, 12);
}
