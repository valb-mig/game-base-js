import { TEAMS, tally, winner } from '../game/teams.js';
import { CAPTURE } from '../game/capture.js';

/**
 * Painel de objetivo: quantos postos cada lado tem, e o que está acontecendo
 * na bandeira que o jogador está trocando agora.
 *
 * O número existe porque o dado existe — são doze postos contados de verdade,
 * não enfeite. Enquanto o jogador não estiver mexendo em bandeira nenhuma, a
 * barra de progresso some.
 */
export function initObjective(player, capture) {
  const painel = document.getElementById('mission');
  if (!painel) return () => {};

  painel.innerHTML = '';
  painel.classList.add('objetivo');

  const titulo = document.createElement('div');
  titulo.className = 'mission-title';
  titulo.textContent = 'DOMINAR OS POSTOS INIMIGOS';

  const placar = document.createElement('div');
  placar.className = 'placar';

  const marcas = {};
  for (const time of Object.values(TEAMS)) {
    const linha = document.createElement('span');
    linha.className = 'placar-time';
    linha.style.color = time.css;
    marcas[time.id] = linha;
    placar.append(linha);
  }

  const disputa = document.createElement('div');
  disputa.className = 'mission-line';

  const barra = document.createElement('div');
  barra.className = 'captura';
  const preenchimento = document.createElement('i');
  barra.append(preenchimento);

  painel.append(titulo, placar, disputa, barra);

  let ultimo = '';

  return function updateObjective() {
    const contagem = tally(capture.posts);
    for (const [id, marca] of Object.entries(marcas)) {
      marca.textContent = `${TEAMS[id].short} ${contagem[id]}`;
      marca.classList.toggle('meu', id === player.team);
    }

    const alvo = capture.working;
    const bandeira = alvo?.flag;
    const mexendo = bandeira && bandeira.phase !== 'parada';

    barra.classList.toggle('visivel', Boolean(mexendo));
    if (mexendo) {
      preenchimento.style.width = `${Math.round(bandeira.progress * 100)}%`;
      preenchimento.style.background = TEAMS[bandeira.byTeam ?? player.team].css;
    }

    // Quantas bandeiras faltam no posto em que ele está, ou o que está em
    // disputa no mapa. Texto só troca quando muda: escrever no DOM todo
    // quadro faz o navegador refazer layout à toa.
    let texto = '';
    const venceu = winner(capture.posts);
    if (venceu) {
      texto = venceu === player.team
        ? 'ILHA DOMINADA'
        : `${TEAMS[venceu].short} DOMINOU A ILHA`;
    } else if (alvo) {
      const minhas = alvo.post.flags.filter((f) => f.owner === player.team).length;
      texto = `Posto ${alvo.post.name} · ${minhas} de 4 bandeiras`;
    } else if (contagem.disputados > 0) {
      texto = `${contagem.disputados} posto(s) em disputa`;
    }
    if (texto !== ultimo) {
      ultimo = texto;
      disputa.textContent = texto;
    }
  };
}

/** Aviso central do mastro alcançável. Segue o mesmo molde do E de apanhar. */
export function initFlagPrompt(player, capture) {
  const element = document.getElementById('flag-prompt');
  if (!element) return () => {};

  const tecla = document.createElement('kbd');
  tecla.textContent = 'F';
  const rotulo = document.createElement('span');
  element.append(tecla, rotulo);

  let mostrado = null;

  return function updateFlagPrompt() {
    const alvo = capture.working;
    let texto = null;

    if (alvo) {
      const bandeira = alvo.flag;
      texto = bandeira.phase === 'arriando'
        ? `Arriar bandeira · ${Math.round(bandeira.progress * CAPTURE.FLAG_SECONDS / 2)}s`
        : bandeira.phase === 'icando'
          ? `Içar bandeira · ${Math.round(bandeira.progress * CAPTURE.FLAG_SECONDS / 2)}s`
          : `Tomar bandeira · ${alvo.post.name}`;
    }

    if (texto === mostrado) return;
    mostrado = texto;
    element.classList.toggle('visible', Boolean(texto));
    if (texto) rotulo.textContent = texto;
  };
}
