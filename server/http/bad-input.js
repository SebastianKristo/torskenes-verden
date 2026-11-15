// Prompt 85 (SRVSEC85): feil i kroppen fra klienten skal gi 400, ikke 500.
// Bakgrunn: mange ruter leser kroppen med «await c.req.json()» og bruker feltene direkte. Ugyldig JSON (SyntaxError) eller en
// kropp som er gyldig JSON men ikke et objekt (null, "tekst", 5 → TypeError ved første feltoppslag) endte i app.onError som
// «Intern feil» 500 – med full feillogg og en krasjrapport (QA51/GlitchTip) per forespørsel. Det gjaldt også ruter uten
// innlogging (POST /api/login med kroppen «null»), så hvem som helst kunne fylle loggen og krasjlageret.
// Her avgjøres det i etterkant, ut fra kroppen Hono allerede har lest: bare når feilen faktisk skyldes kroppen svares det 400.
// Alt annet (ekte serverfeil) går videre til 500 og krasjrapporten som før.

const JSON_CT = /^application\/([a-z0-9.+-]*\+)?json\b/i;

/** → Response (400) når feilen skyldes kroppen i forespørselen, ellers null. Kaster aldri. */
export async function badInput85(err, c) {
  try {
    const m = c.req.method;
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return null;
    const syntax = err instanceof SyntaxError, type = err instanceof TypeError;
    if (!syntax && !type) return null;
    const cached = c.req.bodyCache?.text; // json() leser alltid via text(), så den leste kroppen ligger her
    if (!cached) return null;
    const text = await cached;
    if (typeof text !== 'string') return null;
    let value, valid = true;
    try { value = JSON.parse(text); } catch { valid = false; }
    if (!valid) {
      // Bare når ruten prøvde å tolke kroppen som JSON (feilen er en JSON-SyntaxError) – ikke for ruter som leser råtekst.
      if (syntax && (JSON_CT.test(c.req.header('content-type') ?? '') || /JSON/.test(String(err.message)))) return c.json({ error: 'Ugyldig JSON i forespørselen' }, 400);
      return null;
    }
    if (type && (value === null || typeof value !== 'object')) return c.json({ error: 'Forventet et JSON-objekt i forespørselen' }, 400);
    return null;
  } catch { return null; }
}
