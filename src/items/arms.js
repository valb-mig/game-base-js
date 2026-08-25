import * as THREE from 'three';
import { TEAMS, PLAYER_TEAM } from '../game/teams.js';

/**
 * Os braços do jogador, na cena do viewmodel.
 *
 * Eles NÃO entram no grupo do item. O ombro é fixo no espaço da câmera —
 * é onde o ombro de alguém está — e a MÃO é que persegue um marcador do
 * modelo da arma. Assim mirar, recarregar, correr, tomar coice e balançar
 * a mão mexem no braço de graça, sem nenhum deles saber que braço existe.
 *
 * O contrário — pendurar o braço no grupo do item — daria braço rígido:
 * a arma desceria na recarga levando o ombro junto, e o ombro do jogador
 * não desce quando ele troca de carregador.
 *
 * A pose sai de IK de dois ossos. Com a arma a 29 cm do olho e o braço
 * medindo 54, não existe pose "esticada": o cotovelo fica dobrado o tempo
 * todo, e é a dobra que faz o braço parecer braço em vez de vara.
 */

const BRACO = 0.30;      // ombro ao cotovelo
const ANTEBRACO = 0.28;  // cotovelo ao punho
const GROSSURA = 0.05;

/**
 * Quanto o braço aceita esticar além do próprio comprimento.
 *
 * A mira de ferro segura a arma a 44 cm do olho, e isso não é escolha
 * estética: mais perto o ferrolho fica mais largo na tela que o alvo. Só que
 * daí o punho fica a 73 cm do ombro, e braço nenhum tem isso. Sem esticar,
 * a IK trunca a distância e a mão desgruda da arma — que é o pior dos dois,
 * porque uma arma flutuando lê como bug e um braço comprido não lê como nada.
 */
const ESTICA_MAX = 1.6;

/** Onde o ombro fica, em espaço de câmera. Atrás e abaixo do olho. */
const OMBRO = {
  dir: [0.16, -0.33, 0.19],
  esq: [-0.16, -0.31, 0.19]
};

/**
 * Pra onde o cotovelo cai. Ele é o grau de liberdade que a IK não resolve:
 * dois pontos e dois comprimentos deixam o cotovelo livre num círculo, e
 * sem escolher o lado ele oscila e o braço vira. Pra fora e pra baixo é
 * como se segura arma de ombro.
 */
const COTOVELO = {
  dir: [0.75, -0.65, 0.1],
  esq: [-0.75, -0.6, 0.1]
};

const PELE = 0x9a7355;

function osso(comprimento, material, grossura) {
  // Modelado no +Z, começando na junta. `Object3D.lookAt` aponta o +Z do
  // objeto pro alvo — só câmera e luz olham pelo -Z. Feito no -Z, o braço
  // apontava pro lado oposto da mão, atrás da câmera, e sumia da tela.
  const geo = new THREE.BoxGeometry(grossura, grossura, comprimento);
  geo.translate(0, 0, comprimento / 2);
  return new THREE.Mesh(geo, material);
}

/**
 * Um braço: duas juntas que giram e duas malhas que esticam.
 *
 * Junta e malha são objetos SEPARADOS de propósito. Com a malha fazendo as
 * duas coisas, esticar o braço escalava também o filho — o antebraço já
 * girado —, e escala em eixo de pai girado é cisalhamento: o braço entortava
 * em vez de crescer.
 */
class Braco {
  constructor(lado, materialFarda, materialPele) {
    this.ombro = new THREE.Object3D();
    this.ombro.position.fromArray(OMBRO[lado]);

    this.malhaSuperior = osso(BRACO, materialFarda, GROSSURA);
    this.ombro.add(this.malhaSuperior);

    this.cotovelo = new THREE.Object3D();
    this.ombro.add(this.cotovelo);

    this.malhaInferior = osso(ANTEBRACO, materialFarda, GROSSURA * 0.86);
    this.cotovelo.add(this.malhaInferior);

    this.mao = new THREE.Mesh(
      new THREE.BoxGeometry(0.046, 0.05, 0.076),
      materialPele
    );
    this.cotovelo.add(this.mao);

    this.polo = new THREE.Vector3().fromArray(COTOVELO[lado]).normalize();
    this.paraAlvo = new THREE.Vector3();
    this.pontoCotovelo = new THREE.Vector3();
    this.eixo = new THREE.Vector3();
  }

