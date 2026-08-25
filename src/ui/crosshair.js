import * as THREE from 'three';
import { spreadFactor } from '../items/firearm.js';

/**
 * Mira que abre com a dispersão.
 *
 * Sem isto o jogador não tem como saber por que o tiro errou: a abertura vai
 * de zero parado a quatro graus no ar, e um ponto fixo no meio da tela conta
 * a mesma coisa nos dois casos. O anel é a informação — parado ele encosta no
 * ponto, e é assim que se aprende que parar vale a pena.
 *
 * O raio é convertido de ângulo pra pixel com o FOV da câmera do JOGO, não o
 * do viewmodel: o que o anel promete é onde a bala cai no mundo.
 */
export function initCrosshair(player, camera) {
  const element = document.getElementById('crosshair');
  if (!element) return () => {};

  let mostrado = -1;

  return function updateCrosshair() {
    const arma = player.equipped?.firearm;
    if (!arma) {
      if (mostrado !== 0) {
        mostrado = 0;
        element.style.setProperty('--abertura', '0px');
      }
      return;
    }

    const daArma = THREE.MathUtils.lerp(
      arma.hipSpread, arma.adsSpread, player.gun.aim);
    const radianos = daArma * spreadFactor(player) * Math.PI / 180;

    // pixels por radiano na vertical, pro FOV atual (que a mira encolhe)
    const meiaTela = innerHeight / 2;
    const porRadiano = meiaTela / Math.tan(camera.fov * Math.PI / 360);
    const raio = Math.round(Math.tan(radianos) * porRadiano);

    if (raio === mostrado) return;
    mostrado = raio;
    element.style.setProperty('--abertura', `${raio * 2}px`);
    element.classList.toggle('aberta', raio > 2);
  };
}
