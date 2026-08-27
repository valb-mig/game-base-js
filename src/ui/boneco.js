import { corpoDe, ALTURA_BASE, ORDEM } from '../game/hitboxes.js';

/**
 * Boneco de regiões atingidas: onde a bala pegou no CORPO DELE.
 *
 * O jogo resolve dano por região desde sempre — cabeça mata num tiro,
 * capacete em dois, tronco é o normal, braço e perna demoram mais — e o
 * jogador não tinha como saber onde foi atingido. A barra de vida conta
 * QUANTO; ela não conta que os três tiros pegaram no braço, que é o que
 * explica por que ele ainda está de pé, e por que ele vai cair no próximo se
 * mudar de posição.
 *
 * O DESENHO SAI DA HITBOX, e é isso que o mantém honesto. As caixas vêm de
 * `corpoDe()`, a mesma fonte que a bala consulta, projetadas de frente: a
 * silhueta não pode discordar das regiões de dano porque ela É as regiões de
 * dano. Uma silhueta desenhada à mão desalinharia na primeira vez que alguém
 * mexesse numa peça — que é exatamente o defeito que `game/hitboxes.js`
 * existe pra evitar, e ele já cobrou 8 cm na cabeça uma vez.
 *
 * Ele fica SEMPRE na tela, apagado. Aparecer só ao levar tiro obrigaria o
 * olho a achar um elemento novo no canto no meio de um tiroteio; apagado, o
 * jogador já sabe onde ele está e só o clarão é novidade. É o contrário da
 * barra de fôlego, que só aparece quando falta — ali o que interessa é o
 * número, aqui o que interessa é ONDE, e "onde" precisa de um mapa fixo.
 *
 * Os dois lados acendem juntos, e não é preguiça: o dado é o GRUPO, e grupo
 * não tem lado. `braco` é braço, não braço esquerdo — acender só um seria o
 * HUD inventando uma distinção que a regra de dano não faz.
 */

/** Segundos que a região fica acesa. */
const DURACAO = 1.8;
const APAGADO = 'rgba(226, 218, 194, 0.17)';
const CONTORNO = 'rgba(12, 15, 11, 0.45)';
const ACESO = [224, 70, 44];
/** Folga em px pra que o contorno não seja cortado pela borda do canvas. */
const MARGEM = 1;

export function initBoneco(vitima, ...fontes) {
  const canvas = document.getElementById('boneco');
  if (!canvas) return () => {};
  const ctx = canvas.getContext('2d');

  /** Quanto cada grupo está aceso, 0..1. */
  const aceso = new Map();

  let width = 0;
  let height = 0;
  let pecas = null;
  let sujo = true;

  /**
   * As caixas da hitbox projetadas de frente, em px do canvas.
   *
   * Feito uma vez: a hitbox de pé não muda, e o boneco mostra o corpo de pé
   * mesmo com o jogador agachado — ele diz ONDE pegou, não que postura o
   * jogador tinha. Postura no boneco viraria duas informações no mesmo
   * desenho, e a que interessa é a região.
   */
  function montar() {
    const caixas = corpoDe(ALTURA_BASE, [], 'pe');

    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = 0;
    for (const c of caixas) {
      if (c.minX < minX) minX = c.minX;
      if (c.maxX > maxX) maxX = c.maxX;
      if (c.maxY > maxY) maxY = c.maxY;
    }

    // Escala ÚNICA nos dois eixos: esticar pra encher o canvas mentiria sobre
    // a proporção do corpo, e é a proporção que faz a silhueta ler como
    // soldado. Há teste que compara a razão desenhada com a da hitbox.
    const escala = Math.min(
      (width - MARGEM * 2) / (maxX - minX),
      (height - MARGEM * 2) / maxY
    );
    const offX = (width - (maxX - minX) * escala) / 2;
    const offY = (height - maxY * escala) / 2;

    pecas = caixas.map((c) => ({
      grupo: c.regiao.id,
      ordem: c.ordem,
      x: offX + (c.minX - minX) * escala,
      y: offY + (maxY - c.maxY) * escala,
      w: Math.max(1, (c.maxX - c.minX) * escala),
      h: Math.max(1, (c.maxY - c.minY) * escala)
    }));

    // Prioridade ALTA desenhada por último, ou seja por cima: o capacete
    // cobre a parte de cima da cabeça, e o desenho tem que dizer a mesma
    // coisa que `ORDEM` diz na hora de resolver empate.
    pecas.sort((a, b) => b.ordem - a.ordem);
  }

  function medir() {
    const ratio = Math.min(devicePixelRatio, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    pecas = null;
    sujo = true;
  }

  const anotar = (r) => {
    if (r.target !== vitima) return;
    if (!(r.amount > 0)) return;
    const id = r.regiao?.id;
    // Sem região não há onde acender, e o boneco não escolhe uma por conta:
    // é o caso do atropelamento, que fere sem dizer onde.
    if (!id || !ORDEM.includes(id)) return;
    aceso.set(id, 1);
    sujo = true;
  };

  for (const fonte of fontes) fonte.onHit?.(anotar);

  function desenhar() {
    ctx.clearRect(0, 0, width, height);

    // Duas passadas, e a ordem é a regra: o apagado inteiro primeiro, o aceso
    // depois. Numa passada só, uma peça de prioridade alta desenhada por cima
    // (a cabeça, sobre o capacete) apagaria com o tom morto justamente a
    // região que acabou de acender.
    for (const p of pecas) {
      ctx.fillStyle = APAGADO;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // Contorno POR DENTRO da caixa: por fora ele engorda a silhueta e a
      // razão medida deixa de ser a da hitbox.
      if (p.w > 2 && p.h > 2) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = CONTORNO;
        ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
      }
    }

    for (const p of pecas) {
      const forca = aceso.get(p.grupo) ?? 0;
      if (forca <= 0) continue;
      ctx.fillStyle = `rgba(${ACESO[0]}, ${ACESO[1]}, ${ACESO[2]}, ${(forca * 0.95).toFixed(3)})`;
      ctx.fillRect(p.x, p.y, p.w, p.h);
    }
  }

  return function updateBoneco(delta) {
    for (const [id, forca] of aceso) {
      const resta = forca - delta / DURACAO;
      if (resta <= 0) aceso.delete(id);
      else aceso.set(id, resta);
      sujo = true;
    }

    // Remede quando o tamanho mudar, inclusive de zero pra alguma coisa: o
    // HUD nasce oculto esperando o deploy.
    if (canvas.clientWidth !== width || canvas.clientHeight !== height) medir();
    if (width === 0 || height === 0) return;
    if (!pecas) montar();

    if (!sujo) return;
    sujo = false;
    desenhar();
  };
}
