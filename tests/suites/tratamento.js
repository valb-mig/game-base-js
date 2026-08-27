import * as THREE from 'three';
import {
  TRATAMENTO, atende, enfermariaEm, enfermariaMaisPerto,
  tratar, ferido, tratado, criarTratamento
} from '../../src/game/tratamento.js';
import { SUPRIMENTO } from '../../src/game/suprimento.js';
import { addEnfermaria, ENFERMARIA } from '../../src/world/enfermaria.js';
import { createSoldier } from '../../src/bots/soldier.js';
import { createBrain } from '../../src/bots/brain.js';
import { addPaiol } from '../../src/world/paiol.js';
import { addLogistica } from '../../src/world/logistica.js';
import { construirLocal } from '../../src/world/locais.js';
import { ListaDeColisores } from '../../src/world/colisores.js';
import { createBallistics } from '../../src/items/ballistics.js';
import { collides, groundHeightAt } from '../../src/player/collision.js';
import { PLAYER } from '../../src/config.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

/**
 * Cura como lugar: a regra e a tenda.
 *
 * O que se prova aqui, na ordem em que importa: que a cura CUSTA segundos e
 * não é instantânea; que ela não vale com o time errado nem num posto em
 * disputa; que levar tiro dentro da tenda interrompe o tratamento (senão a
 * lona vira escudo); que a lona barra o corpo e não a bala; e que a tenda é
 * OCA com porta de verdade — o que, como a casa, não se vê numa captura de
 * tela, porque a porta desenhada e a porta atravessável são a mesma imagem.
 */

const DT = 1 / 60;

/** Terreno plano de mentira: aqui se mede a geometria, não o relevo. */
const chao = {
  heightAt: () => 0,
  nivelDaAguaAt: () => -100,
  waterDepthAt: () => 0,
  declividadeAt: () => 0,
  estradaAt: () => 0,
  corDeEstradaAt: () => null
};

/** O corpo do jogador cabe em pé em (x, z)? */
function cabe(colliders, x, z) {
  const pes = groundHeightAt(colliders, x, z, 0.1, 0);
  return !collides(colliders, x, z, pes, PLAYER.HEIGHT);
}

const posto = (owner, phase = 'parada') => ({
  x: 0, z: 0, flags: [{ owner, phase }]
});

const paciente = (health = 100) => ({
  alive: true, health, maxHealth: 100
});

