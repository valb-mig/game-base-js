import * as THREE from 'three';
import { REGIOES, ORDEM, PECAS, corpoDe, tirosPraMatar } from '../../src/game/hitboxes.js';
import { createSoldier, SOLDIER } from '../../src/bots/soldier.js';
import { createBallistics } from '../../src/items/ballistics.js';
import { initAttack } from '../../src/items/attack.js';
import { Player } from '../../src/player/player.js';
import { initKillFeed } from '../../src/ui/killfeed.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { MP40, PISTOL, KNIFE, getClass } from '../../src/items/classes.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;
const chao = { heightAt: () => 0, waterDepthAt: () => 0, nivelDaAguaAt: () => 0 };

function soldado(cena, colisores, x = 0, z = 0) {
  const s = createSoldier(cena, colisores, {
    id: 1, team: 'karnia', x, z, terrain: chao, weapons: []
  });
  s.update(0);
  return s;
}

/**
 * Leva um ponto do sistema DO ALVO pro mundo.
 *
 * As caixas são locais desde que a bala passou a ser levada pro sistema do
 * alvo — uma conta por alvo em vez de dezesseis caixas pro mundo.
 */
function paraMundo(alvo, x, y, z) {
  const cos = Math.cos(alvo.yaw ?? 0);
  const sen = Math.sin(alvo.yaw ?? 0);
  return new THREE.Vector3(
    alvo.x + x * cos + z * sen,
    (alvo.feetY ?? 0) + y,
    alvo.z - x * sen + z * cos
  );
}

/** Um ponto dentro da caixa de uma peça, no mundo. */
function pontoNa(alvo, chave, fracaoY = 0.5, id = null) {
  const parte = alvo.body([]).find((p) => (id ? p.peca.id === id : p.regiao === REGIOES[chave]));
  return paraMundo(alvo,
    (parte.minX + parte.maxX) / 2,
    parte.minY + (parte.maxY - parte.minY) * fracaoY,
    (parte.minZ + parte.maxZ) / 2);
}

function meioDe(alvo, chave) {
  return pontoNa(alvo, chave, 0.5);
}

