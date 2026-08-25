import { createKnife } from './knife.js';
import { createPistol } from './pistol.js';
import { createShovel } from './shovel.js';

/**
 * Item (dado) -> modelo 3D (malha).
 *
 * Uma fábrica só, usada tanto pela mão quanto pelo chão: soltar um item tem
 * que produzir exatamente o que estava sendo empunhado. Item sem modelo aqui
 * simplesmente não aparece — o jogo não inventa uma caixa genérica.
 */
export const FACTORIES = {
  kabar: createKnife,
  m1911: createPistol,
  m1943: createShovel
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
  if (item?.id === 'm1911') return { x: 0, z: Math.PI / 2 };   // deita de lado
  if (item?.id === 'm1943') return { x: 0, z: 0 };             // já deita reta
  return { x: 0, z: 0 };
}

/**
 * Devolve ao GPU o que o modelo alocou.
 *
 * Cada item construído cria geometrias e materiais próprios, então largar e
 * apanhar em sequência vazaria memória de vídeo sem isto. Só é seguro porque
 * nenhuma fábrica de item usa as geometrias compartilhadas de world/props.js.
 */
export function disposeModel(model) {
  if (!model) return;
  model.traverse((object) => {
    object.geometry?.dispose();
    const material = object.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
}
