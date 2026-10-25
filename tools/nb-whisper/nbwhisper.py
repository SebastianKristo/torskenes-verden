#!/usr/bin/env python3
"""NB-Whisper-tjenesten på Mac mini-en (prompt 54, WHISPER54): tale til tekst på norsk (bokmål/nynorsk) og engelsk.

NB-Whisper fra Nasjonalbiblioteket (NbAiLab/nb-whisper-*, Apache-2.0), kjørt lokalt med MLX (Apple silicon, Metal) eller
whisper.cpp med Metal. OpenAI-kompatibelt API, bak samme vakt-mønster som tools/fermion/guard.py:
  1) avsenderen må stå på tillatelseslista (standard 10.69.1.39 = Glimt-serveren), OG
  2) riktig nøkkel (Authorization: Bearer <nøkkel>, sammenlignet i konstant tid), OG
  3) en av de faste rutene:
       GET  /health                      → {status:'ok'|'starting'|'error', model, engine, languages, version}
       GET  /v1/models
       POST /v1/audio/transcriptions     multipart: file, language?, response_format?, timestamp_granularities[]?, prompt?, temperature?
       POST /v1/audio/detect             multipart: file  → {language, probability, languages:[{language, probability}], duration}
Lytter bare på Mac mini-ens LAN-adresse (aldri 0.0.0.0, aldri via Cloudflare). Logger én linje per forespørsel
(avsender, metode, sti, status, tid, størrelse) – aldri nøkler, headere, lyd eller tekst.

  nbwhisper.py --config ~/Library/Application\\ Support/nb-whisper/config.json
  nbwhisper.py --config config.json --check-config
"""
from __future__ import annotations

import argparse
import hmac
import http.client
import io
import ipaddress
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import uuid
import wave
from email.parser import BytesParser
from email.policy import HTTP
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

VERSION = "54.1"
ROUTES = {("GET", "/health"), ("GET", "/v1/models"), ("POST", "/v1/audio/transcriptions"), ("POST", "/v1/audio/detect")}
MAX_BODY = 100 * 1024 * 1024
MAX_WAITING = 3          # forespørsler i kø bak den som kjører (én modell, én om gangen)
QUEUE_WAIT_S = 300
SR = 16000
DETECT_SECONDS = 30
# Whisper-språkene (mlx_whisper/whisper tokenizer, 100 koder). NB-Whisper er trent på norsk (no = bokmål, nn = nynorsk) og engelsk.
WHISPER_LANGS = ("en zh de es ru ko fr ja pt tr pl ca nl ar sv it id hi fi vi he uk el ms cs ro da hu ta no th ur hr bg lt la mi ml cy sk te fa lv bn "
                 "sr az sl kn et mk br eu is hy ne mn bs kk sq sw gl mr pa si km sn yo so af oc ka be tg sd gu am yi lo uz fo ht ps tk nn mt sa lb "
                 "my bo tl mg as tt haw ln ha ba jw su yue").split()
PRIMARY_LANGS = ["no", "nn", "en"]
ALIASES = {"nb": "no", "nob": "no", "nor": "no", "norwegian": "no", "bokmal": "no", "bokmål": "no", "nno": "nn", "nynorsk": "nn", "english": "en", "eng": "en"}


def log(msg: str) -> None:
    sys.stderr.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n")
    sys.stderr.flush()


class BadRequest(Exception):
    def __init__(self, msg: str, status: int = 400, code: str = "bad_request"):
        super().__init__(msg)
        self.status = status
        self.code = code


def norm_lang(v) -> str | None:
    """'nb-NO' → 'no', 'nn' → 'nn', 'auto'/'' → None. Ukjent → BadRequest."""
    s = str(v or "").strip().lower()
    if s in ("", "auto"):
        return None
    s = ALIASES.get(s, s)
    if s not in WHISPER_LANGS:
        s = s.replace("_", "-").split("-")[0]
        s = ALIASES.get(s, s)
    if s not in WHISPER_LANGS:
        raise BadRequest(f"ukjent språk «{str(v)[:12]}»", 400, "unsupported_language")
    return s


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
    engine = str(cfg.get("engine") or "mlx")
    if engine not in ("mlx", "cpp", "fake"):
        raise SystemExit("config.json: engine må være mlx eller cpp")
    if engine == "fake" and os.environ.get("NBWHISPER_ALLOW_FAKE") != "1":
        raise SystemExit("config.json: engine=fake er bare for tester")
    return {
        "key": key, "bind_ip": bind_ip, "allow": allow, "port": int(cfg.get("port") or 8020), "engine": engine,
        "size": str(cfg.get("size") or "medium"), "model_dir": str(cfg.get("model_dir") or ""),
        "cpp_bin": str(cfg.get("cpp_bin") or ""), "upstream_port": int(cfg.get("upstream_port") or 18020),
        "threads": int(cfg.get("threads") or 0),
    }


