"""Serve the Maison Hygia frontend and proxy API calls to the backend.

Replaces `python3 -m http.server` so that requests under /api, /cart and
/payment are forwarded to the FastAPI backend instead of 404ing.
"""

import os
import sys
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

WEB_DIR = Path(__file__).resolve().parent / "Website"
BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8001")

PROXY_PREFIXES = ("/api/", "/cart", "/payment")
PROXY_TIMEOUT = 30


class FrontendHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def _proxy(self):
        target = BACKEND_URL + self.path
        try:
            body = None
            length = int(self.headers.get("Content-Length") or 0)
            if length:
                body = self.rfile.read(length)

            headers = {
                k: v
                for k, v in self.headers.items()
                if k.lower() not in ("host", "content-length")
            }
            if body:
                headers["Content-Type"] = self.headers.get(
                    "Content-Type", "application/json"
                )

            req = urllib.request.Request(
                target, data=body, method=self.command, headers=headers
            )
            with urllib.request.urlopen(req, timeout=PROXY_TIMEOUT) as resp:
                data = resp.read()
                self.send_response(resp.status)
                for k, v in resp.headers.items():
                    if k.lower() in ("content-type", "cache-control", "location"):
                        self.send_header(k, v)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except Exception as e:  # noqa: BLE001
            self.send_error(502, f"Bad gateway ({BACKEND_URL}): {e}")

    def do_GET(self):
        if self.path.startswith(PROXY_PREFIXES):
            self._proxy()
            return
        clean_path = self.path.split("?", 1)[0].split("#", 1)[0]
        if (
            not os.path.isfile(self.translate_path(self.path))
            and not os.path.splitext(clean_path)[1]
        ):
            # SPA fallback: extensionless deep links serve index.html
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        if self.path.startswith(PROXY_PREFIXES):
            self._proxy()
        else:
            super().do_POST()

    def log_message(self, format, *args):  # noqa: A002
        sys.stderr.write(
            f"{self.address_string()} - {self.command} {self.path} - {format % args}\n"
        )


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    httpd = ThreadingHTTPServer(("0.0.0.0", port), FrontendHandler)
    print(
        f"Serving frontend on http://0.0.0.0:{port} "
        f"(proxying /api, /cart, /payment to {BACKEND_URL})"
    )
    httpd.serve_forever()
