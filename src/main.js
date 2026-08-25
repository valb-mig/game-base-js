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
import { initDebugView } from './ui/debugview.js';
import { initStatus } from './ui/status.js';
import { initCompass } from './ui/compass.js';
import { initCrosshair } from './ui/crosshair.js';
import { initPrompt } from './ui/prompt.js';
import { initHitmarker } from './ui/hitmarker.js';
import { initWatchdog } from './ui/watchdog.js';
import { initSnapshot } from './ui/snapshot.js';
import { createCapture } from './game/capture.js';
import { drawFlags } from './world/outpost.js';
import { initObjective, initFlagPrompt } from './ui/objective.js';
import { isDown } from './core/input.js';
import { FLAG_KEYS } from './player/constants.js';
import { createBots, playerAsTarget } from './bots/bots.js';
import { enemyOf, postOwner } from './game/teams.js';

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

  // Modo de jogo: doze postos, quatro bandeiras cada. Quem está de que lado
  // é do jogador; de quem é cada posto é da partida.
  const capture = createCapture(world.outposts);

  // Um bot, por enquanto. Toda a mecânica dele já é a de muitos: o gerente
  // atualiza uma lista, e a lista tem um.
  const bots = createBots(scene, world, { ballistics, capture });
  // O jogador como alvo: é isto que faz a bala de bot machucar de verdade,
  // pela mesma balística de todo mundo. Ele fica no `player` porque quem
  // atira precisa dele pra não se acertar mirando pro chão.
  const alvoDoJogador = playerAsTarget(player, () => flow.playerDied());
  player.asTarget = alvoDoJogador;

  // Nove bots: cinco do lado de lá, quatro do lado de cá. O jogador é o
  // décimo do time dele, e é isso que faz os números fecharem em 5 × 5.
  const inimigo = enemyOf(player.team);
  const ESQUADRAS = [
    { team: inimigo, quantos: 5 },
    { team: player.team, quantos: 4 }
  ];

  for (const { team, quantos } of ESQUADRAS) {
    // Nascem no posto do time mais perto da linha de frente, que é o de menor
    // distância ao centro da ilha: é lá que a briga começa.
    const frente = world.outposts
      .filter((posto) => posto.startTeam === team)
      .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];

    for (let i = 0; i < quantos; i++) {
      // Espalhados em volta do posto: empilhados na mesma coordenada eles
      // nasceriam dentro uns dos outros e passariam o primeiro segundo se
      // empurrando pra fora.
      const angulo = (i / quantos) * Math.PI * 2;
      bots.spawn({
        id: i + 1,
        team,
        x: frente.x + Math.cos(angulo) * 9,
        z: frente.z + Math.sin(angulo) * 9
      });
    }
  }

  // Uma lista só: bot mira em quem é do outro time, e a bala não distingue
  // farda nenhuma — quem segura o tiro por causa de companheiro é quem atira.
  const alvos = [alvoDoJogador, ...bots.soldiers];
  bots.setTargets(alvos);
  world.targets.push(...bots.soldiers, alvoDoJogador);

  // A trajetória prevista sai da boca do cano, como o tiro de verdade: com a
  // arma fora de posição o arco tem que sair torto aqui também.
  const debugView = initDebugView(scene, world, bots, { player, viewmodel, ballistics });

  // P grava a tela com o estado escrito nela, pra virar contexto de relato.
  const snapshot = initSnapshot(renderer, player, { world, bots, capture });

  // vigia de invariantes: grita se o jogo entrar num estado impossível
  const watchdog = initWatchdog(player, world);
  window.watchdog = watchdog;   // pra copiar o relatório do console

  game = {
    world, player, viewmodel, drops, attack, ballistics, firearm, digging, watchdog,
    capture, bots,
    updateObjective: initObjective(player, capture),
    updateFlagPrompt: initFlagPrompt(player, capture),

    updateStatus: initStatus(player),
    updateCompass: initCompass(camera),
    updateCrosshair: initCrosshair(player, camera),
    updatePrompt: initPrompt(drops),
    updateHitmarker: initHitmarker(alvoDoJogador, attack, ballistics),
    // Caixas de colisão e o que cada bot está pensando. Quem manda no
    // interruptor é o painel: uma tecla acende tudo junto.
    debugView,
    // O painel lê os números da trajetória, então a vista nasce antes dele.
    snapshot,
    debug: initDebug(player, () => debugView.shot)
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
    world, player, viewmodel, drops, attack, ballistics, firearm, digging,
    watchdog, capture, bots, snapshot
  } = game;

  // clamp evita salto gigante quando a aba volta do background
  const delta = Math.min(clock.getDelta(), 0.1);

  // A tecla é lida aqui e a foto é tirada depois do render: o canvas só tem
  // conteúdo entre uma coisa e outra.
  snapshot.poll();

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

  // Bandeira só anda com alguém trabalhando nela, e espectador não trabalha.
  if (!player.spectating) {
    const pes = player.object.position;
    capture.update(delta, {
      x: pes.x, y: player.feetY, z: pes.z, teamId: player.team,
      agindo: player.isLocked && isDown(...FLAG_KEYS)
    });
  }
  drawFlags(world.outposts);

  // Bot depois da captura do jogador: os dois mexem nas mesmas bandeiras, e
  // o último a falar no quadro não pode ser sempre o mesmo.
  bots.update(delta);

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

  // A vista desenha primeiro: é ela que calcula os números que o painel lê.
  game.debugView.update(game.debug.on);
  game.debug.update(delta);
  game.updateStatus(delta);
  game.updateCompass();
  game.updateCrosshair();
  game.updatePrompt();
  game.updateHitmarker(delta);
  game.updateObjective();
  game.updateFlagPrompt();
  watchdog.update();

  renderer.render(scene, camera);
  viewmodel.render(renderer);

  // Depois do render, antes do fim do quadro: `preserveDrawingBuffer` é
  // false, e fora desta janela `toDataURL` devolve uma imagem preta.
  snapshot.afterRender();

  endFrame(); // o que ninguém consumiu neste frame não vale no próximo
}
