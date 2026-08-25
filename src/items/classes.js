/**
 * Catálogo de classes. É a fonte de verdade tanto da tela de seleção quanto
 * dos atributos que o jogador leva pro mapa.
 *
 * Ambientação: 1945. Nada de mira holográfica, drone ou míssil guiado — o
 * equipamento é o que um soldado carregava no fim da guerra.
 *
 * `movement` sobrescreve valores de PLAYER (config.js) só pra este jogador.
 * Fica de fora de propósito o que a física trata como global — RADIUS e
 * STEP_HEIGHT vivem dentro de physics.js e valem pra todo mundo, então
 * classe nenhuma deve mexer neles.
 *
 * No Battlefield todas as classes andam igual: o que separa uma da outra é o
 * equipamento, não a mobilidade. Por isso `movement` está vazio em todas —
 * o mecanismo existe e é testado no harness, mas ninguém usa ainda.
 */

/**
 * Slots de mão, na ordem das teclas 1, 2 e 3.
 *
 * A posição é fixa: a faca é sempre o 3, mesmo que a classe não tenha nada
 * no 1. Slot vazio não vira botão no HUD nem responde à tecla — o que não
 * existe não aparece.
 */
export const SLOT_ORDER = ['Primária', 'Secundária', 'Corpo a corpo', 'Ferramenta'];

/**
 * Quanto cada coisa afunda o terreno num acerto.
 *
 * A escala é a ordem que importa, não os valores: a pá move terra de
 * verdade, a primária marca o chão, a secundária mal arranha e o corpo a
 * corpo não mexe em nada. Ficam juntos aqui pra que a relação entre eles
 * seja legível de uma vez, em vez de espalhada por quatro arquivos.
 */
/**
 * Peso em quilos, o de verdade e carregado.
 *
 * Ele não é enfeite: decide quanto tempo custa guardar e sacar, quanto de
 * fôlego a corrida come e quanto o pulo cobra. É o que faz trocar pra faca
 * antes de correr ser uma decisão, e não um detalhe.
 */
export const PESOS = {
  mp40: 4.7,      // 4,0 vazia, e o carregador de 32 pesa
  m1911: 1.1,
  m1943: 0.95,    // a pá de trincheira é leve pro que faz
  kabar: 0.32
};

export const TERRAIN_BITE = {
  SHOVEL: 0.9,        // uma pazada inteira, definida em world/deform.js
  PRIMARY: 0.085,
  SECONDARY: 0.045,
  MELEE: 0             // faca não cava
};

export const KNIFE = {
  id: 'kabar',
  weight: PESOS.kabar,
  slot: 'Corpo a corpo',
  name: 'Faca KA-BAR',
  note: 'Padrão do Corpo de Fuzileiros, comum a todas as classes',
  // Alcance e abertura do golpe. O arco existe porque exigir mira de
  // precisão pra uma facada de perto é frustrante — mas 34° também não
  // deixa acertar o que está claramente ao lado.
  melee: {
    damage: 55,
    reach: 1.9,
    arc: 34
  }
};

/**
 * Pistola de serviço. Exclusiva da Assault por decisão de jogo — as outras
 * classes levam o revólver Victory, também de dotação americana na guerra.
 */
export const PISTOL = {
  id: 'm1911',
  weight: PESOS.m1911,
  slot: 'Secundária',
  name: 'Colt M1911A1',
  note: '.45 ACP · sete no carregador e uma na câmara',
  firearm: {
    damage: 34,
    range: 55,
    magazine: 7,       // o oitavo tiro é o da câmara
    reloadTime: 1.9,
    fireInterval: 0.17,
    // Abertura ANDANDO, em graus. Parado é zero, e correr e pular multiplicam
    // pela tabela de SPREAD em config.js.
    hipSpread: 0.45,
    adsSpread: 0.12,
    adsTime: 0.16,
    recoil: 1.5,       // coice, em graus
    dig: TERRAIN_BITE.SECONDARY
  },
  ammo: { loaded: 8, reserve: 21 }
};

/**
 * Pá de trincheira M1943, dotação de todo soldado em 1945 e, como a faca,
 * comum a todas as classes. É ferramenta, não arma: cava e aterra o terreno.
 */
export const SHOVEL = {
  id: 'm1943',
  weight: PESOS.m1943,
  slot: 'Ferramenta',
  name: 'Pá M1943',
  note: 'Cava e aterra · comum a todas as classes',
  tool: {
    // Alcance folgado de propósito: com a pazada funda que a malha exige, o
    // fundo do próprio buraco sai do alcance de quem cava da beirada, e
    // aprofundar vira impossível sem pular pra dentro.
    reach: 4.2,        // até onde a pazada alcança, em metros
    digTime: 0.85,     // cavar não é imediato, pra não virar clique repetido
    placeTime: 0.7,
    digAt: 0.62,       // fração da ação em que a terra sai do chão
    placeAt: 0.55,
    cooldown: 0.15
  }
};

