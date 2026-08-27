/**
 * O ciclo de passada: onde as pernas estão depois de andados tantos metros.
 *
 * A fase sai da DISTÂNCIA percorrida, nunca do relógio. Por tempo, o passo
 * teria sempre a mesma cadência e o pé patinaria em toda velocidade que não
 * fosse a de projeto — o mesmo defeito da integração por framerate que o pulo
 * já tinha. Por distância, quem anda devagar dá passo devagar de graça.
 *
 * E andar e correr não são dois estados, são um CONTÍNUO: a passada cresce
 * com a velocidade, como cresce a de gente. Um limiar entre os dois só
 * apareceria como um salto de pose no metro em que ele fosse cruzado — e
 * pior, os números não batem entre os dois corpos que usam isto (bot anda a
 * 2,6–3,6 m/s, o jogador corre a 8,4), então um limiar em metros por segundo
 * deixaria o bot sempre andando e o jogador sempre correndo.
 *
 * Sem three de propósito: é um ângulo por osso a partir de um número. Dá pra
 * conferir que o pé não atravessa o outro sem montar cena nenhuma.
 */

const TAU = Math.PI * 2;

/**
 * Comprimento da passada, em metros, do parado ao corrido.
 *
 * Um ciclo inteiro são DOIS passos — a perna esquerda volta ao mesmo lugar
 * depois que a direita também andou. Por isso a fase avança pela distância
 * dividida pelo dobro disto.
 */
const PASSO_CURTO = 0.62;
const PASSO_LONGO = 1.15;

/**
 * Amplitudes no andar e no corrido, em radianos.
 *
 * `coxa` é o quanto a perna vai à frente e atrás; `joelho` é o quanto ela
 * dobra pra passar por baixo do corpo — sem ele o pé varre o chão como um
 * compasso e a perna atravessa o outro pé. `subida` é o balanço vertical do
 * quadril, em metros, e `rolagem` é o corpo pendendo pro lado do pé que está
 * apoiado.
 */
const ANDANDO = { coxa: 0.34, joelho: 0.52, subida: 0.022, rolagem: 0.030, arma: 0.020 };
const CORRENDO = { coxa: 0.72, joelho: 1.15, subida: 0.055, rolagem: 0.055, arma: 0.055 };

/**
 * Quanto o joelho ATRASA em relação à coxa, em radianos de fase.
 *
 * Zero e o joelho dobraria no mesmo instante em que a perna está mais à
 * frente, que é justamente quando ela tem que estar esticada pra pisar. O
 * atraso é o que põe a dobra na volta, quando o pé sai do chão.
 */
const ATRASO_DO_JOELHO = 1.05;

/** Abaixo disto o corpo está parado, e passada de quem está parado é tique. */
const PARADO_ATE = 0.15;

/**
 * Segundos pra a passada entrar e pra ela sair. NÃO são o mesmo número.
 *
 * Entrar é rápido — o corpo já está andando quando a perna começa. Sair é
 * mais lento porque parar é assentar o pé, e porque uma amostra solta de
 * deslocamento zero não pode apagar a passada inteira.
 *
 * Esse segundo motivo é medido, não teórico: `main.js` atualizava cada bot
 * DUAS vezes por quadro (a lista de alvos da bala virou lista de update), e
 * na segunda o corpo não tinha andado nada desde a primeira. Com subida e
 * descida iguais em 0,18 s, um quadro de 0,1 s derrubava o embalo de 0,556
 * direto pra zero, e a perna voltava ao repouso todo quadro — um exército
 * inteiro deslizando de pernas retas com a fase do passo correndo por baixo.
 * A causa foi consertada onde ela estava; a assimetria aqui é o que impede
 * que a próxima chamada a mais faça o mesmo estrago.
 */
const EMBALO_SOBE = 0.12;
const EMBALO_DESCE = 0.34;

/**
 * Move `embalo` na direção de quem está andando ou parado.
 *
 * Fica aqui e não em quem chama porque os dois corpos que usam a passada —
 * o bot e o jogador em primeira pessoa — precisam da MESMA suavização, e
 * duas cópias divergiriam no primeiro ajuste.
 */
export function embalarPara(embalo, velocidade, delta) {
  const alvo = velocidade < PARADO_ATE ? 0 : 1;
  const salto = delta / (alvo > embalo ? EMBALO_SOBE : EMBALO_DESCE);
  if (Math.abs(alvo - embalo) <= salto) return alvo;
  return embalo + Math.sign(alvo - embalo) * salto;
}

