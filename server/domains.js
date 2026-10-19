// Domener: flere domener med statistikk (Cloudflare, Plausible, Umami eller bare oppetid og SSL).
// Tokens lagres kryptert på serveren og sendes aldri til klienten. Analyse caches i 5 min, sanntid i 30 s.
import { Hono } from 'hono';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { connect } from 'node:tls';
import { promises as dnsp } from 'node:dns';
import { db } from './db.js';
import { cfg } from './settings.js';
import { cached, peek } from './cache.js';
import * as auth from './auth.js';
import * as fh from './finans/routes.js';
import { guard, MOCK, readJson, str } from './homeos-common.js';

const CF = 'https://api.cloudflare.com/client/v4';
const SOURCES = ['cloudflare', 'tunnel', 'plausible', 'umami', 'uptime'];
const RANGES = { '1h': 1, '24h': 24, today: 0, '7d': 168, '30d': 720, '90d': 2160, '1y': 8760 };
const NEEDS_TOKEN = new Set(['plausible', 'umami']);

/* ---------- Lagring ---------- */

db.exec(`
CREATE TABLE IF NOT EXISTS hl_domains (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, source TEXT NOT NULL, url TEXT NOT NULL DEFAULT '',
  token_enc TEXT, added_by TEXT, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS hl_uptime (domain TEXT NOT NULL, day TEXT NOT NULL, ok INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, ms INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(domain, day));
`);

// AES-256-GCM med nøkkel avledet fra SESSION_SECRET.
const KEY = scryptSync(process.env.SESSION_SECRET || 'homelab-os', 'hl-domains-v1', 32);
function enc(text) {
  if (!text) return null;
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function dec(b64) {
  if (!b64) return '';
  try {
    const b = Buffer.from(b64, 'base64'), d = createDecipheriv('aes-256-gcm', KEY, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch { return ''; }
}

const q = (sql) => db.prepare(sql);
const listRows = () => q('SELECT * FROM hl_domains ORDER BY id').all();
const pub = (r) => ({ id: r.id, name: r.name, source: r.source, url: r.url || undefined, hasToken: !!r.token_enc, mock: MOCK && !r.token_enc && r.source !== 'uptime' && !cfg('cf_token') });
// Cloudflare-domener uten eget token bruker standard-tokenet fra Integrasjoner → Cloudflare.
const tokenFor = (r) => dec(r.token_enc) || (r.source === 'cloudflare' || r.source === 'tunnel' ? cfg('cf_token') : '');

// Første oppstart: ta med domenet fra de gamle Cloudflare-innstillingene, eller eksempeldomener i demo.
if (!q('SELECT 1 FROM hl_domains LIMIT 1').get()) {
  const ins = q('INSERT OR IGNORE INTO hl_domains(name,source,url,token_enc,added_by,created) VALUES(?,?,?,?,?,?)');
  if (cfg('cf_domain')) ins.run(cfg('cf_domain').toLowerCase(), 'cloudflare', '', null, 'migrering', Date.now());
  else if (MOCK) for (const [n, s] of [['kristo.no', 'cloudflare'], ['arildkrist.com', 'cloudflare'], ['home.kristo.no', 'tunnel']]) ins.run(n, s, '', null, 'demo', Date.now());
}

/* ---------- Hjelpere ---------- */

const soft = (p) => p.catch(() => null);
const NAMES = new Intl.DisplayNames(['nb'], { type: 'region' });
const ISO_N = Object.fromEntries('FJ242 TZ834 EH732 CA124 US840 KZ398 UZ860 PG598 ID360 AR032 CL152 CD180 SO706 KE404 SD729 TD148 HT332 DO214 RU643 BS044 FK238 NO578 GL304 TF260 TL626 ZA710 LS426 MX484 UY858 BR076 BO068 PE604 CO170 PA591 CR188 NI558 HN340 SV222 GT320 BZ084 VE862 GY328 SR740 FR250 EC218 PR630 JM388 CU192 ZW716 BW072 NA516 SN686 ML466 MR478 BJ204 NE562 NG566 CM120 TG768 GH288 CI384 GN324 GW624 LR430 SL694 BF854 CF140 CG178 GA266 GQ226 ZM894 MW454 MZ508 SZ748 AO024 BI108 IL376 LB422 MG450 PS275 GM270 TN788 DZ012 JO400 AE784 QA634 KW414 IQ368 OM512 VU548 KH116 TH764 LA418 MM104 VN704 KP408 KR410 MN496 IN356 BD050 BT064 NP524 PK586 AF004 TJ762 KG417 TM795 IR364 SY760 AM051 SE752 BY112 UA804 PL616 AT040 HU348 MD498 RO642 LT440 LV428 EE233 DE276 BG100 GR300 TR792 AL008 HR191 CH756 LU442 BE056 NL528 PT620 ES724 IE372 NC540 SB090 NZ554 AU036 LK144 CN156 TW158 IT380 DK208 GB826 IS352 AZ031 GE268 PH608 MY458 BN096 SI705 FI246 SK703 CZ203 ER232 JP392 PY600 YE887 SA682 AQ010 CY196 MA504 EG818 LY434 ET231 DJ262 UG800 RW646 BA070 MK807 RS688 ME499 TT780 SS728 SG702 HK344 MT470'
  .split(' ').map((x) => [x.slice(0, 2), x.slice(2)]));
const country = (iso2, visitors, threats = 0) => {
  const c = String(iso2 || '').toUpperCase();
  let name = c;
  try { name = c && c !== 'XX' && c !== 'T1' ? NAMES.of(c) : 'Ukjent'; } catch { /* ukjent kode */ }
  return { iso2: c, iso3n: ISO_N[c] ?? null, name, visitors: Math.round(visitors), threats: Math.round(threats) };
};
const pctList = (pairs, limit = 6) => {
  const tot = pairs.reduce((a, [, v]) => a + v, 0) || 1;
  return pairs.sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, v]) => ({ name, pct: Math.round(v / tot * 1000) / 10 }));
};
const sumBy = (rows, key, val) => {
  const m = new Map();
  for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + (r[val] ?? 0));
  return [...m];
};

function span(range) {
  const until = new Date();
  let since;
  if (range === 'today') { since = new Date(until); since.setHours(0, 0, 0, 0); } else since = new Date(until - RANGES[range] * 3600_000);
  return { since, until, hours: Math.max(1, (until - since) / 3600_000) };
}

function blank(r) {
  return {
    id: r.id, name: r.name, source: r.source, status: 'unknown', plan: null, registrar: null, requests: null, visitors: null, pageviews: null, cachedPct: null, bytes: null,
    uptimePct: null, sslExpires: null, renews: null, nameServers: [], series: [], live: null, countries: [], devices: [], browsers: [],
    statusCodes: null, ttfb: null, originMs: null, errorPct: null, http: [], tls: [], threats: { total: null, types: [], events: [] },
    security: null, topPages: [], referrers: [], uptime90: [], dns: [], prev: null, updated: new Date().toISOString(),
  };
}

/* ---------- Oppetid, SSL, RDAP og DNS (krever ingen token) ---------- */

