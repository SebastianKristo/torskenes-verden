# Huskeliste: Glimt forstår setninger og lager riktige punkter

Fasit: `Huskeliste.dc.html` → `gRun`, `gIsMulti`, `gSmart`, `gFromAI`, `gLocal`, `gCtx`. Skjermbilde av feilen: `vedlegg/huskeliste-glimt-strømstad.png`.

## Feil
«Jeg må huske å ta med noen pakker og møbeler til Strømstad men først må jeg levere pakken» ble lagt inn ordrett som **ett** punkt i Mine.

## Riktig resultat for eksempelet
1. **Lever pakken** · Mine · #pakke #strømstad · *først*
2. **Ta med noen pakker og møbler til Strømstad** · Mine · Strømstad · #strømstad · *etter «Lever pakken»*

Svar fra Glimt: «Lagde 2 punkter for Strømstad, i riktig rekkefølge.» + Angre (fjerner begge).

## Slik skal Glimt tolke
- **Del opp** i ett punkt per handling. Signalord for rekkefølge: «men først», «først», «aller først», «før det» (= skal **før**), «deretter», «etterpå», «etter det», «og så», «til slutt» (= skal **etter**). Flere setninger med «må/skal» = flere punkter.
- **Rekkefølge:** punkter som skal først legges først. Senere punkter får `after` = id-en til punktet før. I lista vises «etter «Lever pakken»» i metalinja til det forrige er huket av.
- **Tittel:** kort og i imperativ. Fjern «jeg må», «jeg må huske å», «husk å», «påminn meg om å», «må jeg». Gjør infinitiv om til imperativ: levere→Lever, hente→Hent, ringe→Ring, kjøpe→Kjøp, sende→Send, bestille→Bestill (+ generelt -ere→-er). Behold stedet i tittelen når det hører til handlingen.
- **Dato og tid:** «i dag/i morgen/i overmorgen/fredag/neste uke/12.11/kl. 14» gjelder alle punktene fra samme setning, og fjernes fra tittelen. «viktig/haster» = alarm.
- **Sted:** «til/i/på/hos/ved/fra + Stort ord» (ikke ukedager eller personer) → feltet `place`. Vises i metalinja og som kartlenke i detaljarket (Apple/Google Maps). Når flere punkter hører til samme tur får alle en felles tagg (`#strømstad`) så de henger sammen.
- **Person:** navn på et familiemedlem (Pål, Ingrid, Emma, Sebastian, hentes fra husstanden) → `who` = **lenke til brukeren** (avatar + «@Ingrid»), og punktet havner i en liste dere begge er med i (f.eks. Hjem) hvis den valgte lista ikke er delt med personen. Personen får varsel «Sebastian nevnte deg i Huskeliste». «jeg/meg» = innlogget bruker.
- **Liste:** handlevarer → Handel, hytte → Hytta, jobb → Jobb, hjemmeting → Hjem, ellers lista du står i eller Mine.
- **Kontekst:** «pakke» → tagg #pakke, og hvis Sporing har en pakke som venter på innlevering/henting, lenk punktet til den.

## Motor
1. Først AI (Glimt, lokal modell via `/api/glimt`, tool `huskeliste`) med prompten i `gSmart`: dagens dato og ukedag, brukeren, listene (nøkkel = navn) og familiemedlemmene. Svar KUN JSON `{"items":[{n, list, who, date, time, place, after, tags}]}`. Valider alt (kjent liste, kjent person, gyldig dato/tid, after peker på et annet punkt). Tidsavbrudd 6 s.
2. Hvis AI feiler eller er treg: lokal tolker `gLocal` med reglene over. Den skal alltid gi samme resultat som eksempelet.
3. Enkle ting («melk i morgen», «kjøp melk og egg») går fortsatt via den raske tolkeren, men får også sted og person (`gCtx`).
- Mens Glimt jobber: «Forstår hva du mener …» med Glimt-animasjonen.
- Resultatkortet viser hvert punkt på to linjer: tittel, og under: steg (1 · først / 2 · etter «…»), liste, dato/tid, sted, @person.

## Datamodell
`todo_items` får `place text null`, `place_lat/lng null`, `after_id uuid null` (FK til samme tabell), `mentions uuid[]` (brukere som er nevnt). Når `after_id`-punktet blir gjort, får det neste punktet varsel «Nå kan du: Ta med … til Strømstad».

## Test
- Eksempelet over → 2 punkter i riktig rekkefølge med sted og tagg.
- «Husk å gi Ingrid nøklene på fredag kl 17» → «Gi Ingrid nøklene» · Hjem · fre kl. 17:00 · @Ingrid.
- «Hent pakke på Kiwi i morgen. Deretter kjøre til hytta» → 2 punkter, «Kjør til hytta» i Hytta etter «Hent pakke på Kiwi».
- Angre fjerner alle punktene fra samme forespørsel.
