# Bursdager: last opp bilde av personer uten bilde

Ønske 2026-10-20: «i bursdager la meg laste opp bilde av personer som ikek har bilde.»
Fasit: `Bursdager.dc.html`.

- Personer uten bilde viser initialer i relasjonsfargen + et lite «+»-merke nede til høyre på avataren.
- Åpne en person i lista → **«Last opp bilde»** (kamera-ikon) øverst i detaljene. Med bilde: **«Bytt bilde»** og **«Fjern bilde»**.
- Velg fra kamera eller bildebibliotek (iOS `PhotosPicker` + kamera, Android Photo Picker). Bildet beskjæres til kvadrat (midten), skaleres til 256×256, JPEG 82 %.
- Lagres på serveren: `POST /api/birthdays/{id}/photo` → `birthday_people.photo_url`. Synkes til alle enheter.
- Bildet brukes overalt der personen vises: lista, toppkortet, Hjem-kortet «Bursdager», widgetene og varselet («Emma har bursdag i dag» med bildet som vedlegg).
- Personer fra Google Kontakter: bruk kontaktbildet hvis det finnes. Eget opplastet bilde går foran.
- Personer som også er i Familie: tilby å bruke familiebildet («Bruk bildet fra Familie»).
- Toast: «Bilde lagt til for Emma».

## Kalendere fjernet fra Bursdager-siden (2026-10-20)
Ønske: «fjer fra bursdager fjern kalendere det ligger i innsligner det trenger ikkke være der.»
- Bursdager-siden (mobil, web, Mac) viser **ikke** lenger «Kalendere»-raden eller KALENDERE-seksjonen (Google Kalender / Home Assistant).
- Oppsettet finnes bare i **Innstillinger → Kalendere** (samme komponent med `calOnly`).
- «Åpne i Google Kalender» på en enkelt person og valget «Lagre i: Google Kalender / Home Assistant / Bare her» når du legger til, beholdes.
