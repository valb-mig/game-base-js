import * as THREE from 'three';
import { createBallistics } from '../../src/items/ballistics.js';
import { createDummy } from '../../src/world/dummy.js';
import { createSparks } from '../../src/world/sparks.js';
import { BULLET } from '../../src/config.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;

export function run() {
  const scene = new THREE.Scene();
  const colliders = [];
  const ballistics = createBallistics(scene, colliders);

  const acertos = [];
  ballistics.onHit((r) => acertos.push(r));

  const disparar = (from, dir, opts = {}) => ballistics.spawn(
    from.clone(), dir.clone().normalize(),
    { damage: 34, range: 200, tracer: false, ...opts });
  const rodar = (segundos, targets = [], terrain = null) => {
    for (let i = 0; i < Math.ceil(segundos / DT); i++) {
      ballistics.update(DT, targets, terrain);
    }
  };

  suite('a bala viaja, não teleporta');

  const alvo = createDummy(scene, colliders, { x: 0, z: -30, ground: 0 });
  const alto = new THREE.Vector3(0, 1.25, 0);

  disparar(alto, new THREE.Vector3(0, 0, -1));
  eq('a bala existe no mundo', ballistics.bullets.length, 1);
  ballistics.update(DT, [alvo], null);
  eq('e ainda não chegou no alvo a 30 m', acertos.length, 0);
  note('percorrido em um quadro', `${(BULLET.SPEED * DT).toFixed(1)} m`);

  rodar(0.3, [alvo], null);
  eq('depois de 0,3 s ela chegou', acertos.length, 1);
  ok('e acertou o boneco', acertos[0].target === alvo);

  suite('queda');

  // sem gravidade a bala chegaria na mesma altura; com ela, chega abaixo
  // Devolve a queda e a distância em que ela foi medida. A bala anda 4,2 m
  // por quadro, então parar "aos 60 m" na verdade para depois deles — a
  // comparação com a teoria tem que usar a distância real, não a pedida.
  const medirQueda = (distancia) => {
    const bullet = disparar(new THREE.Vector3(0, 50, 0), new THREE.Vector3(0, 0, -1));
    while (!bullet.spent && Math.abs(bullet.position.z) < distancia) {
      ballistics.update(DT, [], null);
    }
    const medida = { queda: 50 - bullet.position.y, distancia: Math.abs(bullet.position.z) };
    bullet.spent = true;
    bullet.fade = 0;
    ballistics.update(DT, [], null);
    return medida;
  };

  const perto = medirQueda(30);
  const longe30 = medirQueda(60);

  ok('a 30 m a bala já caiu', perto.queda > 0.05, `${(perto.queda * 100).toFixed(0)} cm`);
  ok('e ao dobro da distância cai bem mais',
    longe30.queda > perto.queda * 3, `${(longe30.queda * 100).toFixed(0)} cm`);

  // queda teórica: t = d/v, y = g t² / 2
  const teorica = (d) => BULLET.GRAVITY * (d / BULLET.SPEED) ** 2 / 2;
  near('a queda bate com a física na distância medida',
    longe30.queda, teorica(longe30.distancia), 0.005);
  note('queda por distância',
    `${perto.distancia.toFixed(0)} m: ${(perto.queda * 100).toFixed(0)} cm · ` +
    `${longe30.distancia.toFixed(0)} m: ${(longe30.queda * 100).toFixed(0)} cm`);

  suite('o trecho do quadro é testado inteiro');

  // Regressão em potencial: a 253 m/s a bala anda 4,2 m por quadro. Uma
  // parede fina entre dois quadros tem que parar a bala mesmo assim.
  const fina = {
    box: new THREE.Box3(new THREE.Vector3(-4, 0, -20.05), new THREE.Vector3(4, 4, -19.95)),
    standable: false
  };
  colliders.push(fina);

  const antes = acertos.length;
  alvo.health = alvo.maxHealth;
  alvo.alive = true;
  disparar(alto, new THREE.Vector3(0, 0, -1));
  rodar(0.4, [alvo], null);

  eq('parede de 10 cm para a bala', acertos.length, antes + 1);
  eq('e o alvo atrás dela não é atingido', acertos.at(-1).target, null);
  eq('o boneco continua inteiro', alvo.health, alvo.maxHealth);
  colliders.pop();

  suite('terreno e alcance');

  const morro = { heightAt: (x, z) => (z < -25 ? 8 : 0) };
  disparar(alto, new THREE.Vector3(0, 0, -1));
  rodar(0.4, [], morro);
  eq('a bala morre no terreno', acertos.at(-1).target, null);
  ok('e para antes de sumir no horizonte',
    Math.abs(acertos.at(-1).point.z) < 40, `${acertos.at(-1).point.z.toFixed(1)} m`);

  const longe = disparar(alto, new THREE.Vector3(0, 0.4, -1), { range: 25 });
  rodar(1.5, [], null);
  ok('a bala desiste no fim do alcance', longe.spent);

  suite('traçante');

  ballistics.bullets.length = 0;
  const comum = disparar(alto, new THREE.Vector3(0, 0, -1), { tracer: false });
  const risco = disparar(alto, new THREE.Vector3(0, 0, -1), { tracer: true });
  eq('bala comum não deixa risco', comum.tracer, null);
  ok('traçante deixa', risco.tracer !== null);
  ok('e o risco entra na cena', scene.children.includes(risco.tracer));

  rodar(2, [], null);
  ok('a cena não acumula riscos de balas mortas',
    !scene.children.includes(risco.tracer));
  eq('nem balas', ballistics.bullets.length, 0);
  note('cadência do traçante', `1 a cada ${BULLET.TRACER_EVERY} tiros`);

  suite('fagulha de impacto');

  // A fagulha é o que diz ONDE a bala foi parar quando ela erra: sem ela, o
  // tiro que passa raspando e o que bate na parede atrás são a mesma coisa
  // na tela — nada acontece nos dois casos.
  const faisca = createSparks(scene);
  ballistics.onHit((r) => faisca.burst(r.point, r.dir, r.terreno ? 'terra' : 'duro'));

  const chao = { heightAt: () => 0 };
  acertos.length = 0;
  ballistics.bullets.length = 0;
  eq('em paz não há partícula nenhuma', faisca.count, 0);

  disparar(alto, new THREE.Vector3(0, -1, -0.2));
  rodar(0.5, [], chao);
  eq('a bala achou o chão', acertos.length, 1);
  ok('o acerto informa o rumo da bala, pra matéria sair contra ela',
    acertos[0].dir instanceof THREE.Vector3 && acertos[0].dir.y < 0);
  ok('e o impacto levantou fagulha', faisca.count > 0, `${faisca.count} partículas`);
  ok('desenhadas de verdade', faisca.points.geometry.drawRange.count === faisca.count);

  // Elas têm que MORRER: partícula que fica é lixo acumulando por tiro, e
  // numa briga de nove bots isso é o buffer inteiro em poucos segundos.
  for (let i = 0; i < 120; i++) faisca.update(DT);
  eq('e some sozinha depois de um instante', faisca.count, 0);
  eq('sem sobrar nada desenhando', faisca.points.geometry.drawRange.count, 0);

  // O buffer é fixo: impacto novo não pode crescer a geometria nem quebrar
  // quando o mundo inteiro atira ao mesmo tempo.
  const tamanho = faisca.points.geometry.attributes.position.array.length;
  const ponto = new THREE.Vector3(0, 1, -5);
  const rumo = new THREE.Vector3(0, 0, -1);
  for (let i = 0; i < 200; i++) faisca.burst(ponto, rumo, 'duro');
  eq('cheio, o buffer não cresce',
    faisca.points.geometry.attributes.position.array.length, tamanho);
  ok('e nada estoura o limite', faisca.count <= tamanho / 3, `${faisca.count} partículas`);
  note('teto de partículas', `${tamanho / 3} simultâneas`);
  suite('alcance máximo');

  // Antes as duas armas diziam `range: Infinity` e a única rédea era a LIFE de
  // 30 s. No plano a gravidade põe o tiro no chão a 125 m e parecia resolvido —
  // mas o alcance de um lançamento a 45° é v²/g = 4572 m, duas vezes e meia a
  // ilha. Mirando pra cima a bala saía do mapa e seguia sendo testada contra
  // todo alvo e toda parede por trinta segundos, sem poder acertar nada.
  const cena2 = new THREE.Scene();
  const tiro = createBallistics(cena2, []);
  const solta = (dir, opts = {}) => tiro.spawn(
    new THREE.Vector3(0, 1.7, 0), dir.clone().normalize(),
    { damage: 10, range: Infinity, ...opts });

  /** Voa até morrer. O teto de voltas é só pra não pendurar a suíte. */
  const voar = (bala, dt) => {
    for (let i = 0; i < 100000 && !bala.spent; i++) tiro.update(dt, [], null);
    return bala;
  };

  const primeira = solta(new THREE.Vector3(0, 0, -1));
  eq('arma sem limite próprio herda o teto do sistema',
    primeira.range, BULLET.RANGE_MAX);
  voar(primeira, DT);

  // 45° pra cima e sem terreno: é exatamente o caso que ia a 4572 m.
  const praCima = voar(solta(new THREE.Vector3(0, 1, -1)), DT);
  ok('a bala morre em vez de sair do mapa', praCima.spent);
  near('e para exatamente no teto', praCima.travelled, BULLET.RANGE_MAX, 1e-6);
  ok('sem precisar gastar a LIFE', praCima.life > 0,
    `${praCima.life.toFixed(1)} s de sobra`);
  note('alcance', `${BULLET.RANGE_MAX} m contra os ` +
    `${(BULLET.SPEED ** 2 / BULLET.GRAVITY).toFixed(0)} m de um lançamento a 45°`);

  // O alcance NÃO pode sair do framerate. Conferir `travelled` no fim do
  // quadro deixava a bala passar do teto antes de morrer, e o excesso era um
  // passo inteiro: 4,2 m a 60 fps e 8,4 a 30. É o mesmo defeito que a
  // integração trapezoidal do pulo existe pra corrigir, e aqui é pior —
  // nesses metros extras a bala ainda resolvia acerto.
  const porFps = [30, 60, 144].map((fps) => ({
    fps, andou: voar(solta(new THREE.Vector3(0, 0.4, -1)), 1 / fps).travelled
  }));
  for (const { fps, andou } of porFps) {
    near(`a ${fps} fps ela para no teto`, andou, BULLET.RANGE_MAX, 1e-6);
  }
  note('alcance por framerate',
    porFps.map((d) => `${d.fps}fps ${d.andou.toFixed(3)} m`).join(' · '));

  // O teto é MÁXIMO, não valor fixo: um cano curto pode alcançar menos.
  near('arma com limite próprio menor é respeitada',
    voar(solta(new THREE.Vector3(0, 0.4, -1), { range: 120 }), DT).travelled,
    120, 1e-6);

  // E o corte não pode comer acerto legítimo: alvo DENTRO do alcance morre
  // normalmente, mesmo caindo no último quadro antes do teto.
  eq('nada pendurado antes do teste de acerto', tiro.bullets.length, 0);
  const alvoRente = createDummy(cena2, [], { x: 0, z: -29, ground: 0 });
  const acertosNoLimite = [];
  tiro.onHit((r) => acertosNoLimite.push(r));
  const rente = solta(new THREE.Vector3(0, 0, -1), { range: 30 });
  for (let i = 0; i < 200 && !rente.spent; i++) tiro.update(DT, [alvoRente], null);
  eq('alvo logo antes do teto ainda é acertado', acertosNoLimite.length, 1);
  ok('e é ele mesmo', acertosNoLimite[0]?.target === alvoRente);
}
