import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { PLAYER } from '../config.js';
import { hasModel } from '../items/models.js';
import { getClass, DEFAULT_CLASS_ID, SLOT_ORDER } from '../items/classes.js';
import { STAND } from './constants.js';
import { updateStance } from './stance.js';
import { moveHorizontal, moveVertical } from './locomotion.js';
import { updateView, describeState } from './view.js';
import { lookPitch } from './heading.js';
import { updateWaterState, swim } from './swim.js';
import { spectate } from './spectator.js';

/**
 * Estado do jogador e a ordem em que os sistemas rodam.
 *
 * A mecânica em si mora nos módulos ao lado — postura, locomoção, câmera.
 * Eles recebem esta instância e mexem no estado direto, então tudo que
 * importa é público de propósito: são sistemas sobre uma entidade, não
 * objetos escondendo dados uns dos outros.
 */
export class Player {
  constructor(camera, domElement, world = {}) {
    this.controls = new PointerLockControls(camera, domElement);

    this.colliders = world.colliders ?? [];
    this.terrain = world.terrain ?? null;   // campo de altura; sem ele o chão é y=0
    this.spawn = world.spawn ?? new THREE.Vector3(0, 0, 0);

    // stats precisa existir antes de qualquer leitura de altura ou velocidade
    this.setClass(getClass(DEFAULT_CLASS_ID));

    // Posição lógica: a física manda em eyeY, e só no fim do frame ela vira
    // camera.position.y somada aos enfeites (degrau, aterrissagem, balanço).
    this.eyeY = this.stats.HEIGHT;
    this.floorY = 0;
    this.height = this.stats.HEIGHT;

    this.velocity = new THREE.Vector3();
    this.verticalVelocity = 0;
    this.onGround = true;

    this.stance = STAND;
    this.prone = false;
    this.crouchLatched = false;
    this.running = false;
    this.runLatched = false;

    this.coyote = this.stats.COYOTE_TIME;
    this.jumpBuffer = 0;
    this.jumpCutPending = false;

    this.viewOffset = 0;
    this.bobPhase = 0;

    // golpe em andamento; quem mexe é items/attack.js, quem desenha é o viewmodel
    this.swing = { active: false, progress: 0, cooldown: 0, buffered: 0 };

    // arma de fogo; quem mexe é items/firearm.js. `aim` é 0..1, contínuo,
    // porque a arma sobe e desce do olho em vez de teleportar pra mira
    this.gun = { cooldown: 0, reloading: 0, reloadProgress: 0, aim: 0, flash: 0, kick: 0 };

    // pazada em andamento; quem mexe é items/digging.js. `carga` é 0 ou 1:
    // a pá leva uma pazada de cada vez, e é isso que faz cavar virar sequência
    this.dig = { modo: null, progresso: 0, cooldown: 0, carga: 0, falhou: null };

    // água — atualizado todo frame por updateWaterState
    this.spectating = false;   // fantasma: voa, não colide, não é atingido
    this.alive = true;
    this.swimming = false;
    this.waterDepth = 0;
    this.submerged = 0;
    this.headUnderwater = false;
    this.lookPitch = 0;

    // vetores reaproveitados a cada frame, pra não alocar no loop
    this.wish = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.state = 'parado';

    this.respawn();

    // sem isso o jogador continua deslizando quando a aba volta do ESC
    this.controls.addEventListener('unlock', () => {
      this.velocity.set(0, 0, 0);
    });
  }

  /**
   * Troca a classe: perfil de movimento e vida. O config global vira o
   * padrão, e a classe sobrescreve só o que declarar em `movement`.
   */
  setClass(classDef) {
    this.classDef = classDef;
    this.stats = { ...PLAYER, ...classDef.movement };
    this.maxHealth = classDef.health;
    this.health = classDef.health;
    this.carried = this.carriedOf(classDef);
    this.slot = this.firstSlot();
    this.equipped = this.carried[this.slot] ?? null;
  }

  /**
   * O que a classe leva na mão, por slot: `carried[0]` é a primária,
   * `carried[1]` a secundária e `carried[2]` a faca. Slot sem item construído
   * fica `null` — o resto do loadout é texto de tela até alguém modelar.
   *
   * Posição fixa em vez de lista compactada porque a tecla é a posição: com
   * lista, largar a pistola faria a faca virar o 1, e a mão do jogador já
   * tinha decorado onde ela estava.
   */
  carriedOf(classDef) {
    return SLOT_ORDER.map((slot) =>
      classDef.loadout.find((item) => item.slot === slot && hasModel(item)) ?? null);
  }

