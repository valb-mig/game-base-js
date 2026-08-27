import { WORLD, JOGO } from '../config.js';
import { CLASSES, DEFAULT_CLASS_ID, getClass } from '../items/classes.js';
import { readGuest, grabKeyboard, releaseKeyboard } from './session.js';
import { spawnableFor } from '../game/teams.js';
import { initTacticalMap } from './tacticalmap.js';
import { initDeployList } from './deploylist.js';
import { buildCard, buildLoadout } from './classcards.js';

/**
 * Estados do jogo e as telas que os separam.
 *
 *   inicio   -> marca e botão Jogar; o mapa ainda não existe
 *   deploy   -> barra de equipamento em cima, mapa tático embaixo
 *   jogando  -> no mapa, vivo
 *
 * O mundo nasce no primeiro Jogar, não na carga da página: construir ilha,
 * floresta e bases pra mostrar uma tela de título é conta que ninguém pediu.
 * `boot()` faz isso uma vez e devolve o que o fluxo precisa daí em diante.
 *
 * Entre o deploy e o mapa o jogador é fantasma: ele precisa estar em algum
 * lugar enquanto escolhe, e é o que dá fundo vivo pra tela. Morrer devolve
 * pro deploy, nunca pro início — quem morreu continua na partida.
 *
 * Só duas transições travam o mouse (jogar e voltar da pausa); todas as telas
 * o liberam. Isso fica num lugar só de propósito: espalhar lock/unlock pelas
 * telas foi o que tornou o fluxo antigo difícil de mexer.
 */

export const PHASE = {
  START: 'inicio',
  DEPLOY: 'deploy',
  PLAYING: 'jogando'
};

