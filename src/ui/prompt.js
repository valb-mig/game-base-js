/**
 * Aviso de ação no centro da tela: aparece só quando existe alguma coisa
 * alcançável agora. Sem item por perto, não há aviso — o HUD não anuncia
 * ação que não vai funcionar.
 */
export function initPrompt(drops, veiculos = null) {
  const element = document.getElementById('prompt');

  const key = document.createElement('kbd');
  key.textContent = 'E';

  const label = document.createElement('span');
  element.append(key, label);

  let shown = null;

  return function updatePrompt() {
    // Veículo antes de item: o E é o mesmo, e quem está ao lado de um jipe
    // quer entrar nele. Se o aviso mostrasse o item, a tecla faria uma coisa
    // e a tela prometeria outra.
    const veiculo = veiculos?.aviso() ?? null;
    const target = veiculo ? null : drops.reachable();
    const name = veiculo ?? (target ? target.item.name : null);

    if (name === shown) return;
    shown = name;

    element.classList.toggle('visible', Boolean(name));
    if (name) label.textContent = name;
  };
}
