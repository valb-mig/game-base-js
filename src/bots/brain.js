import * as THREE from 'three';
import { AIM, createAim, turnToward, angleGap } from './aiming.js';
import { postOwner } from '../game/teams.js';

/**
 * O que um bot decide fazer.
 *
 * Cinco estados, e a ordem entre eles é a regra:
 *
 *   combate    inimigo à vista e arma na mão que atire
 *   cobertura  levando tiro, ou recarregando: sai da linha
 *   procurando perdeu de vista, vai onde viu pela última vez
 *   capturando chegou num mastro inimigo e não tem ninguém atirando
 *   avançando  o resto do tempo: anda pro posto inimigo mais perto
 *
 * Combate ganha de captura de propósito. Bot que fica içando bandeira com
 * alguém atirando nele não é bravo, é bug — e o jogador aprende a matar bot
 * parado em vez de disputar posto.
 */

export const BRAIN = {
  VISAO: 78,             // metros
  CAMPO: 1.15,           // rad de meio-ângulo: ele não tem olho na nuca
  PERTO_DEMAIS: 4.5,     // troca pra faca
  DISTANCIA_BOA: 18,     // tenta manter mais ou menos isso do alvo
  PASSO_LATERAL: 0.7,    // quanto do passo vira desvio lateral em combate

  COBERTURA_BUSCA: 14,   // raio de procura por quina pra se esconder
  COBERTURA_TEMPO: 2.2,  // quanto tempo ele fica agachado antes de reaparecer
  SOB_FOGO: 1.4,         // levou tiro há menos que isso = está sob fogo

  CHEGOU: 1.6,           // distância que conta como "chegou no ponto"
  MASTRO: 2.2            // distância de trabalho na bandeira
};

const olho = new THREE.Vector3();
const alvoOlho = new THREE.Vector3();

/** Alvo mais próximo que ele consegue ver de fato. */
function avistar(bot, inimigos, temLinha) {
  bot.eye(olho);
  let melhor = null;
  let menor = BRAIN.VISAO;

  for (const inimigo of inimigos) {
    if (!inimigo.alive) continue;
    const centro = inimigo.center();
    const distancia = olho.distanceTo(centro);
    if (distancia > menor) continue;

    // campo de visão: quem chega por trás não é visto, e é isso que dá
    // sentido a flanquear
    const paraAlvo = Math.atan2(centro.x - bot.x, centro.z - bot.z);
    if (angleGap(paraAlvo, bot.yaw) > BRAIN.CAMPO) continue;

    alvoOlho.copy(centro);
    if (!temLinha(olho, alvoOlho, inimigo)) continue;

    menor = distancia;
    melhor = inimigo;
  }
  return melhor;
}

