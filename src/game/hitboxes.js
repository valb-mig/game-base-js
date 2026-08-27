/**
 * Onde a bala pegou, e quanto isso vale.
 *
 * O corpo é dividido como um corpo é: capacete, cabeça, peito, abdome, e cada
 * membro em três — mão, antebraço, braço; pé, canela, coxa. Uma esfera só no
 * peito fazia o tiro na cabeça valer o mesmo que o tiro na canela, e aí mirar
 * deixa de ser habilidade.
 *
 * São CAIXAS, e não cápsulas, porque o soldado é feito de caixas. Cápsula não
 * cobre peça chata: o capacete tem 27 cm de largura e 19 de altura, e a
 * cápsula que cobria a largura sobrava 8 cm acima da cabeça — hitbox no ar.
 *
 * As medidas saem das mesmas peças do modelo (`bots/soldier.js`), e a caixa é
 * um pouco maior que a peça de propósito: hitbox menor que o desenho faz o
 * jogador ver a bala passar por dentro do braço.
 *
 * A promessa é em TIROS, não em pontos — o jogador conta tiros. E os
 * multiplicadores são calibrados pela arma mais FRACA que existe: com ela a
 * promessa vale, com as outras vale com folga.
 *
 * Sem three: são caixas, números e um yaw, e dá pra provar cada promessa.
 */

/**
 * Grupos de dano. A peça diz onde pegou; o grupo diz quanto vale.
 *
 * `id` existe porque `nome` é TEXTO DE TELA: quem precisa ramificar por
 * região — a fagulha, que levanta jorro na cabeça e faísca de metal no
 * capacete — não pode comparar com a palavra acentuada que o HUD escreve.
 * Traduzir o HUD um dia quebraria a fagulha em silêncio.
 */
export const GRUPOS = {
  cabeca: { id: 'cabeca', nome: 'cabeça', multiplicador: 4.2 },
  capacete: { id: 'capacete', nome: 'capacete', multiplicador: 2.1 },
  tronco: { id: 'tronco', nome: 'tronco', multiplicador: 1 },
  braco: { id: 'braco', nome: 'braço', multiplicador: 0.6 },
  perna: { id: 'perna', nome: 'perna', multiplicador: 0.6 }
};

/**
 * As peças, num soldado de 1,75 m de pé, no sistema DELE: +x é a direita,
 * +z é a frente, y sobe do pé.
 *
 * `espelhado` cria a peça dos dois lados. A ordem é a de PRIORIDADE: onde
 * duas se encostam ganha a primeira, porque acertar o menor alvo não pode ser
 * desperdiçado por um milímetro de sobreposição.
 */
export const PECAS = [
  { id: 'capacete', grupo: 'capacete', centro: [0, 1.605, 0], tamanho: [0.28, 0.20, 0.30] },
  { id: 'cabeca', grupo: 'cabeca', centro: [0, 1.44, 0], tamanho: [0.22, 0.26, 0.22] },

  { id: 'mao', grupo: 'braco', espelhado: 0.21, centro: [0, 0.90, 0.24], tamanho: [0.12, 0.12, 0.14] },
  { id: 'antebraco', grupo: 'braco', espelhado: 0.24, centro: [0, 0.99, 0.12], tamanho: [0.14, 0.28, 0.20] },
  { id: 'braco', grupo: 'braco', espelhado: 0.28, centro: [0, 1.15, 0.02], tamanho: [0.15, 0.30, 0.17] },

  { id: 'pe', grupo: 'perna', espelhado: 0.11, centro: [0, 0.06, 0.02], tamanho: [0.19, 0.14, 0.31] },
  { id: 'canela', grupo: 'perna', espelhado: 0.11, centro: [0, 0.27, 0], tamanho: [0.18, 0.36, 0.19] },
  { id: 'coxa', grupo: 'perna', espelhado: 0.11, centro: [0, 0.62, 0], tamanho: [0.21, 0.38, 0.23] },

  { id: 'abdome', grupo: 'tronco', centro: [0, 0.90, 0], tamanho: [0.47, 0.26, 0.28] },
  { id: 'peito', grupo: 'tronco', centro: [0, 1.14, 0], tamanho: [0.46, 0.32, 0.27] }
];

