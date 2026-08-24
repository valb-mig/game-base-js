import * as THREE from 'three';
import { createBallistics } from '../../src/items/ballistics.js';
import { createDummy } from '../../src/world/dummy.js';
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
}