export function createBrain(bot, mundo, rng = Math.random) {
  const aim = createAim(rng);
  const memoria = new THREE.Vector3();

  let estado = 'avancando';
  let semVer = 0;
  let emCobertura = 0;
  let destino = null;
  let alvo = null;
  let desvio = rng() < 0.5 ? -1 : 1;
  let trocaDesvio = 0;
  let varredura = 0;

  /** Ponto de cobertura: quina de colisor que corta a linha até o alvo. */
  function acharCobertura(deQuem) {
    bot.eye(olho);
    let melhor = null;
    let menor = Infinity;

    for (const { box } of mundo.colliders) {
      if (box.max.y - box.min.y < 0.8) continue;        // baixo demais pra cobrir
      const cx = (box.min.x + box.max.x) / 2;
      const cz = (box.min.z + box.max.z) / 2;
      const distancia = Math.hypot(cx - bot.x, cz - bot.z);
      if (distancia > BRAIN.COBERTURA_BUSCA || distancia > menor) continue;

      // O lado do obstáculo virado pra LONGE do inimigo é o que serve.
      const paraLonge = Math.atan2(cx - deQuem.x, cz - deQuem.z);
      const largura = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      const ponto = {
        x: cx + Math.sin(paraLonge) * (largura * 0.5 + 0.6),
        z: cz + Math.cos(paraLonge) * (largura * 0.5 + 0.6)
      };
      menor = distancia;
      melhor = ponto;
    }
    return melhor;
  }

  /** Posto inimigo mais perto: é pra lá que ele vai quando não há briga. */
  function objetivo() {
    let melhor = null;
    let menor = Infinity;
    for (const post of mundo.outposts) {
      if (postOwner(post) === bot.team) continue;
      const distancia = Math.hypot(post.x - bot.x, post.z - bot.z);
      if (distancia >= menor) continue;
      menor = distancia;
      melhor = post;
    }
    return melhor;
  }

  /** Bandeira do posto que ainda não é dele. */
  function bandeiraDe(post) {
    return post?.flags.find((flag) => flag.owner !== bot.team) ?? null;
  }

  function andarPara(px, pz, delta, velocidade, lateral = 0) {
    const dx = px - bot.x;
    const dz = pz - bot.z;
    const distancia = Math.hypot(dx, dz) || 1;

    // desvio lateral: andar em linha reta pro alvo é o que faz bot virar
    // alvo de tiro fácil
    const passo = velocidade * delta;
    const ux = dx / distancia;
    const uz = dz / distancia;
    const andou = bot.step(
      (ux + -uz * lateral) * passo,
      (uz + ux * lateral) * passo
    );
    bot.speed = andou / delta;
    return distancia;
  }

  return {
    aim,
    get state() { return estado; },
    get target() { return alvo; },
    get lastSeen() { return memoria; },

    update(delta, contexto) {
      const { inimigos, temLinha, atirar, capturar } = contexto;

      if (!bot.alive) {
        estado = 'caido';
        bot.speed = 0;
        return;
      }

      bot.hurtFor += delta;
      const sobFogo = bot.hurtFor < BRAIN.SOB_FOGO;

      const visto = avistar(bot, inimigos, temLinha);
      if (visto) {
        alvo = visto;
        memoria.copy(visto.center());
        semVer = 0;
        aim.track(delta);
      } else {
        semVer += delta;
        aim.idle(delta);
        if (semVer > AIM.MEMORIA) {
          alvo = null;
          aim.reset();
        }
      }

      // -------------------------------------------------------- que estado?
      const arma = bot.weapon;
      const semMunicao = arma?.ammo && arma.ammo.loaded <= 0;

      if (visto && !semMunicao) estado = 'combate';
      else if ((sobFogo || semMunicao) && alvo) estado = 'cobertura';
      else if (sobFogo) estado = 'alerta';
      else if (alvo) estado = 'procurando';
      else estado = 'avancando';

      // Troca de arma: sem munição vai pra próxima que tenha; colado no
      // inimigo, a faca ganha da arma comprida.
      if (visto) {
        const distancia = Math.hypot(alvo.x - bot.x, alvo.z - bot.z);
        const querFaca = distancia < BRAIN.PERTO_DEMAIS;
        const escolha = bot.weapons.findIndex((a) => (querFaca
          ? !a.firearm
          : a.firearm && (!a.ammo || a.ammo.loaded > 0)));
        if (escolha >= 0) bot.trocarPara(escolha);
      }

      // ------------------------------------------------------- e o que fazer
      if (estado === 'combate') {
        const centro = alvo.center();
        const paraAlvo = Math.atan2(centro.x - bot.x, centro.z - bot.z);
        const giro = (aim.tracking > AIM.REACAO ? AIM.GIRO_ALERTA : AIM.GIRO) * delta;
        bot.yaw = turnToward(bot.yaw, paraAlvo, giro);
        bot.crouching = false;

        const distancia = Math.hypot(centro.x - bot.x, centro.z - bot.z);

        // Aproxima se estiver longe, recua se estiver colado, e sempre com
        // um passo lateral: é o que impede o duelo de virar dois postes.
        trocaDesvio -= delta;
        if (trocaDesvio <= 0) {
          desvio = -desvio;
          trocaDesvio = 1.1 + rng() * 1.6;
        }
        const querPerto = distancia > BRAIN.DISTANCIA_BOA;
        const alvoX = querPerto ? centro.x : bot.x * 2 - centro.x;
        const alvoZ = querPerto ? centro.z : bot.z * 2 - centro.z;
        andarPara(alvoX, alvoZ, delta, 3.1, desvio * BRAIN.PASSO_LATERAL);

        atirar(bot, alvo, aim, angleGap(bot.yaw, paraAlvo), distancia);
        return;
      }

      if (estado === 'cobertura') {
        if (emCobertura <= 0) {
          destino = acharCobertura(alvo) ?? null;
          emCobertura = BRAIN.COBERTURA_TEMPO;
        }
        emCobertura -= delta;

        if (destino) {
          const falta = andarPara(destino.x, destino.z, delta, 3.6);
          bot.crouching = falta < BRAIN.CHEGOU;
        } else {
          // sem quina por perto, agachar já é alguma coisa
          bot.crouching = true;
          bot.speed = 0;
        }
        if (emCobertura <= 0) destino = null;
        return;
      }

      // Levou tiro de quem ele não viu: para tudo e varre o horizonte.
      //
      // Sem isto, o bot que estava içando bandeira continuava içando enquanto
      // era baleado pelo flanco — o jogador aprenderia a matar bot ocupado em
      // vez de disputar posto, que é o contrário do que o modo pede. Ele não
      // sabe DE ONDE veio o tiro, e é isso que dá a você a vantagem de ter
      // atirado primeiro: ele procura, você já sabe.
      if (estado === 'alerta') {
        bot.crouching = true;
        bot.speed = 0;
        varredura += delta * AIM.GIRO * 0.55;
        bot.yaw = turnToward(bot.yaw, bot.yaw + Math.sin(varredura) * 1.2,
          AIM.GIRO * delta);
        return;
      }

      if (estado === 'procurando') {
        bot.crouching = false;
        const paraLa = Math.atan2(memoria.x - bot.x, memoria.z - bot.z);
        bot.yaw = turnToward(bot.yaw, paraLa, AIM.GIRO * delta);
        if (andarPara(memoria.x, memoria.z, delta, 2.6) < BRAIN.CHEGOU) {
          alvo = null;
          aim.reset();
        }
        return;
      }

      // ------------------------------------------------------------ avançando
      bot.crouching = false;
      const post = objetivo();
      if (!post) {
        bot.speed = 0;
        return;
      }

      const bandeira = bandeiraDe(post);
      const destinoX = bandeira ? bandeira.x : post.x;
      const destinoZ = bandeira ? bandeira.z : post.z;
      const falta = Math.hypot(destinoX - bot.x, destinoZ - bot.z);

      if (bandeira && falta < BRAIN.MASTRO) {
        estado = 'capturando';
        bot.speed = 0;
        bot.yaw = turnToward(bot.yaw,
          Math.atan2(destinoX - bot.x, destinoZ - bot.z), AIM.GIRO * delta);
        capturar(bot, delta);
        return;
      }

      const paraDestino = Math.atan2(destinoX - bot.x, destinoZ - bot.z);
      bot.yaw = turnToward(bot.yaw, paraDestino, AIM.GIRO * delta);
      andarPara(destinoX, destinoZ, delta, 2.9);
    }
  };
}
