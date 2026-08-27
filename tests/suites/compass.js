import * as THREE from 'three';
import { initCompass } from '../../src/ui/compass.js';
import { headingDegrees } from '../../src/player/heading.js';
import { suite, ok, eq, near, note } from '../assert.js';

/**
 * A bússola é testada pelo canvas, não pela fórmula: já passou por engano
 * quando o desenho estava certo mas o canvas tinha 0x0.
 */
function pixelsOpacos(canvas) {
  if (!canvas.width || !canvas.height) return 0;
  const dados = canvas.getContext('2d')
    .getImageData(0, 0, canvas.width, canvas.height).data;
  let total = 0;
  for (let i = 3; i < dados.length; i += 4) if (dados[i] > 0) total++;
  return total;
}

/** Coluna da marca desenhada mais próxima do centro. */
/**
 * A que distância do centro está a tinta mais próxima da RÉGUA.
 *
 * A varredura começa na metade de baixo de propósito: a fita passou a ter os
 * ícones dos objetivos numa faixa acima da rosa dos ventos, e varrendo o topo
 * o teste passaria a medir a posição de um ícone em vez da letra do rumo.
 * Embaixo estão a rosa e os riscos, e o risco do rumo cai exatamente no meio.
 */
function distanciaDoCentro(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const y0 = Math.floor(canvas.height * 0.45);
  const h = Math.max(1, canvas.height - y0);
  const dados = ctx.getImageData(0, y0, w, h).data;

  let melhor = Infinity;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (dados[(y * w + x) * 4 + 3] < 40) continue;
      melhor = Math.min(melhor, Math.abs(x - w / 2));
      break;
    }
  }
  return melhor;
}

export function run() {
  suite('bússola');

  // monta o HUD igual ao jogo: escondido até o deploy
  const layer = document.createElement('div');
  layer.id = 'hud-layer';
  layer.style.cssText = 'position:fixed;top:0;left:0;width:900px;height:60px;display:none';
  const canvas = document.createElement('canvas');
  canvas.id = 'compass';
  canvas.style.cssText = 'display:block;width:680px;height:34px';
  layer.appendChild(canvas);
  document.body.appendChild(layer);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  const updateCompass = initCompass(camera);   // inicializa com o HUD oculto

  updateCompass();
  eq('escondida, não desenha nem quebra', pixelsOpacos(canvas), 0);

  // Regressão: medir o canvas só na inicialização o deixava 0x0 pra sempre,
  // porque nesse momento o HUD ainda espera o deploy com display:none.
  layer.style.display = 'block';
  updateCompass();
  ok('ao aparecer, remede e desenha', pixelsOpacos(canvas) > 100, `${pixelsOpacos(canvas)} px`);

  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const olharPara = (grausDeYaw, pitch = 0) => {
    euler.set(pitch, grausDeYaw * Math.PI / 180, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
    updateCompass();
  };

  // mouse pra direita diminui o yaw: é o que o PointerLockControls faz
  for (const [yaw, nome] of [[0, 'norte'], [-90, 'leste'], [-180, 'sul'], [-270, 'oeste']]) {
    olharPara(yaw);
    ok(`${nome} cai no centro da fita`, distanciaDoCentro(canvas) <= 2,
      `${distanciaDoCentro(canvas)} px do centro`);
  }

  olharPara(-30, 0);
  const semPitch = distanciaDoCentro(canvas);
  olharPara(-30, -1.2);
  eq('inclinar a cabeça não muda o rumo', distanciaDoCentro(canvas), semPitch);

  const scratch = new THREE.Vector3();
  olharPara(-90);
  near('e o rumo em graus bate', headingDegrees(camera.quaternion, scratch), 90, 1e-6);

  layer.remove();
}
