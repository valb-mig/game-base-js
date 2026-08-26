import {
  OSSOS, AMARRAS, NOMES, RAIOS, medirLigacoes, medirDobras
} from './esqueleto.js';

/**
 * Ragdoll por junta: uma partícula em cada junta, integrada por Verlet, e as
 * ligações do esqueleto resolvidas como restrições de posição.
 *
 * Por que Verlet e não corpo rígido por membro: aqui a posição É o estado, e
 * uma restrição é uma correção de posição — não há massa, inércia nem
 * impulso pra sair de controle. Um corpo rígido por membro seria mais fiel e
 * traria junto o solucionador de impulsos inteiro, que é o começo de um motor
 * de física; isto cabe em um arquivo e não explode.
 *
 * Sem three de propósito: são dezessete pontos e uma lista de distâncias. Dá
 * pra provar que o corpo não estica, não atravessa o chão e para de se mexer
 * sem carregar modelo nenhum.
 *
 * O que ele NÃO faz: decidir pra que lado o cotovelo dobra. O limite é de
 * distância — o membro não fecha até encostar nem estica além do osso —, e
 * o lado sai de onde o corpo veio e de pra onde a gravidade puxa.
 */

const GRAVIDADE = 12;      // um pouco acima da real: queda de jogo é mais seca
const ATRITO_AR = 0.008;   // por segundo; o bastante pra não oscilar pra sempre
const ATRITO_CHAO = 0.55;  // quanto do deslize horizontal o chão come
const ITERACOES = 6;       // passadas de restrição por quadro
// A mola das dobradiças briga com a gravidade pra sempre, então o corpo
// nunca fica EXATAMENTE parado: o limiar é o de "parado aos olhos", não o de
// energia zero. Medido, com 2 cm/s ele não dormia em seis segundos.
const DORMIR = 0.06;       // m/s abaixo do qual o corpo é dado por assentado
const DORMIR_TEMPO = 0.35; // ...e por quanto tempo, pra não dormir no ar

