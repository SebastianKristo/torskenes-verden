# Android: Hjem-flisene er for høye (iOS er riktig)

Vedlegg: `vedlegg/android-flishoyde.jpg` (Android-appen), `vedlegg/android-flishoyde-2.png`.
Fasit: `Homelab.dc.html` (Hjem, 2-kolonners rutenett), som iOS-appen allerede følger.

## Feil
På Android blir halve fliser (Finans, Middag, Familie, Domener) nesten kvadratiske (~150 dp høye). Innholdet ligger øverst, og under er det tomt. Avgang blir derfor også for høy. Rutenettet tvinger høyden i stedet for å bruke høyden innholdet trenger.

Vanlige årsaker i Compose (sjekk alle):
- `Modifier.aspectRatio(1f)` eller `.height(…)`/`.heightIn(min = 150.dp)` på flisen.
- `LazyVerticalGrid` med fast `Modifier.height` per celle, eller `fillMaxHeight()` inne i en rad uten `IntrinsicSize`.
- Samsung/One UI-skalering: verdier i `sp`/skjermprosent i stedet for `dp`.

## Slik skal det være (likt iOS)
- **Høyde = innholdets høyde.** Ingen aspectRatio, ingen fast høyde på halve fliser.
- Polstring 14 dp topp/bunn, 16 dp sider. Radius 24 dp. Luft mellom flisene 12 dp.
- Flisene i samme rad blir like høye, og det er den høyeste som bestemmer: `Row(Modifier.height(IntrinsicSize.Min)) { Tile(Modifier.weight(1f).fillMaxHeight()) … }`.
- Omtrentlige høyder (360 dp bred skjerm):
  - Finans ≈ 92 dp (etikett, tall 26 sp, én linje)
  - Middag ≈ 92 dp
  - Familie ≈ 112 dp (etikett, avatarer 32 dp, én linje); Domener følger raden → 112 dp
  - **Avgang** går over to rader: høyde = Finans + 12 + Middag, men minst 212 dp. Finans og Middag strekkes likt hvis Avgang er høyere.
- Fulle fliser (Siste nytt, Gjøremål osv.) bruker også bare innholdets høyde.

## Implementasjon
Ikke bruk `LazyVerticalGrid` for Hjem. Bygg rutenettet selv fra layoutlista (`papir_layout.hjem` med `order`, `hid`, `sz`):
1. Gå gjennom synlige widgets i rekkefølge. Full → egen rad. Halv → pares med neste halve i en `Row(IntrinsicSize.Min)`.
2. Avgang (to rader høy): `Row(IntrinsicSize.Min) { Avgang(weight 1, fillMaxHeight, heightIn(min = 212.dp)); Column(weight 1, spacedBy 12.dp) { neste to halve, hver weight 1 } }`.
3. En halv flis uten partner: alene på venstre side, høyre side tom (som iOS).
4. Hele Hjem i én `LazyColumn`/`Column(verticalScroll)` med `Arrangement.spacedBy(12.dp)`.

## Test
- Pixel 8 og Galaxy S24 (One UI, skjermzoom standard og stor): Finans og Middag skal være like lave som på iPhone, uten tomrom under teksten.
- Endre størrelse (håndtaket ↔ i redigeringsmodus): når en halv flis blir full, skal raden pares på nytt uten hull.
- Skriftstørrelse 130 %: flisene vokser med teksten, ingenting kuttes.
