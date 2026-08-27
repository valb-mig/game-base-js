import { addBox } from './props.js';
import { assentar, MADEIRA, MADEIRA_ESCURA, LONA } from './construcao.js';

/**
 * Paiol: os engradados de munição que marcam onde se reabastece.
 *
 * A regra já existia inteira em `game/suprimento.js` — 24 m do centro de um
 * posto dominado devolvem 30% da reserva por segundo — e não tinha corpo
 * nenhum: o jogador via o contador subir sem nunca descobrir por quê.
 *
 * O RAIO CONTINUA SENDO DO POSTO, e o engradado é o SINAL dele. Passá-lo a
 * medir da caixa parecia mais honesto e é pior por três motivos medidos nesta
 * base: criaria uma segunda fonte de verdade sobre onde se reabastece (a
 * coordenada da pilha) enquanto `paiolMaisPerto` do bot continua medindo até o
 * posto, e as duas se separariam no primeiro ajuste; mudaria em silêncio os
 * 24 m contra os quais `abastecido` e a ida ao paiol foram calibrados; e os
 * 24 m existem justamente pra que reabastecer NÃO dispute com capturar a mesma
 * laje de dois metros. O que o objeto precisa é não mentir — e pra isso basta
 * ele estar bem dentro do raio, o que há teste pra garantir.
 *
 * Ao contrário da lona da enfermaria, o engradado PARA BALA: é caixote de
 * madeira cheio de latão, e é a única cobertura baixa que a logística oferece.
 */

export const PAIOL = {
  CAIXA_L: 0.86,      // engradado de 1944 deitado: comprido, baixo, pesado
  CAIXA_A: 0.42,
  CAIXA_P: 0.5,
  PALETE: 2.6         // lado do estrado que segura a pilha
};

const ESTENCIL = 0xb9a05a;

/**
 * Pilha de engradados sobre um estrado, com um par de caixas soltas ao lado.
 *
 * `quarto` alinha a pilha ao mesmo eixo da tenda; nada gira fora de 90°,
 * porque a colisão só entende AABB.
 */
export function addPaiol(scene, colliders, {
  x, z, quarto = 0, terrain, settling = null
}) {
  const P = PAIOL;
  const impar = ((quarto % 2) + 2) % 2 === 1;
  const { base } = assentar(terrain, x, z, P.PALETE / 2);
  const y = base - 0.06;

  // Estrado: dá pra ficar em cima, e é o que faz a pilha ler como depósito e
  // não como caixote esquecido.
  addBox(scene, colliders, {
    settling, x, z, y, w: impar ? P.PALETE * 0.8 : P.PALETE,
    h: 0.18, d: impar ? P.PALETE : P.PALETE * 0.8, color: MADEIRA_ESCURA
  });

  // Duas fileiras de dois, e uma terceira caixa em cima: agachado, a pilha
  // esconde; de pé, ela cobre o tronco.
  const passo = P.CAIXA_L + 0.06;
  for (let fila = 0; fila < 2; fila++) {
    for (const lado of [-1, 1]) {
      const u = lado * passo / 2;
      const v = (fila - 0.5) * (P.CAIXA_P + 0.08);
      const [dx, dz] = impar ? [v, -u] : [u, v];
      addBox(scene, colliders, {
        settling, x: x + dx, z: z + dz, y: y + 0.18,
        w: impar ? P.CAIXA_P : P.CAIXA_L, h: P.CAIXA_A,
        d: impar ? P.CAIXA_L : P.CAIXA_P,
        color: fila ? MADEIRA : MADEIRA_ESCURA
      });
      // Estêncil na tampa: o que diz "munição" a três metros, sem placa.
      addBox(scene, colliders, {
        solid: false, x: x + dx, z: z + dz, y: y + 0.18 + P.CAIXA_A,
        w: impar ? 0.1 : P.CAIXA_L * 0.5, h: 0.02,
        d: impar ? P.CAIXA_L * 0.5 : 0.1, color: ESTENCIL
      });
    }
  }
  const [tx, tz] = impar ? [0.1, 0] : [0, 0.1];
  addBox(scene, colliders, {
    settling, x: x + tx, z: z + tz, y: y + 0.18 + P.CAIXA_A,
    w: impar ? P.CAIXA_P : P.CAIXA_L, h: P.CAIXA_A,
    d: impar ? P.CAIXA_L : P.CAIXA_P, color: MADEIRA
  });

  // Lona jogada por cima de mais duas caixas, um pouco afastadas: o depósito
  // não é uma pilha perfeita, e o vulto irregular é o que se enxerga de longe.
  const [ax, az] = impar ? [0, P.PALETE * 0.9] : [P.PALETE * 0.9, 0];
  addBox(scene, colliders, {
    settling, x: x + ax, z: z + az, y,
    w: impar ? 1.5 : 1.1, h: 0.72, d: impar ? 1.1 : 1.5, color: LONA
  });

  return { x, z, quarto };
}
