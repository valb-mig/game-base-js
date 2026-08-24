import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { Viewmodel } from '../../src/items/viewmodel.js';
import { initDrop } from '../../src/items/drop.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { WORLD, DROP } from '../../src/config.js';
import { KNIFE } from '../../src/items/classes.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;

/** Planalto seco a 5 m, mergulhando no mar a partir de z = 30. */
const relevo = {
  heightAt: (x, z) => (z < 30 ? 5 : 5 - (z - 30) * 0.6),
  waterDepthAt: (x, z) => Math.max(0, WORLD.WATER_LEVEL - relevo.heightAt(x, z))
};

export async function run() {
  initInput();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  const scene = new THREE.Scene();

  const caixa = {
    box: new THREE.Box3(new THREE.Vector3(4, 5, -1), new THREE.Vector3(6, 6, 1)),
    standable: true
  };

  const player = new Player(camera, document.body, {
    colliders: [caixa],
    terrain: relevo,
    spawn: new THREE.Vector3(0, 0, 0)
  });
  const viewmodel = new Viewmodel(camera, 1);
  viewmodel.setItem(player.equipped);
  const drops = initDrop(scene, player, viewmodel, { terrain: relevo });

  const press = (code) => {
    dispatchEvent(new KeyboardEvent('keydown', { code }));
    dispatchEvent(new KeyboardEvent('keyup', { code }));
  };
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) { drops.update(DT); endFrame(); }
  };

  suite('largar com G');

  eq('começa com a faca na mão', player.equipped?.id, KNIFE.id);
  ok('e ela aparece no viewmodel', viewmodel.item !== null);

  player.controls.isLocked = true;   // G só vale com o jogo travado no mouse
  press('KeyG');
  step(1);

  eq('largou: mão vazia', player.equipped, null);
  eq('viewmodel esvazia junto', viewmodel.item, null);
  eq('a faca virou objeto do mundo', drops.items.length, 1);
  ok('e entrou na cena', scene.children.includes(drops.items[0].mesh));

  const faca = drops.items[0];
  eq('o objeto sabe qual item é', faca.item.id, KNIFE.id);
  ok('nasce à frente do rosto, não dentro dele',
    faca.mesh.position.distanceTo(camera.position) > 0.3);

  suite('queda e repouso');

  eq('cai antes de assentar', faca.resting, false);
  step(240);
  eq('acaba parada', faca.resting, true);
  near('assenta na altura do terreno',
    faca.mesh.position.y, relevo.heightAt(faca.mesh.position.x, faca.mesh.position.z), 0.02);
  near('deita sobre a face da lâmina', faca.mesh.rotation.x, Math.PI / 2, 0.02);
  note('parou a', `${faca.mesh.position.distanceTo(new THREE.Vector3(0, 5, 0)).toFixed(1)} m do jogador`);

  suite('largar em cima de coisa e na água');

  // de pé encostado na caixa, olhando pra ela
  player.equipped = KNIFE;
  player.object.position.set(3.2, 6.7, 0);
  player.eyeY = 6.7;
  camera.quaternion.setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0, 'YXZ'));
  player.velocity.set(0, 0, 0);
  press('KeyG'); step(200);

  const naCaixa = drops.items[1];
  near('pousa em cima da caixa, não atravessa', naCaixa.mesh.position.y, 6, 0.02);

  // água funda: em z=60 o fundo está a -13 m, dá pra ver a descida acontecer
  player.equipped = KNIFE;
  player.object.position.set(0, 1, 60);
  player.eyeY = 1;
  camera.quaternion.setFromEuler(new THREE.Euler(0, 0, 0, 'YXZ'));
  press('KeyG');
  step(120);   // tempo pra estabilizar na velocidade terminal

  const naAgua = drops.items[2];
  eq('ainda está descendo, não assentou', naAgua.resting, false);
  near('estabiliza na velocidade terminal da água',
    naAgua.velocity.y, -DROP.WATER_SINK, 0.05);
  ok('o que é muito mais lento que queda livre',
    Math.abs(naAgua.velocity.y) < DROP.GRAVITY * 0.2,
    `${naAgua.velocity.y.toFixed(2)} m/s`);

  const alturaAntes = naAgua.mesh.position.y;
  step(60);
  near('percorre a velocidade terminal em um segundo',
    alturaAntes - naAgua.mesh.position.y, DROP.WATER_SINK, 0.05);
  step(900);
  eq('mas chega ao fundo', naAgua.resting, true);
  near('e para no fundo do mar',
    naAgua.mesh.position.y,
    relevo.heightAt(naAgua.mesh.position.x, naAgua.mesh.position.z), 0.05);

  suite('mão vazia');

  // Regressão: o sentinela do HUD era `null`, igual ao valor de mão vazia, e
  // o primeiro quadro sem item não desenhava nada.
  const { initStatus } = await import('../../src/ui/status.js');
  const holder = document.createElement('div');
  holder.style.display = 'none';
  holder.innerHTML = '<div id="vitals"></div><div id="equipped"></div>';
  document.body.appendChild(holder);
  const semItem = new Player(camera, document.body, { colliders: [], terrain: relevo });
  semItem.equipped = null;
  initStatus(semItem)();
  ok('HUD desenha mão vazia no primeiro quadro',
    document.getElementById('equipped').textContent.includes('Mãos vazias'),
    document.getElementById('equipped').textContent.trim());
  holder.remove();

  player.equipped = null;
  const antes = drops.items.length;
  press('KeyG'); step(1);
  eq('G de mão vazia não larga nada', drops.items.length, antes);

  player.respawn();
  eq('renascer devolve o equipamento', player.equipped?.id, KNIFE.id);
  eq('mas o que caiu continua no chão', drops.items.length, antes);

  player.controls.isLocked = false;
}
