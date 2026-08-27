import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { PICK_KEYS } from '../player/constants.js';
import { consumePress } from '../core/input.js';
import { travarE, zerarInclinacao } from '../player/inclinacao.js';
import { JIPE } from './jipe.js';
import { criarVeiculo } from './veiculo.js';
import { criarVista, aprumarVista } from './vista.js';
import { comandosDoTeclado, resolverComandos } from './piloto.js';
import { DESTRUIDO } from './dano.js';

/**
 * O gerente de veículos: a lista, o laço e o embarque do jogador.
 *
 * Mesmo desenho de `bots/bots.js` — o laço atualiza uma lista, e a lista pode
 * ter um. E é ele, e só ele, que mexe em `player.vehicle`: espalhar entrar e
 * sair pelo jogo foi o que tornou o fluxo antigo de telas difícil de mexer, e
 * a lição vale igual aqui.
 */

/**
 * Alcance pra entrar, no plano, medido do CENTRO do veículo.
 *
 * Ele tem que cobrir meio jipe MAIS o quanto o colisor mantém o jogador
 * afastado. Na ponta são 1,7 m de carroceria mais 0,4 de raio do corpo: com
 * 2,6 sobrava uma faixa de meio metro pra acertar, e chegar pela frente do
 * capô parecia que o E não funcionava. Pela lateral são 0,78 + 0,4, e ali
 * sempre houve folga — o defeito só aparecia num dos dois lados.
 */
const ALCANCE = 3.6;

/**
 * Onde a mão pega o volante, em metros do centro.
 *
 * O aro do MB tem 16,5 cm de raio; 15 põe a mão no aro e não na borda de
 * fora dele. É a posição de nove e três horas, que é como se dirige um
 * veículo sem direção assistida — e é a única em que as duas mãos aparecem
 * na tela.
 */
const ARO = 0.15;

/**
 * `lerComandos` entra por fora de propósito.
 *
 * O veículo não sabe quem o dirige: um bot que aprenda a dirigir vai produzir o
 * MESMO objeto de comandos, e a física não vai notar a diferença. É também o
 * que deixa a suíte dirigir sem teclado — em headless não há tecla nenhuma
 * pra apertar, e sem isto a única coisa testável seria o veículo parado.
 */
