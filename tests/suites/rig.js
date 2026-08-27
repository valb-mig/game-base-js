import * as THREE from 'three';
import { carregarSoldado, soldadoPronto, criarSoldado } from '../../src/bots/model.js';
import { criarRig } from '../../src/bots/rig.js';
import { createRagdoll } from '../../src/bots/ragdoll.js';
import { SOLDIER, createSoldier } from '../../src/bots/soldier.js';
import { ListaDeColisores } from '../../src/world/colisores.js';
import { suite, ok, eq, near, note } from '../assert.js';

const DT = 1 / 60;

export function run() {
  return carregarSoldado().then(rodar, () => {
    suite('rig');
    note('modelo não carregou', 'sem arquivo não há osso pra testar');
  });
}

function rodar() {
  suite('o rig acha os ossos do modelo');

  if (!soldadoPronto()) {
    note('modelo não carregou', 'sem arquivo não há osso pra testar');
    return;
  }

  const cena = new THREE.Scene();
  const { grupo } = criarSoldado('karnia');
  cena.add(grupo);
  grupo.updateMatrixWorld(true);

  const rig = criarRig(grupo);
  ok('o rig existe', !!rig);
  ok('e conhece o quadril, o peito e a cabeça',
    rig.ossos.has('hips') && rig.ossos.has('chest') && rig.ossos.has('head'));

  suite('as juntas saem MEDIDAS da pose que está na tela');

  const juntas = rig.medirJuntas();
  const cabeca = juntas.head;
  near('a cabeça está na altura de uma cabeça', cabeca[1], 1.45, 0.2);
  near('os pés estão no chão', juntas.foot_L[1], 0.06, 0.12);
  ok('e um ombro está de cada lado',
    juntas.shoulder_L[0] * juntas.shoulder_R[0] < 0,
    `${juntas.shoulder_L[0].toFixed(2)} e ${juntas.shoulder_R[0].toFixed(2)}`);
  note('altura medida', `${cabeca[1].toFixed(2)} m até a junta da cabeça`);

  // Medida em METROS DE MUNDO: dentro do espaço da raiz ela sairia do tamanho
  // do arquivo (1,80 m), e o ragdoll simularia um corpo maior que o desenho.
  const doModelo = new THREE.Vector3();
  grupo.getObjectByName('head').getWorldPosition(doModelo);
  near('e batem com o osso no mundo', cabeca[1], doModelo.y, 0.001);

  suite('o osso vai pra onde o ragdoll disse');

  const corpo = createRagdoll(juntas);
  corpo.iniciar(0, 0, 0, 0, { x: 4, y: 1, z: 0 });
  for (let i = 0; i < 240; i++) corpo.passo(DT, { alturaEm: () => 0 });

  grupo.position.set(0, 0, 0);
  grupo.rotation.set(0, 0, 0);
  rig.aplicarRagdoll(corpo);
  grupo.updateMatrixWorld(true);

  const daFisica = new THREE.Vector3();
  const doOsso = new THREE.Vector3();
  let pior = 0;
  for (const nome of ['hips', 'chest', 'head', 'knee_L', 'foot_R', 'elbow_R']) {
    corpo.posicaoDe(nome, daFisica);
    grupo.getObjectByName(nome).getWorldPosition(doOsso);
    pior = Math.max(pior, daFisica.distanceTo(doOsso));
  }
  ok('cada osso pousa onde a junta dele está', pior < 0.06,
    `pior distância ${(pior * 100).toFixed(1)} cm`);

  const noChao = new THREE.Vector3();
  grupo.getObjectByName('head').getWorldPosition(noChao);
  ok('e o corpo inteiro está deitado', noChao.y < 0.6, `cabeça em ${noChao.y.toFixed(2)} m`);
  ok('pro lado do empurrão', noChao.x > 0.4, `x ${noChao.x.toFixed(2)}`);

  suite('o osso não escolhe a torção sozinho');

  // A rotação MÍNIMA que leva a direção de repouso até a de agora não define
  // giro em torno do próprio osso: o osso escolhia uma torção qualquer, e o
  // capacete de um corpo deitado aparecia de pé, apoiado na aba. A base
  // ortonormal com o lado do corpo como referência é o que resolve.
  const cimaDoOsso = (nome) => new THREE.Vector3(0, 1, 0)
    .applyQuaternion(grupo.getObjectByName(nome).getWorldQuaternion(new THREE.Quaternion()));

  rig.repousar();
  grupo.updateMatrixWorld(true);
  const entreEmPe = cimaDoOsso('head').angleTo(cimaDoOsso('chest'));

  rig.aplicarRagdoll(corpo);
  grupo.updateMatrixWorld(true);
  const entreCaido = cimaDoOsso('head').angleTo(cimaDoOsso('chest'));

  near('a cabeça mantém com o peito o ângulo que tinha de pé',
    entreCaido, entreEmPe, 0.7);
  note('torção', `${(entreEmPe * 57.3).toFixed(0)}° de pé, ${(entreCaido * 57.3).toFixed(0)}° caído`);

  // E ela girou junto com o corpo: cabeça que fica apontando pro céu com o
  // corpo deitado é o sintoma de a torção não ser resolvida.
  const cabecaCaida = cimaDoOsso('head');
  ok('e ela não continua apontando pro céu', cabecaCaida.y < 0.8,
    `y do topo da cabeça ${cabecaCaida.y.toFixed(2)}`);

  suite('repousar desfaz o ragdoll');

  rig.repousar();
  grupo.updateMatrixWorld(true);
  grupo.getObjectByName('head').getWorldPosition(doOsso);
  near('a cabeça volta pra pose de repouso', doOsso.y, cabeca[1], 0.001);
  note('por que importa', 'é o mesmo rig que a animação vai usar');

  suite('a pose é somada ao repouso, não absoluta');

  const antes = grupo.getObjectByName('elbow_L').quaternion.clone();
  rig.aplicarPose({ elbow_L: [0, 0, 0] });
  ok('pose de zero não muda nada',
    grupo.getObjectByName('elbow_L').quaternion.angleTo(antes) < 1e-6);

  rig.aplicarPose({ elbow_L: [0.5, 0, 0] });
  near('e meia volta de radiano gira meia volta de radiano',
    grupo.getObjectByName('elbow_L').quaternion.angleTo(antes), 0.5, 0.001);

  rig.aplicarPose({ elbow_L: [0.5, 0, 0] }, 0.5);
  near('com peso, ela entra pela metade',
    grupo.getObjectByName('elbow_L').quaternion.angleTo(antes), 0.25, 0.001);
  note('por que somada', 'pose se escreve como desvio do que está na tela');

  eq('o soldado continua com a altura do jogo', SOLDIER.ALTURA, 1.75);
  rig.repousar();

  corpoCaido();
  corpoNaoVarreOMapa();
}

