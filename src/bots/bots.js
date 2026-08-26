import * as THREE from 'three';
import { createSoldier } from './soldier.js';
import { createBrain, BRAIN } from './brain.js';
import { MP40, PISTOL, KNIFE } from '../items/classes.js';
import { enemyOf } from '../game/teams.js';
import { corpoDe } from '../game/hitboxes.js';
import { createVizinhanca } from './vizinhanca.js';
import { createPelotoes } from './pelotao.js';
import { spawnIsClear } from '../player/collision.js';
import { PLAYER, BULLET, CAMERA } from '../config.js';

/**
 * Manda nos bots: cria, atualiza, e liga cada um ao resto do jogo.
 *
 * O bot atira pela MESMA balística do jogador — a bala dele viaja e pode
 * bater numa parede no meio do caminho. Sem isso, "levar tiro de bot" seria
 * um número descontando sozinho, e não haveria como se cobrir. Só a QUEDA é
 * dele: `BOT_GRAVITY` é zero, porque a mira dele já erra de propósito.
 *
 * E ele captura pelo MESMO `capture.update` — que já recebia quem está
 * agindo em vez de assumir o jogador, justamente pra isto.
 */

const olho = new THREE.Vector3();
const direcao = new THREE.Vector3();
const scratch = new THREE.Vector3();
const paraAmigo = new THREE.Vector3();

// Tempo caído antes de voltar. Curto o bastante pra que a frente não esvazie,
// longo o bastante pra que matar alguém signifique alguma coisa.
const RENASCE_APOS = 6;

/**
 * Nível de detalhe dos bots.
 *
 * Só os mais perto do jogador constroem o modelo da arma na mão — medido, ele
 * sozinho são 32 malhas contra 27 do corpo inteiro. Longe disso a arma tem
 * poucos pixels e o que se lê é a silhueta.
 *
 * São DOIS limites, e o segundo não é redundante: o raio sozinho falha quando
 * a briga se junta, porque cem bots podem estar dentro dos 45 m ao mesmo
 * tempo. O teto de contagem garante que o pior caso continue sendo o pior
 * caso conhecido.
 *
 * A escolha não roda todo quadro: ela custa uma distância por bot e o
 * resultado só muda quando alguém anda dezenas de metros.
 */
const DETALHE_RAIO = 45;
const DETALHE_MAX = 24;
const DETALHE_INTERVALO = 0.25;   // segundos entre reavaliações

/**
 * Com que frequência cada bot SONDA o campo, por distância do olho do jogador.
 *
 * Sondar é a parte cara: peneira a vizinhança, mede ângulo e dispara raycast
 * contra o mundo. Fazer isso sessenta vezes por segundo em trezentos bots é
 * pagar caro por um dado que não muda — um bot a duzentos metros não precisa
 * reavaliar quem ele vê a cada dezesseis milissegundos.
 *
 * Perto continua a 30 Hz porque é ali que o jogador percebe atraso: o duelo
 * medido a 25 m tem o primeiro tiro doendo em 1,2 s, e trinta e três
 * milissegundos a mais não se notam nisso. A 3 Hz um bot longe demora até um
 * terço de segundo pra reagir, e a essa distância isso é indistinguível do
 * tempo de reação que `aiming.js` já impõe de propósito.
 *
 * SEM olho — teste, bancada, antes do desembarque — todo mundo sonda todo
 * quadro. É o comportamento de antes, e é o que a suíte mede.
 */
/**
 * Anel em que um soldado nasce em volta do ponto, em metros.
 *
 * Começa em 8 pra não nascer em cima da bandeira, e vai a 34 porque são até
 * cento e cinquenta por lado repartidos entre os postos que o time domina.
 */
/**
 * Além disto o corpo do bot SAI da cena.
 *
 * Não é o mesmo que ficar invisível. O three já faz recorte por frustum
 * sozinho, e o plano distante da câmera é 400 m — nada além disso é
 * desenhado de qualquer jeito. Mas recorte não poupa TRAVESSIA: pra decidir
 * que um objeto está fora, ele precisa ser visitado e ter a matriz
 * atualizada, e um bot são vinte e cinco nós (a malha, dezenove ossos, o
 * grupo e as marcas de time). Medido com 300 bots: 8,42 ms por quadro só de
 * percorrer a cena e recortar, SEM desenhar um triângulo.
 *
 * Desanexado, ele não é visitado. Continua vivo, andando, atirando e sendo
 * atingido — o colisor e a hitbox não moram no grupo. É a diferença entre
 * "não renderizar" e "não existir", e aqui só o primeiro acontece.
 */
