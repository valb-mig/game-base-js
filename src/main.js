import * as THREE from 'three';
import { createStage } from './core/stage.js';
import { CAMERA } from './config.js';
import { initInput, endFrame, consumePress } from './core/input.js';
import { buildWorld } from './world/world.js';
import { applyUnderwater } from './world/water.js';
import { Player } from './player/player.js';
import { Viewmodel } from './items/viewmodel.js';
import { initDrop } from './items/drop.js';
import { initAttack } from './items/attack.js';
import { initFirearm } from './items/firearm.js';
import { initDigging } from './items/digging.js';
import { createBallistics } from './items/ballistics.js';
import { initFlow } from './ui/flow.js';
import { initDebug } from './ui/debug.js';
import { initStatus } from './ui/status.js';
import { initCompass } from './ui/compass.js';
import { initPrompt } from './ui/prompt.js';
import { initHitmarker } from './ui/hitmarker.js';
import { initWatchdog } from './ui/watchdog.js';

/**
 * Fiação e laço de render.
 *
 * Nada de mundo aqui em cima: a tela de abertura não constrói ilha, floresta
 * nem base, e por isso `boot()` só roda no clique em Jogar. Antes disso a
 * página tem cena vazia e nenhum laço de render — é o que faz a abertura
 * aparecer na hora, inclusive em máquina fraca.
 */

const { scene, camera, renderer } = createStage();
const clock = new THREE.Clock();
initInput();

// Preenchido por boot(). Nada abaixo pode assumir que já existe.
let game = null;

/** Constrói mundo, jogador e sistemas, e liga o laço. Roda uma vez. */
function boot() {
  const world = buildWorld(scene);

  const player = new Player(camera, renderer.domElement, world);
  scene.add(player.object);

  // item na mão: passe próprio, some enquanto alguma tela estiver aberta
  const viewmodel = new Viewmodel(camera, innerWidth / innerHeight);
  viewmodel.visible = false;
  addEventListener('resize', () => viewmodel.setAspect(innerWidth / innerHeight));

  const drops = initDrop(scene, player, viewmodel, world);
  const attack = initAttack(player, world);
  const ballistics = createBallistics(scene, world.colliders, {
    // tiro no chão marca o terreno; quanto afunda sai da arma
    onTerrainImpact: (x, z, fundo) => world.reshape(x, z, -fundo)
  });
  const firearm = initFirearm(player, world, ballistics, viewmodel);
  const digging = initDigging(player, world);

  // vigia de invariantes: grita se o jogo entrar num estado impossível
  const watchdog = initWatchdog(player, world);
  window.watchdog = watchdog;   // pra copiar o relatório do console

  game = {
    world, player, viewmodel, drops, attack, ballistics, firearm, digging, watchdog,
    updateDebug: initDebug(player),
    updateStatus: initStatus(player),
    updateCompass: initCompass(camera),
    updatePrompt: initPrompt(drops),
    updateHitmarker: initHitmarker(attack, ballistics)
  };

  clock.getDelta();   // descarta o tempo que a abertura ficou na tela
  renderer.setAnimationLoop(frame);

  return { controls: player.controls, player, world };
}

const flow = initFlow({
  boot,

  // desembarcar: nasce na zona escolhida, com o equipamento da classe
  onDeploy(classDef, zone) {
    const { player, viewmodel } = game;
    player.spawn.set(zone.x, 0, zone.z);
    player.setClass(classDef);
    player.respawn();
    viewmodel.setItem(player.equipped);
    viewmodel.visible = true;
  },

  // caído ou ainda escolhendo: fantasma acima do mapa, sem equipamento
  onSpectate() {
    const { player, world, viewmodel } = game;
    const from = player.object.position;
    const ground = world.terrain.heightAt(from.x, from.z);
    player.spectateFrom(from.x, Math.max(ground + 28, from.y), from.z);
    viewmodel.visible = false;
  }
});

// ?deploy=N entra no mapa sem clique nenhum, na zona N. É o que deixa a
// verificação headless exercitar o quadro com o jogador vivo, que é onde
// sistema sem dono aparece.
const autoDeploy = new URLSearchParams(location.search).get('deploy');
if (autoDeploy !== null) flow.enterMap(Number(autoDeploy) || 0);

function frame() {
  const {
    world, player, viewmodel, drops, attack, ballistics, firearm, digging, watchdog
  } = game;

  // clamp evita salto gigante quando a aba volta do background
  const delta = Math.min(clock.getDelta(), 0.1);

  if (player.isLocked) {
    player.update(delta);
    if (!player.spectating) viewmodel.update(delta, player);
  }

  // Espectador não larga item, não golpeia e não atira: ele não está no jogo.
  if (!player.spectating) {
    drops.update(delta);
    attack.update(delta);
    firearm.update(delta);
    digging.update(delta);
  }
  ballistics.update(delta, world.targets, world.terrain);
  world.settling.update(delta);

  // tecla de teste enquanto nada causa dano de verdade ao jogador
  if (player.isLocked && !player.spectating && consumePress('KeyK')) {
    if (player.damage(player.maxHealth)) flow.playerDied();
  }

  // Mirar aproxima a vista. O viewmodel tem câmera própria, então a arma na
  // mão não estica junto — é só o mundo que chega mais perto.
  const wantedFov = THREE.MathUtils.lerp(CAMERA.FOV, CAMERA.ADS_FOV, player.gun.aim);
  if (Math.abs(camera.fov - wantedFov) > 0.01) {
    camera.fov = wantedFov;
    camera.updateProjectionMatrix();
  }
  document.body.classList.toggle('aiming', player.gun.aim > 0.5);
  for (const target of world.targets) target.update(delta);

  world.water.update(clock.elapsedTime);
  applyUnderwater(scene, player.headUnderwater);

  game.updateDebug(delta);
  game.updateStatus();
  game.updateCompass();
  game.updatePrompt();
  game.updateHitmarker(delta);
  watchdog.update();

  renderer.render(scene, camera);
  viewmodel.render(renderer);

  endFrame(); // o que ninguém consumiu neste frame não vale no próximo
}