  /** Primeiro slot com item; 0 se a classe não leva nada construído. */
  firstSlot() {
    const index = this.carried.findIndex(Boolean);
    return index < 0 ? 0 : index;
  }

  /** Troca o item na mão pelo do índice pedido. */
  selectSlot(index) {
    if (index < 0 || index >= this.carried.length) return false;
    if (!this.carried[index]) return false;   // slot vazio não responde
    if (this.slot === index) return false;

    this.slot = index;
    this.equipped = this.carried[index];
    this.swing.active = false;
    this.gun.reloading = 0;
    this.gun.aim = 0;
    this.dig.modo = null;
    this.dig.progresso = 0;
    return true;
  }

  /**
   * Tira da mão o item atual e esvazia o slot dele. Devolve o item.
   *
   * O slot continua sendo o mesmo, agora vazio: mão vazia é estado de jogo
   * válido, e o jogador ainda pode ir pra outro slot com 1, 2 ou 3.
   */
  dropCarried() {
    const item = this.equipped;
    if (!item) return null;

    this.carried[this.slot] = null;
    this.equipped = null;
    return item;
  }

  /**
   * O slot deste item está livre?
   *
   * Quem apanha do chão pergunta isto, e não "a mão está vazia": com slot
   * fixo, largar a pistola e ficar com a faca na mão não pode impedir de
   * apanhar a pistola — o lugar dela continua vago.
   */
  canTake(item) {
    const index = SLOT_ORDER.indexOf(item?.slot);
    return index >= 0 && !this.carried[index];
  }

  /**
   * Guarda um item no slot dele e põe na mão. Devolve false se o slot já
   * está ocupado — cada arma tem lugar fixo, e apanhar não empurra nada.
   */
  takeCarried(item) {
    const index = SLOT_ORDER.indexOf(item.slot);
    if (index < 0 || this.carried[index]) return false;

    this.carried[index] = item;
    this.slot = index;
    this.equipped = item;
    return true;
  }

  /** Entra em modo espectador: fantasma, sem colisão e sem gravidade. */
  spectateFrom(x, y, z) {
    this.spectating = true;
    this.alive = false;
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.eyeY = y;
    this.object.position.set(x, y, z);
    this.state = 'espectando';
  }

  /** Volta pro ponto de nascimento, de pé e com a vida cheia. */
  respawn() {
    const ground = this.terrain
      ? this.terrain.heightAt(this.spawn.x, this.spawn.z)
      : this.spawn.y;

    this.height = this.stats.HEIGHT;
    this.eyeY = ground + this.stats.HEIGHT;
    this.floorY = ground;
    this.stance = STAND;
    this.prone = false;
    this.crouchLatched = false;
    this.runLatched = false;
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.onGround = true;
    this.swimming = false;
    this.spectating = false;
    this.alive = true;
    this.health = this.maxHealth;
    this.swing.active = false;
    this.swing.progress = 0;
    this.swing.cooldown = 0;
    this.swing.buffered = 0;
    this.gun.reloading = 0;
    this.gun.aim = 0;
    this.dig.modo = null;
    this.dig.progresso = 0;
    this.dig.carga = 0;
    // nascer de novo devolve o equipamento: o que ficou no chão fica lá
    this.carried = this.carriedOf(this.classDef);
    this.slot = this.firstSlot();
    this.equipped = this.carried[this.slot] ?? null;
    this.object.position.set(this.spawn.x, this.eyeY, this.spawn.z);
  }

  get object() {
    return this.controls.object;
  }

  get isLocked() {
    return this.controls.isLocked;
  }

  get feetY() {
    return this.eyeY - this.height;
  }

  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  /**
   * Tira vida. Devolve true se este dano matou.
   *
   * Espectador não é atingido — ele não está no jogo, está olhando.
   */
  damage(amount) {
    if (!this.alive || this.spectating) return false;

    this.health = Math.max(0, this.health - amount);
    if (this.health > 0) return false;

    this.alive = false;
    return true;
  }

  // A ordem importa: a postura decide a altura do corpo, a locomoção
  // resolve colisão com essa altura, e a câmera só então é escrita.
  update(delta) {
    this.lookPitch = lookPitch(this.object.quaternion, this.right);

    if (this.spectating) {
      spectate(this, delta);
      return;
    }

    updateWaterState(this);

    if (this.swimming) {
      // nadar é modo próprio: postura não se aplica, e o C vira mergulho
      this.stance = STAND;
      this.prone = false;
      this.crouchLatched = false;
      this.height = this.stats.HEIGHT;
      swim(this, delta);
    } else {
      updateStance(this, delta);
      moveHorizontal(this, delta);
      moveVertical(this, delta);
    }

    updateView(this, delta);
    this.state = describeState(this);
  }
}