/**
 * O corpo caído: ele tem que ficar VISÍVEL onde caiu, e tem que parar de
 * custar quadro depois de assentar.
 *
 * O ragdoll resolve as juntas em coordenadas de MUNDO, e por isso o grupo do
 * soldado morto fica na origem. O three recorta a malha skinnada pela esfera
 * DELA multiplicada pela matriz do objeto — que aí é a identidade —, então o
 * corpo era descartado como se estivesse no ponto zero do mapa: sumia
 * inteiro, e o que sobrava eram a bandeira do peito e o vivo do capacete,
 * que penduram nos ossos e carregam matriz própria.
 *
 * Isto NÃO se prova olhando se a malha existe: ela existe, está no lugar
 * certo e é o RECORTE que aponta pro lugar errado. O que prova é a esfera
 * levada pra mundo pela mesma matriz que o renderer usa.
 */
function corpoCaido() {
  suite('o corpo caído fica onde caiu, e para de custar quadro');

  const cena = new THREE.Scene();
  const chao = { heightAt: () => 0 };
  const colisores = [];
  // LONGE da origem: em cima dela um recorte errado acerta por acidente, e
  // foi assim que o defeito passou despercebido.
  const bot = createSoldier(cena, colisores, {
    id: 1, team: 'karnia', x: 240, z: -180, terrain: chao,
    weapons: [{ id: 'mp40', name: 'MP40', firearm: { damage: 24 },
      ammo: { loaded: 32, reserve: 0 } }]
  });
  bot.update(DT);

  // O renderer mede a esfera UMA VEZ, no primeiro quadro em que testa a
  // malha contra a câmera, e guarda — bone que se mexe depois não remede
  // nada. Sem imitar esse cache o teste chama `computeBoundingSphere` na
  // hora de conferir, mede a pose de agora e passa verde com o defeito
  // inteiro no lugar. Aconteceu.
  let malha = null;
  bot.group.traverse((o) => { if (o.isMesh && !malha) malha = o; });
  ok('há malha de corpo', !!malha);
  malha.computeBoundingSphere();

  bot.damage(999, { nome: 'tronco', multiplicador: 1 }, {
    dir: new THREE.Vector3(0, 0, 1), ponto: new THREE.Vector3(240, 1.15, -180.2)
  });
  for (let i = 0; i < 240; i++) bot.update(DT);

  const quadril = bot.group.getObjectByName('hips')
    .getWorldPosition(new THREE.Vector3());
  ok('o corpo saiu do lugar', Math.abs(quadril.z + 180) > 0.3,
    `quadril em z ${quadril.z.toFixed(2)}`);

  const recorte = new THREE.Sphere()
    .copy(malha.boundingSphere).applyMatrix4(malha.matrixWorld);
  const desvio = recorte.center.distanceTo(quadril);
  ok('e o recorte de câmera foi junto com ele', desvio < 1,
    `esfera a ${desvio.toFixed(2)} m do quadril, raio ${recorte.radius.toFixed(2)}`);
  note('por que importa', 'esfera parada na origem = corpo invisível no mapa inteiro');

  suite('e o solver dorme quando o corpo assenta');

  // Depois de assentado, mais um quadro não pode mexer em osso nenhum: é isso
  // que faz um corpo caído custar zero pelos cinco segundos em que ele fica
  // na tela, com o tiroteio inteiro no chão ao mesmo tempo.
  const cabeca = bot.group.getObjectByName('head');
  const antes = cabeca.getWorldPosition(new THREE.Vector3());
  for (let i = 0; i < 30; i++) bot.update(DT);
  const depois = cabeca.getWorldPosition(new THREE.Vector3());
  eq('nenhum osso é reescrito depois disso', depois.distanceTo(antes), 0);
}