const today = () => new Date().toISOString().slice(0, 10);
async function probe(name) {
  const t0 = Date.now();
  let ok = 0;
  try { const res = await fetch(`https://${name}/`, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(10_000) }); ok = res.status < 500 ? 1 : 0; } catch { ok = 0; }
  q(`INSERT INTO hl_uptime(domain,day,ok,total,ms) VALUES(?,?,?,1,?) ON CONFLICT(domain,day) DO UPDATE SET ok=ok+excluded.ok,total=total+1,ms=ms+excluded.ms`).run(name, today(), ok, Date.now() - t0);
  lastProbe.set(name, { ok: !!ok, at: Date.now(), ms: Date.now() - t0 });
}
const lastProbe = new Map();
if (!MOCK) {
  const run = () => listRows().forEach((r) => probe(r.name));
  setTimeout(run, 20_000).unref();
  setInterval(run, 5 * 60_000).unref();
}
function uptime(name) {
  const rows = new Map(q('SELECT day, ok, total FROM hl_uptime WHERE domain=? AND day>=?').all(name, new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)).map((x) => [x.day, x]));
  const days = Array.from({ length: 90 }, (_, i) => { const d = new Date(Date.now() - (89 - i) * 864e5).toISOString().slice(0, 10); const x = rows.get(d); return x?.total ? Math.round(x.ok / x.total * 1000) / 1000 : null; });
  const tot = [...rows.values()].reduce((a, x) => [a[0] + x.ok, a[1] + x.total], [0, 0]);
  return { uptime90: days, uptimePct: tot[1] ? Math.round(tot[0] / tot[1] * 10000) / 100 : null };
}

function certExpiry(name) {
  return cached('cert:' + name, 6 * 3600_000, () => new Promise((resolve, reject) => {
    const s = connect({ host: name, port: 443, servername: name, timeout: 8000 }, () => {
      const c = s.getPeerCertificate(); s.end();
      resolve(c?.valid_to ? { expires: new Date(c.valid_to).toISOString().slice(0, 10), issuer: c.issuer?.O ?? null, protocol: s.getProtocol?.() ?? null } : null);
    });
    s.on('error', reject); s.on('timeout', () => { s.destroy(); reject(new Error('timeout')); });
  }));
}

// Utløpsdato og registrar fra RDAP (fungerer for de fleste TLD-er, også .no).
function rdap(name) {
  const apex = name.split('.').slice(-2).join('.');
  return cached('rdap:' + apex, 12 * 3600_000, async () => {
    const res = await fetch(`https://rdap.org/domain/${apex}`, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/rdap+json' } });
    if (!res.ok) throw new Error('RDAP ' + res.status);
    const d = await res.json();
    const exp = d.events?.find((e) => e.eventAction === 'expiration')?.eventDate?.slice(0, 10) ?? null;
    const reg = d.entities?.find((e) => e.roles?.includes('registrar'));
    const fn = reg?.vcardArray?.[1]?.find((v) => v[0] === 'fn')?.[3] ?? reg?.handle ?? null;
    return { expires: exp, registrar: fn, nameServers: (d.nameservers ?? []).map((n) => n.ldhName?.toLowerCase()).filter(Boolean), dnssec: !!d.secureDNS?.delegationSigned };
  });
}

async function dnsLookup(name) {
  const out = [];
  const add = (type, list, fmt = (x) => x) => (list ?? []).forEach((x) => out.push({ type, name, content: fmt(x), proxied: false }));
  const [a, aaaa, cname, mx, txt] = await Promise.all([dnsp.resolve4(name), dnsp.resolve6(name), dnsp.resolveCname(name), dnsp.resolveMx(name), dnsp.resolveTxt(name)].map(soft));
  add('A', a); add('AAAA', aaaa); add('CNAME', cname); add('MX', mx, (m) => `${m.priority} ${m.exchange}`); add('TXT', txt, (t) => t.join(''));
  return out;
}

async function common(r, out) {
  const [cert, reg, dns] = await Promise.all([soft(certExpiry(r.name)), soft(rdap(r.name)), r.source === 'cloudflare' || r.source === 'tunnel' ? null : soft(dnsLookup(r.name))]);
  Object.assign(out, uptime(r.name));
  const lp = lastProbe.get(r.name);
  if (lp) out.status = lp.ok ? 'active' : 'down';
  if (cert) { out.sslExpires = out.sslExpires ?? cert.expires; out.security = { ...(out.security ?? {}), certExpires: out.security?.certExpires ?? cert.expires, issuer: cert.issuer }; if (cert.protocol && !out.tls.length) out.tls = [{ name: cert.protocol.replace('v', ' '), pct: 100 }]; }
  if (reg) { out.renews = out.renews ?? reg.expires; out.registrar = out.registrar ?? reg.registrar; if (!out.nameServers.length) out.nameServers = reg.nameServers; out.security = { ...(out.security ?? {}), dnssec: out.security?.dnssec ?? reg.dnssec }; }
  if (dns && !out.dns.length) out.dns = dns;
  return out;
}

/* ---------- Cloudflare ---------- */

async function cfRest(path, token) {
  const res = await fetch(CF + path, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.success === false) throw new Error(d.errors?.[0]?.message || `Cloudflare svarte ${res.status}`);
  return d.result;
}
async function gql(token, query, variables) {
  const res = await fetch(`${CF}/graphql`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15_000), body: JSON.stringify({ query, variables }) });
  const d = await res.json().catch(() => ({}));
  if (d.errors?.length) throw new Error(d.errors[0].message);
  if (!res.ok) throw new Error(`Cloudflare GraphQL svarte ${res.status}`);
  return d.data?.viewer?.zones?.[0] ?? {};
}

// Finn sonen: domenet selv, eller nærmeste overordnede (home.kristo.no → kristo.no).
function zoneFor(name, token) {
  return cached('cfzone:' + name, 3600_000, async () => {
    const parts = name.split('.');
    for (let i = 0; i < parts.length - 1; i++) {
      const z = (await cfRest(`/zones?name=${encodeURIComponent(parts.slice(i).join('.'))}`, token))?.[0];
      if (z) return z;
    }
    throw new Error(`Fant ingen Cloudflare-sone for ${name}`);
  });
}

const ROLLUP = `sum{requests cachedRequests bytes threats pageViews
  countryMap{clientCountryName requests threats} responseStatusMap{edgeResponseStatus requests}
  browserMap{uaBrowserFamily pageViews} clientHTTPVersionMap{clientHTTPProtocol requests} clientSSLMap{clientSSLProtocol requests}
  threatPathingMap{threatPathingName requests}} uniq{uniques}`;

