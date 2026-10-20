# Finans: vis når en transaksjon eller kvittering ble lagt til

Fasit: `FinansHub Mobil v2.dc.html` → `addedOf(x)`, brukt i transaksjonsdetaljen (iOS, Android, Fold) og i «Original kvittering»/«Original banktransaksjon».

## Hva
Nederst på detaljsiden til en **transaksjon** (under Rediger/Slett) og nederst på **kvitteringen** (under «Lagret på serveren · lest av …») står én dempet, sentrert linje (12,5 px, sekundærfarge):

- Skannet kvittering: «Lagt til 16.10.2026 kl. 17.46 · skannet kvittering · Sebastian»
- Bankimport: «Lagt til 14.10.2026 kl. 06.00 · bankimport fra DNB»
- Manuelt: «Lagt til 20.10.2026 kl. 11.40 · lagt inn manuelt · Sebastian»
- Fra Glimt/chat: «… · lagt til av Glimt fra chat · Sebastian»
- iOS-snarvei/API: «… · via iOS Snarvei» / «… · via API-nøkkel «Home Assistant»»

Hvis den er endret etterpå, legg til en linje under: «Sist endret 18.10.2026 kl. 09.12 av Ingrid».

## Data
- `transactions` og `receipts` får `created_at timestamptz not null default now()`, `created_by uuid`, `created_via text` (`scan` | `bank_import` | `manual` | `glimt` | `shortcut` | `api`), `updated_at`, `updated_by`.
- Eksisterende rader: `created_at` = importtidspunkt for bankimport, opplastingstid for kvitteringer.
- Tid vises i brukerens tidssone (Europe/Oslo), format `dd.mm.åååå kl. tt.mm`.
- Web (`FinansHub v2`) viser samme linje nederst i detaljpanelet og kvitteringsvisningen.
