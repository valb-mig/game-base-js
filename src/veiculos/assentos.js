/**
 * Quem está sentado onde. Dado puro, sem three e sem física.
 *
 * A ocupação é por POSIÇÃO fixa, como o cinto do jogador é por slot: o
 * motorista é o assento 0 e continua sendo o 0 mesmo com a traseira cheia.
 * Com lista compactada, alguém saindo da frente promoveria quem está atrás a
 * motorista sem ninguém pedir.
 *
 * Entrar não é teleportar: quem entra escolhe (ou recebe) um assento LIVRE, e
 * quem sai precisa de um lugar no chão que caiba um corpo em pé — quem decide
 * isso é o veículo, que é quem conhece a colisão.
 */
export function criarAssentos(ficha) {
  const lugares = ficha.ASSENTOS.map((def) => ({ def, ocupante: null }));

  return {
    lugares,

    get vazio() {
      return lugares.every((l) => !l.ocupante);
    },

    get motorista() {
      return lugares.find((l) => l.def.dirige)?.ocupante ?? null;
    },

    ocupantes() {
      return lugares.filter((l) => l.ocupante).map((l) => l.ocupante);
    },

    lugarDe(ocupante) {
      return lugares.find((l) => l.ocupante === ocupante) ?? null;
    },

    /**
     * O melhor assento livre: o do volante primeiro.
     *
     * Quem chega num jipe vazio quer dirigir, e obrigar a procurar a porta
     * certa num veículo de quatro lugares seria fricção sem jogo nenhum
     * dentro. Com o volante ocupado, ele vira passageiro — e isso é o que faz
     * dois jogadores no mesmo jipe funcionar sem negociação.
     */
    livre() {
      return lugares.find((l) => !l.ocupante) ?? null;
    },

    /** Senta. Devolve o lugar, ou null se não havia nenhum livre. */
    sentar(ocupante, lugar = null) {
      const escolhido = lugar ?? this.livre();
      if (!escolhido || escolhido.ocupante) return null;
      if (this.lugarDe(ocupante)) return null;   // ninguém senta duas vezes
      escolhido.ocupante = ocupante;
      return escolhido;
    },

    /** Levanta. Devolve o lugar que vagou, ou null se ele não estava sentado. */
    levantar(ocupante) {
      const lugar = this.lugarDe(ocupante);
      if (!lugar) return null;
      lugar.ocupante = null;
      return lugar;
    }
  };
}
