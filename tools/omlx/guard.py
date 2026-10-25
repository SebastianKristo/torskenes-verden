#!/usr/bin/env python3
"""Vakt for oMLX på Mac mini-en (prompt 58, OMLX58).

Starter `omlx serve` på 127.0.0.1 (aldri på nettet, egen port – ikke 8000, den bruker Fermion/Neutrino) med API-nøkkel, og slipper
bare inn forespørsler som
  1) kommer fra en adresse på tillatelseslista (standard 10.69.1.39 = Glimt-serveren), OG
  2) har riktig nøkkel (Authorization: Bearer <nøkkel>, sammenlignet i konstant tid), OG
  3) går til en av de faste rutene: GET /health, GET /v1/models, POST /v1/chat/completions, POST /v1/embeddings.
Admin-panelet (/admin) og resten av oMLX-API-et er bare tilgjengelig på Mac-en selv (http://127.0.0.1:<oppstrøm>/admin).
Lytter bare på Mac mini-ens LAN-adresse. Skal aldri eksponeres via Cloudflare eller internett.

Bare standardbiblioteket. Logger én linje per forespørsel: avsender, metode, sti, status, tid og størrelse – aldri nøkler, headere
eller innhold (prompter, bilder, svar).

  guard.py --config ~/Library/Application\\ Support/omlx58/config.json
  guard.py --config config.json --no-spawn          # tester: bruk en oMLX (eller en falsk) som allerede kjører på oppstrømsporten
  guard.py --config config.json --check-config
"""
from __future__ import annotations

import argparse
import hmac
import http.client
import ipaddress
import json
import os
import signal
import socket
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROUTES = {("GET", "/health"), ("GET", "/v1/models"), ("POST", "/v1/chat/completions"), ("POST", "/v1/embeddings")}
MAX_BODY = 64 * 1024 * 1024  # bilder som base64 (kvitteringer/vitnemål i full oppløsning)
DEFAULTS = {"port": 8040, "upstream_port": 18040, "memory_guard_gb": 9, "max_concurrent": 2, "ssd_cache_max": "20GB"}
UPSTREAM_TIMEOUT = 900  # s: lang prefill / store bilder


def log(msg: str) -> None:
    sys.stderr.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n")
    sys.stderr.flush()


