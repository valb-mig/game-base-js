import * as THREE from 'three';
import { createItemModel, disposeModel } from './models.js';
import { SIGHT_HEIGHT } from './pistol.js';

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

// Golpe: recolhe pra trás e pra cima, depois cruza a tela de cima pra baixo.
// A lâmina passa pelo centro perto de MELEE.DAMAGE_AT, que é quando o dano é
// resolvido — o acerto tem que coincidir com o que se vê.
const WIND_POSITION = new THREE.Vector3(0.235, -0.055, -0.33);
const WIND_ROTATION = new THREE.Euler(0.62, Math.PI / 2 + 0.72, -0.34);

const SLASH_POSITION = new THREE.Vector3(-0.075, -0.235, -0.4);
const SLASH_ROTATION = new THREE.Euler(-0.5, Math.PI / 2 - 0.34, 0.86);

const WIND_END = 0.3;    // fim do recolhimento
const SLASH_END = 0.52;  // fim do corte; o resto é voltar à guarda

// Mira de ferro. A arma é construída com o cano no -Z e a linha de mira em
// SIGHT_HEIGHT, então alinhar é translação pura: centralizar em X, descer a
// altura da mira, e levar à distância do braço. Nenhuma rotação — girar pra
// "acertar" a mira é o que faz mira de ferro ficar torta.
//
// A distância não é escolha estética: perto demais, o ferrolho fica mais
// largo na tela que o alvo e tapa exatamente o que se quer acertar. A 0,5 m
// o ferrolho ocupa ~6% da largura, e um boneco a 9 m, ~5,4%.
const ADS_POSITION = new THREE.Vector3(0, -SIGHT_HEIGHT, -0.5);
const ADS_ROTATION = new THREE.Euler(0, 0, 0);

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

    this.item = null;
    this.flash = null;

    this.sway = new THREE.Vector2();
    this.forward = new THREE.Vector3();
    this.lastForward = new THREE.Vector3(0, 0, -1);
    this.pose = 0;   // 0 = normal, 1 = correndo
    this.bobPhase = 0;
  }

  /**
   * Troca o que está na mão. `null` deixa as mãos vazias — é o que acontece
   * ao largar um item, e é diferente de esconder o viewmodel: escondido é
   * enquanto um menu está aberto, vazio é estado de jogo.
   */
  setItem(item) {
    if (this.item) {
      this.group.remove(this.item);
      disposeModel(this.item);
      this.item = null;
    }
    const model = createItemModel(item);
    if (!model) return;

    this.item = model;
    this.flash = model.getObjectByName('clarao') ?? null;
    this.group.add(model);
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

  /**
   * Pose do golpe, misturada por cima da pose de andar. Devolve 0..1 de
   * quanto o golpe domina — em repouso é 0 e nada muda.
   */
  #applySwing(swing, position, rotation) {
    if (!swing.active) return 0;

    const t = Math.min(1, swing.progress);
    let from;
    let to;
    let k;

    if (t < WIND_END) {
      from = { p: REST_POSITION, r: REST_ROTATION };
      to = { p: WIND_POSITION, r: WIND_ROTATION };
      k = t / WIND_END;
      k = k * k;                       // sai devagar, acelera: é o recuo
    } else if (t < SLASH_END) {
      from = { p: WIND_POSITION, r: WIND_ROTATION };
      to = { p: SLASH_POSITION, r: SLASH_ROTATION };
      k = (t - WIND_END) / (SLASH_END - WIND_END);
      k = 1 - (1 - k) * (1 - k) * (1 - k);   // estala pra frente
    } else {
      from = { p: SLASH_POSITION, r: SLASH_ROTATION };
      to = { p: REST_POSITION, r: REST_ROTATION };
      k = (t - SLASH_END) / (1 - SLASH_END);
      k = k * k * (3 - 2 * k);         // volta suave à guarda
    }

    position.set(
      THREE.MathUtils.lerp(from.p.x, to.p.x, k),
      THREE.MathUtils.lerp(from.p.y, to.p.y, k),
      THREE.MathUtils.lerp(from.p.z, to.p.z, k)
    );
    rotation.set(
      THREE.MathUtils.lerp(from.r.x, to.r.x, k),
      THREE.MathUtils.lerp(from.r.y, to.r.y, k),
      THREE.MathUtils.lerp(from.r.z, to.r.z, k)
    );
    return 1;
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

    // golpear cancela a pose de corrida: não dá pra atacar com a arma baixada
    const swinging = this.#applySwing(player.swing, this.group.position, this.group.rotation);
    if (swinging) {
      this.group.position.x += this.sway.x;
      this.group.position.y += this.sway.y;
      return;
    }

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

    this.#applyAim(player);
  }

  /**
   * Sobe a arma até o olho. Quanto mais mirado, menos o balanço e o atraso
   * da mão valem: mirar tem que estabilizar a imagem, senão não adianta.
   */
  #applyAim(player) {
    const aim = player.gun?.aim ?? 0;
    const kick = player.gun?.kick ?? 0;

    if (aim > 0.001) {
      const steady = 1 - aim;   // mirando, o balanço quase some
      this.group.position.set(
        THREE.MathUtils.lerp(this.group.position.x, ADS_POSITION.x, aim) + this.sway.x * steady,
        THREE.MathUtils.lerp(this.group.position.y, ADS_POSITION.y, aim) + this.sway.y * steady,
        THREE.MathUtils.lerp(this.group.position.z, ADS_POSITION.z, aim)
      );
      this.group.rotation.set(
        THREE.MathUtils.lerp(this.group.rotation.x, ADS_ROTATION.x, aim),
        THREE.MathUtils.lerp(this.group.rotation.y, ADS_ROTATION.y, aim),
        THREE.MathUtils.lerp(this.group.rotation.z, ADS_ROTATION.z, aim)
      );
    }

    if (this.flash) {
      this.flash.visible = (player.gun?.flash ?? 0) > 0;
      if (this.flash.visible) this.flash.rotation.z = Math.random() * Math.PI;
    }

    // coice: a arma recua e levanta a boca por um instante
    if (kick > 0) {
      this.group.position.z += kick * 0.02;
      this.group.rotation.x += kick * 0.09;
    }
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
