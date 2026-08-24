import { WORLD } from '../config.js';

/**
 * Painel de situação, canto superior esquerdo.
 *
 * Mostra só o que o mapa sabe de verdade: onde as bases estão e a que
 * distância o jogador está de cada uma. Não há sistema de objetivo ainda,
 * então não há contador de objetivo — a linha aparece quando ele existir.
 */
export function initMission(player, bases) {
  const panel = document.getElementById('mission');

  const title = document.createElement('div');
  title.className = 'mission-title';
  title.textContent = WORLD.MAP_NAME;

  const era = document.createElement('div');
  era.className = 'mission-era';
  era.textContent = WORLD.MAP_ERA;

  const rule = document.createElement('div');
  rule.className = 'panel-rule';

  const heading = document.createElement('div');
  heading.className = 'panel-label';
  heading.textContent = 'Bases';

  const list = document.createElement('div');
  list.className = 'mission-bases';

  const rows = bases.map((base) => {
    const row = document.createElement('div');
    const name = document.createElement('span');
    name.textContent = base.short;
    const distance = document.createElement('b');
    row.append(name, distance);
    list.appendChild(row);
    return { base, row, distance };
  });

  panel.append(title, era, rule, heading, list);

  let lastShown = -1;

  return function updateMission() {
    const position = player.object.position;
    // arredonda pra 5 m: o painel não pode piscar a cada passo
    const stamp = Math.round((position.x + position.z) / 5);
    if (stamp === lastShown) return;
    lastShown = stamp;

    for (const { base, row, distance } of rows) {
      const meters = Math.hypot(position.x - base.position.x, position.z - base.position.z);
      distance.textContent = `${Math.round(meters)} m`;
      row.classList.toggle('near', meters < 30);
    }
  };
}
