import * as THREE from 'three';
import { headingDegrees } from '../player/heading.js';
import { desenharPosto } from './simbolos.js';
import { todas as marcacoes } from './marcacoes.js';
import { activePostFor } from '../game/teams.js';

/**
 * Fita de bússola no topo. Desenhada em canvas porque é tudo régua: risco
 * a cada 5°, risco alto a cada 15°, e rosa dos ventos a cada 45°.
 *
 * E os OBJETIVOS deslizam por ela. Saber que o norte é ali não ajuda quem
 * precisa saber onde fica o ponto 3 — a bússola respondia a pergunta errada,
 * e o jogador tinha que abrir o mapa ou decorar o radar pra traduzir rumo em
 * objetivo. Com os ícones na fita, virar a cabeça já é a resposta.
 *
 * O símbolo é o MESMO de `ui/simbolos.js` que o mapa, o radar e o mapa tático
 * desenham. Quatro telas, um desenho.
 */

const SPAN = 130;        // graus visíveis de ponta a ponta da fita
const ROSE = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];

const INK = '#ddd4b6';
const DIM = 'rgba(221, 212, 182, 0.45)';
const MARCACAO = '#f2c14e';

/**
 * A fita em três faixas, de cima pra baixo: ícones, rosa dos ventos, riscos.
 *
 * Os ícones ficam ACIMA da régua porque é assim que se lê: o olho bate no
 * objetivo e desce pro grau só se precisar do número. Invertido, a régua vira
 * ruído por cima da informação.
 */
const LINHA_ICONE = 15;
const LINHA_ROSA = 30;
const RAIO = 9;

/** Fora da fita, o ícone encosta na borda — e essa é a margem dele. */
const MARGEM = RAIO + 3;

