import * as THREE from 'three';

/**
 * O som do jogo, GERADO — nenhum arquivo.
 *
 * Mesma decisão do céu: `core/sky.js` desenha a textura com o ruído do
 * relevo e o projeto continua abrindo offline, sem asset e sem CDN. Um
 * .wav de tiro seria a primeira dependência binária da base, e a última
 * coisa que alguém consegue ajustar lendo o código.
 *
 * Um tiro é três coisas somadas: o ESTOURO (ruído branco que morre em
 * milissegundos), o CORPO (uma senoide grave que dá o peso do calibre) e a
 * COLA (uma cauda de ruído filtrado que é o eco batendo em volta). Mudando
 * três números dá pra distinguir a MP40 da Colt, que é exatamente o que se
 * quer ouvir num tiroteio.
 *
 * Ele é POSICIONAL de propósito. O bot já reage a som — `alerta` acorda
 * quem ouviu um tiro a 45 m — e o jogador não tinha essa informação: virar
 * pro lado certo era privilégio de quem estava olhando. Som que vem da
 * direita é a mesma família do radar e da bússola, informação de rumo.
 *
 * Nada aqui pode estourar sem AudioContext. A suíte roda em headless e o
 * navegador só libera áudio depois de um gesto do usuário: `pronto` é falso
 * até lá, e todo mundo continua chamando `tiro()` sem saber disso.
 */

/** Sons tocando ao mesmo tempo. Passou disso, o mais velho cede a vez. */
const VOZES = 24;

/** A ficha de cada som. Exportada porque a suíte confere a onda que sai. */
export const RECEITAS = {
  // Rajada curta e seca: cano curto, 9 mm.
  mp40: { duracao: 0.28, corpo: 150, estouro: 0.9, cauda: 0.16, ganho: 0.55 },
  // Mais grave e mais estalada: .45 é um soco, não um estalo.
  colt: { duracao: 0.34, corpo: 105, estouro: 1.0, cauda: 0.2, ganho: 0.7 },
  // Bala batendo em terra: sem estouro, só o baque abafado.
  terra: { duracao: 0.14, corpo: 90, estouro: 0.25, cauda: 0.06, ganho: 0.35 },
  // Em pedra ou concreto: agudo, curto, com um pingo de ricochete.
  pedra: { duracao: 0.18, corpo: 320, estouro: 0.6, cauda: 0.1, ganho: 0.3 },
  // Bala no corpo: grave, curto e sem cauda nenhuma.
  carne: { duracao: 0.12, corpo: 70, estouro: 0.35, cauda: 0.02, ganho: 0.5 }
};

/**
 * Sintetiza o buffer de um som.
 *
 * O envelope é exponencial porque percussão é exponencial: uma queda linear
 * soa como alguém abaixando o volume, não como coisa estourando.
 */
export function sintetizar(ctx, { duracao, corpo, estouro, cauda, ganho }) {
  const taxa = ctx.sampleRate;
  const amostras = Math.floor(taxa * duracao);
  const buffer = ctx.createBuffer(1, amostras, taxa);
  const dado = buffer.getChannelData(0);

  // Ruído com memória: ruído branco puro soa como chiado de rádio. Cada
  // amostra puxa um pouco da anterior, e isso já é um passa-baixa de um polo.
  let anterior = 0;
  let fase = 0;

  for (let i = 0; i < amostras; i++) {
    const t = i / taxa;
    const passo = i / amostras;

    const branco = Math.random() * 2 - 1;
    anterior = anterior * 0.6 + branco * 0.4;

    // Estouro: morre em ~8 ms. É ele que dá o "crack".
    const golpe = Math.exp(-t * 260) * estouro * branco;
    // Corpo: a frequência CAI ao longo do som, senão vira apito.
    fase += (corpo * (1 - passo * 0.5)) / taxa;
    const grave = Math.exp(-t * 34) * Math.sin(fase * Math.PI * 2);
    // Cauda: o ambiente devolvendo o estouro.
    const eco = Math.exp(-t * 12) * cauda * anterior;

    dado[i] = Math.tanh((golpe + grave * 0.8 + eco) * ganho * 1.6);
  }
  return buffer;
}

/**
 * `camera` recebe o ouvido: quem ouve é o olho do jogador, e o three usa a
 * matriz da câmera pra decidir de que lado o som chega.
 */
export function criarAudio(camera, scene) {
  const ouvido = new THREE.AudioListener();
  camera.add(ouvido);

  const ctx = ouvido.context;
  const buffers = new Map();
  const vozes = [];
  let proxima = 0;
  let pronto = false;

  /**
   * O navegador nasce com o contexto suspenso e só libera depois de um gesto.
   * Como o jogo já exige clique pra travar o ponteiro, isto acontece sozinho —
   * mas tem que ser chamado DEPOIS do gesto, nunca no boot.
   */
  function despertar() {
    if (pronto || !ctx) return false;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    for (const [nome, receita] of Object.entries(RECEITAS)) {
      buffers.set(nome, sintetizar(ctx, receita));
    }
    // A piscina existe pelo mesmo motivo que a do traçante: num tiroteio de
    // 300 bots são mais de mil tiros por segundo, e um PositionalAudio novo
    // por tiro é um nó de panner criado e descartado por milissegundo.
    for (let i = 0; i < VOZES; i++) {
      const voz = new THREE.PositionalAudio(ouvido);
      voz.setRefDistance(12);
      voz.setRolloffFactor(1.1);
      voz.setDistanceModel('exponential');
      // A voz vive NA CENA, não na câmera: pendurada na câmera ela andaria
      // junto com a cabeça do jogador e todo som sairia dos dois lados igual.
      scene.add(voz);
      vozes.push(voz);
    }
    pronto = true;
    return true;
  }

  /**
   * Toca `nome` em (x, y, z). `variacao` desafina o som um pouco a cada
   * tiro: sem isso, uma rajada de automática soa como um arquivo repetindo,
   * que é exatamente o que ela é.
   */
  function tocar(nome, x, y, z, { volume = 1, variacao = 0.12 } = {}) {
    if (!pronto) return null;
    const buffer = buffers.get(nome);
    if (!buffer) return null;

    const voz = vozes[proxima];
    proxima = (proxima + 1) % VOZES;

    if (voz.isPlaying) voz.stop();
    // O nó do panner anda com o objeto: pôr a voz onde o som nasceu é o
    // trabalho inteiro, e é por isso que ela entra e sai da cena.
    voz.position.set(x, y, z);
    voz.setBuffer(buffer);
    voz.setVolume(volume);
    voz.setPlaybackRate(1 + (Math.random() * 2 - 1) * variacao);
    voz.play();
    return voz;
  }

  return {
    despertar,
    tocar,
    ouvido,
    get pronto() {
      return pronto;
    }
  };
}
