import * as THREE from 'three';
import { AIM, createAim, turnToward, angleGap } from './aiming.js';
import { postOwner, activePostFor } from '../game/teams.js';
import {
  SUPRIMENTO, secou, abastecido, temCorpoACorpo, reabastecer
} from '../game/suprimento.js';
import {
  TRATAMENTO, ferido, tratado, tratar, enfermariaMaisPerto
} from '../game/tratamento.js';

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
  MASTRO: 2.2,           // distância de trabalho na bandeira

  /**
   * Quanto ele abre pro lado ao ir atrás de quem sumiu, em metros.
   *
   * Ir em linha reta pra última posição conhecida é entregar-se: quem se
   * cobriu está olhando exatamente pra ali. Abrir pro lado é o que
   * transforma "procurando" em flanqueio — e é a resposta certa pro jogador
   * que se escondeu atrás de uma quina.
   */
  FLANCO: 11,

  /** Distância em que ele para de flanquear e vai direto. */
  FLANCO_ATE: 7
};

const olho = new THREE.Vector3();
const alvoOlho = new THREE.Vector3();

/**
 * Quantos raycasts um bot pode gastar por sondagem.
 *
 * A versão antiga testava a linha até TODO inimigo no alcance e ficava com o
 * mais perto que tivesse linha — 150 raycasts por bot por quadro, 45 mil no
 * total. Aqui os candidatos são ordenados por distância e testados NESSA
 * ORDEM, parando no primeiro que tem linha: o resultado é o mesmo (o mais
 * perto que se vê) com um raycast no caso comum.
 *
 * O teto existe pro caso ruim: se os quatro mais perto estão todos atrás de
 * parede, o quinto quase certamente também está. Errar isso custa um bot que
 * demora meio segundo a mais pra ver alguém escondido atrás de três outros.
 */
const RAYCASTS_POR_SONDAGEM = 4;

/**
 * Os K mais perto, e só eles. Arrays de tamanho FIXO.
 *
 * A primeira versão fazia inserção ordenada na lista inteira de candidatos,
 * apostando que a grade a devolveria pequena. Medido num tiroteio de 300
 * bots, ela não é: numa briga densa todo mundo está dentro dos 78 m de visão
 * de todo mundo, e a grade não filtra nada. Cada `splice` num array de 300
 * move até 300 posições, e isso rodava por candidato — dezenas de milhares
 * de movimentos por quadro.
 *
 * Só os quatro mais perto interessam, porque só eles serão testados por
 * raycast. Guardar quatro custa quatro comparações por candidato, e nenhuma
 * alocação.
 */
const MELHORES = RAYCASTS_POR_SONDAGEM;
const candidatos = new Array(MELHORES).fill(null);
const distancias = new Float64Array(MELHORES);

/**
 * Alvo mais próximo que ele consegue ver de fato.
 *
 * A ordem das peneiras é a regra: distância ao quadrado (sem raiz), depois
 * cone de visão (um `atan2`), e só então raycast — que é centenas de vezes
 * mais caro que os dois primeiros juntos. Raycast antes do cone era gastar o
 * caro pra descobrir o que o barato já sabia.
 */
