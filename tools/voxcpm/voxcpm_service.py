#!/usr/bin/env python3
"""VoxCPM2-tjenesten på Mac mini-en (prompt 57, VOX57): tekst til tale på norsk med egne og klonede stemmer.

VoxCPM2 fra OpenBMB (Apache-2.0, kode og vekter), 30 språk inkl. norsk, 48 kHz. To motorer:
  gguf  (standard) llama.cpp-omni `voxcpm2-cli` med GGUF-vekter (BaseLM Q8_0 + Acoustic F16) og Metal. Minst minne (~3 GB),
        og bare mens en setning lages – CLI-et laster modellen per forespørsel og slipper alt etterpå.
  torch pip-pakken `voxcpm` (PyTorch, MPS). Raskere når den er varm, men ~6–8 GB i minnet. Lastes ved første forespørsel
        og lastes UT etter idle_unload_min minutter uten bruk (standard 10), så qwen3:8b i Ollama får plass.
OpenAI-lignende API bak samme vakt-mønster som tools/nb-whisper og tools/fermion/guard.py:
  1) avsenderen må stå på tillatelseslista (standard 10.69.1.39 = Glimt-serveren), OG
  2) riktig nøkkel (Authorization: Bearer <nøkkel>, sammenlignet i konstant tid), OG
  3) en av de faste rutene:
       GET    /health              → {status, service:'voxcpm', model:'VoxCPM2', engine, quant, device, loaded, idle_unload_min, memory, refs, version}
       POST   /v1/audio/speech     {input, voice?:{kind:'design', prompt}|{kind:'clone', ref_sha, ref_text?}|null, language?, response_format?, speed?}
       PUT    /v1/refs/<sha256>    WAV-referanse (sha256 av innholdet må stemme)
       HEAD   /v1/refs/<sha256>
       DELETE /v1/refs/<sha256>
Referanseopptakene caches bare på innholds-hash – tjenesten vet aldri navn eller bruker. Lytter bare på Mac mini-ens LAN-adresse
(aldri 0.0.0.0, aldri via Cloudflare). Logger én linje per forespørsel (avsender, metode, sti, status, tid, størrelse) – aldri
nøkler, headere, tekst eller lyd.

  voxcpm_service.py --config ~/Library/Application\\ Support/voxcpm/config.json
  voxcpm_service.py --config config.json --check-config
"""
from __future__ import annotations

import argparse
import gc
import hashlib
import hmac
import io
import ipaddress
import json
import math
import os
import re
import resource
import shutil
import signal
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

VERSION = "57.1"
MAX_BODY = 25 * 1024 * 1024       # referanse-WAV (16 kHz mono, 60 s ≈ 2 MB) eller JSON
MAX_INPUT = 4000                  # tegn per forespørsel (serveren sender maks 1500)
MAX_WAITING = 3
QUEUE_WAIT_S = 300
CHUNK_CHARS = 220                 # setninger slås sammen til biter på inntil så mange tegn
GGUF_CHUNK_CHARS = 600            # CLI-et laster modellen per kall: færre, større biter
PAUSE_S = 0.22                    # stillhet mellom bitene
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
FORMATS = {"mp3": "audio/mpeg", "wav": "audio/wav", "opus": "audio/ogg"}


def log(msg: str) -> None:
    sys.stderr.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n")
    sys.stderr.flush()


class BadRequest(Exception):
    def __init__(self, msg: str, status: int = 400, code: str = "bad_request"):
        super().__init__(msg)
        self.status = status
        self.code = code


