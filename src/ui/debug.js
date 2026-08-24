import { isDown, consumePress } from '../core/input.js';

const KEYS = [
  { label: 'W', codes: ['KeyW', 'ArrowUp'] },
  { label: 'A', codes: ['KeyA', 'ArrowLeft'] },
  { label: 'S', codes: ['KeyS', 'ArrowDown'] },
  { label: 'D', codes: ['KeyD', 'ArrowRight'] },
  { label: 'Shift', codes: ['ShiftLeft', 'ShiftRight'] },
  { label: 'C', codes: ['KeyC'] },
  { label: 'Z', codes: ['KeyZ'] },
  { label: 'Espaço', codes: ['Space'] }
];

/**
 * Painel de estado. Existe pra conferir combinação de comandos: as teclas
 * acendem juntas e o estado resultante aparece na mesma tela.
 * Liga/desliga com ` (crase) ou F2.
 */
export function initDebug(player) {
  const panel = document.getElementById('debug');
  const keyRow = KEYS.map(() => document.createElement('span'));

  const body = document.createElement('div');
  body.className = 'debug-lines';

  const keys = document.createElement('div');
  keys.className = 'debug-keys';
  KEYS.forEach((key, i) => {
    keyRow[i].textContent = key.label;
    keys.appendChild(keyRow[i]);
  });

  const ghost = document.createElement('div');
  ghost.className = 'debug-ghost';

  panel.append(body, keys, ghost);

  let visible = true;
  let accumulator = 0;
  let frames = 0;
  let fps = 0;

  return function updateDebug(delta) {
    if (consumePress('Backquote', 'F2')) {
      visible = !visible;
      panel.classList.toggle('hidden', !visible);
    }

    frames++;
    accumulator += delta;
    if (accumulator >= 0.25) {
      fps = Math.round(frames / accumulator);
      accumulator = 0;
      frames = 0;
    }
    if (!visible) return;

    const pos = player.object.position;

    body.innerHTML = [
      `estado <b>${player.state}</b>`,
      `velocidade <b>${player.speed.toFixed(2)}</b> m/s`,
      `postura <b>${player.stance}</b> · corpo <b>${player.height.toFixed(2)}</b> m`,
      `corrida <b>${player.runLatched ? 'ligada' : 'desligada'}</b>`,
      `no chão <b>${player.onGround ? 'sim' : 'não'}</b> · vertical <b>${player.verticalVelocity.toFixed(1)}</b>`,
      `coyote <b>${player.coyote.toFixed(2)}</b> · buffer <b>${player.jumpBuffer.toFixed(2)}</b>`,
      `xz <b>${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}</b> · ${fps} fps`
    ].map((line) => `<div>${line}</div>`).join('');

    KEYS.forEach((key, i) => {
      keyRow[i].classList.toggle('on', isDown(...key.codes));
    });

    // Se uma tecla física está apertada e o quadrado dela não acende, o evento
    // nem chegou no navegador — é ghosting do teclado, não bug do jogo.
    ghost.textContent = KEYS.filter((key) => isDown(...key.codes)).length >= 3
      ? 'combo de 3+ teclas: confira se todas acenderam'
      : '';
  };
}
