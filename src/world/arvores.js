import * as THREE from 'three';
import { WORLD } from '../config.js';
import { material, CONE, CYLINDER, COPA } from './props.js';

/**
 * As árvores da ilha: duas espécies em três portes.
 *
 * Antes era um pinheiro só, escalado entre 0,75 e 1,65 — e escala não faz
 * espécie. Mil e quatrocentas cópias do mesmo cone dão uma floresta que o
 * olho lê como padrão repetido em vez de mato, e a distância nada distingue
 * um trecho de outro. Duas silhuetas diferentes resolvem isso a custo quase
 * zero, porque cada uma é instanciada de uma vez só.
 *
 * A FOLHOSA é a comum, e é ela que dá o ar de Normandia; o PINHEIRO ficou
 * sendo o que ele é de verdade num bocage francês, uma minoria em mancha. E
 * os três portes não são escala do mesmo desenho: o novo é fino e alto, o
 * adulto é o padrão e o velho abre a copa pros lados. É a proporção que muda,
 * não o tamanho — senão volta a ser um cone escalado.
 */

const PINHEIRO = 'pinheiro';
const FOLHOSA = 'folhosa';

/** Sorteio da espécie. A folhosa domina; o pinheiro é o sotaque. */
const CHANCE_PINHEIRO = 0.34;

/**
 * Os três portes. `tronco` e `copa` são multiplicadores independentes: é a
 * razão entre eles que dá a silhueta, e ela é diferente em cada idade.
 */
const PORTES = [
  { nome: 'novo', ate: 0.34, altura: 0.55, tronco: 0.62, copa: 0.6 },
  { nome: 'adulto', ate: 0.80, altura: 1.0, tronco: 1.0, copa: 1.0 },
  { nome: 'velho', ate: 1.01, altura: 1.7, tronco: 1.55, copa: 1.5 }
];

function porteDe(sorte) {
  for (const porte of PORTES) {
    if (sorte < porte.ate) return porte;
  }
  return PORTES[PORTES.length - 1];
}

/**
 * Uma peça de árvore posicionada numa InstancedMesh.
 *
 * Os objetos temporários vivem fora do laço: com 2800 árvores e cinco peças
 * cada, alocar Vector3 e Quaternion por peça seriam 42 mil objetos jogados no
 * coletor só pra montar a floresta.
 */
function criarPosicionador() {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const escala = new THREE.Vector3();
  const eixoY = new THREE.Vector3(0, 1, 0);

  return (mesh, index, x, y, z, sx, sy, sz, giro) => {
    position.set(x, y, z);
    quaternion.setFromAxisAngle(eixoY, giro);
    escala.set(sx, sy, sz);
    mesh.setMatrixAt(index, matrix.compose(position, quaternion, escala));
  };
}

/**
 * Planta a lista de pontos. `dado` é o sorteio: espécie, porte e giro saem
 * dele, e não do `rng` que veio no ponto — aquele já foi gasto decidindo se o
 * ponto vingava, e reusá-lo amarraria o porte da árvore à posição dela.
 */
export function addArvores(scene, colliders, { spots, dado, settling = null }) {
  const escolhidos = spots.map((spot) => {
    const especie = dado() < CHANCE_PINHEIRO ? PINHEIRO : FOLHOSA;
    const porte = porteDe(dado());
    return { spot, especie, porte, giro: dado() * Math.PI * 2 };
  });

  const pinheiros = escolhidos.filter((a) => a.especie === PINHEIRO);
  const folhosas = escolhidos.filter((a) => a.especie === FOLHOSA);
  const por = criarPosicionador();

  const tronco = (n) => new THREE.InstancedMesh(
    CYLINDER, material(WORLD.TRUNK_COLOR), Math.max(1, n));
  const malhas = {
    troncoP: tronco(pinheiros.length),
    coneBaixo: new THREE.InstancedMesh(CONE, material(WORLD.TREE_COLOR), Math.max(1, pinheiros.length)),
    coneAlto: new THREE.InstancedMesh(CONE, material(WORLD.TREE_COLOR), Math.max(1, pinheiros.length)),
    troncoF: tronco(folhosas.length),
    copaBaixa: new THREE.InstancedMesh(COPA, material(WORLD.FOLHA_COLOR), Math.max(1, folhosas.length)),
    copaAlta: new THREE.InstancedMesh(COPA, material(WORLD.FOLHA_CLARA), Math.max(1, folhosas.length))
  };

  /**
   * Colisor só do TRONCO, e alto até o topo da copa: bater na copa seria
   * bater no ar, mas deixar o colisor na altura do tronco faria a bala passar
   * por dentro da árvore acima da cabeça. A caixa é estreita e alta.
   */
  function registrar(spot, raio, altura, pecas) {
    const collider = {
      box: new THREE.Box3(
        new THREE.Vector3(spot.x - raio, spot.y, spot.z - raio),
        new THREE.Vector3(spot.x + raio, spot.y + altura, spot.z + raio)
      ),
      standable: false
    };
    colliders.push(collider);
    settling?.register({
      x: spot.x, z: spot.z, baseY: spot.y, radius: raio * 3.2, collider, parts: pecas
    });
  }

  pinheiros.forEach(({ spot, porte, giro }, i) => {
    const h = 2.9 * porte.altura;
    const r = 0.19 * porte.tronco;
    const copa = 5.6 * porte.altura;
    const largura = 1.95 * porte.copa;

    por(malhas.troncoP, i, spot.x, spot.y + h / 2, spot.z, r, h, r, giro);
    por(malhas.coneBaixo, i, spot.x, spot.y + h + copa * 0.28, spot.z,
      largura, copa * 0.62, largura, giro);
    por(malhas.coneAlto, i, spot.x, spot.y + h + copa * 0.66, spot.z,
      largura * 0.68, copa * 0.55, largura * 0.68, giro + 0.4);

    registrar(spot, r * 1.5, h + copa, [
      { mesh: malhas.troncoP, index: i, instanced: true },
      { mesh: malhas.coneBaixo, index: i, instanced: true },
      { mesh: malhas.coneAlto, index: i, instanced: true }
    ]);
  });

  // A folhosa tem tronco curto e copa larga: é a silhueta que a distingue do
  // pinheiro de longe, que é a única distância em que isso importa.
  folhosas.forEach(({ spot, porte, giro }, i) => {
    const h = 2.4 * porte.altura;
    const r = 0.24 * porte.tronco;
    const copa = 3.5 * porte.copa;

    por(malhas.troncoF, i, spot.x, spot.y + h / 2, spot.z, r, h, r, giro);
    por(malhas.copaBaixa, i, spot.x, spot.y + h + copa * 0.42, spot.z,
      copa, copa * 0.78, copa * 0.92, giro);
    por(malhas.copaAlta, i, spot.x + copa * 0.17, spot.y + h + copa * 0.92, spot.z - copa * 0.12,
      copa * 0.66, copa * 0.6, copa * 0.7, giro * 1.7);

    registrar(spot, r * 1.5, h + copa * 1.5, [
      { mesh: malhas.troncoF, index: i, instanced: true },
      { mesh: malhas.copaBaixa, index: i, instanced: true },
      { mesh: malhas.copaAlta, index: i, instanced: true }
    ]);
  });

  for (const malha of Object.values(malhas)) {
    malha.instanceMatrix.needsUpdate = true;
    scene.add(malha);
  }

  return { pinheiros: pinheiros.length, folhosas: folhosas.length };
}
