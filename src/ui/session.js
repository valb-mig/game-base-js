/**
 * Tudo que é conversa com o navegador pra segurar o jogo na tela: pointer
 * lock não basta, porque Ctrl+W e Ctrl+T são reservados e ignoram
 * preventDefault. Só o Keyboard Lock os entrega — e ele exige tela cheia.
 *
 * Tela cheia é opcional: sem ela o jogo roda igual, só sem essa camada.
 */

// Teclas que o navegador reserva e que preventDefault não alcança. Só o
// Keyboard Lock as entrega pra página, e ele exige tela cheia.
const LOCKED_KEYS = [
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyZ', 'KeyR',
  'KeyT', 'KeyN', 'KeyP', 'KeyF', 'KeyL', 'Tab'
];
// 'Escape' fica de fora de propósito: travado, ele exigiria segurar a tecla
// pra sair. Assim ESC continua saindo na hora.

const STORAGE_KEY = 'walker.fullscreen';

// localStorage explode em aba anônima e em file:// — a preferência é um
// conforto, não pode derrubar o jogo.
function readPreference(fallback) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === null ? fallback : saved === '1';
  } catch {
    return fallback;
  }
}

function writePreference(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch { /* sem persistência, só nesta sessão */ }
}

// true só se fomos nós que pedimos tela cheia — se o jogador já estava em F11,
// não é nosso papel tirar ele de lá.
let claimedFullscreen = false;

function grabKeyboard() {
  if (document.fullscreenElement) {
    navigator.keyboard?.lock?.(LOCKED_KEYS)?.catch?.(() => {});
    return;
  }

  Promise.resolve(document.documentElement.requestFullscreen?.())
    .then(() => {
      claimedFullscreen = true;
      return navigator.keyboard?.lock?.(LOCKED_KEYS);
    })
    .catch(() => {}); // recusou tela cheia ou não suporta: joga sem essa camada
}

function releaseKeyboard() {
  navigator.keyboard?.unlock?.();
  if (claimedFullscreen && document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }
  claimedFullscreen = false;
}

export { readPreference, writePreference, grabKeyboard, releaseKeyboard };
