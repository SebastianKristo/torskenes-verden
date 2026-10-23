// Prompt 45 (SERVER45): «Google Search Console gir heller ikke fra seg noe statistikk» (claude-code-search-console-statistikk.md).
//
// Rotårsaker funnet i koden (rettet i domains-glimt.js / gsc43.js, se googleReason45):
//   1. Alle 401/403 fra Google ble til «Google avviste tilgangen. Koble til på nytt.», og gsc43 tolket ethvert «403» som manglende scope.
//      Den vanligste ekte årsaken – Search Console API ikke slått på i Google Cloud-prosjektet (SERVICE_DISABLED) – ble derfor aldri vist,
//      og «koble til på nytt» hjalp aldri. Nå: reason api_disabled + activationUrl, noaccess, scope, token, quota, property_format.
//   2. OAuth-app i «Testing»: refresh-tokenet utløper etter 7 dager (invalid_grant) → statistikken stopper stille. Nå: reason token_testing.
//   3. URL-egenskaper med www (https://www.eksempel.no/) ble ikke valgt automatisk. Nå tas de med.
//   4. Ingen mulighet for servicekonto. Nå: POST /api/gsc/service-account (nøkkelen forsegles per bruker, sendes aldri tilbake).
//   5. Egenskapen kunne bare skrives i eksakt format. Nå normaliseres «eksempel.no», «sc-domain:eksempel.no», «https://eksempel.no».
//   endDate = i dag − 3 og dataState:'all' (fra prompt 43) beholdes; API-svar logges uten tokens ([gsc] … status= rows=).
//
//   POST   /api/gsc/service-account (admin) {json} | multipart file → {ok, email, projectId, sites, selected, message} · 400/409 {error, reason}
//   DELETE /api/gsc/service-account (admin) → {ok}
//   GET    /api/gsc (mellomvare) → + {auth:'oauth'|'service-account'|null, serviceAccount:{email, projectId}|null, lagDays:3, dataState:'all', reason?}
//   POST   /api/gsc/site {domain, siteUrl} – siteUrl normaliseres før den gamle ruten tar over.
import { Hono } from 'hono';
import { userInfo, isAdmin, sessionUser } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { kv } from './db.js';
import { _gsc43 as G, gscApi } from './domains-glimt.js';
import { domainNames } from './domains.js';