# ---------------------------------------------------------------------------------------------- multipart og lyd
def parse_multipart(ctype: str, body: bytes) -> tuple[dict, dict]:
    """→ (felt {navn: str | [str]}, filer {navn: (filnavn, bytes)}). Bare standardbiblioteket."""
    if "multipart/form-data" not in (ctype or "").lower() or "boundary=" not in ctype.lower():
        raise BadRequest("forventet multipart/form-data")
    msg = BytesParser(policy=HTTP).parsebytes(b"Content-Type: " + ctype.encode("latin-1") + b"\r\nMIME-Version: 1.0\r\n\r\n" + body)
    if not msg.is_multipart():
        raise BadRequest("ugyldig multipart")
    fields: dict = {}
    files: dict = {}
    for part in msg.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if not name:
            continue
        payload = part.get_payload(decode=True) or b""
        fname = part.get_param("filename", header="content-disposition")
        if fname is not None:
            files[name] = (str(fname), payload)
        else:
            val = payload.decode("utf-8", "replace")
            if name in fields:
                fields[name] = (fields[name] if isinstance(fields[name], list) else [fields[name]]) + [val]
            else:
                fields[name] = val
    return fields, files


def wav_info(b: bytes):
    """(kanaler, rate, bredde, rammer, pcm) for PCM-WAV, ellers None."""
    if len(b) < 44 or b[:4] != b"RIFF" or b[8:12] != b"WAVE":
        return None
    try:
        with wave.open(io.BytesIO(b), "rb") as w:
            return w.getnchannels(), w.getframerate(), w.getsampwidth(), w.getnframes(), w.readframes(w.getnframes())
    except (wave.Error, EOFError):
        return None


def decode_audio(b: bytes):
    """Lyd → numpy float32, 16 kHz mono. PCM-WAV leses direkte; alt annet via ffmpeg (brew install ffmpeg)."""
    import numpy as np  # noqa: PLC0415

    info = wav_info(b)
    if info and info[2] in (1, 2, 4):
        ch, rate, width, _, pcm = info
        dt = {1: np.uint8, 2: np.int16, 4: np.int32}[width]
        a = np.frombuffer(pcm, dtype=dt).astype(np.float32)
        a = (a - 128.0) / 128.0 if width == 1 else a / float(2 ** (8 * width - 1))
        if ch > 1:
            a = a[: len(a) - len(a) % ch].reshape(-1, ch).mean(axis=1)
        if rate != SR and len(a):
            n = int(round(len(a) * SR / rate))
            a = np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a).astype(np.float32)
        return a.astype(np.float32)
    ff = shutil.which("ffmpeg") or ("/opt/homebrew/bin/ffmpeg" if os.path.exists("/opt/homebrew/bin/ffmpeg") else None)
    if not ff:
        raise BadRequest("bare WAV kan leses uten ffmpeg (brew install ffmpeg)", 415, "bad_audio")
    try:
        p = subprocess.run([ff, "-nostdin", "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-ac", "1", "-ar", str(SR), "-f", "s16le", "pipe:1"],
                           input=b, capture_output=True, timeout=180, check=False)
    except subprocess.TimeoutExpired as e:
        raise BadRequest("lyden tok for lang tid å lese", 400, "bad_audio") from e
    if p.returncode != 0 or not p.stdout:
        raise BadRequest("kunne ikke lese lyden", 400, "bad_audio")
    return np.frombuffer(p.stdout, dtype=np.int16).astype(np.float32) / 32768.0


def wav_bytes(samples) -> bytes:
    import numpy as np  # noqa: PLC0415

    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2").tobytes()
    bio = io.BytesIO()
    with wave.open(bio, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm)
    return bio.getvalue()


