# 17. mai: Glimt med flagg + eget Hjem-design

Ønsker 2026-10-20: «lag også et eget hjem design og glimt figur for 17 mai. norges nasjonaldag. lag kansje en glimt figur med bunad.» · «fjern bunad fra glimt figurene, behold flagget.»
Fasit: `17 mai.dc.html` (1a figurer, 1b Hjem, 1c varsel og widget) + `glimt-figurer.js` (fase `'17mai'`).

## Figurene (14.–17. mai)
- Fase `17mai` i `julOn()`-logikken (14.–17. mai). Ingen bunad.
- Tilbehør: **sløyfe** i rødt med hvit kant og blå knute på hodet (samme anker som lua), og et **norsk flagg** på pinne til høyre som vaier (`gfSway` 1,6 s). Flaggfarger: rød `#BA0C2F`, hvit, blå `#00205B`, riktige proporsjoner (22:16, kors 4/2).
- Bruker samme ankerpunkter per figur som julemodus. Kan tvinges med `o.ph:'17mai'`.

## Hjem 17. mai (bare på selve dagen)
- Toppen i rødt flaggrødt med svakt bybilde, **flaggrekke** (vimpler rød/hvit/blå som vaier), «Søndag 17. mai · Grunnlovsdagen», **«Gratulerer med dagen, Sebastian!»**, vær, og Glimt med flagg.
- **17. mai-brief** (mørk blå): når barnetoget går, vær, trafikk («Trikk innstilt i sentrum»).
- **Program i dag** for byen (Oslo: salutt 07:00, barnetog 10:00, folketog 13:00) + egne kalenderhendelser. Passerte punkter grå, neste markert rødt. Hentes fra kommunens program (manuell liste per by i serveren), fallback: bare kalender.
- **Familien:** hvor de er (Familie-deling).
- **Hipp hipp hurra!** (rød knapp): konfetti i flaggfargene over hele skjermen + haptikk, og sender «Hipp hipp hurra fra Sebastian!» til familien (Familie-varsel). Teller «Hurra nr. 3».
- Vanlige kort under som ellers. Fanelinjen som vanlig.

## Varsel og widget
- Kl. 07:30: Glimt-varsel «Gratulerer med dagen!» + barnetogtid og trafikkråd.
- Widget (liten): flaggrekke øverst, «17. MAI», «Barnetoget om 1 t 48 min», vær.

## Av/på
- Innstillinger → Glimt → **Høytider**: «17. mai» (Auto / Av), samme sted som julemodus. Av = vanlig Hjem og figurer uten flagg.

## Bryter for vanlig Hjem (2026-10-20)
Ønske: «på 17 mai legg kansje til en switch som viser hoved designet.» (skjermbilde: `vedlegg/17-mai-hjem.png`)
- Øverst til høyre i toppen: pille **«17. mai-design»** med bryter (grønn = på). Av → vanlig Hjem: vanlig bakgrunnsbilde med mørk overgang, «God morgen, Sebastian», vanlig brief (MORGENBRIEF), vanlige kort (avganger osv.), ingen flaggrekke, program eller hurra-knapp. Pillen viser da «17. mai» med bryteren av, så du kan slå festdesignet på igjen.
- Valget gjelder bare i dag og nullstilles 18. mai. Figurene beholder flagget uansett (styres av Høytider-innstillingen).

## Lagt inn i appen (2026-10-20)
Ønske: «legg til tingngene.»
Fasit: `Mobil Papir App.dc.html` (`maiVals`, Innstillinger → Tilpass → **HØYTIDER**).
- Hjem på 17. mai: rød topp over bybildet, «Søndag 17. mai · Grunnlovsdagen», «Gratulerer med dagen, Sebastian!», øverst pillen **«17. mai-design»** med bryter, så **Program i dag** og **Hipp hipp hurra!** (med flagg) før de vanlige kortene.
- Bryter av: vanlig Hjem samme dag. Innstilling **17. mai-design**: Automatisk 17. mai / Vis nå (forhåndsvisning) / Av.
- Fiks i fasiten: «Hipp hipp hurra»-knappen skjules nå i vanlig visning.
