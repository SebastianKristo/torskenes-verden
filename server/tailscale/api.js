// Tailscale: API-et (prompt 57, claude-code-tailscale.md §4). Bare administratorer, med økt eller app-token (samme endepunkter
// for web, iOS og Android). Kontrakten står i shared/schemas/api/tailscale-*.schema.json.
//
//   GET  /api/tailscale/devices              → {source, updatedAt, tailnet, counts, filters, groups, devices:[…], lastChange}
//   GET  /api/tailscale/devices/:id?range=   → {device, facts, history:{range, uptime, latency, tunnel, traffic, stripe}, services, alerts}
//   POST /api/tailscale/devices/:id/ping     → {ok, latencyMs, tunnel, label}  (disco-ping via LocalAPI; ingen skriving mot Tailscale)
//   GET  /api/tailscale/stats                → tall for hele tailnetet, vedlikehold og trafikk i dag
//   GET  /api/tailscale/test                 → {ok, message, ms} (samme test som Innstillinger → Tilkoblinger → Tailscale)
//   GET|PUT /api/tailscale/visning           → filter, søk, gruppering og åpen/lukket per bruker
// Nøkkelen sendes aldri hit eller ut: svarene har bare de normaliserte enhetene.
import { Hono } from 'hono';
import { kv, OWNER } from '../db.js';
import { isAdmin, requireAdmin } from '../auth/session.js';
import { authOrToken } from '../mobile.js';
import { config } from '../config.js';
import { cfg } from '../settings.js';
import { peek } from '../cache.js';
import { hent, settLatens, sisteEndring } from './tilstand.js';
import { pingIp } from './kilde.js';
import * as S from './statistikk.js';
import { medTekster, fakta, filtre, grupper, antall, latensTekst, byteTekst, prosent, FILTRE } from './etiketter.js';

const NO_STORE = { 'Cache-Control': 'no-store' };
const RANGE_LABEL = { '24h': '24 t', '7d': '7 d', '30d': '30 d' };

/** Sesjon eller app-token, og bare administratorer (requireAdmin leser rollen). */
const admin = async (c, next) => { c.set('role', isAdmin(c.get('user')) ? 'admin' : 'bruker'); return requireAdmin(c, next); };

const feil = (c, e) => {
  const status = e?.status ?? 502;
  return c.json({ error: e?.message || 'Tailscale svarte ikke', code: e?.code ?? (status === 503 ? 'TAILSCALE_NOT_CONFIGURED' : 'UPSTREAM_ERROR') }, status, NO_STORE);
};

/* ---------------- Tjenester i helsesjekken som hører til en enhet ---------------- */

const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
/** Tjenestene i Nettverk-fanen (helsesjekken) med en 100.x-adresse eller et MagicDNS-navn som peker på enheten. */
export function tjenesterFor(d, user = OWNER) {
  const list = config.services.map(([name, url]) => [name, name === 'Home Assistant' ? cfg('ha_url') || url : url]);
  const health = peek(`health:${user}`)?.services ?? [];
  const keys = new Set([d.ip, d.dns, d.name, d.dns ? d.dns.split('.')[0] : null].filter(Boolean).map((x) => String(x).toLowerCase()));
  return list.filter(([, url]) => {
    const h = hostOf(url);
    return h && (keys.has(h) || keys.has(h.split('.')[0]) && /\.ts\.net$/.test(h));
  }).map(([name, url]) => {
    const st = health.find((s) => s.name === name);
    return { name, url, up: st ? !!st.up : null };
  });
}

/* ---------------- Utdata ---------------- */

async function liste(now = Date.now()) {
  const t = await hent(now);
  const devices = t.devices.map((d) => medTekster(d, now));
  return { t, devices };
}

const VISNING_STD = { filter: 'alle', q: '', group: 'ingen', open: true, showAll: false };
function visningOf(u) {
  const v = kv.get(u, 'ts_visning', {}) ?? {};
  return {
    filter: FILTRE.some((f) => f.id === v.filter) ? v.filter : VISNING_STD.filter,
    q: typeof v.q === 'string' ? v.q.slice(0, 80) : '',
    group: ['ingen', 'tags', 'eier'].includes(v.group) ? v.group : VISNING_STD.group,
    open: typeof v.open === 'boolean' ? v.open : VISNING_STD.open,
    showAll: typeof v.showAll === 'boolean' ? v.showAll : VISNING_STD.showAll,
  };
}

export const tailscaleApi = new Hono();
tailscaleApi.use('*', authOrToken, admin);

tailscaleApi.get('/devices', async (c) => {
  const now = Date.now();
  try {
    const { t, devices } = await liste(now);
    return c.json({ source: t.source, updatedAt: t.updatedAt, tailnet: t.tailnet, magicDns: t.magicDns, ...(t.stale ? { stale: true } : {}),
      counts: antall(devices), filters: filtre(devices), groups: grupper(devices), devices, lastChange: sisteEndring(), view: visningOf(c.get('user')) }, 200, NO_STORE);
  } catch (e) { return feil(c, e); }
});

