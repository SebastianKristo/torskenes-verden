#!/usr/bin/env python3
"""Henter NB-Whisper (Nasjonalbiblioteket, Apache-2.0) til Mac mini-en og gjør modellen klar for nbwhisper.py (prompt 54, WHISPER54).

Rekkefølge (--engine auto):
  1) Ferdige MLX-vekter for NB-Whisper (config.json + weights.safetensors/weights.npz) – eget repo eller en mlx-undermappe.
  2) Konvertering til MLX her på Mac-en fra Hugging Face-vektene (model.safetensors) i NbAiLab/nb-whisper-<størrelse>.
  3) whisper.cpp med Metal: ggml-model.bin fra samme repo (krever `brew install whisper-cpp`).
--engine mlx eller --engine cpp tvinger ett av sporene.

Resultatet havner i --out:
  mlx/config.json + mlx/weights.safetensors   (MLX)   eller   ggml-model.bin   (whisper.cpp)
  model.json  {engine, size, repo, source, alignment_heads, n_mels, prepared_at}
Kjøres av install.sh med venv-ens python. Bare Hugging Face kontaktes (huggingface.co), og bare ved installasjon.

  prepare.py --size medium --out ~/Library/Application\\ Support/nb-whisper/models/medium
  prepare.py --size large --engine cpp --out …
  prepare.py --convert-only SRC_DIR --out DST_DIR      # bare konvertering fra en lokal HF-mappe (brukes i tester)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

SIZES = ("tiny", "base", "small", "medium", "large")
MAIN_REPO = "NbAiLab/nb-whisper-{size}"
# Mulige ferdige MLX-repoer (finnes de ikke, konverterer vi selv). Rekkefølgen er prioritet.
MLX_REPOS = ("NbAiLab/nb-whisper-{size}-mlx", "mlx-community/nb-whisper-{size}-mlx", "mlx-community/nb-whisper-{size}")
GGML_NAMES = ("ggml-model.bin", "ggml-model-q5_0.bin", "ggml-model-q8_0.bin")
HF_WEIGHT_FILES = ("config.json", "generation_config.json", "model.safetensors", "model.safetensors.index.json")


def log(msg: str) -> None:
    print(f"==> {msg}", flush=True)


# ---------------------------------------------------------------------------------------------- valg av spor (ren logikk)
def mlx_dir_in(files: list[str]) -> str | None:
    """Mappe (\"\" = roten) med config.json og weights.safetensors/weights.npz i en filliste, ellers None."""
    dirs: dict[str, set[str]] = {}
    for f in files:
        d, _, name = f.rpartition("/")
        dirs.setdefault(d, set()).add(name)
    cands = sorted(dirs, key=lambda d: (d != "", "mlx" not in d.lower(), d))
    for d in cands:
        names = dirs[d]
        if "config.json" in names and ("weights.safetensors" in names or "weights.npz" in names):
            if d == "" or "mlx" in d.lower():
                return d
    return None


def has_hf_weights(files: list[str]) -> bool:
    s = set(files)
    return "config.json" in s and ("model.safetensors" in s or ("model.safetensors.index.json" in s and any(f.startswith("model-") and f.endswith(".safetensors") for f in s)))


def choose_plan(engine: str, size: str, main_files: list[str] | None, mlx_repos: dict[str, list[str]]) -> dict:
    """→ {kind:'mlx-repo'|'mlx-convert'|'cpp', repo, subdir?|file?}. Kaster RuntimeError med norsk forklaring."""
    main = MAIN_REPO.format(size=size)
    main_files = main_files or []
    if engine in ("auto", "mlx"):
        for repo, files in mlx_repos.items():
            d = mlx_dir_in(files)
            if d is not None:
                return {"kind": "mlx-repo", "repo": repo, "subdir": d}
        d = mlx_dir_in(main_files)
        if d:  # mlx-undermappe i hovedrepoet (roten der er transformers-formatet)
            return {"kind": "mlx-repo", "repo": main, "subdir": d}
        if has_hf_weights(main_files):
            return {"kind": "mlx-convert", "repo": main}
        if engine == "mlx":
            raise RuntimeError(f"Fant verken MLX-vekter eller model.safetensors for {main} – prøv --engine cpp")
    for name in GGML_NAMES:
        if name in main_files:
            return {"kind": "cpp", "repo": main, "file": name}
    raise RuntimeError(f"Fant ingen vekter for {main} som kan brukes (MLX eller ggml). Er størrelsen riktig, og svarer huggingface.co?")


# ---------------------------------------------------------------------------------------------- HF → MLX
def remap_hf_key(k: str) -> str | None:
    """Navn i transformers' WhisperForConditionalGeneration → mlx_whisper. None = dropp (delt/utregnet)."""
    if k in ("proj_out.weight",) or k.startswith("model.encoder.embed_positions"):
        return None  # utgangen deler vekter med token_embedding; encoderens posisjoner er sinus (regnes ut i MLX)
    k = k.replace("model.", "", 1) if k.startswith("model.") else k
    k = k.replace(".layers.", ".blocks.")
    k = k.replace(".self_attn_layer_norm", ".attn_ln")
    k = k.replace(".self_attn.", ".attn.")
    k = k.replace(".encoder_attn_layer_norm", ".cross_attn_ln")
    k = k.replace(".encoder_attn.", ".cross_attn.")
    k = k.replace(".final_layer_norm", ".mlp_ln")
    k = k.replace(".q_proj.", ".query.").replace(".k_proj.", ".key.").replace(".v_proj.", ".value.").replace(".out_proj.", ".out.")
    k = k.replace(".fc1.", ".mlp1.").replace(".fc2.", ".mlp2.")
    k = k.replace("decoder.embed_positions.weight", "decoder.positional_embedding")
    k = k.replace("decoder.embed_tokens.", "decoder.token_embedding.")
    k = k.replace("encoder.layer_norm.", "encoder.ln_post.")
    k = k.replace("decoder.layer_norm.", "decoder.ln.")
    return k


def dims_from_hf(cfg: dict) -> dict:
    return {
        "n_mels": int(cfg["num_mel_bins"]),
        "n_audio_ctx": int(cfg["max_source_positions"]),
        "n_audio_state": int(cfg["d_model"]),
        "n_audio_head": int(cfg["encoder_attention_heads"]),
        "n_audio_layer": int(cfg["encoder_layers"]),
        "n_vocab": int(cfg["vocab_size"]),
        "n_text_ctx": int(cfg["max_target_positions"]),
        "n_text_state": int(cfg["d_model"]),
        "n_text_head": int(cfg["decoder_attention_heads"]),
        "n_text_layer": int(cfg["decoder_layers"]),
    }


def alignment_heads_from(src: str) -> list[list[int]] | None:
    p = os.path.join(src, "generation_config.json")
    try:
        with open(p, "r", encoding="utf-8") as f:
            heads = json.load(f).get("alignment_heads")
        if isinstance(heads, list) and heads and all(isinstance(h, list) and len(h) == 2 for h in heads):
            return [[int(a), int(b)] for a, b in heads]
    except (OSError, ValueError):
        pass
    return None


def convert_hf_to_mlx(src: str, dst: str, dtype: str = "float16") -> dict:
    """Konverterer en lokal HF-mappe (config.json + model.safetensors[ + shards]) til mlx_whisper-formatet. → dims"""
    import mlx.core as mx  # noqa: PLC0415 – bare på Mac-en / i tester med mlx
    from mlx.utils import tree_flatten  # noqa: PLC0415
    from mlx_whisper import whisper as mw  # noqa: PLC0415

    with open(os.path.join(src, "config.json"), "r", encoding="utf-8") as f:
        cfg = json.load(f)
    dims = dims_from_hf(cfg)
    files = []
    idx = os.path.join(src, "model.safetensors.index.json")
    if os.path.exists(idx):
        with open(idx, "r", encoding="utf-8") as f:
            files = sorted(set(json.load(f)["weight_map"].values()))
    else:
        files = ["model.safetensors"]
    dt = getattr(mx, dtype)
    out: dict = {}
    for fn in files:
        for k, v in mx.load(os.path.join(src, fn)).items():
            nk = remap_hf_key(k)
            if nk is None:
                continue
            if "conv" in nk and nk.endswith(".weight") and v.ndim == 3:
                v = v.swapaxes(1, 2)  # torch (ut, inn, kjerne) → mlx (ut, kjerne, inn)
            out[nk] = v.astype(dt)
    model = mw.Whisper(mw.ModelDimensions(**dims), dt)
    want = {k: v.shape for k, v in tree_flatten(model.parameters()) if k != "alignment_heads"}  # settes fra generation_config.json
    missing = sorted(set(want) - set(out))
    extra = sorted(set(out) - set(want))
    if missing or extra:
        raise RuntimeError(f"Konverteringen ga feil navn (mangler {missing[:5]}, ukjente {extra[:5]})")
    bad = [k for k in want if tuple(want[k]) != tuple(out[k].shape)]
    if bad:
        raise RuntimeError(f"Konverteringen ga feil form for {bad[:5]}")
    os.makedirs(dst, exist_ok=True)
    mx.save_safetensors(os.path.join(dst, "weights.safetensors"), out)
    with open(os.path.join(dst, "config.json"), "w", encoding="utf-8") as f:
        json.dump(dims | {"model_type": "whisper"}, f, indent=2)
    return dims


# ---------------------------------------------------------------------------------------------- nedlasting
def list_files(api, repo: str) -> list[str] | None:
    try:
        return list(api.list_repo_files(repo))
    except Exception as e:  # noqa: BLE001 – RepositoryNotFound, nettverk, 401 …
        name = type(e).__name__
        if "NotFound" in name or "401" in str(e) or "404" in str(e):
            return None
        raise RuntimeError(f"Kunne ikke lese {repo} fra Hugging Face ({name}). Svarer huggingface.co?") from e


def prepare(size: str, engine: str, out: str) -> dict:
    from huggingface_hub import HfApi, hf_hub_download, snapshot_download  # noqa: PLC0415

    api = HfApi()
    main = MAIN_REPO.format(size=size)
    log(f"Ser etter NB-Whisper {size} på Hugging Face ({main}) …")
    main_files = list_files(api, main)
    if main_files is None:
        raise RuntimeError(f"Fant ikke {main} på Hugging Face")
    mlx_repos: dict[str, list[str]] = {}
    if engine in ("auto", "mlx"):
        for tpl in MLX_REPOS:
            repo = tpl.format(size=size)
            files = list_files(api, repo)
            if files:
                mlx_repos[repo] = files
    plan = choose_plan(engine, size, main_files, mlx_repos)
    os.makedirs(out, exist_ok=True)
    meta = {"size": size, "repo": plan["repo"], "source": plan["kind"], "prepared_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    # Justeringshodene (ordtider) står i hovedrepoets generation_config.json.
    heads = None
    if "generation_config.json" in main_files:
        gdir = os.path.join(out, "hf")
        hf_hub_download(main, "generation_config.json", local_dir=gdir)
        heads = alignment_heads_from(gdir)
    if plan["kind"] == "mlx-repo":
        sub = plan["subdir"]
        pat = [f"{sub}/config.json", f"{sub}/weights.safetensors", f"{sub}/weights.npz"] if sub else ["config.json", "weights.safetensors", "weights.npz"]
        log(f"Laster ned ferdige MLX-vekter fra {plan['repo']}{'/' + sub if sub else ''} …")
        snap = snapshot_download(plan["repo"], allow_patterns=pat, local_dir=os.path.join(out, "dl"))
        src = os.path.join(snap, sub) if sub else snap
        dst = os.path.join(out, "mlx")
        os.makedirs(dst, exist_ok=True)
        for fn in ("config.json", "weights.safetensors", "weights.npz"):
            p = os.path.join(src, fn)
            if os.path.exists(p):
                os.replace(p, os.path.join(dst, fn))
        with open(os.path.join(dst, "config.json"), "r", encoding="utf-8") as f:
            meta["n_mels"] = int(json.load(f).get("n_mels") or 0) or None
        meta["engine"] = "mlx"
    elif plan["kind"] == "mlx-convert":
        log(f"Ingen ferdige MLX-vekter – laster ned {main} (transformers-format) og konverterer til MLX her …")
        hf = os.path.join(out, "hf")
        snapshot_download(main, allow_patterns=list(HF_WEIGHT_FILES) + ["model-*.safetensors"], local_dir=hf)
        dims = convert_hf_to_mlx(hf, os.path.join(out, "mlx"))
        meta["n_mels"] = dims["n_mels"]
        meta["engine"] = "mlx"
        for fn in os.listdir(hf):  # spar plass: behold bare generation_config.json
            if fn.endswith(".safetensors"):
                os.remove(os.path.join(hf, fn))
    else:
        log(f"Bruker whisper.cpp: laster ned {plan['file']} fra {main} …")
        p = hf_hub_download(main, plan["file"], local_dir=out)
        if os.path.basename(p) != "ggml-model.bin":
            os.replace(p, os.path.join(out, "ggml-model.bin"))
        meta["engine"] = "cpp"
    meta["alignment_heads"] = heads
    with open(os.path.join(out, "model.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    log(f"Klar: {meta['engine']} ({meta['source']}) i {out}")
    return meta


def main() -> None:
    ap = argparse.ArgumentParser(description="Hent og klargjør NB-Whisper (MLX eller whisper.cpp)")
    ap.add_argument("--size", choices=SIZES, default="medium")
    ap.add_argument("--engine", choices=("auto", "mlx", "cpp"), default="auto")
    ap.add_argument("--out", required=True)
    ap.add_argument("--convert-only", metavar="SRC", help="bare konverter en lokal HF-mappe til MLX (til --out)")
    a = ap.parse_args()
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    try:
        if a.convert_only:
            dims = convert_hf_to_mlx(a.convert_only, a.out)
            print(json.dumps({"ok": True, "dims": dims}))
            return
        meta = prepare(a.size, a.engine, a.out)
        print(json.dumps({"ok": True, "engine": meta["engine"], "source": meta["source"]}))
    except RuntimeError as e:
        sys.exit(f"Feil: {e}")


if __name__ == "__main__":
    main()
