/**
 * O esqueleto do soldado: onde ficam as juntas e o que liga o quê.
 *
 * Uma tabela só, e ela serve a duas coisas que vão andar juntas: o ragdoll,
 * que simula junta por junta, e a animação, que gira osso por osso. As duas
 * falam o MESMO vocabulário de nomes — os do arquivo do modelo (`hips`,
 * `chest`, `elbow_L`, `knee_R`…) — pra que uma pose escrita pra animar e uma
 * pose vinda da física caiam no mesmo lugar.
 *
 * Sem three de propósito: são nomes, posições e comprimentos. O ragdoll pode
 * ser provado num teste sem carregar arquivo nenhum e sem montar cena.
 *
 * As posições são a T-POSE, em metros, no sistema do soldado: +x é a direita
 * dele, +z a frente, y sobe do pé. Quando o modelo está carregado elas são
 * MEDIDAS dele (`ossosDoSoldado`); a tabela abaixo é o que sobra quando não
 * há arquivo — no teste, e no corpo de caixas.
 */

export const ALTURA_BASE = 1.75;

/** T-pose de reserva, medida das mesmas peças que a hitbox usa. */
export const JUNTAS_PADRAO = {
  hips: [0, 0.95, 0],
  spine: [0, 1.06, 0],
  chest: [0, 1.20, 0],
  neck: [0, 1.36, 0],
  head: [0, 1.45, 0],

  shoulder_L: [-0.20, 1.32, 0],
  elbow_L: [-0.24, 1.10, 0.06],
  hand_L: [-0.21, 0.92, 0.20],

  shoulder_R: [0.20, 1.32, 0],
  elbow_R: [0.24, 1.10, 0.06],
  hand_R: [0.21, 0.92, 0.20],

  thigh_L: [-0.11, 0.90, 0],
  knee_L: [-0.11, 0.46, 0],
  foot_L: [-0.11, 0.06, 0.02],

  thigh_R: [0.11, 0.90, 0],
  knee_R: [0.11, 0.46, 0],
  foot_R: [0.11, 0.06, 0.02]
};

/**
 * Osso é a ligação entre duas juntas, e o comprimento dele não muda.
 *
 * `pai` importa pra animação, que gira o pai e leva o filho junto; o ragdoll
 * só enxerga uma distância a manter. As duas leem a mesma lista.
 */
export const OSSOS = [
  ['hips', 'spine'],
  ['spine', 'chest'],
  ['chest', 'neck'],
  ['neck', 'head'],

  ['chest', 'shoulder_L'],
  ['shoulder_L', 'elbow_L'],
  ['elbow_L', 'hand_L'],

  ['chest', 'shoulder_R'],
  ['shoulder_R', 'elbow_R'],
  ['elbow_R', 'hand_R'],

  ['hips', 'thigh_L'],
  ['thigh_L', 'knee_L'],
  ['knee_L', 'foot_L'],

  ['hips', 'thigh_R'],
  ['thigh_R', 'knee_R'],
  ['knee_R', 'foot_R']
];

/**
 * Amarras que não são osso: elas dão FORMA ao que a corrente de ossos não
 * segura sozinha.
 *
 * Sem elas o tronco é um cordão de contas — dobra ao meio, os ombros se
 * encostam e o corpo vira um novelo no chão. São a diferença entre "caiu" e
 * "derreteu".
 */
export const AMARRAS = [
  ['hips', 'chest'],
  ['shoulder_L', 'shoulder_R'],
  ['shoulder_L', 'hips'],
  ['shoulder_R', 'hips'],
  ['thigh_L', 'thigh_R'],
  ['chest', 'head']
];

/**
 * Limites de dobra: distância MÍNIMA entre a junta de cima e a de baixo de
 * uma dobradiça.
 *
 * Cotovelo e joelho não fecham até encostar, e é isso que impede o membro de
 * atravessar a si mesmo e de dobrar até virar do avesso. O valor é uma fração
 * do alcance esticado do par, calculada na montagem — assim ela acompanha
 * qualquer modelo, medido ou de reserva.
 *
 * Ele não decide o LADO da dobra: quem decide isso é de onde o corpo veio e
 * pra onde a gravidade puxa. Um cotovelo pode terminar dobrado ao contrário
 * num tombo esquisito; o que não pode é dobrar 180° e sair pelo outro lado.
 */
