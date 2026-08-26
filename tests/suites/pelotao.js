import * as THREE from 'three';
import { slot, pontoDoSlot, INTERVALO, NOMES } from '../../src/bots/formacao.js';
import { createPelotoes } from '../../src/bots/pelotao.js';
import { createBots } from '../../src/bots/bots.js';
import { createBallistics } from '../../src/items/ballistics.js';
import { createCapture } from '../../src/game/capture.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

/** Sorteio determinístico: a bancada tem que ser a mesma toda vez. */
function dado(semente) {
  let e = semente >>> 0;
  return () => {
    e = (Math.imul(e, 1664525) + 1013904223) >>> 0;
    return e / 4294967296;
  };
}

const chao = {
  heightAt: () => 0,
  waterDepthAt: () => 0,
  nivelDaAguaAt: () => 0,
  estradaAt: () => 0,
  corDeEstradaAt: () => null
};

function postoEm(x, z, dono = 'vestria') {
  return {
    id: 'p', name: 'P', numero: 1, x, z,
    flags: [{
      x, z, y: 1.2, base: 0, owner: dono,
      byTeam: null, phase: 'parada', progress: 0
    }]
  };
}

/** Menor distância entre dois slots quaisquer de uma formação. */
function maisPerto(nome, quantos) {
  let menor = Infinity;
  for (let i = 0; i < quantos; i++) {
    for (let j = i + 1; j < quantos; j++) {
      const a = slot(nome, i, quantos);
      const b = slot(nome, j, quantos);
      menor = Math.min(menor, Math.hypot(a.lateral - b.lateral, a.frente - b.frente));
    }
  }
  return menor;
}

