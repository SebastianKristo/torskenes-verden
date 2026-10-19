# Prompt 28 – start her (Claude Code)

Les `prompt-28.md` (brukerens ønsker ordrett). Fasit-designene ligger i `design/`. Åpne `design/Mobil Papir App.dc.html`, `design/Vaer.dc.html` og `design/Abonnement Legg til ark.dc.html` direkte i nettleseren.

Felles regel for alle oppgaver: alle farger hentes fra aktivt tema (`PAL[mode]` + valgt aksent). Mørk-tema-aksenten (`#f08a76` / `#FFB08A`) brukes **kun** i mørkt tema.

## Oppgaver (i anbefalt rekkefølge)

| # | Oppgave | Instruks | Fasit |
|---|---|---|---|
| 1 | Nye væranimasjoner i Apple-stil + ny sol som følger soloppgang/-nedgang. Tåke skal ikke bli hvit. | (se `design/Vaer.dc.html` → `WxFx`) | Vaer → Tweaks «Vær-animasjon» viser alle typer |
| 2 | Vær: bedre stedssøk (Strømstad m.fl.) + kart/meny-ikoner i bunnlinje | `claude-code-vaer-stedssok.md` | Vaer |
| 3 | Fargefeil på Kontoer og brukere (Legg til konto, Fjern bildet, hero-tekst) | `claude-code-konto-farger.md` | – |
| 4 | Nytt «Legg til abonnement»-ark (én grep-strek, Papir-farger, liste) | `claude-code-abo-ark.md` | Abonnement Legg til ark |
| 5 | Abonnement fra skjermbilde virker ikke – feilsøking og fiks | `claude-code-abo-skjermbilde-fiks.md` | – |
| 6 | Mer: hold inne → flytt/skjul, ingen skann-knapp, lenke til Subscription OS | `claude-code-mer-rekkefolge.md` | Mobil Papir App → Mer |
| 7 | Hjem: wiggle-modus som iOS (＋/✓-piller, minus øverst venstre, Papir-stil, piller kuttes ikke) – samme for alle wiggle-moduser | `claude-code-hjem-wiggle.md` | Mobil Papir App → hold inne på Hjem |
| 8 | Ruter-kortet på Hjem (ingen «Velg stopp», «Rediger widget» midt på i wiggle) + jevn åpne/lukke-animasjon på avganger | `claude-code-ruter-hjem.md` | Mobil Papir App → Hjem / Ruter |
| 9 | Chat: fjern lokal-tekst, trykk i chatten skjuler tastaturet | `claude-code-chat-tastatur.md` | Mobil Papir App → Chat |
| 10 | Chat: nytt «Legg ved»-ark | `claude-code-chat-legg-ved.md` | Mobil Papir App → Chat → + |
| 11 | Søk: 8 pt luft mellom tastatur og fanelinje | `claude-code-sok-tastatur.md` | – |

## Oppgave 1 i korthet (væranimasjoner)
- Én canvas bak innholdet. Lag: stjerner → sol → skyer → nedbør → tåke → lyn.
- **Sol:** posisjon fra dagens soloppgang/-nedgang (`sunF` 0–1). Hvit kjerne, myk glød, sakte roterende stråler, horisontal lysstripe, svake sekskantede linse-refleksjoner, lysstøv. Varm oransje når sola står lavt. Ingen regnbueringer.
- **Skyer:** forhåndstegnede sprites (lys topp, skygge under), flere dybdelag med ulik fart.
- **Regn:** 3 dybdelag + plask + dråper på «glasset» som glir ned. Torden: lyn med forgreninger og blink.
- **Snø:** 3 lag + store uskarpe nærflak.
- **Tåke:** grå bånd som driver sideveis, svak sol bak om dagen. Aldri hvit flate bak tekst.
- **Natt:** blinkende stjerner, glimt-kors på de klareste, svak melkevei, stjerneskudd.
- Parallakse fra gyroskop/mus (små forskyvninger per lag).
- `prefers-reduced-motion`: tegn ett statisk bilde. Pause når appen er i bakgrunnen.
- iOS: SpriteKit/Metal eller `TimelineView` + `Canvas`. Android: `Canvas` i Compose med `withFrameNanos`.

## Etter hver oppgave
- Test lyst og mørkt tema, iPhone og Android, og kontrast ≥ 4.5:1 på all tekst.
