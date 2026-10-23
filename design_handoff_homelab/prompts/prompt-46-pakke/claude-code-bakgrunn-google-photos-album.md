# Bakgrunn fra delt Google Photos-album

Eksempel: `https://photos.app.goo.gl/tSePoABzDyz7bsoh8`
Fasit (UI): `Mobil Papir App.dc.html` → bakgrunnsmenyen på Hjem (pillen ved profilknappen) → ny rad **Google Photos-album** under «Eget bilde» (`gp`). Valget lagres som `mob2a_bg = 'gphoto'` + `papir_bg_gphoto = <lenke>`.

## Flyt
1. Trykk «Google Photos-album» → felt for lenken + «Bruk album» / «Fjern».
2. Godta `https://photos.app.goo.gl/…` og `https://photos.google.com/share/…`. Ugyldig lenke: «Må være en delt album-lenke fra Google Photos».
3. Lagre → «Henter bilder fra albumet …» → bakgrunnen byttes. Raden viser «Bytter bilde hver time · photos.app.goo.gl/…».

## Backend (Google Photos har ikke åpent API for delte album uten OAuth; lenken er offentlig)
- Endepunkt `POST /api/bg/gphoto {url}`: følg redirect fra `photos.app.goo.gl` til `photos.google.com/share/…?key=…`, hent HTML-en server-side og plukk ut bilde-URL-ene (`https://lh3.googleusercontent.com/…`) fra albumdataene i siden. Fjern størrelsessuffiks og be om `=w2400-h2400` (eller skjermbredde × 2).
- Bare bilder (hopp over video). Lagre listen per bruker (`bg_album {url, items[], fetched_at}`). Oppdater listen én gang i døgnet.
- Ikke hotlink: last ned og cache bildene lokalt (`/media/bg/<hash>.jpg`, maks ~200 stk), lag en mindre versjon for mobil og en uskarp miniatyr til lasting.
- Rotasjon: nytt bilde hver time (deterministisk etter time og dag, så alle enheter viser det samme). Valgfritt «Neste bilde» ved langt trykk på pillen.
- Kontrast: samme mørke overlegg som andre bakgrunner (`OV`), og automatisk lys/mørk tekst etter bildets lyshet.
- Feil (albumet er gjort privat, eller er tomt): behold siste bilde, vis «Fikk ikke hentet albumet · trykk for å prøve igjen» i menyen.
- Alternativ hvis skraping slutter å virke: Google Photos Picker API (OAuth) der brukeren velger bilder selv.

## Gjelder
Mobil, iPad/Fold, web og Mac (samme valg synkes per bruker).
