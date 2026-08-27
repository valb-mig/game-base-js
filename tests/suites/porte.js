import * as THREE from 'three';
import { carregarSoldado, soldadoPronto } from '../../src/bots/model.js';
import { createSoldier } from '../../src/bots/soldier.js';
import { porteDe, MAOS } from '../../src/bots/porte.js';
import { LADO_EM_X, ossoDoLado } from '../../src/bots/esqueleto.js';
import { cotoveloEm } from '../../src/bots/ik.js';
import { MP40, PISTOL, KNIFE, SHOVEL } from '../../src/items/classes.js';
import { suite, ok, eq, near, note } from '../assert.js';

const DT = 1 / 60;

function distancia(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function run() {
  matematica();
  return carregarSoldado().then(comModelo, () => {
    suite('porte');
    note('modelo não carregou', 'sem arquivo não há osso pra segurar arma');
  });
}

/** A IK sozinha, sem three e sem arquivo. */
function matematica() {
  suite('IK de dois ossos: a mão chega, e o osso não estica');

  const ombro = { x: 0, y: 1.32, z: 0 };
  const cotovelo = {};
  const a = 0.24;
  const b = 0.22;
  const polo = { x: 1, y: -0.5, z: 0 };

  const alvo = { x: 0, y: 1.0, z: 0.30 };
  const faltou = cotoveloEm(cotovelo, ombro, alvo, a, b, polo);
  eq('alvo ao alcance não falta nada', faltou, 0);
  near('o braço mede o que media', distancia(ombro, cotovelo), a, 1e-6);
  near('e o antebraço também', distancia(cotovelo, alvo), b, 1e-6);

  // Alvo longe não pode ser alcançado esticando osso: o braço fica no
  // limite e quem chamou é AVISADO. Mão que não chega é mão fora da arma, e
  // o conserto é mudar onde a arma está — foi assim que a pá e a MP40 foram
  // aproximadas do corpo, medindo isto em vez de olhando.
  const longe = { x: 0, y: 1.32, z: 0.9 };
  const sobrou = cotoveloEm(cotovelo, ombro, longe, a, b, polo);
  ok('alvo fora de alcance é denunciado', sobrou > 0.4, `faltaram ${sobrou.toFixed(3)} m`);
  near('e o braço continua com o tamanho dele',
    distancia(ombro, cotovelo) + distancia(cotovelo, longe) - sobrou, a + b, 0.002);

  // O polo é o grau de liberdade que dois pontos e dois comprimentos não
  // resolvem. Sem ele o cotovelo cai num ponto qualquer do círculo, e o
  // braço do soldado entra no peito.
  const paraUmLado = {};
  const paraOutro = {};
  cotoveloEm(paraUmLado, ombro, alvo, a, b, { x: 1, y: 0, z: 0 });
  cotoveloEm(paraOutro, ombro, alvo, a, b, { x: -1, y: 0, z: 0 });
  ok('o polo decide de que lado o cotovelo sai',
    paraUmLado.x > 0 && paraOutro.x < 0,
    `${paraUmLado.x.toFixed(3)} contra ${paraOutro.x.toFixed(3)}`);

  suite('o arquivo nomeia os lados ao contrário, e isso é declarado');

  eq('o osso _L mora no +x', LADO_EM_X.L, 1);
  eq('e o osso _R no -x', LADO_EM_X.R, -1);
  eq('a mão direita do soldado é o osso _L', ossoDoLado(1), 'L');
  eq('e a esquerda é o _R', ossoDoLado(-1), 'R');
  eq('o punho da arma vai na direita dele', MAOS[0].marcador, 'mao_dir');
  eq('...que é o osso _L', MAOS[0].osso, 'L');
  note('por que declarado', 'cada consumidor descobrindo sozinho, metade descobre errado');
}

function comModelo() {
  suite('o soldado SEGURA a arma, não a arrasta');

  if (!soldadoPronto()) {
    note('modelo não carregou', 'sem arquivo não há osso pra segurar arma');
    return;
  }

  const piso = { heightAt: () => 0 };
  const frente = new THREE.Vector3(0, 0, 1);
  const noMundo = new THREE.Vector3();
  const noPunho = new THREE.Vector3();
  const giro = new THREE.Quaternion();
  const cano = new THREE.Vector3();

  for (const arma of [MP40, PISTOL, KNIFE, SHOVEL]) {
    const bot = createSoldier(new THREE.Scene(), [], {
      id: 1, team: 'karnia', x: 0, z: 0, terrain: piso, weapons: [arma]
    });
    bot.update(DT);
    bot.update(DT);

    const porte = porteDe(arma);
    const modelo = bot.group.getObjectByName('porte')?.children.find((o) => o.visible);
    ok(`${arma.name}: a arma está na mão`, !!modelo);
    if (!modelo) continue;

    for (const mao of MAOS) {
      if (!mao.principal && !porte.ambasAsMaos) continue;
      const marca = modelo.getObjectByName(mao.marcador);
      if (!marca) continue;
      const osso = bot.group.getObjectByName(`hand_${mao.osso}`);
      marca.getWorldPosition(noMundo);
      osso.getWorldPosition(noPunho);
      const erro = noMundo.distanceTo(noPunho);
      // Cinco centímetros é a folga de uma palma. Antes disto existir a mão
      // esquerda ficava a 58,5 cm da arma, e nenhum teste reclamava.
      ok(`${arma.name}: ${mao.marcador} na mão`, erro < 0.05,
        `${(erro * 100).toFixed(1)} cm`);
    }

    // E o cano aponta pra FRENTE. Era isto que estava errado de olhar e
    // certo de contar: 30° pro chão, a arma pendurada ao longo da perna.
    modelo.getWorldQuaternion(giro);
    cano.set(0, 0, -1).applyQuaternion(giro);
    const paraFrente = cano.dot(frente);
    const caindo = Math.asin(-cano.y) * 180 / Math.PI;
    ok(`${arma.name}: aponta pra frente do corpo`, paraFrente > 0.55,
      `${paraFrente.toFixed(2)} de frente`);
    ok(`${arma.name}: e não pro chão`, caindo < 35,
      `caindo ${caindo.toFixed(1)}°`);
  }
  suite('e continua segurando ANDANDO, que é onde ela larga');

  // Parado, a mão alcançava a arma e o teste ficava verde. Andando, o ombro
  // sobe com o balanço e a IK trunca o que não alcança: a mão desgrudava
  // 8 cm em dois pontos do ciclo, e só naqueles. Postura de estátua não
  // prova pose de quem anda.
  const andarilho = createSoldier(new THREE.Scene(), [], {
    id: 2, team: 'karnia', x: 0, z: 0, terrain: piso, weapons: [MP40]
  });
  andarilho.update(DT);

  const porteDoAndarilho = porteDe(MP40);
  let pior = 0;
  let ondePior = 0;
  // AMOSTRA o ciclo em vez de varrê-lo com passo fino. A 3,4 m/s a passada
  // mede 2,3 m e um ciclo leva 0,68 s: 200 quadros a 1/120 cobrem dois
  // ciclos inteiros. A primeira versão rodava 900 quadros a 1/240, comia o
  // orçamento de tempo virtual da página e derrubava o carregamento do
  // `.glb` do jipe três suítes adiante — com um erro que não fala de tempo
  // nem de porte. É a armadilha que a suíte da floresta já pregou aqui.
  const passo = 1 / 120;
  for (let i = 0; i < 200; i++) {
    // 3,4 m/s é a corrida do bot: amplitude cheia, que é o pior caso.
    andarilho.x += 3.4 * passo;
    andarilho.update(passo);
    if (i < 30) continue;   // deixa a passada engrenar

    const arma = andarilho.group.getObjectByName('porte')
      ?.children.find((o) => o.visible);
    if (!arma) continue;
    for (const mao of MAOS) {
      if (!mao.principal && !porteDoAndarilho.ambasAsMaos) continue;
      const marca = arma.getObjectByName(mao.marcador);
      const osso = andarilho.group.getObjectByName(`hand_${mao.osso}`);
      if (!marca || !osso) continue;
      marca.getWorldPosition(noMundo);
      osso.getWorldPosition(noPunho);
      const erro = noMundo.distanceTo(noPunho);
      if (erro > pior) { pior = erro; ondePior = andarilho.fase; }
    }
  }
  ok('a mão não larga a arma em ponto nenhum do ciclo', pior < 0.05,
    `pior ${(pior * 100).toFixed(1)} cm, na fase ${ondePior.toFixed(2)}`);
  ok('e a passada rodou de verdade', andarilho.fase > 0,
    `fase ${andarilho.fase.toFixed(2)}`);

  suite('e o LOD tira a MALHA da arma, não a pose de quem a segura');

  // O bot longe não constrói modelo de arma — trinta e duas malhas pra uns
  // poucos pixels. Mas a MÃO dele tem que continuar onde estaria: enquanto a
  // pose do braço dependia do modelo existir, o bot erguia e baixava os
  // braços junto com o LOD, e isso lê como animação quebrada. O marcador do
  // punho é constante e é lido uma vez por TIPO de arma.
  const longe = createSoldier(new THREE.Scene(), [], {
    id: 3, team: 'karnia', x: 0, z: 0, terrain: piso, weapons: [MP40]
  });
  longe.detalhado = false;
  longe.update(DT);
  longe.update(DT);

  ok('longe, a malha da arma não é construída',
    !longe.group.getObjectByName('porte')?.children.some((o) => o.visible));

  ok('mas o nó de porte está posto',
    Boolean(longe.group.getObjectByName('porte')));

  // O par de referência é MEDIDO de um bot com detalhe, nunca escrito à mão:
  // um número cravado aqui desalinha no primeiro ajuste de `porte.js`, e o
  // teste passa a acusar erro onde não há.
  const perto = createSoldier(new THREE.Scene(), [], {
    id: 4, team: 'karnia', x: 0, z: 0, terrain: piso, weapons: [MP40]
  });
  perto.detalhado = true;
  perto.update(DT);
  perto.update(DT);
  const punhoDireito = perto.group.getObjectByName(`hand_${MAOS[0].osso}`)
    .getWorldPosition(new THREE.Vector3());

  // A mão continua na altura e à frente do peito, e não caída ao lado do
  // corpo — que é onde a pose de repouso a deixa.
  const mao = longe.group.getObjectByName(`hand_${MAOS[0].osso}`)
    .getWorldPosition(noPunho);
  ok('e a mão continua segurando', mao.y > 0.9 && mao.z > 0.05,
    `mão em (${mao.x.toFixed(2)}, ${mao.y.toFixed(2)}, ${mao.z.toFixed(2)})`);
  ok('perto e longe seguram no MESMO lugar',
    mao.distanceTo(punhoDireito) < 0.05,
    `${(mao.distanceTo(punhoDireito) * 100).toFixed(1)} cm de diferença`);

  note('como foi autorado', 'tools/pose-viewer.html?arma=mp40&cam=lado&vel=3.4&fase=0.25');
}
