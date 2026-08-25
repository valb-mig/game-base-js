import * as THREE from 'three';
import { criarSoldado, soldadoPronto } from '../bots/model.js';
import { PLAYER_TEAM } from '../game/teams.js';

/**
 * O corpo do próprio jogador, visto em primeira pessoa.
 *
 * Olhar pra baixo e não ter corpo é o tipo de coisa que ninguém nota até
 * notar, e depois não desnota. E desde que a hitbox existe, ela está lá
 * mesmo quando o corpo não está: dava pra ver a própria caixa de acerto
 * flutuando sobre nada.
 *
 * A CABEÇA é escondida. A câmera fica dentro dela — a 1,56 m, e o capacete
 * vai até 1,75 —, e desenhá-la encheria a tela de dentro de capacete. Quem
 * vê a cabeça do jogador é o inimigo, e pra ele existe o soldado do mundo.
 *
 * O corpo segue a posição e o GIRO, nunca a inclinação: olhar pro céu não
 * deita o soldado de costas. Quem inclina é só a câmera.
 *
 * E ele fica ATRÁS do olho, não embaixo dele. Num corpo de verdade o olho
 * está na frente da cabeça e o tronco vem atrás; centrado na câmera, o tronco
 * ficava a 17 cm dela e enchia a tela inteira de ombro ao olhar pra baixo.
 *
 * O giro leva meia volta. Medido em espaço de câmera, o peito estava 1,4 cm
 * À FRENTE do olho e a mochila a 48 cm — ou seja, o corpo olhava pra dentro
 * da câmera, e o que enchia a tela era o próprio peito encostado na lente.
 * Com a meia volta o peito fica atrás, e as botas, que estavam 37 cm atrás
 * da nuca, passam a ficar na frente, que é onde os pés de alguém ficam.
 */

/** Malhas que somem em primeira pessoa: a câmera está dentro delas. */
const ESCONDER = /^(cabeca|rosto|pescoco|capacete)/;

/**
 * Os braços também somem daqui. Eles existem no viewmodel, presos à arma —
 * duplicá-los no mundo daria dois pares de braços em posições diferentes,
 * porque o do mundo não sabe de mira, coice nem balanço.
 */
const BRACOS = /^(mao|antebraco|ombreira|braco)/;

/**
 * Quanto o corpo recua atrás do olho, em metros.
 *
 * Poucos centímetros bastam: com o giro certo o peito já nasce atrás do olho.
 * O recuo existe pra tirar a gola do plano de corte da câmera, não pra
 * consertar posição — consertar posição com ele foi o que deixou o corpo
 * inteiro na frente da lente.
 */
const RECUO = 0.10;

export function initPlayerBody(scene, player, { team = PLAYER_TEAM } = {}) {
  if (!soldadoPronto()) return { update() {}, get visible() { return false; } };

  const feito = criarSoldado(team);
  if (!feito) return { update() {}, get visible() { return false; } };

  const grupo = feito.grupo;
  grupo.traverse((o) => {
    if (!o.isMesh || !o.name) return;
    if (ESCONDER.test(o.name) || BRACOS.test(o.name)) o.visible = false;
  });

  // A arma vai na mão do viewmodel, não nesta cópia.
  if (feito.maos) feito.maos.visible = false;

  // Pose só desta cópia: a perna vem à frente pra caber no campo de visão.
  //
  // Olhando pra baixo, o próprio peito tampa as pernas — anatomicamente certo
  // e visualmente inútil. Medido: pro pé escapar da silhueta do peito ele
  // precisa estar uns 44 cm à frente do corpo, que é passada de quem corre.
  // Este meio-termo mostra cinto, coxa e a ponta da bota; a passada inteira
  // deixava as botas boiando 26 cm do chão, e isso lê pior que perna curta.
  // O corpo do jogador é uma instância exclusiva dele, então dá pra inclinar
  // a coxa sem que ninguém mais veja isso — a hitbox sai de outra medida.
  // Sinal NEGATIVO: a perna aponta pro -y, e girar em +x a leva pra trás.
  for (const [nome, giro] of [['thigh_L', -0.55], ['thigh_R', -0.47], ['knee_L', 0.28], ['knee_R', 0.22]]) {
    const osso = grupo.getObjectByName(nome);
    if (osso) osso.rotation.x = giro;
  }

  scene.add(grupo);

  const olhar = new THREE.Vector3();

  return {
    grupo,

    get visible() {
      return grupo.visible;
    },

    update() {
      // Espectador não tem corpo: ele não está no jogo, está olhando.
      const mostrar = !player.spectating && player.alive;
      if (grupo.visible !== mostrar) grupo.visible = mostrar;
      if (!mostrar) return;

      // Só o giro. `camera.rotation.y` não é o yaw — a direção sai do vetor
      // de olhar, achatado, que é o mesmo caminho de player/heading.js.
      player.object.getWorldDirection(olhar);
      const giro = Math.atan2(olhar.x, olhar.z);
      grupo.rotation.y = giro;

      // Recuar é andar CONTRA o olhar, no plano.
      const plano = Math.hypot(olhar.x, olhar.z) || 1;
      const p = player.object.position;
      grupo.position.set(
        p.x - (olhar.x / plano) * RECUO,
        player.feetY,
        p.z - (olhar.z / plano) * RECUO
      );

      // Agachar e deitar encolhem o corpo como encolhem a hitbox: só em Y.
      grupo.scale.y = player.height / 1.75;
    }
  };
}
