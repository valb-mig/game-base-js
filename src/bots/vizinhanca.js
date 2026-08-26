/**
 * Grade espacial dos combatentes. Sem three, sem alocação por quadro.
 *
 * Sem ela, cada bot percorre TODOS os inimigos pra achar quem está vendo:
 * com 150 de cada lado são 45 mil pares por quadro, e cada par termina num
 * raycast contra o mundo. Medido antes: 14,01 ms por quadro só de IA com 300
 * bots, 84% do orçamento a 60 fps.
 *
 * A grade é reconstruída inteira todo quadro em vez de ser mantida
 * incrementalmente. Parece caro e não é: são 300 inserções contra 45 mil
 * pares, e manter índice de coisa que anda toda hora custa mais em remoção do
 * que a reconstrução inteira. É o contrário do índice de colisores, que quase
 * nunca se mexe.
 */

const CELULA = 40;

function chave(cx, cz) {
  return (cx + 512) * 1024 + (cz + 512);
}

export function createVizinhanca(celula = CELULA) {
  // As listas de célula são REAPROVEITADAS entre quadros: esvaziar um array
  // é `length = 0`, e alocar mil arrays por segundo pro coletor não é.
  const grade = new Map();
  const usadas = [];

  function limpar() {
    for (const lista of usadas) lista.length = 0;
    usadas.length = 0;
  }

  function inserir(alvo) {
    const k = chave(Math.floor(alvo.x / celula), Math.floor(alvo.z / celula));
    let lista = grade.get(k);
    if (!lista) {
      lista = [];
      grade.set(k, lista);
    }
    if (lista.length === 0) usadas.push(lista);
    lista.push(alvo);
  }

  /**
   * Enche `saida` com quem está a até `raio` de (x, z), do time `time`.
   *
   * Serve pros dois lados: passando o time INIMIGO ela acha quem se caça, e
   * passando o PRÓPRIO acha quem está na frente do cano.
   *
   * `saida` vem de fora e é reaproveitado — devolver um array novo por bot
   * por quadro seriam trezentas alocações por quadro, que é justamente o que
   * o `.filter()` fazia.
   */
  function porPerto(x, z, raio, time, saida) {
    saida.length = 0;
    const c0 = Math.floor((x - raio) / celula);
    const c1 = Math.floor((x + raio) / celula);
    const z0 = Math.floor((z - raio) / celula);
    const z1 = Math.floor((z + raio) / celula);
    const raio2 = raio * raio;

    for (let cx = c0; cx <= c1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const lista = grade.get(chave(cx, cz));
        if (!lista) continue;
        for (const alvo of lista) {
          // `time` nulo quer dizer QUALQUER um: a separação não escolhe
          // farda, porque bot não fica dentro de bot nem do próprio time.
          if (time !== null && alvo.team !== time) continue;
          const dx = alvo.x - x;
          const dz = alvo.z - z;
          // Distância ao QUADRADO: comparar é o que importa e a raiz não
          // muda a ordem. É o filtro mais barato que existe, e por isso ele
          // vem antes de tudo.
          if (dx * dx + dz * dz > raio2) continue;
          saida.push(alvo);
        }
      }
    }
    return saida;
  }

  return { limpar, inserir, porPerto };
}
