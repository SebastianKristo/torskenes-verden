# Nyheter: Glimt-sammendrag øverst i hver kategori

## I dag
Det finnes ett felles Glimt/AI-sammendrag for alle nyheter.

## Ønske
Hver kategori (f.eks. Siste, Norge, Verden, Økonomi, Sport, Teknologi, Kultur, Lokalt osv., det som finnes i appen) skal ha **sitt eget sammendrag øverst** i kategorien.

## Krav
- Når man bytter kategori, vises sammendraget for den kategorien øverst, med samme kortdesign som dagens sammendrag.
- «Alle»/forsiden beholder dagens felles sammendrag.
- Sammendraget lages kun ut fra sakene i den kategorien (siste 12–24 t, maks ca. 15 saker), 3–5 korte punkter eller 2–4 setninger på godt norsk. Hvert punkt lenker til kildesaken.
- Generering lokalt via Ollama (samme modell/pipeline som dagens sammendrag). Generer i bakgrunnen og cache per kategori. Regenerer når det har kommet ≥3 nye saker eller etter 30 min. Vis cachet versjon med «oppdatert kl. HH:MM».
- Ikke generer alle kategorier samtidig ved oppstart: forrang for kategorien som vises, deretter de mest brukte, én om gangen (Mac mini M4 16 GB).
- Lastetilstand: skjelett av kortet. Feil eller ingen saker: skjul kortet, ingen tom boks.
- Kategorier med færre enn 3 saker: ikke vis sammendrag.
- Den kommende knappen under sammendraget (se åpent punkt om «medengagn») skal virke på kategori-sammendraget også.
- Innstillinger → Nyheter: bryter «Sammendrag per kategori» (på som standard).
- Gjelder iOS, Android/Fold, iPad, web og Mac.
