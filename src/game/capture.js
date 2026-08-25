import { postOwner, spawnableFor, enemyOf } from './teams.js';

/**
 * Captura de posto: arriar a bandeira de quem era e içar a sua.
 *
 * São quatro bandeiras por posto e trinta segundos cada uma, ou seja dois
 * minutos de posto inteiro com um soldado só. É lento de propósito: posto que
 * troca de mão num piscar não é objetivo, é decoração.
 *
 * A troca tem duas metades porque é o que se vê: a bandeira antiga desce até
 * o meio do mastro, o mastro fica vazio, e só então a nova sobe. O instante
 * de mastro vazio é o que torna o posto neutro — nem seu, nem dele.
 *
 * O progresso NÃO some ao sair de perto. Meia bandeira arriada continua meia
 * arriada, e é isso que deixa um posto ficar "sendo dominado" enquanto a
 * briga acontece em outro lugar.
 */

export const CAPTURE = {
  FLAG_SECONDS: 30,     // troca completa de uma bandeira
  REACH: 3.2,           // distância do mastro pra poder mexer nela
  REACH_UP: 2.6         // folga vertical: o mastro é alto, o soldado não
};

/** Metade do tempo arriando, metade içando. */
const METADE = CAPTURE.FLAG_SECONDS / 2;

export function createCapture(posts) {
  let ultimoAlvo = null;

  /** Mastro mais perto do jogador que ele possa mexer, ou null. */
  function alvoDe(x, y, z, teamId) {
    let melhor = null;
    let menor = CAPTURE.REACH;

    for (const post of posts) {
      // Só chega perto de um posto por vez; o teste barato primeiro.
      if (Math.abs(post.x - x) > 40 || Math.abs(post.z - z) > 40) continue;

      for (const flag of post.flags) {
        // Bandeira já sua e parada não tem o que fazer.
        if (flag.owner === teamId && flag.phase === 'parada') continue;
        if (Math.abs(flag.y - y) > CAPTURE.REACH_UP) continue;

        const distancia = Math.hypot(flag.x - x, flag.z - z);
        if (distancia > menor) continue;
        menor = distancia;
        melhor = { post, flag };
      }
    }
    return melhor;
  }

  /** Um quadro de trabalho numa bandeira. */
  function trabalhar(flag, teamId, delta) {
    // Trocar de lado no meio do serviço recomeça: o trabalho é da bandeira
    // que vai subir, e ela mudou.
    if (flag.byTeam !== teamId) {
      flag.byTeam = teamId;
      flag.phase = flag.owner ? 'arriando' : 'icando';
      flag.progress = 0;
    }

    if (flag.phase === 'parada') {
      flag.phase = flag.owner ? 'arriando' : 'icando';
      flag.progress = 0;
    }

    flag.progress += delta / METADE;

    if (flag.phase === 'arriando' && flag.progress >= 1) {
      // mastro vazio: o posto deixa de ser de quem era neste instante
      flag.owner = null;
      flag.phase = 'icando';
      flag.progress = 0;
    }

    if (flag.phase === 'icando' && flag.progress >= 1) {
      flag.owner = teamId;
      flag.phase = 'parada';
      flag.progress = 0;
      return true;   // bandeira trocada
    }
    return false;
  }

  return {
    posts,
    CAPTURE,

    /** O que o jogador pode capturar agora. Serve pro aviso na tela. */
    targetAt(x, y, z, teamId) {
      return alvoDe(x, y, z, teamId);
    },

    /** Última bandeira mexida, pra quem quiser desenhar o progresso. */
    get working() {
      return ultimoAlvo;
    },

    /**
     * Avança a captura. `agindo` é o jogador segurando a tecla; sem isso o
     * tempo não corre, porque capturar é trabalho, não presença.
     */
    update(delta, { x, y, z, teamId, agindo }) {
      const alvo = alvoDe(x, y, z, teamId);
      ultimoAlvo = alvo;

      if (!alvo || !agindo) return null;

      const antes = postOwner(alvo.post);
      const trocou = trabalhar(alvo.flag, teamId, delta);
      if (!trocou) return null;

      return {
        post: alvo.post,
        flag: alvo.flag,
        teamId,
        // Virou posto inteiro nesta bandeira? É o que vale anunciar.
        tomouPosto: postOwner(alvo.post) === teamId && antes !== teamId,
        perdeuDono: antes && antes !== teamId
      };
    },

    /** Onde o time pode nascer agora. A base principal nunca entra aqui. */
    spawnsFor(teamId) {
      return posts.filter((post) => spawnableFor(post, teamId));
    },

    /** Postos que ainda faltam tomar. */
    remainingFor(teamId) {
      const inimigo = enemyOf(teamId);
      return posts.filter((post) => postOwner(post) !== teamId)
        .map((post) => ({ post, de: postOwner(post) ?? 'disputado', inimigo }));
    }
  };
}
