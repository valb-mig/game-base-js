/**
 * Uma roda: suspensão, tração e atrito. Matemática pura, sem three.
 *
 * Cada roda é resolvida por conta própria e o corpo só soma o que as quatro
 * mandaram. É essa separação que faz o comportamento emergir em vez de ser
 * escrito: roda no ar não tem carga, sem carga não tem atrito, sem atrito não
 * tem curva nem tração — e isso é o mesmo código que faz subida com pneu
 * furado ficar difícil e capotamento acontecer.
 *
 * A ordem é sempre: quanta CARGA a mola está segurando, e só então quanta
 * força o pneu pode passar pro chão. Nunca o contrário — força de pneu que não
 * depende de carga é o que faz carro de arcade colar na pista.
 */

/** Estado que cada roda carrega entre quadros. */
export function criarRoda(config) {
  return {
    config,
    haste: 0,          // comprimento atual da haste da suspensão, em metros
    compressao: 0,     // quanto ela está comprimida
    carga: 0,          // newtons que ela está segurando
    noChao: false,
    esterco: 0,        // ângulo esterçado, em radianos
    giro: 0,           // giro do pneu, só pro desenho
    patinando: 0,      // 0..1, quanto a força pedida passou do que o chão dá
    chaoY: 0,
    tipo: null
  };
}

/**
 * A força vertical da suspensão, em newtons.
 *
 * `yTorre` é onde a haste pendura (já com o caimento e a rolagem do chassi
 * aplicados) e `chaoY` é o chão sob a roda. O cubo tenta ficar a `HASTE_MAX`
 * da torre; se o chão está mais perto que isso, a mola comprime.
 *
 * Roda no ar devolve ZERO, e é a linha mais importante do arquivo: é ela que
 * faz o jipe perder tração ao passar de uma lombada e é ela que deixa o
 * capotamento acontecer, porque sem força nenhuma nada aprumaria ele de volta.
 */
export function suspensao(ficha, roda, yTorre, chaoY, delta) {
  const distancia = yTorre - (chaoY + ficha.RAIO_RODA);
  roda.chaoY = chaoY;

  if (distancia >= ficha.HASTE_MAX) {
    roda.haste = ficha.HASTE_MAX;
    roda.compressao = 0;
    roda.carga = 0;
    roda.noChao = false;
    return 0;
  }

  const anterior = roda.compressao;
  roda.haste = Math.max(distancia, ficha.HASTE_MAX - ficha.CURSO * 2);
  roda.compressao = ficha.HASTE_MAX - roda.haste;
  roda.noChao = true;

  let forca = ficha.MOLA * Math.min(roda.compressao, ficha.CURSO);
  // Batente: passado o curso, o que resta é aço contra aço. Sem ele o jipe
  // afunda pelo chão numa queda de altura e volta como se nada tivesse
  // acontecido — e é justamente a queda que tem que doer.
  if (roda.compressao > ficha.CURSO) {
    forca += ficha.BATENTE * (roda.compressao - ficha.CURSO);
  }
  // Amortecedor pela TAXA de compressão, não pela velocidade vertical do
  // corpo: é a compressão que ele resiste, e as duas são diferentes quando o
  // chassi está girando.
  if (delta > 0) forca += ficha.AMORTECEDOR * (roda.compressao - anterior) / delta;

  /**
   * Mola não empurra pra baixo — sem isto o amortecedor sozinho, numa extensão
   * rápida, GRUDA o jipe no chão.
   *
   * E ela tem TETO. O batente é sete vezes mais rígido que a mola, e um estado
   * inicial ruim (veículo posto no mapa dentro de uma ladeira, roda meio metro
   * dentro do barranco) gerava 58 kN numa roda só — cinco vezes o peso do jipe
   * inteiro, num quadro. O que se via era o jipe explodir pra cima girando, e o
   * teto não muda nada em nenhum caso normal: a carga estática é 2,8 kN.
   */
  const teto = ficha.MASSA * 9.81 * 3;
  return Math.max(0, Math.min(forca, teto));
}

/**
 * As forças do pneu no plano, no sistema do CORPO: `fx` pra esquerda, `fz` pra
 * frente.
 *
 * `vx`/`vz` são a velocidade do ponto de contato desta roda (já com o giro do
 * corpo somado), `tracao` é a força que o motor manda pra ela e `freio` a que
 * o pedal pede. O teto é o círculo de atrito: µ vezes a carga, dividido entre
 * acelerar e curvar. Quem pede mais do que isso patina — e patinar é o que se
 * quer ver na lama e na subida.
 */
export function forcasDoPneu(ficha, roda, {
  vx, vz, tracao, freio, atrito, rolamento, rigidez
}) {
  if (!roda.noChao || roda.carga <= 0) {
    roda.patinando = 0;
    return { fx: 0, fz: 0 };
  }

  const sen = Math.sin(roda.esterco);
  const cos = Math.cos(roda.esterco);

  // Velocidade decomposta no sistema da RODA: ao longo dela e de lado.
  const aoLongo = vx * sen + vz * cos;
  const deLado = vx * cos - vz * sen;

  const limite = atrito * roda.carga;

  // Longitudinal: o que o motor manda, menos freio e resistência ao rolamento.
  let fLongo = tracao;
  const contra = Math.sign(aoLongo);
  fLongo -= contra * freio;
  fLongo -= contra * rolamento * roda.carga;
  // Freio não pode empurrar o carro pra trás: quando ele já parou a roda, o
  // que sobra é atrito estático, e ele não inverte o movimento.
  if (freio > 0 && Math.abs(aoLongo) < 0.3) fLongo = tracao;

  // Lateral: proporcional ao escorregamento, contra ele. É a curva inteira.
  let fLado = -deLado * rigidez;

  const pedida = Math.hypot(fLongo, fLado);
  if (pedida > limite && pedida > 1e-6) {
    const fator = limite / pedida;
    fLongo *= fator;
    fLado *= fator;
    roda.patinando = Math.min(1, 1 - fator);
  } else {
    roda.patinando = 0;
  }

  // Volta pro sistema do corpo. `fx` é pra esquerda porque +X é a esquerda.
  return {
    fx: fLongo * sen + fLado * cos,
    fz: fLongo * cos - fLado * sen
  };
}

/**
 * O giro do pneu pro desenho, em radianos.
 *
 * Sai da velocidade ao longo da roda dividida pelo raio: pneu que gira
 * enquanto o jipe está parado no lugar seria mentira, e é justamente o que se
 * quer ver quando ele PATINA — aí o giro vem da força, não da velocidade.
 */
export function girar(ficha, roda, aoLongo, delta) {
  const rolando = aoLongo / ficha.RAIO_RODA;
  // Patinando, a roda gira mais rápido do que o chão passa por baixo dela.
  roda.giro += rolando * (1 + roda.patinando * 2.5) * delta;
  return roda.giro;
}