export function initFlow({ boot, onTraining = null, onDeploy, onSpectate }) {
  const screens = {
    start: document.getElementById('start-screen'),
    deploy: document.getElementById('deploy-screen'),
    pause: document.getElementById('pause-screen'),
    mapa: document.getElementById('map-screen')
  };

  const playButton = document.getElementById('play');
  const trainingButton = document.getElementById('training');
  const optionsScreen = document.getElementById('options-screen');
  const optionsOpen = document.getElementById('open-options');
  const optionsClose = document.getElementById('close-options');
  const grid = document.getElementById('class-grid');
  const detail = document.getElementById('class-detail');
  const deployButton = document.getElementById('deploy');
  const backButton = document.getElementById('deploy-back');
  const zoneLabel = document.getElementById('zone-label');
  const deployTitle = document.getElementById('deploy-title');

  const resumeHint = document.getElementById('pause-hint');
  const openDeploy = document.getElementById('open-deploy');

  let phase = PHASE.START;
  let selectedClass = getClass(DEFAULT_CLASS_ID);
  let selectedZone = null;
  let died = false;
  let deployed = false;   // já esteve no mapa? decide se dá pra voltar

  // Só existe depois do primeiro Jogar: é o mundo e o jogador.
  let game = null;
  let tactical = null;
  let lista = null;

  const cards = new Map();
  for (const classDef of CLASSES) {
    const card = buildCard(classDef);
    card.addEventListener('click', () => selectClass(classDef));
    grid.appendChild(card);
    cards.set(classDef.id, card);
  }

  /**
   * Escolhe o ponto de desembarque. Exposto porque o mapa não é o único
   * caminho: dá pra chegar aqui por código, e é o que torna o fluxo
   * inteiro testável sem depender de clique num canvas com tamanho.
   */
  /**
   * Zona serve pra este jogador AGORA?
   *
   * Zona sem posto atrás não tem o que disputar — é a base principal, que é
   * sempre do dono dela, ou um ponto solto. Só quem tem posto passa pela
   * regra de captura.
   */
  function zonaVale(zone) {
    if (!zone) return true;
    const time = game?.player?.team;
    if (!zone.post) return !zone.team || !time || zone.team === time;
    return spawnableFor(zone.post, time);
  }

  function selectZone(zone) {
    // Posto perdido ou em disputa não é porta de entrada: escolher um seria
    // nascer em cima de quem está capturando.
    if (zone && !zonaVale(zone)) return false;
    selectedZone = zone;
    tactical?.select(zone);
    lista?.select(zone);
    refreshDeployButton();
    return true;
  }

  function selectClass(classDef) {
    if (!classDef.available) return;
    selectedClass = classDef;
    for (const [id, card] of cards) card.classList.toggle('selected', id === classDef.id);
    detail.replaceChildren(buildLoadout(classDef));
    refreshDeployButton();
  }

  function refreshDeployButton() {
    // Um posto pode virar inválido enquanto a tela está aberta — é o que
    // acontece quando o inimigo começa a arriar bandeira lá.
    if (selectedZone && !zonaVale(selectedZone)) selectedZone = null;

    const ready = Boolean(selectedClass?.available && selectedZone);
    deployButton.disabled = !ready;
    zoneLabel.textContent = selectedZone
      ? selectedZone.name
      : 'Escolha um ponto no mapa';
    zoneLabel.classList.toggle('pending', !selectedZone);
    backButton.classList.toggle('hidden', !deployed);
  }

  function show(name) {
    // Opções é sobreposição da abertura, não fase: sair da abertura por
    // qualquer caminho a fecha junto, senão ela sobra por cima do mapa.
    optionsScreen.classList.add('hidden');
    for (const [key, element] of Object.entries(screens)) {
      element.classList.toggle('hidden', key !== name);
    }
    // o HUD do jogo não pode vazar por trás de uma tela
    document.body.classList.toggle('screen-open', Boolean(name));
  }

  function lockPointer() {
    // Pedido direto no elemento, e não pelo lock() do three: ele joga fora a
    // promessa do requestPointerLock, e a recusa — sem gesto do usuário, ou
    // logo depois de um unlock — virava rejeição não tratada no console.
    // Continua síncrono, que é o que consome o clique antes da tela cheia.
    const element = game.controls.domElement;
    if (element?.requestPointerLock) {
      Promise.resolve(element.requestPointerLock()).catch(() => {});
    } else {
      game.controls.lock();
    }
    // Só trava as teclas reservadas se o jogador já estiver em tela cheia por
    // conta própria (F11). O jogo não pede tela cheia: o padrão é janela.
    grabKeyboard();
  }

  // ------------------------------------------------------------ transições

  /**
   * Campo de treinamento: entra direto, sem passar pelo deploy.
   *
   * Não é uma zona de desembarque a mais. Escolher classe e local pra ir
   * treinar mira seria burocracia entre o jogador e o que ele quer fazer —
   * e o treino tem regra própria (munição infinita, armas no chão).
   */
  function startTraining() {
    // Mapa diferente, e o mundo é montado uma vez só: se a batalha já foi
    // montada, trocar de modo é recarregar a página com o modo na URL. É
    // honesto e simples — desmontar mundo, bots e sistemas pra trocar seria
    // superfície de bug num caminho que se usa uma vez por sessão.
    if (game && game.world.modo !== 'treino') {
      location.search = '?treino=1';
      return;
    }
    montar('treino');
    phase = PHASE.PLAYING;
    died = false;
    deployed = true;
    document.body.classList.add('playing');
    document.body.classList.remove('spectating');
    onTraining?.();
    show(null);
    lockPointer();
  }

  /** Constrói o mundo (uma vez) e liga o que depende dele. */
  function montar(modo = 'batalha') {
    if (!game) {
      game = boot(modo);
      // O mapa tático sai do terreno, então só pode ser montado com mundo.
      tactical = initTacticalMap(game.world.terrain, game.world.spawnZones, selectZone,
        { team: game.player.team, valid: zonaVale });
      // Mesmas zonas, mesma regra de validade: a lista e o mapa não podem
      // discordar sobre onde dá pra nascer.
      lista = initDeployList(game.world.spawnZones, game.world.outposts, selectZone,
        { team: game.player.team, valid: zonaVale });
      if (selectedZone) {
        tactical.select(selectedZone);
        lista?.select(selectedZone);
      }

      game.controls.addEventListener('lock', () => show(null));
      game.controls.addEventListener('unlock', onUnlock);
    }
  }

  function start() {
    montar();
    document.body.classList.add('playing');
    openDeployScreen();
  }

  function openDeployScreen() {
    phase = PHASE.DEPLOY;
    deployTitle.textContent = died ? 'Você caiu' : 'Preparar';

    // Fantasma sobre o mapa só quando o jogador não está lá: antes do
    // primeiro desembarque e depois de morrer. Quem abriu a tela vivo continua
    // parado onde estava, e é isso que permite voltar sem renascer.
    if (!deployed || died) {
      document.body.classList.add('spectating');
      onSpectate();
    }

    // O mundo andou enquanto o jogador estava no mapa: postos trocaram de dono
    // e alguns entraram em disputa. Redesenhar na abertura é o que impede a
    // lista de mostrar a partida de dois minutos atrás.
    lista?.redraw();
    tactical?.redraw();
    refreshDeployButton();
    show('deploy');
    if (game.controls.isLocked) game.controls.unlock();
  }

  function deploy() {
    if (!selectedZone || !selectedClass?.available) return;
    phase = PHASE.PLAYING;
    died = false;
    deployed = true;
    document.body.classList.remove('spectating');
    onDeploy(selectedClass, selectedZone);
    show(null);
    lockPointer();
  }

  /**
   * Desiste do deploy e volta pro mapa, do jeito que estava.
   *
   * Não passa por onDeploy: renascer é o que o botão Desembarcar faz. Aqui o
   * jogador é o mesmo, no mesmo lugar e com a mesma vida.
   */
  function backToGame() {
    if (!deployed || died) return;
    mapaAberto = false;
    phase = PHASE.PLAYING;
    show(null);
    lockPointer();
  }

  /**
   * O mapa grande de M.
   *
   * Ele solta o mouse porque marcar ponto é clicar, e quem tranca e destranca
   * o ponteiro é este arquivo e só ele. `abrindoMapa` existe pra que o
   * `unlock` que ele mesmo provoca não vire tela de pausa três linhas abaixo.
   *
   * Não é pausa: o jogo continua correndo atrás, e é isso que faz abrir o
   * mapa no meio de um tiroteio ser uma decisão em vez de um botão grátis.
   */
  /**
   * Quem solta o mouse DE PROPÓSITO se anota aqui.
   *
   * O mapa foi o primeiro caso e tinha dois flags só pra ele; o painel de
   * ajustes é o segundo, e um segundo par de flags seriam dois jeitos de
   * dizer a mesma coisa — com a chance de o terceiro esquecer um deles e
   * abrir a pausa por baixo. Enquanto o conjunto não estiver vazio, `unlock`
   * não é pausa, e fechar o último devolve o ponteiro pro jogo.
   */
  const soltos = new Set();

  function soltarMouse(razao, solto) {
    if (solto) {
      soltos.add(razao);
      if (game?.controls?.isLocked) game.controls.unlock();
    } else {
      soltos.delete(razao);
      if (!soltos.size && phase === PHASE.PLAYING) lockPointer();
    }
    return solto;
  }

  let mapaAberto = false;

  function alternarMapa() {
    if (phase !== PHASE.PLAYING) return false;

    mapaAberto = !mapaAberto;
    soltarMouse('mapa', mapaAberto);
    show(mapaAberto ? 'mapa' : null);
    return mapaAberto;
  }

  function onUnlock() {
    releaseKeyboard();
    // a tela de deploy tira o mouse por conta própria; não vira pausa
    if (phase === PHASE.DEPLOY) return;
    // nem o mapa, nem o painel de ajustes: eles soltam o mouse de propósito
    if (soltos.size) return;

    resumeHint.textContent = `${selectedClass.name} · ${selectedClass.role}`;
    show('pause');
  }

  // ------------------------------------------------------------- ligações

  playButton.addEventListener('click', start);
  trainingButton?.addEventListener('click', startTraining);
  optionsOpen?.addEventListener('click', () => optionsScreen.classList.remove('hidden'));
  optionsClose?.addEventListener('click', () => optionsScreen.classList.add('hidden'));
  deployButton.addEventListener('click', deploy);
  backButton.addEventListener('click', backToGame);
  openDeploy.addEventListener('click', (event) => {
    event.stopPropagation();
    openDeployScreen();
  });

  // clicar na pausa volta pro que estava acontecendo antes
  screens.pause.addEventListener('click', () => lockPointer());

  // qual mapa é: o dado é do mundo, não da tela
  document.getElementById('map-name').textContent =
    `${WORLD.MAP_NAME} · ${WORLD.MAP_ERA}`;

  // Quem joga e qual build. Os dois saem de dado que existe: o apelido de
  // convidado da sessão e a versão em config. Nada de nível nem de contador
  // de servidor — número inventado na abertura é a mesma mentira que um
  // contador de munição sem munição.
  document.getElementById('guest-name').textContent = readGuest();
  document.getElementById('game-version').textContent = `Versão ${JOGO.VERSAO}`;

  selectClass(selectedClass);
  refreshDeployButton();
  show('start');

  return {
    /** M abre e fecha. Devolve se ficou aberto. */
    alternarMapa,
    get mapaAberto() {
      return mapaAberto;
    },

    /**
     * Solta e devolve o ponteiro sem passar pela pausa. Quem abre uma
     * ferramenta em jogo (o painel de ajustes) chama isto.
     */
    soltarMouse,
    get phase() {
      return phase;
    },

    /** Chamado quando o jogador morre: volta pra escolha de classe e local. */
    playerDied() {
      if (phase !== PHASE.PLAYING) return;
      died = true;
      openDeployScreen();
    },

    openDeployScreen,
    selectZone,
    startTraining,

    /**
     * Entra no mapa por código: Jogar, escolher zona e desembarcar de uma vez.
     *
     * Existe pra verificação. Sem isto, o quadro com o jogador VIVO só era
     * exercitado por clique humano — e foi assim que um `digging.update` sem
     * dono passou: a página abria limpa, e o laço só estourava depois do
     * desembarque, todo quadro, congelando o jogo como fantasma.
     */
    enterMap(index = 0) {
      if (!game) start();
      // Só as que valem pra este jogador: entrar por código tem que passar
      // pela mesma regra do clique, senão o teste prova outra coisa.
      const zonas = game.world.spawnZones.filter(zonaVale);
      selectZone(zonas[((index % zonas.length) + zonas.length) % zonas.length]);
      deploy();
    },

    get selectedZone() {
      return selectedZone;
    }
  };
}
