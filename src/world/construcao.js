import * as THREE from 'three';
import { addBox, material, BOX, CYLINDER } from './props.js';

/**
 * Peças de construção compartilhadas pelos seis pontos do mapa.
 *
 * A paleta mora aqui e não em `config.js` pelo mesmo motivo que a de
 * `base.js`: não são números de ajuste, são escolhas de material. Normandia
 * de 1944 é pedra calcária clara, reboco, ardósia escura e madeira — nada de
 * cor saturada, porque o que tem que se destacar no mapa é a farda e a
 * bandeira, não a parede.
 */

export const PEDRA = 0xb8b2a2;
export const PEDRA_ESCURA = 0x9a9484;
export const REBOCO = 0xd6cdb8;
export const TELHA = 0x584f4a;
export const TELHA_CLARA = 0x6d635c;
export const MADEIRA = 0x6b4f33;
export const MADEIRA_ESCURA = 0x4a3524;
export const CONCRETO = 0x9a9791;
export const CONCRETO_ESCURO = 0x7d7a74;
export const SACO = 0x8a8259;
export const SACO_ESCURO = 0x736c49;
export const LONA = 0x707a52;
export const TRIGO = 0xc9a94e;
export const TERRA_REMEXIDA = 0x6b5334;

/**
 * A altura em que uma construção assenta, e o quanto ela precisa afundar.
 *
 * Prédio é corpo rígido: erguer cada parede na altura do chão DELA rasga a
 * casa numa ladeira, e erguer todas na altura do centro deixa um vão por
 * baixo do lado que desce. Nenhum ponto achata o terreno — zona plana não
 * pode cruzar com outra, e o mapa já está cheio delas. Então a construção
 * nasce no ponto mais BAIXO da pegada e enterra o resto: a soleira some no
 * barranco, que é o que acontece com casa de pedra em terreno inclinado.
 */
export function assentar(terrain, x, z, raio) {
  let menor = terrain.heightAt(x, z);
  let maior = menor;
  for (const [dx, dz] of [[raio, 0], [-raio, 0], [0, raio], [0, -raio],
    [raio, raio], [-raio, -raio], [raio, -raio], [-raio, raio]]) {
    const h = terrain.heightAt(x + dx, z + dz);
    if (h < menor) menor = h;
    if (h > maior) maior = h;
  }
  return { base: menor, desnivel: maior - menor };
}

/**
 * Telhado de duas águas: dois planos inclinados sobre a caixa da casa.
 *
 * Sem colisor de forma, só uma caixa envolvente — e ela é segura porque fica
 * ACIMA da cabeça: `collides` só devolve verdadeiro quando a caixa cruza a
 * faixa entre o degrau e o topo do corpo, e um telhado a três metros nunca
 * cruza. Dar forma exata ao colisor de telhado seria pagar oito caixas por
 * casa pra descrever o que ninguém encosta.
 */
export function duasAguas(scene, colliders, {
  x, y, z, w, d, altura, cor = TELHA, beiral = 0.35, aoLongoDeX = false
}) {
  const vao = (aoLongoDeX ? d : w) / 2 + beiral;
  const inclinacao = Math.atan2(altura, vao);
  const face = Math.hypot(vao, altura);
  const comprido = (aoLongoDeX ? w : d) + beiral * 2;

  for (const lado of [-1, 1]) {
    const agua = new THREE.Mesh(BOX, material(cor));
    agua.scale.set(aoLongoDeX ? comprido : face, 0.16, aoLongoDeX ? face : comprido);
    agua.position.set(
      x + (aoLongoDeX ? 0 : lado * vao / 2),
      y + altura / 2,
      z + (aoLongoDeX ? lado * vao / 2 : 0)
    );
    if (aoLongoDeX) agua.rotation.x = lado * inclinacao;
    else agua.rotation.z = -lado * inclinacao;
    scene.add(agua);
  }

  // Empena: o oitão que fecha as duas pontas do telhado. Sem ela a casa fica
  // com dois buracos por onde se vê o interior vazio.
  //
  // São DEGRAUS, não uma pirâmide. A primeira versão usava `PYRAMID`, que é
  // um cone de quatro lados — simétrico nos dois eixos do plano. Medido: numa
  // casa de 11,4 m ele estourava 5,7 m pra fora da parede de cada lado e a
  // pegada da casa saía com 22,5 m, quase o dobro. Oitão é triangular num
  // eixo e FINO no outro, e nenhum sólido de revolução faz isso — três caixas
  // encolhendo fazem, e ficam alinhadas aos eixos de quebra.
  const DEGRAUS = 3;
  const largo = aoLongoDeX ? d : w;
  for (const lado of [-1, 1]) {
    for (let i = 0; i < DEGRAUS; i++) {
      const t = i / DEGRAUS;
      const fatia = largo * (1 - t) + beiral * 2 * (1 - t);
      const degrau = new THREE.Mesh(BOX, material(cor));
      degrau.scale.set(
        aoLongoDeX ? 0.22 : fatia,
        altura / DEGRAUS,
        aoLongoDeX ? fatia : 0.22
      );
      degrau.position.set(
        x + (aoLongoDeX ? lado * (w / 2 - 0.05) : 0),
        y + (i + 0.5) * (altura / DEGRAUS),
        z + (aoLongoDeX ? 0 : lado * (d / 2 - 0.05))
      );
      scene.add(degrau);
    }
  }

  colliders.push({
    box: new THREE.Box3(
      new THREE.Vector3(x - w / 2 - beiral, y, z - d / 2 - beiral),
      new THREE.Vector3(x + w / 2 + beiral, y + altura, z + d / 2 + beiral)),
    standable: false
  });
}

