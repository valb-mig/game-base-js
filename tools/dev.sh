#!/usr/bin/env bash
# Servidor, testes e capturas. Sem dependência de npm: o projeto é estático.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8000}"
URL="http://localhost:$PORT"

chrome() {
  for candidate in google-chrome-stable google-chrome chromium chromium-browser; do
    command -v "$candidate" >/dev/null && { echo "$candidate"; return; }
  done
  echo "Nenhum Chrome encontrado (google-chrome-stable, chromium…)" >&2
  exit 1
}

headless() {
  "$(chrome)" --headless=new --no-sandbox --disable-gpu \
    --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader "$@"
}

# Confere que quem atende a porta é o NOSSO servidor, não o de outro projeto.
# Sem isso, um python http.server de outra pasta é reaproveitado em silêncio e
# a suíte roda em cima de código alheio.
serving() { [ "$(curl -sf "$URL/.serverroot" 2>/dev/null)" = "$ROOT" ]; }

port_taken() { curl -sf -o /dev/null --max-time 1 "$URL/" 2>/dev/null; }

ensure_server() {
  serving && return

  # porta ocupada por outra coisa? anda pra próxima livre em vez de brigar
  local tries=0
  while port_taken && [ $tries -lt 12 ]; do
    echo "porta $PORT ocupada por outro servidor; tentando $((PORT + 1))" >&2
    PORT=$((PORT + 1))
    URL="http://localhost:$PORT"
    serving && return
    tries=$((tries + 1))
  done

  printf '%s\n' "$ROOT" > "$ROOT/.serverroot"
  echo "subindo servidor em $URL" >&2
  (cd "$ROOT" && nohup python3 -m http.server "$PORT" >/dev/null 2>&1 &)
  for _ in $(seq 20); do serving && return; sleep 0.25; done
  echo "servidor não subiu na porta $PORT" >&2
  exit 1
}

strip_html() { sed -n '/<pre id="out">/,/<\/pre>/p' | sed 's/<[^>]*>//g;s/&lt;/</g;s/&gt;/>/g;s/&amp;/\&/g'; }

case "${1:-check}" in
  serve)
    ensure_server
    echo "$URL"
    ;;

  syntax)
    # node --check num .js parseia como script e deixa passar erro que só
    # aparece como módulo. Copiar pra .mjs força o parse certo.
    fail=0
    tmp="$(mktemp -d)"
    while IFS= read -r file; do
      cp "$file" "$tmp/probe.mjs"
      if ! node --check "$tmp/probe.mjs" 2>"$tmp/err"; then
        echo "FALHA $file"
        sed -n '2,4p' "$tmp/err"
        fail=1
      fi
    done < <(find "$ROOT/src" "$ROOT/tests" -name '*.js' | sort)
    rm -rf "$tmp"
    [ $fail -eq 0 ] && echo "sintaxe ok em $(find "$ROOT/src" "$ROOT/tests" -name '*.js' | wc -l) módulos"
    exit $fail
    ;;

  check)
    "$0" syntax || exit 1
    ensure_server
    out="$(headless --virtual-time-budget=15000 --dump-dom "$URL/tests/run.html" 2>/dev/null | strip_html)"
    echo "$out"
    # falha de verdade também derruba o comando, pra CI ou pra encadear
    grep -q '^TUDO VERDE$' <<<"$out"
    ;;

  errors)
    # console do jogo: pega erro de import e exceção que os testes não veem
    ensure_server
    log="$(mktemp)"
    headless --virtual-time-budget=10000 --enable-logging=stderr --v=0 \
      --dump-dom "$URL/${2:-index.html}" >/dev/null 2>"$log"
    # o swiftshader tagarela sobre performance do driver; isso não é erro
    real="$(grep -vE 'GL Driver Message|WebGL-0x|Fontconfig|dbus|GPU stall' "$log" \
      | grep -iE 'uncaught|SyntaxError|TypeError|ReferenceError|net::ERR|Failed to (load|fetch|resolve)' || true)"
    if [ -n "$real" ]; then
      echo "$real"
      exit 1
    fi
    echo "sem erro de console em ${2:-index.html}"
    ;;

  shot)
    ensure_server
    page="${2:-index.html}"
    out="${3:-/tmp/shot.png}"
    size="${4:-1280x720}"
    headless --window-size="${size/x/,}" --virtual-time-budget=12000 \
      --screenshot="$out" "$URL/$page" >/dev/null 2>&1
    echo "$out"
    ;;

  *)
    cat <<'USAGE'
uso: tools/dev.sh <comando>

  serve              sobe o servidor estático (idempotente)
  syntax             parseia todo módulo de src/ e tests/ como ES module
  check              sintaxe + suíte de testes; sai != 0 se algo falhar
  errors [pagina]    abre a página e reporta erro de console
  shot [pagina] [saida] [LxA]   captura de tela headless

exemplos:
  tools/dev.sh check
  tools/dev.sh errors index.html
  tools/dev.sh shot tools/model-viewer.html /tmp/faca.png 1200x760
USAGE
    exit 1
    ;;
esac
