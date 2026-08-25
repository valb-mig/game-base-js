import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { initDigging } from '../../src/items/digging.js';
import { createDeform, DEFORM } from '../../src/world/deform.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { CLASSES, SHOVEL, SLOT_ORDER, getClass } from '../../src/items/classes.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;

/** Mundo mínimo com terreno plano e a camada escavável de verdade. */
function mundoPlano() {
  const deform = createDeform();
  const terrain = {
    heightAt: (x, z) => 0 + deform.deltaAt(x, z),
    waterDepthAt: () => 0
  };

  let editados = 0;
  return {
    deform,
    terrain,
    colliders: [],
    targets: [],
    get editados() { return editados; },
    reshape(x, z, amount, radius) {
      const tocados = deform.apply(x, z, amount, radius);
      editados += tocados.length;
      return tocados.length > 0;
    }
  };
}

/**
 * Põe o item na mão e ESPERA a troca terminar.
 *
 * Trocar de item leva tempo desde que guardar e sacar viraram animação: ler
 * `equipped` no mesmo quadro do `selectSlot` lê o item ANTIGO, porque a troca
 * acontece no fundo do movimento.
 */
function empunhar(player, indice) {
  player.selectSlot(indice);
  for (let i = 0; i < 600 && player.swapping; i++) player.advanceSwap(1 / 60);
  return player.equipped;
}

export function run() {
  initInput();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  const world = mundoPlano();

  const player = new Player(camera, document.body, {
    colliders: world.colliders, terrain: world.terrain, spawn: new THREE.Vector3(0, 0, 0)
  });
  player.setClass(getClass('assault'));
  player.controls.isLocked = true;

  const digging = initDigging(player, world);
  const pazadas = [];
  digging.onDig((r) => pazadas.push(r));

  const clicar = (botao) => {
    dispatchEvent(new MouseEvent('mousedown', { button: botao }));
    dispatchEvent(new MouseEvent('mouseup', { button: botao }));
  };
  const passo = (n = 1) => {
    for (let i = 0; i < n; i++) { digging.update(DT); endFrame(); }
  };
  const acao = (botao) => {
    clicar(botao);
    passo(Math.ceil((SHOVEL.tool.digTime + SHOVEL.tool.cooldown) / DT) + 8);
  };

  // olhando pro chão à frente
  const mirar = (pitch) => camera.quaternion.setFromEuler(
    new THREE.Euler(pitch, 0, 0, 'YXZ'));
  const plantar = () => {
    player.object.position.set(0, 1.7, 0);
    player.eyeY = 1.7;
    mirar(-0.75);
  };

  suite('a pá está no cinto de todo mundo');

  eq('existe um quarto slot', SLOT_ORDER.length, 4);
  eq('e ele é a ferramenta', SLOT_ORDER[3], 'Ferramenta');
  eq('as quatro classes levam a pá',
    CLASSES.filter((c) => c.loadout.includes(SHOVEL)).length, CLASSES.length);
  eq('e é o mesmo objeto pra todas',
    new Set(CLASSES.map((c) => c.loadout.find((i) => i.id === 'm1943'))).size, 1);

  const slotPa = player.carried.findIndex((item) => item?.id === 'm1943');
  eq('a pá ocupa o slot 4', slotPa, 3);
  empunhar(player, slotPa);
  eq('e dá pra empunhá-la', player.equipped?.id, 'm1943');

  suite('cavar não é imediato');

  plantar();
  const alturaAntes = world.terrain.heightAt(0, -1.4);

  clicar(0);
  passo(1);
  eq('o clique começa a pazada', player.dig.modo, 'cavar');
  eq('mas o terreno ainda não mudou', pazadas.length, 0);
  near('a altura continua a mesma', world.terrain.heightAt(0, -1.4), alturaAntes, 1e-9);

  const quadrosAteACarga = Math.floor(SHOVEL.tool.digAt * SHOVEL.tool.digTime / DT);
  passo(quadrosAteACarga - 3);
  eq('nada de terra antes da hora', pazadas.length, 0);

  passo(6);
  eq('a terra sai no meio da pazada', pazadas.length, 1);
  eq('e a pá fica carregada', player.dig.carga, 1);
  ok('o chão afundou', world.terrain.heightAt(0, -1.4) < alturaAntes,
    `${(world.terrain.heightAt(0, -1.4) - alturaAntes).toFixed(2)} m`);

  passo(60);
  eq('uma pazada gera uma cava só', pazadas.length, 1);
  eq('e a ação termina', player.dig.modo, null);

  suite('a pá leva uma pazada de cada vez');

  const comCarga = pazadas.length;
  acao(0);
  eq('cavar de pá cheia não faz nada', pazadas.length, comCarga);
  ok('e avisa por quê', player.dig.falhou !== null, player.dig.falhou);

  const fundoAntes = world.terrain.heightAt(0, -1.4);
  acao(2);
  eq('botão direito despeja a terra', pazadas.length, comCarga + 1);
  eq('e a pá esvazia', player.dig.carga, 0);
  ok('o chão subiu', world.terrain.heightAt(0, -1.4) > fundoAntes,
    `${(world.terrain.heightAt(0, -1.4) - fundoAntes).toFixed(2)} m`);

  acao(2);
  eq('aterrar de pá vazia não faz nada', pazadas.length, comCarga + 1);
  ok('e avisa por quê', player.dig.falhou !== null, player.dig.falhou);

  suite('limites do terreno');

  // cava no mesmo ponto até o fundo parar de descer
  plantar();
  let cavadas = 0;
  let ultima = world.terrain.heightAt(0, -1.4);
  for (let i = 0; i < 24; i++) {
    acao(0);
    if (player.dig.carga === 0) break;   // não conseguiu cavar
    acao(2);                              // esvazia longe não dá; despeja ali mesmo
    const agora = world.terrain.heightAt(0, -1.4);
    if (Math.abs(agora - ultima) < 1e-6) break;
    ultima = agora;
    cavadas++;
  }
  ok('cavar tem fundo', cavadas < 24, `parou depois de ${cavadas} ciclos`);

  suite('sem chão ao alcance');

  plantar();
  mirar(1.2);   // olhando pro céu
  player.dig.carga = 0;
  const antesDoCeu = pazadas.length;
  acao(0);
  eq('cavar o céu não cava nada', pazadas.length, antesDoCeu);
  ok('e avisa que não há alcance', player.dig.falhou !== null, player.dig.falhou);

  suite('sem a pá na mão');

  plantar();
  empunhar(player, player.carried.findIndex((i) => i?.id === 'kabar'));
  const semPa = pazadas.length;
  clicar(0);
  passo(6);
  eq('o clique não vira pazada', pazadas.length, semPa);
  eq('nem começa ação', player.dig.modo, null);

  player.controls.isLocked = false;
}
