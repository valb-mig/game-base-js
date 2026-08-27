/**
 * A ficha do Jipe Willys MB. Dado puro: nenhum número daqui conhece three.
 *
 * Ela vive num arquivo próprio pelo mesmo motivo que `items/classes.js` —
 * quem ajusta o veículo mexe numa tabela, não na física. A física lê a ficha
 * e não sabe que jipe existe: outro veículo é outra ficha.
 *
 * As medidas são as do MB de verdade, e são as mesmas do `.glb`: entre-eixos
 * 2,03 m, bitola 1,30 m, pneu 6.00-16 (raio 0,39). Errar isso aqui faria a
 * roda desenhada girar num lugar e a roda física pisar noutro.
 *
 * EIXOS: frente é +Z, +X é a ESQUERDA (o MB é LHD, e o motorista está em +X).
 * A origem fica no chão, entre as quatro rodas.
 */

const RAIO_RODA = 0.39;
const ENTRE_EIXOS = 2.03;
const BITOLA = 1.30;

// Meia-medida: é assim que a posição de cada roda é escrita.
const ZF = ENTRE_EIXOS / 2;
const XW = BITOLA / 2;

export const JIPE = {
  id: 'jipe-willys',
  nome: 'Jipe Willys MB',

  // 1130 kg em ordem de marcha. Ele PRECISA parecer pesado: massa baixa faz
  // o carro dar respostas instantâneas e o que se sente é um patinete.
  MASSA: 1130,

  /**
   * Altura do centro de massa. É o número mais consequente da ficha inteira,
   * porque é ele que transfere peso na frenagem, na curva, e é o braço de
   * alavanca que CAPOTA o veículo. O MB é alto e estreito de verdade — 0,62 m
   * de CG contra 0,65 m de meia-bitola — e é por isso que ele capota.
   */
  ALTURA_CM: 0.62,

  RAIO_RODA,

  /**
   * A caixa do corpo, MEDIDA DA MALHA e não escrita à mão.
   *
   * Medido no `.glb`: x ±0,84 (a ponta dos para-lamas), y 0 a 1,46 (o topo do
   * para-brisa rebatido), z -1,60 a 1,66. Os números que estavam aqui eram
   * chute — 0,78 de meia-largura, 1,70 de meio-comprimento e uma "ALTURA_CAIXA"
   * de 1,35 que não correspondia a nada. O resultado era colisor 28 cm mais
   * alto que o jipe (parede invisível no ar), 6 cm estreito de cada lado, e
   * caixa de acerto que não encostava no desenho.
   *
   * A pegada da FÍSICA é simétrica em z (1,63, a média) porque a colisão gira
   * um retângulo; a HITBOX usa a assimetria de verdade, porque ali ela é de
   * graça.
   */
  MEIA_LARGURA: 0.84,
  MEIO_COMPRIMENTO: 1.63,
  ALTURA: 1.46,
  // Onde o assoalho começa: abaixo disto é vão de eixo, e quem responde por
  // essa faixa é a suspensão.
  PISO: 0.42,

  /**
   * O degrau que ele SOBE, em metros. É o raio da roda, e não um número novo.
   *
   * Uma roda sobe um obstáculo até mais ou menos o próprio raio: acima disso
   * ela bate no flanco em vez de rolar por cima. Derivar dele em vez de
   * escrever 0,4 à mão é o que impede os dois de se separarem no dia em que a
   * roda mudar de tamanho.
   *
   * Ele é maior que o `PLAYER.STEP_HEIGHT` (0,35) de propósito, e é por isso
   * que o veículo precisa do próprio: a roda passa onde a bota não passa.
   */
  DEGRAU: RAIO_RODA,

  /**
   * Suspensão. `TORRE` é onde a haste pendura no chassi, `HASTE_MAX` é ela
   * esticada e `CURSO` é o quanto ela tem pra comprimir.
   *
   * TORRE - HASTE_MAX = 0,39 = raio do pneu: com a mola totalmente estendida
   * o cubo cai exatamente onde o `.glb` desenha a roda em repouso. Sem essa
   * conta a roda desenhada flutuaria ou entraria no chão no quadro um.
   */
  TORRE: 0.72,
  HASTE_MAX: 0.33,
  CURSO: 0.18,

  /**
   * Mola e amortecedor, em N/m e N·s/m.
   *
   * Com 1130 kg em quatro rodas cada uma segura 2771 N; a 34 kN/m isso
   * comprime 8 cm, ou seja pouco menos da metade do curso — sobra viagem pra
   * absorver buraco e ainda não bater no fim.
   *
   * O amortecedor é ~0,4 do crítico (2·√(k·m/4) = 11 kN·s/m). Mais que isso e
   * a suspensão trava e o jipe anda como um bloco; menos e ele fica pulando
   * depois de cada lombada.
   */
  MOLA: 34000,
  AMORTECEDOR: 4400,
  // Batente: quando o curso acaba, o resto é aço contra aço.
  BATENTE: 260000,

  /**
   * Motor. `POTENCIA` em watts (o Go Devil de 60 cv dava ~44 kW) e
   * `FORCA_MAX` é o teto de tração na roda em N — é ele que decide a
   * arrancada, e a potência que decide onde a velocidade para de subir.
   *
   * A conta é F = min(FORCA_MAX, POTENCIA / v): em vez de curva de torque,
   * marcha e diferencial, uma hipérbole. Isso já dá a coisa que importa —
   * força sobrando embaixo, força faltando em cima — sem transformar o jogo
   * num simulador de transmissão.
   */
  POTENCIA: 28000,
  // A força de baixo é ALTA e a potência é BAIXA, e essa combinação é o jipe:
  // 6 kN na roda parada (a caixa de quatro marchas com redutor multiplica
  // torque de sobra pra vencer 50% de rampa) e uma hipérbole que desaba
  // depois. Com os 44 kW brutos do Go Devil ele fazia 0-60 km/h em 4,9 s, que
  // é tempo de carro esporte — a perda de transmissão e o formato de armário
  // não estavam em lugar nenhum.
  FORCA_MAX: 6000,
  // A ré é curta e fraca no MB de verdade, e tem que ser desconfortável aqui
  // também: dar ré não pode ser um jeito de andar rápido pra trás.
  FORCA_RE: 3200,
  VEL_MAX_RE: 7,

  FREIO: 11000,
  // Freio de mão age só no eixo TRASEIRO, e é o que permite jogar a traseira.
  // Fraco de propósito: isto é um veículo militar, não um carro de drift.
  FREIO_MAO: 7000,

  /**
   * Rigidez lateral do pneu, em newton por m/s de escorregamento.
   *
   * É o que gera curva: a roda que anda de lado empurra contra o lado. O
   * valor é limitado pelo círculo de atrito (nunca passa de µ·carga), então
   * roda no ar não faz curva nenhuma e roda leve faz pouca — que é
   * exatamente a transferência de peso aparecendo de graça.
   */
  RIGIDEZ_LATERAL: 15000,
  // O freio de mão derruba a rigidez traseira: é isso, e não o freio, que
  // solta a traseira.
  RIGIDEZ_MAO: 0.35,

  /**
   * Esterçamento pela velocidade. Parado ele vira tudo; a 80 km/h virar tudo
   * seria absurdo — e pior, seria a maneira mais rápida de capotar sem nunca
   * entender por quê.
   */
  ESTERCO_MAX: 0.61,    // 35°, parado
  ESTERCO_MIN: 0.21,    // 12°, na velocidade cheia
  ESTERCO_VEL: 22,      // m/s em que o mínimo já vale
  ESTERCO_TAXA: 3.4,    // rad/s: o volante tem inércia, não é interruptor

  // Arrasto aerodinâmico como k·v², e o jipe é um armário: 0,7 de Cd·A.
  ARRASTO: 2.4,

  /**
   * Momentos de inércia, em kg·m². Saem da caixa equivalente
   * (m·(a² + b²)/12) e não de chute: o de ROLAGEM é o menor dos três, e é por
   * isso que ele tomba antes de fazer qualquer outra coisa.
   */
  INERCIA_YAW: 1190,
  INERCIA_PITCH: 1160,
  INERCIA_ROLL: 350,
  // Amortecimento angular. Existe pra que a carroceria assente em vez de
  // oscilar pra sempre — a mola sozinha não amortece rotação.
  AMORTECE_ANGULAR: 3.2,

  /**
   * As quatro rodas. `motriz` é 4x4: as quatro recebem torque, e é isso que
   * faz o jipe subir barranco onde um carro de tração traseira patina.
   */
  RODAS: [
    { id: 'FL', x: XW, z: ZF, dianteira: true, motriz: true, no: 'steer_L' },
    { id: 'FR', x: -XW, z: ZF, dianteira: true, motriz: true, no: 'steer_R' },
    { id: 'RL', x: XW, z: -ZF, dianteira: false, motriz: true, no: 'wheel_RL' },
    { id: 'RR', x: -XW, z: -ZF, dianteira: false, motriz: true, no: 'wheel_RR' }
  ],

  /**
   * Quatro lugares, e cada um é um nó do modelo — a posição sai do `.glb`,
   * não de uma tabela paralela que desalinharia na primeira edição do jipe.
   * `dirige` é só do motorista: quem está atrás não tem volante.
   */
  ASSENTOS: [
    { id: 'motorista', nome: 'Motorista', no: 'seat_driver', dirige: true, x: 0.32, z: -0.18 },
    { id: 'passageiro', nome: 'Passageiro', no: 'seat_pax', dirige: false, x: -0.32, z: -0.18 },
    { id: 'traseiro_E', nome: 'Traseira esquerda', no: 'seat_rear_L', dirige: false, x: 0.28, z: -0.95 },
    { id: 'traseiro_D', nome: 'Traseira direita', no: 'seat_rear_R', dirige: false, x: -0.28, z: -0.95 }
  ],
  // Altura dos olhos de quem está sentado, acima do nó do assento.
  ALTURA_OLHO: 0.62
};
