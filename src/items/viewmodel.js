import * as THREE from 'three';
import { createItemModel, disposeModel } from './models.js';
import { handPose } from './poses.js';

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

const WIND_END = 0.3;    // fim do recolhimento
const SLASH_END = 0.52;  // fim do corte; o resto é voltar à guarda

const SWAY_STRENGTH = 0.05;    // quanto a mão fica pra trás ao girar
const SWAY_LIMIT = 0.045;
const SWAY_RECOVER = 9;
const POSE_SPEED = 7;          // troca entre pose normal e de corrida
const BOB_AMOUNT = 0.011;
const BOB_SPEED = 9;

/** Converte a pose crua do item em vetores, uma vez por troca. */
function toVectors(pose) {
  const converted = {};
  for (const [nome, valor] of Object.entries(pose)) {
    converted[nome] = {
      p: new THREE.Vector3(...valor.position),
      r: new THREE.Euler(...valor.rotation)
    };
  }
  return converted;
}

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

    // nasce neutro: a pose só existe quando há item na mão
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.item = null;
    this.flash = null;
    this.pose = null;

    this.sway = new THREE.Vector2();
    this.forward = new THREE.Vector3();
    this.lastForward = new THREE.Vector3(0, 0, -1);
    this.sprintBlend = 0;   // 0 = normal, 1 = correndo
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
    this.pose = toVectors(handPose(item));
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
    if (!swing.active || !this.pose?.wind) return 0;

    const { rest, wind, slash } = this.pose;

    const t = Math.min(1, swing.progress);
    let from;
    let to;
    let k;

    if (t < WIND_END) {
      from = rest;
      to = wind;
      k = t / WIND_END;
      k = k * k;                       // sai devagar, acelera: é o recuo
    } else if (t < SLASH_END) {
      from = wind;
      to = slash;
      k = (t - WIND_END) / (SLASH_END - WIND_END);
      k = 1 - (1 - k) * (1 - k) * (1 - k);   // estala pra frente
    } else {
      from = slash;
      to = rest;
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
    if (delta <= 0 || !this.pose) return;

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
    this.sprintBlend += (wantsSprint - this.sprintBlend) * Math.min(1, POSE_SPEED * delta);

    // oscilação do passo, proporcional à velocidade
    const speedRatio = Math.min(player.speed / player.stats.RUN_SPEED, 1);
    this.bobPhase += delta * BOB_SPEED * speedRatio;
    const bobX = Math.cos(this.bobPhase) * BOB_AMOUNT * speedRatio;
    const bobY = Math.sin(this.bobPhase * 2) * BOB_AMOUNT * 0.5 * speedRatio;

    const blend = this.sprintBlend;

    // golpear cancela a pose de corrida: não dá pra atacar com a arma baixada
    const swinging = this.#applySwing(player.swing, this.group.position, this.group.rotation);
    if (swinging) {
      this.group.position.x += this.sway.x;
      this.group.position.y += this.sway.y;
      return;
    }

    const { rest, sprint } = this.pose;

    this.group.position.set(
      THREE.MathUtils.lerp(rest.p.x, sprint.p.x, blend) + this.sway.x + bobX,
      THREE.MathUtils.lerp(rest.p.y, sprint.p.y, blend) + this.sway.y + bobY,
      THREE.MathUtils.lerp(rest.p.z, sprint.p.z, blend)
    );

    this.group.rotation.set(
      THREE.MathUtils.lerp(rest.r.x, sprint.r.x, blend) - this.sway.y * 2,
      THREE.MathUtils.lerp(rest.r.y, sprint.r.y, blend) + this.sway.x * 2,
      THREE.MathUtils.lerp(rest.r.z, sprint.r.z, blend)
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
    const ads = this.pose?.ads;

    if (ads && aim > 0.001) {
      const steady = 1 - aim;   // mirando, o balanço quase some
      this.group.position.set(
        THREE.MathUtils.lerp(this.group.position.x, ads.p.x, aim) + this.sway.x * steady,
        THREE.MathUtils.lerp(this.group.position.y, ads.p.y, aim) + this.sway.y * steady,
        THREE.MathUtils.lerp(this.group.position.z, ads.p.z, aim)
      );
      this.group.rotation.set(
        THREE.MathUtils.lerp(this.group.rotation.x, ads.r.x, aim),
        THREE.MathUtils.lerp(this.group.rotation.y, ads.r.y, aim),
        THREE.MathUtils.lerp(this.group.rotation.z, ads.r.z, aim)
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
