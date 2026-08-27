// Teclas e nomes de postura. Ficam num arquivo só porque locomotion, stance
// e o rótulo de estado precisam dos mesmos valores.

export const FORWARD_KEYS = ['KeyW', 'ArrowUp'];
export const BACK_KEYS = ['KeyS', 'ArrowDown'];
export const RIGHT_KEYS = ['KeyD', 'ArrowRight'];
export const LEFT_KEYS = ['KeyA', 'ArrowLeft'];
export const JUMP_KEYS = ['Space'];
export const RUN_KEYS = ['ShiftLeft', 'ShiftRight'];
export const CROUCH_KEYS = ['KeyC'];
export const PRONE_KEYS = ['KeyZ'];
export const DROP_KEYS = ['KeyG'];
export const PICK_KEYS = ['KeyE'];

/**
 * Inclinar o corpo pra fora da cobertura.
 *
 * Q está livre; E NÃO — ele é o de apanhar do chão e o de embarcar, que já
 * disputam entre si. As três convivem porque as perguntas são diferentes:
 * apanhar e embarcar leem um TOQUE (`consumePress`) e só quando têm o que
 * fazer com ele, e inclinar lê a tecla SEGURADA. Quem consome o toque avisa
 * (`travarE`), e a inclinação larga o E até ele subir — senão apanhar um item
 * dava um solavanco de um quarto de segundo pro lado.
 *
 * Mudar de tecla foi a alternativa considerada e recusada: Q/E é a convenção
 * que o jogador traz de fora, e mover apanhar pro F recriaria exatamente o
 * conflito que tirou a bandeira do E.
 */
export const LEAN_LEFT_KEYS = ['KeyQ'];
export const LEAN_RIGHT_KEYS = ['KeyE'];

// Bandeira tem tecla própria, e não o E de apanhar: item largado ao pé de um
// mastro faria as duas ações disputarem a mesma tecla, e a que perdesse
// pareceria quebrada.
export const FLAG_KEYS = ['KeyF'];
export const RELOAD_KEYS = ['KeyR'];
export const MAP_KEYS = ['KeyM'];
export const SLOT_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];

export const STAND = 'de pé';
export const CROUCH = 'agachado';
export const PRONE = 'deitado';
