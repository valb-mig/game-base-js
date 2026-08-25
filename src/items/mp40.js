import * as THREE from 'three';

/**
 * MP40 (Maschinenpistole 40), 9×19mm Parabellum.
 *
 * A primeira arma do jogo sem nenhuma madeira, e é isso que define o desenho:
 * aço estampado fosco, baquelite marrom-escuro no guarda-mão e no punho, e
 * nada de acabamento. O que dá a silhueta é o carregador reto pendurado e a
 * coronha tubular dobrada por baixo do corpo.
 *
 * Cano no -Z, como toda arma de fogo daqui: mirar pelo ferro vira translação
 * pura, sem rotação pra "acertar" o alinhamento.
 *
 * Medidas reais, em metros: 630 mm com a coronha dobrada (833 aberta), cano
 * de 251 mm, carregador de 32 cartuchos.
 */

const STEEL = 0x35383a;        // aço estampado, cinza-escuro fosco
const STEEL_DARK = 0x2a2c2e;   // partes internas e coronha
const SMALL_PARTS = 0x1e2021;  // gatilho, miras, ferrolho
const BAKELITE = 0x3a2a1e;     // baquelite marrom-escuro
const ALUMINUM = 0x55585a;     // a barra de apoio sob o cano

// Altura da linha de mira sobre o eixo do cano. Exportada porque quem põe a
// arma na mira de ferro não pode adivinhar este número.
export const SIGHT_HEIGHT = 0.031;
const MUZZLE_Z = -0.42;

// Quanto a arma inteira anda pra frente pra que a origem caia no punho.
const ORIGEM_NA_MAO = 0.19;

function fosco(color) {
  return new THREE.MeshLambertMaterial({ color, emissive: 0x0a0a0b, flatShading: true });
}

function part(group, geometry, material, x, y, z, rotation = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  group.add(mesh);
  return mesh;
}

/** Cilindro deitado ao longo do Z, que é como quase tudo nesta arma é. */
function tubo(group, material, raio, comprimento, x, y, z, lados = 10) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(raio, raio, comprimento, lados), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

