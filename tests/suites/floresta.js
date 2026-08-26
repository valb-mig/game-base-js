import { createHeightfield } from '../../src/world/heightfield.js';
import { espalhar, sorteioFixo } from '../../src/world/props.js';
import { GRAMA, TERRA } from '../../src/world/ground.js';
import {
  densidadeFloresta, faixaDeFloresta, densidadeDaFaixa,
  CAMPO, ARVOREDO, BOSQUE, MATA, MATA_FECHADA
} from '../../src/world/densidade.js';
import { WORLD } from '../../src/config.js';
import { suite, ok, eq, between, note } from '../assert.js';

const FAIXAS = [CAMPO, ARVOREDO, BOSQUE, MATA, MATA_FECHADA];
const R = WORLD.ISLAND_RADIUS;

/** As mesmas zonas planas que world.js monta, senão o teste mede outro mapa. */
function campo() {
  const probe = createHeightfield([]);
  const n = WORLD.BASE_KARNIA;
  const s = WORLD.BASE_VESTRIA;
  return createHeightfield([
    { ...n, radius: 24, blend: 18, height: probe.naturalHeight(n.x, n.z) },
    { ...s, radius: 24, blend: 18, height: probe.naturalHeight(s.x, s.z) }
  ]);
}

/** Varre a ilha num passo fixo, chamando `visita(x, z)` só dentro do raio. */
function varrer(passo, visita) {
  for (let x = -R; x <= R; x += passo) {
    for (let z = -R; z <= R; z += passo) {
      if (Math.hypot(x, z) <= R) visita(x, z);
    }
  }
}

/** Distância do ponto à árvore mais próxima da lista. */
function aoMaisPerto(x, z, pontos) {
  let melhor = Infinity;
  for (const p of pontos) {
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < melhor) melhor = d;
  }
  return Math.sqrt(melhor);
}

function percentil(valores, p) {
  const ordenado = [...valores].sort((a, b) => a - b);
  return ordenado[Math.floor(p * (ordenado.length - 1))];
}

