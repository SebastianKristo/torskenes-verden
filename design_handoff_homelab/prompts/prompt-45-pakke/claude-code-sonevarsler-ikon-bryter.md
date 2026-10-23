# Sonevarsler: soneikon i varselet + bryter for å skru av

Fasit: `Sone Varsler.dc.html` (1a iPhone, 1b Android, 1c innstillinger). Gjelder `Familie.dc.html` → Soner.

## Bryter
- **I appen: Familie → Soner, øverst:** kort «Posisjonsvarsler» med hovedbryter + **bryter per person** (Ingrid, Pål, Kari med bilde/initialer). Fasit: `Familie.dc.html`.
- Hovedbryter av → ingen varsler, personbryterne grå. Person av → ingen varsler om den personen i noen sone.
- Lenke «Vis eksempel på varsel» viser banneret.
- Samme valg speiles i Innstillinger → Varsler → Familie.
- Varselbanneret i appen (når appen er åpen) ser ut som iOS-varselet: soneikon i sonefarge, lite app-merke, tittel = sone, tekst = hendelse. Fasit for systemvarsel: `Sone Varsler.dc.html`.
- Innstillinger → Varsler → Familie → **Sonevarsler**: hovedbryter «Varsle når noen kommer eller går» + bryter per sone (med soneikon og farge).
- Hovedbryter av → ingen sonevarsler sendes, og per sone-bryterne blir grå. Sonene, kartet og «Siste hendelser» virker som før.
- Den eksisterende varselvelgeren per person på hver sone (`z.nt`) gjelder fortsatt når bryterne er på.
- Lagres per bruker på serveren.

## Ikon i varselet
- Varselet viser **sonens ikon i sonens farge** der FinansHub-logoen står i dag. Tittel = sonenavn, tekst = «Ingrid forlot Hjem».
- **iOS:** bruk Communication Notifications (`INSendMessageIntent` med `INImage` av soneikonet, rendret som PNG 40 × 40 pt med farget bakgrunn, radius 11). Da viser iOS soneikonet stort og appikonet som et lite merke i hjørnet. Krever capability «Communication Notifications» og en Notification Service Extension som donerer intensjonen.
- **Android:** `setSmallIcon` = soneikonet (monokromt), `setLargeIcon` = soneikonet på farget sirkel, `setColor` = sonens farge. Egen kanal «Sonevarsler», så brukeren også kan skru den av i systeminnstillingene.
- **Web/Mac:** `icon` = rendret soneikon (PNG), `badge` = app-merke.
- Egendefinert ikon fra ikonsøket (Iconify) rendres også til PNG på serveren.
