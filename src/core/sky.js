import * as THREE from 'three';
import { WORLD } from '../config.js';
import { fbm } from '../world/noise.js';

/**
 * Céu encoberto, desenhado num canvas e usado como fundo equirretangular.
 *
 * Nada de arquivo de textura: o mesmo ruído que faz o relevo e a mata faz a
 * nuvem, e o projeto continua abrindo offline sem baixar nada. É a terceira
 * camada a usar `world/noise.js`, e a única razão de ele existir num arquivo
 * próprio.
 *
 * A nuvem é projetada num TETO plano, não pintada direto na esfera: pra uma
 * direção a um ângulo `theta` do zênite, o teto é atingido a um raio
 * `tan(theta)`, e é essa tangente que comprime a nuvem contra o horizonte
 * como numa foto. Amostrando o ruído direto em (longitude, latitude), a
 * nuvem fica do mesmo tamanho em cima e na linha do horizonte, e o céu perde
 * a profundidade inteira — vira papel de parede.
 *
 * E o ruído é amostrado em coordenada CILÍNDRICA (cos/sen da longitude), não
 * em `u` cru: em `u` a textura não fecha, e a emenda aparece como uma costura
 * vertical no meio do céu.
 */

const LARGURA = 1024;
const ALTURA = 512;
const OITAVAS = 5;
const ESCALA = 0.55;

/**
 * Teto do raio projetado.
 *
 * Limitar o ÂNGULO (o primeiro conserto) matava a nuvem numa faixa inteira
 * perto do horizonte e deixava um degradê liso onde deveria haver camada de
 * nuvem. Limitar o RAIO satura o ruído num valor constante em vez de esticá-lo
 * por centenas de pixels: some a listra e fica a nuvem, cada vez mais rasa,
 * até virar bruma — que é o que se vê a essa distância.
 */
const RAIO_MAX = 6.5;

/**
 * Espaço de cor da textura do céu.
 *
 * Sai daqui, e não de dentro de `createSkyTexture`, pra que a suíte possa
 * conferir a regra sem gerar meio milhão de pixels de ruído — montar o céu é
 * caro, e teste que cresce com o custo do boot é teste que estoura o orçamento
 * de tempo virtual e derruba a suíte SEGUINTE, com um nome que não tem nada a
 * ver com a causa.
 *
 * O motivo de ser LINEAR está em `createSkyTexture`, onde ela é usada.
 */
export const ESPACO_DO_CEU = THREE.LinearSRGBColorSpace;

