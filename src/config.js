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
  // O rio corre no fundo de um VALE, e são dois cortes, não um.
  //
  // Com um corte só, a margem tinha que vencer 18,5 m em 44, ou seja 0,42 de
  // declividade — muito acima de DECLIVE_TERRA. O rio saía dentro de um
  // paredão de barro de ponta a ponta do mapa, e o que se via não era um vale
  // com rio: era uma vala. Medido no vale novo: 0,05 na descida larga (grama
  // até a beira) e 0,27 na barranca do canal, uma faixa de 26 m de terra
  // exposta rente à água — que é onde barranca de rio fica mesmo.
  VALE_MARGEM: 190,       // meia-largura do vale inteiro
  VALE_PROFUNDIDADE: 7,   // quanto o vale afunda o planalto

  RIO_LARGURA: 20,        // leito plano, meia-largura
  RIO_MARGEM: 46,         // a barranca do canal
  RIO_FUNDO: 10,          // altura do leito

  // O rio TEM água, e ela corre acima do mar: 2,4 m de lâmina sobre o leito.
  // Fundo seco não é rio, é vala — e a vala não é gargalo de nada, porque se
  // atravessa correndo. Acima de SWIM_DEPTH (1,3 m) de propósito: atravessar
  // a nado custa mais que o dobro do tempo e deixa o corpo à mostra, e é
  // isso que faz a ponte valer a briga.
  RIO_NIVEL: 12.4,

  // Três pontes de concreto, e agora o rio passa POR BAIXO delas: antes o
  // terreno simplesmente não era cavado ali, o que dava uma língua de grama
  // atravessando o rio e ponte nenhuma. Só o X entra aqui — o Z sai do
  // próprio leito, senão o mapa teria duas fontes de verdade sobre onde o
  // rio passa, e elas se separariam no primeiro ajuste.
  PONTES: [-600, -100, 430],
  PONTE_LARGURA: 9,       // largura do tabuleiro, de guarda-corpo a guarda-corpo

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

  // Três vezes o que era. 1400 sobre a área de grama davam uma árvore a cada
  // 43 m mesmo depois da máscara de densidade — mata que se atravessa sem
  // desviar de nada não é mata. Só deu pra subir depois do índice espacial de
  // `world/colisores.js`: medido, a varredura linear de colisores custava
  // 4,57 ms por quadro com 4 mil deles (27% do orçamento a 60 fps) e passou a
  // custar 0,011 ms.
  TREE_COUNT: 4200,
  ROCK_COUNT: 340,

  // ---------------------------------------------------- densidade de mata
  // A máscara que decide onde a floresta é grossa e onde não há floresta
  // nenhuma. Escala é o tamanho da mancha: 0,006 dá célula de ruído de 167 m,
  // e com a segunda oitava as bordas quebram a cada 78 m. Mancha muito menor
  // que isso vira mato salpicado, e o jogador nunca decide contornar nada.
  //
  // Duas oitavas, não três: a terceira só recorta a borda da mata em dente de
  // serra, sem mudar onde a mata está. E mexer em qualquer um dos dois exige
  // remedir os cortes de `world/densidade.js` — eles são percentis.
  FLORESTA_ESCALA: 0.006,
  FLORESTA_OITAVAS: 2,

  // Arbusto só nasce em grama, e é o único prop que quebra. 1600 sobre os
  // 2,6 km² de grama dá um a cada 40 m — perto o bastante pra haver mato na
  // briga, longe o bastante pra não ser carpete.
  BUSH_COUNT: 2400,

  // ------------------------------------------------------------- cores
  // Céu encoberto da Normandia em junho, não dia de verão. O azul de antes
  // achatava o mapa: com tudo claro e a luz vinda de todo lado, mata e campo
  // liam igual. Nublado dá contraste de valor entre chão e horizonte, e a
  // névoa da mesma cor faz a distância existir.
  SKY_COLOR: 0xbfc4c9,
  // Encoberto é DIA, e a primeira paleta errou isso: com o zênite em 0x4d5257
  // o topo do quadro ficava quase preto, e a tela inteira lia como noite
  // mesmo com o chão bem iluminado. Nuvem de junho é clara — o que ela tira é
  // o azul e a sombra dura, não a luz.
  // Os dois foram REAUTORADOS junto com a curva de tom, e não por gosto: a
  // textura do céu declarava sRGB os bytes que `THREE.Color` já tinha
  // convertido pra linear, ou seja o shader convertia de novo e o céu saía
  // escuro. Estas constantes tinham sido escolhidas COMPENSANDO esse erro —
  // com ele corrigido, o mesmo par deu um céu de brilho 185 e croma 0,022, ou
  // seja branco lavado sem cor nenhuma. Medido no enquadramento da vila:
  //
  //   par                    brilho do céu   croma do céu
  //   0x818890 / 0xd6dade        185,4          0,022
  //   0x6e7783 / 0xb9c2cc        169,2          0,054
  //
  // O segundo é o que devolve a cor: cinza-azulado de nuvem fechada, com o
  // horizonte claro e frio. Encoberto continua sendo DIA — o que se tirou foi
  // o branco de estouro, não a luz. E a diferença entre 185 e 169 parece pouca
  // escrita: o que ela vale é a barriga de nuvem voltar a aparecer, que em 185
  // estava dentro do branco.
  //
  // E `SKY_HORIZONTE` não é só o céu: é a névoa e é a luz de cúpula. Uma
  // fonte só, de propósito — se a distância se dissolvesse numa cor que o céu
  // não tem, a linha do horizonte ganhava uma faixa que não está lá.
  SKY_TOPO: 0x6e7783,      // barriga de nuvem no zênite
  SKY_HORIZONTE: 0xb9c2cc,  // clareia até a linha do horizonte
  SOL_COR: 0xffeedd,
  SOL_ALTURA: 0.34,        // altura do sol na abóbada, 0 = horizonte, 1 = zênite
  SOL_AZIMUTE: 2.4,        // de onde ele vem, em radianos

  WATER_COLOR: 0x2e6d80,
  // Rio é mais verde e mais opaco que o mar: água rasa sobre leito de lodo,
  // não vinte metros de oceano.
  RIO_COR: 0x3c6a5e,
  DEEP_WATER_COLOR: 0x14323d,
  SAND_COLOR: 0xd8c89a,

  // A vegetação foi REPINTADA quando a curva de tom entrou, e a conta está em
  // `tools/paleta-vegetacao.py`: croma alvo de 0,42, empurrão de matiz pro
  // amarelo, e o brilho de cada cor devolvido no fim.
  //
  // O motivo é medido. AgX desatura no CLARO, e o quadro precisava escurecer
  // pra ter preto: no mesmo enquadramento da vila, baixar a luz levou o
  // percentil 1 do brilho de 77,9 pra 67,0 — e a croma média SUBIU de 0,190
  // pra 0,211, porque o valor mais escuro cai na parte da curva que ela não
  // lava. Ou seja o verde neon volta exatamente quando se ganha contraste. A
  // curva não podia resolver isso sozinha; a saturação tinha que sair da
  // FONTE, e é o que jogo nenhum de guerra faz de outro jeito — em BF a grama
  // já é oliva na textura, não oliva por causa do grading.
  //
  // O brilho é devolvido de propósito: mexer nele junto mudaria o valor da
  // mata, e é o contraste de valor entre mata e campo que diz a distância.
  // Medido, as seis cores ficaram a menos de 0,5 de luma de onde estavam.
  GRASS_COLOR: 0x6f854d,  // croma 0,568 -> 0,421
  DIRT_COLOR: 0x7c6448,   // barranco pelado, onde a grama não pega — croma 0,440 -> 0,419
  // O pinheiro é o único que NÃO leva o empurrão pro amarelo: ele é frio de
  // propósito (azul acima do vermelho), e amarelá-lo o deixava mais quente que
  // a folhosa — as duas espécies existem pra se distinguir a cem metros, e a
  // cor é a única coisa que faz isso.
  TREE_COLOR: 0x3b6643,   // agulha de pinheiro, escura e fria — croma 0,561 -> 0,422
  FOLHA_COLOR: 0x5e7343,  // folhagem, mais quente e mais clara — 0,607 -> 0,417
  FOLHA_CLARA: 0x6f854d,  // a parte de cima da copa, onde bate a luz — 0,593 -> 0,421
  TRUNK_COLOR: 0x4a3524,
  ROCK_COLOR: 0x7b7f80,
  BUSH_COLOR: 0x52693d,      // 0,580 -> 0,419
  BUSH_COLOR_DARK: 0x3b4d2c, // 0,585 -> 0,429
  // Terra revolvida era o tom mais saturado do mapa depois da vegetação. A
  // areia (0,287) e o caminho de terra (0,365) passam INTACTOS: o 0,42 é teto,
  // não alvo, e aplicado como alvo ele deixava a praia amarela.
  SOIL_COLOR: 0x66543b,   // terra revolvida, onde a pá passou — croma 0,514 -> 0,422
  // Asfalto de 1945 é macadame betuminoso: cinza-pardo gasto, não piche novo.
  // Em 0x4a4a48 a pista lia como uma faixa preta no meio do capim, e é o
  // contraste que fazia ela parecer o dobro da largura que tem.
  ASFALTO: 0x5d5b55,      // estrada e tabuleiro de ponte
  TERRA_BATIDA: 0x9c8763, // caminho de terra

  // A névoa fecha bem mais longe que na ilha: num mapa de dois quilômetros,
  // 320 m de alcance esconderia o mapa inteiro do jogador.
  //
  // Mas 260 a 1400 era o outro extremo: com o engajamento mais longo do mapa
  // em 700 m, a névoa só começava a agir depois de tudo que se pode atirar, e
  // a mata a 600 m saía com a mesma saturação do capim a 20. Sem essa perda de
  // contraste com a distância não existe leitura de profundidade nenhuma — é o
  // que faz um quadro parecer maquete.
  //
  // 130 a 1050 põe a névoa DENTRO do alcance de tiro: a 700 m sobra 12% do
  // valor original, a 300 m sobra 82%, e o vulto distante fica mais claro e
  // mais pálido que o próximo sem deixar de ser visível — que é a única coisa
  // que a névoa não pode fazer num jogo de tiro.
  FOG_NEAR: 130,
  FOG_FAR: 1050,

  COURSE_LENGTH: 52,

  // Raio da área jogável, medido do centro. Existe pra que floresta e
  // sorteios saibam onde parar sem cada um inventar o próprio limite.
  ISLAND_RADIUS: 980
};


