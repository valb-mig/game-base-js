import * as THREE from 'three';
import { initRangefinder } from '../../src/ui/rangefinder.js';
import { suite, ok, eq, near, note } from '../assert.js';

/**
 * O telêmetro: distância do olho até o que está sob a mira.
 *
 * O que se prova aqui é o NÚMERO, contra geometria que dá pra conferir de
 * cabeça — olho a 10 m de um chão plano, olhando pra baixo, tem que ler 10;
 * a 45°, 10·√2. Conferir só que "aparece alguma coisa" deixaria passar erro
 * de escala, que é justamente o que estraga uma medida.
 */

function montarCaixa() {
  document.getElementById('rangefinder')?.remove();
  const caixa = document.createElement('div');
  caixa.id = 'rangefinder';
  caixa.style.display = 'none';
  document.body.appendChild(caixa);
  return caixa;
}

/** Câmera de verdade: `getWorldDirection` sai da matriz, não de um campo. */
function olhoEm(x, y, z, alvo) {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);
  camera.position.set(x, y, z);
  camera.lookAt(alvo);
  camera.updateMatrixWorld(true);
  return camera;
}

/** Chão plano na altura zero, sem nada em cima. */
const chaoPlano = { heightAt: () => 0 };

function medir(camera, { colliders = [], targets = [], terrain = chaoPlano } = {}) {
  const caixa = montarCaixa();
  const player = { spectating: false, gun: { aim: 1 }, asTarget: null };
  const range = initRangefinder(player, camera, { terrain, colliders }, targets);
  range.update();
  return { caixa, texto: caixa.textContent, visivel: caixa.classList.contains('visivel') };
}

export function run() {
  suite('telêmetro: o número bate com a geometria');

  {
    // Olhando reto pra baixo de 10 m: a resposta é 10, e não há outro jeito
    // de ela estar certa por acaso.
    const camera = olhoEm(0, 10, 0, new THREE.Vector3(0, 0, 0));
    const { texto, visivel } = medir(camera);
    ok('mirando pra baixo, o telêmetro aparece', visivel);
    eq('olho a 10 m do chão plano', texto, '10 m');
  }

  {
    // 45°: anda o mesmo tanto pra frente e pra baixo, então a hipotenusa é
    // 10·√2 = 14,14. Erro de escala apareceria aqui e não no caso de cima.
    const camera = olhoEm(0, 10, 0, new THREE.Vector3(0, 0, -10));
    const { texto } = medir(camera);
    note('a 45° sobre chão plano', texto);
    eq('a 45°, a hipotenusa de 10 e 10', texto, `${Math.round(10 * Math.SQRT2)} m`);
  }

  {
    // Sem nada no caminho ele SOME, não escreve zero nem infinito: número que
    // aparece sempre deixa de ser informação.
    const camera = olhoEm(0, 10, 0, new THREE.Vector3(0, 60, -10));
    const { visivel, texto } = medir(camera);
    ok('olhando pro céu, o telêmetro some', !visivel);
    eq('e não escreve número nenhum', texto, '');
  }

  {
    // Parede antes do chão: quem responde é a parede.
    const parede = {
      box: new THREE.Box3(
        new THREE.Vector3(-2, 0, -6),
        new THREE.Vector3(2, 8, -5.5))
    };
    const camera = olhoEm(0, 4, 0, new THREE.Vector3(0, 4, -10));
    const { texto } = medir(camera, { colliders: [parede] });
    eq('a parede a 5,5 m responde antes do chão', texto, '6 m');
  }

  {
    // Alvo mais perto que o terreno é lido como alvo, e a classe muda: achar
    // alguém lê diferente de medir um morro.
    const alvo = {
      alive: true,
      radius: 0.5,
      center: (out) => out.set(0, 4, -20)
    };
    const camera = olhoEm(0, 4, 0, new THREE.Vector3(0, 4, -30));
    const { caixa, texto } = medir(camera, { targets: [alvo] });
    eq('soldado a 20 m', texto, '20 m');
    ok('e ele é marcado como alvo, não como terreno',
      caixa.classList.contains('no-alvo'));
  }

  {
    // O envelope do jogador está na MESMA lista de alvos, e ele não pode
    // medir a distância até o próprio peito.
    const eu = { alive: true, radius: 0.5, center: (out) => out.set(0, 4, 0) };
    const camera = olhoEm(0, 4, 0, new THREE.Vector3(0, 4, -30));
    const caixa = montarCaixa();
    const player = { spectating: false, gun: { aim: 1 }, asTarget: eu };
    initRangefinder(player, camera, { terrain: chaoPlano, colliders: [] }, [eu]).update();
    ok('o próprio jogador não vira alvo do telêmetro',
      !caixa.classList.contains('no-alvo'));
  }

  {
    // Fora da mira ele não escreve nada, nem o número velho.
    const camera = olhoEm(0, 10, 0, new THREE.Vector3(0, 0, 0));
    const caixa = montarCaixa();
    const player = { spectating: false, gun: { aim: 0 }, asTarget: null };
    initRangefinder(player, camera, { terrain: chaoPlano, colliders: [] }, []).update();
    ok('sem mirar, o telêmetro não aparece', !caixa.classList.contains('visivel'));
  }

  document.getElementById('rangefinder')?.remove();
}
