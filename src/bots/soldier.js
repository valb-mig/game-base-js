import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { collides, groundHeightAt } from '../player/collision.js';
import { teamOf } from '../game/teams.js';
import { createItemModel } from '../items/models.js';
import { SWAP } from '../config.js';
import { corpoDe } from '../game/hitboxes.js';
import { criarSoldado, soldadoPronto, apoioDaPostura } from './model.js';
import { criarRig } from './rig.js';
import { createRagdoll } from './ragdoll.js';
import { JUNTAS_PADRAO } from './esqueleto.js';
import { porteDe, MAOS } from './porte.js';
import { avancarFase, passoEm, embalarPara } from './passada.js';
import { POSTURAS } from './posturas.js';
import { ossoDoLado } from './esqueleto.js';

/**
 * O corpo de um bot: modelo, colisor, vida e o andar dele.
 *
 * Ele é ALVO com o mesmo contrato do boneco de treino (`alive`, `center()`,
 * `radius`, `damage()`), então a balística já sabe acertá-lo sem saber que
 * existe bot. E é atirador pelo mesmo caminho do jogador, o que faz a bala
 * dele viajar, cair e poder bater numa parede no meio.
 *
 * O andar é simples de propósito: amostra o campo de altura, tenta o passo,
 * e escorrega por um eixo quando o outro esbarra. Não é a locomoção do
 * jogador — bot não pula, não nada e não se agacha por conta própria — mas
 * usa o MESMO `RADIUS` e o MESMO `STEP_HEIGHT`, senão ele passaria por vãos
 * que o jogador não passa.
 */

const VIDA = 100;

/**
 * Tombo do corpo. Não é ragdoll por junta: o soldado é feito de caixas
 * rígidas, e articular dezesseis peças custaria um solucionador de física
 * inteiro pra um corpo que fica cinco segundos na tela. O que se vê é o que
 * importa — ele cai pro lado pra onde o tiro empurrou, gira em torno dos pés
 * como quem desaba, e para no chão.
 *
 * O giro é de pêndulo, não de queda livre: parte de um empurrão e acelera
 * conforme deita. Acelaração constante desde zero faz o corpo sair do lugar
 * como uma tábua, e é isso que lê como boneco em vez de gente.
 */
const CORPO_TEMPO = 5;       // segundos até o corpo sumir
const QUEDA_EMPURRAO = 1.7;  // rad/s que o tiro imprime, no corpo sem osso

/**
 * Impacto do tiro no corpo caído. A força é POR PONTO DE DANO, e o teto
 * existe porque um tiro de fuzil não pode jogar um homem de 80 kg pelos ares
 * — o solavanco é pra dizer de onde veio, não pra ganhar a briga.
 */
const IMPACTO_POR_DANO = 0.075;
const IMPACTO_MAX = 4.5;
const IMPACTO_RAIO = 0.5;

/**
 * Em quantos quadros o empurrão do tiro é entregue.
 *
 * De uma vez só ele CHICOTEIA: o tronco recebe 6 m/s num quadro enquanto as
 * pernas recebem zero, e seis passadas de restrição não dão conta de repassar
 * isso pro resto do corpo — o resultado é um corpo torcido em pose impossível,
 * com os ossos do tamanho certo. Repartido em alguns quadros, o mesmo impulso
 * atravessa o corpo inteiro e o que se vê é um baque.
 */
const IMPACTO_QUADROS = 5;

// Solavanco de quem ainda está de pé: uma torção curta no osso mais perto de
// onde a bala pegou. É visual, não física — o corpo vivo está sendo animado,
// e o ragdoll só entra quando ele cai.
const SOLAVANCO_TEMPO = 0.3;
// Radianos no pico. Medido antes: 7° no tronco por um quarto de segundo não
// se vê em jogo nenhum — ficava correto no teste e invisível na tela.
const SOLAVANCO_ANGULO = 0.6;
const SOLAVANCO_MINIMO = 0.45;  // até o tiro mais fraco tem que ser visto
// Com o corpo rígido o bastante pra não derreter, ele também cai mais no
// lugar: o empurrão precisa ser maior pra a queda contar de onde veio o tiro.
// Empurrão do corpo inteiro. Baixo de propósito: ele só tira o corpo do
// prumo. Quem decide a FORMA da queda é o empurrão local, no ponto do acerto
// — com o global grande, todo corpo caía igual e o tiro não dizia nada.
const EMPURRAO_RAGDOLL = 3;  // m/s que ele imprime, no corpo com osso
const PERTO_DO_CORPO = 1.6;  // raio em que um colisor pode atrapalhar a queda
const QUEDA_PESO = 9;        // rad/s² no tombo, proporcional ao seno do ângulo
const DEITADO = Math.PI / 2;
const RAIO_ALVO = 0.5;       // esfera de acerto, do quadril à cabeça
const ALTURA = 1.75;
const ALTURA_AGACHADO = 1.15;
/**
 * Deitado. O bot ainda não decide deitar sozinho — o cérebro não tem esse
 * estado —, mas a postura existe aqui porque quem a usa hoje é o corpo em
 * primeira pessoa do jogador, que é o MESMO modelo posado pela MESMA tabela.
 * Duas alturas de deitado, uma pra cada corpo, divergiriam no primeiro
 * ajuste.
 */
const ALTURA_DEITADO = 0.52;

/**
 * Intervalo entre poses de um bot SEM detalhe, em segundos.
 *
 * Oito vezes por segundo. Quem está perto do jogador (`detalhado`) continua
 * a sessenta — é ali que se enxerga a passada.
 */
const POSE_INTERVALO = 1 / 8;

