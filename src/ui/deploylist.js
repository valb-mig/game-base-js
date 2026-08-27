import { teamOf, postOwner, postContested, activePostFor, tally } from '../game/teams.js';

/**
 * A lista de pontos ao lado do mapa tático, e o placar da partida.
 *
 * O mapa já pintava o dono de cada ponto, mas em bolinha de nove pixels: pra
 * saber que a Vila estava sendo tomada era preciso reparar num anel tracejado
 * e já saber o que ele quer dizer. A lista diz por extenso, e é ela que torna
 * a escolha do desembarque uma decisão em vez de um clique no que estiver
 * mais perto.
 *
 * Tudo aqui sai de dado que existe — dono, disputa, linha de frente, a nota
 * do ponto e a contagem de postos. Nada de contador regressivo, esquadrão
 * nomeado ou aviso de quantos soldados estão no ponto: são sistemas que o
 * jogo não tem, e anunciá-los na tela de deploy é a mesma mentira que um
 * contador de munição sem munição.
 */

/**
 * Em que estado este ponto está, pra quem está olhando.
 *
 * A disputa vem ANTES do dono de propósito: um posto com bandeira descendo
 * ainda é do dono antigo pelo `postOwner`, e é justamente aquele em que não
 * dá pra nascer. Ler "controlado pelo seu time" e não poder desembarcar lá
 * seria a tela contradizendo o botão.
 */
function estadoDe(zone, meuTime) {
  if (zone.base) {
    return zone.team === meuTime
      ? { texto: 'Sua base', tom: 'aliado' }
      : { texto: 'Base inimiga', tom: 'inimigo' };
  }

  if (!zone.post) return { texto: 'Ponto solto', tom: 'neutro' };
  if (postContested(zone.post)) return { texto: 'Contestado', tom: 'disputa' };

  const dono = postOwner(zone.post);
  if (!dono) return { texto: 'Neutro', tom: 'neutro' };
  return dono === meuTime
    ? { texto: 'Controlado pelo seu time', tom: 'aliado' }
    : { texto: 'Controlado pelo inimigo', tom: 'inimigo' };
}

export function initDeployList(zones, posts, onSelect, { team, valid } = {}) {
  const raiz = document.getElementById('deploy-points');
  const placar = document.getElementById('deploy-score');
  if (!raiz) return null;

  let selected = null;
  const linhas = new Map();

  for (const zone of zones) {
    const linha = document.createElement('button');
    linha.type = 'button';
    linha.className = 'point-row';

    const marca = document.createElement('span');
    marca.className = 'point-badge';
    // Base leva estrela e posto leva o número da ordem: são coisas
    // diferentes, e a ordem dos postos É a regra do modo.
    marca.textContent = zone.post ? `${zone.post.numero}` : '★';

    const corpo = document.createElement('span');
    corpo.className = 'point-body';

    const nome = document.createElement('span');
    nome.className = 'point-name';
    nome.textContent = zone.post ? zone.post.name : zone.name;

    const estado = document.createElement('span');
    estado.className = 'point-state';

    corpo.append(nome, estado);

    // A nota do ponto vem da tabela do mapa e diz por que ele é difícil —
    // "gargalo", "aberta, sem cobertura". É a informação que decide o
    // desembarque, e ela já existia sem chegar em tela nenhuma.
    if (zone.post?.nota) {
      const nota = document.createElement('span');
      nota.className = 'point-note';
      nota.textContent = zone.post.nota;
      corpo.appendChild(nota);
    }

    linha.append(marca, corpo);
    linha.addEventListener('click', () => {
      if (linha.disabled) return;
      onSelect(zone);
    });

    raiz.appendChild(linha);
    linhas.set(zone, { linha, marca, estado });
  }

  function draw() {
    // Onde cada lado pode mexer agora. É a regra que faz a partida ser uma
    // linha que anda, e até aqui ela só existia no código.
    const frente = posts?.length ? activePostFor(posts, team) : null;

    for (const [zone, { linha, marca, estado }] of linhas) {
      const { texto, tom } = estadoDe(zone, team);
      const podeNascer = valid ? valid(zone) : true;

      estado.textContent = texto;
      estado.dataset.tom = tom;

      const cor = zone.post ? postOwner(zone.post) : zone.team;
      marca.style.setProperty('--point-color',
        cor ? teamOf(cor).css : 'rgba(226, 218, 194, 0.4)');

      linha.disabled = !podeNascer;
      linha.classList.toggle('selected', zone === selected);
      linha.classList.toggle('front', Boolean(frente) && zone.post === frente);
      // Por que não dá pra desembarcar aqui, na própria linha: sem isso a
      // linha só fica apagada e o jogador não sabe se é bug ou regra.
      linha.title = podeNascer ? '' : 'Não dá pra nascer aqui agora';
    }

    if (placar && posts?.length) {
      const contagem = tally(posts);
      placar.replaceChildren();
      for (const id of ['vestria', 'karnia']) {
        const lado = document.createElement('span');
        lado.className = 'score-side';
        lado.style.setProperty('--point-color', teamOf(id).css);
        lado.textContent = `${teamOf(id).short} ${contagem[id]}`;
        placar.appendChild(lado);
      }
      if (contagem.disputados > 0) {
        const disputa = document.createElement('span');
        disputa.className = 'score-open';
        disputa.textContent = `${contagem.disputados} em disputa`;
        placar.appendChild(disputa);
      }
    }
  }

  draw();

  return {
    select(zone) {
      selected = zone;
      draw();
    },
    redraw: draw
  };
}
