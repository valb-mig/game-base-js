import { suite, ok, eq, near, between, note } from '../assert.js';
import { JIPE } from '../../src/veiculos/jipe.js';
import { criarFisica } from '../../src/veiculos/fisica.js';
import { criarVeiculo } from '../../src/veiculos/veiculo.js';
import { criarAssentos } from '../../src/veiculos/assentos.js';
import { regioesDoVeiculo, usarMedidasDoJipe } from '../../src/veiculos/hitbox.js';
import {
  carregarJipe, medidasDoJipe, criarJipe, olhoDoAssento
} from '../../src/veiculos/modelo.js';
import { atropelar } from '../../src/veiculos/atropelamento.js';
import { criarVeiculos } from '../../src/veiculos/veiculos.js';
import { initInput, endFrame } from '../../src/core/input.js';
import { Viewmodel } from '../../src/items/viewmodel.js';
import { MP40 } from '../../src/items/classes.js';
import { resolverComandos } from '../../src/veiculos/piloto.js';
import { tetoDeEsterco, forcaDoMotor } from '../../src/veiculos/atitude.js';
import { createBallistics } from '../../src/items/ballistics.js';
import * as THREE from 'three';
import {
  criarDano, posturaDe, PNEU_INTEIRO, PNEU_FURADO, PNEU_ARREBENTADO,
  APRUMADO, CAPOTADO, INUTILIZADO, VIDA
} from '../../src/veiculos/dano.js';
import { GRAMA, ESTRADA, TERRA } from '../../src/world/ground.js';

const DT = 1 / 60;
const G = 9.81;

/** Chão de mentira, com o gradiente que a física pede pra saber da ladeira. */
function chao(f = () => 0, tipo = ESTRADA) {
  const h = 0.6;
  return (x, z) => ({
    altura: f(x, z),
    tipo,
    dhx: (f(x + h, z) - f(x - h, z)) / (2 * h),
    dhz: (f(x, z + h) - f(x, z - h)) / (2 * h)
  });
}

function fisica(f, tipo, extra = {}) {
  return criarFisica(JIPE, { sondar: chao(f, tipo), ...extra });
}

function rodar(corpo, segundos, cmd = {}) {
  for (let i = 0; i < Math.round(segundos / DT); i++) corpo.step(DT, cmd);
}

/**
 * Acelera até a velocidade pedida, com TETO de quadros.
 *
 * O teto não é zelo: um `while` por velocidade que o veículo não alcança
 * (ladeira íngreme, pneu arrebentado, parede à frente) trava a página inteira,
 * e a suíte não falha — ela fica em "rodando…", que é o pior jeito de quebrar
 * porque não diz onde. Aconteceu numa bancada minha antes de acontecer aqui.
 */
function acelerarAte(corpo, kmh, limite = 60 * 40) {
  for (let i = 0; i < limite && corpo.aoLongo * 3.6 < kmh; i++) {
    corpo.step(DT, { acelerar: 1 });
  }
  return corpo.aoLongo * 3.6 >= kmh;
}

/** Mundo mínimo: terreno e uma lista de colisores que é um Array simples. */
function mundo(f = () => 0, tipo = GRAMA) {
  return {
    colliders: [],
    targets: [],
    terrain: { heightAt: f, tipoAt: () => tipo, nivelDaAguaAt: () => -100 }
  };
}

const cena = { add() {}, remove() {} };

/** Alvo de mentira com o contrato que o atropelamento precisa. */
function boneco(x, z, vida = 100) {
  return {
    x, z, feetY: 0, vida, alive: true, empurrado: 0,
    damage(amount) {
      this.vida -= amount;
      if (this.vida <= 0) this.alive = false;
      return { target: this, amount, killed: !this.alive };
    },
    empurrar(dx, dz) {
      this.x += dx;
      this.z += dz;
      this.empurrado += Math.hypot(dx, dz);
    }
  };
}

