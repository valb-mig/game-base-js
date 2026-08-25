import * as THREE from 'three';
import { REGIOES, ORDEM, corpoDe, tirosPraMatar } from '../../src/game/hitboxes.js';
import { createSoldier, SOLDIER } from '../../src/bots/soldier.js';
import { createBallistics } from '../../src/items/ballistics.js';
import { initAttack } from '../../src/items/attack.js';
import { Player } from '../../src/player/player.js';
import { initKillFeed } from '../../src/ui/killfeed.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { MP40, PISTOL, KNIFE, getClass } from '../../src/items/classes.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;
const chao = { heightAt: () => 0, waterDepthAt: () => 0 };

function soldado(cena, colisores, x = 0, z = 0) {
  const s = createSoldier(cena, colisores, {
    id: 1, team: 'karnia', x, z, terrain: chao, weapons: []
  });
  s.update(0);
  return s;
}

/** Dispara na altura de uma região e devolve o que o acerto informou. */
function tiroNa(balistica, alvo, chave, dano) {
  const partes = alvo.body([]);
  const parte = partes.find((p) => p.regiao === REGIOES[chave]);
  const de = new THREE.Vector3(parte.x, parte.y, parte.z + 12);
  const dir = new THREE.Vector3(0, 0, -1);

  let acerto = null;
  const parar = balistica.onHit((r) => { acerto = r; });
  balistica.spawn(de, dir, { damage: dano, range: 60 });
  for (let i = 0; i < 30 && !acerto; i++) balistica.update(DT, [alvo], null);
  return acerto;
}