async function cfLoad(r, range) {
  const token = tokenFor(r);
  const z = await zoneFor(r.name, token);
  const sub = z.name !== r.name;
  const { since, until, hours } = span(range);
  const iso = (d) => d.toISOString().replace(/\.\d+Z$/, 'Z');
  const day = (d) => d.toISOString().slice(0, 10);
  const prevSince = new Date(since - (until - since));
  const out = blank(r);
  out.plan = z.plan?.name ?? null; out.status = z.status ?? 'unknown'; out.nameServers = z.name_servers ?? [];
  const tag = z.id;
  // Adaptive datasett (sider, enheter, henvisere, ytelse) begrenses til siste døgn på gratisplanen.
  const aSince = hours > 24 ? new Date(until - 24 * 3600_000) : since;
  const aFilter = `{datetime_geq:$s,datetime_lt:$u,requestSource:"eyeball"${sub ? ',clientRequestHTTPHost:$h' : ''}}`;
  const aVars = { z: tag, s: iso(aSince), u: iso(until), ...(sub ? { h: r.name } : {}) };
  const aDecl = `($z:String!,$s:Time!,$u:Time!${sub ? ',$h:String!' : ''})`;
  const adaptive = (dims, extra = '', limit = 10) => soft(gql(token, `query${aDecl}{viewer{zones(filter:{zoneTag:$z}){g:httpRequestsAdaptiveGroups(limit:${limit},filter:${aFilter},orderBy:[count_DESC]){count ${extra} dimensions{${dims}}}}}}`, aVars).then((d) => d.g ?? []));

  let series, totals, prevTot;
  if (sub || range === '1h') {
    // Underdomener og siste time: adaptive grupper filtrert på vertsnavn.
    const unit = hours <= 1 ? 'datetimeMinute' : hours <= 168 ? 'datetimeHour' : 'date';
    const sv = { ...aVars, s: iso(since) };
    const rows = await gql(token, `query${aDecl}{viewer{zones(filter:{zoneTag:$z}){g:httpRequestsAdaptiveGroups(limit:5000,filter:${aFilter},orderBy:[${unit}_ASC]){count sum{edgeResponseBytes visits} dimensions{t:${unit} cacheStatus}}}}}`, sv).then((d) => d.g ?? []);
    const m = new Map();
    for (const g of rows) {
      const k = g.dimensions.t, e = m.get(k) ?? { t: k, requests: 0, cached: 0, visitors: 0, bytes: 0 };
      e.requests += g.count; e.visitors += g.sum.visits; e.bytes += g.sum.edgeResponseBytes;
      if (['hit', 'stale', 'updating', 'revalidated'].includes(g.dimensions.cacheStatus)) e.cached += g.count;
      m.set(k, e);
    }
    series = [...m.values()];
    totals = series.reduce((a, x) => ({ requests: a.requests + x.requests, cached: a.cached + x.cached, visitors: a.visitors + x.visitors, bytes: a.bytes + x.bytes }), { requests: 0, cached: 0, visitors: 0, bytes: 0 });
    const [ctry, stat, br, ht, tl] = await Promise.all([adaptive('clientCountryName', 'sum{visits}', 50), adaptive('edgeResponseStatus', '', 60), adaptive('userAgentBrowser'), adaptive('clientRequestHTTPProtocol'), adaptive('clientSSLProtocol')]);
    out.countries = (ctry ?? []).map((g) => country(g.dimensions.clientCountryName, g.sum.visits)).sort((a, b) => b.visitors - a.visitors);
    out.statusCodes = codes((stat ?? []).map((g) => [g.dimensions.edgeResponseStatus, g.count]));
    out.browsers = pctList((br ?? []).map((g) => [g.dimensions.userAgentBrowser || 'Andre', g.count]));
    out.http = pctList((ht ?? []).map((g) => [g.dimensions.clientRequestHTTPProtocol, g.count]));
    out.tls = pctList((tl ?? []).map((g) => [g.dimensions.clientSSLProtocol === 'none' ? 'Uten TLS' : g.dimensions.clientSSLProtocol, g.count]));
  } else {
    const daily = hours > 168;
    const ds = daily ? 'httpRequests1dGroups' : 'httpRequests1hGroups';
    const f = daily ? 'date_geq:$s,date_lt:$u' : 'datetime_geq:$s,datetime_lt:$u';
    const T = daily ? 'Date' : 'Time';
    const v = daily ? { z: tag, s: day(since), u: day(new Date(+until + 864e5)) } : { z: tag, s: iso(since), u: iso(until) };
    const pv = daily ? { z: tag, s: day(prevSince), u: day(since) } : { z: tag, s: iso(prevSince), u: iso(since) };
    const [d, p] = await Promise.all([
      gql(token, `query($z:String!,$s:${T}!,$u:${T}!){viewer{zones(filter:{zoneTag:$z}){g:${ds}(limit:1000,filter:{${f}},orderBy:[${daily ? 'date' : 'datetime'}_ASC]){dimensions{t:${daily ? 'date' : 'datetime'}} ${ROLLUP}}}}}`, v),
      soft(gql(token, `query($z:String!,$s:${T}!,$u:${T}!){viewer{zones(filter:{zoneTag:$z}){g:${ds}(limit:1000,filter:{${f}}){sum{requests cachedRequests bytes threats} uniq{uniques}}}}}`, pv)),
    ]);
    const g = d.g ?? [];
    series = g.map((x) => ({ t: x.dimensions.t, requests: x.sum.requests, cached: x.sum.cachedRequests, visitors: x.uniq.uniques, bytes: x.sum.bytes }));
    totals = { requests: 0, cached: 0, visitors: 0, bytes: 0, threats: 0, pageviews: 0 };
    const cm = new Map(), sm = [], bm = [], hm = [], tm = [], thm = [];
    for (const x of g) {
      totals.requests += x.sum.requests; totals.cached += x.sum.cachedRequests; totals.bytes += x.sum.bytes; totals.threats += x.sum.threats; totals.pageviews += x.sum.pageViews; totals.visitors += x.uniq.uniques;
      for (const c of x.sum.countryMap) { const e = cm.get(c.clientCountryName) ?? [0, 0]; e[0] += c.requests; e[1] += c.threats; cm.set(c.clientCountryName, e); }
      x.sum.responseStatusMap.forEach((s) => sm.push([s.edgeResponseStatus, s.requests]));
      x.sum.browserMap.forEach((s) => bm.push([s.uaBrowserFamily, s.pageViews]));
      x.sum.clientHTTPVersionMap.forEach((s) => hm.push([s.clientHTTPProtocol, s.requests]));
      x.sum.clientSSLMap.forEach((s) => tm.push([s.clientSSLProtocol === 'none' ? 'Uten TLS' : s.clientSSLProtocol, s.requests]));
      x.sum.threatPathingMap.forEach((s) => thm.push([s.threatPathingName, s.requests]));
    }
    // Land har ikke unike besøkende i sammendraget; fordel etter andel forespørsler.
    const ratio = totals.requests ? totals.visitors / totals.requests : 0;
    out.countries = [...cm].map(([c, [req, thr]]) => country(c, req * ratio, thr)).filter((c) => c.visitors > 0 || c.threats > 0).sort((a, b) => b.visitors - a.visitors);
    out.statusCodes = codes(sm);
    out.browsers = pctList(merge(bm));
    out.http = pctList(merge(hm));
    out.tls = pctList(merge(tm));
    out.threats.types = merge(thm).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name: name || 'Annet', count }));
    out.threats.total = totals.threats;
    out.pageviews = totals.pageviews;
    const pt = (p?.g ?? []).reduce((a, x) => ({ requests: a.requests + x.sum.requests, cached: a.cached + x.sum.cachedRequests, bytes: a.bytes + x.sum.bytes, threats: a.threats + x.sum.threats, visitors: a.visitors + x.uniq.uniques }), { requests: 0, cached: 0, bytes: 0, threats: 0, visitors: 0 });
    if (pt.requests) prevTot = pt;
  }
  out.series = series;
  out.requests = totals.requests; out.visitors = totals.visitors; out.bytes = totals.bytes;
  out.cachedPct = totals.requests ? Math.round(totals.cached / totals.requests * 1000) / 10 : null;
  if (prevTot) out.prev = { requests: prevTot.requests, visitors: prevTot.visitors, bytes: prevTot.bytes, cachedPct: prevTot.requests ? Math.round(prevTot.cached / prevTot.requests * 1000) / 10 : null, threats: prevTot.threats };
  out.errorPct = out.statusCodes && totals.requests ? Math.round(out.statusCodes['5xx'] / totals.requests * 10000) / 100 : null;

  const [dev, pages, refs, perf, fw, fwEv, dnsRec, ssl, https, minTls, dnssec, bots, certs, reg] = await Promise.all([
    adaptive('clientDeviceType'), adaptive('clientRequestPath', '', 8), adaptive('clientRefererHost', '', 8),
    soft(gql(token, `query${aDecl}{viewer{zones(filter:{zoneTag:$z}){g:httpRequestsAdaptiveGroups(limit:1,filter:${aFilter}){quantiles{edgeTimeToFirstByteMsP50 edgeTimeToFirstByteMsP95} avg{originResponseDurationMs}}}}}`, aVars).then((d) => d.g?.[0])),
    soft(gql(token, `query($z:String!,$s:Time!,$u:Time!){viewer{zones(filter:{zoneTag:$z}){g:firewallEventsAdaptiveGroups(limit:20,filter:{datetime_geq:$s,datetime_lt:$u},orderBy:[count_DESC]){count dimensions{action source clientCountryName}}}}}`, { z: tag, s: iso(aSince), u: iso(until) }).then((d) => d.g ?? [])),
    soft(gql(token, `query($z:String!,$s:Time!,$u:Time!){viewer{zones(filter:{zoneTag:$z}){g:firewallEventsAdaptive(limit:10,filter:{datetime_geq:$s,datetime_lt:$u},orderBy:[datetime_DESC]){datetime action clientCountryName clientIP clientRequestPath}}}}`, { z: tag, s: iso(aSince), u: iso(until) }).then((d) => d.g ?? [])),
    soft(cfRest(`/zones/${tag}/dns_records?per_page=100`, token)),
    soft(cfRest(`/zones/${tag}/settings/ssl`, token)), soft(cfRest(`/zones/${tag}/settings/always_use_https`, token)), soft(cfRest(`/zones/${tag}/settings/min_tls_version`, token)),
    soft(cfRest(`/zones/${tag}/dnssec`, token)), soft(cfRest(`/zones/${tag}/bot_management`, token)), soft(cfRest(`/zones/${tag}/ssl/certificate_packs?status=all`, token)),
    soft(cfRest(`/accounts/${z.account?.id}/registrar/domains/${z.name}`, token)),
  ]);
  out.devices = pctList((dev ?? []).map((g) => [{ mobile: 'Mobil', desktop: 'Desktop', tablet: 'Nettbrett' }[g.dimensions.clientDeviceType] ?? 'Annet', g.count]));
  out.topPages = (pages ?? []).map((g) => ({ path: g.dimensions.clientRequestPath, count: g.count }));
  out.referrers = (refs ?? []).map((g) => ({ name: g.dimensions.clientRefererHost || 'Direkte', count: g.count }));
  if (perf) { out.ttfb = { p50: Math.round(perf.quantiles.edgeTimeToFirstByteMsP50), p95: Math.round(perf.quantiles.edgeTimeToFirstByteMsP95) }; out.originMs = Math.round(perf.avg.originResponseDurationMs); }
  if (fw) {
    const stopped = fw.filter((g) => g.dimensions.action !== 'log' && g.dimensions.action !== 'allow');
    if (!out.threats.total) out.threats.total = stopped.reduce((a, g) => a + g.count, 0);
    const SRC = { firewallManaged: 'Administrerte regler', firewallCustom: 'Egne regler', botFight: 'Bot Fight Mode', ratelimit: 'Rate limiting', securitylevel: 'Sikkerhetsnivå', waf: 'WAF', bic: 'Nettleserkontroll', hot: 'Hotlink-beskyttelse', l7ddos: 'DDoS', uablock: 'User-Agent-blokk', ip: 'IP-regler', country: 'Landregler' };
    if (!out.threats.types.length) out.threats.types = sumBy(stopped.map((g) => ({ k: SRC[g.dimensions.source] ?? g.dimensions.source, v: g.count })), 'k', 'v').sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name, count }));
    const byC = new Map(sumBy(stopped.map((g) => ({ k: g.dimensions.clientCountryName, v: g.count })), 'k', 'v'));
    out.countries.forEach((c) => { if (byC.has(c.iso2)) c.threats = byC.get(c.iso2); });
  }
  out.threats.events = (fwEv ?? []).map((e) => ({ time: e.datetime, action: e.action === 'block' || e.action === 'drop' ? 'Blokkert' : 'Utfordret', country: e.clientCountryName, ip: e.clientIP, path: e.clientRequestPath }));
  if (dnsRec) out.dns = dnsRec.filter((x) => !sub || x.name === r.name || x.name.endsWith('.' + r.name)).map((x) => ({ type: x.type, name: x.name === z.name ? x.name : x.name.replace('.' + z.name, ''), content: x.content, proxied: !!x.proxied }));
  const SSL = { full: 'Full', strict: 'Full (strict)', flexible: 'Fleksibel', off: 'Av' };
  const certExp = (certs ?? []).flatMap((p) => p.certificates ?? []).map((c) => c.expires_on?.slice(0, 10)).filter(Boolean).sort()[0] ?? null;
  out.security = { sslMode: ssl ? SSL[ssl.value] ?? ssl.value : null, alwaysHttps: https ? https.value === 'on' : null, minTls: minTls?.value ?? null, dnssec: dnssec ? dnssec.status === 'active' : null, botFight: bots ? !!bots.fight_mode : null, certExpires: certExp };
  out.sslExpires = certExp;
  if (reg) { out.renews = reg.expires_at?.slice(0, 10) ?? null; out.registrar = 'Cloudflare Registrar'; }
  return out;
}
const merge = (pairs) => sumBy(pairs.map(([k, v]) => ({ k, v })), 'k', 'v');
function codes(pairs) {
  const o = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  for (const [code, n] of pairs) { const k = `${String(code)[0]}xx`; if (k in o) o[k] += n; }
  return o;
}

