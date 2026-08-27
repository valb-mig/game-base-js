import { SLOT_ORDER } from '../items/classes.js';
import { hasModel } from '../items/models.js';
import { iconSvg } from '../../vendor/icons/icons.js';
import { ITEM_ICONS } from './itemicons.js';

/**
 * Cartas de classe e a tira de equipamento da barra de deploy.
 *
 * Separado do fluxo porque é só construção de DOM a partir do catálogo: quem
 * decide quando mostrar é ui/flow.js.
 *
 * A tira mostra só o que o jogador vai levar de fato — item sem modelo não
 * aparece. Prometer Thompson, granada e bolsa de curativos na tela de deploy e
 * entregar pistola e faca no mapa é pior que não prometer.
 */

/** Itens da classe que existem, na ordem das teclas 1, 2 e 3. */
export function realLoadout(classDef) {
  return SLOT_ORDER
    .map((slot, index) => {
      const item = classDef.loadout.find((entry) => entry.slot === slot && hasModel(entry));
      return item ? { item, key: index + 1 } : null;
    })
    .filter(Boolean);
}

export function buildCard(classDef) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'class-card';
  card.disabled = !classDef.available;
  card.style.setProperty('--class-color', classDef.color);

  if (!classDef.available) card.classList.add('locked');

  const role = document.createElement('span');
  role.className = 'class-role';
  role.textContent = classDef.role;

  const name = document.createElement('span');
  name.className = 'class-name';
  name.textContent = classDef.name;

  const note = document.createElement('span');
  note.className = 'class-note';
  note.textContent = classDef.available ? classDef.summary : 'Em breve';

  card.append(role, name, note);
  return card;
}

/** Tira horizontal do equipamento: uma peça por tecla, na ordem delas. */
export function buildLoadout(classDef) {
  const fragment = document.createDocumentFragment();

  const head = document.createElement('div');
  head.className = 'detail-head';
  head.style.setProperty('--class-color', classDef.color);
  head.textContent = `${classDef.name} · ${classDef.health} de vida`;
  fragment.appendChild(head);

  const strip = document.createElement('div');
  strip.className = 'loadout-strip';

  for (const { item, key } of realLoadout(classDef)) {
    const chip = document.createElement('div');
    chip.className = 'loadout-chip';

    const number = document.createElement('span');
    number.className = 'chip-key';
    number.textContent = `${key}`;

    // Mesmo desenho do cinto em jogo, pela mesma tabela: é assim que o
    // jogador reconhece no canto da tela o que escolheu aqui. Item sem
    // ícone fica só com o nome — nada de caixa genérica de reserva.
    const icon = document.createElement('span');
    icon.className = 'chip-icon';
    const iconName = ITEM_ICONS[item.id];
    if (iconName) icon.innerHTML = iconSvg(iconName);

    const corpo = document.createElement('span');
    corpo.className = 'chip-body';

    const slot = document.createElement('span');
    slot.className = 'chip-slot';
    slot.textContent = item.slot;

    const name = document.createElement('span');
    name.className = 'chip-name';
    name.textContent = item.name;

    corpo.append(slot, name);
    chip.append(number, icon, corpo);
    strip.appendChild(chip);
  }

  fragment.appendChild(strip);
  return fragment;
}
