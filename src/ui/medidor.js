import Stats from 'three/addons/libs/stats.module.js';

/**
 * O medidor do quadro.
 *
 * A regra da casa é medir o QUADRO INTEIRO em vez dos componentes, e três
 * vezes nesta base a conclusão saiu errada por medir a parte errada: a IA
 * caiu de 14 pra 2 ms e o quadro não melhorou, porque o render sempre foi
 * maior e ninguém tinha medido. Isto é o instrumento que faltava em jogo —
 * as bancadas medem em swiftshader, e swiftshader não é a máquina de
 * ninguém.
 *
 * MÉDIA NÃO SERVE. Um engasgo de 40 ms a cada trinta quadros é exatamente o
 * que se sente jogando e exatamente o que a média esconde: 60 fps de média
 * com o pior quadro em 40 ms é um jogo que treme. Por isso o que aparece é
 * p50, p95 e o pior da janela.
 *
 * `renderer.info` é o resto da conta e vem de graça: draw call e triângulo
 * são o que o render cobra, e contagem de objeto é o que a travessia cobra —
 * medido, 1311 objetos custam 1,8 ms de CPU por quadro sem desenhar um
 * triângulo sequer.
 *
 * O gráfico é o `Stats` do three, e ele entra AO LADO dos números, não no
 * lugar deles: ele não sabe percentil e não sabe de draw call. O que ele tem
 * e nenhum número tem é a FORMA do tempo — sessenta quadros desenhados lado a
 * lado mostram de relance se o custo é um degrau, um dente de serra ou um
 * pico isolado, e é isso que diz onde procurar. Clicar nele troca ms por fps
 * por memória.
 */

/** Quadros guardados na janela: a 60 fps são dois segundos. */
const JANELA = 120;

function percentil(ordenado, p) {
  if (!ordenado.length) return 0;
  const i = Math.min(ordenado.length - 1, Math.floor(ordenado.length * p));
  return ordenado[i];
}

/**
 * `renderer` e `scene` são opcionais de propósito: sem eles o medidor conta
 * só tempo, e é isso que deixa a suíte exercitar a estatística sem montar
 * three nenhum.
 */
export function criarMedidor({ renderer = null, scene = null, grafico = true } = {}) {
  const amostras = new Float32Array(JANELA);
  // `Stats` desenha num canvas, e canvas oculto não custa quadro: ele é
  // alimentado sempre e só o CSS decide se aparece. Alimentá-lo só com o
  // painel aberto daria um gráfico que começa do zero a cada F2.
  const stats = grafico ? new Stats() : null;
  if (stats) {
    stats.showPanel(1);   // ms, não fps: o que se caça é o quadro caro
    // A posição é do painel do F2, não da tela: `Stats` se prende no canto
    // superior esquerdo por conta própria.
    stats.dom.style.cssText = 'position:relative;cursor:pointer;opacity:0.9';
  }
  let escritas = 0;
  let cursor = 0;

  // A contagem de objeto não muda de quadro pra quadro, e uma travessia da
  // cena por quadro só pra contar seria o próprio custo que se quer medir.
  let objetos = 0;
  let desdeAContagem = Infinity;

  // O que o RENDER DO MUNDO cobrou, copiado logo depois dele.
  //
  // Ler `renderer.info` no painel dava zero: `info` se zera no começo de cada
  // `render`, e o último render do quadro é o do VIEWMODEL, que desenha uma
  // arma numa cena vazia. O número que interessa é o do mundo, e a única hora
  // de lê-lo é entre um render e outro.
  let desenho = { chamadas: 0, triangulos: 0 };

  function quadro(delta) {
    stats?.update();
    amostras[cursor] = delta * 1000;
    cursor = (cursor + 1) % JANELA;
    escritas++;

    desdeAContagem += delta;
    if (scene && desdeAContagem > 1) {
      desdeAContagem = 0;
      objetos = 0;
      scene.traverse(() => objetos++);
    }
  }

  /** Chamado logo depois do render do MUNDO, antes do viewmodel. */
  function amostrarRender() {
    const info = renderer?.info;
    if (!info) return;
    desenho = { chamadas: info.render.calls, triangulos: info.render.triangles };
  }

  /** Os números crus, pra bancada e pra teste. */
  function medida() {
    const n = Math.min(escritas, JANELA);
    const ordenado = Array.from(amostras.slice(0, n)).sort((a, b) => a - b);
    const info = renderer?.info;
    const p50 = percentil(ordenado, 0.5);
    return {
      quadros: n,
      p50,
      p95: percentil(ordenado, 0.95),
      pior: n ? ordenado[n - 1] : 0,
      // Sem quadro medido não há fps. O piso de meio milésimo não é
      // paranoia: sob `--virtual-time-budget` o relógio não anda, o delta
      // chega zero e `1000 / 0` virava "1000000 fps" escrito no HUD — a
      // mesma regra de sempre, o HUD não inventa número.
      fps: n && p50 > 0.0005 ? Math.round(1000 / p50) : 0,
      objetos,
      chamadas: desenho.chamadas,
      triangulos: desenho.triangulos,
      geometrias: info?.memory.geometries ?? 0,
      texturas: info?.memory.textures ?? 0,
      programas: info?.programs?.length ?? 0
    };
  }

  /**
   * As linhas do painel. O p95 vem antes do p50 porque é ele que denuncia:
   * quem olha um número só olha o primeiro.
   */
  function linhas() {
    const m = medida();
    if (!m.quadros) return [];
    const linhas = [
      `quadro p95 <b>${m.p95.toFixed(1)}</b> ms · p50 <b>${m.p50.toFixed(1)}</b>` +
        ` · pior <b>${m.pior.toFixed(1)}</b>` +
        (m.fps ? ` · <b>${m.fps}</b> fps` : '')
    ];
    if (renderer) {
      linhas.push(
        `desenho <b>${m.chamadas}</b> chamadas · ` +
        `<b>${(m.triangulos / 1000).toFixed(0)}k</b> triângulos · ` +
        `<b>${m.objetos}</b> objetos na cena`
      );
    }
    return linhas;
  }

  return {
    quadro, amostrarRender, medida, linhas,
    /** O canvas do gráfico, pra quem tiver onde pendurá-lo. */
    grafico: stats?.dom ?? null
  };
}