export function initCompass(camera, { player = null, world = null } = {}) {
  const canvas = document.getElementById('compass');
  const ctx = canvas.getContext('2d');
  const scratch = new THREE.Vector3();

  let lastHeading = null;
  let lastX = 0;
  let lastZ = 0;
  let width = 0;
  let height = 0;

  // Reaproveitado: montar a lista de marcadores é coisa de todo quadro.
  const marcadores = [];

  function measure() {
    const ratio = Math.min(devicePixelRatio, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    lastHeading = null; // força redesenho no novo tamanho
  }

  /** Diferença angular pro rumo, dobrada em -180..180. */
  function desvio(grausDoAlvo, heading) {
    let d = grausDoAlvo - heading;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }

  /**
   * Junta postos e marcações numa lista só, com a posição já na fita.
   *
   * `presos` é a mesma regra do radar: o que está fora não some, encosta na
   * borda. Objetivo que desaparece deixa o jogador sem saber pra que lado
   * virar, que é a única pergunta que ele faz à bússola.
   */
  function montar(heading, px, pz, pixelsPorGrau) {
    marcadores.length = 0;
    if (!player) return marcadores;

    const meio = width / 2;
    const juntar = (x, z, desenhar) => {
      const graus = Math.atan2(x - px, -(z - pz)) * 180 / Math.PI;
      const d = desvio(graus, heading);
      const preso = Math.abs(d) > SPAN / 2;
      marcadores.push({
        d,
        preso,
        alvo: meio + d * pixelsPorGrau,
        distancia: Math.hypot(x - px, z - pz),
        desenhar
      });
    };

    /**
     * O posto da VEZ vem destacado.
     *
     * A frente anda em ordem e só um ponto pode ser mexido por vez: com os
     * seis desenhados igual, a bússola diz onde tudo está e não diz pra onde
     * ir. O anel claro é a resposta da pergunta que o jogador realmente faz.
     */
    const daVez = world?.outposts
      ? activePostFor(world.outposts, player.team)
      : null;

    for (const posto of world?.outposts ?? []) {
      juntar(posto.x, posto.z, (cx, m) => desenharPosto(ctx, cx, LINHA_ICONE, posto, {
        raio: m.preso ? RAIO * 0.78 : RAIO * (posto === daVez ? 1.12 : 0.92),
        destacado: posto === daVez,
        tempo: agora
      }));
    }

    marcacoes().forEach((marca, i) => {
      juntar(marca.x, marca.z, (cx, m) => {
        const r = m.preso ? RAIO * 0.7 : RAIO * 0.9;
        ctx.save();
        ctx.translate(cx, LINHA_ICONE);
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.78, 0);
        ctx.lineTo(0, r);
        ctx.lineTo(-r * 0.78, 0);
        ctx.closePath();
        ctx.fillStyle = MARCACAO;
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = 'rgba(20, 24, 20, 0.85)';
        ctx.stroke();
        ctx.fillStyle = '#1a1e19';
        ctx.font = 'bold 10px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), 0, 0.5);
        ctx.restore();
      });
    });

    /**
     * Quem está mais perto do centro fica com o lugar dele; quem colidir é
     * empurrado pra dentro.
     *
     * Sem isto, virar a cabeça pro lado errado empilha três objetivos no
     * mesmo pixel da borda e nenhum deles é legível — que é o mesmo que não
     * mostrar nada, só que com tinta.
     */
    marcadores.sort((a, b) => Math.abs(a.d) - Math.abs(b.d));

    const postos = [];
    for (const m of marcadores) {
      let x = Math.max(MARGEM, Math.min(width - MARGEM, m.alvo));
      const lado = m.alvo < meio ? 1 : -1;
      for (let tentativa = 0; tentativa < 8; tentativa++) {
        if (!postos.some((outro) => Math.abs(outro - x) < RAIO * 1.9)) break;
        x += lado * RAIO * 1.9;
      }
      m.x = Math.max(MARGEM, Math.min(width - MARGEM, x));
      postos.push(m.x);
    }
    return marcadores;
  }

  let agora = 0;

  function draw(heading, px, pz) {
    ctx.clearRect(0, 0, width, height);

    const pixelsPerDegree = width / SPAN;
    const center = width / 2;
    const first = Math.ceil(heading - SPAN / 2);
    const last = Math.floor(heading + SPAN / 2);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let degree = first; degree <= last; degree++) {
      if (degree % 5 !== 0) continue;

      const x = center + (degree - heading) * pixelsPerDegree;
      const wrapped = (degree % 360 + 360) % 360;
      const isRose = wrapped % 45 === 0;
      const isMajor = wrapped % 15 === 0;

      ctx.fillStyle = isRose ? INK : DIM;
      const tick = isRose ? 13 : isMajor ? 10 : 6;
      ctx.fillRect(Math.round(x), height - tick, isRose ? 2 : 1, tick);

      if (isRose) {
        ctx.fillStyle = INK;
        ctx.font = '600 13px "Arial Narrow", "Roboto Condensed", system-ui, sans-serif';
        ctx.fillText(ROSE[wrapped / 45], x, LINHA_ROSA);
      }
    }

    agora = typeof performance !== 'undefined' ? performance.now() : 0;
    for (const m of montar(heading, px, pz, pixelsPerDegree)) {
      m.desenhar(m.x, m);

      // A distância só entra em quem está DENTRO da fita. No ícone preso na
      // borda ela mentiria por omissão: o número seria de um ponto que não
      // está naquela direção, está além dela.
      if (m.preso) continue;

      // A distância leva um traço escuro por trás: ela é escrita por cima do
      // céu, e nove pixels de tinta clara sobre cinza claro não se lê.
      const texto = `${Math.round(m.distancia)} m`;
      ctx.font = '700 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const largura = ctx.measureText(texto).width + 5;
      const topo = LINHA_ICONE + RAIO + 2;
      ctx.fillStyle = 'rgba(12, 16, 13, 0.62)';
      ctx.fillRect(m.x - largura / 2, topo - 1, largura, 12);
      ctx.fillStyle = INK;
      ctx.fillText(texto, m.x, topo);
    }
  }

  addEventListener('resize', measure);

  return function updateCompass() {
    // Remede sempre que o tamanho mudar, inclusive de zero pra alguma coisa.
    // Na inicialização o HUD ainda está com display:none esperando o deploy,
    // então medir só uma vez deixava o canvas com 0x0 pra sempre — a fita
    // existia e nunca desenhava nada.
    if (canvas.clientWidth !== width || canvas.clientHeight !== height) measure();
    if (width === 0 || height === 0) return;

    const heading = headingDegrees(camera.quaternion, scratch);
    const pos = player?.object?.position;
    const px = pos?.x ?? 0;
    const pz = pos?.z ?? 0;

    // A POSIÇÃO entra na conta de "mudou alguma coisa": os ícones deslizam
    // quando o jogador anda, não só quando ele vira a cabeça. Sem isso a fita
    // congelava com os objetivos no lugar errado enquanto ele corria reto.
    if (lastHeading !== null
      && Math.abs(heading - lastHeading) < 0.15
      && Math.abs(px - lastX) < 1 && Math.abs(pz - lastZ) < 1) return;

    lastHeading = heading;
    lastX = px;
    lastZ = pz;
    draw(heading, px, pz);
  };
}
