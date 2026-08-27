import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { spawnIsClear } from '../player/collision.js';
import { addBox, material, BOX } from './props.js';
import { assentar, MADEIRA_ESCURA } from './construcao.js';

/**
 * Tenda de tratamento: o lugar em que a vida volta.
 *
 * Ela existe porque a regra precisa de um corpo. `game/tratamento.js` cura
 * quem está a 3,4 m dela, e sem um objeto no chão essa regra é invisível — o
 * jogador não tem como saber onde se trata, e regra que não se vê não é
 * mecânica, é sorte.
 *
 * NADA NA TENDA PARA BALA, e isso é a decisão de projeto dela. A lona barra o
 * CORPO (pano amarrado não se atravessa, e é o que faz a porta ser porta) e
 * deixa passar o tiro — e, pela mesma função, a linha de visão do bot. É o
 * arbusto ao contrário: ele não barra nada e só tapa; ela barra só o corpo.
 * Um pano que segurasse 7,92 mm leria como bug, e uma tenda que escondesse
 * viraria caixa de invisibilidade com cura dentro. A enfermaria não protege de
 * NADA, e é isso que faz oito segundos deitado ali serem uma aposta.
 *
 * Ela também não achata o terreno: assenta no ponto mais baixo da pegada e
 * enterra o resto, como toda construção desta base. E a porta tem a altura
 * INTEIRA da parede, então não há verga pra soleira enterrada comer.
 */

export const ENFERMARIA = {
  LARGURA: 5.6,      // ao longo do eixo u (a frente)
  FUNDO: 4.4,        // ao longo do eixo v (a profundidade)
  PAREDE: 2.05,      // pé-direito da lona: passa o jogador de 1,70 em pé
  CUMEEIRA: 1.05,    // do topo da parede até a linha do cume
  PORTA: 1.9,        // vão da entrada, sem verga e sem peitoril
  ESPESSURA: 0.14
};

const PANO = 0x7d8557;          // lona clara: ela tem que se achar no verde
const PANO_ESCURO = 0x646b45;
const BRANCO = 0xd8d4c6;
const CRUZ = 0xb3372f;

/** Um quarto de volta por vez: a colisão só entende AABB. */
function girar(u, v, quarto) {
  switch (((quarto % 4) + 4) % 4) {
    case 1: return [v, -u];
    case 2: return [-u, -v];
    case 3: return [-v, u];
    default: return [u, v];
  }
}

/**
 * Cria a tenda com o centro em (x, z) — que é o centro da zona de tratamento.
 *
 * `quarto` gira a entrada em passos de 90°: o autor do mapa vira a porta pro
 * lado de quem defende. Girar 30° faria a caixa envolvente virar parede
 * invisível a metros da lona, o mesmo problema da casa na diagonal.
 */
