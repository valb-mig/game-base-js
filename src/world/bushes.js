import * as THREE from 'three';
import { WORLD } from '../config.js';
import { espalhar, material, BOX } from './props.js';
import { GRAMA } from './ground.js';

/**
 * Arbustos: a única vegetação que quebra.
 *
 * Nascem só em grama, porque é isso que grama significa neste mapa — areia é
 * deserta e barranco é pelado. São cobertura VISUAL, não blindagem: não têm
 * colisor (atravessa-se andando) e não param bala. Quem se esconde atrás de
 * um continua escondido até alguém atirar no mato, e aí o mato vem abaixo e
 * ele fica exposto. Folha parando tiro de 7,92 leria como bug.
 *
 * Um arbusto é um CONJUNTO de blocos, não um bloco com escala variável: o
 * grande é um bloco alto com dois baixos encostados, e é o agrupamento que
 * dá silhueta de mato em vez de caixote com salada por cima.
 */

/**
 * As três variações. `raio` é a pegada, usada tanto pra afastar um arbusto do
 * outro quanto pro teste de acerto — não é a soma dos blocos por preguiça: é
 * o corpo que o mato ocupa, e um pouco de folha fora dele não muda o jogo.
 */
const FORMAS = [
  {
    nome: 'pequeno', peso: 0.44, raio: 0.75,
    blocos: [{ dx: 0, dz: 0, w: 1.05, h: 0.62, d: 0.95, escuro: false }]
  },
  {
    nome: 'medio', peso: 0.36, raio: 1.15,
    blocos: [
      { dx: 0, dz: 0, w: 1.35, h: 1.02, d: 1.2, escuro: false },
      { dx: 0.88, dz: 0.3, w: 0.82, h: 0.6, d: 0.78, escuro: true }
    ]
  },
  {
    nome: 'grande', peso: 0.2, raio: 1.75,
    blocos: [
      { dx: 0, dz: 0, w: 1.7, h: 1.38, d: 1.5, escuro: false },
      { dx: -1.16, dz: 0.26, w: 0.9, h: 0.72, d: 0.86, escuro: true },
      { dx: 1.12, dz: -0.3, w: 0.96, h: 0.78, d: 0.9, escuro: true }
    ]
  }
];

const TEMPO_QUEBRA = 0.26;   // segundos entre o acerto e o mato ter sumido
const ENTERRA = 0.1;         // quanto o bloco afunda, pra não sobrar vão em ladeira

/**
 * Lado da célula do índice espacial, em metros.
 *
 * Sem índice, cada bala testaria os 1600 arbustos por quadro — com quarenta
 * balas no ar isso é 64 mil testes pra nada, já que uma bala percorre 4,2 m
 * por quadro e olha três células. Com 50 m sobra pouco mais de um arbusto por
 * célula, e a lista fica minúscula.
 */
const CELULA = 50;

