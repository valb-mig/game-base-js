import { collides } from '../player/collision.js';
import { PLAYER } from '../config.js';
import { isDown } from '../core/input.js';

/**
 * Vigia de invariantes, rodando no jogo de verdade.
 *
 * Os testes automáticos só encontram o que eu penso em procurar, e um deles
 * já passou uma sessão inteira convencido de que um bug estava resolvido
 * enquanto o jogador continuava travando. Este vigia inverte isso: ele roda
 * enquanto alguém joga e grita quando o jogo entra num estado impossível,
 * com posição, geometria envolvida e as teclas dos últimos segundos.
 *
 * O relatório vai pro console e pra tela. Copiar e colar o texto basta pra
 * reconstruir o caso sem precisar descrever nada.
 */

const HISTORICO = 300;          // ~5 s a 60 fps
const PRESO_APOS = 40;          // quadros colidindo parado antes de acusar
const SEM_ANDAR_APOS = 70;      // quadros querendo andar sem sair do lugar

const TECLAS = [
  ['KeyW', 'W'], ['KeyS', 'S'], ['KeyA', 'A'], ['KeyD', 'D'],
  ['ShiftLeft', 'Shift'], ['Space', 'Espaço'], ['KeyC', 'C'], ['KeyZ', 'Z']
];

export function initWatchdog(player, world) {
  const painel = document.getElementById('watchdog');
  const historico = [];

  painel.addEventListener('click', () => painel.classList.remove('visivel'));

  let cruzandoHa = 0;
  let paradoHa = 0;
  let ultima = null;
  let anterior = { x: 0, z: 0 };

  /** Colisores que o corpo cruza agora. */
  function cruzando() {
    const pes = player.feetY;
    const cabeca = pes + player.height;
    const p = player.object.position;

    return world.colliders
      .filter(({ box }) =>
        p.x >= box.min.x - PLAYER.RADIUS && p.x <= box.max.x + PLAYER.RADIUS &&
        p.z >= box.min.z - PLAYER.RADIUS && p.z <= box.max.z + PLAYER.RADIUS &&
        pes + PLAYER.STEP_HEIGHT < box.max.y && cabeca > box.min.y)
      .slice(0, 3)
      .map(({ box }) =>
        `caixa y ${box.min.y.toFixed(2)}..${box.max.y.toFixed(2)}` +
        ` x ${box.min.x.toFixed(1)}..${box.max.x.toFixed(1)}` +
        ` z ${box.min.z.toFixed(1)}..${box.max.z.toFixed(1)}`);
  }

  function relatar(tipo, detalhe) {
    const p = player.object.position;
    const relatorio = [
      `[${tipo}] ${detalhe}`,
      `posição  x ${p.x.toFixed(2)}  y ${p.y.toFixed(2)}  z ${p.z.toFixed(2)}`,
      `corpo    pés ${player.feetY.toFixed(2)}  altura ${player.height.toFixed(2)}` +
        `  postura ${player.stance}  ${player.onGround ? 'no chão' : 'no ar'}`,
      `terreno  ${world.terrain.heightAt(p.x, p.z).toFixed(2)}`,
      `cruzando ${cruzando().join(' | ') || 'nada'}`,
      'últimos segundos:',
      ...historico
        .filter((_, i) => i % 10 === 0)
        .map((h) => `  x${h.x.padStart(8)} z${h.z.padStart(8)} pés${h.pes.padStart(7)}` +
          ` alt${h.alt.padStart(5)} ${h.chao ? 'chão' : ' ar '} ${h.postura.padEnd(9)} ${h.teclas}`)
    ].join('\n');

    ultima = relatorio;
    painel.textContent = `${relatorio}\n\n(clique aqui pra fechar · também está no console)`;
    painel.classList.add('visivel');
    console.warn('[watchdog]\n' + relatorio);
  }

  return {
    /** Último relatório, ou null. Serve pra copiar e colar. */
    get report() {
      return ultima;
    },

    update() {
      // Dirigindo, o jogador está DENTRO da caixa do veículo de propósito, e
      // não anda com as próprias pernas: os dois invariantes daqui acusariam
      // "preso dentro de geometria" a cada quadro em que ele está num jipe.
      if (!player.isLocked || player.spectating || player.vehicle) return;

      const p = player.object.position;
      const teclas = TECLAS.filter(([code]) => isDown(code)).map(([, nome]) => nome);

      historico.push({
        x: p.x.toFixed(2), z: p.z.toFixed(2),
        pes: player.feetY.toFixed(2), alt: player.height.toFixed(2),
        chao: player.onGround, postura: player.stance,
        teclas: teclas.join('+') || '—'
      });
      if (historico.length > HISTORICO) historico.shift();

      // 1. no chão e sem caber onde está, por tempo demais
      const apertado = player.onGround
        && collides(player.colliders, p.x, p.z, player.feetY, player.height);
      cruzandoHa = apertado ? cruzandoHa + 1 : 0;

      if (cruzandoHa === PRESO_APOS) {
        relatar('dentro-de-geometria',
          `${PRESO_APOS} quadros no chão em ${player.stance} sem caber onde está`);
      }

      // 2. querendo andar e sem sair do lugar
      const frente = (isDown('KeyW') ? 1 : 0) - (isDown('KeyS') ? 1 : 0);
      const lado = (isDown('KeyD') ? 1 : 0) - (isDown('KeyA') ? 1 : 0);
      const andou = Math.hypot(p.x - anterior.x, p.z - anterior.z);
      anterior = { x: p.x, z: p.z };

      paradoHa = ((frente || lado) && player.onGround && andou < 0.004) ? paradoHa + 1 : 0;

      if (paradoHa === SEM_ANDAR_APOS) {
        relatar('preso', `${SEM_ANDAR_APOS} quadros querendo andar sem sair do lugar`);
      }

      // Não some sozinho: quem precisa do relatório é quem vai copiá-lo, e
      // um aviso que pisca e desaparece não serve de prova de nada.
    }
  };
}
