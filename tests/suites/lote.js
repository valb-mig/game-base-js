import * as THREE from 'three';
import { agruparEstaticos } from '../../src/world/lote.js';
import { createSettling } from '../../src/world/settling.js';
import { createDeform, DEFORM } from '../../src/world/deform.js';
import { addBox, BOX, material } from '../../src/world/props.js';
import { suite, ok, eq, near, note } from '../assert.js';

const DT = 1 / 60;

/** Uma caixa solta na cena, com a geometria e o material compartilhados. */
function caixa(cena, x, z, cor = 0x808080, escala = 1) {
  const malha = new THREE.Mesh(BOX, material(cor));
  malha.position.set(x, 1, z);
  malha.scale.setScalar(escala);
  cena.add(malha);
  return malha;
}

function contar(cena) {
  let soltas = 0;
  let lotes = 0;
  let instancias = 0;
  cena.traverse((o) => {
    if (o.isInstancedMesh) { lotes++; instancias += o.count; }
    else if (o.isMesh) soltas++;
  });
  return { soltas, lotes, instancias };
}

export function run() {
  suite('a mesma caixa mil vezes vira um lote');

  const cena = new THREE.Scene();
  const originais = [];
  for (let i = 0; i < 12; i++) originais.push(caixa(cena, i * 3, 0));

  // Guardadas ANTES: o que prova o agrupamento é a matriz de mundo continuar a
  // mesma, e depois de dobrar a malha some da cena.
  const matrizes = originais.map((m) => {
    m.updateMatrixWorld(true);
    return m.matrixWorld.clone();
  });

  const antes = contar(cena);
  const lote = agruparEstaticos(cena);
  const depois = contar(cena);

  eq('as doze estavam soltas', antes.soltas, 12);
  eq('e viraram um lote só', depois.lotes, 1);
  eq('sem malha solta sobrando', depois.soltas, 0);
  eq('com as doze instâncias dentro', depois.instancias, 12);
  eq('e o relatório conta o que dobrou', lote.instanciadas, 12);

  // A matriz é o que decide onde a caixa aparece: uma instância no lugar
  // errado é uma parede que mudou de lugar, e o censo passaria verde.
  const m = new THREE.Matrix4();
  let pior = 0;
  for (let i = 0; i < 12; i++) {
    lote.lotes[0].getMatrixAt(i, m);
    for (let k = 0; k < 16; k++) {
      pior = Math.max(pior, Math.abs(m.elements[k] - matrizes[i].elements[k]));
    }
  }
  near('e cada instância ficou onde a malha estava', pior, 0, 1e-6);

  suite('o que se mexe fica de fora do lote');

  const cena2 = new THREE.Scene();
  for (let i = 0; i < 6; i++) caixa(cena2, i * 3, 0);

  // A bandeira do mastro, a cruz do moinho e o boneco de treino: os três se
  // mexem depois do boot, e escrever em `position` não move instância nenhuma.
  const bandeira = caixa(cena2, 40, 0);
  bandeira.userData.movel = true;

  // Marcado no PAI: o boneco de treino tomba girando o grupo, e nenhuma peça
  // dele pode ter virado instância.
  const grupo = new THREE.Group();
  grupo.userData.movel = true;
  const peca = new THREE.Mesh(BOX, material(0x808080));
  grupo.add(peca);
  cena2.add(grupo);

  // Transparente depende da ORDEM de desenho, e o lote embaralha a ordem
  // dentro dele.
  const vidro = caixa(cena2, 60, 0);
  vidro.material = new THREE.MeshLambertMaterial({ color: 0x808080, transparent: true });

  agruparEstaticos(cena2);
  const c2 = contar(cena2);
  eq('as seis paradas foram pro lote', c2.instancias, 6);
  ok('a que se mexe continua na cena', bandeira.parent === cena2);
  ok('a peça de um grupo que se mexe também', peca.parent === grupo);
  ok('e a transparente também', vidro.parent === cena2);
  eq('três malhas soltas, e são essas três', c2.soltas, 3);

  suite('grupo de um não vale lote');

  // Terreno, mar, costura e anel do horizonte são um de cada: um
  // `InstancedMesh` de uma instância é a mesma chamada de desenho com um
  // buffer de matrizes a mais.
  const cena3 = new THREE.Scene();
  const sozinha = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material(0x123456));
  cena3.add(sozinha);
  agruparEstaticos(cena3);
  ok('malha única fica solta', sozinha.parent === cena3);
  eq('e nenhum lote é criado', contar(cena3).lotes, 0);

  suite('parede dobrada em lote continua desabando');

  /**
   * É a integração que faltava, e o sintoma de errá-la é o pior possível: o
   * colisor desce e o desenho fica de pé — a parede que se atravessa mas
   * continua na tela.
   *
   * `settling` já sabia mexer em instância (é assim que a floresta se
   * registra); o que `world/lote.js` faz é AVISAR que a malha solta virou a
   * instância `i` de um lote, por `trocarParte`.
   */
  const deform = createDeform();
  const terrain = { heightAt: (x, z) => deform.deltaAt(x, z) };
  const colliders = [];
  const settling = createSettling(terrain, colliders);
  const cena4 = new THREE.Scene();

  // Duas paredes iguais lado a lado: uma sozinha não formaria lote.
  const paredes = [
    addBox(cena4, colliders, { x: 0, y: 0, z: 0, w: 1, h: 3, d: 1, color: 0x999999, settling }),
    addBox(cena4, colliders, { x: 6, y: 0, z: 0, w: 1, h: 3, d: 1, color: 0x999999, settling })
  ];
  const dobrado = agruparEstaticos(cena4, { settling });
  eq('as duas paredes viraram instância', dobrado.instanciadas, 2);

  const prop = settling.props[0];
  eq('e o prop aponta pro lote', prop.parts[0].instanced, true);
  ok('que é o InstancedMesh da cena', prop.parts[0].mesh.isInstancedMesh === true);

  const doLote = new THREE.Matrix4();
  prop.parts[0].mesh.getMatrixAt(prop.parts[0].index, doLote);
  const alturaAntes = doLote.elements[13];

  // Cava embaixo dela e deixa desabar.
  deform.apply(0, 0, -DEFORM.FUNDO * 3);
  settling.disturb(0, 0, DEFORM.RAIO);
  for (let i = 0; i < 120; i++) settling.update(DT);

  prop.parts[0].mesh.getMatrixAt(prop.parts[0].index, doLote);
  const alturaDepois = doLote.elements[13];
  ok('cavar embaixo faz a INSTÂNCIA descer', alturaDepois < alturaAntes - 0.2,
    `y ${alturaAntes.toFixed(2)} -> ${alturaDepois.toFixed(2)}`);
  ok('e o colisor desceu junto', prop.collider.box.max.y < 3,
    `topo em ${prop.collider.box.max.y.toFixed(2)}`);
  note('por que importa', 'sem o aviso, o colisor desce e a parede fica de pé na tela');

  // Contraprova: a outra parede não caiu, ou seja o lote não moveu tudo junto.
  const vizinha = new THREE.Matrix4();
  const outra = settling.props[1];
  outra.parts[0].mesh.getMatrixAt(outra.parts[0].index, vizinha);
  near('a parede de seis metros de distância não se mexeu',
    vizinha.elements[13], 1.5, 0.01);
  eq('e as duas estão no MESMO lote', prop.parts[0].mesh, outra.parts[0].mesh);
  note('índices', `${prop.parts[0].index} e ${outra.parts[0].index} no mesmo InstancedMesh`);

  // A malha solta continua existindo como objeto — quem guardou referência não
  // fica com um objeto quebrado —, mas saiu da cena.
  eq('a malha original saiu da cena', paredes[0].parent, null);
}