/**
 * Gradação de cor: a curva de tom e a exposição com que a cena vira pixel.
 *
 * Não é enfeite — é o que separa "cores certas" de "quadro que lê como jogo".
 * Sem curva nenhuma (o estado anterior), o verde da grama saía neon e o
 * telhado saía chapado, porque nada rolava os claros: o valor era escrito na
 * tela como estava.
 *
 * A curva foi ESCOLHIDA medindo as sete que o three oferece, em
 * `tools/bancada-grade.html`, contra o desvio de cromaticidade das sete cores
 * de chão que aparecem em quadro. Só uma desatura:
 *
 *   curva      grama   pinheiro  folha   areia   luma do chão
 *   nenhuma    0        0         0       0      106,5
 *   Reinhard  -0,042   -0,030    -0,034  -0,091  112,0
 *   Cineon    +0,093   +0,168    +0,137  -0,100  122,9
 *   ACESFilmic +0,032  +0,207    +0,068  -0,129  129,9
 *   AgX       -0,152   -0,144    -0,126  -0,144  134,9
 *   Neutral   +0,217   +0,284    +0,253  +0,020  103,0
 *
 * ACES e Cineon — as escolhas óbvias — SATURAM o verde e esmagam a sombra
 * (o pinheiro perde o canal vermelho de 41 pra 26), ou seja empurram
 * justamente pro neon que se queria corrigir. AgX é a única que tira croma de
 * tudo e levanta o brilho ao mesmo tempo: claro desbotado e cor contida, que
 * é o tratamento de um dia encoberto.
 */