export async function run() {
  /**
   * O modelo é carregado ANTES de tudo, e é de propósito.
   *
   * Sem ele o veículo nasce sem malha, e metade do que se quer provar
   * simplesmente não existe: as mãos no volante não têm volante pra segurar, e
   * a hitbox cai na tabela de reserva em vez de sair do desenho. Deixar isso
   * pra última seção fazia o resto da suíte testar um jipe que o jogo não usa.
   *
   * A reserva continua coberta, mas por chamada direta — é o caso de quem
   * roda sem arquivo, não o caso normal.
   */
  const temModelo = await carregarJipe().then(() => true).catch(() => false);
  if (temModelo && medidasDoJipe()) usarMedidasDoJipe(medidasDoJipe);

  suite('jipe · suspensão');

  const parado = fisica();
  parado.assentar(0, 0, 0);
  rodar(parado, 2);
  const cargaTotal = parado.rodas.reduce((s, r) => s + r.carga, 0);
  near('as quatro molas sustentam o peso', cargaTotal, JIPE.MASSA * G, 60);
  between('a compressão em repouso fica no meio do curso',
    parado.rodas[0].compressao, 0.05, JIPE.CURSO * 0.7);
  ok('em repouso ninguém patina', parado.rodas.every((r) => r.patinando === 0));
  ok('em repouso as quatro rodas tocam o chão', parado.rodas.every((r) => r.noChao));
  near('chão plano não inclina o veículo', parado.pitch, 0, 1e-3);
  near('chão plano não rola o veículo', parado.roll, 0, 1e-3);

  // Terreno irregular: a suspensão tem que RESPONDER, não copiar o chão.
  const buraco = fisica((x, z) => (x > 0 ? 0 : -0.22));
  buraco.assentar(0, 0, 0);
  rodar(buraco, 1.5);
  // O degrau de 22 cm sobre a bitola de 1,30 é um talude de 9,6°, e o corpo
  // tem que acompanhá-lo. Ele passa um pouco disso porque a gravidade em
  // torno do apoio é um pêndulo invertido: ela puxa a inclinação pra fora, e
  // quem segura é a mola do lado de baixo — que por isso trabalha MAIS.
  const [fe, fd] = buraco.rodas;
  between('o corpo acompanha o degrau do terreno', buraco.roll, 0.10, 0.28);
  ok('e a mola do lado que baixou é a que trabalha',
    fd.compressao > fe.compressao, `${fd.compressao.toFixed(3)} vs ${fe.compressao.toFixed(3)}`);

  suite('jipe · nascer alinhado');

  // Posto com caimento zero numa ladeira de 40%, a roda da frente nascia meio
  // metro dentro do barranco: o batente respondia com 58 kN e o jipe era
  // arremessado pra cima girando.
  const rampa = fisica((x, z) => z * 0.4, GRAMA);
  rampa.assentar(0, 0, 0);
  near('nasce com o nariz pra cima na rampa de 40%', rampa.pitch, -0.38, 0.05);
  const cargasNoNascimento = Math.max(...rampa.rodas.map((r) => r.carga));
  ok('e sem carga absurda em nenhuma roda',
    cargasNoNascimento < JIPE.MASSA * G, `${cargasNoNascimento.toFixed(0)} N`);
  rodar(rampa, 1);
  ok('a rampa não arremessa o veículo', Math.abs(rampa.pitch) < 0.6, rampa.pitch.toFixed(3));

  suite('jipe · motor e freio');

  const reta = fisica();
  reta.assentar(0, 0, 0);
  let quadrosA60 = null;
  for (let i = 0; i < 60 * 22; i++) {
    reta.step(DT, { acelerar: 1 });
    if (!quadrosA60 && reta.aoLongo * 3.6 >= 60) quadrosA60 = i;
  }
  between('velocidade máxima de jipe, não de esportivo', reta.aoLongo * 3.6, 65, 90);
  between('0-60 km/h em segundos de caminhonete', quadrosA60 * DT, 6, 12);
  note('0-60 km/h', `${(quadrosA60 * DT).toFixed(2)} s`);

  // Frenagem: v² / (2·µ·g). Com µ 0,85 no asfalto, 77 km/h pedem ~27 m.
  const v0 = reta.aoLongo;
  let percorrido = 0;
  for (let i = 0; i < 60 * 8 && reta.aoLongo > 0.5; i++) {
    const antes = reta.z;
    reta.step(DT, { freio: 1 });
    percorrido += Math.abs(reta.z - antes);
  }
  const teorico = (v0 * v0) / (2 * 0.85 * G);
  near('freia na distância que o atrito permite', percorrido, teorico, teorico * 0.2);
  ok('e o nariz baixa ao frear', reta.pitch > 0.01, reta.pitch.toFixed(3));

  const re = fisica();
  re.assentar(0, 0, 0);
  rodar(re, 4, { acelerar: -1 });
  ok('a ré anda pra trás', re.aoLongo < -1, `${(re.aoLongo * 3.6).toFixed(1)} km/h`);
  ok('e é limitada, não é uma segunda marcha à frente',
    Math.abs(re.aoLongo) < JIPE.VEL_MAX_RE + 1, Math.abs(re.aoLongo).toFixed(1));

  eq('motor destruído não entrega torque', forcaDoMotor(JIPE, 1, 5, 0), 0);
  ok('força de baixa é maior que de alta',
    forcaDoMotor(JIPE, 1, 2) > forcaDoMotor(JIPE, 1, 20));

  suite('jipe · direção');

  ok('parado ele vira tudo', tetoDeEsterco(JIPE, 0) === JIPE.ESTERCO_MAX);
  near('na velocidade cheia vira um terço',
    tetoDeEsterco(JIPE, JIPE.ESTERCO_VEL), JIPE.ESTERCO_MIN, 1e-9);
  ok('e o teto só cai', tetoDeEsterco(JIPE, 10) < tetoDeEsterco(JIPE, 3));

  const curva = fisica();
  curva.assentar(0, 0, 0);
  ok('chega a 35 km/h pra fazer a curva', acelerarAte(curva, 35));
  rodar(curva, 1.5, { esterco: 1, acelerar: 0.3 });
  ok('esterçar pra esquerda gira pra esquerda', curva.yawRate > 0.2, curva.yawRate.toFixed(3));
  /**
   * O peso vai pra roda de FORA da curva. Com o sinal da transferência
   * trocado ele ia pra roda de dentro — medido, 5625 N na dianteira esquerda
   * numa curva à esquerda contra 755 N na direita — e como carga é o que
   * limita atrito, a curva ficava errada inteira sem nada parecer errado.
   */
  const [FL, FR] = curva.rodas;
  ok('numa curva à esquerda o peso vai pra roda DIREITA',
    FR.carga > FL.carga, `${FR.carga.toFixed(0)} vs ${FL.carga.toFixed(0)}`);
  ok('e a carroceria rola pra fora', curva.roll > 0.03, curva.roll.toFixed(3));

  const mao = fisica();
  mao.assentar(0, 0, 0);
  ok('chega a 45 km/h pro freio de mão', acelerarAte(mao, 45));
  const semMao = mao.deLado;
  rodar(mao, 1, { esterco: 0.4, freioMao: true });
  ok('freio de mão solta a traseira', Math.abs(mao.deLado) > Math.abs(semMao) + 0.5,
    mao.deLado.toFixed(2));

  suite('jipe · 4x4 e terreno');

  /**
   * Subir CUSTA, e é a componente horizontal do apoio que cobra.
   *
   * Sem ela a mola era só vertical e a ladeira não oferecia resistência
   * nenhuma: medido, o jipe subia 80% a 55 km/h — força de sobra que não vinha
   * do motor nenhum.
   */
  const subidas = [];
  for (const [incl, tipo] of [[0.20, GRAMA], [0.40, GRAMA], [0.55, TERRA]]) {
    const c = fisica((x, z) => Math.max(0, z * incl), tipo);
    c.assentar(0, 0, 0);
    rodar(c, 8, { acelerar: 1 });
    subidas.push(c.aoLongo * 3.6);
    note(`sobe ${(incl * 100).toFixed(0)}% em ${tipo}`, `${(c.aoLongo * 3.6).toFixed(1)} km/h`);
  }
  ok('20% de grama sobe sem esforço', subidas[0] > 25);
  ok('40% cobra a maior parte da velocidade', subidas[1] < subidas[0] * 0.6);
  ok('55% de terra solta não sobe', subidas[2] < 3);

  // Roda no ar não tem tração, e é a mesma linha que faz o capotamento
  // acontecer: sem carga não há atrito.
  const suspenso = fisica((x, z) => (z > 1 ? -4 : 0));
  suspenso.assentar(0, 0, 0);
  rodar(suspenso, 0.4);
  const noAr = suspenso.rodas.filter((r) => !r.noChao);
  ok('roda sem chão não tem carga', noAr.every((r) => r.carga === 0), `${noAr.length} no ar`);

  // Dois pneus arrebentados na mesma subida: a peneira é a carga, não um
  // "modo pneu furado" em lugar nenhum.
  const pneus = { FL: { estado: PNEU_ARREBENTADO }, RL: { estado: PNEU_ARREBENTADO } };
  const ferido = fisica((x, z) => Math.max(0, z * 0.30), GRAMA,
    { pneuDe: (id) => pneus[id] });
  ferido.assentar(0, 0, 0);
  rodar(ferido, 8, { acelerar: 1 });
  const inteiro = fisica((x, z) => Math.max(0, z * 0.30), GRAMA);
  inteiro.assentar(0, 0, 0);
  rodar(inteiro, 8, { acelerar: 1 });
  ok('dois pneus arrebentados atrapalham a subida',
    ferido.aoLongo < inteiro.aoLongo - 1,
    `${(ferido.aoLongo * 3.6).toFixed(1)} contra ${(inteiro.aoLongo * 3.6).toFixed(1)} km/h`);

  // Um pneu furado na frente PUXA, e não existe código de puxar pro lado.
  const so = { FL: { estado: PNEU_FURADO } };
  const puxa = fisica(() => 0, ESTRADA, { pneuDe: (id) => so[id] });
  puxa.assentar(0, 0, 0);
  rodar(puxa, 6, { acelerar: 1 });
  ok('pneu furado na frente desvia o veículo', Math.abs(puxa.x) > 0.2, puxa.x.toFixed(2));

  suite('jipe · capotamento');

  eq('aprumado é aprumado', posturaDe(0.1, 0.1), APRUMADO);
  eq('deitado de lado é capotado', posturaDe(1.4, 0), CAPOTADO);
  eq('ângulo embrulhado não inventa capotamento', posturaDe(-0.2, 0.3), APRUMADO);

  // O tombo tem que TERMINAR: sem o contato do casco, o jipe capotado
  // atravessava o terreno e caía pra sempre.
  const tombado = fisica();
  tombado.assentar(0, 0, 0);
  tombado.roll = Math.PI * 0.92;
  rodar(tombado, 5);
  between('capotado, ele assenta em vez de afundar ou decolar',
    tombado.y, -0.6, 1.6);
  ok('e para de girar', Math.abs(tombado.rollRate) < 0.6, tombado.rollRate.toFixed(3));
  ok('e continua capotado: ninguém se apruma sozinho',
    posturaDe(tombado.roll, tombado.pitch) !== APRUMADO,
    posturaDe(tombado.roll, tombado.pitch));
  ok('e a carroceria está raspando o chão', tombado.raspando);

  suite('jipe · dano por componente');

  const d = criarDano(JIPE.RODAS);
  eq('nasce operacional', d.integridade, 'operacional');
  eq('e com torque cheio', d.torque, 1);
  eq('os quatro pneus nascem inteiros',
    [...d.pneus.values()].filter((p) => p.estado === PNEU_INTEIRO).length, 4);

  d.aplicar('roda_FL', VIDA.pneu * 0.4, 'FL');
  eq('meia dúzia de tiros fura o pneu', d.pneuDe('FL').estado, PNEU_FURADO);
  eq('e não mexe nos outros três', d.pneuDe('FR').estado, PNEU_INTEIRO);
  d.aplicar('roda_FL', VIDA.pneu, 'FL');
  eq('insistir arrebenta', d.pneuDe('FL').estado, PNEU_ARREBENTADO);
  eq('pneu arrebentado não inutiliza o veículo', d.andando, true);

  d.aplicar('motor', VIDA.motor);
  eq('motor destruído zera o torque', d.torque, 0);
  eq('e o veículo fica inutilizado', d.integridade, INUTILIZADO);
  eq('inutilizado não anda', d.andando, false);

  const tanque = criarDano(JIPE.RODAS);
  const antesDoTanque = tanque.componentes.carroceria;
  tanque.aplicar('tanque', VIDA.tanque);
  ok('tanque furado leva a carroceria junto',
    tanque.componentes.carroceria < antesDoTanque, `${tanque.componentes.carroceria}`);

  const sucata = criarDano(JIPE.RODAS);
  sucata.aplicar('carroceria', VIDA.carroceria);
  eq('carroceria no chão é destruição', sucata.integridade, 'destruido');

  suite('jipe · regiões de acerto');

  const regioes = regioesDoVeiculo(JIPE);
  eq('oito regiões: quatro pneus, motor, tanque, para-lama e lataria',
    regioes.length, 8);
  const nomes = regioes.map((r) => r.regiao.nome);
  ok('cada roda tem a sua', ['FL', 'FR', 'RL', 'RR'].every((id) => nomes.includes(`roda_${id}`)));
  const carroceria = regioes.find((r) => r.regiao.nome === 'carroceria');
  const motor = regioes.find((r) => r.regiao.nome === 'motor');
  ok('a carroceria envolve o motor',
    motor.minX >= carroceria.minX && motor.maxX <= carroceria.maxX
    && motor.minZ >= carroceria.minZ && motor.maxZ <= carroceria.maxZ);
  ok('e por isso o empate vai pro motor', motor.ordem < carroceria.ordem);
  for (const r of JIPE.RODAS) {
    const caixa = regioes.find((x) => x.regiao.nome === `roda_${r.id}`);
    near(`a caixa do pneu ${r.id} está onde a roda está`,
      (caixa.minX + caixa.maxX) / 2, r.x, 0.02);
  }
  // A faixa entre a lataria e a ponta do para-lama é onde a roda fica EXPOSTA
  // de lado. Sem isso, um tiro na roda entra na caixa da carroceria primeiro.
  const lataria = regioes.find((r) => r.regiao.nome === 'carroceria');
  const pneuFL = regioes.find((r) => r.regiao.nome === 'roda_FL');
  ok('o pneu fica por FORA da lataria', pneuFL.maxX > lataria.maxX,
    `${pneuFL.maxX.toFixed(2)} contra ${lataria.maxX.toFixed(2)}`);
  const paraLama = regioes.find((r) => r.regiao.nome === 'para_lama');
  ok('e o para-lama fica ACIMA dele, sem se sobrepor',
    paraLama.minY >= pneuFL.maxY - 0.01,
    `${paraLama.minY.toFixed(2)} contra ${pneuFL.maxY.toFixed(2)}`);

  suite('jipe · tiro no pneu, ponta a ponta');

  /**
   * O teste que importa: a bala de verdade, pela balística de verdade,
   * furando o pneu. A hitbox do veículo é o mesmo contrato do soldado, então
   * não existe nenhuma linha de "bala acerta veículo" em lugar nenhum.
   */
  const w = mundo();
  const jipe = criarVeiculo(cena, w, { ficha: JIPE, x: 0, z: 0, yaw: 0 });
  const ballistics = createBallistics({ add() {}, remove() {} }, w.colliders);
  const roda = JIPE.RODAS[0];
  const alvo = new THREE.Vector3(roda.x, JIPE.RAIO_RODA, roda.z);
  const origem = new THREE.Vector3(roda.x + 12, JIPE.RAIO_RODA, roda.z);
  const rumo = alvo.clone().sub(origem).normalize();

  let acertos = 0;
  let ultimaRegiao = null;
  ballistics.onHit((r) => {
    if (r.target !== jipe) return;
    acertos++;
    ultimaRegiao = r.regiao?.nome ?? null;
  });
  for (let tiro = 0; tiro < 8; tiro++) {
    ballistics.spawn(origem, rumo, { damage: 12, range: 60, gravity: 0, owner: null });
    for (let i = 0; i < 20 && ballistics.bullets.length; i++) {
      ballistics.update(DT, [jipe], null);
    }
  }
  ok('a bala acerta o veículo', acertos >= 6, `${acertos} de 8`);
  eq('e acerta o PNEU em que se mirou', ultimaRegiao, 'roda_FL');
  ok('e oito tiros furam o pneu',
    jipe.dano.pneuDe('FL').estado !== PNEU_INTEIRO, jipe.dano.pneuDe('FL').estado);
  eq('sem furar os outros', jipe.dano.pneuDe('RR').estado, PNEU_INTEIRO);
  ok('e o veículo não morre de tiro no pneu', jipe.dano.andando);

  suite('jipe · assentos');

  const lugares = criarAssentos(JIPE);
  eq('quatro lugares', lugares.lugares.length, 4);
  ok('nasce vazio', lugares.vazio);
  const a = {};
  const b = {};
  eq('o primeiro que entra pega o volante', lugares.sentar(a).def.dirige, true);
  eq('e ele é o motorista', lugares.motorista, a);
  eq('o segundo vira passageiro', lugares.sentar(b).def.dirige, false);
  eq('ninguém senta duas vezes', lugares.sentar(a), null);
  eq('dois ocupantes', lugares.ocupantes().length, 2);
  lugares.sentar({});
  lugares.sentar({});
  eq('cheio recusa o quinto', lugares.sentar({}), null);
  ok('levantar libera o lugar', lugares.levantar(a).def.dirige);
  eq('e o volante fica vago', lugares.motorista, null);
  eq('levantar quem não está sentado não faz nada', lugares.levantar({}), null);

  suite('jipe · atropelamento');

  const w2 = mundo();
  const carro = criarVeiculo(cena, w2, { ficha: JIPE, x: 0, z: 0, yaw: 0 });

  // Faixa 1: devagar empurra e não machuca.
  const lento = boneco(0, 1.4);
  carro.corpo.vz = 1.0;
  let r1 = atropelar(carro, [lento], [], DT);
  eq('a 3,6 km/h ele empurra', r1[0]?.efeito, 'empurrou');
  eq('e não tira vida', lento.vida, 100);
  ok('mas tira o corpo do caminho', lento.empurrado > 0);

  // Faixa 2: derruba, mas dá pra sobreviver.
  const medio = boneco(0, 1.4);
  carro.corpo.vz = 3.0;
  atropelar(carro, [medio], [], DT);
  ok('a 11 km/h ele derruba com dano grande', medio.vida < 60 && medio.vida > 0, `${medio.vida}`);

  // Faixa 3: letal.
  const rapido = boneco(0, 1.4);
  carro.corpo.vz = 8.0;
  const r3 = atropelar(carro, [rapido], [], DT);
  eq('a 29 km/h é atropelamento', r3[0]?.efeito, 'atropelou');
  eq('e mata', rapido.alive, false);

  // Quem está longe, quem está atrás e quem está dentro não são atropelados.
  const longe = boneco(0, 9);
  const dentro = boneco(0, 0.5);
  carro.corpo.vz = 8.0;
  eq('quem está longe não é tocado', atropelar(carro, [longe], [], DT).length, 0);
  eq('e quem está dentro do veículo, nunca',
    atropelar(carro, [dentro], [dentro], DT).length, 0);

  const atras = boneco(0, -1.4);
  carro.corpo.vz = 8.0;
  eq('nem quem ficou atrás enquanto ele se afasta',
    atropelar(carro, [atras], [], DT).length, 0);

  const emCima = boneco(0, 1.4);
  emCima.feetY = 6;
  eq('nem quem está numa laje acima', atropelar(carro, [emCima], [], DT).length, 0);

  suite('jipe · entrar, dirigir e sair');

  /**
   * O caminho inteiro, do jeito que o jogador faz: chegar perto, entrar,
   * acelerar, e descer. Sem isto, a suíte provava que a física anda e que os
   * assentos contam certo, e nada provava que dá pra DIRIGIR.
   */
  const w5 = mundo();
  const olho = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 400);
  const jogador = {
    object: olho, spectating: false, alive: true, isLocked: true,
    feetY: 0, height: 1.7, eyeY: 1.7, floorY: 0, onGround: true,
    vehicle: null, asTarget: null, velocity: new THREE.Vector3(), verticalVelocity: 0
  };
  // Comandos por fora: em headless não há tecla nenhuma pra apertar.
  let manche = { acelerar: 0, esterco: 0, freio: 0, freioMao: false };
  const frota = criarVeiculos(cena, w5, olho, jogador, { lerComandos: () => manche });
  const jipeDirigido = frota.criar(0, 0, 0);

  olho.position.set(24, 1.7, 0);
  eq('longe do jipe o E não oferece nada', frota.aviso(), null);

  /**
   * Encostado na FRENTE do capô, que é o pior caso: ali o colisor mantém o
   * jogador a 2,1 m do centro (1,7 de jipeDirigidoceria mais 0,4 de raio de corpo).
   * Com o alcance em 2,6 sobrava meio metro pra acertar, e chegar pela frente
   * parecia que a tecla não funcionava.
   */
  olho.position.set(0, 1.7, 2.4);
  eq('encostado no capô, o E oferece o jipe', frota.aviso(), jipeDirigido.name);

  /**
   * E é a TECLA, e é por ela que o teste tem que passar.
   *
   * A primeira versão chamava `embarcar()` direto e ficava verde enquanto o
   * jogo não deixava ninguém entrar em veículo nenhum: `items/drop.js` rodava
   * antes no laço e consumia o E em todo quadro, mesmo sem item ao alcance.
   * Mesma lição do tiro que só é prova quando começa no clique.
   */
  initInput();
  dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
  frota.update(DT, []);
  endFrame();
  dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
  ok('e apertar E entra no veículo', Boolean(jogador.vehicle));
  eq('no volante', jipeDirigido.assentos.motorista, jogador);
  eq('e o aviso vira Sair', frota.aviso(), 'Sair');

  manche = { acelerar: 1, esterco: 0, freio: 0, freioMao: false };
  for (let i = 0; i < 60 * 6; i++) frota.update(DT, []);
  ok('acelerar leva o veículo pra frente', jipeDirigido.corpo.z > 20, `${jipeDirigido.corpo.z.toFixed(1)} m`);
  ok('e a câmera vai junto, no assento',
    Math.hypot(olho.position.x - jipeDirigido.corpo.x, olho.position.z - jipeDirigido.corpo.z) < 2,
    `${Math.hypot(olho.position.x - jipeDirigido.corpo.x, olho.position.z - jipeDirigido.corpo.z).toFixed(2)} m do centro`);
  between('na altura de quem está sentado, não no chão',
    olho.position.y - jipeDirigido.corpo.y, 0.8, 1.8);

  // Esterçar tem que virar o veículo E a cabeça: sentado, quem gira é o jipe
  // levando o jogador junto.
  const rumoAntes = jipeDirigido.corpo.yaw;
  manche = { acelerar: 0.4, esterco: 1, freio: 0, freioMao: false };
  for (let i = 0; i < 60 * 2; i++) frota.update(DT, []);
  ok('esterçar gira o veículo', Math.abs(jipeDirigido.corpo.yaw - rumoAntes) > 0.5,
    (jipeDirigido.corpo.yaw - rumoAntes).toFixed(2));

  // S a 40 km/h é FREIO, não ré: com as duas na mesma tecla e sem o limiar,
  // o veículo arava o chão pedindo ré a toda velocidade.
  const freando = resolverComandos({ acelerar: -1 }, 11);
  eq('S em movimento é freio', freando.freio, 1);
  eq('e não é ré', freando.acelerar, 0);
  eq('S quase parado é ré', resolverComandos({ acelerar: -1 }, 0.2).acelerar, -1);

  const pousou = frota.desembarcar();
  ok('desembarcar funciona', pousou);
  eq('e o assento vaga', jipeDirigido.assentos.motorista, null);
  ok('o jogador desce AO LADO do veículo, não dentro',
    Math.hypot(olho.position.x - jipeDirigido.corpo.x, olho.position.z - jipeDirigido.corpo.z) > 1,
    `${Math.hypot(olho.position.x - jipeDirigido.corpo.x, olho.position.z - jipeDirigido.corpo.z).toFixed(2)} m`);
  // Aprumar passa pelo quaternion (é a única maneira segura na ordem YXZ), e
  // ida e volta deixa um resíduo de float. Zero exato aqui seria testar a
  // aritmética do three, não o jogo.
  near('e a rolagem de tela volta a zero', olho.rotation.z, 0, 1e-9);
  eq('e ele pode entrar de novo', frota.aviso(), jipeDirigido.name);

  // Morrer dentro do jipe tem que vagar o assento, senão o espectador nasce
  // grudado no veículo e o lugar fica ocupado o resto da partida.
  frota.embarcar(jipeDirigido);
  jogador.alive = false;
  frota.update(DT, []);
  eq('morrer dentro do jipe vaga o assento', jipeDirigido.assentos.motorista, null);
  eq('e solta o jogador do veículo', jogador.vehicle, null);
  jogador.alive = true;

  suite('jipe · sem arquivo, a reserva vale');

  /**
   * Regra de dano não pode depender de um `.glb` ter carregado, e nem o
   * assento. Sem modelo, `olhoDoAssento` devolvia a ORIGEM do mapa — o jogador
   * sentava a mil metros do veículo e nada no console dizia por quê.
   */
  const semModelo = { x: 12, y: 3, z: -40, yaw: 0, roll: 0, pitch: 0 };
  const banco = JIPE.ASSENTOS.find((a) => a.dirige);
  const olhoReserva = olhoDoAssento(null, JIPE, banco, semModelo);
  near('sem modelo, o assento sai da FICHA e não da origem',
    Math.hypot(olhoReserva.x - semModelo.x, olhoReserva.z - semModelo.z),
    Math.hypot(banco.x, banco.z), 0.01);
  ok('e na altura de quem senta', olhoReserva.y - semModelo.y > 1,
    (olhoReserva.y - semModelo.y).toFixed(2));

  suite('jipe · as mãos no volante');

  /**
   * Quem dirige segura o volante, não a MP40.
   *
   * E não era só feio: `viewmodel.update` não roda pra quem está no volante,
   * então a arma CONGELAVA na última pose no meio da tela. O item é escondido
   * e não removido — descer do jipe devolve a mesma arma na mesma pose.
   *
   * Os pontos saem do ARO do volante e chegam no espaço da CÂMERA, que é o
   * espaço da cena do viewmodel. É o caminho da boca do cano ao contrário: o
   * mundo entra pela matriz da câmera do jogo.
   */
  const w7 = mundo();
  const olhoDoVolante = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 400);
  const motorista = {
    object: olhoDoVolante, spectating: false, alive: true, isLocked: true,
    feetY: 0, height: 1.7, eyeY: 1.7, floorY: 0, onGround: true,
    vehicle: null, asTarget: null, velocity: new THREE.Vector3(), verticalVelocity: 0
  };
  const garagem = criarVeiculos(cena, w7, olhoDoVolante, motorista,
    { lerComandos: () => ({ acelerar: 0, esterco: 0, freio: 0, freioMao: false }) });
  const carroDoVolante = garagem.criar(0, 0, 0);

  eq('a pé, ninguém segura volante nenhum', garagem.maosNoVolante(), null);

  // O olhar é do JOGADOR: a vista do veículo só soma o giro do corpo. Pra a
  // medida ter sentido ele tem que estar olhando pro nariz do jipe.
  olhoDoVolante.quaternion.setFromEuler(new THREE.Euler(0, Math.PI, 0, 'YXZ'));
  garagem.embarcar(carroDoVolante);
  for (let i = 0; i < 20; i++) garagem.update(DT, []);

  const maos = garagem.maosNoVolante();
  ok('sentado no volante, há duas mãos', Boolean(maos));
  near('e elas ficam à largura do aro', maos.esq.distanceTo(maos.dir), 0.30, 0.02);
  ok('à frente do olho', maos.esq.z < -0.15 && maos.dir.z < -0.15,
    `z ${maos.esq.z.toFixed(2)}`);
  ok('e abaixo dele', maos.esq.y < -0.1 && maos.dir.y < -0.1,
    `y ${maos.esq.y.toFixed(2)}`);
  // `+X` é a esquerda do veículo, e em espaço de câmera olhando pra frente ela
  // fica à esquerda da tela. Trocar as mãos cruzaria os braços na tela.
  ok('a mão esquerda fica à esquerda da tela', maos.esq.x < 0, maos.esq.x.toFixed(2));

  /**
   * O braço tem que ALCANÇAR. Ombro e comprimento vivem em `items/arms.js`:
   * 0,30 + 0,28, e a IK estica até 1,6× disso antes de a mão descolar. Se o
   * volante ficasse fora do alcance, a mão desgrudaria dele — e mão flutuando
   * lê como bug, do mesmo jeito que arma flutuando.
   */
  const ombroEsq = new THREE.Vector3(-0.16, -0.31, 0.19);
  const ombroDir = new THREE.Vector3(0.16, -0.33, 0.19);
  between('o braço esquerdo alcança o aro sem esticar',
    ombroEsq.distanceTo(maos.esq), 0.2, 0.58);
  between('e o direito também', ombroDir.distanceTo(maos.dir), 0.2, 0.58);

  // As mãos giram COM o aro, e isso não tem código: o alvo sai do sistema do
  // volante, que gira.
  const antesDeEsterçar = maos.esq.clone();
  carroDoVolante.corpo.rodas[0].esterco = 0.5;
  carroDoVolante.desenhar();
  const depoisDeEsterçar = garagem.maosNoVolante().esq.clone();
  ok('esterçar leva as mãos junto',
    antesDeEsterçar.distanceTo(depoisDeEsterçar) > 0.08,
    `${antesDeEsterçar.distanceTo(depoisDeEsterçar).toFixed(3)} m`);

  /**
   * E leva pro LADO CERTO. Esterço positivo é virar à esquerda, e virar à
   * esquerda BAIXA a mão esquerda — quem gira um volante sem direção assistida
   * puxa pra baixo do lado pra onde vai.
   *
   * O sinal estava invertido, e nenhum teste pegava: "o aro mexe" e "a mão cai
   * no aro" continuam verdes com o volante girando ao contrário do movimento.
   */
  ok('e pro lado certo: virando à esquerda, a mão esquerda desce',
    depoisDeEsterçar.y < antesDeEsterçar.y - 0.02,
    `${depoisDeEsterçar.y.toFixed(3)} contra ${antesDeEsterçar.y.toFixed(3)}`);

  carroDoVolante.corpo.rodas[0].esterco = -0.5;
  carroDoVolante.desenhar();
  ok('e virando à direita ela sobe',
    garagem.maosNoVolante().esq.y > antesDeEsterçar.y + 0.02,
    garagem.maosNoVolante().esq.y.toFixed(3));

  // Volante DE VOLTA ao meio: com ele torcido, o ponto de nove horas sobe pro
  // topo do aro e as duas projeções caem no centro da tela — a comparação
  // passaria mesmo estando errada, que é o pior tipo de teste verde.
  carroDoVolante.corpo.rodas[0].esterco = 0;
  carroDoVolante.desenhar();
  const noMeio = garagem.maosNoVolante();

  const vm = new Viewmodel(olhoDoVolante, 1.78);
  vm.setItem(MP40);
  eq('a arma está na mão a pé', vm.item.visible, true);
  vm.segurarVolante(noMeio.esq, noMeio.dir, 70);
  eq('dirigindo, ela sai da tela', vm.item.visible, false);
  ok('e os braços ficam', vm.bracos.dir.visible && vm.bracos.esq.visible);

  /**
   * E a mão tem que cair NO VOLANTE — na tela, que é onde o jogador olha.
   *
   * Esta é a asserção que faltava e que nenhuma medida em metros daria: a cena
   * do viewmodel tem câmera própria, com 42° contra os 70° do jogo. Um ponto do
   * aro copiado cru pra lá projeta noutro lugar da tela — medido, o aro fica a
   * 24° do eixo e o quadro do viewmodel acaba em 21°, ou seja as mãos não
   * apareciam nem na tela. A prova é projetar as duas coisas, cada uma pela
   * câmera que a desenha, e comparar em coordenada de TELA.
   */
  const camDoMundo = new THREE.PerspectiveCamera(70, 1.78, 0.1, 400);
  camDoMundo.updateMatrixWorld(true);
  vm.camera.updateMatrixWorld(true);
  vm.scene.updateMatrixWorld(true);

  const palma = new THREE.Vector3();
  for (const [nome, ponto, braco] of [
    ['esquerda', noMeio.esq, vm.bracos.esq],
    ['direita', noMeio.dir, vm.bracos.dir]
  ]) {
    const noAro = ponto.clone().project(camDoMundo);
    // Sem isto a comparação pode ser entre dois pontos no meio da tela, e aí
    // ela não prova nada: o aro tem que estar LONGE do centro.
    ok(`o aro esquerdo/direito não está no centro da tela (${nome})`,
      Math.abs(noAro.x) > 0.2, noAro.x.toFixed(3));
    braco.mao.getWorldPosition(palma);
    const naTela = palma.project(vm.camera);
    near(`a mão ${nome} cai no aro, na horizontal da tela`, naTela.x, noAro.x, 0.06);
    near(`e na vertical`, naTela.y, noAro.y, 0.06);
  }

  vm.soltarVolante();
  eq('descer devolve a arma', vm.item.visible, true);

  suite('jipe · colisor e mundo');

  const w3 = mundo();
  const parqueado = criarVeiculo(cena, w3, { ficha: JIPE, x: 40, z: -20, yaw: 0 });
  eq('o veículo registra um colisor', w3.colliders.length, 1);
  const caixa = parqueado.collider.box;
  between('a caixa cobre o comprimento do jipe',
    caixa.max.z - caixa.min.z, JIPE.MEIO_COMPRIMENTO * 2 - 0.1, JIPE.MEIO_COMPRIMENTO * 2 + 0.1);
  ok('e ela não é escalável: subir no capô faria o jipe subir em si mesmo',
    parqueado.collider.standable === false);

  // Girado 90°, a caixa troca comprimento por largura — e é por isso que ela
  // é medida dos cantos girados, não de uma conta fechada.
  parqueado.corpo.yaw = Math.PI / 2;
  parqueado.moverColisor();
  between('girado 90° a caixa acompanha',
    parqueado.collider.box.max.x - parqueado.collider.box.min.x,
    JIPE.MEIO_COMPRIMENTO * 2 - 0.1, JIPE.MEIO_COMPRIMENTO * 2 + 0.1);

  // Uma parede à frente barra o veículo em vez de deixá-lo atravessar.
  const w4 = mundo();
  const muro = {
    box: new THREE.Box3(new THREE.Vector3(-20, 0, 18), new THREE.Vector3(20, 4, 22)),
    standable: false
  };
  w4.colliders.push(muro);
  const bate = criarVeiculo(cena, w4, { ficha: JIPE, x: 0, z: 0, yaw: 0 });
    // `passo`, não `update`: `update` é no-op de propósito, porque a lista de
  // alvos do mundo chama `update` em todo mundo e a física não pode rodar duas
  // vezes por quadro.
  eq('update do contrato de alvo não anda com o veículo', bate.update(), undefined);
  for (let i = 0; i < 60 * 7; i++) bate.passo(DT, { acelerar: 1 }, []);
  ok('a parede barra o veículo', bate.corpo.z < 18, bate.corpo.z.toFixed(2));
  ok('e bater machuca a carroceria',
    bate.dano.componentes.carroceria < VIDA.carroceria,
    `${bate.dano.componentes.carroceria.toFixed(0)} de ${VIDA.carroceria}`);

  suite('jipe · a hitbox é medida da malha');

  /**
   * A única fonte que não pode concordar por engano.
   *
   * A caixa escrita à mão passou por uma suíte verde inteira estando 28 cm
   * acima do jipe, 10 cm atrás dele e com o piso 6 cm dentro das rodas — nada
   * disso aparece num teste que confere se a caixa existe. Aparece comparando
   * com `Box3.setFromObject`, que é o desenho.
   */
  if (!temModelo || !medidasDoJipe()) {
    note('modelo do jipe', 'não carregou; a tabela de reserva é que vale');
  } else {
    const molde = criarJipe(JIPE);
    const cenaMedida = new THREE.Scene();
    cenaMedida.add(molde.grupo);
    cenaMedida.updateMatrixWorld(true);

    const malha = new THREE.Box3().setFromObject(molde.grupo);
    const medidas = regioesDoVeiculo(JIPE);

    // Nada de caixa de acerto no AR: nenhuma região passa do desenho.
    const topo = Math.max(...medidas.map((r) => r.maxY));
    near('a hitbox acaba onde a malha acaba', topo, malha.max.y, 0.02);
    const fundo = Math.min(...medidas.map((r) => r.minY));
    near('e começa onde ela começa', fundo, malha.min.y, 0.02);
    const traseira = Math.min(...medidas.map((r) => r.minZ));
    const dianteira = Math.max(...medidas.map((r) => r.maxZ));
    near('o comprimento bate com o do desenho, atrás', traseira, malha.min.z, 0.03);
    near('e na frente', dianteira, malha.max.z, 0.03);
    const lado = Math.max(...medidas.map((r) => r.maxX));
    near('e a largura também', lado, malha.max.x, 0.02);

    // Cada roda contra a MALHA dela, não contra a posição declarada.
    const caixaDe = (nome) => {
      const o = molde.grupo.getObjectByName(nome);
      return o ? new THREE.Box3().setFromObject(o) : null;
    };
    for (const r of JIPE.RODAS) {
      const desenho = caixaDe(`wheel_${r.id}_mesh`);
      const regiao = medidas.find((x) => x.regiao.nome === `roda_${r.id}`);
      near(`pneu ${r.id}: a caixa é a da malha em z`,
        regiao.maxZ, desenho.max.z, 0.01);
      near(`pneu ${r.id}: e em x`, regiao.maxX, desenho.max.x, 0.01);
    }

    const chassi = caixaDe('chassi_mesh');
    const lataria2 = medidas.find((r) => r.regiao.nome === 'carroceria');
    near('a lataria começa no assoalho', lataria2.minY, chassi.min.y, 0.01);
    near('e acaba no para-brisa', lataria2.maxY, chassi.max.y, 0.01);

    // Motor e tanque continuam escritos à mão, e é o RECORTE que garante que
    // eles não saiam da malha sozinhos.
    for (const nome of ['motor', 'tanque']) {
      const r = medidas.find((x) => x.regiao.nome === nome);
      ok(`${nome} está dentro do chassi`,
        r.minX >= chassi.min.x - 1e-6 && r.maxX <= chassi.max.x + 1e-6
        && r.minY >= chassi.min.y - 1e-6 && r.maxY <= chassi.max.y + 1e-6
        && r.minZ >= chassi.min.z - 1e-6 && r.maxZ <= chassi.max.z + 1e-6,
        `y ${r.minY.toFixed(2)}..${r.maxY.toFixed(2)} z ${r.minZ.toFixed(2)}..${r.maxZ.toFixed(2)}`);
    }

    suite('jipe · dá pra ver pela frente');

    /**
     * O para-brisa do arquivo era duas caixas MACIÇAS — uma laje de 46 cm e um
     * painel escuro por cima. Sentado no volante, o jogador via uma parede
     * olive ocupando a tela inteira, e nenhuma medida de hitbox ou de física
     * diria nada sobre isso.
     *
     * A pergunta é a do jogador: do olho do motorista, o que o olhar encontra?
     * Um raio, e a resposta tem que ser "vidro, e nada opaco".
     */
    const assento = JIPE.ASSENTOS.find((a) => a.dirige);
    const olhoDoJipe = new THREE.Vector3();
    molde.grupo.getObjectByName(assento.no).getWorldPosition(olhoDoJipe);
    olhoDoJipe.y += JIPE.ALTURA_OLHO;

    const raio = new THREE.Raycaster();
    const rumos = [
      ['em frente', new THREE.Vector3(0, 0, 1)],
      ['à meia-esquerda', new THREE.Vector3(0.3, 0, 1).normalize()],
      ['à meia-direita', new THREE.Vector3(-0.3, 0, 1).normalize()]
    ];
    for (const [nome, rumo] of rumos) {
      raio.set(olhoDoJipe, rumo);
      const encontros = raio.intersectObject(molde.grupo, true)
        .filter((h) => h.distance < 3);
      const opacos = encontros.filter((h) => !h.object.material.transparent);
      const vidros = encontros.filter((h) => h.object.material.transparent);
      eq(`olhando ${nome}, nada opaco na frente do rosto`, opacos.length, 0);
      ok(`e o vidro está lá`, vidros.length > 0, `${vidros.length} painel`);
    }

    // Pra BAIXO tem que haver capô: se o raio não encontra nada ali, a
    // carroceria foi embora junto com o para-brisa.
    raio.set(olhoDoJipe, new THREE.Vector3(0, -0.2, 1).normalize());
    ok('e olhando pra baixo o capô está no lugar',
      raio.intersectObject(molde.grupo, true)
        .some((h) => !h.object.material.transparent && h.distance < 3));

    const vidro = molde.grupo.getObjectByName('parabrisa_vidro');
    ok('o vidro é transparente de verdade', vidro?.material.transparent === true);
    ok('e não escreve profundidade, senão apagaria o mundo atrás dele',
      vidro?.material.depthWrite === false);
    ok('e a moldura ficou', Boolean(molde.grupo.getObjectByName('parabrisa_moldura')));

    // A antena passa a 2 cm da laje: qualquer folga generosa no recorte levava
    // ela junto, e ninguém veria isso numa foto de frente.
    const antena = new THREE.Box3().setFromObject(
      molde.grupo.getObjectByName('chassi_mesh'));
    near('a antena sobreviveu ao recorte', antena.max.y, 1.455, 0.02);

    suite('jipe · o volante gira, não tomba');

    /**
     * Ele girava em Y, e o eixo dele não é Y: o modelo faz o volante como um
     * cilindro deitado pra trás, então girar em Y INCLINA o disco pro lado em
     * vez de rodá-lo. Medido: 64° de desvio da normal do disco, que é o
     * "volante tombando" que se vê dirigindo.
     *
     * A prova é a NORMAL: um giro em torno do próprio eixo não mexe nela, e
     * qualquer outro eixo mexe. E a caixa envolvente NÃO serve de prova —
     * `Box3.setFromObject` gira a CAIXA e não os vértices, então ela cresce
     * 107% num giro perfeitamente correto. Foi essa medida errada que quase me
     * fez desfazer o conserto.
     */
    const volanteNo = molde.grupo.getObjectByName('volante');
    ok('o eixo do volante é medido, não escrito', Boolean(molde.eixoVolante));
    const corpoVol = criarFisica(JIPE, { sondar: chao() });
    corpoVol.assentar(0, 0, 0);
    const zero = new THREE.Vector3();

    const normalDoDisco = () => {
      cenaMedida.updateMatrixWorld(true);
      return molde.eixoVolante.clone()
        .applyQuaternion(volanteNo.getWorldQuaternion(new THREE.Quaternion()));
    };
    const pontoDoAro = () => {
      cenaMedida.updateMatrixWorld(true);
      return new THREE.Vector3(0.15, 0, 0).applyMatrix4(volanteNo.matrixWorld);
    };

    corpoVol.rodas[0].esterco = 0;
    molde.pose(corpoVol, zero);
    const normalReta = normalDoDisco();
    const aroReto = pontoDoAro();

    corpoVol.rodas[0].esterco = JIPE.ESTERCO_MAX;
    molde.pose(corpoVol, zero);
    const desvio = Math.acos(
      Math.min(1, normalReta.dot(normalDoDisco()))) * 180 / Math.PI;
    near('esterçar não inclina o disco do volante', desvio, 0, 0.5);
    ok('e o aro anda de verdade',
      aroReto.distanceTo(pontoDoAro()) > 0.1,
      `${aroReto.distanceTo(pontoDoAro()).toFixed(3)} m`);

    // Contraprova: o jeito errado tem que FALHAR o mesmo teste, senão o teste
    // não está medindo nada.
    volanteNo.rotation.set(0, -JIPE.ESTERCO_MAX * 3.2, 0);
    const errado = Math.acos(Math.min(1, Math.abs(
      normalReta.dot(normalDoDisco())))) * 180 / Math.PI;
    ok('e girar em Y falharia este teste', errado > 30, `${errado.toFixed(1)}°`);

    // E o VOLANTE anda muito mais que a roda: são umas três voltas de batente
    // a batente num MB.
    corpoVol.rodas[0].esterco = 0.2;
    molde.pose(corpoVol, zero);
    const q = volanteNo.quaternion;
    const anguloVolante = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    ok('o volante gira mais que a roda esterça', anguloVolante > 0.2 * 2,
      `${anguloVolante.toFixed(2)} rad para 0,20 de esterço`);

    // E o COLISOR, que é outra caixa e erra por outros motivos.
    const w6 = mundo();
    const medido = criarVeiculo(cena, w6, { ficha: JIPE, x: 0, z: 0, yaw: 0 });
    const cx = medido.collider.box;
    near('o colisor tem a altura do desenho', cx.max.y - cx.min.y,
      malha.max.y - malha.min.y, 0.05);
    near('e a largura', cx.max.x - cx.min.x, malha.max.x - malha.min.x, 0.05);
    note('colisor', `${(cx.max.x - cx.min.x).toFixed(2)} x `
      + `${(cx.max.y - cx.min.y).toFixed(2)} x ${(cx.max.z - cx.min.z).toFixed(2)}`);
  }
}