/**
 * Munição como recurso: onde se reabastece e o que acontece quando acaba.
 *
 * Sem isto, munição é decoração — recarregar é uma animação e o carregador
 * nunca acaba de verdade, porque morrer devolvia tudo cheio de graça. Com
 * suprimento, gastar rajada tem preço: ou você volta a um posto que o seu
 * time domina, ou vai à faca.
 *
 * Sem three e sem arquivo, como toda regra de partida: dá pra jogar a
 * economia inteira num teste, com armas de mentira e postos de mentira.
 */

export const SUPRIMENTO = {
  /**
   * Distância do centro do posto em que se reabastece, em metros.
   *
   * Generosa de propósito: o posto tem construção no miolo, e obrigar a
   * encostar no mastro faria reabastecer competir com capturar pela mesma
   * laje de dois metros.
   */
  RAIO: 24,

  /**
   * Fração da reserva cheia devolvida por segundo, parado no posto.
   *
   * 0,3 dá pouco mais de três segundos pra encher tudo. Curto o bastante pra
   * não ser espera, longo o bastante pra que reabastecer no meio de um
   * ataque seja ficar parado num lugar que o inimigo sabe onde é.
   */
  POR_SEGUNDO: 0.3,

  /**
   * Quanto uma caixa de munição do chão devolve, em fração da reserva cheia.
   *
   * Meia reserva e não inteira: a caixa é o que sobrou de quem caiu, não um
   * depósito. Enchendo tudo, voltar ao posto deixaria de ter motivo e a
   * economia inteira sumiria — bastaria matar.
   */
  CAIXA: 0.5
};

/**
 * A reserva cheia de uma arma.
 *
 * Guardada no próprio `ammo` quando ele é criado. Sem ela, reabastecer não
 * teria teto e a primeira visita ao posto daria munição infinita.
 */
export function marcarReservaCheia(ammo) {
  if (!ammo) return ammo;
  if (ammo.reserveMax === undefined) ammo.reserveMax = ammo.reserve;

  /**
   * O carregador cheio também é gravado, e NÃO é `magazine`.
   *
   * A Colt tem sete no carregador mais uma na câmara: `magazine` é 7 e o
   * cheio é 8. Restaurar pelo `magazine` fazia renascer com uma bala a menos
   * do que se começa a partida — e o teste que conta a câmara pegou.
   */
  if (ammo.loadedMax === undefined) ammo.loadedMax = ammo.loaded;
  return ammo;
}

/** A arma tem bala em algum lugar — no carregador ou na reserva? */
export function temBala(arma) {
  if (!arma?.firearm) return false;
  if (!arma.ammo) return true;      // arma sem munição declarada não acaba
  return arma.ammo.loaded > 0 || arma.ammo.reserve > 0;
}

/** Nenhuma arma de fogo dele tem bala. É o gatilho pra ir buscar. */
export function secou(armas) {
  for (const arma of armas ?? []) {
    if (arma?.firearm && temBala(arma)) return false;
  }
  return true;
}

/**
 * A reserva dele já está boa o bastante pra voltar pra briga?
 *
 * `secou` é o gatilho pra ir buscar, mas não serve pra decidir quando PARAR:
 * ele vira falso na primeira bala que entra, e o bot largava o posto com uma
 * no bolso pra secar de novo dez metros à frente. Sair exige estar razoavelmente
 * cheio, e é isso que faz a viagem valer a pena.
 */
export function abastecido(armas, fracao = 0.6) {
  let temArma = false;
  for (const arma of armas ?? []) {
    const ammo = arma?.firearm && arma.ammo;
    if (!ammo || ammo.reserveMax === undefined) continue;
    temArma = true;
    if (ammo.reserve >= ammo.reserveMax * fracao) return true;
  }
  return !temArma;
}

/** Ele tem alguma coisa que não é arma de fogo — a faca. */
export function temCorpoACorpo(armas) {
  return (armas ?? []).some((arma) => arma && !arma.firearm);
}

/**
 * Devolve `fracao` da reserva cheia a todas as armas de fogo.
 *
 * Devolve quantas balas entraram, que é zero quando já estava cheio — quem
 * chama usa isso pra saber se vale continuar parado ali.
 */
export function reabastecer(armas, fracao) {
  let entraram = 0;
  for (const arma of armas ?? []) {
    const ammo = arma?.firearm && arma.ammo;
    if (!ammo || ammo.reserveMax === undefined) continue;
    if (ammo.reserve >= ammo.reserveMax) {
      ammo.parcial = 0;
      continue;
    }

    /**
     * A fração ACUMULA antes de virar bala.
     *
     * Parado no posto, cada quadro pede 0,3 × 1/60 da reserva — meia bala.
     * Arredondando por chamada, meia bala vira uma, e o posto entregaria
     * sessenta por segundo em vez de trinta por cento da reserva. O resto
     * fracionário fica guardado no próprio `ammo` e entra no quadro seguinte.
     */
    ammo.parcial = (ammo.parcial ?? 0) + ammo.reserveMax * fracao;
    const quer = Math.floor(ammo.parcial);
    if (quer <= 0) continue;
    ammo.parcial -= quer;

    const antes = ammo.reserve;
    ammo.reserve = Math.min(ammo.reserveMax, ammo.reserve + quer);
    entraram += ammo.reserve - antes;
  }
  return entraram;
}

/** Enche tudo: carregador e reserva. É o que nascer devolve. */
export function encherTudo(armas) {
  for (const arma of armas ?? []) {
    const ammo = arma?.firearm && arma.ammo;
    if (!ammo) continue;
    marcarReservaCheia(ammo);
    ammo.reserve = ammo.reserveMax;
    ammo.loaded = ammo.loadedMax;
  }
  return armas;
}

/**
 * O posto de suprimento mais perto: um que o time DOMINE, dentro do raio.
 *
 * Posto em disputa não serve. Quem está tomando o ponto não deveria poder
 * encher o bolso no mesmo lugar em que está sendo contestado — e isso é o que
 * dá sentido a defender: negar o posto é negar a munição.
 */
export function postoDeSuprimento(postos, team, x, z, dono) {
  let melhor = null;
  let menor = SUPRIMENTO.RAIO;

  for (const posto of postos ?? []) {
    if (dono(posto) !== team) continue;
    const distancia = Math.hypot(posto.x - x, posto.z - z);
    if (distancia > menor) continue;
    menor = distancia;
    melhor = posto;
  }
  return melhor;
}
