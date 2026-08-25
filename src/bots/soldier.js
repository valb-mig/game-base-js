import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { collides, groundHeightAt } from '../player/collision.js';
import { teamOf } from '../game/teams.js';
import { createItemModel } from '../items/models.js';
import { SWAP } from '../config.js';

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
const RAIO_ALVO = 0.5;       // esfera de acerto, do quadril à cabeça
const ALTURA = 1.75;
const ALTURA_AGACHADO = 1.15;

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
  const { grupo, painted } = construirCorpo(teamOf(team));
  scene.add(grupo);

  // materiais próprios: piscar de dano num não pode acender os outros
  for (const mesh of painted) mesh.material = mesh.material.clone();

  // Arma na mão, do lado direito e na altura do peito. Os modelos nascem com
  // o cano no -Z, que é a frente do soldado — o mesmo que vale pro viewmodel.
  //
  // Um modelo por arma, criado uma vez e escondido: trocar de arma é ligar e
  // desligar visibilidade. Criar e destruir a cada troca daria churn de GPU
  // num bot que troca de arma no meio do tiroteio.
  const maos = new THREE.Group();
  maos.position.set(0.21, 0.92, 0.26);
  grupo.add(maos);

  const modelos = new Map();
  for (const arma of weapons) {
    const modelo = createItemModel(arma);
    if (!modelo) continue;
    modelo.visible = false;
    maos.add(modelo);
    modelos.set(arma.id, modelo);
  }

  const meio = new THREE.Vector3();
  const caixa = new THREE.Box3();
  const collider = { box: caixa, standable: false };
  colliders.push(collider);

  const soldier = {
    id,
    team,
    name: `${teamOf(team).short} ${id}`,
    group: grupo,
    collider,
    radius: RAIO_ALVO,

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

    /** Centro do tronco: é onde a bala do outro tem que passar. */
    center() {
      return meio.set(soldier.x, soldier.feetY + soldier.height * 0.62, soldier.z);
    },

    /** De onde ELE atira: altura do olho. */
    eye(out) {
      return out.set(soldier.x, soldier.feetY + soldier.height - 0.14, soldier.z);
    },

    damage(amount) {
      if (!soldier.alive) return { target: soldier, amount: 0, killed: false };

      soldier.health = Math.max(0, soldier.health - amount);
      soldier.flash = 1;
      soldier.hurtFor = 0;

      const killed = soldier.health === 0;
      if (killed) {
        soldier.alive = false;
        soldier.downFor = 0;
        caixa.max.y = soldier.feetY + 0.25;   // caído não barra passagem
      }
      return { target: soldier, amount, killed };
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

      // só a arma do slot atual aparece
      const naMao = soldier.weapon?.id ?? null;
      for (const [id, modelo] of modelos) modelo.visible = soldier.alive && id === naMao;

      grupo.position.set(soldier.x, soldier.feetY, soldier.z);
      grupo.rotation.y = soldier.yaw;
      grupo.scale.y = soldier.height / ALTURA;

      caixa.min.set(soldier.x - PLAYER.RADIUS, soldier.feetY, soldier.z - PLAYER.RADIUS);
      caixa.max.set(
        soldier.x + PLAYER.RADIUS,
        soldier.feetY + (soldier.alive ? soldier.height : 0.25),
        soldier.z + PLAYER.RADIUS
      );

      if (soldier.flash > 0) {
        soldier.flash = Math.max(0, soldier.flash - delta * 7);
        const calor = soldier.flash * 0.34;
        for (const mesh of painted) {
          mesh.material.emissive.setRGB(calor, calor * 0.06, calor * 0.04);
        }
      }

      grupo.visible = soldier.alive;
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
      soldier.swapping = 0;
      soldier.swapPara = -1;
      for (const arma of soldier.weapons) {
        if (arma.ammo) arma.ammo.loaded = arma.firearm.magazine;
      }
    }
  };

  soldier.downFor = 0;
  soldier.hurtFor = 99;
  return soldier;
}

export const SOLDIER = { ALTURA, ALTURA_AGACHADO, RAIO_ALVO, VIDA };
