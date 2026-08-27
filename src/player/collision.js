import { PLAYER, WORLD } from '../config.js';
import { intervaloVertical } from '../world/caixagirada.js';

// O player é um cilindro. Em vez de testar cilindro-vs-caixa, a AABB do
// colisor é inflada em RADIUS no plano XZ e o centro do player vira um
// ponto — mesmo resultado, muito mais barato (soma de Minkowski).
//
// RADIUS e STEP_HEIGHT são globais de propósito: valem pro mundo inteiro, e
// classe nenhuma deve sobrescrever (ver classes.js).
/**
 * Os colisores que podem cobrir (x, z).
 *
 * Uma `ListaDeColisores` responde `perto` e devolve só a célula da grade —
 * uns poucos em vez de milhares. Um Array simples não responde, e aí o laço é
 * a lista inteira: é o caso de todo dublê de teste, e continua correto, só
 * mais caro. Medido no mapa de verdade, a varredura linear com 2000 colisores
 * já custava 13% do orçamento a 60 fps.
 */
function candidatos(colliders, x, z) {
  return colliders.perto ? colliders.perto(x, z) : colliders;
}

function overlapsXZ(box, x, z, radius = PLAYER.RADIUS) {
  return x >= box.min.x - radius
      && x <= box.max.x + radius
      && z >= box.min.z - radius
      && z <= box.max.z + radius;
}

/**
 * Onde a vertical em (x, z) entra e sai do colisor, em Y de mundo — ou `null`
 * se ela passa ao largo.
 *
 * As três perguntas da colisão são a MESMA pergunta: "isto barra o corpo?" é
 * o intervalo cruzando o corpo, "qual o topo pra pisar?" é o fim do intervalo
 * e "qual o teto pra bater?" é o começo dele. Antes cada uma lia `box.min.y` e
 * `box.max.y` por conta própria, o que só funciona porque a caixa é alinhada
 * aos eixos: num colisor GIRADO o topo depende de onde se está.
 *
 * Colisor comum não paga nada por isto: `box` já é o intervalo.
 */
const daCaixa = { entra: 0, sai: 0 };

function faixaVertical(colisor, x, z, radius = PLAYER.RADIUS) {
  if (colisor.girado) return intervaloVertical(colisor.girado, x, z);
  if (!overlapsXZ(colisor.box, x, z, radius)) return null;
  // Rascunho de módulo, e não um literal: isto roda por colisor candidato por
  // consulta, e a colisão consulta dezenas de vezes por quadro por corpo.
  daCaixa.entra = colisor.box.min.y;
  daCaixa.sai = colisor.box.max.y;
  return daCaixa;
}

/**
 * O corpo do player em (x, z), com os pés em feetY e `height` de altura,
 * cruza algum colisor? A altura é parâmetro porque agachar encolhe o corpo.
 */
export function collides(colliders, x, z, feetY, height) {
  const headY = feetY + height;
  const climbY = feetY + PLAYER.STEP_HEIGHT;

  for (const colisor of candidatos(colliders, x, z)) {
    const faixa = faixaVertical(colisor, x, z);
    if (!faixa) continue;
    // degraus baixos passam por baixo do teste, viram "subida"
    if (climbY < faixa.sai && headY > faixa.entra) return true;
  }
  return false;
}

/**
 * Altura do piso sob o player: o terreno, ou o topo do colisor mais alto que
 * ele ainda alcança. `terrainY` é o chão de verdade — sem ele o jogador
 * afundaria na ilha, porque antes o terreno era um plano em y=0.
 *
 * `out`, quando vem, recebe de onde saiu o piso: degrau é topo de colisor,
 * ladeira é terreno. Quem suaviza a vista precisa saber a fonte, e sair daqui
 * é de graça — a alternativa era percorrer os colisores uma segunda vez.
 *
 * `degrau` é o quanto o corpo sobe sem pular, e ele tem padrão porque o
 * jogador é o caso comum. O VEÍCULO passa o dele: uma roda de 39 cm sobe um
 * meio-fio que o soldado de 35 cm não sobe, e — o que importa mais — quem
 * decide o que é piso e quem decide o que é PAREDE têm que usar o mesmo
 * número. Ver `veiculos/mundo.js`.
 */
export function groundHeightAt(
  colliders, x, z, feetY, terrainY = 0, out = null, degrau = PLAYER.STEP_HEIGHT
) {
  const reach = feetY + degrau;
  let highest = terrainY;
  let onCollider = false;

  for (const colisor of candidatos(colliders, x, z)) {
    if (!colisor.standable) continue;
    // A caixa envolvente peneira antes da conta cara: num colisor girado ela
    // é maior que o corpo, então ela nunca descarta o que valeria.
    if (colisor.box.max.y <= highest || colisor.box.min.y > reach) continue;
    const faixa = faixaVertical(colisor, x, z);
    if (!faixa) continue;
    if (faixa.sai <= highest || faixa.sai > reach) continue;
    highest = faixa.sai;
    onCollider = true;
  }
  if (out) out.onCollider = onCollider;
  return highest;
}

