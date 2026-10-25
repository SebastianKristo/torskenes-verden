#!/usr/bin/env python3
"""Tester for tools/nb-whisper (prompt 54). Kjøres på Linux og Mac:

  python3 -m unittest -v tools/nb-whisper/test_nbwhisper.py

- Ren logikk (språk, multipart, ordbiter, valg av spor, navn ved konvertering): bare standardbiblioteket.
- Lyd: krever numpy.
- MLX: krever mlx + mlx_whisper (på Linux: pip install "mlx[cpu]" og mlx-whisper --no-deps). Lager en liten NB-Whisper-lignende
  modell med tilfeldige vekter i transformers-formatet, konverterer den med prepare.py og kjører transkripsjon og språkdeteksjon.
  (Ekte NB-Whisper-vekter lastes ikke her – huggingface.co er blokkert i utviklingsmiljøet.)
- HTTP: starter tjenesten med testmotoren (NBWHISPER_ALLOW_FAKE=1) og sjekker IP-filter, nøkkel, ruter og svarformer.
"""
from __future__ import annotations

import http.client
import importlib.util
import io
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nbwhisper as nw  # noqa: E402
import prepare as pp  # noqa: E402

HAS_NP = importlib.util.find_spec("numpy") is not None
HAS_MLX = HAS_NP and importlib.util.find_spec("mlx") is not None and importlib.util.find_spec("mlx_whisper") is not None
KEY = "a" * 16 + "0123456789abcdef0123456789abcdef"


def silent_wav(seconds: float = 1.0, rate: int = 16000, channels: int = 1) -> bytes:
    bio = io.BytesIO()
    with wave.open(bio, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\0\0" * int(seconds * rate) * channels)
    return bio.getvalue()


def multipart(fields: list[tuple[str, str]], file: bytes | None, boundary: str = "XyZ54") -> tuple[str, bytes]:
    parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields]
    if file is not None:
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="lyd.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode() + file + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    return f"multipart/form-data; boundary={boundary}", b"".join(parts)


