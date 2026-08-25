import { createCapture, CAPTURE } from '../../src/game/capture.js';
import {
  TEAMS, postOwner, postContested, spawnableFor, tally, enemyOf, winner
} from '../../src/game/teams.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;

/** Posto de teste: quatro mastros num quadrado, como no mapa. */
function posto(id, team, x = 0, z = 0) {
  const cantos = [[-4.5, -4.5], [4.5, -4.5], [4.5, 4.5], [-4.5, 4.5]];
  return {
    id,
    name: id,
    x,
    z,
    flags: cantos.map(([dx, dz]) => ({
      x: x + dx, z: z + dz, y: 1.2, base: 0,
      owner: team, byTeam: null, phase: 'parada', progress: 0,
      cloth: { position: { y: 0 }, material: { color: { setHex() {} } }, visible: true }
    }))
  };
}

/** Segura F em cima de um mastro por `segundos`. */
function trabalhar(capture, flag, teamId, segundos) {
  const quadros = Math.round(segundos / DT);
  for (let i = 0; i < quadros; i++) {
    capture.update(DT, {
      x: flag.x, y: flag.y, z: flag.z, teamId, agindo: true
    });
  }
}

export function run() {
  suite('dois lados, países inventados');

  eq('são dois times', Object.keys(TEAMS).length, 2);
  eq('e um é o inimigo do outro', enemyOf('vestria'), 'karnia');
  eq('e vice-versa', enemyOf('karnia'), 'vestria');
  for (const time of Object.values(TEAMS)) {
    ok(`${time.short} tem nome, sigla e cor`,
      Boolean(time.name && time.short && time.color));
  }

  suite('o posto é de quem tem as quatro bandeiras');

  const p = posto('teste', 'karnia');
  eq('começa inteiro de quem o construiu', postOwner(p), 'karnia');
  ok('e não está em disputa', !postContested(p));
  ok('serve de spawn pra quem é dono', spawnableFor(p, 'karnia'));
  ok('e não pro outro', !spawnableFor(p, 'vestria'));

  // Uma bandeira já basta pra tirar o posto de quem era: é o que faz a
  // primeira captura valer alguma coisa, em vez de só a última.
  p.flags[0].owner = 'vestria';
  eq('com uma bandeira trocada, não é de ninguém', postOwner(p), null);
  ok('e deixa de ser spawn do antigo dono', !spawnableFor(p, 'karnia'));
  ok('sem virar spawn de quem está tomando', !spawnableFor(p, 'vestria'));

  suite('trocar uma bandeira leva trinta segundos');

  const q = posto('alvo', 'karnia');
  const captura = createCapture([q]);
  const bandeira = q.flags[0];

  trabalhar(captura, bandeira, 'vestria', 1);
  eq('começa arriando a de quem era', bandeira.phase, 'arriando');
  eq('e ela ainda é dele', bandeira.owner, 'karnia');
  ok('mas o posto já está em disputa', postContested(q));
  ok('e o dono já perdeu o spawn', !spawnableFor(q, 'karnia'));

  trabalhar(captura, bandeira, 'vestria', CAPTURE.FLAG_SECONDS / 2);
  eq('na metade do tempo, o mastro fica vazio', bandeira.owner, null);
  eq('e passa a içar a nova', bandeira.phase, 'icando');

  trabalhar(captura, bandeira, 'vestria', CAPTURE.FLAG_SECONDS / 2 + 0.2);
  eq('completos os trinta segundos, a bandeira é de quem trocou',
    bandeira.owner, 'vestria');
  eq('e o trabalho acabou', bandeira.phase, 'parada');

  suite('o posto inteiro custa quatro bandeiras');

  const r = posto('inteiro', 'karnia');
  const capturaR = createCapture([r]);

  let trocadas = 0;
  for (const flag of r.flags) {
    trabalhar(capturaR, flag, 'vestria', CAPTURE.FLAG_SECONDS + 0.2);
    trocadas++;
    if (trocadas < 4) {
      eq(`com ${trocadas} de 4, ainda não é de ninguém`, postOwner(r), null);
    }
  }
  eq('com as quatro, o posto é de quem trocou', postOwner(r), 'vestria');
  ok('e vira spawn dele', spawnableFor(r, 'vestria'));
  ok('deixando de ser do antigo dono', !spawnableFor(r, 'karnia'));

  const custo = CAPTURE.FLAG_SECONDS * 4;
  eq('dois minutos de posto, com um soldado só', custo, 120);
  note('custo de um posto', `4 bandeiras × ${CAPTURE.FLAG_SECONDS}s = ${custo}s`);

  suite('capturar é trabalho, não presença');

  const t = posto('parado', 'karnia');
  const capturaT = createCapture([t]);
  for (let i = 0; i < 600; i++) {
    capturaT.update(DT, {
      x: t.flags[0].x, y: t.flags[0].y, z: t.flags[0].z,
      teamId: 'vestria', agindo: false
    });
  }
  eq('dez segundos parado do lado não movem nada', t.flags[0].phase, 'parada');
  eq('a bandeira continua de quem era', t.flags[0].owner, 'karnia');

  suite('o progresso não some ao sair de perto');

  // É isso que faz um posto ficar "sendo dominado" enquanto a briga acontece
  // em outro canto do mapa.
  const u = posto('meio', 'karnia');
  const capturaU = createCapture([u]);
  trabalhar(capturaU, u.flags[0], 'vestria', 6);
  const parcial = u.flags[0].progress;
  between('o trabalho começou', parcial, 0.1, 0.9);

  capturaU.update(DT, { x: 400, y: 1.2, z: 400, teamId: 'vestria', agindo: true });
  near('longe do mastro, o progresso fica onde estava', u.flags[0].progress, parcial, 1e-9);
  ok('e o posto segue em disputa', postContested(u));

  trabalhar(capturaU, u.flags[0], 'vestria', 1);
  ok('voltando, ele continua de onde parou', u.flags[0].progress > parcial);

  suite('mastro fora de alcance não responde');

  const v = posto('longe', 'karnia', 0, 0);
  const capturaV = createCapture([v]);
  const alvoLonge = v.flags[0];

  eq('em cima do mastro, tem alvo',
    Boolean(capturaV.targetAt(alvoLonge.x, alvoLonge.y, alvoLonge.z, 'vestria')), true);
  eq('um passo além do alcance, não tem',
    capturaV.targetAt(alvoLonge.x + CAPTURE.REACH + 0.5, alvoLonge.y, alvoLonge.z, 'vestria'),
    null);
  eq('e nem de cima de uma laje acima dele',
    capturaV.targetAt(alvoLonge.x, alvoLonge.y + CAPTURE.REACH_UP + 0.5, alvoLonge.z, 'vestria'),
    null);

  suite('placar e vitória');

  const mapa = [
    ...Array.from({ length: 6 }, (_, i) => posto(`k${i}`, 'karnia', i * 40, 0)),
    ...Array.from({ length: 6 }, (_, i) => posto(`v${i}`, 'vestria', i * 40, 200))
  ];
  const partida = createCapture(mapa);

  const inicio = tally(mapa);
  eq('doze postos, seis de cada lado', mapa.length, 12);
  eq('Karnia começa com seis', inicio.karnia, 6);
  eq('Vestria também', inicio.vestria, 6);
  eq('e nenhum em disputa', inicio.disputados, 0);

  eq('cada lado pode nascer nos seus seis', partida.spawnsFor('vestria').length, 6);
  eq('e faltam seis pra dominar tudo', partida.remainingFor('vestria').length, 6);

  // Toma um posto inimigo inteiro e confere que o placar acompanha.
  for (const flag of mapa[0].flags) {
    trabalhar(partida, flag, 'vestria', CAPTURE.FLAG_SECONDS + 0.2);
  }
  const depois = tally(mapa);
  eq('tomado um, Karnia cai pra cinco', depois.karnia, 5);
  eq('e Vestria sobe pra sete', depois.vestria, 7);
  eq('sobrando cinco pra dominar', partida.remainingFor('vestria').length, 5);
  eq('e sete lugares pra nascer', partida.spawnsFor('vestria').length, 7);

  eq('com um posto tomado, ninguém venceu ainda', winner(mapa), null);

  // Toma os cinco que faltam: o objetivo é dominar TODOS os postos do outro.
  for (const post of mapa) {
    for (const flag of post.flags) {
      if (flag.owner === 'vestria') continue;
      trabalhar(partida, flag, 'vestria', CAPTURE.FLAG_SECONDS + 0.2);
    }
  }
  eq('com os doze, Vestria venceu', winner(mapa), 'vestria');
  eq('e não sobrou posto inimigo', partida.remainingFor('vestria').length, 0);
  eq('nem posto em disputa', tally(mapa).disputados, 0);
}
