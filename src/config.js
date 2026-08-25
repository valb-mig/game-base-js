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
  // Quanto o piso pode variar num quadro e ainda ser ladeira, como tangente
  // da inclinação: tan(58°). Multiplicado pelo que o jogador andou no quadro,
  // vira o limite entre descer uma rampa e cair de uma beirada.
  SNAP_SLOPE: 1.6,
  VIEW_RECOVER: 14,
  LAND_DIP: 0.03,
  LAND_DIP_MAX: 0.3,
  BOB_AMPLITUDE: 0.035,
  BOB_FREQUENCY: 1.9
};

export const WORLD = {
  MAP_NAME: 'Sainte-Mère',
  MAP_ERA: 'Normandia · 1944',

  // Dois quilômetros de lado, com 2,5 m por vértice da malha. A resolução não
  // é escolha estética: abaixo de ~2,6 m a pazada cai entre dois vértices e
  // cavar deixa de registrar. Medido: montar essa malha custa 0,64 s uma vez,
  // e desenhar custa 0,06 ms por quadro.
  SIZE: 2000,
  TERRAIN_SEGMENTS: 800,

  // ------------------------------------------------------------- litoral
  // O mar fica ao NORTE (z negativo). A praia é a faixa de desembarque, e
  // logo atrás dela sobe a escarpa que dá vista pra ela — é a geografia que
  // faz o ponto 01 ser difícil e o 02 valer a pena.
  MAR_ATE: -880,          // ao norte disto é água
  PRAIA_ATE: -742,        // faixa de areia
  ESCARPA_ATE: -600,      // subida atrás da praia
  ALTURA_PLANALTO: 24,    // o interior, onde ficam vila e fazenda
  SEA_DEPTH: 22,

  // --------------------------------------------------------------- rio
  // Corta o mapa na diagonal, do sudoeste pro nordeste. Ele e as pontes são
  // o gargalo do sul do mapa.
  RIO_Z: 194,             // z do leito em x=0
  RIO_INCLINACAO: -0.224, // quanto o leito desce por metro de x
  RIO_ONDA: 34,           // amplitude da serpentina: rio reto lê como vala
  RIO_LARGURA: 34,
  RIO_MARGEM: 78,         // a rampa das margens
  RIO_FUNDO: 5.5,         // altura do leito

  // Pontes: buracos no rio onde o terreno não é cavado. Só o X entra aqui —
  // o Z sai do próprio leito, senão o mapa teria duas fontes de verdade
  // sobre onde o rio passa, e elas se separariam no primeiro ajuste.
  PONTES: [-473, 330],
  PONTE_LARGURA: 26,

  // ------------------------------------------------------------- colinas
  COLINAS: [
    { x: -549, z: -418, raio: 210, altura: 15 },   // Bunker da Colina
    { x: 301, z: 351, raio: 190, altura: 13 }      // Moinho
  ],

  RELIEF: 4.2,            // amplitude do ruído que ondula o interior
  RELIEF_SCALE: 0.004,    // frequência (menor = colina mais larga)

  WATER_LEVEL: 0,
  SAND_UNTIL: 2.6,        // até essa altura o terreno é areia, não capim

  // Acima dessa declividade (metro por metro) a grama não pega e fica terra.
  // Medido no mapa inteiro: a mediana em terra seca é 0,019 e o percentil 95
  // é 0,246. 0,16 pega o meio da escarpa (0,21) e as margens do rio (0,63) e
  // deixa planalto (0,02) e flanco de colina (0,08) de grama — 8,5% do mapa
  // vira terra. Terra é a exceção, e é a exceção nos lugares que importam.
  DECLIVE_TERRA: 0.16,

  // Onde cada exército desembarca. Ao sul do rio, os dois: a frente anda de
  // sul pra norte, e é isso que faz as pontes serem gargalo pros dois lados.
  BASE_VESTRIA: { x: -693, z: 696 },
  BASE_KARNIA: { x: 638, z: 745 },
  COURSE_ORIGIN: { x: -880, z: 830 },   // campo de treino, num canto

  TREE_COUNT: 1400,
  ROCK_COUNT: 260,

  // Arbusto só nasce em grama, e é o único prop que quebra. 1600 sobre os
  // 2,6 km² de grama dá um a cada 40 m — perto o bastante pra haver mato na
  // briga, longe o bastante pra não ser carpete.
  BUSH_COUNT: 1600,

  // ------------------------------------------------------------- cores
  SKY_COLOR: 0x9ec6dd,
  WATER_COLOR: 0x2e6d80,
  DEEP_WATER_COLOR: 0x14323d,
  SAND_COLOR: 0xd8c89a,
  GRASS_COLOR: 0x5f8b3c,
  DIRT_COLOR: 0x7d6446,   // barranco pelado, onde a grama não pega
  TREE_COLOR: 0x2f6b3a,
  TRUNK_COLOR: 0x4a3524,
  ROCK_COLOR: 0x7b7f80,
  BUSH_COLOR: 0x40702f,
  BUSH_COLOR_DARK: 0x2d5222,
  SOIL_COLOR: 0x6b5334,   // terra revolvida, onde a pá passou

  // A névoa fecha bem mais longe que na ilha: num mapa de dois quilômetros,
  // 320 m de alcance esconderia o mapa inteiro do jogador.
  FOG_NEAR: 260,
  FOG_FAR: 1400,

  COURSE_LENGTH: 52,

  // Raio da área jogável, medido do centro. Existe pra que floresta e
  // sorteios saibam onde parar sem cada um inventar o próprio limite.
  ISLAND_RADIUS: 980
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
  PICK_REACH: 2.4    // alcance no plano pra apanhar do chão; cobre a largada
};

