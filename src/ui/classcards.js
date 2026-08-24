/**
 * Cartas de classe e o painel de detalhe da tela de deploy.
 *
 * Separado do fluxo porque é só construção de DOM a partir do catálogo: quem
 * decide quando mostrar é ui/flow.js.
 */

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

export function buildDetail(classDef) {
  const fragment = document.createDocumentFragment();

  const head = document.createElement('div');
  head.className = 'detail-head';
  head.style.setProperty('--class-color', classDef.color);
  head.textContent = `${classDef.name} · ${classDef.health} de vida`;

  const description = document.createElement('p');
  description.textContent = classDef.description;

  const list = document.createElement('dl');
  list.className = 'detail-loadout';

  for (const item of classDef.loadout) {
    const slot = document.createElement('dt');
    slot.textContent = item.slot;

    const value = document.createElement('dd');
    value.textContent = item.name;
    if (item.note) {
      const note = document.createElement('span');
      note.textContent = item.note;
      value.appendChild(note);
    }

    list.append(slot, value);
  }

  fragment.append(head, description, list);
  return fragment;
}