/**
 * MP40, a submetralhadora alemã de 9 mm. Primária da Assault.
 *
 * Automática de verdade: 500 tiros por minuto, que é cadência baixa pro tipo
 * e foi justamente o que deu fama de controlável a ela. Segurar o gatilho
 * dispara; as outras armas do jogo continuam sendo um tiro por clique.
 */
export const MP40 = {
  id: 'mp40',
  weight: PESOS.mp40,
  slot: 'Primária',
  name: 'MP40',
  note: '9×19mm, automática, 32 tiros',
  firearm: {
    damage: 24,
    range: 95,
    magazine: 32,
    reloadTime: 2.4,
    auto: true,
    fireInterval: 0.12,   // 500 tiros por minuto
    hipSpread: 0.62,   // andando, do quadril; ver SPREAD em config.js
    adsSpread: 0.2,
    adsTime: 0.2,
    recoil: 1.05,         // recuo contido: é a fama da arma
    dig: TERRAIN_BITE.PRIMARY
  },
  ammo: { loaded: 32, reserve: 96 }
};

export const CLASSES = [
  {
    id: 'assault',
    name: 'Assault',
    role: 'Linha de frente',
    summary: 'Avança e toma posição',
    description:
      'Abre o caminho em distância curta. Leva a submetralhadora pro assalto ' +
      'a trincheira e a granada pra limpar o que estiver do outro lado.',
    color: '#d94f4f',
    available: true,
    health: 100,
    movement: {},
    loadout: [
      MP40,
      PISTOL,
      { slot: 'Gadget 1', name: 'Granada Mk 2', note: 'Fragmentação, 4 a 5 segundos' },
      { slot: 'Gadget 2', name: 'Bolsa de curativos', note: 'Estanca sangramento em campo' },
      KNIFE,
      SHOVEL
    ]
  },
  {
    id: 'engineer',
    name: 'Engineer',
    role: 'Anti-blindado',
    summary: 'Para tanque e abre passagem',
    description: 'Caça blindado inimigo e derruba obstáculo no caminho do avanço.',
    color: '#e0a02f',
    available: false,
    health: 100,
    movement: {},
    loadout: [
      { slot: 'Primária', name: 'Carabina M1', note: 'Leve, boa em espaço fechado' },
      { slot: 'Secundária', name: 'Revólver Victory .38', note: '' },
      { slot: 'Gadget 1', name: 'Bazuca M1A1', note: 'Foguete anti-tanque de 60 mm' },
      { slot: 'Gadget 2', name: 'Mina anti-tanque', note: 'Enterrada na estrada' },
      KNIFE,
      SHOVEL
    ]
  },
  {
    id: 'support',
    name: 'Support',
    role: 'Supressão',
    summary: 'Prende o inimigo e reabastece',
    description: 'Volume de fogo pra travar o avanço inimigo, e munição pro pelotão.',
    color: '#3f7ad9',
    available: false,
    health: 100,
    movement: {},
    loadout: [
      { slot: 'Primária', name: 'BAR M1918', note: 'Fuzil automático, melhor deitado' },
      { slot: 'Secundária', name: 'Revólver Victory .38', note: '' },
      { slot: 'Gadget 1', name: 'Caixa de munição', note: 'Reabastece quem estiver perto' },
      { slot: 'Gadget 2', name: 'Carga de demolição', note: 'Explosivo com estopim' },
      KNIFE,
      SHOVEL
    ]
  },
  {
    id: 'recon',
    name: 'Recon',
    role: 'Reconhecimento',
    summary: 'Enxerga longe e informa',
    description: 'Observa a linha inimiga à distância e aponta alvo pra artilharia.',
    color: '#a050c0',
    available: false,
    health: 100,
    movement: {},
    loadout: [
      { slot: 'Primária', name: 'Springfield M1903A4', note: 'Ferrolho, luneta Weaver 330' },
      { slot: 'Secundária', name: 'Revólver Victory .38', note: '' },
      { slot: 'Gadget 1', name: 'Binóculo M3', note: 'Marca posição inimiga' },
      { slot: 'Gadget 2', name: 'Sinalizador', note: 'Chama fogo de artilharia' },
      KNIFE,
      SHOVEL
    ]
  }
];

export const DEFAULT_CLASS_ID = 'assault';

export function getClass(id) {
  return CLASSES.find((entry) => entry.id === id) ?? CLASSES[0];
}
