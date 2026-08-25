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

// Bandeira tem tecla própria, e não o E de apanhar: item largado ao pé de um
// mastro faria as duas ações disputarem a mesma tecla, e a que perdesse
// pareceria quebrada.
export const FLAG_KEYS = ['KeyF'];
export const RELOAD_KEYS = ['KeyR'];
export const SLOT_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];

export const STAND = 'de pé';
export const CROUCH = 'agachado';
export const PRONE = 'deitado';
