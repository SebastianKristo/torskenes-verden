// Felles feilform for /api/* og /finans/api/* (Fase 2, kontrakt). Skjema: shared/schemas/common/error.schema.json.
//
// Alle feilsvar (status 400–599) er JSON {error, code?, …}:
//   - error: norsk tekst som kan vises til brukeren.
//   - code: SNAKE_CASE (store bokstaver). Nye koder skrives alltid slik. Eldre koder med små bokstaver (not_found, expired …)
//     sammenlignes av klientene i dag og beholdes til klientene er flyttet (Fase 3–5), se LEGACY_CODES under.
//   - Ekstra felt (reason, needsTotp, restricted …) beholdes som før.
//
// Mellomvaren under retter opp svarene i etterkant, så de mange rutene ikke må endres hver for seg:
//   - Ren tekst eller tom kropp med feilstatus (Honos «404 Not Found», c.notFound(), c.body(null, 404)) → JSON.
//   - JSON-feil uten code får en kode ut fra statusen (CODE_BY_STATUS).
//   - 401 har én form: {error, code:'HOMELAB_AUTH', reason:'none'|'invalid'} når innloggingen mangler eller er ugyldig,
//     {error, code:'TOKEN_EXPIRED', reason:'expired'} når app-tokenet er utløpt (Q23). Mislykket innlogging (feil passord på
//     /api/login, /finans/api/login …) får code:'LOGIN_FAILED'. En 401 med egen kode (SESSION_REQUIRED …) beholdes.
//   - 500 sendes aldri med stack eller interne detaljer (se serverError()).

const JSON_CT = /^application\/([a-z0-9.+-]*\+)?json\b/i;

/** Standardkode per status når ruten ikke har satt en selv. */
export const CODE_BY_STATUS = Object.freeze({
  400: 'BAD_REQUEST', 401: 'HOMELAB_AUTH', 402: 'PAYMENT_REQUIRED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 405: 'METHOD_NOT_ALLOWED',
  408: 'TIMEOUT', 409: 'CONFLICT', 410: 'GONE', 412: 'PRECONDITION_FAILED', 413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'INVALID', 423: 'LOCKED', 424: 'FAILED_DEPENDENCY', 428: 'PRECONDITION_REQUIRED', 429: 'RATE_LIMITED', 451: 'UNAVAILABLE_FOR_LEGAL_REASONS',
  500: 'INTERNAL_ERROR', 501: 'NOT_IMPLEMENTED', 502: 'UPSTREAM_ERROR', 503: 'UNAVAILABLE', 504: 'UPSTREAM_TIMEOUT', 507: 'INSUFFICIENT_STORAGE',
});
const fallbackCode = (status) => CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');

/** Standardtekst per status når svaret ikke har noen (ren tekst/tom kropp). */
const TEXT_BY_STATUS = { 400: 'Ugyldig forespørsel', 401: 'Ikke innlogget', 403: 'Ingen tilgang', 404: 'Finnes ikke', 405: 'Metoden er ikke tillatt', 413: 'For stor forespørsel', 429: 'For mange forespørsler. Prøv igjen litt senere.', 500: 'Intern feil', 502: 'Tjenesten bak svarte ikke som forventet', 503: 'Tjenesten er ikke tilgjengelig nå', 504: 'Tjenesten bak svarte ikke i tide' };
const textFor = (status) => TEXT_BY_STATUS[status] ?? (status >= 500 ? 'Intern feil' : 'Ugyldig forespørsel');

/** SNAKE_CASE med store bokstaver: «HOMELAB_AUTH», «NOT_FOUND». */
export const SNAKE_CASE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

/**
 * Eldre koder som ikke er SNAKE_CASE. Klientene (web, iOS, Android) sammenligner med disse i dag, så de endres ikke i Fase 2.
 * Når klientene godtar den nye skrivemåten (Fase 3–5), byttes `code` til verdien her. Testen i test/http-errors.test.js passer på
 * at ingen nye koder med annen skrivemåte kommer til i server/.
 */
export const LEGACY_CODES = Object.freeze({
  missing: 'MISSING', not_found: 'NOT_FOUND', not_configured: 'NOT_CONFIGURED', ESIZE: 'PAYLOAD_TOO_LARGE', rate: 'RATE_LIMITED',
  not_owner: 'NOT_OWNER', invalid_grant: 'INVALID_GRANT', type: 'INVALID_TYPE', off: 'DISABLED', expired: 'EXPIRED', token: 'TOKEN',
  out_of_range: 'OUT_OF_RANGE', opptatt: 'BUSY', host: 'HOST', dns: 'DNS', connect: 'CONNECT', cert: 'CERT', bar: 'BAR',
  bad_kind: 'BAD_KIND', bad_image: 'BAD_IMAGE', Film: 'FILM', ollama_down: 'OLLAMA_DOWN', wrong_env: 'WRONG_ENV',
  username_taken: 'USERNAME_TAKEN', username: 'USERNAME', used: 'USED', upstream: 'UPSTREAM_ERROR', updater_down: 'UPDATER_DOWN',
  undecryptable: 'UNDECRYPTABLE', unavailable: 'UNAVAILABLE', unauthorized: 'UNAUTHORIZED', ukjent_jobb: 'UNKNOWN_JOB',
  too_large: 'PAYLOAD_TOO_LARGE', timeout: 'TIMEOUT', starttls: 'STARTTLS', ssrf: 'SSRF', size: 'SIZE', short: 'SHORT',
  sharing_off: 'SHARING_OFF', revoked: 'REVOKED', refused: 'REFUSED', rate_limited: 'RATE_LIMITED', public: 'PUBLIC',
  password: 'PASSWORD', other: 'OTHER', ollama_not_configured: 'OLLAMA_NOT_CONFIGURED', no_model: 'NO_MODEL',
  no_location: 'NO_LOCATION', no_led: 'NO_LED', max: 'MAX', low_disk: 'LOW_DISK', invalid_url: 'INVALID_URL', invalid: 'INVALID',
  http: 'HTTP', forbidden: 'FORBIDDEN', folder: 'FOLDER', file_required: 'FILE_REQUIRED', fetch_failed: 'FETCH_FAILED',
  fetch: 'FETCH', failed: 'FAILED', empty_query: 'EMPTY_QUERY', disabled: 'DISABLED', challenge: 'CHALLENGE', busy: 'BUSY',
  blocked: 'BLOCKED', bilde_mangler: 'IMAGE_MISSING', bad_request: 'BAD_REQUEST', bad_audio: 'BAD_AUDIO', auth: 'AUTH',
  abandoned: 'ABANDONED', reauth: 'REAUTH', password_required: 'PASSWORD_REQUIRED', asr_unavailable: 'ASR_UNAVAILABLE',
  last_area: 'LAST_AREA', moderated53: 'MODERATED', no_vision: 'NO_VISION', no_gemini: 'NO_GEMINI', gemini_failed: 'GEMINI_FAILED',
});

