import * as THREE from 'three';

/**
 * Faca de combate KA-BAR (USMC Mark 2), padrão da Segunda Guerra.
 *
 * Low poly de propósito: a lâmina tem seção triangular (quilha chata, fio
 * numa aresta só), o cabo é um torneado de 8 lados com os anéis de couro
 * marcados no próprio perfil, e nada usa textura. As medidas são as reais,
 * em metros: 30 cm no total, 18 de lâmina.
 *
 * Tudo é construído com a lâmina apontando pro +X e o cabo indo pro -X.
 * Quem orienta pra mão é o viewmodel.
 */

const BLADE_COLOR = 0x2b2b2e;   // parkerizado preto, quase não reflete
const METAL_COLOR = 0x1d1d20;   // guarda e pomo
const LEATHER_COLOR = 0x4a3524; // anéis de couro prensado

/**
 * Estações ao longo da lâmina: [x, y da quilha, y do fio, meia-espessura].
 * O clip point aparece nas três últimas, onde a quilha desce pra ponta
 * enquanto o fio sobe.
 */
const BLADE_STATIONS = [
  [0.000, 0.0150, -0.0150, 0.00200],
  [0.085, 0.0150, -0.0150, 0.00200],
  [0.128, 0.0150, -0.0138, 0.00185],
  [0.145, 0.0098, -0.0120, 0.00155],
  [0.160, 0.0052, -0.0088, 0.00115],
  [0.172, 0.0022, -0.0048, 0.00070],
  [0.182, 0.0000, 0.0000, 0.00000]
];

function buildBladeGeometry() {
  const positions = [];
  const push = (...points) => {
    for (const point of points) positions.push(point[0], point[1], point[2]);
  };

  // três vértices por estação: quilha frente, quilha trás, fio
  const rings = BLADE_STATIONS.map(([x, spineY, edgeY, half]) => ({
    front: [x, spineY, half],
    back: [x, spineY, -half],
    edge: [x, edgeY, 0]
  }));

  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i];
    const b = rings[i + 1];

    // Na ponta os três vértices da estação colapsam num só. Fechar em leque
    // evita os triângulos de área zero que sairiam do caso geral.
    const isTip = b.front[1] === b.edge[1] && b.front[2] === 0;
    if (isTip) {
      push(a.front, a.edge, b.edge);   // frente
      push(a.back, b.edge, a.edge);    // trás
      push(a.front, b.edge, a.back);   // quilha
      continue;
    }

    // face da frente (+Z)
    push(a.front, a.edge, b.edge);
    push(a.front, b.edge, b.front);

    // face de trás (-Z)
    push(a.back, b.edge, a.edge);
    push(a.back, b.back, b.edge);

    // quilha (+Y), a faixa chata de cima
    push(a.front, b.front, b.back);
    push(a.front, b.back, a.back);
  }

  // tampa da base: fica escondida dentro da guarda, mas fecha a malha
  const base = rings[0];
  push(base.front, base.back, base.edge);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Cabo: anéis de couro prensados. Os sulcos entre eles são geometria de
 * verdade — o perfil do torneado encolhe o raio em cada divisa.
 */
function buildHandleGeometry(length, rings) {
  const BASE_RADIUS = 0.0116;
  const BULGE = 0.0026;   // barrigudo no meio, como o cabo real
  const GROOVE = 0.0011;

  const radiusAt = (t) => BASE_RADIUS + BULGE * Math.sin(Math.PI * t);

  const profile = [new THREE.Vector2(0, 0)];
  for (let i = 0; i <= rings * 2; i++) {
    const t = i / (rings * 2);
    const isSeam = i % 2 === 0; // divisa entre dois anéis
    profile.push(new THREE.Vector2(radiusAt(t) - (isSeam ? GROOVE : 0), t * length));
  }
  profile.push(new THREE.Vector2(0, length));

  return new THREE.LatheGeometry(profile, 8);
}

/** Devolve o Group da faca, lâmina pro +X, origem na base da lâmina. */
export function createKnife() {
  const knife = new THREE.Group();
  knife.name = 'ka-bar';

  const blade = new THREE.Mesh(
    buildBladeGeometry(),
    new THREE.MeshLambertMaterial({ color: BLADE_COLOR, emissive: 0x0b0b0d, flatShading: true })
  );

  const metal = new THREE.MeshLambertMaterial({ color: METAL_COLOR, emissive: 0x08080a, flatShading: true });

  // guarda reta, mais larga que a lâmina pros dois lados
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.048, 0.011), metal);
  guard.position.x = -0.004;

  const HANDLE_LENGTH = 0.118;
  const handle = new THREE.Mesh(
    buildHandleGeometry(HANDLE_LENGTH, 8),
    new THREE.MeshLambertMaterial({ color: LEATHER_COLOR, emissive: 0x140d08, flatShading: true })
  );
  // o torneado nasce no +Y; girar leva o cabo pro -X
  handle.rotation.z = Math.PI / 2;
  handle.position.x = -0.009;
  handle.scale.z = 0.78; // seção oval, não redonda

  // pomo chato e redondo fechando o cabo
  const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.0132, 0.0132, 0.008, 8), metal);
  pommel.rotation.z = Math.PI / 2;
  pommel.position.x = -0.009 - HANDLE_LENGTH - 0.004;
  pommel.scale.z = 0.82;

  knife.add(blade, guard, handle, pommel);
  return knife;
}