class Logic(unittest.TestCase):
    def test_lang(self):
        self.assertEqual(nw.norm_lang("nb"), "no")
        self.assertEqual(nw.norm_lang("nb-NO"), "no")
        self.assertEqual(nw.norm_lang("NO"), "no")
        self.assertEqual(nw.norm_lang("nn"), "nn")
        self.assertEqual(nw.norm_lang("en_GB"), "en")
        self.assertIsNone(nw.norm_lang("auto"))
        self.assertIsNone(nw.norm_lang(""))
        self.assertEqual(nw.norm_lang("haw"), "haw")
        with self.assertRaises(nw.BadRequest):
            nw.norm_lang("xx")
        self.assertEqual(len(nw.WHISPER_LANGS), 100)

    def test_multipart(self):
        ct, body = multipart([("language", "nb"), ("timestamp_granularities[]", "word"), ("timestamp_granularities[]", "segment")], b"RIFF\x00\xff bin\xc3\xa6r")
        f, files = nw.parse_multipart(ct, body)
        self.assertEqual(f["language"], "nb")
        self.assertEqual(f["timestamp_granularities[]"], ["word", "segment"])
        self.assertEqual(files["file"], ("lyd.wav", b"RIFF\x00\xff bin\xc3\xa6r"))
        with self.assertRaises(nw.BadRequest):
            nw.parse_multipart("application/json", b"{}")

    def test_merge_tokens(self):
        toks = [{"word": "[_BEG_]", "start": 0, "end": 0}, {"word": " Hei", "start": 0.1, "end": 0.3}, {"word": ",", "start": 0.3, "end": 0.32},
                {"word": " Nord", "start": 0.4, "end": 0.6}, {"word": "lys", "start": 0.6, "end": 0.8}, {"word": ".", "start": 0.8, "end": 0.82}]
        self.assertEqual(nw.merge_tokens(toks), [{"word": "Hei,", "start": 0.1, "end": 0.32}, {"word": "Nordlys.", "start": 0.4, "end": 0.82}])

    def test_top_langs(self):
        r = nw.top_langs({"no": 0.5, "en": 0.3, "nn": 0.2}, 2)
        self.assertEqual([x["language"] for x in r], ["no", "en"])

    def test_plan(self):
        hf = ["config.json", "generation_config.json", "model.safetensors", "ggml-model.bin", "README.md"]
        self.assertEqual(pp.choose_plan("auto", "medium", hf, {})["kind"], "mlx-convert")
        self.assertEqual(pp.choose_plan("auto", "medium", hf, {"mlx-community/nb-whisper-medium-mlx": ["config.json", "weights.npz"]}),
                         {"kind": "mlx-repo", "repo": "mlx-community/nb-whisper-medium-mlx", "subdir": ""})
        self.assertEqual(pp.choose_plan("auto", "large", hf + ["mlx/config.json", "mlx/weights.safetensors"], {}),
                         {"kind": "mlx-repo", "repo": "NbAiLab/nb-whisper-large", "subdir": "mlx"})
        self.assertEqual(pp.choose_plan("cpp", "medium", hf, {})["kind"], "cpp")
        self.assertEqual(pp.choose_plan("auto", "medium", ["config.json", "pytorch_model.bin", "ggml-model.bin"], {})["kind"], "cpp")
        with self.assertRaises(RuntimeError):
            pp.choose_plan("mlx", "medium", ["config.json", "ggml-model.bin"], {})
        with self.assertRaises(RuntimeError):
            pp.choose_plan("auto", "medium", ["README.md"], {})

    def test_remap(self):
        self.assertEqual(pp.remap_hf_key("model.encoder.layers.3.self_attn.q_proj.weight"), "encoder.blocks.3.attn.query.weight")
        self.assertEqual(pp.remap_hf_key("model.decoder.layers.0.encoder_attn_layer_norm.bias"), "decoder.blocks.0.cross_attn_ln.bias")
        self.assertEqual(pp.remap_hf_key("model.decoder.layers.0.encoder_attn.out_proj.weight"), "decoder.blocks.0.cross_attn.out.weight")
        self.assertEqual(pp.remap_hf_key("model.decoder.layers.1.self_attn_layer_norm.weight"), "decoder.blocks.1.attn_ln.weight")
        self.assertEqual(pp.remap_hf_key("model.decoder.layers.1.final_layer_norm.weight"), "decoder.blocks.1.mlp_ln.weight")
        self.assertEqual(pp.remap_hf_key("model.decoder.layers.1.fc2.bias"), "decoder.blocks.1.mlp2.bias")
        self.assertEqual(pp.remap_hf_key("model.decoder.embed_positions.weight"), "decoder.positional_embedding")
        self.assertEqual(pp.remap_hf_key("model.decoder.embed_tokens.weight"), "decoder.token_embedding.weight")
        self.assertEqual(pp.remap_hf_key("model.encoder.layer_norm.weight"), "encoder.ln_post.weight")
        self.assertEqual(pp.remap_hf_key("model.decoder.layer_norm.bias"), "decoder.ln.bias")
        self.assertIsNone(pp.remap_hf_key("proj_out.weight"))
        self.assertIsNone(pp.remap_hf_key("model.encoder.embed_positions.weight"))


@unittest.skipUnless(HAS_NP, "numpy mangler")
class Audio(unittest.TestCase):
    def test_wav_resample_stereo(self):
        a = nw.decode_audio(silent_wav(1.0, 8000, 2))
        self.assertEqual(len(a), 16000)
        self.assertEqual(str(a.dtype), "float32")
        b = nw.wav_bytes(a)
        self.assertEqual(nw.wav_info(b)[:2], (1, 16000))


