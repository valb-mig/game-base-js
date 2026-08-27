import * as THREE from 'three';
import { avancarFase, passoEm, forca, embalarPara, PASSADA } from '../../src/bots/passada.js';
import { carregarSoldado, soldadoPronto } from '../../src/bots/model.js';
import { createSoldier } from '../../src/bots/soldier.js';
import { suite, ok, eq, near, note } from '../assert.js';

const PERNAS = { dir: 'L', esq: 'R' };
const CORRIDA = 3.4;

/** Anda `metros` em `quadros` passos e devolve onde a fase parou. */
function caminhar(metros, quadros, velocidade) {
  let fase = 0;
  for (let i = 0; i < quadros; i++) {
    fase = avancarFase(fase, metros / quadros, velocidade, CORRIDA);
  }
  return fase;
}

export function run() {
  matematica();
  return carregarSoldado().then(noCorpo, () => {
    suite('a passada chega no corpo');
    note('modelo não carregou', 'sem arquivo não há osso pra posar');
  });
}

function matematica() {
  suite('a passada anda com a DISTÂNCIA, nunca com o relógio');

  // O mesmo caminho em trinta quadros e em cento e quarenta e quatro tem que
  // dar o mesmo passo. Por tempo, a cadência seria a mesma em toda
  // velocidade e o pé patinaria — o mesmo defeito que a integração
  // trapezoidal do pulo existe pra evitar.
  const a30 = caminhar(6, 30, 3);
  const a144 = caminhar(6, 144, 3);
  near('mesma distância, mesma fase em qualquer framerate', a30, a144, 1e-9);

  const meio = caminhar(3, 60, 3);
  ok('metade do caminho não é a mesma fase', Math.abs(meio - a30) > 0.05,
    `${meio.toFixed(3)} contra ${a30.toFixed(3)}`);

  // Parado não dá passo. Passo continuado com o corpo no lugar é o boneco
  // deslizando, só que ao contrário.
  eq('parado a fase congela', avancarFase(0.4, 0, 0, CORRIDA), 0.4);
  eq('e quase parado também', avancarFase(0.4, 0.001, 0.05, CORRIDA), 0.4);

  // Correndo a passada é MAIS LONGA, então a mesma distância roda MENOS
  // ciclo. É o que faz a cadência não disparar junto com a velocidade.
  const andando = caminhar(10, 60, 1.2);
  const correndo = caminhar(10, 60, CORRIDA);
  ok('a passada cresce com a velocidade',
    PASSADA.PASSO_LONGO > PASSADA.PASSO_CURTO);
  ok('logo a mesma distância roda menos ciclo correndo',
    Math.round(correndo * 1000) !== Math.round(andando * 1000));

  suite('andar e correr são um contínuo, não dois estados');

  eq('parado é zero esforço', forca(0, CORRIDA), 0);
  eq('na velocidade de corrida é um', forca(CORRIDA, CORRIDA), 1);
  eq('e acima dela não passa de um', forca(99, CORRIDA), 1);
  near('no meio é meio', forca(CORRIDA / 2, CORRIDA), 0.5, 1e-9);
  note('por que contínuo', 'um limiar apareceria como salto de pose no metro em que fosse cruzado');

  suite('as duas pernas não fazem a mesma coisa ao mesmo tempo');

  let opostas = 0;
  let joelhoInvertido = 0;
  let subidaNegativa = 0;
  let sinalTrocado = 0;

  for (let i = 0; i < 64; i++) {
    const fase = i / 64;
    const passo = passoEm(fase, CORRIDA, CORRIDA, PERNAS);
    const dir = passo.pose[`thigh_${PERNAS.dir}`][0];
    const esq = passo.pose[`thigh_${PERNAS.esq}`][0];
    if (dir * esq <= 0) opostas++;

    // Joelho DOBRA, nunca vira do avesso: a onda é retificada de propósito.
    for (const lado of [PERNAS.dir, PERNAS.esq]) {
      if (passo.pose[`knee_${lado}`][0] < -1e-9) joelhoInvertido++;
    }

    if (passo.subida < -1e-9) subidaNegativa++;
    // A arma sobe COM o corpo. Com uma senoide solta contra o `|sin|` do
    // quadril, meio ciclo tinha o corpo subindo enquanto a arma descia: os
    // ombros afastavam 6 cm do guarda-mão e a mão desgrudava da arma só
    // naquele trecho do passo. É o defeito que este teste tranca.
    if (passo.subida > 1e-6 && passo.arma < -1e-9) sinalTrocado++;
  }

  eq('as pernas estão sempre em fases opostas', opostas, 64);
  eq('o joelho nunca dobra ao contrário', joelhoInvertido, 0);
  eq('o quadril nunca afunda no chão', subidaNegativa, 0);
  eq('e a arma nunca desce enquanto o corpo sobe', sinalTrocado, 0);

  suite('parar é assentar, não teleportar de volta');

  // Com peso binário, o bot que para vai de meia passada pro repouso num
  // quadro: a perna teleporta de volta, e num corpo de caixas isso se vê.
  eq('parado, o embalo cai a zero', embalarPara(1, 0, PASSADA.EMBALO_DESCE), 0);
  eq('andando, sobe a um', embalarPara(0, 3, PASSADA.EMBALO_SOBE), 1);
  near('e no meio do caminho vale metade',
    embalarPara(0, 3, PASSADA.EMBALO_SOBE / 2), 0.5, 1e-9);
  ok('não passa de um', embalarPara(0.95, 3, PASSADA.EMBALO_SOBE) <= 1);
  ok('nem desce de zero', embalarPara(0.05, 0, PASSADA.EMBALO_DESCE) >= 0);

  // Sair é MAIS LENTO que entrar, e isso não é gosto: uma amostra solta de
  // deslocamento zero — uma chamada a mais de `update` no mesmo quadro —
  // apagava a passada inteira quando os dois tempos eram iguais. Foi assim
  // que um exército inteiro deslizou de pernas retas com a fase correndo por
  // baixo, e o teste abaixo é o que impede a volta.
  ok('sair é mais lento que entrar', PASSADA.EMBALO_DESCE > PASSADA.EMBALO_SOBE * 2);
  const sobrou = embalarPara(1, 0, 1 / 60);
  ok('um quadro sem andar quase não tira embalo', sobrou > 0.9,
    `sobrou ${sobrou.toFixed(3)} de 1`);
  const cheio2 = embalarPara(0, 3, 1 / 60);
  ok('e um quadro andando já devolve boa parte', cheio2 > 0.1,
    `${cheio2.toFixed(3)}`);

  // E o embalo ESCALA a passada: com ele em zero a perna está no repouso,
  // com ele em meio ela está na metade do desvio.
  const inteiro = passoEm(0.25, CORRIDA, CORRIDA, PERNAS, 1);
  const metade = passoEm(0.25, CORRIDA, CORRIDA, PERNAS, 0.5);
  const zerado = passoEm(0.25, CORRIDA, CORRIDA, PERNAS, 0);
  near('meio embalo, meio desvio',
    metade.pose[`thigh_${PERNAS.dir}`][0],
    inteiro.pose[`thigh_${PERNAS.dir}`][0] / 2, 1e-9);
  near('embalo zero, perna no repouso', zerado.pose[`thigh_${PERNAS.dir}`][0], 0, 1e-12);
  near('e sem balanço', zerado.subida, 0, 1e-12);

  suite('parado é parado');

  // `near` e não `eq`: com amplitude zero o produto sai `-0`, e `-0` não é
  // `0` pra uma comparação estrita. O ângulo é o mesmo; o zero é que tem
  // dois.
  const quieto = passoEm(0.3, 0, CORRIDA, PERNAS);
  near('perna parada', quieto.pose[`thigh_${PERNAS.dir}`][0], 0, 1e-12);
  near('joelho parado', quieto.pose[`knee_${PERNAS.dir}`][0], 0, 1e-12);
  near('sem balanço', quieto.subida, 0, 1e-12);
  near('e sem rolagem', quieto.rolagem, 0, 1e-12);
}

