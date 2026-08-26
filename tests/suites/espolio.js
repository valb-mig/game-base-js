import * as THREE from 'three';
import { createSoldier, SOLDIER } from '../../src/bots/soldier.js';
import { createSpoils, SPOILS } from '../../src/world/spoils.js';
import { initDrop } from '../../src/items/drop.js';
import { Player } from '../../src/player/player.js';
import { getClass, MP40, PISTOL, KNIFE } from '../../src/items/classes.js';
import { GRUPOS } from '../../src/game/hitboxes.js';
import { initInput } from '../../src/core/input.js';
import { suite, ok, eq, near, note } from '../assert.js';

const DT = 1 / 60;
const chao = { heightAt: () => 0, waterDepthAt: () => 0 };

/** Arsenal próprio, como o dos bots: munição é objeto, e ninguém divide. */
function arsenal() {
  return [
    { ...MP40, ammo: { ...MP40.ammo } },
    { ...PISTOL, ammo: { ...PISTOL.ammo } },
    { ...KNIFE }
  ];
}

function soldado(cena, colisores, x = 0, z = 0) {
  return createSoldier(cena, colisores, {
    id: 1, team: 'karnia', x, z, terrain: chao, weapons: arsenal()
  });
}

/**
 * Onde a cabeça do corpo está no mundo.
 *
 * Com o modelo do arquivo carregado o soldado tem OSSO, e a cabeça é o osso
 * `head` — o corpo cai por junta, e o grupo dele fica na origem enquanto
 * isso. Sem arquivo o corpo é uma caixa só, e a cabeça é o topo dela.
 */
function cabeca(bot, out) {
  bot.group.updateMatrixWorld(true);
  const osso = bot.group.getObjectByName('head');
  if (osso) return osso.getWorldPosition(out);
  return out.set(0, SOLDIER.ALTURA, 0).applyMatrix4(bot.group.matrixWorld);
}

/** Altura da cabeça de pé: o osso do modelo, ou o topo da caixa. */
function alturaDaCabeca(bot) {
  return cabeca(bot, new THREE.Vector3()).y;
}

