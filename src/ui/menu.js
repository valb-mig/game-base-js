import { CLASSES, DEFAULT_CLASS_ID, getClass } from '../items/classes.js';
import { readPreference, writePreference, grabKeyboard, releaseKeyboard } from './session.js';

function buildCard(classDef) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'class-card';
  card.disabled = !classDef.available;
  card.style.setProperty('--class-color', classDef.color);

  if (!classDef.available) card.classList.add('locked');

  const role = document.createElement('span');
  role.className = 'class-role';
  role.textContent = classDef.role;

  const name = document.createElement('span');
  name.className = 'class-name';
  name.textContent = classDef.name;

  const note = document.createElement('span');
  note.className = 'class-note';
  note.textContent = classDef.available ? classDef.summary : 'Em breve';

  card.append(role, name, note);
  return card;
}

function buildDetail(classDef) {
  const fragment = document.createDocumentFragment();

  const head = document.createElement('div');
  head.className = 'detail-head';
  head.style.setProperty('--class-color', classDef.color);
  head.textContent = `${classDef.name} · ${classDef.health} de vida`;

  const description = document.createElement('p');
  description.textContent = classDef.description;

  const list = document.createElement('dl');
  list.className = 'detail-loadout';

  for (const item of classDef.loadout) {
    const slot = document.createElement('dt');
    slot.textContent = item.slot;

    const value = document.createElement('dd');
    value.textContent = item.name;
    if (item.note) {
      const note = document.createElement('span');
      note.textContent = item.note;
      value.appendChild(note);
    }

    list.append(slot, value);
  }

  fragment.append(head, description, list);
  return fragment;
}

/**
 * Telas fora do jogo: seleção de classe e a tela de deploy (que também é a
 * pausa do ESC).
 *
 * Fluxo: escolhe classe -> entra no mapa. ESC volta pra tela de deploy, que
 * reentra sem mexer na classe; trocar de classe é um caminho explícito, pra
 * ninguém perder o equipamento sem querer.
 */
export function initMenu(controls, onDeploy) {
  const screen = document.getElementById('class-select');
  const grid = document.getElementById('class-grid');
  const detail = document.getElementById('class-detail');
  const deployButton = document.getElementById('deploy');

  const hud = document.getElementById('hud');
  const hudClass = document.getElementById('hud-class');
  const options = document.getElementById('hud-options');
  const toggle = document.getElementById('fullscreen-toggle');
  const changeButton = document.getElementById('change-class');

  const cards = new Map();
  let selected = getClass(DEFAULT_CLASS_ID);

  for (const classDef of CLASSES) {
    const card = buildCard(classDef);
    card.addEventListener('click', () => select(classDef));
    grid.appendChild(card);
    cards.set(classDef.id, card);
  }

  function select(classDef) {
    selected = classDef;
    for (const [id, card] of cards) {
      card.classList.toggle('selected', id === classDef.id);
    }
    detail.replaceChildren(buildDetail(classDef));
  }

  function lockPointer() {
    controls.lock(); // síncrono: consome o clique antes da tela cheia
    if (toggle.checked) grabKeyboard();
  }

  function deploy() {
    onDeploy(selected);
    hudClass.textContent = `${selected.name} · ${selected.role}`;
    document.body.classList.add('playing');
    lockPointer();
  }

  select(selected);
  toggle.checked = readPreference(true);
  toggle.addEventListener('change', () => writePreference(toggle.checked));

  deployButton.addEventListener('click', deploy);

  // reentrar pela tela de pausa não remexe na classe nem na vida
  hud.addEventListener('click', lockPointer);

  // qualquer controle dentro do HUD precisa escapar do clique que trava o mouse
  options.addEventListener('click', (event) => event.stopPropagation());
  changeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    hud.classList.add('hidden');
    screen.classList.remove('hidden');
  });

  controls.addEventListener('lock', () => {
    hud.classList.add('hidden');
    screen.classList.add('hidden');
  });

  controls.addEventListener('unlock', () => {
    hud.classList.remove('hidden');
    screen.classList.add('hidden');
    releaseKeyboard();
  });
}
