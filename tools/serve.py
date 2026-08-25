#!/usr/bin/env python3
"""
Servidor estático de desenvolvimento.

Existe por um motivo só: o http.server padrão deixa o navegador cachear, e
módulo ES é cacheado com agressividade. Já custou uma sessão inteira de bug
que estava corrigido no disco e velho no navegador — o jogador testava uma
versão, eu testava outra, e nenhum dos dois sabia.

Aqui nada é cacheado. Em desenvolvimento, recarregar tem que significar
recarregar.
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
    socketserver.TCPServer.allow_reuse_address = True

    with socketserver.TCPServer(('', port), handler) as server:
        server.serve_forever()


if __name__ == '__main__':
    main()
