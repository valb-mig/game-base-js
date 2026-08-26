import * as THREE from 'three';
import { collides, groundHeightAt, ceilingAbove } from '../../src/player/collision.js';
import { ListaDeColisores } from '../../src/world/colisores.js';
import { suite, ok, eq, note } from '../assert.js';

/**
 * O índice espacial dos colisores.
 *
 * As contagens de pontos são modestas de propósito: cada ponto conferido
 * custa uma varredura LINEAR das 900 caixas, vezes três funções. A suíte
 * inteira roda sob um orçamento de tempo virtual de 15 s, e estourá-lo não dá
 * erro nenhum — faz as suítes SEGUINTES falharem ao carregar, com um nome que
 * não tem nada a ver com a causa. Milhares de pontos já cobrem o mapa.
 *
 * O que se testa aqui não é velocidade — sob `--virtual-time-budget` o
 * relógio não anda e uma asserção de milissegundo passa verde com 0,000 ms.
 * O número está em `tools/bancada-colisao.html`, que roda em tempo real.
 *
 * O que se testa é que ele dá A MESMA RESPOSTA que a varredura linear. Um
 * índice que erra em 1% dos pontos é pior que índice nenhum: o jogador
 * atravessa parede em faixas de meio metro espalhadas pelo mapa e ninguém
 * consegue reproduzir.
 */

/** Sorteio determinístico: a bancada tem que ser a mesma toda vez. */
function dado(semente) {
  let e = semente >>> 0;
  return () => {
    e = (Math.imul(e, 1664525) + 1013904223) >>> 0;
    return e / 4294967296;
  };
}

function caixas(quantas, rng) {
  const saida = [];
  for (let i = 0; i < quantas; i++) {
    const x = rng() * 1800 - 900;
    const z = rng() * 1800 - 900;
    const y = rng() * 6;
    const w = 0.3 + rng() * 4;
    const d = 0.3 + rng() * 4;
    const h = 0.4 + rng() * 5;
    saida.push({
      box: new THREE.Box3(
        new THREE.Vector3(x - w, y, z - d),
        new THREE.Vector3(x + w, y + h, z + d)),
      standable: rng() < 0.5
    });
  }
  return saida;
}

/** Compara as três consultas nos mesmos pontos, linear contra índice. */
function conferir(cru, indexada, rng, pontos) {
  let divergencias = 0;
  for (let i = 0; i < pontos; i++) {
    const x = rng() * 1800 - 900;
    const z = rng() * 1800 - 900;
    const pes = rng() * 6;

    if (collides(cru, x, z, pes, 1.7) !== collides(indexada, x, z, pes, 1.7)) divergencias++;
    if (groundHeightAt(cru, x, z, pes, 0) !== groundHeightAt(indexada, x, z, pes, 0)) divergencias++;
    if (ceilingAbove(cru, x, z, pes, pes + 1.7, pes + 2.4)
      !== ceilingAbove(indexada, x, z, pes, pes + 1.7, pes + 2.4)) divergencias++;
  }
  return divergencias;
}

export function run() {
  suite('índice espacial de colisores');

  const rng = dado(20250902);
  const cru = caixas(900, rng);
  const indexada = new ListaDeColisores();
  indexada.push(...cru);

  eq('a lista indexada tem os mesmos colisores', indexada.length, cru.length);
  eq('e itera todos', [...indexada].length, cru.length);

  // A consulta é um PONTO, mas `overlapsXZ` infla a caixa em PLAYER.RADIUS:
  // sem a mesma folga na inserção, um colisor encostado na divisa da célula
  // seria achado pelo laço linear e perdido pelo índice.
  eq('nenhuma divergência em 1200 pontos', conferir(cru, indexada, dado(7), 1200), 0);

  // Uma caixa que envolve o mapa não cabe na grade e vai pra lista dos
  // grandes, que é varrida sempre. Se ela fosse indexada como as outras,
  // entraria em milhares de células.
  const enorme = {
    box: new THREE.Box3(new THREE.Vector3(-950, 0, -950), new THREE.Vector3(950, 3, 950)),
    standable: true
  };
  cru.push(enorme);
  indexada.push(enorme);
  eq('colisor grande demais pra grade continua sendo achado',
    conferir(cru, indexada, dado(11), 400), 0);
  ok('e ele foi pra lista dos grandes, não pra milhares de células',
    indexada.grandes.length === 1, `${indexada.grandes.length} grande(s)`);

  suite('colisor que se move avisa o índice');

  // Prop que perde o chão desaba e TOMBA, e a caixa anda dezenas de metros.
  // Sem o aviso, o índice continua apontando pro lugar onde a árvore estava
  // de pé: ela barra o jogador no ar e ele atravessa o tronco caído.
  const tombado = cru[3];
  tombado.box.min.set(300, 0, -420);
  tombado.box.max.set(312, 1.4, -417);
  indexada.moveu(tombado);
  eq('depois de `moveu`, nenhuma divergência',
    conferir(cru, indexada, dado(13), 600), 0);

  // E move de novo, pro mesmo colisor: sem tirar das células velhas, ele
  // ficaria em duas.
  tombado.box.min.set(-700, 0, 500);
  tombado.box.max.set(-688, 1.4, 503);
  indexada.moveu(tombado);
  eq('e movendo outra vez também', conferir(cru, indexada, dado(17), 600), 0);

  let vezes = 0;
  for (const celula of indexada.grade.values()) {
    vezes += celula.filter((c) => c === tombado).length;
  }
  eq('o colisor movido não ficou duplicado em célula velha', vezes > 0 && vezes, vezes);
  ok('e só nas células que ele ocupa agora', vezes <= 6, `${vezes} células`);

  note('células ocupadas', indexada.grade.size);
}
