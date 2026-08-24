// Estado bruto do teclado. Nenhuma regra de jogo mora aqui.

const pressed = new Set();
const fresh = new Set(); // teclas que baixaram neste frame, ainda não consumidas

// Toda tecla de jogo é engolida. Ctrl saiu dos comandos justamente porque
// Ctrl+W / Ctrl+T são reservados do navegador e ignoram preventDefault —
// só o Keyboard Lock em tela cheia os segura (ver ui.js).
const SWALLOW = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyZ', 'KeyG', 'KeyE',
  'ShiftLeft', 'ShiftRight',
  'Backquote', 'F2', 'Tab'
]);

export function initInput() {
  addEventListener('keydown', (event) => {
    if (SWALLOW.has(event.code)) event.preventDefault(); // senão a página rola
    if (event.repeat) return;                            // auto-repeat não é uma nova batida
    if (!pressed.has(event.code)) fresh.add(event.code);
    pressed.add(event.code);
  });

  addEventListener('keyup', (event) => pressed.delete(event.code));

  // solta tudo ao perder o foco, senão a tecla "gruda"
  addEventListener('blur', () => {
    pressed.clear();
    fresh.clear();
  });
}

export function isDown(...codes) {
  return codes.some((code) => pressed.has(code));
}

/**
 * Só é verdade no frame em que a tecla desce, e some depois de lida.
 * É o que faz o buffer de pulo funcionar sem disparar duas vezes.
 */
export function consumePress(...codes) {
  let hit = false;
  for (const code of codes) {
    if (fresh.delete(code)) hit = true;
  }
  return hit;
}

// chamada no fim do loop: o que ninguém leu vira passado
export function endFrame() {
  fresh.clear();
}

// 1, -1 ou 0 — útil pra montar vetor de direção
export function axis(positiveCodes, negativeCodes) {
  return Number(isDown(...positiveCodes)) - Number(isDown(...negativeCodes));
}