export function run() {
  suite('formação: ninguém ocupa o lugar de ninguém');

  // É a razão de a formação existir. Dois slots no mesmo ponto são dois
  // soldados dentro um do outro, que é o bug que se está consertando.
  for (const nome of NOMES) {
    const menor = maisPerto(nome, 8);
    ok(`${nome}: o par mais perto ainda se separa`, menor > 1.2,
      `${menor.toFixed(2)} m entre os dois mais próximos`);
  }

  for (const nome of NOMES) {
    const zero = slot(nome, 0, 8);
    ok(`${nome}: o slot 0 é o líder, na origem`,
      Math.hypot(zero.lateral, zero.frente) < 1e-9);
  }

  suite('cada formação tem a forma que o nome diz');

  const larguraDe = (nome) => {
    let min = 0;
    let max = 0;
    for (let i = 0; i < 8; i++) {
      const s = slot(nome, i, 8);
      min = Math.min(min, s.lateral);
      max = Math.max(max, s.lateral);
    }
    return max - min;
  };
  const fundoDe = (nome) => {
    let min = 0;
    let max = 0;
    for (let i = 0; i < 8; i++) {
      const s = slot(nome, i, 8);
      min = Math.min(min, s.frente);
      max = Math.max(max, s.frente);
    }
    return max - min;
  };

  // Coluna é estreita e comprida; linha é o contrário. É essa troca que faz
  // uma servir pra trilha e a outra pro assalto final.
  ok('a coluna é mais funda que larga', fundoDe('coluna') > larguraDe('coluna') * 3,
    `${fundoDe('coluna').toFixed(1)} m de fundo por ${larguraDe('coluna').toFixed(1)} de frente`);
  ok('a linha é mais larga que funda', larguraDe('linha') > fundoDe('linha') * 3,
    `${larguraDe('linha').toFixed(1)} m de frente por ${fundoDe('linha').toFixed(1)} de fundo`);
  ok('a cunha abre pros dois lados e recua', larguraDe('cunha') > INTERVALO * 4
    && fundoDe('cunha') > INTERVALO, `${larguraDe('cunha').toFixed(1)} x ${fundoDe('cunha').toFixed(1)} m`);
  ok('o vê põe gente À FRENTE do líder',
    slot('ve', 1, 8).frente > 0, `${slot('ve', 1, 8).frente.toFixed(1)} m`);
  ok('o escalão puxa tudo pro mesmo lado',
    slot('escalao', 1, 8).lateral > 0 && slot('escalao', 3, 8).lateral > 0);

  note('larguras', NOMES.map((n) => `${n} ${larguraDe(n).toFixed(0)}m`).join(' · '));

  suite('a formação gira com o rumo do pelotão');

  // O slot é relativo ao LÍDER: virar o pelotão tem que virar a formação
  // junto, senão a cunha aponta pro norte enquanto o pelotão vai pro sul.
  const lider = { x: 100, z: 50 };
  const saida = { x: 0, z: 0 };
  pontoDoSlot('cunha', 1, 8, lider, 0, saida);
  const aoNorte = { x: saida.x, z: saida.z };
  pontoDoSlot('cunha', 1, 8, lider, Math.PI, saida);
  const aoSul = { x: saida.x, z: saida.z };

  ok('meia-volta espelha o slot', Math.abs(aoNorte.z - lider.z) > 1
    && Math.sign(aoNorte.z - lider.z) !== Math.sign(aoSul.z - lider.z),
    `z ${(aoNorte.z - lider.z).toFixed(1)} contra ${(aoSul.z - lider.z).toFixed(1)}`);
  near('e a distância ao líder não muda ao girar',
    Math.hypot(aoNorte.x - lider.x, aoNorte.z - lider.z),
    Math.hypot(aoSul.x - lider.x, aoSul.z - lider.z), 1e-9);

  suite('pelotão: quem manda e quem assume');

  const posto = postoEm(0, -300, 'vestria');
  const mundo = { colliders: [], outposts: [posto], terrain: chao };
  const grupos = createPelotoes(mundo, { tamanho: 4 });

  const tropa = [];
  for (let i = 0; i < 10; i++) {
    const bot = { team: 'karnia', x: i * 2, z: 0, alive: true };
    grupos.alistar(bot);
    tropa.push(bot);
  }
  eq('dez homens em pelotões de quatro dão três pelotões',
    grupos.contagem().karnia, 3);
  eq('o primeiro é o slot 0 do primeiro pelotão', tropa[0].slot, 0);
  eq('e o quinto abre o segundo pelotão', tropa[4].slot, 0);

  grupos.pensar(1);
  const alvo = { x: 0, z: 0 };
  eq('o líder não tem slot: o lugar dele é o objetivo',
    grupos.alvoDe(tropa[0], alvo), null);
  ok('mas o segundo tem', Boolean(grupos.alvoDe(tropa[1], alvo)));

  // Morto o líder, o próximo assume — e o pelotão continua andando em vez de
  // parar esperando ordem que não vem.
  tropa[0].alive = false;
  grupos.pensar(1);
  eq('morto o líder, o segundo passa a não ter slot',
    grupos.alvoDe(tropa[1], alvo), null);
  ok('e o terceiro passa a ter', Boolean(grupos.alvoDe(tropa[2], alvo)));

  suite('separação: dois corpos não ficam no mesmo lugar');

  // O bug que se está consertando, medido: dois bots nascidos na MESMA
  // coordenada. Sem separação eles ficam ali, um dentro do outro, porque a
  // colisão barra quem entra mas não afasta quem já está encostado.
  const cena = new THREE.Scene();
  const colisores = [];
  const postoS = postoEm(0, -400, 'karnia');
  const balistica = createBallistics(cena, colisores);
  const tropaS = createBots(cena,
    { colliders: colisores, terrain: chao, outposts: [postoS], spawnZones: [] },
    { ballistics: balistica, capture: createCapture([postoS]), rng: dado(31) });

  const a = tropaS.spawn({ id: 1, team: 'karnia', x: 0, z: 0 });
  const b = tropaS.spawn({ id: 2, team: 'karnia', x: 0, z: 0 });
  tropaS.setTargets([a, b]);

  const juntos = Math.hypot(a.x - b.x, a.z - b.z);
  for (let q = 0; q < 90; q++) tropaS.update(1 / 60);
  const separados = Math.hypot(a.x - b.x, a.z - b.z);

  ok('nasceram no mesmo ponto', juntos < 0.01, `${juntos.toFixed(3)} m`);
  ok('e um segundo e meio depois estão separados', separados > 0.9,
    `${separados.toFixed(2)} m`);
  note('separação', `${juntos.toFixed(2)} m -> ${separados.toFixed(2)} m`);
}
