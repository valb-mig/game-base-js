import * as THREE from 'three';
import { createStage } from './core/stage.js';
import { CAMERA } from './config.js';
import { criarAudio } from './core/audio.js';
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
import { createSparks } from './world/sparks.js';
import { createSpoils } from './world/spoils.js';
import { initFlow } from './ui/flow.js';
import { initDebug } from './ui/debug.js';
import { initDebugView } from './ui/debugview.js';
import { initStatus } from './ui/status.js';
import { initCompass } from './ui/compass.js';
import { initCrosshair } from './ui/crosshair.js';
import { initPrompt } from './ui/prompt.js';
import { initHitmarker } from './ui/hitmarker.js';
import { initKillFeed } from './ui/killfeed.js';
import { initWatchdog } from './ui/watchdog.js';
import { initSnapshot } from './ui/snapshot.js';
import { createCapture } from './game/capture.js';
import { drawFlags } from './world/outpost.js';
import { initObjective, initFlagPrompt } from './ui/objective.js';
import { isDown } from './core/input.js';
import { FLAG_KEYS } from './player/constants.js';
import { createBots, playerAsTarget } from './bots/bots.js';
import { carregarSoldado, caixasDoModelo } from './bots/model.js';
import { carregarJipe, medidasDoJipe } from './veiculos/modelo.js';
import { usarMedidasDoJipe } from './veiculos/hitbox.js';
import { criarVeiculos } from './veiculos/veiculos.js';
import { initPlayerBody } from './player/body.js';
import { usarMedidasDoModelo } from './game/hitboxes.js';
import { buildTrainingWorld } from './world/training-world.js';
import { enemyOf, postOwner } from './game/teams.js';
import {
  SUPRIMENTO, reabastecer, postoDeSuprimento
} from './game/suprimento.js';

/**
 * Fiação e laço de render.
 *
 * Nada de mundo aqui em cima: a tela de abertura não constrói ilha, floresta
 * nem base, e por isso `boot()` só roda no clique em Jogar. Antes disso a
 * página tem cena vazia e nenhum laço de render — é o que faz a abertura
 * aparecer na hora, inclusive em máquina fraca.
 */

// O modelo do soldado vem de arquivo, e carregar é assíncrono enquanto montar
// mundo é síncrono. Ele é esperado AQUI, antes de qualquer tela: são 25 KB, e
// pagar isso na abertura é melhor do que soldado nascendo sem corpo.
await carregarSoldado().catch(() => {});
// O jipe pelo mesmo caminho e pelo mesmo motivo: 53 KB pagos na abertura em
// vez de veículo nascendo invisível no meio do mapa.
await carregarJipe().catch(() => {});
// E a hitbox dele sai da MALHA, como a do soldado. Sem o arquivo, a tabela de
// reserva vale — a regra de dano não depende de `.glb` ter carregado.
usarMedidasDoJipe(medidasDoJipe);

// A hitbox passa a sair da MALHA do modelo. A regra de dano continua sem
// conhecer three: ela só recebe de onde medir.
usarMedidasDoModelo(caixasDoModelo);

const { scene, camera, renderer, luzes } = createStage();

/**
 * O ouvido nasce com o palco, mas MUDO: o navegador só libera áudio depois
 * de um gesto do usuário, e sintetizar os buffers no boot seria pagar por
 * som que não vai tocar. O jogo já exige clique pra travar o ponteiro —
 * `despertar` pega carona nele.
 */
const audio = criarAudio(camera, scene);
addEventListener('pointerdown', () => audio.despertar(), { once: false });
addEventListener('keydown', () => audio.despertar(), { once: false });
const clock = new THREE.Clock();
initInput();

// Preenchido por boot(). Nada abaixo pode assumir que já existe.
let game = null;

/**
 * Constrói mundo, jogador e sistemas, e liga o laço. Roda uma vez.
 *
 * `modo` decide QUAL mundo: Sainte-Mère ou o campo de treinamento. São mapas
 * diferentes de propósito — treinar mira tem que ser plano, medido e sem nada
 * acontecendo em volta, e o mapa de combate é o contrário disso.
 */