/**
 * Parede com um vão de porta ou janela.
 *
 * O vão é feito de três caixas — os dois lados e a verga — em vez de uma
 * caixa furada, porque a colisão só entende AABB e um buraco não é AABB. É a
 * mesma solução do bunker de `base.js`.
 */
export function paredeComVao(scene, colliders, {
  x, y, z, largura, altura, espessura, cor, aoLongoDeX = true,
  vaoLargura = 1.1, vaoAltura = 2.1, vaoEm = 0, soleira = 0, peitoril = 0,
  settling = null
}) {
  const caixa = (dx, w, h, yy) => addBox(scene, colliders, {
    settling,
    x: x + (aoLongoDeX ? dx : 0),
    z: z + (aoLongoDeX ? 0 : dx),
    y: yy,
    w: aoLongoDeX ? w : espessura,
    h,
    d: aoLongoDeX ? espessura : w,
    color: cor
  });

  // As duas laterais são DESIGUAIS quando o vão sai do centro.
  //
  // Com `(largura - vaoLargura) / 2` nas duas, deslocar a porta 1,6 m fazia a
  // parede crescer 1,6 m pra fora da casa de um lado — medido, a fachada de
  // uma casa de 11,4 m ia até 7,3 m do centro em vez de 5,7. Cada lateral vai
  // da borda da parede até a borda do vão, e são bordas diferentes.
  const meia = largura / 2;
  const esquerda = (vaoEm - vaoLargura / 2) + meia;
  const direita = meia - (vaoEm + vaoLargura / 2);
  if (esquerda > 0.01) caixa(-meia + esquerda / 2, esquerda, altura, y);
  if (direita > 0.01) caixa(meia - direita / 2, direita, altura, y);

  // A verga sai do CHÃO, não da base da parede.
  //
  // Construção assenta no ponto mais baixo da pegada e enterra o resto, então
  // a base fica abaixo do piso — e medir a porta a partir dela come essa
  // diferença. Medido: a porta dos fundos tinha 1,90 m declarados, 0,35 de
  // soleira enterrada, e sobravam 1,55 de vão livre contra 1,70 de jogador.
  // A porta estava desenhada e não dava passagem.
  const topoDoVao = soleira + peitoril + vaoAltura;
  if (altura > topoDoVao) {
    caixa(vaoEm, vaoLargura, altura - topoDoVao, y + topoDoVao);
  }

  // O PEITORIL é o que separa janela de porta.
  //
  // Sem ele todo vão desce até o piso, e uma casa com quatro janelas vira uma
  // casa com quatro portas: entra-se por qualquer parede e o interior deixa
  // de ser um lugar em que se está — vira um corredor com telhado. Com
  // peitoril, a bala passa e o corpo não, que é a diferença entre uma posição
  // de tiro e uma passagem. É o mesmo peitoril que faz a seteira do bunker
  // ser seteira e não porta de garagem.
  if (peitoril > 0.01) {
    caixa(vaoEm, vaoLargura, soleira + peitoril, y);
  }
}

/** Cerca de estacas com duas travessas. Não barra bala, barra passagem. */
export function cerca(scene, colliders, {
  pontos, altura = 1.15, cor = MADEIRA, terrain, settling = null
}) {
  for (let i = 1; i < pontos.length; i++) {
    const [ax, az] = pontos[i - 1];
    const [bx, bz] = pontos[i];
    const comprimento = Math.hypot(bx - ax, bz - az);
    const passos = Math.max(1, Math.round(comprimento / 2.4));

    for (let p = 0; p <= passos; p++) {
      const t = p / passos;
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      if (p === passos && i < pontos.length - 1) continue;   // não dobra a esquina

      addBox(scene, colliders, {
        settling, x: px, z: pz, y: terrain.heightAt(px, pz) - 0.15,
        w: 0.13, h: altura + 0.15, d: 0.13, color: cor, solid: p % 2 === 0
      });
    }

    // Travessas: uma caixa por trecho, alinhada ao eixo mais comprido. Cerca
    // diagonal vira caixa envolvente gorda, então os cercados são retangulares.
    for (const nivel of [0.42, 0.78]) {
      const meioX = (ax + bx) / 2;
      const meioZ = (az + bz) / 2;
      addBox(scene, colliders, {
        settling, x: meioX, z: meioZ,
        y: terrain.heightAt(meioX, meioZ) + altura * nivel,
        w: Math.abs(bx - ax) > Math.abs(bz - az) ? comprimento : 0.09,
        h: 0.12,
        d: Math.abs(bx - ax) > Math.abs(bz - az) ? 0.09 : comprimento,
        color: cor, solid: nivel > 0.6
      });
    }
  }
}

/** Tambor, engradado, poste — os miúdos que enchem um pátio. */
export function tambor(scene, colliders, { x, z, ground, cor = 0x4c5b3a }) {
  const mesh = new THREE.Mesh(CYLINDER, material(cor));
  mesh.scale.set(0.32, 0.9, 0.32);
  mesh.position.set(x, ground + 0.45, z);
  scene.add(mesh);
  mesh.updateMatrixWorld(true);
  colliders.push({ box: new THREE.Box3().setFromObject(mesh), standable: true });
}
