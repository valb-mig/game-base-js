/**
 * Tudo que é conversa com o navegador pra segurar o jogo na tela: pointer
 * lock não basta, porque Ctrl+W e Ctrl+T são reservados e ignoram
 * preventDefault. Só o Keyboard Lock os entrega — e ele exige tela cheia.
 *
 * O jogo NUNCA pede tela cheia. O padrão é janela, e quem quiser tela cheia
 * aperta F11 — é atalho do navegador, e tomar essa decisão pelo jogador
 * significaria mudar a janela dele sem que ele tenha pedido. O que sobra
 * aqui é aproveitar a tela cheia QUANDO ELA JÁ EXISTE: nesse caso as teclas
 * reservadas são travadas, e quem não usa F11 joga igual, só sem essa camada.
 */

// Teclas que o navegador reserva e que preventDefault não alcança. Só o
// Keyboard Lock as entrega pra página, e ele exige tela cheia.
const LOCKED_KEYS = [
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyZ', 'KeyR',
  'KeyT', 'KeyN', 'KeyP', 'KeyF', 'KeyL', 'Tab'
];
// 'Escape' fica de fora de propósito: travado, ele exigiria segurar a tecla
// pra sair. Assim ESC continua saindo na hora.

const GUEST_KEY = 'walker.convidado';

/**
 * Trava as teclas reservadas, mas SÓ se o jogador já está em tela cheia.
 *
 * Fora dela não há o que fazer: o Keyboard Lock exige tela cheia, e pedi-la
 * aqui seria decidir pelo jogador. Em janela o jogo roda igual — Ctrl+W
 * continua fechando a aba, e isso é escolha dele.
 */
function grabKeyboard() {
  if (!document.fullscreenElement) return;
  navigator.keyboard?.lock?.(LOCKED_KEYS)?.catch?.(() => {});
}

/**
 * Devolve as teclas. Não mexe na tela cheia: se o jogador entrou nela pelo
 * F11, tirá-lo de lá é desfazer uma escolha que não foi nossa.
 */
function releaseKeyboard() {
  navigator.keyboard?.unlock?.();
}

/**
 * Quem está jogando. Não há conta, não há login e não há progresso: todo
 * mundo é convidado, e o número existe só pra distinguir um do outro.
 *
 * Ele é sorteado uma vez e guardado, porque um apelido que muda a cada F5
 * não distingue ninguém — é ruído. Sem localStorage vale só esta sessão.
 */
function readGuest() {
  try {
    const saved = localStorage.getItem(GUEST_KEY);
    if (saved) return saved;
  } catch { /* aba anônima ou file:// — sorteia e segue */ }

  const nome = `Convidado ${1000 + Math.floor(Math.random() * 9000)}`;
  try {
    localStorage.setItem(GUEST_KEY, nome);
  } catch { /* sem persistência, só nesta sessão */ }
  return nome;
}

export { readGuest, grabKeyboard, releaseKeyboard };
