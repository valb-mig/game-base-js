import * as THREE from 'three';
import { BULLET } from '../config.js';
import { muzzleShot, createShot, createMuzzle } from '../items/muzzle.js';

/**
 * O que o modo de depuração desenha DENTRO do mundo: as caixas de colisão de
 * tudo, as esferas de acerto de bala, e o que cada bot está pensando.
 *
 * Fica separado do painel porque são coisas diferentes: o painel é DOM e fala
 * do jogador, isto é cena e fala do mapa. Quem liga os dois é o F2, e o dono
 * do interruptor é `ui/debug.js`.
 *
 * Tudo aqui é construído uma vez e reaproveitado. Ligar depuração não pode
 * criar oitocentos objetos por quadro, senão o próprio ato de investigar
 * muda o que se está medindo.
 */

// Caixa de colisão e esfera de acerto são coisas diferentes e erram por
// motivos diferentes: a caixa é por onde o corpo não passa, a esfera é onde a
// bala pega. Ver as duas juntas é metade do valor disto.
const COR_CAIXA = 0x6fd4ff;
const COR_PISO = 0x7fe06a;      // colisor em que dá pra ficar em pé
const COR_ESFERA = 0xff5f52;
const COR_ARCO = 0xffd166;      // por onde a bala vai passar
const COR_RETA = 0x8a8f86;      // e por onde ela passaria sem gravidade
const COR_VOO = 0xff9f45;       // bala que já está no ar

// Passo da previsão, em segundos de voo. A 253 m/s isso dá 4,2 m por ponto —
// a mesma subdivisão que a bala de verdade usa por quadro.
const PASSO_VOO = 1 / 60;
const ALCANCE_MAX = 2.6;        // segundos de previsão

const ARESTAS = [
  [0, 1], [1, 3], [3, 2], [2, 0],   // base
  [4, 5], [5, 7], [7, 6], [6, 4],   // topo
  [0, 4], [1, 5], [2, 6], [3, 7]    // montantes
];

/** Rótulo de texto que sempre encara a câmera. */
function criarRotulo(largura = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: textura, depthTest: false, transparent: true
  }));
  sprite.scale.set(2.6, 0.65, 1);
  sprite.renderOrder = 12;

  let escrito = null;

  return {
    sprite,
    escrever(texto, cor) {
      if (texto === escrito) return;
      escrito = texto;
      ctx.clearRect(0, 0, largura, 64);
      ctx.fillStyle = 'rgba(8, 10, 8, 0.72)';
      ctx.fillRect(0, 0, largura, 64);
      ctx.fillStyle = cor;
      ctx.font = 'bold 30px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(texto, largura / 2, 34);
      textura.needsUpdate = true;
    }
  };
}

