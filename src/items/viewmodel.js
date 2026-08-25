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

// Recarga, em frações do tempo total: baixa a arma, solta o carregador,
// enfia o novo, e volta à guarda.
const RELOAD_DOWN = 0.22;
const RELOAD_DROP = 0.34;   // aqui o carregador vazio cai
const RELOAD_SEAT = 0.62;   // aqui o novo entra, com um solavanco
const RELOAD_UP = 0.82;

const MAG_FALL_GRAVITY = 9;

const SWAY_STRENGTH = 0.05;    // quanto a mão fica pra trás ao girar
const SWAY_LIMIT = 0.045;
const SWAY_RECOVER = 9;
const POSE_SPEED = 7;          // troca entre pose normal e de corrida
const BOB_AMOUNT = 0.011;
const BOB_SPEED = 9;

const smooth = (k) => k * k * (3 - 2 * k);

// rascunhos de `readMuzzle`, que roda a cada tiro
const zeroEuler = new THREE.Euler();
const localQuaternion = new THREE.Quaternion();

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
    this.dirt = null;
    this.pose = null;
    this.muzzle = null;   // marcador da boca do cano, se o item tiver um
    this.aim = 0;         // último valor lido da mira, pra zerar o cano

    // carregador caindo durante a recarga; vive na cena do viewmodel
    this.mag = null;
    this.magVelocity = new THREE.Vector3();

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
    this.dirt = model.getObjectByName('terra') ?? null;
    this.muzzle = model.getObjectByName('boca') ?? null;
    this.pose = toVectors(handPose(item));
    this.group.add(model);

    // Pose de guarda já aqui, e não no primeiro update: enquanto o mouse não
    // travar, `update` não roda, e o item ficaria na origem da câmera do
    // viewmodel — ou seja, do tamanho da tela inteira. Aparecia como um
    // borrão preto nos quadros entre desembarcar e o pointer lock ser dado.
    this.group.position.copy(this.pose.rest.p);
    this.group.rotation.copy(this.pose.rest.r);
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
    // atirar cancela a pose de corrida, como golpear: com a arma baixada o
    // cano aponta pro chão, e o primeiro tiro correndo já sai torto de propósito
    const shooting = (player.gun?.cooldown ?? 0) > 0;
    const wantsSprint = player.running && player.onGround && !shooting ? 1 : 0;
    this.sprintBlend += (wantsSprint - this.sprintBlend) * Math.min(1, POSE_SPEED * delta);

    // oscilação do passo, proporcional à velocidade
    const speedRatio = Math.min(player.speed / player.stats.RUN_SPEED, 1);
    this.bobPhase += delta * BOB_SPEED * speedRatio;
    const bobX = Math.cos(this.bobPhase) * BOB_AMOUNT * speedRatio;
    const bobY = Math.sin(this.bobPhase * 2) * BOB_AMOUNT * 0.5 * speedRatio;

    const blend = this.sprintBlend;

    // A pazada usa as mesmas poses do golpe: erguer, cravar, voltar. O que
    // muda é o ritmo, que vem da ferramenta, não da lâmina.
    const cavando = player.dig?.modo
      ? { active: true, progress: player.dig.progresso }
      : player.swing;

    if (this.dirt) this.dirt.visible = (player.dig?.carga ?? 0) > 0;

    // golpear cancela a pose de corrida: não dá pra atacar com a arma baixada
    const swinging = this.#applySwing(cavando, this.group.position, this.group.rotation);
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

    this.#applyReload(player, delta);
    this.#applyAim(player);
  }

  /** Solta um carregador que cai e some. Só enfeite, sem colisão. */
  #dropMagazine() {
    if (this.mag) this.scene.remove(this.mag);

    this.mag = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.062, 0.032),
      new THREE.MeshLambertMaterial({ color: 0x32352f, emissive: 0x0a0b0a, flatShading: true })
    );
    this.mag.position.copy(this.group.position);
    this.mag.position.y -= 0.05;
    this.magVelocity.set(-0.12, -0.2, 0.05);
    this.scene.add(this.mag);
  }

  /**
   * Anima a recarga. A arma sai do centro de propósito: recarregar tem que
   * custar a visão do que está à frente, senão não é decisão nenhuma.
   */
  #applyReload(player, delta) {
    const poses = this.pose;
    const t = player.gun?.reloadProgress ?? 0;

    if (this.mag) {
      this.magVelocity.y -= MAG_FALL_GRAVITY * delta;
      this.mag.position.addScaledVector(this.magVelocity, delta);
      this.mag.rotation.x += delta * 6;
      this.mag.rotation.z += delta * 3;

      if (this.mag.position.y < -0.7) {
        this.scene.remove(this.mag);
        this.mag.geometry.dispose();
        this.mag.material.dispose();
        this.mag = null;
      }
    }

    if (!poses?.reloadOut || t <= 0 || t >= 1) {
      this.magDropped = false;
      return;
    }

    if (!this.magDropped && t >= RELOAD_DROP) {
      this.magDropped = true;
      this.#dropMagazine();
    }

    let from;
    let to;
    let k;

    if (t < RELOAD_DOWN) {
      from = poses.rest;
      to = poses.reloadOut;
      k = smooth(t / RELOAD_DOWN);
    } else if (t < RELOAD_SEAT) {
      from = poses.reloadOut;
      to = poses.reloadOut;
      k = 0;
    } else if (t < RELOAD_UP) {
      from = poses.reloadOut;
      to = poses.reloadIn;
      k = smooth((t - RELOAD_SEAT) / (RELOAD_UP - RELOAD_SEAT));
    } else {
      from = poses.reloadIn;
      to = poses.rest;
      k = smooth((t - RELOAD_UP) / (1 - RELOAD_UP));
    }

    this.group.position.set(
      THREE.MathUtils.lerp(from.p.x, to.p.x, k),
      THREE.MathUtils.lerp(from.p.y, to.p.y, k),
      THREE.MathUtils.lerp(from.p.z, to.p.z, k)
    );
    this.group.rotation.set(
      THREE.MathUtils.lerp(from.r.x, to.r.x, k),
      THREE.MathUtils.lerp(from.r.y, to.r.y, k),
      THREE.MathUtils.lerp(from.r.z, to.r.z, k)
    );

    // solavanco de encaixe do carregador novo
    if (t >= RELOAD_SEAT && t < RELOAD_SEAT + 0.06) {
      this.group.position.y -= 0.018;
    }
  }

  /**
   * Sobe a arma até o olho. Quanto mais mirado, menos o balanço e o atraso
   * da mão valem: mirar tem que estabilizar a imagem, senão não adianta.
   */
  #applyAim(player) {
    const aim = player.gun?.aim ?? 0;
    const kick = player.gun?.kick ?? 0;
    this.aim = aim;   // quem calcula a boca do cano precisa dele fora do frame
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

  /**
   * Boca do cano em espaço de câmera. Devolve false quando não há cano —
   * mão vazia, faca, ou modelo sem marcador — e aí quem atira usa o olho.
   *
   * A cena do viewmodel É o espaço da câmera: a câmera dele nunca sai da
   * origem nem gira, só troca de aspecto. É isso que permite levar a boca pro
   * mundo com a matriz da câmera do jogo e mais nada.
   *
   * `zero` é a arma como ela está sendo segurada pra atirar — descanso
   * misturado com a mira de ferro, sem corrida, sem coice e sem balanço. O
   * desvio contra ela é o que torce o tiro; ver items/muzzle.js.
   */
  readMuzzle(out) {
    if (!this.muzzle || !this.pose) return false;

    this.muzzle.getWorldPosition(out.position);
    this.muzzle.getWorldQuaternion(out.quaternion);

    // parte fixa da orientação: o que o modelo e o marcador põem por cima do
    // grupo. Sai por diferença, então serve pra qualquer item
    localQuaternion.copy(this.group.quaternion).invert().multiply(out.quaternion);

    const { rest, ads } = this.pose;
    const zeroPose = ads ?? rest;
    zeroEuler.set(
      THREE.MathUtils.lerp(rest.r.x, zeroPose.r.x, this.aim),
      THREE.MathUtils.lerp(rest.r.y, zeroPose.r.y, this.aim),
      THREE.MathUtils.lerp(rest.r.z, zeroPose.r.z, this.aim)
    );
    out.zero.setFromEuler(zeroEuler).multiply(localQuaternion);

    return true;
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