/**
 * O corpo caído pergunta a VIZINHANÇA, não a lista inteira.
 *
 * Enquanto o solver está acordado ele precisa saber que caixas podem
 * atrapalhar a queda, e a primeira versão percorria os colisores do mapa
 * inteiro — o mesmo defeito que `acharCobertura` e `wallHit` já pagaram, agora
 * no quadro em que alguém morre. Medido na bancada de perfil antes de mudar:
 * uma varredura dos 5643 colisores POR CORPO por quadro, três corpos levando a
 * IA de 0,71 pra 2,70 ms, e 62 corpos visitando 367.846 caixas por quadro.
 *
 * Este teste não mede TEMPO: ele roda sob tempo virtual, onde
 * `performance.now()` não anda e qualquer asserção de milissegundo passa verde
 * com 0,000 ms. Ele conta VARREDURAS — e vem com a contraprova, porque
 * "nenhuma varredura" também é o que se mede quando o corpo deixou de
 * perguntar por caixa nenhuma.
 */
function corpoNaoVarreOMapa() {
  suite('o corpo caído não varre o mapa pra saber onde bateu');

  const chao = { heightAt: () => 0 };
  const AQUI = { x: 240, z: -180 };

  function derrubar(comParede) {
    const cena = new THREE.Scene();
    const colisores = new ListaDeColisores();

    // Mapa de mentira com o tamanho do de verdade em ordem de grandeza: é a
    // lista que a varredura linear percorreria, e ela tem que ser grande o
    // bastante pra que passar por ela seja visível na contagem.
    for (let i = 0; i < 400; i++) {
      const x = -900 + (i % 20) * 90;
      const z = -900 + Math.floor(i / 20) * 90;
      colisores.push({ box: new THREE.Box3(
        new THREE.Vector3(x, 0, z), new THREE.Vector3(x + 2, 3, z + 2)) });
    }

    // A parede encostada no corpo, do lado pra onde o tiro o empurra.
    if (comParede) {
      colisores.push({ box: new THREE.Box3(
        new THREE.Vector3(AQUI.x - 2, 0, AQUI.z + 0.6),
        new THREE.Vector3(AQUI.x + 2, 2.4, AQUI.z + 1.2)) });
    }

    const bot = createSoldier(cena, colisores, {
      id: 1, team: 'karnia', x: AQUI.x, z: AQUI.z, terrain: chao,
      weapons: [{ id: 'mp40', name: 'MP40', firearm: { damage: 24 },
        ammo: { loaded: 32, reserve: 0 } }]
    });
    bot.update(DT);

    // Conta quem itera a lista INTEIRA. `emVolta` e `aoLongoDe` não passam por
    // aqui, então o contador só sobe na varredura que se quer ver morrer.
    let varreduras = 0;
    const iterar = colisores[Symbol.iterator];
    colisores[Symbol.iterator] = function () {
      varreduras++;
      return iterar.call(this);
    };

    bot.damage(999, { nome: 'tronco', multiplicador: 1 }, {
      dir: new THREE.Vector3(0, 0, 1), ponto: new THREE.Vector3(AQUI.x, 1.15, AQUI.z - 0.2)
    });
    for (let i = 0; i < 240; i++) bot.update(DT);
    colisores[Symbol.iterator] = iterar;

    return {
      varreduras,
      colisores: colisores.length,
      quadril: bot.group.getObjectByName('hips').getWorldPosition(new THREE.Vector3())
    };
  }

  const semParede = derrubar(false);
  const comParede = derrubar(true);

  eq('o corpo cai sem varrer a lista de colisores', semParede.varreduras, 0);
  eq('e com uma parede encostada também não varre', comParede.varreduras, 0);
  note('lista', `${semParede.colisores} colisores que a varredura percorreria por corpo por quadro`);

  // A CONTRAPROVA: zero varredura também é o que se mede quando o corpo parou
  // de consultar caixa. Se o índice está entregando a parede, a queda com ela
  // e sem ela terminam em lugares diferentes.
  const desvio = comParede.quadril.distanceTo(semParede.quadril);
  ok('e a parede que o índice devolveu muda onde ele para', desvio > 0.05,
    `quadril ${desvio.toFixed(2)} m longe do da queda sem parede`);
  note('por que a contraprova', 'sem ela, "não consulta nada" passa pelo mesmo teste');
}
