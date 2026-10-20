# Varsellyd: myk og lav (særlig Android)

Ønske 2026-10-20: «varslingslyd er veldig høy og ekkel på android.»

Fasit: `Mobil Papir App.dc.html` → `sndList()`, `playSnd()`, Innstillinger → Varsler → VARSELLYD.

## Hvorfor den var ekkel
- Rene sinustoner på **1318–1568 Hz** med 10 ms angrep. Det gir skarpt «pip» og klikk, og små Android-høyttalere forsterker nettopp dette området.
- Gain 0,2 uten begrensning, og **ingen demping** på Android (WebView spiller via media-volumet, som ofte står høyt).
- Systemvarselet spiller i tillegg standard varsellyd fra kanalen. Det gir **dobbel lyd**.

## Ny lyd (designet)
- Ny standard **«Dråpe (myk)»**: 660 → 880 Hz. Alle lyder er flyttet ned i 390–880 Hz.
- 25 ms myk inngang, eksponentiell utklang og en svak oktav (triangel, 12 %) for varmere klang.
- Lavpass 2,4 kHz + kompressor (−24 dB, 4:1) på en felles buss.
- Maks gain 0,09 (før 0,2). **Android × 0,55**, egen lydfil × 0,6.
- Volum: 20 / 35 / **50** (standard, før 80) / 70 / 100 %. Trykk spiller lyden med en gang. Teksten «dempet på Android» vises på Android.

## Android (native)
- **Én lyd, ikke to:** når systemvarselet vises, spill **ikke** egen lyd i appen. Lyden kommer fra varselkanalen. Egen lyd i appen bare når appen er åpen og varselet vises som banner.
- Egne kanaler med egen, myk lyd (`res/raw/glimt_draape.ogg`, −16 LUFS, maks −3 dBTP, ≤ 0,6 s):
  - `glimt_ai` IMPORTANCE_DEFAULT
  - `pakker` DEFAULT
  - `finans` LOW (uten lyd)
  - `stille` MIN

  `setSound(uri, AudioAttributes.USAGE_NOTIFICATION / CONTENT_TYPE_SONIFICATION)`. Aldri `USAGE_ALARM` eller `STREAM_MUSIC`.
- Lyd i appen: `SoundPool` med `USAGE_NOTIFICATION_EVENT` (følger varselvolumet, ikke media) og `setVolume(0.5)`. Ikke `MediaPlayer` på `STREAM_MUSIC`.
- Respekter Ikke forstyrr og lydløs modus (`RINGER_MODE_SILENT/VIBRATE`): ingen lyd, bare vibrasjon hvis den er på.
- Vibrasjon: kort og lav: `VibrationEffect.createWaveform([0,18,40,14], [0,90,0,60], -1)`.
- Kanalens lyd kan ikke endres etter at kanalen er opprettet. Lag nye kanal-ID-er (`glimt_ai_v2` osv.) og slett de gamle, så brukerne får den nye, myke lyden.

## iOS
`UNNotificationSound(named: "glimt_draape.caf")`, samme fil og loudness. Bruk `.defaultCritical` aldri.

## Test
Pixel og Samsung med media- og varselvolum på 100 %: lyden skal oppleves som et mykt «dropp», ikke et pip. Den skal være omtrent like høy som tastaturklikk. Kun én lyd per varsel.
