/**
 * Onde a bala pegou, e quanto isso vale.
 *
 * Uma esfera só no peito fazia o tiro na cabeça valer o mesmo que o tiro na
 * canela — e aí mirar deixa de ser habilidade. Aqui o corpo é dividido como
 * um corpo é: cabeça, capacete, peito, abdome, e cada membro em DOIS pedaços,
 * como num boneco de verdade.
 *
 * Segmentado porque membro dobra. Uma cápsula do ombro até a mão passa longe
 * do braço de quem está com a arma erguida, e sobra caixa no vazio ao lado do
 * corpo — foi o que aconteceu na primeira versão, e a bala atravessava a
 * perna.
 *
 * Cada região é uma CÁPSULA: dois pontos e um raio. Ela cobre exatamente o
 * segmento mais o raio em volta, e o segmento é encolhido pelo raio nas
 * pontas justamente pra que a superfície caia onde o osso acaba.
 *
 * A promessa é em TIROS, não em pontos — o jogador conta tiros. E os
 * multiplicadores são calibrados pela arma mais FRACA que existe: com ela a
 * promessa vale, com as outras vale com folga.
 *
 * Sem three: são pontos, raios e números, e dá pra provar cada promessa.
 */

/** Grupos de dano. A região diz onde pegou; o grupo diz quanto vale. */
export const GRUPOS = {
  cabeca: { nome: 'cabeça', multiplicador: 4.2 },
  capacete: { nome: 'capacete', multiplicador: 2.1 },
  tronco: { nome: 'tronco', multiplicador: 1 },
  braco: { nome: 'braço', multiplicador: 0.6 },
  perna: { nome: 'perna', multiplicador: 0.6 }
};

/**
 * As peças do corpo, em metros e num soldado de 1,75 m de pé.
 *
 * `a` e `b` são as pontas do osso em [x, y, z]; `espelhado` cria a peça dos
 * dois lados. A ordem é a de PRIORIDADE: onde duas se encostam, ganha a
 * primeira — acertar o menor alvo não pode ser desperdiçado por um milímetro
 * de sobreposição.
 */
export const PECAS = [
  { id: 'capacete', grupo: 'capacete', raio: 0.135, a: [0, 1.58, 0], b: [0, 1.68, 0] },
  { id: 'cabeca', grupo: 'cabeca', raio: 0.105, a: [0, 1.40, 0], b: [0, 1.56, 0] },

  { id: 'mao', grupo: 'braco', raio: 0.065, espelhado: 0.21,
    a: [0, 0.88, 0.20], b: [0, 0.93, 0.27] },
  { id: 'antebraco', grupo: 'braco', raio: 0.075, espelhado: 0.25,
    a: [0, 0.92, 0.20], b: [0, 1.08, 0.06] },
  { id: 'braco', grupo: 'braco', raio: 0.08, espelhado: 0.275,
    a: [0, 1.06, 0.03], b: [0, 1.28, 0] },

  { id: 'pe', grupo: 'perna', raio: 0.075, espelhado: 0.11,
    a: [0, 0.05, -0.04], b: [0, 0.09, 0.09] },
  { id: 'canela', grupo: 'perna', raio: 0.085, espelhado: 0.11,
    a: [0, 0.10, 0], b: [0, 0.45, 0] },
  { id: 'coxa', grupo: 'perna', raio: 0.105, espelhado: 0.11,
    a: [0, 0.44, 0], b: [0, 0.82, 0] },

  { id: 'abdome', grupo: 'tronco', raio: 0.155, a: [0, 0.82, 0], b: [0, 1.04, 0] },
  { id: 'peito', grupo: 'tronco', raio: 0.175, a: [0, 1.02, 0], b: [0, 1.34, 0] }
];

/** Compatibilidade: o grupo de cada peça, indexado pelo nome do grupo. */
export const REGIOES = GRUPOS;
export const ORDEM = ['cabeca', 'capacete', 'braco', 'perna', 'tronco'];

/**
 * As cápsulas de um corpo, em coordenada de mundo.
 *
 * `saida` é reaproveitado: resolver acerto é coisa de todo quadro, e alocar
 * uma lista por bala por alvo seria lixo por quadro.
 */
export function corpoDe(x, feetY, z, altura, saida = [], yaw = 0) {
  saida.length = 0;
  const escala = altura / 1.75;

  // Os membros ficam nos lados DELE, não nos lados do mundo: de perfil, um
  // braço fica na frente do outro, e é isso que o tiro tem que ver.
  const cos = Math.cos(yaw);
  const sen = Math.sin(yaw);

  const poe = (peca, lado, ordem) => {
    const [ax, ay, az] = peca.a;
    const [bx, by, bz] = peca.b;
    const desloca = (peca.espelhado ?? 0) * lado;

    // roda o ponto local em volta do Y e leva pro mundo
    const mundo = (lx, ly, lz) => {
      const px = (lx + desloca) * escala;
      const pz = lz * escala;
      return [
        x + px * cos + pz * sen,
        feetY + ly * escala,
        z - px * sen + pz * cos
      ];
    };

    const [pax, pay, paz] = mundo(ax, ay, az);
    const [pbx, pby, pbz] = mundo(bx, by, bz);
    const raio = peca.raio * escala;

    // Encolhe o segmento pelo raio: a cápsula tem tampa redonda, e sem isso
    // ela cobria `raio` além do osso e invadia a peça vizinha.
    const dx = pbx - pax;
    const dy = pby - pay;
    const dz = pbz - paz;
    const comprimento = Math.hypot(dx, dy, dz);
    const corte = Math.min(raio, comprimento / 2);
    const k = comprimento > 1e-6 ? corte / comprimento : 0;

    saida.push({
      peca, regiao: GRUPOS[peca.grupo], raio, ordem,
      ax: pax + dx * k, ay: pay + dy * k, az: paz + dz * k,
      bx: pbx - dx * k, by: pby - dy * k, bz: pbz - dz * k
    });
  };

  PECAS.forEach((peca, ordem) => {
    if (peca.espelhado) {
      poe(peca, -1, ordem);
      poe(peca, 1, ordem);
    } else {
      poe(peca, 0, ordem);
    }
  });
  return saida;
}

/**
 * Quantos tiros desta arma matam, acertando sempre neste grupo.
 *
 * Existe pra que a promessa ("cabeça é um tiro") seja verificável em vez de
 * combinada: se alguém mexer num multiplicador, o teste conta os tiros de
 * novo e diz.
 */
export function tirosPraMatar(dano, vida, grupo) {
  return Math.ceil(vida / (dano * GRUPOS[grupo].multiplicador));
}
