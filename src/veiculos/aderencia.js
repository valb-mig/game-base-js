import { AGUA, ESTRADA, AREIA, TERRA, GRAMA } from '../world/ground.js';

/**
 * Quanto cada tipo de chão agarra, e quanto ele arrasta.
 *
 * Os tipos são os MESMOS de `world/ground.js`, e isso não é economia: é a
 * única maneira de o veículo concordar com o resto do jogo sobre onde ele
 * está. Uma tabela própria de "materiais de terreno" viraria a segunda fonte
 * de verdade sobre o chão, e ela se separaria da primeira no primeiro ajuste
 * da declividade — o jipe patinaria num asfalto que a malha pinta de grama.
 *
 * `atrito` é o µ que limita tração e curva; `rolamento` é o que come
 * velocidade só de andar. Eles não andam juntos de propósito: areia agarra
 * pouco E arrasta muito, asfalto agarra muito E arrasta pouco, mas grama
 * agarra razoável e ainda arrasta.
 *
 * Não há LAMA como tipo de chão neste mapa — o que faz o papel dela é TERRA,
 * que é justamente o barranco e a margem do rio, ou seja onde o jipe tem que
 * escorregar. Inventar um tipo novo aqui obrigaria `ground.js` a saber
 * distinguir barro de terra seca, e a malha não tem essa informação.
 */
/**
 * O µ do asfalto é 0,85, e não 1,0. A diferença decide se o jipe capota em
 * TODA curva rápida ou só quando o terreno ajuda: com meia-bitola de 0,65 m e
 * CG a 0,62, o limiar de tombamento é 1,05 g — ou seja, pneu que agarra 1,0
 * põe o veículo em cima do limiar em qualquer curva de pista seca, e capotar
 * deixa de dizer alguma coisa. Pneu diagonal de 1945 sobre macadame faz 0,7 a
 * 0,85 mesmo; capotar volta a ser consequência de lombada, encosto e valeta.
 */
export const ADERENCIA = {
  [ESTRADA]: { atrito: 0.85, rolamento: 0.014 },
  [GRAMA]: { atrito: 0.66, rolamento: 0.042 },
  [TERRA]: { atrito: 0.50, rolamento: 0.080 },
  [AREIA]: { atrito: 0.42, rolamento: 0.130 },
  // Dentro d'água o pneu quase não pega, e a água freia o corpo inteiro. O
  // jipe não flutua e não nada: o rio continua sendo gargalo pra ele também.
  [AGUA]: { atrito: 0.30, rolamento: 0.170 }
};

const PADRAO = ADERENCIA[GRAMA];

export function aderenciaDe(tipo) {
  return ADERENCIA[tipo] ?? PADRAO;
}
