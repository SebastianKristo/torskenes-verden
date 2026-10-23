# Chat: ikke bruk nettet (via Open WebUI) når nettsøk er slått av

Ønske 2026-10-23: «og i chat den skal ikke bruke netet via openweb ui hvis nettsøk er slått av»
Gjelder Chat (Glimt-chat) og Glimt-motoren (`claude-code-glimt-intelligent-agent.md`).

## Feil
Bryteren **Nettsøk** i chatten er av, men svarene bruker likevel nettet. Glimt-chatten går via Open WebUI, og Open WebUI har sitt eget nettsøk (Web Search / SearXNG / tools / «auto web search»). Det slås på uavhengig av bryteren vår.

## Rett
- **Bryteren styrer hvert kall.** Send eksplisitt i hver forespørsel til Open WebUI (`/api/chat/completions`):
  - `features: { web_search: false }` når Nettsøk er av (`true` når på).
  - `tool_ids: []`, og ingen tools som henter fra nettet (fetch_url, web_search, browser) når av.
  - Ingen `files`/`collections` med URL-er som hentes live.
- **Server-sikring:** Open WebUI → Admin → Settings → Web Search: slå av «Enable Web Search by default», og bruk vår egen API-nøkkel med en modell/konfig der nettsøk ikke er standard. Kontroller med et kall uten `features` at det ikke søker.
- **Valider i backend:** Er Nettsøk av og svaret fra Open WebUI likevel inneholder `sources`/`citations` med http-URL-er, eller loggen viser et søk: forkast svaret, logg `chat.websearch_leak`, og kjør på nytt med søk eksplisitt av.
- **Glimt-verktøy:** Når Nettsøk er av, fjernes også våre egne nettverktøy (Google/DuckDuckGo-søk, vær fra nett er unntatt, siden det er appens egen data) fra verktøylisten i motoren. Data fra appen (kalender, finans, gjøremål) brukes som vanlig.
- **UI:** Svar som brukte nettet viser «🌐 Kilder (3)». Når bryteren er av, vises aldri dette. Spør brukeren om noe som krever nettet, svarer Glimt: «Nettsøk er av. Skal jeg søke på nettet for dette?» med knappen **Søk denne gangen** (slår på for ett svar).
- Bryterens tilstand lagres per samtale og vises i inntastingsfeltet.

## Test
- Nettsøk av: «Hva skjedde i nyhetene i dag?» → ingen nettkall (sjekk Open WebUI-logg og nettverkslogg), Glimt sier at nettsøk er av.
- Nettsøk på: samme spørsmål → søker og viser kilder.
- Bytt modell i AI-kontroll → bryteren gjelder fortsatt.
