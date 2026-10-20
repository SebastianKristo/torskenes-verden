// Prompt 32 (SERVER32): Domener – Glimt-oppsummering og Google Search Console.
// Domenene er serveroppsett (bare admin, samme vakt som /domains/api). Oppsummeringer og GSC-koblingen er per bruker.
//
// GLIMT · OPPSUMMERING (claude-code-domener-ai-oppsummering.md)
//   GET  /api/domains/:domain/summary   (:domain = navn, eller «*»/«alle» = Alle domener). Finnes ingen for i dag, lages den nå.
//   POST /api/domains/:domain/summary   «↻ Lag ny»: ny oppsummering av siste 24 t som erstatter dagens.
//   → {domain:'kristo.no'|'*', label:'kristo.no'|'Alle domener', date:'2026-10-19', createdAt, manual, daily, ai, model:'Glimt · lokal'|'Glimt · regler',
//      head:'Rolig døgn på kristo.no.', pts:[{t, tone:'pos'|'neg'|'warn'|'info'|'neutral', color:'#2f7a4f'|'#9a5a10'|'#b23a2a'|'#1f7a6e'|'#8f897c'}],
//      meta:'Daglig · i dag kl. 07:00 · kristo.no' | 'Laget nå kl. 14:32 · Alle domener', gsc:boolean}
//   Daglig kl. 07:00 (Oslo) for hvert domene + «Alle» for hver admin. Push «Glimt · Domener: …» bare ved noe å gjøre (sertifikat < 30 d / fornyelse < 45 d).
//   Modell: lokal Ollama (JSON {head, pts:[{t, tone}]}), ellers regelbasert tekst. Ingen sky.
//
// GOOGLE SEARCH CONSOLE (claude-code-domener-search-console.md) – kun lesetilgang (webmasters.readonly)
//   GET    /api/gsc                → {connected, configured, email, scope:'webmasters.readonly', sites:[{siteUrl, permissionLevel}], selected:{domene: siteUrl}, error}
//   GET    /api/gsc/auth?return=…  → 302 til Google (PKCE, access_type=offline, prompt=consent). App: ?token=<app-token> eller ?code= fra POST /api/gsc/start
//   POST   /api/gsc/start {return?} → {url:'/api/gsc/auth?code=…'} (kortlivet kode, 5 min)
//   GET    /api/gsc/callback       → bytter koden, lagrer refresh-token KRYPTERT PER BRUKER, velger eiendom automatisk ved ett treff, 302 til return (?gsc=ok|error)
//   POST   /api/gsc/site {domain, siteUrl} → {ok, domain, siteUrl, backfill:true}  (16 måneder hentes i bakgrunnen første gang)
//   DELETE /api/gsc                → {ok:true}  (trekker tilbake tokenet hos Google, sletter token og GSC-tall for brukeren)
//   GET    /api/domains/:domain/gsc?period=7|28|90 (standard 28) →
//     ikke koblet: {connected:false, configured, scope, steps:[{n, t}], connectUrl:'/api/gsc/auth'}
//     velg eiendom: {connected:true, needsSite:true, candidates:[siteUrl]}
//     feil token:  {connected:false, reconnect:true, error}
//     ok: {connected:true, domain, site, account, period, from, to, dataTo, fetchedAt,
//          kpi:{clicks:{value, prev, changePct}, impressions:{…}, ctr:{value (0–1), prev, changePct}, position:{value, prev, change, better:'lower'}},
//          series:[{date, clicks, impressions}], queries:[{query, clicks, impressions, ctr, position}] (topp 8),
//          pages:[{path, clicks, impressions, ctr}] (topp 6), footer:'Koblet til som … · sc-domain:… · sist hentet i dag 06:00 · data til 16. okt'}
//   Cron 06:00: henter de siste 3 dagene på nytt (GSC reviderer) til gsc_daily / gsc_query / gsc_page. Første gang: 16 måneder.
import { Hono } from 'hono';
import { createCipheriv, createDecipheriv, createHash, randomBytes, hkdfSync } from 'node:crypto';
import { db, kv } from './db.js';
import { cfg } from './settings.js';
import { config } from './config.js';
import { sessionUser, userInfo, isAdmin, listUsers } from './auth.js';
import { bearerOk } from './finans/routes.js';
import { settings as fhSettings } from './finans/db.js';
import { notifyUser } from './notify.js';
import { summaryFacts, domainNames, domainsOverview, PER_RANGE, addDomain39, cloudflareZones39, cloudflareTxt39 } from './domains.js';
import { run as aiRun } from './ai-run.js';

const MOCK = process.env.MOCK_DATA === '1';
const TZ = 'Europe/Oslo';
const q = (sql) => db.prepare(sql);
const pad = (n) => String(n).padStart(2, '0');
const MON = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

db.exec(`CREATE TABLE IF NOT EXISTS domain_summary (
  user_id TEXT NOT NULL, domain TEXT NOT NULL, date TEXT NOT NULL, created_at INTEGER NOT NULL, manual INTEGER NOT NULL DEFAULT 0,
  head TEXT NOT NULL, points TEXT NOT NULL DEFAULT '[]', model TEXT, PRIMARY KEY (user_id, domain, date)
);
CREATE TABLE IF NOT EXISTS gsc_daily (user_id TEXT NOT NULL, domain TEXT NOT NULL, date TEXT NOT NULL, clicks INTEGER NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0, position REAL NOT NULL DEFAULT 0, PRIMARY KEY (user_id, domain, date));
CREATE TABLE IF NOT EXISTS gsc_query (user_id TEXT NOT NULL, domain TEXT NOT NULL, date TEXT NOT NULL, query TEXT NOT NULL, clicks INTEGER NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0, position REAL NOT NULL DEFAULT 0, PRIMARY KEY (user_id, domain, date, query));
CREATE TABLE IF NOT EXISTS gsc_page (user_id TEXT NOT NULL, domain TEXT NOT NULL, date TEXT NOT NULL, page TEXT NOT NULL, clicks INTEGER NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0, position REAL NOT NULL DEFAULT 0, PRIMARY KEY (user_id, domain, date, page));`);

/* ---------------- Tid ---------------- */

const osloParts = (t = Date.now()) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
const osloDate = (t = Date.now()) => { const p = osloParts(t); return `${p.year}-${p.month}-${p.day}`; };
const osloHm = (t = Date.now()) => { const p = osloParts(t); return `${p.hour}:${p.minute}`; };
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const shortD = (s) => `${+s.slice(8, 10)}. ${MON[+s.slice(5, 7) - 1]}`;

/* ---------------- Tilgang ---------------- */

const userOf = (c, write) => sessionUser(c) || (bearerOk(c, write ? 'finance:write' : 'finance:read') ? c.get('user') : null);
const adminGuard = async (c, next) => {
  const id = userOf(c, c.req.method !== 'GET');
  if (!id || !userInfo(id)) return c.json({ error: 'Ikke innlogget' }, 401);
  if (!isAdmin(id)) return c.json({ error: 'Bare administratorer har tilgang', restricted: true }, 403);
  c.set('user', id);
  await next();
};

/* ================= GLIMT · OPPSUMMERING ================= */

