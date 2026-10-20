# Økonomi → Glimt: avanserte oppgaver som kjører i bakgrunnen

Ønske 2026-10-20: «i glimt her gi den også avansert ai funksjoner som da også kan gå i bakgrunnen som. gi meg en rapport over forbruk der og da» (vedlegg `uploads/Screenshot 2026-10-20 at 20.48.48.png`).
Fasit: `FinansHub v3 Temaer.dc.html` → Glimt-siden, kortet «Avanserte oppgaver» (`gj`).

- Fire oppgavekort: **Forbruksrapport nå**, **Abonnementer jeg kan kutte**, **Sammenlign med i fjor** og **Rydd kategorier**. Glimt forstår også fritekst («lag en rapport over forbruket mitt i høst»).
- Trykk starter en **bakgrunnsjobb** (`POST /api/glimt/jobs {type, period}` → `job_id`). Jobben kjører på serveren og fortsetter selv om man går til en annen side eller lukker appen. Status kommer via SSE/WebSocket.
- Jobbrad: Glimt-orb (roterer mens den jobber), tittel, steg («Leser transaksjoner → Leser kvitteringer og varelinjer → Grupperer etter kategori → Skriver rapporten» + %), og en gradient-fremdriftslinje. Ferdig: «Ferdig · 20:51» + **Åpne rapport**, og push-varsel / varselklokke «Glimt: rapporten er klar».
- **Forbruksrapport:** et kort sammendrag i tekst (Glimt/LLM, basert på tallene), nøkkeltall (brukt totalt, antall kjøp, snitt per kjøp, største kategori), topp kategorier med søyler, de største enkeltkjøpene, endring mot forrige periode og 2–3 konkrete råd. Kan lagres som PDF og deles.
- Tallene regnes alltid i backend (SQL). LLM-en skriver bare teksten rundt dem og finner ikke på tall.
- Jobbene lagres (`glimt_jobs`) og vises i lista til de slettes. Maks 2 samtidige jobber per bruker.

## PDF-rapport (ønske 2026-10-20: «lag en rapport som en pdf, en pen og oversiktlig pdf»)
Fasit: `Forbruksrapport.dc.html` (A4, 2 sider). Knappen **⇩ Last ned som PDF** står i den ferdige jobben.
- **Side 1:** topp med FinansHub-logo og «Laget av Glimt · dato kl.», tittel (måned), Glimt-sammendrag med orb, 4 nøkkeltall (Brukt med endring, Inn, Antall kjøp/snitt, Budsjett igjen), kategorier med søyler, og de siste 6 månedene som søylediagram (inneværende i rødt).
- **Side 2:** største kjøp (tabell), abonnementer med sum per måned, 3 konkrete forslag fra Glimt, og en kilde-notis.
- Generer på serveren (HTML-mal → PDF med headless Chromium/WeasyPrint), A4, innebygde fonter (Newsreader, Manrope, IBM Plex Mono). Filnavn `Forbruksrapport-2026-10.pdf`. Lagres på jobben og kan deles eller sendes på e-post.
