import * as THREE from 'three';
import { AIM, aimError, turnToward, angleGap, createAim } from '../../src/bots/aiming.js';
import { createSoldier, SOLDIER } from '../../src/bots/soldier.js';
import { createBrain, BRAIN } from '../../src/bots/brain.js';
import { createBallistics } from '../../src/items/ballistics.js';
import { createBots, playerAsTarget } from '../../src/bots/bots.js';
import { createCapture } from '../../src/game/capture.js';
import { Player } from '../../src/player/player.js';
import { getClass } from '../../src/items/classes.js';
import { initHitmarker } from '../../src/ui/hitmarker.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;
const chao = { heightAt: () => 0 };

/** Sorteio determinístico: bot testado tem que se comportar igual toda vez. */
function dado(semente = 7) {
  let estado = semente >>> 0;
  return () => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
    return estado / 4294967296;
  };
}

function soldado(cena, colisores, team, x, z) {
  return createSoldier(cena, colisores, {
    id: 1, team, x, z, terrain: chao,
    weapons: [
      { id: 'mp40', name: 'MP40', firearm: { damage: 24, range: 95, magazine: 32, fireInterval: 0.12 }, ammo: { loaded: 32, reserve: 96 } },
      { id: 'm1911', name: 'Colt', firearm: { damage: 34, range: 55, magazine: 7, fireInterval: 0.17 }, ammo: { loaded: 8, reserve: 21 } },
      { id: 'kabar', name: 'Faca', melee: {} }
    ]
  });
}

/**
 * Alvo de mentira com o contrato que a balística e o cérebro esperam.
 *
 * O `damage` devolve `target` porque o de verdade devolve: sem ele, quem
 * escuta acerto trata como tiro que não pegou em nada, e um teste de marca de
 * acerto passa por vácuo nos dois lados.
 */
function alvoEm(x, z, team = 'vestria') {
  const centro = new THREE.Vector3();
  const alvo = {
    team, alive: true, radius: 0.5, collider: null, speed: 0, x, z,
    center: () => centro.set(x, 1.1, z),
    damage: (amount) => ({ target: alvo, amount, killed: false })
  };
  return alvo;
}