const COLOR = { pos: '#2f7a4f', neg: '#9a5a10', warn: '#b23a2a', info: '#1f7a6e', neutral: '#8f897c' };
const nb = (v) => Math.round(v).toLocaleString('nb-NO').replace(/ /g, ' ');
const big = (v) => (v >= 1e6 ? `${String(Math.round(v / 1e5) / 10).replace('.', ',')} mill.` : v >= 1e4 ? `${String(Math.round(v / 100) / 10).replace('.', ',')} k` : nb(v));
const sg = (v) => `${v > 0 ? '+' : ''}${String(v).replace('.', ',')} %`;
const pc = (v) => `${String(Math.round(v * 10) / 10).replace('.', ',')} %`;

/** Regelbasert oppsummering (samme som sumLocal i designet). F = summaryFacts(), gsc = gscFacts(). */
export function sumLocal(F, isAll, gsc = null) {
  const pts = [];
  if (!F.length) return { head: 'Ingen domener er lagt til ennå.', pts: [{ t: 'Legg til et domene under Domener → Legg til.', tone: 'neutral' }] };
  const tot = F.reduce((a, f) => a + f.req, 0), vis = F.reduce((a, f) => a + f.vis, 0), thr = F.reduce((a, f) => a + f.thr, 0);
  const warn = F.filter((f) => (f.certD != null && f.certD < 30) || (f.expD != null && f.expD < 45)).sort((a, b) => Math.min(a.certD ?? 999, a.expD ?? 999) - Math.min(b.certD ?? 999, b.expD ?? 999));
  const top = [...F].sort((a, b) => b.ch - a.ch)[0];
  let head;
  if (warn.length) { const w = warn[0]; head = w.certD != null && w.certD < 30 ? `Sertifikatet for ${w.name} går ut om ${w.certD} dager.` : `${w.name} må fornyes om ${w.expD} dager.`; }
  else if (F.some((f) => f.up === false)) head = `${F.find((f) => f.up === false).name} svarer ikke.`;
  else if (isAll) head = `Rolig døgn. Alle ${F.length} domener er oppe, med ${big(tot)} forespørsler totalt.`;
  else head = `${F[0].ch >= 10 ? 'Mer trafikk enn vanlig på ' : F[0].ch < 0 ? 'Litt roligere døgn på ' : 'Rolig døgn på '}${F[0].name}.`;
  if (isAll) {
    pts.push({ t: `${big(tot)} forespørsler og ${nb(vis)} unike besøkende siste døgn.`, tone: 'info' });
    if (top && F.length > 1) pts.push({ t: `${top.name} økte mest, ${sg(top.ch)} fra døgnet før.`, tone: top.ch >= 0 ? 'pos' : 'neg' });
  } else {
    const f = F[0];
    pts.push({ t: `${big(f.req)} forespørsler og ${nb(f.vis)} unike besøkende, ${sg(f.ch)} fra døgnet før.`, tone: f.ch >= 0 ? 'pos' : 'neg' });
    pts.push({ t: `${pc(f.cache)} ble levert fra cache.${f.ms ? ` Median svartid ${f.ms} ms.` : ''}`, tone: 'info' });
  }
  if (gsc?.clicks != null) pts.push({ t: `Klikk fra Google ${gsc.clicksCh >= 0 ? 'økte' : 'falt'} ${String(Math.abs(gsc.clicksCh)).replace('.', ',')} %.${gsc.newTop ? ` «${gsc.newTop}» er nytt på side 1.` : ''}`, tone: gsc.clicksCh >= 0 ? 'pos' : 'neg' });
  else pts.push({ t: `Cloudflare blokkerte ${nb(thr)} trusler, mest bot-trafikk.`, tone: 'warn' });
  const nx = [...F].filter((f) => f.certD != null).sort((a, b) => a.certD - b.certD)[0];
  if (warn.length) pts.push({ t: 'Forny i Cloudflare eller hos registraren før fristen.', tone: 'warn' });
  else if (nx) pts.push({ t: `Ingen frister snart. Neste sertifikat (${nx.name}) fornyes om ${nx.certD} dager.`, tone: 'neutral' });
  return { head, pts: pts.slice(0, 4) };
}

let sumLlm = null;
/** Bare for tester: (prompt, user) → tekst. */
export const _setSummaryLlm = (fn) => { sumLlm = fn; };
async function ollamaJson(prompt, user) {
  if (sumLlm) return sumLlm(prompt, user);
  if (MOCK && !process.env.OLLAMA_URL) return null;
  // Prompt 34: ruten «Domener · oppsummering» via ai.run (validert modell, reserve, jobblogg).
  return (await aiRun('dom', { user, prompt, json: true, temperature: 0.2, title: 'Domener · oppsummering', background: true })).text;
}

const normDomain = (d) => { const s = String(d ?? '').toLowerCase(); return s === '*' || s === 'alle' || s === 'all' ? '*' : s; };
const sumOut = (row, label) => {
  const pts = (() => { try { return JSON.parse(row.points); } catch { return []; } })();
  const hm = osloHm(row.created_at);
  const daily = !row.manual;
  return { domain: row.domain, label, date: row.date, createdAt: new Date(row.created_at).toISOString(), manual: !!row.manual, daily, ai: row.model === 'Glimt · lokal', model: row.model,
    head: row.head, pts: pts.map((p) => ({ t: p.t, tone: COLOR[p.tone] ? p.tone : 'info', color: COLOR[p.tone] ?? COLOR.info })),
    meta: `${daily ? `Daglig · i dag kl. ${hm}` : `Laget nå kl. ${hm}`} · ${label}`, gsc: !!pts.gsc };
};

/** Lager (og lagrer) dagens oppsummering for domenet ('*' = alle). */
export async function makeSummary(user, domain, { manual = false, now = Date.now() } = {}) {
  const sel = normDomain(domain), isAll = sel === '*';
  const F = await summaryFacts(sel);
  const gsc = !isAll ? gscFacts(user, sel) : null;
  let res = null, model = 'Glimt · regler';
  try {
    const facts = F.map((f) => ({ domene: f.name, foresporsler: Math.round(f.req), besokende: Math.round(f.vis), endringProsent: f.ch, trusler: Math.round(f.thr), cacheProsent: +Number(f.cache).toFixed(1), medianMs: f.ms, sertifikatDager: f.certD, fornyDager: f.expD }));
    const txt = await ollamaJson(`Du er Glimt, AI-assistenten i Nordlys. Lag en kort oppsummering på norsk av siste døgn for ${isAll ? 'alle domenene' : 'domenet'}. Varsler først (sertifikat under 30 dager, fornyelse under 45 dager). Svar KUN med JSON {"head":"én setning, det viktigste","pts":[{"t":"kort setning","tone":"pos|neg|info|warn"}]} med 3–4 punkter. Ingen markdown. Data: ${JSON.stringify(facts)}${gsc ? ` Google Søk (7 d): ${JSON.stringify(gsc)}` : ''}`, user);
    const m = txt && String(txt).match(/\{[\s\S]*\}/);
    const j = m ? JSON.parse(m[0]) : null;
    if (j && typeof j.head === 'string' && j.head.trim() && Array.isArray(j.pts) && j.pts.length) {
      res = { head: j.head.trim().slice(0, 200), pts: j.pts.slice(0, 4).map((p) => ({ t: String(p?.t ?? '').trim().slice(0, 240), tone: COLOR[p?.tone] ? p.tone : 'info' })).filter((p) => p.t) };
      model = 'Glimt · lokal';
    }
  } catch { /* modellen nede eller ugyldig svar */ }
  if (!res) res = sumLocal(F, isAll, gsc);
  const date = osloDate(now);
  q('INSERT OR REPLACE INTO domain_summary(user_id, domain, date, created_at, manual, head, points, model) VALUES(?,?,?,?,?,?,?,?)')
    .run(user, sel, date, now, manual ? 1 : 0, res.head, JSON.stringify(res.pts), model);
  q('DELETE FROM domain_summary WHERE user_id=? AND date<?').run(user, addDays(date, -30));
  const out = sumOut(q('SELECT * FROM domain_summary WHERE user_id=? AND domain=? AND date=?').get(user, sel, date), isAll ? 'Alle domener' : sel);
  return { ...out, gsc: !!gsc, warn: F.some((f) => (f.certD != null && f.certD < 30) || (f.expD != null && f.expD < 45)) };
}

