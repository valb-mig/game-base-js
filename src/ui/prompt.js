/**
 * Aviso de ação no centro da tela: aparece só quando existe alguma coisa
 * alcançável agora. Sem item por perto, não há aviso — o HUD não anuncia
 * ação que não vai funcionar.
 */
export function initPrompt(drops) {
  const element = document.getElementById('prompt');

  const key = document.createElement('kbd');
  key.textContent = 'E';

  const label = document.createElement('span');
  element.append(key, label);

  let shown = null;

  return function updatePrompt() {
    const target = drops.reachable();
    const name = target ? target.item.name : null;

    if (name === shown) return;
    shown = name;

    element.classList.toggle('visible', Boolean(name));
    if (name) label.textContent = name;
  };
}
