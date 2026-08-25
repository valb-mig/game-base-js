/**
 * Onde a bala pegou, e quanto isso vale.
 *
 * Uma esfera só no peito faz o tiro na cabeça valer o mesmo que o tiro na
 * canela — e aí mirar deixa de ser habilidade. Aqui o corpo é dividido em
 * regiões, cada uma com o seu multiplicador, e a promessa de cada uma é em
 * TIROS, não em porcentagem: o jogador conta tiros, não pontos de dano.
 *
 * Os multiplicadores são calibrados pela arma mais FRACA que existe (a MP40,
 * 24 de dano). Com ela as promessas valem; com qualquer outra, valem com
 * folga. Calibrar pela mais forte deixaria a promessa falsa justamente na
 * arma que a maioria carrega.
 *
 * Sem three: são alturas, raios e números, e dá pra provar cada promessa.
 */

export const REGIOES = {
  // Um tiro. A cabeça descoberta é o prêmio de mirar alto, e é pequena o
  // bastante pra que acertá-la a 50 m seja mérito.
  cabeca: { nome: 'cabeça', de: 1.40, ate: 1.56, raio: 0.115, multiplicador: 4.2 },

  // Dois. O capacete é o que separa "mirei na cabeça" de "acertei a cabeça":
  // ele cobre a parte de cima, e acertar ali é quase acertar e não é.
  capacete: { nome: 'capacete', de: 1.56, ate: 1.70, raio: 0.145, multiplicador: 2.1 },

  // O normal, e a referência de todo o resto.
  tronco: { nome: 'tronco', de: 0.84, ate: 1.40, raio: 0.25, multiplicador: 1 },

  // Braço e perna demoram mais: acertar a silhueta larga de alguém correndo
  // não pode valer o mesmo que acertar o peito de alguém parado.
  bracos: { nome: 'braço', de: 0.88, ate: 1.34, raio: 0.15, multiplicador: 0.6, lateral: 0.27 },
  pernas: { nome: 'perna', de: 0.05, ate: 0.84, raio: 0.19, multiplicador: 0.6 }
};

/** Na ordem em que se testa: o menor e mais valioso primeiro. */
export const ORDEM = ['cabeca', 'capacete', 'bracos', 'pernas', 'tronco'];

/**
 * As esferas de um corpo, em coordenada de mundo.
 *
 * `saida` é reaproveitado: resolver acerto é coisa de todo quadro, e alocar
 * uma lista por bala por alvo seria lixo por quadro.
 */
export function corpoDe(x, feetY, z, altura, saida = []) {
  saida.length = 0;
  const escala = altura / 1.75;   // as medidas são de um soldado de 1,75 m

  for (const chave of ORDEM) {
    const r = REGIOES[chave];
    const meio = feetY + ((r.de + r.ate) / 2) * escala;
    const raio = r.raio * escala;

    if (r.lateral) {
      // dois braços, um de cada lado
      for (const lado of [-1, 1]) {
        saida.push({ regiao: r, x: x + lado * r.lateral * escala, y: meio, z, raio });
      }
    } else {
      saida.push({ regiao: r, x, y: meio, z, raio });
    }
  }
  return saida;
}

/**
 * Quantos tiros desta arma matam, acertando sempre nesta região.
 *
 * Existe pra que a promessa ("cabeça é um tiro") seja verificável em vez de
 * combinada: se alguém mexer num multiplicador, o teste conta os tiros de
 * novo e diz.
 */
export function tirosPraMatar(dano, vida, chave) {
  const r = REGIOES[chave];
  return Math.ceil(vida / (dano * r.multiplicador));
}
