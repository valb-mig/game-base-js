/**
 * Faixa de status em jogo: classe, vida e equipamento. A vida ainda é só
 * leitura — nada no mapa tira dano por enquanto.
 */
export function initStatus(player) {
  const panel = document.getElementById('status');

  const name = document.createElement('div');
  name.className = 'status-class';

  const bar = document.createElement('div');
  bar.className = 'status-bar';
  const fill = document.createElement('span');
  bar.appendChild(fill);

  const loadout = document.createElement('div');
  loadout.className = 'status-loadout';

  const equipped = document.createElement('div');
  equipped.className = 'status-equipped';

  panel.append(name, bar, equipped, loadout);

  let shown = null;

  return function updateStatus() {
    const classDef = player.classDef;
    if (!classDef) return;

    if (shown !== classDef.id) {
      shown = classDef.id;
      panel.style.setProperty('--class-color', classDef.color);
      name.textContent = `${classDef.name} · ${classDef.role}`;
      equipped.textContent = player.equipped ? player.equipped.name : '';
      loadout.replaceChildren(...classDef.loadout
        .filter((item) => item !== player.equipped)
        .map((item) => {
          const row = document.createElement('div');
          row.textContent = item.name;
          return row;
        }));
    }

    const ratio = player.maxHealth ? player.health / player.maxHealth : 0;
    fill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    bar.dataset.value = `${Math.round(player.health)}`;
  };
}
