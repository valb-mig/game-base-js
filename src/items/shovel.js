import * as THREE from 'three';

/**
 * Pá de trincheira M1943 — a ferramenta que o soldado americano carregava
 * dobrada no cinto em 1945.
 *
 * Aberta ela tem 60 cm: lâmina de aço fosfatizado com a beirada cortada em
 * ponta, colarinho de rosca que trava o ângulo, cabo de madeira e alça em
 * D no fim. O modelo é low poly como o resto e nasce com o cabo no -Z, a
 * direção pra onde a câmera olha, pra que a pose de mão seja translação
 * quase pura.
 *
 * A terra que fica na pá é um prisma separado, escondido até alguém cavar —
 * ele é o retorno visual de que a pazada está carregada.
 */

const STEEL = 0x3f423c;        // lâmina fosfatizada
const STEEL_DARK = 0x2f322d;   // colarinho e rebites
const WOOD = 0x7a5a37;
const WOOD_DARK = 0x5b422a;
const DIRT = 0x6b4a2c;

const COMPRIMENTO = 0.6;

function part(group, geometry, material, x, y, z, rotX = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (rotX) mesh.rotation.x = rotX;
  group.add(mesh);
  return mesh;
}

function fosco(color) {
  return new THREE.MeshLambertMaterial({ color, emissive: 0x0a0a09, flatShading: true });
}

/**
 * Lâmina: contorno de pá extrudado.
 *
 * A primeira versão montava os triângulos na mão e saía com faces tortas —
 * extrudar um contorno fechado é mais curto, não erra o winding, e o custo
 * em polígonos é o mesmo.
 */
function bladeGeometry() {
  const W = 0.075;    // meia-largura
  const L = 0.19;     // comprimento

  const contorno = new THREE.Shape();
  contorno.moveTo(-W, 0);
  contorno.lineTo(W, 0);
  contorno.lineTo(W, L * 0.62);
  contorno.lineTo(W * 0.6, L * 0.88);
  contorno.lineTo(0, L);
  contorno.lineTo(-W * 0.6, L * 0.88);
  contorno.lineTo(-W, L * 0.62);
  contorno.closePath();

  const geometry = new THREE.ExtrudeGeometry(contorno, {
    depth: 0.011, bevelEnabled: false, curveSegments: 1
  });

  // o contorno nasce no plano XY; deitar e apontar a ponta pro -Z
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, -0.0055, 0);
  return geometry;
}

export function createShovel() {
  const shovel = new THREE.Group();
  shovel.name = 'm1943';

  const aco = fosco(STEEL);
  const acoEscuro = fosco(STEEL_DARK);
  const madeira = fosco(WOOD);

  // lâmina, na ponta de baixo (o -Z é a frente)
  const blade = new THREE.Mesh(bladeGeometry(), aco);
  blade.position.z = -0.36;
  blade.rotation.y = Math.PI;   // a ponta pro -Z
  shovel.add(blade);

  // colarinho de rosca que trava o ângulo da lâmina
  const colar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.021, 0.021, 0.05, 8), acoEscuro);
  colar.rotation.x = Math.PI / 2;
  colar.position.z = -0.345;
  shovel.add(colar);

  // cabo
  const cabo = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0145, 0.0155, 0.33, 8), madeira);
  cabo.rotation.x = Math.PI / 2;
  cabo.position.z = -0.165;
  shovel.add(cabo);

  // alça em D no fim do cabo
  const alca = new THREE.Mesh(
    new THREE.TorusGeometry(0.036, 0.008, 6, 10), fosco(WOOD_DARK));
  alca.position.z = 0.015;
  shovel.add(alca);

  part(shovel, new THREE.BoxGeometry(0.026, 0.012, 0.03), acoEscuro, 0, 0, -0.005);

  // Terra na pá: aparece só quando carregada, e quem liga é o viewmodel.
  const carga = new THREE.Mesh(
    new THREE.CylinderGeometry(0.062, 0.03, 0.05, 7),
    new THREE.MeshLambertMaterial({ color: DIRT, flatShading: true })
  );
  carga.name = 'terra';
  carga.position.set(0, 0.026, -0.43);
  carga.scale.z = 1.9;
  carga.visible = false;
  shovel.add(carga);

  // Duas mãos no cabo: a de trás junto da alça em D, a da frente mais
  // perto da lâmina. É assim que se cava, e é o que dá o braço cruzado.
  const mao_dir = new THREE.Object3D();
  mao_dir.name = 'mao_dir';
  mao_dir.position.set(0, 0, -0.04);
  shovel.add(mao_dir);
  const mao_esq = new THREE.Object3D();
  mao_esq.name = 'mao_esq';
  mao_esq.position.set(0, 0, -0.15);
  shovel.add(mao_esq);

  return shovel;
}

export const SHOVEL_LENGTH = COMPRIMENTO;