/**
 * Quanto do CICLO a passada pode andar entre duas poses.
 *
 * O intervalo de cima é um relógio, e relógio não sabe se a perna está
 * parada ou correndo. Enquanto a pose era estática isso não importava — nada
 * se mexia entre uma e outra. Com o ciclo de passada, importa: a 3,4 m/s a
 * passada mede 2,3 m, ou seja 1,48 ciclos por segundo, e a 8 Hz são 5,4
 * poses por ciclo — a coxa salta 15° por amostra e o que se vê é a perna
 * teleportando. Somado ao `detalhado`, que é reavaliado a cada 0,25 s e vira
 * e desvira na fronteira dos 45 m, o resultado é um bot que anda, congela um
 * oitavo de segundo e volta a andar de repente.
 *
 * Amarrando ao ciclo em vez de ao relógio, quem está parado continua posando
 * oito vezes por segundo (não há o que atualizar) e quem corre posa quantas
 * vezes o passo pedir. É a mesma ideia da fase sair da distância.
 *
 * O número saiu MEDINDO o salto, não a taxa: "posa oito vezes por segundo"
 * não diz nada sem saber quão rápido a perna anda, e o que o olho vê é o
 * salto. Medido num bot correndo, a coxa pulava 28,8° por amostra com o
 * relógio de 8 Hz, 23,9° com 1/20 e 16° com este número.
 *
 * E ele não vira taxa direto: o QUADRO é a granularidade. A 3,4 m/s a fase
 * anda 0,023 de ciclo por quadro, então um limiar de 1/20 só dispara a cada
 * três quadros e entrega 14 poses por ciclo em vez de 20. O limiar se escolhe
 * medindo o que sai, não o que ele parece prometer.
 *
 * O custo continua vindo de quem se MEXE: bot parado longe não paga pose
 * nenhuma, que é onde a economia de verdade sempre esteve.
 */
const CICLO_POR_POSE = 1 / 30;

/**
 * Velocidade em que a passada do bot já é a de corrida cheia, em m/s.
 *
 * Sai das velocidades que `brain.js` pede — 2,6 a andar e 3,6 no avanço sob
 * fogo —, e não de `config.js`: o jogador corre a 8,4, e usar o número dele
 * deixaria todo bot do mapa em passo de caminhada.
 */
const CORRIDA_ACIMA = 3.4;

/**
 * Onde as mãos pegam cada arma, em coordenadas do modelo dela.
 *
 * Uma vez por TIPO de arma, no mundo inteiro: os marcadores não se mexem, e
 * lê-los do modelo que está na mão amarrava a pose do braço à existência
 * daquele modelo — ou seja, ao LOD. Medido numa briga de trezentos, `detalhado`
 * pisca 4 vezes por segundo num bot a 15 m (24 vagas pra 60 candidatos), e
 * com ele piscavam os braços: erguidos na arma num quadro, caídos no seguinte.
 * O LOD tem que tirar a MALHA da arma, não a pose de quem a segura.
 */
const PUNHOS = new Map();
function punhosDe(arma) {
  if (!arma) return null;
  if (PUNHOS.has(arma.id)) return PUNHOS.get(arma.id);

  const modelo = createItemModel(arma);
  const achados = [];
  for (const mao of MAOS) {
    const marca = modelo?.getObjectByName(mao.marcador);
    if (!marca) continue;
    achados.push({ mao, x: marca.position.x, y: marca.position.y, z: marca.position.z });
  }
  PUNHOS.set(arma.id, achados);
  return achados;
}

/** Qual sufixo de osso é a perna direita dele. O arquivo nomeia ao contrário. */
const PERNAS = { dir: ossoDoLado(1), esq: ossoDoLado(-1) };

const PELE = 0xc9a978;
const BOTA = 0x4a3526;
const METAL = 0x24261f;

function fosco(color) {
  return new THREE.MeshLambertMaterial({ color, emissive: 0x0a0a0a, flatShading: true });
}

/** Uma caixa. Doze triângulos cada — o orçamento inteiro do soldado é isto. */
function peca(grupo, material, w, h, d, x, y, z, giro = 0) {
  const malha = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  malha.position.set(x, y, z);
  if (giro) malha.rotation.x = giro;
  grupo.add(malha);
  return malha;
}

/**
 * Soldado low poly, 1,75 m.
 *
 * O que separa os dois times a quarenta metros é o TOM da farda — uma escura,
 * uma clara. A bandeira no peito e o vivo do capacete dizem QUAL é, mas só
 * de perto: cor de time berrante no uniforme inteiro seria fantasia, não
 * farda, e o soldado deixaria de se esconder no mato que é a metade do jogo.
 *
 * Tudo é caixa. Um capacete arredondado custaria mais triângulos que o corpo
 * inteiro e não se distingue a distância nenhuma.
 */
