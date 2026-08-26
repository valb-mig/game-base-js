import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * O modelo do jipe, carregado uma vez e clonado por veículo.
 *
 * Ele vem com o grafo já pensado pra ser animado, e é isso que dispensa
 * qualquer tabela de posições aqui: `steer_L` e `steer_R` ficam no centro da
 * roda dianteira (girar em Y esterça, mover em Y é a suspensão), `wheel_*`
 * gira em X, e `seat_*` marca onde cada um dos quatro senta. Duas fontes de
 * verdade sobre onde fica o assento se separariam na primeira edição do
 * modelo — e o sintoma seria o jogador sentado dentro do painel.
 *
 * Corpo inteiro fundido em UMA malha, e só o que gira em nó separado: seis
 * malhas por jipe em vez de trinta. É a mesma conta do soldado skinnado —
 * objeto invisível ou não, a matriz dele é recalculada todo quadro.
 */

const CAMINHO = new URL('../../assets/models/jipe-willys.glb', import.meta.url).href;

/**
 * O para-brisa do arquivo não é moldura com vidro: são duas caixas MACIÇAS —
 * uma laje olive de 46 cm de altura e um painel escuro por cima dela. Não
 * existe vão nenhum, e sentado no lugar do motorista o jogador vê uma parede.
 *
 * Consertar no `.glb` exigiria rodar o script que o gerou; a operação é feita
 * aqui, uma vez, sobre o modelo compartilhado — então todas as cópias já
 * nascem com o vão aberto e as medidas da hitbox continuam saindo da mesma
 * malha.
 */
const PARABRISA = {
  // Onde procurar: a peça é LARGA e fica alta, na frente do banco.
  larguraMinima: 1.0,
  y: [1.0, 1.3],
  z: [0.15, 0.32],
  // A moldura reconstruída, em metros. O caimento de 12° é o do arquivo.
  inclinacao: 12 * Math.PI / 180,
  barra: 0.05,
  espessura: 0.06,
  cor: 0x3a4220,
  // Vidro de 1945 é grosso e esverdeado, e um pouco opaco: transparência
  // total faria a moldura parecer flutuar sem nada dentro.
  corVidro: 0x93a7a0,
  opacidade: 0.22
};

// Voltas de batente a batente num MB: umas três, então o volante anda muito
// mais que a roda.
const VOLTAS_VOLANTE = 3.2;

/**
 * O eixo do volante, MEDIDO da malha dele.
 *
 * Ele não é o Y: o modelo faz o volante como um cilindro e deita ele pra trás,
 * então girar em Y — que era o que estava aqui — INCLINA o volante pro lado em
 * vez de rodá-lo, e é exatamente isso que se vê dirigindo.
 *
 * E não dá pra escrever o ângulo à mão: eu escrevi (0, -sen50, cos50), que é
 * o que o script do modelo parece dizer, e medido o volante continuava tombando
 * — a caixa dele mudava 107% de tamanho ao esterçar. As NORMAIS respondem sem
 * chute: as duas faces chatas do disco são as mais numerosas da malha e a
 * normal delas é o eixo. Assim, modelo que mude de caimento continua girando
 * certo.
 */
function eixoDoVolante(malha) {
  const normais = malha?.geometry?.attributes?.normal;
  if (!normais) return null;

  const grupos = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < normais.count; i++) {
    v.set(normais.getX(i), normais.getY(i), normais.getZ(i));
    // Em módulo: as duas faces do disco têm normais opostas e o mesmo eixo.
    const igual = grupos.find((g) => Math.abs(g.v.dot(v)) > 0.999);
    if (igual) igual.quantos++;
    else grupos.push({ v: v.clone(), quantos: 1 });
  }
  grupos.sort((a, b) => b.quantos - a.quantos);
  return grupos[0]?.v ?? null;
}

let promessa = null;
let modelo = null;

/** Carrega o arquivo uma vez. Chamar de novo devolve a mesma promessa. */
export function carregarJipe() {
  if (!promessa) {
    promessa = new GLTFLoader().loadAsync(CAMINHO).then((glb) => {
      modelo = glb.scene;
      // A cirurgia é no modelo COMPARTILHADO, antes de qualquer cópia: assim
      // todas nascem iguais e a hitbox continua sendo medida da mesma malha.
      abrirParabrisa(modelo);
      modelo.updateMatrixWorld(true);
      return modelo;
    });
  }
  return promessa;
}

