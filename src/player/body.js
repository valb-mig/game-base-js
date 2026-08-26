import * as THREE from 'three';
import { criarSoldadoEmPecas, soldadoPronto } from '../bots/model.js';
import { PLAYER_TEAM } from '../game/teams.js';

/**
 * O corpo do próprio jogador, visto em primeira pessoa.
 *
 * Olhar pra baixo e não ter corpo é o tipo de coisa que ninguém nota até
 * notar, e depois não desnota. E desde que a hitbox existe, ela está lá
 * mesmo quando o corpo não está: dava pra ver a própria caixa de acerto
 * flutuando sobre nada.
 *
 * A CABEÇA nem é carregada. A câmera fica dentro dela — a 1,56 m, e o
 * capacete vai até 1,75 —, e desenhá-la encheria a tela de dentro de
 * capacete. Quem vê a cabeça do jogador é o inimigo, e pra ele existe o
 * soldado do mundo.
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

/**
 * Galhos que o corpo do jogador não carrega. Removidos, não escondidos: o
 * modelo do jogador é uma cópia exclusiva dele, e o que não aparece também
 * não precisa existir — cada malha aqui é um `draw call` por quadro.
 *
 * `neck` leva junto cabeça, capacete, pescoço e a INSÍGNIA do capacete, que
 * é filha de `head`. Foi ela que sobrou da primeira tentativa: escondendo
 * por nome, `insignia` não casava com nada, e ela fica na altura do olho —
 * atravessava a câmera de dentro.
 *
 * Os ombros levam os braços e o nó `weapon`. Braço quem desenha é o
 * viewmodel, preso à arma; um segundo par no mundo ficaria em outra pose,
 * porque o do mundo não sabe de mira, coice nem balanço.
 */
const SEM_ISSO = ['neck', 'shoulder_L', 'shoulder_R'];

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

  // Em PEÇAS, não a malha fundida dos bots: logo abaixo o corpo remove a
  // cabeça e o capacete por nome, e malha fundida não tem peça pra remover.
  // Aqui é um corpo só, então as 36 malhas não custam nada.
  const feito = criarSoldadoEmPecas(team);
  if (!feito) return { update() {}, get visible() { return false; } };

  const grupo = feito.grupo;
  for (const nome of SEM_ISSO) grupo.getObjectByName(nome)?.removeFromParent();

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
  let escondido = false;

  return {
    grupo,

    get visible() {
      return grupo.visible;
    },

    /**
     * Desliga o corpo. Existe pra quem está DIRIGINDO: o corpo é posado em pé,
     * e um corpo em pé dentro de um assento fica com as pernas enfiadas no
     * assoalho e o tronco meio metro alto. Quem aparece na tela nesse caso são
     * as mãos do viewmodel, que vivem no espaço da câmera.
     */
    set visible(v) {
      escondido = !v;
      if (!v) grupo.visible = false;
    },

    update() {
      // Espectador não tem corpo: ele não está no jogo, está olhando.
      const mostrar = !escondido && !player.spectating && player.alive;
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