export function run() {
  initInput();
  const cena = new THREE.Scene();
  const colisores = [];

  suite('o corpo tomba pra longe de quem atirou');

  const morto = soldado(cena, colisores);
  const alto = new THREE.Vector3();
  cabeca(morto, alto);
  near('de pé a cabeça está sobre os pés', Math.hypot(alto.x, alto.z), 0, 0.01);
  ok('e na altura de uma cabeça', alto.y > 1.4 && alto.y <= SOLDIER.ALTURA,
    `${alto.y.toFixed(2)} m`);
  const dePeAltura = alturaDaCabeca(morto);

  // Bala vindo do sul e indo pro norte: o corpo tem que cair pro norte.
  morto.damage(999, null, { dir: new THREE.Vector3(0, 0, -1) });
  ok('o tiro matou', !morto.alive);

  for (let i = 0; i < 180; i++) morto.update(DT);
  cabeca(morto, alto);
  ok('a cabeça saiu de cima dos pés', Math.hypot(alto.x, alto.z) > 0.3,
    `${Math.hypot(alto.x, alto.z).toFixed(2)} m`);
  ok('pro lado pra onde a bala ia', alto.z < -0.2, `z ${alto.z.toFixed(2)}`);
  ok('e no chão', alto.y < dePeAltura * 0.4, `${alto.y.toFixed(2)} m contra ${dePeAltura.toFixed(2)} de pé`);
  note('tombo', 'por junta quando há esqueleto, inteiriço quando não há');

  // O mesmo tiro do outro lado derruba pro outro lado. Sem isto o eixo estaria
  // certo por acaso, que é como o sinal de world/settling.js já passou errado.
  const outro = soldado(cena, colisores, 20, 0);
  outro.damage(999, null, { dir: new THREE.Vector3(1, 0, 0) });
  for (let i = 0; i < 180; i++) outro.update(DT);
  const alto2 = new THREE.Vector3();
  cabeca(outro, alto2);
  ok('bala vindo de oeste derruba pro leste', alto2.x - 20 > 0.2,
    `x ${(alto2.x - 20).toFixed(2)} do lugar onde caiu`);

  suite('quem continua de pé leva um solavanco');

  const vivo = soldado(cena, colisores, 100, 0);
  vivo.update(DT);

  if (!vivo.group.getObjectByName('neck')) {
    note('sem esqueleto', 'o corpo de caixas não tem osso pra solavancar');
  } else {
    const pescoco = vivo.group.getObjectByName('neck');
    const emRepouso = pescoco.quaternion.clone();

    // Tiro no capacete, vindo de frente: o pescoço é que torce.
    vivo.damage(10, GRUPOS.capacete, {
      dir: new THREE.Vector3(0, 0, -1),
      ponto: new THREE.Vector3(100, 1.6, 0.3)
    });
    ok('o tiro não matou', vivo.alive);
    eq('e o solavanco foi pro pescoço', vivo.solavanco.osso, 'neck');

    vivo.update(DT);
    ok('o osso saiu do repouso', pescoco.quaternion.angleTo(emRepouso) > 0.01,
      `${pescoco.quaternion.angleTo(emRepouso).toFixed(3)} rad`);

    // Ele VOLTA: solavanco que fica é pose nova, não reação.
    for (let i = 0; i < 40; i++) vivo.update(DT);
    eq('e ele passa', vivo.solavanco, null);
    near('devolvendo o osso ao lugar', pescoco.quaternion.angleTo(emRepouso), 0, 1e-6);

    // O LADO sai do ponto do acerto: tiro no braço direito não pode sacudir
    // o esquerdo.
    vivo.damage(10, GRUPOS.braco, {
      dir: new THREE.Vector3(0, 0, -1),
      ponto: new THREE.Vector3(100.3, 1.2, 0.2)
    });
    eq('tiro no braço direito sacode o ombro direito', vivo.solavanco.osso, 'shoulder_R');

    vivo.damage(10, GRUPOS.braco, {
      dir: new THREE.Vector3(0, 0, -1),
      ponto: new THREE.Vector3(99.7, 1.2, 0.2)
    });
    eq('e no esquerdo, o esquerdo', vivo.solavanco.osso, 'shoulder_L');

    vivo.damage(10, GRUPOS.perna, {
      dir: new THREE.Vector3(0, 0, -1),
      ponto: new THREE.Vector3(100.1, 0.5, 0)
    });
    eq('perna sacode a coxa', vivo.solavanco.osso, 'thigh_R');
    note('solavanco', 'visual: o corpo vivo é animado, o ragdoll só entra ao cair');
  }

  suite('o corpo fica na tela, e some no tempo');

  const parado = soldado(cena, colisores, 40, 0);
  parado.damage(999);
  parado.update(DT);
  ok('logo depois de cair ele continua visível', parado.group.visible);

  // downFor é contado por bots.js; aqui a bancada faz o mesmo papel.
  parado.downFor = SOLDIER.CORPO_TEMPO - 0.1;
  parado.update(DT);
  ok('um instante antes do prazo ainda está', parado.group.visible);
  parado.downFor = SOLDIER.CORPO_TEMPO + 0.1;
  parado.update(DT);
  ok('passado o prazo ele some', !parado.group.visible);
  note('corpo na tela', `${SOLDIER.CORPO_TEMPO}s`);

  parado.respawn(41, 0);
  parado.update(DT);
  ok('renascer devolve o corpo em pé', parado.group.visible);
  const dePe = new THREE.Vector3();
  cabeca(parado, dePe);
  near('sem o tombo pendurado', Math.hypot(dePe.x - 41, dePe.z), 0, 0.05);
  ok('e de pé de novo', dePe.y > 1.4, `cabeça em ${dePe.y.toFixed(2)} m`);

  suite('a mochila dele cai com o que ele carregava');

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  const player = new Player(camera, document.body, {
    colliders: colisores, terrain: chao, spawn: new THREE.Vector3(0, 0, 0)
  });
  player.setClass(getClass('assault'));
  const viewmodel = { setItem: () => {} };
  const drops = initDrop(cena, player, viewmodel, { terrain: chao });
  const spoils = createSpoils(cena, drops, { terrain: chao });

  const caido = soldado(cena, colisores, 60, 0);
  caido.damage(999);
  const pilha = spoils.soltar(caido);

  ok('a mochila entra na cena', cena.children.includes(pilha.mochila));
  // Três armas mais a CAIXA DE MUNIÇÃO. Ela é o que faz matar render bala:
  // as armas do morto caem com o que sobrou no carregador delas, e isso é
  // pouco e é do calibre errado se o jogador carrega outra coisa.
  eq('e o arsenal dele vira item de mundo, mais a caixa', drops.items.length, 4);
  ok('uma delas é a caixa de munição',
    drops.items.some((e) => e.item.suprimento > 0));
  ok('perto de onde ele caiu', drops.items.every(
    (e) => Math.hypot(e.mesh.position.x - 60, e.mesh.position.z) < 1.5));

  // Munição gasta continua gasta: apanhar a arma de quem morreu tem que valer
  // o que sobrou nela, senão o espólio é melhor que a própria arma.
  const doMorto = drops.items.find((e) => e.item.id === 'mp40');
  eq('com a munição que sobrou no carregador',
    doMorto.item.ammo.loaded, caido.weapons[0].ammo.loaded);

  suite('espólio some junto com o corpo');

  for (let i = 0; i < Math.ceil((SPOILS.DURACAO - 0.5) / DT); i++) {
    drops.update(DT);
    spoils.update(DT);
  }
  eq('meio segundo antes do prazo ele ainda está lá', drops.items.length, 4);

  for (let i = 0; i < Math.ceil(1 / DT); i++) {
    drops.update(DT);
    spoils.update(DT);
  }
  eq('passado o prazo, nada fica no chão', drops.items.length, 0);
  ok('e a mochila sai da cena', !cena.children.includes(pilha.mochila));
  eq('sem pilha pendurada', spoils.pilhas.length, 0);
  note('espólio no chão', `${SPOILS.DURACAO}s`);

  suite('o que o jogador apanhou é dele, e não some da mão');

  const segundo = soldado(cena, colisores, 80, 0);
  segundo.damage(999);
  spoils.soltar(segundo);
  for (let i = 0; i < 60; i++) drops.update(DT);

  // Larga a primária pra ter o slot livre, e apanha a do morto.
  player.forceSlot(0);
  drops.dropEquipped();
  player.object.position.set(80, 1.6, 0);
  for (let i = 0; i < 60; i++) drops.update(DT);

  const apanhado = drops.pickUp();
  ok('ele apanha uma arma do morto', !!apanhado, apanhado?.name ?? 'nada');

  for (let i = 0; i < Math.ceil((SPOILS.DURACAO + 1) / DT); i++) {
    drops.update(DT);
    spoils.update(DT);
  }
  ok('e ela continua na mão depois de o espólio expirar',
    player.carried.includes(apanhado));
  eq('o resto do espólio sumiu', spoils.pilhas.length, 0);
}
