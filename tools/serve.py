"""Tiny local web server used by the accessibility check."""
import functools, http.server, os, socketserver, threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def start(port=8765, root=ROOT):
    handler = functools.partial(QuietHandler, directory=root)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(('127.0.0.1', port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd
