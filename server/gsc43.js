// Prompt 43 (SERVER43): «Google Search Console er lagt til, men Domener viser ingen statistikk» (claude-code-gsc-ingen-statistikk.md).
//
// Årsakene i koden før prompt 43 (rettet her og i domains-glimt.js):
//   1. Tomt svar uten forklaring: /api/domains/overview og /:domain/gsc ga bare {connected, loading|needsSite}, og feilen fra Google
//      (403 scope, utløpt refresh-token) ble lagt i conf.error uten å nå siden. → empty:true + reason + message (diagnosen under).
//   2. Ingen ny henting: data hentes bare ved tilkobling og av nattjobben 06:00–06:30 (startet serveren senere, ble dagen hoppet over),
//      og et domene som ble lagt inn etter tilkoblingen fikk aldri valgt eiendom (needsSite) før noen åpnet eiendomslista.
//      → nattjobben tar igjen dagen (domains-glimt.js), eiendommen velges automatisk ved diagnosen, «Hent nå» (POST …/gsc/refresh).
//   3. Datoene: endDate = i dag − 2 ga tomme siste dager; nå i dag − 3 (LAG), dataState:'all', type:'web' og searchconsole.googleapis.com.
//
//   GET  /api/domains/:domain/gsc (mellomvare) → som før + ved tomt: {empty:true, reason, message, site, permissionLevel, fetchedAt, dataTo}
//        reason: 'unverified' | 'noaccess' | 'scope' | 'token' | 'pending' | 'nosource' | 'noimpressions'
//   GET  /api/domains/overview (mellomvare)    → gsc får de samme feltene når den ikke har tall
//   POST /api/domains/:domain/gsc/refresh {period?} → «Hent nå»: {ok, domain, site, rows, dataTo, fetchedAt, ms} | {ok:false, reason, error}
//   GET|POST /api/domains/:domain/gsc/test    → diagnose per eiendom: {ok, domain, siteUrl, permissionLevel, scope, scopeOk, refreshToken,
//        lastFetch, dataTo, rows28, impressions28, clicks28, reason, message, steps:[{t, ok, ms, detail}], error?}
//   GET|POST /api/gsc/test?siteUrl=|domain=   → samme for en eiendom (Innstillinger → Domener → Google Search Console → Test)
import { Hono } from 'hono';
import { db } from './db.js';
import { sessionUser, userInfo, isAdmin } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { domainNames } from './domains.js';
import { _gsc43 as G, syncGsc, gscView } from './domains-glimt.js';