export function criarVeiculos(scene, world, camera, player, {
  lerComandos = comandosDoTeclado
} = {}) {
  const lista = [];
  const vista = criarVista(camera);
  const posicao = new THREE.Vector3();
  const maoEsq = new THREE.Vector3();
  const maoDir = new THREE.Vector3();
  const paraCamera = new THREE.Matrix4();
  const maos = { esq: maoEsq, dir: maoDir };

  function criar(x, z, yaw = 0, ficha = JIPE) {
    const veiculo = criarVeiculo(scene, world, { ficha, x, z, yaw });
    lista.push(veiculo);
    // Ele entra na lista de alvos do MUNDO, que é a da balística e a do
    // telêmetro. Não entra na lista dos bots: eles não sabem atirar em
    // veículo, e um alvo sem time faria `enemyOf` responder o que não existe.
    world.targets?.push(veiculo);
    return veiculo;
  }

  /**
   * O veículo alcançável agora, ou null. É o que o aviso de tecla lê.
   *
   * Sucata não é oferecida: entrar num jipe destruído promete um transporte
   * que não existe.
   */
  function alcancavel() {
    if (player.spectating || !player.alive) return null;
    const p = player.object.position;
    let melhor = null;
    let perto = ALCANCE;

    for (const veiculo of lista) {
      if (veiculo.dano.integridade === DESTRUIDO) continue;
      if (!veiculo.assentos.livre()) continue;
      // Altura com folga de um corpo, como o alcance de apanhar item: medir em
      // 3D a partir dos olhos gastaria metade do alcance só porque o assento
      // está na altura da cintura.
      if (Math.abs(veiculo.corpo.y - player.feetY) > PLAYER.HEIGHT + 0.6) continue;
      const d = Math.hypot(veiculo.corpo.x - p.x, veiculo.corpo.z - p.z);
      if (d < perto) {
        perto = d;
        melhor = veiculo;
      }
    }
    return melhor;
  }

  function embarcar(veiculo) {
    const lugar = veiculo.assentos.sentar(player.asTarget ?? player);
    if (!lugar) return false;

    // Sentado, `player.update` não roda: a inclinação ficaria pendurada no
    // `position` da câmera e `bodyX` responderia errado ao descer.
    zerarInclinacao(player);

    player.vehicle = { veiculo, lugar };
    player.velocity.set(0, 0, 0);
    player.verticalVelocity = 0;
    vista.reiniciar(veiculo);
    return true;
  }

  function desembarcar() {
    const dentro = player.vehicle;
    if (!dentro) return false;

    dentro.veiculo.assentos.levantar(player.asTarget ?? player);
    dentro.veiculo.saidaDe(dentro.lugar, posicao);
    player.vehicle = null;

    // Ele desce EM PÉ, no chão, e com a vista aprumada: a rolagem que a
    // câmera tinha dentro do jipe ficaria pra sempre se ninguém a zerasse. E
    // ela é zerada pelo euler YXZ, não por `camera.rotation.z = 0` — esse
    // atalho reescreve a orientação inteira na ordem errada.
    aprumarVista(camera);
    player.eyeY = posicao.y + player.height;
    player.floorY = posicao.y;
    player.object.position.set(posicao.x, player.eyeY, posicao.z);
    player.velocity.set(0, 0, 0);
    player.verticalVelocity = 0;
    player.onGround = true;
    return true;
  }

  return {
    lista,
    criar,
    alcancavel,
    embarcar,
    desembarcar,

    /**
     * Onde as duas mãos vão, no espaço da CÂMERA — que é o espaço da cena do
     * viewmodel. Null pra quem não está no volante.
     *
     * Os pontos saem do ARO do volante, no sistema dele: assim as mãos giram
     * junto com o volante sem existir código nenhum pra isso, e continuam no
     * lugar certo quando o jogador olha em volta, porque o alvo é recalculado
     * do mundo a cada quadro.
     *
     * `+X` é a esquerda do veículo, e o motorista senta nesse lado — a mão
     * esquerda dele é a que fica no lado +X do aro.
     */
    maosNoVolante() {
      const dentro = player.vehicle;
      if (!dentro?.lugar.def.dirige) return null;
      const no = dentro.veiculo.modelo?.volante;
      if (!no) return null;

      no.updateMatrixWorld();
      camera.updateMatrixWorld();
      paraCamera.copy(camera.matrixWorld).invert();

      maoEsq.set(ARO, 0, 0).applyMatrix4(no.matrixWorld).applyMatrix4(paraCamera);
      maoDir.set(-ARO, 0, 0).applyMatrix4(no.matrixWorld).applyMatrix4(paraCamera);
      return maos;
    },

    /** O aviso de tecla: o nome do que o E faz agora, ou null. */
    aviso() {
      if (player.vehicle) return 'Sair';
      const perto = alcancavel();
      return perto ? perto.name : null;
    },

    update(delta, alvos = []) {
      let dentro = player.vehicle;

      /**
       * Morreu ou virou fantasma dentro do jipe: o assento vaga.
       *
       * Sem isto o lugar ficava ocupado pelo resto da partida e a vista
       * continuava sendo escrita a partir do assento — o espectador nascia
       * grudado num veículo, sessenta metros abaixo de onde deveria estar.
       */
      if (dentro && (!player.alive || player.spectating)) {
        dentro.veiculo.assentos.levantar(player.asTarget ?? player);
        player.vehicle = null;
        aprumarVista(camera);
        dentro = null;
      }

      // O E é lido aqui porque é aqui que se sabe se ele tem o que fazer.
      // Ele DISPUTA com apanhar item do chão, e o veículo ganha quando há um
      // ao alcance: um item largado ao lado do jipe faria as duas ações
      // brigarem pela tecla, e a que perdesse pareceria quebrada.
      const perto = dentro ? null : alcancavel();
      // A tecla só é CONSUMIDA quando há o que fazer com ela. Consumir sempre
      // engoliria o E de apanhar item toda vez que o jogador estivesse longe
      // de qualquer veículo — e `drops` nunca veria a tecla.
      const podeUsar = player.isLocked && !player.spectating && (dentro || perto);
      let usou = false;
      if (podeUsar && consumePress(...PICK_KEYS)) {
        // O terceiro pretendente do E é inclinar o corpo, que lê a tecla
        // SEGURADA. Quem consome o toque avisa, senão embarcar deixava o
        // jogador espiando pro lado por um quarto de segundo.
        travarE(player);
        usou = dentro ? desembarcar() : embarcar(perto);
      }

      for (const veiculo of lista) {
        const lugar = veiculo === player.vehicle?.veiculo ? player.vehicle.lugar : null;
        const dirigindo = lugar?.def.dirige && player.isLocked;
        const comandos = dirigindo
          ? resolverComandos(lerComandos(), veiculo.corpo.aoLongo)
          : { acelerar: 0, esterco: 0, freio: 0.25, freioMao: false };
        veiculo.passo(delta, comandos, alvos);
      }

      // A câmera vem DEPOIS da física: o assento só está no lugar certo
      // depois de o corpo ter se movido neste quadro.
      if (player.vehicle) {
        vista.update(delta, player.vehicle.veiculo, player.vehicle.lugar);
        // O jogador continua sendo alvo, e a hitbox dele sai de `feetY`: sem
        // atualizar isto, ele continuaria sendo acertável onde entrou no jipe.
        player.eyeY = camera.position.y;
        player.floorY = player.eyeY - player.height;
      }
      return usou;
    }
  };
}