async function cfLive(r) {
  const token = tokenFor(r);
  const z = await zoneFor(r.name, token);
  const sub = z.name !== r.name;
  const until = new Date(), since = new Date(until - 30 * 60_000);
  const iso = (d) => d.toISOString().replace(/\.\d+Z$/, 'Z');
  const d = await gql(token, `query($z:String!,$s:Time!,$u:Time!${sub ? ',$h:String!' : ''}){viewer{zones(filter:{zoneTag:$z}){g:httpRequestsAdaptiveGroups(limit:60,filter:{datetime_geq:$s,datetime_lt:$u,requestSource:"eyeball"${sub ? ',clientRequestHTTPHost:$h' : ''}},orderBy:[datetimeMinute_ASC]){count sum{visits edgeResponseBytes} dimensions{datetimeMinute}}}}}`,
    { z: z.id, s: iso(since), u: iso(until), ...(sub ? { h: r.name } : {}) });
  const g = d.g ?? [], last5 = g.filter((x) => new Date(x.dimensions.datetimeMinute) > until - 5 * 60_000);
  return { visitors: last5.reduce((a, x) => a + x.sum.visits, 0), requests: last5.reduce((a, x) => a + x.count, 0), mb: Math.round(last5.reduce((a, x) => a + x.sum.edgeResponseBytes, 0) / 1e5) / 10, spark: g.map((x) => x.count) };
}

