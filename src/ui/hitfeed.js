/**
 * Hit feed: uma linha por acerto, logo abaixo da mira.
 *
 * A marca de acerto responde "acertei?" e o kill feed responde "matou?". O
 * que falta entre as duas é o detalhe do tiroteio em curso: quanto cada tiro
 * tirou e ONDE pegou. Uma rajada de seis tiros que não derruba ninguém e uma
 * rajada que errou quatro são indistinguíveis sem isso.
 *
 * Linha por acerto, e não um total somado: o total responde "quanto no
 * conjunto", que é a pergunta de depois da briga. No meio dela a pergunta é
 * "por que ele não caiu" — e a resposta é a sequência, três acertos de braço
 * seguidos, lida de uma vez.
 *
 * Fica abaixo da mira de propósito. No centro taparia o alvo justamente no
 * quadro em que ele está sendo acertado, e no canto ninguém olha no meio de
 * um tiroteio — a mesma razão pela qual a vinheta de dano fica nas bordas.
 *
 * `dono` é o jogador visto como alvo: a balística é de todo mundo, e sem
 * filtrar a lista encheria com os tiros dos bots do outro lado do mapa.
 * Acerto sem dono declarado passa — é o corpo a corpo, que hoje só o
 * jogador tem.
 */

const DURACAO = 2;      // segundos que cada linha fica na tela
const APAGA = 0.45;     // últimos segundos, em que ela some desaparecendo
const LIMITE = 6;       // linhas ao mesmo tempo; uma rajada longa não vira parede

export function initHitFeed(dono, ...sources) {
  const painel = document.getElementById('hitfeed');
  if (!painel) return () => {};

  const linhas = [];

  const registrar = (result) => {
    if (!result.target) return;
    if (result.owner != null && result.owner !== dono) return;
    if (!(result.amount > 0)) return;

    const elemento = document.createElement('div');
    elemento.className = 'hit-line';
    // Região que vale mais que o normal — cabeça e capacete — pinta a linha.
    // Quem mira na cabeça precisa saber que ACERTOU na cabeça, e o número do
    // dano sozinho não conta isso no meio da rajada.
    if ((result.regiao?.multiplicador ?? 1) > 1) elemento.classList.add('regiao');
    if (result.killed) elemento.classList.add('kill');

    if (result.regiao?.nome) {
      const onde = document.createElement('b');
      onde.textContent = result.regiao.nome;
      elemento.appendChild(onde);
    }

    const quanto = document.createElement('span');
    quanto.textContent = Math.round(result.amount);
    elemento.appendChild(quanto);

    // A mais nova entra EMBAIXO: a leitura é de cima pra baixo, na ordem em
    // que os tiros saíram, e a linha nova aparece longe da mira em vez de
    // empurrar as outras pra dentro dela.
    painel.appendChild(elemento);
    linhas.push({ elemento, restante: DURACAO });

    while (linhas.length > LIMITE) {
      const velha = linhas.shift();
      velha.elemento.remove();
    }
  };

  for (const source of sources) source.onHit?.(registrar);

  return function updateHitFeed(delta) {
    for (let i = linhas.length - 1; i >= 0; i--) {
      const linha = linhas[i];
      linha.restante -= delta;

      if (linha.restante <= 0) {
        linha.elemento.remove();
        linhas.splice(i, 1);
        continue;
      }

      // some desaparecendo no fim, em vez de sumir de uma vez: piscar do
      // nada lê como bug, e o jogador ainda está olhando pra lá
      if (linha.restante < APAGA) {
        linha.elemento.style.opacity = `${(linha.restante / APAGA).toFixed(2)}`;
      }
    }
  };
}