export function createMP40() {
  const mp40 = new THREE.Group();
  mp40.name = 'mp40';

  const aco = fosco(STEEL);
  const acoEscuro = fosco(STEEL_DARK);
  const miudo = fosco(SMALL_PARTS);
  const baquelite = fosco(BAKELITE);
  const aluminio = fosco(ALUMINUM);

  // ------------------------------------------------------ caixa da culatra
  // Tubo de aço estampado, seção redonda — a MP40 é um cano de tubo, não uma
  // caixa retangular, e é daí que vem o ar "industrial" dela.
  tubo(mp40, aco, 0.0215, 0.312, 0, 0, -0.019);

  // fechamento traseiro, onde a coronha se articula
  tubo(mp40, acoEscuro, 0.022, 0.034, 0, 0, 0.154);

  // alavanca de armar, do lado esquerdo — detalhe que quebra a silhueta lisa
  part(mp40, new THREE.BoxGeometry(0.03, 0.009, 0.012), miudo, -0.026, 0.008, -0.075);
  part(mp40, new THREE.BoxGeometry(0.012, 0.007, 0.05), miudo, -0.017, 0.012, -0.09);

  // ---------------------------------------------------------------- cano
  // Fino e alongado, saindo bem à frente do guarda-mão.
  tubo(mp40, aco, 0.0098, 0.251, 0, 0, -0.3);

  // porca do cano, o anel grosso onde ele encontra a caixa
  tubo(mp40, acoEscuro, 0.0155, 0.028, 0, 0, -0.178, 8);

  const boca = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0115, 0.0115, 0.016, 10), acoEscuro);
  boca.rotation.x = Math.PI / 2;
  boca.position.set(0, 0, MUZZLE_Z + 0.008);
  mp40.add(boca);

  const alma = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0052, 0.0052, 0.006, 10),
    new THREE.MeshBasicMaterial({ color: 0x090909 }));
  alma.rotation.x = Math.PI / 2;
  alma.position.set(0, 0, MUZZLE_Z + 0.004);
  mp40.add(alma);

  // -------------------------------------------------- barra de apoio
  // A guia de alumínio sob o cano, pra apoiar a arma na fresta do blindado
  // sem bater o cano na chapa. É um traço só da MP40 e aparece de longe.
  part(mp40, new THREE.BoxGeometry(0.026, 0.012, 0.052), aluminio, 0, -0.019, -0.198);
  part(mp40, new THREE.BoxGeometry(0.014, 0.016, 0.03), aluminio, 0, -0.022, -0.212);

  // ------------------------------------------------------------- miras
  // Massa de mira dentro de um capuz circular — o anel é o que se enxerga.
  const capuz = new THREE.Mesh(
    new THREE.TorusGeometry(0.0125, 0.0026, 4, 10), miudo);
  capuz.position.set(0, SIGHT_HEIGHT - 0.006, MUZZLE_Z + 0.03);
  mp40.add(capuz);
  part(mp40, new THREE.BoxGeometry(0.003, 0.011, 0.004), miudo,
    0, SIGHT_HEIGHT - 0.009, MUZZLE_Z + 0.03);

  // alça traseira em V, levantada sobre a caixa
  part(mp40, new THREE.BoxGeometry(0.016, 0.005, 0.006), miudo,
    0, SIGHT_HEIGHT - 0.004, -0.108);
  for (const lado of [-1, 1]) {
    part(mp40, new THREE.BoxGeometry(0.005, 0.011, 0.006), miudo,
      lado * 0.0055, SIGHT_HEIGHT - 0.001, -0.108);
  }

  // ------------------------------------------- guarda-mão e poço, baquelite
  // A seção central inteira é plástico, e é o que dá a mancha marrom no meio
  // da arma cinza.
  part(mp40, new THREE.BoxGeometry(0.042, 0.036, 0.088), baquelite, 0, -0.024, -0.108);

  // poço do carregador, descendo reto
  part(mp40, new THREE.BoxGeometry(0.032, 0.05, 0.042), acoEscuro, 0, -0.05, -0.104);

  // Carregador reto de 32 cartuchos: bloco longo e vertical, levemente
  // afilado. É ele que faz a silhueta esguia da arma.
  const carregador = new THREE.Mesh(
    new THREE.BoxGeometry(0.028, 0.185, 0.038), acoEscuro);
  carregador.position.set(0, -0.162, -0.104);
  mp40.add(carregador);
  part(mp40, new THREE.BoxGeometry(0.031, 0.008, 0.041), miudo, 0, -0.258, -0.104);

  // ------------------------------------------------------- gatilho e punho
  part(mp40, new THREE.BoxGeometry(0.026, 0.028, 0.062), baquelite, 0, -0.026, -0.008);

  // guarda-mato
  part(mp40, new THREE.BoxGeometry(0.016, 0.005, 0.042), acoEscuro, 0, -0.056, 0.006);
  part(mp40, new THREE.BoxGeometry(0.016, 0.022, 0.006), acoEscuro, 0, -0.047, -0.012);
  part(mp40, new THREE.BoxGeometry(0.016, 0.018, 0.006), acoEscuro, 0, -0.045, 0.024);
  part(mp40, new THREE.BoxGeometry(0.008, 0.018, 0.006), miudo, 0, -0.046, 0.004);

  // Punho de baquelite, inclinado pra trás. Grupo próprio pra que a
  // inclinação valha pro punho inteiro de uma vez.
  const punho = new THREE.Group();
  punho.position.set(0, -0.038, 0.036);
  punho.rotation.x = -0.24;
  mp40.add(punho);
  part(punho, new THREE.BoxGeometry(0.028, 0.088, 0.036), baquelite, 0, -0.044, 0);
  part(punho, new THREE.BoxGeometry(0.031, 0.006, 0.039), acoEscuro, 0, -0.089, 0);

  // ------------------------------------------------------- coronha dobrada
  // Recolhida, ela fica rebatida pra baixo sob o corpo da arma, apontando
  // pra frente. É o traço mais reconhecível da MP40, e recolhida é como o
  // soldado carrega em espaço apertado.
  const coronha = new THREE.Group();
  coronha.position.set(0, -0.03, 0.15);
  coronha.rotation.x = -0.22;
  mp40.add(coronha);

  for (const lado of [-1, 1]) {
    const braco = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0055, 0.0055, 0.155, 6), acoEscuro);
    braco.rotation.x = Math.PI / 2;
    braco.position.set(lado * 0.019, -0.026, -0.088);
    coronha.add(braco);
  }
  // travessa da soleira, na ponta dos dois braços
  part(coronha, new THREE.BoxGeometry(0.052, 0.011, 0.026), acoEscuro, 0, -0.026, -0.162);
  // articulação, onde ela gira pra abrir
  tubo(coronha, miudo, 0.009, 0.05, 0, -0.008, 0.004, 6);

  // Marcador da boca: sem geometria, só um ponto com orientação. A bala nasce
  // aqui e o -Z do modelo vira o -Z dele sem conta nenhuma.
  const marcador = new THREE.Object3D();
  marcador.name = 'boca';
  marcador.position.set(0, 0, MUZZLE_Z);
  mp40.add(marcador);

  // Clarão da boca, apagado até o disparo — quem acende é o viewmodel.
  const clarao = new THREE.Group();
  clarao.name = 'clarao';
  clarao.position.set(0, 0, MUZZLE_Z - 0.014);
  clarao.visible = false;
  const materialClarao = new THREE.MeshBasicMaterial({
    color: 0xffd9a0, transparent: true, opacity: 0.9,
    side: THREE.DoubleSide, depthWrite: false
  });
  for (const angulo of [0, Math.PI / 2]) {
    const plano = new THREE.Mesh(new THREE.PlaneGeometry(0.062, 0.062), materialClarao);
    plano.rotation.z = angulo;
    clarao.add(plano);
  }
  mp40.add(clarao);

  // A origem vai pra trás, junto do punho.
  //
  // Montada em volta do meio da caixa, a pose posicionava o MEIO da arma: a
  // culatra caía atrás do olho e o que aparecia era só o cano solto, sem nada
  // atrás dele. Com a origem aqui, o número da pose quer dizer "onde está a
  // mão", que é o que dá pra ajustar olhando.
  for (const filho of mp40.children) filho.position.z -= ORIGEM_NA_MAO;

  return mp40;
}
