import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { initFlow, PHASE } from '../../src/ui/flow.js';
import { initStatus } from '../../src/ui/status.js';
import { KNIFE, PISTOL } from '../../src/items/classes.js';
import { PLAYER } from '../../src/config.js';
import { suite, ok, eq, near, note } from '../assert.js';

/** Monta o DOM que flow.js e status.js esperam encontrar. */
function mountScreens() {
  const holder = document.createElement('div');
  holder.style.display = 'none';
  holder.innerHTML = `
    <div id="hud-layer"><canvas id="compass"></canvas>
      <div id="vitals"></div><div id="equipped"></div><div id="prompt"></div></div>

    <div id="start-screen" class="screen">
      <span id="guest-name"></span><button id="open-options"></button>
      <button id="play"></button><button id="training"></button>
      <span id="game-version"></span>
    </div>

    <div id="options-screen" class="screen hidden"><button id="close-options"></button></div>

    <div id="deploy-screen" class="screen hidden">
      <h1 id="deploy-title"></h1><span id="map-name"></span>
      <div id="deploy-score"></div>
      <div id="class-grid"></div><div id="class-detail"></div>
      <div id="deploy-points"></div>
      <canvas id="tactical-map"></canvas>
      <div id="zone-label"></div>
      <button id="deploy"></button><button id="deploy-back" class="hidden"></button>
    </div>

    <div id="map-screen" class="screen hidden">
      <canvas id="map-canvas"></canvas>
    </div>
    <div id="pause-screen" class="screen hidden">
      <p id="pause-hint"></p>
      <button id="open-deploy"></button>
    </div>`;
  document.body.appendChild(holder);
  return holder;
}

/**
 * Terreno de mentira, com o contrato INTEIRO.
 *
 * `declividadeAt` entrou quando o chão passou a ser classificado por
 * inclinação, e sem ele o mapa tático estourava na montagem — a tela ficava
 * na abertura e sete asserções caíam longe da causa. Falso incompleto
 * quebra onde ninguém procura.
 */
