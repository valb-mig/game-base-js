/**
 * Atropelamento: o que acontece quando o veículo encontra gente.
 *
 * A regra NÃO é "encostou, morreu". Roda tocando um soldado a 3 km/h matando
 * ele é o tipo de coisa que faz um jogador perder a vida sem entender o que
 * houve, e faz o motorista matar o próprio time só de estacionar. Quem decide
 * é a VELOCIDADE DE APROXIMAÇÃO, em três faixas:
 *
 *   até  5 km/h  empurra, e nada mais
 *   até 15 km/h  derruba: dano grande, mas sobrevivível
 *   acima disso   letal
 *
 * A velocidade que conta é a de aproximação — a projeção da velocidade do
 * veículo na direção de quem está sendo atingido. Usar o módulo faria um jipe
 * passando raspando a 60 km/h matar quem está PARADO ao lado dele.
 */

const EMPURRA_ATE = 1.4;    // m/s ≈ 5 km/h
const DERRUBA_ATE = 4.2;    // m/s ≈ 15 km/h
const DANO_DERRUBA = 55;
// Alto o bastante pra vencer qualquer multiplicador de região e qualquer vida
// de classe: atropelar a 20 km/h não é "muito dano", é morte.
const DANO_LETAL = 1000;
// Empurrão por segundo, em m/s. Fraco de propósito: ele desencosta o corpo do
// veículo, não arremessa ninguém.
const EMPURRAO = 2.6;
// Folga do corpo em volta da pegada: o soldado é um cilindro de 40 cm.
const FOLGA = 0.42;

/**
 * Roda um quadro de atropelamento. `dentro` são os ocupantes, que o próprio
 * veículo não atropela — o jipe passaria por cima de quem está sentado nele.
 */
export function atropelar(veiculo, alvos, dentro, delta) {
  const ficha = veiculo.ficha;
  const corpo = veiculo.corpo;
  if (corpo.velocidade < 0.05) return [];

  const cos = Math.cos(corpo.yaw);
  const sen = Math.sin(corpo.yaw);
  const batidos = [];

  for (const alvo of alvos) {
    if (alvo === veiculo || alvo.veiculo) continue;
    if (!alvo.alive || dentro.includes(alvo)) continue;

    // Altura primeiro, que é a peneira barata: quem está numa laje acima ou
    // num buraco abaixo não é atropelado.
    const pe = alvo.feetY ?? 0;
    if (pe > corpo.y + ficha.ALTURA || pe + 1.8 < corpo.y) continue;

    // Pra dentro do sistema do veículo: o retângulo é dele, e girado.
    const dx = alvo.x - corpo.x;
    const dz = alvo.z - corpo.z;
    const lx = dx * cos - dz * sen;
    const lz = dx * sen + dz * cos;
    if (Math.abs(lx) > ficha.MEIA_LARGURA + FOLGA) continue;
    if (Math.abs(lz) > ficha.MEIO_COMPRIMENTO + FOLGA) continue;

    // Velocidade de APROXIMAÇÃO, na direção de quem está sendo atingido.
    const dist = Math.hypot(dx, dz) || 1e-6;
    const chegando = (corpo.vx * dx + corpo.vz * dz) / dist;
    if (chegando <= 0) continue;   // ele está saindo de perto, não chegando

    if (chegando <= EMPURRA_ATE) {
      // Empurrar é opcional: quem sabe ser empurrado tem `empurrar`. Alvo que
      // não tem — poste, boneco de treino — simplesmente não sai do lugar.
      alvo.empurrar?.(dx / dist * EMPURRAO * delta, dz / dist * EMPURRAO * delta);
      batidos.push({ alvo, chegando, efeito: 'empurrou' });
      continue;
    }

    const letal = chegando > DERRUBA_ATE;
    const r = alvo.damage(letal ? DANO_LETAL : DANO_DERRUBA, null, {
      // O rumo vai junto pra o corpo tombar pra frente do jipe, e não pro
      // lado de onde a bala teria vindo.
      dir: { x: corpo.vx / dist, y: 0, z: corpo.vz / dist },
      ponto: { x: alvo.x, y: pe + 0.6, z: alvo.z }
    });
    batidos.push({ alvo, chegando, efeito: letal ? 'atropelou' : 'derrubou', killed: r?.killed });
  }

  return batidos;
}
