import * as THREE from 'three';
import { createSoldier } from './soldier.js';
import { createBrain } from './brain.js';
import { MP40, PISTOL, KNIFE } from '../items/classes.js';
import { enemyOf } from '../game/teams.js';

/**
 * Manda nos bots: cria, atualiza, e liga cada um ao resto do jogo.
 *
 * O bot atira pela MESMA balística do jogador — a bala dele viaja, cai e
 * pode bater numa parede no meio do caminho. Sem isso, "levar tiro de bot"
 * seria um número descontando sozinho, e não haveria como se cobrir.
 *
 * E ele captura pelo MESMO `capture.update` — que já recebia quem está
 * agindo em vez de assumir o jogador, justamente pra isto.
 */

const olho = new THREE.Vector3();
const direcao = new THREE.Vector3();
const scratch = new THREE.Vector3();

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
    // A lista de alvos do mundo chama update em todo mundo. O jogador se
    // atualiza sozinho no laço; aqui é só pra ele caber na lista.
    update() {},

    damage(amount) {
      const morreu = player.damage(amount);
      if (morreu) onDeath?.();
      return { target: this, amount, killed: Boolean(morreu) };
    }
  };
}

export function createBots(scene, world, { ballistics, capture, rng = Math.random }) {
  const soldiers = [];
  const brains = new Map();
  let alvos = [];

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

  /** O bot puxa o gatilho. A abertura sai da mira dele, não de mira perfeita. */
  function atirar(bot, alvo, aim, desvioDoCano, distancia) {
    const arma = bot.weapon;
    if (!arma?.firearm) return;

    bot.cooldown = Math.max(0, (bot.cooldown ?? 0) - bot.delta);
    if (bot.cooldown > 0) return;
    if (!aim.canFire(desvioDoCano)) return;
    if (arma.ammo && arma.ammo.loaded <= 0) return;
    if (bot.reloading > 0) return;

    bot.eye(olho);
    direcao.copy(alvo.center()).sub(olho).normalize();

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
      tracer: true,   // o traçante do bot é aviso: dá pra saber de onde vem
      shooter: bot.collider,  // a bala nasce dentro da caixa dele
      owner: bot              // e a esfera de acerto dele é logo abaixo
    });

    if (arma.ammo) arma.ammo.loaded--;
    bot.cooldown = arma.firearm.fireInterval;
    aim.shot();
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

    spawn({ id, team, x, z }) {
      const bot = createSoldier(scene, world.colliders, {
        id, team, x, z, terrain: world.terrain, weapons: arsenal()
      });
      bot.cooldown = 0;
      bot.delta = 0;
      bot.reloading = 0;
      soldiers.push(bot);
      brains.set(bot, createBrain(bot, world, rng));
      return bot;
    },

    update(delta) {
      for (const bot of soldiers) {
        bot.delta = delta;

        if (!bot.alive) {
          bot.downFor += delta;
          bot.update(delta);
          continue;
        }

        recarregar(bot, delta);

        const inimigo = enemyOf(bot.team);
        const inimigos = alvos.filter((a) => a.team === inimigo);

        brains.get(bot).update(delta, {
          inimigos,
          temLinha: (de, para, alvo) => temLinha(de, para, bot, alvo),
          atirar,
          capturar
        });
        bot.update(delta);
      }
    },

    /** Estado de um bot, pra depuração e pra teste. */
    stateOf(bot) {
      return brains.get(bot)?.state ?? null;
    },

    brainOf(bot) {
      return brains.get(bot) ?? null;
    }
  };
}
