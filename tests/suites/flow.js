import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { initFlow, PHASE } from '../../src/ui/flow.js';
import { initStatus } from '../../src/ui/status.js';
import { CLASSES, KNIFE, PISTOL } from '../../src/items/classes.js';
import { PLAYER } from '../../src/config.js';
import { suite, ok, eq, near, note } from '../assert.js';

/** Monta o DOM que flow.js e status.js esperam encontrar. */
function mountScreens() {
  const holder = document.createElement('div');
  holder.style.display = 'none';
  holder.innerHTML = `
    <div id="hud-layer"><canvas id="compass"></canvas>
      <div id="mission"></div><div id="vitals"></div>
      <div id="equipped"></div><div id="prompt"></div></div>

    <div id="start-screen" class="screen"><button id="enter-map"></button></div>

    <div id="deploy-screen" class="screen hidden">
      <h1 id="deploy-title"></h1>
      <div id="class-grid"></div><div id="class-detail"></div>
      <canvas id="tactical-map"></canvas>
      <div id="zone-label"></div>
      <button id="deploy"></button><button id="keep-spectating"></button>
    </div>

    <div id="pause-screen" class="screen hidden">
      <p id="pause-hint"></p>
      <div id="hud-options"><input type="checkbox" id="fullscreen-toggle"></div>
      <button id="open-deploy"></button>
    </div>`;
  document.body.appendChild(holder);
  return holder;
}

const terreno = { heightAt: () => 4, waterDepthAt: () => 0 };

export function run() {
  const holder = mountScreens();

  const player = new Player(new THREE.PerspectiveCamera(70, 1, 0.1, 400), document.body, {
    colliders: [], terrain: terreno, spawn: new THREE.Vector3(0, 0, 0)
  });

  // pointer lock não existe em headless: controls falso, mesmos eventos
  const listeners = {};
  const controls = {
    isLocked: false,
    lock() { this.isLocked = true; (listeners.lock ?? []).forEach((f) => f()); },
    unlock() { this.isLocked = false; (listeners.unlock ?? []).forEach((f) => f()); },
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); }
  };

  const world = {
    terrain: terreno,
    spawnZones: [
      { id: 'a', name: 'Base Norte', x: 0, z: -90, radius: 16 },
      { id: 'b', name: 'Praia leste', x: 120, z: 0, radius: 14 }
    ]
  };

  let deploys = 0;
  let espectadas = 0;
  const flow = initFlow({
    controls,
    player,
    world,
    onDeploy(classDef, zone) {
      deploys++;
      player.spawn.set(zone.x, 0, zone.z);
      player.setClass(classDef);
      player.respawn();
    },
    onSpectate() {
      espectadas++;
      const p = player.object.position;
      player.spectateFrom(p.x, terreno.heightAt() + 28, p.z);
    }
  });
  document.getElementById('fullscreen-toggle').checked = false;

  const updateStatus = initStatus(player);
  const visivel = (id) => !document.getElementById(id).classList.contains('hidden');
  const clicar = (id) => document.getElementById(id).click();

  suite('entrar no mapa é entrar como observador');

  eq('começa na tela de abertura', flow.phase, PHASE.START);
  eq('e ela é a única visível', visivel('start-screen'), true);
  eq('nada de deploy ainda', visivel('deploy-screen'), false);

  clicar('enter-map');
  eq('entrar leva pra observação, não pro jogo', flow.phase, PHASE.SPECTATING);
  eq('o jogador vira fantasma', player.spectating, true);
  eq('e não está vivo', player.alive, false);
  eq('nenhuma tela na frente', visivel('start-screen') || visivel('deploy-screen'), false);
  eq('e o HUD do jogo aparece', document.body.classList.contains('screen-open'), false);
  eq('o mouse fica travado pra poder voar', controls.isLocked, true);
  eq('onSpectate foi chamado uma vez', espectadas, 1);

  suite('fantasma voa livre');

  const antes = player.object.position.clone();
  player.object.position.set(0, 60, 0);
  player.eyeY = 60;
  player.update(1 / 60);
  eq('não é puxado pra baixo por gravidade', player.onGround, false);
  ok('e continua no ar', player.eyeY > 50, `${player.eyeY.toFixed(1)} m`);
  eq('o estado diz observando', player.state, 'espectando');
  eq('não nada nem se molha', player.swimming, false);
  note('altura inicial', `${antes.y.toFixed(0)} m acima do terreno`);

  suite('escolher equipamento e onde desembarcar');

  controls.unlock();
  eq('ESC observando mostra a pausa', visivel('pause-screen'), true);
  clicar('open-deploy');
  eq('e dali chega no deploy', flow.phase, PHASE.DEPLOY);
  eq('com a tela de deploy visível', visivel('deploy-screen'), true);
  eq('e o HUD escondido atrás dela',
    document.body.classList.contains('screen-open'), true);
  eq('sem o mouse travado, pra poder clicar no mapa', controls.isLocked, false);

  const botao = document.getElementById('deploy');
  eq('desembarcar começa bloqueado sem local', botao.disabled, true);
  clicar('deploy');
  eq('e clicar nele não faz nada', deploys, 0);

  suite('desembarcar');

  const zona = world.spawnZones[1];
  flow.selectZone(zona);
  eq('escolher o ponto libera o botão', botao.disabled, false);
  eq('e o rótulo mostra qual é',
    document.getElementById('zone-label').textContent, zona.name);

  clicar('deploy');
  eq('desembarcar leva ao jogo', flow.phase, PHASE.PLAYING);
  eq('e chama onDeploy uma vez', deploys, 1);
  eq('nasce na zona escolhida', Math.round(player.object.position.x), zona.x);
  eq('e sai do modo fantasma', player.spectating, false);
  eq('vivo', player.alive, true);
  eq('com a vida cheia', player.health, player.maxHealth);
  eq('e com o equipamento da classe', player.equipped?.id, PISTOL.id);
  ok('a faca vem junto', player.carried.includes(KNIFE));
  near('assenta na altura do terreno', player.eyeY, 4 + PLAYER.HEIGHT, 0.01);

  suite('morrer devolve pra escolha, não pro início');

  // simula o que o laço faz quando a vida zera
  const matou = player.damage(player.maxHealth);
  eq('o dano mata', matou, true);
  eq('e o jogador deixa de estar vivo', player.alive, false);

  flow.playerDied();
  eq('volta pro deploy', flow.phase, PHASE.DEPLOY);
  eq('com a tela aberta', visivel('deploy-screen'), true);
  eq('nunca pela tela de abertura', visivel('start-screen'), false);
  eq('e observando enquanto decide', player.spectating, true);
  eq('o título avisa que caiu', document.getElementById('deploy-title').textContent, 'Você caiu');

  suite('observador não é atingido');

  const vidaAntes = player.health;
  eq('dano em fantasma não mata', player.damage(999), false);
  eq('nem tira vida', player.health, vidaAntes);

  suite('voltar a só observar');

  clicar('keep-spectating');
  eq('dá pra desistir e continuar observando', flow.phase, PHASE.SPECTATING);
  eq('sem desembarcar de novo', deploys, 1);
  eq('e sem tela na frente', visivel('deploy-screen'), false);

  updateStatus();
  holder.remove();
}
