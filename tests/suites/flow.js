import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { initMenu } from '../../src/ui/menu.js';
import { initStatus } from '../../src/ui/status.js';
import { CLASSES, KNIFE } from '../../src/items/classes.js';
import { PLAYER } from '../../src/config.js';
import { suite, ok, eq, near, note } from '../assert.js';

/** Monta o DOM que menu.js e status.js esperam encontrar. */
function mountScreens() {
  const holder = document.createElement('div');
  holder.style.display = 'none';
  holder.innerHTML = `
    <div id="hud-layer"><canvas id="compass"></canvas>
      <div id="mission"></div><div id="vitals"></div><div id="equipped"></div></div>
    <div id="class-select"><div id="class-grid"></div><div id="class-detail"></div>
      <button id="deploy"></button></div>
    <div id="hud" class="hidden"><p id="hud-class"></p>
      <div id="hud-options"><input type="checkbox" id="fullscreen-toggle"></div>
      <button id="change-class"></button></div>`;
  document.body.appendChild(holder);
}

export function run() {
  mountScreens();

  const player = new Player(new THREE.PerspectiveCamera(70, 1, 0.1, 400), document.body, { colliders: [] });

  // pointer lock não existe em headless: controls falso, mesmos eventos
  const listeners = {};
  const controls = {
    isLocked: false,
    lock() { this.isLocked = true; (listeners.lock ?? []).forEach((f) => f()); },
    unlock() { this.isLocked = false; (listeners.unlock ?? []).forEach((f) => f()); },
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); }
  };

  const updateStatus = initStatus(player);
  let deploys = 0;
  initMenu(controls, (classDef) => {
    deploys++;
    player.setClass(classDef);
    player.respawn();
  });
  document.getElementById('fullscreen-toggle').checked = false; // sem tela cheia no teste

  const screen = document.getElementById('class-select');
  const hud = document.getElementById('hud');
  const visible = (element) => !element.classList.contains('hidden');
  const cards = [...document.querySelectorAll('.class-card')];

  suite('seleção de classe');

  eq('uma carta por classe', cards.length, CLASSES.length);
  eq('só a Assault é jogável', cards.filter((card) => card.disabled).length, CLASSES.length - 1);
  eq('começa na seleção de classe', visible(screen), true);
  eq('tela de deploy começa escondida', visible(hud), false);

  cards[1].click();
  eq('clicar numa classe bloqueada não muda a seleção',
    cards.findIndex((card) => card.classList.contains('selected')), 0);

  document.getElementById('deploy').click();
  eq('entrar aplica a classe', player.classDef.id, 'assault');
  eq('entra com a vida cheia', player.health, player.maxHealth);
  ok('as duas telas somem ao entrar', !visible(screen) && !visible(hud));

  suite('pausa e troca de classe');

  player.health = 42;
  controls.unlock();
  ok('ESC mostra a tela de deploy, não a de classe', visible(hud) && !visible(screen));

  hud.click();
  eq('voltar pelo HUD não respawna', player.health, 42);
  eq('voltar pelo HUD não redeploya', deploys, 1);

  controls.unlock();
  document.getElementById('change-class').click();
  ok('trocar classe volta pra seleção', visible(screen) && !visible(hud));
  document.getElementById('deploy').click();
  eq('novo deploy respawna', player.health, player.maxHealth);
  eq('novo deploy conta como deploy', deploys, 2);

  suite('atributos vindos da classe');

  const testClass = {
    id: 'teste', name: 'Teste', role: 'x', color: '#fff', available: true,
    health: 75, movement: { RUN_SPEED: 12, JUMP_SPEED: 11 }, loadout: [KNIFE]
  };
  player.setClass(testClass);
  eq('classe sobrescreve o que declara', player.stats.RUN_SPEED, 12);
  eq('e o que não declara herda do config', player.stats.WALK_SPEED, PLAYER.WALK_SPEED);
  eq('vida vem da classe', player.maxHealth, 75);

  suite('a faca é comum a todas as classes');

  const knives = CLASSES.map((entry) => entry.loadout.find((item) => item.id === 'kabar'));
  eq('todas as classes carregam a faca', knives.filter(Boolean).length, CLASSES.length);
  eq('é o mesmo objeto, não cópias', new Set(knives).size, 1);
  eq('é o item empunhado', player.equipped?.id, KNIFE.id);

  updateStatus();
  const equipped = document.getElementById('equipped');
  const vitals = document.getElementById('vitals');
  ok('HUD mostra o item empunhado',
    equipped.textContent.includes(KNIFE.name), KNIFE.name);
  ok('sem munição, o contador vira rótulo do slot',
    equipped.querySelector('.item-count').classList.contains('is-label'));
  ok('vida aparece nos vitais', vitals.textContent.includes(`${player.health}`));
}
