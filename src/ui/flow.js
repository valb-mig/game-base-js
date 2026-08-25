import { WORLD } from '../config.js';
import { CLASSES, DEFAULT_CLASS_ID, getClass } from '../items/classes.js';
import { readPreference, writePreference, grabKeyboard, releaseKeyboard } from './session.js';
import { spawnableFor } from '../game/teams.js';
import { initTacticalMap } from './tacticalmap.js';
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

export function initFlow({ boot, onDeploy, onSpectate }) {
  const screens = {
    start: document.getElementById('start-screen'),
    deploy: document.getElementById('deploy-screen'),
    pause: document.getElementById('pause-screen')
  };

  const playButton = document.getElementById('play');
  const grid = document.getElementById('class-grid');
  const detail = document.getElementById('class-detail');
  const deployButton = document.getElementById('deploy');
  const backButton = document.getElementById('deploy-back');
  const zoneLabel = document.getElementById('zone-label');
  const deployTitle = document.getElementById('deploy-title');

  const toggle = document.getElementById('fullscreen-toggle');
  const options = document.getElementById('hud-options');
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
    if (toggle.checked) grabKeyboard();
  }

  // ------------------------------------------------------------ transições

  /** Constrói o mundo (uma vez) e liga o que depende dele. */
  function start() {
    if (!game) {
      game = boot();
      // O mapa tático sai do terreno, então só pode ser montado com mundo.
      tactical = initTacticalMap(game.world.terrain, game.world.spawnZones, selectZone,
        { team: game.player.team, valid: zonaVale });
      if (selectedZone) tactical.select(selectedZone);

      game.controls.addEventListener('lock', () => show(null));
      game.controls.addEventListener('unlock', onUnlock);
    }
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
    phase = PHASE.PLAYING;
    show(null);
    lockPointer();
  }

  function onUnlock() {
    releaseKeyboard();
    // a tela de deploy tira o mouse por conta própria; não vira pausa
    if (phase === PHASE.DEPLOY) return;

    resumeHint.textContent = `${selectedClass.name} · ${selectedClass.role}`;
    show('pause');
  }

  // ------------------------------------------------------------- ligações

  playButton.addEventListener('click', start);
  deployButton.addEventListener('click', deploy);
  backButton.addEventListener('click', backToGame);
  openDeploy.addEventListener('click', (event) => {
    event.stopPropagation();
    openDeployScreen();
  });

  toggle.checked = readPreference(true);
  toggle.addEventListener('change', () => writePreference(toggle.checked));
  options.addEventListener('click', (event) => event.stopPropagation());

  // clicar na pausa volta pro que estava acontecendo antes
  screens.pause.addEventListener('click', () => lockPointer());

  // qual mapa é: o dado é do mundo, não da tela
  document.getElementById('map-name').textContent =
    `${WORLD.MAP_NAME} · ${WORLD.MAP_ERA}`;

  selectClass(selectedClass);
  refreshDeployButton();
  show('start');

  return {
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