/**
 * Dispersão pelo ESTADO DO CORPO, multiplicando a abertura da arma.
 *
 * Parado é zero: a bala vai exatamente onde a mira aponta, e acertar passa a
 * ser mérito de quem parou pra atirar. Isso é o que dá peso à decisão de
 * parar no meio de um tiroteio — a mais cara que existe, porque parado você
 * é alvo fácil.
 *
 * As outras faixas existem pra que essa escolha tenha degraus legíveis, e não
 * um interruptor de "certeiro" e "inútil".
 */
export const SPREAD = {
  PARADO: 0,        // sem dispersão nenhuma
  ANDANDO: 1,       // a abertura declarada na arma
  CORRENDO: 4.4,    // e o cano ainda sai de posição, por items/muzzle.js
  NO_AR: 6.5,       // pular é o pior lugar pra atirar, e tem que parecer

  // Abaixo disto o corpo conta como parado. Não é zero porque a velocidade
  // do quadro oscila em centésimos mesmo com a mão fora do teclado.
  PARADO_ATE: 0.35   // m/s
};

/**
 * Fôlego.
 *
 * Correr e pular gastam; parar recupera, depois de um respiro. O peso da arma
 * na mão entra em tudo, e é o que dá sentido a guardar a MP40 pra atravessar
 * um campo aberto: com a faca na mão a corrida rende quase o dobro.
 *
 * A escolha de projeto é que fôlego zerado NÃO trava o jogador — ele só perde
 * a corrida e o pulo. Jogador parado sem poder fazer nada é punição, não
 * mecânica.
 */
/**
 * Trocar de item leva tempo: guardar o que está na mão, e sacar o outro.
 *
 * Instantâneo, o cinto vira um botão de "arma certa pra cada situação" sem
 * custo nenhum — e a escolha de com o que andar deixa de existir. Aqui ela
 * custa segundos, e o peso decide quantos.
 */
export const SWAP = {
  GUARDAR: 0.22,          // base pra abaixar o que está na mão
  GUARDAR_POR_KG: 0.055,
  SACAR: 0.26,            // base pra erguer o novo
  SACAR_POR_KG: 0.075     // sacar custa mais que guardar: é o que se apronta
};

export const STAMINA = {
  MAX: 100,

  // Por segundo correndo, mais o que o peso da arma cobra por quilo.
  CORRIDA: 9,
  CORRIDA_POR_KG: 2.1,

  // Por pulo, mais o peso. Pular custa caro de propósito: pular pra frente é
  // atalho barato demais em jogo de tiro.
  PULO: 11,
  PULO_POR_KG: 1.8,

  RECUPERA: 17,        // por segundo, parado ou andando
  ESPERA: 0.9,         // segundos sem gastar antes de começar a recuperar

  // Abaixo disso ele não consegue arrancar de novo, pra não ficar piscando
  // entre correr e andar com o fôlego raspando.
  MINIMO_PRA_CORRER: 12
};

export const BULLET = {
  // Velocidade de boca real da .45 ACP. Com ela, 55 m levam 0,22 s — pouco,
  // mas o bastante pra queda aparecer e pra alvo em movimento exigir avanço.
  SPEED: 253,
  GRAVITY: 14,        // acima do real de propósito: queda precisa ser legível
  LIFE: 2.5,          // segundos até a bala desistir
  STEP: 0.6,          // subdivisão máxima do trecho por quadro, em metros

  // Quanto do desalinhamento do cano a bala herda. 1 é fisicamente honesto;
  // um pouco abaixo existe porque o atraso da mão numa virada de 180° chega a
  // 5° e não deveria custar o tiro inteiro.
  MUZZLE_BEND: 0.8,
  // Teto do desvio VERTICAL, em graus. O horizontal é livre: correndo, a arma
  // baixada e de lado joga a bala 38° pra esquerda, e isso é o que se quer
  // ver. Os 21° pra baixo da mesma pose não — enfiavam o tiro no chão a dois
  // metros, e o jogador não lê isso como "arma fora de posição", lê como bug.
  MUZZLE_RISE: 4,

  TRACER_EVERY: 4,    // um traçante a cada tantos tiros, como nas fitas da guerra
  // Comprido de propósito: atirando na direção do olhar o risco é visto de
  // ponta, e a 2,4 m virava um ponto. Assim ele lê como risco mesmo de frente.
  TRACER_LENGTH: 7,
  TRACER_WIDTH: 0.045,
  TRACER_COLOR: 0xffb347,
  TRACER_FADE: 0.09   // segundos de rastro depois que a bala some
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
