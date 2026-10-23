# Innstillinger → Helse → Home Assistant: rydd opp

Skjermbilde av før: `uploads/Screenshot 2026-10-23 at 10.05.54.png`. Fasit: `Helse Home Assistant.dc.html`. Utvider `claude-code-helse-fra-home-assistant.md`.

## Feil i dag
- Siden viser **alle 56 HA-enheter** (Aqara-brytere, rullegardiner, bevegelsessensorer …). Den skal bare vise enheter fra integrasjonen `mobile_app`.
- Toppen bruker skybilde, og ingressen går ut over bildekanten, slik at teksten blir uleselig (grå tekst på grått bilde).
- Hvert kort sier «Ingen helsesensorer» to ganger.

## Filtrering
- Hent enheter via WS `config/device_registry/list` og behold bare enheter der `config_entries` peker på en entry med `domain == "mobile_app"`.
- Segmentkontroll: **Telefoner** (standard, skjuler nettbrett: modell inneholder iPad/Tab) · **Alle mobilapp**.
- Under listen: «50 andre enheter fra Home Assistant (brytere, sensorer, rullegardiner) vises ikke her. De har ingen helsedata.»

## Topp
- Ingen bakgrunnsbilde. Papir-bakgrunn `#f3efe6`, «‹ Alle innstillinger» som lys pille med kant, avatar til høyre.
- «Helse fra mobilappen» (Newsreader kursiv 16, `#6b665c`) → «Home Assistant» (Newsreader 36) → én kort ingress (14 px, `#6b665c`).
- Statuskort: grønn prikk «Tilkoblet», HA-adresse, «4 av 6 koblet».

## Liste
- Gruppert per person (overskrift i personens farge, f.eks. «RUNE · 2»), med «IKKE KOBLET» sist.
- Rad: ikon (telefon/nettbrett, grønt for Android, blått for iPhone), navn, pille «6 helsesensorer» (grønn) eller «Ingen helsesensorer» (grå, raden nedtonet), OS-navn.
- Til høyre en personvelger-knapp (avatar + navn ▾, eller «+ Velg»).
- Når en person er valgt: sensorene som chips med hake (forhåndsvalgt skritt, puls, hvilepuls, søvn, kalorier, aktivitet). iPhone får linjen «Begrenset på iPhone …».

## Velg person
- Bunnark «Hvem bruker telefonen?» med enhetsnavn, rutenett av familieavatarer (56 px) + «Ingen». Valgt person har ring.
- «✦ Foreslått ut fra navnet: Rune».

## Lagre
- Fast «Lagre»-knapp nederst (blir «✓ Lagret»).
