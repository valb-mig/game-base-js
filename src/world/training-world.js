import * as THREE from 'three';
import { WORLD } from '../config.js';
import { createTerrain } from './terrain.js';
import { createDeform } from './deform.js';
import { createSettling } from './settling.js';
import { createWater } from './water.js';
import { addTrainingCourse } from './course.js';
import { createDummy } from './dummy.js';
import { addBox } from './props.js';
import { MP40, PISTOL, KNIFE, SHOVEL } from '../items/classes.js';

/**
 * Campo de treinamento: um mapa à parte.
 *
 * Não é um canto do mapa de combate. Treinar mira tem que ser plano, medido e
 * sem nada acontecendo em volta — e Sainte-Mère é o contrário disso de
 * propósito. Misturar os dois tirava o que cada um tem de bom.
 *
 * Aqui não há times, nem pontos de captura, nem bots. Há alvos parados a
 * distâncias exatas, os obstáculos pra medir movimento, o arsenal inteiro no
 * chão, e munição que não acaba — mas que ainda precisa ser carregada.
 */

/** Distâncias em que a mira muda de comportamento, e por isso valem um alvo. */
export const ALCANCES = [10, 25, 50, 90, 140];

/** Tudo que existe no jogo com modelo. */
export const ARSENAL = [MP40, PISTOL, KNIFE, SHOVEL];

const ORIGEM = { x: 0, z: 60 };
const PLATAFORMA = 34;

// Onde o atirador fica. As distâncias dos alvos são medidas DAQUI, e não da
// origem do campo: a placa diz 90 m e tem que ser 90 m de onde se atira,
// senão ela não é medida, é enfeite.
const LINHA_DE_TIRO = { x: ORIGEM.x - 26, z: ORIGEM.z + 6 };

export function buildTrainingWorld(scene) {
  const sonda = createTerrain([], null, 'treino');

  const flatZones = [{
    x: ORIGEM.x, z: ORIGEM.z, radius: PLATAFORMA, blend: 18,
    height: sonda.naturalHeight(ORIGEM.x, ORIGEM.z)
  }];

  const deform = createDeform();
  const terrain = createTerrain(flatZones, deform, 'treino');
  const chao = terrain.buildMesh();
  scene.add(chao.mesh);

  // O mar fica bem abaixo do chão: existe pro caso de alguém cavar até ele, e
  // pra que a água não seja um caso especial que só o outro mapa tem.
  const water = createWater();
  scene.add(water.mesh);

  const colliders = [];
  const settling = createSettling(terrain, colliders);
  const targets = [];

  // Obstáculos: os mesmos do mapa antigo, que é pra que medir salto e degrau
  // aqui valha lá.
  const doCurso = addTrainingCourse(scene, colliders, {
    origin: ORIGEM, ground: terrain.heightAt(ORIGEM.x, ORIGEM.z), settling
  });
  targets.push(...doCurso);

  // Linha de tiro ao norte, com as distâncias exatas: é o que faz "errei a
  // 90 m" ser um dado em vez de uma impressão.
  const marcados = ALCANCES.map((metros, i) => {
    const x = LINHA_DE_TIRO.x + (i % 2 === 0 ? -2.5 : 2.5);
    const z = LINHA_DE_TIRO.z - metros;
    const alvo = createDummy(scene, colliders, {
      x, z, ground: terrain.heightAt(x, z), facing: 0,
      name: `alvo ${metros} m`, settling
    });
    alvo.metros = metros;

    // Marco no chão a cada alvo, pra a distância se ler de longe.
    addBox(scene, colliders, {
      x, z: z + 1.6, y: terrain.heightAt(x, z + 1.6), w: 1.6, h: 0.12, d: 0.5,
      color: 0xd8c89a, standable: true
    });
    return alvo;
  });
  targets.push(...marcados);

  return {
    modo: 'treino',
    terrain,
    colliders,
    targets,
    settling,
    water,
    deform,
    outposts: [],
    spawnZones: [{
      id: 'treino', name: 'Campo de treinamento', team: null, base: true,
      x: ORIGEM.x, z: ORIGEM.z + 8, radius: 12
    }],
    bases: [],
    arsenal: ARSENAL,
    /** Onde o jogador nasce: atrás da linha de tiro, olhando pros alvos. */
    spawn: new THREE.Vector3(LINHA_DE_TIRO.x, 0, LINHA_DE_TIRO.z),
    stats: { alvos: targets.length, colliders: colliders.length },

    reshape(x, z, amount, radius) {
      const tocados = deform.apply(x, z, amount, radius);
      if (tocados.length === 0) return false;
      chao.applyEdit(tocados);
      settling.disturb(x, z, radius ?? 3);
      return true;
    }
  };
}
