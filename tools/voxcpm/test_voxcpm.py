#!/usr/bin/env python3
"""Tester for tools/voxcpm (prompt 57). Kjøres på Linux og Mac, bare standardbiblioteket:

  python3 -m unittest -v tools/voxcpm/test_voxcpm.py

- Ren logikk: setningsdeling, stemmebeskrivelse, forespørselsparsing, WAV-sammenslåing, CLI-kommandoen for llama.cpp-omni.
- HTTP: starter tjenesten med testmotoren (VOXCPM_ALLOW_FAKE=1) og sjekker IP-filter, nøkkel, ruter, referanser (PUT/HEAD/DELETE
  på hash), tale (wav, og mp3 når ffmpeg finnes) og at loggen aldri har nøkkel, tekst eller hash.
- Ekte VoxCPM2 (GGUF/llama.cpp-omni eller PyTorch) kjøres ikke her: huggingface.co er blokkert i utviklingsmiljøet.
"""
from __future__ import annotations

import hashlib
import http.client
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import voxcpm_service as vs  # noqa: E402

KEY = "b" * 16 + "0123456789abcdef0123456789abcdef"


def tone_wav(seconds: float = 2.0, rate: int = 16000) -> bytes:
    import math
    import struct
    pcm = b"".join(struct.pack("<h", int(6000 * math.sin(2 * math.pi * 200 * i / rate))) for i in range(int(seconds * rate)))
    return vs.wav_write(rate, pcm)