/** Svar for en uventet feil: aldri stack, filstier eller SQL – bare den faste teksten. */
export const serverError = (c) => c.json({ error: 'Intern feil', code: 'INTERNAL_ERROR' }, 500);

/** Er dette en sti der 401 betyr «innloggingen mislyktes» (feil passord/kode), ikke «du er logget ut»? */
const LOGIN_PATH = /^\/(?:api\/(?:login|setup|auth\/(?:login|token|device-exchange|app-session|qr\/[^/]+|passkey\/[^/]+|webauthn\/[^/]+|ticket|totp\/login))|finans\/api\/(?:login|auth\/token))\/?$/;

/**
 * Mellomvare for prefiksene i API_PREFIXES (montert først i index.js, så den ser det endelige svaret).
 * tokenState(c) → 'none' | 'invalid' | 'expired' | 'valid' (app-tokenet i Authorization), brukes bare for 401.
 */
export function errorShape({ tokenState = () => 'none' } = {}) {
  return async (c, next) => {
    await next();
    const res = c.res;
    if (!res || res.status < 400 || res.status > 599) return;
    if (res.headers.get('upgrade') || res.headers.get('content-encoding')) return; // WebSocket / allerede komprimert
    const status = res.status;
    const ct = res.headers.get('content-type') ?? '';
    let body = null, isJson = JSON_CT.test(ct);
    if (isJson) {
      try { body = await res.clone().json(); } catch { body = null; isJson = false; }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return; // annen form (sjelden) – rør ikke
    } else if (ct && !/^text\/plain\b/i.test(ct)) {
      return; // bilde, HTML, SSE osv. med feilstatus – ikke vår sak
    } else {
      let text = '';
      try { text = (await res.clone().text()).trim(); } catch { /* tom */ }
      // Honos standardtekster («404 Not Found», «Internal Server Error») og tomme svar gir den norske standardteksten.
      const generic = !text || /^(\d{3}\s+)?(Not Found|Internal Server Error|Unauthorized|Forbidden|Bad Request|Method Not Allowed|Payload Too Large)$/i.test(text);
      body = { error: generic || text.length > 300 ? textFor(status) : text };
    }
    let changed = !isJson;
    if (typeof body.error !== 'string' && body.error === undefined) {
      if (body.message && typeof body.message === 'string') body = { error: body.message, ...body };
      else body = { error: textFor(status), ...body };
      changed = true;
    }
    if (typeof body.error !== 'string') return; // f.eks. {error:{message}} fra Google-emuleringen – egen form
    if (status === 401) {
      const ts = (() => { try { return tokenState(c); } catch { return 'none'; } })();
      if (ts === 'expired' && body.code !== 'SESSION_REQUIRED') {
        body = { ...body, error: body.error === 'Ikke innlogget' ? 'Innloggingen er utløpt. Logg inn på nytt.' : body.error, code: 'TOKEN_EXPIRED', reason: 'expired' };
        changed = true;
      } else if (!body.code) {
        if (LOGIN_PATH.test(c.req.path)) body = { ...body, code: 'LOGIN_FAILED' };
        else if (ts === 'valid') body = { ...body, code: 'UNAUTHORIZED' }; // innlogget, men avvist (f.eks. tjenesten bak)
        else body = { ...body, code: 'HOMELAB_AUTH', reason: body.reason ?? (ts === 'invalid' || hasCredentials(c) ? 'invalid' : 'none') };
        changed = true;
      }
    } else if (!body.code) {
      body = { ...body, code: fallbackCode(status) };
      changed = true;
    }
    if (!changed) return;
    const headers = new Headers(res.headers);
    headers.set('content-type', 'application/json; charset=UTF-8');
    headers.delete('content-length');
    c.res = undefined; // ellers kopierer Hono de gamle headerne (bl.a. content-length) inn i det nye svaret
    c.res = new Response(c.req.method === 'HEAD' ? null : JSON.stringify(body), { status, headers });
  };
}
const hasCredentials = (c) => !!c.req.header('authorization') || /(?:^|;\s*)hl_sid=/.test(c.req.header('cookie') ?? '');

/** Prefiksene som har den felles feilformen. */
export const API_PREFIXES = ['/api/*', '/finans/api/*'];