/** Compatibilidade com quem lê grupo por nome. */
export const REGIOES = GRUPOS;
export const ORDEM = ['cabeca', 'capacete', 'braco', 'perna', 'tronco'];

/** Altura de referência das medidas acima. */
export const ALTURA_BASE = 1.75;

/**
 * De onde sai a medida do modelo, quando há modelo.
 *
 * Injetado de fora pra que este arquivo continue sem three e sem arquivo:
 * regra de dano não pode depender de um `.glb` ter carregado pra poder ser
 * testada.
 */
let medidasDoModelo = null;
export function usarMedidasDoModelo(fonte) {
  medidasDoModelo = fonte;
}

/**
 * As caixas de um corpo, NO SISTEMA DELE.
 *
 * Quem testa acerto leva a bala pro sistema do alvo — uma conta por alvo — em
 * vez de rodar dezesseis caixas pro mundo. E agachar encolhe só o Y, porque é
 * só o Y que o modelo encolhe: escalando os três eixos, braço e perna ficavam
 * FORA da hitbox de quem estava agachado.
 */
/**
 * Altura total de cada postura, medida das caixas dela e guardada.
 *
 * A pose já põe o corpo na altura dele — agachado tem uns 1,05 m e deitado
 * uns 0,45 —, mas quem pergunta declara a altura em que ESTÁ, e as duas não
 * batem: o jogador agacha pra 0,95 e o soldado do modelo agacha pro que a
 * pose der. A razão entre as duas é o que reconcilia, e ela é medida uma vez
 * por postura em vez de escrita — tabela à mão desalinha na primeira vez que
 * a pose mudar, que é o defeito que este arquivo inteiro existe pra evitar.
 */
const alturaDaPostura = new Map();
function alturaMedida(caixas, postura) {
  if (alturaDaPostura.has(postura)) return alturaDaPostura.get(postura);
  let topo = 0;
  for (const m of caixas) if (m.maxY > topo) topo = m.maxY;
  const valor = topo > 0 ? topo : ALTURA_BASE;
  alturaDaPostura.set(postura, valor);
  return valor;
}

export function corpoDe(altura = ALTURA_BASE, saida = [], postura = 'pe') {
  saida.length = 0;

  // Se o modelo carregou, a hitbox sai da MALHA dele: uma caixa por peça
  // nomeada, medida em vez de escrita. A tabela abaixo é o que sobra pra
  // quando não há modelo — o teste, que roda sem arquivo nenhum.
  const doModelo = medidasDoModelo?.(postura);
  if (doModelo) {
    // Contra a altura DAQUELA postura, não contra a de pé: o corpo deitado
    // já está deitado nas medidas, e dividir pela altura de pé o esmagaria
    // uma segunda vez.
    const escalaY = altura / alturaMedida(doModelo, postura);
    for (const m of doModelo) {
      const ordem = ORDEM.indexOf(m.grupo);
      saida.push({
        peca: m, regiao: GRUPOS[m.grupo], ordem: ordem < 0 ? ORDEM.length : ordem,
        minX: m.minX, maxX: m.maxX,
        minY: m.minY * escalaY, maxY: m.maxY * escalaY,
        minZ: m.minZ, maxZ: m.maxZ
      });
    }
    return saida;
  }

  // Sem modelo só resta achatar a tabela de pé. É o que o teste exercita, e
  // é declaradamente pior: ela não sabe deitar ninguém.
  const escalaY = altura / ALTURA_BASE;
  PECAS.forEach((peca, ordem) => {
    const lados = peca.espelhado ? [-1, 1] : [0];
    for (const lado of lados) {
      const [cx, cy, cz] = peca.centro;
      const [w, h, d] = peca.tamanho;
      const x = cx + (peca.espelhado ?? 0) * lado;

      saida.push({
        peca, regiao: GRUPOS[peca.grupo], ordem, lado,
        minX: x - w / 2, maxX: x + w / 2,
        minY: (cy - h / 2) * escalaY, maxY: (cy + h / 2) * escalaY,
        minZ: cz - d / 2, maxZ: cz + d / 2
      });
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