function construirCorpo(time) {
  // O modelo de verdade, quando ele já carregou. O de caixas abaixo continua
  // existindo pro teste, que roda sem rede e sem esperar arquivo nenhum.
  const doArquivo = soldadoPronto() ? criarSoldado(time.id) : null;
  if (doArquivo) {
    // Material por soldado: o piscar de dano é emissivo, e um material
    // compartilhado faria bater num acender o time inteiro.
    const proprio = doArquivo.material.clone();
    for (const malha of doArquivo.pintados) malha.material = proprio;
    return {
      grupo: doArquivo.grupo,
      painted: [proprio],
      maos: doArquivo.maos,
      // As malhas, e não só o material: o corpo caído vive em coordenadas de
      // MUNDO com o grupo na origem, e o recorte de câmera precisa saber
      // disso. Ver `acompanharRecorte`.
      malhas: doArquivo.pintados,
      // O rig vem daqui e não do soldado: quem tem osso é o modelo do
      // arquivo. O corpo de caixas não tem, e por isso ele tomba inteiro.
      rig: criarRig(doArquivo.grupo)
    };
  }

  const grupo = new THREE.Group();

  const farda = fosco(time.uniforme);
  const fardaEscura = fosco(time.uniformeEscuro);
  const equipamento = fosco(time.equipamento);
  const pele = fosco(PELE);
  const bota = fosco(BOTA);
  const metal = fosco(METAL);

  // ------------------------------------------------------------- pernas
  for (const lado of [-1, 1]) {
    peca(grupo, bota, 0.17, 0.11, 0.29, lado * 0.11, 0.055, 0.02);
    peca(grupo, fardaEscura, 0.16, 0.34, 0.17, lado * 0.11, 0.27, 0);   // canela
    peca(grupo, farda, 0.19, 0.36, 0.21, lado * 0.11, 0.62, 0);          // coxa
  }

  // -------------------------------------------------------------- tronco
  const tronco = peca(grupo, farda, 0.44, 0.46, 0.24, 0, 1.05, 0);
  peca(grupo, fardaEscura, 0.45, 0.07, 0.25, 0, 0.83, 0);       // barra da túnica
  peca(grupo, fardaEscura, 0.2, 0.1, 0.13, 0, 1.25, 0.09);      // gola em V

  // Cinto e cartucheiras: é o que faz a silhueta ler como soldado e não como
  // boneco, e custa três caixas.
  peca(grupo, equipamento, 0.46, 0.06, 0.26, 0, 0.86, 0);
  for (const lado of [-1, 1]) {
    peca(grupo, equipamento, 0.13, 0.12, 0.09, lado * 0.13, 0.92, 0.14);
  }

  // Mochila nas costas: dá volume por trás e torna o soldado reconhecível de
  // costas, que é de onde se flanqueia.
  peca(grupo, equipamento, 0.32, 0.3, 0.14, 0, 1.13, -0.18);
  peca(grupo, equipamento, 0.14, 0.13, 0.1, 0, 0.95, -0.17);

  // -------------------------------------------------------------- braços
  // Erguidos e à frente: é a pose de quem carrega arma, e é onde o modelo da
  // arma vai encaixar.
  for (const lado of [-1, 1]) {
    peca(grupo, farda, 0.13, 0.26, 0.15, lado * 0.28, 1.15, 0.02);        // ombro
    peca(grupo, farda, 0.12, 0.24, 0.16, lado * 0.24, 0.98, 0.13, -0.5);  // antebraço
    peca(grupo, pele, 0.09, 0.09, 0.11, lado * 0.21, 0.9, 0.24);          // mão
  }

  // ------------------------------------------------------ cabeça e capacete
  peca(grupo, pele, 0.12, 0.07, 0.12, 0, 1.32, 0);                // pescoço
  const cabeca = peca(grupo, pele, 0.2, 0.21, 0.2, 0, 1.46, 0);

  peca(grupo, fardaEscura, 0.24, 0.13, 0.25, 0, 1.62, 0);         // casco
  peca(grupo, fardaEscura, 0.27, 0.04, 0.29, 0, 1.55, 0);         // aba
  // vivo do time no capacete: some a distância, e é isso que se quer
  const vivo = peca(grupo, fosco(time.color), 0.245, 0.025, 0.255, 0, 1.585, 0);

  // ------------------------------------------------------- bandeira no peito
  // Quem chega perto identifica pela bandeira; quem está longe lê o tom da
  // farda. A moldura fica ATRÁS dela — na frente, ela tapava justamente o que
  // devia mostrar.
  peca(grupo, metal, 0.135, 0.105, 0.01, -0.115, 1.17, 0.121);
  const bandeira = peca(grupo, fosco(time.color), 0.12, 0.09, 0.02, -0.115, 1.17, 0.13);

  return { grupo, painted: [tronco, cabeca, vivo, bandeira] };
}