/* ---------- Plausible og Umami ---------- */

const PL_PERIOD = { '1h': 'realtime', '24h': 'day', today: 'day', '7d': '7d', '30d': '30d', '90d': '6mo', '1y': '12mo' };
async function plausible(r, range) {
  const base = (r.url || 'https://plausible.io').replace(/\/$/, ''), token = tokenFor(r);
  const get = (p) => fetch(`${base}/api/v1/stats/${p}${p.includes('?') ? '&' : '?'}site_id=${encodeURIComponent(r.name)}&period=${PL_PERIOD[range] === 'realtime' ? 'day' : PL_PERIOD[range]}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) })
    .then(async (res) => { if (!res.ok) throw new Error(`Plausible svarte ${res.status}`); return (await res.json()).results; });
  const out = blank(r);
  const [agg, ts, ctry, dev, br, pages, src] = await Promise.all([
    get('aggregate?metrics=visitors,pageviews'), soft(get('timeseries?metrics=visitors,pageviews')),
    soft(get('breakdown?property=visit:country&limit=50')), soft(get('breakdown?property=visit:device')), soft(get('breakdown?property=visit:browser')),
    soft(get('breakdown?property=event:page&limit=8&metrics=pageviews')), soft(get('breakdown?property=visit:source&limit=8')),
  ]);
  out.visitors = agg.visitors?.value ?? null; out.pageviews = agg.pageviews?.value ?? null; out.requests = out.pageviews;
  out.series = (ts ?? []).map((x) => ({ t: x.date, requests: x.pageviews, cached: 0, visitors: x.visitors }));
  out.countries = (ctry ?? []).map((x) => country(x.country, x.visitors));
  out.devices = pctList((dev ?? []).map((x) => [{ Mobile: 'Mobil', Desktop: 'Desktop', Tablet: 'Nettbrett' }[x.device] ?? x.device, x.visitors]));
  out.browsers = pctList((br ?? []).map((x) => [x.browser, x.visitors]));
  out.topPages = (pages ?? []).map((x) => ({ path: x.page, count: x.pageviews }));
  out.referrers = (src ?? []).map((x) => ({ name: x.source === 'Direct / None' ? 'Direkte' : x.source, count: x.visitors }));
  const live = await soft(fetch(`${base}/api/v1/stats/realtime/visitors?site_id=${encodeURIComponent(r.name)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }).then((x) => x.json()));
  if (typeof live === 'number') out.live = { visitors: live, requests: null, mb: null, spark: [] };
  return out;
}

async function umami(r, range) {
  const base = r.url.replace(/\/$/, ''), token = tokenFor(r);
  const h = { Authorization: `Bearer ${token}`, 'x-umami-api-key': token, Accept: 'application/json' };
  const j = (p) => fetch(base + p, { headers: h, signal: AbortSignal.timeout(10_000) }).then(async (res) => { if (!res.ok) throw new Error(`Umami svarte ${res.status}`); return res.json(); });
  const site = await cached('umami:' + r.id, 3600_000, async () => {
    const list = await j('/api/websites?pageSize=100');
    const w = (list.data ?? list).find((x) => x.domain === r.name || x.domain === r.name.replace(/^www\./, ''));
    if (!w) throw new Error(`Fant ikke ${r.name} i Umami`);
    return w.id;
  });
  const { since, until, hours } = span(range);
  const t = `startAt=${+since}&endAt=${+until}`, unit = hours <= 48 ? 'hour' : 'day';
  const out = blank(r);
  const [st, pv, ctry, dev, br, url, ref, act] = await Promise.all([
    j(`/api/websites/${site}/stats?${t}`), soft(j(`/api/websites/${site}/pageviews?${t}&unit=${unit}&timezone=Europe/Oslo`)),
    ...['country', 'device', 'browser', 'url', 'referrer'].map((k) => soft(j(`/api/websites/${site}/metrics?${t}&type=${k}&limit=50`))),
    soft(j(`/api/websites/${site}/active`)),
  ]);
  const val = (x) => (typeof x === 'object' ? x?.value : x) ?? null;
  out.visitors = val(st.visitors); out.pageviews = val(st.pageviews); out.requests = out.pageviews;
  const sess = new Map((pv?.sessions ?? []).map((x) => [x.x, x.y]));
  out.series = (pv?.pageviews ?? []).map((x) => ({ t: x.x, requests: x.y, cached: 0, visitors: sess.get(x.x) ?? 0 }));
  out.countries = (ctry ?? []).map((x) => country(x.x, x.y));
  out.devices = pctList((dev ?? []).map((x) => [{ mobile: 'Mobil', desktop: 'Desktop', tablet: 'Nettbrett', laptop: 'Desktop' }[x.x] ?? x.x, x.y]));
  out.browsers = pctList((br ?? []).map((x) => [x.x, x.y]));
  out.topPages = (url ?? []).slice(0, 8).map((x) => ({ path: x.x, count: x.y }));
  out.referrers = (ref ?? []).slice(0, 8).map((x) => ({ name: x.x || 'Direkte', count: x.y }));
  const a = Array.isArray(act) ? act[0]?.x : act?.visitors ?? act?.x;
  if (a !== undefined) out.live = { visitors: +a || 0, requests: null, mb: null, spark: [] };
  return out;
}

/* ---------- Demo-data (deterministisk, som i prototypen) ---------- */

const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rng = (a) => () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const MOCK_META = {
  'kristo.no': { scale: 1, reg: 'Domeneshop AS', exp: '2027-03-14', cert: '2027-01-09', pages: ['/', '/tjenester', '/om-oss', '/kontakt', '/prosjekter/kystveien', '/blogg/vinterdekk-2026'],
    dns: [['A', 'kristo.no', '104.21.48.17', 1], ['AAAA', 'kristo.no', '2606:4700:3036::6815', 1], ['CNAME', 'www', 'kristo.no', 1], ['MX', 'kristo.no', '10 mx.domeneshop.no', 0], ['TXT', 'kristo.no', 'v=spf1 include:_spf.domeneshop.no ~all', 0]] },
  'arildkrist.com': { scale: 0.16, reg: 'Cloudflare Registrar', exp: '2027-03-14', cert: '2026-12-22', pages: ['/', '/cv', '/prosjekter', '/kontakt'],
    dns: [['A', 'arildkrist.com', '104.21.7.92', 1], ['CNAME', 'www', 'arildkrist.com', 1], ['CNAME', 'home', 'tunnel.cfargotunnel.com', 1], ['TXT', 'arildkrist.com', 'google-site-verification=…', 0]] },
  'home.kristo.no': { scale: 0.02, reg: 'Domeneshop AS (via kristo.no)', exp: '2027-03-14', cert: '2027-01-09', pages: ['/', '/finans', '/matplan', '/api/kvittering'], home: true,
    dns: [['CNAME', 'home', '8f2c…cfargotunnel.com', 1], ['CNAME', 'finans.home', '8f2c…cfargotunnel.com', 1]] },
};
const MOCK_C = [['NO', 0.62], ['SE', 0.084], ['US', 0.08], ['DK', 0.043], ['DE', 0.032], ['GB', 0.022], ['NL', 0.017], ['FI', 0.014], ['FR', 0.011], ['PL', 0.009], ['ES', 0.008], ['CA', 0.007], ['IT', 0.006], ['IN', 0.005], ['JP', 0.004], ['AU', 0.003], ['BR', 0.003], ['CN', 0.002], ['ZA', 0.001]];

