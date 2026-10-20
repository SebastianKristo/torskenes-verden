# Kvitteringer: AI lager ny kategori når ingen passer

Ønske 2026-10-20: «når den scanner kvittering og ikke finner en passende kategori lag en kategori med passende navn»

Fasit: `Mobil Papir App.dc.html` → Finans → Kvitteringer (`CB`, `CNEW`, `CATS`). Eksempler i designet: Akademika → **Skole og studier**, Vinmonopolet → **Vin og brennevin**, Jernia → **Verktøy og jernvare**.

## Oppførsel
1. Etter lesing klassifiserer AI kvitteringen mot **eksisterende** kategorier (inkl. tidligere AI-lagde) med sikkerhet 0–1.
2. Er beste treff < 0,6, eller blir resultatet «Annet», lager AI en **ny kategori**:
   - Navn: 1–3 norske ord, stor forbokstav, flertall/fellesnavn («Skole og studier», «Kjæledyr», «Gaver», «Kultur og fritid»). Aldri butikknavn, aldri «Diverse».
   - Bygger på butikktype (MCC-kode fra banken, orgnr → NACE-bransje, varelinjene).
   - Sjekk mot eksisterende: sammenlign normalisert navn og embeddings (`nomic-embed-text`). Likhet > 0,85 → bruk den eksisterende i stedet (ingen «Skole» + «Skole og studier»).
   - Får automatisk farge og ikon fra en fast palett, og budsjett «ikke satt».
3. **I gjennomgang:**
   - raden viser «Gemini · 91 % sikker · ✦ ny kategori «Skole og studier»»
   - kategorichipen har ✦ foran og ligger før «Annet»
   - godkjenning gjør kategorien permanent
   - velger brukeren en annen kategori, og ingen kvitteringer bruker den nye, slettes den nye etter 24 t
4. **Toast** første gang: «✦ Ny kategori: Skole og studier · Endre». «Endre» åpner Kategorier og budsjett med navnefeltet i fokus.
5. **Regel:** etter 2 like godkjenninger (samme butikk → samme nye kategori) lages en regel «AKADEMIKA → Skole og studier» automatisk (Innstillinger → Regler, merket ✦).
6. **Grense:** maks 3 nye kategorier per uke uten godkjenning. Etter det foreslås de bare («Lag kategori «Kjæledyr»?») og havner i «Annet» til brukeren svarer.

## Backend
`POST /api/finance/categories {name, color, icon, source:'ai', example_tx}`. Kategorier har `source: 'user' | 'ai'` og `confirmed: bool`. Kvitteringslesingen returnerer `{category, isNew, confidence, reason}`. `reason` vises i detaljen («Bokhandel · pensum»).
