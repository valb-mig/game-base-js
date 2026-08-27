/**
 * Orientação do corpo e o contato do CASCO com o chão.
 *
 * As duas coisas juntas porque a segunda não existe sem a primeira: só faz
 * sentido perguntar se a carroceria está raspando depois de saber pra onde ela
 * está virada.
 *
 * A ordem de rotação é YXZ, a mesma da câmera do jogador — giro, caimento,
 * rolagem. Ela não é escolha: com XYZ, rolar um veículo já esterçado torceria
 * o eixo do caimento e o jipe inclinaria pra onde ninguém pediu.
 *
 * E o pivô é o CENTRO DE MASSA, não a origem do modelo. Girar em volta da
 * origem — que está no chão, entre as rodas — enterrava metade da carroceria
 * no terreno e deixava a outra metade pendurada no ar quando ele capotava.
 * Corpo nenhum gira em volta dos próprios pés.
 */

/** Um vetor local (relativo ao centro de massa) levado pro mundo. */
export function paraMundo(corpo, lx, ly, lz, saida = {}) {
  const senR = Math.sin(corpo.roll);
  const cosR = Math.cos(corpo.roll);
  const senP = Math.sin(corpo.pitch);
  const cosP = Math.cos(corpo.pitch);
  const senY = Math.sin(corpo.yaw);
  const cosY = Math.cos(corpo.yaw);

  // Rz: rolagem positiva LEVANTA o lado +X, que é a esquerda.
  const x1 = lx * cosR - ly * senR;
  const y1 = lx * senR + ly * cosR;
  // Rx: caimento positivo baixa o nariz (+Z).
  const y2 = y1 * cosP - lz * senP;
  const z2 = y1 * senP + lz * cosP;
  // Ry: giro.
  saida.x = x1 * cosY + z2 * senY;
  saida.y = y2;
  saida.z = -x1 * senY + z2 * cosY;
  return saida;
}

/**
 * O caminho de volta: um vetor do MUNDO trazido pro sistema do corpo.
 *
 * É a transposta de `paraMundo`, desfeita na ordem inversa (Ry, depois Rx,
 * depois Rz). Escrita à mão e não por matriz: são nove multiplicações, roda
 * por bala e por quadro, e um `Matrix4` aqui seria uma alocação por tiro.
 *
 * Ela existe porque a bala vai pro sistema do ALVO, e não as caixas pro mundo
 * — a mesma decisão do soldado. Só que o soldado gira em UM eixo e o veículo
 * gira em três, e é por isso que o yaw sozinho não servia: numa ladeira o
 * jipe cai e rola, e a hitbox ficava reta enquanto a carroceria inclinava.
 */
export function vetorParaLocal(corpo, wx, wy, wz, saida = {}) {
  const senR = Math.sin(corpo.roll);
  const cosR = Math.cos(corpo.roll);
  const senP = Math.sin(corpo.pitch);
  const cosP = Math.cos(corpo.pitch);
  const senY = Math.sin(corpo.yaw);
  const cosY = Math.cos(corpo.yaw);

  // Ry⁻¹
  const x1 = wx * cosY - wz * senY;
  const z2 = wx * senY + wz * cosY;
  // Rx⁻¹
  const y1 = wy * cosP + z2 * senP;
  saida.z = -wy * senP + z2 * cosP;
  // Rz⁻¹
  saida.x = x1 * cosR + y1 * senR;
  saida.y = -x1 * senR + y1 * cosR;
  return saida;
}

/** Um PONTO do mundo em coordenadas do MODELO. O inverso de `pontoDoCasco`. */
export function pontoParaLocal(ficha, corpo, wx, wy, wz, saida = {}) {
  vetorParaLocal(corpo,
    wx - corpo.x,
    wy - (corpo.y + ficha.ALTURA_CM),
    wz - corpo.z,
    saida);
  saida.y += ficha.ALTURA_CM;
  return saida;
}

/**
 * O mesmo vetor, mas SEM o giro: só caimento e rolagem aplicados.
 *
 * É o braço de alavanca certo pro torque. `tRoll` e `tPitch` são momentos em
 * torno dos eixos do corpo, e o braço deles tem que estar no mesmo sistema —
 * o giro não entra. Usar o braço LOCAL (sem rotação nenhuma) funciona
 * aprumado e INVERTE de sinal deitado: medido, um jipe de barriga pra cima se
 * aprumava sozinho em três segundos, porque o canto que sustentava recebia
 * momento pro lado contrário do que a geometria manda.
 */
export function paraCorpo(corpo, lx, ly, lz, saida = {}) {
  const senR = Math.sin(corpo.roll);
  const cosR = Math.cos(corpo.roll);
  const senP = Math.sin(corpo.pitch);
  const cosP = Math.cos(corpo.pitch);

  const y1 = lx * senR + ly * cosR;
  saida.x = lx * cosR - ly * senR;
  saida.y = y1 * cosP - lz * senP;
  saida.z = y1 * senP + lz * cosP;
  return saida;
}

/** Um ponto do veículo no mundo, dado em coordenadas do MODELO. */
export function pontoDoCasco(ficha, corpo, lx, ly, lz, saida = {}) {
  paraMundo(corpo, lx, ly - ficha.ALTURA_CM, lz, saida);
  saida.x += corpo.x;
  saida.y += corpo.y + ficha.ALTURA_CM;
  saida.z += corpo.z;
  return saida;
}

