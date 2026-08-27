import * as THREE from 'three';
import { Player } from '../../src/player/player.js';
import { Viewmodel } from '../../src/items/viewmodel.js';
import { initDrop } from '../../src/items/drop.js';
import { initInput, endFrame, consumePress } from '../../src/core/input.js';
import { WORLD, DROP, PLAYER } from '../../src/config.js';
import { initPrompt } from '../../src/ui/prompt.js';
import { KNIFE, PISTOL, getClass } from '../../src/items/classes.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;

/** Planalto seco a 5 m, mergulhando no mar a partir de z = 30. */
const relevo = {
  heightAt: (x, z) => (z < 30 ? 5 : 5 - (z - 30) * 0.6),
  waterDepthAt: (x, z) => Math.max(0, WORLD.WATER_LEVEL - relevo.heightAt(x, z)),
  nivelDaAguaAt: () => WORLD.WATER_LEVEL
};

/**
 * Põe o item na mão e ESPERA a troca terminar.
 *
 * Trocar de item leva tempo desde que guardar e sacar viraram animação: ler
 * `equipped` no mesmo quadro do `selectSlot` lê o item ANTIGO, porque a troca
 * acontece no fundo do movimento.
 */
function empunhar(player, indice) {
  player.selectSlot(indice);
  for (let i = 0; i < 600 && player.swapping; i++) player.advanceSwap(1 / 60);
  return player.equipped;
}

