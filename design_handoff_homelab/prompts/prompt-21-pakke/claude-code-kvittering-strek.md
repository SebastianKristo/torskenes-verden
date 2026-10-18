# Til Claude Code: Strek over køen i Kvitteringer stikker ut (iOS)

## Symptom
Under etiketten «KØ» på Kvitteringer-siden går en tynn horisontal strek helt fra kant til kant over kortet. Kortet under har avrundede hjørner, så streken stikker ut forbi hjørnene på begge sider og ser feilplassert ut. Under «TIL GJENNOMGANG» står det ingen slik strek.

## Årsak (sannsynlig)
Det er brukt en `border-top` (eller en `Divider`) på selve listen, eller en `border-bottom` på seksjonsoverskriften, ikke inne i kortet. Det er bare skillelinjene *mellom* radene som skal være der.

## Fiks
1. Fjern streken over første rad i KØ-listen. Ingen `border-top`/`Divider` før første element, og ingen `border-bottom` på seksjonsetiketten.
2. Skillelinjer bare mellom rader: `border-top: 1px solid var(--line)` på rad 2 og utover (`:not(:first-child)` / `index > 0`). Kortet har `overflow: hidden` og `border-radius: 20px`, så linjene klippes riktig.
3. KØ og TIL GJENNOMGANG skal bygges med samme komponent (`SectionLabel` + `Card` med rader), så de ser like ut.
4. Gjelder iOS, Android og Fold. Sjekk også andre lister med seksjonsetikett (Sporing, Huskeliste, Innstillinger) for samme feil.

## Test
Kvitteringer med 3 elementer i køen: ingen strek over første kort, ingen strek utenfor de avrundede hjørnene, skillelinjene mellom radene går fra kant til kant inne i kortet.
