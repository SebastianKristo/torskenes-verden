"""Eksempel på hvordan AI-kallet pakkes inn. Tilpass navnene til din kode."""
import logging

from ocr_fallback import fallback_aktiv, klassisk_ocr_fallback

log = logging.getLogger("kvittering")


def les_kvittering(image_path: str, settings) -> dict:
    # settings.ocr_fallback kommer fra Innstillinger → AI og tolkning i appen,
    # og overstyrer miljøvariabelen OCR_FALLBACK når den er satt.
    bruk_fallback = settings.ocr_fallback if settings.ocr_fallback is not None else fallback_aktiv()

    try:
        resultat = ai_les_kvittering(image_path)   # din eksisterende funksjon (Gemini/Ollama)
        if resultat.get("confidence", 1) < settings.ai_min_confidence and bruk_fallback:
            log.info("Lav AI-sikkerhet, sammenligner med lokal OCR")
            lokal = klassisk_ocr_fallback(image_path)
            if lokal["total"] and not resultat.get("total"):
                resultat["total"] = lokal["total"]
        return resultat
    except Exception as e:  # nettverk, timeout, 5xx, kvote, ugyldig JSON
        log.warning("AI-kallet feilet (%s: %s)", type(e).__name__, e)
        if not bruk_fallback:
            raise
        try:
            resultat = klassisk_ocr_fallback(image_path)
            resultat["fallback_reason"] = f"{type(e).__name__}: {e}"[:200]
            return resultat
        except Exception as e2:
            log.exception("Lokal OCR feilet også")
            # Ikke krasj: lagre bildet og marker for manuell utfylling
            return {"provider": "none", "needs_review": True, "total": None,
                    "error": f"AI: {e} · OCR: {e2}"[:300]}
