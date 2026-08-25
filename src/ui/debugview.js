import * as THREE from 'three';

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

const ARESTAS = [
  [0, 1], [1, 3], [3, 2], [2, 0],   // base
  [4, 5], [5, 7], [7, 6], [6, 4],   // topo
  [0, 4], [1, 5], [2, 6], [3, 7]    // montantes
];

/** Rótulo de texto que sempre encara a câmera. */
function criarRotulo() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
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
      ctx.clearRect(0, 0, 256, 64);
      ctx.fillStyle = 'rgba(8, 10, 8, 0.72)';
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = cor;
      ctx.font = 'bold 30px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(texto, 128, 34);
      textura.needsUpdate = true;
    }
  };
}

export function initDebugView(scene, world, bots) {
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

  /** Anéis nas esferas de acerto: é onde a BALA pega, não onde o corpo esbarra. */
  const LADOS = 16;
  function desenharEsferas() {
    const alvos = world.targets.filter((alvo) => alvo.alive && alvo.center);
    const precisa = alvos.length * 3 * LADOS * 2 * 3;
    if (anelPosicoes.length !== precisa) {
      anelPosicoes = new Float32Array(precisa);
      esferas.geometry.setAttribute('position', new THREE.BufferAttribute(anelPosicoes, 3));
    }

    let n = 0;
    for (const alvo of alvos) {
      const centro = alvo.center();
      const r = alvo.radius ?? 0.5;

      // Três anéis perpendiculares dão a leitura de esfera sem malha nenhuma:
      // XY, XZ e YZ. Cada aresta repete o ponto seguinte porque LineSegments
      // desenha par a par, não em cadeia.
      for (let anel = 0; anel < 3; anel++) {
        for (let i = 0; i < LADOS; i++) {
          for (const passo of [i, i + 1]) {
            const a = (passo / LADOS) * Math.PI * 2;
            const u = Math.cos(a) * r;
            const v = Math.sin(a) * r;

            anelPosicoes[n] = centro.x + (anel === 2 ? 0 : u);
            anelPosicoes[n + 1] = centro.y + (anel === 0 ? v : anel === 2 ? u : 0);
            anelPosicoes[n + 2] = centro.z + (anel === 0 ? 0 : v);
            n += 3;
          }
        }
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

  return function updateDebugView(ligado) {
    if (grupo.visible !== ligado) grupo.visible = ligado;
    if (!ligado) return;

    desenharCaixas();
    desenharEsferas();
    desenharRotulos();
  };
}
