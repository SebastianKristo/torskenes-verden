# Økonomi (FinansHub web): AI-knapper heter Glimt og bruker Glimt-figuren

Ønske 2026-10-20: «ai knapper i økonomi skal hetete glimt og ha samme glimt figurer og glimt farger som i resten av web» (vedlegg `uploads/Screenshot 2026-10-20 at 20.35.58.png`).
Fasit: `FinansHub v3 Temaer.dc.html` (`glFig()`, `glimt-figurer.js`).

- Søkefeltet i toppen: «✦ AI» → **[Glimt-orb 22 px] Glimt**. Av: lys pille (`surf2`) med mørk tekst. På: mørk pille `#1b1a17` med hvit tekst, og orben roterer raskere. Plassholder «Spør Glimt …».
- Menypunktet «AI-søk» heter **Glimt**. Kortet viser Glimt-orben (36 px) + «GLIMT · SPØR OM ØKONOMIEN · <motor>». Knappen «Spør AI» → **Spør Glimt**. Orben roterer raskere mens svaret lages.
- «✦ AI-SPARING» → «✦ GLIMT · SPARING». Gå gjennom resten av Økonomi og bytt alle synlige «AI» til «Glimt» (knapper, etiketter, toasts, tomtilstander). Unntak: der det står hvilken motor (Gemini/Ollama), og i innstillinger for AI-motorer.
- Figur og farger: samme `GlimtFigMake(React)('glimt', størrelse, humør)` som Homelab web (konisk ring #b23a2a → #e8794a → #f2c14e → #3fbf9a → #7a5ad6). Last `glimt-figurer.js` og keyframes `gf*` én gang. Følger jul/17. mai-varianter automatisk.
- Gjelder også mobil Finans og iOS/Android: samme navn og figur.
- **Ikon:** Glimt-orben, ikke figuren med ansikt. Konisk fargering (#b23a2a → #e8794a → #f2c14e → #3fbf9a → #7a5ad6), roterer på 4 s (1,1 s når Glimt jobber), kremfarget innside med rød ✦ i midten. Fasit: `glOrb()` i `FinansHub v3 Temaer.dc.html`.
