# Finans → Mer: samme design som Mer-menyen

Fasit: `Mer Ny.dc.html` med `mode="finans"`, brukt i `Mobil Papir App.dc.html` på siden `fmer`.

- Finans sin Mer-side bruker **samme komponent og design** som hoved-Mer: søkefelt «Søk i moduler», seksjonstittel, fire store kort (2 × 2), «Verktøy»-liste, Innstillinger-rad nederst.
- Seksjonstittel: **FINANS**.
- Fire store kort: **Saldo** (disponibelt, kontoer) · **Budsjett** (% brukt, dager igjen) · **Kvitteringer** (antall til gjennomgang) · **Faste trekk** (neste trekk).
- Verktøy-liste: Aksjer, Finn, Boliger, Abonnement, Transaksjoner, Kontoer, Import, Rapporter. Hver rad har ikon, navn og kort status. Trykk åpner modulen.
- Samme wiggle-redigering: hold inne → Store/Lave-bryter, − for å skjule, «Vis N skjulte», Ferdig. Lave kort = alt i listen.
- Skjulte elementer lagres separat fra hoved-Mer (`papir_fmer_hid`), synkes med kontoen.
- Tall og status hentes fra ekte data (FinansHub-API), ikke faste verdier.
- Det gamle rutenettet med fliser på Finans → Mer fjernes.