export function run() {
  initInput();

  suite('a promessa é em TIROS, não em pontos');

  // O jogador conta tiros, não dano. Os multiplicadores são calibrados pela
  // arma mais fraca que existe: com ela as promessas valem, com as outras
  // valem com folga.
  const fraca = MP40.firearm.damage;
  eq('cabeça: um tiro', tirosPraMatar(fraca, SOLDIER.VIDA, 'cabeca'), 1);
  eq('capacete: dois', tirosPraMatar(fraca, SOLDIER.VIDA, 'capacete'), 2);

  const tronco = tirosPraMatar(fraca, SOLDIER.VIDA, 'tronco');
  const braco = tirosPraMatar(fraca, SOLDIER.VIDA, 'bracos');
  const perna = tirosPraMatar(fraca, SOLDIER.VIDA, 'pernas');

  ok('tronco é o normal, e custa mais que o capacete', tronco > 2, `${tronco} tiros`);
  ok('braço demora mais que o tronco', braco > tronco, `${braco} contra ${tronco}`);
  eq('e perna custa o mesmo que braço', perna, braco);
  note('MP40', `cabeça 1 · capacete 2 · tronco ${tronco} · braço/perna ${braco}`);

  // E a promessa não pode depender da arma: com a Colt tem que valer também.
  const forte = PISTOL.firearm.damage;
  eq('com a Colt, cabeça continua um tiro',
    tirosPraMatar(forte, SOLDIER.VIDA, 'cabeca'), 1);
  eq('e capacete continua dois', tirosPraMatar(forte, SOLDIER.VIDA, 'capacete'), 2);

  suite('as regiões não se sobrepõem no lugar errado');

  // O capacete cobre a parte de CIMA da cabeça: se ele descesse sobre ela, o
  // tiro na cabeça viraria tiro no capacete e a promessa de um tiro sumiria.
  ok('o capacete fica acima da cabeça', REGIOES.capacete.de >= REGIOES.cabeca.ate);
  ok('e a cabeça acima do tronco', REGIOES.cabeca.de >= REGIOES.tronco.ate);
  ok('as pernas ficam abaixo do tronco', REGIOES.pernas.ate <= REGIOES.tronco.de);

  suite('o corpo acompanha quem o carrega');

  const cena = new THREE.Scene();
  const colisores = [];
  const alvo = soldado(cena, colisores, 4, -7);

  const partes = alvo.body([]);
  ok('todas as regiões existem no corpo',
    ORDEM.every((k) => partes.some((p) => p.regiao === REGIOES[k])));
  eq('e o braço vem em dois', partes.filter((p) => p.regiao === REGIOES.bracos).length, 2);

  for (const parte of partes) {
    ok(`${parte.regiao.nome} acompanha o soldado`,
      Math.abs(parte.x - alvo.x) < 0.4 && Math.abs(parte.z - alvo.z) < 0.01);
  }

  // Agachado o corpo encolhe, e as regiões junto: cabeça na altura de antes
  // seria tiro no vazio.
  const cabecaEmPe = partes.find((p) => p.regiao === REGIOES.cabeca).y;
  alvo.crouching = true;
  alvo.update(DT);
  const cabecaAgachado = alvo.body([]).find((p) => p.regiao === REGIOES.cabeca).y;
  ok('agachado, a cabeça desce junto', cabecaAgachado < cabecaEmPe - 0.2,
    `${cabecaAgachado.toFixed(2)} contra ${cabecaEmPe.toFixed(2)}`);
  alvo.crouching = false;
  alvo.update(DT);

  suite('a bala acerta a região em que se mirou');

  const balistica = createBallistics(cena, []);
  const naCabeca = tiroNa(balistica, alvo, 'cabeca', fraca);
  eq('mirando na cabeça, acerta a cabeça', naCabeca?.regiao?.nome, 'cabeça');
  ok('e mata de uma vez', naCabeca.killed);

  alvo.respawn(alvo.x, alvo.z);
  const noCapacete = tiroNa(balistica, alvo, 'capacete', fraca);
  eq('mirando no capacete, acerta o capacete', noCapacete?.regiao?.nome, 'capacete');
  ok('e NÃO mata de uma vez', !noCapacete.killed,
    `sobraram ${alvo.health.toFixed(0)} de vida`);

  const segundo = tiroNa(balistica, alvo, 'capacete', fraca);
  ok('mas o segundo mata', segundo.killed);

  alvo.respawn(alvo.x, alvo.z);
  const naPerna = tiroNa(balistica, alvo, 'pernas', fraca);
  eq('e na perna, a perna', naPerna?.regiao?.nome, 'perna');
  ok('que tira bem menos vida que o tronco',
    naPerna.amount < fraca, `${naPerna.amount.toFixed(1)} de dano`);

  suite('facada: dois golpes, ou um pelas costas');

  const cena2 = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  const player = new Player(camera, document.body,
    { colliders: [], terrain: chao, spawn: new THREE.Vector3(0, 0, 0) });
  player.setClass(getClass('assault'));
  player.respawn();
  player.controls.isLocked = true;
  player.slot = player.carried.indexOf(KNIFE);
  player.equipped = KNIFE;

  const vitima = soldado(cena2, [], 0, -1.2);
  const mundo = { targets: [vitima] };
  const golpe = initAttack(player, mundo);

  const acertos = [];
  golpe.onHit((r) => acertos.push(r));

  // De frente: o alvo olha PRA ELE (o jogador está em z 0, o alvo em z -1,2,
  // então o alvo virado pro +z está de frente).
  vitima.yaw = 0;
  const dianteiro = vitima.damage(KNIFE.melee.damage);
  ok('um golpe de frente não mata', !dianteiro.killed,
    `sobraram ${vitima.health.toFixed(0)}`);
  const segundoGolpe = vitima.damage(KNIFE.melee.damage);
  ok('o segundo mata', segundoGolpe.killed);

  // Pelas costas: o alvo olha PRA LONGE do golpe.
  vitima.respawn(0, -1.2);
  const dobrado = KNIFE.melee.damage * KNIFE.melee.costas;
  const pelasCostas = vitima.damage(dobrado);
  ok('pelas costas, um golpe basta', pelasCostas.killed,
    `${dobrado} de dano contra ${SOLDIER.VIDA} de vida`);
  note('faca', `${KNIFE.melee.damage} de frente · ${dobrado} pelas costas`);

  suite('o kill feed conta quem matou quem');

  const suporte = document.createElement('div');
  suporte.style.display = 'none';
  suporte.innerHTML = '<div id="killfeed"></div>';
  document.body.appendChild(suporte);

  const feed = initKillFeed(player);
  const painel = document.getElementById('killfeed');

  feed.register({
    matador: { name: 'KARNIA 3', team: 'karnia' },
    vitima: { name: 'jogador', team: 'vestria' },
    regiao: REGIOES.cabeca
  });
  eq('uma morte vira uma linha', painel.children.length, 1);
  ok('com quem matou', painel.textContent.includes('KARNIA 3'));
  ok('quem morreu', painel.textContent.includes('jogador'));
  ok('e a região que decidiu', painel.textContent.includes('cabeça'));

  feed.register({
    matador: { name: 'eu', team: 'vestria' },
    vitima: { name: 'KARNIA 1', team: 'karnia' },
    costas: true
  });
  ok('facada pelas costas aparece como tal',
    painel.textContent.includes('pelas costas'));

  // Parede de texto ninguém lê no meio de um tiroteio.
  for (let i = 0; i < 12; i++) {
    feed.register({ matador: { name: `a${i}` }, vitima: { name: `b${i}` } });
  }
  between('e a lista tem teto', painel.children.length, 1, 6,
    `${painel.children.length} linhas`);

  // Some sozinha: kill feed que fica é HUD permanente.
  for (let i = 0; i < 60 * 10; i++) feed.update(DT);
  eq('e as linhas somem com o tempo', painel.children.length, 0);

  suporte.remove();
  endFrame();
}