/**
 * Os grupos de triângulos que compartilham vértice, um por peça do modelo.
 *
 * A malha é a fusão de dezenas de caixas, e a solda que a gerou dedupa por
 * (posição, normal FACETADA, uv). É a normal que importa aqui: duas faces de
 * uma mesma caixa têm normais diferentes e por isso NÃO compartilham vértice —
 * componente conexa é uma FACE, não uma peça. Medido: a laje do para-brisa sai
 * em seis componentes de dois triângulos.
 *
 * Isso ainda serve, e serve melhor que filtro de caixa: as faces LARGAS da
 * laje são inconfundíveis (1,30 m de vão, alto, na frente do banco), e a
 * antena ao lado — que fica a 2 cm dela e que nenhum filtro de posição separa
 * — não tem face larga nenhuma. Achada a laje, o resto sai por conter.
 */
function pecas(geo) {
  const idx = geo.index;
  const total = idx.count / 3;
  const dono = new Map();          // vértice -> peça
  const pai = [];                  // união-busca sobre as peças

  const raiz = (a) => {
    while (pai[a] !== a) a = pai[a] = pai[pai[a]];
    return a;
  };

  const de = new Int32Array(total);
  for (let t = 0; t < total; t++) {
    pai.push(t);
    de[t] = t;
    for (let k = 0; k < 3; k++) {
      const v = idx.getX(t * 3 + k);
      const outro = dono.get(v);
      if (outro === undefined) dono.set(v, t);
      else {
        const a = raiz(t);
        const b = raiz(outro);
        if (a !== b) pai[b] = a;
      }
    }
  }

  const grupos = new Map();
  for (let t = 0; t < total; t++) {
    const r = raiz(de[t]);
    if (!grupos.has(r)) grupos.set(r, []);
    grupos.get(r).push(t);
  }
  return [...grupos.values()];
}

/** A caixa de um grupo de triângulos. */
function caixaDaPeca(geo, tris) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const b = new THREE.Box3();
  const p = new THREE.Vector3();
  for (const t of tris) {
    for (let k = 0; k < 3; k++) {
      const v = idx.getX(t * 3 + k);
      b.expandByPoint(p.set(pos.getX(v), pos.getY(v), pos.getZ(v)));
    }
  }
  return b;
}

/** Uma moldura de para-brisa com vidro, montada em código. */
function montarParabrisa(caixa) {
  const g = new THREE.Group();
  g.position.set(0, (caixa.min.y + caixa.max.y) / 2, (caixa.min.z + caixa.max.z) / 2);
  g.rotation.x = PARABRISA.inclinacao;

  const largura = caixa.max.x - caixa.min.x;
  const altura = (caixa.max.y - caixa.min.y) * Math.cos(PARABRISA.inclinacao);
  const { barra, espessura } = PARABRISA;

  // Quatro barras num buffer só: draw call é por malha, e uma moldura não
  // merece quatro delas por veículo.
  const partes = [
    new THREE.BoxGeometry(largura, barra, espessura)
      .translate(0, (altura - barra) / 2, 0),
    new THREE.BoxGeometry(largura, barra, espessura)
      .translate(0, -(altura - barra) / 2, 0),
    new THREE.BoxGeometry(barra, altura, espessura)
      .translate((largura - barra) / 2, 0, 0),
    new THREE.BoxGeometry(barra, altura, espessura)
      .translate(-(largura - barra) / 2, 0, 0)
  ];
  const moldura = new THREE.Mesh(
    mergeGeometries(partes),
    new THREE.MeshLambertMaterial({ color: PARABRISA.cor, flatShading: true })
  );
  moldura.name = 'parabrisa_moldura';
  for (const g2 of partes) g2.dispose();

  const vidro = new THREE.Mesh(
    new THREE.BoxGeometry(largura - barra * 2, altura - barra * 2, 0.012),
    new THREE.MeshLambertMaterial({
      color: PARABRISA.corVidro,
      transparent: true,
      opacity: PARABRISA.opacidade,
      // Sem isto o vidro escreve profundidade e apaga o que está atrás dele —
      // olhar através de um vidro que esconde o mundo é pior que a laje.
      depthWrite: false
    })
  );
  vidro.name = 'parabrisa_vidro';
  vidro.renderOrder = 2;

  g.add(moldura, vidro);
  g.name = 'parabrisa';
  return g;
}

/**
 * Tira a laje do para-brisa e põe uma moldura com vidro no lugar.
 *
 * Devolve quantos triângulos saíram, ou 0 se não achou a peça — modelo que
 * mudar de forma simplesmente não é operado, em vez de ficar com um buraco no
 * meio da carroceria.
 */
