import * as THREE from 'three';
import { createSparks, fagulhaDaRegiao } from '../../src/world/sparks.js';
import { GRUPOS } from '../../src/game/hitboxes.js';
import { suite, ok, eq, near, note } from '../assert.js';

const DT = 1 / 60;

/**
 * Quantas partículas estão vivas e por onde elas saíram.
 *
 * A velocidade não é exposta de propósito — o buffer é interno —, então ela
 * se mede como o jogador a vê: um quadro depois, pela distância que a
 * partícula andou. A gravidade come 0,18 m/s de y nesse quadro, que é ruído
 * perto dos 4 a 9 m/s das receitas.
 */
function amostrar(sparks, ponto) {
  const geo = sparks.points.geometry;
  const quantas = geo.drawRange.count;
  const p = geo.attributes.position.array;
  const c = geo.attributes.color.array;

  const antes = [];
  for (let i = 0; i < quantas; i++) {
    antes.push(new THREE.Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]));
  }
  const cor = new THREE.Vector3(c[0], c[1], c[2]);

  sparks.update(DT);
  const rumos = [];
  for (let i = 0; i < quantas; i++) {
    rumos.push(new THREE.Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2])
      .sub(antes[i] ?? ponto).normalize());
  }
  return { quantas, cor, rumos };
}

/** Abertura média do leque, em graus, contra o rumo em que ele devia sair. */
function abertura(rumos, contra) {
  let soma = 0;
  for (const r of rumos) soma += r.angleTo(contra);
  return (soma / rumos.length) * 180 / Math.PI;
}

export function run() {
  suite('a fagulha sai da REGIÃO, não do nome dela');

  eq('cabeça levanta jorro de cabeça', fagulhaDaRegiao(GRUPOS.cabeca), 'cabeca');
  eq('capacete levanta faísca de capacete', fagulhaDaRegiao(GRUPOS.capacete), 'capacete');
  eq('tronco cai no respingo comum', fagulhaDaRegiao(GRUPOS.tronco), 'corpo');
  eq('braço também', fagulhaDaRegiao(GRUPOS.braco), 'corpo');
  eq('perna também', fagulhaDaRegiao(GRUPOS.perna), 'corpo');
  // Faca e dano de área ainda chegam sem região, e a bala no veículo nunca
  // tem. Nenhum deles pode derrubar o impacto.
  eq('e acerto sem região não quebra', fagulhaDaRegiao(null), 'corpo');
  eq('nem região sem id', fagulhaDaRegiao({ nome: 'inventada' }), 'corpo');
  note('por que pelo id', 'nome é texto de tela; traduzir o HUD quebraria a fagulha');

  suite('headshot aparece no quadro do acerto, não só no hit feed');

  const ponto = new THREE.Vector3(0, 1.6, 0);
  const rumo = new THREE.Vector3(0, 0, 1);
  const contra = rumo.clone().negate();

  const noTronco = amostrar(seca(ponto, rumo, 'corpo'), ponto);
  const naCabeca = amostrar(seca(ponto, rumo, 'cabeca'), ponto);
  const noCapacete = amostrar(seca(ponto, rumo, 'capacete'), ponto);

  ok('a cabeça joga mais matéria que o tronco',
    naCabeca.quantas > noTronco.quantas * 1.8,
    `${naCabeca.quantas} contra ${noTronco.quantas}`);
  ok('e o capacete também', noCapacete.quantas > noTronco.quantas,
    `${noCapacete.quantas} contra ${noTronco.quantas}`);

  suite('cabeça e capacete não se parecem: um é carne, o outro é aço');

  // Vermelho escuro contra faísca quente. Sem isto os dois seriam o mesmo
  // respingo maior, e a diferença entre um tiro e dois some da tela.
  ok('a cabeça sai vermelha e escura',
    naCabeca.cor.x > naCabeca.cor.y * 3 && naCabeca.cor.x < 1.2,
    `rgb ${naCabeca.cor.toArray().map((v) => v.toFixed(2)).join(', ')}`);
  ok('o capacete sai claro e quente',
    noCapacete.cor.y > 0.5 && noCapacete.cor.x > noCapacete.cor.z,
    `rgb ${noCapacete.cor.toArray().map((v) => v.toFixed(2)).join(', ')}`);

  // O leque é a informação: jorro dirigido sai CONTRA a bala, ricochete
  // abre. Medir a cor sozinha deixaria passar duas nuvens de formato igual.
  const fecho = abertura(naCabeca.rumos, contra);
  const leque = abertura(noCapacete.rumos, contra);
  ok('o jorro da cabeça é dirigido', fecho < leque - 8,
    `${fecho.toFixed(1)}° contra ${leque.toFixed(1)}° do capacete`);
  note('por que o leque', 'ricochete se lê pela abertura, não pela cor');
}

/** Uma nuvem de fagulha sozinha, pra medir uma receita sem as outras junto. */
function seca(ponto, rumo, tipo) {
  const sparks = createSparks(new THREE.Scene());
  sparks.burst(ponto, rumo, tipo);
  return sparks;
}
