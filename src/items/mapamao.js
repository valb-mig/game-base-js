import * as THREE from 'three';

/**
 * O mapa NA MÃO: uma folha de papel que o soldado levanta na frente do rosto.
 *
 * Ele vive na cena do viewmodel, que É o espaço da câmera — a mesma cena da
 * arma e das mãos. É isso que faz o papel nunca atravessar parede, nunca
 * escurecer com o sol do mapa às costas, e ter o tamanho na tela desacoplado
 * do FOV do jogo.
 *
 * A textura é o desenho de `ui/mapadesenho.js`. O material é BASIC de
 * propósito: papel iluminado por uma cúpula de dia encoberto perde justamente
 * o contraste das curvas de nível, e o que se quer aqui é LER.
 */

/** Lado do papel, em metros. */
const LADO = 0.25;

/** A que distância do olho ele para. Ver o cálculo no comentário abaixo. */
const PERTO = -0.46;

/**
 * A distância e o tamanho saem do CANTO, não do centro — e a primeira tentativa
 * errou exatamente aí.
 *
 * Com 0,30 m de lado a 0,44 m, o cálculo pelo centro dizia 88% da altura do
 * quadro e a captura mostrava o papel saindo pela borda de baixo: a inclinação
 * traz a aresta inferior PARA PERTO do olho (z −0,416 em vez de −0,44), e ali
 * ela subtende 23,2° contra os 21° de meio-quadro do viewmodel. Medido de
 * novo pelo canto: 0,25 m a 0,46 m com 0,12 rad de caimento põe as duas
 * arestas em 15,6° e 14,6°, e o papel ocupa uns 72% da altura — que é a folha
 * inteira na tela, com as mãos aparecendo por baixo.
 */
const GUARDADO = { y: -0.34, z: -0.34, rx: -1.15 };
const ABERTO = { y: 0, z: PERTO, rx: -0.12 };

const raio = new THREE.Raycaster();
const ndc = new THREE.Vector2();

/**
 * O carimbo, em frações do tempo total: a mão larga a borda e vai até o
 * ponto, encosta, e volta pra segurar o papel.
 *
 * Ele é uma LINHA DO TEMPO e não um evento, como o golpe e a pazada: a marca
 * só entra no papel no quadro que cruza `MARCA`, que é onde o polegar encosta.
 * Marcar no clique e animar depois seria a mão carimbando um lugar que já
 * estava marcado.
 */
const CARIMBO = {
  DURACAO: 0.44,
  CHEGADA: 0.42,   // até aqui a mão viaja da borda até acima do ponto
  MARCA: 0.52,     // aqui o polegar encosta no papel — é quando a marca entra
  SAIDA: 0.62,     // daqui ela levanta e volta pra borda
  ALTURA: 0.055    // quanto a mão fica ACIMA do papel no meio do trajeto
};

