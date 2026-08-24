import * as THREE from 'three';
import { createKnife } from './knife.js';

/**
 * Item na mão, em primeira pessoa. Sem braços por enquanto: só o objeto.
 *
 * Renderiza numa cena e numa câmera próprias, desenhadas por cima do mundo
 * com o depth buffer limpo. São duas coisas que isso resolve de uma vez:
 *
 *  - a faca nunca atravessa parede, por mais que o jogador encoste nela;
 *  - o FOV do item fica desacoplado do FOV do jogo, e é ele que decide o
 *    tamanho do objeto na tela. Com os 70° do mundo, uma faca de 30 cm a
 *    meio metro do olho ocuparia mais da metade da altura da tela.
 *
 * O que se anima aqui é o que depende da intenção do jogador: atraso ao
 * virar a cabeça, oscilação do passo e a pose de corrida, lâmina baixada.
 */

const VIEW_FOV = 42;

// Escolhidos comparando renders lado a lado: mais pra dentro que isso e o
// cabo sai do enquadramento, sobrando só lâmina no canto.
const REST_POSITION = new THREE.Vector3(0.135, -0.115, -0.48);
const REST_ROTATION = new THREE.Euler(0.08, Math.PI / 2 + 0.26, 0.14);

const SPRINT_POSITION = new THREE.Vector3(0.175, -0.165, -0.44);
const SPRINT_ROTATION = new THREE.Euler(-0.24, Math.PI / 2 + 0.55, 0.34);

const SWAY_STRENGTH = 0.05;    // quanto a mão fica pra trás ao girar
const SWAY_LIMIT = 0.045;
const SWAY_RECOVER = 9;
const POSE_SPEED = 7;          // troca entre pose normal e de corrida
const BOB_AMOUNT = 0.011;
const BOB_SPEED = 9;

export class Viewmodel {
  constructor(worldCamera, aspect) {
    this.worldCamera = worldCamera;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(VIEW_FOV, aspect, 0.01, 5);

    // Luz própria: o item não pode escurecer só porque o sol do mapa está
    // atrás do jogador. Mesmas cores da cena, sem depender da direção dela.
    this.scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x3a3a34, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(-0.4, 0.8, 0.6);
    this.scene.add(key);

    this.group = new THREE.Group();
    this.group.position.copy(REST_POSITION);
    this.group.rotation.copy(REST_ROTATION);
    this.scene.add(this.group);

    this.item = createKnife();
    this.group.add(this.item);

    this.sway = new THREE.Vector2();
    this.forward = new THREE.Vector3();
    this.lastForward = new THREE.Vector3(0, 0, -1);
    this.pose = 0;   // 0 = normal, 1 = correndo
    this.bobPhase = 0;
  }

  get visible() {
    return this.group.visible;
  }

  set visible(value) {
    this.group.visible = value;
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(delta, player) {
    if (delta <= 0) return;

    // Atraso ao virar: mede quanto a câmera girou neste frame e joga a mão
    // pro lado contrário, com volta elástica.
    this.forward.set(0, 0, -1).applyQuaternion(this.worldCamera.quaternion);
    const turnX = this.forward.x - this.lastForward.x;
    const turnY = this.forward.y - this.lastForward.y;
    this.lastForward.copy(this.forward);

    this.sway.x = THREE.MathUtils.clamp(
      this.sway.x - turnX * SWAY_STRENGTH * 60 * delta, -SWAY_LIMIT, SWAY_LIMIT);
    this.sway.y = THREE.MathUtils.clamp(
      this.sway.y - turnY * SWAY_STRENGTH * 60 * delta, -SWAY_LIMIT, SWAY_LIMIT);
    this.sway.multiplyScalar(Math.exp(-SWAY_RECOVER * delta));

    // pose de corrida entra e sai suave
    const wantsSprint = player.running && player.onGround ? 1 : 0;
    this.pose += (wantsSprint - this.pose) * Math.min(1, POSE_SPEED * delta);

    // oscilação do passo, proporcional à velocidade
    const speedRatio = Math.min(player.speed / player.stats.RUN_SPEED, 1);
    this.bobPhase += delta * BOB_SPEED * speedRatio;
    const bobX = Math.cos(this.bobPhase) * BOB_AMOUNT * speedRatio;
    const bobY = Math.sin(this.bobPhase * 2) * BOB_AMOUNT * 0.5 * speedRatio;

    const { pose } = this;
    this.group.position.set(
      THREE.MathUtils.lerp(REST_POSITION.x, SPRINT_POSITION.x, pose) + this.sway.x + bobX,
      THREE.MathUtils.lerp(REST_POSITION.y, SPRINT_POSITION.y, pose) + this.sway.y + bobY,
      THREE.MathUtils.lerp(REST_POSITION.z, SPRINT_POSITION.z, pose)
    );

    this.group.rotation.set(
      THREE.MathUtils.lerp(REST_ROTATION.x, SPRINT_ROTATION.x, pose) - this.sway.y * 2,
      THREE.MathUtils.lerp(REST_ROTATION.y, SPRINT_ROTATION.y, pose) + this.sway.x * 2,
      THREE.MathUtils.lerp(REST_ROTATION.z, SPRINT_ROTATION.z, pose)
    );
  }

  /** Desenha por cima do mundo, com a profundidade zerada. */
  render(renderer) {
    if (!this.group.visible) return;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = true;
  }
}