export function addEnfermaria(scene, colliders, {
  x, z, quarto = 0, terrain, settling = null, nome = 'enfermaria'
}) {
  const E = ENFERMARIA;
  const { base } = assentar(terrain, x, z, Math.max(E.LARGURA, E.FUNDO) / 2);
  const y = base - 0.12;
  const impar = ((quarto % 2) + 2) % 2 === 1;

  // Lona: barra o corpo, não barra a bala. `standable: false` porque não se
  // fica de pé em cima de uma tenda.
  const lona = (u, v, du, dv, altura, cor, base_ = y) => {
    const [dx, dz] = girar(u, v, quarto);
    addBox(scene, colliders, {
      settling, x: x + dx, z: z + dz, y: base_,
      w: impar ? dv : du, h: altura, d: impar ? du : dv,
      color: cor, standable: false, balaPassa: true
    });
  };

  // Fundo e laterais fechados; a frente tem o vão.
  lona(0, -E.FUNDO / 2, E.LARGURA, E.ESPESSURA, E.PAREDE, PANO_ESCURO);
  for (const lado of [-1, 1]) {
    lona(lado * E.LARGURA / 2, 0, E.ESPESSURA, E.FUNDO, E.PAREDE, PANO);
  }

  // As duas abas da entrada. Cada uma vai da borda da tenda até a borda do
  // vão, e a porta sobe até o teto: sem verga, a soleira enterrada não come
  // altura de passagem nenhuma — foi isso que deixou a porta dos fundos de
  // uma casa desenhada e intransponível.
  const aba = (E.LARGURA - E.PORTA) / 2;
  for (const lado of [-1, 1]) {
    lona(lado * (E.PORTA + aba) / 2, E.FUNDO / 2, aba, E.ESPESSURA, E.PAREDE, PANO);
  }

  // Duas águas de lona, SEM colisor: ninguém sobe num telhado de tenda e
  // ninguém encosta a cabeça nele em pé. Colisor ali só teria uma consequência
  // — parar bala vinda de cima —, que é exatamente o que a tenda não faz.
  //
  // O SINAL da inclinação sai do deslocamento já girado, não do lado local:
  // com `quarto` 2 o girar inverte o eixo e a água tombava pro lado contrário
  // do beiral. Medir o sinal onde ele acontece é uma linha; deduzi-lo errou.
  const vao = E.FUNDO / 2 + 0.3;
  const inclinacao = Math.atan2(E.CUMEEIRA, vao);
  const face = Math.hypot(vao, E.CUMEEIRA);
  const comprido = E.LARGURA + 0.6;
  for (const lado of [-1, 1]) {
    const agua = new THREE.Mesh(BOX, material(lado < 0 ? PANO : PANO_ESCURO));
    const [dx, dz] = girar(0, lado * vao / 2, quarto);
    agua.scale.set(impar ? face : comprido, 0.1, impar ? comprido : face);
    agua.position.set(x + dx, y + E.PAREDE + E.CUMEEIRA / 2, z + dz);
    if (impar) agua.rotation.z = -Math.sign(dx) * inclinacao;
    else agua.rotation.x = Math.sign(dz) * inclinacao;
    scene.add(agua);
  }

  // Oitão em degraus nas duas pontas — sem eles a tenda fica com dois buracos
  // triangulares por onde se vê o vazio. Só malha: eles ficam acima da parede.
  for (const lado of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const fatia = comprido * (1 - i / 2);
      const degrau = new THREE.Mesh(BOX, material(i ? PANO : PANO_ESCURO));
      const [dx, dz] = girar(0, lado * (E.FUNDO / 2 - 0.02), quarto);
      degrau.scale.set(impar ? 0.1 : fatia, E.CUMEEIRA / 2, impar ? fatia : 0.1);
      degrau.position.set(
        x + dx, y + E.PAREDE + (i + 0.5) * (E.CUMEEIRA / 2), z + dz);
      scene.add(degrau);
    }
  }

  // Duas macas. Elas param o corpo e não param a bala, como a lona: cama de
  // pano e madeira não é parapeito. Se a maca barrasse tiro, deitar-se atrás
  // dela seria a melhor cobertura do mapa — dentro do único lugar que cura.
  for (const lado of [-1, 1]) {
    const [dx, dz] = girar(lado * 1.75, -0.45, quarto);
    addBox(scene, colliders, {
      settling, x: x + dx, z: z + dz, y,
      w: impar ? 1.9 : 0.66, h: 0.46, d: impar ? 0.66 : 1.9,
      color: BRANCO, standable: true, balaPassa: true
    });
    const [ex, ez] = girar(lado * 1.75, -1.5, quarto);
    addBox(scene, colliders, {
      settling, x: x + ex, z: z + ez, y, w: 0.5, h: 0.62, d: 0.5,
      color: MADEIRA_ESCURA, standable: true, balaPassa: true
    });
  }

  // A cruz no oitão da frente. Ela é o que se lê a cinquenta metros, e é
  // vermelha sobre branco porque é a única marca do mapa que não é de time:
  // enfermaria é de quem tem o posto, e a cor dela não diz de quem.
  const painel = new THREE.Mesh(BOX, material(BRANCO));
  const [px, pz] = girar(0, E.FUNDO / 2 + 0.06, quarto);
  painel.scale.set(impar ? 0.06 : 1.15, 0.9, impar ? 1.15 : 0.06);
  painel.position.set(x + px, y + E.PAREDE + 0.45, z + pz);
  scene.add(painel);
  for (const [w, h] of [[0.78, 0.22], [0.22, 0.72]]) {
    const barra = new THREE.Mesh(BOX, material(CRUZ));
    barra.scale.set(impar ? 0.02 : w, h, impar ? w : 0.02);
    barra.position.set(x + px * 1.06, y + E.PAREDE + 0.45, z + pz * 1.06);
    scene.add(barra);
  }

  /**
   * Tenda com prop dentro não trata ninguém, e o sintoma é uma enfermaria que
   * o jogador vê e não consegue usar — sem erro nenhum. Estoura na montagem,
   * como a vaga do jipe, e a mensagem diz a coordenada: o conserto é no mapa.
   */
  const [ix, iz] = girar(0, -0.2, quarto);
  const [bx, bz] = girar(0, E.FUNDO / 2 - 0.5, quarto);
  for (const [px_, pz_, onde] of [[ix, iz, 'o miolo'], [bx, bz, 'a porta']]) {
    const chao = terrain.heightAt(x + px_, z + pz_);
    if (spawnIsClear(colliders, x + px_, z + pz_, chao, PLAYER.HEIGHT)) continue;
    throw new Error(
      `${onde} da ${nome} em (${(x + px_).toFixed(0)}, ${(z + pz_).toFixed(0)}) ` +
      'está dentro de geometria: ninguém seria tratado ali'
    );
  }

  return { x, z, quarto };
}