/**
 * Teto mais baixo que a cabeça atravessa ao subir de `fromHeadY` até
 * `toHeadY`, ou Infinity se o caminho está livre.
 *
 * O trecho inteiro é considerado, não só onde a cabeça parou: pulando, ela
 * sobe vários centímetros por quadro, e testar só o fim deixaria a laje fina
 * passar entre dois quadros.
 *
 * Caixa cujo topo está ao alcance do degrau não conta — aquilo é piso pra
 * subir, não teto pra bater.
 */
export function ceilingAbove(colliders, x, z, feetY, fromHeadY, toHeadY) {
  const climbY = feetY + PLAYER.STEP_HEIGHT;
  let lowest = Infinity;

  for (const colisor of candidatos(colliders, x, z)) {
    if (colisor.box.max.y <= climbY) continue;          // é piso, não teto
    if (colisor.box.max.y < fromHeadY || colisor.box.min.y >= toHeadY) continue;
    const faixa = faixaVertical(colisor, x, z);
    if (!faixa) continue;
    if (faixa.sai <= climbY) continue;
    if (faixa.entra < fromHeadY || faixa.entra >= toHeadY) continue;
    if (faixa.entra < lowest) lowest = faixa.entra;
  }
  return lowest;
}

/** Altura do terreno sob o player, ou 0 se ele não tem terreno. */
export function terrainUnder(player, x, z) {
  return player.terrain ? player.terrain.heightAt(x, z) : 0;
}

/**
 * Altura da lâmina d'água em (x, z). O mapa tem DUAS: o mar no zero e o rio
 * a 7,9 m. Perguntar pra `WORLD.WATER_LEVEL` dava a resposta certa em todo
 * lugar menos dentro do rio, que é justamente onde ela importa — o jogador
 * atravessava a água do rio como se fosse ar.
 */
export function waterLevelUnder(player, x, z) {
  return player.terrain ? player.terrain.nivelDaAguaAt(x, z) : WORLD.WATER_LEVEL;
}

/** O player cabe na altura pedida, aqui onde ele está? */
export function fits(player, height) {
  // No chão os pés estão fixos no piso e a cabeça é que sobe.
  // No ar a cabeça é que fica parada e os pés é que descem.
  const feetY = player.onGround ? player.feetY : player.eyeY - height;
  // No CORPO: a postura é do corpo, e quem está inclinado com a cabeça fora
  // da quina não pode ser obrigado a agachar pelo que há do lado de lá.
  return !collides(player.colliders, player.bodyX, player.bodyZ, feetY, height);
}

/**
 * Superfície de apoio para um objeto solto no mundo, vindo de cima.
 *
 * Diferente de groundHeightAt: não infla pelo raio do jogador (um objeto no
 * chão é praticamente um ponto) e não tem STEP_HEIGHT — nada de subir degrau.
 */
export function restHeightAt(colliders, x, z, fromY, terrainY = 0) {
  // `fromY` é o topo do trecho percorrido no frame, não a posição final:
  // é o que impede o objeto de atravessar uma superfície entre dois frames.
  let highest = terrainY;

  for (const colisor of colliders) {
    if (!colisor.standable) continue;
    if (colisor.box.max.y <= highest || colisor.box.min.y > fromY + 0.001) continue;
    // Sem folga: o item é praticamente um ponto, e inflar pelo raio do
    // jogador faria ele assentar no ar ao lado da caixa.
    let faixa = null;
    if (colisor.girado) {
      faixa = intervaloVertical(colisor.girado, x, z, false);
    } else if (overlapsXZ(colisor.box, x, z, 0)) {
      daCaixa.entra = colisor.box.min.y;
      daCaixa.sai = colisor.box.max.y;
      faixa = daCaixa;
    }
    if (!faixa) continue;
    if (faixa.sai <= highest || faixa.sai > fromY + 0.001) continue;
    highest = faixa.sai;
  }
  return highest;
}

/**
 * O ponto está livre pra um jogador de pé nascer ali?
 *
 * Vale como porteiro de mapa: zona de nascimento dentro de geometria faz o
 * jogador aparecer preso, e não há nada que ele possa fazer a respeito.
 */
export function spawnIsClear(colliders, x, z, groundY, height) {
  return !collides(colliders, x, z, groundY, height);
}
