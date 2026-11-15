// Eldre API-aliaser samlet ett sted (Q29). Aliasene beholdes, men hver bruk telles, så det er mulig å se hvilke som fortsatt brukes.
// Aliaser uten bruk på 60 dager tas opp igjen før de fjernes (se docs/opprydding/BESLUTNINGER.md Q29).
//
// Tabellen beskriver aliasene; rutene for dem står der de alltid har stått (rekkefølgen i index.js er bærende). Når et alias
// fjernes eller flyttes, oppdateres tabellen her. Telleren ligger i kv (eieren, nøkkelen KV_KEY) som {alias: {n, first, last}}.
// Admin ser den på GET /api/admin/aliases.

/** @type {ReadonlyArray<{alias: string, method?: string, target: string, note: string}>} */
export const ALIASES = Object.freeze([
  { alias: '/api/integrasjoner', target: '/api/integrations', note: 'Norsk navn på samme app (integrations-api.js)' },
  { alias: '/api/studie', target: '/api/study', note: 'Studie-dokumenter (studie/documents.js)' },
  { alias: '/api/rom', target: '/api/space', note: 'Rom/APOD/satellitter (rom/space.js)' },
  { alias: '/api/update', target: '/api/system/update', note: 'Samme systemUpdateApi' },
  { alias: '/api/domener/sammendrag', target: '/api/domains/summary', note: 'Norsk navn' },
  { alias: '/api/velfremme', target: '/api/hjemlys', note: 'Vel fremme (internt hjemlys), videresendes med app.fetch' },
  { alias: '/api/calendar/quick', target: '/api/kalender/quick', note: 'Samme calendarQuickApi' },
  { alias: '/api/calendar/ask', method: 'POST', target: '/api/kalender/glimt/search', note: 'kalender/glimt-search.js' },
  { alias: '/api/receipts/scan', method: 'POST', target: '/finans/api/receipts/scan', note: 'receipts48' },
  { alias: '/api/receipts/health', method: 'GET', target: '/finans/api/receipts/health', note: 'receipts48' },
  { alias: '/api/finans/kvitteringer', method: 'POST', target: '/finans/api/receipts/parsed', note: 'system/server-urls.js' },
  { alias: '/api/finans/kvitteringer/ocr', method: 'POST', target: '/finans/api/receipts/ocr-text', note: 'system/server-urls.js' },
  { alias: '/api/homes', target: '/finans/api/folders', note: 'Boliger → FinansHub-mappene (index.js)' },
  { alias: '/api/boliger/oversikt', method: 'GET', target: '/finans/api/boliger/oversikt', note: 'index.js' },
  { alias: '/finans/api/login', method: 'POST', target: '/finans/api/auth/token', note: 'Mobilappene (Mobil v2)' },
  { alias: '/finans/api/logout', method: 'POST', target: '/finans/api/auth/logout', note: 'Kalender-appene før Fase 0b' },
  { alias: '/api/brief/settings', target: '/api/glimt/settings', note: 'Eldre klienter (glimt/brief.js / glimt/settings.js)' },
  { alias: '/mat/api', target: '/api/matplan', note: 'Samme matApi; fhweb, iOS og Android bruker /mat/api' },
  { alias: '/home/api', target: '(ingen)', note: 'home.js – ingen klient funnet i AUDIT A §2.2' },
]);

export const KV_KEY = 'api_alias_usage';

const matches = (a, method, path) => (!a.method || a.method === method || (a.method === 'GET' && method === 'HEAD')) && (path === a.alias || path.startsWith(a.alias + '/'));

/** Aliaset en forespørsel treffer, eller null. Lengste alias vinner (/api/finans/kvitteringer/ocr før /api/finans/kvitteringer). */
export function aliasFor(method, path) {
  let best = null;
  for (const a of ALIASES) if (matches(a, method, path) && (!best || a.alias.length > best.alias.length)) best = a;
  return best;
}

/**
 * Mellomvare som teller bruk av aliasene. kv = {get, set} (server/db.js), owner = eier-id.
 * Skrivingen samles (høyst én gang per FLUSH_MS), så et alias som kalles ofte ikke gir én skriving per kall.
 */
export function aliasCounter({ kv, owner, now = () => Date.now(), flushMs = 5000 }) {
  const pending = new Map(); // alias → {n, last}
  let timer = null;
  const flush = () => {
    timer = null;
    if (!pending.size) return;
    const cur = kv.get(owner, KV_KEY, {}) ?? {};
    for (const [alias, p] of pending) {
      const old = cur[alias] ?? { n: 0, first: p.first };
      cur[alias] = { n: (old.n ?? 0) + p.n, first: old.first ?? p.first, last: p.last };
    }
    pending.clear();
    try { kv.set(owner, KV_KEY, cur); } catch (e) { console.warn('[alias] kunne ikke lagre telleren:', e?.message); }
  };
  const mw = async (c, next) => {
    const a = aliasFor(c.req.method, c.req.path);
    if (a) {
      const t = now();
      const p = pending.get(a.alias) ?? { n: 0, first: t, last: t };
      p.n++; p.last = t;
      pending.set(a.alias, p);
      if (!timer) { timer = setTimeout(flush, flushMs); timer.unref?.(); }
    }
    return next();
  };
  /** Telleren slik admin ser den: alle aliasene, også de som aldri er brukt. */
  const usage = () => {
    flush();
    const cur = kv.get(owner, KV_KEY, {}) ?? {};
    const iso = (ms) => (ms ? new Date(ms).toISOString() : null);
    return ALIASES.map((a) => {
      const u = cur[a.alias] ?? {};
      return { alias: a.alias, method: a.method ?? null, target: a.target, note: a.note, count: u.n ?? 0, firstUsedAt: iso(u.first), lastUsedAt: iso(u.last),
        daysSinceUse: u.last ? Math.floor((now() - u.last) / 86400_000) : null };
    });
  };
  return { middleware: mw, usage, flush };
}