def merge_tokens(tokens: list[dict]) -> list[dict]:
    """whisper.cpp gir ordbiter (tokens). Slå dem sammen til ord: et nytt ord starter med mellomrom; tegnsetting henger på forrige."""
    out: list[dict] = []
    for t in tokens:
        w = str(t.get("word") or "")
        if not w or (w.startswith("[") and w.endswith("]")) or (w.startswith("<|") and w.endswith("|>")):
            continue
        s, e = t.get("start"), t.get("end")
        if out and not w.startswith(" ") and (not w.strip() or not w[0].isalnum() or out[-1]["word"][-1:].isalnum()):
            out[-1]["word"] += w
            if e is not None:
                out[-1]["end"] = e
            continue
        out.append({"word": w, "start": s, "end": e})
    res = []
    for w in out:
        txt = w["word"].strip()
        if txt and w["start"] is not None and w["end"] is not None:
            res.append({"word": txt, "start": round(float(w["start"]), 3), "end": round(float(w["end"]), 3)})
    return res


def top_langs(probs: dict, n: int = 10) -> list[dict]:
    items = sorted(((str(k), float(v)) for k, v in (probs or {}).items()), key=lambda kv: -kv[1])[:n]
    return [{"language": k, "probability": round(v, 4)} for k, v in items]


# ---------------------------------------------------------------------------------------------- motorer
class Engine:
    name = "?"

    def __init__(self, conf: dict):
        self.conf = conf
        self.status = "starting"
        self.error = None
        self.device = None
        self.model_label = f"nb-whisper-{conf['size']}"

    def start(self) -> None:
        def run():
            t0 = time.time()
            try:
                self.load()
                self.status = "ok"
                log(f"[nb-whisper] {self.model_label} ({self.name}) klar etter {int(time.time() - t0)} s")
            except Exception as e:  # noqa: BLE001
                self.status = "error"
                self.error = type(e).__name__
                log(f"[nb-whisper] kunne ikke laste modellen ({type(e).__name__}: {str(e)[:200]})")
        threading.Thread(target=run, daemon=True).start()

    def load(self) -> None: ...
    def transcribe(self, audio, language, prompt, words, temperature) -> dict: ...
    def detect(self, audio) -> dict: ...
    def stop(self) -> None: ...


class MlxEngine(Engine):
    name = "mlx"

    def load(self) -> None:
        import mlx.core as mx  # noqa: PLC0415
        import numpy as np  # noqa: PLC0415
        from mlx_whisper.transcribe import ModelHolder  # noqa: PLC0415

        self.mx = mx
        self.path = os.path.join(self.conf["model_dir"], "mlx")
        model = ModelHolder.get_model(self.path, mx.float16)
        meta = {}
        try:
            with open(os.path.join(self.conf["model_dir"], "model.json"), "r", encoding="utf-8") as f:
                meta = json.load(f)
        except (OSError, ValueError):
            pass
        heads = meta.get("alignment_heads")
        if heads:
            model.set_alignment_heads(np.array(heads, dtype=np.int64))
        self.device = str(mx.default_device())
        self.transcribe(np.zeros(SR, dtype=np.float32), "no", None, False, 0.0)  # oppvarming (Metal-kjerner)

    def transcribe(self, audio, language, prompt, words, temperature) -> dict:
        import mlx_whisper  # noqa: PLC0415

        temps = (temperature,) if temperature is not None else (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)
        r = mlx_whisper.transcribe(audio, path_or_hf_repo=self.path, language=language, word_timestamps=bool(words), initial_prompt=prompt or None,
                                   temperature=temps, condition_on_previous_text=False, verbose=None, fp16=True,
                                   hallucination_silence_threshold=2.0 if words else None)
        segs, ws = [], []
        for i, s in enumerate(r.get("segments") or []):
            segs.append({"id": i, "start": round(float(s["start"]), 3), "end": round(float(s["end"]), 3), "text": str(s.get("text") or "").strip()})
            for w in s.get("words") or []:
                t = str(w.get("word") or "").strip()
                if t:
                    ws.append({"word": t, "start": round(float(w["start"]), 3), "end": round(float(w["end"]), 3), "probability": round(float(w.get("probability") or 0), 3)})
        return {"text": str(r.get("text") or "").strip(), "language": r.get("language") or language, "segments": segs, "words": ws}

    def detect(self, audio) -> dict:
        from mlx_whisper.audio import N_FRAMES, N_SAMPLES, log_mel_spectrogram, pad_or_trim  # noqa: PLC0415
        from mlx_whisper.transcribe import ModelHolder  # noqa: PLC0415

        model = ModelHolder.get_model(self.path, self.mx.float16)
        mel = log_mel_spectrogram(audio[: DETECT_SECONDS * SR], n_mels=model.dims.n_mels, padding=N_SAMPLES)
        seg = pad_or_trim(mel, N_FRAMES, axis=-2).astype(self.mx.float16)
        _, probs = model.detect_language(seg)
        return probs


