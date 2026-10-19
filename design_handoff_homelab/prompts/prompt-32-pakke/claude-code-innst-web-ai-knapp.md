# Web Innstillinger: AI-knappen i søkefeltet

Fasit: `Innstillinger Web.dc.html` (søkeskjemaet øverst i sidepanelet).

- Søkefelt: 44 px høyt, radius 22, hvit med hel kant 1 px `#e3ddcf` (i stedet for skygge bare i bunnen). Innrykk 14 px til venstre og 6 px til høyre.
- **✦ AI**-knappen sitter **inni** feltet med lik luft (6 px) oppe, nede og til høyre: 32 px høy pille, radius 16, ingen kant.
  - Av: bakgrunn `#f1ece2`, svart tekst.
  - På: `#b23a2a`, hvit tekst. Plassholder: «Spør, f.eks. «hvor bytter jeg bakgrunn?»».
- ✦ og «AI» er sentrert vertikalt (flex, line-height 1), og ✦ er 11 px.
- Samme mønster på mobil: knappen skal aldri gå ut over kanten på feltet.