export function run() {
  const field = campo();
  const nunca = () => false;

  // ------------------------------------------------------------------ 1
  suite('máscara de floresta: repartição');

  const naIlha = new Map(FAIXAS.map((f) => [f, 0]));
  const naGrama = new Map(FAIXAS.map((f) => [f, 0]));
  let total = 0;
  let grama = 0;

  varrer(5, (x, z) => {
    total++;
    const faixa = faixaDeFloresta(x, z);
    naIlha.set(faixa, naIlha.get(faixa) + 1);
    if (field.tipoAt(x, z) === GRAMA) {
      grama++;
      naGrama.set(faixa, naGrama.get(faixa) + 1);
    }
  });

  const pct = (mapa, base) => (f) => (100 * mapa.get(f)) / base;
  const daIlha = pct(naIlha, total);

  // As cinco existem de verdade. Uma faixa que nunca ocorre é uma faixa que
  // só existe na tabela — o mapa continua sendo uma coisa só com nome de cinco.
  for (const faixa of FAIXAS) {
    ok(`a faixa "${faixa}" ocorre no mapa`, naIlha.get(faixa) > 0,
      `${daIlha(faixa).toFixed(1)}% da ilha`);
  }

  // Campo aberto tem que ser GRANDE. É ele que faz atravessar ser decisão, e
  // com uma fatia pequena o mapa volta a ser floresta em todo lugar.
  between('campo aberto é um terço do mapa', daIlha(CAMPO), 25, 38);
  between('e a mata fechada é rara, não o normal', daIlha(MATA_FECHADA), 4, 14);

  note('repartição', FAIXAS.map((f) => `${f} ${daIlha(f).toFixed(1)}%`).join(' · '));

  // A máscara não conhece o chão: ela é ruído deslocado 9000 na grade,
  // justamente pra não andar junto com o relevo. Se ela preferisse praia ou
  // barranco, a repartição sobre a GRAMA se afastaria da repartição da ilha.
  const daGrama = pct(naGrama, grama);
  let maiorDesvio = 0;
  for (const faixa of FAIXAS) {
    maiorDesvio = Math.max(maiorDesvio, Math.abs(daIlha(faixa) - daGrama(faixa)));
  }
  ok('a máscara não prefere nenhum tipo de chão', maiorDesvio < 1.5,
    `maior desvio ilha × grama: ${maiorDesvio.toFixed(2)} ponto`);

  // ------------------------------------------------------------------ 2
  suite('máscara de floresta: sorteio');

  const comMascara = espalhar(WORLD.TREE_COUNT, {
    heightAt: field.heightAt, tipoAt: field.tipoAt, tipos: [GRAMA],
    blocked: nunca, rng: sorteioFixo(20250824), densidade: densidadeFloresta
  });
  const semMascara = espalhar(WORLD.TREE_COUNT, {
    heightAt: field.heightAt, tipoAt: field.tipoAt, tipos: [GRAMA],
    blocked: nunca, rng: sorteioFixo(20250824)
  });

  // A peneira derruba o aceite pra menos de um terço, e o teto de tentativas
  // do `espalhar` tem que continuar dando conta. Se ele parar antes, a
  // floresta nasce rala e NENHUM erro aparece em lugar nenhum — o teste
  // existe por causa desse silêncio.
  eq('a máscara não come árvore: saem as 1400', comMascara.length, WORLD.TREE_COUNT);
  eq('e sem ela também', semMascara.length, WORLD.TREE_COUNT);

  // Campo aberto tem densidade zero, e zero quer dizer zero.
  const emCampo = comMascara.filter((t) => faixaDeFloresta(t.x, t.z) === CAMPO);
  eq('nenhuma árvore nasce em campo aberto', emCampo.length, 0);
  eq('porque a densidade do campo é zero', densidadeDaFaixa(CAMPO), 0);

  // E a mata fechada, que é 8% do mapa, tem que levar MUITO mais que 8% das
  // árvores — senão a máscara está lá sem fazer nada.
  const naMataFechada = comMascara.filter(
    (t) => faixaDeFloresta(t.x, t.z) === MATA_FECHADA).length;
  const fatia = (100 * naMataFechada) / comMascara.length;
  ok('a mata fechada concentra árvore muito além da sua área',
    fatia > daIlha(MATA_FECHADA) * 2, `${fatia.toFixed(1)}% das árvores em ` +
    `${daIlha(MATA_FECHADA).toFixed(1)}% do mapa`);

  // ------------------------------------------------------------------ 3
  suite('máscara de floresta: mata e clareira');

  // O ponto de tudo isto, medido de dois jeitos com a MESMA contagem de
  // árvores nos dois lados — se a conta mudasse junto, qualquer diferença
  // seria só "mais árvore" em vez de "árvore em outro lugar".
  //
  // Dentro da mata a vizinha fica mais perto (a mata é grossa), e no campo o
  // vazio fica maior (a clareira existe). Espalhados parelhos, os dois números
  // são o mesmo número.
  /**
   * Uma AMOSTRA fixa das árvores, não todas.
   *
   * A distância ao vizinho mais próximo é O(n²), e `TREE_COUNT` triplicou:
   * com 4200 árvores são 17,6 milhões de distâncias, e a suíte inteira roda
   * sob um orçamento de tempo virtual de 15 s — estourá-lo não dá erro, faz
   * as suítes SEGUINTES falharem ao carregar, três nomes depois da causa.
   * A mediana de 1200 amostras é a mesma mediana.
   *
   * A amostra é um passo fixo pela lista, não as 1200 primeiras: a ordem em
   * que `espalhar` aceita os pontos não é aleatória no espaço, e o começo da
   * lista sozinho mediria um pedaço do mapa.
   */
  const AMOSTRA = 1200;
  const amostrar = (pontos) => {
    const passo = Math.max(1, Math.floor(pontos.length / AMOSTRA));
    return pontos.filter((_, i) => i % passo === 0);
  };

  const vizinha = (pontos) => pontos.map((p, i) => {
    let melhor = Infinity;
    for (let j = 0; j < pontos.length; j++) {
      if (j === i) continue;
      const dx = pontos[j].x - p.x;
      const dz = pontos[j].z - p.z;
      const d = dx * dx + dz * dz;
      if (d < melhor) melhor = d;
    }
    return Math.sqrt(melhor);
  });

  const pertoCom = percentil(vizinha(amostrar(comMascara)), 0.5);
  const pertoSem = percentil(vizinha(amostrar(semMascara)), 0.5);
  ok('na mata a árvore vizinha fica mais perto', pertoCom < pertoSem * 0.8,
    `${pertoCom.toFixed(1)} m com máscara contra ${pertoSem.toFixed(1)} sem`);

  // Mesmo motivo: cada ponto varrido testa TODAS as árvores. A 25 m de passo
  // sobre a ilha inteira são 6 mil pontos, e com 4200 árvores isso são 25
  // milhões de distâncias por lado. 45 m dá 1900 pontos, e o p95 do vazio não
  // muda — o que se mede é uma clareira de 100 m.
  const vaziosCom = [];
  const vaziosSem = [];
  const arvoresCom = amostrar(comMascara);
  const arvoresSem = amostrar(semMascara);
  varrer(45, (x, z) => {
    if (field.tipoAt(x, z) !== GRAMA) return;
    vaziosCom.push(aoMaisPerto(x, z, arvoresCom));
    vaziosSem.push(aoMaisPerto(x, z, arvoresSem));
  });

  const vazioCom = percentil(vaziosCom, 0.95);
  const vazioSem = percentil(vaziosSem, 0.95);
  ok('e o campo aberto tem vazio de verdade', vazioCom > vazioSem * 1.5,
    `${vazioCom.toFixed(0)} m até a árvore mais próxima, contra ${vazioSem.toFixed(0)} sem`);
  ok('vazio grande o bastante pra ser uma travessia',
    vazioCom > 60, `${vazioCom.toFixed(0)} m`);

  note('vizinha mais próxima (mediana)',
    `${pertoCom.toFixed(1)} m com · ${pertoSem.toFixed(1)} m sem`);
  note('maior vazio na grama (p95)',
    `${vazioCom.toFixed(0)} m com · ${vazioSem.toFixed(0)} m sem`);

  // ------------------------------------------------------------------ 4
  suite('máscara de floresta: o que ela NÃO manda');

  // Pedra não é vegetação, e no campo aberto ela é a única cobertura que
  // sobra. Amarrá-la à floresta deixaria o campo sem nada atrás de que se
  // agachar — e aí "atravessar campo aberto" deixa de ser difícil e vira
  // impossível.
  const pedras = espalhar(WORLD.ROCK_COUNT, {
    heightAt: field.heightAt, tipoAt: field.tipoAt, tipos: [GRAMA, TERRA],
    blocked: nunca, rng: sorteioFixo(20250824)
  });
  const pedraNoCampo = pedras.filter(
    (p) => faixaDeFloresta(p.x, p.z) === CAMPO).length;
  ok('pedra continua nascendo em campo aberto', pedraNoCampo > 0,
    `${pedraNoCampo} de ${pedras.length}`);

  // E o relevo é o mesmo de antes: a máscara é camada à parte, não entra no
  // campo de altura. Se ela vazasse pro terreno, a mata fechada e o campo
  // aberto estariam em alturas sistematicamente diferentes.
  let somaCampo = 0;
  let nCampo = 0;
  let somaMata = 0;
  let nMata = 0;
  varrer(10, (x, z) => {
    if (field.tipoAt(x, z) !== GRAMA) return;
    const faixa = faixaDeFloresta(x, z);
    if (faixa === CAMPO) { somaCampo += field.heightAt(x, z); nCampo++; }
    if (faixa === MATA_FECHADA) { somaMata += field.heightAt(x, z); nMata++; }
  });
  const altCampo = somaCampo / nCampo;
  const altMata = somaMata / nMata;
  ok('a máscara não anda junto com o relevo',
    Math.abs(altCampo - altMata) < 3,
    `campo a ${altCampo.toFixed(1)} m, mata fechada a ${altMata.toFixed(1)} m`);

  // A tabela é uma ESCALA, e a ordem é a regra — os valores são só o jeito de
  // escrevê-la. Sem isto, um ajuste distraído pode deixar bosque mais grosso
  // que mata sem quebrar nada visível.
  const escala = FAIXAS.map(densidadeDaFaixa);
  ok('a densidade cresce do campo pra mata fechada',
    escala.every((d, i) => i === 0 || d > escala[i - 1]),
    escala.join(' < '));
}
