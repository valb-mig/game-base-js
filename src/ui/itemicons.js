/**
 * Qual ícone da biblioteca representa cada item.
 *
 * Vive fora do HUD porque o cinto em jogo e a tira da tela de deploy têm que
 * mostrar a MESMA coisa: o jogador decora o desenho no menu e procura por ele
 * no canto da tela. Duas tabelas se separariam no primeiro item novo.
 *
 * Item sem entrada aqui não ganha desenho genérico — ele fica só com o nome.
 * Caixa de reserva no lugar de um ícone é pior que ícone nenhum: promete que
 * há arte onde não há.
 */
export const ITEM_ICONS = { m1911: 'pistol-gun', kabar: 'bowie-knife', m1943: 'spade' };
