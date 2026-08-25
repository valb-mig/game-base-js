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
  # tools/serve.py em vez do http.server padrão: ele manda no-store, e sem
  # isso o navegador serve módulo ES velho depois de um conserto no disco
  (cd "$ROOT" && nohup python3 tools/serve.py "$PORT" "$ROOT" >/dev/null 2>&1 &)
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

  restart)
    # derruba só o servidor DESTE projeto e sobe de novo, pra pegar mudanças
    # no próprio tools/serve.py
    pkill -f "tools/serve.py .* $ROOT" 2>/dev/null || true
    pkill -f "http.server .*$PORT" 2>/dev/null || true
    rm -f "$ROOT/.serverroot"
    sleep 0.4
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
    grep -q '^TUDO VERDE$' <<<"$out" || exit 1
    # O quadro com o jogador VIVO só existe depois do desembarque, e é lá que
    # sistema sem dono no laço aparece: um digging.update sem digging passou
    # pela suíte inteira e só estourava depois de clicar em Desembarcar.
    "$0" errors "index.html?deploy=0"
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

  soak)
    ensure_server
    zona="${2:-treino}"
    sementes="${3:-14}"
    quadros="${4:-4200}"
    out="$(headless --virtual-time-budget=90000 --dump-dom \
      "$URL/tools/soak.html?sementes=$sementes&quadros=$quadros&onde=$zona" 2>/dev/null \
      | python3 -c "
import re, html, sys
s = sys.stdin.read()
m = re.search(r'<pre id=\"out\"[^>]*>(.*?)</pre>', s, re.S)
print(html.unescape(re.sub(r'<[^>]*>', '', m.group(1))) if m else 'soak não rodou')
")"
    echo "$out"
    grep -q 'SOAK LIMPO' <<<"$out"
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

  serve              sobe o servidor estático (idempotente, sem cache)
  restart            derruba e sobe o servidor de novo
  soak [zona]        joga sozinho vigiando invariantes
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
