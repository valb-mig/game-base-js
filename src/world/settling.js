import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { criarCaixaGirada } from './caixagirada.js';

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

/**
 * Prop tombado ganha uma caixa GIRADA, não oito caixas em escada.
 *
 * Fatiar foi a resposta anterior: uma caixa alinhada aos eixos não representa
 * corpo diagonal (uma parede de 12 m deitada de ponta vira uma envolvente de
 * 6,2 vezes o volume dela, e o jogador esbarra em ar), então o corpo era
 * cortado em oito pedaços curtos, 2,0 vezes o volume. Melhor, e ainda errado:
 * o jogador esbarrava nos DEGRAUS da escada e ficava de pé no ar em cima
 * deles, e cada prop derrubado custava sete colisores a mais numa lista que a
 * colisão varre todo quadro.
 *
 * A caixa girada é EXATA e é uma só. O preço é que quem consulta tem que
 * saber convertê-la — e agora sabe: colisão, bala e veículo perguntam ao
 * colisor, como já perguntavam ao veículo. Ver `world/caixagirada.js`.
 */

export function createSettling(terrain, colliders = null) {
  const props = [];
  const caindo = [];

  /**
   * Malha solta -> as partes que a citam.
   *
   * Existe pra que `trocarParte` seja O(1): quando `world/lote.js` dobra as
   * caixas de construção em `InstancedMesh`, ele avisa aqui malha por malha, e
   * varrer os milhares de props por aviso seria quadrático no boot.
   */
  const porMalha = new Map();

  const matriz = new THREE.Matrix4();
  const eixo = new THREE.Vector3();
  const canto = new THREE.Vector3();

  /**
   * Registra um prop que pode desabar.
   *
   * `parts` são as malhas que o desenham: uma árvore instanciada tem tronco e
   * duas copas, uma parede tem uma malha só. `collider` é o que a colisão vê.
   */
  function register({ x, z, baseY, radius, collider, parts }) {
    for (const parte of parts) {
      if (parte.instanced) continue;
      const juntas = porMalha.get(parte.mesh) ?? [];
      juntas.push(parte);
      porMalha.set(parte.mesh, juntas);
    }
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

      /**
       * A envolvente continua existindo, e não é desperdício: é ela que o
       * índice espacial guarda e é ela que peneira antes da conta cara. Quem
       * dá a resposta FINA é a caixa girada, que é a pegada de pé mais a
       * matriz — o mesmo par de coisas que move a malha, e por isso ela não
       * pode discordar do que se vê.
       */
      if (!prop.collider.girado) {
        prop.collider.girado = criarCaixaGirada({
          minX: pegada.min.x, minY: pegada.min.y, minZ: pegada.min.z,
          maxX: pegada.max.x, maxY: pegada.max.y, maxZ: pegada.max.z
        }, PLAYER.RADIUS);
      }
      prop.collider.girado.escrever(matriz.elements);

      colliders?.moveu?.(prop.collider);
    }
  }

  return {
    props,
    register,

    /**
     * A malha solta virou instância num lote. Reaponta as partes que a citam.
     *
     * `world/lote.js` dobra as caixas de construção em `InstancedMesh` no fim
     * da montagem do mapa, e sem este aviso o prop continuaria escrevendo
     * numa malha que já saiu da cena: cavar embaixo de uma parede a deixaria
     * de pé na tela e caída na colisão — o pior dos dois mundos, porque o
     * colisor desce e o desenho não.
     *
     * A conversão pra instância já era suportada: a floresta se registra
     * assim desde que passou a ser instanciada, e `aplicar` só olha
     * `parte.instanced`.
     */
    trocarParte(malha, lote, indice) {
      const juntas = porMalha.get(malha);
      if (!juntas) return 0;
      for (const parte of juntas) {
        parte.mesh = lote;
        parte.index = indice;
        parte.instanced = true;
      }
      porMalha.delete(malha);
      return juntas.length;
    },

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
