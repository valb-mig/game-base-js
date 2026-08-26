import * as THREE from 'three';
import { construirLocal } from './locais.js';
import { teamOf } from '../game/teams.js';

/**
 * Ponto de captura: UM mastro no meio do lugar.
 *
 * Eram quatro num quadrado, e a ideia era obrigar quem toma o posto a dar a
 * volta nele em vez de ficar parado num canto seguro. Numa partida de
 * trezentos soldados isso deixou de ser uma manobra e virou aritmética: com
 * gente sobrando, as quatro caem quase juntas e os dois minutos de trabalho
 * só somam espera. Com uma bandeira o posto troca de mão quando alguém
 * SEGURA o terreno, que é o que se queria desde o começo.
 *
 * A regra de dono continua a mesma e continua geral: dono é quem tem TODAS as
 * bandeiras do posto. `teams.js` nunca soube quantas são.
 *
 * O posto NÃO achata o terreno. Zona plana não pode se cruzar com outra, e
 * doze postos mais duas bases mais o campo de treino não cabem sem se
 * encostar — cada peça aqui lê a altura do chão onde ela cai.
 */

// Meia-diagonal do quadrado que os construtores de `locais.js` deixam livre.
// Não são mais mastros, mas continua sendo o miolo do ponto: é onde fica a
// bandeira e é por onde se nasce.
const LADO = 9;

// Mastro único e ALTO: ele é a marca do ponto no horizonte, e a bandeira
// subindo ou descendo é o que conta de longe o que está acontecendo ali.
const ALTURA_MASTRO = 7.4;
const PANO_ALTURA = 1.7;
const PANO_LARGURA = 2.8;

// A bandeira arriada não desce até o chão: ela para no meio do mastro, que é
// onde o olho percebe "está sendo trocada" a distância.
const TOPO = ALTURA_MASTRO - PANO_ALTURA * 0.6;
const MEIO = ALTURA_MASTRO * 0.42;

const MASTRO = new THREE.CylinderGeometry(0.07, 0.09, ALTURA_MASTRO, 6);
const PANO = new THREE.PlaneGeometry(PANO_LARGURA, PANO_ALTURA);

function material(color) {
  return new THREE.MeshLambertMaterial({
    color, emissive: 0x0a0a0a, flatShading: true, side: THREE.DoubleSide
  });
}

const MADEIRA = new THREE.MeshLambertMaterial({
  color: 0x6b5b45, emissive: 0x090807, flatShading: true
});

/**
 * Cria um posto e devolve o dado que a captura usa.
 *
 * O objeto devolvido é de dados: `flags` tem posição, dono e fase. Quem
 * desenha lê `cloth`, e quem decide a partida não precisa saber que existe
 * malha nenhuma.
 */
export function createOutpost(scene, colliders, {
  id, name, numero = 0, nota = '', x, z, team, terrain, settling = null
}) {
  const group = new THREE.Group();
  group.name = `posto-${id}`;
  scene.add(group);

  const cor = teamOf(team).color;
  const flags = [];

  // O mastro no meio do ponto. Assenta na altura do chão dele: sem zona plana
  // o terreno é o que é, e é assim mesmo.
  const chao = terrain.heightAt(x, z);

  const mastro = new THREE.Mesh(MASTRO, MADEIRA);
  mastro.position.set(x, chao + ALTURA_MASTRO / 2, z);
  group.add(mastro);

  // O pano pendura do lado do mastro, e é de dupla face: uma bandeira só tem
  // que ser lida de qualquer direção, e não só de fora do quadrado.
  const pano = new THREE.Mesh(PANO, material(cor));
  pano.position.set(x + PANO_LARGURA / 2 + 0.08, chao + TOPO, z);
  group.add(pano);

  flags.push({
    x,
    z,
    y: chao + 1.2,      // altura do PUNHO de quem mexe, não do pano
    base: chao,
    owner: team,
    byTeam: null,
    phase: 'parada',
    progress: 0,
    cloth: pano
  });

  // O cenário do ponto. Antes aqui havia uma cerca de sacos de areia igual em
  // todos os seis, e era a única coisa construída em cada um: os pontos só se
  // distinguiam pelo terreno em volta. Hoje cada um é um LUGAR — praia
  // invadida, bunker de encosta, vila, fazenda, guarnição de ponte, moinho —
  // e é a construção que decide como se briga ali.
  //
  // Os mastros continuam sendo os mesmos quatro em todos, porque a captura é
  // a mesma regra em todo lugar. Quem constrói respeita o quadrado do meio.
  const local = construirLocal(scene, colliders, {
    id, x, z, terrain, settling
  });

  return {
    local,
    id,
    name,
    // Número da ordem e o que torna este ponto difícil. Vêm da tabela do mapa
    // e seguem até a tela: o painel diz "3. Vila Central — urbano".
    numero,
    nota,
    x,
    z,
    group,
    flags,
    /** Time que começou dono. Só serve pra montar o mapa e pro placar inicial. */
    startTeam: team
  };
}

/**
 * Põe as bandeiras onde o estado da captura diz.
 *
 * Roda todo quadro, e não só na mudança: a bandeira desliza durante os trinta
 * segundos, e é esse movimento que conta pro jogador o que está acontecendo
 * de longe, sem HUD nenhum.
 */
export function drawFlags(posts) {
  for (const post of posts) {
    for (const flag of post.flags) {
      const pano = flag.cloth;

      if (flag.phase === 'parada') {
        pano.visible = Boolean(flag.owner);
        pano.position.y = flag.base + TOPO;
        if (flag.owner) pano.material.color.setHex(teamOf(flag.owner).color);
        continue;
      }

      // Arriando: desce do topo até o meio, ainda na cor de quem era.
      // Içando: sobe do meio até o topo, já na cor de quem está tomando.
      const subindo = flag.phase === 'icando';
      const t = Math.min(1, Math.max(0, flag.progress));
      pano.visible = true;
      pano.position.y = flag.base + (subindo
        ? MEIO + (TOPO - MEIO) * t
        : TOPO - (TOPO - MEIO) * t);

      const cor = subindo ? flag.byTeam : flag.owner;
      if (cor) pano.material.color.setHex(teamOf(cor).color);
    }
  }
}