class CppEngine(Engine):
    """whisper.cpp (`whisper-server` fra Homebrew, Metal) på 127.0.0.1:upstream_port. Vi snakker med den lokalt."""
    name = "cpp"
    child: subprocess.Popen | None = None

    def load(self) -> None:
        exe = self.conf["cpp_bin"] or shutil.which("whisper-server") or "/opt/homebrew/bin/whisper-server"
        model = os.path.join(self.conf["model_dir"], "ggml-model.bin")
        if not os.path.exists(model):
            raise RuntimeError("ggml-model.bin mangler (kjør install.sh)")
        cmd = [exe, "-m", model, "--host", "127.0.0.1", "--port", str(self.conf["upstream_port"]), "-l", "no"]
        if self.conf["threads"]:
            cmd += ["-t", str(self.conf["threads"])]
        log(f"[nb-whisper] starter whisper.cpp: {os.path.basename(exe)} -m {os.path.basename(model)} på 127.0.0.1:{self.conf['upstream_port']}")
        self.child = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL)

        def watch():
            code = self.child.wait()
            log(f"[nb-whisper] whisper-server avsluttet med kode {code} · tjenesten avslutter (launchd starter på nytt)")
            os._exit(1)
        threading.Thread(target=watch, daemon=True).start()
        for _ in range(600):  # opptil 10 min for store modeller
            try:
                c = http.client.HTTPConnection("127.0.0.1", self.conf["upstream_port"], timeout=2)
                c.request("GET", "/health")
                r = c.getresponse()
                r.read()
                c.close()
                if r.status == 200:
                    self.device = "metal"
                    return
            except (OSError, http.client.HTTPException):
                pass
            time.sleep(1)
        raise RuntimeError("whisper-server ble ikke klar")

    def _inference(self, audio, fields: dict) -> dict:
        boundary = uuid.uuid4().hex
        parts = []
        for k, v in fields.items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="lyd.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode() + wav_bytes(audio) + b"\r\n")
        parts.append(f"--{boundary}--\r\n".encode())
        body = b"".join(parts)
        c = http.client.HTTPConnection("127.0.0.1", self.conf["upstream_port"], timeout=900)
        c.request("POST", "/inference", body=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "Content-Length": str(len(body))})
        r = c.getresponse()
        raw = r.read()
        c.close()
        if r.status != 200:
            raise RuntimeError(f"whisper-server svarte {r.status}")
        return json.loads(raw.decode("utf-8", "replace"))

    def transcribe(self, audio, language, prompt, words, temperature) -> dict:
        f = {"response_format": "verbose_json", "language": language or "auto", "temperature": str(temperature if temperature is not None else 0.0),
             "temperature_inc": "0.2", "token_timestamps": "true" if words else "false"}
        if prompt:
            f["prompt"] = prompt
        j = self._inference(audio, f)
        segs, toks = [], []
        for i, s in enumerate(j.get("segments") or []):
            segs.append({"id": i, "start": round(float(s.get("start") or 0), 3), "end": round(float(s.get("end") or 0), 3), "text": str(s.get("text") or "").strip()})
            toks += s.get("words") or []
        lang = language
        if not lang:
            probs = j.get("language_probabilities") or {}
            lang = max(probs, key=probs.get) if probs else None
        return {"text": str(j.get("text") or "").strip(), "language": lang, "segments": segs, "words": merge_tokens(toks) if words else []}

    def detect(self, audio) -> dict:
        j = self._inference(audio[: DETECT_SECONDS * SR], {"response_format": "verbose_json", "language": "auto", "detect_language": "true", "duration": str(DETECT_SECONDS * 1000)})
        probs = j.get("language_probabilities")
        if isinstance(probs, dict) and probs:
            return {str(k): float(v) for k, v in probs.items()}
        full = str(j.get("detected_language") or j.get("language") or "").lower()
        code = ALIASES.get(full, full if full in WHISPER_LANGS else None)
        if not code:
            raise RuntimeError("whisper.cpp ga ikke språk")
        return {code: float(j.get("detected_language_probability") or 1.0)}

    def stop(self) -> None:
        if self.child and self.child.poll() is None:
            self.child.terminate()


