# Kalender web: × øverst til høyre + «Tema: følger» virker ikke

Ønske 2026-10-21: «i kalender web, legg x i høyere hjørne. og tema følger funker ikke» (vedlegg `uploads/Screenshot 2026-10-21 at 11.17.54.png`)
Fasit: `Kalender.dc.html` (`variant="web"`) → topplinja (`hasClose` / `closeK`) og `sysDark()`, `thCycle`.

## 1. Lukk (×)
- I appen ligger × helt til venstre, før sidepanel-knappen. Flytt den til **helt til høyre**, etter «+ Ny hendelse», med 6 px luft.
- Utseende: rund 40 px, `ink` bakgrunn, `bg` kryss (14 px, strek 2,6). Tooltip/aria «Lukk kalenderen». Esc lukker også.
- Venstre side starter med sidepanel-knappen og «Oktober 2026».

## 2. Tema-knappen (sol/måne/halv)
Tre tilstander i rekkefølge **Følger → Mørk → Lys → Følger**, lagret i `kal_theme`. Ikonet viser gjeldende tilstand (halv sirkel = følger, måne = mørk, sol = lys), tooltip «Tema: følger Homelab» / «Tema: mørk» / «Tema: lys».

**Feilen:** «følger» leser bare `prefers-color-scheme` én gang ved oppstart, og ignorerer Homelab-temaet. Er Homelab satt til mørkt papir (eller systemet bytter til mørkt om kvelden), blir kalenderen lys.

**Fiks:** «følger» betyr:
1. Homelab-temaet hvis det er valgt (`papir_mode` = «Mørk»/«Lys», fra profilen).
2. Ellers systemet (`prefers-color-scheme`).
- Lytt på begge: `matchMedia('(prefers-color-scheme: dark)').addEventListener('change', …)` og endringer i Homelab-temaet (`storage`-event / profil-push). Bytt tema med en gang, uten omlasting.
- Mørkt tema: `ink #efe9de · bg #161513 · card #211f1b · line #3b3731 · lab #cf5540 · mut #a49d91`, `color-scheme: dark`.

## Test
- Følger: bytt Homelab til Mørk → kalenderen blir mørk med en gang. Fjern Homelab-valget og bytt systemet til mørkt → mørk.
- Klikk knappen: Mørk → Lys → Følger, ikon og tooltip følger med, valget huskes etter omlasting.
- × står øverst til høyre og lukker.
