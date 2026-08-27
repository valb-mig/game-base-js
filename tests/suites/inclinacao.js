import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { INCLINACAO } from '../../src/config.js';
import {
  updateInclinacao, zerarInclinacao, travarE,
  deslocamentoLateral, rolagemDaInclinacao
} from '../../src/player/inclinacao.js';
import { headingDegrees, lookPitch } from '../../src/player/heading.js';
import { createBallistics } from '../../src/items/ballistics.js';
import { createMuzzle, createShot, muzzleShot } from '../../src/items/muzzle.js';
import { playerAsTarget } from '../../src/bots/bots.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;

/**
 * Inclinar o corpo pra fora da cobertura (Q e E).
 *
 * O que esta suíte prova é COMPORTAMENTO, não a conta: que a cabeça inclinada
 * VÊ o que a cabeça reta não vê (pela mesma `ballistics.blocked` do jogo), que
 * a bala sai do lugar novo, que a hitbox anda junto (pela mesma balística que
 * resolve região), que contra parede não passa e que o corpo NÃO se move. Os
 * centímetros aparecem como `note`, que é onde número medido pertence.
 *
 * Nada aqui mede tempo de relógio: sob `--virtual-time-budget` ele não anda.
 * O tempo de entrada e de saída é contado em QUADROS.
 */