const q = (sql) => db.prepare(sql);
const OK_LEVELS = new Set(['siteOwner', 'siteFullUser', 'siteRestrictedUser']);
const PERM = { siteOwner: 'eier', siteFullUser: 'full', siteRestrictedUser: 'begrenset', siteUnverifiedUser: 'ikke bekreftet' };
export const GSC_REASONS43 = {
  unverified: 'Eiendommen er ikke bekreftet i Search Console',
  noaccess: 'Google-kontoen har ingen eiendom for domenet (eier, full eller begrenset bruker trengs)',
  scope: 'Tilkoblingen mangler lesetilgang (webmasters.readonly). Koble til på nytt.',
  token: 'Innloggingen hos Google er utløpt. Koble til på nytt.',
  pending: 'Venter på første henting. Google har 2–3 dagers forsinkelse.',
  nosource: 'Domenet har ikke valgt eiendom i Search Console ennå.',
  noimpressions: 'Ingen søkevisninger i perioden.',
  // Prompt 45 (SERVER45): de ekte årsakene som før ble rapportert som «scope»/«koble til på nytt».
  api_disabled: 'Search Console API er ikke slått på i Google Cloud-prosjektet. Slå på «Google Search Console API» og prøv igjen om noen minutter.',
  token_testing: 'Google-tilgangen utløp etter 7 dager fordi OAuth-appen står i «Testing». Sett den til «In production» i Google Cloud og koble til på nytt.',
  sa_not_added: 'Servicekontoen er ikke lagt til som bruker på eiendommen i Search Console.',
  quota: 'Google-kvoten er brukt opp for nå. Prøv igjen om litt.',
  property_format: 'Eiendommen har feil format (sc-domain:eksempel.no eller https://eksempel.no/).',
};
export const GSC_STEPS45 = {
  api_disabled: ['Åpne Google Cloud Console → APIer og tjenester → Bibliotek', 'Søk etter «Google Search Console API» og trykk Aktiver', 'Vent et par minutter og trykk «Hent nå»'],
  token_testing: ['Google Cloud Console → OAuth-samtykkeskjerm → Publiser appen («In production»)', 'Koble til Search Console på nytt'],
  sa_not_added: ['Search Console → Innstillinger → Brukere og tillatelser → Legg til bruker', 'Lim inn servicekontoens e-postadresse med tilgangen «Full» eller «Begrenset»', 'Trykk «Hent nå»'],
  noaccess: ['Logg inn i Search Console med samme Google-konto', 'Legg til eiendommen sc-domain:<domene> og bekreft den med DNS'],
  scope: ['Koble fra og koble til på nytt', 'Godta «Se Search Console-data for de bekreftede nettstedene dine»'],
  pending: ['Google har 2–3 dagers forsinkelse – nye eiendommer får tall etter noen dager'],
};
const siteMatches = (s, d) => { d = d.toLowerCase(); const root = d.split('.').slice(-2).join('.'); return s === `sc-domain:${d}` || s === `https://${d}/` || s === `http://${d}/` || s === `https://www.${d}/` || s === `sc-domain:${root}`; };
const rawSites = new Map(); // bruker → {at, list} (10 min)
async function sitesRaw(u, force = false) {
  const hit = rawSites.get(u);
  if (!force && hit && Date.now() - hit.at < 10 * 60_000) return hit.list;
  const j = await G.wm(u, 'GET', '/sites');
  const list = (j?.siteEntry ?? []).map((s) => ({ siteUrl: String(s.siteUrl), permissionLevel: String(s.permissionLevel ?? '') }));
  rawSites.set(u, { at: Date.now(), list });
  return list;
}
/** Bare for tester: tøm eiendomscachen. */
export const _resetGsc43 = () => rawSites.clear();
// Prompt 45: «403» alene betyr ikke manglende scope (API av, ingen tilgang til eiendommen osv.) – årsaken kommer fra googleReason45 (e.reason/errorReason).
const reasonOfError = (msg, reason = null) => reason ?? (/Search Console API er ikke slått på|has not been used in project/i.test(msg ?? '') ? 'api_disabled' : /scope|insufficient|lesetilgang/i.test(msg ?? '') ? 'scope' : /utløpt|invalid_grant|401|trukket tilbake/i.test(msg ?? '') ? 'token' : null);
const inflight = new Map();
const kick = (u, d) => { const k = `${u}|${d}`; if (!inflight.has(k)) inflight.set(k, syncGsc(u, d).catch((e) => G.setConf(u, { error: e.message })).finally(() => inflight.delete(k))); return inflight.get(k); };

