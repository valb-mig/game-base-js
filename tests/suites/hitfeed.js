import { initHitFeed } from '../../src/ui/hitfeed.js';
import { GRUPOS } from '../../src/game/hitboxes.js';
import { suite, ok, eq, note } from '../assert.js';

const DT = 1 / 60;

/** Fonte de acertos de mentira, com o mesmo contrato da balística. */
function fonte() {
  const ouvintes = [];
  return {
    onHit: (fn) => ouvintes.push(fn),
    emitir: (r) => { for (const fn of ouvintes) fn(r); }
  };
}

export function run() {
  // O painel vive no index.html; a bancada monta o dele.
  let painel = document.getElementById('hitfeed');
  if (!painel) {
    painel = document.createElement('div');
    painel.id = 'hitfeed';
    document.body.appendChild(painel);
  }

  const eu = { id: 'jogador' };
  const outro = { id: 'bot' };
  const alvo = { id: 'inimigo' };

  const balistica = fonte();
  const corpoACorpo = fonte();
  const update = initHitFeed(eu, corpoACorpo, balistica);
  const rodar = (segundos) => {
    for (let i = 0; i < Math.ceil(segundos / DT); i++) update(DT);
  };
  const limpar = () => rodar(3);
  const linhas = () => [...painel.querySelectorAll('.hit-line')];
  const texto = () => linhas().map((l) => l.textContent);

  const acertar = (amount, extra = {}) => balistica.emitir({
    target: alvo, amount, killed: false, owner: eu, ...extra
  });

  suite('o hit feed é uma linha por acerto');

  limpar();
  eq('em paz não há linha nenhuma', linhas().length, 0);

  acertar(10, { regiao: GRUPOS.cabeca });
  acertar(10, { regiao: GRUPOS.braco });
  acertar(10, { regiao: GRUPOS.braco });

  eq('três acertos, três linhas', linhas().length, 3);
  eq('cada um com o seu, sem somar', texto().join(' | '),
    'cabeça10 | braço10 | braço10');
  note('por que não somar', 'três de braço seguidos explicam por que ele não caiu');

  // A mais nova entra EMBAIXO: a leitura é de cima pra baixo, na ordem em que
  // os tiros saíram.
  acertar(24, { regiao: GRUPOS.tronco });
  eq('a linha nova entra no fim', texto()[3], 'tronco24');

  suite('cada linha tem o seu relógio');

  limpar();
  acertar(10, { regiao: GRUPOS.tronco });
  rodar(1.2);
  acertar(10, { regiao: GRUPOS.perna });
  eq('as duas convivem', linhas().length, 2);

  rodar(1);
  eq('a primeira já foi e a segunda ficou', linhas().length, 1);
  eq('e é a mais nova que sobrou', texto()[0], 'perna10');

  rodar(1.5);
  eq('dois segundos depois do último acerto, a lista está vazia',
    linhas().length, 0);

  suite('rajada longa não vira parede de texto');

  limpar();
  for (let i = 0; i < 20; i++) acertar(24, { regiao: GRUPOS.tronco });
  eq('a lista para no limite', linhas().length, 6);
  note('teto de linhas', '6 ao mesmo tempo');

  suite('o hit feed é do jogador, não da briga toda');

  limpar();
  balistica.emitir({ target: alvo, amount: 34, killed: false, owner: outro });
  eq('tiro de bot em bot não escreve nada', linhas().length, 0);

  // Sem dono declarado passa: é o corpo a corpo, que hoje só o jogador tem.
  corpoACorpo.emitir({ target: alvo, amount: 55, killed: false });
  eq('golpe sem dono declarado é do jogador', texto()[0], '55');

  limpar();
  balistica.emitir({ target: null, amount: 0, killed: false, owner: eu });
  eq('tiro que não acertou nada não conta', linhas().length, 0);

  suite('a linha diz onde acertou e se matou');

  limpar();
  acertar(100, { regiao: GRUPOS.cabeca });
  ok('cabeça pinta a linha', linhas()[0].classList.contains('regiao'));

  acertar(24, { regiao: GRUPOS.tronco });
  ok('tronco não', !linhas()[1].classList.contains('regiao'));

  acertar(24, { regiao: GRUPOS.tronco, killed: true });
  ok('e o abate pinta de outra cor', linhas()[2].classList.contains('kill'));

  limpar();
  eq('o fim da sequência não deixa lixo na tela', painel.children.length, 0);
}
