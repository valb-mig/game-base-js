import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { criarFisica } from './fisica.js';
import { sondarDe, barradoDe } from './mundo.js';
import {
  criarDano, danoDeCastigo, APRUMADO, INUTILIZADO, DESTRUIDO
} from './dano.js';
import { criarAssentos } from './assentos.js';
import { criarJipe, jipePronto } from './modelo.js';
import { pontoDoCasco, pontoParaLocal, vetorParaLocal } from './casco.js';
import { regioesDoVeiculo } from './hitbox.js';
import { atropelar } from './atropelamento.js';

/**
 * Um veículo no mundo: modelo, física, dano, assentos e colisor.
 *
 * Ele é ALVO com o mesmo contrato do soldado (`alive`, `feetY`, `yaw`,
 * `body()`, `damage()`), e é isso que faz tiro no pneu existir sem nenhuma
 * linha nova na balística: a bala já sabe entrar no sistema do alvo e testar
 * caixa por caixa. O que muda são as REGIÕES — em vez de cabeça e tronco,
 * motor, tanque, carroceria e quatro pneus.
 *
 * O colisor NÃO é `standable`. Seria bonito subir no capô, mas o veículo lê a
 * altura do chão com `groundHeightAt`, que não sabe ignorar um colisor: o jipe
 * acharia o próprio teto e subiria em si mesmo, quadro após quadro.
 */

