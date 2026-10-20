# Innstillinger: ny side «Tilpass» (alt med utseende og farger)

Ønske 2026-10-20: «kanskje lag en customize siden som har alt med utseende og farger og sånt» (skjermbilde: `vedlegg/innst-homelab-gruppe.png`)

Fasit: `Mobil Papir App.dc.html` → `SUBP.tilpass` og raden `nav('Tilpass', …, 'tilpass')`.

## Hovedsiden i Innstillinger
- HOMELAB-gruppen har nå bare:
  - **Tilpass**, med undertekst «Navn, ikon, tema, farger, bakgrunn og fanelinje» og chevron
  - Moduler
  - Nyhetsleser
- «Navn på appen», «App-ikon», «Fanelinje-stil» og «Fanelinje i Hjem» er flyttet til Tilpass.
- «Utseende og fanelinje» i APP-gruppen er fjernet (innholdet ligger i Tilpass).

## Siden «Tilpass»
1. **IDENTITET:** Navn på appen · App-ikon
2. **FANELINJE:** Fanelinje-stil (Tekst / Bare ikoner / Ikoner + navn) · Fanelinje i Hjem (rediger)
3. **TEMA:** lys/mørk/auto, aksentfarge (flyttet uendret fra Utseende)
4. **BAKGRUNN:** toppbilde, vær-bakgrunn osv. (flyttet uendret)
5. **FORSIDE** (flyttet uendret)
6. **FANELINJE · FLERE VALG:** de resterende fanelinje-valgene fra Utseende

Alle valg har samme logikk og lagringsnøkler som før. Bare plasseringen er endret.

- Søk i Innstillinger: «tema», «farge», «ikon», «navn», «fanelinje», «bakgrunn», «tilpass» og «utseende» leder til Tilpass.
- Gamle lenker/snarveier til `setSub: 'look'` sendes til `tilpass`.
- Web (`Innstillinger Web.dc.html`): samme side som punktet «Tilpass» i sidemenyen, under HOMELAB.
- Fremtidige valg som gjelder utseende (farger, skrift, tetthet, ikoner) legges her.