function abrirParabrisa(raiz) {
  const malha = raiz.getObjectByName('chassi_mesh');
  if (!malha?.geometry?.index) return 0;

  const geo = malha.geometry;
  const componentes = pecas(geo).map((tris) => ({ tris, b: caixaDaPeca(geo, tris) }));

  /**
   * Primeiro a laje, pelas faces LARGAS dela. Depois tudo que está DENTRO da
   * caixa dela, que é o que pega as faces estreitas das laterais e o painel de
   * vidro por inteiro — as duas coisas que ficariam pra trás procurando só
   * face larga, e que apareceriam como talas soltas nas pontas.
   */
  let caixa = null;
  const meio = new THREE.Vector3();
  for (const { b } of componentes) {
    b.getCenter(meio);
    if (b.max.x - b.min.x < PARABRISA.larguraMinima) continue;
    if (meio.y < PARABRISA.y[0] || meio.y > PARABRISA.y[1]) continue;
    if (meio.z < PARABRISA.z[0] || meio.z > PARABRISA.z[1]) continue;
    caixa = caixa ? caixa.union(b) : b.clone();
  }
  if (!caixa) return 0;

  // A folga é pequena de propósito: a antena encosta na laje (x 0,63 contra
  // 0,65) e sai junto com qualquer folga generosa.
  const dentro = caixa.clone().expandByScalar(0.012);
  const alvos = [];
  for (const { tris, b } of componentes) {
    if (dentro.containsBox(b)) alvos.push(...tris);
  }

  // Só o ÍNDICE muda: os vértices que sobram não custam desenho nenhum, e
  // mexer no buffer de posição mudaria a caixa que a hitbox mede.
  const fora = new Set(alvos);
  const idx = geo.index;
  const mantidos = [];
  for (let t = 0; t < idx.count / 3; t++) {
    if (fora.has(t)) continue;
    mantidos.push(idx.getX(t * 3), idx.getX(t * 3 + 1), idx.getX(t * 3 + 2));
  }
  geo.setIndex(mantidos);

  malha.parent.add(montarParabrisa(caixa));
  return alvos.length;
}

/** Quantos triângulos a abertura do para-brisa tirou. O teste confere. */
export function trianguloDoParabrisa() {
  const malha = modelo?.getObjectByName('chassi_mesh');
  return malha ? malha.geometry.index.count / 3 : 0;
}

/**
 * Já carregado? Devolve BOOLEANO, não promessa — quem espera chama
 * `carregarJipe()`. Um `await jipePronto()` passa reto e o veículo nasce sem
 * modelo, que foi exatamente a armadilha do `soldadoPronto()`.
 */
export function jipePronto() {
  return modelo !== null;
}

/**
 * As caixas do veículo MEDIDAS da malha, no sistema do modelo.
 *
 * É a mesma decisão da hitbox do soldado: caixa escrita à mão desalinha na
 * primeira vez que o modelo muda, e quem descobre é o jogador vendo a bala
 * atravessar o para-lama. Medido no `.glb`, o chassi vai de 0,42 a 1,46 de
 * altura e de -1,60 a 1,66 de comprimento — os números que estavam escritos à
 * mão diziam 0,36 a 1,74 e ±1,70, ou seja 28 cm de caixa de acerto NO AR
 * acima do jipe e 10 cm atrás dele.
 *
 * O corpo é fundido em uma malha só, então o que dá pra medir é o chassi
 * inteiro e cada roda. Motor e tanque continuam escritos — mas RECORTADOS
 * dentro do chassi, que é o que impede eles de sair da malha sozinhos.
 */
let medidas = null;
export function medidasDoJipe() {
  if (medidas || !modelo) return medidas;

  modelo.updateMatrixWorld(true);
  const caixa = new THREE.Box3();
  const ler = (nome) => {
    const o = modelo.getObjectByName(nome);
    if (!o) return null;
    caixa.setFromObject(o);
    return {
      minX: caixa.min.x, maxX: caixa.max.x,
      minY: caixa.min.y, maxY: caixa.max.y,
      minZ: caixa.min.z, maxZ: caixa.max.z
    };
  };

  const chassi = ler('chassi_mesh');
  if (!chassi) return null;

  const rodas = {};
  for (const id of ['FL', 'FR', 'RL', 'RR']) {
    const b = ler(`wheel_${id}_mesh`);
    if (b) rodas[id] = b;
  }

  medidas = { chassi, rodas };
  return medidas;
}