export function run() {
  suite('a regra: de quem é a tenda');

  const meu = { x: 0, z: 0, post: posto('karnia'), team: null };
  const dele = { x: 0, z: 0, post: posto('vestria'), team: null };
  const disputado = { x: 0, z: 0, post: posto('karnia', 'arriando'), team: null };
  const base = { x: 0, z: 0, post: null, team: 'karnia' };

  ok('posto dominado trata quem domina', atende(meu, 'karnia'));
  ok('e não trata o inimigo', !atende(meu, 'vestria'));
  ok('posto do outro não trata', !atende(dele, 'karnia'));
  // Mesma regra do suprimento e do nascimento: não basta ser dono, tem que
  // estar em paz. Curar o defensor dentro do ponto que ele está perdendo
  // faria negar o ponto deixar de negar coisa alguma.
  ok('posto EM DISPUTA não trata ninguém', !atende(disputado, 'karnia'));
  ok('base é sempre de quem é', atende(base, 'karnia'));

  suite('o raio é da tenda, e não passa da lona');

  const zonas = [{ x: 40, z: 0, post: posto('karnia'), team: null }];
  ok('dentro da tenda trata', Boolean(enfermariaEm(zonas, 'karnia', 40, 1)));
  ok('encostado do lado de fora não',
    !enfermariaEm(zonas, 'karnia', 40 + TRATAMENTO.RAIO + 0.5, 0),
    `${(TRATAMENTO.RAIO + 0.5).toFixed(1)} m do centro`);
  // Se o raio passasse da lona, trataria quem está atirando de fora dela e o
  // objeto viraria enfeite de um bônus de área.
  const meiaDiagonal = Math.hypot(ENFERMARIA.LARGURA / 2, ENFERMARIA.FUNDO / 2);
  ok('a zona cabe dentro do pano', TRATAMENTO.RAIO <= meiaDiagonal,
    `raio ${TRATAMENTO.RAIO} m contra ${meiaDiagonal.toFixed(2)} m de meia-diagonal`);
  ok('e a busca no mapa não tem raio',
    enfermariaMaisPerto(zonas, 'karnia', 900, 900) === zonas[0]);

  suite('curar custa segundos');

  const ferido1 = paciente(1);
  let quadros = 0;
  while (ferido1.health < 100 && quadros < 60 * 60) {
    tratar(ferido1, TRATAMENTO.POR_SEGUNDO * DT);
    quadros++;
  }
  const segundos = quadros * DT;
  between('do quase-morto ao cheio', segundos, 7.5, 8.5, `${segundos.toFixed(2)} s`);
  // Medido nesta base: a 16 m, parado e sem revidar, o jogador morre em 2,9 s.
  // Curar tem que custar MAIS que morrer, senão a tenda vira o lugar de onde
  // se briga; e mais que reabastecer, porque bala é consumível e vida é você.
  ok('curar é mais lento que morrer', segundos > 2.9);
  ok('e mais lento que encher a munição',
    segundos > 1 / SUPRIMENTO.POR_SEGUNDO,
    `${segundos.toFixed(1)} s contra ${(1 / SUPRIMENTO.POR_SEGUNDO).toFixed(1)} s`);
  near('e para no cheio', ferido1.health, 100, 0.001);
  eq('cheio não recebe mais nada', tratar(paciente(100), 0.5), 0);
  eq('morto não é tratado',
    tratar({ alive: false, health: 10, maxHealth: 100 }, 0.5), 0);

  suite('a lona não é escudo: levar tiro interrompe');

  eq('sob fogo não entra vida',
    tratar(paciente(50), 0.5, TRATAMENTO.ESPERA_APOS_DANO - 0.1), 0);
  ok('e depois da espera entra',
    tratar(paciente(50), 0.5, TRATAMENTO.ESPERA_APOS_DANO + 0.1) > 0);

  const dentro = [{ x: 0, z: 0, post: posto('karnia'), team: null }];
  const enfermaria = criarTratamento(dentro);
  const alvo = paciente(40);
  const pos = { x: 0, z: 0, teamId: 'karnia', alvo };

  for (let i = 0; i < 30; i++) enfermaria.atender(DT, pos);
  const antes = alvo.health;
  ok('parado na tenda a vida sobe', antes > 40, `${antes.toFixed(1)} de vida`);

  alvo.health -= 12;                       // levou tiro dentro da tenda
  const feridoEm = alvo.health;
  for (let i = 0; i < 60; i++) enfermaria.atender(DT, pos);
  near('no segundo seguinte ao tiro, nada entra', alvo.health, feridoEm, 0.001);
  for (let i = 0; i < 120; i++) enfermaria.atender(DT, pos);
  ok('passada a espera, o tratamento volta', alvo.health > feridoEm + 1,
    `${alvo.health.toFixed(1)} de vida`);

  suite('ir buscar e SAIR: os dois limiares não são o mesmo');

  // A armadilha do `secou`, de novo: `ferido` deixa de valer no primeiro ponto
  // que entra. Quem usasse ele pra decidir quando PARAR largaria a maca com
  // 66% e voltaria ferido no primeiro contato — a viagem inteira por nada.
  ok('FERIDO_ABAIXO é menor que SAIR_ACIMA',
    TRATAMENTO.FERIDO_ABAIXO < TRATAMENTO.SAIR_ACIMA);
  const meio = paciente(100 * (TRATAMENTO.FERIDO_ABAIXO + 0.01));
  ok('acima do limiar ele não vai buscar', !ferido(meio));
  ok('mas também não está tratado', !tratado(meio),
    'é essa faixa que a trava do cérebro cobre');
  ok('abaixo do limiar, vai buscar', ferido(paciente(20)));
  ok('e no cheio está tratado', tratado(paciente(100)));

  suite('o bot ferido recua pra tenda, e só sai bom');

  const cenaB = new THREE.Scene();
  const colsB = new ListaDeColisores();
  const bot = createSoldier(cenaB, colsB, {
    id: 1, team: 'karnia', x: 0, z: 0, terrain: chao,
    weapons: [
      { id: 'mp40', name: 'MP40', firearm: { damage: 24, range: 95, magazine: 32, fireInterval: 0.12 }, ammo: { loaded: 32, reserve: 96 } },
      { id: 'kabar', name: 'Faca', melee: {} }
    ]
  });
  const postoB = { x: 0, z: 0, flags: [{ owner: 'karnia', phase: 'parada' }] };
  const tenda = { x: 20, z: 0, post: postoB, team: null };
  const cerebro = createBrain(bot, {
    colliders: colsB, outposts: [postoB], enfermarias: [tenda], terrain: chao
  }, () => 0.5);
  const passo = () => cerebro.update(DT, {
    inimigos: [], temLinha: () => true, atirar: () => {}, capturar: () => false
  });

  bot.health = 30;
  passo();
  eq('ferido e sem inimigo à vista, ele vai se tratar', cerebro.state, 'tratando');
  const partiuDe = bot.x;
  for (let i = 0; i < 120; i++) passo();
  ok('e anda na direção da tenda', bot.x > partiuDe + 3,
    `${(bot.x - partiuDe).toFixed(1)} m em 2 s`);

  let quadrosB = 0;
  while (bot.health < 70 && quadrosB < 60 * 40) { passo(); quadrosB++; }
  ok('chegando lá, a vida sobe', bot.health >= 70,
    `${(quadrosB * DT).toFixed(1)} s de viagem mais tratamento`);
  // A armadilha do `secou` na vida: com 70 de 100 ele já não está `ferido`, e
  // sem a trava largaria a maca aqui pra voltar ferido no primeiro contato.
  eq('mas ele NÃO larga a maca aos 70', cerebro.state, 'tratando');

  while (bot.health < 96 && quadrosB < 60 * 60) { passo(); quadrosB++; }
  passo();
  ok('tratado, ele volta pra briga', cerebro.state !== 'tratando',
    `estado "${cerebro.state}" com ${bot.health.toFixed(0)} de vida`);

  suite('a tenda é oca, e a porta é vão de verdade');

  const cena = new THREE.Scene();
  const colliders = new ListaDeColisores();
  addEnfermaria(cena, colliders, { x: 0, z: 0, quarto: 0, terrain: chao });
  const E = ENFERMARIA;

  ok('dá pra ficar de pé lá dentro', cabe(colliders, 0, -0.2));
  ok('e a porta deixa passar', cabe(colliders, 0, E.FUNDO / 2));
  ok('a lateral barra', !cabe(colliders, E.LARGURA / 2, 0));
  ok('o fundo barra', !cabe(colliders, 0, -E.FUNDO / 2));
  ok('e a aba do lado da porta barra',
    !cabe(colliders, (E.PORTA + (E.LARGURA - E.PORTA) / 2) / 2, E.FUNDO / 2));
  // A porta sobe até o teto de propósito: sem verga não há altura de vão pra
  // soleira enterrada comer, que é o que deixou a porta dos fundos de uma casa
  // desenhada e intransponível.
  const vergas = colliders.filter((c) => c.box.min.y > PLAYER.HEIGHT);
  eq('e não há verga sobre ela', vergas.length, 0);
  note('colisores de uma tenda', `${colliders.length}`);

  // Girar não pode fechar a porta. O `quarto` existe pro autor do mapa virar
  // a entrada pro lado de quem defende, e um erro de sinal ali entrega uma
  // tenda que não se entra — sem erro nenhum no console.
  const cena2 = new THREE.Scene();
  const c2 = new ListaDeColisores();
  addEnfermaria(cena2, c2, { x: 0, z: 0, quarto: 1, terrain: chao });
  ok('girada 90°, a porta continua sendo porta', cabe(c2, E.FUNDO / 2, 0));
  ok('e a lateral continua barrando', !cabe(c2, 0, E.LARGURA / 2));

  suite('a lona barra o corpo, não a bala');

  // Trecho curto e dentro de uma célula só do índice espacial: `aoLongoDe`
  // devolve os candidatos por célula, e um probe de doze metros atravessando
  // fronteira de célula passaria verde por outro motivo — sem provar nada
  // sobre a lona. Aqui o tiro nasce DENTRO da tenda e sai pelo fundo.
  const ballistics = createBallistics(cena, colliders);
  const de = new THREE.Vector3(0, 1.2, -1);
  const para = new THREE.Vector3(0, 1.2, -6);
  ok('atirar de dentro pra fora atravessa o pano',
    !ballistics.blocked(de, para));
  // E o engradado NÃO atravessa: caixote de madeira cheio de latão é a única
  // cobertura baixa que a logística oferece, e é o contraste que ensina a
  // diferença entre os dois objetos.
  const cena3 = new THREE.Scene();
  const c3 = new ListaDeColisores();
  addEnfermaria(cena3, c3, { x: 0, z: 0, quarto: 0, terrain: chao });
  ok('nenhum colisor de tenda para bala',
    c3.filter((c) => c.balaPassa).length === c3.length,
    `${c3.filter((c) => c.balaPassa).length} de ${c3.length} colisores`);

  const cena4 = new THREE.Scene();
  const c4 = new ListaDeColisores();
  addPaiol(cena4, c4, { x: 0, z: -4, quarto: 0, terrain: chao });
  const tiroRasante = createBallistics(cena4, c4);
  // Mirado no engradado, e não na costura entre duas caixas: a pilha tem 6 cm
  // de folga entre as colunas, e um raio no eixo exato passa por ela.
  ok('o engradado do paiol PARA a bala',
    tiroRasante.blocked(
      new THREE.Vector3(0.4, 0.3, -2), new THREE.Vector3(0.4, 0.3, -6)),
    `${c4.length} colisores de paiol`);

  const cena5 = new THREE.Scene();
  const c5 = new ListaDeColisores();
  addLogistica(cena5, c5, { id: 'praia', x: 0, z: 0, terrain: chao, onde: 'medida' });
  note('colisores por lugar (tenda + paiol)', `${c5.length}`);

  suite('os seis pontos: tenda e paiol sem comer bandeira nem nascimento');

  for (const id of ['praia', 'colina', 'vila', 'fazenda', 'ponte', 'moinho']) {
    const cenaP = new THREE.Scene();
    const cols = new ListaDeColisores();
    // `construirLocal` ergue o cenário e DEPOIS a logística, e é ele que
    // estoura se a tenda cair dentro de uma casa. Chegar aqui já é metade da
    // prova; a outra metade é a bandeira e o nascimento continuarem livres.
    const local = construirLocal(cenaP, cols, { id, x: 0, z: 0, terrain: chao });

    ok(`${id}: a tenda existe`, Boolean(local?.enfermaria));
    ok(`${id}: a bandeira continua alcançável`, cabe(cols, 0, 0));
    ok(`${id}: e a zona de nascimento livre`, cabe(cols, 0, 7));
    ok(`${id}: dá pra ficar de pé na tenda`,
      cabe(cols, local.enfermaria.x, local.enfermaria.z - 0.2));

    // O engradado é o SINAL do raio que já existe, e sinal que fica fora da
    // zona mente. O raio continua sendo medido do MIOLO do posto: passá-lo a
    // medir da caixa criaria uma segunda fonte de verdade contra a qual o
    // `paiolMaisPerto` do bot (que mede até o posto) se separaria.
    const doPaiol = Math.hypot(local.paiol.x, local.paiol.z);
    ok(`${id}: o paiol fica dentro dos ${SUPRIMENTO.RAIO} m de suprimento`,
      doPaiol < SUPRIMENTO.RAIO, `${doPaiol.toFixed(1)} m do miolo`);
    note(`${id}: colisores do ponto`, `${cols.length}`);
  }
}
