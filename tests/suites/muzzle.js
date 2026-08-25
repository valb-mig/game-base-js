import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { Viewmodel } from '../../src/items/viewmodel.js';
import { initFirearm } from '../../src/items/firearm.js';
import { createBallistics } from '../../src/items/ballistics.js';
import { muzzleShot, createShot, createMuzzle } from '../../src/items/muzzle.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { getClass, PISTOL } from '../../src/items/classes.js';
import { BULLET } from '../../src/config.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;
const chao = { heightAt: () => 0, waterDepthAt: () => 0 };
const GRAUS = 180 / Math.PI;

export function run() {
  initInput();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  const scene = new THREE.Scene();
  const colliders = [];

  const player = new Player(camera, document.body, {
    colliders, terrain: chao, spawn: new THREE.Vector3(0, 0, 0)
  });
  player.controls.isLocked = true;
  player.setClass(getClass('assault'));
  // A geometria medida aqui é a da pistola, e `setClass` passou a entregar a
  // primária na mão quando a MP40 entrou.
  player.selectSlot(player.carried.indexOf(PISTOL));

  const viewmodel = new Viewmodel(camera, 1);
  viewmodel.setItem(player.equipped);

  const muzzle = createMuzzle();
  const shot = createShot();
  const olhar = new THREE.Vector3();

  // Só o viewmodel: a pose da arma não depende do resto do jogo, e é ela que
  // decide de onde a bala sai.
  const posar = (n = 1, opts = {}) => {
    Object.assign(player.gun, { aim: 0, kick: 0, cooldown: 0, ...opts.gun });
    player.running = opts.running ?? false;
    player.onGround = true;
    for (let i = 0; i < n; i++) viewmodel.update(DT, player);
  };

  /** Desvio do cano contra a frente da câmera, em graus. */
  const desvio = (bend = 1, rise = 90) => {
    viewmodel.readMuzzle(muzzle);
    muzzleShot(shot, camera, muzzle, bend, rise);
    olhar.set(0, 0, -1).applyQuaternion(camera.quaternion);
    return olhar.angleTo(shot.direction) * GRAUS;
  };

  /**
   * O mesmo desvio separado em lado e altura, com o teto vertical do jogo.
   * Com a câmera na identidade, a direção do tiro já está em espaço de
   * câmera: +lado é pra esquerda, +altura é pra cima.
   */
  const componentes = () => {
    viewmodel.readMuzzle(muzzle);
    muzzleShot(shot, camera, muzzle, BULLET.MUZZLE_BEND, BULLET.MUZZLE_RISE);
    return {
      lado: Math.atan2(-shot.direction.x, -shot.direction.z) * GRAUS,
      altura: Math.asin(shot.direction.y) * GRAUS
    };
  };

  suite('a bala sai da boca do cano');

  posar(4);
  ok('a pistola tem marcador de boca', viewmodel.readMuzzle(muzzle));
  viewmodel.readMuzzle(muzzle);
  muzzleShot(shot, camera, muzzle, 1);

  const olho = camera.position;
  const boca = shot.origin.clone().sub(olho);
  ok('a boca está à frente do olho', boca.z < -0.4, `${boca.z.toFixed(2)} m`);
  ok('e pra direita, onde está a mão', boca.x > 0.05, `${boca.x.toFixed(3)} m`);
  ok('e abaixo da linha dos olhos', boca.y < 0, `${boca.y.toFixed(3)} m`);
  between('a um braço de distância', boca.length(), 0.4, 0.8);
  note('boca em relação ao olho',
    `x ${boca.x.toFixed(3)} · y ${boca.y.toFixed(3)} · z ${boca.z.toFixed(3)}`);

  // A boca é dada em espaço de câmera: virar a cabeça tem que girar a origem
  // do tiro junto, senão ela ficaria plantada no mundo.
  camera.rotation.set(0, Math.PI, 0);
  camera.updateMatrixWorld(true);
  posar(1);
  viewmodel.readMuzzle(muzzle);
  muzzleShot(shot, camera, muzzle, 1);
  const virado = shot.origin.clone().sub(olho);
  ok('olhando pra trás, a boca vai pra trás junto', virado.z > 0.4, `${virado.z.toFixed(2)} m`);
  ok('e troca de lado no mundo', virado.x < -0.05, `${virado.x.toFixed(3)} m`);

  camera.rotation.set(0, 0, 0);
  camera.updateMatrixWorld(true);

  suite('arma zerada atira reto');

  // O caimento de 6° da pose de descanso é estética. Se o desvio fosse medido
  // contra a câmera, ele viraria erro fixo pra esquerda em todo tiro do
  // quadril — 60 cm de erro a 14 m, que lê como bug e não como recuo.
  posar(4);
  ok('do quadril, o cano aponta pra mira', desvio() < 0.05, `${desvio().toFixed(3)}°`);

  posar(4, { gun: { aim: 1 } });
  ok('na mira de ferro também', desvio() < 0.05, `${desvio().toFixed(3)}°`);

  posar(4, { gun: { aim: 0.5 } });
  ok('e no meio do caminho entre as duas', desvio() < 0.05, `${desvio().toFixed(3)}°`);

  suite('andando a arma fica reta');

  posar(40);
  const andando = componentes();
  ok('andando, o tiro não vai pro lado', Math.abs(andando.lado) < 0.05,
    `${andando.lado.toFixed(3)}°`);
  ok('nem pra cima ou pra baixo', Math.abs(andando.altura) < 0.05,
    `${andando.altura.toFixed(3)}°`);

  suite('correndo a arma atira pra esquerda');

  // pose de corrida: arma baixada e de lado
  posar(40, { running: true });
  const correndo = desvio();
  ok('correndo com a arma baixada, o tiro sai torto', correndo > 10,
    `${correndo.toFixed(1)}°`);

  const lado = componentes();
  ok('e ele sai pra esquerda', lado.lado > 20, `${lado.lado.toFixed(1)}° pra esquerda`);
  ok('não pro chão logo à frente', Math.abs(lado.altura) <= BULLET.MUZZLE_RISE + 0.01,
    `${lado.altura.toFixed(1)}° (teto ${BULLET.MUZZLE_RISE}°)`);
  note('correndo', `${lado.lado.toFixed(1)}° pra esquerda · ` +
    `${lado.altura.toFixed(1)}° na vertical`);

  // O teto é só na vertical: cortar o Y sem reescalar o resto mudaria o rumo
  // horizontal junto, e a bala sairia pra esquerda errada.
  posar(40, { running: true });
  const semTeto = componentes();
  viewmodel.readMuzzle(muzzle);
  muzzleShot(shot, camera, muzzle, BULLET.MUZZLE_BEND, 90);
  near('o teto vertical não mexe no rumo lateral',
    Math.atan2(-shot.direction.x, -shot.direction.z) * GRAUS, semTeto.lado, 0.01);
  ok('o tiro continua unitário', Math.abs(shot.direction.length() - 1) < 1e-6);

  // volta à guarda antes de medir o coice, senão a pose de corrida é que fala
  posar(40);
  posar(1, { gun: { kick: 1 } });
  viewmodel.readMuzzle(muzzle);
  muzzleShot(shot, camera, muzzle, 1);
  ok('e no coice a bala sobe', shot.direction.y > 0.02,
    `${(Math.asin(shot.direction.y) * GRAUS).toFixed(1)}°`);

  const coice = componentes();
  ok('mas dentro do teto vertical', coice.altura > 0.5
    && coice.altura <= BULLET.MUZZLE_RISE + 0.01, `${coice.altura.toFixed(1)}°`);

  suite('o amortecimento escala o desvio, não o eixo');

  posar(40, { running: true });
  const cheio = desvio(1);
  const meio = desvio(0.5);
  const nada = desvio(0);
  ok('metade do desvio é menos que o desvio inteiro', meio < cheio,
    `${meio.toFixed(1)}° < ${cheio.toFixed(1)}°`);
  ok('e mais que nenhum', meio > 1, `${meio.toFixed(1)}°`);
  ok('bend 0 atira exatamente na mira', nada < 0.01, `${nada.toFixed(4)}°`);
  // um desvio de 40° escalado pelo ângulo dá eixo errado; por slerp, não
  near('metade do desvio é metade do ângulo', meio, cheio / 2, 0.5);
  note('desvio correndo', `bend 1: ${cheio.toFixed(1)}° · ` +
    `bend ${BULLET.MUZZLE_BEND}: ${desvio(BULLET.MUZZLE_BEND).toFixed(1)}°`);

  suite('a arma dispara de onde ela está');

  const ballistics = createBallistics(scene, colliders);
  const gun = initFirearm(player, { targets: [] }, ballistics, viewmodel);

  const clicar = () => {
    dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
  };
  const atirar = () => {
    const antes = ballistics.bullets.length;
    clicar();
    gun.update(DT);
    endFrame();
    const bullet = ballistics.bullets[ballistics.bullets.length - 1];
    return ballistics.bullets.length > antes ? bullet : null;
  };

  posar(4);
  player.gun.cooldown = 0;
  // a munição do item é do catálogo e outras suítes já atiraram com ele: o que
  // vale aqui é a diferença, não o número absoluto
  const antesDeAtirar = player.equipped.ammo.loaded;
  const tiro = atirar();
  ok('o clique saiu bala', tiro !== null);
  ok('e ela nasceu na boca do cano, não no olho',
    tiro.position.distanceTo(olho) > 0.4,
    `${tiro.position.distanceTo(olho).toFixed(2)} m do olho`);

  // Arma encostada em parede: a boca fica do outro lado dela. Nascer ali é
  // atirar através da parede.
  colliders.push({
    box: new THREE.Box3(
      new THREE.Vector3(-2, olho.y - 2, -0.3),
      new THREE.Vector3(2, olho.y + 2, -0.2)),
    standable: false
  });
  posar(4);
  player.gun.cooldown = 0;
  const encostado = atirar();
  ok('encostado numa parede, a bala volta a nascer no olho',
    encostado.position.distanceTo(olho) < 0.001,
    `${encostado.position.distanceTo(olho).toFixed(4)} m`);
  colliders.pop();

  eq('e a munição foi debitada nos dois tiros',
    antesDeAtirar - player.equipped.ammo.loaded, 2);
}
