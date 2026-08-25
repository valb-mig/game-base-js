import * as THREE from 'three';

/**
 * Colt M1911A1, .45 ACP — pistola de serviço do Exército americano em 1945.
 *
 * Construída com o cano apontando pro -Z, que é a frente da câmera. Isso é
 * de propósito: mirar pelo ferro vira translação pura, sem rotação nenhuma
 * pra acertar, e a linha de mira fica exatamente onde a geometria diz.
 *
 * Medidas reais, em metros: 210 mm de comprimento, 133 de altura, 34 de
 * largura, cano de 5 polegadas.
 *
 * O acabamento é fosfatizado — cinza-esverdeado fosco, feito pra não brilhar
 * no sol. As escamas de plástico marrom do cabo levam textura, única do
 * projeto: o quadriculado em diamante é fino demais pra virar geometria sem
 * dobrar a contagem de triângulos do modelo inteiro.
 */

const STEEL = 0x3d403a;        // fosfatização
const STEEL_DARK = 0x32352f;   // armação, um tom abaixo
const SMALL_PARTS = 0x262824;  // cão, gatilho, miras
const GRIP_BROWN = 0x4a3527;

// A linha de mira passa por aqui. Quem posiciona a arma na mira de ferro usa
// este número, então ele não pode ser adivinhado do outro lado.
export const SIGHT_HEIGHT = 0.0355;
export const MUZZLE_Z = -0.168;

/** Escama do cabo: quadriculado em diamante, gerado uma vez e compartilhado. */
let gripTexture = null;

function checkeredGrip() {
  if (gripTexture) return gripTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#4a3527';
  ctx.fillRect(0, 0, 64, 64);

  // dois feixes de linhas cruzadas a 45° formam o diamante
  ctx.lineWidth = 1.6;
  for (const [step, shade] of [[0, 'rgba(28, 18, 12, 0.55)'], [1, 'rgba(122, 94, 68, 0.4)']]) {
    ctx.strokeStyle = shade;
    ctx.beginPath();
    for (let i = -64; i < 128; i += 8) {
      ctx.moveTo(i + step, 0);
      ctx.lineTo(i + step + 64, 64);
      ctx.moveTo(i + step, 64);
      ctx.lineTo(i + step + 64, 0);
    }
    ctx.stroke();
  }

  gripTexture = new THREE.CanvasTexture(canvas);
  gripTexture.colorSpace = THREE.SRGBColorSpace;
  return gripTexture;
}

function steelMaterial(color) {
  return new THREE.MeshLambertMaterial({ color, emissive: 0x0a0b0a, flatShading: true });
}

function part(group, geometry, material, x, y, z, rotation = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (rotation) mesh.rotation.x = rotation;
  group.add(mesh);
  return mesh;
}

