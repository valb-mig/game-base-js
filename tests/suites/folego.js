import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { STAMINA, SWAP } from '../../src/config.js';
import { jumpCost, canRun, canJump, updateStamina } from '../../src/player/stamina.js';
import { MP40, PISTOL, KNIFE, SHOVEL, getClass } from '../../src/items/classes.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;
const chao = { heightAt: () => 0, waterDepthAt: () => 0 };

function jogador() {
  const p = new Player(new THREE.PerspectiveCamera(70, 1, 0.1, 400), document.body,
    { colliders: [], terrain: chao, spawn: new THREE.Vector3(0, 0, 0) });
  p.setClass(getClass('assault'));
  p.respawn();
  p.controls.isLocked = true;
  return p;
}

/** Segundos de corrida até o fôlego acabar, com um item na mão. */
function correrAte(item) {
  const p = jogador();
  p.forceSlot(p.carried.findIndex((i) => i?.id === item.id));
  p.running = true;
  p.onGround = true;

  // `speed` é derivado da velocidade, não atribuível: correr de mentira se
  // faz pondo velocidade, que é o que a locomoção poria.
  let t = 0;
  for (let i = 0; i < 60 * 60 && p.stamina > 0; i++) {
    p.running = true;
    p.velocity.set(8, 0, 0);
    updateStamina(p, DT);
    t += DT;
  }
  return t;
}

