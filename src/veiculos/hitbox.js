/**
 * As regiões de acerto do veículo, no sistema dele e com o Y saindo do chão.
 *
 * Mesmo formato das do soldado (`game/hitboxes.js`): caixa, `regiao` e
 * `ordem`. É isso que faz a balística acertar um jipe sem saber que jipe
 * existe — ela leva a bala pro sistema do alvo e testa caixa por caixa.
 *
 * E, como a do soldado, ela é MEDIDA do modelo. Escrita à mão ela desalinhou
 * na primeira conferência: 28 cm de caixa no ar acima do jipe, 10 cm atrás,
 * o piso 6 cm abaixo do assoalho e o motor passando da grade. Nada disso
 * aparece numa suíte que só confere se a caixa existe — aparece ligando o F2 e
 * vendo o desenho não encostar no veículo.
 *
 * `usarMedidasDoJipe` injeta a fonte de fora pelo mesmo motivo que
 * `usarMedidasDoModelo` existe: regra de dano não pode depender de um `.glb`
 * ter carregado, e sem arquivo a tabela de reserva vale.
 */

let fonteDeMedidas = null;

export function usarMedidasDoJipe(fonte) {
  fonteDeMedidas = fonte;
}

/**
 * O que a lataria não cobre: a lateral do tanque, em meia-largura.
 *
 * O chassi medido vai a ±0,84, que é a PONTA DO PARA-LAMA — e uma caixa só
 * nessa largura engoliria os quatro pneus, que ficam a 0,56..0,74 e por fora
 * da lataria. Medido: oito tiros mirados no pneu, todos registrados como
 * "carroceria", e furar pneu era impossível.
 *
 * Então são duas caixas: o tanque (estreito, alto) e o para-lama (largo,
 * baixo, e ACIMA do pneu — ele começa em 0,82 e o pneu acaba em 0,78). Entre
 * as duas, a roda fica exposta de lado, que é como ela fica de verdade.
 */
const TANQUE_X = 0.66;
const PARA_LAMA_Y = [0.82, 1.00];

/** Recorta `caixa` dentro de `limite`, pra ela não sair da malha. */
function recortar(caixa, limite) {
  return {
    minX: Math.max(caixa.minX, limite.minX), maxX: Math.min(caixa.maxX, limite.maxX),
    minY: Math.max(caixa.minY, limite.minY), maxY: Math.min(caixa.maxY, limite.maxY),
    minZ: Math.max(caixa.minZ, limite.minZ), maxZ: Math.min(caixa.maxZ, limite.maxZ)
  };
}

/** As medidas de reserva, quando não há modelo carregado. */
function reserva(ficha) {
  const rodas = {};
  for (const r of ficha.RODAS) {
    rodas[r.id] = {
      minX: r.x - 0.09, maxX: r.x + 0.09,
      minY: 0, maxY: ficha.RAIO_RODA * 2,
      minZ: r.z - ficha.RAIO_RODA - 0.02, maxZ: r.z + ficha.RAIO_RODA + 0.02
    };
  }
  return {
    chassi: {
      minX: -ficha.MEIA_LARGURA, maxX: ficha.MEIA_LARGURA,
      minY: ficha.PISO, maxY: ficha.ALTURA,
      minZ: -ficha.MEIO_COMPRIMENTO, maxZ: ficha.MEIO_COMPRIMENTO
    },
    rodas
  };
}

export function regioesDoVeiculo(ficha) {
  const medidas = fonteDeMedidas?.() ?? reserva(ficha);
  const chassi = medidas.chassi;
  const regioes = [];

  // As quatro rodas, cada uma na caixa da própria malha. Pneu não é "menos
  // dano": ele tem vida própria e pouca, e quem decide quantos tiros furam é
  // `dano.js`. Multiplicador 1 pra não calibrar duas vezes a mesma promessa.
  for (const r of ficha.RODAS) {
    const caixa = medidas.rodas[r.id];
    if (!caixa) continue;
    regioes.push({
      ...caixa,
      ordem: 1,
      regiao: { nome: `roda_${r.id}`, roda: r.id, multiplicador: 1 }
    });
  }

  // Motor, sob o capô. É o alvo de quem quer PARAR o jipe em vez de matar
  // quem está dentro, e isso tem que valer a pena mirar. Recortado no chassi:
  // à mão ele passava 4 cm da grade e 5 cm acima do capô.
  regioes.push({
    ...recortar({
      minX: -TANQUE_X, maxX: TANQUE_X, minY: 0.50, maxY: 0.98,
      minZ: 0.45, maxZ: 1.60
    }, chassi),
    ordem: 0,
    regiao: { nome: 'motor', roda: null, multiplicador: 1.6 }
  });

  // Tanque, sob o assento do motorista — é onde ele fica no MB de verdade.
  regioes.push({
    ...recortar({
      minX: 0.08, maxX: 0.58, minY: 0.44, maxY: 0.64,
      minZ: -0.45, maxZ: 0.05
    }, chassi),
    ordem: 0,
    regiao: { nome: 'tanque', roda: null, multiplicador: 1.4 }
  });

  // O para-lama: largo e acima do pneu. Sem ele havia uma faixa de 20 cm de
  // cada lado, na altura do capô, em que a bala não acertava nada.
  regioes.push({
    minX: chassi.minX, maxX: chassi.maxX,
    minY: PARA_LAMA_Y[0], maxY: PARA_LAMA_Y[1],
    minZ: chassi.minZ, maxZ: chassi.maxZ,
    ordem: 2,
    regiao: { nome: 'para_lama', roda: null, multiplicador: 1 }
  });

  // O tanque da carroceria por último: ele envolve motor e tanque, e é o que
  // sobra. Altura e comprimento saem da malha; a largura é a da lataria, não a
  // do para-lama.
  regioes.push({
    minX: -TANQUE_X, maxX: TANQUE_X,
    minY: chassi.minY, maxY: chassi.maxY,
    minZ: chassi.minZ, maxZ: chassi.maxZ,
    ordem: 3,
    regiao: { nome: 'carroceria', roda: null, multiplicador: 1 }
  });

  return regioes;
}
