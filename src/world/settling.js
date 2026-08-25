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

// Comprimento de cada fatia de colisor, em metros. Uma caixa alinhada aos
// eixos não representa corpo diagonal: uma parede de 12 m tombada vira uma
// caixa que ocupa todo o retângulo envolvente, e o jogador esbarra em ar.
// Fatiando ao longo do corpo, cada pedaço é curto e a caixa dele cola nele.
const FATIA = 1.4;
const FATIAS_MAX = 8;

// Quanto o lado comprido precisa sair da horizontal pra valer a pena fatiar.
//
// Fatiar tudo que tomba custou caro e adiantou pouco: derrubar 304 props num
// mapa somava 1707 colisores, quase o triplo da lista, e a colisão varre ela
// inteira todo quadro. Parede que deita de lado continua sendo bem descrita
// por uma caixa — o que a caixa não descreve é corpo comprido de PONTA, e
// esse é o único caso que ganha fatia.
const INCLINACAO_MINIMA = 0.3;   // seno: uns 17°

export function createSettling(terrain, colliders = null) {
  const props = [];
  const caindo = [];

  const matriz = new THREE.Matrix4();
  const auxiliar = new THREE.Matrix4();
  const eixo = new THREE.Vector3();
  const canto = new THREE.Vector3();
  const auxTamanho = new THREE.Vector3();
  const fatiaMin = new THREE.Vector3();
  const fatiaMax = new THREE.Vector3();
  const direcaoLonga = new THREE.Vector3();

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
      fatias: null,      // colisores extras, criados só quando ele cai
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

  /**
   * Divide o colisor do prop em pedaços ao longo do lado mais comprido dele.
   *
   * Só acontece quando ele COMEÇA A CAIR: em pé, uma caixa já descreve o
   * corpo com exatidão, e a esmagadora maioria dos props nunca cai. Pagar
   * oito colisores por árvore do mapa inteiro seria trocar um problema
   * visível por um invisível.
   */
  function fatiar(prop) {
    if (prop.fatias || prop.semFatias || !prop.collider || !colliders) return;

    const tamanho = prop.pegada.getSize(auxTamanho);
    const eixoLongo = tamanho.x >= tamanho.y && tamanho.x >= tamanho.z ? 'x'
      : tamanho.y >= tamanho.z ? 'y' : 'z';
    const comprimento = tamanho[eixoLongo];

    const quantas = Math.min(FATIAS_MAX,
      Math.max(1, Math.round(comprimento / FATIA)));
    if (quantas <= 1) {
      prop.semFatias = true;
      return;
    }

    // O lado comprido saiu da horizontal? Se ele continua deitado, uma caixa
    // ainda o descreve bem, e fatiar só engordaria a lista de colisores.
    direcaoLonga.set(
      eixoLongo === 'x' ? 1 : 0,
      eixoLongo === 'y' ? 1 : 0,
      eixoLongo === 'z' ? 1 : 0
    ).applyAxisAngle(eixo.set(prop.eixoX, 0, prop.eixoZ).normalize(), prop.tombo);

    if (Math.abs(direcaoLonga.y) < INCLINACAO_MINIMA) return;

    prop.eixoLongo = eixoLongo;
    prop.fatias = [];

    for (let i = 0; i < quantas; i++) {
      // A primeira fatia reaproveita o colisor que já existe: trocá-lo faria
      // sumir a caixa que outros sistemas já guardaram por referência.
      const colisor = i === 0
        ? prop.collider
        : { box: new THREE.Box3(), standable: prop.collider.standable };
      if (i > 0) colliders.push(colisor);

      const de = prop.pegada.min[eixoLongo] + (comprimento * i) / quantas;
      const ate = prop.pegada.min[eixoLongo] + (comprimento * (i + 1)) / quantas;
      prop.fatias.push({ colisor, de, ate });
    }
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

    if (prop.fatias) {
      // Cada fatia é uma caixa de pé curta, passada pela mesma matriz. A
      // união delas acompanha o corpo diagonal em vez de envolvê-lo.
      for (const fatia of prop.fatias) {
        fatiaMin.copy(prop.pegada.min);
        fatiaMax.copy(prop.pegada.max);
        fatiaMin[prop.eixoLongo] = fatia.de;
        fatiaMax[prop.eixoLongo] = fatia.ate;

        const caixa = fatia.colisor.box;
        caixa.makeEmpty();
        for (let i = 0; i < 8; i++) {
          canto.set(
            i & 1 ? fatiaMax.x : fatiaMin.x,
            i & 2 ? fatiaMax.y : fatiaMin.y,
            i & 4 ? fatiaMax.z : fatiaMin.z
          ).applyMatrix4(matriz);
          caixa.expandByPoint(canto);
        }
      }
      return;
    }

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

        // Só dá pra saber se vale fatiar depois de saber o quanto ele tombou,
        // e o tombo cresce ao longo da queda.
        fatiar(prop);
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