/**
 * A passada tem que CHEGAR na perna, e chegar sem engasgo.
 *
 * O ciclo pode estar perfeito e o corpo continuar andando aos trancos: quem
 * decide quando o soldado é reposado é outra regra, e enquanto a pose era
 * estática ela podia ser um relógio de 8 Hz sem ninguém notar — nada se mexia
 * entre uma pose e outra. Com o ciclo, o mesmo relógio entrega 5,4 poses por
 * volta e a coxa salta 29° por amostra. Somado ao `detalhado`, que vira e
 * desvira na fronteira dos 45 m, o bot andava, congelava um oitavo de segundo
 * e voltava a andar de repente.
 */
function noCorpo() {
  suite('a passada chega no corpo, e sem engasgo');

  if (!soldadoPronto()) {
    note('modelo não carregou', 'sem arquivo não há osso pra posar');
    return;
  }

  const piso = { heightAt: () => 0 };
  const passo = 1 / 60;

  for (const [nome, detalhado] of [['perto', true], ['LONGE', false]]) {
    const bot = createSoldier(new THREE.Scene(), [], {
      id: 1, team: 'karnia', x: 0, z: 0, terrain: piso, weapons: []
    });
    bot.detalhado = detalhado;
    bot.update(passo);

    const coxa = bot.group.getObjectByName('thigh_L');
    let anterior = coxa.rotation.x;
    let maiorSalto = 0;
    let parados = 0;
    let maiorPausa = 0;
    let mexeu = 0;

    for (let i = 0; i < 240; i++) {
      bot.x += 3.4 * passo;   // corrida do bot: o pior caso
      bot.update(passo);
      const agora = coxa.rotation.x;
      if (Math.abs(agora - anterior) > 1e-9) {
        mexeu++;
        maiorSalto = Math.max(maiorSalto, Math.abs(agora - anterior));
        parados = 0;
      } else {
        parados++;
        maiorPausa = Math.max(maiorPausa, parados);
      }
      anterior = agora;
    }

    ok(`${nome}: a perna se mexe`, mexeu > 40, `${mexeu} poses em 240 quadros`);
    // Vinte graus é o limite do que não lê como teleporte. O relógio de 8 Hz
    // dava 28,8°.
    ok(`${nome}: sem salto de teleporte`, maiorSalto < 0.35,
      `maior salto ${(maiorSalto * 180 / Math.PI).toFixed(1)}°`);
    // E sem congelar: quatro quadros são 67 ms, e é o que separa "anda" de
    // "anda, para, e volta do nada".
    ok(`${nome}: sem congelar no meio do passo`, maiorPausa <= 4,
      `maior pausa ${maiorPausa} quadros`);
  }

  // Parado NÃO paga pose: é daí que vem a economia, e ela tem que sobreviver
  // a quem apertar a taxa de pose no futuro.
  const quieto = createSoldier(new THREE.Scene(), [], {
    id: 2, team: 'karnia', x: 0, z: 0, terrain: piso, weapons: []
  });
  quieto.detalhado = false;
  quieto.update(passo);
  const coxaQuieta = quieto.group.getObjectByName('thigh_L');
  const antes = coxaQuieta.rotation.x;
  let reposou = 0;
  for (let i = 0; i < 240; i++) {
    quieto.update(passo);
    if (Math.abs(coxaQuieta.rotation.x - antes) > 1e-9) reposou++;
  }
  eq('bot parado e longe não paga pose nenhuma', reposou, 0);

  // E parar não é um salto: quem andava tem que ASSENTAR a perna.
  const freando = createSoldier(new THREE.Scene(), [], {
    id: 3, team: 'karnia', x: 0, z: 0, terrain: piso, weapons: []
  });
  freando.detalhado = true;
  freando.update(passo);

  const coxaFreando = freando.group.getObjectByName('thigh_L');
  // Contra o REPOUSO, não contra zero: a pose de carregar arma já deixa a
  // coxa em -0,10 rad, e medir contra zero acusa 2° de desvio onde há 40.
  const repousoDaCoxa = coxaFreando.rotation.x;

  // E o pico ao longo do passo, não o valor de um quadro: a primeira versão
  // deste teste caiu justamente no quadro em que a perna cruza por baixo do
  // corpo, leu 2° e concluiu que não havia passada nenhuma.
  let noPasso = 0;
  for (let i = 0; i < 60; i++) {
    freando.x += 3.4 * passo;
    freando.update(passo);
    noPasso = Math.max(noPasso, Math.abs(coxaFreando.rotation.x - repousoDaCoxa));
  }
  ok('andando, a perna sai bem do repouso', noPasso > 0.3,
    `${(noPasso * 180 / Math.PI).toFixed(1)}° de pico`);

  // Para de andar: o corpo não se mexe mais, e a perna tem que voltar em
  // rampa. Um único quadro de queda é o teleporte que isto veio consertar.
  let anteriorFreando = coxaFreando.rotation.x;
  let maiorQueda = 0;
  for (let i = 0; i < 40; i++) {
    freando.update(passo);
    maiorQueda = Math.max(maiorQueda, Math.abs(coxaFreando.rotation.x - anteriorFreando));
    anteriorFreando = coxaFreando.rotation.x;
  }
  near('e parado ela volta pro repouso', coxaFreando.rotation.x, repousoDaCoxa, 0.02);
  ok('sem teleportar de volta num quadro', maiorQueda < noPasso * 0.35,
    `maior queda num quadro ${(maiorQueda * 180 / Math.PI).toFixed(1)}°`
    + ` contra ${(noPasso * 180 / Math.PI).toFixed(1)}° de pico`);

  note('medido em', 'tools/bancada-pose.html');
}
