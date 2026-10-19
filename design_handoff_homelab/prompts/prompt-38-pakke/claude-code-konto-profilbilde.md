# Innstillinger → Konto: vis profilbildet

Ønske 2026-10-19: «vis også profilbilde i konto». Vedlegg: `uploads/Screenshot 2026-10-19 at 22.16.01.png`. Konto-siden viser et generisk blått person-ikon i toppen, og raden Profilbilde viser bare teksten «Lagt til».

## Endringer (web og mobil)
1. **Toppen av Konto-siden:**
   - Erstatt det blå ikonet (88 px) med **profilbildet**: rundt, 96 px, `object-fit: cover`, ring `0 0 0 3px #f3efe6, 0 0 0 4px #d8d1c2`.
   - Ved siden av står «Konto» (Newsreader) og under «Sebastian Kristo Jemtland · @sebastian».
   - Uten bilde: initialer på `#2b5d8a`.
   - **Hover/trykk på bildet** gir et mørkt lag med kamera-ikon og «Endre». Trykk åpner bildevalget.
2. **Raden «Profilbilde»:**
   - Erstatt «Lagt til» med en **miniatyr** (40 px rund) til høyre, foran «Endre →».
   - Under raden står knappene **Last opp nytt** · **Ta bilde** (mobil) · **Fjern** (rød tekst, med bekreftelse).
3. **Bildevalg:** beskjæring med sirkelmaske (zoom + dra), lagres som 512 × 512 WebP. `PUT /api/me/avatar` → oppdaterer meny, hilsen, mobilapp, delte boliger og widgets **med en gang** (cache-bust `?v=<hash>`).
4. Mobil (Innstillinger → Konto): samme topp med bildet sentrert (88 px) over navnet, og «Endre bilde» som tekstknapp under.
5. Profilkortet øverst i sidemenyen (som allerede viser bildet) skal bruke samme kilde, så alt endres samtidig.


## Endring 2026-10-19: profilbildet øverst til høyre åpner Innstillinger
Vedlegg: `uploads/Screenshot 2026-10-19 at 23.58.22.png` (S-sirkelen).
- Trykk på profilbildet/initialen i toppen (mobil, alle sider) åpner **Innstillinger (oversikten)**, ikke Konto. Fasit: `Mobil Papir App.dc.html` → `goSet` (`setSub: null`).
- Konto nås fra profilkortet øverst i Innstillinger (som før).
- Web: profilmenyen (S) er uendret (Innstillinger står øverst der).


## 2026-10-20: «Lås skjermen» og «Logg ut» flyttes til Konto
Vedlegg: `uploads/Screenshot 2026-10-20 at 01.06.28.png`. Lenkene stod nederst i sidemenyen i Innstillinger.
- **Fjernet fra sidemenyen** (web og mobil). Fasit: `Innstillinger Web.dc.html`.
- **Ny seksjon nederst på Konto-siden: ØKT**
  - **Lås skjermen** (ikonbrikke `lock`, blå): låser appen med en gang og krever PIN/Face ID/passord for å fortsette.
  - **Logg ut** (rød ikonbrikke `log-out`, rød tekst): bekreftelse «Logge ut av Homelab på denne enheten?».
  - **Logg ut av alle enheter**: ugyldiggjør alle økter (krever passord/Face ID), og viser antall enheter.
- Profilmenyen på web (S oppe til høyre) beholder «Logg ut».
- Snarvei web: Ctrl+Alt+L / ⌃⌘Q låser skjermen.
