# Android: profilbildet vises ikke

Ønske 2026-10-20: «jeg ser ikke profilbildet i android appen»

Forventet (som iPhone og web, se `claude-code-konto-profilbilde.md`): profilbildet vises oppe til høyre på alle sider, i Innstillinger, på Konto, i hilsenen og i delte boliger. Uten bilde vises initialer på `#2b5d8a`, aldri tom sirkel.

## Sjekk i denne rekkefølgen (logg URL + HTTP-status i `adb logcat`)
1. **Krever bildet innlogging?** `<img src="/api/me/avatar">` / Coil/Glide sender ikke økt-cookien eller `Authorization`-headeren, og svaret blir 401 eller 302 til innlogging.
   - Fiks: API-et returnerer en **signert, offentlig URL** `https://home.kristo.no/media/avatar/<userId>.webp?v=<hash>&sig=<hmac>&exp=<ts>` (gyldig 30 dager, fornyes ved innlogging). Bruk den overalt. Native: legg alternativt auth-header i bildeinnlasteren (`ImageRequest.Builder.addHeader`) eller en OkHttp-interceptor.
2. **WebView og cookies:** `CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)` mangler. Eller økt-cookien har `SameSite=Strict` på et annet domene enn appen laster fra.
   - Fiks: som punkt 1 (signert URL). Eller `SameSite=Lax; Secure` og samme opprinnelse.
3. **http og lokal adresse:** URL-en er `http://`, `http://192.168.x.x` eller `homelab.local`. Android 9+ blokkerer klartekst, og `.local` løses ikke på mobilnett.
   - Fiks: alltid `https://home.kristo.no/...` (eller Tailscale-navnet). Ikke åpne `usesCleartextTraffic`.
4. **Format:** bildet er lagret som HEIC (fra iPhone) eller AVIF. Eldre WebView og Glide klarer det ikke.
   - Fiks: serveren lagrer alltid **512×512 WebP + 192×192 JPEG**. Android får `Accept`-basert svar, med JPEG som reserve.
5. **Feil i cachen:** et tidlig 404/401-svar er cachet (`Cache-Control: max-age`), eller Coil har lagret feilen.
   - Fiks: `?v=<hash>` i URL-en endres ved hvert nytt bilde. `Cache-Control: private, max-age=86400` bare på 200-svar, `no-store` på 4xx. Tøm bildecachen ved innlogging.
6. **Ingen reserve:** feiler innlastingen, står sirkelen tom.
   - Fiks: `error`/`fallback` = initialer (Compose `AsyncImage(..., error = painterResource(initialer))` eller en egen `InitialsAvatar`).

## Endepunkt
`GET /api/me` → `{ name, handle, initials, avatar: { url, url192, hash } | null }`. Appen bruker bare dette. Ingen hardkodet sti.

## Test
- Pixel/Samsung på wifi **og** 4G (utenfor hjemmenettet): bildet vises oppe til høyre, i Innstillinger og på Konto.
- Bytt bilde på web: Android oppdateres innen 5 s (push/refresh av `/api/me`), uten å logge ut og inn.
- Fly-modus: sist hentede bilde vises fra cachen, ellers initialer.