/** Daglig kl. 07:00: alle domener + «Alle» for hver admin. Push bare når noe må gjøres. */
export async function dailySummaries(now = Date.now()) {
  const admins = listUsers().filter((u) => u.role === 'admin').map((u) => u.id);
  for (const u of admins) {
    for (const d of ['*', ...domainNames()]) {
      try {
        const s = await makeSummary(u, d, { now });
        if (s.warn && d !== '*') notifyUser(u, { title: 'Glimt · Domener', body: s.head, url: '/#/domener', tag: `dom-sum-${d}-${s.date}`, category: 'system', data: { kind: 'domain-summary', domain: d } }).catch(() => {});
      } catch (e) { console.warn('[domener] oppsummering:', d, e.message); }
    }
  }
}

/* ================= GOOGLE SEARCH CONSOLE ================= */

const G_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const G_TOKEN = 'https://oauth2.googleapis.com/token';
const G_REVOKE = 'https://oauth2.googleapis.com/revoke';
const G_WM = 'https://www.googleapis.com/webmasters/v3';
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const SCOPES = ['openid', 'email', GSC_SCOPE];
// Samme Google-klient som Bursdager/Kalender (Innstillinger → Integrasjoner → Google). Egen omdirigering kan settes med gscRedirectUri.
const googleClient = () => ({ id: String(cfg('googleClientId') ?? '').trim(), secret: String(cfg('googleClientSecret') ?? '').trim(), redirect: String(cfg('gscRedirectUri') ?? '').trim() });
let gscFetch = null;
/** Bare for tester: erstatter fetch mot Google. */
export const _setGscFetch = (fn) => { gscFetch = fn; accessCache.clear(); };
const mockGsc = () => MOCK && !gscFetch && !googleClient().id;
const fetchG = (url, init = {}) => (gscFetch ?? (mockGsc() ? fakeGoogle : fetch))(url, { ...init, signal: init.signal ?? AbortSignal.timeout(20_000) });

// Refresh-tokenet krypteres med en nøkkel avledet PER BRUKER (HKDF fra SECRET_KEY/SESSION_SECRET + bruker-id).
const userKey = (user) => Buffer.from(hkdfSync('sha256', process.env.SECRET_KEY || config.sessionSecret || 'dev', `gsc:${user}`, 'nordlys-gsc-token-v1', 32));
function sealFor(user, text) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', userKey(user), iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return 'gsc1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function unsealFor(user, v) {
  if (typeof v !== 'string' || !v.startsWith('gsc1:')) return '';
  try { const b = Buffer.from(v.slice(5), 'base64'), d = createDecipheriv('aes-256-gcm', userKey(user), b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); } catch { return ''; }
}
const conf = (user) => ({ sites: {}, fetched: {}, dataTo: {}, ...(kv.get(user, 'gsc', {}) ?? {}) });
const setConf = (user, patch) => kv.set(user, 'gsc', { ...conf(user), ...patch });
const connected = (user) => !!conf(user).refresh;

const accessCache = new Map();
async function tokenCall(params) {
  const r = await fetchG(G_TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error_description || j.error || `Google svarte ${r.status}`), { code: j.error, status: r.status });
  return j;
}
async function accessToken(user) {
  const hit = accessCache.get(user);
  if (hit && hit.exp > Date.now() + 30_000) return hit.token;
  const refresh = unsealFor(user, conf(user).refresh);
  if (!refresh) throw Object.assign(new Error('Ikke koblet til Google Search Console'), { status: 409 });
  const { id, secret } = googleClient();
  try {
    const j = await tokenCall({ grant_type: 'refresh_token', refresh_token: refresh, client_id: id, client_secret: secret });
    accessCache.set(user, { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 });
    return j.access_token;
  } catch (e) {
    if (e.code === 'invalid_grant') { setConf(user, { refresh: null, error: 'Google-tilgangen er utløpt eller trukket tilbake. Koble til på nytt.' }); accessCache.delete(user); }
    throw e;
  }
}
async function wm(user, method, path, body) {
  const tok = await accessToken(user);
  const r = await fetchG(`${G_WM}${path}`, { method, headers: { authorization: `Bearer ${tok}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (r.status === 401 || r.status === 403) { accessCache.delete(user); setConf(user, { error: `Google avviste tilgangen (${r.status}). Koble til på nytt.` }); }
  if (!r.ok) throw Object.assign(new Error(j?.error?.message ? `Google: ${j.error.message}` : `Google svarte ${r.status}`), { status: r.status });
  return j;
}

/* --- Innebygd Google (MOCK_DATA=1 uten Google-klient): deterministiske tall, ingen nett --- */
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
async function fakeGoogle(url, init = {}) {
  const u = String(url), json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
  if (u === G_TOKEN) {
    const p = new URLSearchParams(String(init.body ?? ''));
    const idt = `x.${Buffer.from(JSON.stringify({ email: 'sebastian@kristo.no' })).toString('base64url')}.y`;
    return json({ access_token: 'mock-access', expires_in: 3600, scope: SCOPES.join(' '), id_token: idt, ...(p.get('grant_type') === 'authorization_code' ? { refresh_token: 'mock-refresh' } : {}) });
  }
  if (u.startsWith(G_REVOKE)) return json({});
  if (u === `${G_WM}/sites`) return json({ siteEntry: domainNames().map((d) => ({ siteUrl: `sc-domain:${d.split('.').slice(-2).join('.')}`, permissionLevel: 'siteOwner' })).filter((x, i, a) => a.findIndex((y) => y.siteUrl === x.siteUrl) === i) });
  const m = u.match(/\/sites\/([^/]+)\/searchAnalytics\/query$/);
  if (m) {
    const site = decodeURIComponent(m[1]), b = JSON.parse(String(init.body ?? '{}'));
    const rows = [];
    const QS = ['kristo', 'kristo priser', 'sebastian kristo', 'homelab norge', 'nordlys os', 'kristo cv', 'kristo.no', 'selvhostet dashboard', 'finanshub', 'ollama hjemme'];
    const PS = ['/', '/cv', '/prosjekter', '/blogg/homelab', '/kontakt', '/om'];
    for (let d = b.startDate; d <= b.endDate; d = addDays(d, 1)) {
      const r = rng(hash(site + d)), wk = [0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay()) ? 0.7 : 1;
      const clicks = Math.round((40 + r() * 22) * wk), impr = Math.round(clicks * (22 + r() * 8));
      if (b.dimensions.length === 1) rows.push({ keys: [d], clicks, impressions: impr, ctr: clicks / impr, position: 8 + r() * 4 });
      else {
        const list = b.dimensions[1] === 'query' ? QS : PS.map((p) => `https://${site.replace(/^sc-domain:/, '')}${p}`);
        list.forEach((k, i) => { const f = [0.34, 0.16, 0.11, 0.08, 0.06, 0.05, 0.04, 0.03, 0.02, 0.02][i] ?? 0.01; const c = Math.round(clicks * f), im = Math.max(c, Math.round(impr * f * (0.8 + r() * 0.4)));
          rows.push({ keys: [d, k], clicks: c, impressions: im, ctr: im ? c / im : 0, position: Math.round((1 + i * 1.6 + r() * 2) * 10) / 10 }); });
      }
    }
    return json({ rows });
  }
  return json({ error: { message: 'ukjent' } }, 404);
}

