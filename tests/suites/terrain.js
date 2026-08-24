import { createHeightfield, assertFlatZones } from '../../src/world/heightfield.js';
import { WORLD } from '../../src/config.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

/** As mesmas zonas que world.js monta — se divergirem, o teste perde o sentido. */
function mapZones(probe) {
  return [
    { x: 0, z: -WORLD.BASE_DISTANCE, radius: 24, blend: 18, height: probe.naturalHeight(0, -WORLD.BASE_DISTANCE) },
    { x: 0, z: WORLD.BASE_DISTANCE, radius: 24, blend: 18, height: probe.naturalHeight(0, WORLD.BASE_DISTANCE) },
    { x: WORLD.COURSE_ORIGIN.x, z: WORLD.COURSE_ORIGIN.z, radius: 30, blend: 18,
      height: probe.naturalHeight(WORLD.COURSE_ORIGIN.x, WORLD.COURSE_ORIGIN.z) }
  ];
}

export function run() {
  const probe = createHeightfield([]);

  suite('perfil da ilha');

  const center = probe.heightAt(0, 0);
  between('centro fica acima do nível do mar', center, 8, WORLD.ISLAND_HEIGHT);
  near('cruza a água no raio da ilha', probe.heightAt(0, WORLD.ISLAND_RADIUS), 0, 0.01);
  ok('afunda pro fundo de mar depois disso',
    probe.heightAt(0, WORLD.ISLAND_RADIUS + 60) < -WORLD.SEA_DEPTH * 0.8);

  // praia: faixa entre a linha d'água e o fim da areia
  let waterline = null;
  let sandEnd = null;
  for (let d = WORLD.ISLAND_RADIUS + 20; d >= 0; d -= 0.25) {
    const h = probe.heightAt(0, d);
    if (waterline === null && h >= 0) waterline = d;
    if (h >= WORLD.SAND_UNTIL) { sandEnd = d; break; }
  }
  between('praia tem largura de praia', waterline - sandEnd, 12, 45);
  note('faixa de areia', `${(waterline - sandEnd).toFixed(1)} m`);

  // sem ladeira intransponível: a locomoção não bloqueia declive
  let steepest = 0;
  for (let x = -140; x <= 140; x += 5) {
    for (let z = -140; z <= 140; z += 5) {
      const h = probe.heightAt(x, z);
      const slope = Math.hypot(probe.heightAt(x + 1, z) - h, probe.heightAt(x, z + 1) - h);
      steepest = Math.max(steepest, slope);
    }
  }
  const degrees = Math.atan(steepest) * 180 / Math.PI;
  ok('nenhum paredão que o jogador não suba', degrees < 45, `${degrees.toFixed(1)}°`);

  suite('platôs de construção');

  const zones = mapZones(probe);
  let overlapped = false;
  try {
    assertFlatZones(zones);
  } catch {
    overlapped = true;
  }
  eq('as zonas planas do mapa não se cruzam', overlapped, false);

  const terrain = createHeightfield(zones);
  for (const zone of zones) {
    const middle = terrain.heightAt(zone.x, zone.z);
    const edge = terrain.heightAt(zone.x, zone.z + zone.radius - 1);
    near(`platô (${zone.x}, ${zone.z}) é plano da borda ao centro`, edge, middle, 0.01);
  }

  // Regressão: as zonas eram aplicadas em sequência, então a última puxava o
  // resultado das anteriores e a base assentava numa altura que não era a dela.
  const northZone = zones[0];
  near('base assenta na própria altura, não na do vizinho',
    terrain.heightAt(northZone.x, northZone.z), northZone.height, 0.01);

  suite('água');

  eq('praia seca não tem profundidade', terrain.waterDepthAt(0, 0), 0);
  ok('mar aberto é fundo o bastante pra nadar',
    terrain.waterDepthAt(0, WORLD.ISLAND_RADIUS + 40) > 3);
  note('profundidade 40 m mar adentro',
    `${terrain.waterDepthAt(0, WORLD.ISLAND_RADIUS + 40).toFixed(1)} m`);
}
