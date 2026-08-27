import { SUPRIMENTO } from '../game/suprimento.js';
import { addEnfermaria, ENFERMARIA } from './enfermaria.js';
import { addPaiol } from './paiol.js';

/**
 * Onde ficam a tenda e o paiol de cada lugar do mapa.
 *
 * Uma tabela e não uma busca automática: quem conhece o terreno é quem
 * escolheu onde a casamata, o celeiro e a igreja ficam, e achar "um canto
 * livre" por sondagem esconderia do autor do mapa onde a enfermaria acabou.
 * É a mesma decisão de `world.garagem` — o MAPA diz onde há veículo.
 *
 * As duas coordenadas saem de UMA: o paiol fica entre a tenda e o miolo do
 * lugar, 4,6 m adiante dela. Isso garante de graça o que o teste cobra — o
 * engradado dentro do raio de suprimento que ele anuncia — e deixa a
 * logística toda num canto só do ponto: quem sabe onde se cura sabe onde se
 * reabastece.
 */

/** Deslocamento da TENDA em relação ao miolo do lugar, em metros. */
const LOGISTICA = {
  praia: { dx: -17, dz: 5 },       // atrás das cabanas, longe do arame
  colina: { dx: 16, dz: -5 },      // no flanco leste da casamata
  vila: { dx: -12, dz: -9 },       // no adro, que é a parte livre da vila
  fazenda: { dx: 13, dz: -7 },     // entre o celeiro e a casa grande
  ponte: { dx: 15, dz: -5 },       // atrás da casa de observação
  moinho: { dx: -15, dz: -5 },     // oposto à torre, fora do cercado
  base: { dx: -15, dz: -3 }        // dentro do perímetro, a oeste da torre
};

/** Distância da tenda ao paiol. Cabem os dois lado a lado sem se encostar. */
const PASSO = 4.6;

/**
 * Meia-diagonal do quadrado que todo construtor deixa livre no miolo — o
 * mesmo `LADO` de `outpost.js`. Tenda ou engradado dentro dele deixaria a
 * bandeira inalcançável, e o sintoma é um ponto que não pode ser tomado.
 */
const LIVRE = 9;

/** A que a distância a zona de nascimento do posto fica: (x, z + 7). */
const NASCE = 7;

function longeDe(px, pz, x, z, minimo, o_que, onde) {
  const distancia = Math.hypot(px - x, pz - z);
  if (distancia >= minimo) return;
  throw new Error(
    `${o_que} de "${onde}" em (${px.toFixed(0)}, ${pz.toFixed(0)}) está a ` +
    `${distancia.toFixed(1)} m de ${x.toFixed(0)}, ${z.toFixed(0)} — ` +
    `precisa de ${minimo} m`
  );
}

/**
 * Ergue a tenda de tratamento e o paiol de um lugar. Devolve as duas posições:
 * `enfermaria` é o centro da zona de cura, e é ele que a regra lê.
 */
export function addLogistica(scene, colliders, {
  id, x, z, terrain, settling = null, onde = id
}) {
  const alvo = LOGISTICA[id];
  if (!alvo) return null;

  const tx = x + alvo.dx;
  const tz = z + alvo.dz;

  // A porta olha pro miolo do lugar: é de lá que vem quem está ferido, e
  // entrada virada pro mato faria dar a volta na tenda sob fogo. Um quarto de
  // volta por vez, porque a colisão só entende AABB.
  const quarto = Math.abs(alvo.dx) > Math.abs(alvo.dz)
    ? (alvo.dx > 0 ? 3 : 1)
    : (alvo.dz > 0 ? 2 : 0);

  // O paiol adiante da tenda, na direção do miolo. Uma fonte de verdade só.
  const passo = Math.hypot(alvo.dx, alvo.dz) || 1;
  const px = tx - (alvo.dx / passo) * PASSO;
  const pz = tz - (alvo.dz / passo) * PASSO;

  /**
   * Estoura na MONTAGEM, como a vaga do jipe, e a mensagem diz a coordenada:
   * o conserto é no mapa e não no código. Três coisas não podem acontecer —
   * comer o quadrado das bandeiras, comer a zona de nascimento, e o engradado
   * cair fora do raio de suprimento que ele existe pra anunciar.
   */
  longeDe(tx, tz, x, z, LIVRE, 'a tenda', onde);
  longeDe(px, pz, x, z, LIVRE, 'o paiol', onde);
  longeDe(tx, tz, x, z + NASCE, ENFERMARIA.FUNDO, 'a tenda', onde);
  longeDe(px, pz, x, z + NASCE, 4, 'o paiol', onde);

  const fora = Math.hypot(px - x, pz - z);
  if (fora > SUPRIMENTO.RAIO - 3) {
    throw new Error(
      `o paiol de "${onde}" está a ${fora.toFixed(1)} m do miolo, fora dos ` +
      `${SUPRIMENTO.RAIO} m em que se reabastece: o engradado mentiria`
    );
  }

  addPaiol(scene, colliders, { x: px, z: pz, quarto, terrain, settling });
  const enfermaria = addEnfermaria(scene, colliders, {
    x: tx, z: tz, quarto, terrain, settling, nome: `enfermaria de ${onde}`
  });

  return { enfermaria, paiol: { x: px, z: pz } };
}