def load_config(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    key = str(cfg.get("key") or "")
    if len(key) < 32:
        raise SystemExit("config.json: nøkkelen mangler eller er for kort (kjør install.sh)")
    bind_ip = str(cfg.get("bind_ip") or "")
    if not bind_ip or bind_ip == "0.0.0.0":
        raise SystemExit("config.json: bind_ip må være Mac mini-ens LAN-adresse (aldri 0.0.0.0)")
    allow = []
    for a in cfg.get("allow") or []:
        net = ipaddress.ip_network(str(a), strict=False)
        if net.prefixlen < 16:
            raise SystemExit(f"config.json: tillatelseslista kan ikke ha nett større enn /16 ({a})")
        allow.append(net)
    if not allow:
        raise SystemExit("config.json: tillatelseslista er tom")
    out = dict(DEFAULTS)
    out.update({k: v for k, v in cfg.items() if v is not None})
    out["key"], out["bind_ip"], out["allow"] = key, bind_ip, allow
    if int(out["port"]) == 8000 or int(out["upstream_port"]) == 8000:
        raise SystemExit("config.json: port 8000 brukes av Fermion/Neutrino på Mac mini-en – velg en annen")
    if int(out["port"]) == int(out["upstream_port"]):
        raise SystemExit("config.json: port og upstream_port må være ulike")
    return out


class Guard:
    def __init__(self, conf: dict):
        self.conf = conf
        self.up_port = int(conf["upstream_port"])
        self.child: subprocess.Popen | None = None

    # ------------------------------------------------------------------ oppstrøm (omlx serve)
    def command(self) -> list[str]:
        c = self.conf
        # Nøkkelen går i miljøet (OMLX_API_KEY, som i oMLX-README-en), ikke i argumentlista – da synes den ikke i `ps`.
        cmd = [c.get("omlx_bin") or "omlx", "serve", "--host", "127.0.0.1", "--port", str(self.up_port)]
        if c.get("model_dir"):
            cmd += ["--model-dir", str(c["model_dir"])]
        if c.get("memory_guard_gb"):
            cmd += ["--memory-guard-gb", str(int(c["memory_guard_gb"]))]
        if c.get("max_concurrent"):
            cmd += ["--max-concurrent-requests", str(int(c["max_concurrent"]))]
        if c.get("ssd_cache_dir"):
            cmd += ["--paged-ssd-cache-dir", str(c["ssd_cache_dir"])]
            if c.get("ssd_cache_max"):
                cmd += ["--paged-ssd-cache-max-size", str(c["ssd_cache_max"])]
        for extra in c.get("extra_args") or []:
            cmd.append(str(extra))
        return cmd

    def spawn(self) -> None:
        cmd = self.command()
        env = dict(os.environ)
        env.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
        env["OMLX_API_KEY"] = self.conf["key"]
        log(f"[omlx] starter: {' '.join(cmd)}  (nøkkel i OMLX_API_KEY)")
        self.child = subprocess.Popen(cmd, env=env, stdin=subprocess.DEVNULL)

        def watch() -> None:
            code = self.child.wait()
            log(f"[omlx] omlx serve avsluttet med kode {code} · vakten avslutter (launchd starter på nytt)")
            os._exit(1)

        threading.Thread(target=watch, daemon=True).start()

    def stop(self, *_):
        if self.child and self.child.poll() is None:
            self.child.terminate()
            try:
                self.child.wait(timeout=15)
            except subprocess.TimeoutExpired:
                self.child.kill()
        os._exit(0)

    # ------------------------------------------------------------------ tilgang
    def allowed_ip(self, ip: str) -> bool:
        try:
            a = ipaddress.ip_address(ip)
        except ValueError:
            return False
        if a.version == 6 and a.ipv4_mapped:
            a = a.ipv4_mapped
        return any(a in n for n in self.conf["allow"])

    def key_ok(self, header: str | None) -> bool:
        h = header or ""
        return h.startswith("Bearer ") and hmac.compare_digest(h[7:].strip().encode(), self.conf["key"].encode())

    def upstream(self, method: str, path: str, body: bytes | None = None, headers: dict | None = None, timeout: float = UPSTREAM_TIMEOUT):
        c = http.client.HTTPConnection("127.0.0.1", self.up_port, timeout=timeout)
        h = dict(headers or {})
        h["Authorization"] = "Bearer " + self.conf["key"]
        c.request(method, path, body=body, headers=h)
        return c, c.getresponse()


def make_handler(g: Guard):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        server_version = "omlx-guard"
        sys_version = ""

        def log_message(self, *args):  # standardloggen (med full sti) brukes ikke
            pass

        def _done(self, status: int, n: int, t0: float) -> None:
            log(f"[omlx] {self.client_address[0]} {self.command} {urlsplit(self.path).path[:80]} {status} {int((time.time() - t0) * 1000)} ms {n} B")

        def _json(self, status: int, obj: dict, t0: float) -> None:
            b = json.dumps(obj).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(b)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(b)
            self._done(status, len(b), t0)

        def _drain(self) -> None:
            """Les og kast en ulest kropp før et tidlig svar (ellers får klienten EPIPE i stedet for 401/403)."""
            if getattr(self, "_body_read", False) or self.command != "POST":
                return
            self._body_read = True
            try:
                n = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                return
            if n <= 0 or n > MAX_BODY or self.headers.get("Transfer-Encoding", "").lower() == "chunked":
                return
            try:
                while n > 0:
                    chunk = self.rfile.read(min(n, 1 << 16))
                    if not chunk:
                        return
                    n -= len(chunk)
            except OSError:
                pass

        def _err(self, status: int, msg: str, t0: float, code: str = "error") -> None:
            self._drain()
            self.close_connection = True
            self._json(status, {"error": {"message": msg, "code": code}}, t0)

        def _gate(self, t0: float) -> str | None:
            route = urlsplit(self.path).path.rstrip("/") or "/"
            if not g.allowed_ip(self.client_address[0]):
                self._err(403, "avsenderen står ikke på tillatelseslista", t0, "forbidden")
                return None
            if not g.key_ok(self.headers.get("Authorization")):
                self._err(401, "mangler eller feil nøkkel", t0, "invalid_api_key")
                return None
            if (self.command, route) not in ROUTES:
                self._err(404, "ukjent rute", t0, "not_found")
                return None
            return route

        def do_GET(self):  # noqa: N802
            t0 = time.time()
            route = self._gate(t0)
            if route is None:
                return
            if route == "/health":
                return self._health(t0)
            self._proxy(route, None, t0)

        def do_POST(self):  # noqa: N802
            t0 = time.time()
            route = self._gate(t0)
            if route is None:
                return
            if self.headers.get("Transfer-Encoding", "").lower() == "chunked":
                return self._err(400, "chunked er ikke støttet", t0)
            try:
                n = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                return self._err(400, "ugyldig Content-Length", t0)
            if n <= 0:
                return self._err(400, "tom forespørsel", t0)
            if n > MAX_BODY:
                return self._err(413, f"for stor (maks {MAX_BODY // 2**20} MB)", t0)
            body = self.rfile.read(n)
            self._body_read = True
            self._proxy(route, body, t0)

        def do_PUT(self):  # noqa: N802
            self._err(405, "ikke tillatt", time.time())

        do_DELETE = do_PATCH = do_OPTIONS = do_PUT

        def _health(self, t0: float) -> None:
            """oMLX har ingen /health: /v1/models med nøkkelen. Bare modell-ID-ene (og lastet-status hvis oMLX oppgir den)."""
            try:
                c, r = g.upstream("GET", "/v1/models", timeout=5)
                raw = r.read()
                c.close()
                j = json.loads(raw.decode("utf-8") or "{}") if r.status == 200 else None
            except (OSError, ValueError, http.client.HTTPException):
                return self._json(503, {"status": "starting", "service": "omlx"}, t0)
            if not isinstance(j, dict):
                return self._json(503, {"status": "starting", "service": "omlx", "upstream": r.status}, t0)
            models = []
            for m in j.get("data") or []:
                if not isinstance(m, dict) or not m.get("id"):
                    continue
                item = {"id": str(m["id"])[:160]}
                for k in ("loaded", "status", "max_context"):
                    if k in m and isinstance(m[k], (bool, int, str)):
                        item[k] = m[k]
                models.append(item)
            self._json(200, {"status": "ok", "service": "omlx", "models": models}, t0)

        def _proxy(self, route: str, body: bytes | None, t0: float) -> None:
            headers = {"Accept": self.headers.get("Accept", "*/*")}
            if body is not None:
                headers["Content-Type"] = self.headers.get("Content-Type", "application/json")
                headers["Content-Length"] = str(len(body))
            try:
                c, r = g.upstream(self.command, route, body=body, headers=headers)
            except (OSError, http.client.HTTPException):
                return self._err(503, "oMLX starter eller er nede", t0, "starting")
            n = 0
            try:
                self.send_response(r.status)
                ctype = r.getheader("Content-Type")
                if ctype:
                    self.send_header("Content-Type", ctype)
                clen = r.getheader("Content-Length")
                if clen is not None:
                    self.send_header("Content-Length", clen)
                else:
                    # Strøm (SSE): ingen lengde – lukk forbindelsen når oppstrømmen er ferdig.
                    self.send_header("Connection", "close")
                    self.close_connection = True
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                while True:
                    chunk = r.read1(65536) if hasattr(r, "read1") else r.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
                    n += len(chunk)
            except (BrokenPipeError, ConnectionResetError):
                self.close_connection = True
            finally:
                c.close()
                self._done(r.status, n, t0)

    return Handler


def bind_with_retry(addr: tuple[str, int], handler) -> ThreadingHTTPServer:
    warned = False
    while True:
        try:
            srv = ThreadingHTTPServer(addr, handler)
            srv.daemon_threads = True
            return srv
        except OSError as e:
            if not warned:
                log(f"kan ikke lytte på {addr[0]}:{addr[1]} ({e}) · prøver igjen hvert 5. sekund (har Mac-en adressen?)")
                warned = True
            time.sleep(5)


def main() -> None:
    ap = argparse.ArgumentParser(description="Vakt for omlx serve (IP-filter + nøkkel)")
    ap.add_argument("--config", required=True)
    ap.add_argument("--no-spawn", action="store_true", help="ikke start omlx serve (bruk en oppstrøm som allerede kjører)")
    ap.add_argument("--check-config", action="store_true", help="bare sjekk config.json")
    ap.add_argument("--print-command", action="store_true", help="skriv kommandoen for omlx serve (uten nøkkelen) og avslutt")
    a = ap.parse_args()
    conf = load_config(a.config)
    g = Guard(conf)
    if a.check_config:
        print("ok")
        return
    if a.print_command:
        print(" ".join(g.command()))
        return
    signal.signal(signal.SIGTERM, g.stop)
    signal.signal(signal.SIGINT, g.stop)
    if not a.no_spawn:
        g.spawn()
    port = int(conf["port"])
    srv = bind_with_retry((conf["bind_ip"], port), make_handler(g))
    log(f"[omlx] lytter på {conf['bind_ip']}:{port} → 127.0.0.1:{g.up_port} · tillatt fra {', '.join(map(str, conf['allow']))}")
    srv.serve_forever()


if __name__ == "__main__":
    socket.setdefaulttimeout(None)
    main()