export function run() {
  initInput();

  const colisores = [];
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  const player = new Player(camera, document.body, { colliders: colisores });

  const down = (code) => dispatchEvent(new KeyboardEvent('keydown', { code }));
  const up = (code) => dispatchEvent(new KeyboardEvent('keyup', { code }));
  const tap = (code) => { down(code); up(code); };
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) { player.update(DT); endFrame(); }
  };
  const largarTudo = () => {
    dispatchEvent(new Event('blur'));
    endFrame();
  };
  const recentrar = () => {
    zerarInclinacao(player);
    player.object.position.set(0, player.eyeY, 0);
    player.object.quaternion.identity();   // olhando pro -Z: a direita é o +X
    player.velocity.set(0, 0, 0);
  };
  const caixa = (min, max, standable = false) => ({
    box: new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)),
    standable
  });

  // ------------------------------------------------------------ teclas e lado
  suite('inclinar: as teclas e o lado');
  recentrar();
  step(1);
  eq('parado, ninguém está inclinado', player.inclina, 0);

  down('KeyE');
  step(30);
  near('segurar E chega na inclinação cheia', player.inclina, 1, 1e-6);
  const paraDireita = player.object.position.x - player.bodyX;
  ok('E leva o olho pra DIREITA do jogador (+X olhando pro norte)',
    paraDireita > 0, paraDireita.toFixed(3));
  between('deslocamento do olho, de pé (m)', paraDireita, 0.20, 0.30);
  note('deslocamento do olho, de pé', `${(paraDireita * 100).toFixed(1)} cm`);
  note('queda do olho, de pé', `${(-player.inclinaOffset.y * 100).toFixed(1)} cm`);
  note('rolagem da vista', `${(-rolagemDaInclinacao(player) * 180 / Math.PI).toFixed(1)}°`);
  near('deslocamentoLateral concorda com o que foi escrito no position',
    deslocamentoLateral(player), paraDireita, 1e-9);

  largarTudo();
  step(30);
  down('KeyQ');
  step(30);
  const paraEsquerda = player.object.position.x - player.bodyX;
  near('segurar Q inclina o mesmo tanto', player.inclina, -1, 1e-6);
  near('Q é o espelho do E', paraEsquerda, -paraDireita, 1e-9);

  down('KeyE');   // as duas juntas
  step(30);
  near('Q e E juntos se cancelam', player.inclina, 0, 1e-9);
  largarTudo();

  // ------------------------------------------------- o E é disputado por três
  suite('inclinar: o E disputado');
  recentrar();
  down('KeyE');
  travarE(player);   // é o que `drops` e `veiculos` fazem ao consumir o toque
  step(30);
  eq('E consumido por apanhar/embarcar não inclina ninguém', player.inclina, 0);
  up('KeyE');
  step(2);
  down('KeyE');
  step(30);
  near('e o E volta a valer no toque seguinte', player.inclina, 1, 1e-6);
  largarTudo();
  step(20);

  // ----------------------------------------------------------- tempo, medido
  suite('inclinar: tempo de entrada e de saída');
  recentrar();
  down('KeyE');
  let quadros = 0;
  while (player.inclina < 1 && quadros < 300) { step(1); quadros++; }
  const tempoEntra = quadros * DT;
  between('sai da cobertura no tempo declarado (s)',
    tempoEntra, INCLINACAO.TEMPO_ENTRA, INCLINACAO.TEMPO_ENTRA + DT);
  note('tempo pra inclinar cheio', `${tempoEntra.toFixed(3)} s (${quadros} quadros)`);

  up('KeyE');
  quadros = 0;
  while (player.inclina > 0 && quadros < 300) { step(1); quadros++; }
  const tempoVolta = quadros * DT;
  between('e volta mais rápido do que sai (s)',
    tempoVolta, INCLINACAO.TEMPO_VOLTA, INCLINACAO.TEMPO_VOLTA + DT);
  ok('recolher-se é mais rápido que espiar', tempoVolta < tempoEntra,
    `${tempoVolta.toFixed(3)} s contra ${tempoEntra.toFixed(3)}`);
  largarTudo();

  // ------------------------------------------------------ postura e estado
  suite('inclinar: quem pode e quem não pode');
  recentrar();
  tap('KeyC');
  step(30);
  down('KeyE');
  step(30);
  const agachado = player.object.position.x - player.bodyX;
  ok('agachado inclina', agachado > 0.05, agachado.toFixed(3));
  ok('mas menos que de pé: o braço do quadril ao olho encurta',
    agachado < paraDireita * 0.75, `${(agachado * 100).toFixed(1)} cm`);
  note('deslocamento do olho, agachado', `${(agachado * 100).toFixed(1)} cm`);

  tap('KeyZ');   // deitado
  step(60);
  eq('deitado não inclina', player.inclina, 0);
  tap('KeyZ');
  step(60);
  largarTudo();

  recentrar();
  down('KeyE');
  step(20);
  ok('inclinado antes de correr', player.inclina > 0.9);
  down('KeyW');
  tap('ShiftLeft');
  step(40);
  ok('correndo de verdade', player.running === true, player.state);
  eq('correr apruma o corpo', player.inclina, 0);
  largarTudo();
  step(30);

  // Nadar e o ar entram pelo módulo direto: `updateWaterState` reescreveria
  // `swimming` a cada quadro num mundo sem terreno, e o que se quer provar
  // aqui é a guarda, não a água.
  recentrar();
  down('KeyE');
  for (let i = 0; i < 30; i++) updateInclinacao(player, DT);
  near('inclinado em terra firme', player.inclina, 1, 1e-6);
  player.swimming = true;
  for (let i = 0; i < 30; i++) updateInclinacao(player, DT);
  eq('nadando não inclina', player.inclina, 0);
  player.swimming = false;
  for (let i = 0; i < 30; i++) updateInclinacao(player, DT);
  near('e volta a inclinar ao sair da água', player.inclina, 1, 1e-6);
  player.onGround = false;
  for (let i = 0; i < 30; i++) updateInclinacao(player, DT);
  eq('no ar não inclina', player.inclina, 0);
  player.onGround = true;
  largarTudo();
  step(20);

  // -------------------------------------------------------- parede não passa
  suite('inclinar: contra parede');
  recentrar();
  // Parede rente ao ombro direito: a face dela a 50 cm do corpo, e o corpo é
  // um cilindro de 40 cm de raio — sobram 10 cm pro olho andar.
  colisores.push(caixa([0.5, 0, -2], [3, 3, 2]));
  const antesX = player.bodyX;
  const antesZ = player.bodyZ;
  down('KeyE');
  let maisLonge = 0;
  for (let i = 0; i < 60; i++) {
    step(1);
    maisLonge = Math.max(maisLonge, player.object.position.x);
  }
  ok('o olho nunca chega na face da parede', maisLonge < 0.5, maisLonge.toFixed(3));
  ok('inclina o que cabe, e só', player.inclina > 0 && player.inclina < 0.5,
    player.inclina.toFixed(3));
  note('inclinação possível com parede a 50 cm',
    `${(player.inclina * 100).toFixed(0)}% (${(maisLonge * 100).toFixed(1)} cm de olho)`);
  near('e o CORPO não andou nada', player.bodyX, antesX, 1e-9);
  near('nem em z', player.bodyZ, antesZ, 1e-9);

  // parede colada: não sobra nada, e isso não pode travar ninguém
  colisores.length = 0;
  colisores.push(caixa([0.42, 0, -2], [3, 3, 2]));
  step(30);
  eq('sem espaço nenhum, simplesmente não inclina', player.inclina, 0);
  near('e a câmera volta pro corpo', player.object.position.x, player.bodyX, 1e-9);
  largarTudo();
  step(20);
  colisores.length = 0;

  // ------------------------------------------ a cabeça inclinada vê mais
  suite('inclinar: a linha de visão que se ganha');
  const cena = new THREE.Scene();
  const balistica = createBallistics(cena, colisores);

  // Quina a 2 m à frente, terminando em x = 0,16: quem está atrás dela na
  // linha x = 0 não vê o que está a 10 m, e quem espia vê.
  const quina = caixa([-3, 0, -2.1], [0.16, 3, -2]);
  colisores.push(quina);
  recentrar();
  step(1);
  const alvoLonge = new THREE.Vector3(0, 1.4, -10);
  const olhoReto = player.object.position.clone();
  const tapadoReto = balistica.blocked(olhoReto, alvoLonge);
  ok('a cabeça reta não vê o alvo: a quina está na frente', tapadoReto === true);

  down('KeyE');
  step(40);
  near('inclinado por inteiro (a quina está longe do ombro)',
    player.inclina, 1, 1e-6);
  const olhoEspiando = player.object.position.clone();
  const tapadoEspiando = balistica.blocked(olhoEspiando, alvoLonge);
  ok('a cabeça inclinada VÊ o alvo', tapadoEspiando === false);
  const doCorpo = new THREE.Vector3(player.bodyX, player.eyeY, player.bodyZ);
  ok('e do CORPO continua tapado: quem espia é a cabeça, não o soldado',
    balistica.blocked(doCorpo, alvoLonge) === true);
  note('quina a 2,05 m, alvo a 10 m',
    `${((olhoEspiando.x - olhoReto.x) * 100).toFixed(1)} cm de olho abrem a linha`);

  // ------------------------------------------------- e a bala sai do lugar
  suite('inclinar: a boca do cano vai junto');
  const boca = createMuzzle();
  boca.position.set(0.11, -0.13, -0.45);   // onde a MP40 fica no espaço da câmera
  const tiro = createShot();
  const rumo = new THREE.Vector3();

  const vitima = new Player(new THREE.PerspectiveCamera(70, 1, 0.1, 400),
    document.body, { colliders: colisores });
  vitima.object.position.set(0, vitima.eyeY, -10);
  const alvoVitima = playerAsTarget(vitima, () => {});
  const peito = new THREE.Vector3(0, vitima.feetY + vitima.height * 0.62, -10);

  const atirar = () => {
    camera.updateMatrixWorld();
    muzzleShot(tiro, camera, boca, 1, 90);
    rumo.copy(peito).sub(tiro.origin).normalize();
    const vida = vitima.health;
    balistica.spawn(tiro.origin.clone(), rumo, { damage: 20, range: 600 });
    for (let i = 0; i < 6; i++) balistica.update(DT, [alvoVitima], null);
    const doeu = vitima.health < vida;
    vitima.health = vida;
    return { doeu, origem: tiro.origin.clone() };
  };

  const inclinado = atirar();
  ok('inclinado, a bala passa pela quina e acerta', inclinado.doeu === true);

  largarTudo();
  step(30);
  eq('aprumado de novo', player.inclina, 0);
  const reto = atirar();
  ok('aprumado, a mesma mira bate na quina', reto.doeu === false);
  const andouABoca = inclinado.origem.x - reto.origem.x;
  between('a boca do cano anda com o corpo (m)', andouABoca, 0.15, 0.35);
  note('deslocamento da BOCA DO CANO', `${(andouABoca * 100).toFixed(1)} cm`);
  colisores.length = 0;

  // ------------------------------------------------------ a hitbox acompanha
  suite('inclinar: a hitbox acompanha');
  // Agora quem inclina é a VÍTIMA, e ela é dirigida pelo módulo direto — as
  // teclas são globais, e o atirador não pode inclinar junto.
  vitima.object.position.set(0, vitima.eyeY, 0);
  vitima.object.quaternion.identity();
  zerarInclinacao(vitima);

  const cabecaDe = (alvo) => {
    const parte = alvo.body([]).find((p) => p.regiao?.id === 'cabeca');
    return new THREE.Vector3(
      alvo.x + (parte.minX + parte.maxX) / 2,
      (alvo.feetY ?? 0) + (parte.minY + parte.maxY) / 2,
      alvo.z + (parte.minZ + parte.maxZ) / 2
    );
  };
  const tiroNa = (ponto) => {
    let acerto = null;
    balistica.onHit((r) => { acerto = r; });
    const vida = vitima.health;
    balistica.spawn(
      new THREE.Vector3(ponto.x, ponto.y, ponto.z + 8),
      new THREE.Vector3(0, 0, -1),
      { damage: 10, range: 60 }
    );
    for (let i = 0; i < 6; i++) balistica.update(DT, [alvoVitima], null);
    vitima.health = vida;
    return acerto;
  };

  const cabecaReta = cabecaDe(alvoVitima);
  const peNaReta = (() => {
    const parte = alvoVitima.body([]).find((p) => p.regiao?.id === 'perna');
    return alvoVitima.x + (parte.minX + parte.maxX) / 2;
  })();
  const naCabecaReta = tiroNa(cabecaReta);
  eq('reta, o tiro na cabeça é tiro na cabeça', naCabecaReta?.regiao?.id, 'cabeca');

  down('KeyE');
  for (let i = 0; i < 40; i++) updateInclinacao(vitima, DT);
  near('a vítima está inclinada', vitima.inclina, 1, 1e-6);
  const cabecaEspiando = cabecaDe(alvoVitima);
  const andouACabeca = cabecaEspiando.x - cabecaReta.x;
  ok('a caixa da cabeça andou pro mesmo lado do olho',
    andouACabeca > 0.08, andouACabeca.toFixed(3));
  // A prova de que a hitbox não mente: a caixa da cabeça anda EXATAMENTE o
  // que o olho anda. Foi medindo isto que apareceu a inclinação entrando duas
  // vezes — a âncora do alvo era o olho, e as caixas iam por cima: 41 cm de
  // cabeça pra 26 de olho, com o pé andando junto.
  near('e anda o mesmo tanto que o olho: a hitbox não mente',
    andouACabeca, deslocamentoLateral(vitima), 0.005);
  note('deslocamento da CAIXA da cabeça', `${(andouACabeca * 100).toFixed(1)} cm`);
  note('deslocamento do OLHO da vítima',
    `${(deslocamentoLateral(vitima) * 100).toFixed(1)} cm`);

  const peDe = (alvo) => {
    const parte = alvo.body([]).find((p) => p.regiao?.id === 'perna');
    return alvo.x + (parte.minX + parte.maxX) / 2;
  };
  near('e a perna NÃO anda: o pivô é o quadril, e os pés ficam atrás da quina',
    peDe(alvoVitima), peNaReta, 1e-9);

  const noVazio = tiroNa(cabecaReta);
  ok('o tiro no lugar de antes NÃO acerta mais a cabeça',
    noVazio?.regiao?.id !== 'cabeca', noVazio?.regiao?.id ?? 'nada');
  const noNovo = tiroNa(cabecaEspiando);
  eq('e o tiro no lugar novo acerta', noNovo?.regiao?.id, 'cabeca');
  largarTudo();
  zerarInclinacao(vitima);

  // --------------------------------------------------------------- a câmera
  suite('inclinar: a rolagem da vista');
  // Orientação torta de propósito: é olhando pra trás e pra baixo que escrever
  // `camera.rotation.z` põe a câmera de cabeça pra baixo, porque
  // `camera.rotation` decodifica em XYZ e o PointerLockControls compõe em YXZ.
  recentrar();
  player.object.quaternion.setFromEuler(
    new THREE.Euler(-35 * Math.PI / 180, 130 * Math.PI / 180, 0, 'YXZ'));
  player.rollImpulse = 0;
  player.shake = 0;
  player.lean = 0;
  step(1);

  const scratch = new THREE.Vector3();
  const rumoAntes = headingDegrees(player.object.quaternion, scratch);
  const caimentoAntes = lookPitch(player.object.quaternion, scratch);

  // Um ponto LONGE do centro da tela, ancorado na câmera: se ele caísse no
  // meio do quadro, as duas projeções coincidiriam e o teste passaria verde
  // estando errado. Foi o que aconteceu com o volante do jipe.
  //
  // E ele é ancorado no MUNDO, não na câmera: ponto fixo no espaço da câmera
  // gira junto com ela e projeta sempre no mesmo pixel — foi o que aconteceu
  // na primeira versão deste teste, que media 0° de giro com a vista rolando.
  // Longe (2 km) pra que os 26 cm que o olho anda não virem paralaxe: a 10 m
  // eles sozinhos girariam a imagem 1,4°.
  camera.updateMatrixWorld();
  const noMundo = new THREE.Vector3(3, 2, -10)
    .applyQuaternion(camera.quaternion).setLength(2000);
  const projetar = () => {
    camera.updateMatrixWorld();
    return noMundo.clone().add(camera.position).project(camera);
  };
  const ndcReto = projetar();
  between('o ponto medido está longe do centro da tela',
    Math.hypot(ndcReto.x, ndcReto.y), 0.2, 1);

  down('KeyE');
  step(40);
  const ndcEspiando = projetar();
  const rumoDepois = headingDegrees(player.object.quaternion, scratch);
  const caimentoDepois = lookPitch(player.object.quaternion, scratch);

  near('inclinar não mexe no rumo', rumoDepois, rumoAntes, 0.01);
  near('nem no caimento do olhar', caimentoDepois, caimentoAntes, 1e-4);

  const girou = Math.atan2(ndcEspiando.y, ndcEspiando.x)
    - Math.atan2(ndcReto.y, ndcReto.x);
  // A IMAGEM gira ao contrário da câmera: o mundo está parado, é o quadro que
  // tomba. Medir o módulo esconderia justamente uma rolagem pro lado errado.
  near('a imagem gira exatamente a rolagem declarada, e pro outro lado',
    girou, -rolagemDaInclinacao(player), 0.01);
  note('giro medido na tela', `${(girou * 180 / Math.PI).toFixed(2)}°`);
  largarTudo();
  step(30);
  zerarInclinacao(player);
  colisores.length = 0;
}
