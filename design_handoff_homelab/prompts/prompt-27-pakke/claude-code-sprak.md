# Web-dashboard: norsk og engelsk

Fasit: `Homelab Papir Web.dc.html` + `i18n.js` (prototypen oversetter teksten i siden med en ordliste).
- Valg i **onboarding steg 1** («Språk / Language»: Norsk · English) og i **profilmenyen** («Språk: Norsk → English»). Lagres i `hl_lang` og `user_settings.language` (`nb` | `en`).
- I appen: bruk ekte i18n (i18next / react-intl). Alle tekster som nøkler i `locales/nb.json` og `locales/en.json`. Ordlisten i `i18n.js` er startpunktet for `en.json`.
- Datoer og tall med `Intl` (`nb-NO` / `en-GB`): «Monday 19 October», 24-timers klokke, «kr» beholdes.
- Sett `<html lang>`. Innhold fra brukeren (titler, notater, nyheter) oversettes ikke.
- AI-svar: send `language` med i systemprompten.