export const GRADE = {
  /**
   * Exposição. AgX é escura por construção — ela reserva alcance pro claro
   * que não existe numa cena sem HDR, e em 1,0 o mapa lê como fim de tarde.
   */
  EXPOSICAO: 1.6,

  /**
   * As duas luzes vivem aqui, e não soltas em `stage.js`, porque elas são
   * METADE da gradação: a curva decide como o valor vira pixel, e a luz decide
   * qual valor entra na curva. Ajustar uma sem a outra é perseguir o próprio
   * rabo.
   *
   * A hemisférica caiu de 2,9 pra 1,9 quando a curva entrou, e não é gosto: os
   * 2,9 foram calibrados pra um render SEM curva nenhuma, onde o valor ia pra
   * tela como estava. AgX levanta o quadro inteiro — medido no mesmo
   * enquadramento da vila, o percentil 1 do brilho subiu de 60,9 pra 77,9 e a
   * mediana de 108,7 pra 139,5. Preto que não é preto é o que faz um quadro ler
   * como chapado, e com a curva por cima os 2,9 viraram excesso.
   *
   * A direcional sobe na mesma conta. Ela é o único jeito de o quadro ter
   * FORMA: com luz só de cúpula, telhado, parede e chão chegam no mesmo valor e
   * a silhueta da casa desaparece — o que se via era um bloco claro sobre um
   * chão claro. Encoberto tem pouca sombra, não sombra nenhuma.
   */
  HEMISFERICA: 1.45,
  DIRECIONAL: 1.7,

  /** A cor que a luz de cúpula devolve por baixo: o chão batendo de volta. */
  BOUNCE: 0x7b8558
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

  // A bala do BOT não cai: ele mira com atraso e erro de propósito, e somar
  // queda a isso seria um segundo erro que o jogador não tem como ler. A do
  // JOGADOR cai por GRAVITY — a queda é mecânica dele, medida na depuração.
  BOT_GRAVITY: 0,

  // Um traçante a cada quatro tiros, como nas fitas da guerra. Estava em 1
  // por causa de uma bancada; com 300 bots em campo isso é um risco por tiro,
  // mais de mil por segundo, e o traçante deixa de dizer de onde vem o fogo
  // porque tudo vira risco.
  TRACER_EVERY: 4,
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
