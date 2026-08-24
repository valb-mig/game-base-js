import * as THREE from 'three';
import { horizontalRight, forwardX, forwardZ } from '../../src/player/heading.js';
import { suite, ok, near, note } from '../assert.js';

/**
 * Direção do movimento. Testa o módulo que o jogo usa de fato — repetir a
 * conta aqui faria o teste passar mesmo com locomotion.js voltando pro
 * rotation.y, que foi exatamente o bug original.
 */
export function run() {
  suite('base de direção');

  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const quaternion = new THREE.Quaternion();
  const right = new THREE.Vector3();

  const degrees = (radians) => ((radians * 180 / Math.PI) % 360 + 360) % 360;
  const angleError = (heading, yaw) => Math.abs(((heading - yaw) % 360 + 540) % 360 - 180);

  let worst = 0;
  let worstCase = '';
  let naiveWorst = 0;

  for (const pitch of [0, -20, -60, -89.9, 89.9]) {
    for (const yaw of [0, 45, 90, 135, 180, 225, 270, 315]) {
      euler.set(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ');
      quaternion.setFromEuler(euler);

      horizontalRight(quaternion, right);
      const heading = degrees(Math.atan2(-forwardX(right), -forwardZ(right)));
      const error = angleError(heading, yaw);
      if (error > worst) { worst = error; worstCase = `yaw ${yaw}° pitch ${pitch}°`; }

      // o caminho errado, só pra registrar o tamanho do estrago
      const naive = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
      naiveWorst = Math.max(naiveWorst, angleError(degrees(naive.y), yaw));
    }
  }

  near('frente bate com o yaw em 40 combinações', worst, 0, 1e-6);
  ok('não degenera olhando reto pra cima ou pro chão', worst < 1e-6, worstCase || 'sem erro');
  ok('rotation.y daria errado (por isso não é usado)', naiveWorst > 90);
  note('erro máximo do caminho certo', `${worst.toExponential(1)}°`);
  note('erro máximo se usasse rotation.y', `${naiveWorst.toFixed(0)}°`);
}
