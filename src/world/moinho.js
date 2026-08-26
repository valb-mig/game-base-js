import * as THREE from 'three';
import { addBox, material, sorteioFixo, BOX, CYLINDER, PYRAMID } from './props.js';
import { addCasa } from './casas.js';
import { assentar, cerca, tambor, PEDRA, MADEIRA, MADEIRA_ESCURA } from './construcao.js';

/**
 * Moinho de torre, com as pás girando.
 *
 * Elas giram porque um moinho parado lê como ruína, e o ponto 06 é descrito
 * como o que domina a base inimiga — ele precisa ser visto de longe e ser
 * reconhecido na hora. O movimento é o que puxa o olho a quatrocentos metros.
 */
export function addMoinho(scene, colliders, { x, z, terrain, settling = null }) {
  const rng = sorteioFixo(20250905);
  const tx = x - 3;
  const tz = z - 17;
  const { base } = assentar(terrain, tx, tz, 5);
  const y = base - 0.4;
  const ALTURA = 13.5;
  const RAIO = 3.4;

  // Torre redonda desenhada como cilindro, mas o colisor é a caixa que a
  // envolve: é redondo o bastante pra não se notar a diferença andando em
  // volta, e a colisão só entende AABB.
  const torre = new THREE.Mesh(CYLINDER, material(PEDRA));
  torre.scale.set(RAIO, ALTURA, RAIO);
  torre.position.set(tx, y + ALTURA / 2, tz);
  scene.add(torre);
  colliders.push({
    box: new THREE.Box3(
      new THREE.Vector3(tx - RAIO * 0.78, y, tz - RAIO * 0.78),
      new THREE.Vector3(tx + RAIO * 0.78, y + ALTURA, tz + RAIO * 0.78)),
    standable: false
  });

  const capuz = new THREE.Mesh(PYRAMID, material(MADEIRA_ESCURA));
  capuz.scale.set(RAIO * 1.5, 3.2, RAIO * 1.5);
  capuz.position.set(tx, y + ALTURA + 1.6, tz);
  capuz.rotation.y = Math.PI / 4;
  scene.add(capuz);

  // As quatro pás num grupo só, girando no eixo Z: o eixo do moinho aponta
  // pro observador, e o grupo inteiro roda como uma peça.
  const cruz = new THREE.Group();
    // O cubo fica logo abaixo do capuz, não acima dele: com a cruz por cima, a
  // pá de cima virava um mastro de dez metros saindo do telhado e o moinho
  // lia como torre de rádio. Vela de moinho tem mais ou menos a altura da
  // torre — é essa proporção que faz a silhueta ser reconhecida.
  cruz.position.set(tx, y + ALTURA - 0.6, tz - RAIO * 1.1);
  scene.add(cruz);
  for (let i = 0; i < 4; i++) {
    const braco = new THREE.Group();
    braco.rotation.z = (i * Math.PI) / 2;

    // A pá é uma treliça: a vara comprida e duas travessas. Uma tábua só
    // sumia vista de canto — 18 cm de espessura a quarenta metros é um risco,
    // e o que faz o moinho ser reconhecido de longe é justamente a cruz.
    const vara = new THREE.Mesh(BOX, material(MADEIRA_ESCURA));
    vara.scale.set(0.26, 6.8, 0.22);
    vara.position.y = 3.4;
    braco.add(vara);

    for (const t of [0.42, 0.78]) {
      const tela = new THREE.Mesh(BOX, material(MADEIRA));
      tela.scale.set(1.6, 2.1, 0.14);
      tela.position.set(0.8, 6.8 * t, 0.06);
      braco.add(tela);
    }
    cruz.add(braco);
  }

  const cercado = 17;
  cerca(scene, colliders, {
    terrain, settling,
    // Começa em z+14, não em z+8: a zona de nascimento fica em (x, z+7), e
    // uma estaca de cerca em cima dela faria o jogador nascer dentro dela.
    pontos: [
      [x - cercado, z + 14], [x + cercado, z + 14],
      [x + cercado, z + 14 + cercado * 1.3], [x - cercado, z + 14 + cercado * 1.3],
      [x - cercado, z + 14]
    ]
  });

  addCasa(scene, colliders, {
    tipo: 'pequena', x: x + 17, z: z - 12, giro: 1, terrain, settling
  });
  for (let i = 0; i < 4; i++) {
    const px = x + 6 + rng() * 6;
    const pz = z - 8 - rng() * 6;
    tambor(scene, colliders, {
      x: px, z: pz, ground: terrain.heightAt(px, pz), cor: MADEIRA
    });
  }

  return {
    /** As pás giram devagar: rápido demais vira ventilador. */
    update: (delta) => { cruz.rotation.z += delta * 0.42; }
  };
}
