# Studie (mobil): topplinje som i Nyheter

Mal: `Nyhetsleser.dc.html` (topp) og `Media.dc.html` (mobil-topp, samme oppsett). Gjelder alle Studie-sider i mobilappen (Studie, Dokumenter, emne-detalj osv.). Vedlegg: Studie › Dokumenter i dag (skjermbilde 15.11.54).

## I dag
Rød tekstlenke «‹ Tilbake» på egen linje, så kicker «STUDIE · DOKUMENTER» og stor tittel «Dokumenter» under. Mye luft og ujevnt mot resten av appen.

## Nytt
Én rad øverst (`display:flex; align-items:center; gap:10px; min-height:44px`):
- **Venstre:** pilleknapp **«‹ Tilbake»**: høyde 36px, `padding:0 14px 0 10px`, `border-radius:999px`, `1px solid var(--line)`, gjennomsiktig bakgrunn, `color:var(--ink)`, Manrope 600 13px. Erstatter den røde tekstlenken.
- **Ved siden av** (`flex:1; min-width:0`): kicker i IBM Plex Mono 600 10.5px, `letter-spacing:.12em`, `color:var(--lab)`, ellipsis, f.eks. **«STUDIE · DOKUMENTER»**, og tittel rett under i Newsreader 500 34px, `line-height:1.05`, f.eks. **«Dokumenter»**.
- **Høyre:** runde 40px-knapper med kant (`var(--card)` + `1px solid var(--line)`): ✦ Glimt og ⋯ / innstillinger, som i Nyheter og Media.
- Den separate store tittelen under raden fjernes. Undertekst («Vitnemål, karakterutskrift og attester · Glimt leser og regner ut») blir liggende rett under raden, 14px `var(--mut)`.
- Toppen tar hensyn til safe area og er lik på alle Studie-undersider; kicker/tittel byttes per side (STUDIE · OVERSIKT / Studie, STUDIE · DOKUMENTER / Dokumenter, STUDIE · EMNE / emnenavn).
- Tilbake-sveip fungerer som før (`claude-code-ios-tilbake-sveip.md`).