function mistura(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Quanto a fase avança depois de andados `metros` a `velocidade`.
 *
 * Devolve a fase nova, sempre em 0..1. Parado ela não anda: passo continuado
 * com o corpo no lugar é o boneco deslizando, ao contrário.
 */
export function avancarFase(fase, metros, velocidade, corridaAcima) {
  if (velocidade < PARADO_ATE || metros <= 0) return fase;
  const esforco = forca(velocidade, corridaAcima);
  const passo = mistura(PASSO_CURTO, PASSO_LONGO, esforco);
  const nova = fase + metros / (passo * 2);
  return nova - Math.floor(nova);
}

/** Quanto do corrido há nesta velocidade, de 0 a 1. */
export function forca(velocidade, corridaAcima) {
  if (!(corridaAcima > 0)) return 0;
  const t = velocidade / corridaAcima;
  return t <= 0 ? 0 : (t >= 1 ? 1 : t);
}

/**
 * A pose das pernas nesta fase, mais o que o tronco e a arma fazem junto.
 *
 * `lados` diz que sufixo de osso é a perna direita e qual é a esquerda: o
 * arquivo nomeia os lados ao contrário do jogo, e a passada não pode
 * redescobrir isso sozinha (ver `LADO_EM_X`).
 *
 * A pose é SOMADA ao repouso por quem aplica, então ela é o desvio e não a
 * posição — é assim que ela convive com a mira e com o solavanco.
 */
export function passoEm(fase, velocidade, corridaAcima, lados = { dir: 'L', esq: 'R' }, embalo = null) {
  const esforco = forca(velocidade, corridaAcima);
  // `embalo` é o quanto da passada está valendo agora, de 0 a 1. Sem ele o
  // peso é binário, e binário SALTA: o bot que para vai de meia passada pro
  // repouso num quadro, com a perna teleportando de volta. Quem passa o
  // embalo o traz suavizado, e aí parar vira assentar.
  const peso = embalo === null
    ? (velocidade < PARADO_ATE ? 0 : 1)
    : Math.max(0, Math.min(1, embalo));

  const coxa = mistura(ANDANDO.coxa, CORRENDO.coxa, esforco) * peso;
  const joelho = mistura(ANDANDO.joelho, CORRENDO.joelho, esforco) * peso;
  const subida = mistura(ANDANDO.subida, CORRENDO.subida, esforco) * peso;
  const rolagem = mistura(ANDANDO.rolagem, CORRENDO.rolagem, esforco) * peso;
  const arma = mistura(ANDANDO.arma, CORRENDO.arma, esforco) * peso;

  const angulo = fase * TAU;
  const pose = {};
  for (const [nome, deslocamento] of [[lados.dir, 0], [lados.esq, Math.PI]]) {
    const a = angulo + deslocamento;
    // Sinal negativo porque a perna aponta pro -y: girar em +x a leva pra
    // trás, e é o mesmo sinal que o corpo em primeira pessoa já usava.
    pose[`thigh_${nome}`] = [-coxa * Math.sin(a), 0, 0];
    // O joelho só DOBRA — nunca vira do avesso —, e por isso a onda é
    // retificada em vez de senoidal.
    pose[`knee_${nome}`] = [joelho * Math.max(0, Math.sin(a - ATRASO_DO_JOELHO)), 0, 0];
  }

  // O quadril sobe duas vezes por ciclo: uma por passo, no instante em que a
  // perna de apoio está esticada embaixo do corpo.
  return {
    pose,
    subida: subida * Math.abs(Math.sin(angulo)),
    // A rolagem é uma vez por ciclo: o corpo pende pro lado do pé apoiado, e
    // esse lado só troca a cada passo.
    rolagem: rolagem * Math.sin(angulo),
    // A arma acompanha o corpo. Ela não é presa nele — o porte vive no
    // grupo, não no peito —, então o balanço tem que ser repassado, senão a
    // arma fica parada no ar enquanto o soldado sobe e desce por baixo dela.
    //
    // E acompanha com a MESMA onda do quadril, não com uma senoide solta:
    // com `sin` contra `|sin|`, meio ciclo tinha o corpo subindo enquanto a
    // arma descia. Medido, os ombros afastavam 6 cm do guarda-mão e a IK
    // truncava — a mão desgrudava da arma só naquele trecho do passo, que é
    // o tipo de defeito que só aparece andando.
    arma: arma * Math.abs(Math.sin(angulo))
  };
}

export const PASSADA = {
  PASSO_CURTO, PASSO_LONGO, PARADO_ATE, EMBALO_SOBE, EMBALO_DESCE, ANDANDO, CORRENDO
};
