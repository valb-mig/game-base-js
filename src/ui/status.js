/**
 * Vitais (canto inferior esquerdo) e item empunhado (canto inferior direito).
 *
 * O bloco do item mostra contador de munição só se o item tiver munição. A
 * faca não tem, então aparece o tipo do slot no lugar — o HUD não inventa
 * número que o jogo não sabe.
 */

import { iconSvg } from '../../vendor/icons/icons.js';

/** Item -> ícone. Sem entrada própria o bloco fica sem ícone, e não inventa. */
const ITEM_ICONS = { m1911: 'pistol-gun', kabar: 'bowie-knife' };

export function initStatus(player) {
  const vitals = document.getElementById('vitals');
  const equipped = document.getElementById('equipped');

  const className = document.createElement('div');
  className.className = 'panel-label';

  const healthRow = document.createElement('div');
  healthRow.className = 'health-row';
  healthRow.innerHTML = iconSvg('first-aid-kit');
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

  // ícone das balas guardadas, remontado a cada troca junto com o número
  const reserveIcon = document.createElement('span');
  reserveIcon.className = 'reserve-icon';
  reserveIcon.innerHTML = iconSvg('bullets');

  const itemIcon = document.createElement('div');
  itemIcon.className = 'item-icon';
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
      reserve.replaceChildren();
      if (item?.ammo) reserve.append(reserveIcon.cloneNode(true), `${item.ammo.reserve}`);

      const iconName = item ? ITEM_ICONS[item.id] : null;
      itemIcon.innerHTML = iconName ? iconSvg(iconName) : '';
      itemIcon.classList.toggle('hidden', !iconName);
    }

    // munição muda a cada tiro, então tem entrada própria e não espera troca de item
    const loaded = item?.ammo?.loaded ?? -1;
    if (loaded !== shownAmmo) {
      shownAmmo = loaded;
      if (loaded >= 0) {
        itemCount.textContent = `${loaded}`;
        reserve.replaceChildren(reserveIcon.cloneNode(true), `${item.ammo.reserve}`);
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
