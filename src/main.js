import * as THREE from 'three';
import { createStage } from './core/stage.js';
import { criarAudio } from './core/audio.js';
import {
  CAMERA, VIEW, GRADE, SPREAD, BULLET, MELEE, STAMINA, SWAP, PLAYER, WORLD,
  INCLINACAO
} from './config.js';
import {
  initInput, endFrame, consumePress, consumeClick, mousePosition
} from './core/input.js';
import { buildWorld } from './world/world.js';
import { applyUnderwater } from './world/water.js';
import { Player } from './player/player.js';
import { Viewmodel } from './items/viewmodel.js';
import { initDrop } from './items/drop.js';
import { initAttack } from './items/attack.js';
import { initFirearm } from './items/firearm.js';
import { initDigging } from './items/digging.js';
import { createBallistics } from './items/ballistics.js';
import { createSparks, fagulhaDaRegiao } from './world/sparks.js';
import { createSpoils } from './world/spoils.js';
import { initFlow } from './ui/flow.js';
import { initDebug } from './ui/debug.js';
import { initAjustes } from './ui/ajustes.js';
import { initDebugView } from './ui/debugview.js';
import { initStatus } from './ui/status.js';
import { initCompass } from './ui/compass.js';
import { initRadar } from './ui/radar.js';
import { criarMapaDesenho } from './ui/mapadesenho.js';
import { criarMapaNaMao } from './items/mapamao.js';
import { criarDeteccao, varrerCampo, DETECCAO } from './game/deteccao.js';
import { alternar as alternarMarcacao, dentroDoMapa } from './ui/marcacoes.js';
import { MAP_KEYS } from './player/constants.js';
import { initRangefinder } from './ui/rangefinder.js';
import { initCrosshair } from './ui/crosshair.js';
import { initPrompt } from './ui/prompt.js';
import { initHitmarker } from './ui/hitmarker.js';
import { initHitFeed } from './ui/hitfeed.js';
import { initRumoDano } from './ui/rumodano.js';
import { initBoneco } from './ui/boneco.js';
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
import { criarTratamento } from './game/tratamento.js';

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
    // Corpo tem receita POR REGIÃO: jorro na cabeça, faísca de metal no
    // capacete, o respingo comum no resto. É o único lugar da tela em que a
    // diferença entre matar num tiro e precisar de dois aparece no quadro do
    // acerto, olhando pro alvo — o hit feed conta a mesma coisa, mas embaixo
    // da mira e em texto.
    const tipo = r.terreno
      ? 'terra'
      : (r.target && !r.target.veiculo ? fagulhaDaRegiao(r.regiao) : 'duro');
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

  /**
   * Enfermaria: a tenda de cada posto e de cada base trata quem está dentro.
   *
   * Uma instância, e ela é do JOGADOR: o que ela guarda é quantos segundos
   * fazem desde que ele levou dano, e sem isso a lona viraria escudo. O bot
   * não precisa dela — `hurtFor` já vive no corpo dele.
   *
   * `?? []` porque o campo de treino é outro mapa e não tem posto nenhum: quem
   * não declara enfermaria simplesmente não cura, sem caso especial.
   */
  const tratamento = criarTratamento(world.enfermarias ?? []);

  // Modo de jogo: doze postos, quatro bandeiras cada. Quem está de que lado
  // é do jogador; de quem é cada posto é da partida.
  const capture = createCapture(world.outposts);

  /**
   * Quem o time VIU, e por quanto tempo isso ainda vale.
   *
   * É o que faz o inimigo aparecer no radar e no mapa sem que ninguém ganhe
   * onisciência: cada contato entra porque um par de olhos do time o
   * encontrou, e apaga trinta segundos depois de o último deles perdê-lo. O
   * bot alimenta pelo cérebro (`vendo`), o jogador pela varredura logo abaixo.
   */
  const deteccao = criarDeteccao();

  // Um bot, por enquanto. Toda a mecânica dele já é a de muitos: o gerente
  // atualiza uma lista, e a lista tem um.
  const bots = createBots(scene, world, { ballistics, capture, deteccao });
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
    // A bússola precisa de POSIÇÃO e de mundo, não só de rumo: os ícones dos
    // objetivos deslizam por ela conforme o jogador anda e vira.
    updateCompass: initCompass(camera, { player, world }),
    // Radar e telêmetro leem estado que já existe: o campo de altura, os
    // postos e a lista de alvos. Nenhum dos dois guarda mundo próprio.
    updateRadar: initRadar(player, camera, world, bots, deteccao).update,

    /**
     * O mapa que o soldado abre NA MÃO.
     *
     * São duas peças: o desenho (um canvas fora do documento, com a
     * topografia, os pontos, a tropa e a rosa dos ventos) e o papel 3D que
     * vive na cena do viewmodel. Ele não é HUD: se fosse, bastaria uma tela
     * por cima do jogo — e era assim que era.
     */
    mapa: criarMapaNaMao(criarMapaDesenho({
      terrain: world.terrain, world, player, bots, deteccao
    })),
    deteccao,
    updateRangefinder: initRangefinder(player, camera, world, world.targets).update,
    updateCrosshair: initCrosshair(player, camera),
    updatePrompt: initPrompt(drops, veiculos),
    updateHitmarker: initHitmarker(alvoDoJogador, attack, ballistics),
    // Quanto de dano a sequência já causou. Mesmas fontes da marca de
    // acerto, e o mesmo filtro de dono: a balística é de todo mundo.
    updateHitFeed: initHitFeed(alvoDoJogador, attack, ballistics),
    /**
     * Levar tiro: de ONDE veio e ONDE pegou.
     *
     * Mesma lista de acertos da marca de acerto e do hit feed, com o filtro
     * INVERTIDO: ali o jogador é quem atira e o que se compara é `owner`;
     * aqui ele é quem leva, e o que se compara é `target`. A balística é de
     * todo mundo, e trocar isso enche a tela dele com a briga alheia.
     *
     * A vinheta de `#hurt` continua onde estava — ela avisa que doeu, e nunca
     * avisou de onde nem onde.
     */
    updateRumoDano: initRumoDano(alvoDoJogador, camera, ballistics),
    updateBoneco: initBoneco(alvoDoJogador, ballistics),
    killfeed,
    // Caixas de colisão e o que cada bot está pensando. Quem manda no
    // interruptor é o painel: uma tecla acende tudo junto.
    debugView,
    // O painel lê os números da trajetória, então a vista nasce antes dele.
    snapshot,
    corpo,
    debug: initDebug(player, () => debugView.shot, { renderer, scene }),

    /**
     * O painel de ajuste ao vivo, no F3.
     *
     * `aplicar` existe pelo que foi lido no BOOT: dispersão, fôlego e
     * balística releem o número toda vez que usam e mudam sozinhos, mas a
     * intensidade da luz, a exposição, a névoa e o FOV foram copiados pra
     * dentro do three uma vez e ficariam surdos ao deslizador — o painel
     * pareceria quebrado exatamente nos números que só se julgam olhando.
     */
    ajustes: initAjustes(
      { GRADE, SPREAD, BULLET, MELEE, VIEW, CAMERA, STAMINA, SWAP, PLAYER, INCLINACAO },
      {
        soltarMouse: flow.soltarMouse,
        aplicar: () => {
          renderer.toneMappingExposure = GRADE.EXPOSICAO;
          luzes.ceu.intensity = GRADE.HEMISFERICA;
          luzes.sol.intensity = GRADE.DIRECIONAL;
          luzes.ceu.groundColor.setHex(GRADE.BOUNCE);
          scene.fog.near = WORLD.FOG_NEAR;
          scene.fog.far = WORLD.FOG_FAR;
          camera.fov = CAMERA.FOV;
          camera.updateProjectionMatrix();
        }
      }
    )
  };

  // `?ajustes=1` e `?debug=1` abrem os dois painéis no desembarque. Headless
  // não tem tecla, e sem isto a única prova de que eles desenham era abrir na
  // mão — a mesma razão de `?deploy=N` existir.
  const busca = new URLSearchParams(location.search);
  if (busca.has('ajustes')) game.ajustes.alternar(true);
  if (busca.has('debug')) game.debug.alternar(true);

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

