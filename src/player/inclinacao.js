import * as THREE from 'three';
import { INCLINACAO } from '../config.js';
import { isDown } from '../core/input.js';
import { collides } from './collision.js';
import { horizontalRight } from './heading.js';
import { PRONE, LEAN_LEFT_KEYS, LEAN_RIGHT_KEYS } from './constants.js';

/**
 * Inclinar o corpo pra fora da cobertura, no Q e no E.
 *
 * A manobra que faz esquina virar posição: a cabeça sai da linha do batente e
 * espia sem que o tronco apareça. Ela é MECÂNICA, e não acabamento — o que
 * significa quatro coisas, todas saindo de um tombo só do tronco em cima do
 * quadril:
 *
 *  - o olho ANDA. Rolar a imagem sem mover a cabeça revelaria exatamente o
 *    mesmo campo e faria o jogador levar tiro onde a tela diz que ele não
 *    está;
 *  - a boca do cano vai com ele, de graça: `items/muzzle.js` monta a origem do
 *    tiro em cima de `camera.position`, e é a câmera que se desloca;
 *  - a hitbox anda junto (`inclinarCaixas`), senão espiar seria imunidade;
 *  - contra parede não passa: o lado pedido é testado com o MESMO `collides`
 *    do corpo, e o que não cabe inclina menos ou não inclina.
 *
 * O viewmodel não entra nisso, e isso é decisão: a cena dele É o espaço da
 * câmera, então a arma já viaja com a cabeça no mundo (é daí que a boca do cano
 * sai) e, na TELA, ela fica parada enquanto o mundo tomba — que é exatamente o
 * que se vê inclinando a cabeça com uma arma na mão. Uma pose própria pra
 * inclinar seria enfeite por cima de uma mecânica que já está lá.
 *
 * O que este módulo NUNCA move é o corpo: `player.bodyX`/`bodyZ` continuam
 * onde a locomoção os deixou, e o deslocamento é desfeito e refeito a cada
 * quadro em cima deles. Sem isso a inclinação viraria um passo de lado, e
 * soltar a tecla deixaria o jogador vinte centímetros fora do lugar.
 */

const grausPra = Math.PI / 180;
const direita = new THREE.Vector3();

/**
 * Frações testadas quando o lado pedido não cabe, da cheia pra nenhuma.
 *
 * Ladeira de degraus em vez de busca binária porque quatro `collides` numa
 * grade indexada não custam nada e o resultado não precisa de precisão de
 * milímetro — quem suaviza o resto é o próprio ritmo de entrada. E o último
 * degrau é ZERO de propósito: é ele que garante que ninguém fica preso
 * inclinado, nem quem já estava dentro de geometria antes de apertar a tecla.
 */
const DEGRAUS = [1, 0.75, 0.5, 0.25, 0];

/** Distância do quadril ao olho: é o braço de alavanca do tombo. */
function braco(player) {
  return player.height * (1 - INCLINACAO.PIVO);
}

/** Deslocamento lateral do olho, em metros. Positivo é pra direita DELE. */
export function deslocamentoLateral(player) {
  return braco(player) * Math.sin(INCLINACAO.ANGULO * grausPra * player.inclina);
}

/** O quanto o olho DESCE, em metros: é o que o arco encurta. Nunca positivo. */
export function quedaDoOlho(player) {
  return -braco(player)
    * (1 - Math.cos(INCLINACAO.ANGULO * grausPra * player.inclina));
}

/**
 * Rolagem que a vista herda do tombo, em radianos.
 *
 * Negativa pra direita, que é o mesmo sinal que `view.js` já usa pra quem anda
 * de lado — os dois somam na mesma conta e não podem discordar de direção.
 */
export function rolagemDaInclinacao(player) {
  return -INCLINACAO.ANGULO * grausPra * player.inclina * INCLINACAO.ROLAGEM;
}