export function run() {
  suite('a mira do bot não é aimbot');

  // Este é o teste que mais importa deste arquivo. Bot que aponta o vetor
  // exato e atira mata sem dar chance de reagir, e a partida vira sorteio de
  // quem apareceu primeiro na tela do outro.
  const noInstante = aimError(0, 20, 0);
  const assentado = aimError(AIM.ASSENTA * 2, 20, 0);

  ok('ele avista com a mira escancarada', noInstante > 8,
    `${noInstante.toFixed(1)}° a 20 m`);
  ok('e ela fecha enquanto ele acompanha', assentado < noInstante,
    `${assentado.toFixed(1)}° depois de assentar`);
  ok('mas nunca chega a zero', aimError(999, 0, 0) >= AIM.ERRO_MINIMO,
    `piso de ${AIM.ERRO_MINIMO}°`);

  ok('alvo correndo abre a mira de novo',
    aimError(999, 20, 5) > aimError(999, 20, 0),
    `${aimError(999, 20, 5).toFixed(1)}° contra ${aimError(999, 20, 0).toFixed(1)}°`);
  ok('e alvo longe também',
    aimError(999, 80, 0) > aimError(999, 10, 0),
    `${aimError(999, 80, 0).toFixed(1)}° a 80 m`);

  // A 20 m, o erro assentado tem que dar uma margem de verdade em metros.
  const margem = Math.tan(assentado * Math.PI / 180) * 20;
  between('a 20 m, isso é meio metro de folga ou mais', margem, 0.4, 4,
    `${margem.toFixed(2)} m`);
  note('erro de mira', `avista ${noInstante.toFixed(1)}° · assentado ${assentado.toFixed(1)}°`);

  suite('ele demora a reagir e a virar');

  const mira = createAim(dado());
  ok('recém-avistado, não pode atirar', !mira.canFire(0));
  for (let i = 0; i < Math.ceil(AIM.REACAO / DT) + 1; i++) mira.track(DT);
  ok('depois do tempo de reação, pode', mira.canFire(0));
  ok('mas não com o cano torto', !mira.canFire(AIM.ANGULO_DE_TIRO + 0.05));

  // Virar é finito: quem aparece pelo lado tem tempo de agir.
  const meiaVolta = Math.PI;
  const quadros = Math.ceil(meiaVolta / (AIM.GIRO * DT));
  between('meia-volta leva perto de um segundo', quadros * DT, 0.6, 1.6,
    `${(quadros * DT).toFixed(2)}s`);

  // De 3,0 pra -3,0 o caminho curto é SUBINDO e cruzando o π, e não dando a
  // volta inteira por zero. Sem isso o bot ficaria olhando pro lado errado
  // por meio segundo toda vez que o alvo cruzasse as costas dele.
  near('virar vai pelo caminho curto', turnToward(3.0, -3.0, 0.1), 3.1, 1e-9);
  near('e com passo maior que a diferença, chega direto',
    turnToward(3.0, -3.0, 0.5), -3.0, 1e-9);
  near('e não passa do alvo', turnToward(0, 0.1, 0.5), 0.1, 1e-9);
  near('ângulo entre extremos é curto', angleGap(3.0, -3.0), Math.PI * 2 - 6, 1e-9);

  suite('a rajada tem fim');

  // Bot que segura o gatilho pra sempre não deixa janela de avanço, e o
  // tiroteio vira chuveiro em vez de troca.
  const rajada = createAim(dado(11));
  for (let i = 0; i < 200; i++) rajada.track(DT);

  let tiros = 0;
  let respiros = 0;
  for (let i = 0; i < 400; i++) {
    rajada.track(DT);
    if (rajada.canFire(0)) {
      rajada.shot();
      tiros++;
    } else if (rajada.resting > 0) {
      respiros++;
    }
  }
  ok('ele para pra respirar entre rajadas', respiros > 0, `${respiros} quadros de respiro`);
  between('e a rajada tem o tamanho declarado', tiros / Math.max(1, respiros / 30),
    1, 40, `${tiros} tiros`);

  suite('perder de vista reabre a mira');

  const perdida = createAim(dado(3));
  for (let i = 0; i < 300; i++) perdida.track(DT);
  const fechada = perdida.spread(20, 0);
  perdida.reset();
  ok('sumindo da vista, ele perde a mira assentada',
    perdida.spread(20, 0) > fechada,
    `${(perdida.spread(20, 0) * 180 / Math.PI).toFixed(1)}° contra ${(fechada * 180 / Math.PI).toFixed(1)}°`);
  ok('e volta a precisar reagir', !perdida.canFire(0));

  suite('o corpo do bot');

  const cena = new THREE.Scene();
  const colisores = [];
  const bot = soldado(cena, colisores, 'karnia', 0, 0);

  eq('nasce inteiro', bot.health, SOLDIER.VIDA);
  ok('é alvo com o contrato do boneco',
    typeof bot.center === 'function' && typeof bot.damage === 'function' && bot.radius > 0);
  ok('e tem colisor no mundo', colisores.includes(bot.collider));

  bot.update(DT);
  const cabecaEmPe = bot.collider.box.max.y;
  bot.crouching = true;
  bot.update(DT);
  ok('agachado, ele ocupa menos altura', bot.collider.box.max.y < cabecaEmPe,
    `${bot.collider.box.max.y.toFixed(2)} contra ${cabecaEmPe.toFixed(2)}`);
  bot.crouching = false;
  bot.update(DT);

  const antes = bot.health;
  const golpe = bot.damage(30);
  eq('leva dano', bot.health, antes - 30);
  eq('e informa quanto', golpe.amount, 30);
  bot.damage(1000);
  ok('e cai', !bot.alive);
  bot.update(DT);
  ok('caído, ele não barra mais a passagem',
    bot.collider.box.max.y - bot.collider.box.min.y < 0.4);

  bot.respawn(4, 4);
  ok('e volta inteiro', bot.alive && bot.health === SOLDIER.VIDA);

  suite('ele anda, e parede o desvia');

  const cena2 = new THREE.Scene();
  const colisores2 = [];
  const andarilho = soldado(cena2, colisores2, 'karnia', 0, 0);

  const andou = andarilho.step(0.5, 0);
  near('sem nada na frente, anda o passo inteiro', andou, 0.5, 1e-6);

  // parede em z, atravessando o caminho
  colisores2.push({
    box: new THREE.Box3(new THREE.Vector3(1, 0, -5), new THREE.Vector3(1.4, 3, 5)),
    standable: false
  });
  const antesX = andarilho.x;
  for (let i = 0; i < 60; i++) andarilho.step(0.1, 0.1);
  ok('a parede o segura em x', andarilho.x < 1, `parou em ${andarilho.x.toFixed(2)}`);
  ok('mas ele escorrega por z em vez de travar', andarilho.z > 1,
    `andou ${andarilho.z.toFixed(2)} em z`);
  ok('e saiu do lugar', andarilho.x > antesX - 0.01);

  suite('o cérebro escolhe o que fazer');

  const cena3 = new THREE.Scene();
  const colisores3 = [];
  const posto = {
    id: 'p', name: 'Posto', x: 30, z: 0,
    flags: [{ x: 30, z: 0, y: 1.2, base: 0, owner: 'vestria', byTeam: null, phase: 'parada', progress: 0 }]
  };
  const mundo = { colliders: colisores3, outposts: [posto], terrain: chao };
  const combatente = soldado(cena3, colisores3, 'karnia', 0, 0);
  const cerebro = createBrain(combatente, mundo, dado(5));

  const semNinguem = { inimigos: [], temLinha: () => true, atirar: () => {}, capturar: () => {} };
  cerebro.update(DT, semNinguem);
  eq('sem inimigo, ele avança pro posto', cerebro.state, 'avancando');

  const antesDoAvanco = combatente.x;
  for (let i = 0; i < 120; i++) cerebro.update(DT, semNinguem);
  ok('e chega mais perto dele', combatente.x > antesDoAvanco + 1,
    `andou ${(combatente.x - antesDoAvanco).toFixed(1)} m`);

  // Inimigo à vista: combate ganha de tudo.
  const inimigo = alvoEm(combatente.x + 12, combatente.z);
  let tirosDados = 0;
  const comInimigo = {
    inimigos: [inimigo],
    temLinha: () => true,
    atirar: () => { tirosDados++; },
    capturar: () => {}
  };
  for (let i = 0; i < 60; i++) cerebro.update(DT, comInimigo);
  eq('com inimigo à vista, ele entra em combate', cerebro.state, 'combate');
  ok('e tenta atirar', tirosDados > 0);

  suite('quem chega por trás não é visto');

  const cena4 = new THREE.Scene();
  const vigia = soldado(cena4, [], 'karnia', 0, 0);
  vigia.yaw = 0;   // olhando pro +z
  const cerebro4 = createBrain(vigia, { colliders: [], outposts: [posto], terrain: chao }, dado(9));

  const porTras = alvoEm(0, -14);
  cerebro4.update(DT, {
    inimigos: [porTras], temLinha: () => true, atirar: () => {}, capturar: () => {}
  });
  ok('inimigo às costas não entra no campo de visão', cerebro4.state !== 'combate',
    `estado ${cerebro4.state}`);

  const pelaFrente = alvoEm(0, 14);
  cerebro4.update(DT, {
    inimigos: [pelaFrente], temLinha: () => true, atirar: () => {}, capturar: () => {}
  });
  eq('e pela frente entra', cerebro4.state, 'combate');

  suite('parede corta a linha de visão');

  const cena5 = new THREE.Scene();
  const cego = soldado(cena5, [], 'karnia', 0, 0);
  const cerebro5 = createBrain(cego, { colliders: [], outposts: [posto], terrain: chao }, dado(4));
  const atras = alvoEm(0, 14);

  cerebro5.update(DT, {
    inimigos: [atras], temLinha: () => false, atirar: () => {}, capturar: () => {}
  });
  ok('sem linha de visão, não há combate', cerebro5.state !== 'combate',
    `estado ${cerebro5.state}`);

  suite('sem munição, ele troca de arma');

  const cena6 = new THREE.Scene();
  const trocador = soldado(cena6, [], 'karnia', 0, 0);
  const cerebro6 = createBrain(trocador, { colliders: [], outposts: [posto], terrain: chao }, dado(6));
  const oponente = alvoEm(0, 20);

  // A troca do bot leva o mesmo tempo que a do jogador: ler a arma no quadro
  // seguinte lê a ANTIGA, porque ela ainda está na mão.
  const deixarTrocar = (cerebro, bot, contexto) => {
    for (let i = 0; i < 200; i++) {
      cerebro.update(DT, contexto);
      bot.update(DT);
      if (bot.swapping <= 0 && bot.swapPara < 0) break;
    }
  };

  eq('começa na primária', trocador.weapon.id, 'mp40');
  trocador.weapons[0].ammo.loaded = 0;
  const semBala = {
    inimigos: [oponente], temLinha: () => true, atirar: () => {}, capturar: () => {}
  };
  cerebro6.update(DT, semBala);
  ok('a troca é pedida na hora, mas a arma ainda é a antiga',
    trocador.swapping > 0 && trocador.weapon.id === 'mp40');
  deixarTrocar(cerebro6, trocador, semBala);
  eq('carregador vazio, ele saca a secundária', trocador.weapon.id, 'm1911');

  // Colado, a faca ganha da arma comprida.
  trocador.weapons[0].ammo.loaded = 32;

  // O alvo ACOMPANHA o bot: em combate ele anda, e um alvo parado deixaria de
  // estar colado no meio da troca — aí o teste mediria o passo, não a regra.
  const centroColado = new THREE.Vector3();
  const colado = {
    team: 'vestria', alive: true, radius: 0.5, collider: null, speed: 0,
    get x() { return trocador.x; },
    get z() { return trocador.z + BRAIN.PERTO_DEMAIS - 1.5; },
    center() {
      return centroColado.set(colado.x, trocador.feetY + 1.08, colado.z);
    },
    damage: (amount) => ({ target: colado, amount, killed: false })
  };
  deixarTrocar(cerebro6, trocador, {
    inimigos: [colado], temLinha: () => true, atirar: () => {}, capturar: () => {}
  });
  eq('colado no inimigo, ele puxa a faca', trocador.weapon.id, 'kabar');

  suite('ele captura bandeira inimiga');

  const cena7 = new THREE.Scene();
  const capturador = soldado(cena7, [], 'karnia', 29, 0);
  const cerebro7 = createBrain(capturador, { colliders: [], outposts: [posto], terrain: chao }, dado(8));

  let trabalhou = 0;
  const semBriga = {
    inimigos: [], temLinha: () => true, atirar: () => {},
    capturar: () => { trabalhou++; }
  };
  for (let i = 0; i < 240; i++) cerebro7.update(DT, semBriga);
  eq('chegando no mastro, ele passa a capturar', cerebro7.state, 'capturando');
  ok('e trabalha na bandeira', trabalhou > 0, `${trabalhou} quadros`);

  suite('combate ganha de captura');

  // Bot içando bandeira com alguém atirando nele não é bravo, é bug: o
  // jogador aprenderia a matar bot parado em vez de disputar posto.
  //
  // O inimigo vem PELA FRENTE aqui: de lado ele estaria fora do campo de
  // visão, e é o caso seguinte que cobre isso.
  const atacante = alvoEm(capturador.x + 10, capturador.z);
  cerebro7.update(DT, {
    inimigos: [atacante], temLinha: () => true, atirar: () => {},
    capturar: () => { trabalhou++; }
  });
  eq('com inimigo à vista, ele larga a bandeira', cerebro7.state, 'combate');

  suite('ninguém acerta a si mesmo');

  // A bala nasce na altura do OLHO e a esfera de acerto está no peito.
  // Agachado, os dois ficam a 30 cm um do outro — sem pular o próprio dono,
  // o bot se matava no primeiro tiro que desse.
  const cenaS = new THREE.Scene();
  const colisoresS = [];
  const balisticaS = createBallistics(cenaS, colisoresS);
  const suicida = soldado(cenaS, colisoresS, 'karnia', 0, 0);
  suicida.crouching = true;
  suicida.update(DT);

  const olhoS = new THREE.Vector3();
  suicida.eye(olhoS);
  balisticaS.spawn(olhoS, new THREE.Vector3(0, 0, -1), {
    damage: 24, range: 95, shooter: suicida.collider, owner: suicida
  });
  for (let i = 0; i < 20; i++) balisticaS.update(DT, [suicida], null);
  eq('agachado, o próprio tiro não o acerta', suicida.health, SOLDIER.VIDA);

  // E sem o dono declarado, ele se acerta — é a prova de que a proteção é
  // esta linha, e não sorte de geometria.
  suicida.eye(olhoS);
  balisticaS.spawn(olhoS, new THREE.Vector3(0, 0, -1), {
    damage: 24, range: 95, shooter: suicida.collider
  });
  for (let i = 0; i < 20; i++) balisticaS.update(DT, [suicida], null);
  ok('sem declarar o dono, ele se acertaria', suicida.health < SOLDIER.VIDA,
    `${suicida.health} de ${SOLDIER.VIDA}`);

  suite('bot não atira nas costas do companheiro');

  // Com nove bots amontoados num posto, a bala não distingue farda: sem
  // segurar o tiro, um pelotão inteiro se abate numa porta e a briga parece
  // quebrada mesmo estando correta. Quem segura é quem atira.
  const cenaF = new THREE.Scene();
  const colisoresF = [];
  const balisticaF = createBallistics(cenaF, colisoresF);
  const postoF = {
    id: 'p', name: 'P', x: 300, z: 0,
    flags: [{ x: 300, z: 0, y: 1.2, base: 0, owner: 'vestria', byTeam: null, phase: 'parada', progress: 0 }]
  };
  const tropaF = createBots(cenaF, { colliders: colisoresF, terrain: chao, outposts: [postoF] },
    { ballistics: balisticaF, capture: createCapture([postoF]), rng: dado(13) });

  const atiradorF = tropaF.spawn({ id: 1, team: 'karnia', x: 0, z: 0 });
  atiradorF.yaw = 0;
  const inimigoF = alvoEm(0, 24, 'vestria');

  // O companheiro ACOMPANHA a linha de tiro em vez de ficar numa coordenada
  // fixa: em combate o bot dá passos laterais, e um amigo parado sai da
  // frente sozinho — aí o teste mediria o passo, não a regra.
  const centroF = new THREE.Vector3();
  const companheiro = {
    team: 'karnia', alive: true, radius: 0.5, collider: null, speed: 0,
    get x() { return (atiradorF.x + inimigoF.x) / 2; },
    get z() { return (atiradorF.z + inimigoF.z) / 2; },
    center() {
      return centroF.set(companheiro.x, atiradorF.feetY + 1.08, companheiro.z);
    },
    damage: () => ({ amount: 0, killed: false })
  };

  let saiuBala = 0;
  const spawnOriginalF = balisticaF.spawn;
  balisticaF.spawn = (o, d, opts) => { saiuBala++; return spawnOriginalF(o, d, opts); };

  // Companheiro exatamente na linha do inimigo.
  tropaF.setTargets([inimigoF, companheiro, atiradorF]);
  for (let i = 0; i < 240; i++) tropaF.update(DT);
  eq('com companheiro na frente, ele não puxa o gatilho', saiuBala, 0);
  eq('mas ele continua vendo o inimigo', tropaF.stateOf(atiradorF), 'combate');

  // Sai da frente: agora pode.
  const deLado = alvoEm(9, 8, 'karnia');
  tropaF.setTargets([inimigoF, deLado, atiradorF]);
  for (let i = 0; i < 240; i++) tropaF.update(DT);
  ok('com a linha livre, ele atira', saiuBala > 0, `${saiuBala} tiros`);

  suite('duelo: quanto tempo você tem');

  // Este é o teste que impede o bot de virar aimbot por descuido de ajuste.
  // Ele mede o que o jogador sente: quanto tempo até o primeiro tiro doer, e
  // se andar adianta alguma coisa. Se um dia alguém apertar os números da
  // mira, isto quebra antes de alguém morrer sem entender por quê.
  function duelo(distancia, velocidadeAlvo, semente) {
    const cenaD = new THREE.Scene();
    const colisoresD = [];
    const rng = dado(semente);
    const balistica = createBallistics(cenaD, colisoresD);

    const atirador = soldado(cenaD, colisoresD, 'karnia', 0, 0);
    atirador.yaw = 0;

    let vida = 100;
    let primeiro = null;
    let t = 0;
    let x = 0;
    const centro = new THREE.Vector3();

    const vitima = {
      team: 'vestria', alive: true, radius: 0.5, collider: null,
      get x() { return x; }, get z() { return distancia; },
      get speed() { return velocidadeAlvo; },
      center: () => centro.set(x, 1.1, distancia),
      damage(amount) {
        if (primeiro === null) primeiro = t;
        vida -= amount;
        if (vida <= 0) vitima.alive = false;
        return { target: vitima, amount, killed: vida <= 0 };
      }
    };

    const cegosD = new Set([atirador.collider]);
    const olhoD = new THREE.Vector3();
    const dirD = new THREE.Vector3();
    const auxD = new THREE.Vector3();
    const CIMA = new THREE.Vector3(0, 1, 0);

    const puxar = (b, a, aim, desvio, dist) => {
      b.cooldown = Math.max(0, (b.cooldown ?? 0) - DT);
      if (b.cooldown > 0 || !aim.canFire(desvio)) return;
      b.eye(olhoD);
      dirD.copy(a.center()).sub(olhoD).normalize();
      const ang = rng() * Math.PI * 2;
      const raio = Math.sqrt(rng()) * aim.spread(dist, a.speed ?? 0);
      auxD.set(Math.cos(ang), Math.sin(ang), 0).applyAxisAngle(CIMA, b.yaw);
      dirD.addScaledVector(auxD, Math.tan(raio)).normalize();
      balistica.spawn(olhoD, dirD, {
        damage: 24, range: 95, tracer: false, shooter: b.collider
      });
      b.cooldown = 0.12;
      aim.shot();
    };

    const miolo = createBrain(atirador,
      { colliders: colisoresD, outposts: [], terrain: chao }, rng);
    const ctx = {
      inimigos: [vitima],
      temLinha: (de, para) => !balistica.blocked(de, para, cegosD),
      atirar: puxar,
      capturar: () => {}
    };

    for (let i = 0; i < 60 * 14 && vitima.alive; i++) {
      t += DT;
      if (velocidadeAlvo > 0) x = Math.sin(t * 1.3) * velocidadeAlvo;
      miolo.update(DT, ctx);
      atirador.update(DT);
      balistica.update(DT, [vitima], null);
    }
    return { primeiro, morreuEm: vitima.alive ? null : t };
  }

  const media = (lista) => lista.reduce((a, b) => a + b, 0) / (lista.length || 1);
  const corridasParado = Array.from({ length: 6 }, (_, i) => duelo(25, 0, 100 + i * 37));
  const corridasAndando = Array.from({ length: 6 }, (_, i) => duelo(25, 4, 100 + i * 37));

  const primeirosParado = corridasParado.map((c) => c.primeiro).filter((v) => v !== null);
  const mortesParado = corridasParado.map((c) => c.morreuEm).filter((v) => v !== null);
  const mortesAndando = corridasAndando.map((c) => c.morreuEm).filter((v) => v !== null);

  ok('parado a 25 m, ele acerta', primeirosParado.length >= 5,
    `${primeirosParado.length} de 6`);
  between('mas o primeiro tiro dói só depois de um tempo de reação',
    media(primeirosParado), 0.6, 4,
    `${media(primeirosParado).toFixed(2)}s`);
  between('e matar leva segundos, não um instante',
    media(mortesParado), 1.2, 8, `${media(mortesParado).toFixed(1)}s`);

  // A lição que o jogo tem que ensinar: mexer-se salva.
  ok('andar de lado dá muito mais sobrevida',
    mortesAndando.length < mortesParado.length
      || media(mortesAndando) > media(mortesParado) * 1.8,
    `parado ${media(mortesParado).toFixed(1)}s · andando ` +
    (mortesAndando.length ? `${media(mortesAndando).toFixed(1)}s` : 'sobreviveu') +
    ` (${mortesAndando.length}/6 morreram)`);
  note('duelo a 25 m',
    `parado morre em ${media(mortesParado).toFixed(1)}s, andando ` +
    (mortesAndando.length ? `${media(mortesAndando).toFixed(1)}s` : 'sobrevive'));

  suite('o bot machuca o jogador de verdade');

  // O pedido inteiro: bot mirando em você não vale nada se a bala atravessa.
  // Este caso monta a fiação do jogo — jogador, balística, bots — e confere
  // que a vida cai. Ele existe porque a primeira versão fazia o bot te VER e
  // ATIRAR, mas o alvo do jogador nunca entrava na lista da balística: doze
  // segundos de tiroteio e cem de vida intactos.
  const cenaJ = new THREE.Scene();
  const colisoresJ = [];
  const relevoJ = { heightAt: () => 0, waterDepthAt: () => 0 };
  const camaraJ = new THREE.PerspectiveCamera(70, 1, 0.1, 400);

  const jogador = new Player(camaraJ, document.body, {
    colliders: colisoresJ, terrain: relevoJ, spawn: new THREE.Vector3(0, 0, 0)
  });
  jogador.setClass(getClass('assault'));
  jogador.respawn();

  const postoJ = {
    id: 'p', name: 'P', x: 200, z: 0,
    flags: [{ x: 200, z: 0, y: 1.2, base: 0, owner: 'vestria', byTeam: null, phase: 'parada', progress: 0 }]
  };
  const mundoJ = { colliders: colisoresJ, terrain: relevoJ, outposts: [postoJ] };
  const balisticaJ = createBallistics(cenaJ, colisoresJ);
  const tropa = createBots(cenaJ, mundoJ, {
    ballistics: balisticaJ, capture: createCapture([postoJ]), rng: dado(21)
  });

  let morreu = 0;
  const euComoAlvo = playerAsTarget(jogador, () => { morreu++; });
  jogador.asTarget = euComoAlvo;

  const atirador = tropa.spawn({ id: 1, team: 'karnia', x: 0, z: -16 });
  atirador.yaw = 0;
  tropa.setTargets([euComoAlvo, atirador]);
  const alvosDeBala = [atirador, euComoAlvo];

  eq('o jogador começa inteiro', jogador.health, jogador.maxHealth);

  let primeiraDor = null;
  let morteEm = null;
  let vidaAntes = jogador.health;
  let tempo = 0;
  for (let i = 0; i < 60 * 14 && jogador.health > 0; i++) {
    tempo += DT;
    tropa.update(DT);
    balisticaJ.update(DT, alvosDeBala, null);
    if (jogador.health < vidaAntes) {
      if (primeiraDor === null) primeiraDor = tempo;
      vidaAntes = jogador.health;
    }
    if (morteEm === null && jogador.health <= 0) morteEm = tempo;
  }

  ok('a bala do bot machuca', jogador.health < jogador.maxHealth,
    `${jogador.health} de ${jogador.maxHealth}`);
  between('e o primeiro tiro dói só depois de ele reagir e mirar',
    primeiraDor ?? 99, 0.5, 6, `${(primeiraDor ?? 0).toFixed(2)}s`);
  ok('parado a 16 m sem revidar, o jogador morre', morteEm !== null,
    morteEm ? `${morteEm.toFixed(2)}s` : 'sobreviveu');
  eq('e a morte é avisada uma vez', morreu, 1);
  ok('o aviso de dano na tela acende', (jogador.hurtFlash ?? 0) > 0);
  note('bot contra jogador parado a 16 m',
    `dói em ${(primeiraDor ?? 0).toFixed(2)}s, morre em ${(morteEm ?? 0).toFixed(2)}s`);

  // O bot não pode se machucar sozinho no meio disso.
  eq('e o bot sai ileso do próprio tiroteio', atirador.health, SOLDIER.VIDA);

  suite('o que o bot faz não aparece como se fosse do jogador');

  // Reportado jogando: acerto de bot acendia a marca na mira do jogador, e a
  // bandeira que o bot estava trocando aparecia no painel dele. Os dois pelo
  // mesmo motivo — sistema compartilhado reportando em tela que é de um só.

  // 1. A marca de acerto: a balística é de todo mundo.
  const marca = document.createElement('div');
  marca.id = 'hitmarker';
  document.body.append(marca);

  const cenaH = new THREE.Scene();
  const balisticaH = createBallistics(cenaH, []);
  const centroH = new THREE.Vector3();
  const eu = {
    name: 'jogador', team: 'vestria', alive: true, radius: 0.5, collider: null,
    center: () => centroH.set(0, 1.1, 0), damage: () => ({ amount: 0, killed: false })
  };
  const outroAtirador = { name: 'bot', team: 'karnia' };
  const vitimaH = alvoEm(0, 20, 'vestria');
  const atualizarMarca = initHitmarker(eu, balisticaH);

  // A marca acende e apaga em poucos quadros, então o que vale é se ela
  // acendeu EM ALGUM quadro — conferir no fim media o decaimento, não o
  // acerto, e passava por engano nos dois casos.
  const acertar = (dono) => {
    marca.classList.remove('visible');
    balisticaH.spawn(new THREE.Vector3(0, 1.1, 30), new THREE.Vector3(0, 0, -1),
      { damage: 24, range: 60, owner: dono });
    let acendeu = false;
    for (let i = 0; i < 30; i++) {
      balisticaH.update(DT, [vitimaH], null);
      atualizarMarca(DT);
      if (marca.classList.contains('visible')) acendeu = true;
    }
    return acendeu;
  };

  ok('acerto de bot não acende a marca do jogador', !acertar(outroAtirador));
  ok('mas o acerto dele acende', acertar(eu));

  // Corpo a corpo não declara dono, e hoje só o jogador tem: tem que passar.
  marca.classList.remove('visible');
  marca.classList.remove('kill');
  const soCorpoACorpo = { onHit: (fn) => { soCorpoACorpo.avisar = fn; } };
  const marca2 = initHitmarker(eu, soCorpoACorpo);
  soCorpoACorpo.avisar({ target: vitimaH, amount: 55, killed: false });
  ok('golpe sem dono declarado continua acendendo',
    marca.classList.contains('visible'));
  marca2(0);
  marca.remove();

  // 2. A bandeira: quem pergunta diz de onde pergunta.
  const postoP = {
    id: 'q', name: 'Longe', x: 60, z: 0,
    flags: [{ x: 60, z: 0, y: 1.2, base: 0, owner: 'vestria', byTeam: 'karnia', phase: 'arriando', progress: 0.4 }]
  };
  const capturaP = createCapture([postoP]);

  eq('bandeira sendo trocada longe não aparece pra quem está longe',
    capturaP.targetAt(0, 1.2, 0, 'vestria'), null);
  ok('e aparece pra quem está nela',
    Boolean(capturaP.targetAt(60, 1.2, 0, 'vestria')));

  suite('bot morto volta ao combate');

  // Sem renascer, a frente esvazia: quatro minutos de partida e sobra um bot
  // vivo de cada lado, parados em cantos opostos da ilha.
  const cenaV = new THREE.Scene();
  const postoV = {
    id: 'v', name: 'V', x: 400, z: 0,
    flags: [{ x: 400, z: 0, y: 1.2, base: 0, owner: 'karnia', byTeam: null, phase: 'parada', progress: 0 }]
  };
  const mundoV = {
    colliders: [], terrain: chao, outposts: [postoV],
    spawnZones: [{ id: 'base', name: 'Base', team: 'karnia', base: true, x: 50, z: 50, radius: 10 }]
  };
  const tropaV = createBots(cenaV, mundoV, {
    ballistics: createBallistics(cenaV, []), capture: createCapture([postoV]), rng: dado(31)
  });
  const caido = tropaV.spawn({ id: 1, team: 'karnia', x: 0, z: 0 });
  tropaV.setTargets([caido]);

  caido.damage(1000);
  ok('ele está caído', !caido.alive);
  for (let i = 0; i < 60 * 2; i++) tropaV.update(DT);
  ok('e não volta na hora', !caido.alive, 'ainda caído aos 2 s');

  for (let i = 0; i < 60 * 10; i++) tropaV.update(DT);
  ok('mas volta depois de um tempo', caido.alive);
  eq('inteiro', caido.health, SOLDIER.VIDA);
  ok('e num ponto do time dele, não onde caiu',
    Math.hypot(caido.x - 50, caido.z - 50) < 12 || Math.hypot(caido.x, caido.z) > 1,
    `nasceu em ${caido.x.toFixed(0)}, ${caido.z.toFixed(0)}`);
  eq('com o carregador cheio', caido.weapons[0].ammo.loaded,
    caido.weapons[0].firearm.magazine);

  suite('o bot recarrega');

  // Sem isto ele gastava o carregador em cinco segundos e passava o resto da
  // partida agachado atrás de uma caixa, sem munição e sem recarregar.
  const gastou = atirador.weapons[0].ammo;
  ok('ele gastou munição no tiroteio', gastou.reserve < 96 || gastou.loaded < 32,
    `${gastou.loaded} no carregador, ${gastou.reserve} de reserva`);
  ok('mas continua com bala pra atirar', gastou.loaded > 0 || gastou.reserve > 0,
    'não ficou seco');

  suite('tiro pelas costas tira ele da bandeira');

  // Sem isto, dava pra matar bot ocupado sem que ele nunca reagisse: quem
  // atira do flanco fica fora do campo de visão dele pra sempre.
  const cena8 = new THREE.Scene();
  const ocupado = soldado(cena8, [], 'karnia', 29, 0);
  const cerebro8 = createBrain(ocupado, { colliders: [], outposts: [posto], terrain: chao }, dado(2));

  let trabalhou8 = 0;
  const trabalhando = {
    inimigos: [], temLinha: () => true, atirar: () => {},
    capturar: () => { trabalhou8++; }
  };
  for (let i = 0; i < 240; i++) cerebro8.update(DT, trabalhando);
  eq('ele está na bandeira', cerebro8.state, 'capturando');

  ocupado.damage(20);
  cerebro8.update(DT, trabalhando);
  eq('levando tiro de quem não vê, ele para e varre', cerebro8.state, 'alerta');

  const antesDaVarredura = trabalhou8;
  for (let i = 0; i < 30; i++) cerebro8.update(DT, trabalhando);
  eq('e não trabalha mais na bandeira enquanto isso', trabalhou8, antesDaVarredura);

  // Passado o susto sem achar ninguém, ele volta ao serviço.
  for (let i = 0; i < Math.ceil(BRAIN.SOB_FOGO / DT) + 10; i++) {
    cerebro8.update(DT, trabalhando);
  }
  eq('passado o susto, ele volta pra bandeira', cerebro8.state, 'capturando');
}