function mockLoad(r, range) {
  const m = MOCK_META[r.name] ?? { scale: 0.03 + (hash(r.name) % 300) / 1000, reg: null, exp: '2027-06-01', cert: '2027-01-01', pages: ['/', '/om', '/kontakt'], dns: [['A', r.name, '203.0.113.10', 0]] };
  const rand = rng(hash(r.name + range)), { since, hours } = span(range);
  const n = hours <= 1 ? 60 : hours <= 24 ? 48 : hours <= 168 ? 84 : hours <= 720 ? 60 : hours <= 2160 ? 90 : 52;
  const curve = (h) => { h = ((h % 24) + 24) % 24; return 0.28 + 0.72 * Math.exp(-(((h - 14) / 4.6) ** 2)) + 0.18 * Math.exp(-(((h - 21) / 2) ** 2)); };
  const series = [];
  for (let i = 0; i < n; i++) {
    const t = new Date(+since + (i + 1) * hours * 3600_000 / n), hr = t.getHours() + t.getMinutes() / 60, wk = hours >= 168 && [0, 6].includes(t.getDay()) ? 0.88 : 1;
    const c = hours > 168 ? 0.62 * wk : curve(hr) * wk, req = 82000 * m.scale * (hours / n) * c * (0.9 + 0.2 * rand());
    series.push({ t: t.toISOString(), requests: Math.round(req), cached: Math.round(req * (0.84 + 0.06 * rand())), visitors: Math.round(req * 0.039) });
  }
  const req = series.reduce((a, x) => a + x.requests, 0), cachedN = series.reduce((a, x) => a + x.cached, 0), vis = Math.round(req * 0.039), thr = Math.round(req * 0.00237);
  const C = m.home ? [['NO', 0.97], ['SE', 0.02], ['DK', 0.01]] : MOCK_C;
  const up = rng(hash(r.name + 'up'));
  const u90 = Array.from({ length: 90 }, () => { const x = up(); return x < 0.006 ? 0.9 : x < 0.03 ? 0.995 : 1; });
  const p50 = Math.round(42 * (1 + m.scale * 0.05));
  const ev = rng(hash(r.name + 'ev'));
  return {
    ...blank(r), mock: true, status: 'active', plan: r.source === 'cloudflare' || r.source === 'tunnel' ? 'Free' : null, registrar: m.reg, nameServers: ['ada.ns.cloudflare.com', 'ben.ns.cloudflare.com'],
    requests: req, visitors: vis, pageviews: Math.round(req * 0.31), cachedPct: Math.round(cachedN / req * 1000) / 10, bytes: req * 31200,
    uptime90: u90, uptimePct: Math.round((100 - (u90.filter((x) => x < 0.95).length * 0.9 + u90.filter((x) => x < 1 && x >= 0.95).length * 0.06) / 90) * 100) / 100,
    sslExpires: m.cert, renews: m.exp, series,
    prev: { requests: Math.round(req * (0.92 + rand() * 0.06)), visitors: Math.round(vis * (0.93 + rand() * 0.05)), bytes: req * 31200 * (0.95 + rand() * 0.04), cachedPct: Math.round(cachedN / req * 1000) / 10 - 1.2, threats: Math.round(thr * (1.1 + rand() * 0.1)) },
    countries: C.map(([c, f]) => country(c, Math.max(1, vis * f), thr * f * (c === 'NO' ? 0.2 : 1.6))),
    devices: [{ name: 'Mobil', pct: 58 }, { name: 'Desktop', pct: 38 }, { name: 'Nettbrett', pct: 4 }],
    browsers: [{ name: 'Safari', pct: 41 }, { name: 'Chrome', pct: 39 }, { name: 'Firefox', pct: 9 }, { name: 'Edge', pct: 7 }, { name: 'Andre', pct: 4 }],
    statusCodes: { '2xx': Math.round(req * 0.966), '3xx': Math.round(req * 0.0289), '4xx': Math.round(req * 0.0141), '5xx': Math.round(req * 0.001) },
    ttfb: { p50, p95: 186 }, originMs: 312, errorPct: 0.1,
    http: [{ name: 'HTTP/3', pct: 46 }, { name: 'HTTP/2', pct: 49 }, { name: 'HTTP/1.1', pct: 5 }], tls: [{ name: 'TLS 1.3', pct: 94 }, { name: 'TLS 1.2', pct: 6 }],
    threats: {
      total: thr, types: [['Bot-trafikk', 0.47], ['SQL-injeksjon', 0.21], ['Skanning av sårbarheter', 0.17], ['XSS-forsøk', 0.09], ['Rate limiting', 0.06]].map(([name, f]) => ({ name, count: Math.round(thr * f) })),
      events: Array.from({ length: 8 }, (_, i) => ({ time: new Date(Date.now() - (i * 7 + ev() * 6) * 60_000).toISOString(), action: ev() < 0.7 ? 'Blokkert' : 'Utfordret', country: ['US', 'CN', 'RU', 'NL', 'DE', 'BR'][Math.floor(ev() * 6)], ip: `${45 + Math.floor(ev() * 150)}.${Math.floor(ev() * 255)}.${Math.floor(ev() * 255)}.${Math.floor(ev() * 255)}`, path: ['/wp-login.php', '/.env', '/admin', '/xmlrpc.php', '/phpmyadmin/', '/'][Math.floor(ev() * 6)] })),
    },
    security: { sslMode: 'Full (strict)', alwaysHttps: true, minTls: '1.2', dnssec: true, botFight: !m.home, certExpires: m.cert },
    topPages: m.pages.map((p, i) => ({ path: p, count: Math.round(req * 0.012 * ([0.32, 0.16, 0.09, 0.07, 0.05, 0.035][i] ?? 0.015)) })),
    referrers: [['google.com', 0.4], ['Direkte', 0.31], ['linkedin.com', 0.087], ['bing.com', 0.04], ['facebook.com', 0.031], ['finn.no', 0.018]].map(([name, f]) => ({ name, count: Math.round(vis * f) })),
    dns: m.dns.map(([type, name, content, p]) => ({ type, name, content, proxied: !!p })),
  };
}
function mockLive(r) {
  const m = MOCK_META[r.name] ?? { scale: 0.05 }, tick = Math.floor(Date.now() / 30_000), lr = rng(hash(r.name) + tick);
  const visitors = Math.max(1, Math.round(128 * m.scale * (0.88 + 0.24 * Math.abs(Math.sin(tick * 1.7)))));
  return { visitors, requests: Math.round(visitors * 23 * (0.9 + lr() * 0.2)), mb: Math.round(visitors * 0.7 * 10) / 10, spark: Array.from({ length: 30 }, () => Math.round(visitors * (6 + lr() * 18))) };
}

/* ---------- Samlet ---------- */

const usesMock = (r) => MOCK && !tokenFor(r) && r.source !== 'uptime';

async function analytics(r, range) {
  if (usesMock(r)) return mockLoad(r, range);
  let out;
  try {
    if (r.source === 'cloudflare' || r.source === 'tunnel') {
      if (!tokenFor(r)) { out = blank(r); out.error = 'Mangler Cloudflare-token. Legg inn et token på domenet eller under Innstillinger → Integrasjoner → Cloudflare.'; }
      else out = await cfLoad(r, range);
    } else if (r.source === 'plausible') out = await plausible(r, range);
    else if (r.source === 'umami') out = await umami(r, range);
    else out = blank(r);
  } catch (e) { out = blank(r); out.error = e.message; }
  return common(r, out);
}
async function live(r) {
  if (usesMock(r)) return mockLive(r);
  if ((r.source === 'cloudflare' || r.source === 'tunnel') && tokenFor(r)) return soft(cfLive(r));
  return null;
}