/** Hvorfor er Google Søk tomt for domenet? null = det er tall (eller ikke koblet: da viser siden «Koble til»). */
export async function gscDiagnose43(u, domain, period = 28, { network = true } = {}) {
  const c = G.conf(u);
  if (!c.refresh) return c.error ? { reason: reasonOfError(c.error, c.errorReason) ?? 'token', message: c.error, steps: GSC_STEPS45[c.errorReason] } : null;
  if (c.scope && !String(c.scope).includes(G.GSC_SCOPE)) return { reason: 'scope', message: GSC_REASONS43.scope };
  const site = c.sites?.[domain];
  if (!site) {
    if (!network) return { reason: 'nosource', message: GSC_REASONS43.nosource };
    let list;
    try { list = await sitesRaw(u); } catch (e) { const r = reasonOfError(e.message, e.reason); return { reason: r ?? 'noaccess', message: r ? GSC_REASONS43[r] ?? e.message : e.message, steps: GSC_STEPS45[r], ...(e.activationUrl ? { activationUrl: e.activationUrl } : {}) }; }
    const hits = list.filter((s) => siteMatches(s.siteUrl, domain));
    const good = hits.filter((s) => OK_LEVELS.has(s.permissionLevel));
    if (!hits.length) return { reason: 'noaccess', message: `${GSC_REASONS43.noaccess}. Legg til sc-domain:${domain} i Search Console.` };
    if (!good.length) return { reason: 'unverified', message: GSC_REASONS43.unverified, site: hits[0].siteUrl, permissionLevel: PERM[hits[0].permissionLevel] ?? hits[0].permissionLevel };
    // Én tydelig eiendom (sc-domain:domene, ellers den eneste): velg den og hent med en gang («Bruk» automatisk).
    const pick = good.find((s) => s.siteUrl === `sc-domain:${domain}`) ?? (good.length === 1 ? good[0] : null);
    if (pick) { G.setConf(u, { sites: { ...(G.conf(u).sites ?? {}), [domain]: pick.siteUrl } }); kick(u, domain); return { reason: 'pending', message: `Valgte ${pick.siteUrl}. ${GSC_REASONS43.pending}`, site: pick.siteUrl, permissionLevel: PERM[pick.permissionLevel] }; }
    return { reason: 'nosource', message: GSC_REASONS43.nosource, candidates: good.map((s) => s.siteUrl) };
  }
  const r0 = c.error ? reasonOfError(c.error, c.errorReason) : null;
  const to = q('SELECT max(date) FROM gsc_daily WHERE user_id=? AND domain=?').pluck().get(u, domain);
  const fetchedAt = c.fetched?.[domain] ? new Date(c.fetched[domain]).toISOString() : null;
  const perm = (c.siteList ?? []).find((s) => s.siteUrl === site)?.permissionLevel;
  const base = { site, fetchedAt, dataTo: to ?? null, ...(perm ? { permissionLevel: PERM[perm] ?? perm } : {}) };
  if (!to) {
    if (r0) return { ...base, reason: r0, message: c.error, steps: GSC_STEPS45[r0], ...(c.activationUrl ? { activationUrl: c.activationUrl } : {}) };
    if (!fetchedAt) { kick(u, domain); return { ...base, reason: 'pending', message: GSC_REASONS43.pending }; }
    return { ...base, reason: 'noimpressions', message: `Ingen søkevisninger de siste ${period} dagene` };
  }
  const from = G.addDays(to, -(period - 1));
  const imp = q('SELECT coalesce(sum(impressions),0) FROM gsc_daily WHERE user_id=? AND domain=? AND date>=? AND date<=?').pluck().get(u, domain, from, to);
  if (!imp) return { ...base, reason: 'noimpressions', message: `Ingen søkevisninger de siste ${period} dagene` };
  return null;
}

const userOf = (c, write) => sessionUser(c) || (bearerOk(c, write ? 'finance:write' : 'finance:read') ? c.get('user') : null);
const adminGuard = async (c, next) => {
  const id = userOf(c, c.req.method !== 'GET');
  if (!id || !userInfo(id)) return c.json({ error: 'Ikke innlogget' }, 401);
  if (!isAdmin(id)) return c.json({ error: 'Bare administratorer har tilgang', restricted: true }, 403);
  c.set('user', id);
  await next();
};
const normD = (d) => String(d ?? '').trim().toLowerCase().replace(/^www\./, '');
const periodOf = (v) => ({ 7: 7, 28: 28, 90: 90, '7d': 7, '28d': 28, '3m': 90 }[v ?? '28'] ?? 28);

/** Mellomvare på GET /api/domains/:domain/gsc: tomt → empty:true + årsak. */
export async function gscViewMw43(c, next) {
  await next();
  if (c.req.method !== 'GET' || c.res.status !== 200 || !/\/gsc\/?$/.test(c.req.path)) return;
  try {
    const u = c.get('user'), d = normD(c.req.param('domain'));
    if (!u || d === '*') return;
    const j = await c.res.clone().json();
    if (j.connected && !j.loading && !j.needsSite && (j.series ?? []).length && (j.kpi?.impressions?.value ?? 0) > 0) return;
    if (!j.connected && !j.reconnect) return;
    const why = await gscDiagnose43(u, d, periodOf(c.req.query('period')));
    if (!why) return;
    c.res = c.json({ ...j, ...(j.reconnect ? {} : { connected: true }), empty: true, ...why }, 200);
  } catch { /* svaret står */ }
}
/** Mellomvare på GET /api/domains/overview: gsc uten tall får årsaken (uten nettkall). */
export async function gscOverviewMw43(c, next) {
  await next();
  if (c.req.method !== 'GET' || c.res.status !== 200) return;
  try {
    const u = c.get('user') ?? sessionUser(c), d = normD(c.req.query('domain') ?? '*');
    if (!u || d === '*') return;
    const j = await c.res.clone().json();
    if (!j.gsc || (j.gsc.kpi && (j.gsc.kpi.impressions?.value ?? 0) > 0)) return;
    if (!G.connected(u)) return;
    const why = await gscDiagnose43(u, d, 28, { network: false });
    if (why) c.res = c.json({ ...j, gsc: { ...j.gsc, empty: true, ...why } }, 200, { 'Cache-Control': 'private, max-age=60' });
  } catch { /* svaret står */ }
}

