import * as THREE from 'three';
import { addBox, material, CYLINDER } from './props.js';

/**
 * Boneco de treino de baioneta: poste de madeira, travessa e um corpo de
 * estopa cheio de palha. É o que se usava em 1945, e serve de alvo pra
 * conferir alcance, dano e cadência do golpe.
 *
 * Ele não revida. É alvo de teste, não inimigo.
 */

const POST = 0x5b4630;
const BURLAP = 0xa8935f;
const BURLAP_DARK = 0x8a7647;
const STRAW = 0xc9b273;

const HEALTH = 100;
const RADIUS = 0.65;      // raio pro teste de cone do golpe
const REVIVE_AFTER = 4;   // segundos caído antes de levantar de novo

/** Barra de vida flutuante: sprite porque tem que encarar a câmera sempre. */
function createHealthBar() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  // com depthTest desligado a barra apareceria através de morro e parede;
  // ela já fica acima da cabeça, então não precisa disso
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
  sprite.scale.set(1.1, 0.14, 1);
  sprite.renderOrder = 2;

  function draw(ratio) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(14, 18, 12, 0.75)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = ratio > 0.35 ? '#93bd5e' : '#c46a3a';
    ctx.fillRect(2, 2, (canvas.width - 4) * Math.max(0, ratio), canvas.height - 4);
    texture.needsUpdate = true;
  }

  // A barra só aparece depois do primeiro dano. Três bonecos com barra cheia
  // na tela é poluição: o interessante é quanto falta, não que estão inteiros.
  draw(1);
  sprite.visible = false;
  return { sprite, draw };
}

export function createDummy(scene, colliders,
  { x, z, ground, facing = 0, name = '', settling = null }) {
  const group = new THREE.Group();
  group.position.set(x, ground, z);
  group.rotation.y = facing;
  scene.add(group);

  // poste enterrado
  const post = new THREE.Mesh(CYLINDER, material(POST));
  post.scale.set(0.09, 1.9, 0.09);
  post.position.y = 0.95;
  group.add(post);

  // travessa dos braços, na altura do ombro pra sobrar pra fora do torso
  const cross = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.13, 0.13), material(POST));
  cross.position.y = 1.52;
  group.add(cross);

  // corpo de estopa e cabeça
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.96, 0.34), material(BURLAP));
  torso.position.y = 1.12;
  group.add(torso);

  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.11, 0.38), material(BURLAP_DARK));
  belt.position.y = 1.02;
  group.add(belt);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.28), material(STRAW));
  head.position.y = 1.79;
  group.add(head);

  const bar = createHealthBar();
  bar.sprite.position.y = 2.08;
  group.add(bar.sprite);

  // colisor do poste: dá pra encostar, não dá pra atravessar
  const half = 0.34;
  const collider = {
    box: new THREE.Box3(
      new THREE.Vector3(x - half, ground, z - half),
      new THREE.Vector3(x + half, ground + 2, z + half)
    ),
    standable: false
  };
  colliders.push(collider);

  // boneco descalçado também tomba: ele é um poste fincado, não um decalque
  settling?.register({
    x, z, baseY: ground, radius: 0.45, collider, parts: [{ mesh: group }]
  });

  const middle = new THREE.Vector3(x, ground + 1.25, z);
  const painted = [torso, belt, head];

  const dummy = {
    name,
    // exposto pra que o teste de linha de visão do golpe possa ignorá-lo:
    // sem isso o boneco bloqueia a mira até ele mesmo
    collider,
    radius: RADIUS,
    maxHealth: HEALTH,
    health: HEALTH,
    alive: true,
    center: () => middle,

    damage(amount) {
      if (!dummy.alive) return { target: dummy, amount: 0, killed: false };

      dummy.health = Math.max(0, dummy.health - amount);
      bar.draw(dummy.health / dummy.maxHealth);
      bar.sprite.visible = true;
      dummy.flash = 1;
      dummy.recoil = 1;

      const killed = dummy.health === 0;
      if (killed) {
        dummy.alive = false;
        dummy.downFor = 0;
        // caído não bloqueia mais a passagem
        collider.box.max.y = ground + 0.2;
      }
      return { target: dummy, amount, killed };
    },

    update(delta) {
      if (dummy.flash > 0) {
        dummy.flash = Math.max(0, dummy.flash - delta * 7);
        // vermelho seco e curto: o piscar confirma o acerto, não vira festa
        const heat = dummy.flash * 0.32;
        for (const mesh of painted) mesh.material.emissive.setRGB(heat, heat * 0.06, heat * 0.04);
      }

      if (dummy.recoil > 0) {
        dummy.recoil = Math.max(0, dummy.recoil - delta * 4);
        group.rotation.x = -dummy.recoil * 0.18;
      }

      if (!dummy.alive) {
        dummy.downFor += delta;
        // tomba pra trás e fica caído até se recompor
        group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, -1.35,
          Math.min(1, delta * 6));
        bar.sprite.visible = false;

        if (dummy.downFor >= REVIVE_AFTER) {
          dummy.alive = true;
          dummy.health = dummy.maxHealth;
          dummy.recoil = 0;
          group.rotation.x = 0;
          collider.box.max.y = ground + 2;
          bar.draw(1);
          bar.sprite.visible = false;   // inteiro de novo, barra some
        }
      }
    }
  };

  dummy.flash = 0;
  dummy.recoil = 0;
  dummy.downFor = 0;

  // materiais compartilhados por cor não podem piscar juntos: cada boneco
  // ganha os seus, senão bater num acende todos os outros
  for (const mesh of painted) mesh.material = mesh.material.clone();

  return dummy;
}
