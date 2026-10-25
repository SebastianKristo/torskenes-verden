# Chat: vis tankegangen, og miniatyr av opplastet bilde

Ønske 2026-10-24: «legg til at jeg kan trykke på at den tenker å viser meg tankegangegn. og i bildet nr 2 legg til liten bilde preview av bildet som ble lastet opp» (vedlegg `Screenshot 2026-10-24 at 17.36.50.png`, `17.37.09.png`).
Fasit: `Homelab.dc.html` → Chat (`chThk`, `m.think`, `m.thS`, `chThumb()`, `attTh`, `chImg`). Gjelder mobil, Fold/iPad og web (`Homelab Papir Web.dc.html`).

## 1. Tankegang
- I dag vises bare tre prikker / «Tenker …». Bytt til en pille: **✦ Tenker … 2,1 s ▾**. Sekundene teller opp mens modellen tenker.
- Trykk på pillen viser eller skjuler tankestegene. Mens den tenker er listen **åpen** som standard. Hver linje er nummerert, i dempet tekst, med en tynn strek til venstre. Nye linjer kommer til etter hvert.
- Når svaret begynner å strømme, blir pillen **✦ Tenkte i 2,1 s ›** (lukket). Den lagres på meldingen (`think: string[]`, `thS: sekunder`) og kan åpnes igjen senere, også etter omstart og på andre enheter.
- **Kilde:** Ollama `/api/chat` med `think: true` gir `message.thinking` i strømmen (qwen3, deepseek-r1, gpt-oss). Open WebUI: `<think>…</think>` / `reasoning_content`. Del teksten i avsnitt eller setninger, én linje per steg. Har modellen ikke tenkning (llama3.2, gemma3, qwen2.5vl), vises Glimts egne steg: leser spørsmålet, ser på vedlegget, henter data, velger modell (med grunn), planlegger svaret.
- Tankegangen sendes **ikke** tilbake i konteksten ved neste melding. Det sparer tokens (jf. 400-feilen «8214 tokens exceeds 8192»).

## 2. Miniatyr av bilde i meldingen
- I dag står det bare en pille med «Bilde» over brukerens boble. Bytt til en **miniatyr 96 × 120 pt** (radius 16/16/6/16, 1 pt kontur, myk skygge) høyrejustert over boblen. Flere bilder ligger på rad og brytes til ny linje.
- Trykk åpner bildet i full skjerm (mørk bakgrunn, filnavn under, trykk eller sveip ned lukker).
- Dokumenter (PDF, Excel …) beholder pillen med # og filnavn.
- I skrivefeltet får bildevedlegg en 24 × 24 miniatyr i stedet for ▣-ikonet.
- Lagre en nedskalert JPEG (maks 220 px, kvalitet 0,72) som `attTh` på meldingen, slik at historikken viser miniatyren uten å laste originalen. Originalen ligger på serveren og hentes når bildet åpnes i full skjerm.
