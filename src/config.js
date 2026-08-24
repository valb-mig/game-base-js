// Todos os números que valem a pena mexer ficam aqui.

export const PLAYER = {
  HEIGHT: 1.7,
  CROUCH_HEIGHT: 0.95,
  PRONE_HEIGHT: 0.5,
  CROUCH_TIME: 0.14,   // segundos pra agachar/levantar por inteiro
  PRONE_TIME: 0.32,    // deitar e sair do chão custa mais
  CROUCH_TOGGLE: true, // true = C alterna, false = C segura
  RADIUS: 0.4,
  STEP_HEIGHT: 0.35,   // degrau que o jogador sobe sem pular

  // velocidades máximas, em m/s
  WALK_SPEED: 5,
  RUN_SPEED: 8.4,
  CROUCH_SPEED: 2.3,
  PRONE_SPEED: 1,
  BACK_PENALTY: 0.75,  // andar de ré é mais lento

  // Muitos teclados de membrana não conseguem registrar W + Shift + Espaço ao
  // mesmo tempo (ghosting: as três teclas dividem trilha na matriz). Com
  // RUN_TOGGLE, Shift é um toque que liga/desliga a corrida em vez de ficar
  // segurado — aí nunca há três teclas juntas.
  RUN_TOGGLE: true,

  // aceleração, em m/s²
  ACCEL: 55,
  DECEL: 65,
  AIR_ACCEL: 16,       // controle no ar: dá pra corrigir, não pra virar de esquina
  AIR_DRAG: 2,

  GRAVITY: 24,
  JUMP_SPEED: 8,
  JUMP_CUT: 0.45,      // soltar espaço no meio da subida corta o pulo
  JUMP_MIN_SPEED: 5.2, // ...mas nunca abaixo disso: um toque rápido ainda pula
  COYOTE_TIME: 0.12,   // ainda dá pra pular logo depois de sair da borda
  JUMP_BUFFER: 0.15,   // pulo apertado pouco antes de tocar o chão vale

  // acabamento de câmera — puro visual, não afeta colisão
  VIEW_RECOVER: 14,
  LAND_DIP: 0.03,
  LAND_DIP_MAX: 0.3,
  BOB_AMPLITUDE: 0.035,
  BOB_FREQUENCY: 1.9
};

export const WORLD = {
  SIZE: 200,
  PROP_COUNT: 120,
  SPAWN_CLEARANCE: 8,
  SKY_COLOR: 0x87ceeb,
  GROUND_COLOR: 0x6a9a3f,
  GRID_COLOR: 0x4c7a2a,
  TREE_COLOR: 0x2f6b3a,
  PALETTE: [0xd94f4f, 0xe0a02f, 0x3f7ad9, 0xa050c0, 0xe8e0d0],
  FOG_NEAR: 40,
  FOG_FAR: 140,
  // corredor reservado pra pista de teste (props aleatórios não entram)
  COURSE_HALF_WIDTH: 9,
  COURSE_END_Z: -58
};

export const CAMERA = {
  FOV: 70,
  NEAR: 0.1,
  FAR: 400
};
