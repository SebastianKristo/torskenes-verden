// Vindusstørrelsen uten tvungen layout (Fase 3, B §3 P3/B5).
// innerWidth/innerHeight midt i en tegning tvinger nettleseren til å regne ut layouten på nytt. Her leses de én gang
// når modulen lastes og deretter bare i resize/orientationchange, så tegnekoden kan spørre så ofte den vil.
// Lytteren registreres når modulen evalueres, altså før lytterne i modulene som importerer den: de ser alltid ny størrelse.
let w = innerWidth, h = innerHeight;
const update = () => { w = innerWidth; h = innerHeight; };
addEventListener('resize', update, { passive: true });
addEventListener('orientationchange', update, { passive: true });

/** Vindusbredden i CSS-piksler (som innerWidth). */
export const vw = () => w;
/** Vindushøyden i CSS-piksler (som innerHeight). */
export const vh = () => h;
