import * as THREE from 'three';
import { addBox, material, sorteioFixo, BOX } from './props.js';
import { addCasa } from './casas.js';
import {
  assentar, duasAguas, paredeComVao, tambor,
  PEDRA, PEDRA_ESCURA, TELHA, MADEIRA, MADEIRA_ESCURA, TRIGO
} from './construcao.js';

/**
 * A Fazenda La Haye.
 *
 * O que ela faz com a briga é o TRIGO: alto o bastante pra esconder corpo
 * inteiro de quem se agacha, num ponto que fora dele é descrito como aberto.
 * Ele é cobertura visual e nada mais — atravessa-se andando e bala passa
 * reto, igual ao arbusto e pelo mesmo motivo. Um trigal que parasse tiro de
 * 7,92 leria como bug, e um que barrasse passagem viraria um muro amarelo.
 */

/**
 * Trigo: caixas altas e finas, instanciadas, SEM colisor.
 *
 * Igual ao arbusto e pelo mesmo motivo: é cobertura visual, não blindagem.
 * Atravessa-se andando e bala passa reto. Um trigal que parasse tiro de 7,92
 * leria como bug, e um que barrasse passagem viraria um muro amarelo.
 */
function trigal(scene, { x, z, raio, terrain, rng, quantos = 3600 }) {
  const geometry = BOX;
  const malha = new THREE.InstancedMesh(geometry, material(TRIGO), quantos);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const escala = new THREE.Vector3();
  const eixoY = new THREE.Vector3(0, 1, 0);

  let n = 0;
  let tentativas = 0;
  while (n < quantos && tentativas < quantos * 12) {
    tentativas++;
    const px = x + (rng() * 2 - 1) * raio;
    const pz = z + (rng() * 2 - 1) * raio;
    if (terrain.estradaAt(px, pz) > 0.1) continue;

    // Tufo estreito e ALTO. Com 0,7 a 1,2 m de lado, o trigo saía como uma
    // salada de caixotes amarelos com grama aparecendo no meio: o que faz um
    // trigal é a superfície contínua na altura do peito, não a peça.
    const alto = 1.5 + rng() * 0.35;
    position.set(px, terrain.heightAt(px, pz) + alto / 2 - 0.12, pz);
    quaternion.setFromAxisAngle(eixoY, rng() * Math.PI);
    escala.set(0.5 + rng() * 0.3, alto, 0.5 + rng() * 0.3);
    malha.setMatrixAt(n, matrix.compose(position, quaternion, escala));
    n++;
  }
  malha.count = n;
  malha.instanceMatrix.needsUpdate = true;
  scene.add(malha);
  return n;
}

/** Celeiro: casco de madeira, portão largo e telhado alto. */
function celeiro(scene, colliders, { x, z, terrain, settling }) {
  const W = 17;
  const D = 11;
  const H = 6.2;
  const { base } = assentar(terrain, x, z, 10);
  const y = base - 0.45;

  // Portão de celeiro é LARGO: 3,6 m passa carroça, e no jogo passa dois
  // homens lado a lado. É o que faz o celeiro ser um lugar de entrar brigando
  // em vez de um funil de um por vez.
  paredeComVao(scene, colliders, {
    settling, x, z: z + D / 2, y, largura: W, altura: H + 0.45, espessura: 0.4, soleira: 0.45,
    cor: MADEIRA, aoLongoDeX: true, vaoLargura: 3.6, vaoAltura: 4.2
  });
  paredeComVao(scene, colliders, {
    settling, x, z: z - D / 2, y, largura: W, altura: H + 0.45, espessura: 0.4, soleira: 0.45,
    cor: MADEIRA, aoLongoDeX: true, vaoLargura: 2.2, vaoAltura: 2.6
  });
  for (const lado of [-1, 1]) {
    addBox(scene, colliders, {
      settling, x: x + lado * W / 2, z, y, w: 0.4, h: H + 0.45, d: D,
      color: MADEIRA_ESCURA
    });
  }
  duasAguas(scene, colliders, {
    x, y: y + H + 0.45, z, w: W, d: D, altura: 4.4, cor: TELHA, aoLongoDeX: true
  });
}

export function addFazenda(scene, colliders, { x, z, terrain, settling = null }) {
  const rng = sorteioFixo(20250904);

  // Tudo afastado do miolo: os quatro mastros ficam num quadrado de 9 m no
  // centro do ponto e a zona de nascimento em (x, z+7). Construção em cima
  // deles faria o jogador nascer dentro de parede — `assertSpawnZones` estoura
  // na montagem se isso acontecer, mas é melhor não chegar lá.
  celeiro(scene, colliders, { x, z: z - 18, terrain, settling });
  addCasa(scene, colliders, {
    tipo: 'grande', x: x + 20, z: z + 6, giro: 1, terrain, settling
  });
  addCasa(scene, colliders, {
    tipo: 'pequena', x: x - 19, z: z + 14, giro: 0, terrain, settling
  });

  // Curral de pedra atrás do celeiro: cobertura baixa de verdade, que é o que
  // falta num ponto descrito como "aberto".
  const c = 13;
  for (const [dx, dz, w, d] of [
    [0, -c, 2 * c, 0.6], [-c, 0, 0.6, 2 * c], [c, 0, 0.6, 2 * c]
  ]) {
    const px = x - 26 + dx;
    const pz = z - 26 + dz;
    addBox(scene, colliders, {
      settling, x: px, z: pz, y: terrain.heightAt(px, pz) - 0.2,
      w, h: 1.25, d, color: rng() < 0.5 ? PEDRA : PEDRA_ESCURA
    });
  }

  for (let i = 0; i < 5; i++) {
    const px = x + 6 + rng() * 9;
    const pz = z + 15 + rng() * 7;
    tambor(scene, colliders, { x: px, z: pz, ground: terrain.heightAt(px, pz) });
  }

  // Dois talhões, um de cada lado do pátio: trigo em volta de tudo faria o
  // ponto inteiro ser cobertura, e ele existe pra ser o aberto do mapa.
  const trigo = trigal(scene, { x: x + 30, z: z - 34, raio: 26, terrain, rng })
    + trigal(scene, { x: x - 34, z: z - 6, raio: 22, terrain, rng, quantos: 2600 });

  return { trigo };
}
