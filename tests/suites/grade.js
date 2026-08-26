import * as THREE from 'three';
import { GRADE, WORLD } from '../../src/config.js';
import { ESPACO_DO_CEU } from '../../src/core/sky.js';
import { CURVA_DE_TOM } from '../../src/core/stage.js';
import { suite, ok, eq, between, note } from '../assert.js';

/**
 * A gradação de cor: a curva de tom, a exposição e as duas coisas que ela já
 * quebrou em silêncio.
 *
 * Nada aqui mede tempo nem gera textura. As duas regras que interessam são
 * aritméticas, e a terceira é uma pergunta feita ao PRÓPRIO three em vez de
 * uma paráfrase dele.
 */

function croma(hex) {
  const c = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  const M = Math.max(...c);
  return M ? (M - Math.min(...c)) / M : 0;
}

export function run() {
  suite('a curva de tom foi medida, não escolhida');
  // Das sete curvas do three, só AgX desatura. ACES e Cineon — as escolhas
  // óbvias — empurram o verde PRA CIMA: medido em tools/bancada-grade.html,
  // o pinheiro ganhava +0,207 de croma com ACES contra -0,144 com AgX. Trocar
  // a curva sem remedir devolve o verde neon que a paleta oliva existe pra
  // evitar, e nada no jogo acusa.
  eq('a curva do jogo é AgX', CURVA_DE_TOM, THREE.AgXToneMapping);
  // Nomeadas uma a uma: as duas que a intuição escolhe são justamente as que
  // pioram esta paleta, e um `!==` genérico não diria isso a quem quebrar.
  ok('não é ACES', CURVA_DE_TOM !== THREE.ACESFilmicToneMapping);
  ok('não é Cineon', CURVA_DE_TOM !== THREE.CineonToneMapping);
  ok('nem Neutral, que foi a pior das sete', CURVA_DE_TOM !== THREE.NeutralToneMapping);
  ok('e não é ausência de curva', CURVA_DE_TOM !== THREE.NoToneMapping);
  // AgX reserva alcance pro claro que uma cena sem HDR não tem: em 1,0 o mapa
  // lê como fim de tarde, e acima de ~2 estoura o céu pro branco.
  between('a exposição compensa o quanto AgX é escura', GRADE.EXPOSICAO, 1.3, 2.0);

  suite('o céu é tonemapeado junto com o resto');
  // O three só tonemapeia fundo de textura quando o espaço dela NÃO é sRGB:
  //   boxMesh.material.toneMapped = getTransfer(colorSpace) !== SRGBTransfer
  // Marcado como sRGB, a curva alcançava o terreno e a névoa e PULAVA o céu —
  // e como a névoa é da cor do horizonte, a linha do horizonte ganhava uma
  // costura entre céu cru e terreno gradado. A pergunta é feita à função do
  // próprio three: repeti-la aqui deixaria o teste passar junto com o erro.
  const transferencia = THREE.ColorManagement.getTransfer(ESPACO_DO_CEU);
  ok('o espaço do céu não é sRGB', transferencia !== THREE.SRGBTransfer);
  note('transferência do espaço do céu', String(transferencia));

  suite('a saturação sai da FONTE, não da curva');
  // AgX desatura no CLARO. Escurecer o quadro pra ganhar preto joga a cor na
  // parte da curva que ela não lava: medido na vila, baixar a luz levou o
  // percentil 1 do brilho de 77,9 pra 67,0 e a croma média SUBIU de 0,190 pra
  // 0,211. Ou seja o neon volta exatamente quando se ganha contraste, e a
  // única defesa é a cor já nascer oliva.
  const VEGETACAO = {
    GRASS_COLOR: WORLD.GRASS_COLOR,
    TREE_COLOR: WORLD.TREE_COLOR,
    FOLHA_COLOR: WORLD.FOLHA_COLOR,
    FOLHA_CLARA: WORLD.FOLHA_CLARA,
    BUSH_COLOR: WORLD.BUSH_COLOR,
    BUSH_COLOR_DARK: WORLD.BUSH_COLOR_DARK,
    // Terra entra na mesma regra: o barranco atrás da praia é o maior bloco de
    // cor única do mapa, e barro saturado lê como laranja debaixo da curva.
    DIRT_COLOR: WORLD.DIRT_COLOR,
    SOIL_COLOR: WORLD.SOIL_COLOR,
    // E estes dois já estavam abaixo do teto: entram pra provar que a regra é
    // TETO e não alvo. Aplicada como alvo ela subia a areia de 0,287 pra 0,420
    // e deixava a praia amarela.
    TERRA_BATIDA: WORLD.TERRA_BATIDA,
    SAND_COLOR: WORLD.SAND_COLOR
  };
  // O teto é 0,47: a repintura mirou 0,42 e a folga cabe um ajuste de arte sem
  // caber uma volta ao verde esmeralda, que estava em 0,56 a 0,61.
  for (const [nome, hex] of Object.entries(VEGETACAO)) {
    ok(`${nome} contido (croma ${croma(hex).toFixed(3)})`, croma(hex) < 0.47);
  }
  // A areia não pode ter SUBIDO de croma: é o sinal de que alguém tratou o
  // teto como alvo, e o sintoma é praia amarela.
  ok('a areia continua contida, não puxada pro teto', croma(WORLD.SAND_COLOR) < 0.33);

  suite('e o pinheiro continua frio');
  // As duas espécies existem pra se distinguir a cem metros, e a cor é a única
  // coisa que faz isso: a agulha é fria (azul acima do vermelho) e a folhosa é
  // quente. A repintura empurra matiz pro amarelo, e aplicá-la ao pinheiro
  // invertia esse par — ele saía mais quente que a folhosa.
  const azul = (h) => h & 255;
  const vermelho = (h) => (h >> 16) & 255;
  ok('a agulha de pinheiro tem mais azul que vermelho',
    azul(WORLD.TREE_COLOR) > vermelho(WORLD.TREE_COLOR));
  ok('e a folhosa é o contrário',
    vermelho(WORLD.FOLHA_COLOR) > azul(WORLD.FOLHA_COLOR));

  suite('a névoa age dentro do alcance de tiro');
  // 260 a 1400 punha a névoa depois de tudo que se pode atirar: a mata a 600 m
  // saía com a mesma saturação do capim a 20, e sem perda de contraste com a
  // distância o quadro lê como maquete. O engajamento mais longo do mapa é de
  // uns 700 m.
  const nevoaEm = (d) => Math.max(0, Math.min(1,
    (d - WORLD.FOG_NEAR) / (WORLD.FOG_FAR - WORLD.FOG_NEAR)));
  note('névoa a 300 m', `${(nevoaEm(300) * 100).toFixed(0)}%`);
  note('névoa a 700 m', `${(nevoaEm(700) * 100).toFixed(0)}%`);
  between('a 700 m a névoa já domina o vulto', nevoaEm(700), 0.5, 0.95);
  // Mas ela não pode APAGAR: vulto que desaparece na bruma é alvo que não
  // existe, e num jogo de tiro isso é pior que quadro chapado.
  ok('e nunca satura dentro do mapa', nevoaEm(700) < 1);
  between('a 300 m ela ainda é discreta', nevoaEm(300), 0.05, 0.35);

  suite('luz e curva são a mesma decisão');
  // Os 2,9 da hemisférica foram calibrados pra um render SEM curva. AgX levanta
  // o quadro inteiro, e com ela por cima os 2,9 viraram excesso: preto que não
  // é preto é o que faz um quadro ler como chapado. E a direcional é o único
  // jeito de haver FORMA — com luz só de cúpula, telhado, parede e chão chegam
  // no mesmo valor e a silhueta da casa desaparece.
  between('a hemisférica desceu junto com a curva', GRADE.HEMISFERICA, 1.0, 2.2);
  ok('e a direcional dá forma sem virar holofote',
    GRADE.DIRECIONAL > 1.0 && GRADE.DIRECIONAL < GRADE.HEMISFERICA * 1.5);
  // Encoberto é luz de cúpula, não de sol: invertidos, o mapa ganhava sombra
  // dura de dia claro debaixo de um céu fechado.
  ok('a cúpula continua sendo a luz principal', GRADE.HEMISFERICA > GRADE.DIRECIONAL * 0.7);
}
