import * as THREE from 'three';
import { consumeClick, MOUSE_LEFT, MOUSE_RIGHT } from '../core/input.js';
import { DEFORM } from '../world/deform.js';

/**
 * Cavar e aterrar com a pá.
 *
 * A ação tem duração: o clique começa a pazada e o terreno só muda no quadro
 * em que ela cruza `digAt`. É o que impede o cavar de virar clique repetido,
 * e o que faz o buraco aparecer junto com a lâmina entrando na terra.
 *
 * A pá carrega uma pazada de cada vez. Botão esquerdo tira terra do chão e
 * enche a pá; botão direito despeja a terra que está nela. Sem terra não se
 * aterra, e com a pá cheia não se cava — é esse par que transforma escavar
 * numa sequência em vez de um botão de esculpir.
 */

const NADA = null;
const CAVAR = 'cavar';
const ATERRAR = 'aterrar';

export function initDigging(player, world) {
  const origem = new THREE.Vector3();
  const direcao = new THREE.Vector3();
  const ponto = new THREE.Vector3();

  const ouvintes = [];
  const estado = player.dig;

  /**
   * Onde a pazada encosta no chão, ou null se o jogador olha pro céu ou
   * pra longe demais. Marcha pelo raio amostrando o terreno: é curto o
   * bastante pra não custar nada e não precisa da malha.
   */
  function alvo(tool) {
    origem.copy(player.object.position);
    direcao.set(0, 0, -1).applyQuaternion(player.object.quaternion);

    const passos = 18;
    let anterior = origem.y - world.terrain.heightAt(origem.x, origem.z);

    for (let i = 1; i <= passos; i++) {
      const t = (i / passos) * tool.reach;
      ponto.copy(origem).addScaledVector(direcao, t);

      const acima = ponto.y - world.terrain.heightAt(ponto.x, ponto.z);
      if (acima <= 0) {
        // interpola entre os dois passos pra não cavar num degrau da amostra
        const fracao = anterior / (anterior - acima);
        const distancia = ((i - 1) + fracao) / passos * tool.reach;
        ponto.copy(origem).addScaledVector(direcao, distancia);
        return ponto;
      }
      anterior = acima;
    }
    return null;
  }

  function resolver(tool) {
    const onde = alvo(tool);
    if (!onde) {
      estado.falhou = 'sem alcance';
      return;
    }

    if (estado.modo === CAVAR) {
      const mudou = world.reshape(onde.x, onde.z, -DEFORM.FUNDO);
      if (!mudou) {
        estado.falhou = 'não dá pra cavar mais fundo aqui';
        return;
      }
      estado.carga = 1;
    } else {
      const mudou = world.reshape(onde.x, onde.z, DEFORM.MONTE);
      if (!mudou) {
        estado.falhou = 'não dá pra empilhar mais aqui';
        return;
      }
      estado.carga = 0;
    }

    estado.falhou = null;
    for (const ouvinte of ouvintes) ouvinte({ modo: estado.modo, ponto: onde.clone() });
  }

  return {
    /** Avisado a cada pazada concluída. */
    onDig(ouvinte) {
      ouvintes.push(ouvinte);
    },

    update(delta) {
      const tool = player.equipped?.tool;

      estado.cooldown = Math.max(0, estado.cooldown - delta);

      if (!tool) {
        // guardar a pá no meio de uma pazada cancela a pazada, não a conclui
        estado.modo = NADA;
        estado.progresso = 0;
        return;
      }

      if (estado.modo) {
        const antes = estado.progresso;
        const duracao = estado.modo === CAVAR ? tool.digTime : tool.placeTime;
        const marca = estado.modo === CAVAR ? tool.digAt : tool.placeAt;

        estado.progresso += delta / duracao;

        // o terreno muda uma vez só, no quadro que cruza a marca
        if (antes < marca && estado.progresso >= marca) resolver(tool);

        if (estado.progresso >= 1) {
          estado.modo = NADA;
          estado.progresso = 0;
          estado.cooldown = tool.cooldown;
        }
        return;
      }

      if (!player.isLocked) return;

      if (player.swapping) return;

      // Só quem tem a pá na mão pode consumir o clique. É a mesma regra do
      // golpe e do tiro: dois sistemas lendo o mesmo botão fizeram o tiro
      // sumir uma vez, e não pode acontecer de novo.
      const cavou = consumeClick(MOUSE_LEFT);
      const aterrou = consumeClick(MOUSE_RIGHT);
      if (!cavou && !aterrou) return;
      if (estado.cooldown > 0) return;

      if (cavou) {
        if (estado.carga > 0) {
          estado.falhou = 'a pá já está cheia';
          return;
        }
        estado.modo = CAVAR;
      } else {
        if (estado.carga <= 0) {
          estado.falhou = 'a pá está vazia';
          return;
        }
        estado.modo = ATERRAR;
      }

      estado.progresso = 0;
      estado.falhou = null;
    }
  };
}
