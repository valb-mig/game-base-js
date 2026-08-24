import { WORLD } from '../config.js';
import { addBox, addLabel } from './props.js';
import { createDummy } from './dummy.js';

/**
 * Campo de treino: uma estação por combinação de comandos. É andaime de
 * desenvolvimento, não cenário — fica numa clareira achatada perto da base
 * norte e some inteiro se este módulo deixar de ser chamado.
 *
 *   escada       -> degrau automático enquanto anda ou corre
 *   salto largo  -> vão de 4 m: andando alcança 3,3 m, correndo 5,6 m
 *   túnel        -> teto a 1,05 m: só passa agachado
 *   passagem alta-> plataforma a 1 m sob teto a 2,4 m: só pulando agachado
 *   rastejo      -> teto a 0,7 m: agachado não passa, só deitado
 *   estande      -> bonecos de baioneta pra testar alcance e dano do golpe
 */
export function addTrainingCourse(scene, colliders, { origin, ground }) {
  const [RED, AMBER, BLUE, PURPLE, BONE] =
    [0xd94f4f, 0xe0a02f, 0x3f7ad9, 0xa050c0, 0xe8e0d0];

  const ox = origin.x;
  // as estações descem no -Z a partir da entrada da clareira
  const at = (offset) => origin.z - WORLD.COURSE_LENGTH / 2 + offset;
  const put = (options) => addBox(scene, colliders, { ...options, y: ground + (options.y ?? 0) });

  // 1. escada — 5 degraus de 0,3 m, dentro do STEP_HEIGHT
  for (let i = 0; i < 5; i++) {
    put({ x: ox, z: at(4 + i * 1.2), w: 4, d: 1.2, h: 0.3 * (i + 1), color: BONE });
  }
  put({ x: ox, z: at(11.2), w: 4, d: 2.4, h: 1.5, color: BONE });
  addLabel(scene, 'escada · andar/correr', ox, ground + 3.2, at(7));

  // 2. salto largo — 4 m de vão livre entre plataformas de 1,5 m.
  // Andando o alcance é ~3,3 m; correndo, ~5,6 m. Só passa correndo.
  put({ x: ox, z: at(19.2), w: 4, d: 4, h: 1.5, color: AMBER });
  addLabel(scene, 'salto largo · correr + pular', ox, ground + 3.6, at(15));

  // 3. túnel agachado — vão livre de 1,05 m (de pé são 1,7)
  put({ x: ox - 2.5, z: at(26), w: 1, d: 4, h: 2.4, color: BLUE });
  put({ x: ox + 2.5, z: at(26), w: 1, d: 4, h: 2.4, color: BLUE });
  put({ x: ox, z: at(26), y: 1.05, w: 6, d: 4, h: 1.35, color: BLUE, standable: false });
  addLabel(scene, 'túnel · agachar (C)', ox, ground + 3.6, at(22));

  // 4. passagem alta — degrau de 1 m sob teto de 2,4 m. De pé a cabeça bate
  // (1 + 1,7); agachado no ar cabe (1 + 0,95). É o crouch-jump.
  put({ x: ox, z: at(34), w: 5, d: 4, h: 1, color: PURPLE });
  put({ x: ox, z: at(34), y: 2.4, w: 5, d: 4, h: 0.6, color: PURPLE, standable: false });
  put({ x: ox - 3, z: at(34), w: 1, d: 4, h: 3, color: PURPLE });
  put({ x: ox + 3, z: at(34), w: 1, d: 4, h: 3, color: PURPLE });
  addLabel(scene, 'passagem alta · pular agachado', ox, ground + 4.5, at(30));

  // 5. rastejo — vão livre de 0,7 m: agachado (0,95) não passa, deitado (0,5) sim
  put({ x: ox - 2.5, z: at(42), w: 1, d: 5, h: 1.6, color: RED });
  put({ x: ox + 2.5, z: at(42), w: 1, d: 5, h: 1.6, color: RED });
  put({ x: ox, z: at(42), y: 0.7, w: 6, d: 5, h: 0.9, color: RED, standable: false });
  addLabel(scene, 'rastejo · deitar (Z)', ox, ground + 3.2, at(38));

  // 6. estande de baioneta — três bonecos lado a lado, virados pra quem chega
  const dummies = [-2.6, 0, 2.6].map((offset, i) => createDummy(scene, colliders, {
    x: ox + offset, z: at(50), ground, facing: Math.PI, name: `boneco ${i + 1}`
  }));
  addLabel(scene, 'estande · golpe com o botão esquerdo', ox, ground + 3.4, at(46), 5.2);

  return dummies;
}
