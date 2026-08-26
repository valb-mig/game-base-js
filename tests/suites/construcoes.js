import * as THREE from 'three';
import { addCasa, TIPOS } from '../../src/world/casas.js';
import { addFazenda } from '../../src/world/fazenda.js';
import { ListaDeColisores } from '../../src/world/colisores.js';
import { collides, groundHeightAt } from '../../src/player/collision.js';
import { PLAYER } from '../../src/config.js';
import { suite, ok, eq, note } from '../assert.js';

/**
 * As construções dos pontos de captura.
 *
 * O que se testa é a única coisa que uma casa precisa fazer pro jogo: dar pra
 * ENTRAR nela. Uma casa maciça é só um obstáculo caro, e o que faz a Vila
 * Central ser combate urbano é o vão da porta ser vão de verdade. Isso não se
 * vê numa captura de tela — a porta desenhada e a porta atravessável são a
 * mesma imagem.
 *
 * Terreno plano de mentira: a casa é corpo rígido e assenta na altura da
 * pegada, então o que se mede aqui é a geometria dela, não o relevo.
 */
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

export function run() {
  suite('casa é oca, e a porta é vão de verdade');

  const cena = new THREE.Scene();
  const colliders = new ListaDeColisores();
  const casa = addCasa(cena, colliders, { tipo: 'media', x: 0, z: 0, terrain: chao });
  const t = TIPOS.media;

  ok('a parede da frente barra', !cabe(colliders, -t.largura * 0.35, t.fundo / 2),
    `em (${(-t.largura * 0.35).toFixed(1)}, ${(t.fundo / 2).toFixed(1)})`);
  ok('mas a porta deixa passar', cabe(colliders, t.largura * 0.16, t.fundo / 2),
    'no eixo do vão');
  ok('e dá pra ficar de pé lá dentro', cabe(colliders, 0, 0));

  // Duas saídas, e não é enfeite: casa de uma porta só é beco, e a segunda
  // linha de tiro é o que faz valer a pena entrar numa em vez de contorná-la.
  //
  // A porta dos fundos tinha 1,90 m declarados e 0,35 de soleira enterrada:
  // sobravam 1,55 de vão livre contra 1,70 de jogador, e ela estava desenhada
  // sem dar passagem. Foi este teste que pegou.
  ok('o fundo também tem vão', cabe(colliders, -t.largura * 0.2, -t.fundo / 2));

  // Janela tem PEITORIL: bala passa, corpo não. Sem ele a casa com quatro
  // janelas vira uma casa com quatro portas, e o interior deixa de ser um
  // lugar em que se está pra virar um corredor com telhado.
  ok('a janela lateral não é porta', !cabe(colliders, t.largura / 2, 0),
    'peitoril barra quem tenta entrar por ela');

  // O telhado tem colisor, mas ele fica ACIMA da cabeça: se ele descesse até
  // a faixa do corpo, a casa inteira viraria um bloco maciço com portas
  // desenhadas — que é exatamente o bug que este teste existe pra pegar.
  const teto = colliders.filter((c) => c.box.min.y > PLAYER.HEIGHT);
  ok('o telhado é colisor, e fica acima da cabeça', teto.length > 0,
    `${teto.length} caixa(s) começando acima de ${PLAYER.HEIGHT} m`);

  note('pegada', `${casa.largura.toFixed(1)} x ${casa.fundo.toFixed(1)} m, ` +
    `${casa.altura.toFixed(1)} m de altura`);

  suite('meia-volta troca largura por profundidade, sem sobra');

  // Casa só gira 0° ou 90° porque a colisão só entende AABB: a 30° a caixa
  // envolvente ficaria muito maior que o corpo e viraria parede invisível no
  // meio da rua. Girada de meia-volta ela continua exata, e o teste prova
  // isso comparando as duas pegadas com a MALHA, não com a fórmula.
  const medir = (giro) => {
    const c = new THREE.Scene();
    addCasa(c, new ListaDeColisores(), { tipo: 'grande', x: 0, z: 0, giro, terrain: chao });
    return new THREE.Box3().setFromObject(c).getSize(new THREE.Vector3());
  };
  const reta = medir(0);
  const virada = medir(1);
  ok('a largura de uma é a profundidade da outra',
    Math.abs(reta.x - virada.z) < 0.2 && Math.abs(reta.z - virada.x) < 0.2,
    `${reta.x.toFixed(1)}x${reta.z.toFixed(1)} contra ${virada.x.toFixed(1)}x${virada.z.toFixed(1)}`);
  ok('e a altura não muda', Math.abs(reta.y - virada.y) < 0.05);

  suite('trigo é cobertura visual, não blindagem');

  // Mesma regra do arbusto: atravessa-se andando e bala passa reto. Trigal
  // que barrasse passagem viraria um muro amarelo, e um que parasse tiro de
  // 7,92 leria como bug.
  const campo = new THREE.Scene();
  const daFazenda = new ListaDeColisores();
  const antes = daFazenda.length;
  const { trigo } = addFazenda(campo, daFazenda, { x: 0, z: 0, terrain: chao });

  ok('nasceu trigo', trigo > 2000, `${trigo} tufos`);
  ok('e nenhum deles virou colisor', daFazenda.length - antes < 200,
    `${daFazenda.length - antes} colisores pra ${trigo} tufos`);
  note('fazenda', `${daFazenda.length} colisores no total`);
}
