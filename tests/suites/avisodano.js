import * as THREE from 'three';
import { createBallistics } from '../../src/items/ballistics.js';
import {
  corpoDe, usarMedidasDoModelo, ALTURA_BASE, GRUPOS
} from '../../src/game/hitboxes.js';
import { initRumoDano } from '../../src/ui/rumodano.js';
import { initBoneco } from '../../src/ui/boneco.js';
import { headingDegrees } from '../../src/player/heading.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

/**
 * Levar tiro: de ONDE veio e ONDE pegou.
 *
 * O que se prova aqui é geometria, não visibilidade. "Apareceu alguma coisa"
 * passa verde com o arco no lado errado, que é o único jeito de esta feature
 * estar quebrada — e ela quebraria calada, porque um arco vermelho na tela
 * parece certo até alguém virar pro lado que ele aponta.
 *
 * E o tiro começa no `spawn` da BALÍSTICA, com um alvo de regiões de verdade:
 * teste que injeta o evento na mão não prova que o evento carrega o que o HUD
 * precisa. Foi assim que o `dig` e o `som` ficaram de fora da bala com a
 * suíte inteira verde.
 */

const DT = 1 / 60;

/** Um canvas com tamanho de CSS, como o do HUD. */
function montarCanvas(id, largura, altura) {
  document.getElementById(id)?.remove();
  const canvas = document.createElement('canvas');
  canvas.id = id;
  canvas.style.cssText = `display:block;width:${largura}px;height:${altura}px`;
  document.body.appendChild(canvas);
  return canvas;
}

function dados(canvas) {
  return canvas.getContext('2d')
    .getImageData(0, 0, canvas.width, canvas.height).data;
}

/**
 * Onde está a tinta do arco, em graus de tela: 0 é pra cima, 90 é pra
 * direita. Devolve também o raio do centroide e quanta tinta caiu no MIOLO,
 * que é o que prova que o desenho não tapa a mira.
 */
function medirArco(canvas) {
  const d = dados(canvas);
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const vazio = Math.min(w, h) * 0.2;

  let sx = 0;
  let sy = 0;
  let n = 0;
  let miolo = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] < 60) continue;
      n++;
      sx += x + 0.5;
      sy += y + 0.5;
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < vazio) miolo++;
    }
  }
  if (n === 0) return { tinta: 0, graus: null, raio: 0, miolo: 0 };

  const ox = sx / n - cx;
  const oy = sy / n - cy;
  return {
    tinta: n,
    graus: ((Math.atan2(ox, -oy) * 180 / Math.PI) + 540) % 360 - 180,
    raio: Math.hypot(ox, oy) / (Math.min(w, h) / 2),
    miolo
  };
}

/** Diferença angular em graus, dobrada em -180..180. */
function desvio(a, b) {
  return Math.abs(((a - b) % 360 + 540) % 360 - 180);
}

/**
 * A tinta ACESA do boneco — vermelha — e a silhueta inteira, cada uma com a
 * sua caixa envolvente. Vermelho se distingue do tom morto por um canal: o
 * apagado é cor de osso (226, 218, 194) e o aceso é (224, 70, 44).
 */
function medirBoneco(canvas) {
  const d = dados(canvas);
  const w = canvas.width;
  const h = canvas.height;

  const vazio = { n: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, sx: 0, sy: 0 };
  const acesa = { ...vazio };
  const toda = { ...vazio };

  const somar = (caixa, x, y) => {
    caixa.n++;
    caixa.sx += x + 0.5;
    caixa.sy += y + 0.5;
    if (x < caixa.minX) caixa.minX = x;
    if (x > caixa.maxX) caixa.maxX = x;
    if (y < caixa.minY) caixa.minY = y;
    if (y > caixa.maxY) caixa.maxY = y;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 20) continue;
      somar(toda, x, y);
      if (d[i + 3] > 100 && d[i + 1] < d[i] - 60) somar(acesa, x, y);
    }
  }
  return { acesa, toda };
}