export function createRagdoll(juntas) {
  const ligacoes = [
    ...medirLigacoes(juntas, OSSOS),
    ...medirLigacoes(juntas, AMARRAS)
  ];
  const dobras = medirDobras(juntas);

  const indice = new Map();
  const p = [];      // x, y, z atuais
  const anterior = [];
  const raios = [];  // meia espessura do corpo em cada junta
  NOMES.forEach((nome, i) => {
    indice.set(nome, i);
    p.push(0, 0, 0);
    anterior.push(0, 0, 0);
    raios.push(RAIOS[nome] ?? 0.08);
  });

  // as restrições em índices, resolvidas uma vez: o laço quente não procura
  // nome em Map
  const emIndices = ligacoes
    .filter((l) => indice.has(l.a) && indice.has(l.b))
    .map((l) => ({ a: indice.get(l.a) * 3, b: indice.get(l.b) * 3, d: l.comprimento }));
  const dobrasEmIndices = dobras
    .filter((d) => indice.has(d.a) && indice.has(d.b))
    .map((d) => ({
      a: indice.get(d.a) * 3, b: indice.get(d.b) * 3,
      min: d.minimo, repouso: d.repouso, rigidez: d.rigidez
    }));

  const estado = { dormindo: true, quieto: 0 };

  function distancia(ia, ib, alvo, minimoApenas, forca = 1) {
    let dx = p[ib] - p[ia];
    let dy = p[ib + 1] - p[ia + 1];
    let dz = p[ib + 2] - p[ia + 2];
    const atual = Math.hypot(dx, dy, dz);
    if (atual < 1e-6) return;
    if (minimoApenas && atual >= alvo) return;

    // metade pra cada ponta: sem massa, ninguém é mais pesado que ninguém
    const correcao = ((atual - alvo) / atual) * 0.5 * forca;
    dx *= correcao;
    dy *= correcao;
    dz *= correcao;
    p[ia] += dx; p[ia + 1] += dy; p[ia + 2] += dz;
    p[ib] -= dx; p[ib + 1] -= dy; p[ib + 2] -= dz;
  }

  return {
    juntas,
    estado,

    get dormindo() {
      return estado.dormindo;
    },

    /**
     * Põe o boneco de pé em `(x, y, z)` virado pra `yaw`, e dá o empurrão.
     *
     * O empurrão entra como VELOCIDADE, ou seja como diferença entre a
     * posição de agora e a de antes — é assim que Verlet guarda velocidade,
     * e é o que faz o corpo sair andando pro lado do tiro em vez de despencar
     * no lugar.
     */
    iniciar(x, y, z, yaw, empurrao = null, dt = 1 / 60) {
      const cos = Math.cos(yaw);
      const sen = Math.sin(yaw);

      NOMES.forEach((nome, i) => {
        const [jx, jy, jz] = juntas[nome];
        const mx = jx * cos + jz * sen;
        const mz = -jx * sen + jz * cos;
        const k = i * 3;
        p[k] = x + mx;
        p[k + 1] = y + jy;
        p[k + 2] = z + mz;

        // O empurrão é maior em cima: bala no peito gira o corpo em torno dos
        // pés, e velocidade igual em todos os pontos só o transladaria.
        const peso = empurrao ? Math.min(1, jy / 1.4) : 0;
        anterior[k] = p[k] - (empurrao?.x ?? 0) * peso * dt;
        anterior[k + 1] = p[k + 1] - (empurrao?.y ?? 0) * peso * dt;
        anterior[k + 2] = p[k + 2] - (empurrao?.z ?? 0) * peso * dt;
      });

      estado.dormindo = false;
      estado.quieto = 0;
    },

    /**
     * Um passo. `alturaEm(x, z)` é o chão — o mesmo campo de altura que a
     * locomoção amostra —, e `caixas` são os colisores já filtrados por quem
     * chamou: varrer a lista inteira do mapa por partícula seriam treze mil
     * testes por corpo por quadro.
     */
    passo(dt, { alturaEm = () => 0, caixas = null } = {}) {
      if (estado.dormindo || dt <= 0) return;

      const amortece = Math.pow(ATRITO_AR, dt);
      const queda = GRAVIDADE * dt * dt;
      let maisRapido = 0;

      for (let k = 0; k < p.length; k += 3) {
        const vx = (p[k] - anterior[k]) * amortece;
        const vy = (p[k + 1] - anterior[k + 1]) * amortece;
        const vz = (p[k + 2] - anterior[k + 2]) * amortece;

        anterior[k] = p[k];
        anterior[k + 1] = p[k + 1];
        anterior[k + 2] = p[k + 2];

        p[k] += vx;
        p[k + 1] += vy - queda;
        p[k + 2] += vz;

        const rapidez = Math.hypot(vx, vy, vz) / dt;
        if (rapidez > maisRapido) maisRapido = rapidez;
      }

      for (let n = 0; n < ITERACOES; n++) {
        for (const l of emIndices) distancia(l.a, l.b, l.d, false);
        for (const d of dobrasEmIndices) {
          // trava dura primeiro, mola depois: a mola dá RIGIDEZ à dobra, e é
          // ela que separa "caiu" de "derreteu"
          distancia(d.a, d.b, d.min, true);
          if (d.rigidez > 0) distancia(d.a, d.b, d.repouso, false, d.rigidez);
        }

        for (let k = 0; k < p.length; k += 3) {
          if (caixas) empurrarDeCaixas(p, k, caixas);

          const chao = alturaEm(p[k], p[k + 2]) + raios[k / 3];
          if (p[k + 1] >= chao) continue;
          p[k + 1] = chao;
          // atrito: encostar no chão come o deslize, senão o corpo patina
          anterior[k] += (p[k] - anterior[k]) * ATRITO_CHAO;
          anterior[k + 2] += (p[k + 2] - anterior[k + 2]) * ATRITO_CHAO;
        }
      }

      // Dormir é o que faz um corpo custar zero depois de assentar. Ele tem
      // que ficar quieto por um tempo, e não só num quadro: no alto do arco
      // de uma queda a velocidade também passa por zero.
      if (maisRapido < DORMIR) {
        estado.quieto += dt;
        if (estado.quieto >= DORMIR_TEMPO) estado.dormindo = true;
      } else {
        estado.quieto = 0;
      }
    },

    /**
     * Empurrão LOCAL: velocidade nas juntas em volta de um ponto.
     *
     * É o que faz o tiro ser impacto e não só dano. Um empurrão igual no
     * corpo inteiro só o translada — o corpo sai de lado inteiriço, como um
     * boneco empurrado. Aplicado onde a bala pegou, ele torce: a cabeça vai
     * pra trás no tiro de capacete, a perna sai debaixo do corpo no tiro de
     * coxa, e o resto do corpo acompanha pelas amarras. É a mesma porta que
     * uma explosão vai usar, com raio maior e força maior.
     *
     * O peso cai com a distância e some no raio: sem isso o pé sentiria o
     * tiro na cabeça com a mesma força, que é o contrário do que se quer.
     */
    empurrar(ponto, direcao, forca, raio = 0.45, dt = 1 / 60) {
      if (!ponto || !direcao || forca === 0) return 0;

      let alcancadas = 0;
      for (let k = 0; k < p.length; k += 3) {
        const distancia = Math.hypot(
          p[k] - ponto.x, p[k + 1] - ponto.y, p[k + 2] - ponto.z
        );
        if (distancia >= raio) continue;

        // suave no fim: peso que cai em degrau faz a junta da beirada do raio
        // saltar enquanto a vizinha não sente nada
        const bruto = 1 - distancia / raio;
        const peso = bruto * bruto * (3 - 2 * bruto);
        const empurrao = forca * peso * dt;

        anterior[k] -= direcao.x * empurrao;
        anterior[k + 1] -= direcao.y * empurrao;
        anterior[k + 2] -= direcao.z * empurrao;
        alcancadas++;
      }

      if (alcancadas > 0) {
        estado.dormindo = false;
        estado.quieto = 0;
      }
      return alcancadas;
    },

    /** Junta mais perto de um ponto. Quem empurra no tempo precisa dela. */
    juntaMaisPerto(ponto) {
      let melhor = null;
      let perto = Infinity;
      NOMES.forEach((nome, i) => {
        const k = i * 3;
        const d = Math.hypot(p[k] - ponto.x, p[k + 1] - ponto.y, p[k + 2] - ponto.z);
        if (d < perto) { perto = d; melhor = nome; }
      });
      return melhor;
    },

    /** Posição de uma junta agora, escrita em `out` (x, y, z). */
    posicaoDe(nome, out) {
      const i = indice.get(nome);
      if (i === undefined) return null;
      out.x = p[i * 3];
      out.y = p[i * 3 + 1];
      out.z = p[i * 3 + 2];
      return out;
    },

    /** Quanto o corpo mede de ponta a ponta agora. Só o teste usa. */
    extensao(a, b) {
      const ia = indice.get(a) * 3;
      const ib = indice.get(b) * 3;
      return Math.hypot(p[ib] - p[ia], p[ib + 1] - p[ia + 1], p[ib + 2] - p[ia + 2]);
    }
  };
}

/**
 * Tira a partícula de dentro de uma caixa pelo lado mais perto.
 *
 * Pelo lado mais perto e não pelo de cima: um corpo caindo ao lado de uma
 * parede seria cuspido pro telhado dela.
 */
function empurrarDeCaixas(p, k, caixas) {
  const x = p[k];
  const y = p[k + 1];
  const z = p[k + 2];

  for (const caixa of caixas) {
    const b = caixa.box ?? caixa;
    if (x < b.min.x || x > b.max.x) continue;
    if (y < b.min.y || y > b.max.y) continue;
    if (z < b.min.z || z > b.max.z) continue;

    const saidas = [
      [b.min.x - x, 0, 0], [b.max.x - x, 0, 0],
      [0, b.min.y - y, 0], [0, b.max.y - y, 0],
      [0, 0, b.min.z - z], [0, 0, b.max.z - z]
    ];
    let melhor = saidas[0];
    for (const s of saidas) {
      if (Math.abs(s[0] + s[1] + s[2]) < Math.abs(melhor[0] + melhor[1] + melhor[2])) melhor = s;
    }
    p[k] += melhor[0];
    p[k + 1] += melhor[1];
    p[k + 2] += melhor[2];
    return;
  }
}