export function addBushes(scene, { heightAt, tipoAt, blocked, rng, aoQuebrar = null }) {
  const pontos = espalhar(WORLD.BUSH_COUNT,
    { heightAt, tipoAt, tipos: [GRAMA], blocked, rng });

  // Sorteia a forma antes de alocar: a capacidade de cada InstancedMesh é o
  // número exato de blocos daquela cor, e ele só existe depois do sorteio.
  const total = FORMAS.reduce((soma, forma) => soma + forma.peso, 0);
  const arbustos = pontos.map((ponto) => {
    let sorte = ponto.rng * total;
    const forma = FORMAS.find((f) => (sorte -= f.peso) <= 0) ?? FORMAS[0];
    return {
      x: ponto.x, z: ponto.z, y: ponto.y,
      forma,
      raio: forma.raio,
      alto: Math.max(...forma.blocos.map((b) => b.h)),
      giro: rng() * Math.PI * 2,
      vivo: true,
      blocos: [],
      quebra: 0
    };
  });

  const claros = arbustos.reduce(
    (n, a) => n + a.forma.blocos.filter((b) => !b.escuro).length, 0);
  const escuros = arbustos.reduce(
    (n, a) => n + a.forma.blocos.filter((b) => b.escuro).length, 0);

  const folha = new THREE.InstancedMesh(BOX, material(WORLD.BUSH_COLOR), claros);
  const sombra = new THREE.InstancedMesh(BOX, material(WORLD.BUSH_COLOR_DARK), escuros);

  const matriz = new THREE.Matrix4();
  const posicao = new THREE.Vector3();
  const giro = new THREE.Quaternion();
  const tamanho = new THREE.Vector3();
  const EIXO_Y = new THREE.Vector3(0, 1, 0);

  /** Escreve a matriz de um bloco, encolhido por `resto` (1 inteiro, 0 sumido). */
  function desenhar(bloco, resto) {
    posicao.set(bloco.px, bloco.py - (1 - resto) * bloco.h * 0.5, bloco.pz);
    giro.setFromAxisAngle(EIXO_Y, bloco.giro);
    tamanho.set(bloco.w * resto, bloco.h * resto, bloco.d * resto);
    bloco.mesh.setMatrixAt(bloco.index, matriz.compose(posicao, giro, tamanho));
  }

  let proximoClaro = 0;
  let proximoEscuro = 0;

  for (const arbusto of arbustos) {
    const sen = Math.sin(arbusto.giro);
    const cos = Math.cos(arbusto.giro);

    for (const molde of arbusto.forma.blocos) {
      const x = arbusto.x + molde.dx * cos - molde.dz * sen;
      const z = arbusto.z + molde.dx * sen + molde.dz * cos;
      // altura do chão sob CADA bloco: os laterais de um arbusto grande ficam
      // mais de um metro do centro, e em ladeira isso é meio palmo de vão
      const chao = heightAt(x, z);

      const bloco = {
        mesh: molde.escuro ? sombra : folha,
        index: molde.escuro ? proximoEscuro++ : proximoClaro++,
        px: x, py: chao + molde.h * 0.5 - ENTERRA, pz: z,
        w: molde.w, h: molde.h, d: molde.d,
        giro: arbusto.giro + (molde.dx === 0 ? 0 : molde.dx * 0.35)
      };
      arbusto.blocos.push(bloco);
      desenhar(bloco, 1);
    }
  }

  for (const mesh of [folha, sombra]) {
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }

  // ------------------------------------------------------- índice espacial
  const celulas = new Map();
  const chave = (x, z) => `${Math.floor(x / CELULA)}:${Math.floor(z / CELULA)}`;
  for (const arbusto of arbustos) {
    const k = chave(arbusto.x, arbusto.z);
    if (!celulas.has(k)) celulas.set(k, []);
    celulas.get(k).push(arbusto);
  }

  /** Chama `visitar` em cada arbusto vivo cujo centro cai na área dada. */
  function porArea(minX, minZ, maxX, maxZ, visitar) {
    const de = Math.floor((minX - CELULA) / CELULA);
    const ate = Math.floor((maxX + CELULA) / CELULA);
    const deZ = Math.floor((minZ - CELULA) / CELULA);
    const ateZ = Math.floor((maxZ + CELULA) / CELULA);

    for (let cz = deZ; cz <= ateZ; cz++) {
      for (let cx = de; cx <= ate; cx++) {
        const lista = celulas.get(`${cx}:${cz}`);
        if (!lista) continue;
        for (const arbusto of lista) if (arbusto.vivo) visitar(arbusto);
      }
    }
  }

  const caindo = [];

  function quebrar(arbusto) {
    arbusto.vivo = false;
    arbusto.quebra = 0;
    caindo.push(arbusto);
    aoQuebrar?.(arbusto);
  }

  const passo = new THREE.Vector3();
  const aoCentro = new THREE.Vector3();
  const perto = new THREE.Vector3();

  return {
    count: arbustos.length,

    // Exposto pra quem precisa olhar o mapa montado: a suíte confere que a
    // raia de tiro do campo de treino ficou limpa, e isso não se prova de
    // fora sem saber onde cada arbusto caiu.
    arbustos,
    emPe: () => arbustos.reduce((n, a) => n + (a.vivo ? 1 : 0), 0),
    formas: FORMAS.map((f) => ({
      nome: f.nome,
      quantos: arbustos.filter((a) => a.forma === f).length
    })),

    /**
     * Derruba o mato que o trecho `de`→`para` atravessa. Devolve quantos
     * caíram. Serve pra bala e pra lâmina: os dois são um segmento curto, e o
     * que muda é só a folga.
     *
     * O teste é o TRECHO, não o ponto final: a 253 m/s a bala anda 4,2 m por
     * quadro, e olhar só onde ela parou a faria passar por dentro do arbusto
     * sem tocá-lo — o mesmo motivo pelo qual a balística testa segmento.
     */
    slash(de, para, folga = 0) {
      passo.copy(para).sub(de);
      const comprimento2 = passo.lengthSq();
      let derrubados = 0;

      porArea(
        Math.min(de.x, para.x), Math.min(de.z, para.z),
        Math.max(de.x, para.x), Math.max(de.z, para.z),
        (arbusto) => {
          const alcance = arbusto.raio + folga;
          aoCentro.set(arbusto.x, arbusto.y + arbusto.alto * 0.5, arbusto.z);

          const t = comprimento2 < 1e-12 ? 0 : THREE.MathUtils.clamp(
            perto.copy(aoCentro).sub(de).dot(passo) / comprimento2, 0, 1);
          perto.copy(de).addScaledVector(passo, t);

          if (perto.distanceTo(aoCentro) > alcance) return;
          // A esfera é larga o bastante pra cobrir a pegada, e por isso sobe
          // mais que o mato: sem este corte, tiro passando um metro acima de
          // um arbusto de 60 cm o derrubava.
          if (perto.y > arbusto.y + arbusto.alto + folga) return;

          quebrar(arbusto);
          derrubados++;
        }
      );
      return derrubados;
    },

    /**
     * Arbusto descalçado vem abaixo, não tomba: raiz de fora é arbusto morto,
     * e é o que dá pra prometer sem dono duplo da matriz da instância — quem
     * está caindo é o único a escrever nela.
     */
    disturb(x, z, raio) {
      let derrubados = 0;
      porArea(x - raio, z - raio, x + raio, z + raio, (arbusto) => {
        if (Math.hypot(arbusto.x - x, arbusto.z - z) > raio + arbusto.raio) return;
        if (heightAt(arbusto.x, arbusto.z) > arbusto.y - 0.06) return;
        quebrar(arbusto);
        derrubados++;
      });
      return derrubados;
    },

    /** Só o que está caindo custa alguma coisa; mato parado custa zero. */
    update(delta) {
      if (caindo.length === 0) return;

      for (let i = caindo.length - 1; i >= 0; i--) {
        const arbusto = caindo[i];
        arbusto.quebra += delta / TEMPO_QUEBRA;
        const resto = Math.max(0, 1 - arbusto.quebra);

        for (const bloco of arbusto.blocos) desenhar(bloco, resto);
        if (resto <= 0) caindo.splice(i, 1);
      }
      folha.instanceMatrix.needsUpdate = true;
      sombra.instanceMatrix.needsUpdate = true;
    }
  };
}
