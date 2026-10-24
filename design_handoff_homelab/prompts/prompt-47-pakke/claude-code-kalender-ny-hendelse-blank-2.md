# Kalender: «+» gir fortsatt blank skjerm (oppfølging av prompt 46)

Skjermbilde: `uploads/Screenshot 2026-10-23 at 16.30.31.png` (iOS, åpnet fra FinansHub).

## Hva skjermbildet viser
- Skjermen er helt mørk (`#201F1D`, appens bakgrunnsfarge), uten tittel, felter eller knapper.
- **Tastaturet er oppe**, og iOS foreslår autofyll «mobil +47 957 21 859».
- Altså: skjemaet ER montert og et tekstfelt har fokus, men ingenting er synlig. Det er ikke et krasj (forrige instruks antok krasj). Fiksen fra prompt 46 traff derfor ikke.

## Sannsynlige årsaker (sjekk alle)
1. **Innholdet tegnes utenfor skjermen eller med 0 høyde.** Sheet/side med `Column`/`VStack` i `Expanded`/`Spacer` uten høydebegrensning, eller innhold skjøvet ned under tastaturet (`resizeToAvoidBottomInset`/`.ignoresSafeArea(.keyboard)` feil). Logg `size`/`frame` på skjema-roten når den vises.
2. **Inngangsanimasjon som aldri fullføres.** Opasitet/offset starter på 0 / utenfor skjerm og animasjonskontrolleren starter ikke (f.eks. avhenger av `onAppear`/`initState` som venter på kalenderlisten). Sett sluttverdi direkte hvis animasjonen ikke kjører.
3. **Tekst og flater i samme farge som bakgrunnen.** Mørk modus: tekstfarge/flatefarge hentet fra et tema som ikke er satt i den nye ruten (f.eks. `Theme.of(context)` utenfor `MaterialApp`-temaet, eller `.foregroundStyle` arvet som `#201F1D`). Test i lys modus – vises skjemaet der, er det dette.
4. **Feil rute/feil widget.** «+» åpner en tom placeholder-skjerm med bare et usynlig fokusert felt (f.eks. en gammel «hurtig-legg-til»-input) i stedet for Ny hendelse-skjemaet.

## Ekstra feil: autofyll foreslår telefonnummer
Tittelfeltet (eller feltet med autofokus) har feil innholdstype. Sett:
- iOS/SwiftUI: `.textContentType(nil)` / `.keyboardType(.default)`; UIKit: `textContentType = nil`.
- Flutter: `autofillHints: null`, `keyboardType: TextInputType.text`, `textCapitalization: sentences`.
- Web: `autocomplete="off"` på tittel.
Autofokus skal bare ligge på **Tittel**, og først etter at skjemaet er synlig (etter overgangen).

## Forventet resultat
Trykk «+» → Ny hendelse-skjema vises umiddelbart med: Tittel (fokus, vanlig tastatur), Glimt-forslag, dato/tid forhåndsutfylt fra valgt dag/tidsluke (ellers nå avrundet til neste hele time), standardkalender (Google), Lagre/Avbryt. Bakgrunn og tekst følger appens tema i både lys og mørk modus.

## Test
- Dag-, uke-, måned- og agenda-visning; med og uten valgt tidsluke.
- Kald start og etter at kalendere er lastet; lys og mørk modus.
- Release-bygg på iOS (inkl. åpnet via app-bytte fra FinansHub), Android/Fold, web, Mac.
- Legg til en enkel UI-test: trykk «+», forvent at teksten «Ny hendelse» og feltet «Tittel» er synlige (hit-testbare), ikke bare finnes i treet.
