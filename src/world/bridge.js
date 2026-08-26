import { WORLD } from '../config.js';
import { addBox } from './props.js';

/**
 * Ponte de concreto sobre o rio.
 *
 * Ela corre ao longo do Z, num X fixo, e isso NÃO é preguiça: a colisão só
 * entende AABB, e uma ponte girada pra ficar perpendicular ao leito viraria
 * uma caixa envolvente muito maior que o corpo dela — parede invisível a
 * metros da estrutura, o mesmo problema do prop tombado na diagonal. O leito
 * corre uns 15° fora do eixo, então a travessia reta cruza a uns 75°, e isso
 * não se percebe andando.
 *
 * O comprimento sai de SONDAR o terreno, não de uma conta: o tabuleiro para
 * onde a margem alcança a altura dele, e assim as duas pontas encostam no
 * chão sozinhas, sem achatar nada. Zona plana não cabe aqui — o mapa já está
 * cheio delas, e postos e bases têm prioridade.
 */

const ESPESSURA = 0.55;      // laje do tabuleiro
const VAO = 4.2;             // folga entre a água e a laje
const PARAPEITO_H = 0.95;
const PARAPEITO_W = 0.42;
const PILAR_W = 2.2;
const ENTRE_PILARES = 17;

const CONCRETO = 0x9a9791;
const CONCRETO_ESCURO = 0x7d7a74;

/**
 * Até onde a margem precisa ser vencida, deste lado do leito.
 *
 * Sonda de metro em metro a partir do leito até achar terreno na altura do
 * tabuleiro. `limite` existe pra que uma margem rasa demais não faça a ponte
 * crescer pelo mapa inteiro.
 */
function alcance(heightAt, x, leitoZ, lado, topo, limite) {
  for (let d = 4; d <= limite; d++) {
    if (heightAt(x, leitoZ + lado * d) >= topo) return d;
  }
  return limite;
}

/**
 * @param {number} x         onde a ponte cruza
 * @param {number} leitoZ    o z do leito nesse x
 * @returns {{x, z, topo, comprimento}} o que a estrada precisa saber pra chegar nela
 */
export function addBridge(scene, colliders, { x, leitoZ, terrain }) {
  const { heightAt } = terrain;
  const topo = WORLD.RIO_NIVEL + VAO;
  const limite = WORLD.RIO_MARGEM + 24;

  const norte = alcance(heightAt, x, leitoZ, -1, topo, limite);
  const sul = alcance(heightAt, x, leitoZ, 1, topo, limite);
  const comprimento = norte + sul;
  const centroZ = leitoZ + (sul - norte) / 2;

  // Tabuleiro. Fica de fora do `settling` de propósito: ele é uma laje de
  // cem metros, e o desabamento trabalha com prop de raio pequeno que tomba
  // pro lado. Uma ponte que "tomba" seria pior que uma ponte que não cai.
  addBox(scene, colliders, {
    x, z: centroZ, y: topo - ESPESSURA,
    w: WORLD.PONTE_LARGURA, h: ESPESSURA, d: comprimento,
    color: WORLD.ASFALTO
  });

  // Guarda-corpo dos dois lados. É ele que faz a ponte ser gargalo de
  // verdade: sem parapeito o jogador sai por qualquer ponto e cai na água,
  // e a ponte deixa de canalizar ninguém.
  const borda = WORLD.PONTE_LARGURA / 2 - PARAPEITO_W / 2;
  for (const lado of [-1, 1]) {
    addBox(scene, colliders, {
      x: x + lado * borda, z: centroZ, y: topo,
      w: PARAPEITO_W, h: PARAPEITO_H, d: comprimento,
      color: CONCRETO
    });
  }

  // Pilares do leito até a laje. Só os que caem na água ou perto dela: na
  // margem alta o pilar sairia do chão já colado no tabuleiro.
  const pilares = [];
  for (let d = -norte + ENTRE_PILARES; d < sul; d += ENTRE_PILARES) {
    const pz = leitoZ + d;
    const chao = heightAt(x, pz);
    const altura = topo - ESPESSURA - chao;
    if (altura < 1.6) continue;

    addBox(scene, colliders, {
      x, z: pz, y: chao, w: PILAR_W, h: altura, d: PILAR_W,
      color: CONCRETO_ESCURO
    });
    pilares.push(pz);
  }

  // Encontro nas duas cabeceiras: um bloco baixo que esconde a junta entre a
  // laje e o barranco. Sem ele aparece o vão por onde se vê o céu por baixo
  // da ponta da ponte, e a ponte parece pousada em cima do morro.
  for (const [lado, alcanceLado] of [[-1, norte], [1, sul]]) {
    const pz = leitoZ + lado * (alcanceLado - 1.5);
    const chao = heightAt(x, pz);
    const altura = Math.max(0.4, topo - ESPESSURA - chao);
    addBox(scene, colliders, {
      x, z: pz, y: chao, w: WORLD.PONTE_LARGURA + 1.2, h: altura, d: 3,
      color: CONCRETO_ESCURO
    });
  }

  return { x, z: centroZ, topo, comprimento, norte, sul, pilares };
}

/** Todas as pontes do mapa, uma por X da tabela. O Z sai do leito. */
export function addBridges(scene, colliders, { terrain }) {
  return WORLD.PONTES.map((x) => addBridge(scene, colliders, {
    x, leitoZ: terrain.riverBedAt(x), terrain
  }));
}
