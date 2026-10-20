# Finans → Søk: Glimt gir ryddige svar med kort

Fasit: `Mobil Papir App.dc.html` → Finans → Søk (`fs`, `subI`, `G`). Skjermbilde av feilen: `vedlegg/finans-sok-abonnementer.png`.

## Feil
«Abonnementer» + ✦ AI ga én lang tekstblokk med rå markdown (`**ice**`), alle detaljene i én setning og «Ingen treff.» under. Kortet het «AI-SVAR».

## Navn
- AI heter **Glimt** overalt i Finans-søket: knappen «✦ Glimt», etiketten «✦ GLIMT», plassholder «Spør Glimt, f.eks. …», hjelpetekst og tomtilstand.
- Kilden står til høyre i toppen av kortet, kort: «fra Subscription OS» / «leste transaksjoner og kvitteringer». Modellnavn vises bare i detaljer (trykk-og-hold), ikke i kortet.

## Svarformat for standardspørsmål
Glimt svarer alltid i tre deler, aldri én lang setning:
1. **Kort oppsummering** (maks 2 setninger, serif 19 px): «Du har 7 abonnementer. Til sammen 1 358,11 kr i måneden. Neste trekk er TV 2 Play om 5 dager.»
2. **Tre nøkkeltall** i små ruter: PER MÅNED · PER ÅR · NESTE TREKK (dato + navn og beløp).
3. **Kort per element** (liste i en rundet boks): logo, navn, «Neste trekk 25. okt · om 5 dager» (rød når det er innen 7 dager), beløp til høyre med «per mnd» eller «per år · 190/mnd». Sortert etter neste trekk. Trykk åpner elementet i Subscription OS.
- Til slutt en knapp: «Åpne Subscription OS ›».
- Ingen «Ingen treff.» under når Glimt har svart med kort.

### Standardspørsmål som skal gi dette formatet
- **Abonnementer** («abonnementer», «abo», «faste trekk», «hva betaler jeg for») → kilde Subscription OS. Gjelder både med og uten ✦ Glimt slått på.
- **Forbruk i en kategori / butikk** («hvor mye brukte jeg på mat», «rema») → oppsummering + BRUKT · KJØP · STØRST + trefflista under.
- **Faste utgifter, kontoer, budsjett** → samme mønster med sine egne nøkkeltall og kort.

## Backend
- Glimt skal svare med strukturert JSON, ikke fritekst: `{summary, kpis:[{label, value, sub}], items:[{type, id, name, logo, amount, cycle, next_date, note}], action:{label, target}}`.
- Fjern alltid markdown og kildemarkører (`**`, `[n]`) før visning.
- Tall formateres i appen (nb-NO, «kr», desimaler bare når beløpet ikke er helt), ikke av modellen.
- Logo: samme logo-tjeneste som resten av FinansHub (domene → favicon), fallback forbokstav på merkefarge.
