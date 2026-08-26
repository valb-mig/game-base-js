import * as THREE from 'three';
import { addBox, material, sorteioFixo, BOX, CYLINDER } from './props.js';
import { cabana, sacaria } from './militar.js';
import {
  MADEIRA, MADEIRA_ESCURA, LONA, CONCRETO_ESCURO, PEDRA_ESCURA
} from './construcao.js';

/**
 * A Praia: os vestígios de um desembarque que começou aqui.
 *
 * A regra do ponto 01 é ser ABERTO — é o lugar mais exposto do mapa e é isso
 * que o faz difícil. Então nada aqui dá cobertura de verdade: o arame barra
 * passagem mas não para bala nem tapa a vista, o ouriço tem meio metro de
 * altura, e as fogueiras e cabanas ficam encostadas no ponto, não espalhadas
 * pela areia. Encher a praia de abrigo seria devolver de graça exatamente o
 * que ela não tem.
 *
 * O que essas peças fazem é CANALIZAR. O arame decide por onde se sobe a
 * praia, e quem defende sabe disso antes de quem ataca.
 */

const ARAME = 0x7a7568;
const BRASA = 0xd2601a;

/**
 * Linha de arame farpado: estacas com três fios esticados.
 *
 * Ela corre no eixo X porque a praia corre no eixo X, e porque fio na
 * diagonal viraria caixa envolvente gorda — o mesmo motivo de a ponte não
 * girar. O colisor é só das estacas e do fio do meio: o de cima e o de baixo
 * são decoração, senão a linha viraria um muro de três caixas empilhadas.
 */
function arame(scene, colliders, { x, z, comprimento, terrain, settling }) {
  const passo = 3.2;
  const quantas = Math.max(2, Math.round(comprimento / passo));

  for (let i = 0; i <= quantas; i++) {
    const px = x + (i / quantas - 0.5) * comprimento;
    addBox(scene, colliders, {
      settling, x: px, z, y: terrain.heightAt(px, z) - 0.2,
      w: 0.13, h: 1.15, d: 0.13, color: MADEIRA_ESCURA
    });
  }

  const chao = terrain.heightAt(x, z);
  for (const [altura, solido] of [[0.32, false], [0.62, true], [0.92, false]]) {
    addBox(scene, colliders, {
      settling, x, z, y: chao + altura, w: comprimento, h: 0.07, d: 0.07,
      color: ARAME, solid: solido
    });
  }
}

/** Ouriço tcheco: três vigas cruzadas, meio metro de altura. */
function ourico(scene, colliders, { x, z, ground, giro }) {
  const grupo = new THREE.Group();
  grupo.position.set(x, ground + 0.75, z);
  grupo.rotation.y = giro;
  scene.add(grupo);

  for (const eixo of [[0, 0, 0.7], [0, 0, -0.7], [0.7, 0, 0]]) {
    const viga = new THREE.Mesh(BOX, material(CONCRETO_ESCURO));
    viga.scale.set(0.22, 2.6, 0.22);
    viga.rotation.set(eixo[2], 0, eixo[0]);
    grupo.add(viga);
  }

  // Uma caixa só pro conjunto inteiro. Três vigas cruzadas a 40° não são
  // AABB nenhuma, e dar uma caixa a cada uma triplicaria o colisor pra
  // descrever pior — o corpo tem menos de dois metros de lado.
  colliders.push({
    box: new THREE.Box3(
      new THREE.Vector3(x - 1, ground, z - 1),
      new THREE.Vector3(x + 1, ground + 1.5, z + 1)),
    standable: false
  });
}

/** Fogueira apagando: pedras em roda, lenha cruzada e brasa. */
function fogueira(scene, { x, z, ground, rng }) {
  const pedra = material(PEDRA_ESCURA);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const p = new THREE.Mesh(BOX, pedra);
    p.scale.set(0.32, 0.24, 0.32);
    p.position.set(x + Math.cos(a) * 0.95, ground + 0.1, z + Math.sin(a) * 0.95);
    p.rotation.y = a;
    scene.add(p);
  }
  for (let i = 0; i < 3; i++) {
    const lenha = new THREE.Mesh(CYLINDER, material(MADEIRA_ESCURA));
    lenha.scale.set(0.09, 1.5, 0.09);
    lenha.rotation.set(Math.PI / 2.6, (i / 3) * Math.PI * 2, 0);
    lenha.position.set(x, ground + 0.35, z);
    scene.add(lenha);
  }
  // A brasa é emissiva, não uma luz: uma PointLight por fogueira seriam seis
  // luzes a mais na cena, e o custo delas é por objeto desenhado.
  const brasa = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({
    color: BRASA, emissive: BRASA, emissiveIntensity: 0.9, flatShading: true
  }));
  brasa.scale.set(0.7 + rng() * 0.2, 0.16, 0.7 + rng() * 0.2);
  brasa.position.set(x, ground + 0.12, z);
  scene.add(brasa);
}

export function addPraia(scene, colliders, { x, z, terrain, settling = null }) {
  const rng = sorteioFixo(20250908);

  // Três linhas de arame escalonadas, com brechas trocadas de lugar: uma
  // linha contínua seria muro, e três alinhadas seriam um corredor só. Assim
  // subir a praia é uma sucessão de decisões de para que lado correr.
  arame(scene, colliders, { terrain, settling, x: x - 34, z: z - 26, comprimento: 46 });
  arame(scene, colliders, { terrain, settling, x: x + 30, z: z - 26, comprimento: 34 });
  arame(scene, colliders, { terrain, settling, x: x - 8, z: z - 12, comprimento: 52 });
  arame(scene, colliders, { terrain, settling, x: x + 44, z: z + 2, comprimento: 40 });

  for (let i = 0; i < 14; i++) {
    const px = x + (rng() * 2 - 1) * 78;
    const pz = z - 34 - rng() * 26;
    ourico(scene, colliders, {
      x: px, z: pz, ground: terrain.heightAt(px, pz), giro: rng() * Math.PI
    });
  }

  // O acampamento improvisado fica ATRÁS do arame, encostado no ponto: é o
  // que sobra de quem já subiu a praia.
  cabana(scene, colliders, { x: x - 15, z: z + 12, terrain, settling, largura: 4.6, fundo: 3.2 });
  cabana(scene, colliders, { x: x + 13, z: z + 15, terrain, settling, largura: 5, fundo: 3.4 });
  sacaria(scene, colliders, { terrain, settling, x: x - 2, z: z + 20, comprimento: 14, aoLongoDeX: true });

  for (const [dx, dz] of [[-9, 8], [7, 6], [0, 19]]) {
    fogueira(scene, {
      x: x + dx, z: z + dz, ground: terrain.heightAt(x + dx, z + dz) + 0.02, rng
    });
  }

  // Engradado largado e lona de campanha: o refugo de uma cabeça de praia.
  for (let i = 0; i < 12; i++) {
    const px = x + (rng() * 2 - 1) * 54;
    const pz = z + (rng() * 2 - 1) * 22;
    const alto = rng() < 0.3;
    addBox(scene, colliders, {
      settling, x: px, z: pz, y: terrain.heightAt(px, pz) - 0.1,
      w: 0.9 + rng() * 0.5, h: alto ? 1.7 : 0.85, d: 0.9 + rng() * 0.5,
      color: rng() < 0.5 ? MADEIRA : LONA, rotation: rng() * 0.7
    });
  }
}
