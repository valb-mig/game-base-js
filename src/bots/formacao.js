/**
 * Formações de infantaria. Só números — sem three, sem estado.
 *
 * Um pelotão que anda em bloco não é um pelotão, é uma fila de bonecos: eles
 * se atropelam, um tapa a linha de tiro do outro, e uma granada pega todo
 * mundo. A doutrina real resolve isso com POSIÇÃO — cada soldado tem um lugar
 * relativo ao líder, e o lugar muda conforme o que o pelotão está fazendo.
 *
 * Cada formação devolve deslocamentos em metros no referencial do líder:
 * `lateral` positivo é à direita dele, `frente` positivo é à frente. Quem
 * converte pra mundo é `pelotao.js`, que conhece o rumo.
 *
 * O primeiro slot é sempre (0, 0): é o líder.
 */

/**
 * Intervalo entre homens, em metros.
 *
 * Perto o bastante pra um cobrir o outro, longe o bastante pra que uma rajada
 * não pegue dois. Abaixo de uns três metros eles voltam a se encostar, que é
 * justamente o que a formação existe pra evitar.
 */
export const INTERVALO = 3.4;

/**
 * COLUNA — um atrás do outro.
 *
 * A formação de deslocamento em terreno fechado: mata, trilha, rua estreita.
 * Frente estreitíssima (só o primeiro homem vê e é visto) e profundidade
 * longa. Péssima pra atirar de frente, ótima pra atravessar sem se expor.
 */
function coluna(i) {
  // O zigue-zague de 60 cm não é enfeite: em fila perfeita, cada homem fica
  // exatamente atrás do da frente, e uma rajada em enfiada pega a coluna
  // inteira. Escalonar de leve tira todos da mesma linha. O líder é a
  // exceção — o slot 0 é a origem em toda formação.
  return {
    lateral: i === 0 ? 0 : (i % 2 === 0 ? 0.6 : -0.6),
    frente: -i * INTERVALO
  };
}

/**
 * LINHA — todos lado a lado.
 *
 * O contrário da coluna: todo o poder de fogo virado pra frente, e todo mundo
 * exposto ao mesmo tempo. É a formação de assalto final, pros últimos metros.
 */
function linha(i) {
  const lado = i % 2 === 0 ? 1 : -1;
  return { lateral: lado * Math.ceil(i / 2) * INTERVALO, frente: 0 };
}

/**
 * CUNHA — o V com a ponta pra frente. A formação padrão de avanço.
 *
 * Ela é o meio-termo que a infantaria usa quando não sabe de onde vem o
 * inimigo: dá fogo pra frente e pros dois flancos, e ninguém está na linha de
 * tiro de ninguém. É a que o pelotão usa por padrão aqui.
 */
function cunha(i) {
  const lado = i % 2 === 0 ? 1 : -1;
  const passo = Math.ceil(i / 2);
  return { lateral: lado * passo * INTERVALO, frente: -passo * INTERVALO * 0.8 };
}

/**
 * VÊ — o V invertido, ponta pra trás.
 *
 * Dois homens na frente em vez de um: usada quando se SABE onde o inimigo
 * está e se quer chegar com fogo já apontado, aceitando expor dois.
 */
function ve(i) {
  if (i === 0) return { lateral: 0, frente: 0 };
  const lado = i % 2 === 1 ? 1 : -1;
  const passo = Math.ceil(i / 2);
  return { lateral: lado * passo * INTERVALO, frente: passo * INTERVALO * 0.8 };
}

/**
 * ESCALÃO — a diagonal.
 *
 * Todo o pelotão puxado pra um lado só. Serve pra cobrir um flanco descoberto:
 * quando se avança rente a um obstáculo, ou quando o perigo conhecido está de
 * um lado e não do outro.
 */
function escalao(i, direita = true) {
  const lado = direita ? 1 : -1;
  return { lateral: lado * i * INTERVALO, frente: -i * INTERVALO * 0.7 };
}

/**
 * QUADRADO — o perímetro.
 *
 * Não é formação de andar, é de FICAR: os homens em volta de um ponto, cada
 * um olhando pra fora. É o que um pelotão faz depois de tomar um posto, e é
 * o que faz atacar um ponto já dominado custar caro.
 */
function quadrado(i, quantos) {
  if (i === 0) return { lateral: 0, frente: 0 };
  const passo = (i - 1) / Math.max(1, quantos - 1);
  const angulo = passo * Math.PI * 2;
  const raio = INTERVALO * 1.9;
  return { lateral: Math.sin(angulo) * raio, frente: Math.cos(angulo) * raio };
}

export const FORMACOES = {
  coluna, linha, cunha, ve, escalao, quadrado
};

export const NOMES = Object.keys(FORMACOES);

/**
 * O deslocamento do slot `i` numa formação de `quantos` homens.
 *
 * `quantos` só importa pro quadrado, que reparte o círculo — as outras são
 * abertas e crescem sozinhas. Nome desconhecido cai na cunha: formação errada
 * é ruim, formação nenhuma é bot andando por cima de bot.
 */
export function slot(nome, i, quantos) {
  const fn = FORMACOES[nome] ?? cunha;
  return fn === quadrado ? quadrado(i, quantos) : fn(i, quantos);
}

/**
 * Converte o slot pro mundo, dado onde o líder está e pra onde ele olha.
 *
 * `rumo` é o yaw do jogo: 0 aponta pro -Z e cresce girando pro -X, que é o
 * mesmo sistema de `Math.atan2(dx, dz)` usado no resto dos bots. Inventar
 * outro aqui faria a formação inteira nascer girada noventa graus.
 */
export function pontoDoSlot(nome, i, quantos, lider, rumo, saida) {
  const desloc = slot(nome, i, quantos);
  const sen = Math.sin(rumo);
  const cos = Math.cos(rumo);

  // frente é (sen, cos); a direita é (cos, -sen)
  saida.x = lider.x + sen * desloc.frente + cos * desloc.lateral;
  saida.z = lider.z + cos * desloc.frente - sen * desloc.lateral;
  return saida;
}
