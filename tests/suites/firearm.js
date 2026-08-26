import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { initFirearm, spreadFactor } from '../../src/items/firearm.js';
import { SPREAD, BULLET } from '../../src/config.js';
import { createBallistics } from '../../src/items/ballistics.js';
import { createDummy } from '../../src/world/dummy.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { CLASSES, PISTOL, KNIFE, SLOT_ORDER, getClass } from '../../src/items/classes.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;
const chao = { heightAt: () => 0, waterDepthAt: () => 0, nivelDaAguaAt: () => 0 };

/**
 * Põe o item na mão e ESPERA a troca terminar.
 *
 * Trocar de item leva tempo desde que guardar e sacar viraram animação: ler
 * `equipped` no mesmo quadro do `selectSlot` lê o item ANTIGO, porque a troca
 * acontece no fundo do movimento.
 */
function empunhar(player, indice) {
  player.selectSlot(indice);
  for (let i = 0; i < 600 && player.swapping; i++) player.advanceSwap(1 / 60);
  return player.equipped;
}

export function run() {
  initInput();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  const scene = new THREE.Scene();
  const colliders = [];

  const player = new Player(camera, document.body, {
    colliders, terrain: chao, spawn: new THREE.Vector3(0, 0, 0)
  });
  player.controls.isLocked = true;

  const alvo = createDummy(scene, colliders, { x: 0, z: -14, ground: 0, name: 'alvo' });
  const world = { targets: [alvo] };
  const ballistics = createBallistics(scene, colliders);
  const gun = initFirearm(player, world, ballistics);

  const tiros = [];
  const acertos = [];
  gun.onShot((r) => tiros.push(r));
  ballistics.onHit((r) => acertos.push(r));

  const clicar = () => {
    dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
  };
  const segurarDireito = (down) => dispatchEvent(
    new MouseEvent(down ? 'mousedown' : 'mouseup', { button: 2 }));
  const tecla = (code) => {
    dispatchEvent(new KeyboardEvent('keydown', { code }));
    dispatchEvent(new KeyboardEvent('keyup', { code }));
  };
  const passo = (n = 1) => {
    for (let i = 0; i < n; i++) {
      gun.update(DT);
      ballistics.update(DT, world.targets, null);
      for (const t of world.targets) t.update(DT);
      endFrame();
    }
  };
  const reporAlvo = () => {
    alvo.health = alvo.maxHealth;
    alvo.alive = true;
    alvo.collider.box.max.y = 2;
  };

  suite('a pistola é só da Assault');

  const comPistola = CLASSES.filter((c) => c.loadout.includes(PISTOL));
  eq('uma classe só carrega a M1911A1', comPistola.length, 1);
  eq('e é a Assault', comPistola[0].id, 'assault');
  eq('sete no carregador mais uma na câmara', PISTOL.ammo.loaded, PISTOL.firearm.magazine + 1);

  suite('automática segura o gatilho, semiautomática não');

  // A MP40 é a primeira arma do jogo que dispara segurando. A Colt tem que
  // continuar sendo um tiro por clique: sem isso, segurar o botão viraria
  // metralhadora e a cadência dela deixaria de significar alguma coisa.
  player.setClass(getClass('assault'));
  const segurarEsquerdo = (down) => dispatchEvent(
    new MouseEvent(down ? 'mousedown' : 'mouseup', { button: 0 }));

  const rajada = (id, quadros) => {
    empunhar(player, player.carried.findIndex((item) => item?.id === id));
    player.equipped.ammo.loaded = player.equipped.firearm.magazine;
    player.gun.cooldown = 0;
    tiros.length = 0;
    segurarEsquerdo(true);
    passo(quadros);
    segurarEsquerdo(false);
    passo(1);
    return tiros.length;
  };

  const daMP40 = rajada('mp40', 40);
  ok('segurando o gatilho, a MP40 despeja rajada', daMP40 > 3, `${daMP40} tiros`);
  note('cadência', `${daMP40} tiros em 40 quadros` +
    ` (intervalo ${getClass('assault').loadout.find((i) => i.id === 'mp40').firearm.fireInterval}s)`);

  const daColt = rajada('m1911', 40);
  eq('segurando o gatilho, a Colt dá um tiro só', daColt, 1);

  // E o carregador acaba: automática sem fim de munição é cheat.
  empunhar(player, player.carried.findIndex((item) => item?.id === 'mp40'));
  player.equipped.ammo.loaded = 3;
  player.gun.cooldown = 0;
  tiros.length = 0;
  segurarEsquerdo(true);
  passo(120);
  segurarEsquerdo(false);
  passo(1);
  eq('a rajada para quando o carregador esvazia', tiros.length, 3);
  ok('e ela já entrou em recarga sozinha', player.gun.reloading > 0);

  // Deixa a munição como encontrou: `ammo` é objeto de módulo, compartilhado
  // entre as suítes, e carregador vazio aqui quebrava as seguintes.
  player.gun.reloading = 0;
  player.gun.cooldown = 0;
  for (const item of player.carried) {
    if (item?.firearm) item.ammo.loaded = item.firearm.magazine;
  }
  // E os registradores: eles são cumulativos, e a rajada deixaria tiros
  // contados a mais pra quem vier depois.
  passo(20);          // deixa o que está no ar chegar antes de zerar
  tiros.length = 0;
  acertos.length = 0;
  reporAlvo();        // a rajada derrubou o boneco que as próximas usam

  suite('inventário e troca');

  player.setClass(getClass('assault'));
  eq('um slot de mão por tecla', player.carried.length, SLOT_ORDER.length);
  eq('a MP40 é o slot 1', player.carried[0]?.id, 'mp40');
  eq('a pistola é o slot 2', player.carried[1], PISTOL);
  eq('a faca é o slot 3', player.carried[2], KNIFE);
  ok('e a mão começa no primeiro slot que existe', player.equipped?.id === 'mp40');

  // Slot vazio continua tendo que ser inerte. A Assault não tem mais nenhum,
  // então o vazio é montado de propósito — a regra é do inventário, não da
  // classe que hoje por acaso leva tudo.
  const guardada = player.carried[0];
  player.carried[0] = null;
  eq('tecla no slot vazio não faz nada', player.selectSlot(0), false);
  player.carried[0] = guardada;

  const indicePistola = player.carried.indexOf(PISTOL);
  empunhar(player, indicePistola);
  eq('dá pra empunhar a pistola', player.equipped.id, PISTOL.id);
  empunhar(player, player.carried.indexOf(KNIFE));
  eq('e voltar pra faca', player.equipped.id, KNIFE.id);
  empunhar(player, indicePistola);

  suite('tiro e munição');

  PISTOL.ammo.loaded = PISTOL.firearm.magazine + 1;
  PISTOL.ammo.reserve = 21;
  // Explícito: desde que a MP40 existe, `setClass` põe a PRIMÁRIA na mão, e
  // este trecho é sobre a cadência da pistola.
  empunhar(player, player.carried.indexOf(PISTOL));
  player.object.position.set(0, 1.25, 0);
  camera.quaternion.setFromEuler(new THREE.Euler(0, 0, 0, 'YXZ'));   // mirando o alvo

  const carga = PISTOL.ammo.loaded;
  clicar(); passo(1);
  eq('um clique gasta uma bala', PISTOL.ammo.loaded, carga - 1);
  eq('e sai um tiro', tiros.length, 1);
  // a bala viaja: 14 m a 253 m/s levam ~4 quadros
  eq('sem tempo de voo, ainda não acertou', acertos.length, 0);
  passo(8);
  ok('e depois do voo acerta o alvo a 14 m',
    acertos.at(-1)?.target === alvo, `${acertos.at(-1)?.amount} de dano`);

  clicar(); passo(1);
  eq('clicar antes do intervalo não dispara', PISTOL.ammo.loaded, carga - 1);

  passo(Math.ceil(PISTOL.firearm.fireInterval / DT) + 2);
  clicar(); passo(1);
  eq('depois do intervalo dispara de novo', PISTOL.ammo.loaded, carga - 2);

  suite('recarga');

  reporAlvo();
  PISTOL.ammo.loaded = 2;
  PISTOL.ammo.reserve = 21;
  tecla('KeyR'); passo(1);
  ok('R começa a recarga', player.gun.reloading > 0);

  clicar(); passo(2);
  eq('não dá pra atirar recarregando', PISTOL.ammo.loaded, 2);

  passo(Math.ceil(PISTOL.firearm.reloadTime / DT) + 4);
  eq('a recarga completa o carregador', PISTOL.ammo.loaded, PISTOL.firearm.magazine + 1);
  eq('e tira do que estava guardado', PISTOL.ammo.reserve, 21 - 6);
  note('capacidade', `${PISTOL.firearm.magazine} + 1 na câmara`);

  PISTOL.ammo.loaded = 0;
  PISTOL.ammo.reserve = 7;
  clicar(); passo(2);
  ok('clicar com o carregador vazio já recarrega', player.gun.reloading > 0);
  passo(Math.ceil(PISTOL.firearm.reloadTime / DT) + 4);
  eq('e sem nada na câmara entram sete', PISTOL.ammo.loaded, PISTOL.firearm.magazine);

  // Trocar de arma no meio da recarga deixava a arma TRAVADA na pose de
  // recarregar quando ela voltava pra mão: `selectSlot` cancelava
  // `reloading` e esquecia `reloadProgress`, e o viewmodel anima pelo
  // PROGRESSO. Com ele parado em 0,4 a arma ficava de lado pra sempre, e só
  // recarregar de novo — que leva o progresso até o fim — desentortava.
  suite('trocar de arma no meio da recarga não trava a pose');

  empunhar(player, player.carried.findIndex((item) => item?.id === 'm1911'));
  PISTOL.ammo.loaded = 2;
  PISTOL.ammo.reserve = 21;
  tecla('KeyR'); passo(Math.ceil(PISTOL.firearm.reloadTime * 0.4 / DT));
  ok('a recarga está no meio', player.gun.reloadProgress > 0.2,
    player.gun.reloadProgress.toFixed(2));

  empunhar(player, player.carried.findIndex((item) => item?.id === 'kabar'));
  passo(2);
  eq('trocar pra faca cancela a recarga', player.gun.reloading, 0);
  eq('e zera o progresso, senão a pose congela',
    player.gun.reloadProgress, 0);

  empunhar(player, player.carried.findIndex((item) => item?.id === 'm1911'));
  passo(2);
  eq('a arma volta pra mão sem pose de recarga pendurada',
    player.gun.reloadProgress, 0);

  PISTOL.ammo.loaded = PISTOL.firearm.magazine + 1;
  PISTOL.ammo.reserve = 21;

  suite('mira de ferro');

  eq('em repouso a arma está no quadril', player.gun.aim, 0);
  segurarDireito(true);
  passo(Math.ceil(PISTOL.firearm.adsTime / DT) * 3);
  ok('segurar o botão direito leva a arma ao olho', player.gun.aim > 0.9,
    player.gun.aim.toFixed(2));

  segurarDireito(false);
  passo(Math.ceil(PISTOL.firearm.adsTime / DT) * 3);
  ok('soltar desce a arma', player.gun.aim < 0.1, player.gun.aim.toFixed(2));

  ok('mirar fecha a abertura do tiro',
    PISTOL.firearm.adsSpread < PISTOL.firearm.hipSpread,
    `${PISTOL.firearm.adsSpread}° contra ${PISTOL.firearm.hipSpread}° do quadril`);

  suite('a dispersão é do corpo, não só da arma');

  // A regra do jogo: parado a bala vai exatamente onde a mira aponta, e
  // acertar vira mérito de quem parou pra atirar — a decisão mais cara do
  // tiroteio, porque parado você é alvo fácil.
  const corpo = { onGround: true, running: false, speed: 0 };
  eq('parado não tem dispersão nenhuma', spreadFactor(corpo), 0);

  corpo.speed = 5;
  eq('andando, a abertura é a que a arma declara', spreadFactor(corpo), SPREAD.ANDANDO);

  corpo.running = true;
  corpo.speed = 8.4;
  ok('correndo é muito pior que andando',
    spreadFactor(corpo) > SPREAD.ANDANDO * 3, `${spreadFactor(corpo)}×`);

  corpo.onGround = false;
  ok('e no ar é o pior de todos',
    spreadFactor(corpo) > spreadFactor({ onGround: true, running: true, speed: 8.4 }),
    `${spreadFactor(corpo)}× contra ${SPREAD.CORRENDO}× correndo`);

  // No ar ganha de tudo porque quem pula correndo está no ar.
  eq('pular parado também conta como no ar',
    spreadFactor({ onGround: false, running: false, speed: 0 }), SPREAD.NO_AR);

  // Um tranco de centésimos com a mão fora do teclado não pode tirar o
  // jogador do estado "parado": a velocidade do quadro oscila sozinha.
  eq('velocidade de sobra não tira o jogador de parado',
    spreadFactor({ onGround: true, running: false, speed: SPREAD.PARADO_ATE - 0.01 }), 0);

  suite('a bala respeita o que está na frente');

  reporAlvo();
  PISTOL.ammo.loaded = 8;
  const parede = {
    box: new THREE.Box3(new THREE.Vector3(-3, 0, -7.1), new THREE.Vector3(3, 4, -6.9)),
    standable: false
  };
  colliders.push(parede);

  const antes = alvo.health;
  passo(Math.ceil(PISTOL.firearm.fireInterval / DT) + 2);
  clicar(); passo(10);
  eq('parede no caminho segura o tiro', alvo.health, antes);

  colliders.pop();
  passo(Math.ceil(PISTOL.firearm.fireInterval / DT) + 2);
  clicar(); passo(10);
  ok('tirando a parede, acerta', alvo.health < antes);

  suite('a bala do jogador cai; a do bot, não');

  // A queda é mecânica do JOGADOR: ele mira sem atraso e a depuração desenha
  // o arco pra ele aprender. Só a do bot vai reta, porque a mira dele já erra
  // de propósito e somar queda a isso é um segundo erro ilegível.
  empunhar(player, player.carried.findIndex((item) => item?.id === 'm1911'));
  PISTOL.ammo.loaded = 8;
  passo(Math.ceil(PISTOL.firearm.fireInterval / DT) + 2);
  clicar(); passo(1);
  const doJogador = ballistics.bullets[ballistics.bullets.length - 1];
  eq('a bala do jogador cai por GRAVITY', doJogador.gravity, BULLET.GRAVITY);
  ok('e é queda de verdade', BULLET.GRAVITY > 0, `${BULLET.GRAVITY} m/s²`);
  eq('a do bot vai reta', BULLET.BOT_GRAVITY, 0);

  suite('faca na mão não atira');

  empunhar(player, player.carried.indexOf(KNIFE));
  const municao = PISTOL.ammo.loaded;
  clicar(); passo(2);
  eq('sem arma de fogo, o clique não gasta bala', PISTOL.ammo.loaded, municao);
  eq('e a mira não sobe', player.gun.aim, 0);

  player.controls.isLocked = false;
}
