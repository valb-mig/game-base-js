/**
 * Os dois lados, e a regra de quem domina o quê.
 *
 * Países inventados de propósito: a ilha e a guerra são ficção, e nenhum
 * exército real leva a culpa por nada que aconteça aqui.
 *
 * Sem three: isto é regra de partida, não desenho. Dá pra testar o modo de
 * jogo inteiro sem montar um mapa.
 */

export const TEAMS = {
  karnia: {
    id: 'karnia',
    name: 'Pacto de Karnia',
    short: 'KARNIA',
    color: 0xd94f4f,
    css: '#d94f4f'
  },
  vestria: {
    id: 'vestria',
    name: 'Aliança de Vestria',
    short: 'VESTRIA',
    color: 0x3f7ad9,
    css: '#3f7ad9'
  }
};

export const TEAM_IDS = Object.keys(TEAMS);

/**
 * De que lado o jogador entra. Um só por enquanto: não existe adversário, e
 * escolher lado sem ter contra quem jogar seria menu por menu.
 */
export const PLAYER_TEAM = 'vestria';

/**
 * Quem ataca. Vestria desembarca na praia e empurra a frente até o moinho;
 * Karnia defende e retoma o que perdeu.
 *
 * A assimetria é o modo: sem um atacante declarado, "avançar" não tem
 * direção e a linha de frente não existe.
 */
export const ATACANTE = 'vestria';

/** O outro lado. Vale pra qualquer um dos dois. */
export function enemyOf(teamId) {
  return TEAM_IDS.find((id) => id !== teamId) ?? null;
}

export function teamOf(id) {
  return TEAMS[id] ?? null;
}

/**
 * De quem é o posto: só de quem tem AS QUATRO bandeiras.
 *
 * Uma bandeira arriada já basta pra tirar o posto de quem era — é isso que
 * faz a captura valer a pena desde a primeira, em vez de só na última.
 */
export function postOwner(post) {
  const primeiro = post.flags[0].owner;
  if (!primeiro) return null;
  return post.flags.every((flag) => flag.owner === primeiro) ? primeiro : null;
}

/** Alguém está mexendo nas bandeiras deste posto agora. */
export function postContested(post) {
  return post.flags.some((flag) => flag.phase !== 'parada');
}

/**
 * Dá pra nascer aqui?
 *
 * "Posto dominado ou sendo dominado, o time perde o spawn": não basta ser
 * dono, tem que estar em paz. Um posto com uma bandeira descendo já não
 * serve de porta de entrada — senão o defensor renasceria em cima de quem
 * está capturando, e capturar viraria impossível.
 */
export function spawnableFor(post, teamId) {
  return postOwner(post) === teamId && !postContested(post);
}

/**
 * Onde está a linha de frente: o índice do primeiro ponto que o atacante
 * ainda não tomou.
 *
 * Com todos tomados devolve `posts.length` — a partida acabou.
 */
export function frontIndex(posts) {
  const primeiro = posts.findIndex((post) => postOwner(post) !== ATACANTE);
  return primeiro < 0 ? posts.length : primeiro;
}

/**
 * O ponto em que este time pode mexer AGORA.
 *
 * O atacante trabalha na frente; o defensor, no último que perdeu. Um só de
 * cada lado, e é isso que faz a partida ser uma linha que anda em vez de seis
 * brigas soltas — sem isso, o time todo pularia direto pro último ponto.
 */
export function activePostFor(posts, teamId) {
  const frente = frontIndex(posts);
  if (teamId === ATACANTE) return posts[frente] ?? null;
  return posts[frente - 1] ?? null;
}

/** Quantos postos cada lado domina inteiros. */
export function tally(posts) {
  const contagem = { karnia: 0, vestria: 0, disputados: 0 };
  for (const post of posts) {
    const dono = postOwner(post);
    if (dono) contagem[dono]++;
    else contagem.disputados++;
  }
  return contagem;
}

/**
 * Quem venceu, ou null.
 *
 * O objetivo é dominar TODOS os postos do outro: com os doze na mão, não
 * sobrou posto inimigo nenhum.
 */
export function winner(posts) {
  if (posts.length === 0) return null;
  const primeiro = postOwner(posts[0]);
  if (!primeiro) return null;
  return posts.every((post) => postOwner(post) === primeiro) ? primeiro : null;
}
