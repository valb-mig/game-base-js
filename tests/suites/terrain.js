import { createHeightfield, assertFlatZones } from '../../src/world/heightfield.js';
import { WORLD } from '../../src/config.js';
import { suite, ok, eq, near, between, note } from '../assert.js';

/** As mesmas zonas que world.js monta — se divergirem, o teste perde o sentido. */
function mapZones(probe) {
  const plana = (p, radius) => ({
    x: p.x, z: p.z, radius, blend: 18, height: probe.naturalHeight(p.x, p.z)
  });
  return [
    plana(WORLD.BASE_KARNIA, 24),
    plana(WORLD.BASE_VESTRIA, 24),
    plana(WORLD.COURSE_ORIGIN, 30)
  ];
}

export function run() {
  const probe = createHeightfield([]);

  suite('perfil de Sainte-Mère');

  // O terreno É a regra do mapa: mar ao norte, praia de desembarque, a
  // escarpa que domina essa praia, e o planalto onde ficam vila e fazenda.
  const mar = probe.heightAt(0, WORLD.MAR_ATE - 200);
  const praia = probe.heightAt(0, (WORLD.MAR_ATE + WORLD.PRAIA_ATE) / 2);
  const escarpa = probe.heightAt(0, (WORLD.PRAIA_ATE + WORLD.ESCARPA_ATE) / 2);
  const planalto = probe.heightAt(0, -400);

  ok('o mar é mar', mar < -8, `${mar.toFixed(1)} m`);
  ok('a praia é seca e rasa', praia > 0 && praia < WORLD.SAND_UNTIL + 1.5,
    `${praia.toFixed(1)} m`);
  ok('a escarpa sobe de verdade atrás dela', escarpa > praia + 6,
    `${escarpa.toFixed(1)} m contra ${praia.toFixed(1)} da praia`);
  ok('e o planalto fica acima da escarpa', planalto > escarpa,
    `${planalto.toFixed(1)} m`);
  note('perfil norte-sul',
    `mar ${mar.toFixed(0)} · praia ${praia.toFixed(1)} · escarpa ${escarpa.toFixed(0)}` +
    ` · planalto ${planalto.toFixed(0)}`);

  // A praia tem que ser larga o bastante pra caber um desembarque, e não uma
  // borda: o ponto 01 é ela.
  let linhaDagua = null;
  let fimDaAreia = null;
  for (let z = WORLD.MAR_ATE - 60; z <= WORLD.ESCARPA_ATE; z += 0.5) {
    const h = probe.heightAt(0, z);
    if (linhaDagua === null && h >= 0) linhaDagua = z;
    if (linhaDagua !== null && h >= WORLD.SAND_UNTIL) { fimDaAreia = z; break; }
  }
  between('a faixa de areia comporta um desembarque',
    fimDaAreia - linhaDagua, 40, 220, `${(fimDaAreia - linhaDagua).toFixed(0)} m`);

  suite('o rio e as pontes');

  // O rio é o gargalo do sul do mapa, e as pontes são a única travessia.
  const noRio = probe.heightAt(0, probe.riverBedAt(0));
  const naMargem = probe.heightAt(0, probe.riverBedAt(0) - WORLD.RIO_MARGEM - 40);
  ok('o leito é bem mais fundo que a margem', naMargem - noRio > 10,
    `${noRio.toFixed(1)} m contra ${naMargem.toFixed(1)} da margem`);

  const pontes = probe.bridges();
  eq('há duas pontes', pontes.length, 2);
  for (const ponte of pontes) {
    const naPonte = probe.heightAt(ponte.x, ponte.z);
    ok(`a ponte em x ${ponte.x} não é cavada`, naPonte > noRio + 8,
      `${naPonte.toFixed(1)} m`);
  }

  // E fora da ponte ele corta: rio atravessável em qualquer ponto não é
  // gargalo de coisa nenhuma.
  const longeDaPonte = pontes[0].x + 220;
  ok('mas o rio corta longe delas',
    probe.heightAt(longeDaPonte, probe.riverBedAt(longeDaPonte)) < noRio + 4);

  suite('as colinas dominam o que precisam dominar');

  for (const colina of WORLD.COLINAS) {
    const topo = probe.heightAt(colina.x, colina.z);
    const pe = probe.heightAt(colina.x + colina.raio + 60, colina.z);
    ok(`a colina em (${colina.x}, ${colina.z}) se ergue sobre o entorno`,
      topo - pe > 8, `${(topo - pe).toFixed(1)} m acima`);
  }

  suite('nada de paredão');

  // sem ladeira intransponível: a locomoção não bloqueia declive
  let steepest = 0;
  let onde = null;
  for (let x = -900; x <= 900; x += 20) {
    for (let z = -900; z <= 900; z += 20) {
      const h = probe.heightAt(x, z);
      const slope = Math.hypot(probe.heightAt(x + 1, z) - h, probe.heightAt(x, z + 1) - h);
      if (slope > steepest) { steepest = slope; onde = [x, z]; }
    }
  }
  const degrees = Math.atan(steepest) * 180 / Math.PI;
  ok('nenhum paredão que o jogador não suba', degrees < 50,
    `${degrees.toFixed(1)}° em (${onde})`);

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

  eq('terra seca não tem profundidade', terrain.waterDepthAt(0, -400), 0);
  ok('o mar é fundo o bastante pra nadar',
    terrain.waterDepthAt(0, WORLD.MAR_ATE - 200) > 3);
  note('profundidade 200 m mar adentro',
    `${terrain.waterDepthAt(0, WORLD.MAR_ATE - 200).toFixed(1)} m`);
}