/* ---------- Ruter ---------- */

const api = new Hono();

// Kartdata og d3-geo leveres herfra (samme opprinnelse, ingen CDN). Registreres før admin-vakten fordi Rom-fanen
// (som alle innloggede ser) også bruker kartet; filene er åpne biblioteker, men krever likevel innlogging.
const VENDOR = { 'd3-array.min.js': 'd3-array/dist/d3-array.min.js', 'd3-geo.min.js': 'd3-geo/dist/d3-geo.min.js', 'topojson-client.min.js': 'topojson-client/dist/topojson-client.min.js', 'countries-110m.json': 'world-atlas/countries-110m.json' };
// Kartdata: innlogget sesjon eller app-token (finance:read), så mobilappene kan tegne kartet fra egen server.
const loggedIn = (c, next) => (auth.sessionUser(c) || fh.bearerOk?.(c, 'finance:read') ? next() : c.json({ error: 'Ikke innlogget' }, 401));
api.get('/vendor/nordic.json', loggedIn, async (c) => c.body(await nordic(), 200, { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=604800' }));
api.get('/vendor/:file', loggedIn, async (c) => {
  const p = VENDOR[c.req.param('file')];
  if (!p) return c.notFound();
  const body = await readFile(new URL(`../node_modules/${p}`, import.meta.url));
  return c.body(body, 200, { 'Content-Type': p.endsWith('.json') ? 'application/json' : 'text/javascript', 'Cache-Control': 'private, max-age=604800' });
});

// Omriss av Norden (world-atlas 50m) for Starlink-kartet på Rom: bare polygoner nær utsnittet, avrundet til 2 desimaler.
// Svaret er { countries: [{ id, rings: [[[lon,lat],…],…] }] } og beregnes én gang per oppstart (~40 kB i stedet for 750 kB).
const BOX = { lonMin: -12, lonMax: 44, latMin: 50, latMax: 78 };
let nordicJson = null;
async function nordic() {
  if (nordicJson) return nordicJson;
  const { feature } = await import('topojson-client');
  const topo = JSON.parse(await readFile(new URL('../node_modules/world-atlas/countries-50m.json', import.meta.url), 'utf8'));
  const inBox = ([lon, lat]) => lon >= BOX.lonMin && lon <= BOX.lonMax && lat >= BOX.latMin && lat <= BOX.latMax;
  const countries = [];
  for (const f of feature(topo, topo.objects.countries).features) {
    const polys = f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    const rings = [];
    for (const poly of polys) for (const ring of poly) {
      if (!ring.some(inBox)) continue;
      // Ringer som krysser datolinjen (Russland) rulles ut til sammenhengende lengdegrader før klemming.
      const wraps = ring.some(([lo]) => lo > 170) && ring.some(([lo]) => lo < -170);
      const out = [];
      for (const [lonW, lat0] of ring) {
        const lon0 = wraps && lonW < 0 ? lonW + 360 : lonW;
        // Klemmes til et romslig område rundt utsnittet, så polygoner som krysser datolinjen (Russland) ikke tegner striper.
        const lon = Math.min(80, Math.max(-40, lon0)), lat = Math.min(86, Math.max(36, lat0));
        const pt = [Math.round(lon * 100) / 100, Math.round(lat * 100) / 100], prev = out[out.length - 1];
        if (!prev || Math.abs(prev[0] - pt[0]) + Math.abs(prev[1] - pt[1]) >= 0.04) out.push(pt); // tynner ut punkter som ikke synes
      }
      if (out.length > 3) rings.push(out);
    }
    if (rings.length) countries.push({ id: f.id, name: f.properties?.name ?? '', rings });
  }
  nordicJson = JSON.stringify({ countries });
  return nordicJson;
}

api.use('*', guard);

const isAdmin = (c) => {
  const id = auth.sessionUser(c);
  if (!id) return true; // token med finance:write (sjekket av guard)
  const u = auth.userInfo?.(id);
  return !u || u.role === 'admin';
};

api.get('/domains', (c) => c.json(listRows().map(pub)));

/* ---------- Prompt 30: Test token (Innstillinger → Domener) ---------- */
// POST /domains/api/token/verify og /api/domains/token/verify {token?, domain?} (bare admin – domenene er serveroppsett)
//   → {ok, active, permissions:[{name, ok, error?}], okCount, total, zone?, message}
// Tomt token = standard-tokenet fra Integrasjoner → Cloudflare. ok = tokenet er aktivt og alle fem tillatelsene virker.
// Tokenet logges eller lagres ikke her.
let cfFetch = (...a) => fetch(...a);
export const _setCfFetch = (fn) => { cfFetch = fn ?? ((...a) => fetch(...a)); };
const CF_PERMS = ['Zone · Zone', 'Zone · DNS', 'Zone · Analytics', 'Zone · Firewall Services', 'Account · Registrar: Domains'];
async function cfTry(path, token, init = {}) {
  const res = await cfFetch(CF + path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(10_000) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.success === false || d.errors?.length) throw new Error(d.errors?.[0]?.message || `Cloudflare svarte ${res.status}`);
  return d;
}
export async function verifyCfToken(token, domain = '') {
  const perms = CF_PERMS.map((name) => ({ name, ok: false }));
  const out = (active, message, zone) => {
    const okCount = perms.filter((x) => x.ok).length;
    return { ok: active && okCount === perms.length, active, permissions: perms, okCount, total: perms.length, ...(zone ? { zone } : {}), message };
  };
  let v;
  try { v = await cfTry('/user/tokens/verify', token); } catch (e) { return out(false, `Tokenet virker ikke: ${e.message}`); }
  const active = v.result?.status === 'active';
  if (!active) return out(false, `Tokenet er ${v.result?.status ?? 'ikke aktivt'}`);
  const fail = (i, e) => { perms[i].error = String(e?.message ?? e).slice(0, 200); };
  let z = null;
  try {
    const name = String(domain ?? '').toLowerCase().trim();
    const list = (await cfTry(`/zones?per_page=50${name ? `&name=${encodeURIComponent(name.split('.').slice(-2).join('.'))}` : ''}`, token)).result ?? [];
    z = list[0] ?? null;
    if (!z) throw new Error(name ? `Fant ingen sone for ${name}` : 'Tokenet ser ingen soner');
    perms[0].ok = true;
  } catch (e) { fail(0, e); }
  if (z) {
    await Promise.all([
      cfTry(`/zones/${z.id}/dns_records?per_page=1`, token).then(() => { perms[1].ok = true; }, (e) => fail(1, e)),
      cfTry('/graphql', token, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'query($z:String!,$d:Date!){viewer{zones(filter:{zoneTag:$z}){g:httpRequests1dGroups(limit:1,filter:{date_geq:$d}){sum{requests}}}}}', variables: { z: z.id, d: new Date(Date.now() - 86400_000).toISOString().slice(0, 10) } }) })
        .then(() => { perms[2].ok = true; }, (e) => fail(2, e)),
      cfTry(`/zones/${z.id}/firewall/access_rules/rules?per_page=1`, token).then(() => { perms[3].ok = true; }, (e) => fail(3, e)),
      z.account?.id ? cfTry(`/accounts/${z.account.id}/registrar/domains?per_page=1`, token).then(() => { perms[4].ok = true; }, (e) => fail(4, e)) : Promise.resolve(fail(4, 'Fant ikke kontoen')),
    ]);
  } else for (let i = 1; i < perms.length; i++) fail(i, 'Krever Zone · Zone');
  const n = perms.filter((x) => x.ok).length;
  return out(true, n === perms.length ? `✓ Tokenet virker · ${n} av ${n} tillatelser` : `Tokenet virker, men mangler ${perms.filter((x) => !x.ok).map((x) => x.name).join(', ')}`, z ? { id: z.id, name: z.name } : null);
}
api.post('/token/verify', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Bare administratorer kan teste Cloudflare-tokenet' }, 403);
  const b = await readJson(c);
  const given = str(b?.token, 400).trim();
  const token = given || cfg('cf_token');
  if (!token) {
    if (MOCK) return c.json({ ok: true, active: true, permissions: CF_PERMS.map((name) => ({ name, ok: true })), okCount: CF_PERMS.length, total: CF_PERMS.length, mock: true, message: `✓ Tokenet virker · ${CF_PERMS.length} av ${CF_PERMS.length} tillatelser (eksempeldata)` });
    return c.json({ error: 'Lim inn et token, eller legg inn et standard-token under Integrasjoner → Cloudflare' }, 400);
  }
  return c.json({ ...(await verifyCfToken(token, str(b?.domain, 253))), source: given ? 'token' : 'default' });
});

