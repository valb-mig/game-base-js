import * as THREE from 'three';
import { NOMES, OSSOS } from './esqueleto.js';

/**
 * A camada entre os OSSOS do modelo e quem quer mexer neles.
 *
 * Dois fregueses, e é por isso que ela existe: a animação, que gira osso por
 * osso a partir de uma pose escrita, e o ragdoll, que só sabe onde cada junta
 * foi parar e precisa que os ossos apontem pra lá. Sem esta camada as duas
 * coisas mexeriam em `rotation` direto e brigariam pela mesma propriedade.
 *
 * As malhas do modelo são PARENTEADAS aos ossos, não deformadas por eles
 * (ver bots/model.js): girar um osso leva a peça inteira junto. É o que
 * permite posar e ragdollar sem skinning nenhum.
 *
 * O repouso NÃO é a T-pose: é a pose em que o soldado está quando o rig é
 * criado — de arma na mão. É dela que a animação parte e é contra ela que o
 * ragdoll mede o desvio, porque é ela que está na tela.
 */

// Osso → junta pra onde ele aponta. Sai de OSSOS, tirando as ligações que
// existem pra dar forma mas não mandam em osso nenhum: o peito não pode
// apontar pro ombro esquerdo E pro direito, e o quadril não aponta pra coxa.
const SEM_MIRA = new Set(['chest>shoulder_L', 'chest>shoulder_R', 'hips>thigh_L', 'hips>thigh_R']);
const MIRAS = OSSOS.filter(([a, b]) => !SEM_MIRA.has(`${a}>${b}`));

/**
 * Juntas que recebem POSIÇÃO do solver, e não só orientação.
 *
 * São as que nenhum osso mira: o peito aponta pro pescoço, então ombro
 * esquerdo e direito iriam de carona na orientação dele, e o quadril aponta
 * pro tronco, deixando as duas coxas na mesma situação. Medido antes de
 * corrigir, o osso pousava a 40 cm da junta que a física tinha resolvido —
 * o corpo caía com os braços e as pernas noutro lugar.
 */
const SOLTAS = new Set(['hips', 'shoulder_L', 'shoulder_R', 'thigh_L', 'thigh_R']);

/**
 * Referência de TORÇÃO por osso: o par de juntas cujo vetor diz pra onde é o
 * "lado" daquele osso.
 *
 * Sem isso a orientação sai de uma rotação MÍNIMA, que não define giro em
 * torno do próprio osso — e o osso escolhe uma torção qualquer. Num braço não
 * se nota; num capacete sim: o corpo deitava com o capacete de pé, apoiado na
 * aba, e o que se via era uma placa em vez de uma cabeça.
 *
 * A segunda referência é o desempate: quando a primeira fica paralela ao
 * osso o produto vetorial degenera, e aí é ela que resolve. Braço apontado
 * pro lado é exatamente esse caso, e é a pose em que o corpo cai.
 */
const LADOS = {
  torso: [['shoulder_L', 'shoulder_R'], ['hips', 'chest']],
  membro: [['hips', 'chest'], ['shoulder_L', 'shoulder_R']]
};
const REFERENCIA = {
  hips: 'torso', spine: 'torso', chest: 'torso', neck: 'torso',
  shoulder_L: 'membro', shoulder_R: 'membro',
  elbow_L: 'membro', elbow_R: 'membro',
  thigh_L: 'torso', thigh_R: 'torso',
  knee_L: 'torso', knee_R: 'torso'
};

const rumo = new THREE.Vector3();
const alvo = new THREE.Vector3();
const daJunta = new THREE.Vector3();
const doFilho = new THREE.Vector3();
const giro = new THREE.Quaternion();
const doPai = new THREE.Quaternion();
const mundo = new THREE.Quaternion();
const local = new THREE.Vector3();
const euler = new THREE.Euler();
const eixoA = new THREE.Vector3();
const eixoB = new THREE.Vector3();
const direita = new THREE.Vector3();
const cima = new THREE.Vector3();
const baseAgora = new THREE.Matrix4();
const baseRepouso = new THREE.Matrix4();
const daBase = new THREE.Quaternion();

