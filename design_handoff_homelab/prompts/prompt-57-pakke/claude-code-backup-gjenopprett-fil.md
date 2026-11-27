# Innstillinger → Backup: «Gjenopprett fra fil»

Design: `Backup Gjenopprett fra fil.dc.html` (alle steg og feiltilstander, lyst/mørkt, 1440 og 390 px).

## Hva funksjonen gjør
Admin kan laste opp en systembackup som ligger på PC-en (lastet ned tidligere fra Innstillinger → Backup → Last ned) og gjenopprette hele Homelab OS eller utvalgte moduler fra den.
Gjelder også en helt ny installasjon: installer → opprett admin → Innstillinger → Backup → Gjenopprett fra fil.

- Filtyper: `bk-ÅÅÅÅMMDD-TTMMSS-xxxxxx.tar.gz`, `.tar.zst`, og krypterte `….enc`.
- Bare admin, bare i nettleseren (web/PWA). Ikke i mobilappene.
- Gjenoppretting krever passordet på nytt, og serveren tar alltid en full sikkerhetskopi av dagens data først.
- Kryptert fil fra en annen server (eller ny installasjon) krever gjenopprettingsnøkkelen.

## Hvor den ligger
- Innstillinger → Backup, kortet «Backuper». Sekundærknapp ved siden av «Ta backup nå»: **«Gjenopprett fra fil …»** (ikon: pil opp i skuff).
- 390 px: knappene under kort-tittelen, full bredde, «Ta backup nå» først.
- Ny installasjon: lite kort på velkomstsiden: «Har du en backup? **Gjenopprett fra fil**» → samme flyt.

## Flyt (dialog 520 px på desktop, fullskjerm-ark på mobil)
1. **Velg fil** – stiplet slippsone «Slipp backupfila her eller velg fil», under: «.tar.gz, .tar.zst eller .enc · maks 20 GB». Dra over: aksentkant + svakt tonet bakgrunn, tekst «Slipp fila for å laste opp».
2. **Laster opp** – filnavn (mono), størrelse, fremdriftslinje, «12,4 MB/s · 2 min igjen», prosent. Avbryt.
3. **Sjekker fila** – spinner + «Sjekker at dette er en gyldig Homelab-backup …».
4. **Innhold** – «Backup fra 12. nov. 2026 kl. 03:00», meta (mono) «Versjon 4.71.0 · Hele systemet · 1,8 GB · Kryptert», moduler med avkrysning (alle valgt) og antall til høyre. Kryptert og ukjent nøkkel: gul boks + felt **Gjenopprettingsnøkkel** (mono, vis/skjul). Felt **Passord**. Rød advarsel. Knapper: Avbryt · **Gjenopprett** (destruktiv, deaktivert til passord er fylt ut).
5. **Gjenoppretter** – steg-liste med hake / spinner / tom ring. Ingen avbryt (footer: «Kan ikke avbrytes nå»).
6. **Ferdig** – grønn hake, «Gjenopprettet 6 moduler fra 12. nov. 2026.», lenke til sikkerhetskopien, knapp **Last inn på nytt**.

## Lista
- Opplastede backuper vises med merket **LASTET OPP** (dempet pille med kant), ved siden av AUTOMATISK / MANUELL / SIKKERHETSKOPI.
- Samme handlinger: Gjenopprett · Last ned · Slett.

## Feil (rød tekst med ikon under slippsonen, eller under feltet)
- «Dette er ikke en Homelab-backup.» (feil filtype / mangler manifest)
- «Fila er skadet eller ufullstendig.» (sjekksum)
- «Fila er for stor (maks 20 GB).»
- «Ikke nok ledig plass på serveren (trenger 3,6 GB, 1,2 GB ledig).» – sjekk før opplasting starter
- «Feil gjenopprettingsnøkkel.» (under nøkkelfeltet, rød kant)
- «Feil passord.» (under passordfeltet, rød kant)
- «En backup eller gjenoppretting pågår allerede. Prøv igjen om litt.»

## Teknisk
- Opplasting i biter (resumable, f.eks. tus eller 64 MB chunks) så 20 GB går gjennom proxy/Cloudflare-grenser.
- Valider manifest + sjekksum på serveren før innhold vises. Dekrypter med serverens nøkkel, ellers be om gjenopprettingsnøkkel.
- Lås: én backup/gjenoppretting om gangen.
- Gjenoppretting: ta sikkerhetskopi (merke SIKKERHETSKOPI) → gjenopprett valgte moduler → rapporter steg via SSE/WebSocket.
- Skjul knappen helt for ikke-admin og i iOS/Android-appene.

## Design
- Papir-tema og mørk modus, samme kort/knapper/felt som Innstillinger. Mono for filnavn, størrelser, versjon og tid.
- 390 px: arket er fullskjerm, knappene nederst i en klebrig linje.
