import { addVila } from './vila.js';
import { addFazenda } from './fazenda.js';
import { addMoinho } from './moinho.js';
import { addBunker } from './bunker.js';
import { addPostoDoRio } from './militar.js';
import { addPraia } from './praia.js';

/**
 * O que existe EM cada ponto de captura.
 *
 * Ponto de captura não é posto militar. São seis lugares de um mapa da
 * Normandia — uma praia invadida, um bunker de encosta, uma vila, uma
 * fazenda, uma guarnição de ponte e um moinho — e o que cada um tem é o que
 * decide como se briga ali. Antes eram seis quadrados de sacos de areia
 * idênticos, e a única diferença entre os pontos era o terreno em volta.
 *
 * Os quatro mastros continuam no miolo de todos, porque a captura é a mesma
 * regra em todo lugar. Quem constrói tem que deixar o quadrado de 9 m no
 * centro e a zona de nascimento em (x, z+7) livres — `assertSpawnZones`
 * estoura na montagem se alguém esquecer.
 */

const CONSTRUTORES = {
  praia: addPraia,
  colina: addBunker,
  vila: addVila,
  fazenda: addFazenda,
  ponte: addPostoDoRio,
  moinho: addMoinho
};

/**
 * Ergue o cenário do ponto. Devolve o que o construtor devolver — o moinho
 * devolve um `update`, porque as pás dele giram.
 */
export function construirLocal(scene, colliders, { id, x, z, terrain, settling }) {
  const construir = CONSTRUTORES[id];
  return construir ? construir(scene, colliders, { x, z, terrain, settling }) : null;
}
