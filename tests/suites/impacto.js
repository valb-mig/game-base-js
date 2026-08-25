import * as THREE from 'three';
import { createBallistics } from '../../src/items/ballistics.js';
import { createDeform, DEFORM } from '../../src/world/deform.js';
import { TERRAIN_BITE, PISTOL, THOMPSON, KNIFE, SHOVEL } from '../../src/items/classes.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

const DT = 1 / 60;

/** Bancada: terreno plano escavável e uma balística ligada nele. */
function bancada() {
  const deform = createDeform();
  const terrain = { heightAt: (x, z) => deform.deltaAt(x, z) };
  const scene = new THREE.Scene();

  let impactos = 0;
  const ballistics = createBallistics(scene, [], {
    onTerrainImpact: (x, z, fundo) => {
      impactos++;
      deform.apply(x, z, -fundo);
    }
  });

  return {
    deform,
    terrain,
    ballistics,
    get impactos() { return impactos; },

    /** Dispara direto pra baixo, num ponto conhecido, e espera a bala chegar. */
    tiro(x, z, dig) {
      ballistics.spawn(
        new THREE.Vector3(x, 12, z),
        new THREE.Vector3(0, -1, 0),
        { damage: 10, range: 60, dig }
      );
      for (let i = 0; i < 60; i++) ballistics.update(DT, [], terrain);
    }
  };
}

export function run() {
  suite('a escala de quem cava mais');

  // A ordem é a regra; os valores são só o jeito de expressá-la.
  ok('a pá cava mais que a primária', TERRAIN_BITE.SHOVEL > TERRAIN_BITE.PRIMARY,
    `${TERRAIN_BITE.SHOVEL} > ${TERRAIN_BITE.PRIMARY}`);
  ok('a primária cava mais que a secundária', TERRAIN_BITE.PRIMARY > TERRAIN_BITE.SECONDARY,
    `${TERRAIN_BITE.PRIMARY} > ${TERRAIN_BITE.SECONDARY}`);
  ok('a secundária cava mais que o corpo a corpo',
    TERRAIN_BITE.SECONDARY > TERRAIN_BITE.MELEE,
    `${TERRAIN_BITE.SECONDARY} > ${TERRAIN_BITE.MELEE}`);
  eq('e o corpo a corpo não cava nada', TERRAIN_BITE.MELEE, 0);

  eq('a pazada da pá usa a mesma escala', DEFORM.FUNDO, TERRAIN_BITE.SHOVEL);
  eq('a Thompson é a primária', THOMPSON.firearm.dig, TERRAIN_BITE.PRIMARY);
  eq('a Colt é a secundária', PISTOL.firearm.dig, TERRAIN_BITE.SECONDARY);
  eq('a faca não tem mordida de terreno', KNIFE.melee.dig ?? 0, 0);
  eq('e nem é arma de fogo', KNIFE.firearm ?? null, null);

  suite('tiro no chão marca o terreno');

  const b = bancada();
  const antes = b.terrain.heightAt(0, 0);
  near('o chão começa plano', antes, 0, 1e-9);

  b.tiro(0, 0, PISTOL.firearm.dig);
  eq('a bala no chão vira impacto de terreno', b.impactos, 1);
  ok('e o chão afunda', b.terrain.heightAt(0, 0) < antes,
    `${(b.terrain.heightAt(0, 0) - antes).toFixed(3)} m`);

  suite('primária afunda mais que secundária');

  const c = bancada();
  c.tiro(-40, -40, PISTOL.firearm.dig);
  const daColt = -c.terrain.heightAt(-40, -40);

  c.tiro(40, 40, THOMPSON.firearm.dig);
  const daThompson = -c.terrain.heightAt(40, 40);

  ok('um tiro de primária cava mais fundo que um de secundária',
    daThompson > daColt, `${daThompson.toFixed(3)} contra ${daColt.toFixed(3)}`);
  near('e na mesma proporção dos números',
    daThompson / daColt, TERRAIN_BITE.PRIMARY / TERRAIN_BITE.SECONDARY, 0.02);
  note('um tiro', `Colt ${(daColt * 100).toFixed(1)} cm · Thompson ${(daThompson * 100).toFixed(1)} cm`);

  suite('bala sem mordida não marca');

  const d = bancada();
  d.tiro(0, 0, 0);
  eq('bala com dig zero não chama impacto de terreno', d.impactos, 0);
  near('e o chão fica intacto', d.terrain.heightAt(0, 0), 0, 1e-9);

  suite('uma pazada vale muitos tiros');

  const e = bancada();
  let tiros = 0;
  while (-e.terrain.heightAt(0, 0) < DEFORM.FUNDO && tiros < 200) {
    e.tiro(0, 0, PISTOL.firearm.dig);
    tiros++;
  }
  between('afundar o que a pá faz numa pazada custa muitos tiros', tiros, 8, 200);
  note('tiros de pistola por pazada', `${tiros}`);

  suite('a marca tem largura mínima');

  // Regressão: abaixo do espaçamento da malha, a marca caía entre dois
  // vértices e não registrava — dois tiros iguais faziam coisas diferentes
  // conforme onde caíssem na grade.
  const f = bancada();
  let registrou = 0;
  for (let i = 0; i < 12; i++) {
    const x = -60 + i * 0.37;   // desliza dentro de uma célula da grade
    const alturaAntes = f.terrain.heightAt(x, 20);
    f.tiro(x, 20, PISTOL.firearm.dig);
    if (f.terrain.heightAt(x, 20) < alturaAntes - 1e-6) registrou++;
  }
  eq('todo tiro no chão deixa marca, caia onde cair', registrou, 12);
}
