import * as THREE from 'three';

/**
 * O que fica sem chão, cai.
 *
 * Cavar embaixo de uma árvore, de uma pedra ou de uma parede deixaria o
 * objeto pendurado no ar — e nada quebra mais a ilusão de um terreno de
 * verdade do que isso. Aqui cada prop guarda a altura em que assentou; se o
 * terreno abaixo dele descer, ele desaba até o chão novo e tomba pro lado
 * que perdeu apoio.
 *
 * Não é motor de física: é queda com tombo, que é o que a cena pede. O
 * colisor desce junto, senão o objeto cairia só de mentira e o jogador
 * continuaria esbarrando no ar onde ele estava.
 *
 * Só o que a pazada tocou é reavaliado. Prop parado não custa nada.
 */

const GRAVIDADE = 17;
const TOMBO_MAX = 1.15;        // radianos: cai deitado, não vira de cabeça
const TOMBO_POR_METRO = 1.6;   // quanto tombar por metro de queda
const DESNIVEL_MIN = 0.06;     // abaixo disso o prop está apoiado, não flutuando
const ASSENTA = 0.18;          // rapidez do endireitar final

export function createSettling(terrain) {
  const props = [];
  const caindo = [];

  const matriz = new THREE.Matrix4();
  const auxiliar = new THREE.Matrix4();
  const eixo = new THREE.Vector3();
  const canto = new THREE.Vector3();

  /**
   * Registra um prop que pode desabar.
   *
   * `parts` são as malhas que o desenham: uma árvore instanciada tem tronco e
   * duas copas, uma parede tem uma malha só. `collider` é o que a colisão vê.
   */
  function register({ x, z, baseY, radius, collider, parts }) {
    const prop = {
      x, z, baseY, radius, collider, parts,
      // Caixa de pé, guardada porque a de colisão é reescrita a cada quadro
      // da queda: sem o original, tombar duas vezes cresceria em cima de si.
      pegada: collider ? collider.box.clone() : null,
      eixoX: 1,
      eixoZ: 0,
      queda: 0,        // quanto já desceu
      tombo: 0,        // inclinação atual
      alvoTombo: 0,
      velocidade: 0,
      ativo: false,
      original: null
    };
    props.push(prop);
    return prop;
  }

  /**
   * Chão sob o prop: a altura no centro, que é onde ele assenta, e o
   * desnível em volta, que é o que o faz tombar.
   *
   * O centro é quem manda na queda de propósito. Usando o ponto mais fundo
   * da vizinhança, um prop assentava dentro do buraco cavado ao lado e ficava
   * meio metro enterrado — descia demais em vez de tombar.
   */
  function apoioDe(prop) {
    const r = prop.radius * 0.7;
    const centro = terrain.heightAt(prop.x, prop.z);
    let menor = centro;
    let maior = centro;

    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      const h = terrain.heightAt(prop.x + dx, prop.z + dz);
      if (h < menor) menor = h;
      if (h > maior) maior = h;
    }
    return { centro, menor, maior };
  }

  /** Guarda as matrizes de origem na hora em que o prop começa a cair. */
  function congelar(prop) {
    prop.original = prop.parts.map((parte) => {
      if (parte.instanced) {
        const m = new THREE.Matrix4();
        parte.mesh.getMatrixAt(parte.index, m);
        return m;
      }
      return parte.mesh.matrix.clone();
    });
  }

  // matrizes de trabalho, reaproveitadas: um prop caindo não deve alocar
  const giro = new THREE.Matrix4();
  const paraBase = new THREE.Matrix4();
  const daBase = new THREE.Matrix4();
  const desce = new THREE.Matrix4();
  const composto = new THREE.Matrix4();

  /** Escreve queda e tombo nas malhas e no colisor. */
  function aplicar(prop) {
    // Gira em volta da base, não do centro: o pé fica no lugar e o topo cai,
    // que é como uma árvore descalçada tomba de verdade.
    eixo.set(prop.eixoX, 0, prop.eixoZ).normalize();
    giro.makeRotationAxis(eixo, prop.tombo);

    paraBase.makeTranslation(prop.x, prop.baseY, prop.z);
    daBase.makeTranslation(-prop.x, -prop.baseY, -prop.z);
    desce.makeTranslation(0, -prop.queda, 0);

    matriz.copy(desce).multiply(paraBase).multiply(giro).multiply(daBase);

    prop.parts.forEach((parte, i) => {
      composto.multiplyMatrices(matriz, prop.original[i]);

      if (parte.instanced) {
        parte.mesh.setMatrixAt(parte.index, composto);
        parte.mesh.instanceMatrix.needsUpdate = true;
      } else {
        composto.decompose(parte.mesh.position, parte.mesh.quaternion, parte.mesh.scale);
        parte.mesh.updateMatrix();
      }
    });

    if (prop.collider) {
      // A caixa sai dos oito cantos da caixa de pé passados pela MESMA matriz
      // que move a malha. É o único jeito de ela não poder discordar do que
      // se vê.
      //
      // Antes aqui tinha conta fechada — pegada esticada pelo alcance do topo
      // e altura por `altura·cos + raio·sen`. Funcionava em poste e errava em
      // laje larga e baixa: o topo do colisor de um obstáculo do campo de
      // treino ficava 91 cm acima do bloco caído, e o jogador ficava de pé a
      // um metro e meio no ar. Aproximar o que dá pra calcular exato só cria
      // um segundo modelo pra manter de acordo com o primeiro.
      const { pegada } = prop;
      const caixa = prop.collider.box;
      caixa.makeEmpty();

      for (let i = 0; i < 8; i++) {
        canto.set(
          i & 1 ? pegada.max.x : pegada.min.x,
          i & 2 ? pegada.max.y : pegada.min.y,
          i & 4 ? pegada.max.z : pegada.min.z
        ).applyMatrix4(matriz);
        caixa.expandByPoint(canto);
      }
    }
  }

  return {
    props,
    register,

    /** Quantos props estão desabando agora. Usado por teste e depuração. */
    get falling() {
      return caindo.length;
    },

    /**
     * Reavalia os props perto de (x, z). Chamado depois de cada pazada:
     * varrer o mapa inteiro a cada cavada seria absurdo, e desnecessário.
     */
    disturb(x, z, radius) {
      const alcance = radius + 6;

      for (const prop of props) {
        if (prop.ativo) continue;
        if (Math.hypot(prop.x - x, prop.z - z) > alcance) continue;

        const apoio = apoioDe(prop);
        const pe = prop.baseY - prop.queda;

        // Desaba se o chão sob o centro sumiu, e tomba se ficou torto. Cavar
        // ao lado inclina sem afundar; cavar embaixo faz as duas coisas.
        const perdeuChao = pe - apoio.centro > DESNIVEL_MIN;
        const ficouTorto = apoio.maior - apoio.menor > DESNIVEL_MIN * 4;
        if (!perdeuChao && !ficouTorto) continue;

        // perdeu chão: desaba, e tomba pro lado mais fundo
        if (!prop.original) congelar(prop);

        let melhorX = 0;
        let melhorZ = 0;
        let maisFundo = Infinity;
        const r = prop.radius * 0.7;
        for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
          const h = terrain.heightAt(prop.x + dx, prop.z + dz);
          if (h < maisFundo) {
            maisFundo = h;
            melhorX = dx;
            melhorZ = dz;
          }
        }
        // Eixo perpendicular à descida, e o SINAL importa: girando em volta
        // dele o corpo tem que ir pro buraco, não pra longe dele. Invertido,
        // cavar de um lado da parede jogava ela pro outro — parecia empurrão,
        // não desmoronamento.
        prop.eixoX = melhorZ;
        prop.eixoZ = -melhorX;
        if (prop.eixoX === 0 && prop.eixoZ === 0) prop.eixoX = 1;

        prop.ativo = true;
        prop.velocidade = 0;
        caindo.push(prop);
      }
    },

    update(delta) {
      for (let i = caindo.length - 1; i >= 0; i--) {
        const prop = caindo[i];
        const apoio = apoioDe(prop);
        const destino = prop.baseY - apoio.centro;

        prop.velocidade += GRAVIDADE * delta;
        prop.queda = Math.min(destino, prop.queda + prop.velocidade * delta);

        // tomba proporcional ao quanto desabou, até deitar
        prop.alvoTombo = Math.min(TOMBO_MAX,
          (apoio.maior - apoio.menor) * TOMBO_POR_METRO);
        prop.tombo += (prop.alvoTombo - prop.tombo) * Math.min(1, delta / ASSENTA);

        aplicar(prop);

        const assentou = prop.queda >= destino - 1e-4
          && Math.abs(prop.alvoTombo - prop.tombo) < 0.01;
        if (assentou) {
          prop.ativo = false;
          prop.velocidade = 0;
          caindo.splice(i, 1);
        }
      }
    }
  };
}