export function createSoldier(scene, colliders, {
  id, team, x, z, terrain, weapons
}) {
  const {
    grupo, painted, rig = null, malhas = []
  } = construirCorpo(teamOf(team));

  // A escala do arquivo mora no grupo (o modelo tem 1,80 m e o jogo trata o
  // soldado como 1,75). Agachar multiplica ELA, e não a substitui: escrever
  // `scale.y = 1` de pé apagava a conversão e deixava o soldado esticado só
  // no Y, mais alto que a própria hitbox.
  const escalaBase = grupo.scale.clone();
  scene.add(grupo);

  // materiais próprios: piscar de dano num não pode acender os outros
  for (const mesh of painted) {
    if (mesh.isMesh) mesh.material = mesh.material.clone();
  }

  // Arma na mão, do lado direito e na altura do peito. Os modelos nascem com
  // o cano no -Z, que é a frente do soldado — o mesmo que vale pro viewmodel.
  //
  // Um modelo por arma, criado uma vez e escondido: trocar de arma é ligar e
  // desligar visibilidade. Criar e destruir a cada troca daria churn de GPU
  // num bot que troca de arma no meio do tiroteio.
  /**
   * A arma NÃO pendura mais no nó `weapon_R` do arquivo.
   *
   * Ali ela ia parar onde a pose de repouso tivesse deixado a mão, e a mão
   * de repouso está ao lado do corpo: medido, o cano apontava 30° pro chão e
   * a mão esquerda ficava a 58,5 cm da arma. O soldado arrastava a arma.
   *
   * Hoje o nó é NOSSO e vive no corpo do soldado — `porte.js` diz onde —, e
   * são as mãos que vão até a arma por IK. É a mesma inversão das mãos no
   * volante do jipe: o alvo é um ponto da coisa segurada, não um ângulo de
   * braço escrito à mão.
   */
  const maos = new THREE.Group();
  maos.name = 'porte';
  grupo.add(maos);

  /**
   * O modelo da arma nasce quando ela vai pra MÃO, não quando o bot nasce.
   *
   * Antes os três saíam prontos no construtor e ficavam invisíveis no coldre.
   * Medido contando objeto na cena: MP40 são 32 malhas, a Colt 26 e a faca 4
   * — 62 das 89 malhas de um bot eram arma guardada, mais que o dobro do
   * corpo inteiro (27). Invisível não é de graça: o objeto continua na árvore
   * e a matriz dele é recalculada todo quadro, e com 300 bots isso são 18 mil
   * Object3D atualizados pra desenhar zero pixel.
   *
   * `detalhado` é o LOD: bot longe não constrói modelo de arma nenhum. A essa
   * distância a arma tem poucos pixels, e o que se lê é a silhueta do corpo.
   */
  const modelos = new Map();
  function modeloEmMao(arma) {
    if (!arma) return null;
    if (modelos.has(arma.id)) return modelos.get(arma.id);

    const modelo = createItemModel(arma);
    if (modelo) {
      modelo.visible = false;
      maos.add(modelo);
    }
    modelos.set(arma.id, modelo ?? null);
    return modelo;
  }

  const meio = new THREE.Vector3();
  const caixa = new THREE.Box3();
  // Tombo do corpo: eixo horizontal em torno do qual ele deita, e onde está
  // esse giro agora. Reaproveitados pra não alocar quaternion por quadro.
  const queda = { eixo: new THREE.Vector3(1, 0, 0), angulo: 0, velocidade: 0 };

  // Ragdoll por junta, quando há esqueleto. As medidas saem da POSE que está
  // na tela, não de tabela: comprimento de osso escrito à mão desalinha na
  // primeira vez que o modelo muda, e o corpo estica ao cair.
  const ragdoll = createRagdoll(rig ? rig.medirJuntas() : JUNTAS_PADRAO);
  const perto = [];   // colisores em volta do corpo, refeitos por quadro
  const centroQueda = new THREE.Vector3();
  const giroDeitar = new THREE.Quaternion();
  const giroYaw = new THREE.Quaternion();
  const CIMA = new THREE.Vector3(0, 1, 0);
  const collider = { box: caixa, standable: false };
  colliders.push(collider);

  /**
   * Leva o RECORTE DE CÂMERA junto com o corpo caído.
   *
   * O ragdoll resolve as juntas em coordenadas de MUNDO e por isso o grupo
   * fica na origem enquanto o corpo está a duzentos metros dali. O three
   * recorta a malha skinnada pela `boundingSphere` DELA multiplicada pela
   * matriz do objeto — que aqui é a identidade —, então o corpo era
   * descartado como se estivesse no ponto zero do mapa: sumia inteiro, e o
   * que sobrava na tela eram a bandeira do peito e o vivo do capacete, que
   * penduram nos ossos e carregam matriz própria. Foi exatamente o que
   * apareceu na captura: um retângulo vermelho flutuando sobre a grama.
   *
   * Desligar o recorte resolveria e custaria trezentos corpos desenhados
   * fora de quadro. Mover a esfera custa quatro números por quadro, e só
   * enquanto o corpo se mexe.
   */
  /**
   * Põe a arma no corpo e as MÃOS na arma.
   *
   * Duas metades. A primeira assenta o nó de porte onde `porte.js` manda —
   * é ela que faz o cano apontar pra frente em vez de pro chão. A segunda
   * leva cada mão até o marcador da PRÓPRIA arma (`mao_dir`, `mao_esq`), que
   * é o mesmo par que o viewmodel já usa em primeira pessoa.
   *
   * Só pra bot `detalhado`: a IK são duas contas de triângulo e quatro ossos
   * reorientados, e a duzentos metros o que se lê é a silhueta. E ela roda
   * DEPOIS de `repousar`, porque repousar reescreve os mesmos ossos.
   */
  let eraX = x;
  let eraZ = z;
  let balancoDaArma = 0;
  let porteDaPostura = POSTURAS.pe;
  const noMundo = new THREE.Vector3();
  const doPolo = new THREE.Vector3();
  function segurarArma() {
    if (!rig) return;

    const porte = porteDe(soldier.weapon);
    const punhos = punhosDe(soldier.weapon);
    if (!porte || !punhos?.length) return;
    // O porte vive no GRUPO e não no peito, então o balanço do corpo não
    // chega nele sozinho: sem esta linha a arma fica parada no ar enquanto o
    // soldado sobe e desce por baixo dela.
    const daPostura = porteDaPostura;
    maos.position.set(
      porte.posicao[0] + daPostura.porte[0],
      porte.posicao[1] + daPostura.porte[1] + balancoDaArma,
      porte.posicao[2] + daPostura.porte[2]
    );
    maos.rotation.set(
      porte.giro[0] + daPostura.caimento, porte.giro[1], porte.giro[2], 'YXZ'
    );

    // As posições dos marcadores saem em MUNDO, e o nó de porte acabou de
    // se mexer: sem esta atualização a mão mira onde a arma estava no quadro
    // passado, e num bot que gira isso é a arma inteira de atraso.
    //
    // Só o RAMO da arma, nunca `grupo.updateMatrixWorld(true)`: aquele
    // varre o soldado inteiro — a malha skinnada e os dezenove ossos — pra
    // atualizar um nó e os poucos filhos dele. Medido pelo relógio da
    // suíte, era o bastante pra estourar o orçamento de tempo virtual da
    // página e derrubar o carregamento do `.glb` do jipe dez suítes adiante,
    // com um erro que não fala nem de tempo nem de braço.
    maos.updateWorldMatrix(true, true);

    for (const punho of punhos) {
      const mao = punho.mao;
      if (!mao.principal && !porte.ambasAsMaos) continue;
      // Do NÓ de porte, não do modelo: é o mesmo ponto, e assim o braço
      // continua na arma mesmo quando a malha dela não está na cena.
      noMundo.set(punho.x, punho.y, punho.z);
      maos.localToWorld(noMundo);
      // O polo é declarado no sistema do soldado e o alvo está em mundo: o
      // corpo gira, e um polo de mundo mandaria o cotovelo pra um lado fixo
      // do MAPA em vez de pra fora do corpo.
      doPolo.set(...mao.polo).applyQuaternion(grupo.quaternion);
      rig.apontarBraco(mao.osso, noMundo, doPolo);
    }
  }

  const RAIO_CAIDO = 1.6;   // em unidades da malha, com folga pra braço aberto
  function acompanharRecorte() {
    ragdoll.posicaoDe('hips', centroQueda);
    for (const malha of malhas) {
      if (!malha.boundingSphere) malha.boundingSphere = new THREE.Sphere();
      malha.boundingSphere.center.copy(centroQueda);
      malha.worldToLocal(malha.boundingSphere.center);
      malha.boundingSphere.radius = RAIO_CAIDO;
    }
  }

  /**
   * Começa o tombo. O eixo sai do RUMO do golpe, não de dedução: quem gira em
   * torno de um eixo anda pra `eixo × cima`, então o eixo que joga o corpo
   * pra onde o tiro empurrou é `(dz, 0, -dx)`. Errar esse sinal já custou
   * duas tentativas em world/settling.js, e aqui há teste medindo onde a
   * cabeça foi parar.
   */
  function tombar(impacto) {
    const dir = impacto?.dir ?? null;
    let dx = 0;
    let dz = 0;
    if (dir && (dir.x || dir.z)) {
      const plano = Math.hypot(dir.x, dir.z);
      dx = dir.x / plano;
      dz = dir.z / plano;
    } else {
      // sem rumo declarado ele cai pra frente: é o certo pro tiro que veio
      // de lugar nenhum, e pro fim de partida
      dx = Math.sin(soldier.yaw);
      dz = Math.cos(soldier.yaw);
    }
    queda.eixo.set(dz, 0, -dx);
    queda.angulo = 0;
    queda.velocidade = QUEDA_EMPURRAO;

    if (!rig) return;
    // Com esqueleto o tombo é por junta: o empurrão vira velocidade, maior
    // em cima que embaixo, e o resto é a gravidade e as amarras do corpo.
    ragdoll.iniciar(soldier.x, soldier.feetY, soldier.z, soldier.yaw, {
      x: dx * EMPURRAO_RAGDOLL, y: 1.2, z: dz * EMPURRAO_RAGDOLL
    });

    // E o golpe empurra ONDE pegou. Sem isto o corpo cai igual venha o tiro
    // de onde vier — o mesmo tombo pro tiro no capacete e pro da canela.
    //
    // Sem ponto declarado o empurrão vai no PEITO, e não some: a faca não tem
    // ponto de impacto próprio, e um corpo que desaba no lugar quando o golpe
    // é de perto parece o boneco que este ragdoll veio substituir.
    if (dir) {
      const onde = impacto?.ponto ?? ragdoll.posicaoDe('chest', centroQueda);
      // Guarda a JUNTA, não o ponto: o corpo sai andando no quadro seguinte, e
      // um ponto parado no ar empurraria o vazio que ele deixou pra trás.
      soldier.impacto = onde ? {
        junta: ragdoll.juntaMaisPerto(onde),
        dir: { x: dir.x, y: dir.y, z: dir.z },
        forca: forcaDe(impacto?.dano ?? 40) / IMPACTO_QUADROS,
        restante: IMPACTO_QUADROS
      } : null;
    }
  }

  /** Quanto de empurrão vale um dano. Com teto: tiro não é catapulta. */
  function forcaDe(dano = 0) {
    return Math.min(IMPACTO_MAX, dano * IMPACTO_POR_DANO);
  }

  /**
   * Osso que leva o solavanco, e de que lado.
   *
   * O lado sai do PONTO onde a bala pegou, levado pro sistema do soldado:
   * tiro no braço direito não pode sacudir o esquerdo. Sem ponto — golpe de
   * faca, dano de área ainda sem origem —, o tronco leva.
   */
  function ossoDoImpacto(regiao, ponto) {
    const grupo = regiao?.nome ?? null;
    if (!ponto) return grupo === 'cabeça' || grupo === 'capacete' ? 'neck' : 'spine';

    const cos = Math.cos(-soldier.yaw);
    const sen = Math.sin(-soldier.yaw);
    const ox = ponto.x - soldier.x;
    const oz = ponto.z - soldier.z;
    const lado = ox * cos - oz * sen >= 0 ? 'R' : 'L';

    if (grupo === 'cabeça' || grupo === 'capacete') return 'neck';
    if (grupo === 'braço') return `shoulder_${lado}`;
    if (grupo === 'perna') return `thigh_${lado}`;
    return 'spine';
  }

  /**
   * Arma o solavanco: o osso atingido torce PRA LONGE de quem atirou, e
   * volta em pouco mais de um quarto de segundo.
   *
   * Os ângulos saem do rumo da bala no sistema do soldado — bala vindo pela
   * frente joga o osso pra trás, bala de lado joga pro lado. Sem isso o
   * solavanco seria o mesmo tique em toda direção, e diria menos que nada.
   */
  function solavancar(regiao, impacto) {
    if (!rig || !impacto?.dir) return;

    const cos = Math.cos(-soldier.yaw);
    const sen = Math.sin(-soldier.yaw);
    const dx = impacto.dir.x * cos - impacto.dir.z * sen;
    const dz = impacto.dir.x * sen + impacto.dir.z * cos;

    const proporcao = Math.min(1, forcaDe(impacto.dano) / IMPACTO_MAX);
    const escala = Math.max(SOLAVANCO_MINIMO, proporcao) * SOLAVANCO_ANGULO;
    soldier.solavanco = {
      osso: ossoDoImpacto(regiao, impacto.ponto),
      angulos: [dz * escala, 0, -dx * escala],
      restante: SOLAVANCO_TEMPO
    };
  }

  const soldier = {
    id,
    team,
    name: `${teamOf(team).short} ${id}`,
    group: grupo,
    collider,
    radius: RAIO_ALVO,

    /**
     * Nível de detalhe. Quem decide é `bots.js`, por distância do olho do
     * jogador — o soldado não tem como saber onde a câmera está, e não
     * deveria. Falso: nenhum modelo de arma é construído nem desenhado.
     */
    detalhado: true,

    x,
    z,
    feetY: terrain.heightAt(x, z),
    height: ALTURA,
    yaw: 0,
    speed: 0,          // m/s andados no último quadro, lido pela mira do outro
    fase: 0,           // onde a passada está, de 0 a 1
    faseNaPose: 0,     // e onde ela estava quando o corpo foi posado
    embalo: 0,         // quanto da passada está valendo, de 0 a 1
    postura: 'pe',     // pe · agachado · deitado, derivada da altura
    crouching: false,
    deitado: false,

    maxHealth: VIDA,
    health: VIDA,
    alive: true,
    flash: 0,

    // arsenal: o cérebro troca entre eles
    weapons,
    slot: 0,
    swapping: 0,      // segundos que faltam pra arma nova chegar na mão
    swapPara: -1,
    get weapon() { return soldier.weapons[soldier.slot] ?? null; },

    /**
     * Pede a troca de arma. Ela leva o mesmo tempo que a do jogador.
     *
     * Bot que troca instantâneo enquanto o jogador leva quase um segundo é
     * vantagem escondida — o mesmo tipo de coisa que a mira com atraso
     * existe pra evitar.
     */
    trocarPara(indice) {
      if (indice < 0 || indice === soldier.slot || indice === soldier.swapPara) return;
      soldier.swapPara = indice;
      soldier.swapping = SWAP.GUARDAR + (soldier.weapon?.weight ?? 0) * SWAP.GUARDAR_POR_KG
        + SWAP.SACAR + (soldier.weapons[indice]?.weight ?? 0) * SWAP.SACAR_POR_KG;
    },

    /**
     * As esferas do corpo, região por região. Quem resolve acerto usa isto
     * em vez de `center()`: acertar a cabeça e acertar a canela não podem
     * valer o mesmo.
     */
    body(saida) {
      return corpoDe(soldier.height, saida, soldier.postura);
    },

    /** Centro do tronco: é onde a bala do outro tem que passar. */
    center() {
      return meio.set(soldier.x, soldier.feetY + soldier.height * 0.62, soldier.z);
    },

    /**
     * Empurrado de lado, sem levar dano.
     *
     * É o que um veículo devagar faz: encostar num soldado a 3 km/h tem que
     * tirá-lo do caminho, não matá-lo. Fica no alvo e não em quem empurra
     * porque só ele sabe mover o próprio corpo — e alvo que não sabe (poste,
     * boneco de treino) simplesmente não tem este método.
     */
    empurrar(dx, dz) {
      if (!soldier.alive) return;
      soldier.x += dx;
      soldier.z += dz;
      soldier.feetY = groundHeightAt(colliders, soldier.x, soldier.z,
        soldier.feetY + PLAYER.STEP_HEIGHT,
        terrain.heightAt(soldier.x, soldier.z));
    },

    /** De onde ELE atira: altura do olho. */
    eye(out) {
      return out.set(soldier.x, soldier.feetY + soldier.height - 0.14, soldier.z);
    },

    /**
     * `impacto` é de onde veio o dano: `{ dir, ponto }`. Tiro é IMPACTO, não
     * só perda de vida — é ele que decide pra onde o corpo tomba, onde o
     * ragdoll leva o empurrão, e que osso dá o solavanco em quem continua de
     * pé. Sem ele o dano ainda vale; o corpo é que cai sempre pra frente,
     * como se o tiro tivesse vindo de lugar nenhum.
     */
    damage(amount, regiao = null, impacto = null) {
      if (!soldier.alive) return { target: soldier, amount: 0, killed: false };

      // O multiplicador é da REGIÃO, e é o que faz mirar valer a pena.
      const dano = amount * (regiao?.multiplicador ?? 1);
      soldier.health = Math.max(0, soldier.health - dano);
      soldier.flash = 1;
      soldier.hurtFor = 0;

      // A força do empurrão sai do dano JÁ multiplicado pela região: tiro na
      // cabeça sacode mais que tiro na canela, e é o mesmo número que decide
      // as duas coisas.
      const comDano = impacto ? { ...impacto, dano } : null;

      const killed = soldier.health === 0;
      if (killed) {
        soldier.alive = false;
        soldier.downFor = 0;
        caixa.max.y = soldier.feetY + 0.25;   // caído não barra passagem
        tombar(comDano);
      } else {
        solavancar(regiao, comDano);
      }
      return { target: soldier, amount: dano, killed, regiao };
    },

    /**
     * Tenta andar `dx, dz`. Devolve quanto realmente andou.
     *
     * Escorrega por eixo como a locomoção do jogador: esbarrar numa parede
     * de frente não pode travar o bot no lugar, senão ele fica se enfiando
     * nela pra sempre — foi assim que os primeiros ficaram vibrando na quina
     * do posto.
     */
    step(dx, dz) {
      const antesX = soldier.x;
      const antesZ = soldier.z;
      const altura = soldier.crouching ? ALTURA_AGACHADO : ALTURA;

      // Já dentro de geometria: sair é mais importante que ser barrado.
      const preso = collides(colliders, soldier.x, soldier.z, soldier.feetY, altura);

      if (preso || !collides(colliders, soldier.x + dx, soldier.z, soldier.feetY, altura)) {
        soldier.x += dx;
      }
      if (preso || !collides(colliders, soldier.x, soldier.z + dz, soldier.feetY, altura)) {
        soldier.z += dz;
      }

      const piso = groundHeightAt(colliders, soldier.x, soldier.z,
        soldier.feetY + PLAYER.STEP_HEIGHT, terrain.heightAt(soldier.x, soldier.z));
      soldier.feetY = piso;

      return Math.hypot(soldier.x - antesX, soldier.z - antesZ);
    },

    update(delta) {
      // A altura sai da POSTURA, e não o contrário. Derivá-la ao contrário
      // foi o que fez a postura escrita de fora durar um quadro: `update`
      // reescrevia a altura a partir de `crouching` e a pose voltava pra
      // de pé sem nada no console.
      soldier.postura = soldier.deitado
        ? 'deitado'
        : (soldier.crouching ? 'agachado' : 'pe');
      soldier.height = soldier.deitado
        ? ALTURA_DEITADO
        : (soldier.crouching ? ALTURA_AGACHADO : ALTURA);

      if (soldier.swapping > 0) {
        soldier.swapping -= delta;
        if (soldier.swapping <= 0) {
          soldier.slot = soldier.swapPara;
          soldier.swapPara = -1;
          soldier.swapping = 0;
        }
      }

      // Só a arma da mão fica na ÁRVORE, e as outras saem dela.
      //
      // Esconder não bastava: o modelo continua sendo percorrido e tem a
      // matriz recalculada todo quadro, e o bot ia acumulando um modelo por
      // arma que já sacou — trocar pra faca e voltar deixava os três lá pra
      // sempre. Desanexado, ele custa zero e continua construído: reanexar é
      // uma linha, e reconstruir seria alocar geometria no meio da briga.
      if (soldier.detalhado && soldier.alive) modeloEmMao(soldier.weapon);
      const naMao = soldier.detalhado && soldier.alive
        ? (soldier.weapon?.id ?? null)
        : null;
      for (const [id, modelo] of modelos) {
        if (!modelo) continue;
        const querNaMao = id === naMao;
        if (querNaMao && modelo.parent !== maos) maos.add(modelo);
        else if (!querNaMao && modelo.parent === maos) maos.remove(modelo);
        modelo.visible = querNaMao;
      }

      // Com esqueleto, agachar e deitar são POSE, e a malha não encolhe.
      //
      // A escala em Y foi o que houve enquanto não havia pose: ela funcionava
      // pra agachar — um homem agachado ocupa mais ou menos a mesma planta —
      // e mentia pra deitar, onde o corpo tem dois metros de comprimento e o
      // que estava em jogo era um tijolo de meio metro. Sem rig não há pose
      // pra aplicar, e aí o achatamento continua sendo o melhor que dá.
      const achatar = rig ? 1 : soldier.height / ALTURA;
      grupo.scale.set(escalaBase.x, escalaBase.y * achatar, escalaBase.z);

      if (soldier.alive) {
        grupo.position.set(soldier.x, soldier.feetY, soldier.z);
        grupo.rotation.set(0, soldier.yaw, 0);
        // A pose não é recalculada todo quadro em bot sem detalhe.
        //
        // `repousar` reescreve os dezenove ossos e o solavanco reescreve por
        // cima, e isso roda pra trezentos corpos sessenta vezes por segundo —
        // medido, `bot.update` era 3,71 dos 5,61 ms de IA, mais que o cérebro
        // inteiro. A oito vezes por segundo um soldado a duzentos metros anda
        // igual: o que se vê a essa distância é ele mudar de lugar, não a
        // perna dele mudar de fase.
        soldier.atePose = (soldier.atePose ?? 0) - delta;
        // A fase é circular: quem cruza o 1 volta pro 0, e a diferença crua
        // daria 0,99 de salto onde houve 0,01 de passo.
        const bruto = Math.abs(soldier.fase - (soldier.faseNaPose ?? 0));
        const andouNoCiclo = Math.min(bruto, 1 - bruto);
        const refazPose = soldier.detalhado
          || soldier.atePose <= 0
          || andouNoCiclo >= CICLO_POR_POSE;
        if (refazPose) {
          soldier.atePose = POSE_INTERVALO;
          soldier.faseNaPose = soldier.fase;
        }

        // A fase da passada anda com a DISTÂNCIA, e a distância é medida
        // aqui em vez de lida de `soldier.speed`: aquele é escrito pelo
        // cérebro, e alvo de treino, bot empurrado por veículo e qualquer
        // corpo sem cérebro andariam com as pernas paradas. Se o corpo saiu
        // do lugar, a perna se mexeu.
        const andou = Math.hypot(soldier.x - eraX, soldier.z - eraZ);
        eraX = soldier.x;
        eraZ = soldier.z;
        const indo = delta > 0 ? andou / delta : 0;
        soldier.fase = avancarFase(soldier.fase, andou, indo, CORRIDA_ACIMA);
        // O embalo roda TODO quadro, não só quando a pose é refeita: ele é
        // a suavização, e amostrá-la a 8 Hz seria suavizar aos trancos.
        soldier.embalo = embalarPara(soldier.embalo, indo, delta);

        if (rig && refazPose) rig.repousar();
        if (rig && refazPose) {
          const deitado = soldier.postura === 'deitado';
          // Deitado o ciclo de passada não vale: rastejar é outro movimento,
          // e a passada em pé aplicada a um corpo no chão vira perna
          // pedalando no ar. Até rastejar existir, quem está no chão fica
          // com a pose da postura e mais nada.
          const passo = passoEm(
            soldier.fase, deitado ? 0 : indo, CORRIDA_ACIMA, PERNAS,
            deitado ? 0 : soldier.embalo
          );
          rig.aplicarPose(passo.pose);
          // A rolagem vai no TRONCO, não no quadril: no quadril ela levaria
          // as duas pernas junto, e o que balança andando é o tronco sobre
          // as pernas, não as pernas sobre o chão.
          if (passo.rolagem) rig.aplicarPose({ spine: [0, 0, passo.rolagem] });
          rig.erguerQuadril(passo.subida);
          balancoDaArma = passo.arma;

          // A postura entra DEPOIS da passada e por cima dela: ela é o
          // desvio maior, e o quadril dela é deslocamento de corpo, não
          // balanço de passo.
          const pose = POSTURAS[soldier.postura] ?? POSTURAS.pe;
          if (soldier.postura !== 'pe') {
            rig.aplicarPose(pose.ossos);
            // O apoio vem MEDIDO do mesmo gabarito de que a hitbox sai: se a
            // caixa pousa no chão e a malha não, a bala acerta acima do
            // corpo. Um número, uma fonte, os dois de acordo por construção.
            rig.moverQuadril(
              pose.quadril[0],
              pose.quadril[1] + apoioDaPostura(soldier.postura),
              pose.quadril[2]
            );
          }
          porteDaPostura = pose;
        }
        // A arma vem ANTES do solavanco: o solavanco é um desvio por cima da
        // pose, e por cima de uma pose que ainda não existe ele não desvia
        // nada. Só quem tem detalhe segura de verdade — longe é silhueta.
        // Sem `detalhado`: o LOD decide se a MALHA da arma existe, não se o
        // soldado a está segurando. Amarrar a pose do braço ao LOD fazia o
        // bot a quinze metros erguer e baixar os braços quatro vezes por
        // segundo, e isso lê como animação quebrada — foi a queixa.
        if (rig && refazPose) segurarArma();
        if (rig && refazPose && soldier.solavanco) {
          soldier.solavanco.restante -= delta;
          if (soldier.solavanco.restante <= 0) {
            soldier.solavanco = null;
          } else {
            // sai cheio e volta suave: o pico é o instante do tiro
            const k = soldier.solavanco.restante / SOLAVANCO_TEMPO;
            rig.aplicarPose({ [soldier.solavanco.osso]: soldier.solavanco.angulos },
              k * k * (3 - 2 * k));
          }
        }
      } else if (rig) {
        // O corpo passa a viver em coordenadas de MUNDO: o solver resolve as
        // juntas lá, e deixar o grupo com posição e giro próprios faria a
        // transformação ser aplicada duas vezes.
        grupo.position.set(0, 0, 0);
        grupo.rotation.set(0, 0, 0);
        // O empurrão do tiro entra repartido nos primeiros quadros, na junta
        // que ele acertou — que a esta altura já se moveu.
        if (soldier.impacto && soldier.impacto.restante > 0) {
          const alvo = ragdoll.posicaoDe(soldier.impacto.junta, centroQueda);
          if (alvo) {
            ragdoll.empurrar(alvo, soldier.impacto.dir, soldier.impacto.forca,
              IMPACTO_RAIO, delta);
          }
          soldier.impacto.restante--;
        }

        // Corpo assentado custa ZERO. Enquanto ele se mexe são os dezenove
        // ossos resolvidos por quadro mais a varredura de colisores em volta;
        // depois que o solver dorme nada disso muda de resultado, e um corpo
        // fica cinco segundos na tela — com o tiroteio inteiro caído ao mesmo
        // tempo, isso é a conta que sobra do combate.
        //
        // A pose é aplicada DEPOIS do passo, ou seja o quadro em que ele
        // dorme ainda desenha a posição final. Quem acordar o solver de novo
        // — `empurrar`, o dia em que cadáver levar coice de granada — volta a
        // pagar sozinho, sem nada aqui precisar saber disso.
        if (!ragdoll.dormindo) {
          ragdoll.posicaoDe('hips', centroQueda);
          perto.length = 0;
          for (const outro of colliders) {
            if (outro === collider) continue;
            if (outro.box.distanceToPoint(centroQueda) < PERTO_DO_CORPO) perto.push(outro);
          }
          ragdoll.passo(delta, { alturaEm: terrain.heightAt, caixas: perto });
          rig.aplicarRagdoll(ragdoll);
          acompanharRecorte();
        }
      } else if (queda.angulo < DEITADO) {
        grupo.position.set(soldier.x, soldier.feetY, soldier.z);
        // Pêndulo em torno dos PÉS: a origem do grupo está neles, então
        // girar o grupo é girar o corpo em volta do ponto em que ele estava
        // apoiado — que é como um corpo desaba.
        queda.velocidade += QUEDA_PESO * Math.sin(queda.angulo) * delta;
        queda.angulo = Math.min(DEITADO, queda.angulo + queda.velocidade * delta);
        // o tombo é em torno de um eixo do MUNDO, e o yaw continua sendo do
        // corpo: por isso um multiplica o outro em vez de virar rotation.x
        giroDeitar.setFromAxisAngle(queda.eixo, queda.angulo);
        giroYaw.setFromAxisAngle(CIMA, soldier.yaw);
        grupo.quaternion.copy(giroDeitar).multiply(giroYaw);
      }

      // A caixa anda com o corpo, e o índice espacial precisa saber. Sem isto
      // ele continua apontando pro lugar onde o bot NASCEU: o jogador esbarra
      // num bot que não está mais lá e atravessa o que está, e as células de
      // nascimento acumulam trezentas caixas mortas que toda consulta
      // percorre. `moveu` sai barato porque só faz trabalho quando o corpo
      // muda de célula.
      caixa.min.set(soldier.x - PLAYER.RADIUS, soldier.feetY, soldier.z - PLAYER.RADIUS);
      caixa.max.set(
        soldier.x + PLAYER.RADIUS,
        soldier.feetY + (soldier.alive ? soldier.height : 0.25),
        soldier.z + PLAYER.RADIUS
      );
      colliders.moveu?.(collider);

      if (soldier.flash > 0) {
        soldier.flash = Math.max(0, soldier.flash - delta * 7);
        const calor = soldier.flash * 0.34;
        for (const alvo of painted) {
          const material = alvo.isMesh ? alvo.material : alvo;
          material.emissive?.setRGB(calor, calor * 0.06, calor * 0.04);
        }
      }

      // O corpo fica na tela depois de cair: morte que apaga o soldado no
      // quadro do tiro tira do jogador a única confirmação que ele tem de
      // longe. Some junto com o espólio, e antes de o bot renascer.
      grupo.visible = soldier.alive || soldier.downFor < CORPO_TEMPO;
    },

    /** Volta ao combate num lugar novo. */
    respawn(nx, nz) {
      soldier.x = nx;
      soldier.z = nz;
      soldier.feetY = terrain.heightAt(nx, nz);
      soldier.health = VIDA;
      soldier.alive = true;
      soldier.crouching = false;
      soldier.deitado = false;
      soldier.downFor = 0;
      soldier.solavanco = null;
      soldier.impacto = null;
      soldier.fase = 0;
      soldier.faseNaPose = 0;
      soldier.embalo = 0;
      eraX = nx;
      eraZ = nz;
      // De volta em pé o corpo volta a viver no grupo, e a esfera que o
      // ragdoll deixou apontando pro chão barraria o soldado inteiro. Nula,
      // o three remede na primeira consulta.
      for (const malha of malhas) malha.boundingSphere = null;
      queda.angulo = 0;
      queda.velocidade = 0;
      grupo.quaternion.identity();
      soldier.swapping = 0;
      soldier.swapPara = -1;
      for (const arma of soldier.weapons) {
        if (arma.ammo) arma.ammo.loaded = arma.firearm.magazine;
      }
    }
  };

  soldier.downFor = 0;
  soldier.hurtFor = 99;
  soldier.solavanco = null;
  soldier.impacto = null;
  return soldier;
}

export const SOLDIER = {
  ALTURA, ALTURA_AGACHADO, ALTURA_DEITADO, RAIO_ALVO, VIDA, CORPO_TEMPO
};
