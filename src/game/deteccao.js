/**
 * Quem foi VISTO, por quem, e por quanto tempo isso ainda vale.
 *
 * O radar nunca mostrou inimigo, e continua não mostrando ninguém de graça: o
 * que ele passa a mostrar é o que ALGUÉM DO TIME viu com os próprios olhos.
 * Enquanto o contato está à vista a marca anda com ele; assim que ninguém o
 * enxerga mais, ela CONGELA onde ele foi visto pela última vez e apaga em
 * `DURACAO` segundos. É informação envelhecendo, não onisciência — quem correr
 * atrás da bolinha velha chega onde o inimigo ESTAVA, e é isso que mantém o
 * flanqueamento vivo.
 *
 * Sem three e sem mundo: quem vê e quem enxerga entram por fora (`marcar` e
 * `varrerCampo`), então o modo inteiro é testável com alvos de mentira.
 */

export const DETECCAO = {
  /** Segundos que a marca sobrevive depois do último avistamento. */
  DURACAO: 30,

  /**
   * Quanto tempo sem refresco a marca ainda conta como "à vista".
   *
   * Não é enfeite: o bot sonda a 3 Hz quando está longe do jogador (ver
   * `SONDA` em `bots/bots.js`), então um contato que continua sendo visto
   * pode passar um terço de segundo sem ser remarcado. Com um limiar de um
   * quadro, a bolinha piscaria entre cheia e vazada trinta vezes por segundo.
   */
  FRESCA: 0.6,

  /**
   * Metade do cone em que o jogador sinaliza, em GRAUS.
   *
   * É um ângulo fixo, e não uma fração do campo da câmera. Saía de
   * `atan(tan(fov/2) · aspect)` — o quadro inteiro —, e isso tinha dois
   * problemas: dava 51° num monitor 16:9 e mais num ultralargo, ou seja QUEM
   * TEM A TELA MAIS LARGA SINALIZA MAIS, que é vantagem escondida no
   * hardware; e sinalizar tudo o que cabe no quadro faz o vulto na beirada
   * valer o mesmo que o alvo que se está olhando. 42° cobrem a parte do quadro
   * em que se repara em movimento, e sobra a beirada.
   */
  CAMPO: 42,

  /**
   * De quanto em quanto tempo o jogador varre o campo, em segundos.
   *
   * Todo quadro seria um raycast por inimigo à vista, sessenta vezes por
   * segundo, pra um dado que dura trinta. A 6 Hz o contato entra no radar em
   * no máximo 0,17 s — que é menos do que se leva pra virar a cabeça.
   */
  VARREDURA: 1 / 6
};

export function criarDeteccao({ duracao = DETECCAO.DURACAO } = {}) {
  // time que VIU -> (alvo -> registro). São dois times; o mapa de fora existe
  // pra que a consulta do HUD não peneire o que é do outro lado.
  const porTime = new Map();

  /**
   * O relógio é DAQUI, e é alimentado pelo delta do quadro.
   *
   * Ele podia sair de `performance.now()`, e não sai por dois motivos medidos
   * nesta base: sob `--virtual-time-budget` esse relógio CONGELA depois do
   * primeiro fetch, e um contato que nunca envelhece passaria verde em
   * qualquer teste; e quem marca (o bot, o jogador, a suíte) teria que
   * concordar sobre a unidade — segundos ou milissegundos —, que é exatamente
   * o tipo de acordo que se rompe calado.
   */
  let agora = 0;

  function tabela(time) {
    let t = porTime.get(time);
    if (!t) {
      t = new Map();
      porTime.set(time, t);
    }
    return t;
  }

  return {
    /** Anda o relógio do sistema. Devolve a hora nova, em segundos. */
    avancar(delta) {
      agora += delta;
      return agora;
    },

    get agora() {
      return agora;
    },

    /**
     * `time` avistou `alvo` agora. Idempotente e barata: roda por bot em
     * contato, todo quadro.
     */
    marcar(alvo, time) {
      // Alvo sem time não é inimigo de ninguém — é boneco de treino, poste,
      // coisa que não briga. Sinalizá-lo encheria o radar do campo de treino
      // de contatos que não existem.
      if (!alvo || !time || !alvo.team || alvo.team === time) return null;
      const t = tabela(time);
      let registro = t.get(alvo);
      if (!registro) {
        registro = { alvo, time: alvo.team, x: 0, z: 0, visto: 0, ate: 0 };
        t.set(alvo, registro);
      }
      // A posição só é copiada ENQUANTO se vê. É o que faz a marca velha
      // apontar pro lugar onde ele estava, e não segui-lo pelo mapa.
      registro.x = alvo.x;
      registro.z = alvo.z;
      registro.visto = agora;
      registro.ate = agora + duracao;
      return registro;
    },

    /**
     * O que `time` sabe agora. Já vem sem o que expirou e sem o que caiu —
     * marca de morto é promessa de briga que não existe mais.
     *
     * `fresco` diz se o contato está sendo visto NESTE momento; quem desenha
     * usa isso pra separar o que é certeza do que é memória.
     */
    lista(time) {
      const t = porTime.get(time);
      if (!t) return [];
      const saida = [];
      for (const [alvo, registro] of t) {
        if (agora > registro.ate || !alvo.alive) {
          t.delete(alvo);
          continue;
        }
        registro.fresco = (agora - registro.visto) <= DETECCAO.FRESCA;
        registro.idade = agora - registro.visto;
        saida.push(registro);
      }
      return saida;
    },

    /** Quantos contatos vivos `time` tem. Pro painel e pra teste. */
    quantos(time) {
      return this.lista(time).length;
    },

    limpar() {
      porTime.clear();
      agora = 0;
    }
  };
}

/**
 * Uma varredura de campo de visão, marcando o que dá pra ver.
 *
 * É a mesma ordem de peneiras de `avistar` em `bots/brain.js`, e pela mesma
 * razão: distância ao quadrado (sem raiz), cone por produto escalar (sem
 * `atan2`), e só então a linha de visão — que é centenas de vezes mais cara
 * que as duas juntas. O bot já sinaliza pelo cérebro dele; isto aqui é pro
 * JOGADOR, que não tem cérebro de bot e enxerga pelos próprios olhos.
 *
 * `temLinha(alvo)` é de quem chama: aqui não se conhece three nem colisor.
 */
export function varrerCampo({
  deteccao, alvos, time,
  x, z, dirX, dirZ, alcance, campo, temLinha
}) {
  const alcance2 = alcance * alcance;
  const cosCampo = Math.cos(campo);
  let vistos = 0;

  for (const alvo of alvos) {
    if (!alvo?.alive || !alvo.team || alvo.team === time) continue;

    const dx = alvo.x - x;
    const dz = alvo.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 > alcance2 || d2 < 1e-6) continue;
    if (dx * dirX + dz * dirZ < cosCampo * Math.sqrt(d2)) continue;
    if (!temLinha(alvo)) continue;

    deteccao.marcar(alvo, time);
    vistos++;
  }
  return vistos;
}
