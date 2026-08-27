#!/usr/bin/env python3
"""
Servidor estático de desenvolvimento.

Existe por um motivo só: o http.server padrão deixa o navegador cachear, e
módulo ES é cacheado com agressividade. Já custou uma sessão inteira de bug
que estava corrigido no disco e velho no navegador — o jogador testava uma
versão, eu testava outra, e nenhum dos dois sabia.

Aqui nada é cacheado. Em desenvolvimento, recarregar tem que significar
recarregar.

E ele atende uma conexão por thread. Com um servidor de fila única, o
carregador de módulos do navegador — que busca dezenas de arquivos ao mesmo
tempo — derrubava uma importação a cada rodada da suíte, sempre num arquivo
diferente: "Failed to fetch dynamically imported module", com o mesmo arquivo
respondendo 200 no curl um segundo depois. Parecia bug de suíte e era fila.
"""

import functools
import http.server
import os
import socketserver
import sys


class SemCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *args):
        pass  # silêncio: quem observa isto é o dev.sh, não o humano


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    root = sys.argv[2] if len(sys.argv) > 2 else os.getcwd()

    handler = functools.partial(SemCache, directory=root)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    socketserver.ThreadingTCPServer.daemon_threads = True

    with socketserver.ThreadingTCPServer(('', port), handler) as server:
        server.serve_forever()


if __name__ == '__main__':
    main()
