import * as THREE from 'three';
import { SUPRIMENTO } from '../game/suprimento.js';

/**
 * Caixa de munição: o que fica no chão quando alguém cai.
 *
 * Ela não vai pra mão nem ocupa slot — apanhar é CONSUMIR. É o que faz matar
 * render alguma coisa além de uma linha no kill feed: quem gastou o
 * carregador tem motivo pra avançar até o corpo em vez de recuar, e avançar
 * até um corpo é justamente onde o próximo tiro costuma estar.
 *
 * Meia reserva, e não uma cheia: a caixa é sobra, não depósito. Enchendo
 * tudo, voltar ao posto deixaria de ter razão e a economia inteira sumiria.
 */
export const CAIXA_MUNICAO = {
  id: 'caixa-municao',
  name: 'Caixa de munição',
  note: 'apanhar reabastece a reserva',

  // Sem `slot`: ela não é carregada, é consumida. `player.takeCarried` nem
  // chega a ser chamado — `drop.js` desvia antes.
  slot: null,
  suprimento: SUPRIMENTO.CAIXA,
  weight: 6
};

const MADEIRA = 0x6a5334;
const MADEIRA_CLARA = 0x8a6f47;
const FERRAGEM = 0x3a3c36;
const ESTENCIL = 0xb9a05a;

function fosco(color) {
  return new THREE.MeshLambertMaterial({ color, emissive: 0x080808, flatShading: true });
}

/**
 * Engradado de munição de 1944: caixa de madeira com cintas de metal e
 * estêncil na tampa. Sete caixas — o suficiente pra ler como engradado
 * militar e não como caixote de feira, a distância de apanhar.
 */
export function createCaixaMunicao() {
  const grupo = new THREE.Group();
  grupo.name = 'caixa-municao';

  const L = 0.42;
  const A = 0.2;
  const P = 0.24;

  const corpo = new THREE.Mesh(new THREE.BoxGeometry(L, A, P), fosco(MADEIRA));
  corpo.position.y = A / 2;
  grupo.add(corpo);

  // tampa um pouco maior, pra sobrar beirada
  const tampa = new THREE.Mesh(
    new THREE.BoxGeometry(L + 0.02, 0.03, P + 0.02), fosco(MADEIRA_CLARA));
  tampa.position.y = A + 0.012;
  grupo.add(tampa);

  // duas cintas de metal em volta
  for (const dx of [-L * 0.28, L * 0.28]) {
    const cinta = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, A + 0.05, P + 0.01), fosco(FERRAGEM));
    cinta.position.set(dx, A / 2 + 0.01, 0);
    grupo.add(cinta);
  }

  // alças nas pontas
  for (const dx of [-L / 2, L / 2]) {
    const alca = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.05, P * 0.5), fosco(FERRAGEM));
    alca.position.set(dx, A * 0.6, 0);
    grupo.add(alca);
  }

  // faixa de estêncil na tampa: o que diz "munição" a três metros
  const marca = new THREE.Mesh(
    new THREE.BoxGeometry(L * 0.5, 0.006, P * 0.16), fosco(ESTENCIL));
  marca.position.set(0, A + 0.03, 0);
  grupo.add(marca);

  return grupo;
}
