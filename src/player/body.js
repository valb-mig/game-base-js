import * as THREE from 'three';
import { criarSoldadoEmPecas, soldadoPronto } from '../bots/model.js';
import { PLAYER_TEAM } from '../game/teams.js';
import { PLAYER } from '../config.js';
import { avancarFase, passoEm, embalarPara } from '../bots/passada.js';
import { POSTURAS, posturaDe } from '../bots/posturas.js';
import { apoioDaPostura, alturaDaPostura } from '../bots/model.js';
import { ossoDoLado, ALTURA_BASE } from '../bots/esqueleto.js';

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

/**
 * O quanto o próprio peito tem que ficar ATRÁS do olho, em metros.
 *
 * O recuo fixo acima resolve o corpo de pé e não sobrevive a postura: com o
 * tronco inclinado do agachamento, o peito passava 5 cm À FRENTE da lente e
 * tapava a tela inteira — o jogador agachava e via uma parede de farda.
 *
 * A correção é MEDIDA todo quadro em vez de escrita: onde estiver o peito
 * depois de posado, o corpo recua o que faltar. Assim qualquer pose futura
 * — rastejar, escalar, um agachamento mais fundo — já nasce protegida, e
 * ninguém precisa lembrar de reajustar uma constante.
 */
const PEITO_ATRAS = 0.08;

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
  const VIES = { thigh_L: -0.55, thigh_R: -0.47, knee_L: 0.28, knee_R: 0.22 };
  const pernas = {};
  for (const [nome, giro] of Object.entries(VIES)) {
    const osso = grupo.getObjectByName(nome);
    if (!osso) continue;
    osso.rotation.x = giro;
    pernas[nome] = osso;
  }

  /**
   * A passada do jogador é a MESMA dos bots, somada a esse viés.
   *
   * Somada e não no lugar dele: o viés existe pra que a perna escape da
   * silhueta do próprio peito, e o ciclo puro deixaria as botas fora do
   * campo de visão na metade do tempo. E é o mesmo módulo que anima o bot —
   * duas curvas de passada divergiriam no primeiro ajuste, e a de baixo
   * ninguém veria pra comparar.
   */
  const PERNAS = { dir: ossoDoLado(1), esq: ossoDoLado(-1) };
  let fase = 0;
  let embalo = 0;
  let eraX = 0;
  let eraZ = 0;

  /**
   * O repouso de cada osso que a postura mexe, pra a pose ser SOMADA a ele.
   *
   * Somada e não absoluta, pela mesma razão do gabarito da hitbox: escrita
   * como rotação absoluta, a postura descarta o que `posar` deixou no osso e
   * o corpo do jogador fica numa pose que nenhum soldado do mapa tem.
   */
  const repouso = new Map();
  const quadril = grupo.getObjectByName('hips');
  const repousoDoQuadril = quadril ? quadril.position.clone() : null;
  for (const postura of Object.values(POSTURAS)) {
    for (const nome of Object.keys(postura.ossos)) {
      if (repouso.has(nome)) continue;
      const osso = grupo.getObjectByName(nome);
      if (osso) repouso.set(nome, osso.quaternion.clone());
    }
  }
  const euler = new THREE.Euler();
  const giro = new THREE.Quaternion();

  /** Aplica a postura desta altura. Devolve o nome dela. */
  function posturar() {
    // Contra a altura do SOLDADO, que é a mesma referência que a hitbox do
    // jogador usa em `bots.js`. Duas bases diferentes discordariam na
    // fronteira entre duas posturas, e a fronteira é justamente onde o corpo
    // não pode piscar entre as duas.
    const nome = posturaDe(player.height, ALTURA_BASE);
    const pose = POSTURAS[nome] ?? POSTURAS.pe;

    for (const [osso, base] of repouso) {
      const alvo = grupo.getObjectByName(osso);
      if (!alvo) continue;
      alvo.quaternion.copy(base);
      const angulos = pose.ossos[osso];
      if (!angulos) continue;
      euler.set(angulos[0], angulos[1], angulos[2]);
      alvo.quaternion.multiply(giro.setFromEuler(euler));
    }

    if (quadril && repousoDoQuadril) {
      quadril.position.copy(repousoDoQuadril);
      if (nome !== 'pe') {
        // O apoio é o MESMO número que levanta a hitbox: os dois saem de
        // `apoioDaPostura`, e é isso que impede o corpo desenhado de flutuar
        // acima da caixa que leva o tiro.
        quadril.position.x += pose.quadril[0];
        quadril.position.y += pose.quadril[1] + apoioDaPostura(nome);
        quadril.position.z += pose.quadril[2];
      }
    }
    return nome;
  }

  function andar(delta, posado = false) {
    // Do CORPO, não do olho: inclinar pra espiar desloca a câmera 26 cm pro
    // lado sem que o pé saia do lugar, e lido do `position` isso adiantava o
    // ciclo da passada — a perna dava um passo que ninguém deu.
    const andou = Math.hypot(player.bodyX - eraX, player.bodyZ - eraZ);
    eraX = player.bodyX;
    eraZ = player.bodyZ;
    // Do deslocamento REAL, não de `player.velocity`: quem esbarra numa
    // parede continua com velocidade e para de andar, e a perna tem que
    // parar junto — senão o jogador corre no lugar contra a parede.
    const indo = delta > 0 ? andou / delta : 0;
    fase = avancarFase(fase, andou, indo, PLAYER.RUN_SPEED);

    // Fora de pé o ciclo não vale: rastejar e andar agachado são outros
    // movimentos, e a passada em pé aplicada a um corpo dobrado vira perna
    // pedalando no ar.
    embalo = embalarPara(embalo, posado ? 0 : indo, delta);
    const passo = passoEm(
      fase, posado ? 0 : indo, PLAYER.RUN_SPEED, PERNAS, posado ? 0 : embalo
    );
    if (posado) return passo;
    for (const [nome, osso] of Object.entries(pernas)) {
      osso.rotation.x = VIES[nome] + (passo.pose[nome]?.[0] ?? 0);
    }
    return passo;
  }

  // A escala do ARQUIVO, guardada: o modelo tem 1,80 m e o jogo trata o
  // soldado como 1,75, e essa razão vive nos três eixos. Escrever `scale.y`
  // direto — que era o que havia — deixava y em 1 e x/z em 0,972, ou seja um
  // corpo 3% mais alto que largo, e ninguém via porque o corpo é visto de
  // cima.
  const escalaBase = grupo.scale.clone();

  scene.add(grupo);

  const olhar = new THREE.Vector3();
  const doPeito = new THREE.Vector3();
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

    update(delta = 0) {
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
      // O corpo fica onde o CORPO está: inclinar pra espiar tira a cabeça da
      // linha da quina e deixa os pés atrás dela, e é isso que o jogador tem
      // que ver olhando pra baixo. Posto no olho, o corpo inteiro deslizava
      // 26 cm de lado — o que a manobra existe justamente pra não fazer.
      grupo.position.set(
        player.bodyX - (olhar.x / plano) * RECUO,
        player.feetY,
        player.bodyZ - (olhar.z / plano) * RECUO
      );

      // A postura entra ANTES da passada: ela reescreve os ossos a partir do
      // repouso, e a passada é o desvio que vem por cima.
      const postura = posturar();
      // O ciclo de passada só vale DE PÉ: agachado e deitado a postura já
      // escreveu a perna inteira, e o ciclo por cima apagaria a pose — foi o
      // que aconteceu, o joelho voltava a esticar dentro do agachamento.
      const passo = andar(delta, postura !== 'pe');

      // A pose baixa o corpo; a escala só ACERTA a altura declarada.
      //
      // Encolher em Y era o que havia enquanto não havia pose, e mentia pra
      // deitar: o corpo virava um tijolo de meio metro em vez de um homem de
      // dois metros no chão. Hoje quem deita é a pose. Mas a pose tem a
      // altura DELA — agachado, uns 1,05 m —, e o olho do jogador agachado
      // está a 0,95: sem acertar a razão, o peito fica na altura da lente e
      // tapa a tela inteira. Foi o que aconteceu.
      //
      // Uniforme nos três eixos, e sobre a escala do arquivo: mexer só no y
      // deixava o corpo 3% mais alto que largo.
      const posada = alturaDaPostura(postura);
      const fator = posada ? player.height / posada : 1;
      grupo.scale.copy(escalaBase).multiplyScalar(fator);

      // O balanço vertical entra na POSIÇÃO do grupo, e não no quadril como
      // no bot: aqui não há rig pra mexer em osso solto, e o pé de apoio
      // deste corpo já vive fora do campo de visão — o que se vê subir e
      // descer é a coxa, que é o que o balanço tem que dizer.
      grupo.position.y += passo.subida;

      // E agora que ele está posado, EMPURRA o que ficou na frente do olho.
      grupo.updateMatrixWorld(true);
      const peito = grupo.getObjectByName('chest') ?? grupo.getObjectByName('spine');
      if (peito) {
        peito.getWorldPosition(doPeito);
        doPeito.sub(player.object.position);
        // Quanto do peito está ATRÁS do olhar, no plano. Negativo é à frente.
        const atras = -(doPeito.x * (olhar.x / plano) + doPeito.z * (olhar.z / plano));
        if (atras < PEITO_ATRAS) {
          const falta = PEITO_ATRAS - atras;
          grupo.position.x -= (olhar.x / plano) * falta;
          grupo.position.z -= (olhar.z / plano) * falta;
        }
      }
    }
  };
}
