import * as THREE from 'three';
import { WORLD } from '../../src/config.js';
import { createHeightfield } from '../../src/world/heightfield.js';
import { AGUA, AREIA, TERRA, GRAMA, tipoDoChao, colorAt } from '../../src/world/ground.js';
import { addBushes } from '../../src/world/bushes.js';
import { createBallistics } from '../../src/items/ballistics.js';
import { sorteioFixo } from '../../src/world/props.js';
import { suite, ok, eq, between, note } from '../assert.js';

/** Campo de mentira: metade areia, metade grama, plano e sem three. */
function bancada(scene, { tipoAt, blocked = () => false } = {}) {
  return addBushes(scene, {
    heightAt: () => 0,
    tipoAt: tipoAt ?? (() => GRAMA),
    blocked,
    rng: sorteioFixo(7)
  });
}

const ponto = (x, y, z) => new THREE.Vector3(x, y, z);

export function run() {
  suite('três tipos de chão');

  // Altura manda primeiro: areia perto da água acontece mesmo em barranco.
  eq('areia é perto da água, em qualquer declive',
    tipoDoChao(WORLD.SAND_UNTIL - 0.1, 2.0), AREIA);
  eq('chão manso acima da areia é grama',
    tipoDoChao(WORLD.SAND_UNTIL + 1, 0.01), GRAMA);
  eq('barranco é terra',
    tipoDoChao(WORLD.SAND_UNTIL + 1, WORLD.DECLIVE_TERRA + 0.01), TERRA);
  eq('e o limiar entra na terra, não sobra pra grama',
    tipoDoChao(10, WORLD.DECLIVE_TERRA), TERRA);

  // A cor não é o tipo: ela tem transição, senão a fronteira vira recorte.
  eq('areia tem cor de areia', colorAt(1, 0), WORLD.SAND_COLOR);
  eq('chão plano tem cor de grama', colorAt(10, 0), WORLD.GRASS_COLOR);
  eq('barranco tem cor de terra',
    colorAt(10, WORLD.DECLIVE_TERRA * 2), WORLD.DIRT_COLOR);
  const meio = colorAt(10, WORLD.DECLIVE_TERRA * 0.8);
  ok('e entre os dois a cor é uma mistura, não um dos dois',
    meio !== WORLD.GRASS_COLOR && meio !== WORLD.DIRT_COLOR,
    `0x${meio.toString(16)}`);

  suite('o mapa se classifica pelo próprio relevo');

  // Exercita o campo de altura de verdade: cada trecho de Sainte-Mère existe
  // pra ser difícil de um jeito diferente, e o tipo de chão tem que dizer
  // isso sem ninguém escrever tabela de zona nenhuma.
  const campo = createHeightfield([]);
  const meioDaPraia = (WORLD.MAR_ATE + WORLD.PRAIA_ATE) / 2;
  const meioDaEscarpa = (WORLD.PRAIA_ATE + WORLD.ESCARPA_ATE) / 2;

  eq('a praia de desembarque é areia', campo.tipoAt(0, meioDaPraia), AREIA);
  eq('a escarpa que domina a praia é terra',
    campo.tipoAt(0, meioDaEscarpa), TERRA);
  eq('o planalto da vila é grama', campo.tipoAt(0, -400), GRAMA);
  // Duas margens, e cada uma é um chão: a barranca do canal, rente à água, é
  // terra pelada; a descida larga do vale é grama até quase a beira. Medindo
  // só a 55 m do leito o teste pegava a antiga margem única, e depois do vale
  // ele passou a testar o meio de uma rampa de 0,05 — que é grama, e é o que
  // se quer que seja.
  eq('a barranca do canal é terra',
    campo.tipoAt(0, campo.riverBedAt(0) - 33), TERRA);
  eq('mas a descida do vale é grama',
    campo.tipoAt(0, campo.riverBedAt(0) - 90), GRAMA);
  // O leito é plano, então pela declividade ele seria grama — e grama é onde
  // nasce árvore. Com o rio cheio isso plantava pinheiro dentro d'água; hoje
  // a lâmina manda antes da declividade.
  eq('mas o leito é ÁGUA, e nada nasce nele',
    campo.tipoAt(0, campo.riverBedAt(0)), AGUA);

  note('declividades medidas',
    `praia ${campo.declividadeAt(0, meioDaPraia).toFixed(3)}` +
    ` · escarpa ${campo.declividadeAt(0, meioDaEscarpa).toFixed(3)}` +
    ` · planalto ${campo.declividadeAt(0, -400).toFixed(3)}` +
    ` · barranca ${campo.declividadeAt(0, campo.riverBedAt(0) - 33).toFixed(3)}` +
    ` · vale ${campo.declividadeAt(0, campo.riverBedAt(0) - 90).toFixed(3)}`);

  // Quanto do mapa é de cada tipo. Não é asserção: é o número que diz se
  // terra continua sendo a exceção que ela tem que ser, e ele muda junto com
  // DECLIVE_TERRA — vale ver na saída em vez de descobrir jogando.
  const conta = { agua: 0, areia: 0, terra: 0, grama: 0 };
  let amostras = 0;
  for (let z = -960; z <= 960; z += 40) {
    for (let x = -960; x <= 960; x += 40) {
      if (Math.hypot(x, z) > WORLD.ISLAND_RADIUS) continue;
      amostras++;
      conta[campo.tipoAt(x, z)]++;
    }
  }
  const parte = (n) => `${(100 * n / amostras).toFixed(1)}%`;
  note('a ilha por tipo de chão',
    `água ${parte(conta.agua)} · areia ${parte(conta.areia)}` +
    ` · terra ${parte(conta.terra)} · grama ${parte(conta.grama)}`);
  ok('terra é a exceção, não o mapa', conta.terra < conta.grama,
    `${parte(conta.terra)} contra ${parte(conta.grama)}`);

  suite('arbusto nasce em grama e em mais nada');

  const cena = new THREE.Scene();
  // metade oeste é areia; areia é deserta, e é isso que faz a praia ser aberta
  const mato = bancada(cena, { tipoAt: (x) => (x < 0 ? AREIA : GRAMA) });

  ok('nasceu mato', mato.count > 0, `${mato.count} arbustos`);
  eq('e nenhum na areia',
    mato.arbustos.filter((a) => a.x < 0).length, 0);

  // As três variações são CONJUNTOS de blocos, não um bloco escalado: o
  // grande é um alto com dois baixos encostados, e é o agrupamento que dá
  // silhueta de mato em vez de caixote.
  const porNome = (nome) => mato.arbustos.find((a) => a.forma.nome === nome);
  eq('pequeno é um bloco só', porNome('pequeno').blocos.length, 1);
  eq('médio são dois', porNome('medio').blocos.length, 2);
  eq('grande são três', porNome('grande').blocos.length, 3);
  ok('e o grande é um alto com dois baixos, não três iguais',
    porNome('grande').forma.blocos.filter((b) => b.escuro).length === 2,
    porNome('grande').forma.blocos.map((b) => b.h.toFixed(2)).join(' · '));
  for (const forma of mato.formas) {
    ok(`a variação "${forma.nome}" aparece no mapa`, forma.quantos > 0,
      `${forma.quantos}`);
  }

  suite('mato quebra, e não vira parede');

  const cena2 = new THREE.Scene();
  const so = bancada(cena2);
  const alvo = so.arbustos[0];
  const antes = so.emPe();

  // O teste é o TRECHO, não onde a bala parou: a 253 m/s ela anda 4,2 m por
  // quadro, e olhar só o ponto final a faria passar por dentro do mato.
  eq('trecho que atravessa o arbusto derruba ele',
    so.slash(ponto(alvo.x - 6, alvo.y + 0.4, alvo.z),
      ponto(alvo.x + 6, alvo.y + 0.4, alvo.z)), 1);
  eq('e ele deixa de estar em pé', so.emPe(), antes - 1);
  eq('quebrar de novo não conta duas vezes',
    so.slash(ponto(alvo.x - 6, alvo.y + 0.4, alvo.z),
      ponto(alvo.x + 6, alvo.y + 0.4, alvo.z)), 0);

  // A esfera do teste é larga o bastante pra cobrir a pegada, e por isso sobe
  // mais que o mato: sem o corte na vertical, tiro passando bem acima de um
  // arbusto de 60 cm o derrubava.
  const outro = so.arbustos.find((a) => a.vivo);
  eq('tiro passando bem acima não derruba nada',
    so.slash(ponto(outro.x - 6, outro.y + outro.alto + 3, outro.z),
      ponto(outro.x + 6, outro.y + outro.alto + 3, outro.z)), 0);
  eq('nem tiro longe dele',
    so.slash(ponto(outro.x + 40, outro.y + 0.4, outro.z + 40),
      ponto(outro.x + 46, outro.y + 0.4, outro.z + 46)), 0);

  // Só o que está caindo custa alguma coisa, e ele some depois do prazo.
  for (let i = 0; i < 60; i++) so.update(1 / 60);
  eq('o que caiu não volta', so.emPe(), antes - 1);

  suite('a bala derruba o mato e segue');

  // A regra inteira do arbusto está aqui: ele é cobertura VISUAL. Quem se
  // esconde atrás continua escondido até alguém atirar no mato — e aí o mato
  // vem abaixo e a bala continua até quem estava atrás. Folha parando tiro de
  // 7,92 leria como bug.
  const cena3 = new THREE.Scene();
  const arbustos = bancada(cena3);
  const naFrente = arbustos.arbustos[0];

  let vida = 100;
  const soldado = {
    alive: true,
    radius: 0.5,
    // logo depois do arbusto: o tiro atravessa o mato e para NELE
    center: () => ponto(naFrente.x + 4, naFrente.y + 0.4, naFrente.z),
    damage(quanto) {
      vida -= quanto;
      return { target: soldado, amount: quanto, killed: vida <= 0 };
    }
  };

  const balistica = createBallistics(cena3, [], {
    onFoliage: (de, para) => arbustos.slash(de, para)
  });

  balistica.spawn(
    ponto(naFrente.x - 12, naFrente.y + 0.4, naFrente.z),
    new THREE.Vector3(1, 0, 0),
    { damage: 30, range: 400 }
  );
  for (let i = 0; i < 20; i++) balistica.update(1 / 60, [soldado]);

  eq('o mato na linha do tiro caiu', naFrente.vivo, false);
  ok('e quem estava atrás dele tomou o tiro', vida < 100, `${vida} de vida`);

  suite('arbusto descalçado vem abaixo');

  // Nada flutua depois de cavado. Arbusto não tomba como árvore: raiz de fora
  // é arbusto morto, e assim quem escreve na matriz da instância é um só.
  const cena4 = new THREE.Scene();
  let fundo = 0;
  const cavavel = addBushes(cena4, {
    heightAt: () => fundo,
    tipoAt: () => GRAMA,
    blocked: () => false,
    rng: sorteioFixo(11)
  });
  const escolhido = cavavel.arbustos[0];
  const emPe = cavavel.emPe();

  eq('sem cavar, ninguém cai', cavavel.disturb(escolhido.x, escolhido.z, 3), 0);
  fundo = -1.2;
  eq('cavar embaixo dele derruba', cavavel.disturb(escolhido.x, escolhido.z, 3), 1);
  eq('e só ele', cavavel.emPe(), emPe - 1);

  suite('o índice espacial não é enfeite');

  // Sem índice, cada bala testaria os 1600 arbustos por quadro. A prova é
  // comportamental: uma consulta minúscula tem que olhar poucas células, e
  // isso se vê contando quantos arbustos ela sequer considerou.
  const cena5 = new THREE.Scene();
  let visitados = 0;
  const grande = addBushes(cena5, {
    heightAt: () => 0,
    tipoAt: () => GRAMA,
    blocked: () => false,
    rng: sorteioFixo(3),
    aoQuebrar: () => { visitados++; }
  });
  const inicio = grande.arbustos[0];
  grande.slash(ponto(inicio.x, inicio.y + 0.3, inicio.z),
    ponto(inicio.x + 4.2, inicio.y + 0.3, inicio.z));
  between('uma pazada de bala derruba pouca coisa', visitados, 0, 4);
  note('mato no mapa de mentira', `${grande.count} arbustos`);
}
