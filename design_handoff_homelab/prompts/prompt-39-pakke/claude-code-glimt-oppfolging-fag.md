# Glimt: oppfølgingsspørsmål og fagforklaring

## Problem
- «hva slags timer har jeg i dag» → «Først ut: test.»
- Oppfølging «hva slags fag er det» → generisk hjelpetekst + «Glimt fikk ikke svar: tidsavbrudd etter 12 s».
- Glimt husker ikke forrige svar, og vet ikke hva fagene er.

## Ønsket oppførsel
1. **Samtalehukommelse**: lagre hendelsene fra forrige svar (`ctx`). Oppfølging som «hva slags fag er det», «hva er det», «forklar», «fortell mer» bruker `ctx` (Studie-hendelser). Mangler `ctx`: bruk dagens Studie-hendelser.
2. **Fagnavn + forklaring**: svar f.eks. «Det er fysikk kl. 08.15. Fysikk er naturvitenskapen om materie, energi, bevegelse og krefter …»
   - Flere timer: «I dag har du fysikk kl. 08.15 og matematikk kl. 10.00.» + forklaring av første.
   - Ukjent tittel (f.eks. «test»): «Jeg vet ikke hvilket fag «test» er. Gi hendelsen et fagnavn, så kan jeg forklare.»
3. **Direkte spørsmål** «hva er fysikk» / «hva lærer man i kjemi»: forklaring + «Neste gang du har det er …».
4. **«hva slags timer har jeg [dag]»**: list Studie-hendelser den dagen med fagnavn og klokkeslett.

## Lokal fallback (alltid tilgjengelig)
Fagordbok (regex → navn → 1–2 setninger): fysikk, matematikk (R1/R2/S1/S2/1T/1P), kjemi, biologi, IN2010 (algoritmer og datastrukturer), informatikk/INxxxx, norsk, engelsk, historie, samfunnsfag, geografi, KRLE/religion, kroppsøving, fremmedspråk, økonomi. Se `ask()` i `Kalender App.dc.html` (blokken med `FX`, `fagOf`, `fu`) for referanse.

## Server-LLM
- Send med: siste 6 meldinger + `ctx`-hendelser + dagens/ukens hendelser (tittel, tid, kalender, sted) i systemprompten.
- Systemprompt: «Du er Glimt, kalender-assistent. Svar kort på norsk. Du kan forklare fag og begreper generelt, ikke bare kalenderdata. Oppfølgingsspørsmål viser til forrige svar.»
- Tidsavbrudd: strøm svaret (første token innen 12 s, totalt 45 s). Ved tidsavbrudd: vis lokalt svar fra fallback **uten** rød feilmelding når lokalt svar finnes; vis feil bare hvis heller ikke lokal fallback har svar.
- Ikke vis generisk hjelpetekst («Jeg kan svare på ting som …») når spørsmålet er en oppfølging med `ctx`.

## Test
1. «hva slags timer har jeg i dag» → liste med fag.
2. «hva slags fag er det» → fagnavn + forklaring.
3. «hva er fysikk» → forklaring + neste fysikktime.
4. Server av → samme svar lokalt, ingen rød feil.
