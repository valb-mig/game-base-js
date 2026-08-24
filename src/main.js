import * as THREE from 'three';
import { createStage } from './core/stage.js';
import { CAMERA } from './config.js';
import { initInput, endFrame } from './core/input.js';
import { buildWorld } from './world/world.js';
import { applyUnderwater } from './world/water.js';
import { Player } from './player/player.js';
import { Viewmodel } from './items/viewmodel.js';
import { initDrop } from './items/drop.js';
import { initAttack } from './items/attack.js';
import { initFirearm } from './items/firearm.js';
import { createBallistics } from './items/ballistics.js';
import { initMenu } from './ui/menu.js';
import { initDebug } from './ui/debug.js';
import { initStatus } from './ui/status.js';
import { initCompass } from './ui/compass.js';
import { initMission } from './ui/mission.js';
import { initPrompt } from './ui/prompt.js';
import { initHitmarker } from './ui/hitmarker.js';

const { scene, camera, renderer } = createStage();
const world = buildWorld(scene);

const player = new Player(camera, renderer.domElement, world);
scene.add(player.object);

initInput();

const updateDebug = initDebug(player);
const updateStatus = initStatus(player);
const updateCompass = initCompass(camera);
const updateMission = initMission(player, world.bases);

// item na mão: passe próprio, some enquanto alguma tela estiver aberta
const viewmodel = new Viewmodel(camera, innerWidth / innerHeight);
viewmodel.visible = false;
addEventListener('resize', () => viewmodel.setAspect(innerWidth / innerHeight));

const drops = initDrop(scene, player, viewmodel, world);
const updatePrompt = initPrompt(drops);
const attack = initAttack(player, world);
const ballistics = createBallistics(scene, world.colliders);
const firearm = initFirearm(player, world, ballistics);
const updateHitmarker = initHitmarker(attack, ballistics);

initMenu(player.controls, (classDef) => {
  player.setClass(classDef);
  player.respawn();
  viewmodel.setItem(player.equipped);
  viewmodel.visible = true;
});

const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  // clamp evita salto gigante quando a aba volta do background
  const delta = Math.min(clock.getDelta(), 0.1);

  if (player.isLocked) {
    player.update(delta);
    viewmodel.update(delta, player);
  }
  drops.update(delta);
  attack.update(delta);
  firearm.update(delta);
  ballistics.update(delta, world.targets, world.terrain);

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

  updateDebug(delta);
  updateStatus();
  updateCompass();
  updateMission();
  updatePrompt();
  updateHitmarker(delta);

  renderer.render(scene, camera);
  viewmodel.render(renderer);

  endFrame(); // o que ninguém consumiu neste frame não vale no próximo
});
