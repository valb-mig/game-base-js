/**
 * Vitais (canto inferior esquerdo) e cinto (canto inferior direito).
 *
 * O cinto é a tradução direta das teclas 1, 2 e 3: uma linha por slot, na
 * ordem fixa primária, secundária, faca. Slot sem item não vira linha — o
 * HUD não anuncia arma que o jogo não tem, e a Thompson da Assault é texto
 * de catálogo até alguém modelá-la.
 *
 * Munição só aparece pra quem tem munição. A faca não tem, então a linha dela
 * não mostra número nenhum: o HUD não inventa dado que o jogo não sabe.
 */

import { iconSvg } from '../../vendor/icons/icons.js';

/** Item -> ícone. Sem entrada própria a linha fica sem ícone, e não inventa. */
const ITEM_ICONS = { m1911: 'pistol-gun', kabar: 'bowie-knife', m1943: 'spade' };

/** Uma linha do cinto: tecla, ícone, nome e munição. */
function buildSlot(item, index) {
  const row = document.createElement('div');
  row.className = 'slot';

  const key = document.createElement('span');
  key.className = 'slot-key';
  key.textContent = `${index + 1}`;

  const icon = document.createElement('span');
  icon.className = 'slot-icon';
  const iconName = ITEM_ICONS[item.id];
  if (iconName) icon.innerHTML = iconSvg(iconName);

  const name = document.createElement('span');
  name.className = 'slot-name';
  name.textContent = item.name;

  // Carregador e reserva são dois números com peso diferente: o de agora
  // grita, o guardado sussurra. Elementos separados porque só CSS distingue.
  const ammo = document.createElement('span');
  ammo.className = 'slot-ammo';
  const loaded = document.createElement('b');
  const reserve = document.createElement('span');
  reserve.className = 'ammo-reserve';
  ammo.append(loaded, reserve);

  row.append(key, icon, name, ammo);
  return { row, loaded, reserve, item, index };
}

export function initStatus(player) {
  const vitals = document.getElementById('vitals');
  const belt = document.getElementById('equipped');

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

  // ícone das balas guardadas, clonado por linha que tiver munição
  const reserveIcon = document.createElement('span');
  reserveIcon.className = 'reserve-icon';
  reserveIcon.innerHTML = iconSvg('bullets');

  // `undefined` como sentinela porque `null` é valor legítimo: é mão vazia.
  let shownClass;
  let shownBelt;
  let shownSlot = -1;
  let shownHealth = -1;
  let rows = [];

  /** Redesenha as linhas do cinto. Só quando o que se carrega muda. */
  function rebuild() {
    rows = player.carried
      .map((item, index) => (item ? buildSlot(item, index) : null))
      .filter(Boolean);
    belt.replaceChildren(...rows.map((row) => row.row));
    shownSlot = -1;
  }

  return function updateStatus() {
    const classDef = player.classDef;
    if (!classDef) return;

    if (shownClass !== classDef.id) {
      shownClass = classDef.id;
      className.textContent = classDef.name;
      vitals.style.setProperty('--class-color', classDef.color);
    }

    // assinatura do cinto: o que está em cada slot, na ordem das teclas
    const stamp = player.carried.map((item) => item?.id ?? '-').join('|');
    if (stamp !== shownBelt) {
      shownBelt = stamp;
      rebuild();
    }

    if (shownSlot !== player.slot) {
      shownSlot = player.slot;
      for (const row of rows) {
        row.row.classList.toggle('active', row.index === player.slot);
      }
    }

    // A pá não tem munição, tem carga: cheia ou vazia. Mesma linha, outra
    // informação — o cinto mostra o que cada item de fato tem.
    for (const row of rows) {
      if (row.item.tool) {
        const carga = player.dig?.carga > 0 ? 'terra' : '';
        if (row.shown !== carga) {
          row.shown = carga;
          row.loaded.textContent = carga;
          row.loaded.classList.toggle('empty', carga === '');
          row.reserve.replaceChildren();
        }
        continue;
      }

      const ammo = row.item.ammo;
      if (!ammo) continue;
      const stampAmmo = `${ammo.loaded}/${ammo.reserve}`;
      if (row.shown === stampAmmo) continue;
      row.shown = stampAmmo;

      row.loaded.textContent = `${ammo.loaded}`;
      row.reserve.replaceChildren(reserveIcon.cloneNode(true), `${ammo.reserve}`);
      row.loaded.classList.toggle('empty', ammo.loaded === 0);
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
