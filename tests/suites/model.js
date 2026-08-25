import * as THREE from 'three';
import { createKnife } from '../../src/items/knife.js';
import { suite, ok, eq, between, note } from '../assert.js';

/**
 * Malha da faca. Um render sozinho não pega triângulo de área zero nem
 * winding invertido — os dois já apareceram aqui, então viraram teste.
 */
export async function run() {
  suite('modelo da faca');

  const knife = createKnife();
  const blade = knife.children[0];
  const position = blade.geometry.attributes.position;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();

  let degenerate = 0;
  let inverted = 0;
  const total = position.count / 3;

  // ordem em que buildBladeGeometry emite: frente, frente, trás, trás, quilha, quilha;
  // os três últimos antes da tampa são o leque da ponta
  const CYCLE = ['+z', '+z', '-z', '-z', '+y', '+y'];

  for (let t = 0; t < total; t++) {
    const i = t * 3;
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    normal.copy(b).sub(a).cross(c.clone().sub(a));

    if (normal.length() / 2 < 1e-9) { degenerate++; continue; }
    normal.normalize();

    const kind = t === total - 1
      ? 'tampa'
      : (t >= total - 4 ? ['+z', '-z', '+y'][t - (total - 4)] : CYCLE[t % 6]);

    const outward = kind === '+z' ? normal.z > 0
      : kind === '-z' ? normal.z < 0
      : kind === '+y' ? normal.y > 0
      : normal.x < 0;

    if (!outward) inverted++;
  }

  eq('nenhum triângulo de área zero', degenerate, 0);
  eq('nenhuma face virada pra dentro', inverted, 0);

  let triangles = 0;
  knife.traverse((object) => {
    if (!object.geometry) return;
    const attribute = object.geometry.attributes.position;
    triangles += object.geometry.index ? object.geometry.index.count / 3 : attribute.count / 3;
  });
  ok('continua low poly', triangles < 600, `${triangles} triângulos`);

  const size = new THREE.Box3().setFromObject(knife).getSize(new THREE.Vector3());
  between('comprimento na medida da KA-BAR real', size.x * 100, 30, 33);
  note('dimensões', `${(size.x * 100).toFixed(1)} x ${(size.y * 100).toFixed(1)} x ${(size.z * 100).toFixed(1)} cm`);

  suite('item na mão nasce na guarda');

  // Regressão: `update` só roda com o mouse travado, e entre desembarcar e o
  // pointer lock ser dado o item ficava na origem da câmera do viewmodel —
  // do tamanho da tela inteira, um borrão preto por cima do mapa.
  const { Viewmodel } = await import('../../src/items/viewmodel.js');
  const { PISTOL } = await import('../../src/items/classes.js');
  const viewmodel = new Viewmodel(new THREE.PerspectiveCamera(70, 1, 0.1, 400), 1);
  viewmodel.setItem(PISTOL);

  ok('a arma não fica na origem da câmera do viewmodel',
    viewmodel.group.position.length() > 0.1,
    `${viewmodel.group.position.length().toFixed(2)} m do olho`);
  ok('e sim à frente dele', viewmodel.group.position.z < -0.3,
    `z ${viewmodel.group.position.z.toFixed(2)}`);
}
