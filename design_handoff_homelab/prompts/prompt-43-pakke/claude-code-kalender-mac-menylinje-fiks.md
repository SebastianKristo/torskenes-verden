# FEIL: menylinje-kalenderen på Mac reagerer ikke på klikk

Ønske 2026-10-21: «og denne menyen på mac funker ikke, den vises men skjer ikke noe når jeg klikker på den.» (vedlegg `uploads/Screenshot 2026-10-21 at 11.01.17.png`)
Fasit: `Kalender Mac.dc.html` → menylinja (dato-knappen oppe til høyre) og app-menyen «Kalender».

## Alt i menyen skal virke
- **Datoer:** klikk velger dagen. Tittelen blir «Fredag 24. oktober», uke-nummeret følger, og lista under viser den dagens hendelser. I dag har rød sirkel; valgt dag har svart ring. Lukk og åpne → tilbake til i dag.
- **Hendelser:** hele raden er klikkbar (hover-bakgrunn). Klikk → menyen lukkes, Kalender-vinduet kommer fram med hendelsen åpen.
- **Ingen hendelser:** «Ingen hendelser i morgen.»
- **Glimt-feltet:** skriv «Middag med Ingrid 18:30» → Enter eller + → hendelsen legges til på valgt dag med klokkeslett, og vises med en gang i lista (toast «✦ La til «Middag med Ingrid» i dag 18:30»). Spørsmål («når er tannlegen?») svares i menyen.
- **Åpne Kalender ⌘0:** viser og fokuserer hovedvinduet. **Innstillinger … ⌘,:** åpner Innstillinger-vinduet.
- Klikk utenfor eller Esc lukker menyen.

## App-menyen «Kalender»
Om Kalender (eget lite vindu med versjon) · Se etter oppdateringer … (Innstillinger → Oppdateringer) · Innstillinger … ⌘, · Skjul ⌘H · Avslutt ⌘Q (menylinja og varsler fortsetter hvis «Start ved innlogging» er på).

## Innstillinger-vindu (ny)
Faner **Generelt · Kontoer · Oppdateringer** i Mac-stil.
- Generelt: Vis neste hendelse i menylinjen · Start ved innlogging (`SMAppService.mainApp`) · Varsler · Glimt i menylinjen.
- Kontoer: Google, iCloud, Home Assistant, Homelab-server med status.
- Oppdateringer: `Kalender Oppdatering` (se `claude-code-kalender-oppdater-i-appen.md`).

## Sannsynlig årsak i appen
Menyen er en `NSPopover`/`MenuBarExtra(.window)` der innholdet er tegnet, men knappene ligger i en `NSHostingView` uten `acceptsFirstMouse`, eller popoveren vises som `.transient` uten at appen blir aktiv. Første klikk aktiverer da bare vinduet.
- Bruk `MenuBarExtra(... ) { ... }.menuBarExtraStyle(.window)` med vanlige SwiftUI `Button` (ikke `onTapGesture` på `Text`).
- Hvis egen `NSPopover`: `NSApp.activate(ignoringOtherApps: true)` før `show`, og en `NSHostingView`-subklasse med `override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }`.
- `TextField` i popoveren må få fokus: `popover.contentViewController?.view.window?.makeKey()`.

## Test
Klikk 24 → fredag vises · klikk Tannlege → hovedvinduet åpnes på Tannlege · skriv «Trening 19» + Enter → i lista · ⌘0 og ⌘, virker · Kalender → Se etter oppdateringer … åpner Oppdateringer.