const RENDER_LONGE = CAMERA.FAR + 20;

/**
 * Separação: o empurrão que impede corpo dentro de corpo.
 *
 * A colisão já barra um bot de ENTRAR no outro, mas ela não os afasta quando
 * já estão encostados — e `step` deixa passar quem já está preso, senão eles
 * ficariam travados pra sempre. O resultado eram dois soldados andando
 * colados, ombro com ombro, ou um dentro do outro depois de nascerem juntos.
 *
 * É a força de separação de bando: cada um empurra pra longe de quem está
 * perto demais, com peso que cresce conforme encostam. Ela vem DEPOIS do
 * movimento e é fraca — corrigir o resíduo, não decidir pra onde ir.
 */
const SEPARA_RAIO = 1.6;
const SEPARA_FORCA = 2.2;   // m/s no encosto total

/**
 * Alerta: um tiro chama a atenção de quem está por perto.
 *
 * O soldado que leva tiro sem ver de onde já para e varre o horizonte. O que
 * faltava era o resto do pelotão reagir: numa briga de verdade, quem ouve o
 * companheiro do lado sendo alvejado não continua andando de costas.
 *
 * Isso é POR EVENTO, não por quadro. Varrer os trezentos procurando quem
 * ouviu seria o mesmo O(n²) de antes com outro nome: o disparo empurra um
 * aviso na fila, e uma consulta de raio na grade acha quem estava perto.
 */
const ALERTA_RAIO = 45;
const ALERTA_DURA = 6;      // segundos prestando atenção naquela direção

const NASCE_PERTO = 8;
const NASCE_LONGE = 34;

const SONDA = [
  { ate2: 60 * 60, intervalo: 1 / 30 },
  { ate2: 160 * 160, intervalo: 1 / 10 },
  { ate2: Infinity, intervalo: 1 / 3 }
];

// Meio-ângulo em que um companheiro na frente segura o tiro. Sem isto, nove
// bots amontoados num posto passam a partida atirando nas costas uns dos
// outros, e a briga parece quebrada mesmo estando correta.
const CONE_AMIGO = 0.16;

/** Arsenal próprio por bot: munição é objeto, e dois bots não podem dividi-la. */
function arsenal() {
  return [
    { ...MP40, ammo: { ...MP40.ammo } },
    { ...PISTOL, ammo: { ...PISTOL.ammo } },
    { ...KNIFE }
  ];
}

/**
 * O jogador visto como alvo, com o mesmo contrato do boneco.
 *
 * É isto que faz a bala de bot machucar de verdade: ela é testada contra ele
 * pela balística, como qualquer outro alvo.
 */
export function playerAsTarget(player, onDeath) {
  const centro = new THREE.Vector3();
  const olhar = new THREE.Vector3();
  return {
    name: 'jogador',
    team: player.team,
    radius: 0.5,
    collider: null,
    get alive() { return !player.spectating && player.health > 0; },
    get x() { return player.object.position.x; },
    get z() { return player.object.position.z; },
    center() {
      const p = player.object.position;
      return centro.set(p.x, player.feetY + player.height * 0.62, p.z);
    },

    /** Pra onde ele está virado. A facada pelas costas precisa saber. */
    get yaw() {
      player.object.getWorldDirection(olhar);
      return Math.atan2(-olhar.x, -olhar.z);
    },

    /**
     * O jogador tem as MESMAS regiões que o bot.
     *
     * Sem isso, o bot levaria um tiro na cabeça e o jogador não — e a
     * assimetria estaria escondida no código, que é o pior lugar pra ela.
     */
    body(saida) {
      return corpoDe(player.height, saida);
    },

    /** Onde os pés dele estão: a caixa é medida a partir daí. */
    get feetY() {
      return player.feetY;
    },
    // A lista de alvos do mundo chama update em todo mundo. O jogador se
    // atualiza sozinho no laço; aqui é só pra ele caber na lista.
    update() {},

    damage(amount, regiao = null) {
      const dano = amount * (regiao?.multiplicador ?? 1);
      const morreu = player.damage(dano);
      if (morreu) onDeath?.();
      return { target: this, amount: dano, killed: Boolean(morreu), regiao };
    }
  };
}

