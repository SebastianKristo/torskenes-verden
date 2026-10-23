# Kalender for Mac fryser (særlig ved trykk på widget)

Undersøk og rett rotårsaken:
- Trykk på widget åpner appen via URL/deep link. Sjekk at håndteringen ikke laster hele kalenderen synkront på main thread.
- Ikke kjør full synk ved hver deep link; vis cache umiddelbart og synk i bakgrunn (`Task.detached`/bakgrunnskø).
- Hindre dobbel åpning: hvis appen allerede er åpen, gjenbruk vinduet i stedet for å lage nytt.
- Sjekk WidgetKit-timeline: ikke reloadAllTimelines i løkke.
- Sjekk låser/deadlocks mellom EventKit og egen database.
- Profilér med Instruments (Time Profiler + Hangs) og legg ved funn.
- Akseptkriterium: 20 trykk på widget på rad uten frys; app svarer innen 300 ms.
