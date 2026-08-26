import * as THREE from 'three';
import {
  SUPRIMENTO, marcarReservaCheia, temBala, secou, temCorpoACorpo,
  reabastecer, encherTudo, postoDeSuprimento
} from '../../src/game/suprimento.js';
import { CAIXA_MUNICAO } from '../../src/items/caixa.js';
import { createBrain } from '../../src/bots/brain.js';
import { createSoldier } from '../../src/bots/soldier.js';
import { PISTOL, MP40, KNIFE } from '../../src/items/classes.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const chao = { heightAt: () => 0, estradaAt: () => 0, corDeEstradaAt: () => null };

/** Arsenal próprio, como o dos bots: dois nunca dividem carregador. */
function armas() {
  return [
    { ...MP40, ammo: marcarReservaCheia({ ...MP40.ammo }) },
    { ...PISTOL, ammo: marcarReservaCheia({ ...PISTOL.ammo }) },
    { ...KNIFE }
  ];
}

function postoEm(x, z, dono) {
  return {
    id: 'p', name: 'P', x, z,
    flags: [{ x, z, y: 1.2, base: 0, owner: dono, byTeam: null, phase: 'parada', progress: 0 }]
  };
}

const dono = (posto) => posto.flags[0].owner;

export function run() {
  suite('quando a munição acabou de verdade');

  const arsenal = armas();
  ok('cheio, ele tem bala', temBala(arsenal[0]));
  ok('e não secou', !secou(arsenal));

  // Carregador vazio NÃO é ter secado: isso se resolve recarregando, e a
  // recarga do bot corre em qualquer estado. Secar é não ter em lugar nenhum.
  arsenal[0].ammo.loaded = 0;
  arsenal[1].ammo.loaded = 0;
  ok('carregador vazio com reserva ainda não é secar', !secou(arsenal));

  arsenal[0].ammo.reserve = 0;
  arsenal[1].ammo.reserve = 0;
  ok('sem carregador e sem reserva, secou', secou(arsenal));
  ok('mas ele ainda tem a faca', temCorpoACorpo(arsenal));

  suite('reabastecer tem teto, e a fração acumula');

  const b = armas();
  const cheioMP40 = b[0].ammo.reserveMax;
  b[0].ammo.reserve = 0;
  b[1].ammo.reserve = 0;

  // Um quadro pede 0,3 × 1/60 da reserva — meia bala. Arredondando por
  // chamada, meia vira uma e o posto entregaria sessenta por segundo.
  const umQuadro = reabastecer(b, SUPRIMENTO.POR_SEGUNDO / 60);
  ok('um quadro sozinho não entrega bala inteira', umQuadro <= 1,
    `${umQuadro} bala(s)`);

  for (let q = 0; q < 60; q++) reabastecer(b, SUPRIMENTO.POR_SEGUNDO / 60);
  const emUmSegundo = b[0].ammo.reserve;
  between('um segundo devolve perto de 30% da reserva',
    emUmSegundo / cheioMP40, 0.24, 0.36,
    `${emUmSegundo} de ${cheioMP40}`);

  for (let q = 0; q < 600; q++) reabastecer(b, SUPRIMENTO.POR_SEGUNDO / 60);
  eq('e por mais que fique parado, não passa do cheio',
    b[0].ammo.reserve, cheioMP40);

  suite('a caixa devolve metade, e nascer devolve tudo');

  const c = armas();
  c[0].ammo.reserve = 0;
  reabastecer(c, CAIXA_MUNICAO.suprimento);
  near('a caixa é meia reserva', c[0].ammo.reserve / c[0].ammo.reserveMax,
    SUPRIMENTO.CAIXA, 0.02);
  ok('e ela não é arma: não tem slot', CAIXA_MUNICAO.slot === null);

  // A Colt tem sete no carregador MAIS uma na câmara: restaurar por
  // `magazine` devolvia uma bala a menos do que se começa a partida.
  const d = armas();
  const colt = d[1];
  const camara = colt.ammo.loadedMax;
  colt.ammo.loaded = 0;
  colt.ammo.reserve = 3;
  encherTudo(d);
  eq('nascer devolve o carregador cheio, com a câmara', colt.ammo.loaded, camara);
  eq('e a reserva cheia', colt.ammo.reserve, colt.ammo.reserveMax);
  eq('e a Colt são sete mais uma', camara, 8);

  suite('só posto DOMINADO reabastece');

  const meu = postoEm(0, 0, 'karnia');
  const dele = postoEm(40, 0, 'vestria');
  const postos = [meu, dele];

  ok('em cima do meu posto, reabastece',
    Boolean(postoDeSuprimento(postos, 'karnia', 2, 2, dono)));
  eq('em cima do posto inimigo, não',
    postoDeSuprimento(postos, 'karnia', 40, 0, dono), null);
  eq('e longe do meu, também não',
    postoDeSuprimento(postos, 'karnia', SUPRIMENTO.RAIO + 6, 0, dono), null);
  note('raio de suprimento', `${SUPRIMENTO.RAIO} m`);

  suite('bot sem bala volta pro paiol');

  const cena = new THREE.Scene();
  const paiol = postoEm(0, -60, 'karnia');
  const mundo = { colliders: [], outposts: [paiol], terrain: chao };

  const seco = createSoldier(cena, [], {
    id: 1, team: 'karnia', x: 0, z: 0, terrain: chao, weapons: armas()
  });
  for (const arma of seco.weapons) {
    if (arma.ammo) { arma.ammo.loaded = 0; arma.ammo.reserve = 0; }
  }
  const cerebro = createBrain(seco, mundo, () => 0.5);

  const nada = { inimigos: [], temLinha: () => false, atirar: () => {}, capturar: () => {} };
  const antes = Math.hypot(paiol.x - seco.x, paiol.z - seco.z);
  for (let q = 0; q < 120; q++) cerebro.update(1 / 60, nada);

  eq('ele entra em reabastecendo', cerebro.state, 'reabastecendo');
  const depois = Math.hypot(paiol.x - seco.x, paiol.z - seco.z);
  ok('e anda na direção do posto que o time domina', depois < antes - 3,
    `${antes.toFixed(0)} m -> ${depois.toFixed(0)} m`);

  // Chegando, ele enche. Sem isso a viagem não serve pra nada.
  seco.x = paiol.x;
  seco.z = paiol.z;
  // Três segundos: a 30% da reserva por segundo, é o que leva pra passar do
  // limiar de "abastecido" e ele soltar a trava.
  for (let q = 0; q < 180; q++) cerebro.update(1 / 60, nada);
  // E ele FICA até encher. `secou` vira falso na primeira bala que entra, e
  // sem trava o bot largava o posto com uma no bolso pra secar de novo dez
  // metros à frente — a viagem inteira por nada.
  const cheio = seco.weapons[0].ammo.reserveMax;
  ok('e chegando, a reserva volta de verdade',
    seco.weapons[0].ammo.reserve > cheio * 0.5,
    `${seco.weapons[0].ammo.reserve} de ${cheio}`);
  ok('e só então ele volta pra frente', cerebro.state !== 'reabastecendo',
    cerebro.state);

  suite('sem bala e inimigo colado, ele parte pra faca');

  const cena2 = new THREE.Scene();
  const mundo2 = { colliders: [], outposts: [postoEm(0, -60, 'karnia')], terrain: chao };
  const semBala = createSoldier(cena2, [], {
    id: 2, team: 'karnia', x: 0, z: 0, terrain: chao, weapons: armas()
  });
  for (const arma of semBala.weapons) {
    if (arma.ammo) { arma.ammo.loaded = 0; arma.ammo.reserve = 0; }
  }
  const cerebro2 = createBrain(semBala, mundo2, () => 0.5);

  const inimigo = {
    name: 'alvo', team: 'vestria', alive: true, radius: 0.5, collider: null,
    x: 0, z: 6, feetY: 0, yaw: 0,
    center: () => new THREE.Vector3(0, 1.1, 6),
    update() {}, damage: () => ({})
  };
  for (let q = 0; q < 90; q++) {
    cerebro2.update(1 / 60, {
      inimigos: [inimigo], temLinha: () => true, atirar: () => {}, capturar: () => {}
    });
    semBala.update(1 / 60);
  }

  ok('a arma na mão é a faca', semBala.weapon && !semBala.weapon.firearm,
    semBala.weapon?.name ?? 'nenhuma');
  eq('e ele está em combate, não fugindo', cerebro2.state, 'combate');
}
