import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { PLAYER } from '../config.js';
import { getClass, DEFAULT_CLASS_ID } from '../items/classes.js';
import { STAND } from './constants.js';
import { updateStance } from './stance.js';
import { moveHorizontal, moveVertical } from './locomotion.js';
import { updateView, describeState } from './view.js';

/**
 * Estado do jogador e a ordem em que os sistemas rodam.
 *
 * A mecânica em si mora nos módulos ao lado — postura, locomoção, câmera.
 * Eles recebem esta instância e mexem no estado direto, então tudo que
 * importa é público de propósito: são sistemas sobre uma entidade, não
 * objetos escondendo dados uns dos outros.
 */
export class Player {
  constructor(camera, domElement, colliders) {
    this.controls = new PointerLockControls(camera, domElement);
    this.colliders = colliders;

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

    // vetores reaproveitados a cada frame, pra não alocar no loop
    this.wish = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.state = 'parado';

    this.object.position.set(0, this.stats.HEIGHT, 0);

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
    // por ora a faca é a única coisa que existe de fato na mão
    this.equipped = classDef.loadout.find((item) => item.slot === 'Corpo a corpo') ?? null;
  }

  /** Volta pro spawn de pé, com a vida cheia. */
  respawn() {
    this.height = this.stats.HEIGHT;
    this.eyeY = this.stats.HEIGHT;
    this.floorY = 0;
    this.stance = STAND;
    this.prone = false;
    this.crouchLatched = false;
    this.runLatched = false;
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.onGround = true;
    this.health = this.maxHealth;
    this.object.position.set(0, this.stats.HEIGHT, 0);
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

  // A ordem importa: a postura decide a altura do corpo, a locomoção
  // resolve colisão com essa altura, e a câmera só então é escrita.
  update(delta) {
    updateStance(this, delta);
    moveHorizontal(this, delta);
    moveVertical(this, delta);
    updateView(this, delta);
    this.state = describeState(this);
  }
}
