import * as THREE from 'three';
import { createSettling } from '../../src/world/settling.js';
import { createDeform, DEFORM } from '../../src/world/deform.js';
import { collides, groundHeightAt } from '../../src/player/collision.js';
import { intervaloVertical } from '../../src/world/caixagirada.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;

/** Mundo mínimo: terreno plano escavável e props registrados nele. */
function bancada() {
  const deform = createDeform();
  const terrain = { heightAt: (x, z) => deform.deltaAt(x, z) };
  const colliders = [];
  const settling = createSettling(terrain, colliders);

  return {
    deform,
    terrain,
    colliders,
    settling,
    cavar(x, z, quanto = -DEFORM.FUNDO * 3) {
      deform.apply(x, z, quanto);
      settling.disturb(x, z, DEFORM.RAIO);
    },
    rodar(segundos) {
      for (let i = 0; i < Math.ceil(segundos / DT); i++) settling.update(DT);
    }
  };
}

/**
 * A caixa ENVOLVENTE do prop, que é o que o índice espacial guarda.
 *
 * Ela deixou de ser o que a colisão consulta de fato — quem responde num prop
 * tombado é a caixa GIRADA —, mas continua sendo a peneira e continua tendo
 * que envolver o corpo inteiro.
 */
function caixaDe(prop) {
  return prop.collider.box;
}

/** Prop de uma malha só, como uma parede. */
function poste(mundo, x, z, altura = 3) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, altura, 0.6));
  mesh.position.set(x, altura / 2, z);
  mesh.updateMatrix();

  const collider = {
    box: new THREE.Box3(
      new THREE.Vector3(x - 0.3, 0, z - 0.3),
      new THREE.Vector3(x + 0.3, altura, z + 0.3)
    ),
    standable: false
  };

  const prop = mundo.settling.register({
    x, z, baseY: 0, radius: 0.5, collider, parts: [{ mesh }]
  });
  return { mesh, collider, prop };
}

