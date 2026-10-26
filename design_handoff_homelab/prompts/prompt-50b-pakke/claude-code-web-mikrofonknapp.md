# Web: mikrofonknappen i søkefeltet på Dashboard

Fasit: `Homelab Papir Web.dc.html` → Dashboard → søkefeltet (mellom «✦ AI» og «Søk»).

## Feil i dag
- Ikonet ligger ikke midt i sirkelen (forskjøvet mot høyre).
- Fylt blå sirkel passer ikke med resten av feltet og ser ut som en egen app.

## Slik skal den se ut
- 40×40 px sirkel, `border-radius: 50%`, `padding: 0`, `display: grid; place-items: center`.
- Hvilestatus: gjennomsiktig bakgrunn, 1 px kant `#e4ddcf`, ikonfarge `#1b1a17`. Hover: bakgrunn `#f3efe6` (samme som «✦ AI»).
- Opptak: bakgrunn og kant `#b23a2a`, hvitt ikon. Trykk igjen stopper.
- Ikon: 18 px strek-mikrofon (stroke 2, runde ender), `display: block` på SVG-en så den ikke får tekstlinje-forskyvning. Ingen ekstra tekst, ingen `line-height`/`padding` som skyver ikonet.
- Overgang 0,18 s på bakgrunn, farge og kant.

## Funksjon
- Web Speech API (`nb-NO`, `interimResults`), teksten fylles inn i søkefeltet mens man snakker. Stopper av seg selv når talen slutter.