/** Dispara numa ALTURA da peça e devolve o que o acerto informou. */
function tiroNa(balistica, alvo, chave, dano, fracao = 0.5, id = null) {
  const alvoPonto = pontoNa(alvo, chave, fracao, id);
  const de = alvoPonto.clone().add(new THREE.Vector3(0, 0, 12));
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
  const braco = tirosPraMatar(fraca, SOLDIER.VIDA, 'braco');
  const perna = tirosPraMatar(fraca, SOLDIER.VIDA, 'perna');

  ok('tronco é o normal, e custa mais que o capacete', tronco > 2, `${tronco} tiros`);
  ok('braço demora mais que o tronco', braco > tronco, `${braco} contra ${tronco}`);
  eq('e perna custa o mesmo que braço', perna, braco);
  note('MP40', `cabeça 1 · capacete 2 · tronco ${tronco} · braço/perna ${braco}`);

  // E a promessa não pode depender da arma: com a Colt tem que valer também.
  const forte = PISTOL.firearm.damage;
  eq('com a Colt, cabeça continua um tiro',
    tirosPraMatar(forte, SOLDIER.VIDA, 'cabeca'), 1);
  eq('e capacete continua dois', tirosPraMatar(forte, SOLDIER.VIDA, 'capacete'), 2);

  suite('o corpo é segmentado como um corpo');

  // Membro dobra. Uma cápsula do ombro até a mão passa longe do braço de quem
  // está com a arma erguida e sobra caixa no vazio ao lado do corpo — foi o
  // que aconteceu na primeira versão, e a bala atravessava a perna.
  const pedacoDe = (grupo) => PECAS.filter((p) => p.grupo === grupo).map((p) => p.id);

  ok('o braço vem em três pedaços', pedacoDe('braco').length >= 3,
    pedacoDe('braco').join(', '));
  ok('a perna também', pedacoDe('perna').length >= 3, pedacoDe('perna').join(', '));
  ok('e o tronco em dois', pedacoDe('tronco').length >= 2, pedacoDe('tronco').join(', '));

  // O capacete é o primeiro da ordem: onde ele encosta na cabeça, ganha quem
  // vier antes, e o capacete cobre a parte de CIMA.
  const ordemDe = (id) => PECAS.findIndex((p) => p.id === id);
  ok('capacete e cabeça são peças distintas', ordemDe('capacete') !== ordemDe('cabeca'));
  ok('e a mão é testada antes do braço',
    ordemDe('mao') < ordemDe('braco'), 'mão primeiro');

  suite('o corpo acompanha quem o carrega');

  const cena = new THREE.Scene();
  const colisores = [];
  const alvo = soldado(cena, colisores, 4, -7);

  const partes = alvo.body([]);
  ok('todas as regiões existem no corpo',
    ORDEM.every((k) => partes.some((p) => p.regiao === REGIOES[k])));
  ok('e cada membro aparece dos dois lados',
    partes.filter((p) => p.peca.id === 'coxa').length === 2
    && partes.filter((p) => p.peca.id === 'braco').length === 2);

  // Levadas pro mundo, as caixas têm que cair EM CIMA do soldado.
  for (const parte of partes) {
    const meio = paraMundo(alvo,
      (parte.minX + parte.maxX) / 2,
      (parte.minY + parte.maxY) / 2,
      (parte.minZ + parte.maxZ) / 2);
    ok(`${parte.peca.id} acompanha o soldado`,
      Math.abs(meio.x - alvo.x) < 0.45 && Math.abs(meio.z - alvo.z) < 0.45);
  }

  // Reportado com foto: a bala atravessava a perna. O corpo é 1,75 m e as
  // cápsulas juntas têm que cobrir de baixo a cima, SEM buraco no meio —
  // buraco é bala que atravessa.
  const faixas = partes.map((p) => [p.minY, p.maxY]).sort((a, b) => a[0] - b[0]);

  ok('a cobertura começa no chão', faixas[0][0] < 0.06, `${faixas[0][0].toFixed(2)} m`);
  const topo = Math.max(...faixas.map((f) => f[1]));
  ok('e vai até o alto da cabeça', topo > 1.7, `${topo.toFixed(2)} m`);

  let buraco = 0;
  let ate = faixas[0][1];
  for (const [de, fim] of faixas) {
    if (de > ate) buraco = Math.max(buraco, de - ate);
    ate = Math.max(ate, fim);
  }
  ok('e não há altura nenhuma descoberta entre elas', buraco < 0.02,
    `maior buraco ${(buraco * 100).toFixed(1)} cm`);
  note('cobertura', `${partes.length} caixas · 0 a ${topo.toFixed(2)} m`);

  // Agachado o modelo encolhe SÓ em Y. Escalando os três eixos, braço e perna
  // ficavam fora da hitbox de quem estava agachado — e o tiro no ombro de
  // alguém agachado passava reto.
  const larguraEmPe = Math.max(...partes.map((p) => p.maxX));
  alvo.crouching = true;
  alvo.update(DT);
  const agachadas = alvo.body([]);
  near('agachado, a largura não muda',
    Math.max(...agachadas.map((p) => p.maxX)), larguraEmPe, 1e-9);
  ok('mas a altura sim',
    Math.max(...agachadas.map((p) => p.maxY)) < topo - 0.3);
  alvo.crouching = false;
  alvo.update(DT);

  // Agachado o corpo encolhe, e as regiões junto: cabeça na altura de antes
  // seria tiro no vazio.
  const cabecaEmPe = meioDe(alvo, 'cabeca').y;
  alvo.crouching = true;
  alvo.update(DT);
  ok('agachado, a cabeça desce junto', meioDe(alvo, 'cabeca').y < cabecaEmPe - 0.2,
    `${meioDe(alvo, 'cabeca').y.toFixed(2)} contra ${cabecaEmPe.toFixed(2)}`);
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

  // Nas PONTAS da perna, não no meio: é ali que a esfera falhava, e é ali
  // que o jogador atira quando mira em quem está correndo.
  alvo.respawn(alvo.x, alvo.z);
  const naCanela = tiroNa(balistica, alvo, 'perna', fraca, 0.5, 'canela');
  eq('tiro na canela pega a perna', naCanela?.regiao?.nome, 'perna');

  alvo.respawn(alvo.x, alvo.z);
  const naCoxa = tiroNa(balistica, alvo, 'perna', fraca, 0.5, 'coxa');
  eq('e na coxa também', naCoxa?.regiao?.nome, 'perna');

  alvo.respawn(alvo.x, alvo.z);
  const naPerna = tiroNa(balistica, alvo, 'perna', fraca);
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
