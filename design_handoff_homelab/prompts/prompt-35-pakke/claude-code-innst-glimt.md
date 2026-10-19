# Innstillinger → ny seksjon **GLIMT**

Fasit:
- `Innstillinger Web.dc.html`: ny gruppe **GLIMT** i sidemenyen (over TILKOBLINGER) med siden **Glimt** («Figur, brief, stemme og venner», rødt stjerneikon).
- `Mobil Papir App.dc.html` → Innstillinger: ny gruppe **GLIMT** → «Glimt ›» åpner fullskjerm med **Ferdig**.
- Innholdet er felles: `Glimt Brief.dc.html` med `mode="settings"`, som leser og skriver samme `glimt_brief_cfg` / `glimt_char` som ⚙ i briefen.

## Innhold (i rekkefølge)
1. **GLIMT-FIGUR:** rutenett med alle 13 figurer (Glimt, Halo, Boble, Antenne, Bane, Pastell, Natt, Sky, Dråpe, Ugle, Stjerne, Spire, Gris), med animerte figurer. Valgt har rød ramme og er glad. Trykk velger og sier «Hei! Nå er jeg din Glimt.» (Gris: «Nøff!»). Valget brukes som vert overalt. Er «Glimt» valgt, blir verten automatisk Glimt Natt mellom 21 og 06.
2. **Brytere:** Glimt-brief · Les opp · Vis meg rundt automatisk · Venner av Glimt · Varsel når briefen er klar.
3. **BRIEFER GJENNOM DAGEN:** Morgen, Dag, Kveld og Natt, hver med klokkeslett og av/på.
4. **STEMMEMOTOR:** OpenAI (anbefalt) · ElevenLabs · Azure nb-NO · Nettleser, med nøkkelfelt og «Hent nøkkel ↗».
5. **STEMME:** Nora · Henrik · Lys med «▶ Hør». **Tempo:** Rolig · Normal · Rask.
6. Knapp: «Modeller, nøkler og forbruk ligger under AI ›».

## Søk
Innstillingssøket kjenner «glimt», «brief», «stemme» og «figur» og går rett til Glimt-siden (med markering, se `claude-code-innst-ai-sok-highlight.md`).

## Ellers
- ⚙ i briefen og Innstillinger → Glimt er **samme data**. Endringer vises begge steder med en gang, og synkes via profilen (`PUT /api/glimt/settings`).
- Nøkler som legges inn her lagres i appen på serveren (samme sted som AI-kontroll → API og nøkler), ikke i nettleseren.