/* --- Henting og lagring --- */
const LAG = 2; // GSC har 2–3 dagers forsinkelse
async function fetchRange(user, domain, site, from, to) {
  const path = `/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  const day = await wm(user, 'POST', path, { startDate: from, endDate: to, dimensions: ['date'], rowLimit: 25000, dataState: 'all' });
  const qq = await wm(user, 'POST', path, { startDate: from, endDate: to, dimensions: ['date', 'query'], rowLimit: 25000, dataState: 'all' });
  const pg = await wm(user, 'POST', path, { startDate: from, endDate: to, dimensions: ['date', 'page'], rowLimit: 25000, dataState: 'all' });
  db.transaction(() => {
    for (const t of ['gsc_daily', 'gsc_query', 'gsc_page']) q(`DELETE FROM ${t} WHERE user_id=? AND domain=? AND date>=? AND date<=?`).run(user, domain, from, to);
    const d = q('INSERT OR REPLACE INTO gsc_daily VALUES(?,?,?,?,?,?,?)'), dq = q('INSERT OR REPLACE INTO gsc_query VALUES(?,?,?,?,?,?,?,?)'), dp = q('INSERT OR REPLACE INTO gsc_page VALUES(?,?,?,?,?,?,?,?)');
    for (const r of day?.rows ?? []) d.run(user, domain, r.keys[0], r.clicks | 0, r.impressions | 0, +r.ctr || 0, +r.position || 0);
    for (const r of qq?.rows ?? []) dq.run(user, domain, r.keys[0], String(r.keys[1]).slice(0, 300), r.clicks | 0, r.impressions | 0, +r.ctr || 0, +r.position || 0);
    for (const r of pg?.rows ?? []) dp.run(user, domain, r.keys[0], String(r.keys[1]).slice(0, 500), r.clicks | 0, r.impressions | 0, +r.ctr || 0, +r.position || 0);
  })();
  const last = q('SELECT max(date) FROM gsc_daily WHERE user_id=? AND domain=?').pluck().get(user, domain);
  const c = conf(user);
  setConf(user, { fetched: { ...c.fetched, [domain]: Date.now() }, dataTo: { ...c.dataTo, [domain]: last ?? null }, error: null });
}
/** Første gang: 16 måneder (i biter på 90 dager). Ellers: de siste 3 dagene på nytt. */
export async function syncGsc(user, domain, { full = false } = {}) {
  const site = conf(user).sites?.[domain];
  if (!site) return;
  const end = addDays(osloDate(), -LAG);
  const have = q('SELECT count(*) FROM gsc_daily WHERE user_id=? AND domain=?').pluck().get(user, domain);
  if (full || !have) { for (let s = addDays(end, -486); s <= end; s = addDays(s, 90)) { const e = addDays(s, 89) < end ? addDays(s, 89) : end; await fetchRange(user, domain, site, s, e); } }
  else await fetchRange(user, domain, site, addDays(end, -3), end);
}
export async function dailyGsc() {
  for (const { user } of q("SELECT user AS user FROM kv WHERE key='gsc'").all()) {
    if (!connected(user)) continue;
    for (const d of Object.keys(conf(user).sites ?? {})) { try { await syncGsc(user, d); } catch (e) { console.warn('[gsc]', d, e.message); } }
  }
}

function agg(user, domain, from, to) {
  const r = q('SELECT sum(clicks) c, sum(impressions) i, sum(position*impressions) pw FROM gsc_daily WHERE user_id=? AND domain=? AND date>=? AND date<=?').get(user, domain, from, to);
  const c = r?.c ?? 0, i = r?.i ?? 0;
  return { clicks: c, impressions: i, ctr: i ? c / i : 0, position: i ? r.pw / i : 0 };
}
const chg = (a, b) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);
/** Tall til Glimt-oppsummeringen (7 d mot 7 d før), eller null. */
export function gscFacts(user, domain) {
  if (!connected(user) || !conf(user).sites?.[domain]) return null;
  const to = q('SELECT max(date) FROM gsc_daily WHERE user_id=? AND domain=?').pluck().get(user, domain);
  if (!to) return null;
  const a = agg(user, domain, addDays(to, -6), to), b = agg(user, domain, addDays(to, -13), addDays(to, -7));
  const pos = (from, t) => new Map(q('SELECT query, sum(position*impressions)/max(1,sum(impressions)) p FROM gsc_query WHERE user_id=? AND domain=? AND date>=? AND date<=? GROUP BY query').all(user, domain, from, t).map((r) => [r.query, r.p]));
  const now = pos(addDays(to, -6), to), before = pos(addDays(to, -13), addDays(to, -7));
  const newTop = [...now].filter(([k, p]) => p <= 10 && (!before.has(k) || before.get(k) > 10)).sort((x, y) => x[1] - y[1])[0]?.[0] ?? null;
  return { clicks: a.clicks, clicksCh: chg(a.clicks, b.clicks) ?? 0, impressions: a.impressions, position: Math.round(a.position * 10) / 10, newTop };
}

export function gscView(user, domain, period = 28) {
  const c = conf(user);
  const steps = [{ n: '1', t: 'Logg inn med Google-kontoen som eier eiendommen' }, { n: '2', t: `Velg eiendom, f.eks. sc-domain:${domain}` }, { n: '3', t: 'Data for de siste 16 månedene hentes inn' }];
  const base = { configured: !!googleClient().id || mockGsc(), scope: 'webmasters.readonly', scopeNote: 'Kun lesetilgang · webmasters.readonly', steps, connectUrl: '/api/gsc/auth' };
  if (!c.refresh) return { connected: false, ...base, ...(c.error ? { reconnect: true, error: c.error } : {}) };
  const site = c.sites?.[domain];
  if (!site) return { connected: true, needsSite: true, ...base, account: c.email ?? null, candidates: (c.siteList ?? []).filter((s) => siteMatches(s.siteUrl, domain)).map((s) => s.siteUrl), sites: c.siteList ?? [] };
  const to = q('SELECT max(date) FROM gsc_daily WHERE user_id=? AND domain=?').pluck().get(user, domain);
  if (!to) return { connected: true, domain, site, account: c.email ?? null, period, loading: true, ...(c.error ? { error: c.error } : {}) };
  const from = addDays(to, -(period - 1)), pFrom = addDays(from, -period), pTo = addDays(from, -1);
  const a = agg(user, domain, from, to), b = agg(user, domain, pFrom, pTo);
  const series = q('SELECT date, clicks, impressions FROM gsc_daily WHERE user_id=? AND domain=? AND date>=? AND date<=? ORDER BY date').all(user, domain, from, to);
  const queries = q(`SELECT query, sum(clicks) clicks, sum(impressions) impressions, sum(position*impressions)/max(1,sum(impressions)) position FROM gsc_query
    WHERE user_id=? AND domain=? AND date>=? AND date<=? GROUP BY query ORDER BY clicks DESC, impressions DESC LIMIT 8`).all(user, domain, from, to)
    .map((r) => ({ query: r.query, clicks: r.clicks, impressions: r.impressions, ctr: r.impressions ? Math.round((r.clicks / r.impressions) * 1000) / 1000 : 0, position: Math.round(r.position * 10) / 10 }));
  const pages = q(`SELECT page, sum(clicks) clicks, sum(impressions) impressions FROM gsc_page WHERE user_id=? AND domain=? AND date>=? AND date<=? GROUP BY page ORDER BY clicks DESC LIMIT 6`).all(user, domain, from, to)
    .map((r) => { let path = r.page; try { path = new URL(r.page).pathname || '/'; } catch { /* allerede sti */ } return { path, clicks: r.clicks, impressions: r.impressions, ctr: r.impressions ? Math.round((r.clicks / r.impressions) * 1000) / 1000 : 0 }; });
  const fetchedAt = c.fetched?.[domain] ?? null;
  const when = fetchedAt ? (osloDate(fetchedAt) === osloDate() ? `i dag ${osloHm(fetchedAt)}` : `${shortD(osloDate(fetchedAt))} ${osloHm(fetchedAt)}`) : 'aldri';
  const r3 = (v) => Math.round(v * 1000) / 1000, r1 = (v) => Math.round(v * 10) / 10;
  return { connected: true, domain, site, account: c.email ?? null, period, from, to, dataTo: to, fetchedAt: fetchedAt ? new Date(fetchedAt).toISOString() : null,
    kpi: { clicks: { value: a.clicks, prev: b.clicks, changePct: chg(a.clicks, b.clicks) }, impressions: { value: a.impressions, prev: b.impressions, changePct: chg(a.impressions, b.impressions) },
      ctr: { value: r3(a.ctr), prev: r3(b.ctr), changePct: chg(a.ctr, b.ctr) }, position: { value: r1(a.position), prev: r1(b.position), change: r1(a.position - b.position), better: 'lower' } },
    series, queries, pages, footer: `Koblet til som ${c.email ?? 'Google-konto'} · ${site} · sist hentet ${when} · data til ${shortD(to)}`, ...(c.error ? { error: c.error } : {}) };
}
const siteMatches = (s, domain) => { const d = domain.toLowerCase(); return s === `sc-domain:${d}` || s === `https://${d}/` || s === `http://${d}/` || s === `sc-domain:${d.split('.').slice(-2).join('.')}`; };
async function loadSites(user) {
  const j = await wm(user, 'GET', '/sites');
  const list = (j?.siteEntry ?? []).map((s) => ({ siteUrl: String(s.siteUrl), permissionLevel: String(s.permissionLevel ?? '') })).filter((s) => s.permissionLevel !== 'siteUnverifiedUser');
  const sites = { ...(conf(user).sites ?? {}) };
  for (const d of domainNames()) { if (sites[d]) continue; const hits = list.filter((s) => siteMatches(s.siteUrl, d)); const exact = hits.find((s) => s.siteUrl === `sc-domain:${d}`) ?? (hits.length === 1 ? hits[0] : null); if (exact) sites[d] = exact.siteUrl; }
  setConf(user, { siteList: list, sites });
  return { list, sites };
}

/* ---------------- Ruter ---------------- */

const b64u = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const pending = new Map(), startCodes = new Map();
const sweep = () => { const t = Date.now(); for (const m of [pending, startCodes]) for (const [k, v] of m) if (v.exp < t) m.delete(k); };
const originOf = (c) => { const u = new URL(c.req.url); const proto = c.req.header('x-forwarded-proto')?.split(',')[0].trim() || u.protocol.replace(':', ''); const host = c.req.header('x-forwarded-host')?.split(',')[0].trim() || c.req.header('host') || u.host; return `${proto}://${host}`; };
const safeReturn = (v) => { const s = String(v ?? '').trim(); return /^finanshub:\/\/[\w./?=&%#-]*$/i.test(s) || /^\/(?!\/)[\w./?=&%#-]*$/.test(s) ? s : '/#/domener'; };
const withQuery = (url, params) => { const [b, h] = url.split('#'); return `${b}${b.includes('?') ? '&' : '?'}${new URLSearchParams(params)}${h !== undefined ? `#${h}` : ''}`; };
const TOKEN_Q = /^fh_[A-Za-z0-9_-]{20,}$/;

export const gscApi = new Hono();
gscApi.get('/callback', async (c) => {
  sweep();
  const st = pending.get(c.req.query('state') ?? '');
  if (!st) return c.html('<!doctype html><meta charset="utf-8"><title>Google Search Console</title><p>Innloggingen er utløpt. Gå tilbake og prøv igjen.</p>', 400);
  pending.delete(c.req.query('state'));
  if (c.req.query('error')) return c.redirect(withQuery(st.ret, { gsc: 'error', error: String(c.req.query('error')).slice(0, 100) }));
  const { id, secret } = googleClient();
  try {
    const j = await tokenCall({ grant_type: 'authorization_code', code: c.req.query('code') ?? '', client_id: id, client_secret: secret, redirect_uri: st.redirect, code_verifier: st.verifier });
    if (j.scope && !String(j.scope).includes(GSC_SCOPE)) throw new Error('Google ga ikke tilgang til Search Console (webmasters.readonly).');
    let email = null;
    try { email = JSON.parse(Buffer.from(String(j.id_token).split('.')[1], 'base64').toString()).email ?? null; } catch { /* */ }
    const cur = conf(st.user);
    const refresh = j.refresh_token ? sealFor(st.user, j.refresh_token) : cur.refresh;
    if (!refresh) throw new Error('Google ga ikke noe refresh-token. Fjern tilgangen under myaccount.google.com og prøv igjen.');
    setConf(st.user, { refresh, email, connectedAt: new Date().toISOString(), error: null });
    accessCache.set(st.user, { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 });
    const { sites } = await loadSites(st.user).catch(() => ({ sites: {} }));
    for (const d of Object.keys(sites)) syncGsc(st.user, d).catch((e) => console.warn('[gsc]', e.message));
    return c.redirect(withQuery(st.ret, { gsc: 'ok' }));
  } catch (e) { return c.redirect(withQuery(st.ret, { gsc: 'error', error: e.message.slice(0, 200) })); }
});
gscApi.get('/auth', async (c, next) => {
  sweep();
  const code = c.req.query('code');
  if (code && startCodes.has(code)) { const s = startCodes.get(code); startCodes.delete(code); c.set('user', s.user); c.set('ret', s.ret); return next(); }
  const t = c.req.query('token');
  if (t && TOKEN_Q.test(t) && !c.req.header('authorization')) c.req.raw.headers.set('authorization', `Bearer ${t}`);
  return adminGuard(c, next);
}, (c) => {
  const client = googleClient();
  if (!client.id && !mockGsc()) return c.html('<!doctype html><meta charset="utf-8"><title>Google Search Console</title><p>Google er ikke satt opp. En administrator må legge inn klient-ID og hemmelighet under Innstillinger → Integrasjoner → Google.</p>', 409);
  const verifier = b64u(randomBytes(32)), state = b64u(randomBytes(18));
  const redirect = client.redirect || `${originOf(c)}/api/gsc/callback`;
  let ret = c.get('ret') ?? safeReturn(c.req.query('return'));
  if (ret.startsWith('/')) ret = `${originOf(c)}${ret}`;
  pending.set(state, { user: c.get('user'), verifier, ret, redirect, exp: Date.now() + 10 * 60_000 });
  if (mockGsc()) return c.redirect(`/api/gsc/callback?state=${state}&code=mock`);
  const p = new URLSearchParams({ client_id: client.id, redirect_uri: redirect, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent',
    code_challenge: b64u(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256', state });
  return c.redirect(`${G_AUTH}?${p}`);
});
gscApi.use('*', adminGuard);
gscApi.post('/start', async (c) => {
  sweep();
  const b = await c.req.json().catch(() => ({}));
  const code = b64u(randomBytes(18));
  startCodes.set(code, { user: c.get('user'), ret: safeReturn(b?.return), exp: Date.now() + 5 * 60_000 });
  return c.json({ url: `/api/gsc/auth?code=${code}` });
});
gscApi.get('/', async (c) => {
  const u = c.get('user'), cur = conf(u);
  if (cur.refresh && c.req.query('refresh') === '1') await loadSites(u).catch(() => {});
  const x = conf(u);
  return c.json({ connected: !!x.refresh, configured: !!googleClient().id || mockGsc(), email: x.email ?? null, scope: 'webmasters.readonly', sites: x.siteList ?? [], selected: x.sites ?? {}, error: x.error ?? null });
});
gscApi.post('/site', async (c) => {
  const u = c.get('user'), b = await c.req.json().catch(() => null);
  const domain = String(b?.domain ?? '').toLowerCase(), siteUrl = String(b?.siteUrl ?? '');
  if (!connected(u)) return c.json({ error: 'Ikke koblet til Google Search Console' }, 409);
  if (!domainNames().includes(domain)) return c.json({ error: 'Ukjent domene' }, 400);
  if (!/^(sc-domain:[a-z0-9.-]+|https?:\/\/[^\s]+\/)$/i.test(siteUrl) || siteUrl.length > 300) return c.json({ error: 'Ugyldig eiendom (sc-domain:… eller https://…/)' }, 400);
  const list = conf(u).siteList ?? (await loadSites(u).catch(() => ({ list: [] }))).list;
  if (list.length && !list.some((s) => s.siteUrl === siteUrl)) return c.json({ error: 'Kontoen har ikke tilgang til den eiendommen' }, 400);
  const cur = conf(u);
  setConf(u, { sites: { ...cur.sites, [domain]: siteUrl } });
  q('DELETE FROM gsc_daily WHERE user_id=? AND domain=?').run(u, domain);
  syncGsc(u, domain, { full: true }).catch((e) => console.warn('[gsc]', e.message));
  return c.json({ ok: true, domain, siteUrl, backfill: true });
});
gscApi.delete('/', async (c) => {
  const u = c.get('user'), refresh = unsealFor(u, conf(u).refresh);
  if (refresh) await fetchG(`${G_REVOKE}?token=${encodeURIComponent(refresh)}`, { method: 'POST' }).catch(() => {});
  kv.del(u, 'gsc');
  accessCache.delete(u);
  for (const t of ['gsc_daily', 'gsc_query', 'gsc_page']) q(`DELETE FROM ${t} WHERE user_id=?`).run(u);
  return c.json({ ok: true });
});

/** /api/domains/:domain/summary og /api/domains/:domain/gsc (bare admin). */
export const domainGlimtApi = new Hono();
const known = (d) => d === '*' || domainNames().includes(d);
// Prompt 36: oppsummeringen blokkerer aldri. Finnes dagens, gis den. Ellers startes den i bakgrunnen, og svaret er den
// siste lagrede (stale:true) eller den regelbaserte (sumLocal) med pending:true. ?wait=1 venter som før.
const inflight = new Map();
const makeBg = (u, d) => { const k = `${u}|${d}`; if (!inflight.has(k)) inflight.set(k, makeSummary(u, d).catch((e) => { console.warn('[domener] oppsummering:', e.message); return null; }).finally(() => inflight.delete(k))); return inflight.get(k); };
export async function summaryNow(u, d, { wait = false, graceMs = 250 } = {}) {
  const label = d === '*' ? 'Alle domener' : d;
  const row = q('SELECT * FROM domain_summary WHERE user_id=? AND domain=? AND date=?').get(u, d, osloDate());
  if (row) return sumOut(row, label);
  const job = makeBg(u, d);
  const quick = wait ? await job : await Promise.race([job, new Promise((r) => setTimeout(() => r(undefined), graceMs))]);
  if (quick) { const { warn, ...s } = quick; return s; }
  const last = q('SELECT * FROM domain_summary WHERE user_id=? AND domain=? ORDER BY date DESC LIMIT 1').get(u, d);
  if (last) return { ...sumOut(last, label), stale: true, pending: true };
  const F = await summaryFacts(d).catch(() => []);
  const loc = sumLocal(F, d === '*');
  return { domain: d, label, date: osloDate(), createdAt: new Date().toISOString(), manual: false, daily: false, ai: false, model: 'Glimt · regler', head: loc.head,
    pts: loc.pts.map((p) => ({ t: p.t, tone: COLOR[p.tone] ? p.tone : 'info', color: COLOR[p.tone] ?? COLOR.info })), meta: `Glimt leser statistikken … · ${label}`, pending: true };
}
/* ---------------- Prompt 39: eiendommer, hent domener og «Legg inn for meg» ---------------- */
// GET /api/domains/gsc/sites → {connected, configured, email, scope, count, sites:[{domain, siteUrls:['sc-domain:x','https://x/'], permission:'eier'|'full'|'begrenset',
//        permissionLevel, state:'bruk'|'i-bruk'|'legg-til', added, selected}], error?}   (sc-domain: og https:// slått sammen til ett domene)
//   Ikke koblet: {connected:false, configured, scope, connectUrl:'/api/gsc/auth', steps:[…]}
// GET /api/domains/import → {gsc:{connected, items:[{name, permission, added}]}, cloudflare:{connected, items:[{name, plan, status, added}]}, newInAccount:[navn]}
// POST /api/domains/import {source:'gsc'|'cloudflare', domains:[navn]|'all'} → {ok, added:[navn], existing:[navn], errors:[{name, error}]}
//   Domene fra GSC får kilde 'gsc' (sourceLabel «Google Search Console»), og eiendommen velges automatisk for Google Søk.
// POST /api/domains/:domain/gsc/verify → {ok, domain, state:'verified'|'pending'|'error', verified, txt:{name, content, created, zone}, message}
//   Token fra Site Verification API (DNS_TXT), TXT-posten lages i Cloudflare (krever DNS:Edit), så webResource.insert (prøver 3 ganger).
export const GSC_STEPS39 = [
  { n: 1, t: 'Åpne Search Console og logg inn', url: 'https://search.google.com/search-console' },
  { n: 2, t: 'Legg til eiendom → «Domene»' },
  { n: 3, t: 'Bekreft med DNS: TXT-post i Cloudflare, eller «Legg inn for meg» hvis tokenet har DNS:Edit' },
  { n: 4, t: 'Trykk «Bekreft» (minutter til 24 t, TXT-posten må bli liggende)' },
  { n: 5, t: 'Koble til Homelab (godta «Se Search Console-data»)' },
  { n: 6, t: 'Velg domenene (16 måneder hentes)' },
];
const PERM = { siteOwner: 'eier', siteFullUser: 'full', siteRestrictedUser: 'begrenset' };
const domainOfSite = (u) => String(u).replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase();
async function sitesMerged(u) {
  const { list } = await loadSites(u);
  const have = new Set(domainNames()), sel = conf(u).sites ?? {};
  const by = new Map();
  for (const s of list) {
    const d = domainOfSite(s.siteUrl);
    const cur = by.get(d) ?? { domain: d, siteUrls: [], permissionLevel: s.permissionLevel };
    cur.siteUrls.push(s.siteUrl);
    if (s.permissionLevel === 'siteOwner') cur.permissionLevel = 'siteOwner';
    by.set(d, cur);
  }
  return [...by.values()].sort((a, b) => a.domain.localeCompare(b.domain)).map((x) => {
    const added = have.has(x.domain), selected = sel[x.domain] ?? null;
    return { ...x, siteUrls: x.siteUrls.sort((a, b) => (a.startsWith('sc-domain:') ? -1 : b.startsWith('sc-domain:') ? 1 : 0)), permission: PERM[x.permissionLevel] ?? 'begrenset', added, selected, state: added ? (selected ? 'i-bruk' : 'bruk') : 'legg-til' };
  });
}
domainGlimtApi.get('/gsc/sites', adminGuard, async (c) => {
  const u = c.get('user'), x = conf(u);
  const configured = !!googleClient().id || mockGsc();
  if (!x.refresh) return c.json({ connected: false, configured, scope: 'webmasters.readonly', connectUrl: '/api/gsc/auth', steps: GSC_STEPS39, sites: [], count: 0 });
  try { const sites = await sitesMerged(u); return c.json({ connected: true, configured, email: x.email ?? null, scope: 'webmasters.readonly', count: sites.length, sites, label: `${sites.length} ${sites.length === 1 ? 'eiendom' : 'eiendommer'} · kun lesetilgang` }); }
  catch (e) { return c.json({ connected: false, reconnect: true, configured, error: e.message, sites: [], count: 0 }); }
});
domainGlimtApi.get('/import', adminGuard, async (c) => {
  const u = c.get('user'), have = new Set(domainNames());
  let gsc = { connected: false, items: [] };
  if (conf(u).refresh) { try { gsc = { connected: true, items: (await sitesMerged(u)).map((s) => ({ name: s.domain, permission: s.permission, siteUrls: s.siteUrls, added: s.added })) }; } catch (e) { gsc = { connected: false, reconnect: true, error: e.message, items: [] }; } }
  const cf = await cloudflareZones39();
  const cloudflare = { connected: cf.connected, ...(cf.error ? { error: cf.error } : {}), items: cf.zones.map((z) => ({ name: z.name, plan: z.plan, status: z.status, added: have.has(z.name) })) };
  const seen = kv.get(u, 'dom39_seen', []) ?? [];
  const all = [...new Set([...gsc.items, ...cloudflare.items].map((x) => x.name))];
  const newInAccount = Array.isArray(seen) && seen.length ? all.filter((n) => !seen.includes(n) && !have.has(n)) : [];
  kv.set(u, 'dom39_seen', all);
  return c.json({ title: 'HENT DOMENER · Fra Cloudflare og Google Search Console', gsc, cloudflare, newInAccount });
});
domainGlimtApi.post('/import', adminGuard, async (c) => {
  const u = c.get('user'), b = await c.req.json().catch(() => null);
  const source = b?.source === 'cloudflare' ? 'cloudflare' : b?.source === 'gsc' ? 'gsc' : null;
  if (!source) return c.json({ error: 'source må være gsc eller cloudflare' }, 400);
  let names = b.domains;
  if (names === 'all') {
    names = source === 'gsc' ? (conf(u).refresh ? (await sitesMerged(u).catch(() => [])).filter((s) => !s.added).map((s) => s.domain) : []) : (await cloudflareZones39()).zones.map((z) => z.name);
  }
  if (!Array.isArray(names) || !names.length || names.length > 100) return c.json({ error: 'Velg minst ett domene' }, 400);
  const added = [], existing = [], errors = [];
  const sites = source === 'gsc' ? await sitesMerged(u).catch(() => []) : [];
  for (const n of names) {
    const r = addDomain39(n, source, `import:${source}`);
    if (r.error) { errors.push({ name: n, error: r.error }); continue; }
    (r.added ? added : existing).push(r.row.name);
    if (source === 'gsc') { const s = sites.find((x) => x.domain === r.row.name); if (s && !conf(u).sites?.[r.row.name]) { setConf(u, { sites: { ...(conf(u).sites ?? {}), [r.row.name]: s.siteUrls[0] } }); syncGsc(u, r.row.name, { full: true }).catch((e) => console.warn('[gsc]', e.message)); } }
  }
  return c.json({ ok: !errors.length, added, existing, errors }, added.length ? 201 : 200);
});
const G_SV = 'https://www.googleapis.com/siteVerification/v1';
domainGlimtApi.post('/:domain/gsc/verify', adminGuard, async (c) => {
  const u = c.get('user'), d = normDomain(c.req.param('domain'));
  if (d === '*' || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return c.json({ error: 'Ugyldig domene' }, 400);
  if (!connected(u)) return c.json({ error: 'Koble til Google Search Console først', state: 'error' }, 409);
  const site = { type: 'INET_DOMAIN', identifier: d };
  try {
    let content;
    if (mockGsc()) content = `google-site-verification=mock-${createHash('sha1').update(d).digest('hex').slice(0, 20)}`;
    else {
      const tok = await accessToken(u);
      const r = await fetchG(`${G_SV}/token`, { method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify({ site, verificationMethod: 'DNS_TXT' }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 403 || r.status === 401) return c.json({ ok: false, domain: d, state: 'error', needsScope: true, error: 'Google-tilkoblingen mangler tilgang til Site Verification. Legg inn TXT-posten selv (se ?-guiden), eller koble til på nytt.' }, 409);
      if (!r.ok || !j.token) return c.json({ ok: false, domain: d, state: 'error', error: j.error?.message ?? `Google svarte ${r.status}` }, 502);
      content = j.token;
    }
    const txt = await cloudflareTxt39(d, content);
    let verified = false, msg = '';
    for (let i = 0; i < 3 && !verified; i++) {
      if (mockGsc()) { verified = true; break; }
      const tok = await accessToken(u);
      const r = await fetchG(`${G_SV}/webResource?verificationMethod=DNS_TXT`, { method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify({ site }) });
      if (r.ok) verified = true;
      else { msg = (await r.json().catch(() => ({}))).error?.message ?? `Google svarte ${r.status}`; await new Promise((res) => setTimeout(res, 2000)); }
    }
    if (verified) loadSites(u).catch(() => {});
    return c.json({ ok: true, domain: d, verified, state: verified ? 'verified' : 'pending', txt: { name: d, content, created: txt.created, zone: txt.zone },
      message: verified ? `✓ ${d} er bekreftet i Search Console` : `TXT-posten er lagt inn. Google har ikke sett den ennå (${msg || 'kan ta fra minutter til 24 t'}). Prøv «Bekreft» igjen senere.` });
  } catch (e) { return c.json({ ok: false, domain: d, state: 'error', error: e.message }, e.status === 409 ? 409 : 502); }
});

domainGlimtApi.get('/:domain/summary', adminGuard, async (c) => {
  const u = c.get('user'), d = normDomain(c.req.param('domain'));
  if (!known(d)) return c.json({ error: 'Fant ikke domenet' }, 404);
  return c.json(await summaryNow(u, d, { wait: c.req.query('wait') === '1' }));
});
/**
 * Prompt 36: GET /api/domains/overview?per=24t|7d|30d[&domain=] – alt Domener trenger i ett svar (KPI-er, grafer, land,
 * sider, oppetid, per domene), server-cache 5 min. gsc: Google Søk fra den daglige synken (6 t, ingen nye kall her).
 * summary: dagens lagrede Glimt-oppsummering eller null – den lages aldri her (egen rute, ikke-blokkerende).
 * Prompt 38: ?all=1 (med domain=*) gir i tillegg byDomain:{<navn>: samme form for ett domene + summary/summaryUrl}.
 */
domainGlimtApi.get('/overview', adminGuard, async (c) => {
  const u = c.get('user');
  const per = PER_RANGE[c.req.query('per') ?? ''] ? c.req.query('per') : '24t';
  const d = normDomain(c.req.query('domain') ?? '*');
  if (!known(d)) return c.json({ error: 'Fant ikke domenet' }, 404);
  const o = await domainsOverview(per, d);
  if (!o) return c.json({ error: 'Fant ikke domenet' }, 404);
  let gsc = null;
  if (d !== '*') { try { const v = gscView(u, d, 28); gsc = v.connected && !v.loading ? v : { connected: !!v.connected, loading: !!v.loading, needsSite: !!v.needsSite }; } catch { gsc = null; } }
  else if (connected(u)) {
    // Prompt 39: Google Søk for alle domener (sum av klikk og visninger siste 28 dager per domene med valgt eiendom).
    try {
      const per = Object.keys(conf(u).sites ?? {}).map((x) => { const v = gscView(u, x, 28); return v.connected && v.kpi ? { domain: x, clicks: v.kpi.clicks.value, impressions: v.kpi.impressions.value, clicksChangePct: v.kpi.clicks.changePct } : null; }).filter(Boolean);
      gsc = { connected: true, all: true, period: 28, clicks: per.reduce((a, x) => a + (x.clicks ?? 0), 0), impressions: per.reduce((a, x) => a + (x.impressions ?? 0), 0), perDomain: per };
    } catch { gsc = { connected: true, all: true, perDomain: [] }; }
  }
  const row = q('SELECT * FROM domain_summary WHERE user_id=? AND domain=? AND date=?').get(u, d, osloDate());
  // Prompt 38: ?all=1 → også hvert domene (byDomain) i samme svar, så alt er lastet når Domener åpnes. Glimt lages aldri her.
  let byDomain;
  if (c.req.query('all') === '1' && d === '*') {
    byDomain = Object.fromEntries((await Promise.all((o.domains ?? []).map(async (x) => {
      const one = await domainsOverview(per, x.name).catch(() => null);
      const sr = one ? q('SELECT * FROM domain_summary WHERE user_id=? AND domain=? AND date=?').get(u, x.name, osloDate()) : null;
      return one ? [x.name, { ...one, summary: sr ? sumOut(sr, x.name) : null, summaryUrl: `/api/domains/${encodeURIComponent(x.name)}/summary` }] : null;
    }))).filter(Boolean));
  }
  return c.json({ ...o, ...(byDomain ? { byDomain } : {}), gsc, summary: row ? sumOut(row, d === '*' ? 'Alle domener' : d) : null, summaryUrl: `/api/domains/${encodeURIComponent(d)}/summary` }, 200, { 'Cache-Control': 'private, max-age=60' });
});
domainGlimtApi.post('/:domain/summary', adminGuard, async (c) => {
  const u = c.get('user'), d = normDomain(c.req.param('domain'));
  if (!known(d)) return c.json({ error: 'Fant ikke domenet' }, 404);
  const { warn, ...s } = await makeSummary(u, d, { manual: true });
  return c.json(s);
});
domainGlimtApi.get('/:domain/gsc', adminGuard, async (c) => {
  const u = c.get('user'), d = normDomain(c.req.param('domain'));
  if (d === '*') return c.json({ error: 'Google Søk gjelder ett domene, ikke «Alle domener»' }, 400);
  if (!known(d)) return c.json({ error: 'Fant ikke domenet' }, 404);
  const p = { 7: 7, 28: 28, 90: 90, '7d': 7, '28d': 28, '3m': 90 }[c.req.query('period') ?? '28'] ?? 28;
  let v = gscView(u, d, p);
  if (v.connected && v.loading) { try { await syncGsc(u, d); } catch (e) { setConf(u, { error: e.message }); } v = gscView(u, d, p); }
  if (v.connected && v.needsSite && !(conf(u).siteList ?? []).length) { try { await loadSites(u); } catch (e) { return c.json({ connected: false, reconnect: true, error: e.message }); } v = gscView(u, d, p); }
  return c.json(v);
});

/* ---------------- Planlegger: 06:00 GSC, 07:00 oppsummering ---------------- */
let timer = null;
export function startDomainGlimtScheduler() {
  if (timer) return;
  const done = new Set();
  timer = setInterval(() => {
    const hm = osloHm(), day = osloDate();
    if (hm >= '06:00' && hm < '06:30' && !done.has(`gsc:${day}`)) { done.add(`gsc:${day}`); dailyGsc().catch((e) => console.warn('[gsc]', e.message)); }
    if (hm >= '07:00' && hm < '07:30' && !done.has(`sum:${day}`)) { done.add(`sum:${day}`); dailySummaries().catch((e) => console.warn('[domener]', e.message)); }
  }, 60_000);
  timer.unref?.();
}
