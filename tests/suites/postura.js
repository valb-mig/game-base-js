import * as THREE from 'three';
import { carregarSoldado, soldadoPronto, caixasDoModelo, apoioDaPostura } from '../../src/bots/model.js';
import { usarMedidasDoModelo, corpoDe } from '../../src/game/hitboxes.js';
import { createSoldier, SOLDIER } from '../../src/bots/soldier.js';
import { POSTURAS, NOMES_DE_POSTURA, posturaDe } from '../../src/bots/posturas.js';
import { initPlayerBody } from '../../src/player/body.js';
import { Player } from '../../src/player/player.js';
import { initInput } from '../../src/core/input.js';
import { suite, ok, eq, near, note } from '../assert.js';

const DT = 1 / 60;

/** O envelope da hitbox inteira, no sistema do corpo. */
function envelope(partes) {
  const e = {
    minX: Infinity, maxX: -Infinity,
    minY: Infinity, maxY: -Infinity,
    minZ: Infinity, maxZ: -Infinity
  };
  for (const p of partes) {
    e.minX = Math.min(e.minX, p.minX); e.maxX = Math.max(e.maxX, p.maxX);
    e.minY = Math.min(e.minY, p.minY); e.maxY = Math.max(e.maxY, p.maxY);
    e.minZ = Math.min(e.minZ, p.minZ); e.maxZ = Math.max(e.maxZ, p.maxZ);
  }
  return e;
}

export function run() {
  semArquivo();
  return carregarSoldado().then(comModelo, () => {
    suite('postura');
    note('modelo não carregou', 'sem arquivo não há pose pra medir');
  });
}

function semArquivo() {
  suite('a postura sai da altura, e as fronteiras ficam longe das três');

  eq('de pé', posturaDe(1.75, 1.75), 'pe');
  eq('quase de pé continua de pé', posturaDe(1.70, 1.75), 'pe');
  eq('agachado', posturaDe(1.15, 1.75), 'agachado');
  eq('o agachamento do jogador também', posturaDe(0.95, 1.75), 'agachado');
  eq('deitado', posturaDe(0.52, 1.75), 'deitado');
  eq('o do jogador também', posturaDe(0.50, 1.75), 'deitado');
  note('por que longe', 'no meio da transição o corpo tem que escolher uma, não piscar entre duas');

  suite('as três posturas têm a mesma forma');

  // Um `null` no meio vira caso especial em cada consumidor: a medida da
  // hitbox, o corpo do bot, o corpo do jogador e o teste.
  for (const nome of NOMES_DE_POSTURA) {
    const pose = POSTURAS[nome];
    ok(`${nome} existe declarada`, Boolean(pose));
    ok(`${nome} tem ossos`, pose.ossos && typeof pose.ossos === 'object');
    eq(`${nome} tem deslocamento de quadril`, pose.quadril.length, 3);
    eq(`${nome} tem deslocamento de porte`, pose.porte.length, 3);
  }
  eq('de pé é a pose vazia', Object.keys(POSTURAS.pe.ossos).length, 0);
}

