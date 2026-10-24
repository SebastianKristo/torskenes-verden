// EVALRCPT48: nettet i kvitterings-evalen. Én global fetch som
//   – slipper gjennom til Ollama og Mac-OCR (ekte modus) eller svarer med mockene (mock-modus),
//   – slipper gjennom til Gemini BARE når cfg.geminiAllowed (GEMINI_API_KEY satt OG sperren av),
//   – svarer «connection refused» for de bevisst døde vertene i reservetestene (*.nede.invalid),
//   – blokkerer og logger alt annet (så et uventet kall ut av huset syns i rapporten).
// trace: [{host, path, kind:'model'|'mac'|'gemini'|'down'|'blocked'|'other', status?, ms?, error?}]
const DOWN = /\.nede\.invalid(:\d+)?$/;
export const GEMINI_HOST48 = 'generativelanguage.googleapis.com';

export function installNet48({ ollamaHost, macHost, geminiAllowed, mock = null }) {
  const real = globalThis.fetch.bind(globalThis);
  const trace = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(url);
    const host = u.host;
    const kind = host === ollamaHost ? 'model' : host === macHost ? 'mac' : host === GEMINI_HOST48 ? 'gemini' : DOWN.test(host) ? 'down' : 'other';
    const e = { host, path: u.pathname, kind, t0: Date.now() };
    trace.push(e);
    const done = (res) => { e.status = res.status; e.ms = Date.now() - e.t0; delete e.t0; return res; };
    const fail = (err) => { e.error = String(err?.cause?.code ?? err?.message ?? err); e.ms = Date.now() - e.t0; delete e.t0; throw err; };
    if (kind === 'down') return fail(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }));
    if (kind === 'gemini' && !geminiAllowed) { e.kind = 'blocked'; return fail(new TypeError(`fetch failed (eval: ${host} er blokkert – Gemini er ikke tillatt i denne kjøringen)`)); }
    if (kind === 'other') { e.kind = 'blocked'; return fail(new TypeError(`fetch failed (eval: ekstern vert ${host} er blokkert)`)); }
    try {
      if (mock) {
        const h = kind === 'model' ? mock.ollama : kind === 'mac' ? mock.mac : mock.gemini;
        return done(await h(u, init));
      }
      return done(await real(input, init));
    } catch (err) { return fail(err); }
  };
  return { trace, real };
}