export function run() {
  /**
   * `usarMedidasDoModelo` é estado de MÓDULO, compartilhado entre as suítes.
   *
   * As coordenadas de mira daqui pra baixo são as da TABELA de `PECAS` — é
   * nela que a canela está a 11 cm do eixo e o capacete começa a 1,505 m. Com
   * o gabarito do `.glb` posto por outra suíte, mirar nesses pontos acertaria
   * outra região e o teste falharia falando de HUD.
   */
  usarMedidasDoModelo(null);

  const arco = montarCanvas('rumodano', 200, 200);
  const boneco = montarCanvas('boneco', 40, 84);

  const scene = new THREE.Scene();
  const ballistics = createBallistics(scene, []);
  const eventos = [];
  ballistics.onHit((r) => eventos.push(r));

  /** O jogador visto como alvo, com as MESMAS regiões que ele tem no jogo. */
  const centro = new THREE.Vector3();
  const jogador = {
    name: 'jogador', alive: true, radius: 0.5, collider: null,
    x: 0, z: 0, feetY: 0, yaw: 0,
    center() { return centro.set(0, 1.1, 0); },
    body(saida) { return corpoDe(ALTURA_BASE, saida, 'pe'); },
    update() {},
    damage(amount, regiao = null) {
      return { target: this, amount, killed: false, regiao };
    }
  };
  /** Um bot qualquer, pra provar que briga alheia não acende nada. */
  const outro = {
    name: 'bot', alive: true, radius: 0.5, collider: null,
    x: 40, z: 0, feetY: 0, yaw: 0,
    center() { return new THREE.Vector3(40, 1.1, 0); },
    body(saida) { return corpoDe(ALTURA_BASE, saida, 'pe'); },
    update() {},
    damage(amount, regiao = null) {
      return { target: this, amount, killed: false, regiao };
    }
  };
  const atirador = { name: 'atirador' };

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const olhar = (grausDeYaw, pitch = 0) => {
    euler.set(pitch, grausDeYaw * Math.PI / 180, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
  };
  olhar(0);

  const updateArco = initRumoDano(jogador, camera, ballistics);
  const updateBoneco = initBoneco(jogador, ballistics);

  const rodar = (segundos) => {
    for (let i = 0; i < Math.ceil(segundos / DT); i++) {
      ballistics.update(DT, [jogador, outro], null);
      updateArco(DT);
      updateBoneco(DT);
    }
  };
  /** Deixa as marcas expirarem e o boneco apagar. */
  const limpar = () => { eventos.length = 0; rodar(3.2); eventos.length = 0; };

  /**
   * Um tiro DE VERDADE, saído do rumo pedido e mirando num ponto do corpo.
   *
   * A boca fica na mesma altura do ponto, então o tiro é horizontal e a queda
   * em oito metros é de 7 mm — pequena o bastante pra não trocar de região, e
   * grande o bastante pra a bala continuar sendo a bala do jogo.
   */
  const DISTANCIA = 8;
  function atirar(rumo, tx = 0, ty = 1.14, tz = 0, alvos = [jogador, outro]) {
    const r = rumo * Math.PI / 180;
    const de = new THREE.Vector3(
      tx + DISTANCIA * Math.sin(r), ty, tz - DISTANCIA * Math.cos(r));
    const dir = new THREE.Vector3(tx - de.x, 0, tz - de.z).normalize();
    ballistics.spawn(de, dir, {
      damage: 20, range: 200, tracer: false, owner: atirador
    });
    const antes = eventos.length;
    for (let i = 0; i < 6 && eventos.length === antes; i++) {
      ballistics.update(DT, alvos, null);
    }
    updateArco(DT);
    updateBoneco(DT);
    return eventos[eventos.length - 1];
  }

  // ------------------------------------------------------------------ evento

  suite('a balística diz DE ONDE o tiro saiu');

  limpar();
  const doSul = atirar(180);
  ok('o tiro chegou no jogador', doSul?.target === jogador);
  ok('e o evento traz a origem', Boolean(doSul?.origem));
  near('origem no x da boca do cano', doSul.origem.x, 0, 1e-6);
  near('origem no z da boca do cano', doSul.origem.z, DISTANCIA, 1e-6);
  eq('e a região que a hitbox resolveu', doSul.regiao, GRUPOS.tronco);
  note('por que o ponto e não o rumo da bala',
    'inverter `dir` só acerta porque o arco é plano; ponto sobrevive a arrasto');

  // ------------------------------------------------------- rumo, na geometria

  suite('o arco aponta pra onde o tiro estava');

  for (const [rumo, nome] of [
    [180, 'de trás'], [90, 'da direita'], [270, 'da esquerda'],
    [0, 'da frente'], [135, 'do través, 135°']
  ]) {
    limpar();
    olhar(0);
    atirar(rumo);
    const m = medirArco(arco);
    ok(`tiro ${nome} desenha ${rumo === 0 ? 0 : rumo}° na tela`,
      m.graus !== null && desvio(m.graus, rumo) < 4,
      m.graus === null ? 'nada desenhado' : `${m.graus.toFixed(1)}°`);
  }

  suite('o rumo é do MUNDO, não da tela');

  limpar();
  olhar(0);
  atirar(0);                       // tiro vindo do norte
  const antesDeVirar = medirArco(arco).graus;
  olhar(-90);                      // mouse pra direita: agora ele olha pro leste
  near('a cabeça virou 90° pro leste', headingDegrees(camera.quaternion, new THREE.Vector3()), 90, 1e-6);
  updateArco(DT);
  const depoisDeVirar = medirArco(arco).graus;
  near('parado, o arco estava no topo', antesDeVirar, 0, 4);
  ok('virar a cabeça 90° pra direita joga o arco 90° pra esquerda',
    desvio(depoisDeVirar, -90) < 4, `${depoisDeVirar.toFixed(1)}°`);

  suite('e andar também mexe o arco: o tiro saiu de um LUGAR');

  limpar();
  olhar(0);
  atirar(0);                       // boca do cano em (0, -8)
  near('de frente, o arco está no topo', medirArco(arco).graus, 0, 4);
  // O jogador anda 16 m pro norte e PASSA da boca do cano: o mesmo tiro passa
  // a ter vindo de trás. Com ângulo congelado o arco continuaria no topo.
  jogador.z = -16;
  updateArco(DT);
  ok('passando do lugar do tiro, o arco vai pras costas',
    desvio(medirArco(arco).graus, 180) < 4,
    `${medirArco(arco).graus.toFixed(1)}°`);
  jogador.z = 0;

  suite('camera.rotation.y não é o yaw, e aqui isso apareceria');

  limpar();
  olhar(180, -30 * Math.PI / 180);
  const rotY = new THREE.Euler().setFromQuaternion(camera.quaternion).y * 180 / Math.PI;
  const rumoCerto = headingDegrees(camera.quaternion, new THREE.Vector3());
  near('o rumo de verdade é 180°', rumoCerto, 180, 1e-6);
  ok('e rotation.y leria outra coisa', desvio(rotY, rumoCerto) > 90,
    `rotation.y = ${rotY.toFixed(1)}°`);
  atirar(0);                       // tiro do norte, com ele olhando pro sul
  ok('o arco vai pras costas, como o rumo manda',
    desvio(medirArco(arco).graus, 180) < 4,
    `${medirArco(arco).graus.toFixed(1)}°`);
  note('se lesse rotation.y', 'o arco cairia no topo — 180° errado');
  olhar(0);

  suite('o arco não tapa a mira');

  limpar();
  atirar(180);
  const centrado = medirArco(arco);
  eq('nenhuma tinta no miolo em volta da mira', centrado.miolo, 0);
  between('e a banda fica na circunferência', centrado.raio, 0.55, 0.85);
  note('por que fora do centro',
    'mesma razão da vinheta nas bordas: no centro tapa o que ele precisa ver');

  suite('a marca desvanece, e rajada não empilha');

  limpar();
  atirar(180);
  const umTiro = medirArco(arco).tinta;
  ok('um tiro desenha um arco', umTiro > 40, `${umTiro} px`);

  limpar();
  atirar(180);
  atirar(180);
  atirar(180);
  const tresTiros = medirArco(arco).tinta;
  ok('três tiros do mesmo lugar continuam um arco só',
    Math.abs(tresTiros - umTiro) < umTiro * 0.08, `${tresTiros} px contra ${umTiro}`);

  atirar(0);
  ok('e de outro lugar sai outro arco',
    medirArco(arco).tinta > umTiro * 1.8, `${medirArco(arco).tinta} px`);

  rodar(2.7);
  eq('passados os 2,6 s de vida, a tela está limpa', medirArco(arco).tinta, 0);

  suite('briga alheia não acende nada na tela dele');

  limpar();
  // Tiro de bot em bot: o alvo é o outro, e o rumo do dano é do JOGADOR.
  const noBot = atirar(180, outro.x, 1.14, outro.z, [outro]);
  ok('a bala acertou o bot', noBot?.target === outro);
  eq('e o arco não desenhou nada', medirArco(arco).tinta, 0);
  eq('nem o boneco acendeu', medirBoneco(boneco).acesa.n, 0);

  // ------------------------------------------------------------------ boneco

  suite('o boneco é a hitbox, desenhada de frente');

  limpar();
  const parado = medirBoneco(boneco);
  ok('a silhueta existe apagada, antes de qualquer tiro', parado.toda.n > 200,
    `${parado.toda.n} px`);
  eq('e nada aceso', parado.acesa.n, 0);

  // A razão do desenho tem que ser a razão da HITBOX. Erro de escala num eixo
  // passa batido por qualquer teste de visibilidade e morre aqui.
  const caixas = corpoDe(ALTURA_BASE, [], 'pe');
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = 0;
  for (const c of caixas) {
    minX = Math.min(minX, c.minX);
    maxX = Math.max(maxX, c.maxX);
    maxY = Math.max(maxY, c.maxY);
  }
  const razaoHitbox = (maxX - minX) / maxY;
  const razaoDesenho = (parado.toda.maxX - parado.toda.minX + 1)
    / (parado.toda.maxY - parado.toda.minY + 1);
  near('a proporção desenhada é a da hitbox', razaoDesenho, razaoHitbox, 0.05);
  note('proporção do corpo',
    `${(maxX - minX).toFixed(2)} m por ${maxY.toFixed(2)} m = ${razaoHitbox.toFixed(3)}`);

  suite('a região acesa é a região que a hitbox resolveu');

  /** Fração da altura da silhueta, 0 no topo e 1 nos pés. */
  const alturaSilhueta = parado.toda.maxY - parado.toda.minY;
  const fracao = (caixa) => (caixa.sy / caixa.n - parado.toda.minY) / alturaSilhueta;

  const acertarEm = (tx, ty) => {
    limpar();
    const r = atirar(180, tx, ty, 0);
    return { evento: r, medida: medirBoneco(boneco) };
  };

  const naCabeca = acertarEm(0, 1.44);
  eq('mirando a 1,44 m a hitbox diz cabeça', naCabeca.evento.regiao, GRUPOS.cabeca);
  ok('e o boneco acende', naCabeca.medida.acesa.n > 8, `${naCabeca.medida.acesa.n} px`);
  const fCabeca = fracao(naCabeca.medida.acesa);
  between('no alto da silhueta', fCabeca, 0, 0.2);

  const noCapacete = acertarEm(0, 1.605);
  eq('mirando a 1,605 m a hitbox diz capacete',
    noCapacete.evento.regiao, GRUPOS.capacete);
  const fCapacete = fracao(noCapacete.medida.acesa);
  ok('o capacete acende ACIMA da cabeça', fCapacete < fCabeca,
    `${fCapacete.toFixed(3)} contra ${fCabeca.toFixed(3)}`);

  const noTronco = acertarEm(0, 1.14);
  eq('mirando a 1,14 m a hitbox diz tronco', noTronco.evento.regiao, GRUPOS.tronco);
  between('e o tronco acende no meio', fracao(noTronco.medida.acesa), 0.28, 0.52);

  const naPerna = acertarEm(0.11, 0.27);
  eq('mirando a canela a hitbox diz perna', naPerna.evento.regiao, GRUPOS.perna);
  between('e a perna acende embaixo', fracao(naPerna.medida.acesa), 0.7, 1);

  suite('braço acende dos DOIS lados: o dado é o grupo, e grupo não tem lado');

  const noBraco = acertarEm(0.28, 1.15);
  eq('mirando o braço a hitbox diz braço', noBraco.evento.regiao, GRUPOS.braco);

  // Tinta acesa à esquerda e à direita do eixo do boneco, contada de novo:
  // acender só um lado seria o HUD inventando uma distinção que a regra de
  // dano não faz.
  {
    const d = dados(boneco);
    const w = boneco.width;
    const eixo = (parado.toda.minX + parado.toda.maxX) / 2;
    const meia = (parado.toda.maxX - parado.toda.minX) / 2;
    let esquerda = 0;
    let direita = 0;
    let maisPerto = Infinity;
    for (let y = 0; y < boneco.height; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] <= 100 || d[i + 1] >= d[i] - 60) continue;
        if (x < eixo) esquerda++; else direita++;
        maisPerto = Math.min(maisPerto, Math.abs(x + 0.5 - eixo));
      }
    }
    ok('acende à esquerda do eixo', esquerda > 4, `${esquerda} px`);
    ok('e à direita também', direita > 4, `${direita} px`);
    ok('e nada aceso perto do eixo — o tronco não é braço',
      maisPerto > meia * 0.3, `${maisPerto.toFixed(1)} px do eixo (meia largura ${meia.toFixed(1)})`);
  }

  suite('o boneco apaga sozinho');

  limpar();
  acertarEm(0, 1.14);
  ok('aceso logo depois do tiro', medirBoneco(boneco).acesa.n > 8);
  rodar(2);
  eq('e apagado dois segundos depois', medirBoneco(boneco).acesa.n, 0);
  ok('mas a silhueta continua lá', medirBoneco(boneco).toda.n > 200);

  arco.remove();
  boneco.remove();
}
