# Glimt-varsel når AI-svar blir ferdig i bakgrunnen

Ønske 2026-10-20: «kan vis et ai spørsmål til glimt blir fullført i bakgrunnen, nå sendes det varsel det er riktig, la meg slå av varselet som dukker opp inni appen og la logoen ikonet på varselet feks til glimt la det være et varsel med ikon logoen til glimt»

Fasit: `Mobil Papir App.dc.html` → `aiBgNotify()`, Innstillinger → Varsler, og banneret (`hasBanner`). Ikoner: `assets/glimt-varsel.png` (192×192, papirbakgrunn), `assets/glimt-varsel-rund.png` (transparent), `assets/glimt-badge.png` (96×96, hvit silhuett til Android-statuslinjen).

## Oppførsel
- Systemvarselet beholdes som nå, men:
  - **Tittel:** «Glimt» (ikke «<appnavn> · AI»)
  - **Ikon:** Glimt-logoen (regnbuering med rød stjerne)
  - **Brødtekst:** selve svaret, maks 2–3 linjer. Trykk åpner chatten/siden svaret hører til.
- **Ny innstilling** under Innstillinger → Varsler, rett under «AI-svar i bakgrunnen»:
  - **Vis svaret i appen også** (standard På): «Banner øverst når du kommer tilbake til appen».
  - Av: når du åpner appen igjen, vises **ikke** banneret. Svaret ligger bare i chatten (og i systemvarselet). Lagres som `n_ai_in`, synkes med kontoen.
- Banneret i appen (når det er på) bruker også Glimt-logoen og tittelen «Glimt svarte mens du var borte».

## Plattform
- **iOS:** Varsel-ikonet er alltid app-ikonet. For å vise Glimt-logoen:
  - bruk **Communication Notification** (`INSendMessageIntent` + `UNNotificationContent.updating(from:)`) med Glimt som avsender og `INImage` = Glimt-logoen. Da vises logoen stort, med app-ikonet lite i hjørnet.
  - Reserve: `UNNotificationAttachment` med logoen (vises som miniatyrbilde til høyre).
- **Android:**
  - Egen kanal `glimt_ai` («Glimt-svar»)
  - `setLargeIcon(glimt-varsel-rund.png)` og `setSmallIcon(ic_glimt_badge)` (hvit vektor av ringen + stjernen)
  - `setColor(#E0553D)`
  - Gjerne `MessagingStyle` med `Person` «Glimt» og logoen som ikon
- **Web/PWA:** `showNotification('Glimt', { body, icon: '/assets/glimt-varsel.png', badge: '/assets/glimt-badge.png', tag, data: { go } })`.

## Test
- Still et spørsmål til Glimt, lukk appen før svaret kommer: varsel med Glimt-logo og tittel «Glimt». Trykk åpner svaret.
- Slå av «Vis svaret i appen også», gjenta og åpne appen: ingen banner, svaret ligger i chatten.
- Slå av «AI-svar i bakgrunnen»: ingen systemvarsel.
