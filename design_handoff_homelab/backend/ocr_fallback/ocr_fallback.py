"""Offline kvitteringslesing uten AI. Brukes når AI-kallet feiler.

Kjøres helt lokalt i containeren: OpenCV for forbehandling, Tesseract (nor) for tekst,
og regex for norske kvitteringsmønstre.
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime
from typing import Optional

import cv2
import numpy as np
import pytesseract

log = logging.getLogger("kvittering.ocr")

# ---------- Mønstre ----------
# Org.nr: 9 siffer, ofte "Org.nr", "Org nr", "Foretaksregisteret", "NO 123 456 789 MVA"
RE_ORGNR = re.compile(
    r"(?:org\.?\s*n(?:r|o)\.?|organisasjonsn(?:r|ummer)|foretaksreg\w*|\bNO)\s*[:.]?\s*"
    r"(\d{3})[\s.]?(\d{3})[\s.]?(\d{3})(?:\s*MVA)?",
    re.IGNORECASE,
)
RE_ORGNR_LOOSE = re.compile(r"(?<!\d)(\d{3})[\s.]?(\d{3})[\s.]?(\d{3})(?!\d)")

# Beløp: 1 234,50 / 1234.50 / 1.234,50 / kr 99,-
BELOP = r"(\d{1,3}(?:[ .\u00a0]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2})|\d+,-)"
TOTAL_KEYS = r"(?:å\s*betale|a\s*betale|totalt?|total\s*nok|sum(?:\s*nok)?|beløp|bel[o0]p|til\s*betaling|betalt|kortbetaling)"
RE_TOTAL = re.compile(TOTAL_KEYS + r"[^\d\n]{0,20}" + BELOP, re.IGNORECASE)
RE_ALLE_BELOP = re.compile(BELOP)
RE_DATO = re.compile(r"(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?!\d)")
RE_MVA = re.compile(r"mva[^\d\n]{0,20}" + BELOP, re.IGNORECASE)

# Prioritet: "Å betale" slår "Sum", som slår "Total"
PRIORITET = ["betale", "til betaling", "betalt", "kortbetaling", "total", "sum", "beløp", "belop"]


def _til_float(s: str) -> Optional[float]:
    s = s.replace("\u00a0", " ").strip()
    if s.endswith(",-"):
        s = s[:-2]
    # siste skilletegn er desimal hvis det følges av 2 siffer
    m = re.match(r"^(.*?)[.,](\d{2})$", s)
    if m:
        heltall = re.sub(r"[ .,]", "", m.group(1))
        s = f"{heltall}.{m.group(2)}"
    else:
        s = re.sub(r"[ .,]", "", s)
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def _mod11_ok(orgnr: str) -> bool:
    """Brønnøysund bruker MOD11 med vekter 3,2,7,6,5,4,3,2."""
    if len(orgnr) != 9 or not orgnr.isdigit() or orgnr[0] not in "89":
        return False
    vekter = [3, 2, 7, 6, 5, 4, 3, 2]
    rest = sum(int(d) * v for d, v in zip(orgnr[:8], vekter)) % 11
    kontroll = 0 if rest == 0 else 11 - rest
    return kontroll != 10 and kontroll == int(orgnr[8])


# ---------- Bildebehandling ----------
def _forbehandle(image_path: str) -> np.ndarray:
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Kan ikke lese bilde: {image_path}")

    # Skaler opp små bilder, Tesseract liker ~300 dpi (teksthøyde 20-30 px)
    h, w = img.shape[:2]
    if max(h, w) < 1800:
        f = 1800 / max(h, w)
        img = cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC)

    grå = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    grå = cv2.fastNlMeansDenoising(grå, h=12)

    # Rett opp skjevhet
    try:
        inv = cv2.bitwise_not(grå)
        coords = np.column_stack(np.where(inv > 0))
        vinkel = cv2.minAreaRect(coords)[-1]
        vinkel = -(90 + vinkel) if vinkel < -45 else -vinkel
        if 0.5 < abs(vinkel) < 15:
            M = cv2.getRotationMatrix2D((grå.shape[1] / 2, grå.shape[0] / 2), vinkel, 1.0)
            grå = cv2.warpAffine(grå, M, (grå.shape[1], grå.shape[0]),
                                 flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    except Exception:  # skjevhet er nice-to-have
        pass

    # Binarisering: adaptiv terskel tåler skygger og termopapir bedre enn global Otsu
    binær = cv2.adaptiveThreshold(grå, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                  cv2.THRESH_BINARY, 31, 15)
    return binær


def _ocr(bilde: np.ndarray) -> str:
    cfg = "--oem 1 --psm 4 -c preserve_interword_spaces=1"
    return pytesseract.image_to_string(bilde, lang="nor+eng", config=cfg)


# ---------- Uttrekk ----------
def _finn_total(tekst: str) -> tuple[Optional[float], float]:
    kandidater: list[tuple[int, float]] = []
    for linje in tekst.splitlines():
        for m in RE_TOTAL.finditer(linje):
            v = _til_float(m.group(1))
            if v is None:
                continue
            nøkkel = linje.lower()
            rang = next((i for i, k in enumerate(PRIORITET) if k in nøkkel), len(PRIORITET))
            kandidater.append((rang, v))
    if kandidater:
        kandidater.sort(key=lambda x: (x[0], -x[1]))
        return kandidater[0][1], 0.8 if kandidater[0][0] < 4 else 0.65
    # Ingen nøkkelord: største beløp er ofte totalen
    alle = [v for v in (_til_float(x) for x in RE_ALLE_BELOP.findall(tekst)) if v and v < 1_000_000]
    return (max(alle), 0.35) if alle else (None, 0.0)


def _finn_orgnr(tekst: str) -> Optional[str]:
    for m in RE_ORGNR.finditer(tekst):
        nr = "".join(m.groups())
        if _mod11_ok(nr):
            return nr
    for m in RE_ORGNR_LOOSE.finditer(tekst):
        nr = "".join(m.groups())
        if _mod11_ok(nr):
            return nr
    return None


def _finn_dato(tekst: str) -> Optional[str]:
    for d, mnd, å in RE_DATO.findall(tekst):
        å = int(å) + 2000 if len(å) == 2 else int(å)
        try:
            return datetime(å, int(mnd), int(d)).date().isoformat()
        except ValueError:
            continue
    return None


def _finn_butikk(tekst: str) -> Optional[str]:
    for linje in tekst.splitlines()[:6]:
        ren = linje.strip(" *-=#")
        if len(ren) >= 3 and sum(c.isalpha() for c in ren) >= 3 and not RE_DATO.search(ren):
            return ren[:60]
    return None


def klassisk_ocr_fallback(image_path: str) -> dict:
    """Leser en kvittering lokalt. Returnerer samme form som AI-svaret, med lavere sikkerhet."""
    bilde = _forbehandle(image_path)
    tekst = _ocr(bilde)
    total, sikkerhet = _finn_total(tekst)
    mva = next((_til_float(m.group(1)) for m in RE_MVA.finditer(tekst)), None)
    return {
        "provider": "tesseract",
        "model": f"tesseract-{pytesseract.get_tesseract_version()}-nor",
        "store": _finn_butikk(tekst),
        "orgnr": _finn_orgnr(tekst),
        "date": _finn_dato(tekst),
        "total": total,
        "vat": mva,
        "currency": "NOK",
        "category": None,          # settes av regler, ikke AI
        "confidence": sikkerhet,
        "needs_review": True,      # alltid til gjennomgang når fallback er brukt
        "raw_text": tekst,
    }


def fallback_aktiv() -> bool:
    return os.getenv("OCR_FALLBACK", "on").lower() in ("1", "on", "true", "yes")
