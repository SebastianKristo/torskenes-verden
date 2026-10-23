# Gjøremål: «Fullfør oppgaven» i infosiden lukker siden

Ønske 2026-10-23: «når jeg har åpnet en gjøremål i gjøremål og trykker oppgaven er fullført bør den oppgaven lukke seg.»
Fasit: `Huskeliste.dc.html` → `toggle` i infosiden (`vw`). Gjelder `claude-code-gjoremal-infoside.md`.

- Trykk **Fullfør oppgaven** i infosiden → haken animeres og tittelen strykes over (som i dag), haptikk (suksess), og etter **450 ms lukkes infosiden** automatisk tilbake til listen.
- I listen glir oppgaven ned til «Fullført» med en kort toast nederst: «Fullført: Kjøpe melk · **Angre**» (5 s). Angre setter den tilbake som ikke fullført.
- **Angre fullført** (når en fullført oppgave åpnes) lukker **ikke** siden.
- Store skjermer (Fold, iPad, web): detaljpanelet til høyre glir ut på samme måte.
- Har oppgaven deloppgaver som ikke er ferdige: spør først i et lite ark: «2 deloppgaver er ikke ferdige. Fullfør alle?» **Fullfør alle** · **Avbryt**. Deretter lukkes siden.
- Gjentakende oppgave: neste forekomst lages som før, og toasten sier «Fullført · neste fre 30. okt».