/**
 * Raio, em metros de mundo, do toque que APAGA uma marca em vez de pôr outra.
 *
 * Marcar e desmarcar são o mesmo gesto: um botão separado pra tirar seria mais
 * uma tecla pra decorar num jogo que já tem oito.
 */
const APAGA_RAIO = 55;

/** Segundos entre dois redesenhos do papel. Ver o comentário no laço. */
const MAPA_REDESENHO = 0.125;

let ateRedesenhar = 0;
let ateVarrer = 0;

const olhoDoJogador = new THREE.Vector3();
const frenteDoJogador = new THREE.Vector3();
const cegoNaVarredura = new Set();

const agoraMs = () => (typeof performance !== 'undefined' ? performance.now() : 0);

/**
 * O que o JOGADOR está vendo vira sinalização pro time dele.
 *
 * O bot sinaliza pelo cérebro; o jogador não tem cérebro de bot, então é aqui
 * que os olhos dele entram na conta. A ordem das peneiras é a mesma de
 * `avistar` (distância, cone, e só então a linha de visão), e a varredura roda
 * a 6 Hz — todo quadro seria um raycast por inimigo à vista pra alimentar um
 * dado que dura trinta segundos.
 */
function varrerParaOJogador(delta) {
  const { player, world, ballistics, deteccao } = game;

  ateVarrer -= delta;
  if (ateVarrer > 0) return;
  ateVarrer = DETECCAO.VARREDURA;
  if (!player.alive || player.spectating) return;

  camera.getWorldPosition(olhoDoJogador);
  camera.getWorldDirection(frenteDoJogador);

  // O rumo tem que ser UNITÁRIO NO PLANO: `getWorldDirection` é unitário em
  // 3D, e olhando pro chão a componente horizontal encolhe — o cone fecharia
  // sozinho, e quem olhasse pra baixo pararia de enxergar quem está na frente.
  const plano = Math.hypot(frenteDoJogador.x, frenteDoJogador.z) || 1;

  varrerCampo({
    deteccao,
    alvos: world.targets,
    time: player.team,
    x: olhoDoJogador.x,
    z: olhoDoJogador.z,
    dirX: frenteDoJogador.x / plano,
    dirZ: frenteDoJogador.z / plano,
    /**
     * O alcance de vista É o alcance da bala, e sai da MESMA constante.
     *
     * `BULLET.RANGE_MAX` é o teto de 600 m que o sistema crava em toda bala.
     * Sinalizar mais longe que isso marcaria no radar do time gente em que
     * ninguém pode atirar; menos, esconderia alvo que a arma alcança. Um
     * número próprio aqui seria a segunda fonte de verdade sobre distância, e
     * as duas se separariam no primeiro ajuste — foi exatamente esse o defeito
     * das armas que declaravam `range: Infinity`.
     */
    alcance: BULLET.RANGE_MAX,
    campo: THREE.MathUtils.degToRad(DETECCAO.CAMPO),
    temLinha: (alvo) => {
      // Alvo não barra a linha até si mesmo. Sexta vez que este invariante
      // aparece nesta base, e aqui o sintoma seria mudo: ninguém nunca
      // apareceria no radar, e nada no console diria por quê.
      cegoNaVarredura.clear();
      if (alvo.collider) cegoNaVarredura.add(alvo.collider);
      return !ballistics.blocked(olhoDoJogador, alvo.center(), cegoNaVarredura);
    }
  });
}