function avistar(bot, inimigos, temLinha) {
  bot.eye(olho);
  for (let i = 0; i < MELHORES; i++) {
    candidatos[i] = null;
    distancias[i] = Infinity;
  }

  const visao2 = BRAIN.VISAO * BRAIN.VISAO;

  // Cone de visão por produto escalar, não por `atan2`.
  //
  // `atan2` custa dezenas de nanossegundos e roda por candidato: numa briga
  // densa são dezenas de milhares por quadro. O mesmo teste sai de comparar
  // a projeção do vetor na direção do olhar com `cos(CAMPO)` vezes a
  // distância — uma raiz em vez de um arco-tangente, e a raiz é a mesma que
  // já se precisaria pra distância.
  const frenteX = Math.sin(bot.yaw);
  const frenteZ = Math.cos(bot.yaw);
  const cosCampo = Math.cos(BRAIN.CAMPO);

  for (const inimigo of inimigos) {
    if (!inimigo.alive) continue;

    const dx = inimigo.x - bot.x;
    const dz = inimigo.z - bot.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > visao2 || d2 >= distancias[MELHORES - 1]) continue;
    if (dx * frenteX + dz * frenteZ < cosCampo * Math.sqrt(d2)) continue;

    // Entra na lista dos K mais perto, empurrando o último pra fora. K é
    // quatro, então isto são no máximo quatro trocas.
    let i = MELHORES - 1;
    while (i > 0 && distancias[i - 1] > d2) {
      distancias[i] = distancias[i - 1];
      candidatos[i] = candidatos[i - 1];
      i--;
    }
    distancias[i] = d2;
    candidatos[i] = inimigo;
  }

  for (let i = 0; i < MELHORES; i++) {
    const inimigo = candidatos[i];
    if (!inimigo) break;
    alvoOlho.copy(inimigo.center());
    if (temLinha(olho, alvoOlho, inimigo)) return inimigo;
  }
  return null;
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

  /**
   * Ele está no meio de uma ida ao paiol.
   *
   * Trava de propósito: `secou` deixa de ser verdadeiro na PRIMEIRA bala que
   * entra, e sem isto o bot largava o posto com uma no bolso pra secar de
   * novo dez metros à frente. Só solta quando está abastecido — ou quando
   * levar tiro, porque aí a decisão deixou de ser dele.
   */
  let buscandoBala = false;

  /**
   * E no meio de uma ida à enfermaria.
   *
   * Mesma trava, mesmo motivo — e a armadilha aqui é a mesma do `secou`:
   * `ferido` deixa de ser verdadeiro no primeiro ponto de vida que entra, e
   * sem isto o bot largaria a maca com 66% pra voltar ferido no primeiro
   * contato. Só solta quando está `tratado`, ou quando levar tiro, porque aí a
   * decisão deixou de ser dele.
   */
  let buscandoCura = false;

  // Reaproveitado: a busca por cobertura roda em quadro de combate, e alocar
  // um array de colisores ali é alocar no laço quente.
  const emVolta = [];

  /** Ponto de cobertura: quina de colisor que corta a linha até o alvo. */
  function acharCobertura(deQuem) {
    bot.eye(olho);
    let melhor = null;
    let menor = Infinity;

    // Só os colisores da vizinhança. Varrer a lista inteira eram 5505 caixas
    // por bot por quadro — 1,6 milhão com 300 bots — pra achar uma esquina a
    // catorze metros. Quem não responde `emVolta` (dublê de teste) devolve a
    // lista toda, e o resultado é o mesmo, só mais caro.
    const perto = mundo.colliders.emVolta
      ? mundo.colliders.emVolta(bot.x, bot.z, BRAIN.COBERTURA_BUSCA, emVolta)
      : mundo.colliders;

    for (const { box, balaPassa } of perto) {
      // Lona não é cobertura. A tenda da enfermaria barra o corpo e deixa
      // passar a bala: escolhê-la pra se esconder é o bot se pôr atrás de um
      // pano acreditando estar protegido — pior que ficar no aberto, porque
      // ele para de se mexer.
      if (balaPassa) continue;
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

  /**
   * Pra onde ele vai quando não há briga: o ponto da LINHA DE FRENTE.
   *
   * O mais perto seria errado — o time todo se espalharia pelos pontos que
   * ainda não são a vez, e a frente nunca andaria. Num modo sequencial, ir
   * pro lugar certo é metade do comportamento.
   */
  function objetivo() {
    return activePostFor(mundo.outposts, bot.team);
  }

  /**
   * O posto dominado mais perto — o paiol dele.
   *
   * `postoDeSuprimento` responde por RAIO porque é assim que o jogador
   * reabastece: parado perto do mastro. Aqui a pergunta é outra — qual buscar
   * — então a busca é sobre o mapa inteiro e o raio só serve pra saber que
   * chegou.
   */
  /** A tenda do time mais perto. Pergunta de mapa, como o paiol. */
  function tendaMaisPerto() {
    return enfermariaMaisPerto(mundo.enfermarias, bot.team, bot.x, bot.z);
  }

  function paiolMaisPerto() {
    let melhor = null;
    let menor = Infinity;
    for (const posto of mundo.outposts ?? []) {
      if (postOwner(posto) !== bot.team) continue;
      const distancia = Math.hypot(posto.x - bot.x, posto.z - bot.z);
      if (distancia >= menor) continue;
      menor = distancia;
      melhor = posto;
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

    /**
     * O alvo que ele está vendo NESTE instante, ou null.
     *
     * Diferente de `target`: aquele sobrevive `AIM.MEMORIA` segundos depois de
     * o inimigo sumir atrás de uma quina, e é isso que faz o bot continuar
     * apontando pra onde ele estava. Quem SINALIZA precisa da outra pergunta —
     * marcar um contato que ninguém enxerga mais renovaria os trinta segundos
     * pra sempre, e o radar do time viraria onisciência com passos extras.
     */
    get vendo() { return semVer === 0 ? alvo : null; },

    get lastSeen() { return memoria; },

    update(delta, contexto) {
      const { inimigos, temLinha, atirar, capturar, podeSentir = true } = contexto;

      if (!bot.alive) {
        estado = 'caido';
        bot.speed = 0;
        return;
      }

      bot.hurtFor += delta;
      const sobFogo = bot.hurtFor < BRAIN.SOB_FOGO;

      /**
       * Sondar não acontece todo quadro, e quem decide é `bots.js` — pela
       * distância ao olho do jogador. Perto sonda a 30 Hz, longe a 3 Hz.
       *
       * No quadro em que ele não sonda, o alvo ANTERIOR continua valendo. Não
       * é o mesmo que "não viu ninguém": zerar o alvo em quadro sem sondagem
       * faria o bot piscar entre combate e avanço trinta vezes por segundo, e
       * `semVer` acumularia tempo que não passou.
       */
      const visto = podeSentir
        ? avistar(bot, inimigos, temLinha)
        : (alvo && alvo.alive ? alvo : null);
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

      const temAviso = bot.ameaca && bot.ameaca.ate > 0;

      // Secou de vez: sem bala no carregador E sem reserva, em nenhuma arma.
      // Diferente de `semMunicao`, que é só o carregador vazio e se resolve
      // recarregando.
      if (secou(bot.weapons)) buscandoBala = true;
      else if (buscandoBala && abastecido(bot.weapons)) buscandoBala = false;
      const secado = buscandoBala;

      if (ferido(bot)) buscandoCura = true;
      else if (buscandoCura && tratado(bot)) buscandoCura = false;
      const machucado = buscandoCura;

      if (visto && (!semMunicao || secado)) estado = 'combate';
      else if ((sobFogo || semMunicao) && alvo) estado = 'cobertura';
      else if (sobFogo || temAviso) estado = 'alerta';
      else if (secado) estado = 'reabastecendo';
      // Munição ganha de vida na fila: ferido com bala ainda briga, sem bala
      // ele não briga de jeito nenhum. E as duas perdem de combate — bot que
      // vai se tratar com alguém à vista viraria alvo andando de costas.
      else if (machucado) estado = 'tratando';
      else if (alvo) estado = 'procurando';
      else estado = 'avancando';

      // Quem está trocando tiro não é distraído por barulho: ele já sabe
      // onde o inimigo está, e `bots.js` pula os avisos pra ele.
      bot.emContato = estado === 'combate';

      // Troca de arma: sem munição vai pra próxima que tenha; colado no
      // inimigo, a faca ganha da arma comprida.
      if (visto) {
        const distancia = Math.hypot(alvo.x - bot.x, alvo.z - bot.z);

        /**
         * A faca entra em dois casos, e o segundo é o que faltava.
         *
         * Colado no inimigo, a lâmina ganha da arma comprida — isso já
         * existia. O caso novo é ter SECADO: sem bala em lugar nenhum, ficar
         * apontando um cano vazio é o bot virar alvo parado. Com inimigo à
         * vista ele parte pra cima; é uma decisão ruim e é a única que
         * sobrou, que é exatamente o que ficar sem munição deveria custar.
         */
        const semNada = secou(bot.weapons);
        const querFaca = distancia < BRAIN.PERTO_DEMAIS
          || (semNada && temCorpoACorpo(bot.weapons));

        // Ele procura arma com o CARREGADOR cheio, não com reserva: trocar
        // serve pra atirar agora, e a recarga corre por fora em qualquer
        // estado. Aceitar reserva fazia ele ficar com a arma vazia na mão
        // esperando o próprio recarregamento.
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

        // Com aviso, ele olha PRA LÁ. Sem aviso, varre.
        //
        // Levar tiro sem ver ninguém continua sendo cego de propósito — é o
        // que dá a vantagem a quem atirou primeiro. Mas ouvir o tiro que
        // pegou o companheiro do lado é outra coisa: dali se sabe a direção,
        // e é isso que faz o pelotão inteiro virar pro mesmo lado em vez de
        // continuar andando de costas.
        if (temAviso) {
          bot.yaw = turnToward(bot.yaw,
            Math.atan2(bot.ameaca.x - bot.x, bot.ameaca.z - bot.z),
            AIM.GIRO_ALERTA * delta);
          return;
        }

        varredura += delta * AIM.GIRO * 0.55;
        bot.yaw = turnToward(bot.yaw, bot.yaw + Math.sin(varredura) * 1.2,
          AIM.GIRO * delta);
        return;
      }

      /**
       * Sem bala em lugar nenhum: ele volta pra buscar.
       *
       * O posto que o time DOMINA é o paiol. Isso fecha o círculo do modo:
       * perder postos deixa de ser só perder spawn, passa a ser perder
       * munição — e defender um ponto passa a valer por dois motivos.
       *
       * Ele vai pro posto dominado mais PERTO, não pra linha de frente:
       * quem está sem bala não avança, recua.
       */
      if (estado === 'reabastecendo') {
        bot.crouching = false;

        const paiol = paiolMaisPerto();
        if (!paiol) {
          // Sem posto nenhum do time no mapa: não há o que buscar. Ele segue
          // pra frente com a faca em vez de ficar parado esperando.
          estado = 'avancando';
        } else {
          const falta = Math.hypot(paiol.x - bot.x, paiol.z - bot.z);
          if (falta <= SUPRIMENTO.RAIO) {
            bot.speed = 0;
            reabastecer(bot.weapons, SUPRIMENTO.POR_SEGUNDO * delta);
            return;
          }
          bot.yaw = turnToward(bot.yaw,
            Math.atan2(paiol.x - bot.x, paiol.z - bot.z), AIM.GIRO * delta);
          andarPara(paiol.x, paiol.z, delta, 3.4);
          return;
        }
      }

      /**
       * Ferido: ele recua até a tenda e fica lá até estar bom.
       *
       * A enfermaria mais PERTO, não a da linha de frente: quem está sangrando
       * não avança. E ele fica de pé — deitado numa maca ele deixaria de ser
       * alvo de propósito, e a tenda não protege ninguém.
       */
      if (estado === 'tratando') {
        bot.crouching = false;

        const tenda = tendaMaisPerto();
        if (!tenda) {
          // Sem posto nem base do time com tenda: não há o que buscar.
          estado = 'avancando';
        } else {
          const falta = Math.hypot(tenda.x - bot.x, tenda.z - bot.z);
          if (falta <= TRATAMENTO.RAIO) {
            bot.speed = 0;
            // `hurtFor` é o que impede a lona de virar escudo: quem está
            // levando tiro dentro da tenda não é tratado.
            tratar(bot, TRATAMENTO.POR_SEGUNDO * delta, bot.hurtFor);
            return;
          }
          bot.yaw = turnToward(bot.yaw,
            Math.atan2(tenda.x - bot.x, tenda.z - bot.z), AIM.GIRO * delta);
          andarPara(tenda.x, tenda.z, delta, 3.4);
          return;
        }
      }

      if (estado === 'procurando') {
        bot.crouching = false;

        // Ele vai pro LADO da última posição conhecida, não em cima dela.
        //
        // Quem se cobriu está olhando pra linha por onde foi visto pela
        // última vez; chegar por ali é entregar-se. A abertura encolhe
        // conforme ele se aproxima — de longe o arco compensa, colado ele
        // vira só um desvio inútil.
        const dx = memoria.x - bot.x;
        const dz = memoria.z - bot.z;
        const distancia = Math.hypot(dx, dz) || 1;

        let destinoX = memoria.x;
        let destinoZ = memoria.z;
        if (distancia > BRAIN.FLANCO_ATE) {
          const abre = Math.min(BRAIN.FLANCO, distancia * 0.55) * desvio;
          destinoX += (-dz / distancia) * abre;
          destinoZ += (dx / distancia) * abre;
        }

        // O olhar continua na MEMÓRIA, não no ponto de flanqueio: ele anda
        // pro lado com a arma apontada pra onde o inimigo estava.
        bot.yaw = turnToward(bot.yaw, Math.atan2(dx, dz), AIM.GIRO * delta);
        andarPara(destinoX, destinoZ, delta, 2.6);
        if (distancia < BRAIN.CHEGOU) {
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

      /**
       * O lugar dele na formação do pelotão, quando ele não é o líder.
       *
       * Sem isto, os oito homens de um pelotão andam pro MESMO ponto — a
       * bandeira — e chegam empilhados, um por cima do outro. Com o slot,
       * eles chegam abertos em cunha, e o pelotão ocupa terreno em vez de
       * ocupar um metro quadrado.
       *
       * Perto do slot ele para de correr atrás dele: ficar perseguindo um
       * ponto que anda com o líder faz o soldado gingar sem sair do lugar.
       */
      let vaiPara = { x: destinoX, z: destinoZ };
      if (bot.emFormacao?.valendo) {
        const faltaSlot = Math.hypot(
          bot.emFormacao.x - bot.x, bot.emFormacao.z - bot.z);
        if (faltaSlot > BRAIN.CHEGOU) vaiPara = bot.emFormacao;
        else {
          bot.speed = 0;
          bot.yaw = turnToward(bot.yaw,
            Math.atan2(destinoX - bot.x, destinoZ - bot.z), AIM.GIRO * delta);
          return;
        }
      }

      const paraDestino = Math.atan2(vaiPara.x - bot.x, vaiPara.z - bot.z);
      bot.yaw = turnToward(bot.yaw, paraDestino, AIM.GIRO * delta);
      andarPara(vaiPara.x, vaiPara.z, delta, 2.9);
    }
  };
}