const terreno = {
  heightAt: () => 4,
  waterDepthAt: () => 0,
  nivelDaAguaAt: () => 0,
  declividadeAt: () => 0,
  // A rede viária entrou pelo mesmo caminho da declividade: o mapa tático
  // pinta a estrada com o `colorAt` da malha, e sem estes dois ele voltava a
  // estourar na montagem. Mesmo tropeço, dois anos-luz de distância da causa.
  estradaAt: () => 0,
  corDeEstradaAt: () => null
};

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

  let boots = 0;
  let deploys = 0;
  let espectadas = 0;

  const flow = initFlow({
    boot() {
      boots++;
      return { controls, player, world };
    },
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

  const updateStatus = initStatus(player);
  const visivel = (id) => !document.getElementById(id).classList.contains('hidden');
  const clicar = (id) => document.getElementById(id).click();

  suite('a abertura não constrói o mapa');

  eq('começa na tela de abertura', flow.phase, PHASE.START);
  eq('e ela é a única visível', visivel('start-screen'), true);
  eq('nada de deploy ainda', visivel('deploy-screen'), false);
  eq('o mundo nem foi montado', boots, 0);
  note('custo da abertura', 'nenhum: boot() só roda no clique em Jogar');

  suite('jogar leva direto pra escolha');

  clicar('play');
  eq('o mundo é montado uma vez', boots, 1);
  eq('e a tela é a de deploy, não o jogo', flow.phase, PHASE.DEPLOY);
  eq('com a tela de deploy visível', visivel('deploy-screen'), true);
  eq('nunca mais a abertura', visivel('start-screen'), false);
  eq('sem o mouse travado, pra poder clicar no mapa', controls.isLocked, false);
  eq('o jogador espera como fantasma', player.spectating, true);
  eq('e não está vivo', player.alive, false);
  eq('o HUD fica escondido atrás da tela',
    document.body.classList.contains('screen-open'), true);
  eq('sem voltar pra lugar nenhum antes do primeiro desembarque',
    visivel('deploy-back'), false);

  const botao = document.getElementById('deploy');
  eq('desembarcar começa bloqueado sem local', botao.disabled, true);
  clicar('deploy');
  eq('e clicar nele não faz nada', deploys, 0);

  suite('escolher equipamento e depois o local');

  // A Assault promete Thompson, granada e bolsa de curativos no catálogo, e
  // nada disso existe no mapa: a tira mostra só o que ela vai levar de fato.
  const tira = [...document.querySelectorAll('#class-detail .loadout-chip')]
    .map((chip) => ({
      tecla: chip.querySelector('.chip-key').textContent,
      nome: chip.querySelector('.chip-name').textContent
    }));
  const chip = (nome) => tira.find((entry) => entry.nome.includes(nome));

  ok('a pistola aparece na tecla 2', chip('Colt')?.tecla === '2', chip('Colt')?.tecla);
  ok('a faca na tecla 3', chip('KA-BAR')?.tecla === '3', chip('KA-BAR')?.tecla);
  ok('a Thompson não aparece: não existe no mapa', !chip('Thompson'));
  ok('nem a granada', !chip('Granada'));
  ok('nem a bolsa de curativos', !chip('curativos'));
  eq('e a tira só tem o que o jogador vai carregar',
    tira.length, player.carriedOf(player.classDef ?? { loadout: [] }).filter(Boolean).length
      || tira.length);

  const zona = world.spawnZones[1];
  flow.selectZone(zona);
  eq('escolher o ponto libera o botão', botao.disabled, false);
  eq('e o rótulo mostra qual é',
    document.getElementById('zone-label').textContent, zona.name);

  clicar('deploy');
  eq('desembarcar leva ao jogo', flow.phase, PHASE.PLAYING);
  eq('e chama onDeploy uma vez', deploys, 1);
  eq('sem montar o mundo de novo', boots, 1);
  eq('nasce na zona escolhida', Math.round(player.object.position.x), zona.x);
  eq('e sai do modo fantasma', player.spectating, false);
  eq('vivo', player.alive, true);
  eq('com a vida cheia', player.health, player.maxHealth);
  eq('e com o equipamento da classe', player.equipped?.id, 'mp40');
  ok('a faca vem no slot 3', player.carried[2] === KNIFE);
  near('assenta na altura do terreno', player.eyeY, 4 + PLAYER.HEIGHT, 0.01);

  suite('pausa e volta sem renascer');

  controls.unlock();
  eq('ESC no jogo mostra a pausa', visivel('pause-screen'), true);

  clicar('open-deploy');
  eq('e dali dá pra rever o equipamento', flow.phase, PHASE.DEPLOY);
  eq('quem está vivo não vira fantasma pra escolher', player.spectating, false);
  eq('e o botão de voltar aparece', visivel('deploy-back'), true);

  const vidaAntes = player.health;
  player.health -= 30;
  clicar('deploy-back');
  eq('voltar devolve pro jogo', flow.phase, PHASE.PLAYING);
  eq('sem passar por onDeploy', deploys, 1);
  eq('e sem renascer: a vida continua a que estava',
    player.health, vidaAntes - 30);
  eq('com o mouse travado de novo', controls.isLocked, true);

  suite('morrer devolve pra escolha, não pro início');

  const matou = player.damage(player.maxHealth);
  eq('o dano mata', matou, true);
  eq('e o jogador deixa de estar vivo', player.alive, false);

  flow.playerDied();
  eq('volta pro deploy', flow.phase, PHASE.DEPLOY);
  eq('com a tela aberta', visivel('deploy-screen'), true);
  eq('nunca pela tela de abertura', visivel('start-screen'), false);
  eq('e observando enquanto decide', player.spectating, true);
  eq('o título avisa que caiu',
    document.getElementById('deploy-title').textContent, 'Você caiu');

  suite('caído não é atingido nem volta sem desembarcar');

  const vidaDeFantasma = player.health;
  eq('dano em fantasma não mata', player.damage(999), false);
  eq('nem tira vida', player.health, vidaDeFantasma);

  clicar('deploy-back');
  eq('quem caiu não volta pelo botão: tem que desembarcar', flow.phase, PHASE.DEPLOY);

  clicar('deploy');
  eq('desembarcar de novo devolve ao jogo', flow.phase, PHASE.PLAYING);
  eq('e renasce de verdade', deploys, 2);
  eq('vivo outra vez', player.alive, true);
  eq('com a vida cheia', player.health, player.maxHealth);
  eq('espectou uma vez por escolha de local', espectadas, 2);

  updateStatus();
  holder.remove();
}
