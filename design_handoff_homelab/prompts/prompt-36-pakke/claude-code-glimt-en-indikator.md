# Glimt: bare ÉN «tenker»-visning om gangen

Ønske 2026-10-19: «det er ikke nødvendig med to glimt tanker. akkurat når det er spørsmål som det vis den under søkebaren, men vis det er mer beskjeder som opplastning av lege eller frisør time og slike ting vis glimt pillen.» Vedlegg: `uploads/Screenshot 2026-10-19 at 22.14.14.png`. Der vises både Glimt-pillen øverst («Glimt tenker … ⌄») og kortet under søkefeltet («Tenker på «Frisør time» …») samtidig.

## Regel
Klassifiser hver innsending fra søkefeltet på Hjem (og i Kalender, Finans og andre steder med Glimt-søk) **før** visning:

| Type | Eksempler | Visning |
|---|---|---|
| **Spørsmål** (svar skal leses) | «Når er neste frisørtime?», «Hva blir været i New York?», «Hvor mye brukte jeg på mat?» | **Bare kortet under søkefeltet**: «Tenker på «…» …» → svar med **Åpne ›**. **Ingen pille.** |
| **Handling/beskjed** (noe skal gjøres i bakgrunnen) | «Frisør time hos Nina 14.30 25.10», lim inn SMS fra legekontoret, last opp kvittering eller skjermbilde, «påminn meg om å avslutte prøveperioden», «legg til melk» | **Bare Glimt-pillen øverst** (dynamisk pille / live activity): «Legger til i kalenderen …» → «✓ Lagt til · Frisør · fre 25.10 14:30» med **Angre**. **Ikke** noe kort under søkefeltet. Søkefeltet tømmes med en gang. |

- Klassifisering:
  1. Lokale regler først. Dato/klokkeslett + sted/person uten spørreord, vedlegg, eller verbene «legg til / påminn / lagre / last opp / avbestill» → **handling**. Spørreord («hva, når, hvor, hvor mye, hvem, hvordan»), «?», eller tema som vær, kalender eller saldo uten handlingsverb → **spørsmål**.
  2. Er det uklart, avgjør LLM-en med et kort klassifiseringskall (`{"type":"question"|"action"}`, maks 300 ms). Til svaret kommer, vises bare kortet under søkefeltet i «tenker»-tilstand, og ved «action» flyttes det til pillen med en glidende animasjon.
- Aldri begge samtidig. Pillen og kortet bruker samme jobb-id. Hvis en jobb vises i kortet, skal den ikke også publiseres til pillen (`jobs.publish({surface:'inline'|'pill'})`).
- Går man ut av appen mens et **spørsmål** tenker, fortsetter jobben, og svaret kommer som push (som før). Pillen vises ikke.
- **Handlinger** vises i pillen også når man bytter fane. Trykk på pillen åpner jobbdetaljer (som før).
- Kortet under søkefeltet forsvinner når søkefeltet tømmes eller man trykker utenfor (etter at svaret er lest).
- Gjelder mobil og web.

## Akseptkriterier
- [ ] «Når er neste frisørtime?» → bare kortet under søket, ingen pille.
- [ ] «Frisør time hos Nina 14.30 25.10» → bare pillen øverst, ingen kort, og avtalen havner i kalenderen.
- [ ] Opplastet kvittering → bare pillen («Leser kvitteringen …» → «✓ 3 varer · 249 kr»).


## FEIL 2026-10-19: spørsmål med dato blir tolket som kalenderavtale
Vedlegg: `uploads/Screenshot 2026-10-19 at 22.28.33.png` (web): «spørsmål, hvor mange timer med dagslys er det den 29.06.2027» → mørkt forslag «Legg i kalender · tir 29. jun». Det skulle besvart spørsmålet.
Årsak: dato funnet + intensjonsord («time» i «timer», eller et nøkkelord i `QK`) gir avtale, uten å sjekke om det er et spørsmål.
Fiks (fasit: `Mobil Papir App.dc.html` → `hsVals()` `isQ`):
1. **Spørsmålsvakt før avtale-tolkning.** Teksten er et **spørsmål** hvis den inneholder `?`, **starter** med spørsmål/hva/hvor/hvem/hvilken/hvordan/hvorfor/når/kan du/vet du/fortell (eller engelsk what/when/where/how/who/why), eller inneholder «hvor mange / hvor mye / hvor lenge / hvor langt / hva er / hva blir / når går / når er / hvordan blir». Unntak: eksplisitt «legg til / book / bestill / påminn» gir fortsatt handling.
2. Er det et spørsmål, gjelder dette:
   - **Ingen** «Legg i kalender»-forslag.
   - Glimt svarer i kortet under søkefeltet (jf. regelen over).
   - Datoen sendes med som kontekst.
3. **Intensjonsord må matche hele ord:** `\b(time|timen|timeavtale|avtale)\b`. «timer», «timeplan» og «sommertid» teller ikke.
4. **Dagslys og sol:** spørsmål om dagslys, soloppgang eller solnedgang for en dato besvares lokalt (NOAA/suncalc for valgt sted). Eksempel: «29. juni 2027 i Oslo: soloppgang 03:54, solnedgang 22:44, 18 t 50 min dagslys.» Kortet har **Åpne Vær ›**.
5. Test: denne setningen, «når er neste frisørtime?», «hva skjer 25.10?» (svar, ikke avtale), «frisør 14.30 25.10» (avtale), «legg til tannlege 12.11 kl 9» (avtale).
