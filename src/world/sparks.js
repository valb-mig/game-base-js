import * as THREE from 'three';

/**
 * Fagulhas de impacto: o que a bala levanta onde bate.
 *
 * É informação, não enfeite. Sem elas o tiro que erra por meio metro e o
 * tiro que acerta a parede atrás do alvo são a mesma coisa na tela — nada
 * acontece nos dois casos. A fagulha diz ONDE a bala foi parar, e é como o
 * jogador corrige a pontaria sem traçante.
 *
 * Um `Points` só, com o buffer inteiro alocado na montagem. Duas dezenas de
 * partículas por tiro numa briga de nove bots vira lixo por quadro se cada
 * impacto criar geometria — e o impacto acontece justamente no quadro mais
 * cheio, que é o do tiroteio.
 */

const MAX = 420;          // partículas simultâneas; acima disso o impacto é ignorado
const GRAVIDADE = 11;     // mais que a real: fagulha tem que morrer perto de onde nasceu
const TAMANHO = 0.055;

// O que a bala achou decide o que sobe. São os três casos que a balística
// sabe distinguir sem precisar conhecer material nenhum.
const TIPOS = {
  // parede, pedra, madeira: risco quente e rápido
  duro: { quantidade: 12, cor: [1, 0.72, 0.3], vida: 0.24, velocidade: 7, espalha: 0.5 },
  // terra: poeira baixa, escura, que fica um instante a mais no ar
  terra: { quantidade: 9, cor: [0.44, 0.34, 0.21], vida: 0.4, velocidade: 3, espalha: 0.85 },
  // gente: jorro curto, pra que acertar tenha resposta visual imediata
  corpo: { quantidade: 8, cor: [0.6, 0.05, 0.05], vida: 0.26, velocidade: 3.8, espalha: 0.7 }
};

export function createSparks(scene) {
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const velocities = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const total = new Float32Array(MAX);
  const base = new Float32Array(MAX * 3);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setDrawRange(0, 0);
  // A esfera de corte nasce vazia e as partículas andam: sem isto o Points
  // some do quadro assim que a fagulha sai do ponto onde o buffer foi criado.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);

  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    size: TAMANHO,
    vertexColors: true,
    // aditivo: a fagulha apaga escurecendo a cor, sem transparência por
    // partícula — que o PointsMaterial não tem sem shader próprio
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  }));
  points.frustumCulled = false;
  points.renderOrder = 2;
  scene.add(points);

  const espalhado = new THREE.Vector3();
  let ativos = 0;

  /** Tira a partícula da lista trocando com a última: sem buraco no buffer. */
  function remover(i) {
    ativos--;
    if (i === ativos) return;
    for (let e = 0; e < 3; e++) {
      positions[i * 3 + e] = positions[ativos * 3 + e];
      velocities[i * 3 + e] = velocities[ativos * 3 + e];
      base[i * 3 + e] = base[ativos * 3 + e];
    }
    life[i] = life[ativos];
    total[i] = total[ativos];
  }

  return {
    points,

    /**
     * Levanta fagulhas num ponto. `dir` é o rumo da BALA — as partículas
     * saem contra ele, que é pra onde a matéria vai quando algo é atingido.
     * Sem direção, elas sobem.
     */
    burst(point, dir = null, tipo = 'duro') {
      const receita = TIPOS[tipo] ?? TIPOS.duro;

      for (let n = 0; n < receita.quantidade; n++) {
        if (ativos >= MAX) return;   // cheio: impacto novo não rouba o antigo
        const i = ativos++;

        positions[i * 3] = point.x;
        positions[i * 3 + 1] = point.y;
        positions[i * 3 + 2] = point.z;

        espalhado.set(
          Math.random() * 2 - 1,
          Math.random() * 2 - 1,
          Math.random() * 2 - 1
        ).normalize().multiplyScalar(receita.espalha);

        if (dir) espalhado.addScaledVector(dir, -1);
        else espalhado.y += 1;
        espalhado.normalize().multiplyScalar(receita.velocidade * (0.4 + Math.random() * 0.6));

        velocities[i * 3] = espalhado.x;
        velocities[i * 3 + 1] = espalhado.y;
        velocities[i * 3 + 2] = espalhado.z;

        // brilho sorteado por partícula: um punhado igual lê como um borrão só
        const brilho = 0.7 + Math.random() * 0.5;
        base[i * 3] = receita.cor[0] * brilho;
        base[i * 3 + 1] = receita.cor[1] * brilho;
        base[i * 3 + 2] = receita.cor[2] * brilho;

        total[i] = receita.vida * (0.7 + Math.random() * 0.6);
        life[i] = total[i];
      }

      // Desenha já: quem chama `burst` não pode depender de o `update` vir
      // depois no mesmo quadro. A cor ainda é a do quadro anterior por um
      // frame, e a partícula nasce escura — por isso ela é escrita aqui.
      for (let i = 0; i < ativos; i++) {
        colors[i * 3] = base[i * 3];
        colors[i * 3 + 1] = base[i * 3 + 1];
        colors[i * 3 + 2] = base[i * 3 + 2];
      }
      geometry.setDrawRange(0, ativos);
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    },

    update(delta) {
      if (ativos === 0) {
        geometry.setDrawRange(0, 0);
        return;
      }

      for (let i = ativos - 1; i >= 0; i--) {
        life[i] -= delta;
        if (life[i] <= 0) {
          remover(i);
          continue;
        }

        velocities[i * 3 + 1] -= GRAVIDADE * delta;
        positions[i * 3] += velocities[i * 3] * delta;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * delta;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * delta;

        const resta = life[i] / total[i];
        colors[i * 3] = base[i * 3] * resta;
        colors[i * 3 + 1] = base[i * 3 + 1] * resta;
        colors[i * 3 + 2] = base[i * 3 + 2] * resta;
      }

      geometry.setDrawRange(0, ativos);
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    },

    get count() {
      return ativos;
    }
  };
}
