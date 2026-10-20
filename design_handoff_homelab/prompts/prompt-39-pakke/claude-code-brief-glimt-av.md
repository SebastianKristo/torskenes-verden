# Now Brief: slå av Glimt (figuren)

Ønske 2026-10-20: «la meg slå av glimt i now brief»

Fasit: `Glimt Brief.dc.html` → `CFG0.fig`, raden «Glimt i briefen» i innstillingene, og `figS`/`figG`/`figXS`/`showGuide`/`cardCols`.

## Innstilling
- Innstillinger → Glimt (og briefens tannhjul) → øverste gruppe, rett under «Glimt-brief»:
  - **Glimt i briefen** · «Vis Glimt-figuren og vennene i briefen, på Hjem-kortet og i widgets» · På (standard).
- Lagres i `glimt_brief_cfg.fig`, synkes med kontoen. Alle åpne visninger oppdateres med en gang (event `glimt-cfg` / `storage`, native: delt `UserDefaults`/`DataStore` + widget-reload).

## Når den er av
- **Briefen (side):** ingen figur nede til høyre, ingen snakkebobler, og guide-runden starter ikke automatisk. Innholdet (vær, avtaler, nyheter, prøveperioder, bursdager, nordlys) er uendret.
- **Hjem-kortet:** teksten fyller hele bredden (ingen 64 px figur-kolonne). Tittelen «· GLIMT» kan stå.
- **Glass-kort og widgets** (iOS WidgetKit, Android Glance, Samsung): uten figur. Teksten tar plassen.
- **Les opp** fungerer fortsatt hvis den er på (stemmen er uavhengig av figuren).
- «Venner av Glimt» gråes ut (har ingen effekt når figuren er av).

## Test
Slå av → Hjem-kortet, briefen og widgetene viser ingen figur innen 1 s, og etter omstart. Slå på → figuren er tilbake, og guide-runden starter igjen neste gang briefen åpnes.