export const DOBRAS = [
  ['shoulder_L', 'elbow_L', 'hand_L', 0.62, 0.2],
  ['shoulder_R', 'elbow_R', 'hand_R', 0.62, 0.2],
  ['thigh_L', 'knee_L', 'foot_L', 0.8, 0.25],
  ['thigh_R', 'knee_R', 'foot_R', 0.8, 0.25],

  // O tronco quase não dobra, e o pescoço menos ainda: cadáver de jogo que
  // enrola a coluna lê como saco de batata, não como gente.
  ['hips', 'spine', 'chest', 0.96, 0.4],
  ['spine', 'chest', 'neck', 0.96, 0.4],
  ['chest', 'neck', 'head', 0.92, 0.4],

  // E o quadril não fecha: sem isto o corpo senta no próprio calcanhar, que
  // foi o primeiro resultado — um monte de caixas em vez de um homem caído.
  ['chest', 'hips', 'thigh_L', 0.8, 0.25],
  ['chest', 'hips', 'thigh_R', 0.8, 0.25],
  ['hips', 'thigh_L', 'knee_L', 0.82, 0.25],
  ['hips', 'thigh_R', 'knee_R', 0.82, 0.25],
  ['chest', 'shoulder_L', 'elbow_L', 0.7, 0.2],
  ['chest', 'shoulder_R', 'elbow_R', 0.7, 0.2]
];

/**
 * Meia espessura do corpo em cada junta, em metros.
 *
 * Uma só pra tudo achatava o corpo no chão: a junta encostava e o tronco
 * ficava com o centro a seis centímetros do solo, ou seja meio enterrado.
 * Peito e quadril são grossos, mão e pé são finos, e é isso que faz o corpo
 * deitado ter volume em vez de virar decalque.
 */
export const RAIOS = {
  hips: 0.17,
  spine: 0.16,
  chest: 0.17,
  neck: 0.10,
  head: 0.13,
  shoulder_L: 0.10, shoulder_R: 0.10,
  elbow_L: 0.07, elbow_R: 0.07,
  hand_L: 0.06, hand_R: 0.06,
  thigh_L: 0.11, thigh_R: 0.11,
  knee_L: 0.09, knee_R: 0.09,
  foot_L: 0.07, foot_R: 0.07
};

/** Nomes das juntas, na ordem em que a tabela padrão as declara. */
export const NOMES = Object.keys(JUNTAS_PADRAO);

/**
 * A T-pose do MODELO, quando ele existe, com o pé no zero e escalada pra
 * altura do jogo. Cai na tabela de reserva pra qualquer junta que o arquivo
 * não tenha — modelo trocado não pode derrubar o ragdoll inteiro.
 */
export function juntasDe(medidas, alturaModelo = ALTURA_BASE) {
  if (!medidas) return clonar(JUNTAS_PADRAO);

  const escala = ALTURA_BASE / alturaModelo;
  const saida = clonar(JUNTAS_PADRAO);
  for (const nome of NOMES) {
    const osso = medidas[nome];
    if (!osso) continue;
    saida[nome] = [osso.x * escala, osso.y * escala, osso.z * escala];
  }
  return saida;
}

function clonar(tabela) {
  const saida = {};
  for (const [nome, p] of Object.entries(tabela)) saida[nome] = [p[0], p[1], p[2]];
  return saida;
}

/** Comprimento de cada ligação na T-pose. É o que o solver tem que manter. */
export function medirLigacoes(juntas, pares) {
  return pares.map(([a, b]) => {
    const pa = juntas[a];
    const pb = juntas[b];
    const comprimento = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
    return { a, b, comprimento };
  });
}

/**
 * Alcance esticado de cada dobradiça, o mínimo que ela fecha, e a distância
 * de REPOUSO — a que ela tem na pose que está na tela.
 *
 * O mínimo é a trava dura: o membro não fecha até encostar em si mesmo. O
 * repouso é a mola: ela puxa a dobra de volta pro ângulo em que o corpo
 * estava, fraca o bastante pra gravidade ganhar. Sem a mola, um cordão de
 * distâncias não tem rigidez nenhuma e o corpo DERRETE — medido, três
 * segundos depois da morte o soldado era um monte de caixas no chão.
 */
export function medirDobras(juntas, tabela = DOBRAS) {
  return tabela.map(([a, meio, b, fracao, rigidez = 0]) => {
    const pa = juntas[a];
    const pm = juntas[meio];
    const pb = juntas[b];
    const esticado = Math.hypot(pm[0] - pa[0], pm[1] - pa[1], pm[2] - pa[2])
      + Math.hypot(pb[0] - pm[0], pb[1] - pm[1], pb[2] - pm[2]);
    const repouso = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
    return { a, b, minimo: Math.min(esticado * fracao, repouso), repouso, rigidez };
  });
}