function boot(modo = 'batalha') {
  const treino = modo === 'treino';
  const world = treino ? buildTrainingWorld(scene) : buildWorld(scene);

  const player = new Player(camera, renderer.domElement, world);
  scene.add(player.object);

  // O corpo dele, visto por ele. Sem cabeça: a câmera está dentro dela.
  const corpo = initPlayerBody(scene, player, { team: player.team });

  // item na mão: passe próprio, some enquanto alguma tela estiver aberta
  const viewmodel = new Viewmodel(camera, innerWidth / innerHeight);
  viewmodel.visible = false;
  addEventListener('resize', () => viewmodel.setAspect(innerWidth / innerHeight));

  const drops = initDrop(scene, player, viewmodel, world);
  const attack = initAttack(player, world);
  const ballistics = createBallistics(scene, world.colliders, {
    // tiro no chão marca o terreno; quanto afunda sai da arma
    onTerrainImpact: (x, z, fundo) => world.reshape(x, z, -fundo),
    // e tiro no mato derruba o mato, sem parar a bala
    onFoliage: (de, para) => world.bushes?.slash(de, para)
  });
  // Fagulha onde a bala bate. Ela escuta a balística como o kill feed
  // escuta: a balística diz onde bateu e no quê, e quem desenha é daqui.
  const sparks = createSparks(scene);
  ballistics.onHit((r) => {
    const tipo = r.terreno ? 'terra' : (r.target && !r.target.veiculo ? 'corpo' : 'duro');
    sparks.burst(r.point, r.dir, tipo);
    // O som do impacto sai ONDE a bala bateu, e não de onde ela saiu: é ele
    // que diz ao jogador que o tiro passou perto, que é metade do que faz
    // levar fogo ser levar fogo.
    audio.tocar(r.terreno ? 'terra' : (r.target ? 'carne' : 'pedra'),
      r.point.x, r.point.y, r.point.z, { volume: 0.8 });
  });

  // Todo disparo passa por `spawn`, o do jogador e o dos bots. É o mesmo
  // funil que o bot já usa pra ouvir tiro (o estado `alerta`); o jogador não
  // tinha nada, e virar pro lado certo era privilégio de quem estava olhando.
  ballistics.onShot(({ x, y, z, som }) => {
    if (som) audio.tocar(som, x, y, z);
  });

  // Espólio: a mochila do morto e as armas dele no chão, por alguns
  // segundos. Ele escuta a balística e o corpo a corpo — os dois lugares
  // onde alguém morre — e o filtro é ter arsenal: boneco de treino não
  // deixa nada.
  const spoils = createSpoils(scene, drops, world);
  const largarEspolio = (r) => {
    if (r.killed && r.target?.weapons) spoils.soltar(r.target);
  };
  ballistics.onHit(largarEspolio);
  attack.onHit(largarEspolio);

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

  // No treino não há times nem inimigo: só alvos parados.
  if (treino) {
    player.infiniteAmmo = true;
    for (const arma of world.arsenal) {
      const i = world.arsenal.indexOf(arma);
      drops.place({ ...arma, ammo: arma.ammo ? { ...arma.ammo } : undefined },
        world.spawn.x + 3 + i * 1.7, world.spawn.z + 2.5, Math.PI / 2);
    }
  }

  /**
   * Os dois exércitos, formados ANTES de o jogador escolher onde desembarcar.
   *
   * A ordem importa e é a pedida: clicar em Jogar monta o mundo e põe os
   * trezentos em campo, e só então a tela de deploy aparece. Quando o jogador
   * desembarca, a partida já está acontecendo — ele entra numa guerra em
   * curso em vez de acender o mapa ao pisar nele.
   *
   * Cada um nasce num posto que o time dele já domina, repartido entre eles.
   */
  const POR_TIME = 150;
  if (!treino) {
    for (const [i, time] of ['karnia', 'vestria'].entries()) {
      bots.formar({ team: time, quantos: POR_TIME, id0: 1 + i * POR_TIME });
    }
  }

  // Uma lista só: bot mira em quem é do outro time, e a bala não distingue
  // farda nenhuma — quem segura o tiro por causa de companheiro é quem atira.
  const alvos = [alvoDoJogador, ...bots.soldiers];
  bots.setTargets(alvos);
  world.targets.push(...bots.soldiers, alvoDoJogador);

  /**
   * Os veículos. Depois dos bots porque a lista de alvos do atropelamento é a
   * mesma que eles formam — quem passa por cima de alguém precisa saber quem
   * está em campo.
   *
   * ONDE eles ficam é do mapa, não daqui: `world.garagem` é a mesma ideia de
   * `world.arsenal` e `world.spawnZones` — quem conhece o terreno é quem
   * escolhe o lugar. Sainte-Mère põe um em cada base; o campo de treinamento
   * põe um ao lado da linha de tiro, que é onde se aprende a dirigir sem
   * ninguém atirando de volta.
   */
  const veiculos = criarVeiculos(scene, world, camera, player);
  for (const vaga of world.garagem ?? []) {
    veiculos.criar(vaga.x, vaga.z, vaga.yaw);
  }

  // A trajetória prevista sai da boca do cano, como o tiro de verdade: com a
  // arma fora de posição o arco tem que sair torto aqui também.
  const debugView = initDebugView(scene, world, bots, { player, viewmodel, ballistics });


  // P grava a tela com o estado escrito nela, pra virar contexto de relato.
  const snapshot = initSnapshot(renderer, player, { world, bots, capture });

  // Kill feed: quem matou quem, e como. Ele escuta a balística e o corpo a
  // corpo, que são os dois lugares onde alguém morre.
  const killfeed = initKillFeed(player);
  ballistics.onHit((r) => {
    if (!r.killed) return;

  /**
   * Quem o laço de render ATUALIZA — e é uma lista à parte de propósito.
   *
   * `world.targets` é a lista de quem a bala pode ACERTAR, e os bots entram
   * nela logo abaixo. Ela também vinha sendo usada como lista de update, e
   * com isso todo bot era atualizado DUAS vezes por quadro: uma por
   * `bots.update`, depois de o cérebro tê-lo movido, e outra aqui — quando
   * ele já não tinha andado nada desde a primeira.
   *
   * Enquanto a pose do soldado era estática isso não custava nada e ninguém
   * viu. Com a passada, a segunda chamada lê deslocamento zero, conclui que
   * o corpo está parado e devolve a perna ao repouso — todo quadro, apagando
   * a animação que a primeira acabara de escrever. O sintoma era um exército
   * inteiro deslizando de pernas retas, com a fase do passo correndo por
   * baixo. Duas listas, dois propósitos.
   */
  const paraAtualizar = [...world.targets];
    killfeed.register({
      matador: r.owner, vitima: r.target, regiao: r.regiao,
      arma: r.owner?.weapon?.name ?? player.equipped?.name ?? null
    });
  });
  attack.onHit((r) => {
    if (!r.killed) return;
    killfeed.register({
      matador: alvoDoJogador, vitima: r.target,
      costas: r.costas, arma: player.equipped?.name ?? null
    });
  });

  // vigia de invariantes: grita se o jogo entrar num estado impossível
  const watchdog = initWatchdog(player, world);
  window.watchdog = watchdog;   // pra copiar o relatório do console

  game = {
    world, player, viewmodel, drops, attack, ballistics, firearm, digging, watchdog,
    capture, bots, sparks, spoils, veiculos, paraAtualizar, tratamento,
    updateObjective: initObjective(player, capture),
    updateFlagPrompt: initFlagPrompt(player, capture),

    updateStatus: initStatus(player),
    updateCompass: initCompass(camera),
    updateCrosshair: initCrosshair(player, camera),
    updatePrompt: initPrompt(drops, veiculos),
    updateHitmarker: initHitmarker(alvoDoJogador, attack, ballistics),
    killfeed,
    // Caixas de colisão e o que cada bot está pensando. Quem manda no
    // interruptor é o painel: uma tecla acende tudo junto.
    debugView,
    // O painel lê os números da trajetória, então a vista nasce antes dele.
    snapshot,
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
    player.infiniteAmmo = false;   // munição infinita é só do treino
    player.spawn.set(zone.x, 0, zone.z);
    player.setClass(classDef);
    player.respawn();
    viewmodel.setItem(player.equipped);
    viewmodel.visible = true;
  },

  /** Campo de treinamento: o mapa já nasceu pronto, só falta desembarcar. */
  onTraining() {
    const { player, viewmodel } = game;
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
const busca = new URLSearchParams(location.search);

// ?treino=1 entra direto no campo de treinamento. É por aqui que trocar de
// modo com o mundo já montado funciona: a página recarrega com o modo na URL.
if (busca.has('treino')) flow.startTraining();

const autoDeploy = busca.get('deploy');
if (autoDeploy !== null) flow.enterMap(Number(autoDeploy) || 0);

function frame() {
  const {
    world, player, viewmodel, drops, attack, ballistics, firearm, digging,
    watchdog, capture, bots, snapshot, killfeed, corpo, sparks, spoils, veiculos,
    paraAtualizar
  } = game;

  // clamp evita salto gigante quando a aba volta do background
  const delta = Math.min(clock.getDelta(), 0.1);

  // A tecla é lida aqui e a foto é tirada depois do render: o canvas só tem
  // conteúdo entre uma coisa e outra.
  snapshot.poll();

  /**
   * Os veículos ANTES de tudo o que lê tecla, e antes do jogador.
   *
   * Duas razões, e as duas foram medidas doendo. O E é disputado com apanhar
   * item, e quem roda primeiro tem a primeira recusa — com `drops` na frente,
   * apertar E ao lado do jipe não fazia nada, porque ele consumia a tecla em
   * todo quadro mesmo sem item por perto. E é aqui que `player.vehicle` muda,
   * então tudo abaixo já sabe se o jogador está dirigindo neste quadro.
   *
   * Também é aqui que o corpo do jogador e as caixas de colisão do que anda se
   * movem, e quem testa acerto tem que testar contra onde as coisas estão
   * neste quadro.
   */
  veiculos.update(delta, world.targets);

  /**
   * Dirigindo, quem move o jogador é o VEÍCULO.
   *
   * `player.update` não roda: ele resolveria postura, locomoção e colisão pra
   * um corpo que não está andando, e no fim do quadro `view.js` reescreveria
   * `camera.position.y` por cima do assento. Quem escreve a câmera de dentro
   * do jipe é `veiculos/vista.js`.
   */
  const dirigindo = Boolean(player.vehicle);
  if (player.isLocked && !dirigindo) {
    player.update(delta);
    if (!player.spectating) viewmodel.update(delta, player);
  }

  // Espectador não larga item, não golpeia e não atira: ele não está no jogo.
  // E quem está no VOLANTE tem as duas mãos ocupadas — passageiro atira.
  const maosLivres = !dirigindo || !player.vehicle.lugar.def.dirige;
  if (!player.spectating) {
    if (!dirigindo) drops.update(delta);
    if (maosLivres) {
      attack.update(delta);
      firearm.update(delta);
    }
    if (!dirigindo) digging.update(delta);
  }
  if (dirigindo && maosLivres) viewmodel.update(delta, player);

  /**
   * Quem está no volante segura o volante, não a arma.
   *
   * `viewmodel.update` não roda pra ele, então sem isto a arma congelava na
   * última pose no meio da tela. E o corpo em primeira pessoa sai de cena:
   * ele está em pé, e um corpo em pé dentro de um assento tem as pernas
   * enfiadas no assoalho — as mãos que aparecem são as do viewmodel, que
   * vivem no espaço da câmera e não precisam de corpo nenhum.
   */
  if (dirigindo && !maosLivres) {
    const maos = veiculos.maosNoVolante();
    if (maos) viewmodel.segurarVolante(maos.esq, maos.dir, camera.fov);
  } else {
    viewmodel.soltarVolante();
  }
  corpo.visible = !dirigindo;
  ballistics.update(delta, world.targets, world.terrain);
  sparks.update(delta);
  spoils.update(delta);
  world.settling.update(delta);
  world.bushes?.update(delta);

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
  // `paraAtualizar`, nunca `world.targets`: bot já foi atualizado por
  // `bots.update` neste quadro, e atualizá-lo de novo apaga a passada.
  for (const target of paraAtualizar) target.update(delta);

  corpo.update();
  /**
   * Posto dominado é paiol.
   *
   * Parado perto de um posto do seu time, a reserva volta — e é o que fecha o
   * círculo do modo: perder posto deixa de ser só perder spawn e passa a ser
   * perder munição. Posto em disputa não serve, então negar o ponto é negar a
   * bala de quem está atacando.
   *
   * Sem aviso na tela de propósito: o contador de reserva do HUD subindo já
   * conta o que está acontecendo, e o HUD não inventa número nem mensagem.
   */
  if (player.alive && !player.spectating) {
    const p = player.object.position;
    const paiol = postoDeSuprimento(
      world.outposts, player.team, p.x, p.z, postOwner);
    if (paiol) reabastecer(player.carried, SUPRIMENTO.POR_SEGUNDO * delta);
  }

  world.water.update(clock.elapsedTime);
  world.river?.update(clock.elapsedTime);
  // Pás de moinho e o que mais vier: o laço não sabe o que são, só que andam.
  for (const anima of world.animados ?? []) anima(delta);
  applyUnderwater(scene, player.headUnderwater);

  // A vista desenha primeiro: é ela que calcula os números que o painel lê.
  game.debugView.update(game.debug.on);
  game.debug.update(delta);
  game.updateStatus(delta);
  game.updateCompass();
  game.updateCrosshair();
  game.updatePrompt();
  game.updateHitmarker(delta);
  killfeed.update(delta);
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
