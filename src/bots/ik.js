/**
 * IK de dois ossos: onde o cotovelo cai pra que a mão chegue no alvo.
 *
 * Uma conta só, e ela serve aos dois braços e aos dois joelhos. Sem three de
 * propósito — são três pontos e dois comprimentos, e dá pra provar que a mão
 * chega onde foi mandada sem carregar modelo nenhum.
 *
 * O `items/arms.js` já resolvia isto pro viewmodel, mas ali os braços são
 * objetos PRÓPRIOS, construídos pra isso. Aqui os ossos são os do arquivo, e
 * quem os orienta é o rig — então a conta tem que sair de dentro do desenho
 * pra poder ser usada pelos dois.
 *
 * O que ela NÃO decide é a torção do braço em torno do próprio osso: dois
 * pontos e dois comprimentos deixam o cotovelo livre num CÍRCULO, e quem tira
 * o empate é o polo. Sem polo o cotovelo escolhe um lugar qualquer e o braço
 * do soldado vira pra dentro do peito.
 */

/** Alvo mais perto que isto e a conta degenera: não há triângulo. */
const MINIMO = 1e-4;

/**
 * Escreve em `saida` (x, y, z) onde o cotovelo cai.
 *
 * `a` é ombro→cotovelo e `b` é cotovelo→mão. `polo` é pra que lado o
 * cotovelo aponta — não precisa ser unitário nem perpendicular.
 *
 * Devolve o quanto o alvo teve que ser ENCURTADO pra caber no braço: zero
 * quando ele estava ao alcance. Quem chama precisa saber disso, porque mão
 * que não chega no alvo é mão desgrudada da arma, e isso se vê.
 */
export function cotoveloEm(saida, ombro, alvo, a, b, polo) {
  let dx = alvo.x - ombro.x;
  let dy = alvo.y - ombro.y;
  let dz = alvo.z - ombro.z;
  const bruto = Math.hypot(dx, dy, dz);

  // Braço não estica e não fecha até encostar: os dois extremos são o mesmo
  // problema, e nos dois a conta perde o triângulo.
  const maximo = (a + b) * 0.999;
  const minimo = Math.max(Math.abs(a - b) * 1.001, MINIMO);
  const d = Math.min(maximo, Math.max(minimo, bruto));

  if (bruto < MINIMO) {
    saida.x = ombro.x;
    saida.y = ombro.y - a;
    saida.z = ombro.z;
    return 0;
  }

  dx /= bruto; dy /= bruto; dz /= bruto;

  // Lei dos cossenos: quanto o cotovelo avança ao longo da linha ombro→mão,
  // e quanto ele sai dela.
  const x = (d * d + a * a - b * b) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - x * x));

  // O polo sem a parte que já está na linha: o que sobra é a direção em que
  // o cotovelo sai. Polo paralelo à linha não sobra nada, e aí qualquer
  // perpendicular serve — o braço esticado não tem cotovelo pra escolher.
  let px = polo.x;
  let py = polo.y;
  let pz = polo.z;
  const aoLongo = px * dx + py * dy + pz * dz;
  px -= dx * aoLongo;
  py -= dy * aoLongo;
  pz -= dz * aoLongo;
  let comprimento = Math.hypot(px, py, pz);

  if (comprimento < MINIMO) {
    // qualquer eixo que não seja o da linha
    px = Math.abs(dy) < 0.9 ? -dz : 1;
    py = Math.abs(dy) < 0.9 ? 0 : 0;
    pz = Math.abs(dy) < 0.9 ? dx : 0;
    comprimento = Math.hypot(px, py, pz) || 1;
  }
  px /= comprimento; py /= comprimento; pz /= comprimento;

  saida.x = ombro.x + dx * x + px * h;
  saida.y = ombro.y + dy * x + py * h;
  saida.z = ombro.z + dz * x + pz * h;
  return Math.max(0, bruto - d);
}
