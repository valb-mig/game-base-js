import * as THREE from 'three';

/**
 * Distância até o que está sob a mira, mostrada só enquanto o jogador mira
 * pelo ferro.
 *
 * Ele mede do OLHO ao longo do olhar, e não da boca do cano. Parece
 * inconsistente com a trajetória prevista da depuração, que sai do cano de
 * propósito, e não é: são perguntas diferentes. O arco responde "por onde a
 * bala vai passar"; isto responde "o que é aquilo ali", e "aquilo ali" é o
 * que está debaixo da mira — que é o centro da câmera. Medir do cano daria a
 * distância de um ponto que o jogador não está olhando.
 *
 * Só roda mirando, e é isso que paga a conta: são até algumas centenas de
 * amostras de terreno, e fazê-las todo quadro do jogo inteiro seria caro por
 * um número que ninguém está lendo enquanto corre.
 *
 * Sem alvo dentro do alcance ele não escreve "∞" nem chuta: some. Número que
 * aparece sempre deixa de ser informação e vira enfeite — e este HUD não
 * inventa número.
 */

// Até onde vale perguntar, em metros. Além disto o terreno já sumiu na bruma
// do céu encoberto, e uma medida que o olho não confere não serve de nada.
const ALCANCE = 600;

// Passo grosso da varredura do terreno. Depois de achar o trecho que afunda,
// oito bisseções fecham em ~1 cm — varrer fino de saída custaria 600
// amostras por quadro pra ganhar precisão que ninguém lê.
const PASSO = 4;
const BISSECOES = 8;

export function initRangefinder(player, camera, world, targets = []) {
  const caixa = document.getElementById('rangefinder');
  if (!caixa) return { update() {} };

  const origem = new THREE.Vector3();
  const direcao = new THREE.Vector3();
  const ponto = new THREE.Vector3();
  const raio = new THREE.Ray();
  const alvoPonto = new THREE.Vector3();
  const centro = new THREE.Vector3();
  const paraCentro = new THREE.Vector3();

  /** Altura do terreno abaixo de um ponto do raio, negativa se já afundou. */
  function folga(t) {
    ponto.copy(origem).addScaledVector(direcao, t);
    return ponto.y - world.terrain.heightAt(ponto.x, ponto.z);
  }

  /**
   * Onde o raio encontra o terreno.
   *
   * O terreno é curvo e o raio é reto, então não há conta fechada: varre em
   * passo grosso até a folga ficar negativa e fecha por bisseção. É a mesma
   * ideia da bala, que também amostra o trecho em vez de testar só a ponta.
   */
  function acharTerreno() {
    let anterior = 0;
    if (folga(0) < 0) return 0;

    for (let t = PASSO; t <= ALCANCE; t += PASSO) {
      if (folga(t) >= 0) {
        anterior = t;
        continue;
      }
      let baixo = anterior;
      let alto = t;
      for (let i = 0; i < BISSECOES; i++) {
        const meio = (baixo + alto) / 2;
        if (folga(meio) >= 0) baixo = meio;
        else alto = meio;
      }
      return (baixo + alto) / 2;
    }
    return null;
  }

  /** Colisor mais perto no caminho: parede, árvore, ponte, o que for. */
  function acharColisor() {
    raio.origin.copy(origem);
    raio.direction.copy(direcao);

    let perto = null;
    for (const colisor of world.colliders) {
      const p = raio.intersectBox(colisor.box, alvoPonto);
      if (!p) continue;
      const d = origem.distanceTo(p);
      if (d > ALCANCE) continue;
      if (perto === null || d < perto) perto = d;
    }
    return perto;
  }

  /** Soldado no caminho. A esfera do peito basta: é leitura, não dano. */
  function acharAlvo() {
    let perto = null;
    let quem = null;

    for (const alvo of targets) {
      // O jogador entra na lista de alvos como um envelope (`asTarget`), e
      // não como ele mesmo: sem isto o telêmetro mediria a distância do olho
      // até o próprio peito e travaria em meio metro.
      if (!alvo.alive || alvo === player.asTarget) continue;
      if (!alvo.center) continue;
      alvo.center(centro);

      // Projeção do centro no raio: se cair atrás do olho, não está à frente.
      const t = paraCentro.copy(centro).sub(origem).dot(direcao);
      if (t < 0 || t > ALCANCE) continue;

      ponto.copy(origem).addScaledVector(direcao, t);
      if (ponto.distanceTo(centro) > (alvo.radius ?? 0.5)) continue;
      if (perto !== null && t >= perto) continue;
      perto = t;
      quem = alvo;
    }
    return { distancia: perto, alvo: quem };
  }

  function update() {
    // Só mirando. `aim` é a fração da subida da arma, e o limiar é o mesmo que
    // acende a classe `aiming` no corpo — dois limiares diferentes fariam o
    // número piscar fora de hora.
    //
    // `isLocked` NÃO entra aqui. Quem esconde o HUD com uma tela aberta é o
    // `screen-open` do CSS, e repetir a regra em JS só criava uma segunda
    // condição pra manter de acordo com a primeira — que era, aliás, a única
    // coisa impedindo a página de captura de fotografar este número.
    const mirando = !player.spectating && (player.gun?.aim ?? 0) > 0.5;
    if (!mirando) {
      caixa.classList.remove('visivel');
      return;
    }

    origem.copy(camera.position);
    camera.getWorldDirection(direcao);

    const noChao = acharTerreno();
    const naParede = acharColisor();
    const { distancia: noAlvo, alvo } = acharAlvo();

    let menor = null;
    let tipo = '';
    for (const [d, rotulo] of [[noAlvo, 'alvo'], [naParede, ''], [noChao, '']]) {
      if (d === null || d === undefined) continue;
      if (menor !== null && d >= menor) continue;
      menor = d;
      tipo = rotulo;
    }

    if (menor === null) {
      caixa.classList.remove('visivel');
      return;
    }

    // Metro cheio: o jogador usa o número pra compensar a queda, e o
    // centímetro não muda decisão nenhuma — só treme na tela.
    caixa.textContent = `${Math.round(menor)} m`;
    caixa.classList.toggle('no-alvo', tipo === 'alvo' && Boolean(alvo));
    caixa.classList.add('visivel');
  }

  return { update };
}