function mistura(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function smoothstepLocal(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export function createSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA;
  canvas.height = ALTURA;

  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(LARGURA, ALTURA);
  const data = image.data;

  const topo = new THREE.Color(WORLD.SKY_TOPO);
  const horizonte = new THREE.Color(WORLD.SKY_HORIZONTE);
  const sol = new THREE.Color(WORLD.SOL_COR);

  // O sol fica atrás da nuvem: a mancha entra ANTES do escurecimento, então a
  // nuvem passa por cima dela. Sol desenhado por último seria um disco limpo
  // num céu fechado, que é a única coisa que um dia nublado não tem.
  const solTheta = (1 - WORLD.SOL_ALTURA) * (Math.PI / 2);
  const solPhi = WORLD.SOL_AZIMUTE;

  for (let py = 0; py < ALTURA; py++) {
    const theta = (py / (ALTURA - 1)) * Math.PI;
    const acimaDoHorizonte = theta < Math.PI / 2;
    const raio = Math.min(Math.tan(Math.min(theta, 1.5533)), RAIO_MAX);

    for (let px = 0; px < LARGURA; px++) {
      const phi = (px / LARGURA) * Math.PI * 2;
      const i = (py * LARGURA + px) * 4;

      // Abaixo do horizonte ninguém vê céu: o terreno cobre. Fica na cor da
      // névoa pra que qualquer frincha entre malha e horizonte não brilhe.
      if (!acimaDoHorizonte) {
        const c = horizonte;
        data[i] = c.r * 255; data[i + 1] = c.g * 255; data[i + 2] = c.b * 255;
        data[i + 3] = 255;
        continue;
      }

      const nx = Math.cos(phi) * raio * ESCALA;
      const nz = Math.sin(phi) * raio * ESCALA;
      // 0..1, e puxado pro alto: encoberto é nuvem em quase todo lugar
      const nuvem = Math.min(1, Math.max(0, (fbm(nx, nz, OITAVAS) + 1) / 2));

      // Base do céu: escuro no zênite, claro no horizonte.
      const alturaT = theta / (Math.PI / 2);
      let r = mistura(topo.r, horizonte.r, alturaT);
      let g = mistura(topo.g, horizonte.g, alturaT);
      let b = mistura(topo.b, horizonte.b, alturaT);

      // Brilho do sol através da nuvem, por distância angular.
      const cosD = Math.cos(theta) * Math.cos(solTheta)
        + Math.sin(theta) * Math.sin(solTheta) * Math.cos(phi - solPhi);
      const brilho = Math.pow(Math.max(0, cosD), 26) * 0.85;
      r = mistura(r, sol.r, brilho);
      g = mistura(g, sol.g, brilho);
      b = mistura(b, sol.b, brilho);

      // A nuvem escurece por cima de tudo. O expoente concentra o escuro nas
      // barrigas: sem ele o céu inteiro fica num cinza médio só.
      //
      // E ela some contra o horizonte. A projeção no teto usa `tan(theta)`,
      // que dispara perto dos 90°: um punhado de células de ruído era
      // esticado por centenas de pixels e virava listra vertical na linha do
      // horizonte — parecia falha de textura. Real também: a essa distância
      // é bruma que se vê, não nuvem.
      // Os 0,5 de antes eram calibrados pra um render sem curva de tom E pra
      // uma textura em sRGB. Mudaram as duas coisas, e as duas na mesma
      // direção: AgX comprime o claro, e o byte agora é LINEAR — multiplicar
      // por 0,5 em linear escurece muito menos do que meio caminho na tela.
      // Medido: subir de 0,50 pra 0,68 mexeu o brilho do céu de 185,4 pra
      // 182,6, três níveis. É o quadro que se mede, não o número.
      const nitidez = 1 - smoothstepLocal((alturaT - 0.86) / 0.14);
      const sombra = 1 - Math.pow(nuvem, 2.0) * 0.88 * nitidez;
      data[i] = Math.min(255, r * sombra * 255);
      data[i + 1] = Math.min(255, g * sombra * 255);
      data[i + 2] = Math.min(255, b * sombra * 255);
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  // LINEAR, e por dois motivos que apontam pro mesmo lugar.
  //
  // Primeiro: os bytes acima JÁ são lineares. `new THREE.Color(hex)` converte
  // de sRGB pra o espaço de trabalho do three, que é linear, então `c.r * 255`
  // nunca foi um byte sRGB — declarar sRGB pedia ao shader pra converter de
  // novo o que já estava convertido, e o céu saía mais escuro do que a paleta
  // diz. É a mesma pegadinha da textura de grão.
  //
  // Segundo, e é o que decide: o three só tonemapeia o fundo quando a textura
  // NÃO é sRGB (`toneMapped = getTransfer(colorSpace) !== SRGBTransfer`).
  // Marcada como sRGB, a curva de `GRADE` alcançava o terreno e a névoa e
  // pulava o céu — e como a névoa é da cor do horizonte, a linha do horizonte
  // ganhava uma costura entre um céu cru e um terreno gradado.
  //
  // Byte em espaço linear gasta precisão no claro, o que normalmente daria
  // banda num degradê. Medido em `tools/bancada-ceu-linear.html`: neste
  // intervalo o degradê linear usa 92 dos 256 níveis contra 76 do sRGB, com
  // salto máximo de 1 nos dois. Aqui linear é MAIS preciso, não menos — o sRGB
  // é que é expansivo no escuro, e um céu não tem escuro.
  texture.colorSpace = ESPACO_DO_CEU;
  return texture;
}

/** Direção de onde a luz do sol vem, em coordenada de mundo. */
export function sunDirection() {
  const theta = (1 - WORLD.SOL_ALTURA) * (Math.PI / 2);
  return new THREE.Vector3(
    Math.sin(theta) * Math.cos(WORLD.SOL_AZIMUTE),
    Math.cos(theta),
    Math.sin(theta) * Math.sin(WORLD.SOL_AZIMUTE)
  );
}
