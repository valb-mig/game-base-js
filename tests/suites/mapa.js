import {
  MAX, marcar, desmarcar, alternar, todas, limpar, dentroDoMapa
} from '../../src/ui/marcacoes.js';
import { progressoDePosto } from '../../src/ui/simbolos.js';
import { WORLD } from '../../src/config.js';
import { suite, ok, eq, note } from '../assert.js';

/**
 * As marcações do mapa grande.
 *
 * Só dado — o desenho é canvas e canvas em headless não tem tamanho. O que
 * se prova aqui é a regra: quantas cabem, o que o clique faz, e onde ele não
 * faz nada.
 */
export function run() {
  suite('marcar e desmarcar é o MESMO clique');

  limpar();
  const posta = alternar(100, 200, 40);
  eq('clique em terreno limpo põe marca', posta.acao, 'pos');
  eq('e ela entra na lista', todas().length, 1);

  const tirada = alternar(108, 205, 40);
  eq('clique em cima dela tira', tirada.acao, 'tirou');
  eq('e a lista esvazia', todas().length, 0);

  // Um botão separado pra remover seria mais uma tecla pra decorar num jogo
  // que já tem oito.
  marcar(0, 0);
  eq('longe da marca, o clique põe outra', alternar(300, 300, 40).acao, 'pos');
  eq('agora são duas', todas().length, 2);

  suite('poucas de propósito');

  limpar();
  for (let i = 0; i < MAX + 3; i++) marcar(i * 100, 0);
  eq(`o teto são ${MAX}`, todas().length, MAX);

  // Marca demais é o mesmo que nenhuma: quem põe a quinta está dizendo que
  // ela importa mais que a primeira, então é a primeira que sai.
  eq('e quem sai é a mais VELHA', todas()[0].x, 300);
  eq('a mais nova fica', todas()[MAX - 1].x, (MAX + 2) * 100);

  suite('fora da ilha não se marca');

  ok('o centro do mapa é marcável', dentroDoMapa(0, 0));
  ok('a beira da ilha também', dentroDoMapa(WORLD.ISLAND_RADIUS - 5, 0));

  // O canvas é retangular e a ilha é redonda: sem isto o jogador marca o mar
  // aberto, e a marca aponta pra um lugar aonde ele não pode ir.
  ok('o mar aberto não', !dentroDoMapa(WORLD.ISLAND_RADIUS + 30, 0));
  ok('nem o canto do quadrado',
    !dentroDoMapa(WORLD.SIZE / 2 - 10, WORLD.SIZE / 2 - 10));

  note('teto de marcações', `${MAX} · raio da ilha ${WORLD.ISLAND_RADIUS} m`);

  suite('o anel de progresso conta a captura inteira');

  const posto = (fase, progresso, quem = 'vestria') => ({
    numero: 3,
    flags: [{
      owner: 'karnia', byTeam: quem, phase: fase, progress: progresso,
      x: 0, z: 0, y: 1.2, base: 0
    }]
  });

  eq('posto parado não tem anel', progressoDePosto(posto('parada', 0)).fracao, 0);
  ok('e não está em disputa', !progressoDePosto(posto('parada', 0)).emDisputa);

  // A troca tem duas metades: a bandeira antiga desce até o meio do mastro, e
  // só então a nova sobe. Mostrar as duas como barras separadas faria o anel
  // voltar a zero no meio da captura, e quem olhasse acharia que alguém
  // tinha revertido.
  eq('arriando pela metade é um quarto do anel',
    progressoDePosto(posto('arriando', 0.5)).fracao, 0.25);
  eq('arriando no fim é METADE do anel',
    progressoDePosto(posto('arriando', 1)).fracao, 0.5);
  eq('içando começa da metade, não do zero',
    progressoDePosto(posto('icando', 0)).fracao, 0.5);
  eq('e içando no fim fecha o anel',
    progressoDePosto(posto('icando', 1)).fracao, 1);

  ok('o anel é da cor de quem está TOMANDO, não de quem era',
    progressoDePosto(posto('icando', 0.4)).porTime === 'vestria');
  ok('e o posto conta como em disputa',
    progressoDePosto(posto('arriando', 0.2)).emDisputa);

  // A suíte compartilha o módulo com quem vier depois: quem sujou, limpa.
  limpar();
  eq('e o módulo fica como estava', todas().length, 0);
  eq('desmarcar em lista vazia não estoura', desmarcar(0, 0, 40), null);
}
