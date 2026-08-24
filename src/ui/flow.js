import { CLASSES, DEFAULT_CLASS_ID, getClass } from '../items/classes.js';
import { readPreference, writePreference, grabKeyboard, releaseKeyboard } from './session.js';
import { initTacticalMap } from './tacticalmap.js';
import { buildCard, buildDetail } from './classcards.js';

/**
 * Estados do jogo e as telas que os separam.
 *
 *   inicio      -> tela de abertura, ninguém está no mapa
 *   espectando  -> fantasma voando; vê a partida sem participar
 *   deploy      -> escolhe classe e onde nascer, sobre o mapa tático
 *   jogando     -> no mapa, vivo
 *
 * Entrar no jogo é sempre o mesmo caminho: espectar primeiro, escolher
 * loadout e local depois. Morrer devolve pra deploy, não pro início — quem
 * morreu continua na partida, só precisa decidir onde voltar.
 *
 * Só duas transições travam o mouse (espectando e jogando); todas as telas o
 * liberam. Isso fica num lugar só de propósito: espalhar lock/unlock pelas
 * telas foi o que tornou o fluxo antigo difícil de mexer.
 */

export const PHASE = {
  START: 'inicio',
  SPECTATING: 'espectando',
  DEPLOY: 'deploy',
  PLAYING: 'jogando'
};

export function initFlow({ controls, player, world, onDeploy, onSpectate }) {
  const screens = {
    start: document.getElementById('start-screen'),
    deploy: document.getElementById('deploy-screen'),
    pause: document.getElementById('pause-screen')
  };

  const startButton = document.getElementById('enter-map');
  const grid = document.getElementById('class-grid');
  const detail = document.getElementById('class-detail');
  const deployButton = document.getElementById('deploy');
  const spectateButton = document.getElementById('keep-spectating');
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

  const cards = new Map();
  for (const classDef of CLASSES) {
    const card = buildCard(classDef);
    card.addEventListener('click', () => selectClass(classDef));
    grid.appendChild(card);
    cards.set(classDef.id, card);
  }

  const tactical = initTacticalMap(world.terrain, world.spawnZones, selectZone);

  /**
   * Escolhe o ponto de desembarque. Exposto porque o mapa não é o único
   * caminho: dá pra chegar aqui por código, e é o que torna o fluxo
   * inteiro testável sem depender de clique num canvas com tamanho.
   */
  function selectZone(zone) {
    selectedZone = zone;
    tactical?.select(zone);
    refreshDeployButton();
  }

  function selectClass(classDef) {
    if (!classDef.available) return;
    selectedClass = classDef;
    for (const [id, card] of cards) card.classList.toggle('selected', id === classDef.id);
    detail.replaceChildren(buildDetail(classDef));
    refreshDeployButton();
  }

  function refreshDeployButton() {
    const ready = Boolean(selectedClass?.available && selectedZone);
    deployButton.disabled = !ready;
    zoneLabel.textContent = selectedZone
      ? selectedZone.name
      : 'Escolha um ponto no mapa';
    zoneLabel.classList.toggle('pending', !selectedZone);
  }

  function show(name) {
    for (const [key, element] of Object.entries(screens)) {
      element.classList.toggle('hidden', key !== name);
    }
    // o HUD do jogo não pode vazar por trás de uma tela
    document.body.classList.toggle('screen-open', Boolean(name));
  }

  function lockPointer() {
    controls.lock();   // síncrono: consome o clique antes da tela cheia
    if (toggle.checked) grabKeyboard();
  }

  // ------------------------------------------------------------ transições

  function enterSpectator() {
    phase = PHASE.SPECTATING;
    document.body.classList.add('playing');
    document.body.classList.add('spectating');
    onSpectate();
    show(null);
    lockPointer();
  }

  function openDeployScreen() {
    phase = PHASE.DEPLOY;
    deployTitle.textContent = died ? 'Você caiu' : 'Preparar';
    refreshDeployButton();
    show('deploy');
    if (controls.isLocked) controls.unlock();
  }

  function deploy() {
    if (!selectedZone || !selectedClass?.available) return;
    phase = PHASE.PLAYING;
    died = false;
    document.body.classList.remove('spectating');
    onDeploy(selectedClass, selectedZone);
    show(null);
    lockPointer();
  }

  function backToSpectating() {
    phase = PHASE.SPECTATING;
    document.body.classList.add('spectating');
    onSpectate();
    show(null);
    lockPointer();
  }

  // ------------------------------------------------------------- ligações

  startButton.addEventListener('click', enterSpectator);
  deployButton.addEventListener('click', deploy);
  spectateButton.addEventListener('click', backToSpectating);
  openDeploy.addEventListener('click', (event) => {
    event.stopPropagation();
    openDeployScreen();
  });

  toggle.checked = readPreference(true);
  toggle.addEventListener('change', () => writePreference(toggle.checked));
  options.addEventListener('click', (event) => event.stopPropagation());

  // clicar na pausa volta pro que estava acontecendo antes
  screens.pause.addEventListener('click', lockPointer);

  controls.addEventListener('lock', () => show(null));

  controls.addEventListener('unlock', () => {
    releaseKeyboard();
    // a tela de deploy tira o mouse por conta própria; não vira pausa
    if (phase === PHASE.DEPLOY) return;

    resumeHint.textContent = phase === PHASE.SPECTATING
      ? 'Espectando'
      : `${selectedClass.name} · ${selectedClass.role}`;
    show('pause');
  });

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
      document.body.classList.add('spectating');
      onSpectate();
      openDeployScreen();
    },

    openDeployScreen,
    selectZone,

    get selectedZone() {
      return selectedZone;
    }
  };
}
