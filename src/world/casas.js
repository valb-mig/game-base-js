import { addBox } from './props.js';
import {
  assentar, duasAguas, paredeComVao,
  PEDRA, PEDRA_ESCURA, REBOCO, TELHA, TELHA_CLARA, MADEIRA_ESCURA
} from './construcao.js';

/**
 * Casas de pedra da Normandia, quatro tamanhos.
 *
 * Todas são OCAS: quatro paredes, uma porta e o telhado. O chão é o próprio
 * terreno. É isso que faz a Vila Central ser combate urbano em vez de um
 * cenário de blocos — dá pra entrar, atirar da janela e ser flanqueado por
 * dentro. Uma casa maciça seria só um obstáculo mais caro que uma pedra.
 *
 * As janelas são VÃOS de verdade, não textura: bala passa por elas, e é por
 * isso que ficar parado numa lê como posição, não como abrigo.
 *
 * Casa só gira 0° ou 90°, e isso não é preguiça. A colisão só entende AABB, e
 * uma casa a 30° viraria uma caixa envolvente muito maior que ela — parede
 * invisível no meio da rua, o mesmo problema do prop tombado na diagonal.
 * Girar meia-volta é trocar largura por profundidade, e continua exato.
 */

const ESPESSURA = 0.34;

/**
 * Quanto a casa afunda no chão, em metros.
 *
 * Ela nasce no ponto mais baixo da pegada e enterra o resto, senão sobra um
 * vão por baixo do lado que desce. Mas a porta é medida a partir do PISO e
 * não da base da parede — sem isso a soleira enterrada come 35 cm de vão
 * livre, e a porta desenhada deixa de dar passagem a quem está de pé.
 */
const ENTERRA = 0.35;

/**
 * Os quatro tipos. `andares` decide a altura da parede, e é ela que separa a
 * casa que se domina de cima da casa que se atravessa correndo.
 */
export const TIPOS = {
  pequena: {
    nome: 'pequena', largura: 6.4, fundo: 5.2, parede: 2.7, telhado: 1.9,
    cor: REBOCO, telha: TELHA, janelas: 1, chamine: true
  },
  media: {
    nome: 'media', largura: 8.6, fundo: 6.4, parede: 3.6, telhado: 2.4,
    cor: PEDRA, telha: TELHA, janelas: 2, chamine: true
  },
  grande: {
    nome: 'grande', largura: 11.4, fundo: 8.2, parede: 5.8, telhado: 3.1,
    cor: PEDRA, telha: TELHA_CLARA, janelas: 2, chamine: true
  },
  mansao: {
    nome: 'mansao', largura: 16.5, fundo: 11, parede: 7.4, telhado: 4.2,
    cor: PEDRA_ESCURA, telha: TELHA, janelas: 3, chamine: true, alpendre: true
  }
};

export const NOMES = Object.keys(TIPOS);

/**
 * Ergue uma casa. `giro` é 0 ou 1 (meia-volta), e a frente aponta pro +Z
 * quando é 0 — é por ela que se entra.
 *
 * @returns {{x, z, base, largura, fundo, altura}} a pegada, pra quem precisa
 *   não encostar outra coisa nela.
 */
export function addCasa(scene, colliders, {
  tipo, x, z, giro = 0, terrain, settling = null
}) {
  const t = TIPOS[tipo] ?? TIPOS.media;
  const virada = giro % 2 === 1;
  const w = virada ? t.fundo : t.largura;
  const d = virada ? t.largura : t.fundo;

  // Assenta no ponto mais BAIXO da pegada e enterra o resto: casa de pedra em
  // ladeira tem a soleira sumindo no barranco, e a alternativa é um vão por
  // baixo do lado que desce.
  const { base } = assentar(terrain, x, z, Math.max(w, d) * 0.5);
  const y = base - ENTERRA;
  const h = t.parede + ENTERRA;

  // Fachada com a porta. `vaoEm` fica fora do centro nas casas maiores: porta
  // no meio de uma fachada de dezesseis metros lê como galpão, não como casa.
  paredeComVao(scene, colliders, {
    settling, x, z: z + d / 2, y, largura: w, altura: h, espessura: ESPESSURA, soleira: ENTERRA,
    cor: t.cor, aoLongoDeX: true, vaoLargura: 1.25, vaoAltura: 2.15,
    vaoEm: t.alpendre ? 0 : Math.min(1.6, w * 0.16)
  });

  // Fundo inteiro: entrar e sair pela mesma face faria a casa ser um beco.
  // A janela do fundo é a saída de emergência, e é o que dá as duas linhas
  // de tiro que fazem a casa valer alguma coisa.
  paredeComVao(scene, colliders, {
    settling, x, z: z - d / 2, y, largura: w, altura: h, espessura: ESPESSURA, soleira: ENTERRA,
    cor: t.cor, aoLongoDeX: true, vaoLargura: 1.1, vaoAltura: 1.9, vaoEm: -w * 0.2
  });

  // Laterais: uma janela por lado nas pequenas, duas nas maiores. Cada vão é
  // uma linha de tiro pra dentro e pra fora.
  for (const lado of [-1, 1]) {
    const px = x + lado * w / 2;
    if (t.janelas <= 1) {
      paredeComVao(scene, colliders, {
        settling, x: px, z, y, largura: d, altura: h, espessura: ESPESSURA, soleira: ENTERRA,
        cor: t.cor, aoLongoDeX: false, vaoLargura: 1.05, vaoAltura: 1.15,
        peitoril: 0.95, vaoEm: 0
      });
      continue;
    }
    // Duas janelas viram três pedaços de parede: as duas laterais e o pilar
    // do meio. Sai de dois `paredeComVao` encostados, um por metade.
    for (const meio of [-1, 1]) {
      paredeComVao(scene, colliders, {
        settling, x: px, z: z + meio * d / 4, y, largura: d / 2, altura: h,
        espessura: ESPESSURA, soleira: ENTERRA, cor: t.cor, aoLongoDeX: false,
        vaoLargura: 1, vaoAltura: 1.1, peitoril: 0.95, vaoEm: 0
      });
    }
  }

  duasAguas(scene, colliders, {
    x, y: y + h, z, w, d, altura: t.telhado, cor: t.telha, aoLongoDeX: !virada
  });

  if (t.chamine) {
    const cx = x + (virada ? 0 : w * 0.34);
    const cz = z + (virada ? d * 0.34 : 0);
    addBox(scene, colliders, {
      settling, x: cx, z: cz, y: y + h, w: 0.7, h: t.telhado + 1.1, d: 0.7,
      color: PEDRA_ESCURA
    });
  }

  // Alpendre da mansão: uma laje sobre dois pilares. Cobertura de verdade na
  // entrada, e a única peça que muda a silhueta dela a distância.
  if (t.alpendre) {
    for (const lado of [-1, 1]) {
      addBox(scene, colliders, {
        settling, x: x + lado * 1.9, z: z + d / 2 + 1.5, y,
        w: 0.32, h: 2.6, d: 0.32, color: MADEIRA_ESCURA
      });
    }
    addBox(scene, colliders, {
      settling, x, z: z + d / 2 + 1, y: y + 2.6, w: 5.2, h: 0.28, d: 3.2,
      color: t.telha
    });
  }

  return { x, z, base: y, largura: w, fundo: d, altura: h + t.telhado };
}
