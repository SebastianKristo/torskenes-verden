# Kalender: støtte for iPad

Fasit: `Kalender iPad.dc.html` (liggende, stående og Split View). Bred layout = `Kalender.dc.html` `variant="web" full` (samme som Mac/web). Smal layout = `Kalender App.dc.html` `platform="ios"`.

## App
- **Én universal-app** (iPhone + iPad), samme bundle-id og App Store-oppføring. Xcode: `TARGETED_DEVICE_FAMILY = "1,2"`. Ikke «Designed for iPhone»-modus.
- Støtt alle retninger på iPad (`UISupportedInterfaceOrientations~ipad`: portrait, upside-down, landscape left/right) og multitasking (ikke `UIRequiresFullScreen`). Stage Manager: vinduet kan endre størrelse fritt.
- Data, konto, synk, Glimt, varsler og widgets er de samme som på iPhone.

## Layout etter bredde (horizontal size class)
- **Regular (≥ 600 pt, f.eks. fullskjerm, Split View 1/2 og 2/3):** bred layout som Mac/web.
  - Sidepanel til venstre (minimåned, Mine kalendere med av/på og farge, Glimt-felt). Kan skjules med sidepanel-knappen; i stående er det skjult som standard og glir inn over innholdet.
  - Toppfelt: tittel (måned/uke), ‹ › , **I dag**, visningsvelger (År · Mnd · Uke · 3 d · Dag · Liste) og søk.
  - Standardvisning: **Uke** i liggende, **Måned** i stående.
  - Hendelse åpnes som **popover** ved blokken (liggende) eller ark i midten (`.formSheet`, stående). Ny hendelse samme.
- **Compact (< 600 pt, Split View 1/3, Slide Over):** iPhone-layouten (`Kalender App`) med ☰-sidemeny, Glimt-felt nederst og rød +.
- Bytt live når vinduet endrer størrelse. Behold valgt dato, visning og åpent ark.

## Statuslinje og safe area
- iPadOS-statuslinje 24 pt (klokke + dato til venstre, wifi/batteri til høyre). Toppfeltet får `safe-area-inset-top`.
- Hjemstrek nederst (ca. 20 pt). Glimt-felt og knapper over den.
- Tastatur: samme `visualViewport`/`keyboardWillShow`-teknikk som på iPhone. Med flytende/delt tastatur løftes ingenting.

## Berøring, tastatur og pekeplate
- Treffflater minst 44 pt. Dra hendelser for å flytte, dra kant for å endre tid (som Mac). Lang-trykk gir kontekstmeny (Rediger, Dupliser, Farge for fag, Slett).
- **Magic Keyboard / Smart Keyboard:** samme hurtigtaster som Mac/web (← → periode, T i dag, D/3/W/M/L visning, ⌘N ny hendelse, ⌘F søk, ⌘K Glimt). Vis dem i ⌘-hold-oversikten (`UIKeyCommand` med `discoverabilityTitle`).
- **Pekeplate/mus:** hover-effekt på blokker og knapper (`.hoverEffect()`), høyreklikk = kontekstmeny, pinch = zoom mellom visninger.
- **Apple Pencil:** Scribble i alle tekstfelt (Glimt-feltet, tittel, sted).
- **Dra og slipp** mellom apper: slipp tekst/e-post/SMS på kalenderen → Glimt tolker til hendelse på dagen man slapp på.

## Widgets
- iPad-hjemskjerm: liten, medium, stor og **ekstra stor** (samme som Mac-widgetene, `systemExtraLarge`). Låseskjerm-widgets som på iPhone.

## Mørkt tema
- Følger samme tokens som web/Mac (`kal_theme`) og iPhone-appens valg (System · Lys · Mørk). Statuslinje og hjemstrek følger `--ink`.

## Test
- iPad Pro 11″ og 13″, iPad Air, iPad mini (744 × 1133). Liggende og stående. Split View 1/3, 1/2, 2/3, Slide Over og Stage Manager. Med og uten Magic Keyboard.
