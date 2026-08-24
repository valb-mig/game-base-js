/**
 * Asserções mínimas. O objetivo é uma coisa só: poder olhar o fim da saída e
 * saber se quebrou, em vez de comparar vinte linhas de números na mão.
 */

const results = [];
let current = null;

export function suite(name) {
  current = name;
}

function record(pass, label, detail) {
  results.push({ suite: current, pass, label, detail });
}

export function ok(label, value, detail = '') {
  record(Boolean(value), label, detail || String(value));
}

export function eq(label, actual, expected) {
  record(Object.is(actual, expected), label, `${actual} (esperado ${expected})`);
}

/** Comparação numérica com tolerância — quase tudo aqui é float de física. */
export function near(label, actual, expected, tolerance = 1e-6) {
  const pass = Math.abs(actual - expected) <= tolerance;
  record(pass, label, `${Number(actual).toFixed(4)} (esperado ${expected} ±${tolerance})`);
}

export function between(label, actual, min, max) {
  const pass = actual >= min && actual <= max;
  record(pass, label, `${Number(actual).toFixed(4)} (esperado entre ${min} e ${max})`);
}

/** Valor informativo, não é teste. Aparece na saída mas não conta como falha. */
export function note(label, detail) {
  results.push({ suite: current, pass: null, label, detail: String(detail) });
}

export function report() {
  const lines = [];
  let shownSuite = null;
  let passed = 0;
  let failed = 0;

  for (const entry of results) {
    if (entry.suite !== shownSuite) {
      shownSuite = entry.suite;
      lines.push('', `== ${shownSuite} ==`);
    }
    if (entry.pass === null) {
      lines.push(`   ·   ${entry.label.padEnd(44)} ${entry.detail}`);
      continue;
    }
    entry.pass ? passed++ : failed++;
    const mark = entry.pass ? ' ok  ' : 'FALHA';
    lines.push(` ${mark} ${entry.label.padEnd(44)} ${entry.detail}`);
  }

  lines.push('', `RESUMO: ${passed} passaram, ${failed} falharam`);
  lines.push(failed === 0 ? 'TUDO VERDE' : 'HOUVE FALHA');
  return lines.join('\n');
}
