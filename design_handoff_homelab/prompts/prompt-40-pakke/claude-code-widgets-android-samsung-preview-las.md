# Widgets på Android og Samsung: forhåndsvisning i widgetvelgeren + flere låseskjerm-widgets

Ønske 2026-10-20: «Når jeg legger til widgets på android og samsung vil jeg ha preview av widget. jeg vil også ha flere widgets for lås skjerm på samsung og android.»
Fasit: `Widgets Android Samsung.dc.html` (1a Android-velger, 1b Samsung-velger, 1c Android-låseskjerm, 1d Samsung-låseskjerm).

## Widgetkatalog (Papir)
| Widget | Størrelser | Låseskjerm |
|---|---|---|
| Vær | 2×2, 4×2 | liten (6°) |
| Neste time (Kalender) | 4×2, 2×2 | bred |
| Gjøremål | 4×2, 2×2 | liten (antall) + bred |
| Avganger (Ruter) | 2×2, 4×2 | liten (6m) + bred |
| Pakker (Sporing) | 2×2 | liten + bred |
| Budsjett | 2×2 | liten (ring %) |
| Prøveperioder | 2×2 | liten (dager) |
| Glimt brief | 4×2 | bred |
| Dagens bibelvers (bare brukere med modulen) | 4×2 | bred |

## 1. Forhåndsvisning i widgetvelgeren
**Mål:** i velgeren ser hver widget ut som den vil se ut etterpå, med ekte innhold, i riktig størrelse og med brukerens farger. Aldri app-ikonet eller et grått bilde.

### Android (alle, Pixel/Material You)
- **Android 15+ (API 35): genererte forhåndsvisninger.** Når data endres (maks ~2 ganger i timen), kall `AppWidgetManager.setWidgetPreview(provider, WIDGET_CATEGORY_HOME_SCREEN or WIDGET_CATEGORY_KEYGUARD, remoteViews)` med samme layout som widgeten, fylt med siste data. Med Glance: overstyr `providePreview()` i `GlanceAppWidget` (Glance 1.2+).
- **Android 12–14:** `android:previewLayout="@layout/widget_xxx_preview"` i `appwidget-provider`-XML (skalerbar ekte layout med eksempeltekst, ikke bilde) + `android:description` + `targetCellWidth/Height`.
- **Eldre:** `android:previewImage` (PNG generert fra designet, lys og mørk variant).
- Hver widget har `android:label` («Neste time»), `android:description` («Neste hendelser fra Kalender») og standardstørrelse, så velgeren viser «Neste time · 4 × 2 · Neste hendelser fra Kalender».
- Dynamiske farger (`@android:color/system_accent1_*`) i både widget og preview, så preview følger bakgrunnsbildet.

### Samsung (One UI)
- One UI bruker de samme Android-feltene. Sørg for at preview finnes for **hver størrelse** (Samsung viser en karusell med prikker per widget/størrelse og en blå «Legg til»-knapp).
- Bruk `previewLayout` (ikke bare bilde) så forhåndsvisningen skaleres skarpt i Samsungs store forhåndsvisning.
- Hvit glassbakgrunn (One UI-stil, radius 22–26) i Samsung-varianten; følger systemets lys/mørk.

### Velgeren i designet
- 1a: Papir ekspandert med alle widgets som ekte forhåndsvisninger (brede over to kolonner). Trykk velger (rød ramme) → «Legg til «Neste time» · 4 × 2». Hold inne for å plassere selv. Søk filtrerer.
- 1b: Papir-kortet viser første widget som forhåndsvisning. Trykk åpner arket: stor forhåndsvisning på bakgrunn, ‹ ›/sveip mellom widgets, prikker, navn + størrelse + beskrivelse, «Legg til» → «✓ Lagt til».

## 2. Flere widgets på låseskjermen
### Android (Pixel, Android 16 QPR2+)
- Låseskjerm-widgets ligger på en egen side man sveiper inn fra høyre kant. Alle Papir-widgets som gir mening uten å låse opp får `android:widgetCategory="home_screen|keyguard"`.
- Låseskjerm-varianten: mørk tonet flate, større tall, ingen knapper som krever opplåsing. Trykk ber om opplåsing og åpner riktig side.
- Personvern: innstillingen «Skjul beløp og navn på låseskjermen» (standard på for Budsjett og Pakker). Da vises «•••» til telefonen er låst opp.
- 1c viser siden med Vær, Avganger, Neste time og Gjøremål, og «+ Legg til widget» med liste over låseskjerm-widgets med forhåndsvisning og hake.

### Samsung (One UI 7/8)
- Låseskjerm-widgets under klokka: **små 1×1** (runde) og **brede 4×1**. Maks 4 små, eller 2 brede, eller 2 små + 1 bred.
- Små: Vær 6°, Gjøremål 3, Pakker 1, Budsjett 77 % (ring), Avgang 6m, Prøveperiode 3d.
- Brede: Neste time, Avganger, Gjøremål, Pakker, Glimt brief, Dagens bibelvers.
- Monokrom hvit tekst/ikon på frostet glass (`rgba(255,255,255,.18)` + blur), følger Samsungs låseskjermfarge.
- Støtte: registrer widgetene med `keyguard`-kategori og Samsung-størrelsene; der One UI-versjonen ikke støtter tredjeparts låseskjerm-widgets, vis bred variant i Always On Display/Now Bar via varsel-/Live Update-API i stedet, og skjul valget i appen.
- 1d viser låseskjermen og redigeringsarket «Papir på låseskjermen» med små og brede valg (blå ramme = valgt, «Fullt» når det ikke er plass).

## Felles
- Data oppdateres via WorkManager (15 min) + push ved endring (ny pakke, ny time, forfalt gjøremål). Låseskjerm-widgets bruker samme data som startskjermen.
- Bibelvers-widgeten finnes bare for brukere med Bibel-modulen (`user_features`).
- Test: legg til hver widget fra velgeren på Pixel (Android 14, 15, 16) og Samsung (One UI 6, 7, 8): forhåndsvisningen skal vise ekte innhold og riktig størrelse.
