# Kalender: velg oppsett for iPad og Fold i onboarding

Ønske 2026-10-21: «Lag også eget oppset jeg kan velge mellom på onboarding på kalenes app for iPad og fold, et som tar bruk av skjermen.»
Fasit: `Kalender Oppsett Stor Skjerm.dc.html` (1a iPad liggende, 1b Galaxy Z Fold utbrettet). Innstilling: `Kalender App.dc.html` → Innstillinger → Generelt → **Oppsett på iPad og Fold** (Telefon · Delt · Full skjerm, `wideLay`, standard `full`).

## Når steget vises
- Etter innlogging (steg 1 «Velkommen til Kalender»), som **steg 2 av 2**, bare når vinduet er minst 600 pt/dp bredt (iPad, Fold utbrettet, Android-nettbrett). På telefon hoppes det over.
- Vises én gang per enhet. Valget lagres per enhet (`kal_wide_layout`), ikke synket, fordi iPad og Fold kan ønske forskjellig.

## Skjermen
- «STEG 2 AV 2», tittel **Hvordan vil du bruke skjermen?**, undertekst «Du kan bytte når som helst i Innstillinger».
- Tre store kort side om side (fyller bredden), hvert med en skjematisk forhåndsvisning, navn og én setning. Valgt kort: svart kant, skygge og ✓.
  1. **Som på telefonen**: én visning om gangen, faner nederst. Stor tekst.
  2. **Delt**: sidepanel (minikalender, kalendere, i dag) + valgt visning til høyre.
  3. **Full skjerm** (**Anbefalt**, forhåndsvalgt): sidepanel 22 %, måned i midten, dagen med tidslinje til høyre 28 %. Alt på én skjerm, ingen faner nederst.
- **Fortsett med <valg>** (52 pt, svart). Under: «Kan endres i Innstillinger → Generelt → Oppsett på iPad og Fold».

## Oppførsel per oppsett
- **Full skjerm:** trykk på en dag i måneden oppdaterer dagspanelet til høyre (ingen navigasjon). Uke/3 dager/Dag-visning tar midten + høyre sammen. iPad: `NavigationSplitView` med tre kolonner. Android: `ListDetailPaneScaffold` / to `Row`-ruter + sidepanel.
- **Delt:** `NavigationSplitView` med to kolonner / sidepanel + innhold.
- **Telefon:** samme som iPhone/telefon, sentrert med maks-bredde 700 pt.
- Fold i bordmodus (halvbrettet): Full skjerm blir måned øverst og dag nederst, delt på hengselen. Portrett smalere enn 600 dp: faller tilbake til Telefon uten å endre valget.

## Test
- Ny innlogging på iPad → steg 2 vises → velg Delt → appen åpner i Delt. Innstillinger → bytt til Full skjerm → endres med en gang.
- Fold: brett ut under onboarding → steg 2 vises. Brett sammen → telefonoppsett, valget beholdes.
- iPhone: steg 2 vises ikke.


## Lagt inn i onboardingen (2026-10-21)
Ønske: «legg de i inboardingen.» (vedlegg `uploads/Screenshot 2026-10-21 at 11.00.57.png`)
Fasit: `Kalender App.dc.html` → `auVals()` (`st:'lay'`) · vist i `Kalender iPad.dc.html` → «iPad onboarding» (1180 × 820, trykk «Fortsett som Sebastian»).
- Etter innlogging måles bredden på onboarding-flaten. **≥ 600 pt/dp → steg 2 av 2** med de tre kortene (Som på telefonen · Delt · Full skjerm, Full skjerm forhåndsvalgt og «Anbefalt»). Under 600 → rett inn i appen som før.
- «Fortsett med <valg>» lagrer `kal_wide_layout` og samme verdi i Innstillinger → Generelt → Oppsett på iPad og Fold. «Hopp over · bruk Full skjerm» går rett inn.
- Steget vises én gang per enhet (etter første innlogging), og igjen etter Logg ut.
