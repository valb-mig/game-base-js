import * as THREE from 'three';
import { criarDeteccao, varrerCampo, DETECCAO } from '../../src/game/deteccao.js';
import { BULLET } from '../../src/config.js';
import { criarMapaDesenho } from '../../src/ui/mapadesenho.js';
import { limpar as limparMarcacoes } from '../../src/ui/marcacoes.js';
import { topografiaDe, NIVEIS } from '../../src/world/topografia.js';
import { suite, ok, eq, near, note } from '../assert.js';

/**
 * A sinalização: quem o time viu, por quanto tempo isso vale, e o que o mapa
 * de papel desenha com isso.
 *
 * Só dado — nenhuma tela aparece aqui. O radar e o mapa são canvas, e canvas
 * em headless não tem tamanho; o que se prova é a REGRA, que é onde ela pode
 * quebrar em silêncio.
 */

/** Alvo de mentira, com o contrato mínimo que a detecção pede. */
function alvo(nome, time, x, z) {
  return { name: nome, team: time, x, z, alive: true };
}

export function run() {
  suite('marcar é enquanto se vê; apagar é depois de trinta segundos');

  const d = criarDeteccao();
  const inimigo = alvo('karnia-1', 'karnia', 100, 0);

  d.marcar(inimigo, 'vestria');
  eq('o contato entra na lista do time que viu', d.quantos('vestria'), 1);
  eq('e não na do time dele', d.quantos('karnia'), 0);
  ok('recém-visto conta como à vista', d.lista('vestria')[0].fresco);

  // O bot longe do jogador sonda a 3 Hz: uma janela de um quadro faria a
  // bolinha piscar entre cheia e vazada trinta vezes por segundo.
  d.avancar(DETECCAO.FRESCA + 0.1);
  ok('passado o respiro, vira memória', !d.lista('vestria')[0].fresco);
  eq('mas continua na lista', d.quantos('vestria'), 1);

  d.avancar(DETECCAO.DURACAO);
  eq(`aos ${DETECCAO.DURACAO} s sem ninguém vendo, some`, d.quantos('vestria'), 0);

  suite('a marca CONGELA onde ele foi visto pela última vez');

  const d2 = criarDeteccao();
  const fugindo = alvo('karnia-2', 'karnia', 10, 10);
  d2.marcar(fugindo, 'vestria');

  // Ele continua andando; ninguém mais o está vendo.
  fugindo.x = 400;
  fugindo.z = -300;
  d2.avancar(5);

  const contato = d2.lista('vestria')[0];
  eq('o x é o do último avistamento, não o de agora', contato.x, 10);
  eq('e o z também', contato.z, 10);
  near('e a idade é o tempo desde então', contato.idade, 5, 0.001);

  // Renovar é ver de novo: aí a posição anda junto.
  d2.marcar(fugindo, 'vestria');
  eq('vendo de novo, a marca ANDA', d2.lista('vestria')[0].x, 400);

  suite('quem não briga não é sinalizado');

  const d3 = criarDeteccao();
  const companheiro = alvo('vestria-1', 'vestria', 5, 5);
  const boneco = { name: 'boneco', x: 0, z: 0, alive: true };   // sem time

  d3.marcar(companheiro, 'vestria');
  eq('companheiro não vira contato', d3.quantos('vestria'), 0);
  d3.marcar(boneco, 'vestria');
  eq('nem o boneco de treino, que não tem time', d3.quantos('vestria'), 0);

  suite('contato morto sai da lista');

  const d4 = criarDeteccao();
  const caindo = alvo('karnia-3', 'karnia', 30, 30);
  d4.marcar(caindo, 'vestria');
  eq('vivo, está lá', d4.quantos('vestria'), 1);
  caindo.alive = false;
  // Marca de morto é promessa de briga que não existe mais.
  eq('morto, sai na mesma consulta', d4.quantos('vestria'), 0);

  suite('a varredura respeita distância, cone e parede');

  /**
   * O alcance de vista é o alcance da BALA, e o teste é quem tranca isso.
   *
   * `game/deteccao.js` continua sem conhecer `config.js` — nenhum módulo de
   * `game/` conhece —, então quem passa o número é `main.js`. Sem esta
   * asserção as duas distâncias podiam se separar em silêncio, e o radar
   * marcaria gente em que ninguém pode atirar.
   */
  const ALCANCE = BULLET.RANGE_MAX;
  eq('a bala vai 600 m', ALCANCE, 600);

  const frente = alvo('frente', 'karnia', 0, -50);
  const atras = alvo('atras', 'karnia', 0, 50);
  const longe = alvo('longe', 'karnia', 0, -(ALCANCE + 50));
  const tapado = alvo('tapado', 'karnia', 30, -40);

  const d5 = criarDeteccao();
  const vistos = varrerCampo({
    deteccao: d5,
    alvos: [frente, atras, longe, tapado],
    time: 'vestria',
    x: 0, z: 0,
    dirX: 0, dirZ: -1,           // olhando pro norte
    alcance: ALCANCE,
    campo: DETECCAO.CAMPO * Math.PI / 180,
    temLinha: (a) => a !== tapado
  });

  eq('só um passa pelas três peneiras', vistos, 1);
  const nomes = d5.lista('vestria').map((c) => c.alvo.name);
  ok('o da frente entra', nomes.includes('frente'));
  ok('o das costas não', !nomes.includes('atras'));
  ok('o que passa do alcance não', !nomes.includes('longe'));
  // Sexta vez que "parede no meio" aparece nesta base — aqui o sintoma seria
  // mudo: ninguém apareceria no radar e nada diria por quê.
  ok('o que está atrás de parede não', !nomes.includes('tapado'));

  // 42° de meio-cone: o de trás está a 180° e o tapado a 37°, então o que
  // separa os dois casos é a parede e não o ângulo.
  note('sinalização', `${ALCANCE} m · ${DETECCAO.CAMPO}° · ${DETECCAO.DURACAO} s · `
    + `varredura a ${(1 / DETECCAO.VARREDURA).toFixed(0)} Hz`);

  suite('a carta topográfica tem CINCO níveis, e eles são medidos');

  /**
   * Terreno de mentira: uma rampa que sobe de -20 a +80 no eixo X, com a água
   * no zero. É o bastante pra provar que os cortes saem da distribuição e não
   * de constantes escritas à mão — a rampa é uniforme, então as cinco faixas
   * têm que sair com áreas parecidas.
   */
  const rampa = {
    heightAt: (x) => -20 + (x + 1000) / 2000 * 100,
    nivelDaAguaAt: () => 0
  };

  const carta = topografiaDe(rampa);
  eq('a carta é memoizada por terreno', topografiaDe(rampa), carta);
  eq(`e declara ${NIVEIS} níveis`, carta.limites.length, NIVEIS - 1);

  // Os cortes têm que ser CRESCENTES: um par fora de ordem faria `nivelDe`
  // devolver sempre o mesmo nível, e a carta sairia de uma cor só.
  let crescente = true;
  for (let i = 1; i < carta.limites.length; i++) {
    if (carta.limites[i] <= carta.limites[i - 1]) crescente = false;
  }
  ok('os cortes sobem', crescente);

  // Sobre uma rampa uniforme entre os percentis 2 e 98, o passo é constante.
  const passo = carta.limites[1] - carta.limites[0];
  near('e o passo é o mesmo entre eles',
    carta.limites[3] - carta.limites[2], passo, 0.5);

  note('cortes de altitude',
    carta.limites.map((h) => `${h.toFixed(1)} m`).join(' · '));

  suite('a seta do jogador no papel aponta pra onde ele OLHA');

  /**
   * Este é medido nos PIXELS, e tem que ser.
   *
   * A conta que estava aqui (`atan2(-m[8], -m[10])` girado por `-rumo`) errava
   * 180° em todo rumo, e passou por uma suíte verde inteira porque nada olhava
   * o desenho: "a seta existe" e "a seta aponta pro lado certo" são asserções
   * diferentes. O canvas do papel NÃO está no documento — ele nasce com
   * largura e altura próprias —, então em headless ele tem tamanho, ao
   * contrário de todo canvas de HUD.
   *
   * E o instrumento é a DIFERENÇA entre dois desenhos, não um corte de cor.
   * Duas tentativas erradas antes desta: o centro de massa da tinta clara mede
   * o formato da seta (que é mais larga atrás do que na ponta) e não o rumo
   * dela — deu 0,3 px olhando pro norte contra −1,3 pro sul, ruído puro; e um
   * limiar de cor não pega o CONE do olhar, que é branco translúcido POR CIMA
   * de cinco tons de papel diferentes. Desenhando com e sem o jogador, o que
   * muda é exatamente o que ele desenha.
   */
  limparMarcacoes();

  const olheiro = new THREE.Object3D();
  const quemOlha = {
    object: olheiro, alive: true, spectating: false, team: 'vestria'
  };
  const desenho = criarMapaDesenho({
    terrain: rampa,
    world: { outposts: [] },
    player: quemOlha,
    lado: 256
  });

  const ctxDoPapel = desenho.canvas.getContext('2d');
  const pixels = () => ctxDoPapel.getImageData(0, 0, desenho.lado, desenho.lado).data;

  olheiro.position.set(0, 0, 0);
  quemOlha.alive = false;
  desenho.desenhar(0);
  const semJogador = pixels();
  quemOlha.alive = true;

  /** Centro de massa do que o jogador ACRESCENTA ao papel. */
  function paraOndeAponta(yawGraus) {
    olheiro.quaternion.setFromEuler(
      new THREE.Euler(0, yawGraus * Math.PI / 180, 0, 'YXZ'));
    desenho.desenhar(0);

    const com = pixels();
    const meio = desenho.lado / 2;
    let somaX = 0;
    let somaY = 0;
    let quantos = 0;

    for (let y = 0; y < desenho.lado; y++) {
      for (let x = 0; x < desenho.lado; x++) {
        const i = (y * desenho.lado + x) * 4;
        const mudou = Math.abs(com[i] - semJogador[i])
          + Math.abs(com[i + 1] - semJogador[i + 1])
          + Math.abs(com[i + 2] - semJogador[i + 2]);
        if (mudou <= 6) continue;
        somaX += x - meio;
        somaY += y - meio;
        quantos++;
      }
    }
    return { x: somaX / quantos, y: somaY / quantos, quantos };
  }

  const norte = paraOndeAponta(0);
  ok('há tinta de seta e cone pra medir', norte.quantos > 200);
  // Norte é −Z do mundo, e o papel tem o norte no TOPO: y menor.
  ok('olhando pro norte, a seta vai pra CIMA', norte.y < -4);
  ok('e sem desviar pros lados', Math.abs(norte.x) < 2);

  const sul = paraOndeAponta(180);
  ok('olhando pro sul, ela vai pra BAIXO', sul.y > 4);

  // Leste é +X, e o papel tem +X à direita. Yaw NEGATIVO em YXZ leva o −Z
  // da câmera pro +X: girar de +90° apontaria pro oeste.
  const leste = paraOndeAponta(-90);
  ok('olhando pro leste, ela vai pra DIREITA', leste.x > 4);
  ok('e sem subir nem descer', Math.abs(leste.y) < 2);

  const oeste = paraOndeAponta(90);
  ok('e pro oeste, pra ESQUERDA', oeste.x < -4);

  note('seta do jogador no papel',
    `N ${norte.y.toFixed(1)} px · S ${sul.y.toFixed(1)} px · `
    + `L ${leste.x.toFixed(1)} px · O ${oeste.x.toFixed(1)} px`);
}
