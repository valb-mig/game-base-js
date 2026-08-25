import * as THREE from 'three';
import { buildTrainingWorld, ALCANCES, ARSENAL } from '../../src/world/training-world.js';
import { Player } from '../../src/player/player.js';
import { initFirearm } from '../../src/items/firearm.js';
import { createBallistics } from '../../src/items/ballistics.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { getClass, PISTOL } from '../../src/items/classes.js';
import { hasModel } from '../../src/items/models.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;

function empunhar(player, indice) {
  player.selectSlot(indice);
  for (let i = 0; i < 600 && player.swapping; i++) player.advanceSwap(1 / 60);
  return player.equipped;
}

export function run() {
  initInput();

  suite('o campo de treinamento é outro mapa');

  const cena = new THREE.Scene();
  const mundo = buildTrainingWorld(cena);

  eq('ele se declara treino', mundo.modo, 'treino');

  // Sem times, sem pontos, sem partida: o painel de objetivo some por isso.
  eq('não tem ponto de captura nenhum', mundo.outposts.length, 0);
  eq('nem bases', mundo.bases.length, 0);

  // Plano de propósito: treinar distância num terreno que sobe e desce mede a
  // ladeira junto com a arma.
  let maiorDesnivel = 0;
  for (let x = -80; x <= 80; x += 8) {
    for (let z = -120; z <= 160; z += 8) {
      const h = mundo.terrain.heightAt(x, z);
      maiorDesnivel = Math.max(maiorDesnivel, Math.abs(h - mundo.terrain.heightAt(0, 60)));
    }
  }
  ok('e o chão é plano onde se atira', maiorDesnivel < 2,
    `${maiorDesnivel.toFixed(2)} m de desnível`);

  suite('alvos a distâncias que valem como medida');

  const marcados = mundo.targets.filter((alvo) => alvo.metros);
  eq('um alvo por distância declarada', marcados.length, ALCANCES.length);

  const doTiro = mundo.spawn;
  for (const alvo of marcados) {
    const centro = alvo.center();
    const real = Math.hypot(centro.x - doTiro.x, centro.z - doTiro.z);
    // A distância tem que ser a que o marco diz, senão "errei a 90 m" não é
    // um dado — é uma impressão.
    // Tolerância curta de propósito: a placa é uma medida, não um enfeite.
    near(`o alvo de ${alvo.metros} m está a ${alvo.metros} m`, real, alvo.metros, 3,
      `${real.toFixed(1)} m`);
  }
  note('linha de tiro', ALCANCES.join(' · ') + ' metros');

  suite('todo o arsenal do jogo está lá');

  ok('e é tudo que tem modelo', ARSENAL.every(hasModel));
  ok('inclusive a primária', ARSENAL.some((i) => i.id === 'mp40'));
  ok('a secundária', ARSENAL.some((i) => i.id === 'm1911'));
  ok('o corpo a corpo', ARSENAL.some((i) => i.id === 'kabar'));
  ok('e a ferramenta', ARSENAL.some((i) => i.id === 'm1943'));

  suite('munição infinita, mas recarregar continua existindo');

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  const player = new Player(camera, document.body,
    { colliders: [], terrain: mundo.terrain, spawn: new THREE.Vector3(0, 0, 0) });
  player.setClass(getClass('assault'));
  player.respawn();
  player.controls.isLocked = true;
  player.infiniteAmmo = true;

  const balistica = createBallistics(cena, []);
  const arma = initFirearm(player, { targets: [] }, balistica);
  empunhar(player, player.carried.indexOf(PISTOL));

  // Reserva posta à mão: `ammo` é objeto de módulo, compartilhado entre as
  // suítes, e ela já chega aqui gasta por quem rodou antes.
  const municao = player.equipped.ammo;
  const reservaInicial = 21;
  municao.reserve = reservaInicial;
  municao.loaded = 2;

  const clicar = () => {
    dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
  };
  const passo = (n = 1) => {
    for (let i = 0; i < n; i++) { arma.update(DT); endFrame(); }
  };

  clicar(); passo(1);
  eq('atirar gasta do carregador', municao.loaded, 1);

  // Espera o respiro da arma antes do próximo clique: clique dentro do
  // intervalo de tiro é consumido sem virar bala, e o teste mediria isso em
  // vez da munição.
  passo(Math.ceil(player.equipped.firearm.fireInterval / DT) + 2);
  clicar(); passo(2);
  eq('e o carregador chega a zero', municao.loaded, 0);

  // O carregador ACABA. Munição infinita que dispensa recarregar treinaria
  // uma arma que o jogo não tem — o respiro entre carregadores é parte da
  // cadência.
  //
  // A recarga automática mora no clique com o carregador vazio, então ela
  // precisa de mais um: puxar o gatilho no vazio é o que a dispara.
  passo(Math.ceil(player.equipped.firearm.fireInterval / DT) + 2);
  clicar(); passo(2);
  ok('mesmo com reserva infinita, ele entra em recarga', player.gun.reloading > 0,
    `${player.gun.reloading.toFixed(2)}s`);

  const segundos = player.equipped.firearm.reloadTime;
  passo(Math.ceil(segundos / DT) + 2);
  // Sete, não oito: a oitava é a da câmara, e recarregando do VAZIO não
  // sobrou nenhuma pra ficar lá. Munição infinita não muda isso.
  eq('e o carregador volta cheio', municao.loaded,
    player.equipped.firearm.magazine);
  eq('sem tirar nada da reserva', municao.reserve, reservaInicial);

  // E fora do treino a reserva desce como sempre.
  player.infiniteAmmo = false;
  municao.loaded = 0;
  clicar(); passo(2);
  passo(Math.ceil(segundos / DT) + 2);
  ok('sem treino, recarregar custa reserva', municao.reserve < reservaInicial,
    `${municao.reserve} de ${reservaInicial}`);

  suite('o mapa de combate não tem mais campo de treino');

  // Ele saiu de lá: eram dois lugares querendo ser a mesma coisa, e cada um
  // tirava o que o outro tinha de bom.
  eq('o campo de treinamento é o único lugar com linha de tiro',
    mundo.spawnZones.filter((z) => z.id === 'treino').length, 1);
}
