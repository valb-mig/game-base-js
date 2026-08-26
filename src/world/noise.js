/**
 * Ruído de valor determinístico. Matemática pura, sem three.
 *
 * Mora num arquivo próprio porque duas camadas do mapa dependem dele — o
 * relevo (`heightfield.js`) e a densidade de floresta (`densidade.js`) — e
 * duas cópias do gerador dariam dois mapas que se dizem iguais e não são.
 * É o mesmo motivo pelo qual `espalhar` e `sorteioFixo` vivem em `props.js`.
 */

// Math.imul mantém a multiplicação em 32 bits, senão o hash perde precisão e
// o ruído vira faixa.
export function hash(ix, iz) {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

export function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smoothstep(x - ix);
  const fz = smoothstep(z - iz);

  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);

  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

/**
 * Soma de oitavas, resultado em -1..1.
 *
 * O número de oitavas é do CHAMADOR, não fixo: o relevo quer três (a terceira
 * é o encaroçado que faz a lombada não parecer torneada), e a densidade de
 * floresta quer duas — uma terceira oitava ali recorta a borda da mata em
 * dente de serra sem mudar onde a mata está.
 */
export function fbm(x, z, oitavas = 3) {
  let sum = 0;
  let norm = 0;
  let amplitude = 1;
  let frequency = 1;

  for (let octave = 0; octave < oitavas; octave++) {
    sum += valueNoise(x * frequency, z * frequency) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.13;
  }
  return (sum / norm) * 2 - 1;
}

/**
 * Ruído de valor que FECHA num período: o `hash` recebe a coordenada da grade
 * dobrada em `periodo`, então a última célula da direita é vizinha da primeira
 * da esquerda.
 *
 * Existe porque textura repetida MOSTRA a costura. A amostragem que serve ao
 * relevo é uma grade infinita: a borda direita da imagem não tem nada a ver
 * com a esquerda, e a repetição desenha uma linha reta a cada tile — no chão
 * isso lê como grade desenhada, não como superfície.
 */
function valueNoiseTileavel(x, z, periodo) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smoothstep(x - ix);
  const fz = smoothstep(z - iz);

  // Módulo de JS devolve negativo pra entrada negativa, e a costura voltaria
  // exatamente na metade esquerda da imagem.
  const dobra = (v) => ((v % periodo) + periodo) % periodo;
  const x0 = dobra(ix);
  const z0 = dobra(iz);
  const x1 = dobra(ix + 1);
  const z1 = dobra(iz + 1);

  const a = hash(x0, z0);
  const b = hash(x1, z0);
  const c = hash(x0, z1);
  const d = hash(x1, z1);

  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

/**
 * Soma de oitavas que fecha no período. Resultado em -1..1.
 *
 * A razão entre oitavas é 3, e não o 2,13 do `fbm` do relevo: pra fechar, a
 * frequência tem que ser INTEIRA — com 2,13 a oitava de cima não dobra junto
 * com o período e a costura volta, agora só nas frequências altas, que é pior
 * porque parece falha de textura em vez de repetição. O 2,13 existe pra não
 * alinhar harmônico com os eixos; entre os inteiros, 3 alinha menos que 2.
 */
export function fbmTileavel(x, z, periodo, oitavas = 3) {
  let sum = 0;
  let norm = 0;
  let amplitude = 1;
  let frequency = 1;

  for (let octave = 0; octave < oitavas; octave++) {
    sum += valueNoiseTileavel(x * frequency, z * frequency, periodo * frequency)
      * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 3;
  }
  return (sum / norm) * 2 - 1;
}
