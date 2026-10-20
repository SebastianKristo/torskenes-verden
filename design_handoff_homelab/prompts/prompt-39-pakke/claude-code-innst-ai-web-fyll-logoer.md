# AI-kontroll i Innstillinger (web): fyll kortet, Glimt-knappen og logoer på API-tjenester

Ønske 2026-10-20: «ai delen har mer plass rundt i kortet fyll det opp. og ordne la glimt velge modeller knappen sine farger. og under api og nøkler gi ai tjenestene sine egne logoer» (skjermbilde: `vedlegg/innst-ai-web.png`)

Fasit: `AI Kontroll.dc.html` (prop `embed`) og `Innstillinger Web.dc.html` → `isAi`.

## 1. Fyll kortet (innebygd i Innstillinger)
- Innstillinger viser allerede «AI · Modeller, jobber, forbruk og nøkler» øverst. AI-kontrollens egen topp («GLIMT · AI-KONTROLL / AI / 5 lokale modeller …») skjules når den er innebygd (`embed="1"`). Statuslinjen flyttes inn i undertittelen til Innstillinger-toppen.
- Ingen ekstra padding: `bodyPad 4px 0 0`, fanemeny 200 px, 24 px mellomrom. Innholdet går helt ut til høyre kant av Innstillinger-innholdet.
- Høyde: `max(640px, 100vh − 150px)`, ingen ekstra ramme eller bakgrunn rundt (fjern `border-radius`/`margin` på innpakningen).
- Frittstående AI-kontroll (Mac-appen, mobil) beholder sin egen topp.

## 2. «La Glimt velge modeller»
- Kortet: hvit (`--card`) med tynn kant, Glimt-merket (regnbuering med ✦) til venstre.
- Knapp:
  - Noe å fylle ut: **«✦ Fyll ut»**, svart pille (`--ink` / `--bg`).
  - Alt følger anbefalingen: **«✓ Følger anbefaling»**, lys grønn (`--ok` 12 %), grønn tekst og grønn kant, `cursor: default`. Ikke grå/nedtonet, for det er en god tilstand, ikke en feil.

## 3. Logoer under API og nøkler
- Hver tjeneste får sin egen logo i en hvit 40 px brikke med tynn kant: Ollama, Google Gemini, Groq, OpenRouter, Roboflow (og OpenAI, Anthropic, ElevenLabs, Mistral, Hugging Face når de legges til).
- I designet hentes favicon fra `google.com/s2/favicons?domain=…&sz=128`. I appen: legg logoene i logobiblioteket (`/static/logos/ai/{tjeneste}.svg`, se `claude-code-logobibliotek.md`), med favicon som reserve og bokstav-brikken som siste reserve.
- Bruk samme logoer i Modeller → SKY-MODELLER og i Valg-menyene (liten 16 px logo foran modellnavnet).