/**
 * Os oito cantos da caixa da carroceria, em coordenadas do modelo.
 *
 * A caixa não começa no chão: embaixo dela está o vão do eixo, e quem responde
 * por essa faixa é a suspensão. Sobrepor as duas faria mola e chapa
 * empurrarem o mesmo metro cúbico, e o jipe nasceria vibrando.
 */
const memoria = new WeakMap();

function cantos(ficha) {
  // Memoizado: a lista é a mesma pra sempre, e montá-la por passo de
  // integração seriam oito objetos jogados no coletor 120 vezes por segundo
  // por veículo. Mesma regra do `colorAt` que roda por vértice.
  const guardado = memoria.get(ficha);
  if (guardado) return guardado;

  const lista = [];
  for (const x of [ficha.MEIA_LARGURA, -ficha.MEIA_LARGURA]) {
    for (const y of [ficha.PISO, ficha.ALTURA]) {
      for (const z of [ficha.MEIO_COMPRIMENTO, -ficha.MEIO_COMPRIMENTO]) {
        lista.push({ x, y, z });
      }
    }
  }
  memoria.set(ficha, lista);
  return lista;
}

const p = {};
const braco = {};

/**
 * A carroceria encostando no chão: força vertical e os momentos que ela faz.
 *
 * Existe pro veículo CAPOTADO. Com as rodas pro céu não há mola nenhuma
 * segurando nada, e sem isto o jipe atravessava o terreno e caía pra sempre.
 * É também o que faz o tombo TERMINAR: o canto que toca o chão para o giro e
 * o veículo assenta deitado, que é o estado em que ele tem que ficar.
 *
 * Só o canto MAIS FUNDO conta. Resolver os oito daria um solucionador de
 * contato inteiro pra um corpo que passa a partida em pé — e o canto mais
 * fundo é justamente o que sustenta.
 */
export function contatoDoCasco(ficha, corpo, sondar, delta) {
  /**
   * Aprumado e com roda no chão, o casco NÃO pode estar encostando: a
   * suspensão é o que segura, e o vão livre do MB é de 22 cm. Sem esta guarda
   * eram oito sondagens de terreno por passo de integração — 960 por segundo
   * por veículo — pra responder "não" em quase todos os quadros da partida.
   */
  const tombado = Math.abs(corpo.roll) > 0.32 || Math.abs(corpo.pitch) > 0.32;
  if (!tombado && corpo.rodas.some((r) => r.noChao)) {
    corpo.raspando = false;
    return { fy: 0, fundura: 0, tPitch: 0, tRoll: 0 };
  }

  /**
   * TODOS os cantos enterrados contam, não só o mais fundo.
   *
   * Um canto só é uma mesa de uma perna: qualquer força que ele devolva gira o
   * veículo em torno dele, e um jipe de barriga pra cima nunca chega ao
   * repouso. Medido com um canto: ele girava cada vez mais rápido e decolava
   * 13,6 m. Com os quatro do teto encostados, o corpo tem em que se apoiar e
   * para deitado, que é o que uma sucata faz.
   *
   * A rigidez é por canto e vale um quarto do batente de propósito: quatro
   * deles juntos têm que sustentar o peso com uns quatro centímetros de
   * afundamento, não com meio milímetro.
   */
  const K = ficha.MOLA * 2;
  const C = ficha.AMORTECEDOR * 2;

  let fy = 0;
  let tPitch = 0;
  let tRoll = 0;
  let fundura = 0;

  for (const canto of cantos(ficha)) {
    pontoDoCasco(ficha, corpo, canto.x, canto.y, canto.z, p);
    const dentro = sondar(p.x, p.z).altura - p.y;
    if (dentro <= 0) continue;
    if (dentro > fundura) fundura = dentro;

    // A velocidade DAQUELE canto, com o giro somado: quem desce rápido girando
    // encontra a força que o freia. Com a velocidade do centro, o amortecedor
    // não vê rotação nenhuma e o tombo nunca acaba.
    paraCorpo(corpo, canto.x, canto.y - ficha.ALTURA_CM, canto.z, braco);
    const vCanto = corpo.vy - braco.z * corpo.pitchRate + braco.x * corpo.rollRate;
    const f = Math.max(0, K * dentro - C * vCanto);
    fy += f;
    tPitch -= f * braco.z;
    tRoll += f * braco.x;
  }

  corpo.raspando = fy > 0;
  if (fy <= 0) return { fy: 0, fundura, tPitch: 0, tRoll: 0 };

  /**
   * Teto de quatro vezes o peso, e a sobra é resolvida por POSIÇÃO.
   *
   * Só por força não dá: um veículo posto capotado tem o canto um metro dentro
   * do terreno, e nem a mola mais macia devolve isso sem arremessar nada.
   */
  const teto = ficha.MASSA * 9.81 * 4;
  if (fy > teto) {
    const escala = teto / fy;
    fy = teto;
    tPitch *= escala;
    tRoll *= escala;
  }
  return { fy, fundura, tPitch, tRoll };
}