export function criarVeiculo(scene, world, { ficha, x, z, yaw = 0 }) {
  const colliders = world.colliders;
  const terrain = world.terrain;
  const dano = criarDano(ficha.RODAS);
  const assentos = criarAssentos(ficha);
  const modelo = jipePronto() ? criarJipe(ficha) : null;
  if (modelo) scene.add(modelo.grupo);

  /**
   * `collider`, em inglês, e não `colisor`.
   *
   * É NOME DE CONTRATO: a balística monta a lista de caixas a ignorar com
   * `target.collider`, como faz com o soldado. Com o nome traduzido ela não
   * encontrava nada, a caixa do próprio jipe virava parede, e a bala morria
   * 15 cm antes de chegar no pneu. Medido: oito tiros de doze metros, zero
   * acertos registrados — e nada no console.
   */
  const collider = { box: new THREE.Box3(), standable: false, veiculo: null };
  const cantos = Array.from({ length: 8 }, () => new THREE.Vector3());
  const origem = new THREE.Vector3();
  const centro = new THREE.Vector3();
  const p = {};

  /**
   * O corpo, e as duas únicas coisas que ele sabe do mundo: onde está o chão e
   * onde ele não cabe. `veiculos/mundo.js` é essa adaptação, e é ela que deixa
   * a física ser exercitada num teste com um terreno de três linhas.
   *
   * As duas leem `corpo` e por isso são criadas com ele: a sondagem precisa da
   * altura atual pra saber que topo de colisor está ao alcance, e a colisão
   * precisa do giro pra girar a pegada.
   */
  const corpo = criarFisica(ficha, {});
  const sondar = sondarDe(world, corpo, ficha);
  const barrado = barradoDe(ficha, world, corpo, collider);
  corpo.mundo(sondar, barrado, (id) => dano.pneuDe(id));
  corpo.assentar(x, z, yaw);

  /**
   * Vaga bloqueada estoura na MONTAGEM, como bandeira dentro de parede.
   *
   * Veículo que nasce dentro de uma casa fica preso pra sempre, e o sintoma é
   * um jipe que simplesmente não anda: nenhum erro, nenhuma pista. Quem
   * escolhe o lugar é o mapa (`world.garagem`), e é lá que o conserto tem que
   * ser feito — por isso a mensagem diz a coordenada.
   */
  if (barrado(corpo.x, corpo.z)) {
    throw new Error(
      `vaga de veículo bloqueada em ${corpo.x.toFixed(1)}, ${corpo.z.toFixed(1)}`);
  }

  const regioes = regioesDoVeiculo(ficha);
  colliders.push(collider);

  const veiculo = {
    ficha,
    corpo,
    dano,
    assentos,
    modelo,
    collider,
    // Marca pra quem precisa distinguir veículo de gente sem testar campo por
    // campo: a fagulha de bala em chapa não é a de bala em corpo.
    veiculo: true,
    name: ficha.nome,
    radius: ficha.MEIO_COMPRIMENTO,

    // --- contrato de ALVO da balística
    get alive() {
      // Sucata continua sendo acertável: ela ainda está ali, e a bala tem que
      // bater em vez de atravessar.
      return true;
    },
    get x() { return corpo.x; },
    get z() { return corpo.z; },
    get yaw() { return corpo.yaw; },
    get feetY() { return corpo.y; },
    get velocidade() { return corpo.velocidade; },
    get kmh() { return corpo.velocidade * 3.6; },

    center() {
      return centro.set(corpo.x, corpo.y + ficha.ALTURA_CM, corpo.z);
    },

    /**
     * O veículo gira em TRÊS eixos, e por isso ele mesmo faz a conversão.
     *
     * O soldado fica em pé: um yaw descreve a pose dele inteira, e a balística
     * leva a bala pro sistema dele com um seno e um cosseno. O veículo cai e
     * rola — numa ladeira ele passa a partida inclinado —, e com o yaw sozinho
     * a hitbox ficava RETA enquanto a carroceria pendia. O sintoma se vê no
     * F2: as caixas vermelhas niveladas por cima de um jipe tombado.
     *
     * A saída não é transformar as onze caixas pro mundo (onze caixas por
     * veículo por bala) e não é dar um quaternion pra balística: é o alvo
     * responder as duas perguntas que ela faz — onde este PONTO cai no meu
     * sistema, e pra onde aponta este VETOR. Quem não implementa continua
     * caindo no yaw, e o soldado não mudou uma linha.
     *
     * O sistema é o do MODELO: origem no chão entre as rodas, +x à esquerda,
     * +z na frente — o mesmo em que `hitbox.js` mede as regiões da malha.
     */
    paraLocal(px, py, pz, out) {
      return pontoParaLocal(ficha, corpo, px, py, pz, out);
    },

    vetorParaLocal(vx, vy, vz, out) {
      return vetorParaLocal(corpo, vx, vy, vz, out);
    },

    /** O caminho de volta, pro desenho de depuração girar as caixas junto. */
    paraMundo(lx, ly, lz, out) {
      return pontoDoCasco(ficha, corpo, lx, ly, lz, out);
    },

    /** As regiões, no sistema do modelo. Ver `paraLocal` logo acima. */
    body(saida) {
      saida.length = 0;
      for (const r of regioes) saida.push(r);
      return saida;
    },

    damage(amount, regiao = null, impacto = null) {
      const quanto = amount * (regiao?.multiplicador ?? 1);
      dano.aplicar(regiao?.nome ?? 'carroceria', quanto, regiao?.roda ?? null);
      return { target: veiculo, amount: quanto, killed: false, regiao, impacto };
    },

    /** Alguém ocupa este veículo? Quem pergunta é quem oferece o E. */
    ocupado() {
      return !assentos.vazio;
    },

    /**
     * Onde um ocupante desce, no mundo.
     *
     * Ao lado do assento e pra fora do veículo. Sem checar colisão de
     * propósito: sair pra dentro de uma parede é melhor que não conseguir
     * sair — quem trancar o jogador dentro de um jipe encostado num muro
     * criou o mesmo problema que `stance.js` existe pra evitar.
     */
    saidaDe(lugar, saida = new THREE.Vector3()) {
      const lado = Math.sign(lugar.def.x) || 1;
      pontoDoCasco(ficha, corpo,
        lado * (ficha.MEIA_LARGURA + PLAYER.RADIUS + 0.35), 0, lugar.def.z, p);
      return saida.set(p.x, terrain.heightAt(p.x, p.z), p.z);
    },

    /**
     * A lista de alvos do mundo chama `update` em TODO MUNDO, e o veículo está
     * nela — é assim que a bala o encontra. Se o passo da física morasse em
     * `update`, ele rodaria duas vezes por quadro: uma pelo gerente, com os
     * comandos, e outra pelo laço de alvos, sem nenhum. O resultado seria um
     * jipe meio freado e aos pulos. Aqui é no-op, como no alvo do jogador.
     */
    update() {},

    /** Um quadro de veículo. Quem chama é `veiculos/veiculos.js`, e só ele. */
    passo(delta, comandos = {}, alvos = []) {
      /**
       * Veículo INUTILIZADO não recebe comando, mas continua sendo física.
       *
       * Ele ainda desce ladeira, ainda tem inércia e ainda pode ser empurrado
       * — o que ele perdeu é o motor. Congelar a física de um jipe morto
       * deixaria uma sucata flutuando na encosta.
       */
      const morto = dano.integridade === INUTILIZADO
        || dano.integridade === DESTRUIDO
        || dano.postura !== APRUMADO;
      corpo.step(delta, morto ? { freio: 0.15 } : { ...comandos, torque: dano.torque });

      // Postura, e o castigo de bater, cair e capotar. A regra é de `dano.js`
      // e não daqui: ela não conhece three nem mundo.
      danoDeCastigo(dano, corpo);

      atropelar(veiculo, alvos, assentos.ocupantes(), delta);
      veiculo.desenhar();
      veiculo.moverColisor();
    },

    desenhar() {
      if (!modelo) return;
      pontoDoCasco(ficha, corpo, 0, 0, 0, p);
      origem.set(p.x, p.y, p.z);
      modelo.pose(corpo, origem);
    },

    /**
     * A caixa de colisão sai dos OITO CANTOS passados pela mesma rotação que
     * move o modelo, como a do prop tombado. Conta fechada erraria: já errou
     * duas vezes nesta base, e o sintoma foi colisor 91 cm acima do corpo.
     */
    moverColisor() {
      collider.box.makeEmpty();
      let i = 0;
      for (const lx of [ficha.MEIA_LARGURA, -ficha.MEIA_LARGURA]) {
        for (const ly of [0, ficha.ALTURA]) {
          for (const lz of [ficha.MEIO_COMPRIMENTO, -ficha.MEIO_COMPRIMENTO]) {
            pontoDoCasco(ficha, corpo, lx, ly, lz, p);
            collider.box.expandByPoint(cantos[i++].set(p.x, p.y, p.z));
          }
        }
      }
      // Colisor que se move AVISA o índice, senão a grade continua apontando
      // pro lugar onde o jipe estacionou e o jogador esbarra no ar.
      colliders.moveu?.(collider);
    }
  };

  collider.veiculo = veiculo;
  veiculo.desenhar();
  veiculo.moverColisor();
  return veiculo;
}
