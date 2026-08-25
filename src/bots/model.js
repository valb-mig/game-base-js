import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { teamOf } from '../game/teams.js';

/**
 * O modelo do soldado, carregado uma vez e clonado por soldado.
 *
 * Ele vem em T-pose com o esqueleto nomeado — `hips`, `spine`, `chest`,
 * `neck`, `head`, `shoulder/elbow/hand`, `thigh/knee/foot` e um nó `weapon`.
 * As malhas são PARENTEADAS aos ossos, não deformadas por eles: girar um osso
 * move a peça inteira, e é isso que permite posá-lo sem skinning.
 *
 * A pose de carregar arma é aplicada aqui, na cópia. O arquivo continua em
 * T-pose de propósito: é a pose neutra, a que se edita e a que o Mixamo
 * espera se um dia isto virar malha com esqueleto de verdade.
 */

const CAMINHO = './assets/models/soldado-tpose.glb';

// O modelo tem 1,80 m e o jogo trata o soldado como 1,75. A escala mora aqui
// porque a hitbox e a locomoção já falam em 1,75 — mudar o número do jogo pra
// caber no modelo seria deixar o asset mandar na regra.
const ALTURA_MODELO = 1.80;
const ALTURA_JOGO = 1.75;

/**
 * A farda no atlas. São as duas únicas cores que mudam por time — pele, bota,
 * madeira e metal ficam como estão, senão o soldado inteiro muda de material
 * e deixa de parecer o mesmo homem com farda diferente.
 */
const FARDA = [0x4c5527, 0x3a4220];

/**
 * Bytes sRGB de um hex.
 *
 * Sem THREE.Color de propósito: ela converte de sRGB pra linear, e comparar
 * o resultado com o pixel do canvas media 18 contra 76 — a troca de farda
 * nunca casava e os dois times saíam idênticos.
 */
function bytes(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

let promessa = null;
let modelo = null;

/** Carrega o arquivo uma vez. Chamar de novo devolve a mesma promessa. */
export function carregarSoldado() {
  if (!promessa) {
    promessa = new GLTFLoader().loadAsync(CAMINHO).then((gltf) => {
      modelo = gltf.scene;
      modelo.updateMatrixWorld(true);
      return modelo;
    });
  }
  return promessa;
}

/** Já carregado? Quem monta mundo precisa saber antes de montar. */
export function soldadoPronto() {
  return modelo !== null;
}

/**
 * Posição de cada osso no modelo original, em metros e com o pé no zero.
 *
 * É daqui que a hitbox sai: medida do MODELO, não de uma tabela escrita à
 * mão. Tabela à mão desalinha na primeira vez que o modelo muda, e quem
 * descobre é o jogador vendo a bala atravessar o braço.
 */
export function ossosDoSoldado() {
  if (!modelo) return null;

  const ossos = {};
  const p = new THREE.Vector3();
  modelo.updateMatrixWorld(true);
  modelo.traverse((o) => {
    if (o.isMesh) return;
    o.getWorldPosition(p);
    ossos[o.name] = { x: p.x, y: p.y, z: p.z };
  });
  return ossos;
}

/** Textura da farda do time: o atlas com as duas cores de uniforme trocadas. */
const texturas = new Map();

/** Quantos texels a troca de farda mexeu. Existe pra o teste conferir. */
export const textura_trocados = new Map();
function texturaDoTime(time, original) {
  if (texturas.has(time.id)) return texturas.get(time.id);

  const fonte = original?.image;
  const canvas = document.createElement('canvas');
  canvas.width = fonte?.width ?? 64;
  canvas.height = fonte?.height ?? 64;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (fonte) ctx.drawImage(fonte, 0, 0);
  const dados = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = dados.data;

  const de = FARDA.map(bytes);
  const para = [bytes(time.uniforme), bytes(time.uniformeEscuro)];

  let trocados = 0;
  for (let i = 0; i < px.length; i += 4) {
    for (let k = 0; k < de.length; k++) {
      // comparação quase exata: o atlas é paleta chapada, sem gradiente
      if (Math.abs(px[i] - de[k][0]) > 6) continue;
      if (Math.abs(px[i + 1] - de[k][1]) > 6) continue;
      if (Math.abs(px[i + 2] - de[k][2]) > 6) continue;
      px[i] = para[k][0];
      px[i + 1] = para[k][1];
      px[i + 2] = para[k][2];
      trocados++;
      break;
    }
  }
  textura_trocados.set(time.id, trocados);
  ctx.putImageData(dados, 0, 0);

  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.magFilter = THREE.NearestFilter;
  textura.minFilter = THREE.NearestFilter;
  texturas.set(time.id, textura);
  return textura;
}

/**
 * Marca do time: bandeira no peito e vivo no capacete.
 *
 * Elas dizem QUAL time de perto; o tom da farda resolve a quarenta metros. As
 * duas juntas porque uma sozinha não basta — a bandeira some de longe e o tom
 * sozinho confunde quem ainda não decorou as cores.
 */
function marcarTime(raiz, time) {
  const cor = new THREE.MeshLambertMaterial({
    color: time.color, emissive: 0x0a0a0a, flatShading: true
  });
  const escuro = new THREE.MeshLambertMaterial({
    color: 0x1a1c18, emissive: 0x000000, flatShading: true
  });

  // As medidas saem de MEDIR a malha: a frente do tronco está em z 0,146 e o
  // suspensório vai até 0,168. Chutando 0,125, a bandeira nasceu DENTRO do
  // peito e não aparecia em vista nenhuma.
  const peito = raiz.getObjectByName('chest');
  if (peito) {
    const moldura = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.01), escuro);
    moldura.position.set(-0.115, -0.025, 0.178);
    peito.add(moldura);

    const bandeira = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.10, 0.02), cor);
    bandeira.position.set(-0.115, -0.025, 0.186);
    peito.add(bandeira);
  }

  // Vivo em volta do capacete, e um pouco mais largo que ele pra sobrar de
  // fora: por dentro ele não existe pra quem olha.
  const cabeca = raiz.getObjectByName('head');
  if (cabeca) {
    const vivo = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.035, 0.44), cor);
    vivo.position.set(0, 0.145, -0.01);
    cabeca.add(vivo);
  }
}

