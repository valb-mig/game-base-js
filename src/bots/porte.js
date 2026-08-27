/**
 * Como o soldado PORTA a arma: onde ela fica no corpo, e onde as mãos pegam.
 *
 * A dependência vai ao contrário do que estava: antes a arma pendurava no nó
 * `weapon_R` do arquivo e as mãos ficavam onde a pose de repouso as tivesse
 * deixado — medido, a esquerda estava a 58,5 cm da arma e o cano apontava
 * 30° pro chão. O soldado não segurava a arma; arrastava.
 *
 * Agora a arma é posta no corpo (aqui) e as MÃOS vão até ela por IK, pelos
 * marcadores `mao_dir` e `mao_esq` que cada modelo já declara pro viewmodel.
 * Arma nova entra sem tocar em pose de braço nenhuma — e é a mesma ideia das
 * mãos no volante do jipe.
 *
 * O sistema é o do soldado: +x é a direita dele, +z a frente, y sobe do pé.
 * O cano do modelo nasce no -Z, então o meio-giro é o que o faz apontar pra
 * frente do corpo — não é ajuste, é a conversão entre os dois sistemas.
 */

import { ossoDoLado } from './esqueleto.js';

const MEIA_VOLTA = Math.PI;

/**
 * As duas mãos do soldado, em lado de CORPO — e o osso de cada uma.
 *
 * Esta indireção existe porque o arquivo nomeia os lados ao contrário (ver
 * `LADO_EM_X`): a mão direita dele é o osso `hand_L`. Sem ela, quem autora
 * porte tem que lembrar da inversão a cada número, e vai errar — a primeira
 * versão pôs o punho da MP40 na mão esquerda e o guarda-mão na direita, ou
 * seja a arma empunhada ao contrário, com as duas mãos nela.
 */
export const MAOS = [
  { marcador: 'mao_dir', osso: ossoDoLado(1), polo: [1, -0.62, -0.22], principal: true },
  { marcador: 'mao_esq', osso: ossoDoLado(-1), polo: [-1, -0.62, -0.22], principal: false }
];

/**
 * O porte padrão de arma de fogo: à altura do peito, cano à frente e um
 * pouco cruzada sobre o corpo.
 *
 * Cruzada e não reta de propósito: arma apontada exatamente pra frente lê
 * como sentinela de brinquedo, e é a diagonal que faz a silhueta de alguém
 * pronto pra levantar o cano. O caimento é pequeno — cano no chão vira o
 * defeito que isto veio consertar.
 */
const FOGO = {
  // Medido, não escolhido: o braço deste modelo mede 0,46 m do ombro ao
  // punho, e a primeira tentativa punha o guarda-mão a 0,62 m do ombro
  // esquerdo. A IK trunca o que não alcança e a mão para no caminho — 8 cm
  // de ar entre a palma e a arma, que é o defeito antigo com outro tamanho.
  //
  // E a folga tem que sobreviver ao BALANÇO: com a arma a 0,42 m do ombro,
  // parado ela alcançava e andando a mão desgrudava 8 cm nos dois pontos do
  // ciclo em que o ombro sobe. O alvo se mede na passada, não parado.
  posicao: [0.06, 1.15, -0.03],
  giro: [-0.10, MEIA_VOLTA - 0.30, -0.06],
  ambasAsMaos: true
};

/**
 * Arma curta é de UMA mão, e forçar a esquerda nela é o erro contrário do
 * que estava: a mão cruza o peito atrás de um guarda-mão que não existe.
 * A esquerda fica na pose de repouso, que é onde um braço solto fica.
 */
const CURTA = {
  // No lado da mão que a segura, e perto o bastante pra o braço alcançar: o
  // ombro que manda nela mora no +x deste modelo (ver `LADO_EM_X`).
  posicao: [0.14, 1.06, 0.14],
  giro: [-0.16, MEIA_VOLTA - 0.16, 0],
  ambasAsMaos: false
};

/**
 * Ferramenta se carrega apoiada, com as duas mãos, mais baixa que a arma.
 *
 * O cabo da pá é longo, e a primeira tentativa punha a mão de baixo a 0,60 m
 * do ombro contra 0,46 m de braço: a mão parava a 13 cm do cabo. Perto do
 * corpo e menos caída, as duas alcançam.
 */
const FERRAMENTA = {
  posicao: [-0.02, 1.08, 0.08],
  giro: [-0.38, MEIA_VOLTA - 0.24, 0],
  ambasAsMaos: true
};

const POR_ITEM = {
  mp40: FOGO,
  m1911: CURTA,
  kabar: CURTA,
  m1943: FERRAMENTA
};

/**
 * Onde esta arma é carregada. Item desconhecido cai no porte de arma de
 * fogo: item novo aparece na mão em vez de no chão atrás do soldado.
 */
export function porteDe(arma) {
  if (!arma) return null;
  return POR_ITEM[arma.id] ?? FOGO;
}
