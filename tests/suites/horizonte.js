import * as THREE from 'three';
import { CAMERA, WORLD } from '../../src/config.js';
import { createHeightfield } from '../../src/world/heightfield.js';
import { fbm } from '../../src/world/noise.js';
import * as serra from '../../src/world/serra.js';
import { addHorizonte } from '../../src/world/horizonte.js';
import { addCostura } from '../../src/world/costura.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

/**
 * O relevo falso que fecha o horizonte.
 *
 * A regra aqui é a mesma do telêmetro: suíte que só confere "apareceu algo"
 * não prova nada. O que este arquivo mede é geometria conferível — que a
 * costura fecha em ZERO, que nenhum vértice do anel cai dentro do quadrado
 * jogável, que o campo de altura sai da montagem BYTE POR BYTE igual, e que o
 * plano distante passa da névoa.
 */
export function run() {
  suite('horizonte falso');

  const campo = createHeightfield([]);
  const M = serra.BORDA;

  /** Um ponto no perímetro do quadrado jogável, por parâmetro 0..4. */
  const noPerimetro = (t) => {
    if (t < 1) return [-M + t * 2 * M, -M];
    if (t < 2) return [M, -M + (t - 1) * 2 * M];
    if (t < 3) return [M - (t - 2) * 2 * M, M];
    return [-M, M - (t - 3) * 2 * M];
  };

  // --- O plano distante tem que passar da névoa ------------------------------
  //
  // É o invariante que a feature toda depende, e o mais barato de travar. Com
  // FAR menor que FOG_FAR o mundo é CORTADO com a cor dele ainda na tela:
  // medido, em 400 m a névoa fez 29% do trabalho e o pixel saltava 233 níveis
  // somados numa linha só. E não é só estética — o engajamento mais longo do
  // mapa é de 700 m, e `bots/bots.js` desanexa o soldado em `FAR + 20`.
  ok('o plano distante passa da névoa', CAMERA.FAR >= WORLD.FOG_FAR,
    `FAR ${CAMERA.FAR} contra FOG_FAR ${WORLD.FOG_FAR}`);
  const trabalhoNoCorte = (CAMERA.FAR - WORLD.FOG_NEAR)
    / (WORLD.FOG_FAR - WORLD.FOG_NEAR);
  ok('e no corte a névoa já terminou o trabalho', trabalhoNoCorte >= 1,
    `${(Math.min(1, trabalhoNoCorte) * 100).toFixed(0)}% de névoa em ${CAMERA.FAR} m`);

  // --- A largura do anel sai da névoa, não de gosto --------------------------
  //
  // Mais estreito que FOG_FAR e a borda de FORA do anel volta a ser uma reta
  // visível, só mais longe; mais largo é triângulo que ninguém pode ver, porque
  // em FOG_FAR o quadro já é exatamente a cor do horizonte.
  ok('o anel é mais largo que o alcance da névoa', serra.LARGURA > WORLD.FOG_FAR,
    `${serra.LARGURA} m de anel contra ${WORLD.FOG_FAR} m de névoa`);

  // --- A costura fecha em ZERO ----------------------------------------------
  //
  // A base do anel é a PRÓPRIA `naturalHeight` da ilha continuada pra fora, e
  // não uma segunda função com constante de emenda. É isso que faz a costura
  // fechar por construção em vez de fechar por ajuste.
  let piorCostura = 0;
  for (let i = 0; i <= 2000; i++) {
    const [x, z] = noPerimetro((i / 2000) * 4);
    piorCostura = Math.max(piorCostura,
      Math.abs(serra.alturaDoHorizonte(campo.naturalHeight, x, z)
        - campo.heightAt(x, z)));
  }
  near('o anel encosta na borda do terreno sem degrau', piorCostura, 0, 1e-9);

  // --- E a serra sobe de ZERO na borda --------------------------------------
  //
  // Crista nascendo rente à borda seria uma montanha brotando do planalto plano
  // a um metro do pé de quem está encostado no limite do mapa.
  for (const t of [0.37, 1.4, 2.6, 3.1]) {
    const [x, z] = noPerimetro(t);
    eq(`peso da serra é zero na borda (t=${t})`,
      serra.pesoDaSerra(x, z, campo.naturalHeight(x, z)), 0);
  }

  // --- Serra não nasce do mar ----------------------------------------------
  //
  // A borda norte é o Canal: medida, ela dá -9,7 m chapados nos 2 km. Montanha
  // subindo da água em frente à praia de desembarque seria uma costa que a
  // Normandia de 1944 não tem, e o que fecha aquele lado é a névoa.
  let comSerraNoMar = 0;
  let alturaMaximaNoMar = -Infinity;
  for (let k = 0; k <= 400; k++) {
    const x = -M + (k / 400) * 2 * M;
    for (const fora of [200, 500, 900]) {
      const z = -M - fora;
      const base = campo.naturalHeight(x, z);
      const h = serra.alturaDoHorizonte(campo.naturalHeight, x, z);
      if (h - base > 0.001) comSerraNoMar++;
      alturaMaximaNoMar = Math.max(alturaMaximaNoMar, h);
    }
  }
  eq('nenhuma crista ao norte, onde é mar', comSerraNoMar, 0);
  ok('e o fundo continua debaixo da lâmina',
    alturaMaximaNoMar < WORLD.WATER_LEVEL,
    `topo ${alturaMaximaNoMar.toFixed(1)} m contra lâmina ${WORLD.WATER_LEVEL}`);

  // --- O sino do ruído: os percentis são MEDIDA ------------------------------
  //
  // Mesma armadilha do grão e da densidade. Sem esticar p5..p95, os 2,0 de
  // faixa nominal do `fbm` entregam 0,925 sobre o anel — 46% da amplitude
  // declarada, e a serra vira lombada. Mexer na escala, nas oitavas ou na
  // largura do anel exige remedir estes dois números.
  const massa = [];
  const passo = 37;   // primo com o passo da malha, pra não amostrar em fase
  for (let x = -serra.FORA; x <= serra.FORA; x += passo) {
    for (let z = -serra.FORA; z <= serra.FORA; z += passo) {
      if (!serra.noAnel(x, z)) continue;
      massa.push(fbm(x * serra.ESCALA_MASSA, z * serra.ESCALA_MASSA, 2));
    }
  }
  massa.sort((a, b) => a - b);
  const pct = (q) => massa[Math.floor(q * (massa.length - 1))];
  note('pontos do anel amostrados', massa.length);
  near('o p5 medido bate com a constante', pct(0.05), serra.P5, 0.02);
  near('o p95 medido bate com a constante', pct(0.95), serra.P95, 0.02);
  between('e o esticão devolve a faixa quase inteira',
    (serra.P95 - serra.P5) / 2, 0.35, 0.55);

  // --- A crista PASSA do olho, senão o anel é um tapete ----------------------
  //
  // Do olho de quem está em pé no planalto (24 m de chão, 25,7 de olho), uma
  // crista que não passe dessa altura fica escondida atrás da própria linha do
  // horizonte e não fecha nada.
  const OLHO = WORLD.ALTURA_PLANALTO + 1.7;
  let acimaDoOlho = 0;
  let total = 0;
  let topo = -Infinity;
  for (let x = -serra.FORA; x <= serra.FORA; x += passo) {
    for (let z = -serra.FORA; z <= serra.FORA; z += passo) {
      if (!serra.noAnel(x, z)) continue;
      if (serra.distanciaDaBorda(x, z) < 400) continue;
      const h = serra.alturaDoHorizonte(campo.naturalHeight, x, z);
      if (h > OLHO) acimaDoOlho++;
      topo = Math.max(topo, h);
      total++;
    }
  }
  const fracao = acimaDoOlho / total;
  note('crista mais alta', `${topo.toFixed(0)} m`);
  between('metade do anel distante passa do olho do jogador', fracao, 0.35, 0.8);
  between('e a crista mais alta fecha o quadro sem virar alpe', topo, 80, 160);

  // --- Onde as duas resoluções se encontram, elas se encontram EXATAS --------
  //
  // É o conserto da fenda, e ele é conferível de cabeça: a aresta de dentro da
  // banda usa o passo do TERRENO e a de fora usa o passo do ANEL, então nenhuma
  // das duas é aproximação da outra. Duas saídas anteriores estão medidas em
  // `costura.js` — a cortina vertical trocava o mar por uma linha escura, e
  // travar a fileira interna no mínimo da célula afundava 43 dos 324 vértices
  // em mais de 1 m e o pior em 8,4, cavando uma vala ao longo da escarpa.
  const passoTerreno = WORLD.SIZE / WORLD.TERRAIN_SEGMENTS;
  eq('a grade do anel é uniforme e fecha na largura',
    serra.FORA - serra.BORDA, serra.ABAS * serra.PASSO);
  ok('e ±BORDA cai em cima de uma linha dela',
    Number.isInteger((serra.FORA - serra.BORDA) / serra.PASSO)
    && Number.isInteger((2 * serra.BORDA) / serra.PASSO));
  ok('o passo do anel é múltiplo inteiro do passo do terreno',
    Number.isInteger(serra.PASSO / passoTerreno),
    `${serra.PASSO} / ${passoTerreno} = ${serra.PASSO / passoTerreno}`);

  // --- A MALHA: inalcançável, e nada de colisor -----------------------------
  const cena = new THREE.Scene();
  const lidos = [];
  const terrenoFalso = {
    naturalHeight: (x, z) => {
      lidos.push('naturalHeight');
      return campo.naturalHeight(x, z);
    },
    heightAt: () => { lidos.push('heightAt'); return 0; }
  };

  const antes = [];
  for (let k = 0; k < 400; k++) {
    const x = (k % 20) / 19 * 1900 - 950;
    const z = Math.floor(k / 20) / 19 * 1900 - 950;
    antes.push(campo.heightAt(x, z));
  }

  const anel = addHorizonte(cena, terrenoFalso);
  const banda = addCostura(cena, terrenoFalso);

  eq('o anel e a banda entram como dois objetos, e só', cena.children.length, 2);
  eq('nenhum deles consulta heightAt',
    lidos.filter((n) => n === 'heightAt').length, 0);

  // A prova de que nada mudou no campo de altura: os MESMOS 400 pontos.
  let mudou = 0;
  for (let k = 0; k < 400; k++) {
    const x = (k % 20) / 19 * 1900 - 950;
    const z = Math.floor(k / 20) / 19 * 1900 - 950;
    if (campo.heightAt(x, z) !== antes[k]) mudou++;
  }
  eq('o campo de altura sai da montagem idêntico em 400 pontos', mudou, 0);

  // Inalcançável: nenhum vértice DESENHADO cai dentro do quadrado jogável.
  // Os vértices não indexados ficam em zero e não são desenhados — testar o
  // buffer inteiro acusaria a origem, que ninguém vê.
  const pos = anel.mesh.geometry.getAttribute('position');
  const idx = anel.mesh.geometry.getIndex();
  let dentro = 0;
  const vistos = new Set();
  for (let i = 0; i < idx.count; i++) {
    const v = idx.getX(i);
    if (vistos.has(v)) continue;
    vistos.add(v);
    if (Math.max(Math.abs(pos.getX(v)), Math.abs(pos.getZ(v))) < M - 1e-6) dentro++;
  }
  eq('nenhum vértice desenhado do anel cai dentro do quadrado jogável', dentro, 0);
  note('vértices desenhados do anel', vistos.size);

  ok('o anel não se diz pisável', !anel.mesh.userData?.standable
    && !banda.mesh.userData?.standable);

  // --- A banda: as duas arestas caem em cima das duas poligonais ------------
  eq('a aresta de dentro da banda usa o passo do terreno',
    banda.stats.fino, passoTerreno);
  eq('a de fora usa o passo do anel', banda.stats.grosso, serra.PASSO);

  const bp = banda.mesh.geometry.getAttribute('position');
  let piorDentro = 0;
  let piorFora = 0;
  let naBorda = 0;
  for (let k = 0; k < bp.count; k++) {
    const x = bp.getX(k);
    const z = bp.getZ(k);
    const fora = Math.max(Math.abs(x), Math.abs(z)) - serra.BORDA;
    const erro = Math.abs(bp.getY(k)
      - serra.alturaDoHorizonte(campo.naturalHeight, x, z));
    if (Math.abs(fora) < 1e-6) { naBorda++; piorDentro = Math.max(piorDentro, erro); }
    else piorFora = Math.max(piorFora, erro);
  }
  eq('a aresta de dentro tem um vértice por vértice do terreno',
    naBorda, 4 * (WORLD.TERRAIN_SEGMENTS + 1));
  near('e ela cai exatamente na aresta do terreno', piorDentro, 0, 1e-3);
  near('a de fora cai exatamente na fileira do anel', piorFora, 0, 1e-3);

  // Nenhum vértice da banda está a mais de um passo de anel da borda: ela é a
  // faixa de transição, não uma segunda camada de relevo.
  let longe = 0;
  for (let k = 0; k < bp.count; k++) {
    const fora = Math.max(Math.abs(bp.getX(k)), Math.abs(bp.getZ(k))) - serra.BORDA;
    if (fora > serra.BANDA + 1e-6 || fora < -1e-6) longe++;
  }
  eq('a banda cabe num passo de anel', longe, 0);

  // --- Orçamento: resolução pior porque é longe -----------------------------
  //
  // O terreno jogável são 1,28 M de triângulos. O anel fecha 1200 m de
  // horizonte em volta dele com 2,5 km² de superfície — quatro vezes a área do
  // mapa — e cabe em 4% disso porque é longe, e porque a névoa e o mipmap comem
  // detalhe que ninguém pediria pra pagar.
  const doTerreno = WORLD.TERRAIN_SEGMENTS * WORLD.TERRAIN_SEGMENTS * 2;
  const doAnel = anel.stats.triangulos + banda.stats.triangulos;
  note('triângulos do anel + banda', doAnel.toLocaleString('pt-br'));
  note('triângulos do terreno jogável', doTerreno.toLocaleString('pt-br'));
  ok('o horizonte custa menos de 5% do terreno jogável',
    doAnel < doTerreno * 0.05,
    `${(doAnel / doTerreno * 100).toFixed(2)}%`);
  eq('e é uma malha por assunto, não uma por faixa', anel.stats.malhas, 1);

  // Área coberta contra triângulo gasto: é o número que diz "resolução pior".
  const areaAnel = (2 * serra.FORA) ** 2 - WORLD.SIZE ** 2;
  const areaMapa = WORLD.SIZE ** 2;
  note('área do anel', `${(areaAnel / 1e6).toFixed(2)} km² contra ${(areaMapa / 1e6).toFixed(2)} do mapa`);
  ok('mais área que o mapa, com uma fração dos triângulos',
    areaAnel > areaMapa && doAnel < doTerreno * 0.05);
}
