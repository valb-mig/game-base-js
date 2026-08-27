/**
 * Agachado e deitado como POSE, não como um soldado achatado.
 *
 * Até aqui as duas posturas eram escala em Y da malha: o corpo encolhia no
 * lugar e a hitbox encolhia junto. Funciona pra agachar — um homem agachado
 * ocupa mais ou menos a mesma planta —, e MENTE pra deitar: um corpo no chão
 * tem dois metros de comprimento e meio de altura, e o que estava em jogo era
 * um tijolo de 50 cm de lado. De frente ele era quase impossível de acertar;
 * de lado, o tiro passava por cima de um corpo que estava ali.
 *
 * Aqui é só ângulo por osso e um deslocamento de quadril, sem three: a mesma
 * tabela posa o soldado na tela e posa o gabarito de que a hitbox é MEDIDA,
 * e é isso que impede as duas de divergirem.
 *
 * Os sinais saem da geometria do modelo, não de gosto: o osso aponta pro -y,
 * então girar em +x o leva pra trás. Girar o QUADRIL em +90° deita o corpo
 * de bruços com a cabeça pra frente e as pernas pra trás — que é o que um
 * homem no chão faz.
 */

const RETO = Math.PI / 2;

/**
 * De pé é o repouso, e por isso é a pose VAZIA.
 *
 * Ela existe declarada mesmo assim: quem percorre as posturas — a medida da
 * hitbox, o teste — precisa que as três tenham a mesma forma, e um `null` no
 * meio vira um caso especial em cada consumidor.
 */
const PE = { ossos: {}, quadril: [0, 0, 0], porte: [0, 0, 0], caimento: 0 };

/**
 * Agachado: coxa recolhida, joelho fechado, tronco à frente do apoio.
 *
 * E o quanto ele baixa NÃO sai do deslocamento do quadril — sai do ângulo
 * das juntas. Medido: baixar o quadril de 42 pra 96 cm não mudou a altura em
 * um milímetro, porque o apoio medido levanta o corpo de volta na mesma
 * conta. Quem decide a altura é a dobra; o quadril só decide onde o peso
 * fica em relação aos pés.
 *
 * O tronco INCLINA de propósito. Só dobrar a perna deixa o soldado sentado
 * no próprio calcanhar, com o peito na vertical — a silhueta de quem
 * descansa, não a de quem se protege. Inclinado, a cabeça sai de trás da
 * linha do joelho e o corpo lê como agachado atrás de alguma coisa.
 *
 * E ele é FUNDO. A primeira versão baixava o quadril 42 cm e deixava o corpo
 * com 1,46 m — o jogo trata agachado como 1,15 (bot) e 0,95 (olho do
 * jogador), e a diferença toda era coberta ESMAGANDO o corpo em y: a hitbox
 * saía comprimida a 79% e o corpo em primeira pessoa a 63%, um anão de
 * pernas curtas. Um agachamento que não agacha faz todo mundo em volta
 * mentir pra compensar. Estes números põem o corpo posado em ~1,15 m, que é
 * a altura que o jogo já declarava.
 */
const AGACHADO = {
  ossos: {
    thigh_L: [-1.66, 0, 0], thigh_R: [-1.66, 0, 0],
    knee_L: [2.50, 0, 0], knee_R: [2.50, 0, 0],
    hips: [0.46, 0, 0],
    spine: [-0.20, 0, 0],
    chest: [-0.18, 0, 0]
  },
  quadril: [0, -0.96, 0.10],
  // A arma desce com o corpo. Ela vive no grupo e não no peito, então o
  // quadril baixar não a leva junto — sem isto o soldado agacha e o fuzil
  // fica flutuando na altura em que o peito dele estava.
  porte: [0, -0.34, 0.04],
  caimento: 0.10
};

/**
 * Deitado: o corpo inteiro tomba pra frente em torno do quadril.
 *
 * O giro vai no QUADRIL e não osso a osso: ele é a raiz, e tudo que pende
 * dele acompanha de graça — tronco, cabeça, braços e pernas de uma vez. Osso
 * a osso seriam dezenove números pra manter de acordo entre si, e o primeiro
 * ajuste desalinharia o corpo.
 *
 * Não são 90° cheios: quem está deitado atirando levanta o peito nos
 * cotovelos, e é essa diferença que deixa a cabeça acima do capim em vez de
 * enterrada nele.
 */
const DEITADO = {
  ossos: {
    hips: [RETO - 0.10, 0, 0],
    spine: [-0.08, 0, 0],
    chest: [-0.12, 0, 0],
    neck: [-0.30, 0, 0],
    // Pernas abertas e ligeiramente dobradas: é como se apoia atirando, e é
    // o que impede as duas botas de ocuparem o mesmo ponto no chão.
    //
    // O sinal da coxa é NEGATIVO, e isso é a armadilha desta pose: com o
    // quadril já girado, `+x` deixou de ser "pra trás" e virou "pra cima" —
    // a perna herda a rotação do pai. Medido pela foto, as botas ficavam
    // meio metro acima do tronco, com o corpo pendurado em diagonal.
    thigh_L: [-0.12, 0, 0.16], thigh_R: [-0.12, 0, -0.16],
    knee_L: [0.34, 0, 0], knee_R: [0.34, 0, 0]
  },
  quadril: [0, -1.06, -0.30],
  // Deitado a arma vai pra frente e pro chão, apoiada: é o único lugar em
  // que a mão alcança com o ombro a trinta centímetros do solo.
  porte: [0, -0.82, 0.22],
  caimento: -0.06
};

export const POSTURAS = { pe: PE, agachado: AGACHADO, deitado: DEITADO };

/** Os nomes, na ordem em que o corpo desce. Quem varre as três lê daqui. */
export const NOMES_DE_POSTURA = ['pe', 'agachado', 'deitado'];

/**
 * A postura de uma altura de corpo.
 *
 * Quem já fala em altura — o soldado, o jogador — não precisa aprender um
 * vocabulário novo pra isto funcionar. Os cortes ficam bem longe das três
 * alturas de propósito: no meio de uma transição de postura, que leva
 * frações de segundo, o corpo tem que escolher UMA e não piscar entre duas.
 */
export function posturaDe(altura, base) {
  const fracao = altura / base;
  if (fracao <= 0.45) return 'deitado';
  if (fracao <= 0.78) return 'agachado';
  return 'pe';
}
