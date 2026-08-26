import { postOwner, spawnableFor, enemyOf, activePostFor } from './teams.js';

/**
 * Captura de posto: arriar a bandeira de quem era e içar a sua.
 *
 * É UMA bandeira por posto, e trinta segundos nela. Eram quatro, o que dava
 * dois minutos de posto inteiro com um soldado só — lento de propósito, pra
 * que posto não trocasse de mão num piscar. Com trezentos em campo a conta se
 * inverteu: quatro mastros com gente sobrando caem quase juntos, e os dois
 * minutos viraram espera em vez de disputa.
 *
 * A regra de dono não sabe quantas são: dono é quem tem TODAS. Ela continua
 * geral, e é isso que deixou trocar quatro por uma sem mexer em `teams.js`.
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
  /** Mastro mais perto do jogador que ele possa mexer, ou null. */
  function alvoDe(x, y, z, teamId) {
    let melhor = null;
    let menor = CAPTURE.REACH;

    // Só o ponto da linha de frente responde. Estar em cima do mastro de um
    // ponto que ainda não é a vez dele não faz nada: a frente anda em ordem.
    const ativo = activePostFor(posts, teamId);
    if (!ativo) return null;

    for (const post of posts) {
      if (post !== ativo) continue;
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

    /**
     * O que quem estiver aqui pode capturar. É consulta, não estado.
     *
     * Já foi um `working` guardado no último `update`, e como o bot também
     * chama update — depois do jogador, no mesmo quadro —, a tela do jogador
     * mostrava a bandeira que o BOT estava trocando, a sessenta metros dali,
     * como se fosse ele. Quem pergunta diz de onde pergunta.
     */
    targetAt(x, y, z, teamId) {
      return alvoDe(x, y, z, teamId);
    },

    /**
     * Avança a captura. `agindo` é o jogador segurando a tecla; sem isso o
     * tempo não corre, porque capturar é trabalho, não presença.
     */
    update(delta, { x, y, z, teamId, agindo }) {
      const alvo = alvoDe(x, y, z, teamId);
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

    /** O ponto que este time pode disputar agora, ou null. */
    activeFor(teamId) {
      return activePostFor(posts, teamId);
    },

    /** Postos que ainda faltam tomar. */
    remainingFor(teamId) {
      const inimigo = enemyOf(teamId);
      return posts.filter((post) => postOwner(post) !== teamId)
        .map((post) => ({ post, de: postOwner(post) ?? 'disputado', inimigo }));
    }
  };
}
