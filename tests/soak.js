import * as THREE from 'three';
import { Player } from '../src/player/player.js';
import { collides } from '../src/player/collision.js';
import { endFrame } from '../src/core/input.js';
import { PLAYER } from '../src/config.js';

/**
 * Jogo automático que vigia invariantes.
 *
 * Existe porque testar posições escolhidas a dedo só confirma o que já se
 * suspeita: ele dirige o jogador com entrada pseudoaleatória e verifica, a
 * cada quadro, coisas que nunca podem acontecer. Quando uma quebra, devolve
 * a sequência de teclas que levou até lá — que é o que faltava pra achar o
 * caminho de entrada de um bug em vez de adivinhar.
 *
 * A semente torna cada falha reproduzível: mesmo número, mesmo percurso.
 */

const TECLAS = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft', 'Space', 'KeyC', 'KeyZ'];
const HISTORICO = 240;   // quadros guardados pra reconstruir o caminho

function gerador(seed) {
  let estado = seed >>> 0;
  return () => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
    return estado / 4294967296;
  };
}

/**
 * @param {object} options
 * @param {object} options.world       mundo montado (colisores, terreno)
 * @param {number} options.seed
 * @param {number} options.frames      quantos quadros simular
 * @param {THREE.Vector3} options.from onde começar
 * @returns {{ok: boolean, violations: Array, frames: number}}
 */
export function soak({ world, seed = 1, frames = 6000, from }) {
  const rng = gerador(seed);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);

  const player = new Player(camera, document.body, world);
  player.controls.isLocked = true;
  player.spawn.copy(from);
  player.respawn();

  const segurando = new Set();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  let yaw = 0;
  let pitch = 0;

  const historico = [];
  const violations = [];

  // teclado falso: o jogador lê o módulo de entrada, então é ele que responde
  const pressionar = (code, down) => dispatchEvent(
    new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));

  let paradoHa = 0;
  let cruzandoHa = 0;
  let anterior = player.object.position.clone();

  for (let frame = 0; frame < frames; frame++) {
    // troca de intenção de vez em quando, não a cada quadro: senão o jogador
    // tremelica no lugar e nunca chega a lugar nenhum
    if (rng() < 0.06) {
      const tecla = TECLAS[Math.floor(rng() * TECLAS.length)];
      const querSegurar = rng() < 0.6;
      if (querSegurar === segurando.has(tecla)) {
        // já está como se quer; alterna pra o percurso não estagnar
        pressionar(tecla, !querSegurar);
        querSegurar ? segurando.delete(tecla) : segurando.add(tecla);
      } else {
        pressionar(tecla, querSegurar);
        querSegurar ? segurando.add(tecla) : segurando.delete(tecla);
      }
    }

    if (rng() < 0.08) {
      yaw += (rng() - 0.5) * 1.6;
      pitch = THREE.MathUtils.clamp(pitch + (rng() - 0.5) * 0.8, -1.4, 1.4);
      camera.quaternion.setFromEuler(euler.set(pitch, yaw, 0, 'YXZ'));
    }

    player.update(1 / 60);
    endFrame();

    const p = player.object.position;
    historico.push({
      frame,
      x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
      pes: +player.feetY.toFixed(2),
      alt: +player.height.toFixed(2),
      postura: player.stance,
      chao: player.onGround,
      teclas: [...segurando].join('+') || '—'
    });
    if (historico.length > HISTORICO) historico.shift();

    /** Quais colisores o corpo cruza agora, e por onde. */
    const culpados = () => {
      const pes = player.feetY;
      const cabeca = pes + player.height;
      return world.colliders
        .filter((c) => {
          const b = c.box;
          return p.x >= b.min.x - PLAYER.RADIUS && p.x <= b.max.x + PLAYER.RADIUS
            && p.z >= b.min.z - PLAYER.RADIUS && p.z <= b.max.z + PLAYER.RADIUS
            && pes + PLAYER.STEP_HEIGHT < b.max.y && cabeca > b.min.y;
        })
        .slice(0, 4)
        .map((c) => `y ${c.box.min.y.toFixed(2)}..${c.box.max.y.toFixed(2)}`);
    };

    const registrar = (tipo, detalhe) => {
      if (violations.some((v) => v.tipo === tipo)) return;   // um de cada basta
      violations.push({
        tipo, detalhe, frame,
        posicao: { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) },
        corpo: { pes: +player.feetY.toFixed(2), altura: +player.height.toFixed(2),
                 postura: player.stance, deitado: player.prone,
                 agachado: player.crouchLatched },
        cruzando: culpados(),
        caminho: historico.slice(-40)
      });
    };

    // --------------------------------------------------------- invariantes

    // 1. Assentado dentro de geometria, e assim continuando.
    //
    // Um quadro de sobreposição é normal: quem pousa numa plataforma sob um
    // teto baixo assenta de pé e só encolhe no quadro seguinte. O que não
    // pode é ficar assim — é isso que prende o jogador.
    cruzandoHa = (player.onGround
      && collides(world.colliders, p.x, p.z, player.feetY, player.height))
      ? cruzandoHa + 1 : 0;

    if (cruzandoHa > 45) {
      registrar('dentro-de-geometria',
        `${cruzandoHa} quadros no chão em ${player.stance} sem caber onde está`);
      cruzandoHa = 0;
    }

    // 2. abaixo do terreno
    const terreno = world.terrain.heightAt(p.x, p.z);
    if (player.feetY < terreno - 0.35) {
      registrar('abaixo-do-terreno',
        `pés em ${player.feetY.toFixed(2)}, terreno em ${terreno.toFixed(2)}`);
    }

    // 3. preso: quer andar, está no chão, e não sai do lugar.
    // W+S e A+D segurados juntos se cancelam — isso não é querer andar.
    const frente = (segurando.has('KeyW') ? 1 : 0) - (segurando.has('KeyS') ? 1 : 0);
    const lado = (segurando.has('KeyD') ? 1 : 0) - (segurando.has('KeyA') ? 1 : 0);
    const querAndar = frente !== 0 || lado !== 0;
    const andou = anterior.distanceTo(p);
    paradoHa = (querAndar && player.onGround && andou < 0.004) ? paradoHa + 1 : 0;
    anterior.copy(p);

    if (paradoHa > 90) {
      registrar('preso', `${paradoHa} quadros querendo andar sem sair do lugar`);
      paradoHa = 0;
    }

    // 4. altura de corpo impossível
    if (player.height < PLAYER.PRONE_HEIGHT - 0.01 || player.height > PLAYER.HEIGHT + 0.01) {
      registrar('altura-impossivel', `corpo com ${player.height.toFixed(2)} m`);
    }
  }

  for (const tecla of segurando) pressionar(tecla, false);
  endFrame();

  return { ok: violations.length === 0, violations, frames };
}