export async function run() {
  initInput();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  const scene = new THREE.Scene();

  const caixa = {
    box: new THREE.Box3(new THREE.Vector3(4, 5, -1), new THREE.Vector3(6, 6, 1)),
    standable: true
  };

  const player = new Player(camera, document.body, {
    colliders: [caixa],
    terrain: relevo,
    spawn: new THREE.Vector3(0, 0, 0)
  });
  // a Assault nasce com a pistola; este suite exercita a faca
  empunhar(player, player.carried.indexOf(KNIFE));
  const viewmodel = new Viewmodel(camera, 1);
  viewmodel.setItem(player.equipped);
  const drops = initDrop(scene, player, viewmodel, { terrain: relevo });

  const press = (code) => {
    dispatchEvent(new KeyboardEvent('keydown', { code }));
    dispatchEvent(new KeyboardEvent('keyup', { code }));
  };
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) { drops.update(DT); endFrame(); }
  };

  suite('largar com G');

  eq('começa com a faca na mão', player.equipped?.id, KNIFE.id);
  ok('e ela aparece no viewmodel', viewmodel.item !== null);

  player.controls.isLocked = true;   // G só vale com o jogo travado no mouse
  press('KeyG');
  step(1);

  // Slot tem lugar fixo: largar esvazia o slot e deixa a mão vazia, sem
  // promover o item de outro slot pra tecla que o jogador não apertou.
  eq('largar esvazia a mão', player.equipped, null);
  eq('e o slot da faca fica vazio', player.carried[2], null);
  eq('a pistola continua no slot dela', player.carried[1]?.id, 'm1911');

  empunhar(player, 1);
  eq('a tecla 2 volta pra pistola', player.equipped?.id, 'm1911');
  ok('a faca saiu do inventário', !player.carried.includes(KNIFE));
  eq('a faca virou objeto do mundo', drops.items.length, 1);
  ok('e entrou na cena', scene.children.includes(drops.items[0].mesh));

  const faca = drops.items[0];
  eq('o objeto sabe qual item é', faca.item.id, KNIFE.id);
  ok('nasce à frente do rosto, não dentro dele',
    faca.mesh.position.distanceTo(camera.position) > 0.3);

  // largar o último item deixa todos os slots vazios
  press('KeyG'); step(1);
  eq('largar o último deixa a mão vazia', player.equipped, null);
  eq('e os dois slots largados ficam vazios',
    [player.carried[1], player.carried[2]].filter(Boolean).length, 0);
  player.carried = [KNIFE, drops.items[0].item];
  empunhar(player, 0);
  drops.items.length = 1;

  suite('queda e repouso');

  eq('cai antes de assentar', faca.resting, false);
  step(240);
  eq('acaba parada', faca.resting, true);
  near('assenta na altura do terreno',
    faca.mesh.position.y, relevo.heightAt(faca.mesh.position.x, faca.mesh.position.z), 0.02);
  near('deita sobre a face da lâmina', faca.mesh.rotation.x, Math.PI / 2, 0.02);

  // Largar e não conseguir apanhar de volta sem andar é armadilha: o alcance
  // tem que cobrir onde o item cai, senão soltar vira decisão irreversível.
  const distancia = faca.mesh.position.distanceTo(player.object.position);
  ok('cai dentro do alcance de quem largou', distancia < DROP.PICK_REACH,
    `${distancia.toFixed(2)} m contra alcance de ${DROP.PICK_REACH} m`);

  suite('largar em cima de coisa e na água');

  // de pé encostado na caixa, olhando pra ela
  player.equipped = KNIFE;
  player.object.position.set(3.2, 6.7, 0);
  player.eyeY = 6.7;
  camera.quaternion.setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0, 'YXZ'));
  player.velocity.set(0, 0, 0);
  press('KeyG'); step(200);

  const naCaixa = drops.items[1];
  near('pousa em cima da caixa, não atravessa', naCaixa.mesh.position.y, 6, 0.02);

  // água funda: em z=60 o fundo está a -13 m, dá pra ver a descida acontecer
  player.equipped = KNIFE;
  player.object.position.set(0, 1, 60);
  player.eyeY = 1;
  camera.quaternion.setFromEuler(new THREE.Euler(0, 0, 0, 'YXZ'));
  press('KeyG');
  step(120);   // tempo pra estabilizar na velocidade terminal

  const naAgua = drops.items[2];
  eq('ainda está descendo, não assentou', naAgua.resting, false);
  near('estabiliza na velocidade terminal da água',
    naAgua.velocity.y, -DROP.WATER_SINK, 0.05);
  ok('o que é muito mais lento que queda livre',
    Math.abs(naAgua.velocity.y) < DROP.GRAVITY * 0.2,
    `${naAgua.velocity.y.toFixed(2)} m/s`);

  const alturaAntes = naAgua.mesh.position.y;
  step(60);
  near('percorre a velocidade terminal em um segundo',
    alturaAntes - naAgua.mesh.position.y, DROP.WATER_SINK, 0.05);
  step(900);
  eq('mas chega ao fundo', naAgua.resting, true);
  near('e para no fundo do mar',
    naAgua.mesh.position.y,
    relevo.heightAt(naAgua.mesh.position.x, naAgua.mesh.position.z), 0.05);

  suite('apanhar com E');

  // aviso de ação precisa do elemento no DOM
  const aviso = document.createElement('div');
  aviso.id = 'prompt';
  aviso.style.display = 'none';
  document.body.appendChild(aviso);
  const updatePrompt = initPrompt(drops);

  // a primeira faca ficou no planalto; volta pra perto dela
  const alvo = drops.items[0];
  player.object.position.set(alvo.mesh.position.x, 6.7, alvo.mesh.position.z + 1);
  player.eyeY = 6.7;
  player.carried.fill(null);
  player.equipped = null;
  viewmodel.setItem(null);

  updatePrompt();
  ok('com item ao alcance, o aviso aparece', aviso.classList.contains('visible'));
  ok('e diz qual item é', aviso.textContent.includes(KNIFE.name), aviso.textContent.trim());

  const antesDeApanhar = drops.items.length;
  press('KeyE'); step(1);

  eq('E põe o item na mão', player.equipped?.id, KNIFE.id);
  ok('e no viewmodel', viewmodel.item !== null);
  eq('e ele sai do chão', drops.items.length, antesDeApanhar - 1);
  ok('a malha sai da cena', !scene.children.includes(alvo.mesh));

  updatePrompt();
  ok('com o slot da faca ocupado, o aviso some',
    !aviso.classList.contains('visible'));

  // O que trava não é a mão cheia, é o slot: a outra faca no chão não tem
  // pra onde ir, então ela fica lá em vez de empurrar a que está na mão.
  const restante = drops.items.length;
  press('KeyE'); step(1);
  eq('E não apanha item de slot ocupado', drops.items.length, restante);

  suite('alcance');

  player.carried.fill(null);
  player.equipped = null;
  viewmodel.setItem(null);
  const longe = drops.items[0];
  player.object.position.set(
    longe.mesh.position.x, player.eyeY, longe.mesh.position.z + DROP.PICK_REACH + 3);

  updatePrompt();
  ok('longe demais não mostra aviso', !aviso.classList.contains('visible'));
  press('KeyE'); step(1);
  eq('e E não alcança', player.equipped, null);

  player.object.position.z = longe.mesh.position.z + DROP.PICK_REACH * 0.4;
  press('KeyE'); step(1);
  eq('dentro do alcance, apanha', player.equipped?.id, KNIFE.id);

  suite('largar tudo e apanhar de volta');

  // Bug relatado: largando um item e ficando com outro na mão, o do chão nunca
  // mais voltava; largando todos, só um voltava. Quem decide é o SLOT: se o
  // lugar dele está livre, apanhar tem que funcionar, com o que for na mão.
  for (const entity of drops.items.splice(0)) scene.remove(entity.mesh);
  player.setClass(getClass('assault'));
  player.object.position.set(0, player.eyeY, 0);
  viewmodel.setItem(player.equipped);

  const largar = (slot) => {
    empunhar(player, slot);
    viewmodel.setItem(player.equipped);
    press('KeyG');
    step(60);   // um segundo: tempo de cair de 1,7 m e assentar
  };
  const apanhar = () => { press('KeyE'); step(1); return player.equipped; };

  const slotDaPistola = player.carried.indexOf(PISTOL);
  const slotDaFaca = player.carried.indexOf(KNIFE);

  largar(slotDaPistola);
  eq('a pistola foi pro chão', drops.items.length, 1);
  eq('e é a pistola mesmo', drops.items[0]?.item?.id, PISTOL.id);
  empunhar(player, slotDaFaca);
  viewmodel.setItem(player.equipped);
  eq('e a faca está na mão', player.equipped?.id, KNIFE.id);

  note('item no chão, jogador de pé', (() => {
    const chao = drops.items[0].mesh.position;
    const olho = player.object.position;
    return `${Math.hypot(chao.x - olho.x, chao.z - olho.z).toFixed(2)} m no plano · ` +
      `${chao.distanceTo(olho).toFixed(2)} m em 3D · alcance ${DROP.PICK_REACH} m`;
  })());

  updatePrompt();
  ok('com a faca na mão, o aviso ainda oferece a pistola',
    aviso.classList.contains('visible'), aviso.textContent.trim());
  eq('e E apanha a pistola de volta', apanhar()?.id, PISTOL.id);
  eq('o chão fica limpo', drops.items.length, 0);

  // agora tudo no chão de uma vez
  const tudo = player.carried.filter(Boolean).length;
  for (let slot = 0; slot < player.carried.length; slot++) {
    if (player.carried[slot]) largar(slot);
  }
  eq('todos os itens no chão', drops.items.length, tudo);
  eq('e nenhum na mão', player.carried.filter(Boolean).length, 0);

  const recuperados = new Set();
  for (let i = 0; i < tudo; i++) {
    const item = apanhar();
    if (item) recuperados.add(item.id);
  }
  eq('todos voltam pro cinto', recuperados.size, tudo);
  eq('e o chão fica limpo', drops.items.length, 0);

  // O slot é o limite: com o lugar ocupado, o item fica onde está em vez de
  // sumir ou empurrar o que estava na mão.
  largar(slotDaFaca);
  const outraFaca = { ...KNIFE };
  player.carried[slotDaFaca] = outraFaca;
  updatePrompt();
  ok('slot ocupado não anuncia apanhar', !aviso.classList.contains('visible'));
  const noChao = drops.items.length;
  press('KeyE'); step(1);
  eq('e E não apanha nada', drops.items.length, noChao);
  eq('nem troca o que estava no slot', player.carried[slotDaFaca], outraFaca);

  suite('largar andando joga longe, e ainda dá pra buscar');

  // O item herda o embalo de quem largou, então largar correndo joga ele pra
  // frente. Isso é físico e fica — o que não pode é o item ficar inalcançável
  // pra sempre, que é a diferença entre "joguei longe" e "o jogo comeu".
  for (const entity of drops.items.splice(0)) scene.remove(entity.mesh);
  player.setClass(getClass('assault'));
  player.object.position.set(0, player.eyeY, 0);
  viewmodel.setItem(player.equipped);
  player.velocity.set(0, 0, -PLAYER.RUN_SPEED);   // correndo pro -Z

  press('KeyG');
  step(60);
  player.velocity.set(0, 0, 0);

  const jogado = drops.items[0];
  const longeDemais = Math.hypot(
    jogado.mesh.position.x, jogado.mesh.position.z);
  ok('largado correndo, o item vai pra longe', longeDemais > DROP.PICK_REACH,
    `${longeDemais.toFixed(1)} m`);
  eq('e de onde se largou não alcança', drops.reachable(), null);

  // andar até ele: a mesma distância a pé
  player.object.position.z = jogado.mesh.position.z + DROP.PICK_REACH * 0.5;
  ok('chegando perto, ele volta a ser alcançável', drops.reachable() === jogado);
  press('KeyE'); step(1);
  eq('e E apanha', player.equipped?.id, jogado.item.id);
  note('largado correndo', `${longeDemais.toFixed(1)} m à frente`);

  aviso.remove();

  suite('cinto no HUD');

  // O HUD não anuncia arma que o jogo não tem: a Assault tem três slots e só
  // dois com item construído, então saem duas linhas — e a tecla de cada uma é
  // a posição do slot, não a ordem em que sobraram.
  const { initStatus } = await import('../../src/ui/status.js');
  const holder = document.createElement('div');
  holder.style.display = 'none';
  holder.innerHTML = '<div id="vitals"></div><div id="equipped"></div>';
  document.body.appendChild(holder);

  const comCinto = new Player(camera, document.body, { colliders: [], terrain: relevo });
  const atualizarHud = initStatus(comCinto);
  atualizarHud();

  const linhas = () => [...document.querySelectorAll('#equipped .slot')];
  const tecla = (i) => linhas()[i].querySelector('.slot-key').textContent;

  eq('uma linha por item que existe, e nenhuma a mais',
    linhas().length, comCinto.carried.filter(Boolean).length);
  ok('a primária existe e vira a primeira linha', comCinto.carried[0]?.id === 'mp40');
  eq('a tecla da primária é a 1', tecla(0), '1');
  eq('a da pistola é a 2', tecla(1), '2');
  eq('e a da faca é a 3', tecla(2), '3');
  ok('a linha do item na mão está marcada', linhas()[0].classList.contains('active'));
  ok('arma de fogo mostra munição',
    linhas()[0].querySelector('.slot-ammo b').textContent !== '');
  eq('a faca não mostra número',
    linhas()[2].querySelector('.slot-ammo b').textContent, '');

  // A regra continua sendo "uma linha por item que existe", e não "uma por
  // tecla": esvaziar um slot tem que tirar a linha dele.
  comCinto.carried[0] = null;
  atualizarHud();
  eq('slot esvaziado perde a linha', linhas().length, 3);
  eq('e a numeração continua sendo a do slot, não a da lista', tecla(0), '2');
  comCinto.setClass(getClass('assault'));
  atualizarHud();

  // Regressão: o sentinela do HUD era `null`, igual ao valor de mão vazia, e
  // o primeiro quadro sem item não desenhava nada.
  comCinto.carried.fill(null);
  comCinto.equipped = null;
  atualizarHud();
  eq('sem nenhum item, o cinto some', linhas().length, 0);
  holder.remove();

  player.carried.fill(null);
  player.equipped = null;
  const antes = drops.items.length;
  press('KeyG'); step(1);
  eq('G de mão vazia não larga nada', drops.items.length, antes);

  player.respawn();
  eq('renascer devolve o equipamento da classe', player.equipped?.id, 'mp40');
  ok('inclusive a faca', player.carried.includes(KNIFE));
  eq('mas o que caiu continua no chão', drops.items.length, antes);

  suite('o E não é engolido quando não há nada pra apanhar');

  /**
   * O E é DISPUTADO: quem está ao lado de um veículo quer entrar nele, e quem
   * está sobre um item quer apanhá-lo. `pickUp` já devolvia null sem nada por
   * perto, mas a tecla ia embora de todo jeito — e como `drops` roda antes dos
   * veículos no laço, apertar E ao lado do jipe não fazia absolutamente nada.
   *
   * Medido no jogo, não aqui: a suíte de veículo passava inteira porque ela
   * chamava `embarcar()` por código. Teste que não começa na TECLA não prova
   * que a tecla funciona.
   */
  player.object.position.set(400, 2, 400);   // longe de qualquer item largado
  eq('nada ao alcance', drops.reachable(), null);
  dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
  drops.update(DT);
  ok('o E sobrevive pra quem tem o que fazer com ele', consumePress('KeyE'));
  endFrame();
  dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));

  player.controls.isLocked = false;
}