def tiny_hf_model(d: str, n_mels: int = 80) -> None:
    """Liten Whisper i transformers-formatet (tilfeldige vekter, large-v3-ordforråd) – samme navn som NbAiLab/nb-whisper-*."""
    import mlx.core as mx

    S, H, L, V = 64, 2, 2, 51866
    rnd = lambda *s: (mx.random.normal(s) * 0.02).astype(mx.float32)  # noqa: E731
    w = {"model.encoder.conv1.weight": rnd(S, n_mels, 3), "model.encoder.conv1.bias": rnd(S), "model.encoder.conv2.weight": rnd(S, S, 3), "model.encoder.conv2.bias": rnd(S),
         "model.encoder.embed_positions.weight": rnd(1500, S), "model.encoder.layer_norm.weight": mx.ones((S,)), "model.encoder.layer_norm.bias": rnd(S),
         "model.decoder.embed_tokens.weight": rnd(V, S), "model.decoder.embed_positions.weight": rnd(448, S),
         "model.decoder.layer_norm.weight": mx.ones((S,)), "model.decoder.layer_norm.bias": rnd(S), "proj_out.weight": rnd(V, S)}

    def attn(p):
        w.update({f"{p}.q_proj.weight": rnd(S, S), f"{p}.q_proj.bias": rnd(S), f"{p}.k_proj.weight": rnd(S, S), f"{p}.v_proj.weight": rnd(S, S),
                  f"{p}.v_proj.bias": rnd(S), f"{p}.out_proj.weight": rnd(S, S), f"{p}.out_proj.bias": rnd(S)})

    for side in ("encoder", "decoder"):
        for i in range(L):
            p = f"model.{side}.layers.{i}"
            attn(f"{p}.self_attn")
            w.update({f"{p}.self_attn_layer_norm.weight": mx.ones((S,)), f"{p}.self_attn_layer_norm.bias": rnd(S), f"{p}.fc1.weight": rnd(4 * S, S), f"{p}.fc1.bias": rnd(4 * S),
                      f"{p}.fc2.weight": rnd(S, 4 * S), f"{p}.fc2.bias": rnd(S), f"{p}.final_layer_norm.weight": mx.ones((S,)), f"{p}.final_layer_norm.bias": rnd(S)})
            if side == "decoder":
                attn(f"{p}.encoder_attn")
                w.update({f"{p}.encoder_attn_layer_norm.weight": mx.ones((S,)), f"{p}.encoder_attn_layer_norm.bias": rnd(S)})
    os.makedirs(d, exist_ok=True)
    mx.save_safetensors(os.path.join(d, "model.safetensors"), w)
    with open(os.path.join(d, "config.json"), "w") as f:
        json.dump({"num_mel_bins": n_mels, "max_source_positions": 1500, "d_model": S, "encoder_attention_heads": H, "encoder_layers": L, "vocab_size": V,
                   "max_target_positions": 448, "decoder_attention_heads": H, "decoder_layers": L, "model_type": "whisper"}, f)
    with open(os.path.join(d, "generation_config.json"), "w") as f:
        json.dump({"alignment_heads": [[1, 0], [1, 1]]}, f)


