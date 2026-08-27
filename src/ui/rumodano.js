import * as THREE from 'three';
import { headingDegrees } from '../player/heading.js';

/**
 * De onde veio o tiro: um arco em volta da mira, no rumo da boca de fogo.
 *
 * A vinheta vermelha de `#hurt` avisa que doeu e não avisa de onde. Num mapa
 * de dois quilômetros isso é metade da informação: virar pro lado certo é a
 * diferença entre revidar e morrer olhando pro nada, e hoje isso é privilégio
 * de quem já estava olhando — a mesma assimetria que o som posicional existiu
 * pra fechar.
 *
 * O arco fica NUMA CIRCUNFERÊNCIA em volta da mira, e o miolo fica vazio.
 * Mesma razão de a vinheta ficar nas bordas: no centro ele taparia justamente
 * o que o jogador precisa ver pra revidar. Há teste que mede o vazio.
 *
 * A marca guarda o PONTO de onde o tiro saiu, não um ângulo de tela. Duas
 * consequências, e as duas são o que faz a marca valer: virar a cabeça
 * desliza o arco (rumo é do mundo, não da tela), e ANDAR também — o lugar de
 * onde atiraram continua sendo aquele lugar enquanto o jogador se mexe. Um
 * ângulo congelado apontaria pro lado errado depois de dois passos.
 *
 * `vitima` é o jogador visto como alvo, e o filtro é o INVERSO do da marca de
 * acerto: ali o jogador é quem atira, aqui é quem leva. A balística é de todo
 * mundo, e sem esse filtro cada tiro trocado a sessenta metros acenderia um
 * arco na tela dele.
 */

/** Segundos de vida da marca. Tempo de girar o corpo e procurar. */
const DURACAO = 2.6;
/** Fração da vida em brilho cheio; o resto ela passa apagando. */
const CHEIO = 0.5;
const ABERTURA = 26;    // graus de arco que a marca ocupa
const ESPESSURA = 9;    // px de espessura da banda
/**
 * Raio da banda, em fração do lado do canvas.
 *
 * O canvas é bem maior que o arco de propósito: ele existe pra que o desenho
 * tenha onde caber em volta do centro, e o miolo vazio é a informação.
 */
const RAIO = 0.33;
/**
 * Dois tiros saídos de menos de tantos metros um do outro são a MESMA marca.
 *
 * Sem isto uma rajada de seis empilha seis arcos no mesmo lugar, cada um com
 * o relógio dele, e o que o jogador vê é uma mancha que não apaga. Refrescar
 * é a informação certa: continua vindo de lá.
 */
const JUNTAR = 8;
/** Marcas ao mesmo tempo. Com muitas, nenhuma quer dizer nada. */
const LIMITE = 4;

export function initRumoDano(vitima, camera, ...fontes) {
  const canvas = document.getElementById('rumodano');
  if (!canvas) return () => {};
  const ctx = canvas.getContext('2d');
  const scratch = new THREE.Vector3();

  const marcas = [];
  let width = 0;
  let height = 0;
  let vazio = false;

  function medir() {
    const ratio = Math.min(devicePixelRatio, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    vazio = false;   // trocar de tamanho apaga o canvas: força redesenho
  }

  const anotar = (r) => {
    if (r.target !== vitima) return;
    if (!(r.amount > 0)) return;
    // Sem origem não há rumo, e o HUD não inventa: é o caso do corpo a corpo
    // e do atropelamento, que não passam pela balística.
    const origem = r.origem;
    if (!origem) return;

    for (const m of marcas) {
      if (Math.hypot(m.x - origem.x, m.z - origem.z) > JUNTAR) continue;
      m.x = origem.x;
      m.z = origem.z;
      m.restante = DURACAO;
      return;
    }

    marcas.push({ x: origem.x, z: origem.z, restante: DURACAO });
    while (marcas.length > LIMITE) marcas.shift();
  };

  for (const fonte of fontes) fonte.onHit?.(anotar);

  function desenhar() {
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const raio = Math.min(width, height) * RAIO;
    const rumoDaVista = headingDegrees(camera.quaternion, scratch);
    const px = vitima.x ?? 0;
    const pz = vitima.z ?? 0;

    for (const marca of marcas) {
      // Mesmo par de eixos da bússola e do radar: 0° é o norte (-Z do mundo),
      // crescendo pro leste. Quatro telas, uma convenção.
      const rumo = Math.atan2(marca.x - px, -(marca.z - pz)) * 180 / Math.PI;
      // Dobrado em -180..180: sem isso o arco depende de quantas voltas o
      // jogador deu com o mouse, e o desenho sai igual mas a conta não fecha.
      const tela = ((rumo - rumoDaVista) % 360 + 540) % 360 - 180;

      const parte = marca.restante / DURACAO;
      const alfa = 0.92 * Math.min(1, parte / CHEIO);

      // -90 porque o zero do canvas é o +X e o zero do rumo é pra CIMA.
      const de = (tela - ABERTURA / 2 - 90) * Math.PI / 180;
      const ate = (tela + ABERTURA / 2 - 90) * Math.PI / 180;

      ctx.beginPath();
      ctx.arc(cx, cy, raio + ESPESSURA, de, ate);
      ctx.arc(cx, cy, raio, ate, de, true);
      ctx.closePath();
      ctx.fillStyle = `rgba(222, 66, 42, ${alfa.toFixed(3)})`;
      ctx.fill();
      // O arco é escrito por cima de céu claro e de capim claro, e sem
      // contorno escuro ele some nos dois — mesma razão do text-shadow do HUD.
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = `rgba(12, 14, 11, ${(alfa * 0.75).toFixed(3)})`;
      ctx.stroke();
    }
  }

  return function updateRumoDano(delta) {
    for (let i = marcas.length - 1; i >= 0; i--) {
      marcas[i].restante -= delta;
      if (marcas[i].restante <= 0) marcas.splice(i, 1);
    }

    // Remede sempre que o tamanho mudar, inclusive de zero pra alguma coisa:
    // o HUD nasce com display:none esperando o deploy, e medir só uma vez
    // deixaria o canvas 0x0 pra sempre.
    if (canvas.clientWidth !== width || canvas.clientHeight !== height) medir();
    if (width === 0 || height === 0) return;

    if (marcas.length === 0) {
      if (vazio) return;
      ctx.clearRect(0, 0, width, height);
      vazio = true;
      return;
    }

    // Com marca viva o desenho MUDA todo quadro: a opacidade anda com o
    // relógio dela e o rumo anda com a cabeça e com os pés do jogador.
    vazio = false;
    desenhar();
  };
}
