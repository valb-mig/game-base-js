import { WORLD } from '../../src/config.js';
import * as grao from '../../src/world/grao.js';
import { fbmTileavel } from '../../src/world/noise.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

/**
 * O grão do chão. Nada aqui toca three nem canvas — é essa separação que faz
 * a imagem ser conferível fora do navegador, do mesmo jeito que `heightfield`
 * é conferível sem malha.
 */
export function run() {
  suite('grão do chão');

  const dados = grao.desenharGrao();
  const px = (x, y) => dados[((y % grao.LADO) * grao.LADO + (x % grao.LADO)) * 4];

  // --- A imagem FECHA -------------------------------------------------------
  //
  // Textura repetida 645 vezes mostra a costura: se a borda direita não tem
  // nada a ver com a esquerda, a repetição desenha uma linha reta a cada
  // 3,1 m e o grão que existe pra esconder a resolução da malha passa a
  // desenhar uma grade PRÓPRIA em cima dela.
  //
  // A medida é comparativa de propósito. "O salto na costura é pequeno" não
  // prova nada sem saber o quanto dois vizinhos quaisquer saltam — num ruído
  // suave, tudo é pequeno.
  let interno = 0;
  let pares = 0;
  for (let y = 0; y < grao.LADO; y++) {
    for (let x = 0; x < grao.LADO - 1; x++) {
      interno += Math.abs(px(x, y) - px(x + 1, y));
      pares++;
    }
  }
  const saltoNormal = interno / pares;

  let vertical = 0;
  let horizontal = 0;
  for (let k = 0; k < grao.LADO; k++) {
    vertical += Math.abs(px(grao.LADO - 1, k) - px(0, k));
    horizontal += Math.abs(px(k, grao.LADO - 1) - px(k, 0));
  }
  vertical /= grao.LADO;
  horizontal /= grao.LADO;

  ok('a costura vertical não salta mais que dois vizinhos quaisquer',
    vertical <= saltoNormal,
    `${vertical.toFixed(3)} contra ${saltoNormal.toFixed(3)} byte`);
  ok('e a horizontal também', horizontal <= saltoNormal,
    `${horizontal.toFixed(3)} contra ${saltoNormal.toFixed(3)} byte`);
  note('costura', `${(vertical / saltoNormal).toFixed(2)}x o salto normal`);

  // E o motivo de existir `fbmTileavel`: o `fbm` do relevo NÃO fecha. Se um
  // dia alguém trocar um pelo outro por parecerem iguais, isto cai.
  const dobrado = fbmTileavel(0, 3.7, grao.CELULAS, grao.OITAVAS);
  const voltaInteira = fbmTileavel(grao.CELULAS, 3.7, grao.CELULAS, grao.OITAVAS);
  near('uma volta inteira do período devolve o mesmo valor',
    voltaInteira, dobrado, 1e-9);

  // --- O multiplicador não pode clarear -------------------------------------
  //
  // Byte não passa de 255, então o teto do multiplicador é 1: TODO grão
  // escurece a média. É por isso que a compensação de brilho do terreno é
  // medida depois de gerar, e não deduzida antes.
  let menor = 255;
  let maior = 0;
  for (let i = 0; i < dados.length; i += 4) {
    if (dados[i] < menor) menor = dados[i];
    if (dados[i] > maior) maior = dados[i];
  }
  ok('o grão nunca clareia o chão', maior <= 255, `máximo ${maior}`);
  ok('e não escurece além da amplitude declarada',
    menor >= Math.floor((1 - grao.AMPLITUDE) * 255),
    `mínimo ${menor}, piso ${Math.floor((1 - grao.AMPLITUDE) * 255)}`);

  // O número que o terreno precisa compensar. Travado porque mexer nas
  // oitavas ou na amplitude muda o brilho do mapa inteiro sem erro nenhum —
  // e aí o chão fica mais escuro e ninguém sabe de onde veio.
  //
  // Em sRGB ele aparece MENOR do que é: o three multiplica em linear, e um
  // fator de 0,89 lá vira 0,89^(1/2.2) = 0,95 no pixel. Medido no render,
  // -3,8% de média no chão.
  const brilho = grao.brilhoMedio();
  between('o brilho médio escurece pouco', brilho, 0.87, 0.92);
  note('compensação necessária', `${((1 - brilho) * 100).toFixed(1)}% em linear, ` +
    `${((1 - Math.pow(brilho, 1 / 2.2)) * 100).toFixed(1)}% em sRGB`);

  // --- O esticão tem que ENTREGAR a amplitude declarada --------------------
  //
  // Este é o erro que a primeira versão cometeu duas vezes: ruído de valor tem
  // distribuição de sino (p5 0,2224 e p95 0,7211 medidos aqui), então usar o
  // valor cru gastava metade da amplitude, e elevá-lo ao quadrado por cima
  // concentrava tanto que o pixel típico ficava em 0,98. Medido no render, o
  // chão escurecia os 2,4% previstos e variação nenhuma: o `map` entregava a
  // média da textura, e o chão lia como liso.
  const modulacao = 1 - menor / 255;
  near('o grão entrega a amplitude que declara', modulacao, grao.AMPLITUDE, 0.01);
  note('modulação real', `${(modulacao * 100).toFixed(1)}% de ` +
    `${(grao.AMPLITUDE * 100).toFixed(0)}% declarados`);

  // E os percentis são MEDIDA, não escolha: mexer nas oitavas, no período ou
  // no lado muda a distribuição, e as constantes passam a esticar errado.
  const amostras = [];
  const escala = grao.CELULAS / grao.LADO;
  for (let y = 0; y < grao.LADO; y += 2) {
    for (let x = 0; x < grao.LADO; x += 2) {
      amostras.push((fbmTileavel(x * escala, y * escala,
        grao.CELULAS, grao.OITAVAS) + 1) / 2);
    }
  }
  amostras.sort((x, y) => x - y);
  const percentil = (q) => amostras[Math.floor(q / 100 * (amostras.length - 1))];
  near('o p5 gravado ainda é o p5 do ruído', percentil(5), grao.P5, 0.01);
  near('e o p95 também', percentil(95), grao.P95, 0.01);

  // --- A feição tem que sobreviver ao mipmap ------------------------------
  //
  // Com tile de 3,1 m a mancha grossa era de 39 cm e a fina de 4 cm: num FPS o
  // chão é visto quase sempre entre 5 e 50 m, e ali o mip entrega a média —
  // medido, o desvio de brilho do chão CAIU de 18,70 pra 18,02. Feição de
  // ordem de metro é o que sobrevive.
  const manchaGrossa = grao.METROS / grao.CELULAS;
  ok('a mancha mais grossa é da ordem do metro', manchaGrossa >= 1,
    `${manchaGrossa.toFixed(2)} m`);
  note('feição', `${manchaGrossa.toFixed(2)} m a mais grossa · ` +
    `${(grao.METROS / (grao.CELULAS * 9)).toFixed(2)} m a mais fina`);

  // --- O tile não pode casar com a malha ------------------------------------
  //
  // São 2,5 m por vértice. Tile de 2,5 / 5 / 7,5 m casa a repetição da textura
  // com a quebra do triângulo, e a grade da malha aparece desenhada no chão.
  const passo = WORLD.SIZE / WORLD.TERRAIN_SEGMENTS;
  const razao = grao.METROS / passo;
  ok('o tile não é múltiplo do passo da malha',
    Math.abs(razao - Math.round(razao)) > 0.1,
    `${grao.METROS} m / ${passo} m = ${razao.toFixed(3)}`);
  ok('nem submúltiplo dele', Math.abs(1 / razao - Math.round(1 / razao)) > 0.1,
    `${(1 / razao).toFixed(3)}`);
  near('a repetição cobre o mapa inteiro',
    grao.repeticoes() * grao.METROS, WORLD.SIZE, 1e-6);

  // --- Potência de dois -----------------------------------------------------
  //
  // Mipmap e `RepeatWrapping` em NPOT funcionam no WebGL2 mas caem em caminho
  // lento em vários drivers, e o mipmap aqui não é opcional: 645 repetições
  // sem ele cintilam a distância, que é pior que chão sem grão nenhum.
  ok('o lado é potência de dois',
    (grao.LADO & (grao.LADO - 1)) === 0, `${grao.LADO} px`);
  eq('o período cabe inteiro no lado', grao.LADO % grao.CELULAS, 0);

  // --- Determinismo ---------------------------------------------------------
  //
  // Ruído de valor com hash, sem Math.random: duas montagens do mapa têm que
  // dar o mesmo chão, senão o print de referência não vale pra comparar nada.
  const outra = grao.desenharGrao();
  let diferencas = 0;
  for (let i = 0; i < dados.length; i++) if (dados[i] !== outra[i]) diferencas++;
  eq('duas gerações dão a mesma imagem', diferencas, 0);

  note('grão', `${grao.LADO}² · ${grao.CELULAS} células · ${grao.OITAVAS} oitavas` +
    ` · tile ${grao.METROS} m · ${grao.repeticoes().toFixed(0)} repetições` +
    ` · byte ${menor}..${maior}`);
}