api.post('/domains', async (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Bare administratorer kan legge til domener' }, 403);
  const b = await readJson(c);
  const name = str(b.name, 253).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const source = SOURCES.includes(b.source) ? b.source : null;
  const token = str(b.token, 400), url = str(b.url, 300);
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(name)) return c.json({ error: 'Skriv et gyldig domene, f.eks. eksempel.no' }, 400);
  if (!source) return c.json({ error: 'Ukjent statistikkilde' }, 400);
  if (NEEDS_TOKEN.has(source) && !token) return c.json({ error: 'API-token mangler' }, 400);
  if (source === 'umami' && !/^https?:\/\/\S+$/.test(url)) return c.json({ error: 'Oppgi adressen til Umami, f.eks. https://umami.eksempel.no' }, 400);
  if (url && !/^https?:\/\/\S+$/.test(url)) return c.json({ error: 'Ugyldig adresse' }, 400);
  if (q('SELECT 1 FROM hl_domains WHERE name=?').get(name)) return c.json({ error: `${name} er allerede lagt til` }, 409);
  // Sjekk Cloudflare-tokenet før vi lagrer, så feil oppdages med en gang.
  if ((source === 'cloudflare' || source === 'tunnel') && !MOCK) {
    const t = token || cfg('cf_token');
    if (!t) return c.json({ error: 'API-token mangler (eller legg inn et standard-token under Integrasjoner → Cloudflare)' }, 400);
    try { await zoneFor(name, t); } catch (e) { return c.json({ error: `Cloudflare: ${e.message}` }, 400); }
  }
  const info = q('INSERT INTO hl_domains(name,source,url,token_enc,added_by,created) VALUES(?,?,?,?,?,?)').run(name, source, url, enc(token), auth.sessionUser(c) ?? 'token', Date.now());
  const row = q('SELECT * FROM hl_domains WHERE id=?').get(info.lastInsertRowid);
  if (!MOCK) probe(name).catch(() => {});
  return c.json(pub(row), 201);
});

api.delete('/domains/:id', (c) => {
  if (!isAdmin(c)) return c.json({ error: 'Bare administratorer kan fjerne domener' }, 403);
  const r = q('SELECT * FROM hl_domains WHERE id=?').get(Number(c.req.param('id')));
  if (!r) return c.json({ error: 'Fant ikke domenet' }, 404);
  q('DELETE FROM hl_domains WHERE id=?').run(r.id);
  q('DELETE FROM hl_uptime WHERE domain=?').run(r.name);
  return c.json({ ok: true });
});

const byName = (name) => q('SELECT * FROM hl_domains WHERE name=?').get(String(name).toLowerCase());

api.get('/:name/analytics', async (c) => {
  const r = byName(c.req.param('name'));
  if (!r) return c.json({ error: 'Fant ikke domenet' }, 404);
  const range = RANGES[c.req.query('range')] !== undefined ? c.req.query('range') : '24h';
  const [a, l] = await Promise.all([
    cached(`dom:${r.id}:${r.source}:${range}`, range === '1h' ? 60_000 : 5 * 60_000, () => analytics(r, range)),
    cached(`domlive:${r.id}`, 30_000, () => live(r)).catch(() => null),
  ]);
  return c.json({ ...a, live: l ?? a.live, mock: !!a.mock });
});

api.get('/:name/live', async (c) => {
  const r = byName(c.req.param('name'));
  if (!r) return c.json({ error: 'Fant ikke domenet' }, 404);
  return c.json((await cached(`domlive:${r.id}`, 30_000, () => live(r)).catch(() => null)) ?? { visitors: null });
});

/** Kort oversikt til widgets: oppe/nede fra siste sjekk og SSL som utløper innen 30 dager (fra cache, ingen nye kall). */
export function domainOverview() {
  const rows = listRows();
  const items = rows.map((r) => {
    const p = lastProbe.get(r.name);
    return { name: r.name, up: MOCK ? true : p ? p.ok : null, ms: p?.ms ?? null };
  });
  const soon = [];
  if (MOCK) soon.push({ name: rows[1]?.name ?? 'arildkrist.com', days: 21 });
  else for (const r of rows) {
    const c = peek('cert:' + r.name);
    const days = c?.expires ? Math.round((new Date(c.expires) - Date.now()) / 864e5) : null;
    if (days != null && days <= 30) soon.push({ name: r.name, days });
  }
  return { total: items.length, up: items.filter((x) => x.up === true).length, down: items.filter((x) => x.up === false).length, items, expiringSoon: soon };
}

export default api;

/**
 * Domene-pillen på Boliger (prompt 24): besøk i dag summert over alle domenene, antall domener og samlet status.
 * status: 'error' når et domene er nede, 'warn' når statistikk mangler/feiler eller et sertifikat utløper innen 30 dager.
 * Caches i 5 minutter (analysen per domene har sin egen 5-minutterscache).
 */
export function domainSummary() {
  return cached('domsum', 5 * 60_000, async () => {
    const rows = listRows();
    const parts = await Promise.all(rows.map((r) => cached(`dom:${r.id}:${r.source}:today`, 5 * 60_000, () => analytics(r, 'today')).catch((e) => ({ error: e.message }))));
    const o = domainOverview();
    const visitsToday = parts.reduce((a, p) => a + (Number.isFinite(p?.visitors) ? p.visitors : 0), 0);
    const failed = parts.filter((p) => p?.error).length;
    const status = o.down > 0 ? 'error' : failed || o.expiringSoon.length ? 'warn' : 'ok';
    return { visitsToday, domains: rows.length, status, up: o.up, down: o.down, expiringSoon: o.expiringSoon.length, failed, updatedAt: new Date().toISOString(), ...(MOCK ? { mock: true } : {}) };
  });
}
