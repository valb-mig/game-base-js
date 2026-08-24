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

  // --- água ---
  SWIM_DEPTH: 1.3,        // a partir dessa profundidade nada em vez de andar
  SWIM_SPEED: 2.4,
  SWIM_FAST_SPEED: 3.6,   // com Shift
  SWIM_ACCEL: 12,
  SWIM_DRAG: 5,
  SWIM_RISE_SPEED: 2.2,   // espaço sobe, C desce
  BUOYANCY: 5,            // empuxo que devolve o jogador pra superfície
  FLOAT_EYE: 0.12,        // olhos acima da linha d'água boiando parado
  WADE_PENALTY: 0.6,      // quanto a água rasa freia quem anda
  WATER_EXIT_BOOST: 1.6,  // impulso pra sair da água pra praia

  GRAVITY: 24,
  JUMP_SPEED: 8,
  JUMP_CUT: 0.45,      // soltar espaço no meio da subida corta o pulo
  JUMP_MIN_SPEED: 5.2, // ...mas nunca abaixo disso: um toque rápido ainda pula
  COYOTE_TIME: 0.12,   // ainda dá pra pular logo depois de sair da borda
  JUMP_BUFFER: 0.15,   // pulo apertado pouco antes de tocar o chão vale

  // acabamento de câmera — puro visual, não afeta colisão
  STEP_VIEW_MIN: 0.12,  // subida mínima pra contar como degrau, não ladeira
  VIEW_RECOVER: 14,
  LAND_DIP: 0.03,
  LAND_DIP_MAX: 0.3,
  BOB_AMPLITUDE: 0.035,
  BOB_FREQUENCY: 1.9
};

export const WORLD = {
  MAP_NAME: 'Ilha Corvo',
  MAP_ERA: 'Pacífico · 1945',

  SIZE: 460,              // lado do mapa; a ilha fica no meio, mar até a borda
  TERRAIN_SEGMENTS: 180,  // resolução da malha do terreno

  // A ilha é uma parábola suavizada: alta no centro, cruzando o nível da
  // água exatamente em ISLAND_RADIUS. Passando disso, vira fundo de mar.
  ISLAND_RADIUS: 150,
  ISLAND_HEIGHT: 16,
  SEA_DEPTH: 14,
  RELIEF: 3.4,            // amplitude do ruído que ondula a floresta
  RELIEF_SCALE: 0.012,    // frequência do ruído (menor = colina mais larga)

  WATER_LEVEL: 0,
  SAND_UNTIL: 1.7,        // até essa altura o terreno é areia, não capim

  TREE_COUNT: 420,
  ROCK_COUNT: 90,
  TREE_LINE: 2.4,         // árvore não nasce abaixo disso: ali ainda é praia

  BASE_DISTANCE: 104,     // bases em z = ±BASE_DISTANCE, pontas opostas

  SKY_COLOR: 0x9ec6dd,
  WATER_COLOR: 0x2e6d80,
  DEEP_WATER_COLOR: 0x14323d,
  SAND_COLOR: 0xd8c89a,
  GRASS_COLOR: 0x5f8b3c,
  HIGHLAND_COLOR: 0x6f7a53,
  TREE_COLOR: 0x2f6b3a,
  TRUNK_COLOR: 0x4a3524,
  ROCK_COLOR: 0x7b7f80,
  FOG_NEAR: 70,
  FOG_FAR: 320,

  // Clareira do campo de treino: a oeste, no miolo da ilha. Longe das duas
  // bases de propósito — platôs de alturas diferentes não podem se encostar.
  COURSE_ORIGIN: { x: -58, z: -6 },
  COURSE_HALF_WIDTH: 11,
  COURSE_LENGTH: 52
};

export const DROP = {
  FORWARD: 1.5,      // impulso pra frente ao soltar, em m/s
  LIFT: 1.5,
  SPIN: 7,           // giro no ar, em rad/s
  GRAVITY: 18,
  WATER_DRAG: 3.2,   // dentro d'água o item desce devagar
  WATER_SINK: 1.1,   // velocidade terminal afundando
  SETTLE_TIME: 0.2,  // tempo pra assentar deitado depois de tocar o chão
  REACH: 0.55,       // distância à frente do rosto onde o item nasce
  PICK_REACH: 2.4    // alcance pra apanhar do chão; tem que cobrir a largada
};

export const MELEE = {
  SWING_TIME: 0.46,   // duração do golpe inteiro, em segundos
  DAMAGE_AT: 0.38,    // fração do golpe em que o dano é resolvido
  COOLDOWN: 0.1,      // respiro entre um golpe e o próximo
  BUFFER: 0.14,       // clique um tiquinho cedo ainda vale quando o respiro acaba
  HIT_FLASH: 0.12     // quanto tempo a marca de acerto fica na tela
};

export const CAMERA = {
  FOV: 70,
  ADS_FOV: 56,   // mirar aproxima; sem isso a mira de ferro só atrapalha a visão
  NEAR: 0.1,
  FAR: 400
};
