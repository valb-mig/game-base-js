import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { collides, groundHeightAt } from '../player/collision.js';
import { teamOf } from '../game/teams.js';
import { createItemModel } from '../items/models.js';
import { SWAP } from '../config.js';
import { corpoDe } from '../game/hitboxes.js';
import { criarSoldado, soldadoPronto } from './model.js';
import { criarRig } from './rig.js';
import { createRagdoll } from './ragdoll.js';
import { JUNTAS_PADRAO } from './esqueleto.js';

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
 * Intervalo entre poses de um bot SEM detalhe, em segundos.
 *
 * Oito vezes por segundo. Quem está perto do jogador (`detalhado`) continua
 * a sessenta — é ali que se enxerga a passada.
 */
const POSE_INTERVALO = 1 / 8;

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
  const { grupo, painted, maos: maosDoModelo, rig = null } = construirCorpo(teamOf(team));

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
  // A arma pendura no nó `weapon` do modelo quando ele existe: é o lugar que
  // o artista marcou, e adivinhar outro seria pôr o cano na barriga.
  const maos = maosDoModelo ?? new THREE.Group();
  if (!maosDoModelo) {
    maos.position.set(0.21, 0.92, 0.26);
    grupo.add(maos);
  }

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
    crouching: false,

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
      return corpoDe(soldier.height, saida);
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
      soldier.height = soldier.crouching ? ALTURA_AGACHADO : ALTURA;

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

      grupo.scale.set(escalaBase.x, escalaBase.y * (soldier.height / ALTURA), escalaBase.z);

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
        const refazPose = soldier.detalhado || soldier.atePose <= 0;
        if (refazPose) soldier.atePose = POSE_INTERVALO;

        if (rig && refazPose) rig.repousar();
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

        if (!ragdoll.dormindo) {
          ragdoll.posicaoDe('hips', centroQueda);
          perto.length = 0;
          for (const outro of colliders) {
            if (outro === collider) continue;
            if (outro.box.distanceToPoint(centroQueda) < PERTO_DO_CORPO) perto.push(outro);
          }
          ragdoll.passo(delta, { alturaEm: terrain.heightAt, caixas: perto });
        }
        rig.aplicarRagdoll(ragdoll);
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
      soldier.downFor = 0;
      soldier.solavanco = null;
      soldier.impacto = null;
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

export const SOLDIER = { ALTURA, ALTURA_AGACHADO, RAIO_ALVO, VIDA, CORPO_TEMPO };