/**
 * Uma cópia do jipe, com os nós que a física vai mexer já separados.
 *
 * O material é compartilhado entre todas as cópias de propósito: um material
 * por veículo é uma chamada de desenho por veículo.
 */
export function criarJipe(ficha) {
  if (!modelo) return null;

  const grupo = modelo.clone(true);
  // YXZ pelo mesmo motivo da câmera do jogador: com XYZ, rolar um veículo já
  // esterçado torceria o eixo do caimento.
  grupo.rotation.order = 'YXZ';

  grupo.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.flatShading = true;
    o.material.needsUpdate = true;
  });

  const volante = grupo.getObjectByName('volante');
  const eixoVolante = eixoDoVolante(grupo.getObjectByName('volante_mesh'))
    ?? new THREE.Vector3(0, 1, 0);

  const rodas = new Map();
  for (const r of ficha.RODAS) {
    // Dianteira: quem esterça é o nó `steer_*` e quem gira é a roda dentro
    // dele. Traseira: o nó da roda faz as duas coisas, porque não esterça.
    const suporte = grupo.getObjectByName(r.no);
    const pneu = grupo.getObjectByName(`wheel_${r.id}`);
    if (!suporte || !pneu) continue;
    rodas.set(r.id, { suporte, pneu, repouso: suporte.position.y });
  }

  const assentos = new Map();
  for (const a of ficha.ASSENTOS) {
    const no = grupo.getObjectByName(a.no);
    if (no) assentos.set(a.id, no);
  }

  return {
    grupo,
    rodas,
    assentos,
    volante,
    eixoVolante,

    /** Escreve a pose do veículo na cena a partir do corpo da física. */
    pose(corpo, origem) {
      grupo.position.set(origem.x, origem.y, origem.z);
      grupo.rotation.set(corpo.pitch, corpo.yaw, corpo.roll);

      for (const estado of corpo.rodas) {
        const no = rodas.get(estado.config.id);
        if (!no) continue;
        // O cubo pendura da torre: haste esticada devolve exatamente a
        // posição em que o modelo desenha a roda em repouso.
        no.suporte.position.y = ficha.TORRE - estado.haste;
        if (estado.config.dianteira) no.suporte.rotation.y = estado.esterco;
        no.pneu.rotation.x = estado.giro;
      }

      // O volante acompanha o esterço, com muito mais volta que a roda. E ele
      // gira em torno do PRÓPRIO eixo — em Y ele tombava pro lado.
      if (volante) {
        /**
         * O SINAL sai da geometria, não do gosto. Giro positivo em torno do
         * eixo medido leva o topo do aro pro +X, que é a esquerda do veículo —
         * o mesmo lado pra onde o esterço positivo vira. Com o negativo que
         * estava aqui, volante e mãos giravam contra o movimento, e isso não
         * se percebe em nenhum teste que só confira que o aro MEXE.
         */
        volante.quaternion.setFromAxisAngle(
          eixoVolante, corpo.rodas[0].esterco * VOLTAS_VOLANTE);
      }
    },

    descartar() {
      grupo.traverse((o) => {
        if (o.isMesh) o.material.dispose();
      });
    }
  };
}

/**
 * A posição no mundo de um assento, com os olhos na altura de quem senta.
 *
 * Sem modelo carregado ela cai na FICHA, que declara o x e o z de cada
 * assento. Antes devolvia a origem: com o `.glb` faltando (ou num teste que
 * não carrega arquivo) o jogador sentava no ponto zero do mapa, a mil metros
 * do veículo, e nada no console dizia por quê. Assento é dado de jogo; o
 * modelo só o desenha num lugar mais preciso.
 */
export function olhoDoAssento(modeloJipe, ficha, assento, corpo, saida = new THREE.Vector3()) {
  const no = modeloJipe?.assentos.get(assento.id);
  if (!no) {
    const cos = Math.cos(corpo.yaw);
    const sen = Math.sin(corpo.yaw);
    return saida.set(
      corpo.x + assento.x * cos + assento.z * sen,
      corpo.y + ficha.ALTURA_OLHO + 0.68,
      corpo.z - assento.x * sen + assento.z * cos
    );
  }
  no.getWorldPosition(saida);
  // A altura dos olhos é somada no MUNDO, não no local: com o jipe capotado
  // ela tem que continuar apontando pra cima da cabeça de quem senta, e o
  // "pra cima" do assento aponta pro chão.
  saida.y += ficha.ALTURA_OLHO;
  return saida;
}
