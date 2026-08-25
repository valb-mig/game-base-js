import * as THREE from 'three';
import { createSettling } from '../../src/world/settling.js';
import { createDeform, DEFORM } from '../../src/world/deform.js';
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
 * O volume que a colisão enxerga de um prop: a união das caixas dele.
 *
 * Um prop tombado tem VÁRIAS, fatiadas ao longo do corpo — comparar só
 * `prop.collider` com o desenho compara um oitavo dele com o todo.
 */
function caixaDe(prop) {
  const uniao = new THREE.Box3();
  const caixas = prop.fatias
    ? prop.fatias.map((f) => f.colisor.box)
    : [prop.collider.box];
  for (const caixa of caixas) uniao.union(caixa);
  return uniao;
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

  suite('corpo comprido tombado vira várias caixas');

  // Reportado com foto: uma barra na diagonal virava uma caixa gigante
  // alinhada aos eixos, e o jogador esbarrava em ar longe dela. Uma caixa só
  // não representa corpo diagonal.
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

  mundo6.cavar(0, 0, -DEFORM.FUNDO * 4);
  // giro PELA PONTA: é o caso da foto, e o que faz a caixa única inchar
  mundo6.settling.update(DT);
  propBarra.eixoX = 0;
  propBarra.eixoZ = 1;
  mundo6.rodar(8);

  ok('tombada, ela vira várias', mundo6.colliders.length > 1,
    `${mundo6.colliders.length} caixas`);
  eq('e o prop guarda as fatias', propBarra.fatias.length, mundo6.colliders.length);

  // O que não pode acontecer: buraco entre as fatias. Elas são pedaços
  // contíguos da caixa de pé passados pela mesma matriz, então a união tem
  // que conter o desenho inteiro — senão dá pra atravessar a barra.
  barra.updateMatrixWorld(true);
  const desenhoBarra = new THREE.Box3().setFromObject(barra);
  const uniao = new THREE.Box3();
  for (const fatia of propBarra.fatias) uniao.union(fatia.colisor.box);

  const folga = 0.02;
  ok('a união das fatias cobre o corpo inteiro',
    uniao.min.x <= desenhoBarra.min.x + folga && uniao.max.x >= desenhoBarra.max.x - folga &&
    uniao.min.y <= desenhoBarra.min.y + folga && uniao.max.y >= desenhoBarra.max.y - folga,
    `união ${uniao.min.y.toFixed(2)}..${uniao.max.y.toFixed(2)}` +
    ` · desenho ${desenhoBarra.min.y.toFixed(2)}..${desenhoBarra.max.y.toFixed(2)}`);

  // E o ganho: somadas, as fatias ocupam muito menos ar que a caixa única.
  const volume = (b) => {
    const t = b.getSize(new THREE.Vector3());
    return t.x * t.y * t.z;
  };
  const somaFatias = propBarra.fatias.reduce((n, f) => n + volume(f.colisor.box), 0);
  ok('e elas ocupam bem menos ar que uma caixa só',
    somaFatias < volume(uniao) * 0.55,
    `${somaFatias.toFixed(1)} m³ contra ${volume(uniao).toFixed(1)} da caixa única`);
  note('barra de 12 m tombada',
    `${propBarra.fatias.length} fatias · ${somaFatias.toFixed(1)} m³` +
    ` contra ${volume(uniao).toFixed(1)} m³`);

  suite('prop curto não é fatiado');

  // Fatiar tudo trocaria um problema visível por um invisível: oito colisores
  // por árvore do mapa seriam milhares a mais pra colisão varrer.
  const mundo7 = bancada();
  const pedra = poste(mundo7, 0, 0, 1);
  mundo7.colliders.push(pedra.collider);
  mundo7.cavar(0, 0);
  mundo7.rodar(6);
  ok('um prop baixo continua com uma caixa só',
    !pedra.prop.fatias || pedra.prop.fatias.length <= 1,
    `${pedra.prop.fatias?.length ?? 1} caixa(s)`);

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
