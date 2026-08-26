import * as THREE from 'three';
import { teamOf } from '../game/teams.js';
import { CAIXA_MUNICAO } from '../items/caixa.js';

/**
 * Espólio: a mochila do morto no chão, com o que ele carregava.
 *
 * Matar alguém tem que deixar alguma coisa no mundo além de uma linha no kill
 * feed. A mochila é o marcador — ela diz de longe que houve briga ali e onde
 * o corpo caiu — e as armas dele são o que se pode apanhar, com a munição que
 * sobrou no carregador: quem gastou o dele numa rajada tem motivo pra correr
 * até o corpo.
 *
 * A janela é curta de propósito. Espólio que fica pra sempre vira o chão da
 * ilha coberto de arma depois de dez minutos de partida, e apanhar deixa de
 * ser decisão sob risco pra virar catação.
 *
 * Os itens passam pelo MESMO caminho de largar (`drops.place`), então apanhar
 * segue a regra de sempre: quem decide é o slot estar livre.
 */

const DURACAO = 5;        // segundos até corpo e espólio sumirem
const RAIO = 0.55;        // quanto as armas se espalham em volta da mochila

const LONA = 0x4a4636;
const COURO = 0x2e2a20;

function fosco(color) {
  return new THREE.MeshLambertMaterial({ color, emissive: 0x080808, flatShading: true });
}

/** Mochila de campanha: três caixas. Ela é marcador, não modelo de vitrine. */
function criarMochila(time) {
  const grupo = new THREE.Group();
  const lona = fosco(time?.equipamento ?? LONA);
  const couro = fosco(COURO);

  const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.26), lona);
  corpo.position.y = 0.1;
  grupo.add(corpo);

  const bolso = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.08), lona);
  bolso.position.set(0, 0.09, 0.16);
  grupo.add(bolso);

  const alca = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.05), couro);
  alca.position.set(0, 0.21, -0.04);
  grupo.add(alca);

  return grupo;
}

export function createSpoils(scene, drops, world) {
  const pilhas = [];

  function alturaEm(x, z) {
    return world.terrain ? world.terrain.heightAt(x, z) : 0;
  }

  return {
    pilhas,

    /**
     * Larga o que o morto carregava, onde ele caiu.
     *
     * As armas do bot são cópias próprias dele (ver `arsenal` em bots.js),
     * então elas viram itens de mundo sem que dois bots passem a dividir o
     * mesmo carregador. Quem renasce recebe arsenal novo.
     */
    soltar(morto) {
      if (!morto?.weapons?.length) return null;

      const x = morto.x;
      const z = morto.z;

      const mochila = criarMochila(morto.team ? teamOf(morto.team) : null);
      mochila.position.set(x, alturaEm(x, z), z);
      mochila.rotation.y = morto.yaw ?? 0;
      scene.add(mochila);

      // Espalhadas em volta: empilhadas na mesma coordenada, três armas
      // viram uma só na tela e o jogador só apanha a que o alcance sortear.
      const entidades = [];
      const passo = (Math.PI * 2) / morto.weapons.length;
      morto.weapons.forEach((arma, i) => {
        const angulo = (morto.yaw ?? 0) + passo * i;
        const entidade = drops.place(
          arma, x + Math.sin(angulo) * RAIO, z + Math.cos(angulo) * RAIO, angulo
        );
        if (entidade) entidades.push(entidade);
      });

      /**
       * A caixa de munição, ao lado da mochila.
       *
       * As armas do morto já caem com o que sobrou no carregador delas, mas
       * isso é pouco e é do calibre errado se o jogador carrega outra coisa.
       * A caixa é o que faz matar valer munição de verdade — e é o motivo pra
       * avançar até o corpo em vez de recuar, que é justamente onde o próximo
       * tiro costuma estar.
       *
       * Ela entra na mesma pilha das armas, então some junto: espólio que
       * fica pra sempre vira o chão da ilha coberto de caixa.
       */
      const caixa = drops.place(
        CAIXA_MUNICAO, x + RAIO * 0.9, z - RAIO * 0.9, Math.PI * 0.15);
      if (caixa) entidades.push(caixa);

      const pilha = { mochila, entidades, restante: DURACAO };
      pilhas.push(pilha);
      return pilha;
    },

    update(delta) {
      for (let i = pilhas.length - 1; i >= 0; i--) {
        const pilha = pilhas[i];
        pilha.restante -= delta;
        if (pilha.restante > 0) continue;

        scene.remove(pilha.mochila);
        for (const malha of pilha.mochila.children) {
          malha.geometry.dispose();
          malha.material.dispose();
        }
        // O que o jogador já apanhou saiu da lista sozinho; `remove` ignora
        // quem não está mais lá.
        for (const entidade of pilha.entidades) drops.remove(entidade);
        pilhas.splice(i, 1);
      }
    }
  };
}

export const SPOILS = { DURACAO };