async function testSite(u, domain, siteUrl0) {
  const steps = [];
  const t = async (label, fn) => { const t0 = Date.now(); try { const r = await fn(); steps.push({ t: label, ok: true, ms: Date.now() - t0, ...(r?.detail ? { detail: r.detail } : {}) }); return r; } catch (e) { steps.push({ t: label, ok: false, ms: Date.now() - t0, detail: e.message }); throw e; } };
  const c = G.conf(u);
  const out = { ok: false, domain, siteUrl: siteUrl0 ?? c.sites?.[domain] ?? null, permissionLevel: null, permission: null, scope: c.scope ?? null, scopeOk: null, refreshToken: !!c.refresh,
    lastFetch: domain && c.fetched?.[domain] ? new Date(c.fetched[domain]).toISOString() : null, dataTo: domain ? c.dataTo?.[domain] ?? null : null, rows28: null, clicks28: null, impressions28: null, steps };
  if (!c.refresh) return { ...out, reason: c.error ? 'token' : null, message: c.error ?? 'Ikke koblet til Google Search Console', error: c.error ?? 'Ikke koblet til Google Search Console' };
  try {
    const tok = await t('Fornyer tilgangen med refresh-token', () => G.accessToken(u));
    const info = await t('Sjekker scope', async () => {
      if (G.mockGsc()) return { scope: c.scope ?? `openid email ${G.GSC_SCOPE}`, detail: 'demodata' };
      const r = await G.fetchG(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(tok)}`);
      const j = await r.json().catch(() => ({}));
      return { scope: j.scope ?? c.scope ?? null, detail: j.expires_in ? `utløper om ${Math.round(j.expires_in / 60)} min` : null };
    });
    out.scope = info.scope; out.scopeOk = info.scope ? String(info.scope).includes(G.GSC_SCOPE) : null;
    if (out.scopeOk === false) return { ...out, reason: 'scope', message: GSC_REASONS43.scope, error: GSC_REASONS43.scope };
    const list = await t('Henter eiendommene (sites.list)', async () => { const l = await sitesRaw(u, true); return Object.assign(l, { detail: `${l.length} eiendommer` }); });
    let site = out.siteUrl ? list.find((s) => s.siteUrl === out.siteUrl) : null;
    if (!site && domain) site = list.find((s) => s.siteUrl === `sc-domain:${domain}`) ?? list.find((s) => siteMatches(s.siteUrl, domain));
    if (!site) return { ...out, reason: 'noaccess', message: `Kontoen har ingen eiendom som heter ${out.siteUrl ?? `sc-domain:${domain}`}`, error: 'Fant ikke eiendommen' };
    out.siteUrl = site.siteUrl; out.permissionLevel = site.permissionLevel; out.permission = PERM[site.permissionLevel] ?? site.permissionLevel;
    if (!OK_LEVELS.has(site.permissionLevel)) return { ...out, reason: 'unverified', message: GSC_REASONS43.unverified, error: GSC_REASONS43.unverified };
    const end = G.addDays(G.osloDate(), -G.LAG), start = G.addDays(end, -27);
    const r = await t(`searchAnalytics.query ${start} – ${end}`, async () => {
      const j = await G.wm(u, 'POST', `/sites/${encodeURIComponent(site.siteUrl)}/searchAnalytics/query`, { startDate: start, endDate: end, dimensions: ['date'], type: 'web', dataState: 'all', rowLimit: 25000 });
      const rows = j?.rows ?? [];
      return { rows, detail: `${rows.length} rader` };
    });
    out.rows28 = r.rows.length; out.clicks28 = r.rows.reduce((a, x) => a + (x.clicks ?? 0), 0); out.impressions28 = r.rows.reduce((a, x) => a + (x.impressions ?? 0), 0);
    out.period = { startDate: start, endDate: end };
    out.ok = true;
    if (!out.impressions28) return { ...out, reason: 'noimpressions', message: 'Ingen søkevisninger de siste 28 dagene' };
    return { ...out, reason: null, message: `✓ ${out.siteUrl} · ${out.permission} · ${out.rows28} dager med data · ${out.clicks28} klikk og ${out.impressions28} visninger siste 28 dager` };
  } catch (e) {
    const reason = reasonOfError(e.message, e.reason);
    return { ...out, ok: false, reason, message: reason ? GSC_REASONS43[reason] ?? e.message : e.message, steps: GSC_STEPS45[reason], ...(e.activationUrl ? { activationUrl: e.activationUrl } : {}), error: `${e.status ? `${e.status} · ` : ''}${e.message}`.slice(0, 300) };
  }
}

export const gscDomains43Api = new Hono();
gscDomains43Api.post('/:domain/gsc/refresh', adminGuard, async (c) => {
  const u = c.get('user'), d = normD(c.req.param('domain')), per = periodOf(String((await c.req.json().catch(() => ({})))?.period ?? 28));
  if (d === '*' || !domainNames().includes(d)) return c.json({ error: 'Fant ikke domenet' }, 404);
  if (!G.connected(u)) return c.json({ ok: false, reason: 'token', error: G.conf(u).error ?? 'Ikke koblet til Google Search Console' }, 409);
  const t0 = Date.now();
  if (!G.conf(u).sites?.[d]) { const why = await gscDiagnose43(u, d); if (!G.conf(u).sites?.[d]) return c.json({ ok: false, ...why, error: why?.message ?? GSC_REASONS43.nosource }, 409); }
  try {
    await (inflight.get(`${u}|${d}`) ?? syncGsc(u, d));
    const cf = G.conf(u);
    const to = cf.dataTo?.[d] ?? null;
    const rows = q('SELECT count(*) FROM gsc_daily WHERE user_id=? AND domain=? AND date>=?').pluck().get(u, d, to ? G.addDays(to, -(per - 1)) : '0000');
    return c.json({ ok: true, domain: d, site: cf.sites[d], rows, dataTo: to, fetchedAt: cf.fetched?.[d] ? new Date(cf.fetched[d]).toISOString() : null, ms: Date.now() - t0 });
  } catch (e) {
    G.setConf(u, { error: e.message });
    const reason = reasonOfError(e.message, e.reason);
    return c.json({ ok: false, reason, error: e.message, steps: GSC_STEPS45[reason], ...(e.activationUrl ? { activationUrl: e.activationUrl } : {}) }, e.status === 401 || e.status === 403 ? 409 : 502);
  }
});
const testRoute = async (c) => {
  const u = c.get('user'), d = normD(c.req.param('domain'));
  if (!domainNames().includes(d)) return c.json({ error: 'Fant ikke domenet' }, 404);
  return c.json(await testSite(u, d, c.req.query('siteUrl') || null));
};
gscDomains43Api.get('/:domain/gsc/test', adminGuard, testRoute);
gscDomains43Api.post('/:domain/gsc/test', adminGuard, testRoute);
export const gsc43Api = new Hono();
const testAny = async (c) => {
  const b = c.req.method === 'POST' ? await c.req.json().catch(() => ({})) ?? {} : {};
  const siteUrl = String(c.req.query('siteUrl') ?? b.siteUrl ?? '').trim() || null, d = normD(c.req.query('domain') ?? b.domain ?? '') || (siteUrl ? siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '') : '');
  if (!siteUrl && !d) return c.json({ error: 'Oppgi siteUrl eller domain' }, 400);
  return c.json(await testSite(c.get('user'), d || null, siteUrl));
};
gsc43Api.get('/test', adminGuard, testAny);
gsc43Api.post('/test', adminGuard, testAny);
export { gscView };
