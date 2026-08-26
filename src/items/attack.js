import * as THREE from 'three';
import { MELEE } from '../config.js';
import { consumeClick } from '../core/input.js';

/**
 * Golpe corpo a corpo.
 *
 * O golpe é uma linha do tempo, não um evento: o clique começa a animação, e
 * o dano só é resolvido no quadro em que ela cruza DAMAGE_AT. É o que faz o
 * acerto coincidir com a lâmina passando na tela, em vez de acontecer no
 * instante do clique.
 *
 * O alcance é um cone (`reach` e `arc` do item), não um raio fino: exigir
 * mira de precisão numa facada de perto é frustrante. Mas o cone respeita
 * parede — bater através de um saco de areia seria pior que errar.
 */
// Meio-ângulo do cone das costas. Noventa graus: de lado não é pelas costas,
// e chegar exatamente atrás não pode exigir precisão de milímetro.
const COSTAS = Math.PI / 2;

export function initAttack(player, world) {
  const origin = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const ponta = new THREE.Vector3();
  const probe = new THREE.Vector3();

  let listeners = [];

  /**
   * Existe colisor entre o rosto e o alvo?
   *
   * O colisor do próprio alvo é ignorado: ele fica exatamente no fim do
   * segmento, e sem essa exceção todo alvo bloquearia a mira até si mesmo.
   */
  function blocked(from, to, ignore) {
    const distance = from.distanceTo(to);
    const steps = Math.max(2, Math.ceil(distance / 0.25));

    for (let i = 1; i < steps; i++) {
      probe.lerpVectors(from, to, i / steps);
      for (const collider of player.colliders) {
        if (collider === ignore) continue;
        if (collider.box.containsPoint(probe)) return true;
      }
    }
    return false;
  }

  /**
   * Alvo vivo mais próximo dentro do alcance do golpe.
   *
   * A mira é horizontal, com folga na vertical. Testar o ângulo em 3D até o
   * centro do alvo parece certo e não é: colado no boneco, o centro dele fica
   * meio metro abaixo da linha dos olhos, o ângulo estoura e a facada à
   * queima-roupa erra. Ninguém mira pra baixo pra esfaquear.
   */
  function findTarget(melee) {
    origin.copy(player.object.position);
    forward.set(0, 0, -1).applyQuaternion(player.object.quaternion);

    const aimLength = Math.hypot(forward.x, forward.z);
    if (aimLength < 1e-6) return null;   // olhando reto pra cima ou pro chão

    const aimX = forward.x / aimLength;
    const aimZ = forward.z / aimLength;
    const cosLimit = Math.cos(melee.arc * Math.PI / 180);

    let best = null;
    let bestDistance = Infinity;

    for (const target of world.targets ?? []) {
      if (!target.alive) continue;
      // Ninguém esfaqueia o próprio time, e o jogador está nesta lista desde
      // que a bala de bot passou a poder acertá-lo: sem isto, o primeiro
      // golpe de faca acertava ele mesmo, que está a distância zero.
      if (target.team && target.team === player.team) continue;

      const center = target.center();
      const dx = center.x - origin.x;
      const dz = center.z - origin.z;
      const flat = Math.hypot(dx, dz);

      if (flat > melee.reach + target.radius) continue;
      if (Math.abs(center.y - origin.y) > melee.reach) continue;

      // de tão perto que a direção horizontal perde sentido, vale a mira
      if (flat > 1e-4 && (dx / flat) * aimX + (dz / flat) * aimZ < cosLimit) continue;
      if (flat >= bestDistance) continue;

      toTarget.copy(center);
      if (blocked(origin, toTarget, target.collider)) continue;

      best = target;
      bestDistance = flat;
    }
    return best;
  }

  /**
   * O alvo está de costas pro golpe?
   *
   * Compara pra onde ele OLHA com a direção do golpe: olhando pro mesmo lado
   * que a lâmina viaja, ele está de costas. Alvo sem direção — boneco de
   * palha, poste — nunca está de costas: ele não tem frente.
   */
  function pelasCostas(target) {
    if (typeof target.yaw !== 'number') return false;

    const centro = target.center();
    const paraAlvo = Math.atan2(centro.x - origin.x, centro.z - origin.z);

    let diferenca = Math.abs(paraAlvo - target.yaw) % (Math.PI * 2);
    if (diferenca > Math.PI) diferenca = Math.PI * 2 - diferenca;
    return diferenca < COSTAS;
  }

  /**
   * O mato à frente vem abaixo junto com o golpe.
   *
   * Não disputa com o alvo: a lâmina passa pelo arbusto de qualquer jeito, e
   * mato intacto depois da facada lê como golpe que não saiu. Um arbusto
   * também não tem vida — folha não aguenta lâmina, cai no primeiro.
   */
  function cortarMato(reach) {
    if (!world.bushes) return;
    origin.copy(player.object.position);
    forward.set(0, 0, -1).applyQuaternion(player.object.quaternion);
    ponta.copy(origin).addScaledVector(forward, reach);
    world.bushes.slash(origin, ponta, 0.35);
  }

  function resolve() {
    const melee = player.equipped?.melee;
    if (!melee) return;

    cortarMato(melee.reach);

    const target = findTarget(melee);
    if (!target) return;

    // Facada pelas costas mata de uma vez. O que decide é a direção pra onde
    // o ALVO está virado, não onde ele está: chegar por trás é a manobra, e
    // ela vale independente de de onde o golpe partiu.
    const porTras = pelasCostas(target);
    const dano = melee.damage * (porTras ? (melee.costas ?? 1) : 1);

    // O rumo do golpe é o do olhar: o corpo tomba pra longe de quem esfaqueou.
    const rumo = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(player.object.quaternion)
      .setY(0)
      .normalize();
    // A lâmina não tem ponto de impacto próprio: ela pega o corpo inteiro de
    // perto, e o solavanco do tronco é o que sobra disso.
    const result = target.damage(dano, null, { dir: rumo, ponto: null });
    for (const listener of listeners) {
      listener({ ...result, costas: porTras, corpoACorpo: true });
    }
  }

  return {
    /** Avisado a cada acerto, com { alvo, dano, morreu }. */
    onHit(listener) {
      listeners.push(listener);
    },

    update(delta) {
      const swing = player.swing;

      if (swing.active) {
        const before = swing.progress;
        swing.progress += delta / MELEE.SWING_TIME;

        // o dano cai no quadro que cruza DAMAGE_AT, uma vez só
        if (before < MELEE.DAMAGE_AT && swing.progress >= MELEE.DAMAGE_AT) resolve();

        if (swing.progress >= 1) {
          swing.active = false;
          swing.progress = 0;
          swing.cooldown = MELEE.COOLDOWN;
        }
        return;
      }

      swing.cooldown = Math.max(0, swing.cooldown - delta);

      // O clique é disputado: corpo a corpo e arma de fogo leem o mesmo
      // botão. Quem não está com o seu tipo de item na mão não pode nem
      // tocar nele — antes desta guarda, o corpo a corpo engolia o clique
      // com a pistola empunhada e o tiro nunca acontecia.
      // Trocando de item a mão está ocupada guardando a outra arma.
      if (!player.isLocked || player.swapping || !player.equipped?.melee) {
        swing.buffered = 0;
        return;
      }

      // Clique guardado por um instante, como o pulo. Sem isso, clicar no
      // fim do respiro consumia o clique e não saía golpe nenhum: o jogador
      // apertava e não acontecia nada.
      swing.buffered = consumeClick()
        ? MELEE.BUFFER
        : Math.max(0, swing.buffered - delta);

      if (swing.buffered <= 0) return;
      if (swing.cooldown > 0) return;

      swing.active = true;
      swing.progress = 0;
      swing.buffered = 0;
    }
  };
}