function comModelo() {
  suite('deitado é um corpo NO CHÃO, não um soldado achatado');

  if (!soldadoPronto()) {
    note('modelo não carregou', 'sem arquivo não há pose pra medir');
    return;
  }
  // Ligada aqui e DESLIGADA no fim.
  //
  // `usarMedidasDoModelo` é estado de módulo, compartilhado com todas as
  // suítes que vêm depois — e a de dano roda sem arquivo de propósito, pra
  // exercitar a tabela escrita à mão. Deixar a injeção ligada quebrava ela
  // três suítes adiante, com um erro que não fala de postura. É a mesma
  // regra do carregador de munição: quem mexe devolve como encontrou.
  usarMedidasDoModelo(caixasDoModelo);

  const dePe = envelope(corpoDe(SOLDIER.ALTURA, [], 'pe'));
  const agachado = envelope(corpoDe(SOLDIER.ALTURA_AGACHADO, [], 'agachado'));
  const deitado = envelope(corpoDe(SOLDIER.ALTURA_DEITADO, [], 'deitado'));

  const compDePe = dePe.maxZ - dePe.minZ;
  const compDeitado = deitado.maxZ - deitado.minZ;

  // É ISTO que a escala em Y mentia. Um homem no chão tem quase dois metros
  // de comprimento; a hitbox achatada tinha os 64 cm do corpo em pé, ou
  // seja, de lado o tiro passava por cima de um corpo que estava ali, e de
  // frente ele era um alvo de meio metro de lado.
  ok('o corpo deitado é COMPRIDO', compDeitado > compDePe * 2,
    `${compDeitado.toFixed(2)} m contra ${compDePe.toFixed(2)} m de pé`);
  ok('e baixo', deitado.maxY < 0.6, `${deitado.maxY.toFixed(2)} m de altura`);
  ok('agachado continua ocupando a planta de um homem agachado',
    Math.abs((agachado.maxZ - agachado.minZ) - compDePe) < 0.25,
    `${(agachado.maxZ - agachado.minZ).toFixed(2)} m`);

  suite('cada postura chega na altura declarada, e pousa no chão');

  for (const [nome, altura, envolve] of [
    ['de pé', SOLDIER.ALTURA, dePe],
    ['agachado', SOLDIER.ALTURA_AGACHADO, agachado],
    ['deitado', SOLDIER.ALTURA_DEITADO, deitado]
  ]) {
    near(`${nome}: o topo bate com a altura`, envolve.maxY, altura, 0.001);
    // Um palmo de tolerância: joelho e cotovelo encostam no chão e a caixa
    // deles passa um pouco por baixo. O que não pode é a postura enterrar o
    // corpo — era meio metro antes de o apoio ser medido.
    ok(`${nome}: não afunda no chão`, envolve.minY > -0.16,
      `${envolve.minY.toFixed(3)} m`);
  }

  suite('a hitbox e a malha pousam na MESMA altura');

  // Se a caixa subir e o corpo não, a bala passa a acertar acima do soldado
  // — e ninguém vê isso numa foto. Os dois leem `apoioDaPostura`, e este
  // teste é o que garante que continuam lendo.
  const piso = { heightAt: () => 0 };
  for (const [nome, estado] of [
    ['agachado', { crouching: true }],
    ['deitado', { deitado: true }]
  ]) {
    const bot = createSoldier(new THREE.Scene(), [], {
      id: 1, team: 'karnia', x: 0, z: 0, terrain: piso, weapons: []
    });
    Object.assign(bot, estado);
    bot.update(DT);
    bot.update(DT);

    eq(`${nome}: o soldado se declara nessa postura`, bot.postura, nome);

    const quadril = bot.group.getObjectByName('hips')
      .getWorldPosition(new THREE.Vector3());
    const partes = bot.body([]);
    const caixaDoQuadril = partes.find((p) => p.peca?.id === 'quadril')
      ?? partes.find((p) => p.regiao?.id === 'tronco');

    ok(`${nome}: o quadril desenhado está dentro da caixa do tronco`,
      quadril.y > caixaDoQuadril.minY - 0.2 && quadril.y < caixaDoQuadril.maxY + 0.2,
      `osso em ${quadril.y.toFixed(2)}, caixa ${caixaDoQuadril.minY.toFixed(2)}..${caixaDoQuadril.maxY.toFixed(2)}`);
    ok(`${nome}: o apoio é o mesmo número pros dois`,
      apoioDaPostura(nome) > 0, `${apoioDaPostura(nome).toFixed(3)} m`);
  }
  suite('o jogador nunca vê o próprio peito');

  // O corpo em primeira pessoa é ancorado no OLHO, e a postura o reposiciona:
  // com o tronco inclinado do agachamento, o peito passava 5 cm à FRENTE da
  // lente e tapava a tela com uma parede de farda. Nenhuma foto de fora
  // mostra isso — de pé o corpo está fora do quadro e as três posturas saem
  // limpas. O que responde é a coordenada em espaço de CÂMERA.
  initInput();
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 400);
  // Dublê com o contrato INTEIRO: falso incompleto quebra dentro de
  // `collision.js`, a três camadas de distância daqui.
  const mundo = {
    colliders: [],
    terrain: {
      heightAt: () => 0,
      nivelDaAguaAt: () => -100,
      declividadeAt: () => 0,
      tipoDoChao: () => 'GRAMA'
    },
    spawn: new THREE.Vector3(0, 0, 0)
  };
  const jogador = new Player(camera, document.body, mundo);
  const corpo = initPlayerBody(new THREE.Scene(), jogador, { team: 'vestria' });

  if (!corpo.grupo) {
    note('sem corpo', 'o modelo em peças não carregou');
  } else {
    const paraCamera = new THREE.Matrix4();
    const noMundo = new THREE.Vector3();
    for (const [nome, prone, agachar] of [
      ['de pé', false, false], ['agachado', false, true], ['deitado', true, false]
    ]) {
      jogador.prone = prone;
      jogador.crouchLatched = agachar;
      for (let i = 0; i < 60; i++) { jogador.update(DT); corpo.update(DT); }

      camera.updateMatrixWorld(true);
      corpo.grupo.updateMatrixWorld(true);
      paraCamera.copy(camera.matrixWorld).invert();

      const peito = corpo.grupo.getObjectByName('chest');
      peito.getWorldPosition(noMundo).applyMatrix4(paraCamera);
      // z POSITIVO em espaço de câmera é atrás da lente, que é onde o
      // próprio peito tem que estar.
      ok(`${nome}: o peito fica atrás da lente`, noMundo.z > 0.02,
        `z ${noMundo.z.toFixed(3)} m`);
      ok(`${nome}: e o corpo tem a altura declarada`,
        Math.abs(corpo.grupo.scale.y) > 0.3,
        `escala ${corpo.grupo.scale.y.toFixed(3)}`);
    }
  }

  note('como foi autorado', 'tools/pose-viewer.html?postura=deitado&cam=lado');
  usarMedidasDoModelo(null);
}
