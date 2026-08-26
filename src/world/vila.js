import { addBox, sorteioFixo } from './props.js';
import { addCasa, TIPOS } from './casas.js';
import {
  assentar, duasAguas, paredeComVao,
  PEDRA, PEDRA_ESCURA, TELHA, MADEIRA_ESCURA
} from './construcao.js';

/**
 * A Vila Central.
 *
 * Um adro com a igreja e um punhado de casas em volta, e a rua passando no
 * meio. É o único ponto do mapa em que a briga é dentro de construção — cada
 * casa é oca, com porta nos dois lados e janela nas laterais, então quem se
 * tranca numa está com duas saídas e quatro linhas de tiro contra si.
 *
 * As casas NÃO caem em cima da estrada: `estradaAt` já sabe onde ela passa, e
 * ela é a mesma fonte que pinta o chão. Casa no meio da pista seria a rua
 * prometendo um caminho que não existe.
 */

const RAIO = 52;          // até onde a vila se espalha
const ADRO = 15;          // praça central, livre: é onde ficam os mastros
const ENTRE_CASAS = 4.2;  // folga mínima entre pegadas

/** Um por vez, do maior pro menor: a mansão escolhe lugar antes da choupana. */
const RECEITA = [
  'mansao', 'grande', 'grande', 'media', 'media', 'media', 'media',
  'pequena', 'pequena', 'pequena', 'pequena', 'pequena', 'pequena'
];

/**
 * Igreja de vila normanda: nave comprida e torre quadrada.
 *
 * Sainte-Mère-Église é conhecida no mundo inteiro por causa da torre da
 * igreja dela, e num mapa de dois quilômetros essa é a única silhueta que se
 * enxerga de qualquer ponto do planalto. Ela é a referência de navegação da
 * vila — quem vê a torre sabe onde está sem abrir o mapa.
 */
function igreja(scene, colliders, { x, z, terrain, settling }) {
  const W = 9;
  const D = 17;
  const H = 6.4;
  const { base } = assentar(terrain, x, z, 10);
  const y = base - 0.4;

  // nave: fundo fechado, frente com portal
  paredeComVao(scene, colliders, {
    settling, x, z: z + D / 2, y, largura: W, altura: H + 0.4,
    espessura: 0.42, soleira: 0.4, cor: PEDRA, aoLongoDeX: true,
    vaoLargura: 1.9, vaoAltura: 3.2
  });
  addBox(scene, colliders, {
    settling, x, z: z - D / 2, y, w: W, h: H + 0.4, d: 0.42, color: PEDRA
  });
  for (const lado of [-1, 1]) {
    for (const meio of [-1, 1]) {
      paredeComVao(scene, colliders, {
        settling, x: x + lado * W / 2, z: z + meio * D / 4, y,
        largura: D / 2, altura: H + 0.4, espessura: 0.42, soleira: 0.4, cor: PEDRA,
        aoLongoDeX: false, vaoLargura: 1.2, vaoAltura: 2.6, peitoril: 1.4
      });
    }
  }
  duasAguas(scene, colliders, {
    x, y: y + H + 0.4, z, w: W, d: D, altura: 3.2, cor: TELHA, aoLongoDeX: false
  });

  // Torre no fundo da nave, e ela é ALTA de propósito: 17 m põem o campanário
  // acima da copa das árvores adultas, que é o que faz dela referência.
  const tx = x;
  const tz = z - D / 2 - 3.4;
  const TORRE = 5.6;
  const ALTURA = 17;
  for (const lado of [-1, 1]) {
    addBox(scene, colliders, {
      settling, x: tx + lado * TORRE / 2, z: tz, y,
      w: 0.45, h: ALTURA, d: TORRE, color: PEDRA
    });
    addBox(scene, colliders, {
      settling, x: tx, z: tz + lado * TORRE / 2, y,
      w: TORRE, h: ALTURA, d: 0.45, color: PEDRA
    });
  }
  addBox(scene, colliders, {
    settling, x: tx, z: tz, y: y + ALTURA, w: TORRE + 0.7, h: 0.5, d: TORRE + 0.7,
    color: PEDRA_ESCURA
  });
  duasAguas(scene, colliders, {
    x: tx, y: y + ALTURA + 0.5, z: tz, w: TORRE + 0.7, d: TORRE + 0.7,
    altura: 4.6, cor: TELHA, beiral: 0.1, aoLongoDeX: true
  });
}

export function addVila(scene, colliders, { x, z, terrain, settling = null }) {
  const rng = sorteioFixo(20250903);
  const postas = [];

  igreja(scene, colliders, { x: x - 26, z: z + 12, terrain, settling });
  postas.push({ x: x - 26, z: z + 12, raio: 15 });

  for (const tipo of RECEITA) {
    const t = TIPOS[tipo];
    const raio = Math.max(t.largura, t.fundo) * 0.5 + ENTRE_CASAS;

    for (let tentativa = 0; tentativa < 90; tentativa++) {
      const angulo = rng() * Math.PI * 2;
      // raiz da uniforme espalha por área; o adro fica livre pros mastros
      const dist = ADRO + Math.sqrt(rng()) * (RAIO - ADRO);
      const cx = x + Math.cos(angulo) * dist;
      const cz = z + Math.sin(angulo) * dist;

      // Nem em cima da pista, nem encostando na anterior. A estrada sai da
      // mesma função que pinta o chão: casa no meio dela seria a rua
      // prometendo um caminho que não existe.
      if (terrain.estradaAt(cx, cz) > 0.12) continue;
      if (postas.some((p) => Math.hypot(p.x - cx, p.z - cz) < p.raio + raio)) continue;
      // Terreno muito torto rasga a casa: a soleira enterra de um lado e o
      // outro fica no ar. Melhor recusar o lugar do que fazer isso.
      if (assentar(terrain, cx, cz, raio).desnivel > 2.2) continue;

      addCasa(scene, colliders, {
        tipo, x: cx, z: cz, giro: rng() < 0.5 ? 0 : 1, terrain, settling
      });
      postas.push({ x: cx, z: cz, raio });
      break;
    }
  }

  // Muretas de pedra soltas no adro: cobertura baixa na única parte aberta da
  // vila, que é justamente onde ficam as bandeiras.
  for (let i = 0; i < 7; i++) {
    const angulo = rng() * Math.PI * 2;
    const dist = 9 + rng() * 5;
    const mx = x + Math.cos(angulo) * dist;
    const mz = z + Math.sin(angulo) * dist;
    if (terrain.estradaAt(mx, mz) > 0.12) continue;
    // A zona de nascimento fica em (x, z+7): mureta em cima dela faria o
    // jogador nascer preso dentro de pedra.
    if (Math.hypot(mx - x, mz - (z + 7)) < 6) continue;
    const deitada = rng() < 0.5;
    addBox(scene, colliders, {
      settling, x: mx, z: mz, y: terrain.heightAt(mx, mz) - 0.2,
      w: deitada ? 3.4 : 0.5, h: 1.05, d: deitada ? 0.5 : 3.4,
      color: rng() < 0.5 ? PEDRA : PEDRA_ESCURA
    });
  }

  return { casas: postas.length };
}