function frame() {
  const {
    world, player, viewmodel, drops, attack, ballistics, firearm, digging,
    watchdog, capture, bots, snapshot, killfeed, corpo, sparks, spoils, veiculos,
    paraAtualizar, mapa, deteccao
  } = game;

  // clamp evita salto gigante quando a aba volta do background
  const delta = Math.min(clock.getDelta(), 0.1);

  // A tecla é lida aqui e a foto é tirada depois do render: o canvas só tem
  // conteúdo entre uma coisa e outra.
  snapshot.poll();

  // O relógio da sinalização anda pelo DELTA, não por `performance.now()`:
  // sob tempo virtual aquele congela, e contato que não envelhece passaria
  // verde em qualquer teste.
  deteccao.avancar(delta);

  /**
   * M levanta e abaixa o mapa, e é lido ANTES do jogador.
   *
   * Ele decide se a entrada de andar vale neste quadro (`player.lendoMapa`),
   * e lido no fim do laço a decisão chegaria um quadro atrasada — o soldado
   * daria um passo depois de já estar com o papel na cara.
   */
  if (consumePress(...MAP_KEYS)) flow.alternarMapa();

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

  /**
   * Quem lê mapa está parado, com as duas mãos ocupadas.
   *
   * Dirigindo não dá: as mãos estão no volante, e o corpo não é dele. De
   * fantasma também não — ele não tem mapa nem corpo pra segurar um.
   */
  player.lendoMapa = flow.mapaAberto && !dirigindo && !player.spectating;

  // O ponteiro SOLTO esconde a mira e devolve o cursor do navegador: com o
  // mapa aberto o jogador aponta pra folha, e duas miras na tela — o cursor
  // e a cruz do HUD — são uma a mais.
  document.body.classList.toggle('lendo-mapa', player.lendoMapa);

  /**
   * Lendo o mapa, `isLocked` é FALSO de propósito, e mesmo assim o jogador
   * atualiza.
   *
   * O mapa solta o ponteiro, e a condição de sempre (`isLocked`) desligaria
   * gravidade, piso e colisão junto — quem abrisse o mapa no meio de um pulo
   * ficaria pendurado no ar. Só a ENTRADA é cortada, e quem corta é
   * `locomotion.js`.
   */
  if ((player.isLocked || player.lendoMapa) && !dirigindo) {
    player.update(delta);
    if (!player.spectating) viewmodel.update(delta, player);
  }

  // Espectador não larga item, não golpeia e não atira: ele não está no jogo.
  // E quem está no VOLANTE tem as duas mãos ocupadas — passageiro atira.
  // Com o mapa aberto as mãos estão no papel: não se atira, não se golpeia,
  // não se cava e não se apanha nada do chão. É a mesma regra do volante,
  // pela mesma razão — e é o que faz abrir o mapa custar alguma coisa.
  const maosLivres = (!dirigindo || !player.vehicle.lugar.def.dirige)
    && !player.lendoMapa;
  if (!player.spectating) {
    if (!dirigindo && !player.lendoMapa) drops.update(delta);
    if (maosLivres) {
      attack.update(delta);
      firearm.update(delta);
    }
    if (!dirigindo && !player.lendoMapa) digging.update(delta);
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

  /**
   * O mapa de papel: sobe, desce, e enquanto está na mão é redesenhado.
   *
   * Redesenhar não é de graça — são 590 mil pixels de canvas por chamada —,
   * então ele acontece a 8 Hz e não a 60. Nada no papel muda mais rápido que
   * isso: tropa anda a 5 m/s e uma bandeira leva trinta segundos.
   */
  const mapaGuardado = mapa.animar(delta, player.lendoMapa);
  if (!mapaGuardado) {
    viewmodel.segurarMapa(mapa);

    ateRedesenhar -= delta;
    if (ateRedesenhar <= 0) {
      ateRedesenhar = MAPA_REDESENHO;
      mapa.redesenhar(agoraMs());
    }

    /**
     * Apontar e clicar: o mapa aberto solta o ponteiro.
     *
     * O papel não é uma tela — é um objeto na frente do rosto —, então o que
     * responde não é um `click` num canvas e sim um raio pelo CURSOR, contra a
     * malha do papel. `mousePosition` só vale com o ponteiro solto, e é
     * exatamente esse o caso aqui.
     *
     * E marcar não é instantâneo: a mão direita larga a borda, carimba o lugar
     * e volta. A marca entra no papel no quadro em que ela ENCOSTA — mesma
     * ideia do golpe e da pazada.
     */
    if (player.lendoMapa && !mapa.carimbando && consumeClick()) {
      const cursor = mousePosition();
      const ponto = mapa.sobPonteiro(
        (cursor.x / innerWidth) * 2 - 1,
        -(cursor.y / innerHeight) * 2 + 1,
        viewmodel.camera
      );
      const alvo = ponto ? mapa.desenho.mundoDe(ponto.u, ponto.v) : null;
      // Fora da ilha o dedo não faz nada: marca no mar aberto aponta pra um
      // lugar aonde ele não pode ir.
      if (alvo && dentroDoMapa(alvo.x, alvo.z)) {
        mapa.carimbar(ponto.u, ponto.v, () => {
          alternarMarcacao(alvo.x, alvo.z, APAGA_RAIO);
          // Redesenho no quadro seguinte: a marca tem que aparecer junto com
          // o carimbo, e não no próximo refresco de oito em oito quadros.
          ateRedesenhar = 0;
        });
      }
    }
  }

  varrerParaOJogador(delta);

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
  // A câmera decide quem fica com modelo de arma: o LOD é do OLHO, não do
  // mundo. Bot a cem metros com a MP40 completa é trinta e duas malhas pra
  // desenhar uns poucos pixels.
  bots.update(delta, camera.position);

  // tecla de teste enquanto nada causa dano de verdade ao jogador
  // F3 é lido no laço pelo mesmo motivo que o M: tecla de jogo é do laço, e
  // ele tem que responder com o painel já aberto pra poder fechar.
  game.ajustes.update();

  if (player.isLocked && !player.spectating && consumePress('KeyK')) {
    if (player.damage(player.maxHealth)) flow.playerDied();
  }

  // Mirar aproxima a vista. O viewmodel tem câmera própria, então a arma na
  // mão não estica junto — é só o mundo que chega mais perto.
  // Correr abre o campo; mirar fecha. O termo da corrida é apagado pela mira
  // pra que os dois não briguem no quadro em que a arma sobe.
  const wantedFov = THREE.MathUtils.lerp(CAMERA.FOV, CAMERA.ADS_FOV, player.gun.aim)
    + VIEW.SPRINT_FOV * player.viewSprint * (1 - player.gun.aim);
  if (Math.abs(camera.fov - wantedFov) > 0.01) {
    camera.fov = wantedFov;
    camera.updateProjectionMatrix();
  }
  document.body.classList.toggle('aiming', player.gun.aim > 0.5);
  // `paraAtualizar`, nunca `world.targets`: bot já foi atualizado por
  // `bots.update` neste quadro, e atualizá-lo de novo apaga a passada.
  for (const target of paraAtualizar) target.update(delta);

  corpo.update(delta);
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

    /**
     * E a tenda trata quem entra nela.
     *
     * Dois lugares e duas contas de propósito: o paiol é um toque de três
     * segundos a 24 m do mastro, a tenda é um abrigo de oito segundos a 3,4 m
     * da lona. Reabastecer não pode disputar com capturar a mesma laje;
     * curar-se TEM que custar sair da linha de tiro.
     *
     * Sem aviso na tela, como o suprimento: a barra de vida subindo já conta
     * o que está acontecendo, e o HUD não inventa mensagem.
     */
    game.tratamento.atender(delta, {
      x: p.x, z: p.z, teamId: player.team, alvo: player
    });
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
  game.updateRadar();
  game.updateRangefinder();
  game.updateCrosshair();
  game.updatePrompt();
  game.updateHitmarker(delta);
  game.updateHitFeed(delta);
  game.updateRumoDano(delta);
  game.updateBoneco(delta);
  killfeed.update(delta);
  game.updateObjective();
  game.updateFlagPrompt();
  watchdog.update();

  renderer.render(scene, camera);
  // Entre um render e outro: `renderer.info` se zera a cada `render`, e o
  // próximo é o do viewmodel — uma arma numa cena vazia. O que o painel do
  // F2 mostra é o custo do MUNDO.
  game.debug.amostrarRender();
  viewmodel.render(renderer);

  // Depois do render, antes do fim do quadro: `preserveDrawingBuffer` é
  // false, e fora desta janela `toDataURL` devolve uma imagem preta.
  snapshot.afterRender();

  endFrame(); // o que ninguém consumiu neste frame não vale no próximo
}