export function run() {
  initInput();

  suite('arma tem peso');

  ok('a MP40 é a mais pesada', MP40.weight > PISTOL.weight && MP40.weight > SHOVEL.weight,
    `${MP40.weight} kg`);
  ok('e a faca a mais leve', KNIFE.weight < SHOVEL.weight, `${KNIFE.weight} kg`);
  ok('todo item empunhável declara peso',
    [MP40, PISTOL, KNIFE, SHOVEL].every((i) => i.weight > 0));

  suite('correr gasta fôlego, e o peso pesa');

  const p = jogador();
  eq('nasce com o fôlego cheio', p.stamina, STAMINA.MAX);

  const comFaca = correrAte(KNIFE);
  const comMP40 = correrAte(MP40);

  ok('com a MP40 o fôlego acaba mais cedo', comMP40 < comFaca,
    `${comMP40.toFixed(1)}s contra ${comFaca.toFixed(1)}s com a faca`);
  between('e a faca rende bem mais', comFaca / comMP40, 1.3, 3,
    `${(comFaca / comMP40).toFixed(2)}× mais tempo`);
  note('corrida até secar',
    `faca ${comFaca.toFixed(1)}s · MP40 ${comMP40.toFixed(1)}s`);

  suite('sem fôlego não se corre, mas se anda');

  const cansado = jogador();
  cansado.stamina = 0;
  cansado.running = false;
  ok('zerado, ele não arranca', !canRun(cansado));

  cansado.stamina = STAMINA.MINIMO_PRA_CORRER - 1;
  ok('e com um fiapo também não', !canRun(cansado));
  cansado.stamina = STAMINA.MINIMO_PRA_CORRER + 1;
  ok('mas com o mínimo, sim', canRun(cansado));

  // Já correndo ele continua até raspar: parar de correr por causa de um
  // limiar no meio da fuga seria pior que ficar sem.
  cansado.running = true;
  cansado.stamina = 1;
  ok('quem já está correndo continua até secar', canRun(cansado));

  suite('pular cobra de uma vez, e o peso cobra mais');

  const comArma = jogador();
  comArma.forceSlot(comArma.carried.findIndex((i) => i?.id === 'mp40'));
  const custoPesado = jumpCost(comArma);

  comArma.forceSlot(comArma.carried.findIndex((i) => i?.id === 'kabar'));
  const custoLeve = jumpCost(comArma);

  ok('pular com a MP40 custa mais que com a faca', custoPesado > custoLeve,
    `${custoPesado.toFixed(1)} contra ${custoLeve.toFixed(1)}`);
  note('custo do pulo', `MP40 ${custoPesado.toFixed(1)} · faca ${custoLeve.toFixed(1)}`);

  const pulador = jogador();
  pulador.stamina = custoPesado - 1;
  pulador.forceSlot(pulador.carried.findIndex((i) => i?.id === 'mp40'));
  ok('sem fôlego pro pulo inteiro, ele não pula', !canJump(pulador));
  pulador.stamina = custoPesado + 1;
  ok('com o suficiente, pula', canJump(pulador));

  const quantos = Math.floor(STAMINA.MAX / custoPesado);
  between('um fôlego cheio dá alguns pulos com a MP40', quantos, 2, 8,
    `${quantos} pulos`);

  suite('recuperar custa parar de verdade');

  const respirando = jogador();
  respirando.stamina = 40;
  respirando.running = false;
  respirando.velocity.set(0, 0, 0);

  // O respiro existe pra que largar o Shift por um instante no meio da fuga
  // não devolva fôlego: recuperar tem que custar parar.
  updateStamina(respirando, DT);
  near('no primeiro quadro parado, nada volta', respirando.stamina, 40, 1e-9);

  for (let i = 0; i < Math.ceil(STAMINA.ESPERA / DT) + 2; i++) {
    updateStamina(respirando, DT);
  }
  ok('passado o respiro, começa a voltar', respirando.stamina > 40,
    `${respirando.stamina.toFixed(1)}`);

  for (let i = 0; i < 60 * 20; i++) updateStamina(respirando, DT);
  eq('e enche até o máximo, não mais', respirando.stamina, STAMINA.MAX);

  suite('trocar de item leva tempo');

  const trocador = jogador();
  const daMP40 = trocador.carried.findIndex((i) => i?.id === 'mp40');
  const daFaca = trocador.carried.findIndex((i) => i?.id === 'kabar');
  trocador.forceSlot(daMP40);

  eq('começa com a MP40', trocador.equipped.id, 'mp40');
  ok('a troca é aceita', trocador.selectSlot(daFaca));
  ok('mas ela não aconteceu ainda', trocador.equipped.id === 'mp40');
  ok('e o jogo sabe que está trocando', trocador.swapping);

  // Guardar primeiro: o item só muda no fundo do movimento.
  let quadros = 0;
  let trocouEm = null;
  for (let i = 0; i < 600 && trocador.swapping; i++) {
    quadros++;
    if (trocador.advanceSwap(DT)) trocouEm = quadros * DT;
  }
  eq('no fim, a faca está na mão', trocador.equipped.id, 'kabar');
  ok('e ela chegou no MEIO da troca, não no fim',
    trocouEm !== null && trocouEm < quadros * DT - 0.05,
    `mudou aos ${trocouEm?.toFixed(2)}s de ${(quadros * DT).toFixed(2)}s`);

  const tempoTotal = quadros * DT;
  const esperado = SWAP.GUARDAR + MP40.weight * SWAP.GUARDAR_POR_KG
    + SWAP.SACAR + KNIFE.weight * SWAP.SACAR_POR_KG;
  near('e o tempo sai do peso das duas', tempoTotal, esperado, 0.04,
    `${tempoTotal.toFixed(2)}s`);
  note('MP40 -> faca', `${tempoTotal.toFixed(2)}s`);

  suite('arma pesada demora mais pra sacar');

  const rapido = jogador();
  const lento = jogador();
  const medir = (quem, de, para) => {
    quem.forceSlot(quem.carried.findIndex((i) => i?.id === de));
    quem.selectSlot(quem.carried.findIndex((i) => i?.id === para));
    let n = 0;
    while (quem.swapping && n < 600) { quem.advanceSwap(DT); n++; }
    return n * DT;
  };

  const paraFaca = medir(rapido, 'kabar', 'm1911');
  const paraMP40 = medir(lento, 'kabar', 'mp40');
  ok('sacar a MP40 demora mais que sacar a Colt', paraMP40 > paraFaca,
    `${paraMP40.toFixed(2)}s contra ${paraFaca.toFixed(2)}s`);

  suite('trocar no meio de outra troca recomeça');

  const indeciso = jogador();
  indeciso.forceSlot(daMP40);
  indeciso.selectSlot(daFaca);
  indeciso.advanceSwap(DT * 3);

  const daPistola = indeciso.carried.findIndex((i) => i?.id === 'm1911');
  ok('dá pra corrigir a tecla errada no meio', indeciso.selectSlot(daPistola));
  for (let i = 0; i < 600 && indeciso.swapping; i++) indeciso.advanceSwap(DT);
  eq('e o que chega na mão é o último pedido', indeciso.equipped.id, 'm1911');

  suite('o fantasma não cansa');

  // Espectador voando não gasta fôlego: ele não está no jogo.
  const fantasma = jogador();
  fantasma.stamina = 10;
  fantasma.spectating = true;
  fantasma.running = true;
  fantasma.velocity.set(20, 0, 0);
  updateStamina(fantasma, DT);
  eq('fantasma tem sempre o fôlego cheio', fantasma.stamina, STAMINA.MAX);

  endFrame();
}
