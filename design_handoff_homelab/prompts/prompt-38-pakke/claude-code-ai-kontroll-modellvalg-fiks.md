# FEIL: «Hvilken modell gjør hva i Finans» er tom på mobil

Vedlegg: `uploads/Screenshot 2026-10-20 at 01.04.15.png`. Under «HVILKEN MODELL GJØR HVA I FINANS» vises bare et tomt hvitt kort. Regler og Parametre fungerer.

**Årsak (prototype):** modell-velgerne var `<select>` med en mal-løkke inni. HTML-parseren fjerner alt annet enn `<option>` inne i `<select>`, så radene forsvant. Fiks i `AI Kontroll.dc.html`: `selM`/`selF` bygges som ekte `<select>` med `<option>` i koden.

**Må stemme i appen:** listen skal vise én rad per Finans-oppgave:
| Oppgave | Beskrivelse | Modell (standard) | Reserve |
|---|---|---|---|
| Kvitteringer (bilde) | Leser butikk, beløp og varelinjer | qwen2.5vl:7b (lokal) | gemini-2.5-flash |
| Kategorisering | Foreslår kategori for transaksjoner | llama3.2:3b (lokal) | llama-3.3-70b-versatile |
| Finans · spør | «Har jeg et musikkabonnement?» | gemma4:latest (lokal) | gemini-2.5-flash |
| Strekkoder og pakkelapper | Bildefelt fra kamera | roboflow/kvittering/1 | qwen2.5vl:7b |
- Hver rad har **MODELL** og **RESERVE** (nedtrekk med installerte lokale modeller + tilkoblede sky-modeller, merket LOKAL/SKY).
- Er «Finansdata forlater aldri huset» på og en sky-modell er valgt, vises en rød advarsel i raden. Reserve-sky brukes da ikke.
- Er listen tom (ingen modeller installert eller tilkoblet): vis «Ingen modeller ennå» + **Installer modell ›** (AI → Modeller) i stedet for et tomt kort.
- Mobil: én kolonne per rad (navn øverst, så Modell og Reserve side om side). Native: `Picker` / `ExposedDropdownMenuBox`.