  get visible() {
    return this.ombro.visible;
  }

  set visible(v) {
    this.ombro.visible = v;
  }

  /** Aponta o braço pra um alvo em espaço de câmera. */
  mirar(alvo) {
    this.paraAlvo.copy(alvo).sub(this.ombro.position);
    const d = this.paraAlvo.length();
    if (d < 1e-4) return;

    // Estica os dois ossos na mesma proporção quando o alvo está longe.
    // Encolher a distância seria mais barato e desgruda a mão da arma.
    const estica = Math.min(ESTICA_MAX, Math.max(1, d / (BRACO + ANTEBRACO) + 0.02));
    const a = BRACO * estica;
    const b = ANTEBRACO * estica;
    const alcance = Math.min(d, (a + b) * 0.999);

    this.malhaSuperior.scale.z = estica;
    this.malhaInferior.scale.z = estica;
    this.cotovelo.position.set(0, 0, a);
    // Centrada NO alvo, não além dele: o marcador do modelo diz onde está a
    // palma, e a IK põe o punho ali. Empurrar a malha pra frente do punho
    // deixava a mão 2,7 cm adiante da arma em todo item — sempre o mesmo
    // número, que é como se descobre que o erro é de montagem e não de pose.
    this.mao.position.set(0, -0.006, b);

    // Lei dos cossenos: onde o cotovelo cai ao longo da linha ombro→mão, e
    // a que distância dela.
    const x = (alcance * alcance + a * a - b * b) / (2 * alcance);
    const h = Math.sqrt(Math.max(0, a * a - x * x));

    this.paraAlvo.divideScalar(d);

    // Componente do polo perpendicular à linha: é a direção pra onde o
    // cotovelo sai. Se o polo for paralelo à linha não sobra nada, e aí
    // qualquer perpendicular serve.
    this.eixo.copy(this.polo).addScaledVector(this.paraAlvo, -this.polo.dot(this.paraAlvo));
    if (this.eixo.lengthSq() < 1e-8) this.eixo.set(0, -1, 0).cross(this.paraAlvo);
    this.eixo.normalize();

    this.pontoCotovelo.copy(this.ombro.position)
      .addScaledVector(this.paraAlvo, x)
      .addScaledVector(this.eixo, h);

    // `lookAt` quer o alvo em MUNDO, e a cena do viewmodel É o espaço da
    // câmera: a câmera dele nunca sai da origem nem gira. Então os pontos,
    // calculados em espaço de câmera, já servem como estão.
    this.ombro.lookAt(this.pontoCotovelo);

    // O cotovelo é filho do ombro, e o `lookAt` dele precisa da matriz do
    // ombro DESTE quadro — senão ele mira com a pose do quadro anterior e a
    // mão só alcança a arma com um frame de atraso.
    this.ombro.updateMatrixWorld(true);
    this.cotovelo.lookAt(alvo);
  }
}

/**
 * Cria o par de braços. `farda` sai do time: o jogador vê a própria manga,
 * e a manga dele não pode ser a do inimigo.
 */
export function criarBracos(scene, teamId = PLAYER_TEAM) {
  const time = TEAMS[teamId] ?? TEAMS[PLAYER_TEAM];

  const materialFarda = new THREE.MeshLambertMaterial({
    color: time.uniforme, flatShading: true
  });
  const materialPele = new THREE.MeshLambertMaterial({
    color: PELE, flatShading: true
  });

  const dir = new Braco('dir', materialFarda, materialPele);
  const esq = new Braco('esq', materialFarda, materialPele);
  scene.add(dir.ombro, esq.ombro);

  const ponto = new THREE.Vector3();

  return {
    dir, esq,
    materiais: [materialFarda, materialPele],

    /**
     * Põe cada mão no marcador que o modelo do item declarar. Sem marcador,
     * o braço some: é melhor não ter braço que ter braço apontando pra
     * lugar nenhum, e item de uma mão só (pistola, faca) é caso normal.
     */
    seguir(item) {
      for (const [nome, braco] of [['mao_dir', dir], ['mao_esq', esq]]) {
        const marcador = item?.getObjectByName(nome);
        if (!marcador) { braco.visible = false; continue; }
        braco.visible = true;
        marcador.getWorldPosition(ponto);
        braco.mirar(ponto);
      }
    },

    set visible(v) {
      dir.visible = v;
      esq.visible = v;
    }
  };
}