@unittest.skipUnless(HAS_MLX, "mlx/mlx_whisper mangler")
class Mlx(unittest.TestCase):
    def test_convert_and_run(self):
        import numpy as np

        with tempfile.TemporaryDirectory() as t:
            hf, out = os.path.join(t, "hf"), os.path.join(t, "model")
            tiny_hf_model(hf)
            dims = pp.convert_hf_to_mlx(hf, os.path.join(out, "mlx"))
            self.assertEqual(dims["n_text_layer"], 2)
            with open(os.path.join(out, "model.json"), "w") as f:
                json.dump({"engine": "mlx", "alignment_heads": pp.alignment_heads_from(hf)}, f)
            e = nw.MlxEngine({"model_dir": out, "size": "tiny"})
            e.load()
            audio = (np.random.default_rng(54).normal(size=2 * 16000) * 0.05).astype(np.float32)
            probs = e.detect(audio)
            self.assertIn("no", probs)
            self.assertIn("nn", probs)
            self.assertAlmostEqual(sum(probs.values()), 1.0, places=2)
            r = e.transcribe(audio, "no", None, True, 0.0)
            self.assertEqual(set(r), {"text", "language", "segments", "words"})
            self.assertEqual(r["language"], "no")
            for w in r["words"]:
                self.assertLessEqual(w["start"], w["end"])


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Http(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.port, cls.port2 = free_port(), free_port()
        cls.procs = []
        for port, allow in ((cls.port, ["127.0.0.1/32"]), (cls.port2, ["10.69.1.39"])):
            cfg = os.path.join(cls.tmp.name, f"c{port}.json")
            with open(cfg, "w") as f:
                json.dump({"bind_ip": "127.0.0.1", "port": port, "allow": allow, "key": KEY, "engine": "fake", "size": "medium"}, f)
            env = dict(os.environ, NBWHISPER_ALLOW_FAKE="1")
            cls.procs.append(subprocess.Popen([sys.executable, "-I", os.path.join(HERE, "nbwhisper.py"), "--config", cfg], env=env, stderr=subprocess.PIPE))
        for port in (cls.port, cls.port2):
            for _ in range(100):
                try:
                    socket.create_connection(("127.0.0.1", port), 0.2).close()
                    break
                except OSError:
                    time.sleep(0.05)
        time.sleep(0.2)

    @classmethod
    def tearDownClass(cls):
        for p in cls.procs:
            p.terminate()
            p.wait(5)
        cls.log = b"".join(p.stderr.read() for p in cls.procs).decode()
        cls.tmp.cleanup()

    def req(self, method, path, body=None, headers=None, port=None):
        c = http.client.HTTPConnection("127.0.0.1", port or self.port, timeout=10)
        c.request(method, path, body=body, headers=headers or {})
        r = c.getresponse()
        raw = r.read()
        c.close()
        try:
            return r.status, json.loads(raw)
        except ValueError:
            return r.status, raw.decode()

    def auth(self, extra=None):
        return {"Authorization": f"Bearer {KEY}", **(extra or {})}

    def test_gate(self):
        self.assertEqual(self.req("GET", "/health")[0], 401)
        self.assertEqual(self.req("GET", "/health", headers={"Authorization": "Bearer " + "b" * 48})[0], 401)
        self.assertEqual(self.req("GET", "/health", headers=self.auth(), port=self.port2)[0], 403, "bare tillatt avsender")
        self.assertEqual(self.req("GET", "/admin", headers=self.auth())[0], 404)
        self.assertEqual(self.req("PUT", "/health", headers=self.auth())[0], 405)
        ct, body = multipart([], silent_wav())
        self.assertEqual(self.req("POST", "/v1/audio/transcriptions", body, {"Content-Type": ct})[0], 401, "lyd uten nøkkel avvises")

    def test_health_and_models(self):
        st, h = self.req("GET", "/health", headers=self.auth())
        self.assertEqual(st, 200)
        self.assertEqual(h["status"], "ok")
        self.assertEqual(h["model"], "nb-whisper-medium")
        self.assertEqual(h["languages"], ["no", "nn", "en"])
        st, m = self.req("GET", "/v1/models", headers=self.auth())
        self.assertEqual(m["data"][0]["id"], "nb-whisper-medium")

    def test_transcribe(self):
        ct, body = multipart([("language", "nb"), ("response_format", "verbose_json"), ("timestamp_granularities[]", "word")], silent_wav(1.5))
        st, r = self.req("POST", "/v1/audio/transcriptions", body, self.auth({"Content-Type": ct}))
        self.assertEqual(st, 200, r)
        self.assertEqual(r["language"], "no")
        self.assertEqual(r["text"], "hei fra testen")
        self.assertEqual(r["duration"], 1.5)
        self.assertEqual(r["words"][1], {"word": "fra", "start": 0.3, "end": 0.55})
        ct, body = multipart([("language", "nn"), ("response_format", "json")], silent_wav())
        self.assertEqual(self.req("POST", "/v1/audio/transcriptions", body, self.auth({"Content-Type": ct}))[1], {"text": "hei frå testen"})
        ct, body = multipart([("language", "en"), ("response_format", "text")], silent_wav())
        self.assertEqual(self.req("POST", "/v1/audio/transcriptions", body, self.auth({"Content-Type": ct}))[1], "hello from the test")
        ct, body = multipart([("language", "xx")], silent_wav())
        self.assertEqual(self.req("POST", "/v1/audio/transcriptions", body, self.auth({"Content-Type": ct}))[0], 400)
        ct, body = multipart([], b"ikke lyd")
        self.assertEqual(self.req("POST", "/v1/audio/transcriptions", body, self.auth({"Content-Type": ct}))[1]["error"]["code"], "bad_audio")

    def test_detect(self):
        ct, body = multipart([], silent_wav(2))
        st, r = self.req("POST", "/v1/audio/detect", body, self.auth({"Content-Type": ct}))
        self.assertEqual(st, 200)
        self.assertEqual(r["language"], "no")
        self.assertEqual(r["languages"][1]["language"], "nn")
        self.assertEqual(r["duration"], 2.0)


class LogNoSecrets(unittest.TestCase):
    def test_log(self):
        log = getattr(Http, "log", "")
        if not log:
            self.skipTest("Http-testene kjørte ikke først")
        self.assertNotIn(KEY, log)
        self.assertNotIn("hei fra testen", log)
        self.assertIn("/v1/audio/transcriptions 200", log)


if __name__ == "__main__":
    unittest.main()
