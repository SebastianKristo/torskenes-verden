# Fold/iPad: Gjøremål bruker det nye storskjerm-designet

Fasit: `Huskeliste.dc.html` med `mode="web"` (brukt i `Mobil Papir App.dc.html` når `wide`) + `Stor Skjerm Oppsett.dc.html` → **1c** (Fold) / **1a** (iPad).

- Fold og iPad skal **ikke** vise telefonversjonen av Gjøremål. De bruker samme storskjermvisning som web:
  - Navbar til venstre (fra Hjem, se `claude-code-gjoremal-fold-navbar-glimt.md`).
  - Listekolonne: Fold 210 px / iPad 250 px («Gjøremål», listene med antall, «+ Ny liste» sist).
  - Oppgavene fyller resten: filterpiller (I dag · I morgen · Neste uke · Uten dato), personvelger, seksjoner «I dag og forfalt», «Senere» osv., Glimt-tips.
  - Trykk på en oppgave → **detaljpanelet glir inn fra høyre** (delt topplinje med samme høyde som listen). ✕ eller trykk utenfor lukker.
- «Ny oppgave»-feltet + Glimt-knappen nederst i oppgavekolonnen (ikke en fast bunnlinje over hele skjermen).
- Ingen bakgrunnsbilde i toppen (se `claude-code-gjoremal-uten-bakgrunn.md`).
- Bytt til telefonvisning når vinduet er smalere enn 700 pt/dp (Split View, Fold lukket).
- Samme `LayoutMode` som resten av appen (se `claude-code-ipad-brettoppsett.md`).
