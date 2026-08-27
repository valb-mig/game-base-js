import * as THREE from 'three';

/**
 * Junta as caixas de construção em lotes instanciados.
 *
 * O gargalo do quadro nesta base é CONTAGEM DE OBJETO, e o censo diz de quem é
 * a conta: 1503 malhas estáticas soltas em 15 geometrias e 44 materiais — a
 * MESMA caixa desenhada mil vezes. A floresta já era instanciada; as
 * construções não, porque cada parede é um `addBox` que se resolve sozinho.
 *
 * Medido em A/B no mesmo processo (`tools/bancada-lote.html`), com o olho na
 * vila olhando pro sul: 651 chamadas de desenho e 3,16 ms por quadro contra
 * 106 chamadas e 0,87 ms. E com a câmera pro CÉU, que é zero triângulo
 * transformado e portanto mede só matriz de cena, travessia e recorte: 0,82 ms
 * contra 0,25. Duas execuções da mesma página não provariam isso — o ruído
 * entre execuções nesta máquina passa de 40%.
 *
 * Por que POR CÉLULA e não um lote por material:
 *
 * Um lote do mapa inteiro dá 51 chamadas em vez de 106, e o preço é o recorte:
 * `InstancedMesh` é recortado como UMA coisa, então um lote de 2 km está sempre
 * em quadro e a travessia volta a subir (0,37 ms contra 0,25 no céu). Célula de
 * 96 m mantém o recorte por região e ainda entrega 84% da economia de chamada.
 *
 * O que MUDA na tela: dez pixels, e eles são o recorte.
 *
 * A captura antes e depois, no mesmo ponto de vista, difere em 10 pixels de
 * 921.600 — todos na LINHA DO HORIZONTE e nenhum passando de 25 níveis. É a
 * contrapartida contada acima, vista de outro lado: o lote é recortado por
 * célula, então um prop a um quilômetro que a esfera dele deixava de fora do
 * quadro agora entra junto com a célula. Medido na bancada: 900 triângulos a
 * mais desenhados, 0,05% do quadro. Não é regressão — aquele prop existe ali —,
 * e a diferença chega ao pixel já lavada pela névoa.
 *
 * Quem NÃO entra:
 *
 *  - o que se mexe depois do boot, marcado com `userData.movel` — a bandeira
 *    que sobe no mastro, a cruz do moinho que gira, o boneco de treino que
 *    tomba. Instanciar isso trocaria uma escrita em `position` por uma escrita
 *    no buffer de matrizes, e nenhum deles compartilha geometria com ninguém.
 *  - material transparente: a água e o vidro dependem da ORDEM de desenho, e
 *    juntar instâncias embaralha a ordem dentro do lote.
 *  - grupo de UM: um `InstancedMesh` de uma instância é a mesma chamada de
 *    desenho com um buffer de matriz a mais. É isso que deixa o terreno, a
 *    costura, o anel do horizonte e o mar de fora sem precisar de exceção.
 *
 * O que TOMBA continua tombando: `settling.js` já sabia mexer em instância
 * (`{ mesh, index, instanced: true }`, que é como a floresta se registra), e a
 * troca da malha solta pela instância é avisada a ele por `trocarParte`.
 */

/** Lado da célula de agrupamento, em metros. */
const CELULA = 96;

/** Ele ou algum pai dele se mexe depois do boot? */
function seMexe(objeto) {
  for (let o = objeto; o; o = o.parent) {
    if (o.userData?.movel) return true;
  }
  return false;
}

/**
 * Agrupa o que está montado na cena. Roda UMA vez, no fim da montagem do mapa:
 * daí pra frente o que entra na cena (jipe, item largado, bot) já é dinâmico.
 */
export function agruparEstaticos(scene, { celula = CELULA, settling = null } = {}) {
  const candidatos = [];
  scene.traverse((objeto) => {
    if (!objeto.isMesh || objeto.isInstancedMesh || objeto.isSkinnedMesh) return;
    if (seMexe(objeto)) return;
    const material = Array.isArray(objeto.material) ? objeto.material[0] : objeto.material;
    if (!material || material.transparent) return;
    candidatos.push(objeto);
  });

  const posicao = new THREE.Vector3();
  const grupos = new Map();
  for (const malha of candidatos) {
    malha.updateMatrixWorld(true);
    const material = Array.isArray(malha.material) ? malha.material[0] : malha.material;
    posicao.setFromMatrixPosition(malha.matrixWorld);
    const chave = `${malha.geometry.uuid}|${material.uuid}`
      + `|${Math.floor(posicao.x / celula)},${Math.floor(posicao.z / celula)}`;
    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = { geometria: malha.geometry, material, itens: [] };
      grupos.set(chave, grupo);
    }
    grupo.itens.push(malha);
  }

  const lotes = [];
  let instanciadas = 0;
  for (const { geometria, material, itens } of grupos.values()) {
    if (itens.length < 2) continue;

    const lote = new THREE.InstancedMesh(geometria, material, itens.length);
    lote.name = 'lote';
    for (let i = 0; i < itens.length; i++) {
      const malha = itens[i];
      lote.setMatrixAt(i, malha.matrixWorld);
      // A malha sai da cena e continua existindo: quem guardou a referência
      // dela — `settling`, e quem mais vier — continua com um objeto válido,
      // agora apontando pra uma instância.
      malha.removeFromParent();
      malha.userData.lote = { mesh: lote, index: i };
      settling?.trocarParte?.(malha, lote, i);
      instanciadas++;
    }
    lote.instanceMatrix.needsUpdate = true;
    scene.add(lote);
    lotes.push(lote);
  }

  return { lotes, instanciadas, candidatas: candidatos.length };
}