class FakeEngine(Engine):
    """Bare for tester (NBWHISPER_ALLOW_FAKE=1): ingen modell, deterministiske svar."""
    name = "fake"

    def load(self) -> None:
        self.device = "cpu"

    def transcribe(self, audio, language, prompt, words, temperature) -> dict:
        n = len(audio) / SR
        text = {"en": "hello from the test", "nn": "hei frå testen"}.get(language or "no", "hei fra testen")
        ws = [{"word": w, "start": round(i * 0.3, 3), "end": round(i * 0.3 + 0.25, 3)} for i, w in enumerate(text.split())] if words else []
        return {"text": text, "language": language or "no", "segments": [{"id": 0, "start": 0.0, "end": round(n, 3), "text": text}], "words": ws}

    def detect(self, audio) -> dict:
        return {"no": 0.81, "nn": 0.07, "da": 0.06, "en": 0.04, "sv": 0.02}


class FakeAudio(list):
    """Fake-motoren trenger ikke numpy: bare lengden (antall prøver)."""


def fake_decode(b: bytes):
    info = wav_info(b)
    if not info:
        raise BadRequest("kunne ikke lese lyden", 400, "bad_audio")
    ch, rate, width, frames, _ = info
    return FakeAudio([0.0] * int(frames * SR / max(rate, 1)))


# ---------------------------------------------------------------------------------------------- HTTP
class Service:
    def __init__(self, conf: dict):
        self.conf = conf
        self.engine: Engine = {"mlx": MlxEngine, "cpp": CppEngine, "fake": FakeEngine}[conf["engine"]](conf)
        self.lock = threading.Lock()
        self.waiting = 0
        self.wlock = threading.Lock()

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
        # hmac.compare_digest: konstant tid for innholdet (som tools/fermion/guard.py).
        return h.startswith("Bearer ") and hmac.compare_digest(h[7:].strip().encode(), self.conf["key"].encode())

    def health(self) -> tuple[int, dict]:
        e = self.engine
        base = {"service": "nb-whisper", "model": e.model_label, "engine": e.name, "version": VERSION}
        if e.status == "ok":
            return 200, base | {"status": "ok", "kind": "speech", "languages": PRIMARY_LANGS, "device": e.device}
        if e.status == "error":
            return 503, base | {"status": "error", "error": e.error or "load_failed"}
        return 503, base | {"status": "starting"}

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
                self.lock.release()
        finally:
            with self.wlock:
                self.waiting -= 1

    def audio_of(self, files: dict):
        f = files.get("file") or files.get("audio")
        if not f or not f[1]:
            raise BadRequest("mangler lydfil (feltet «file»)")
        return fake_decode(f[1]) if self.engine.name == "fake" else decode_audio(f[1])

    def transcriptions(self, ctype: str, body: bytes):
        fields, files = parse_multipart(ctype, body)
        lang = norm_lang(fields.get("language"))
        fmt = str(fields.get("response_format") or "json")
        if fmt not in ("json", "text", "verbose_json"):
            raise BadRequest("response_format må være json, text eller verbose_json")
        gran = fields.get("timestamp_granularities[]") or fields.get("timestamp_granularities") or []
        gran = gran if isinstance(gran, list) else [gran]
        want_words = fmt == "verbose_json" and "word" in gran
        prompt = str(fields.get("prompt") or "")[:500] or None
        temp = fields.get("temperature")
        try:
            temp = None if temp in (None, "") else max(0.0, min(1.0, float(temp)))
        except ValueError as e:
            raise BadRequest("ugyldig temperature") from e
        audio = self.audio_of(files)
        if len(audio) < SR // 10:
            raise BadRequest("lyden er for kort", 400, "bad_audio")
        dur = round(len(audio) / SR, 3)
        r = self.run(lambda: self.engine.transcribe(audio, lang, prompt, want_words, temp))
        if fmt == "text":
            return 200, r["text"], "text/plain; charset=utf-8"
        if fmt == "json":
            return 200, {"text": r["text"]}, None
        return 200, {"task": "transcribe", "language": r.get("language") or lang, "duration": dur, "text": r["text"],
                     "segments": r["segments"], "words": r["words"] if want_words else [], "model": self.engine.model_label, "engine": self.engine.name}, None

    def detect(self, ctype: str, body: bytes):
        _, files = parse_multipart(ctype, body)
        audio = self.audio_of(files)
        if len(audio) < SR // 10:
            raise BadRequest("lyden er for kort", 400, "bad_audio")
        probs = self.run(lambda: self.engine.detect(audio[: DETECT_SECONDS * SR]))
        langs = top_langs(probs)
        if not langs:
            raise BadRequest("fant ikke språket", 500, "error")
        return 200, {"language": langs[0]["language"], "probability": langs[0]["probability"], "languages": langs,
                     "duration": round(min(len(audio), DETECT_SECONDS * SR) / SR, 3), "model": self.engine.model_label}, None