/**
 * O lado pedido pelas teclas: -1 esquerda, +1 direita, 0 nenhum.
 *
 * Deitado não inclina (de barriga no chão isso é rolar, e o modelo não rola),
 * nadando não inclina (não há cobertura na água), no ar não inclina (espiar
 * pulando é truque, não manobra) e correndo não inclina — inclinar é postura
 * de tiro, e é justamente parar na quina que a manobra cobra. Nenhum desses
 * casos TRAVA nada: o alvo vira zero e o corpo se apruma no tempo de volta.
 */
function ladoPedido(player) {
  if (player.swimming || player.stance === PRONE) return 0;
  if (!player.onGround || player.running) return 0;

  const esquerda = isDown(...LEAN_LEFT_KEYS) ? 1 : 0;
  // O E pode estar reservado por quem apanha item ou embarca; ver `travarE`.
  const direitaTecla = !player.inclinaTravaE && isDown(...LEAN_RIGHT_KEYS) ? 1 : 0;
  return direitaTecla - esquerda;   // as duas juntas se cancelam
}

/**
 * A maior fração do tombo que cabe pra este lado, de 0 a 1.
 *
 * O teste é o do CORPO, com o cilindro inteiro na posição em que o olho vai
 * ficar. Testar só uma bolinha na cabeça deixaria o ombro atravessar a parede;
 * e é o ombro que encosta primeiro na vida real.
 */
function maiorQueCabe(player, lado) {
  const bx = player.bodyX;
  const bz = player.bodyZ;
  horizontalRight(player.object.quaternion, direita);
  const cheio = braco(player) * Math.sin(INCLINACAO.ANGULO * grausPra) * lado;

  for (const fracao of DEGRAUS) {
    const d = cheio * fracao;
    if (!collides(player.colliders,
      bx + direita.x * d, bz + direita.z * d, player.feetY, player.height)) {
      return fracao;
    }
  }
  return 0;
}

/**
 * Escreve o deslocamento no `position` da câmera.
 *
 * O X e o Z são desfeitos e refeitos aqui, e não em `view.js`, porque quem
 * pergunta o corpo (`bodyX`) subtrai justamente este offset: se o offset
 * mudasse num lugar e a posição em outro, os dois discordariam no meio do
 * quadro. O Y fica pra `view.js`, que já reescreve a altura inteira a partir
 * de `eyeY` e não precisa desfazer nada.
 */
function aplicar(player) {
  const corpoX = player.bodyX;
  const corpoZ = player.bodyZ;
  const off = player.inclinaOffset;

  horizontalRight(player.object.quaternion, direita);
  const desloc = deslocamentoLateral(player);

  off.x = direita.x * desloc;
  off.z = direita.z * desloc;
  // A cabeça desce o que o arco encurta. É a MESMA rotação que desloca de
  // lado, então a hitbox sabe aplicá-la também — e é por isso que ela entra:
  // vista mais baixa que a cabeça de verdade é levar tiro num crânio que o
  // jogador não usa pra ver.
  off.y = quedaDoOlho(player);

  player.object.position.x = corpoX + off.x;
  player.object.position.z = corpoZ + off.z;
}

/** Um quadro da inclinação. Roda depois da locomoção e antes da vista. */
export function updateInclinacao(player, delta) {
  // O E volta a valer como inclinar assim que sobe: a trava é do TOQUE que
  // alguém consumiu, não da tecla.
  if (!isDown(...LEAN_RIGHT_KEYS)) player.inclinaTravaE = false;

  const alvo = ladoPedido(player);
  // Nada pedido e nada aplicado: nem os quatro `collides` do teste de parede.
  if (alvo === 0 && player.inclina === 0) return;

  const permitido = alvo === 0 ? 0 : alvo * maiorQueCabe(player, alvo);

  // Ritmo LINEAR, e não exponencial como os enfeites de `view.js`: o tempo
  // declarado no config é o tempo que se mede, em vez de uma assíntota que
  // nunca chega. E voltar tem ritmo próprio, mais rápido.
  const voltando = Math.abs(permitido) <= Math.abs(player.inclina);
  const tempo = voltando ? INCLINACAO.TEMPO_VOLTA : INCLINACAO.TEMPO_ENTRA;
  const passo = delta / Math.max(tempo, 1e-4);

  if (Math.abs(permitido - player.inclina) <= passo) player.inclina = permitido;
  else player.inclina += Math.sign(permitido - player.inclina) * passo;

  aplicar(player);
}

