import * as THREE from 'three';
import { createRagdoll } from '../../src/bots/ragdoll.js';
import {
  JUNTAS_PADRAO, OSSOS, medirLigacoes, medirDobras, juntasDe
} from '../../src/bots/esqueleto.js';
import { suite, ok, eq, near, note } from '../assert.js';

const DT = 1 / 60;
const plano = () => 0;

function correr(corpo, segundos, mundo = { alturaEm: plano }) {
  for (let i = 0; i < Math.ceil(segundos / DT); i++) corpo.passo(DT, mundo);
}

function juntaEm(corpo, nome) {
  return corpo.posicaoDe(nome, new THREE.Vector3());
}

/** Maior erro de comprimento entre todos os ossos, em metros. */
function esticou(corpo) {
  const alvo = medirLigacoes(corpo.juntas, OSSOS);
  let pior = 0;
  for (const osso of alvo) {
    pior = Math.max(pior, Math.abs(corpo.extensao(osso.a, osso.b) - osso.comprimento));
  }
  return pior;
}

export function run() {
  suite('o esqueleto é medido, não escrito');

  const doModelo = juntasDe({
    hips: { x: 0, y: 0.98, z: 0 }, head: { x: 0, y: 1.49, z: 0 }
  }, 1.80);
  near('a medida do modelo é escalada pra altura do jogo',
    doModelo.head[1], 1.49 * (1.75 / 1.80), 0.001);
  eq('e o que o arquivo não tem cai na tabela de reserva',
    doModelo.foot_L[1], JUNTAS_PADRAO.foot_L[1]);
  note('escala', '1,80 m de modelo em 1,75 m de jogo');

  suite('osso não estica');

  const corpo = createRagdoll(JUNTAS_PADRAO);
  corpo.iniciar(0, 0, 0, 0, { x: 3, y: 1.2, z: 0 });
  ok('começa acordado', !corpo.dormindo);

  const antes = esticou(corpo);
  near('de pé ele já está no comprimento certo', antes, 0, 0.001);

  let pior = 0;
  for (let i = 0; i < 180; i++) {
    corpo.passo(DT, { alturaEm: plano });
    pior = Math.max(pior, esticou(corpo));
  }
  ok('e nenhum osso estica durante a queda', pior < 0.02, `pior erro ${(pior * 100).toFixed(1)} cm`);
  note('restrições', 'comprimento de osso resolvido por posição, 6 passadas');

  suite('o corpo cai, para no chão e dorme');

  const cabeca = juntaEm(corpo, 'head');
  ok('a cabeça desceu', cabeca.y < 1.2, `y ${cabeca.y.toFixed(2)}`);
  ok('e foi pro lado do empurrão', cabeca.x > 0.4, `x ${cabeca.x.toFixed(2)}`);

  correr(corpo, 6);
  let abaixoDoChao = 0;
  for (const nome of Object.keys(JUNTAS_PADRAO)) {
    if (juntaEm(corpo, nome).y < -0.01) abaixoDoChao++;
  }
  eq('nenhuma junta atravessou o chão', abaixoDoChao, 0);
  ok('e o corpo assentou', corpo.dormindo);

  // Dormir é o que faz um corpo custar zero depois de assentar.
  const parado = juntaEm(corpo, 'hips').clone();
  correr(corpo, 2);
  near('dormindo, ele não se mexe mais', juntaEm(corpo, 'hips').distanceTo(parado), 0, 1e-9);

  suite('o corpo cai, não derrete');

  // Um cordão de distâncias não tem rigidez nenhuma: a primeira versão
  // assentava como um monte de caixas, com o corpo inteiro amontoado em meio
  // metro. O que segura a forma é a MOLA de cada dobradiça, que puxa o
  // ângulo de volta pro que ele era — fraca o bastante pra gravidade ganhar.
  const caido = createRagdoll(JUNTAS_PADRAO);
  const deitado = Math.hypot(
    JUNTAS_PADRAO.head[1] - JUNTAS_PADRAO.foot_L[1],
    JUNTAS_PADRAO.head[0] - JUNTAS_PADRAO.foot_L[0]);
  caido.iniciar(0, 0, 0, 0, { x: 2.6, y: 1.2, z: 0 });
  correr(caido, 6);

  const comprimento = caido.extensao('head', 'foot_L');
  // Dois terços do comprimento de pé: o corpo caído encolhe porque quadril e
  // joelho dobram, e um cadáver encolhido continua sendo um cadáver. O que
  // este número pega é o amontoado — derretido ele ficava em torno de meio
  // metro, ou seja um terço.
  ok('o corpo continua do tamanho de um corpo', comprimento > deitado * 0.65,
    `${comprimento.toFixed(2)} m de pé a cabeça, contra ${deitado.toFixed(2)} de pé`);

  let maisAlto = 0;
  for (const nome of Object.keys(JUNTAS_PADRAO)) {
    maisAlto = Math.max(maisAlto, juntaEm(caido, nome).y);
  }
  ok('e está deitado, não sentado nem em pé', maisAlto < 0.6, `mais alto em ${maisAlto.toFixed(2)} m`);
  note('rigidez', 'mola por dobradiça, além da trava de distância mínima');

  suite('a dobradiça tem limite');

  // Sem limite, o solver fecha o cotovelo até a mão encostar no ombro — e o
  // braço atravessa a si mesmo. O limite é de DISTÂNCIA: ele não decide pra
  // que lado a dobra vai, decide que ela não fecha até o fim.
  const limites = medirDobras(JUNTAS_PADRAO);
  const doBraco = limites.find((l) => l.a === 'shoulder_L' && l.b === 'hand_L');

  const dobrado = createRagdoll(JUNTAS_PADRAO);
  dobrado.iniciar(0, 3, 0, 0, { x: 0, y: 0, z: 0 });   // queda de três metros
  let maisFechado = Infinity;
  for (let i = 0; i < 480; i++) {
    dobrado.passo(DT, { alturaEm: plano });
    maisFechado = Math.min(maisFechado, dobrado.extensao('shoulder_L', 'hand_L'));
  }
  ok('o cotovelo não fecha até encostar', maisFechado >= doBraco.minimo - 0.02,
    `${(maisFechado * 100).toFixed(0)} cm, mínimo ${(doBraco.minimo * 100).toFixed(0)}`);

  suite('o tiro empurra ONDE pegou');

  // Empurrão igual no corpo inteiro só translada: o corpo sai de lado
  // inteiriço, como boneco. Aplicado no ponto do acerto ele TORCE, e é isso
  // que faz o tiro no capacete parecer tiro no capacete.
  const atingido = createRagdoll(JUNTAS_PADRAO);
  atingido.iniciar(0, 0, 0, 0, null);
  const naCabeca = juntaEm(atingido, 'head');
  const noPe = juntaEm(atingido, 'foot_L');

  const alcancadas = atingido.empurrar(naCabeca, new THREE.Vector3(0, 0, -1), 5, 0.42);
  ok('o empurrão alcança as juntas em volta do ponto', alcancadas > 0,
    `${alcancadas} juntas`);
  ok('e não o corpo inteiro', alcancadas < Object.keys(JUNTAS_PADRAO).length,
    `${alcancadas} de ${Object.keys(JUNTAS_PADRAO).length}`);

  correr(atingido, 0.2);
  const cabecaAndou = juntaEm(atingido, 'head').distanceTo(naCabeca);
  const peAndou = juntaEm(atingido, 'foot_L').distanceTo(noPe);
  ok('a cabeça sentiu o tiro na cabeça', cabecaAndou > 0.05,
    `${(cabecaAndou * 100).toFixed(0)} cm`);
  ok('e o pé quase não', peAndou < cabecaAndou * 0.5,
    `${(peAndou * 100).toFixed(0)} cm contra ${(cabecaAndou * 100).toFixed(0)}`);
  ok('e ela foi pro lado da bala', juntaEm(atingido, 'head').z < naCabeca.z - 0.02,
    `z ${juntaEm(atingido, 'head').z.toFixed(2)}`);

  // Corpo dormindo acorda com o tiro: cadáver que não reage a bala é o mesmo
  // que cadáver pintado no chão.
  const dormindo = createRagdoll(JUNTAS_PADRAO);
  dormindo.iniciar(0, 0, 0, 0, null);
  correr(dormindo, 6);
  ok('o corpo estava dormindo', dormindo.dormindo);
  dormindo.empurrar(juntaEm(dormindo, 'chest'), new THREE.Vector3(1, 0, 0), 4);
  ok('e o tiro acorda ele', !dormindo.dormindo);

  const longe = juntaEm(dormindo, 'chest').clone();
  longe.x += 3;
  const nenhuma = dormindo.empurrar(longe, new THREE.Vector3(1, 0, 0), 4);
  eq('tiro longe do corpo não empurra nada', nenhuma, 0);
  note('raio do impacto', 'peso cai com a distância e some no raio');

  suite('o chão do ragdoll é o campo de altura, não um plano');

  const rampa = { alturaEm: (x) => x * 0.4 };
  const naRampa = createRagdoll(JUNTAS_PADRAO);
  naRampa.iniciar(5, 5 * 0.4, 0, 0, { x: 0, y: 0, z: 0 });
  correr(naRampa, 6, rampa);

  let fundo = Infinity;
  let erro = 0;
  for (const nome of Object.keys(JUNTAS_PADRAO)) {
    const j = juntaEm(naRampa, nome);
    fundo = Math.min(fundo, j.y);
    erro = Math.max(erro, rampa.alturaEm(j.x) - j.y);
  }
  ok('ele assenta na ladeira, não no zero', fundo > 1, `mais baixo em y ${fundo.toFixed(2)}`);
  ok('e nada afunda no terreno', erro < 0.02, `${(erro * 100).toFixed(1)} cm abaixo`);

  suite('caixa do mundo empurra o corpo pra fora');

  const caixa = {
    box: new THREE.Box3(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 1, 2))
  };
  const emCima = createRagdoll(JUNTAS_PADRAO);
  emCima.iniciar(0, 2.4, 0, 0, { x: 0, y: 0, z: 0 });
  correr(emCima, 4, { alturaEm: plano, caixas: [caixa] });

  let dentro = 0;
  for (const nome of Object.keys(JUNTAS_PADRAO)) {
    const j = juntaEm(emCima, nome);
    if (j.x > -2 && j.x < 2 && j.z > -2 && j.z < 2 && j.y < 0.99) dentro++;
  }
  eq('nenhuma junta fica dentro da caixa', dentro, 0);
  // Em cima e não ao lado: o empurrão sai pelo lado MAIS PERTO da caixa, e
  // um corpo que caiu no meio do telhado tem o topo como saída mais perto.
  ok('o corpo parou em cima dela', juntaEm(emCima, 'hips').y > 0.99,
    `quadril em ${juntaEm(emCima, 'hips').y.toFixed(2)}`);
}