export function criarMapaNaMao(desenho) {
  const grupo = new THREE.Group();
  grupo.visible = false;

  const textura = new THREE.CanvasTexture(desenho.canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  // O papel é lido de perto e quase de frente: anisotropia não muda nada aqui,
  // e mipmap borraria a curva de nível fina. Linear puro.
  textura.minFilter = THREE.LinearFilter;
  textura.generateMipmaps = false;

  const papel = new THREE.Mesh(
    new THREE.PlaneGeometry(LADO, LADO),
    new THREE.MeshBasicMaterial({ map: textura })
  );
  papel.name = 'papel';
  grupo.add(papel);

  // O verso, um milímetro atrás: sem ele, olhar o papel de esguelha mostra o
  // mundo através dele, e uma folha translúcida lê como bug.
  const verso = new THREE.Mesh(
    new THREE.PlaneGeometry(LADO * 1.02, LADO * 1.02),
    new THREE.MeshBasicMaterial({ color: 0x8b7c5c, side: THREE.BackSide })
  );
  verso.position.z = -0.002;
  grupo.add(verso);

  /**
   * Onde as mãos agarram. São filhos do grupo, então elas seguem o papel
   * enquanto ele sobe — nenhuma linha diz "levante as mãos junto".
   *
   * Elas ficam nas LATERAIS e não nos cantos de baixo, e isso foi medido numa
   * captura: agarrando o canto inferior direito, a mão tapava exatamente a
   * rosa dos ventos. Um elemento do desenho que só aparece quando ninguém
   * segura o papel não existe.
   */
  const maoEsq = new THREE.Object3D();
  maoEsq.position.set(-LADO * 0.52, -LADO * 0.16, 0.014);
  grupo.add(maoEsq);

  const maoDir = new THREE.Object3D();
  maoDir.position.set(LADO * 0.52, -LADO * 0.16, 0.014);
  grupo.add(maoDir);

  let abertura = 0;

  // O carimbo em andamento. `aoTocar` é chamado UMA vez, no quadro em que o
  // polegar encosta — quem marca o waypoint é ele.
  const carimbo = { ativo: false, t: 0, x: 0, y: 0, aoTocar: null, tocou: false };

  const pontoEsq = new THREE.Vector3();
  const pontoDir = new THREE.Vector3();

  // Onde a mão direita descansa quando não está carimbando.
  const pouso = maoDir.position.clone();

  function pose() {
    const k = abertura * abertura * (3 - 2 * abertura);
    grupo.position.set(
      0,
      THREE.MathUtils.lerp(GUARDADO.y, ABERTO.y, k),
      THREE.MathUtils.lerp(GUARDADO.z, ABERTO.z, k)
    );
    grupo.rotation.set(THREE.MathUtils.lerp(GUARDADO.rx, ABERTO.rx, k), 0, 0);
    grupo.updateMatrixWorld(true);
  }

  /**
   * A mão direita durante o carimbo.
   *
   * O trajeto tem três trechos e uma altura: ela sai da borda e voa até
   * ACIMA do ponto (`CHEGADA`), desce e encosta (`MARCA`), e volta (`SAIDA`).
   * A altura existe pra que ela passe POR CIMA do papel em vez de arrastar o
   * dedo por ele — sem ela, carimbar o outro canto varre a folha inteira.
   */
  function moverMaoDireita(delta) {
    if (!carimbo.ativo) {
      maoDir.position.copy(pouso);
      return;
    }

    carimbo.t += delta / CARIMBO.DURACAO;

    if (!carimbo.tocou && carimbo.t >= CARIMBO.MARCA) {
      carimbo.tocou = true;
      carimbo.aoTocar?.();
    }

    if (carimbo.t >= 1) {
      carimbo.ativo = false;
      carimbo.aoTocar = null;
      maoDir.position.copy(pouso);
      return;
    }

    const t = carimbo.t;
    // Ida e volta compartilham o mesmo par de pontos; o que muda é o sentido.
    const indo = t < CARIMBO.SAIDA;
    const trecho = indo
      ? Math.min(1, t / CARIMBO.CHEGADA)
      : Math.min(1, 1 - (t - CARIMBO.SAIDA) / (1 - CARIMBO.SAIDA));
    const k = trecho * trecho * (3 - 2 * trecho);

    // O afastamento do papel é um sino: máximo no meio do voo, zero na borda
    // e zero no toque.
    const encostado = t >= CARIMBO.CHEGADA && t <= CARIMBO.SAIDA;
    const alto = encostado ? 0 : Math.sin(Math.PI * k) * CARIMBO.ALTURA;

    maoDir.position.set(
      THREE.MathUtils.lerp(pouso.x, carimbo.x, k),
      THREE.MathUtils.lerp(pouso.y, carimbo.y, k),
      THREE.MathUtils.lerp(pouso.z, 0.008, k) + alto
    );
  }

  pose();

  return {
    grupo,
    textura,
    /** O desenho por trás da textura: quem quiser converter papel -> mundo. */
    desenho,

    /** Sobe ou desce o papel. Devolve se ele já saiu de cena por completo. */
    animar(delta, querendo, velocidade = 7) {
      const alvo = querendo ? 1 : 0;
      abertura += (alvo - abertura) * Math.min(1, velocidade * delta);
      if (Math.abs(alvo - abertura) < 0.004) abertura = alvo;
      grupo.visible = abertura > 0.001;
      if (grupo.visible) {
        pose();
        // O carimbo DEPOIS da pose: ele escreve num marcador que é filho do
        // grupo, e `pose` acabou de recalcular a matriz do grupo. Na ordem
        // inversa a mão ficaria um quadro atrás do papel, que é o mesmo
        // tropeço do marcador da arma no viewmodel.
        moverMaoDireita(delta);
        grupo.updateMatrixWorld(true);
      }
      return abertura <= 0.001;
    },

    get abertura() {
      return abertura;
    },

    /**
     * Onde as duas mãos têm que estar, já no espaço da câmera.
     *
     * A esquerda segura sempre. A direita larga a borda pra carimbar e volta
     * sozinha — e como o marcador é FILHO do papel, ela acompanha a folha
     * subindo e descendo sem uma linha dizendo isso.
     */
    maos() {
      maoEsq.getWorldPosition(pontoEsq);
      maoDir.getWorldPosition(pontoDir);
      return { esq: pontoEsq, dir: pontoDir };
    },

    /** Está carimbando agora? Enquanto estiver, um clique novo é ignorado. */
    get carimbando() {
      return carimbo.ativo;
    },

    /**
     * A mão direita vai carimbar (u, v) do papel.
     *
     * `aoTocar` roda no quadro em que ela encosta, e não agora: é o mesmo
     * desenho do golpe (`MELEE.DAMAGE_AT`) e da pazada (`digAt`), e é o que
     * faz a marca aparecer junto com o gesto em vez de antes dele.
     */
    carimbar(u, v, aoTocar = null) {
      if (carimbo.ativo) return false;
      carimbo.ativo = true;
      carimbo.t = 0;
      carimbo.tocou = false;
      carimbo.aoTocar = aoTocar;
      // UV do papel -> posição local. O V do desenho cresce PRA BAIXO (o norte
      // é o topo) e o Y do plano cresce pra cima: é o complemento.
      carimbo.x = (u - 0.5) * LADO;
      carimbo.y = (0.5 - v) * LADO;
      return true;
    },

    /** Redesenha a folha. Não é de graça: são 90 mil pixels por chamada. */
    redesenhar(tempo) {
      desenho.desenhar(tempo);
      textura.needsUpdate = true;
    },

    /**
     * Onde o PONTEIRO do mouse está pousado no papel, em fração 0..1, ou null
     * se ele não está no papel.
     *
     * Com o mapa aberto o ponteiro é solto — marcar ponto é apontar e clicar,
     * como em qualquer mapa —, então quem responde não é o centro da tela e
     * sim a posição do cursor. `ndcX`/`ndcY` são coordenadas de recorte
     * (−1..1, com o Y pra cima), que é o que o raycaster espera.
     *
     * A câmera é a DO VIEWMODEL, não a do jogo: o papel é desenhado por ela,
     * com 42° contra os 70° do mundo. Usar a do jogo daria um ponto do papel
     * diferente do que está debaixo do cursor, e o erro cresceria pra beirada
     * da tela — exatamente onde ninguém desconfiaria.
     */
    sobPonteiro(ndcX, ndcY, camera) {
      if (abertura < 0.6) return null;
      grupo.updateMatrixWorld(true);
      raio.setFromCamera(ndc.set(ndcX, ndcY), camera);
      const [acerto] = raio.intersectObject(papel, false);
      if (!acerto?.uv) return null;
      // O UV do plano tem o V crescendo pra CIMA e o mapa tem o norte no topo:
      // a fração vertical do desenho é o complemento.
      return { u: acerto.uv.x, v: 1 - acerto.uv.y };
    },

    dispose() {
      papel.geometry.dispose();
      papel.material.dispose();
      verso.geometry.dispose();
      verso.material.dispose();
      textura.dispose();
    }
  };
}
