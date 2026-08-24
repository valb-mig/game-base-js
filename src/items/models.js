import { createKnife } from './knife.js';

/**
 * Item (dado) -> modelo 3D (malha).
 *
 * Uma fábrica só, usada tanto pela mão quanto pelo chão: soltar um item tem
 * que produzir exatamente o que estava sendo empunhado. Item sem modelo aqui
 * simplesmente não aparece — o jogo não inventa uma caixa genérica.
 */
const FACTORIES = {
  kabar: createKnife
};

export function hasModel(item) {
  return Boolean(item && FACTORIES[item.id]);
}

export function createItemModel(item) {
  const factory = item && FACTORIES[item.id];
  return factory ? factory() : null;
}

/**
 * Como o item repousa no chão: a faca deita sobre a face chata da lâmina.
 * O modelo nasce com a lâmina no +X e as faces largas no ±Z, então girar 90°
 * no X apoia a face no solo.
 */
export function restingRotation(item) {
  if (item?.id === 'kabar') return { x: Math.PI / 2, z: 0 };
  return { x: 0, z: 0 };
}
