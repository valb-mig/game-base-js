import * as THREE from 'three';
import { WORLD } from '../config.js';
import { ListaDeColisores } from './colisores.js';
import { createTerrain } from './terrain.js';
import { createDeform } from './deform.js';
import { createSettling } from './settling.js';
import { createWater } from './water.js';
import { addTrainingCourse } from './course.js';
import { createDummy } from './dummy.js';
import { createSoldier } from '../bots/soldier.js';
import { enemyOf } from '../game/teams.js';
import { PLAYER_TEAM } from '../game/teams.js';
import { addBox, sorteioFixo } from './props.js';
import { addBushes } from './bushes.js';
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

// Segundos até um alvo derrubado levantar de novo. Alvo que fica caído
// obriga a sair do lugar pra treinar de novo.
const REVIVE = 4;

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

  const colliders = new ListaDeColisores();
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
  //
  // Os alvos são SOLDADOS parados, não bonecos de palha: o que se treina é
  // acertar gente, e a esfera de acerto e a silhueta de um soldado são o que
  // vale medir. O boneco de palha continua existindo pro corpo a corpo, no
  // curso de obstáculos.
  const inimigo = enemyOf(PLAYER_TEAM);
  const marcados = ALCANCES.map((metros, i) => {
    const x = LINHA_DE_TIRO.x + (i % 2 === 0 ? -2.5 : 2.5);
    const z = LINHA_DE_TIRO.z - metros;

    const alvo = createSoldier(scene, colliders, {
      id: metros, team: inimigo, x, z, terrain, weapons: []
    });
    alvo.yaw = Math.PI;          // virado pro atirador
    alvo.name = `alvo ${metros} m`;
    alvo.metros = metros;
    alvo.update(0);

    // Ele levanta sozinho depois de cair: alvo que some depois do primeiro
    // acerto obriga a sair do lugar pra treinar de novo.
    const derrubar = alvo.damage;
    alvo.damage = (quanto) => {
      const r = derrubar(quanto);
      if (r.killed) alvo.voltaEm = REVIVE;
      return r;
    };
    const passo = alvo.update;
    alvo.update = (delta) => {
      if (!alvo.alive) {
        alvo.voltaEm -= delta;
        if (alvo.voltaEm <= 0) alvo.respawn(x, z);
      }
      passo(delta);
    };

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
    bushes,
    outposts: [],
    spawnZones: [{
      id: 'treino', name: 'Campo de treinamento', team: null, base: true,
      x: ORIGEM.x, z: ORIGEM.z + 8, radius: 12
    }],
    bases: [],
    arsenal: ARSENAL,

    /**
     * Um jipe ao lado da linha de tiro.
     *
     * Ele fica FORA da raia (que é limpa até 8 m do eixo de tiro) e longe da
     * faixa do curso de obstáculos: veículo parado na frente dos alvos
     * transformaria a raia de 140 m numa raia de 12. E é aqui que ele tem que
     * estar — o campo é plano, medido e sem ninguém atirando de volta, que é
     * exatamente o que se quer pra aprender a dirigir. Sainte-Mère é o
     * contrário disso de propósito.
     */
    garagem: [{ x: LINHA_DE_TIRO.x + 14, z: LINHA_DE_TIRO.z + 5, yaw: Math.PI / 2 }],
    /** Onde o jogador nasce: atrás da linha de tiro, olhando pros alvos. */
    spawn: new THREE.Vector3(LINHA_DE_TIRO.x, 0, LINHA_DE_TIRO.z),
    stats: {
      alvos: targets.length, arbustos: bushes.count,
      colliders: colliders.length
    },

    reshape(x, z, amount, radius) {
      const tocados = deform.apply(x, z, amount, radius);
      if (tocados.length === 0) return false;
      chao.applyEdit(tocados);
      settling.disturb(x, z, radius ?? 3);
      bushes.disturb(x, z, radius ?? 3);
      return true;
    }
  };
}