/**
 * Desfaz a inclinação e devolve a câmera pro corpo, agora.
 *
 * Pra quem tira o jogador do laço: nascer, virar fantasma, sentar no jipe.
 * Dirigindo `player.update` não roda, então sem isto o deslocamento ficaria
 * pendurado no `position` e `bodyX` responderia errado ao descer.
 */
export function zerarInclinacao(player) {
  // Quem não tem inclinação não tem o que aprumar. `veiculos` não sabe quem
  // está no volante — pode ser um bot, que não inclina — e obrigar todo
  // motorista a declarar estado de inclinação seria contrato emprestado.
  if (!player?.inclinaOffset) return;

  const off = player.inclinaOffset;
  player.object.position.x -= off.x;
  player.object.position.z -= off.z;
  off.set(0, 0, 0);
  player.inclina = 0;
  player.inclinaTravaE = false;
}

/**
 * Avisa que o toque no E foi consumido por outra ação (apanhar, embarcar).
 *
 * A inclinação larga o E até ele subir. Sem isto, apanhar um item ao lado de
 * um jipe dava um solavanco de um quarto de segundo pro lado — e a tecla é
 * disputada por três sistemas, não dois.
 */
export function travarE(player) {
  if (player) player.inclinaTravaE = true;
}

/**
 * Altura do centro da caixa da CABEÇA, medida das caixas que chegaram.
 *
 * Ela é a referência do tombo, e não a altura do olho, porque as duas não
 * batem: `corpoDe` escala o corpo até que o topo do capacete fique na altura
 * do olho, então o olho mora 30 cm acima do centro da cabeça. Normalizando
 * pela altura do olho, a caixa da cabeça andava 15,3 cm enquanto o olho andava
 * 25,6 — dez centímetros em que o jogador vê e não é visto, que é exatamente a
 * imunidade que inclinar não pode dar. Medida em vez de escrita porque a
 * hitbox sai da MALHA quando há modelo.
 */
function alturaDaCabeca(caixas) {
  for (const caixa of caixas) {
    if (caixa.regiao?.id === 'cabeca') return (caixa.minY + caixa.maxY) / 2;
  }
  let topo = 0;
  for (const caixa of caixas) if (caixa.maxY > topo) topo = caixa.maxY;
  return topo;
}

/**
 * Inclina as caixas de acerto de um corpo, no sistema DELE.
 *
 * É a mesma rotação do olho aplicada ao centro de cada caixa: o que está
 * acima do quadril anda, o que está abaixo fica. Girar a caixa em si não
 * serve — elas são alinhadas aos eixos, e uma caixa girada vira uma
 * envolvente muito maior que a peça (o mesmo problema do prop tombado na
 * diagonal). Deslocar o centro de cada peça descreve o tombo com a precisão
 * que dezesseis caixas dão, e nenhuma delas cresce.
 */
export function inclinarCaixas(caixas, player) {
  if (!player.inclina) return caixas;

  const pivo = player.height * INCLINACAO.PIVO;
  const referencia = alturaDaCabeca(caixas) - pivo;
  if (referencia <= 1e-6) return caixas;

  // A cabeça anda exatamente o que o OLHO anda, e o resto se reparte entre ela
  // e o quadril. Acima da cabeça (o capacete) o teto é 1: passar dele seria
  // esticar o corpo, e ele já está no fim do braço de alavanca.
  const desloc = deslocamentoLateral(player);
  const queda = quedaDoOlho(player);

  for (const caixa of caixas) {
    const altura = (caixa.minY + caixa.maxY) / 2 - pivo;
    if (altura <= 0) continue;   // perna não vai; é o pivô que faz a manobra

    const fracao = Math.min(1, altura / referencia);
    caixa.minX += desloc * fracao;
    caixa.maxX += desloc * fracao;
    caixa.minY += queda * fracao;
    caixa.maxY += queda * fracao;
  }
  return caixas;
}
