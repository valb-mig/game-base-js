import { isDown, consumePress } from '../core/input.js';
import { spreadFactor } from '../items/firearm.js';

const KEYS = [
  { label: 'W', codes: ['KeyW', 'ArrowUp'] },
  { label: 'A', codes: ['KeyA', 'ArrowLeft'] },
  { label: 'S', codes: ['KeyS', 'ArrowDown'] },
  { label: 'D', codes: ['KeyD', 'ArrowRight'] },
  { label: 'Shift', codes: ['ShiftLeft', 'ShiftRight'] },
  { label: 'C', codes: ['KeyC'] },
  { label: 'Z', codes: ['KeyZ'] },
  { label: 'Espaço', codes: ['Space'] },
  { label: 'F', codes: ['KeyF'] },
  { label: 'E', codes: ['KeyE'] },
  { label: 'G', codes: ['KeyG'] },
  { label: 'R', codes: ['KeyR'] }
];

/**
 * Modo de depuração, no F2.
 *
 * Ele é o DONO do interruptor: o painel de estado é só uma das coisas que
 * acendem junto. As caixas de colisão e os rótulos sobre a cabeça dos bots
 * leem `on` daqui, pra que uma tecla só ligue tudo e nada saia de sincronia.
 *
 * Nasce desligado. Painel de depuração aceso por padrão vira parte do HUD
 * sem ninguém decidir isso.
 */
export function initDebug(player, tiro = () => null) {
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

  let visible = false;
  let accumulator = 0;
  let frames = 0;
  let fps = 0;

  /** O que a bala do próximo tiro vai fazer, se houver arma na mão. */
  function linhaDoTiro() {
    const t = tiro();
    if (!t) return '';
    return `tiro <b>${t.distancia.toFixed(0)}</b> m` +
      ` · cai <b>${(t.queda * 100).toFixed(0)}</b> cm` +
      ` · cano <b>${t.desvio.toFixed(2)}°</b> da mira` +
      (t.bateu ? '' : ' · <b>sem bater</b>');
  }

  function updateDebug(delta) {
    if (consumePress('Backquote', 'F2')) {
      visible = !visible;
      panel.classList.toggle('visivel', visible);
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
    const arma = player.equipped;
    const fogo = arma?.firearm;
    const abertura = fogo
      ? (fogo.hipSpread * (1 - player.gun.aim) + fogo.adsSpread * player.gun.aim)
        * spreadFactor(player)
      : 0;

    body.innerHTML = [
      `estado <b>${player.state}</b> · time <b>${player.team}</b>`,
      `vida <b>${Math.round(player.health)}</b>/${player.maxHealth} · ` +
        (player.spectating ? '<b>fantasma</b>'
          : player.alive ? 'em jogo' : '<b>caído</b>'),
      `velocidade <b>${player.speed.toFixed(2)}</b> m/s`,
      `postura <b>${player.stance}</b> · corpo <b>${player.height.toFixed(2)}</b> m`,
      `corrida <b>${player.runLatched ? 'ligada' : 'desligada'}</b>`,
      `no chão <b>${player.onGround ? 'sim' : 'não'}</b> · vertical <b>${player.verticalVelocity.toFixed(1)}</b>`,
      `coyote <b>${player.coyote.toFixed(2)}</b> · buffer <b>${player.jumpBuffer.toFixed(2)}</b>`,
      `item <b>${arma?.name ?? 'mão vazia'}</b>` +
        (arma?.ammo ? ` <b>${arma.ammo.loaded}</b>/${arma.ammo.reserve}` : ''),
      `mira <b>${player.gun.aim.toFixed(2)}</b>` +
        ` · dispersão <b>${abertura.toFixed(2)}°</b> (×${spreadFactor(player)})`,
      `xz <b>${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}</b>` +
        ` · pés <b>${player.feetY.toFixed(2)}</b> · ${fps} fps`,
      linhaDoTiro()
    ].filter(Boolean).map((line) => `<div>${line}</div>`).join('');

    KEYS.forEach((key, i) => {
      keyRow[i].classList.toggle('on', isDown(...key.codes));
    });

    // Se uma tecla física está apertada e o quadrado dela não acende, o evento
    // nem chegou no navegador — é ghosting do teclado, não bug do jogo.
    ghost.textContent = KEYS.filter((key) => isDown(...key.codes)).length >= 3
      ? 'combo de 3+ teclas: confira se todas acenderam'
      : '';
  }

  return {
    update: updateDebug,
    /** Quem desenha caixa de colisão e rótulo de bot lê isto. */
    get on() {
      return visible;
    }
  };
}
