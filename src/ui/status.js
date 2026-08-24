/**
 * Vitais (canto inferior esquerdo) e item empunhado (canto inferior direito).
 *
 * O bloco do item mostra contador de munição só se o item tiver munição. A
 * faca não tem, então aparece o tipo do slot no lugar — o HUD não inventa
 * número que o jogo não sabe.
 */

const CROSS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.4 1h3.2v5.4H15v3.2H9.6V15H6.4V9.6H1V6.4h5.4z"/></svg>';
const BLADE = '<svg viewBox="0 0 32 16" aria-hidden="true"><path d="M2 9.4 19 3.2l6.6 2.1-1.1 3.3-6.6 2.1L2 10.6z"/><rect x="24.6" y="4.4" width="1.6" height="5.6"/><rect x="26.6" y="5.6" width="4.4" height="3.2" rx="1.2"/></svg>';

export function initStatus(player) {
  const vitals = document.getElementById('vitals');
  const equipped = document.getElementById('equipped');

  const className = document.createElement('div');
  className.className = 'panel-label';

  const healthRow = document.createElement('div');
  healthRow.className = 'health-row';
  healthRow.innerHTML = CROSS;
  const healthValue = document.createElement('b');
  healthRow.appendChild(healthValue);

  const bar = document.createElement('div');
  bar.className = 'health-bar';
  const fill = document.createElement('span');
  bar.appendChild(fill);

  vitals.append(className, healthRow, bar);

  const itemRow = document.createElement('div');
  itemRow.className = 'item-row';
  const itemCount = document.createElement('div');
  itemCount.className = 'item-count';
  const reserve = document.createElement('div');
  reserve.className = 'item-reserve';

  const itemIcon = document.createElement('div');
  itemIcon.className = 'item-icon';
  itemIcon.innerHTML = BLADE;
  itemRow.append(itemCount, reserve, itemIcon);

  const itemName = document.createElement('div');
  itemName.className = 'item-name';

  equipped.append(itemRow, itemName);

  // `undefined` como sentinela porque `null` é valor legítimo: é mão vazia.
  // Com null nos dois lados, o primeiro quadro de mão vazia não desenhava nada.
  let shownClass;
  let shownItem;
  let shownHealth = -1;
  let shownAmmo = -1;

  return function updateStatus() {
    const classDef = player.classDef;
    if (!classDef) return;

    if (shownClass !== classDef.id) {
      shownClass = classDef.id;
      className.textContent = classDef.name;
      vitals.style.setProperty('--class-color', classDef.color);
    }

    const item = player.equipped;
    const itemId = item ? item.id : null;
    if (shownItem !== itemId) {
      shownItem = itemId;
      equipped.classList.toggle('empty', !item);
      itemName.textContent = item ? item.name : 'Mãos vazias';
      // sem munição, o lugar do contador mostra o tipo do slot
      itemCount.textContent = item ? (item.ammo ? `${item.ammo.loaded}` : item.slot) : '—';
      itemCount.classList.toggle('is-label', Boolean(item) && !item.ammo);
      reserve.textContent = item?.ammo ? `/ ${item.ammo.reserve}` : '';
      itemIcon.classList.toggle('hidden', !item);
    }

    // munição muda a cada tiro, então tem entrada própria e não espera troca de item
    const loaded = item?.ammo?.loaded ?? -1;
    if (loaded !== shownAmmo) {
      shownAmmo = loaded;
      if (loaded >= 0) {
        itemCount.textContent = `${loaded}`;
        reserve.textContent = `/ ${item.ammo.reserve}`;
        itemCount.classList.toggle('empty', loaded === 0);
      }
    }

    const health = Math.round(player.health);
    if (health !== shownHealth) {
      shownHealth = health;
      healthValue.textContent = `${health}`;
      const ratio = player.maxHealth ? player.health / player.maxHealth : 0;
      fill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
      bar.classList.toggle('low', ratio < 0.35);
    }
  };
}