# ---------------------------------------------------------------------------------------------- konfig
def load_config(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    key = str(cfg.get("key") or "")
    if len(key) < 32:
        raise SystemExit("config.json: nøkkelen mangler eller er for kort (kjør install.sh)")
    bind_ip = str(cfg.get("bind_ip") or "")
    if not bind_ip or bind_ip in ("0.0.0.0", "::"):
        raise SystemExit("config.json: bind_ip må være Mac mini-ens LAN-adresse (aldri 0.0.0.0)")
    ipaddress.ip_address(bind_ip)
    allow = []
    for a in cfg.get("allow") or []:
        net = ipaddress.ip_network(str(a), strict=False)
        if net.prefixlen < 16:
            raise SystemExit(f"config.json: tillatelseslista kan ikke ha nett større enn /16 ({a})")
        allow.append(net)
    if not allow:
        raise SystemExit("config.json: tillatelseslista er tom")
    engine = str(cfg.get("engine") or "gguf")
    if engine not in ("gguf", "torch", "fake"):
        raise SystemExit("config.json: engine må være gguf eller torch")
    if engine == "fake" and os.environ.get("VOXCPM_ALLOW_FAKE") != "1":
        raise SystemExit("config.json: engine=fake er bare for tester")
    idle = cfg.get("idle_unload_min")
    idle = 10.0 if idle is None else float(idle)
    if idle < 0 or idle > 1440:
        raise SystemExit("config.json: idle_unload_min må være 0–1440 (0 = aldri last ut)")
    refs_dir = str(cfg.get("refs_dir") or os.path.join(os.path.dirname(os.path.abspath(path)), "refs"))
    return {
        "key": key, "bind_ip": bind_ip, "allow": allow, "port": int(cfg.get("port") or 8030), "engine": engine,
        "model_dir": str(cfg.get("model_dir") or ""), "cli_bin": str(cfg.get("cli_bin") or ""),
        "baselm": str(cfg.get("baselm") or ""), "acoustic": str(cfg.get("acoustic") or ""), "quant": str(cfg.get("quant") or ""),
        "device": str(cfg.get("device") or "auto"), "idle_unload_min": idle, "refs_dir": refs_dir,
        "cfg_value": float(cfg.get("cfg_value") or 2.0), "timesteps": int(cfg.get("timesteps") or 10), "seed": int(cfg.get("seed") or 42),
        "ffmpeg": str(cfg.get("ffmpeg") or ""),
    }


# ---------------------------------------------------------------------------------------------- tekst
_SENT = re.compile(r"(?<=[.!?…:;])\s+|\n+")


def split_text(text: str, limit: int = CHUNK_CHARS) -> list[str]:
    """Del i setninger og slå korte sammen til biter på inntil `limit` tegn. Lange setninger deles ved komma/mellomrom."""
    t = re.sub(r"[ \t\r\f\v]+", " ", str(text or "")).strip()
    if not t:
        return []
    sents: list[str] = []
    for s in _SENT.split(t):
        s = s.strip()
        while len(s) > limit:
            cut = max(s.rfind(", ", 0, limit), s.rfind(" ", 0, limit))
            cut = cut if cut > limit // 3 else limit
            sents.append(s[:cut + 1].strip())
            s = s[cut + 1:].strip()
        if s:
            sents.append(s)
    out: list[str] = []
    for s in sents:
        if out and len(out[-1]) + 1 + len(s) <= limit:
            out[-1] += " " + s
        else:
            out.append(s)
    return out


def clean_prompt(p) -> str:
    """Stemmebeskrivelsen (voice design) uten parenteser og linjeskift, maks 300 tegn."""
    s = re.sub(r"[()\[\]\r\n]+", " ", str(p or "")).strip()
    return re.sub(r"\s+", " ", s)[:300]


def with_prompt(prompt: str, text: str) -> str:
    """VoxCPM2: beskrivelsen i parentes først i teksten – «(En rolig mannsstemme)Tekst»."""
    return f"({prompt}){text}" if prompt else text


def parse_speech(body: bytes) -> dict:
    try:
        j = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as e:
        raise BadRequest("forventet JSON") from e
    if not isinstance(j, dict):
        raise BadRequest("forventet et JSON-objekt")
    text = str(j.get("input") or "").strip()
    if not text:
        raise BadRequest("mangler input")
    if len(text) > MAX_INPUT:
        raise BadRequest(f"input er for lang (maks {MAX_INPUT} tegn)", 413, "too_large")
    fmt = str(j.get("response_format") or "mp3").lower()
    if fmt not in FORMATS:
        raise BadRequest("response_format må være mp3, wav eller opus")
    try:
        speed = float(j.get("speed") if j.get("speed") is not None else 1.0)
    except (TypeError, ValueError) as e:
        raise BadRequest("ugyldig speed") from e
    speed = max(0.5, min(2.0, speed))
    lang = str(j.get("language") or "").strip().lower()[:12]
    if lang and not re.fullmatch(r"[a-z]{2,3}([-_][a-z0-9]{2,8})?", lang):
        raise BadRequest("ugyldig language")
    v = j.get("voice")
    voice = None
    if isinstance(v, dict):
        kind = v.get("kind")
        if kind == "design":
            p = clean_prompt(v.get("prompt"))
            voice = {"kind": "design", "prompt": p} if p else None
        elif kind == "clone":
            sha = str(v.get("ref_sha") or "").lower()
            if not SHA_RE.match(sha):
                raise BadRequest("ugyldig ref_sha")
            rt = re.sub(r"\s+", " ", str(v.get("ref_text") or "")).strip()[:1000]
            voice = {"kind": "clone", "ref_sha": sha, "ref_text": rt or None, "style": clean_prompt(v.get("style"))}
        else:
            raise BadRequest("voice.kind må være design eller clone")
    elif v not in (None, "", "default"):
        raise BadRequest("voice må være et objekt eller null")
    return {"text": text, "fmt": fmt, "speed": speed, "lang": lang or None, "voice": voice}


# ---------------------------------------------------------------------------------------------- lyd (bare standardbiblioteket)
def wav_read(b: bytes):
    """→ (rate, kanaler, bredde, pcm) for PCM-WAV, ellers None."""
    if len(b) < 44 or b[:4] != b"RIFF" or b[8:12] != b"WAVE":
        return None
    try:
        with wave.open(io.BytesIO(b), "rb") as w:
            return w.getframerate(), w.getnchannels(), w.getsampwidth(), w.readframes(w.getnframes())
    except (wave.Error, EOFError):
        return None


def wav_write(rate: int, pcm: bytes, channels: int = 1, width: int = 2) -> bytes:
    bio = io.BytesIO()
    with wave.open(bio, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(width)
        w.setframerate(rate)
        w.writeframes(pcm)
    return bio.getvalue()


def concat_wavs(parts: list[bytes], pause_s: float = PAUSE_S) -> bytes:
    """Slår sammen WAV-biter (samme format) med en kort pause mellom."""
    infos = [wav_read(p) for p in parts]
    if not infos or any(i is None for i in infos):
        raise RuntimeError("motoren ga ugyldig WAV")
    rate, ch, width, _ = infos[0]
    gap = b"\0" * (int(rate * pause_s) * ch * width)
    pcm = []
    for i, (r, c, w, data) in enumerate(infos):
        if (r, c, w) != (rate, ch, width):
            raise RuntimeError("bitene har ulikt lydformat")
        if i:
            pcm.append(gap)
        pcm.append(data)
    return wav_write(rate, b"".join(pcm), ch, width)


def wav_seconds(b: bytes) -> float:
    i = wav_read(b)
    if not i:
        return 0.0
    rate, ch, width, pcm = i
    return len(pcm) / float(rate * ch * width)


def find_ffmpeg(conf: dict) -> str | None:
    p = conf.get("ffmpeg") or shutil.which("ffmpeg") or ("/opt/homebrew/bin/ffmpeg" if os.path.exists("/opt/homebrew/bin/ffmpeg") else None)
    return p if p and os.path.exists(p) else None


def atempo_chain(speed: float) -> str:
    """ffmpeg atempo tar 0.5–2.0 per ledd."""
    return f"atempo={max(0.5, min(2.0, speed)):.3f}"


def encode(conf: dict, wav: bytes, fmt: str, speed: float) -> tuple[bytes, str]:
    """WAV → ønsket format med ffmpeg (og tempo). Uten ffmpeg: WAV uendret (Glimt-serveren takler audio/wav)."""
    need = fmt != "wav" or abs(speed - 1.0) > 0.01
    ff = find_ffmpeg(conf) if need else None
    if not ff:
        return wav, FORMATS["wav"]
    args = [ff, "-nostdin", "-hide_banner", "-loglevel", "error", "-f", "wav", "-i", "pipe:0"]
    if abs(speed - 1.0) > 0.01:
        args += ["-filter:a", atempo_chain(speed)]
    # Merking av KI-generert lyd (anbefalt i VoxCPM-vilkårene).
    args += ["-metadata", "comment=KI-generert tale (VoxCPM2)", "-metadata", "encoded_by=voxcpm-tjenesten (Mac mini)"]
    if fmt == "mp3":
        args += ["-c:a", "libmp3lame", "-b:a", "96k", "-ar", "24000", "-ac", "1", "-f", "mp3", "pipe:1"]
    elif fmt == "opus":
        args += ["-c:a", "libopus", "-b:a", "48k", "-ar", "48000", "-ac", "1", "-f", "ogg", "pipe:1"]
    else:
        args += ["-c:a", "pcm_s16le", "-f", "wav", "pipe:1"]
    p = subprocess.run(args, input=wav, capture_output=True, timeout=120, check=False)
    if p.returncode != 0 or not p.stdout:
        log(f"[voxcpm] ffmpeg feilet (kode {p.returncode}) · sender WAV")
        return wav, FORMATS["wav"]
    return p.stdout, FORMATS[fmt]


def rss_mb() -> int:
    r = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(r / (1024 * 1024)) if sys.platform == "darwin" else int(r / 1024)  # macOS: byte, Linux: KiB


# ---------------------------------------------------------------------------------------------- motorer
class Engine:
    name = "?"
    chunk_chars = CHUNK_CHARS

    def __init__(self, conf: dict):
        self.conf = conf
        self.status = "ok"
        self.error = None
        self.device = None
        self.loaded = False
        self.last_used = 0.0

    def check(self) -> None:
        """Rask sjekk ved oppstart (filer og pakker finnes). Laster ikke modellen."""

    def synth(self, text: str, ref: str | None, ref_text: str | None) -> bytes:
        """Én bit tekst → WAV-bytes."""
        raise NotImplementedError

    def unload(self) -> None:
        self.loaded = False

    def estimate_mb(self) -> int:
        return 0


class GgufEngine(Engine):
    """llama.cpp-omni `voxcpm2-cli` (Metal). Modellen lastes per kall og slippes når prosessen avslutter."""
    name = "gguf"
    chunk_chars = GGUF_CHUNK_CHARS

    def estimate_mb(self) -> int:
        return 3200 if self.conf["quant"].upper() == "Q8_0" else 5200  # BaseLM + Acoustic + arbeidsminne (anslag)

    def check(self) -> None:
        for k, label in (("cli_bin", "voxcpm2-cli"), ("baselm", "BaseLM-GGUF"), ("acoustic", "Acoustic-GGUF")):
            if not self.conf[k] or not os.path.exists(self.conf[k]):
                raise RuntimeError(f"{label} mangler (kjør install.sh)")
        self.device = "metal" if sys.platform == "darwin" else "cpu"

    def command(self, text: str, out: str, ref: str | None, ref_text: str | None) -> list[str]:
        c = self.conf
        cmd = [c["cli_bin"], "-t", text, "-o", out, "--cfg", str(c["cfg_value"]), "--timesteps", str(c["timesteps"]), "--seed", str(c["seed"])]
        if ref and ref_text:
            cmd += ["--prompt-wav", ref, "--prompt-text", ref_text, "-r", ref]  # «ultimate cloning»
        elif ref:
            cmd += ["-r", ref]
        return cmd + [c["baselm"], c["acoustic"]]

    def synth(self, text: str, ref: str | None, ref_text: str | None) -> bytes:
        with tempfile.TemporaryDirectory(prefix="voxcpm-") as d:
            out = os.path.join(d, "ut.wav")
            self.loaded = True
            try:
                p = subprocess.run(self.command(text, out, ref, ref_text), stdin=subprocess.DEVNULL, capture_output=True, timeout=900, check=False)
            finally:
                self.loaded = False
            if p.returncode != 0 or not os.path.exists(out):
                raise RuntimeError(f"voxcpm2-cli avsluttet med kode {p.returncode}")
            with open(out, "rb") as f:
                return f.read()


class TorchEngine(Engine):
    """pip-pakken voxcpm (PyTorch). Lastes ved første bruk, lastes ut etter idle_unload_min minutter."""
    name = "torch"

    def __init__(self, conf: dict):
        super().__init__(conf)
        self.model = None
        self.lock = threading.Lock()

    def estimate_mb(self) -> int:
        return 7000  # ~6–8 GB (VoxCPM2-README: ~8 GB VRAM i PyTorch)

    def check(self) -> None:
        import importlib.util  # noqa: PLC0415

        if importlib.util.find_spec("voxcpm") is None or importlib.util.find_spec("torch") is None:
            raise RuntimeError("pakken voxcpm/torch mangler (kjør install.sh --engine torch)")
        if not self.conf["model_dir"] or not os.path.isdir(self.conf["model_dir"]):
            raise RuntimeError("modellmappa mangler (kjør install.sh --engine torch)")

    def _device(self) -> str:
        import torch  # noqa: PLC0415

        d = self.conf["device"]
        if d == "auto":
            d = "mps" if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available() else "cpu"
        return d

    def load(self) -> None:
        with self.lock:
            if self.model is not None:
                return
            from voxcpm import VoxCPM  # noqa: PLC0415

            t0 = time.time()
            dev = self._device()
            try:
                self.model = VoxCPM.from_pretrained(self.conf["model_dir"], load_denoiser=False, device=dev)
            except TypeError:  # eldre versjoner uten device-argument: velger selv (auto → MPS på Apple silicon)
                self.model = VoxCPM.from_pretrained(self.conf["model_dir"], load_denoiser=False)
            self.device = dev
            self.loaded = True
            log(f"[voxcpm] VoxCPM2 (torch, {dev}) lastet på {int(time.time() - t0)} s")

    def synth(self, text: str, ref: str | None, ref_text: str | None) -> bytes:
        import numpy as np  # noqa: PLC0415

        self.load()
        kw = {"text": text, "cfg_value": self.conf["cfg_value"], "inference_timesteps": self.conf["timesteps"]}
        if ref:
            kw["reference_wav_path"] = ref
            if ref_text:
                kw["prompt_wav_path"] = ref
                kw["prompt_text"] = ref_text
        wav = self.model.generate(**kw)
        rate = int(self.model.tts_model.sample_rate)
        pcm = (np.clip(np.asarray(wav, dtype=np.float32), -1.0, 1.0) * 32767).astype("<i2").tobytes()
        return wav_write(rate, pcm)

    def unload(self) -> None:
        with self.lock:
            if self.model is None:
                return
            self.model = None
            self.loaded = False
            gc.collect()
            try:
                import torch  # noqa: PLC0415

                if getattr(torch, "mps", None) and torch.backends.mps.is_available():
                    torch.mps.empty_cache()
            except Exception:  # noqa: BLE001
                pass
            log("[voxcpm] modellen er lastet ut (ingen bruk på en stund)")


class FakeEngine(Engine):
    """Bare for tester (VOXCPM_ALLOW_FAKE=1): en sinustone, 60 ms per tegn, 48 kHz – ingen modell."""
    name = "fake"

    def check(self) -> None:
        self.device = "cpu"

    def synth(self, text: str, ref: str | None, ref_text: str | None) -> bytes:
        self.loaded = True
        rate = 48000
        n = int(rate * min(30.0, 0.06 * len(text)))
        period = 150 if ref else 200  # 320 Hz for kloning, 240 Hz ellers
        cycle = b"".join(struct.pack("<h", int(8000 * math.sin(2 * math.pi * i / period))) for i in range(period))
        return wav_write(rate, (cycle * (n // period + 1))[: n * 2])


# ---------------------------------------------------------------------------------------------- tjenesten
class Service:
    def __init__(self, conf: dict):
        self.conf = conf
        self.engine: Engine = {"gguf": GgufEngine, "torch": TorchEngine, "fake": FakeEngine}[conf["engine"]](conf)
        self.lock = threading.Lock()
        self.waiting = 0
        self.wlock = threading.Lock()
        os.makedirs(conf["refs_dir"], mode=0o700, exist_ok=True)
        try:
            self.engine.check()
        except Exception as e:  # noqa: BLE001
            self.engine.status = "error"
            self.engine.error = str(e)[:200]
            log(f"[voxcpm] motoren er ikke klar: {self.engine.error}")

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

    def ref_path(self, sha: str) -> str:
        if not SHA_RE.match(sha):
            raise BadRequest("ugyldig hash")
        return os.path.join(self.conf["refs_dir"], f"{sha}.wav")

    def refs_count(self) -> int:
        try:
            return sum(1 for f in os.listdir(self.conf["refs_dir"]) if f.endswith(".wav"))
        except OSError:
            return 0

    def health(self) -> tuple[int, dict]:
        e = self.engine
        base = {"service": "voxcpm", "model": "VoxCPM2", "engine": e.name, "quant": self.conf["quant"] or None, "version": VERSION,
                "idle_unload_min": self.conf["idle_unload_min"], "loaded": bool(e.loaded), "device": e.device,
                "memory": {"peak_rss_mb": rss_mb(), "model_estimate_mb": e.estimate_mb() if e.loaded else 0}, "refs": self.refs_count(), "ffmpeg": bool(find_ffmpeg(self.conf))}
        if e.status == "error":
            return 503, base | {"status": "error", "error": e.error or "not_ready"}
        return 200, base | {"status": "ok"}

    def run(self, fn):
        with self.wlock:
            if self.waiting > MAX_WAITING:
                raise BadRequest("opptatt – prøv igjen om litt", 503, "busy")
            self.waiting += 1
        try:
            if not self.lock.acquire(timeout=QUEUE_WAIT_S):
                raise BadRequest("opptatt – køen er for lang", 503, "busy")
            try:
                return fn()
            finally:
                self.engine.last_used = time.time()
                self.lock.release()
        finally:
            with self.wlock:
                self.waiting -= 1

    def speech(self, body: bytes) -> tuple[bytes, str]:
        req = parse_speech(body)
        v = req["voice"]
        ref = ref_text = None
        prompt = ""
        if v and v["kind"] == "clone":
            ref = self.ref_path(v["ref_sha"])
            if not os.path.exists(ref):
                raise BadRequest("referanseopptaket finnes ikke her – last det opp med PUT /v1/refs/<sha>", 404, "ref_missing")
            ref_text = v["ref_text"]
            prompt = v.get("style") or ""
            os.utime(ref, None)
        elif v and v["kind"] == "design":
            prompt = v["prompt"]
        chunks = split_text(req["text"], self.engine.chunk_chars)
        if not chunks:
            raise BadRequest("mangler input")

        def go():
            return [self.engine.synth(with_prompt(prompt, c), ref, ref_text) for c in chunks]
        parts = self.run(go)
        wav = parts[0] if len(parts) == 1 else concat_wavs(parts)
        return encode(self.conf, wav, req["fmt"], req["speed"])

    def put_ref(self, sha: str, body: bytes) -> int:
        path = self.ref_path(sha)
        if hashlib.sha256(body).hexdigest() != sha:
            raise BadRequest("hashen stemmer ikke med innholdet", 400, "hash_mismatch")
        if not wav_read(body):
            raise BadRequest("referansen må være PCM-WAV", 415, "bad_audio")
        if wav_seconds(body) < 1.0:
            raise BadRequest("referansen er for kort", 400, "bad_audio")
        existed = os.path.exists(path)
        tmp = path + ".tmp"
        with open(tmp, "wb") as f:
            f.write(body)
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
        return 200 if existed else 201

    def idle_loop(self) -> None:
        while True:
            time.sleep(15)
            m = self.conf["idle_unload_min"]
            e = self.engine
            if m > 0 and e.loaded and e.last_used and time.time() - e.last_used > m * 60 and self.lock.acquire(blocking=False):
                try:
                    e.unload()
                finally:
                    self.lock.release()


def make_handler(svc: Service):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        server_version = "voxcpm"
        sys_version = ""
        timeout = 120

        def log_message(self, *args):
            pass

        def _route(self) -> str:
            return urlsplit(self.path).path.rstrip("/") or "/"

        def _logpath(self) -> str:
            r = self._route()
            return "/v1/refs/<sha>" if r.startswith("/v1/refs/") else r[:80]  # hashen logges ikke

        def _done(self, status: int, n: int, t0: float) -> None:
            log(f"[voxcpm] {self.client_address[0]} {self.command} {self._logpath()} {status} {int((time.time() - t0) * 1000)} ms {n} B")

        def _send(self, status: int, obj, t0: float, ctype: str | None = None, extra: dict | None = None) -> None:
            b = obj if isinstance(obj, (bytes, bytearray)) else (b"" if obj is None else json.dumps(obj, ensure_ascii=False).encode("utf-8"))
            self.send_response(status)
            if status != 204:
                self.send_header("Content-Type", ctype or "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(b)))
            self.send_header("Cache-Control", "no-store")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if self.command != "HEAD" and status != 204:
                self.wfile.write(b)
            self._done(status, len(b), t0)

        def _drain(self) -> None:
            if getattr(self, "_body_read", False) or self.command not in ("POST", "PUT"):
                return
            self._body_read = True
            try:
                n = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                return
            if n <= 0 or n > MAX_BODY:
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
            self._send(status, {"error": {"message": msg, "code": code}}, t0, extra={"Retry-After": "5"} if status == 503 else None)

        def _gate(self, t0: float, allowed: set) -> str | None:
            route = self._route()
            if not svc.allowed_ip(self.client_address[0]):
                self._err(403, "avsenderen står ikke på tillatelseslista", t0, "forbidden")
                return None
            if not svc.key_ok(self.headers.get("Authorization")):
                self._err(401, "mangler eller feil nøkkel", t0, "invalid_api_key")
                return None
            kind = "refs" if route.startswith("/v1/refs/") else route
            if (self.command, kind) not in allowed:
                self._err(404 if kind not in {k for _, k in allowed} else 405, "ukjent rute", t0, "not_found")
                return None
            return route

        def _body(self, t0: float) -> bytes | None:
            if self.headers.get("Transfer-Encoding", "").lower() == "chunked":
                self._err(400, "chunked er ikke støttet", t0)
                return None
            try:
                n = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                self._err(400, "ugyldig Content-Length", t0)
                return None
            if n <= 0:
                self._err(400, "tom forespørsel", t0)
                return None
            if n > MAX_BODY:
                self._err(413, f"for stor (maks {MAX_BODY // 2**20} MB)", t0, "too_large")
                return None
            b = self.rfile.read(n)
            self._body_read = True
            return b

        ROUTES = {("GET", "/health"), ("POST", "/v1/audio/speech"), ("PUT", "refs"), ("HEAD", "refs"), ("DELETE", "refs")}

        def _sha(self, route: str) -> str:
            return route[len("/v1/refs/"):].lower()

        def do_GET(self):  # noqa: N802
            t0 = time.time()
            if self._gate(t0, self.ROUTES) is None:
                return
            st, obj = svc.health()
            self._send(st, obj, t0)

        def do_HEAD(self):  # noqa: N802
            t0 = time.time()
            route = self._gate(t0, self.ROUTES)
            if route is None:
                return
            try:
                ok = os.path.exists(svc.ref_path(self._sha(route)))
            except BadRequest as e:
                return self._err(e.status, str(e), t0, e.code)
            self._send(200 if ok else 404, {"exists": ok}, t0)

        def do_DELETE(self):  # noqa: N802
            t0 = time.time()
            route = self._gate(t0, self.ROUTES)
            if route is None:
                return
            try:
                p = svc.ref_path(self._sha(route))
            except BadRequest as e:
                return self._err(e.status, str(e), t0, e.code)
            if not os.path.exists(p):
                return self._err(404, "finnes ikke", t0, "not_found")
            os.remove(p)
            self._send(204, None, t0)

        def do_PUT(self):  # noqa: N802
            t0 = time.time()
            route = self._gate(t0, self.ROUTES)
            if route is None:
                return
            body = self._body(t0)
            if body is None:
                return
            try:
                st = svc.put_ref(self._sha(route), body)
            except BadRequest as e:
                return self._err(e.status, str(e), t0, e.code)
            self._send(st, {"ok": True}, t0)

        def do_POST(self):  # noqa: N802
            t0 = time.time()
            route = self._gate(t0, self.ROUTES)
            if route is None:
                return
            if svc.engine.status != "ok":
                return self._err(503, "motoren er ikke klar (se loggen)", t0, "not_ready")
            body = self._body(t0)
            if body is None:
                return
            try:
                audio, ctype = svc.speech(body)
            except BadRequest as e:
                return self._err(e.status, str(e), t0, e.code)
            except Exception as e:  # noqa: BLE001 – aldri innhold i loggen
                log(f"[voxcpm] feil i {route}: {type(e).__name__}")
                return self._err(500, "talesyntesen feilet", t0, "error")
            self._send(200, audio, t0, ctype, {"X-AI-Generated": "VoxCPM2"})

        def do_PATCH(self):  # noqa: N802
            self._err(405, "ikke tillatt", time.time())

        do_OPTIONS = do_PATCH

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
    ap = argparse.ArgumentParser(description="VoxCPM2 (tekst til tale) med IP-filter og nøkkel")
    ap.add_argument("--config", required=True)
    ap.add_argument("--check-config", action="store_true", help="bare sjekk config.json")
    a = ap.parse_args()
    conf = load_config(a.config)
    if a.check_config:
        print("ok")
        return
    svc = Service(conf)

    def stop(*_):
        os._exit(0)
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    srv = bind_with_retry((conf["bind_ip"], conf["port"]), make_handler(svc))
    log(f"[voxcpm] lytter på {conf['bind_ip']}:{conf['port']} · VoxCPM2 ({conf['engine']}{' ' + conf['quant'] if conf['quant'] else ''}) · "
        f"last ut etter {conf['idle_unload_min']:g} min · tillatt fra {', '.join(map(str, conf['allow']))}")
    threading.Thread(target=svc.idle_loop, daemon=True).start()
    srv.serve_forever()


if __name__ == "__main__":
    socket.setdefaulttimeout(None)
    main()
