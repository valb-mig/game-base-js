import * as THREE from 'three';
import { WORLD } from '../config.js';

/**
 * A lâmina d'água do rio.
 *
 * É uma fita que segue o leito, não o plano do mar: o rio corre a 7,9 m e o
 * mar está no zero, e um plano só não pode estar nos dois lugares. A fita é
 * plana em Y — quem esconde a sobra são as margens, que sobem acima do nível
 * da água e ocultam o resto por oclusão. Recortar a fita na largura exata
 * custaria consultar o campo de altura por vértice e não mudaria um pixel.
 *
 * A ondulação anda ao longo do X com o tempo. Rio parado lê como lagoa, e o
 * que se quer dizer é que ele corre — é a correnteza que justifica ele ser
 * gargalo, junto com os 2,4 m de fundo.
 */

const SEGMENTOS = 260;    // ao longo do rio: a serpentina precisa de resolução
const FAIXAS = 6;         // atravessando: só o bastante pra ondular

export function createRiver(riverBedAt) {
  const geometry = new THREE.PlaneGeometry(
    WORLD.SIZE, WORLD.RIO_MARGEM * 2, SEGMENTOS, FAIXAS
  );
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;

  // O plano nasce reto; empurrar cada vértice pro leito é o que faz a fita
  // serpentear junto com o rio. O X vira o eixo do rio e o Z o atravessa.
  const base = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i) + riverBedAt(x);
    position.setX(i, x);
    position.setZ(i, z);
    base[i * 2] = x;
    base[i * 2 + 1] = z;
  }
  position.needsUpdate = true;

  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
    color: WORLD.RIO_COR,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    flatShading: true
  }));
  mesh.position.y = WORLD.RIO_NIVEL;
  mesh.name = 'rio';

  function update(time) {
    for (let i = 0; i < position.count; i++) {
      const x = base[i * 2];
      const z = base[i * 2 + 1];
      // a fase anda com +x: a onda desce o rio em vez de bater no lugar
      position.setY(i,
        Math.sin(x * 0.09 - time * 2.6) * 0.07 +
        Math.sin(z * 0.13 - time * 1.7) * 0.05);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  return { mesh, update };
}
