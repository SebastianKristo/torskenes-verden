# Web: ny fane skal alltid starte øverst (Mat starter på bunnen)

Ønske 2026-10-24: «når jeg åpner mat tab på web starter jeg alltid på bunnen.»

## Årsak
Ved fanebytte beholdes rulleposisjonen til forrige fane. Mat (Matplan) lastes inn etter fanebyttet og er kortere enn plassholderen og f.eks. Dashboard, så nettleseren klemmer posisjonen til bunnen av Mat-siden.

## Fiks (alle faner, ikke bare Mat)
- Ved bytte av fane/rute: `window.scrollTo(0, 0)` etter at ny side er rendret, og igjen etter at lat innlastede deler (Matplan, Media, Kart) er montert.
- Sett `history.scrollRestoration = 'manual'` og husk heller posisjon per fane selv hvis brukeren går «tilbake» i nettleseren (gjenopprett bare ved tilbake/frem, aldri ved klikk på fanen).
- I React Router/Next: bruk `ScrollRestoration` / `scroll={true}` slik at klikk på fane går til toppen.
- Ingen `autoFocus` på felt nederst i Mat (f.eks. «legg til vare»/chat-felt) som kan dra siden ned.

## Test
Scroll helt ned på Dashboard → klikk Mat → Mat vises øverst. Samme for alle andre faner. Tilbake-knappen i nettleseren gjenoppretter forrige posisjon.
