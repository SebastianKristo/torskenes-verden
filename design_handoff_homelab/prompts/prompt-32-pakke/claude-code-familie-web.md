# Web: nytt design for Familie

Fasit: `Familie.dc.html` med `variant="web"` (lastes i `Homelab Papir Web.dc.html` → fanen **Familie**). Gammel versjon: `Familie v1.dc.html`. Mobil er uendret, bortsett fra at like hendelser nå slås sammen.

## Oppsett (web)
- Topp: faner **Kart · Soner · Helse** (pille, maks 360 px) til venstre og «● Sanntid · …» til høyre.
- **To kolonner**: kart til venstre (`minmax(0,1fr)`) og sidepanel til høyre (320–400 px), 24 px mellomrom.
  - **Kartet** er høyt: vindushøyde − 220 px (520–820 px), radius 24, og blir stående (`position: sticky; top: 16px`) når man scroller sidepanelet. Over kartet: «+ Ny sone på kartet», «Vis alle» og oppdater. På kartet: soner, spor, personer, zoom og «Sanntid · oppdatert nå».
  - **Sidepanel (Kart)**, i rekkefølge:
    1. Valgt person (når man trykker på en pin eller rad): bilde, navn, sted · oppdatert, 3×2 målinger (batteri, bevegelse, fart, nøyaktighet, enhet, koordinater), sone, **Veibeskrivelse** og **Spill av lyd**, ✕.
    2. **FAMILIEN · 4 personer**: kort med rader (bilde med statusprikk, navn, sted, batteri, sist oppdatert).
    3. **HENDELSER**: maks 12, og **like hendelser på rad slås sammen** med teller «×7» (f.eks. «Sebastian kom til Mormor ×7»).
    4. **Min deling**: Deler / Pause / Av, Nøyaktig / Omtrentlig, del fra nettleser og helse jeg deler.
  - **Soner** og **Helse**: samme kort som på mobil, i sidepanelet. Kartet blir stående til venstre (Helse viser ikke kart).
- Under 900 px bredde: én kolonne som på mobil (kart øverst).

## Teknisk
- Samme komponent for mobil og web. På mobil er kolonne-innpakningen `display: contents`, så rekkefølgen er uendret.
- Kartbredden måles fra kart-elementet (ResizeObserver), så fliser og soner regnes ut for den faktiske bredden.
- Hendelser i API-et: grupper på `(person, type, sone)` når de kommer rett etter hverandre. Vis siste tidspunkt og antall.
