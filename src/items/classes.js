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

export const KNIFE = {
  id: 'kabar',
  slot: 'Corpo a corpo',
  name: 'Faca KA-BAR',
  note: 'Padrão do Corpo de Fuzileiros, comum a todas as classes'
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
      { slot: 'Primária', name: 'Thompson M1A1', note: '.45 ACP, devastadora de perto' },
      { slot: 'Secundária', name: 'Colt M1911', note: 'Pistola padrão do Exército' },
      { slot: 'Gadget 1', name: 'Granada Mk 2', note: 'Fragmentação, 4 a 5 segundos' },
      { slot: 'Gadget 2', name: 'Bolsa de curativos', note: 'Estanca sangramento em campo' },
      KNIFE
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
      { slot: 'Secundária', name: 'Colt M1911', note: '' },
      { slot: 'Gadget 1', name: 'Bazuca M1A1', note: 'Foguete anti-tanque de 60 mm' },
      { slot: 'Gadget 2', name: 'Mina anti-tanque', note: 'Enterrada na estrada' },
      KNIFE
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
      { slot: 'Secundária', name: 'Colt M1911', note: '' },
      { slot: 'Gadget 1', name: 'Caixa de munição', note: 'Reabastece quem estiver perto' },
      { slot: 'Gadget 2', name: 'Carga de demolição', note: 'Explosivo com estopim' },
      KNIFE
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
      { slot: 'Secundária', name: 'Colt M1911', note: '' },
      { slot: 'Gadget 1', name: 'Binóculo M3', note: 'Marca posição inimiga' },
      { slot: 'Gadget 2', name: 'Sinalizador', note: 'Chama fogo de artilharia' },
      KNIFE
    ]
  }
];

export const DEFAULT_CLASS_ID = 'assault';

export function getClass(id) {
  return CLASSES.find((entry) => entry.id === id) ?? CLASSES[0];
}