export function run() {
  suite('o que perde o chão desaba');

  const mundo = bancada();
  const arvore = poste(mundo, 0, 0, 4);

  eq('parado, nada está caindo', mundo.settling.falling, 0);
  near('e o pé está no chão', arvore.collider.box.min.y, 0, 1e-9);

  mundo.cavar(0, 0);
  ok('cavar embaixo põe o prop pra cair', mundo.settling.falling > 0);

  mundo.rodar(0.05);
  ok('ele começa a descer', arvore.mesh.position.y < 2,
    `${arvore.mesh.position.y.toFixed(2)}`);

  mundo.rodar(3);
  eq('e para de cair quando encosta', mundo.settling.falling, 0);

  const chaoNovo = mundo.terrain.heightAt(0, 0);
  ok('o prop não ficou flutuando', caixaDe(arvore.prop).min.y <= chaoNovo + 0.02,
    `pé em ${caixaDe(arvore.prop).min.y.toFixed(2)}, chão em ${chaoNovo.toFixed(2)}`);
  ok('que está abaixo de onde ele estava', chaoNovo < -0.5, `${chaoNovo.toFixed(2)} m`);
  note('afundou', `${(-chaoNovo).toFixed(2)} m`);

  suite('o colisor desce junto');

  // Sem isso o objeto cai só de mentira: o jogador continua esbarrando no ar.
  ok('a caixa de colisão acompanhou',
    caixaDe(arvore.prop).min.y < -0.5,
    `topo em ${caixaDe(arvore.prop).max.y.toFixed(2)}`);

  // Contra a malha, não contra a conta: comparar a caixa com o chão esperado
  // testava a fórmula que a produziu, e foi assim que um colisor 91 cm acima
  // do bloco caído passou batido — no campo de treino dava pra ficar de pé no
  // ar em cima de obstáculo derrubado.
  arvore.mesh.updateMatrixWorld(true);
  const desenho = new THREE.Box3().setFromObject(arvore.mesh);
  const daArvore = caixaDe(arvore.prop);
  near('e o desenho e a colisão concordam no pé', daArvore.min.y, desenho.min.y, 1e-6);
  near('e no topo', daArvore.max.y, desenho.max.y, 1e-6);

  suite('tomba pro lado que perdeu apoio');

  const mundo2 = bancada();
  const torre = poste(mundo2, 0, 0, 5);

  // cava só de um lado: a base fica torta
  mundo2.cavar(2.4, 0, -DEFORM.FUNDO * 4);
  mundo2.rodar(3);

  const inclinou = new THREE.Euler().setFromQuaternion(torre.mesh.quaternion);
  const angulo = Math.hypot(inclinou.x, inclinou.z);
  ok('o prop tombou', angulo > 0.1, `${(angulo * 180 / Math.PI).toFixed(0)}°`);
  between('mas não virou de cabeça pra baixo', angulo, 0.1, 1.6);

  const daTorre = caixaDe(torre.prop);
  ok('tombado, ele ocupa menos altura',
    daTorre.max.y - daTorre.min.y < 5,
    `${(daTorre.max.y - daTorre.min.y).toFixed(2)} m de 5`);

  suite('o colisor acompanha o corpo tombado');

  // Reportado jogando: a parede caía pra um lado e a hitbox ficava em pé onde
  // ela estava. Sobravam quase dois metros de entulho que o jogador
  // atravessava, e um muro invisível no lugar que tinha ficado vazio.
  // Medir contra a malha de verdade, e não contra a conta, é o ponto aqui.
  const mundo5 = bancada();
  const muro = poste(mundo5, 0, 0, 3);
  mundo5.cavar(2.4, 0, -DEFORM.FUNDO * 4);
  mundo5.rodar(8);

  muro.mesh.updateMatrixWorld(true);
  const real = new THREE.Box3().setFromObject(muro.mesh);
  const caixa = caixaDe(muro.prop);

  // O buraco foi cavado em x positivo, e é pra lá que ele tem que ir.
  // Invertido, cavar de um lado da parede jogava ela pro outro: lia como
  // empurrão, não como desmoronamento.
  ok('o corpo tomba PRA DENTRO do buraco',
    real.max.x > 0.9, `malha x ${real.min.x.toFixed(2)}..${real.max.x.toFixed(2)}`);
  ok('e não pro lado contrário', real.min.x > -0.9,
    `beirada oposta em ${real.min.x.toFixed(2)}`);

  ok('e a caixa cobre onde ele foi parar, em x',
    caixa.min.x <= real.min.x + 0.3 && caixa.max.x >= real.max.x - 0.3,
    `caixa ${caixa.min.x.toFixed(2)}..${caixa.max.x.toFixed(2)}` +
    ` · malha ${real.min.x.toFixed(2)}..${real.max.x.toFixed(2)}`);

  ok('e em z',
    caixa.min.z <= real.min.z + 0.3 && caixa.max.z >= real.max.z - 0.3,
    `caixa ${caixa.min.z.toFixed(2)}..${caixa.max.z.toFixed(2)}` +
    ` · malha ${real.min.z.toFixed(2)}..${real.max.z.toFixed(2)}`);

  ok('e o topo da caixa acompanha o topo do corpo',
    Math.abs(caixa.max.y - real.max.y) < 0.35,
    `caixa ${caixa.max.y.toFixed(2)} · malha ${real.max.y.toFixed(2)}`);

  // A caixa é reescrita a cada quadro da queda; sem guardar a pegada de pé
  // ela cresceria em cima de si mesma a cada quadro.
  const larguraCaida = caixa.max.x - caixa.min.x;
  mundo5.rodar(8);
  const depois = caixaDe(muro.prop);
  near('e ela não cresce sozinha depois de assentar',
    depois.max.x - depois.min.x, larguraCaida, 1e-6);

  note('caixa tombada', `${larguraCaida.toFixed(2)} m de largura,` +
    ` ${(caixa.max.y - caixa.min.y).toFixed(2)} m de altura`);

  suite('corpo comprido tombado ganha caixa GIRADA, não oito fatias');

  /**
   * Reportado com foto, duas vezes.
   *
   * Na primeira, uma barra na diagonal virava uma caixa gigante alinhada aos
   * eixos e o jogador esbarrava em ar longe dela; a resposta foi FATIAR o
   * corpo em oito caixas curtas. Na segunda, a foto era da própria escada de
   * fatias — oito caixas em degrau em volta de uma parede caída, cada uma
   * ainda maior que o pedaço que representa.
   *
   * A resposta agora é a do veículo: uma caixa só, no sistema do corpo, e
   * quem pergunta leva a pergunta pra lá. Exata, e uma.
   */
  const mundo6 = bancada();
  const barra = new THREE.Mesh(new THREE.BoxGeometry(12, 1, 0.7));
  barra.position.set(0, 0.5, 0);
  barra.updateMatrix();
  const colisorBarra = {
    box: new THREE.Box3(new THREE.Vector3(-6, 0, -0.35), new THREE.Vector3(6, 1, 0.35)),
    standable: false
  };
  mundo6.colliders.push(colisorBarra);
  const propBarra = mundo6.settling.register({
    x: 0, z: 0, baseY: 0, radius: 6, collider: colisorBarra, parts: [{ mesh: barra }]
  });

  eq('em pé, ela é uma caixa só', mundo6.colliders.length, 1);
  ok('e em pé ela não precisa de caixa girada', !colisorBarra.girado);

  mundo6.cavar(0, 0, -DEFORM.FUNDO * 4);
  // giro PELA PONTA: é o caso da foto, e o que faz a envolvente inchar
  mundo6.settling.update(DT);
  propBarra.eixoX = 0;
  propBarra.eixoZ = 1;
  mundo6.rodar(8);

  eq('tombada, ela CONTINUA sendo uma caixa só', mundo6.colliders.length, 1);
  ok('e ganha a conversão pro sistema dela', Boolean(colisorBarra.girado));

  barra.updateMatrixWorld(true);
  const desenhoBarra = new THREE.Box3().setFromObject(barra);
  const volume = (b) => {
    const t = b.getSize(new THREE.Vector3());
    return t.x * t.y * t.z;
  };
  const corpo = 12 * 1 * 0.7;
  const inchada = volume(colisorBarra.box);

  // A ENVOLVENTE continua inchada — é o que ela é, e é por isso que ela não
  // pode ser a resposta final. O índice espacial usa ela e está certo.
  ok('a envolvente é bem maior que o corpo', inchada > corpo * 2,
    `${inchada.toFixed(1)} m³ contra ${corpo.toFixed(1)} do corpo`);
  ok('e ela cobre o desenho inteiro, que é o trabalho dela',
    colisorBarra.box.min.y <= desenhoBarra.min.y + 0.02
    && colisorBarra.box.max.y >= desenhoBarra.max.y - 0.02);

  /**
   * O que prova o conserto é a COLISÃO, não a caixa.
   *
   * Um ponto dentro da envolvente e longe do corpo tinha que ser ar — e era
   * parede na versão de uma caixa só, e degrau na versão fatiada. Ele é
   * escolhido pela geometria: a barra caiu pra um lado, então o canto oposto
   * da envolvente, no alto, está garantidamente vazio.
   */
  const alto = colisorBarra.box.max.y - 0.4;
  const noAr = { x: 0, z: colisorBarra.box.min.z + 0.2 };
  const noCorpo = { x: 0, z: 0 };

  const faixaNoAr = intervaloVertical(colisorBarra.girado, noAr.x, noAr.z);
  ok('o canto vazio da envolvente é AR pra caixa girada',
    !faixaNoAr || faixaNoAr.sai < alto,
    faixaNoAr ? `entra ${faixaNoAr.entra.toFixed(2)} sai ${faixaNoAr.sai.toFixed(2)}` : 'nenhuma');
  ok('e a colisão concorda',
    !collides(mundo6.colliders, noAr.x, noAr.z, alto, 1.7));

  // E o corpo continua sendo corpo: consertar "o jogador esbarra em ar" não
  // pode virar "o jogador atravessa a barra".
  const faixaNoCorpo = intervaloVertical(colisorBarra.girado, noCorpo.x, noCorpo.z);
  ok('em cima do corpo a vertical cruza a caixa', Boolean(faixaNoCorpo));
  ok('e ali a colisão barra',
    collides(mundo6.colliders, noCorpo.x, noCorpo.z,
      faixaNoCorpo.sai - 0.9, 1.7));

  note('barra de 12 m tombada',
    `1 colisor · corpo ${corpo.toFixed(1)} m³ · envolvente ${inchada.toFixed(1)} m³`);

  suite('o topo de um prop tombado é INCLINADO');

  /**
   * O ganho que a escada de fatias nunca deu: a caixa girada tem topo
   * inclinado, então andar por cima de uma parede caída sobe junto com ela.
   * Com fatias, o topo de cada degrau era plano e o jogador subia em pulos.
   */
  const mundoTopo = bancada();
  const laje = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, 3));
  laje.position.set(0, 0.4, 0);
  laje.updateMatrix();
  const colisorLaje = {
    box: new THREE.Box3(new THREE.Vector3(-5, 0, -1.5), new THREE.Vector3(5, 0.8, 1.5)),
    standable: true
  };
  mundoTopo.colliders.push(colisorLaje);
  const propLaje = mundoTopo.settling.register({
    x: 0, z: 0, baseY: 0, radius: 5, collider: colisorLaje, parts: [{ mesh: laje }]
  });
  mundoTopo.cavar(0, 0, -DEFORM.FUNDO * 4);
  mundoTopo.settling.update(DT);
  propLaje.eixoX = 0;
  propLaje.eixoZ = 1;
  mundoTopo.rodar(8);

  /**
   * As sondas ficam DENTRO da laje caída, e isso não é detalhe.
   *
   * Tombada 66°, a laje de 10 m projeta uns 4 m no eixo X — sondar a 3 m do
   * centro cai no vazio e `groundHeightAt` devolve o terreno, que aqui é um
   * buraco de vários metros. A primeira versão deste teste media −99 e
   * "passava" a asserção de que as pontas estão em alturas diferentes.
   */
  const topoEm = (x) => groundHeightAt(mundoTopo.colliders, x, 0, 6, -99);
  const esquerda = topoEm(-1.2);
  const meio = topoEm(0);
  const direita = topoEm(1.2);

  ok('há laje sobre as três sondas',
    esquerda > -90 && meio > -90 && direita > -90,
    `${esquerda.toFixed(2)} · ${meio.toFixed(2)} · ${direita.toFixed(2)}`);
  ok('e o topo SOBE de um lado pro outro',
    Math.abs(esquerda - direita) > 0.5,
    `${esquerda.toFixed(2)} m contra ${direita.toFixed(2)} m`);
  // O meio ENTRE as pontas é o que diz que é rampa: uma escada de fatias dava
  // patamares planos, e o jogador subia a parede caída em pulos.
  between('e o meio fica entre elas',
    meio, Math.min(esquerda, direita) - 0.05, Math.max(esquerda, direita) + 0.05);
  note('topo inclinado',
    `x -1,2: ${esquerda.toFixed(2)} · x 0: ${meio.toFixed(2)}`
    + ` · x 1,2: ${direita.toFixed(2)}`);

  suite('quem tem chão não se mexe');

  const mundo3 = bancada();
  const firme = poste(mundo3, 0, 0, 3);
  const alturaAntes = firme.mesh.position.y;

  // cava longe: nada deve acontecer com este prop
  mundo3.cavar(30, 30);
  mundo3.rodar(2);
  eq('cavar longe não derruba nada', mundo3.settling.falling, 0);
  near('e o prop não se mexeu', firme.mesh.position.y, alturaAntes, 1e-9);

  // aterrar por cima também não pode fazer nada cair
  mundo3.deform.apply(0, 0, DEFORM.MONTE);
  mundo3.settling.disturb(0, 0, DEFORM.RAIO);
  mundo3.rodar(1);
  eq('aterrar em volta não derruba', mundo3.settling.falling, 0);
  near('e o prop segue de pé', firme.mesh.position.y, alturaAntes, 1e-9);

  suite('custo');

  // Só o que a pazada tocou é reavaliado: varrer o mapa a cada cavada seria
  // absurdo num mapa com centenas de props.
  const mundo4 = bancada();
  for (let i = 0; i < 400; i++) {
    poste(mundo4, (i % 20) * 12 - 120, Math.floor(i / 20) * 12 - 120, 3);
  }
  eq('registrou todos', mundo4.settling.props.length, 400);

  // Medir MILISSEGUNDOS aqui não prova nada: a suíte roda sob
  // --virtual-time-budget, e ali performance.now() não anda. Esta asserção já
  // foi `custo < 1.5` e passava com 0,000 ms — verde sem testar coisa alguma.
  //
  // O que dá pra provar é a REGRA: só o que a pazada tocou é reavaliado. Se
  // ela varresse o mapa, uma cavada consultaria a altura de todos os 400
  // props, cinco pontos cada.
  let consultas = 0;
  const original = mundo4.terrain.heightAt;
  mundo4.terrain.heightAt = (x, z) => {
    consultas++;
    return original(x, z);
  };

  mundo4.cavar(0, 0);
  ok('uma pazada não varre o mapa inteiro', consultas < 400,
    `${consultas} consultas de altura, com 400 props no mapa`);
  note('consultas por pazada', `${consultas} para 400 props`);

  mundo4.terrain.heightAt = original;
}