/** «eksempel.no» → «sc-domain:eksempel.no», «https://eksempel.no» → «https://eksempel.no/». Ugyldig → null. */
export function normSite45(v) {
  let s = String(v ?? '').trim();
  if (!s || s.length > 300 || /\s/.test(s)) return null;
  if (/^sc-domain:/i.test(s)) { const d = s.slice(10).toLowerCase().replace(/^www\./, '').replace(/\/+$/, ''); return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? `sc-domain:${d}` : null; }
  if (/^https?:\/\//i.test(s)) { try { const u = new URL(s); if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null; return `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`}`; } catch { return null; } }
  s = s.toLowerCase().replace(/\/+$/, '');
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? `sc-domain:${s.replace(/^www\./, '')}` : null;
}

const guard = async (c, next) => {
  const id = sessionUser(c) || (bearerOk(c, c.req.method === 'GET' ? 'finance:read' : 'finance:write') ? c.get('user') : null);
  if (!id || !userInfo(id)) return c.json({ error: 'Ikke innlogget' }, 401);
  if (!isAdmin(id)) return c.json({ error: 'Bare administratorer kan sette opp Google Search Console', restricted: true }, 403);
  c.set('user', id);
  await next();
};

export const gsc45Api = new Hono();
gsc45Api.post('/service-account', guard, async (c) => {
  const u = c.get('user');
  let raw = '';
  const ct = c.req.header('content-type') ?? '';
  if (ct.startsWith('multipart/')) { const b = await c.req.parseBody().catch(() => ({})); const f = b.file; if (f && typeof f.text === 'function') { if (f.size > 64 * 1024) return c.json({ error: 'Fila er for stor (servicekonto-nøkler er under 10 kB)' }, 413); raw = await f.text(); } }
  else { const b = await c.req.json().catch(() => null); raw = typeof b?.json === 'string' ? b.json : b?.json && typeof b.json === 'object' ? JSON.stringify(b.json) : b?.type === 'service_account' ? JSON.stringify(b) : ''; }
  let key;
  try { key = JSON.parse(raw); } catch { return c.json({ error: 'Fila er ikke gyldig JSON. Last ned nøkkelen som JSON fra Google Cloud (IAM → Servicekontoer → Nøkler).', reason: 'bad_json' }, 400); }
  if (key?.type !== 'service_account' || !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(String(key.client_email ?? '')) || !/BEGIN (RSA )?PRIVATE KEY/.test(String(key.private_key ?? '')))
    return c.json({ error: 'Dette er ikke en nøkkel for en servicekonto (type service_account med client_email og private_key)', reason: 'bad_key' }, 400);
  const keep = { type: key.type, project_id: String(key.project_id ?? '').slice(0, 100), client_email: key.client_email, private_key: key.private_key, token_uri: key.token_uri ?? 'https://oauth2.googleapis.com/token' };
  const prev = kv.get(u, 'gsc', {}) ?? {};
  // Ny kobling: OAuth-tokenet tas bort (servicekontoen brukes), eiendomsvalg beholdes.
  kv.set(u, 'gsc', { ...prev, refresh: null, sa: G.sealFor(u, JSON.stringify(keep)), saEmail: keep.client_email, saProject: keep.project_id, email: keep.client_email, connectedAt: new Date().toISOString(), error: null, errorReason: null, scope: G.GSC_SCOPE });
  G.accessCache.delete(u);
  try {
    const { list, sites } = await G.loadSites(u);
    if (!list.length) return c.json({ ok: false, email: keep.client_email, projectId: keep.project_id, sites: [], selected: sites, reason: 'sa_not_added',
      error: `Servicekontoen ser ingen eiendommer. Legg til ${keep.client_email} som bruker i Search Console (Innstillinger → Brukere og tillatelser).` }, 409);
    for (const d of Object.keys(sites)) G.syncGsc(u, d).catch((e) => console.warn('[gsc]', e.message));
    console.log(`[gsc] service-account koblet sites=${list.length}`);
    return c.json({ ok: true, email: keep.client_email, projectId: keep.project_id, sites: list, selected: sites, message: `✓ Koblet til som ${keep.client_email} · ${list.length} ${list.length === 1 ? 'eiendom' : 'eiendommer'}` });
  } catch (e) {
    return c.json({ ok: false, email: keep.client_email, projectId: keep.project_id, reason: e.reason ?? 'error', error: e.message, ...(e.activationUrl ? { activationUrl: e.activationUrl } : {}) }, e.status === 400 ? 400 : 409);
  }
});
gsc45Api.delete('/service-account', guard, (c) => {
  const u = c.get('user'), cur = kv.get(u, 'gsc', {}) ?? {};
  const { sa: _a, saEmail: _b, saProject: _c, ...rest } = cur;
  kv.set(u, 'gsc', { ...rest, ...(cur.sa && !cur.refresh ? { email: null } : {}) });
  G.accessCache.delete(u);
  return c.json({ ok: true });
});
gsc45Api.post('/site', guard, async (c) => {
  const b = await c.req.json().catch(() => null);
  const siteUrl = normSite45(b?.siteUrl);
  const domain = String(b?.domain ?? '').trim().toLowerCase().replace(/^www\./, '');
  if (!siteUrl) return c.json({ error: 'Ugyldig eiendom. Skriv f.eks. sc-domain:eksempel.no eller https://eksempel.no/', reason: 'property_format' }, 400);
  if (!domainNames().includes(domain)) return c.json({ error: 'Ukjent domene' }, 400);
  const h = new Headers(c.req.raw.headers); h.set('content-type', 'application/json'); h.delete('content-length');
  return gscApi.fetch(new Request(new URL('/site', c.req.url), { method: 'POST', headers: h, body: JSON.stringify({ domain, siteUrl }) }), c.env);
});

/** Mellomvare på GET /api/gsc: auth-type, servicekonto og forsinkelse. */
export async function gscInfoMw45(c, next) {
  await next();
  if (c.req.method !== 'GET' || c.res.status !== 200 || !/\/api\/gsc\/?$/.test(c.req.path)) return;
  try {
    const u = c.get('user'); if (!u) return;
    const j = await c.res.clone().json(), raw = kv.get(u, 'gsc', {}) ?? {};
    c.res = c.json({ ...j, auth: raw.refresh ? 'oauth' : raw.sa ? 'service-account' : null, serviceAccount: raw.sa ? { email: raw.saEmail ?? null, projectId: raw.saProject ?? null } : null,
      lagDays: G.LAG, dataState: 'all', reason: raw.errorReason ?? null, ...(raw.activationUrl ? { activationUrl: raw.activationUrl } : {}) });
  } catch { /* svaret står */ }
}