export function initDebugView(scene, world, bots, tiro = {}) {
  const { player = null, viewmodel = null, ballistics = null } = tiro;
  const grupo = new THREE.Group();
  grupo.name = 'depuracao';
  grupo.visible = false;
  scene.add(grupo);

  // Um único LineSegments com TODAS as caixas. Um helper por colisor seriam
  // oitocentos objetos na cena, e o custo de desenhar isso esconderia o que
  // se quer investigar.
  const caixas = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false })
  );
  caixas.renderOrder = 10;
  caixas.frustumCulled = false;
  grupo.add(caixas);

  const esferas = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: COR_ESFERA, depthTest: false })
  );
  esferas.renderOrder = 11;
  esferas.frustumCulled = false;
  grupo.add(esferas);

  // ------------------------------------------------------------ trajetória
  //
  // Três linhas que contam coisas diferentes: o ARCO é por onde a bala vai
  // passar de verdade, a RETA é por onde ela passaria sem gravidade, e o vão
  // entre as duas no fim é a queda. Sem a reta, a queda não tem contra o quê
  // ser lida — o arco sozinho parece reto.
  const arco = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: COR_ARCO, depthTest: false })
  );
  arco.renderOrder = 13;
  arco.frustumCulled = false;
  grupo.add(arco);

  const reta = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: COR_RETA, depthTest: false })
  );
  reta.renderOrder = 13;
  reta.frustumCulled = false;
  grupo.add(reta);

  const voo = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: COR_VOO, depthTest: false })
  );
  voo.renderOrder = 13;
  voo.frustumCulled = false;
  grupo.add(voo);

  const rotuloTiro = criarRotulo(512);
  rotuloTiro.sprite.scale.set(3.4, 0.42, 1);
  grupo.add(rotuloTiro.sprite);

  const boca = createMuzzle();
  const disparo = createShot();
  const passo = new THREE.Vector3();
  const ponto = new THREE.Vector3();
  const anterior = new THREE.Vector3();
  const velocidade = new THREE.Vector3();
  const semQueda = new THREE.Vector3();
  const livre = new THREE.Vector3();
  const olhar = new THREE.Vector3();
  let ultimoTiro = null;
  const arcoPontos = [];
  const retaPontos = [];

  const rotulos = new Map();
  const canto = new THREE.Vector3();
  const corCaixa = new THREE.Color();
  const corPiso = new THREE.Color(COR_PISO);
  const corNormal = new THREE.Color(COR_CAIXA);

  let posicoes = new Float32Array(0);
  let cores = new Float32Array(0);
  let anelPosicoes = new Float32Array(0);

  /** Reconstrói as arestas de todas as caixas de colisão. */
  function desenharCaixas() {
    const lista = world.colliders;
    const precisa = lista.length * ARESTAS.length * 2 * 3;
    if (precisa === 0) {
      caixas.geometry.setDrawRange(0, 0);
      return;
    }
    if (posicoes.length !== precisa) {
      posicoes = new Float32Array(precisa);
      cores = new Float32Array(precisa);
      caixas.geometry.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
      caixas.geometry.setAttribute('color', new THREE.BufferAttribute(cores, 3));
    }

    let n = 0;
    for (const colisor of lista) {
      const { min, max } = colisor.box;
      corCaixa.copy(colisor.standable ? corPiso : corNormal);

      for (const [a, b] of ARESTAS) {
        for (const indice of [a, b]) {
          canto.set(
            indice & 1 ? max.x : min.x,
            indice & 4 ? max.y : min.y,
            indice & 2 ? max.z : min.z
          );
          posicoes[n] = canto.x;
          posicoes[n + 1] = canto.y;
          posicoes[n + 2] = canto.z;
          cores[n] = corCaixa.r;
          cores[n + 1] = corCaixa.g;
          cores[n + 2] = corCaixa.b;
          n += 3;
        }
      }
    }
    caixas.geometry.attributes.position.needsUpdate = true;
    caixas.geometry.attributes.color.needsUpdate = true;
    caixas.geometry.setDrawRange(0, n / 3);
  }

  /**
   * As cápsulas de acerto: é onde a BALA pega, região por região.
   *
   * Antes isto desenhava a esfera única de `center()`/`radius`, que deixou de
   * ser o que resolve acerto quando o corpo virou regiões. O desenho mostrava
   * uma bola no peito enquanto o tiro na perna decidia em outro lugar — e
   * depurar com um desenho que mente é pior que depurar sem desenho.
   */
  const LADOS = 12;
  const corpoAux = [];
  function desenharEsferas() {
    const alvos = world.targets.filter((alvo) => alvo.alive && (alvo.body || alvo.center));

    // duas tampas de anel por cápsula, mais quatro montantes ligando elas
    const capsulas = [];
    for (const alvo of alvos) {
      if (alvo.body) {
        for (const parte of alvo.body(corpoAux)) capsulas.push({ ...parte });
      } else {
        const c = alvo.center();
        const r = alvo.radius ?? 0.5;
        capsulas.push({
          raio: r, ax: c.x, ay: c.y - r * 0.5, az: c.z,
          bx: c.x, by: c.y + r * 0.5, bz: c.z
        });
      }
    }

    const precisa = capsulas.length * (2 * LADOS + 4) * 2 * 3;
    if (precisa === 0) {
      esferas.geometry.setDrawRange(0, 0);
      return;
    }
    if (anelPosicoes.length !== precisa) {
      anelPosicoes = new Float32Array(precisa);
      esferas.geometry.setAttribute('position', new THREE.BufferAttribute(anelPosicoes, 3));
    }

    let n = 0;
    const por = (x, y, z) => {
      anelPosicoes[n] = x;
      anelPosicoes[n + 1] = y;
      anelPosicoes[n + 2] = z;
      n += 3;
    };

    for (const c of capsulas) {
      // Um anel em cada ponta e quatro montantes: é a leitura de cápsula com
      // o mínimo de linha, e mostra a ALTURA que ela cobre — que era
      // justamente o que faltava enxergar.
      // Anéis nas pontas do SEGMENTO e nos extremos da COBERTURA: a cápsula
      // tem tampa redonda, e desenhar só o segmento escondia justamente o
      // que se quer conferir — até onde ela pega.
      const pontas = [
        [c.ax, c.ay, c.az], [c.bx, c.by, c.bz],
        [c.ax, Math.min(c.ay, c.by) - c.raio, c.az],
        [c.bx, Math.max(c.ay, c.by) + c.raio, c.bz]
      ];
      for (const [cx, cy, cz] of pontas) {
        for (let i = 0; i < LADOS; i++) {
          for (const passo of [i, i + 1]) {
            const a = (passo / LADOS) * Math.PI * 2;
            por(cx + Math.cos(a) * c.raio, cy, cz + Math.sin(a) * c.raio);
          }
        }
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const dx = Math.cos(a) * c.raio;
        const dz = Math.sin(a) * c.raio;
        por(c.ax + dx, c.ay, c.az + dz);
        por(c.bx + dx, c.by, c.bz + dz);
      }
    }
    esferas.geometry.attributes.position.needsUpdate = true;
    esferas.geometry.setDrawRange(0, n / 3);
  }

  /** O que cada bot está pensando, escrito sobre a cabeça dele. */
  function desenharRotulos() {
    for (const bot of bots.soldiers) {
      let rotulo = rotulos.get(bot);
      if (!rotulo) {
        rotulo = criarRotulo();
        rotulos.set(bot, rotulo);
        grupo.add(rotulo.sprite);
      }

      rotulo.sprite.visible = bot.alive;
      if (!bot.alive) continue;

      rotulo.sprite.position.set(bot.x, bot.feetY + bot.height + 0.55, bot.z);
      const estado = bots.stateOf(bot) ?? '?';
      const municao = bot.weapon?.ammo?.loaded;
      rotulo.escrever(
        `${estado} ${Math.round(bot.health)}${municao === undefined ? '' : `/${municao}`}`,
        bot.reloading > 0 ? '#ffd27f' : '#dfe8d4'
      );
    }
  }

  /**
   * Onde a bala do tiro de AGORA vai bater, e quanto ela cai no caminho.
   *
   * A origem e a direção saem da boca do cano pelo mesmo caminho do tiro de
   * verdade (`items/muzzle.js`), e não do olho: é a arma que atira, e com ela
   * fora de posição o arco tem que sair torto aqui também. A abertura
   * aleatória fica de fora de propósito — o que se quer ver é a linha central,
   * não um dos sorteios dela.
   */
  function desenharTrajetoria() {
    const temArma = Boolean(player?.equipped?.firearm);
    arco.visible = temArma;
    reta.visible = temArma;
    rotuloTiro.sprite.visible = temArma;
    if (!temArma) {
      ultimoTiro = null;
      return;
    }

    if (viewmodel?.readMuzzle(boca)) {
      muzzleShot(disparo, player.object, boca, BULLET.MUZZLE_BEND, BULLET.MUZZLE_RISE);
    } else {
      disparo.origin.copy(player.object.position);
      disparo.direction.set(0, 0, -1).applyQuaternion(player.object.quaternion);
    }

    arcoPontos.length = 0;
    retaPontos.length = 0;

    ponto.copy(disparo.origin);
    velocidade.copy(disparo.direction).multiplyScalar(BULLET.SPEED);
    arcoPontos.push(ponto.clone());
    retaPontos.push(ponto.clone());

    const alcance = player.equipped.firearm.range;
    let percorrido = 0;
    let bateu = false;

    for (let t = 0; t < ALCANCE_MAX && !bateu && percorrido < alcance; t += PASSO_VOO) {
      anterior.copy(ponto);

      // A mesma integração trapezoidal da bala de verdade: previsão que usa
      // outra conta mostraria um arco que a bala não faz.
      const antes = velocidade.y;
      velocidade.y -= BULLET.GRAVITY * PASSO_VOO;
      passo.copy(velocidade).multiplyScalar(PASSO_VOO);
      passo.y = (antes + velocidade.y) * 0.5 * PASSO_VOO;
      ponto.add(passo);
      percorrido += passo.length();

      // A queda é medida contra a PARÁBOLA, antes de grudar no chão. Grudando
      // primeiro, o ponto sobe até o terreno enquanto a reta de referência já
      // está enterrada, e a conta dá queda NEGATIVA — bala subindo.
      livre.copy(ponto);

      const chao = world.terrain.heightAt(ponto.x, ponto.z);
      if (ponto.y <= chao) {
        ponto.y = chao;
        bateu = true;
      } else if (ballistics?.blocked(anterior, ponto)) {
        bateu = true;
      }

      arcoPontos.push(ponto.clone());

      // Reta de referência: onde a bala estaria sem gravidade nenhuma, na
      // mesma distância AO LONGO DA MIRA.
      //
      // Medir pelo comprimento do arco parece igual e não é: o arco é mais
      // comprido que a reta, então a referência ficava adiantada e — com a
      // arma apontada pra baixo — abaixo do próprio arco. A queda saía
      // NEGATIVA, e queda negativa é bala subindo.
      semQueda.copy(livre).sub(disparo.origin);
      const aoLongo = semQueda.dot(disparo.direction);
      semQueda.copy(disparo.origin).addScaledVector(disparo.direction, aoLongo);
      retaPontos.push(semQueda.clone());
    }

    arco.geometry.setFromPoints(arcoPontos);
    reta.geometry.setFromPoints(retaPontos);

    const queda = semQueda.y - livre.y;
    const distancia = disparo.origin.distanceTo(ponto);

    // Desvio do cano em relação a onde o jogador está OLHANDO. É o número que
    // explica tiro que sai torto sem o jogador ter feito nada errado: a arma
    // fora de posição atira pra onde ela aponta, não pra onde ele olha.
    player.object.getWorldDirection(olhar);
    ultimoTiro = {
      distancia,
      queda,
      bateu,
      desvio: Math.acos(
        Math.min(1, Math.max(-1, olhar.dot(disparo.direction)))) * 180 / Math.PI
    };
    rotuloTiro.sprite.position.copy(ponto).y += 0.9;
    rotuloTiro.escrever(
      `${distancia.toFixed(0)} m · cai ${(queda * 100).toFixed(0)} cm`,
      bateu ? '#ffd166' : '#8a8f86'
    );
  }

  /** As balas que já estão no ar, cada uma com o arco que ela percorreu. */
  let vooPontos = new Float32Array(0);
  const PEDACOS = 12;
  function desenharVoo() {
    const balas = ballistics?.bullets?.filter((b) => !b.spent && b.origin) ?? [];
    const precisa = balas.length * PEDACOS * 2 * 3;

    // Zero balas no ar é o caso COMUM, e sem esta guarda o atributo nunca
    // era criado: apertar F2 sem ninguém atirando estourava o quadro. O
    // `errors` não pegava porque a depuração nasce desligada.
    if (precisa === 0) {
      voo.geometry.setDrawRange(0, 0);
      return;
    }
    if (vooPontos.length !== precisa) {
      vooPontos = new Float32Array(precisa);
      voo.geometry.setAttribute('position', new THREE.BufferAttribute(vooPontos, 3));
    }

    let n = 0;
    for (const bala of balas) {
      // Reconstruída de origem, direção e tempo decorrido. Guardar rastro
      // seria mais simples e custaria dezenas de milhares de pontos: com
      // nove bots atirando há cerca de cento e oitenta balas no ar.
      const decorrido = BULLET.LIFE - bala.life;
      for (let i = 0; i < PEDACOS; i++) {
        for (const k of [i, i + 1]) {
          const t = (k / PEDACOS) * decorrido;
          vooPontos[n] = bala.origin.x + bala.aim.x * BULLET.SPEED * t;
          vooPontos[n + 1] = bala.origin.y + bala.aim.y * BULLET.SPEED * t
            - 0.5 * BULLET.GRAVITY * t * t;
          vooPontos[n + 2] = bala.origin.z + bala.aim.z * BULLET.SPEED * t;
          n += 3;
        }
      }
    }
    voo.geometry.attributes.position.needsUpdate = true;
    voo.geometry.setDrawRange(0, n / 3);
  }

  function updateDebugView(ligado) {
    if (grupo.visible !== ligado) grupo.visible = ligado;
    if (!ligado) {
      ultimoTiro = null;
      return;
    }

    desenharCaixas();
    desenharEsferas();
    desenharRotulos();
    if (player) desenharTrajetoria();
    if (ballistics) desenharVoo();
  }

  return {
    update: updateDebugView,

    /**
     * Distância, queda e desvio do último tiro previsto.
     *
     * O painel lê isto porque o rótulo no ponto de impacto fica ilegível a
     * noventa metros — e é justamente a noventa metros que a queda importa.
     */
    get shot() {
      return ultimoTiro;
    }
  };
}