tailscaleApi.get('/devices/:id', async (c) => {
  const now = Date.now(), range = Object.hasOwn(S.RANGES, c.req.query('range') ?? '') ? c.req.query('range') : '24h';
  try {
    const { devices } = await liste(now);
    const d = devices.find((x) => x.id === c.req.param('id'));
    if (!d) return c.json({ error: 'Fant ikke enheten', code: 'NOT_FOUND' }, 404, NO_STORE);
    const traffic = S.trafikk(d.id, now - S.RANGES[range], now);
    const uptime = S.oppetid(d.id, now), lat = S.latens(d.id, now), tunnel = S.tunnelAndel(d.id, now, S.RANGES[range]);
    return c.json({
      device: d, facts: fakta(d, { traffic, firstSeen: S.forstSett(d.id), rangeLabel: RANGE_LABEL[range] }),
      history: { range, uptime, uptimeLabels: Object.fromEntries(Object.entries(uptime).map(([k, v]) => [k, prosent(v) ?? 'ukjent'])),
        latency: { ...lat, medianLabel: latensTekst(lat.median), p95Label: latensTekst(lat.p95) },
        tunnel: { ...tunnel, label: tunnel.direkte == null ? 'tunnel ukjent' : `${prosent(tunnel.direkte)} direkte${tunnel.relay ? ` · DERP ${tunnel.relay}` : ''}` },
        traffic: { ...traffic, label: `↓ ${byteTekst(traffic.rx)} · ↑ ${byteTekst(traffic.tx)}` }, stripe: S.stripe30(d.id, now) },
      services: tjenesterFor(d, c.get('user')), canPing: !d.self && !!d.ip && d.online,
    }, 200, NO_STORE);
  } catch (e) { return feil(c, e); }
});

tailscaleApi.post('/devices/:id/ping', async (c) => {
  try {
    const { devices } = await liste();
    const d = devices.find((x) => x.id === c.req.param('id'));
    if (!d) return c.json({ error: 'Fant ikke enheten', code: 'NOT_FOUND' }, 404, NO_STORE);
    if (!d.ip) return c.json({ error: 'Enheten har ingen Tailscale-adresse', code: 'BAD_REQUEST' }, 400, NO_STORE);
    const r = await pingIp(d.ip);
    if (r.code === 'PING_NEEDS_LOCALAPI') return c.json({ error: r.error, code: r.code }, 409, NO_STORE);
    settLatens(d.id, r);
    return c.json({ ok: r.ok, latencyMs: r.latencyMs, tunnel: r.tunnel, label: r.ok ? `Svar på ${latensTekst(r.latencyMs)}` : 'Ingen svar' }, 200, NO_STORE);
  } catch (e) { return feil(c, e); }
});

tailscaleApi.get('/stats', async (c) => {
  const now = Date.now();
  try {
    const { t, devices } = await liste(now);
    const counts = antall(devices), lat = S.tailnetLatens(now), today = S.trafikkIDag(now);
    const nameOf = new Map(devices.map((d) => [d.id, d.name]));
    const maint = S.vedlikehold(devices, t.selfVersion, now);
    const top = today.per.filter((x) => nameOf.has(x.id)).slice(0, 5).map((x) => ({ ...x, name: nameOf.get(x.id), label: `↓ ${byteTekst(x.rx)} · ↑ ${byteTekst(x.tx)}` }));
    const nye = S.nyeSiste7d(now);
    return c.json({
      source: t.source, updatedAt: t.updatedAt, counts,
      latency: { median: lat.median, label: latensTekst(lat.median) }, direct: { share: lat.direkte, label: prosent(lat.direkte) ?? 'ukjent' },
      traffic: { today: { rx: today.rx, tx: today.tx, label: byteTekst(today.rx + today.tx) }, top, perDay: S.perDag(now, 7) },
      newDevices7d: nye, maintenance: maint, lastChange: sisteEndring(),
      tiles: [
        { id: 'online', label: 'ONLINE', value: `${counts.online}/${counts.total}`, sub: `${counts.offline} offline` },
        { id: 'latency', label: 'MEDIAN LATENS', value: latensTekst(lat.median), sub: 'siste 24 t' },
        { id: 'direct', label: 'DIREKTE', value: prosent(lat.direkte) ?? 'ukjent', sub: 'resten via DERP' },
        { id: 'traffic', label: 'TRAFIKK I DAG', value: byteTekst(today.rx + today.tx), sub: `↓ ${byteTekst(today.rx)} · ↑ ${byteTekst(today.tx)}` },
        { id: 'maintenance', label: 'VEDLIKEHOLD', value: String(maint.count), sub: maint.count === 1 ? 'punkt' : 'punkter' },
      ],
    }, 200, NO_STORE);
  } catch (e) { return feil(c, e); }
});

tailscaleApi.get('/test', async (c) => {
  const { testByIdOrName } = await import('../integrations-api.js');
  const r = await testByIdOrName('tailscale', c.get('user'));
  return c.json(r ?? { ok: false, message: 'Ingen test' }, 200, NO_STORE);
});

tailscaleApi.get('/visning', (c) => c.json(visningOf(c.get('user')), 200, NO_STORE));
tailscaleApi.put('/visning', async (c) => {
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return c.json({ error: 'Ugyldig kropp', code: 'BAD_REQUEST' }, 400, NO_STORE);
  const u = c.get('user'), cur = kv.get(u, 'ts_visning', {}) ?? {};
  const next = { ...cur };
  for (const k of ['filter', 'q', 'group']) if (typeof b[k] === 'string') next[k] = b[k].slice(0, 80);
  for (const k of ['open', 'showAll']) if (typeof b[k] === 'boolean') next[k] = b[k];
  kv.set(u, 'ts_visning', next);
  return c.json(visningOf(u), 200, NO_STORE);
});
