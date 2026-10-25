// Prompt 47 (claude-code-standard-serveradresser.md): standard serveradresser og «Svarer · 34 ms»-test for Innstillinger → Server.
// Brukes av web (settings-server41.js) og PWA (finans/js/mobile-p41.js). Ingen imports, så begge kan laste den.
//
// Standardverdier: ekstern https://os.smarthjemexperten.no, lokal http://10.69.1.39:3000. Serveren kan overstyre dem via env
// (PUBLIC_URL / LOCAL_URL) i GET /api/config/servers ({publicUrl, localUrl?}; localUrl bare etter innlogging). Mangler ruten (404) eller
// feltene, gjelder standardverdiene.
//
// Sikkerhet: en side lastet over https prøver aldri en http-adresse (blandet innhold) – da brukes den eksterne. CSP tillater
// bare fetch til eget opphav, så andre https-adresser testes ved å laste appikonet som bilde (img-src https:).

export const DEF47 = Object.freeze({ external: 'https://os.smarthjemexperten.no', local: 'http://10.69.1.39:3000' });

const clean = (u) => String(u ?? '').trim().replace(/\/+$/, '');
const okUrl = (u) => /^https?:\/\/[^\s/?#@]+(:\d+)?(\/\S*)?$/i.test(clean(u));

let defP = null;
/** Standardadressene (env-overstyrt fra /api/config/servers hvis serveren har det). Hentes én gang per sidevisning. */
export function defaults47(force = false) {
  if (defP && !force) return defP;
  defP = (async () => {
    try {
      const r = await fetch('/api/config/servers', { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } });
      if (!r.ok) return { ...DEF47 };
      const j = await r.json().catch(() => null), s = j?.server ?? j ?? {};
      const ext = clean(s.publicUrl ?? s.public_url), loc = clean(s.localUrl ?? s.local_url);
      return { external: okUrl(ext) ? ext : DEF47.external, local: okUrl(loc) ? loc : DEF47.local };
    } catch { return { ...DEF47 }; }
  })();
  return defP;
}

/** Kan nettleseren prøve adressen herfra? Aldri http fra en https-side. */
export function canTry47(url) {
  try {
    const u = new URL(clean(url));
    if (u.origin === location.origin) return true;
    return !(u.protocol === 'http:' && location.protocol === 'https:');
  } catch { return false; }
}

/**
 * Tester en adresse. → {state:'ok'|'err'|'skip', ms, text}
 * Samme opphav: GET /api/discovery. Annen https: appikonet som bilde. http fra https: hoppes over (aldri prøvd).
 * http til annet opphav fra en http-side: CSP (img-src https:) stopper også bildet, så den hoppes over.
 */
export async function probe47(url, ms = 1500) {
  let u;
  try { u = new URL(clean(url)); } catch { return { state: 'err', ms: null, text: 'Ugyldig adresse' }; }
  const t0 = performance.now();
  if (u.origin === location.origin) {
    const c = new AbortController(), to = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch('/api/discovery', { cache: 'no-store', credentials: 'same-origin', signal: c.signal });
      clearTimeout(to);
      const t = Math.round(performance.now() - t0);
      return r.ok || r.status === 404 || r.status === 401 ? { state: 'ok', ms: t, text: `Svarer · ${t} ms` } : { state: 'err', ms: null, text: 'Svarer ikke' };
    } catch { clearTimeout(to); return { state: 'err', ms: null, text: 'Svarer ikke' }; }
  }
  if (u.protocol === 'http:') {
    return { state: 'skip', ms: null, text: location.protocol === 'https:' ? 'Ikke testet · http fra https-side' : 'Testes av appene' };
  }
  return new Promise((res) => {
    const img = new Image();
    const to = setTimeout(() => { img.onload = img.onerror = null; img.src = ''; res({ state: 'err', ms: null, text: 'Svarer ikke' }); }, Math.max(ms, 3000));
    img.onload = () => { clearTimeout(to); const t = Math.round(performance.now() - t0); res({ state: 'ok', ms: t, text: `Svarer · ${t} ms` }); };
    img.onerror = () => { clearTimeout(to); res({ state: 'err', ms: null, text: 'Svarer ikke' }); };
    img.src = `${u.origin}/assets/icons/icon.svg?t=${Date.now()}`;
  });
}

/** Statusfarge for en test. */
// A11Y51: temafargene (lys/mørk papir og «Nåværende») i stedet for faste farger, så statusteksten holder 4,5:1 i begge temaer.
export const tone47 = (r) => (r?.state === 'ok' ? 'var(--green,#2f8a4f)' : r?.state === 'err' ? 'var(--red,#c2412d)' : null);