export function createBots(scene, world, { ballistics, capture, rng = Math.random }) {
  /**
   * Onde um time pode renascer: os postos que ele domina em paz, e a base
   * principal, que é sempre dele. A base entra sempre pra que perder todos os
   * postos não trave o time fora da partida.
   */
  const nascedouros = [];
  function pontoDeNascimento(team) {
    nascedouros.length = 0;
    for (const posto of capture.spawnsFor(team)) nascedouros.push(posto);
    for (const zona of world.spawnZones) {
      if (zona.base && zona.team === team) nascedouros.push(zona);
    }
    if (nascedouros.length === 0) return null;

    const escolha = nascedouros[Math.floor(rng() * nascedouros.length)];

    /**
     * Espalhado por ÁREA em volta do ponto, e conferindo que cabe.
     *
     * Os ±3 m de antes serviam pra nove bots. Com cento e cinquenta por lado
     * eles nascem uns dentro dos outros e passam o primeiro segundo se
     * empurrando pra fora — que é exatamente o "bot dentro de bot" que se
     * quer resolver. A raiz da uniforme espalha por área e não por raio,
     * senão amontoa no meio; e `spawnIsClear` recusa quem cairia dentro de
     * parede, que num ponto construído é metade do quadrado.
     */
    for (let tentativa = 0; tentativa < 14; tentativa++) {
      const angulo = rng() * Math.PI * 2;
      const raio = NASCE_PERTO + Math.sqrt(rng()) * (NASCE_LONGE - NASCE_PERTO);
      const x = escolha.x + Math.cos(angulo) * raio;
      const z = escolha.z + Math.sin(angulo) * raio;
      const chao = world.terrain.heightAt(x, z);
      if (spawnIsClear(world.colliders, x, z, chao, PLAYER.HEIGHT)) return { x, z };
    }
    return { x: escolha.x, z: escolha.z };
  }

  const soldiers = [];
  const brains = new Map();
  let alvos = [];

  // Reaproveitados entre quadros: a escolha do detalhe não pode alocar.
  const candidatos = [];
  let ateDetalhe = 0;

  /**
   * A grade de combatentes, refeita todo quadro.
   *
   * Ela existe pra que ninguém precise percorrer os trezentos: quem procura
   * inimigo pergunta o setor, e quem segura o tiro por causa de companheiro
   * pergunta o mesmo setor com o outro time.
   */
  const vizinhanca = createVizinhanca();
  const inimigosPerto = [];
  const amigosPerto = [];
  const vizinhos = [];

  // Quem anda com quem. O pelotão decide pra onde, e o bot ocupa um lugar.
  const pelotoes = createPelotoes(world);

  // Fila de avisos de tiro, drenada uma vez por quadro. Reaproveitada: alocar
  // um objeto por disparo seriam mil por segundo numa briga grande.
  const avisos = [];
  let quantosAvisos = 0;

  /** Alguém atirou ou levou tiro aqui. Quem estiver perto fica em alerta. */
  function avisar(x, z, team) {
    if (quantosAvisos >= avisos.length) avisos.push({ x: 0, z: 0, team: null });
    const aviso = avisos[quantosAvisos++];
    aviso.x = x;
    aviso.z = z;
    aviso.team = team;
  }

  function espalharAlertas() {
    for (let i = 0; i < quantosAvisos; i++) {
      const aviso = avisos[i];
      const perto = vizinhanca.porPerto(
        aviso.x, aviso.z, ALERTA_RAIO, aviso.team, vizinhos);

      for (const outro of perto) {
        if (!outro.alive || !outro.ameaca) continue;
        // Aviso mais NOVO ganha do mais velho, mas o que já está em contato
        // não é distraído: ele já sabe onde está o inimigo.
        if (outro.emContato) continue;
        outro.ameaca.x = aviso.x;
        outro.ameaca.z = aviso.z;
        outro.ameaca.ate = ALERTA_DURA;
      }
    }
    quantosAvisos = 0;
  }

  /** Empurrão pra fora de quem está perto demais. */
  function separar(bot, delta) {
    const perto = vizinhanca.porPerto(bot.x, bot.z, SEPARA_RAIO, null, vizinhos);
    let ex = 0;
    let ez = 0;

    for (const outro of perto) {
      if (outro === bot || !outro.alive) continue;
      const dx = bot.x - outro.x;
      const dz = bot.z - outro.z;
      const d2 = dx * dx + dz * dz;

      // Exatamente em cima: empurra pra um lado qualquer, senão a conta
      // divide por zero e os dois ficam grudados pra sempre.
      if (d2 < 1e-4) {
        ex += rng() - 0.5;
        ez += rng() - 0.5;
        continue;
      }
      const d = Math.sqrt(d2);
      const peso = (SEPARA_RAIO - d) / SEPARA_RAIO;
      ex += (dx / d) * peso;
      ez += (dz / d) * peso;
    }

    if (ex === 0 && ez === 0) return;
    const passo = SEPARA_FORCA * delta;
    bot.step(ex * passo, ez * passo);
  }

  /**
   * Quem fica com modelo de arma. Os mais perto do olho, até o teto.
   *
   * Sem `olho` — teste, bancada, ou antes do jogador desembarcar — todo mundo
   * fica detalhado, que é o comportamento de antes.
   */
  function escolherDetalhe(olhoDoJogador, delta) {
    ateDetalhe -= delta;
    if (ateDetalhe > 0) return;
    ateDetalhe = DETALHE_INTERVALO;

    if (!olhoDoJogador) {
      for (const bot of soldiers) {
        bot.detalhado = true;
        if (bot.group.parent !== scene) scene.add(bot.group);
      }
      return;
    }

    candidatos.length = 0;
    for (const bot of soldiers) {
      const dx = bot.x - olhoDoJogador.x;
      const dz = bot.z - olhoDoJogador.z;
      const d2 = dx * dx + dz * dz;
      bot.detalhado = false;

      // Fora do alcance da câmera, o corpo sai da árvore da cena.
      const naCena = bot.group.parent === scene;
      if (d2 > RENDER_LONGE * RENDER_LONGE) {
        if (naCena) scene.remove(bot.group);
        continue;
      }
      if (!naCena) scene.add(bot.group);

      // Distância ao QUADRADO: comparar é o que importa, e a raiz não muda
      // a ordem. São 300 por reavaliação.
      if (d2 <= DETALHE_RAIO * DETALHE_RAIO) candidatos.push({ bot, d2 });
    }

    candidatos.sort((a, b) => a.d2 - b.d2);
    const quantos = Math.min(candidatos.length, DETALHE_MAX);
    for (let i = 0; i < quantos; i++) candidatos[i].bot.detalhado = true;
  }

  // Reaproveitado a cada olhar: quem olha e quem é olhado não podem se
  // barrar. O bot tem colisor próprio, e sem pulá-lo o raio nasce dentro
  // dele e acusa parede em todo teste.
  const cegos = new Set();

  function temLinha(de, para, quemOlha, alvo) {
    cegos.clear();
    if (quemOlha?.collider) cegos.add(quemOlha.collider);
    if (alvo?.collider) cegos.add(alvo.collider);
    return !ballistics.blocked(de, para, cegos);
  }

  /**
   * Tem companheiro na linha de tiro?
   *
   * A bala não distingue farda, e é isso que faz um pelotão inteiro se abater
   * numa porta. Quem segura o tiro é quem atira, não a bala.
   */
  function amigoNaFrente(bot, distanciaDoAlvo) {
    bot.eye(olho);
    // Só quem está entre ele e o alvo pode estar na linha, e a grade já
    // devolve só esses. Percorrer os trezentos por TIRO era o mesmo O(n²) da
    // sondagem, escondido no lugar onde ninguém procura.
    const companheiros = vizinhanca.porPerto(
      bot.x, bot.z, distanciaDoAlvo, bot.team, amigosPerto);

    for (const outro of companheiros) {
      if (outro === bot || !outro.alive) continue;

      paraAmigo.copy(outro.center()).sub(olho);
      const distancia = paraAmigo.length();
      if (distancia > distanciaDoAlvo || distancia < 1e-3) continue;

      paraAmigo.divideScalar(distancia);
      if (paraAmigo.dot(direcao) > Math.cos(CONE_AMIGO)) return true;
    }
    return false;
  }

  /** O bot puxa o gatilho. A abertura sai da mira dele, não de mira perfeita. */
  function atirar(bot, alvo, aim, desvioDoCano, distancia) {
    const arma = bot.weapon;
    if (!arma?.firearm) return;

    bot.cooldown = Math.max(0, (bot.cooldown ?? 0) - bot.delta);
    if (bot.cooldown > 0) return;
    if (bot.swapping > 0) return;   // arma na metade do caminho
    if (!aim.canFire(desvioDoCano)) return;
    if (arma.ammo && arma.ammo.loaded <= 0) return;
    if (bot.reloading > 0) return;

    bot.eye(olho);
    direcao.copy(alvo.center()).sub(olho).normalize();
    if (amigoNaFrente(bot, distancia)) return;

    // Erro de mira: um cone em volta da direção certa. É o que separa "bot
    // difícil" de "bot impossível" — e ele nunca fecha de todo.
    const abertura = aim.spread(distancia, alvo.speed ?? 0);
    const angulo = rng() * Math.PI * 2;
    const raio = Math.sqrt(rng()) * abertura;
    scratch.set(Math.cos(angulo), Math.sin(angulo), 0)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), bot.yaw);
    direcao.addScaledVector(scratch, Math.tan(raio)).normalize();

    ballistics.spawn(olho, direcao, {
      damage: arma.firearm.damage,
      range: arma.firearm.range,
      dig: arma.firearm.dig ?? 0,
      som: arma.firearm.som ?? null,   // o bot é ouvido pelo mesmo funil
      tracer: false,  // sem risco: de onde vem o tiro é o que se descobre olhando
      gravity: BULLET.BOT_GRAVITY,  // a bala do bot vai reta
      shooter: bot.collider,  // a bala nasce dentro da caixa dele
      owner: bot              // e a esfera de acerto dele é logo abaixo
    });

    if (arma.ammo) arma.ammo.loaded--;
    bot.cooldown = arma.firearm.fireInterval;
    aim.shot();

    // O tiro faz barulho, e quem está perto do CANO ouve de onde veio. É o
    // que faz o pelotão inteiro reagir quando um deles é alvejado, em vez de
    // continuar andando de costas enquanto o companheiro cai.
    avisar(bot.x, bot.z, enemyOf(bot.team));
  }

  /**
   * Recarga do bot, correndo em qualquer estado.
   *
   * Fora daqui ela só andaria em combate, e o bot que se escondeu pra
   * recarregar ficaria escondido pra sempre — foi exatamente o que aconteceu:
   * ele gastava o carregador em cinco segundos e passava o resto da partida
   * agachado atrás de uma caixa.
   */
  function recarregar(bot, delta) {
    if (bot.reloading > 0) {
      bot.reloading -= delta;
      if (bot.reloading > 0) return;
      const arma = bot.weapon;
      if (arma?.ammo) {
        const quer = Math.min(arma.firearm.magazine - arma.ammo.loaded, arma.ammo.reserve);
        arma.ammo.loaded += quer;
        arma.ammo.reserve -= quer;
      }
      return;
    }

    const arma = bot.weapon;
    if (!arma?.firearm || !arma.ammo) return;
    if (arma.ammo.loaded > 0 || arma.ammo.reserve <= 0) return;
    bot.reloading = arma.firearm.reloadTime ?? 2.4;
  }

  /** O bot trabalha na bandeira, pelo mesmo caminho do jogador. */
  function capturar(bot, delta) {
    capture.update(delta, {
      x: bot.x, y: bot.feetY, z: bot.z, teamId: bot.team, agindo: true
    });
  }

  return {
    soldiers,

    /** Quem é alvo de quem. O jogador entra aqui como um alvo qualquer. */
    setTargets(lista) {
      alvos = lista;
    },

    /**
     * O exército inteiro de um time, antes de o jogador desembarcar.
     *
     * Eles nascem nos postos que o time JÁ DOMINA, repartidos entre eles —
     * nascer todos no mesmo ponto seria uma pilha de cento e cinquenta corpos
     * no mesmo quadrado. Sem posto nenhum sobra a base principal, que é
     * sempre do dono: é o que impede perder tudo e ficar sem entrar em campo.
     */
    formar({ team, quantos, id0 = 1 }) {
      for (let i = 0; i < quantos; i++) {
        const onde = pontoDeNascimento(team);
        if (!onde) break;
        this.spawn({ id: id0 + i, team, x: onde.x, z: onde.z });
      }
      return soldiers.length;
    },

    spawn({ id, team, x, z }) {
      const bot = createSoldier(scene, world.colliders, {
        id, team, x, z, terrain: world.terrain, weapons: arsenal()
      });
      bot.cooldown = 0;
      bot.delta = 0;
      bot.reloading = 0;

      // De onde veio o último barulho, e por quanto tempo ele ainda importa.
      // Objeto fixo por bot: um literal novo por aviso seriam milhares por
      // segundo numa briga grande.
      bot.ameaca = { x: 0, z: 0, ate: 0 };
      bot.emContato = false;
      bot.emFormacao = { x: 0, z: 0, valendo: false };

      soldiers.push(bot);
      pelotoes.alistar(bot);
      brains.set(bot, createBrain(bot, world, rng));
      return bot;
    },

    update(delta, olhoDoJogador = null) {
      escolherDetalhe(olhoDoJogador, delta);

      // A grade é refeita inteira: são trezentas inserções contra os 45 mil
      // pares que ela evita, e manter índice de coisa que anda toda hora
      // custa mais em remoção do que refazer.
      vizinhanca.limpar();
      for (const alvo of alvos) {
        if (alvo.alive) vizinhanca.inserir(alvo);
      }

      // Duas vezes por segundo: escolher objetivo e formação é decisão de
      // minutos, não de quadro.
      pelotoes.pensar(delta);

      // Os avisos do quadro anterior viram alerta agora, com a grade já
      // refeita — espalhar antes dela usaria posições de um quadro atrás.
      espalharAlertas();

      for (const bot of soldiers) {
        bot.delta = delta;

        if (!bot.alive) {
          bot.downFor += delta;
          if (bot.downFor >= RENASCE_APOS) {
            const onde = pontoDeNascimento(bot.team);
            if (onde) {
              // Arsenal NOVO: as armas dele viraram espólio no chão quando
              // caiu, e uma delas pode estar na mão do jogador. Reaproveitar
              // os mesmos objetos faria o carregador do jogador se encher
              // sozinho no quadro em que o bot renascesse.
              bot.weapons = arsenal();
              bot.respawn(onde.x, onde.z);
            }
          }
          bot.update(delta);
          continue;
        }

        recarregar(bot, delta);

        // Sondagem escalonada: o relógio é do bot, e o intervalo sai da
        // distância dele ao olho do jogador.
        let podeSentir = true;
        if (olhoDoJogador) {
          bot.ateSondar = (bot.ateSondar ?? 0) - delta;
          podeSentir = bot.ateSondar <= 0;
          if (podeSentir) {
            const dx = bot.x - olhoDoJogador.x;
            const dz = bot.z - olhoDoJogador.z;
            const d2 = dx * dx + dz * dz;
            const faixa = SONDA.find((f) => d2 <= f.ate2) ?? SONDA[SONDA.length - 1];
            // O sorteio espalha as sondagens pelos quadros: sem ele, os
            // trezentos bots caem no mesmo quadro e o custo que se queria
            // diluir vira um pico a cada trinta e três milissegundos.
            bot.ateSondar = faixa.intervalo * (0.75 + rng() * 0.5);
          }
        }

        // Só quem está no alcance de visão entra na conta. `alvos.filter`
        // alocava um array de 150 por bot por quadro — trezentas alocações
        // por quadro pra depois percorrer todas elas.
        const inimigos = podeSentir
          ? vizinhanca.porPerto(bot.x, bot.z, BRAIN.VISAO,
            enemyOf(bot.team), inimigosPerto)
          : inimigosPerto;

        if (bot.ameaca.ate > 0) bot.ameaca.ate -= delta;

        // O lugar dele na formação do pelotão, quando há um. O líder não tem
        // — o lugar dele é o objetivo.
        bot.emFormacao.valendo = Boolean(pelotoes.alvoDe(bot, bot.emFormacao));

        brains.get(bot).update(delta, {
          inimigos,
          temLinha: (de, para, alvo) => temLinha(de, para, bot, alvo),
          atirar,
          capturar,
          podeSentir
        });

        // A separação vem DEPOIS do cérebro: ela corrige o resíduo de onde o
        // movimento deixou o corpo, e não decide pra onde ir.
        separar(bot, delta);
        bot.update(delta);
      }
    },

    /** Quantos de cada lado estão de pé agora. Pro HUD e pra depuração. */
    aliveByTeam() {
      const contagem = {};
      for (const bot of soldiers) {
        if (!bot.alive) continue;
        contagem[bot.team] = (contagem[bot.team] ?? 0) + 1;
      }
      return contagem;
    },

    /** Os pelotões, pra depuração e pra teste. */
    pelotoes,

    /** Estado de um bot, pra depuração e pra teste. */
    stateOf(bot) {
      return brains.get(bot)?.state ?? null;
    },

    brainOf(bot) {
      return brains.get(bot) ?? null;
    }
  };
}