class Logic(unittest.TestCase):
    def test_split(self):
        self.assertEqual(vs.split_text(""), [])
        self.assertEqual(vs.split_text("Hei. Hvordan går det? Bra!"), ["Hei. Hvordan går det? Bra!"])
        parts = vs.split_text("Første setning er her. " * 30, 100)
        self.assertTrue(all(len(p) <= 100 for p in parts), parts)
        self.assertGreater(len(parts), 5)
        long = "ord " * 200
        self.assertTrue(all(len(p) <= 220 for p in vs.split_text(long)))
        self.assertEqual(" ".join(vs.split_text("A. B.\n\nC.", 2)), "A. B. C.")

    def test_prompt(self):
        self.assertEqual(vs.clean_prompt("(En rolig\nmannsstemme)"), "En rolig mannsstemme")
        self.assertEqual(vs.with_prompt("Rolig", "Hei"), "(Rolig)Hei")
        self.assertEqual(vs.with_prompt("", "Hei"), "Hei")
        self.assertEqual(len(vs.clean_prompt("x" * 999)), 300)

    def test_parse(self):
        r = vs.parse_speech(json.dumps({"input": "Hei", "voice": {"kind": "design", "prompt": "(varm)"}, "response_format": "wav", "speed": 9}).encode())
        self.assertEqual(r["voice"], {"kind": "design", "prompt": "varm"})
        self.assertEqual(r["speed"], 2.0)
        sha = "a" * 64
        r = vs.parse_speech(json.dumps({"input": "Hei", "voice": {"kind": "clone", "ref_sha": sha, "ref_text": " lest  tekst "}}).encode())
        self.assertEqual(r["voice"]["ref_text"], "lest tekst")
        self.assertEqual(r["fmt"], "mp3")
        self.assertIsNone(vs.parse_speech(b'{"input":"Hei","voice":null}')["voice"])
        for bad in (b"x", b"[]", b'{"input":""}', b'{"input":"a","response_format":"flac"}', b'{"input":"a","voice":{"kind":"clone","ref_sha":"../x"}}',
                    b'{"input":"a","voice":{"kind":"nope"}}', b'{"input":"a","language":"../.."}', b'{"input":"a","voice":"nora"}'):
            with self.assertRaises(vs.BadRequest, msg=bad):
                vs.parse_speech(bad)
        with self.assertRaises(vs.BadRequest):
            vs.parse_speech(json.dumps({"input": "x" * 5000}).encode())

    def test_wav(self):
        a = vs.wav_write(48000, b"\1\0" * 4800)
        b = vs.concat_wavs([a, a])
        self.assertAlmostEqual(vs.wav_seconds(b), 0.2 + vs.PAUSE_S, places=2)
        with self.assertRaises(RuntimeError):
            vs.concat_wavs([a, vs.wav_write(16000, b"\0\0" * 10)])
        self.assertIsNone(vs.wav_read(b"RIFF nope"))

    def test_gguf_command(self):
        conf = {"cli_bin": "/x/voxcpm2-cli", "baselm": "/m/BaseLM-Q8_0.gguf", "acoustic": "/m/Acoustic-F16.gguf", "cfg_value": 2.0, "timesteps": 10, "seed": 42, "quant": "Q8_0"}
        e = vs.GgufEngine(conf)
        self.assertEqual(e.command("(Rolig)Hei", "/t/o.wav", None, None),
                         ["/x/voxcpm2-cli", "-t", "(Rolig)Hei", "-o", "/t/o.wav", "--cfg", "2.0", "--timesteps", "10", "--seed", "42", "/m/BaseLM-Q8_0.gguf", "/m/Acoustic-F16.gguf"])
        c = e.command("Hei", "/t/o.wav", "/r/a.wav", "lest tekst")
        self.assertEqual(c[c.index("--prompt-wav") + 1], "/r/a.wav")
        self.assertEqual(c[c.index("--prompt-text") + 1], "lest tekst")
        self.assertEqual(c[c.index("-r") + 1], "/r/a.wav")
        self.assertNotIn("--prompt-wav", e.command("Hei", "/t/o.wav", "/r/a.wav", None))

    def test_config(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "config.json")
            base = {"bind_ip": "10.69.1.173", "allow": ["10.69.1.39"], "key": KEY}
            for bad in ({**base, "bind_ip": "0.0.0.0"}, {**base, "key": "kort"}, {**base, "allow": ["10.0.0.0/8"]}, {**base, "allow": []},
                        {**base, "engine": "fake"}, {**base, "engine": "onnx"}, {**base, "idle_unload_min": -1}):
                with open(p, "w") as f:
                    json.dump(bad, f)
                env = os.environ.pop("VOXCPM_ALLOW_FAKE", None)
                try:
                    with self.assertRaises(SystemExit, msg=bad):
                        vs.load_config(p)
                finally:
                    if env is not None:
                        os.environ["VOXCPM_ALLOW_FAKE"] = env
            with open(p, "w") as f:
                json.dump(base, f)
            c = vs.load_config(p)
            self.assertEqual((c["engine"], c["port"], c["idle_unload_min"]), ("gguf", 8030, 10.0))
            self.assertEqual(c["refs_dir"], os.path.join(d, "refs"))


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Http(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.mkdtemp(prefix="voxcpm57-")
        cls.port, cls.port2 = free_port(), free_port()
        cls.procs, cls.logs = [], []
        for port, allow in ((cls.port, ["127.0.0.1/32"]), (cls.port2, ["10.69.1.39"])):
            cfg = os.path.join(cls.dir, f"config{port}.json")
            with open(cfg, "w") as f:
                json.dump({"bind_ip": "127.0.0.1", "port": port, "allow": allow, "key": KEY, "engine": "fake", "idle_unload_min": 10,
                           "refs_dir": os.path.join(cls.dir, "refs")}, f)
            logf = open(os.path.join(cls.dir, f"log{port}.txt"), "w+")
            cls.logs.append(logf)
            env = dict(os.environ, VOXCPM_ALLOW_FAKE="1")
            cls.procs.append(subprocess.Popen([sys.executable, "-I", os.path.join(HERE, "voxcpm_service.py"), "--config", cfg], env=env, stderr=logf))
        for port in (cls.port, cls.port2):
            for _ in range(100):
                try:
                    socket.create_connection(("127.0.0.1", port), 0.2).close()
                    break
                except OSError:
                    time.sleep(0.05)

    @classmethod
    def tearDownClass(cls):
        for p in cls.procs:
            p.terminate()
            p.wait(5)
        for f in cls.logs:
            f.close()
        shutil.rmtree(cls.dir, ignore_errors=True)

    def req(self, method, path, body=None, headers=None, port=None):
        c = http.client.HTTPConnection("127.0.0.1", port or self.port, timeout=30)
        c.request(method, path, body=body, headers=headers or {})
        r = c.getresponse()
        data = r.read()
        c.close()
        return r.status, dict(r.getheaders()), data

    def auth(self, extra=None):
        return {"Authorization": f"Bearer {KEY}", **(extra or {})}

    def speech(self, obj):
        return self.req("POST", "/v1/audio/speech", json.dumps(obj).encode(), self.auth({"Content-Type": "application/json"}))

    def test_gate(self):
        self.assertEqual(self.req("GET", "/health")[0], 401)
        self.assertEqual(self.req("GET", "/health", headers={"Authorization": "Bearer feil" + KEY[4:]})[0], 401)
        self.assertEqual(self.req("GET", "/health", headers=self.auth(), port=self.port2)[0], 403, "IP-filteret")
        self.assertEqual(self.req("GET", "/v1/models", headers=self.auth())[0], 404)
        self.assertEqual(self.req("GET", "/v1/refs/" + "a" * 64, headers=self.auth())[0], 405)
        self.assertEqual(self.req("PATCH", "/health", headers=self.auth())[0], 405)

    def test_health(self):
        st, _, b = self.req("GET", "/health", headers=self.auth())
        self.assertEqual(st, 200)
        j = json.loads(b)
        self.assertEqual((j["status"], j["service"], j["model"], j["engine"], j["idle_unload_min"]), ("ok", "voxcpm", "VoxCPM2", "fake", 10))
        for k in ("loaded", "device", "memory", "refs", "version"):
            self.assertIn(k, j)

    def test_speech_and_refs(self):
        st, h, b = self.speech({"input": "Hei fra testen. Dette er setning to.", "voice": {"kind": "design", "prompt": "En rolig stemme"}, "response_format": "wav"})
        self.assertEqual(st, 200, b[:200])
        self.assertEqual(h["Content-Type"], "audio/wav")
        self.assertEqual(h.get("X-AI-Generated"), "VoxCPM2")
        self.assertGreater(vs.wav_seconds(b), 1.0)
        ref = tone_wav(2.0)
        sha = hashlib.sha256(ref).hexdigest()
        st, _, b = self.speech({"input": "Klonet", "voice": {"kind": "clone", "ref_sha": sha}, "response_format": "wav"})
        self.assertEqual(st, 404)
        self.assertEqual(json.loads(b)["error"]["code"], "ref_missing")
        self.assertEqual(self.req("HEAD", f"/v1/refs/{sha}", headers=self.auth())[0], 404)
        self.assertEqual(self.req("PUT", f"/v1/refs/{'0' * 64}", ref, self.auth())[0], 400, "feil hash")
        self.assertEqual(self.req("PUT", f"/v1/refs/{sha}", ref, self.auth())[0], 201)
        self.assertEqual(self.req("PUT", f"/v1/refs/{sha}", ref, self.auth())[0], 200)
        self.assertEqual(self.req("HEAD", f"/v1/refs/{sha}", headers=self.auth())[0], 200)
        st, _, b = self.speech({"input": "Klonet stemme", "voice": {"kind": "clone", "ref_sha": sha, "ref_text": "lest tekst"}, "response_format": "wav"})
        self.assertEqual(st, 200)
        self.assertGreaterEqual(json.loads(self.req("GET", "/health", headers=self.auth())[2])["refs"], 1)
        self.assertEqual(self.req("DELETE", f"/v1/refs/{sha}", headers=self.auth())[0], 204)
        self.assertEqual(self.req("DELETE", f"/v1/refs/{sha}", headers=self.auth())[0], 404)
        self.assertEqual(self.req("HEAD", "/v1/refs/..%2F..%2Fetc", headers=self.auth())[0], 400)
        bad = vs.wav_write(16000, b"")
        self.assertEqual(self.req("PUT", f"/v1/refs/{hashlib.sha256(b'xyz').hexdigest()}", b"xyz", self.auth())[0], 415)
        self.assertEqual(self.req("PUT", f"/v1/refs/{hashlib.sha256(bad).hexdigest()}", bad, self.auth())[0], 400)

    @unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg mangler")
    def test_mp3(self):
        st, h, b = self.speech({"input": "Hei på deg", "response_format": "mp3", "speed": 1.1})
        self.assertEqual(st, 200)
        self.assertEqual(h["Content-Type"], "audio/mpeg")
        self.assertTrue(b[:3] == b"ID3" or b[0] == 0xFF)

    def test_log_has_no_secrets(self):
        self.speech({"input": "Hemmelig setning om Kari", "response_format": "wav"})
        ref = tone_wav(1.5)
        sha = hashlib.sha256(ref).hexdigest()
        self.req("PUT", f"/v1/refs/{sha}", ref, self.auth())
        time.sleep(0.2)
        f = self.logs[0]
        f.flush()
        f.seek(0)
        txt = f.read()
        self.assertIn("/v1/audio/speech 200", txt)
        self.assertIn("/v1/refs/<sha>", txt)
        for s in (KEY, "Hemmelig", "Kari", sha):
            self.assertNotIn(s, txt)


if __name__ == "__main__":
    unittest.main()