export function createPistol() {
  const pistol = new THREE.Group();
  pistol.name = 'm1911a1';

  const steel = steelMaterial(STEEL);
  const frameSteel = steelMaterial(STEEL_DARK);
  const small = steelMaterial(SMALL_PARTS);

  // ---------------------------------------------------------------- ferrolho
  // Linhas retas e seção quase quadrada: é o que dá o visual "quadradão".
  part(pistol, new THREE.BoxGeometry(0.023, 0.029, 0.197), steel, 0, 0.0155, -0.069);

  // topo levemente mais estreito, pra quebrar o bloco sem arredondar de fato
  part(pistol, new THREE.BoxGeometry(0.017, 0.006, 0.197), steel, 0, 0.032, -0.069);

  // saliências de empunhadura na traseira do ferrolho
  for (let i = 0; i < 5; i++) {
    part(pistol, new THREE.BoxGeometry(0.0245, 0.02, 0.0035), frameSteel,
      0, 0.016, 0.005 - i * 0.0075);
  }

  // boca do cano: o .45 é grosso, e isso aparece de frente
  const muzzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0092, 0.0092, 0.014, 10), steel);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 0.0155, MUZZLE_Z + 0.007);
  pistol.add(muzzle);

  const bore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0058, 0.0058, 0.006, 10),
    new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
  bore.rotation.x = Math.PI / 2;
  bore.position.set(0, 0.0155, MUZZLE_Z + 0.004);
  pistol.add(bore);

  // ------------------------------------------------------------------ miras
  // Massa de mira e alça na mesma altura: é a linha que o ADS alinha.
  part(pistol, new THREE.BoxGeometry(0.0035, 0.007, 0.005), small,
    0, SIGHT_HEIGHT - 0.0015, MUZZLE_Z + 0.016);

  // alça entalhada: dois blocos e o vão do entalhe entre eles
  for (const side of [-1, 1]) {
    part(pistol, new THREE.BoxGeometry(0.0055, 0.007, 0.008), small,
      side * 0.0053, SIGHT_HEIGHT - 0.0015, 0.0185);
  }

  // -------------------------------------------------------------- armação
  part(pistol, new THREE.BoxGeometry(0.0225, 0.022, 0.158), frameSteel,
    0, -0.0105, -0.049);

  // cão exposto, em forma de espora arredondada
  part(pistol, new THREE.BoxGeometry(0.008, 0.019, 0.007), small, 0, 0.026, 0.036);
  const spur = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.008, 8), small);
  spur.rotation.z = Math.PI / 2;
  spur.position.set(0, 0.0345, 0.038);
  pistol.add(spur);

  // aba de segurança traseira (a "cauda de castor")
  part(pistol, new THREE.BoxGeometry(0.021, 0.015, 0.02), frameSteel, 0, 0.013, 0.0295);

  // ------------------------------------------------------- guarda-mato
  part(pistol, new THREE.BoxGeometry(0.016, 0.006, 0.044), frameSteel,
    0, -0.0455, -0.055);                                   // base
  part(pistol, new THREE.BoxGeometry(0.016, 0.03, 0.007), frameSteel,
    0, -0.033, -0.0745);                                   // frente
  part(pistol, new THREE.BoxGeometry(0.016, 0.016, 0.007), frameSteel,
    0, -0.028, -0.0345);                                   // ligação traseira

  // gatilho curto e recuado, como no A1
  part(pistol, new THREE.BoxGeometry(0.009, 0.019, 0.006), small, 0, -0.031, -0.043);

  // ------------------------------------------------------------------ cabo
  // Inclinado pra trás, como o original. Um grupo próprio pra que a
  // inclinação valha pro punho e pras duas escamas de uma vez.
  // A altura total tem que fechar em 133 mm com o topo da mira em 0,039:
  // o punho vai de -0,026 até -0,094, ou seja 68 mm de vão vertical, que a
  // 16° de inclinação viram 71 mm de comprimento ao longo do cabo.
  const grip = new THREE.Group();
  grip.position.set(0, -0.026, 0.008);
  grip.rotation.x = -0.28;
  pistol.add(grip);

  const gripMaterial = new THREE.MeshLambertMaterial({
    map: checkeredGrip(), emissive: 0x0a0806, flatShading: true
  });

  part(grip, new THREE.BoxGeometry(0.0225, 0.066, 0.042), frameSteel, 0, -0.035, 0);
  for (const side of [-1, 1]) {
    part(grip, new THREE.BoxGeometry(0.004, 0.054, 0.036), gripMaterial,
      side * 0.0132, -0.036, 0);
  }

  // base do carregador, fechando o punho
  part(grip, new THREE.BoxGeometry(0.026, 0.005, 0.044), frameSteel, 0, -0.0705, 0);

  // Marcador da boca do cano: sem geometria, só um ponto com orientação. É
  // daqui que a bala nasce e é daqui que sai a direção do tiro — o cano no
  // -Z do modelo vira, sem conta nenhuma, o -Z deste marcador.
  const boca = new THREE.Object3D();
  boca.name = 'boca';
  boca.position.set(0, 0.0155, MUZZLE_Z);
  pistol.add(boca);

  // Clarão da boca: dois planos cruzados, apagados até o disparo. Quem
  // acende é o viewmodel, lendo o estado da arma.
  const flash = new THREE.Group();
  flash.name = 'clarao';
  flash.position.set(0, 0.0155, MUZZLE_Z - 0.012);
  flash.visible = false;
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd9a0, transparent: true, opacity: 0.9,
    side: THREE.DoubleSide, depthWrite: false
  });
  for (const angle of [0, Math.PI / 2]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.055), flashMaterial);
    plane.rotation.z = angle;
    flash.add(plane);
  }
  pistol.add(flash);

  return pistol;
}
