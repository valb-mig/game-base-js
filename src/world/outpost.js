import * as THREE from 'three';
import { addBox } from './props.js';
import { teamOf } from '../game/teams.js';

/**
 * Posto militar: quatro mastros num quadrado, cercados por sacos de areia.
 *
 * Quatro porque a captura é nas quatro — quem toma o posto teve que dar a
 * volta nele, e não ficar parado num canto seguro. Os mastros ficam nos
 * cantos justamente pra isso.
 *
 * O posto NÃO achata o terreno. Zona plana não pode se cruzar com outra, e
 * doze postos mais duas bases mais o campo de treino não cabem sem se
 * encostar — cada peça aqui lê a altura do chão onde ela cai.
 */

const LADO = 9;            // meia-diagonal do quadrado de mastros
const ALTURA_MASTRO = 4.6;
const PANO_ALTURA = 1.1;
const PANO_LARGURA = 1.8;

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
  id, name, x, z, team, terrain, settling = null
}) {
  const group = new THREE.Group();
  group.name = `posto-${id}`;
  scene.add(group);

  const cor = teamOf(team).color;
  const flags = [];

  // Mastros nos quatro cantos. Cada um assenta na altura do chão dele: sem
  // zona plana, o quadrado pode ficar torto, e é assim mesmo.
  const cantos = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [dx, dz] of cantos) {
    const px = x + dx * LADO * 0.5;
    const pz = z + dz * LADO * 0.5;
    const chao = terrain.heightAt(px, pz);

    const mastro = new THREE.Mesh(MASTRO, MADEIRA);
    mastro.position.set(px, chao + ALTURA_MASTRO / 2, pz);
    group.add(mastro);

    // Virada pra fora do posto, e pendurada do lado DELA, não do X do mundo:
    // com o pano girado, deslocar em X fazia a bandeira de cada canto sair
    // pra um lado diferente do próprio mastro.
    const giro = Math.atan2(dx, dz);
    const braco = PANO_LARGURA / 2 + 0.08;

    const pano = new THREE.Mesh(PANO, material(cor));
    pano.position.set(
      px + Math.cos(giro) * braco, chao + TOPO, pz - Math.sin(giro) * braco);
    pano.rotation.y = giro;
    group.add(pano);

    flags.push({
      x: px,
      z: pz,
      y: chao + 1.2,      // altura do PUNHO de quem mexe, não do pano
      base: chao,
      owner: team,
      byTeam: null,
      phase: 'parada',
      progress: 0,
      cloth: pano
    });
  }

  // Cerca de sacos de areia: três lados, deixando uma entrada. Ela existe
  // pra dar cobertura a quem defende, e é por isso que o posto vale terreno.
  const saco = 0xa08a5e;
  const meio = LADO * 0.5 + 1.6;
  const paredes = [
    { ax: 0, az: -meio, w: LADO + 3.4, d: 0.7 },
    { ax: -meio, az: 0, w: 0.7, d: LADO + 3.4 },
    { ax: meio, az: 0, w: 0.7, d: LADO + 3.4 }
  ];
  for (const parede of paredes) {
    const px = x + parede.ax;
    const pz = z + parede.az;
    addBox(scene, colliders, {
      settling, x: px, z: pz, y: terrain.heightAt(px, pz) - 0.1,
      w: parede.w, h: 1.05, d: parede.d, color: saco
    });
  }

  return {
    id,
    name,
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