def make_handler(svc: Service):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        server_version = "nb-whisper"
        sys_version = ""
        timeout = 120  # s uten data på forbindelsen

        def log_message(self, *args):  # standardloggen (full sti) brukes ikke
            pass

        def _done(self, status: int, n: int, t0: float) -> None:
            log(f"[nb-whisper] {self.client_address[0]} {self.command} {urlsplit(self.path).path[:80]} {status} {int((time.time() - t0) * 1000)} ms {n} B")

        def _send(self, status: int, obj, t0: float, ctype: str | None = None, extra: dict | None = None) -> None:
            b = obj.encode("utf-8") if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", ctype or "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(b)))
            self.send_header("Cache-Control", "no-store")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(b)
            self._done(status, len(b), t0)

        def _drain(self) -> None:
            if getattr(self, "_body_read", False) or self.command != "POST":
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

        def _gate(self, t0: float) -> str | None:
            route = urlsplit(self.path).path.rstrip("/") or "/"
            if not svc.allowed_ip(self.client_address[0]):
                self._err(403, "avsenderen står ikke på tillatelseslista", t0, "forbidden")
                return None
            if not svc.key_ok(self.headers.get("Authorization")):
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
                st, obj = svc.health()
                return self._send(st, obj, t0)
            st, h = svc.health()
            return self._send(200, {"object": "list", "data": [{"id": h["model"], "object": "model", "owned_by": "NbAiLab", "ready": st == 200}]}, t0)

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
                return self._err(413, f"for stor (maks {MAX_BODY // 2**20} MB)", t0, "too_large")
            st, _ = svc.health()
            if st != 200:
                return self._err(503, "modellen lastes fortsatt" if svc.engine.status == "starting" else "modellen kunne ikke lastes (se loggen)", t0, "starting")
            body = self.rfile.read(n)
            self._body_read = True
            ctype = self.headers.get("Content-Type", "")
            try:
                status, obj, ct = (svc.transcriptions if route == "/v1/audio/transcriptions" else svc.detect)(ctype, body)
            except BadRequest as e:
                return self._err(e.status, str(e), t0, e.code)
            except Exception as e:  # noqa: BLE001 – aldri innhold i loggen
                log(f"[nb-whisper] feil i {route}: {type(e).__name__}")
                return self._err(500, "transkripsjonen feilet", t0, "error")
            self._send(status, obj, t0, ct)

        def do_PUT(self):  # noqa: N802
            self._err(405, "ikke tillatt", time.time())

        do_DELETE = do_PATCH = do_OPTIONS = do_PUT

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
    ap = argparse.ArgumentParser(description="NB-Whisper (tale til tekst) med IP-filter og nøkkel")
    ap.add_argument("--config", required=True)
    ap.add_argument("--check-config", action="store_true", help="bare sjekk config.json")
    a = ap.parse_args()
    conf = load_config(a.config)
    if a.check_config:
        print("ok")
        return
    svc = Service(conf)

    def stop(*_):
        svc.engine.stop()
        os._exit(0)
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    srv = bind_with_retry((conf["bind_ip"], conf["port"]), make_handler(svc))
    log(f"[nb-whisper] lytter på {conf['bind_ip']}:{conf['port']} · {svc.engine.model_label} ({conf['engine']}) · tillatt fra {', '.join(map(str, conf['allow']))}")
    svc.engine.start()
    srv.serve_forever()


if __name__ == "__main__":
    socket.setdefaulttimeout(None)
    main()
