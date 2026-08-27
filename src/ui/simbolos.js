import { teamOf, postOwner, postContested } from '../game/teams.js';

/**
 * O símbolo de um ponto de captura. Um desenho só, para as três telas.
 *
 * O mapa grande, o radar e o mapa tático mostravam a mesma coisa de três
 * jeitos — círculo num, losango noutro —, e o comentário do radar já dizia
 * "mesma leitura do mapa tático, de propósito" enquanto desenhava outra. Uma
 * fonte só resolve isso e resolve o próximo ajuste junto.
 *
 * A linguagem é a de um jogo de conquista: DISCO cheio no tom de quem manda,
 * número no meio, e um ANEL DE PROGRESSO em volta enquanto está sendo tomado.
 * O anel é o que faz o mapa contar a partida em vez de só listar objetivos —
 * de relance se vê que o ponto 3 está em 60% e vindo pro outro lado, que é
 * exatamente a informação que faz alguém largar o que está fazendo e correr
 * pra lá.
 */

const NEUTRO = 'rgba(210, 214, 200, 0.75)';
const FUNDO = 'rgba(16, 20, 17, 0.82)';
const TINTA = 'rgba(14, 18, 15, 0.9)';

/**
 * Quanto da captura já andou, de 0 a 1, e de quem é o trabalho.
 *
 * A troca tem duas metades e elas contam como uma só: a bandeira antiga desce
 * até o meio do mastro (primeira metade) e só então a nova sobe (segunda).
 * Mostrar as duas como barras separadas faria o anel voltar a zero no meio da
 * captura, e quem olhasse acharia que alguém tinha revertido.
 */
export function progressoDePosto(post) {
  let fracao = 0;
  let porTime = null;

  for (const flag of post.flags ?? []) {
    if (flag.phase === 'parada') continue;
    const t = Math.max(0, Math.min(1, flag.progress ?? 0));
    const andou = flag.phase === 'icando' ? 0.5 + t * 0.5 : t * 0.5;
    if (andou <= fracao) continue;
    fracao = andou;
    porTime = flag.phase === 'icando' ? flag.byTeam : (flag.byTeam ?? null);
  }
  return { fracao, porTime, emDisputa: postContested(post) };
}

function cssDoTime(id) {
  return id ? teamOf(id).css : NEUTRO;
}

/**
 * Desenha o símbolo centrado em (x, y).
 *
 * `raio` manda em tudo: o radar passa 6 px e o mapa grande passa 13, e o
 * número some sozinho quando não cabe — rótulo ilegível é ruído, não dado.
 */
export function desenharPosto(ctx, x, y, post, {
  raio = 10,
  dono = undefined,
  rotulo = undefined,
  esmaecido = false,
  destacado = false,
  tempo = 0
} = {}) {
  /**
   * `undefined` quer dizer "descubra"; `null` quer dizer "de ninguém".
   *
   * O mapa tático calcula o dono por fora e passava `undefined` pras zonas de
   * base sem time — que aqui virava "descubra", e descobrir chamava
   * `postOwner(undefined)`. Duas ausências com o mesmo nome: a que pede pra
   * calcular e a que já é a resposta.
   */
  const quemManda = dono !== undefined
    ? dono
    : (post?.flags ? postOwner(post) : null);
  const { fracao, porTime, emDisputa } = post?.flags
    ? progressoDePosto(post)
    : { fracao: 0, porTime: null, emDisputa: false };

  ctx.save();
  ctx.translate(x, y);

  // Disco: cheio no tom de quem manda, escuro quando é de ninguém. Cheio e
  // não vazado porque é ele que tem que ser lido primeiro, antes do número.
  ctx.beginPath();
  ctx.arc(0, 0, raio, 0, Math.PI * 2);
  ctx.fillStyle = quemManda
    ? (esmaecido ? FUNDO : cssDoTime(quemManda))
    : FUNDO;
  ctx.fill();

  /**
   * Esmaecido apaga o MIOLO, nunca o dono.
   *
   * Na tela de deploy, posto onde não dá pra nascer é desenhado apagado — e a
   * primeira versão apagava o traço junto, o que sumia com a cor do time. O
   * mapa então dizia "não dá pra nascer aqui" e deixava de dizer de quem é o
   * ponto, que é a informação mais importante que ele tem.
   */
  ctx.lineWidth = Math.max(1.2, raio * (esmaecido ? 0.22 : 0.16));
  ctx.strokeStyle = destacado
    ? '#e9efe6'
    : (quemManda ? (esmaecido ? cssDoTime(quemManda) : TINTA) : NEUTRO);
  ctx.stroke();

  /**
   * O anel de progresso, começando às 12 horas e andando no sentido do
   * relógio.
   *
   * Ele pulsa enquanto há disputa. Ponto sendo tomado é a coisa mais urgente
   * que o mapa tem pra dizer, e num quadro parado — captura de tela, mapa
   * aberto — o tracejado sozinho não grita o bastante.
   */
  if (emDisputa) {
    const pulso = 0.72 + Math.sin(tempo * 0.006) * 0.28;
    const anel = raio + Math.max(2.4, raio * 0.34);

    ctx.beginPath();
    ctx.arc(0, 0, anel, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, raio * 0.14);
    ctx.strokeStyle = `rgba(233, 239, 230, ${0.22 * pulso})`;
    ctx.stroke();

    if (fracao > 0.001) {
      ctx.beginPath();
      ctx.arc(0, 0, anel, -Math.PI / 2, -Math.PI / 2 + fracao * Math.PI * 2);
      ctx.lineWidth = Math.max(1.6, raio * 0.3);
      ctx.lineCap = 'round';
      ctx.strokeStyle = cssDoTime(porTime);
      ctx.globalAlpha = pulso;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // O número só entra se couber. Abaixo de uns nove pixels de raio ele vira
  // borrão, e borrão no meio do disco atrapalha a cor, que é o dado.
  const texto = rotulo ?? (post?.numero ? String(post.numero) : '');
  if (texto && raio >= 8) {
    ctx.fillStyle = quemManda && !esmaecido ? '#12160f' : '#e9efe6';
    ctx.font = `bold ${Math.round(raio * 1.15)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, 0, raio * 0.06);
  }

  ctx.restore();
}
