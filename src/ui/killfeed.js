import { teamOf } from '../game/teams.js';

/**
 * Kill feed: quem matou quem, e como.
 *
 * Ele existe pra responder duas perguntas que o jogador faz sozinho e não
 * consegue: "quem me matou?" e "eu acertei aquilo?". Sem ele, morrer é um
 * corte de tela sem explicação, e um acerto a cem metros é uma suposição.
 *
 * A linha diz a REGIÃO quando ela decidiu a morte — cabeça, capacete, costas.
 * É a informação que muda como se joga o próximo minuto.
 */

const LIMITE = 5;       // linhas na tela ao mesmo tempo
const DURACAO = 6.5;    // segundos até a linha sumir

/** Nome legível de quem quer que seja, incluindo quem não tem nome. */
function nomeDe(quem) {
  if (!quem) return 'alguém';
  return quem.name ?? quem.id ?? 'alguém';
}

export function initKillFeed(player) {
  const painel = document.getElementById('killfeed');
  if (!painel) return { update: () => {}, register: () => {} };

  const linhas = [];

  function pintar(quem) {
    const time = quem?.team ? teamOf(quem.team) : null;
    return time ? time.css : '#dfe8d4';
  }

  /**
   * Registra uma morte. `regiao` e `costas` são o "como", e só aparecem
   * quando explicam alguma coisa.
   */
  function register({ matador, vitima, regiao = null, costas = false, arma = null }) {
    const linha = document.createElement('div');
    linha.className = 'kill-line';

    // Envolveu o jogador? A linha ganha destaque: é a única que ele precisa
    // ler no meio de um tiroteio.
    const meu = matador === player.asTarget || vitima === player.asTarget;
    linha.classList.toggle('minha', meu);

    const de = document.createElement('b');
    de.textContent = nomeDe(matador);
    de.style.color = pintar(matador);

    const meio = document.createElement('span');
    meio.className = 'kill-como';
    meio.textContent = costas
      ? '† pelas costas'
      : regiao
        ? `† ${regiao.nome}`
        : arma ? `† ${arma}` : '†';

    const para = document.createElement('b');
    para.textContent = nomeDe(vitima);
    para.style.color = pintar(vitima);

    linha.append(de, meio, para);
    painel.append(linha);
    linhas.push({ elemento: linha, resta: DURACAO });

    // Mais que isso vira parede de texto, e ninguém lê parede de texto no
    // meio de um tiroteio.
    while (linhas.length > LIMITE) linhas.shift().elemento.remove();
  }

  function update(delta) {
    for (let i = linhas.length - 1; i >= 0; i--) {
      const linha = linhas[i];
      linha.resta -= delta;
      if (linha.resta > 1) continue;
      linha.elemento.style.opacity = `${Math.max(0, linha.resta)}`;
      if (linha.resta <= 0) {
        linha.elemento.remove();
        linhas.splice(i, 1);
      }
    }
  }

  return { register, update, get lines() { return linhas.length; } };
}