/** Tira o soldado da T-pose e põe a arma na mão. */
function posar(raiz) {
  const gira = (nome, x = 0, y = 0, z = 0) => {
    const osso = raiz.getObjectByName(nome);
    if (osso) osso.rotation.set(x, y, z);
  };

  // Braços descem da horizontal e vêm à frente. O esquerdo segura o
  // guarda-mão, o direito o punho — é por isso que eles não são simétricos.
  gira('shoulder_L', 0, -0.55, -1.28);
  gira('elbow_L', 0, -0.62, -0.22);
  gira('shoulder_R', 0, 0.28, 1.32);
  gira('elbow_R', 0, 0.55, 0.30);

  // Um pé à frente do outro: parado em posição de tiro, não em sentido.
  gira('thigh_L', -0.10);
  gira('thigh_R', 0.12);
  gira('knee_R', -0.16);
}

/**
 * A que parte do corpo cada malha do modelo pertence.
 *
 * O artista nomeou tudo — `cabeca`, `capacete_topo`, `coxa_L`, `bota_L`,
 * `torso` — e isso torna a hitbox MEDIDA em vez de escrita: ela sai da malha
 * e não pode desalinhar quando o modelo muda. Tabela à mão desalinha na
 * primeira edição, e quem descobre é o jogador vendo a bala atravessar o
 * braço.
 */
const GRUPO_DA_MALHA = [
  [/^capacete/, 'capacete'],
  [/^(cabeca|rosto|pescoco)/, 'cabeca'],
  [/^(mao|antebraco|ombreira|braco)/, 'braco'],
  [/^(coxa|canela|bota|solado)/, 'perna'],
  [/^(torso|gola|quadril|cinto|bolsa|cantil|mochila|suspensorio|granada|insignia)/, 'tronco']
];

function grupoDaMalha(nome) {
  for (const [padrao, grupo] of GRUPO_DA_MALHA) {
    if (padrao.test(nome)) return grupo;
  }
  return null;
}

/**
 * As caixas de acerto medidas do modelo POSADO, no sistema do soldado.
 *
 * Uma caixa por malha nomeada, agrupada por parte do corpo. Medido uma vez:
 * o gabarito é o mesmo pra todos, e posar cada soldado igual é o que garante
 * que a caixa vale pra qualquer um deles.
 */
let gabarito = null;
export function caixasDoModelo() {
  if (gabarito || !modelo) return gabarito;

  const molde = criarSoldado('karnia');
  if (!molde) return null;

  const raiz = molde.grupo;
  raiz.position.set(0, 0, 0);
  raiz.rotation.set(0, 0, 0);
  raiz.updateMatrixWorld(true);

  const caixa = new THREE.Box3();
  const encontradas = [];

  raiz.traverse((o) => {
    if (!o.isMesh || !o.name) return;
    const grupo = grupoDaMalha(o.name);
    if (!grupo) return;

    caixa.setFromObject(o);
    encontradas.push({
      id: o.name, grupo,
      minX: caixa.min.x, maxX: caixa.max.x,
      minY: caixa.min.y, maxY: caixa.max.y,
      minZ: caixa.min.z, maxZ: caixa.max.z
    });
  });

  gabarito = encontradas.length ? encontradas : null;
  return gabarito;
}

/**
 * Uma cópia do soldado, na farda do time e já posada.
 *
 * Materiais são clonados por time e compartilhados entre os soldados dele:
 * um material por soldado seria uma chamada de desenho por soldado.
 */
const materiais = new Map();
export function criarSoldado(teamId) {
  if (!modelo) return null;

  const time = teamOf(teamId);
  const copia = modelo.clone(true);
  copia.scale.setScalar(ALTURA_JOGO / ALTURA_MODELO);

  if (!materiais.has(teamId)) {
    let base = null;
    modelo.traverse((o) => { if (o.isMesh && !base) base = o.material; });

    const material = base.clone();
    material.map = texturaDoTime(time, base.map);
    material.flatShading = true;
    material.needsUpdate = true;
    materiais.set(teamId, material);
  }

  const material = materiais.get(teamId);
  const pintados = [];
  copia.traverse((o) => {
    if (!o.isMesh) return;
    o.material = material;
    pintados.push(o);
  });

  posar(copia);
  marcarTime(copia, time);
  return { grupo: copia, material, pintados, maos: copia.getObjectByName('weapon') };
}