/**
 * Base ortonormal a partir da direção do osso e de uma referência de lado.
 *
 * Devolve false quando as duas ficam paralelas demais pra dar um lado — quem
 * chama tenta a referência seguinte.
 */
function base(saida, frente, referencia) {
  direita.copy(referencia).cross(frente);
  if (direita.lengthSq() < 0.02) return false;
  direita.normalize();
  cima.copy(frente).cross(direita).normalize();
  saida.makeBasis(direita, cima, frente);
  return true;
}

/**
 * Escolhe a referência de lado que ainda dá base pra este osso AGORA, e
 * escreve a base atual em `baseAgora`.
 *
 * Devolve o índice da referência usada, ou -1 quando nenhuma serve — osso
 * apontado bem na direção das duas, que é raro e não vale um terceiro eixo.
 */
function ladoUtil(solver, mira, rumoAtual) {
  for (let i = 0; i < mira.lados.length; i++) {
    if (!mira.repousoBase[i]) continue;
    const [a, b] = mira.lados[i];
    if (!solver.posicaoDe(a, eixoB) || !solver.posicaoDe(b, eixoA)) continue;
    eixoA.sub(eixoB).normalize();
    if (base(baseAgora, rumoAtual, eixoA)) return i;
  }
  return -1;
}

export function criarRig(raiz) {
  const ossos = new Map();
  for (const nome of NOMES) {
    const osso = raiz.getObjectByName(nome);
    if (osso) ossos.set(nome, osso);
  }
  if (!ossos.has('hips')) return null;   // modelo sem esqueleto: não há rig

  raiz.updateMatrixWorld(true);

  // Repouso: a rotação local de cada osso e a orientação de mundo dele agora.
  // A de mundo é o que o ragdoll usa — o desvio é medido entre a direção de
  // repouso e a direção de agora, as duas em mundo.
  const repouso = new Map();
  for (const [nome, osso] of ossos) {
    repouso.set(nome, {
      local: osso.quaternion.clone(),
      mundo: osso.getWorldQuaternion(new THREE.Quaternion()),
      posicao: osso.position.clone()
    });
  }

  // Direção de repouso de cada osso que mira em outro, em MUNDO.
  const miras = [];
  for (const [nome, filho] of MIRAS) {
    const osso = ossos.get(nome);
    const outro = ossos.get(filho);
    if (!osso || !outro) continue;
    const direcao = outro.getWorldPosition(new THREE.Vector3())
      .sub(osso.getWorldPosition(new THREE.Vector3()));
    if (direcao.lengthSq() < 1e-10) continue;

    const lados = LADOS[REFERENCIA[nome] ?? 'torso'];
    direcao.normalize();

    // Uma base de repouso por referência, medida dos PRÓPRIOS ossos na pose
    // em que o rig nasceu. É contra ela que a torção de agora é comparada, e
    // por isso as duas têm que sair da mesma fonte.
    const repousoBase = lados.map(([a, b]) => {
      const de = ossos.get(a);
      const para = ossos.get(b);
      if (!de || !para) return null;
      const referencia = para.getWorldPosition(new THREE.Vector3())
        .sub(de.getWorldPosition(new THREE.Vector3()));
      if (referencia.lengthSq() < 1e-10) return null;
      // Guardada como quaternion INVERTIDO: é o que a aplicação multiplica,
      // e converter matriz por quadro seria trabalho repetido à toa.
      if (!base(baseRepouso, direcao, referencia.normalize())) return null;
      return new THREE.Quaternion().setFromRotationMatrix(baseRepouso).invert();
    });

    miras.push({ nome, filho, osso, direcao: direcao.clone(), lados, repousoBase });
  }
  const porOsso = new Map(miras.map((m) => [m.nome, m]));

  const rig = {
    raiz,
    ossos,

    /**
     * Onde está cada junta agora, no sistema do soldado (pé no zero).
     *
     * É daqui que o ragdoll tira os comprimentos de osso: medidos da pose que
     * está NA TELA, não de uma tabela. Tabela desalinha na primeira vez que
     * o modelo ou a pose mudam, e quem descobre é o jogador vendo o corpo
     * esticar ao cair.
     */
    medirJuntas() {
      raiz.updateMatrixWorld(true);
      raiz.getWorldPosition(alvo);   // os pés
      const saida = {};
      for (const [nome, osso] of ossos) {
        osso.getWorldPosition(local).sub(alvo);
        // Em METROS de mundo, não no espaço local da raiz: a raiz carrega a
        // escala do arquivo (1,80 m de modelo em 1,75 m de jogo), e medir
        // dentro dela devolveria um esqueleto do tamanho do arquivo pra
        // simular um corpo do tamanho do jogo.
        saida[nome] = [local.x, local.y, local.z];
      }
      return saida;
    },

    /** Devolve todo osso à pose de repouso. */
    repousar() {
      for (const [nome, osso] of ossos) {
        osso.quaternion.copy(repouso.get(nome).local);
        osso.position.copy(repouso.get(nome).posicao);
      }
    },

    /**
     * Aplica uma pose: `{ osso: [x, y, z] }` em radianos, SOMADO ao repouso.
     *
     * Somado e não absoluto pra que uma animação possa ser escrita como "o
     * quanto isto se afasta de como o soldado está parado" — que é o que se
     * consegue enxergar ao ajustar número.
     */
    aplicarPose(pose, peso = 1) {
      for (const [nome, angulos] of Object.entries(pose)) {
        const osso = ossos.get(nome);
        if (!osso) continue;
        euler.set(angulos[0] * peso, angulos[1] * peso, angulos[2] * peso);
        giro.setFromEuler(euler);
        osso.quaternion.copy(repouso.get(nome).local).multiply(giro);
      }
    },

    /**
     * Põe os ossos onde o ragdoll disse que as juntas estão.
     *
     * Osso por osso, PAI PRIMEIRO: a orientação de cada um é resolvida em
     * mundo e depois convertida pro local do pai, e o pai precisa já estar no
     * lugar quando o filho pergunta. `MIRAS` está nessa ordem.
     *
     * O quadril é o único que também recebe POSIÇÃO — os outros herdam a
     * dele pela hierarquia, e o comprimento de osso quem garante é o solver.
     */
    aplicarRagdoll(solver) {
      if (!solver.posicaoDe('hips', daJunta)) return;

      // Osso por osso, na ordem da tabela — que é pai antes de filho. Cada um
      // é resolvido em MUNDO e convertido pro local do pai, e o pai precisa
      // já estar no lugar quando o filho pergunta onde ele está.
      for (const nome of NOMES) {
        const osso = ossos.get(nome);
        if (!osso) continue;

        if (SOLTAS.has(nome) && solver.posicaoDe(nome, daJunta)) {
          osso.parent.updateWorldMatrix(true, false);
          local.copy(daJunta);
          osso.parent.worldToLocal(local);
          osso.position.copy(local);
        }

        const mira = porOsso.get(nome);
        if (!mira) continue;

        solver.posicaoDe(mira.nome, daJunta);
        solver.posicaoDe(mira.filho, doFilho);
        rumo.copy(doFilho).sub(daJunta);
        if (rumo.lengthSq() < 1e-10) continue;
        rumo.normalize();

        // Base ortonormal em vez de rotação mínima: a mínima não define a
        // TORÇÃO em torno do próprio osso, e o osso escolhia uma qualquer.
        // Com o lado do corpo como referência, o capacete deitado deita.
        const qual = ladoUtil(solver, mira, rumo);
        if (qual >= 0) {
          daBase.setFromRotationMatrix(baseAgora)
            .multiply(mira.repousoBase[qual]);
          mundo.copy(daBase).multiply(repouso.get(nome).mundo);
        } else {
          // sem lado utilizável, o mínimo ainda é melhor que nada
          giro.setFromUnitVectors(mira.direcao, rumo);
          mundo.copy(giro).multiply(repouso.get(nome).mundo);
        }

        osso.parent.updateWorldMatrix(true, false);
        osso.parent.getWorldQuaternion(doPai);
        osso.quaternion.copy(doPai.invert()).multiply(mundo);
        osso.updateWorldMatrix(false, false);
      }
      raiz.updateMatrixWorld(true);
    },

    /** Direção de repouso de um osso, em mundo. Só o teste usa. */
    rumoDeRepouso(nome) {
      const mira = miras.find((m) => m.nome === nome);
      return mira ? alvo.copy(mira.direcao) : null;
    }
  };

  return rig;
}
