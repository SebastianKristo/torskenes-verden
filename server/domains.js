// Domener: sone, DNS og registrar fra Cloudflare, cachet i 15 minutter.
import { Hono } from 'hono';
import { cfg } from './settings.js';
import { cached } from './cache.js';
import { guard, MOCK } from './homeos-common.js';

const CF = 'https://api.cloudflare.com/client/v4';
const TTL = 15 * 60_000;

const MOCK_DATA = {
  configured: true, domain: 'arildkrist.com', status: 'active', plan: 'Free', registrar: 'Cloudflare', expires: '2027-03-14', renewal: '10,44 USD', ssl: 'Full (strict)',
  nameServers: ['ada.ns.cloudflare.com', 'ben.ns.cloudflare.com'], requests24h: 12840,
  records: [['A', 'arildkrist.com', '84.212.xx.xx', true], ['CNAME', 'www', 'arildkrist.com', true], ['CNAME', 'finans', 'tunnel · cfargotunnel.com', true],
    ['CNAME', 'home', 'tunnel · cfargotunnel.com', true], ['MX', 'arildkrist.com', 'mail.protonmail.ch', false], ['TXT', 'arildkrist.com', 'v=spf1 include:_spf.protonmail.ch ~all', false]]
    .map(([type, name, content, proxied]) => ({ type, name, content, proxied })),
};

async function cf(path, token) {
  const res = await fetch(CF + path, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.success === false) throw new Error(d.errors?.[0]?.message || `Cloudflare svarte ${res.status}`);
  return d.result;
}

// Valgfri data (registrar, SSL, analyse) krever ekstra rettigheter; mangler de, vises «–».
const soft = (p) => p.catch(() => null);

async function load() {
  const token = cfg('cf_token'), name = cfg('cf_domain');
  if (!token) return { configured: false };
  const zones = await cf(`/zones${name ? `?name=${encodeURIComponent(name)}` : '?per_page=1'}`, token);
  const z = zones?.[0];
  if (!z) throw new Error(name ? `Fant ikke sonen ${name}` : 'Tokenet har ingen soner');
  const since = new Date(Date.now() - 86400_000).toISOString();
  const [records, ssl, reg, stats] = await Promise.all([
    cf(`/zones/${z.id}/dns_records?per_page=100`, token),
    soft(cf(`/zones/${z.id}/settings/ssl`, token)),
    soft(cf(`/accounts/${z.account.id}/registrar/domains/${z.name}`, token)),
    soft(fetch(`${CF}/graphql`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ query: `{viewer{zones(filter:{zoneTag:"${z.id}"}){httpRequests1hGroups(limit:24,filter:{datetime_get:"${since}"}){sum{requests}}}}}` }) })
      .then((r) => r.json())),
  ]);
  const groups = stats?.data?.viewer?.zones?.[0]?.httpRequests1hGroups;
  const SSL = { full: 'Full', strict: 'Full (strict)', flexible: 'Fleksibel', off: 'Av' };
  return {
    configured: true, domain: z.name, status: z.status, plan: z.plan?.name ?? '–', registrar: reg ? 'Cloudflare' : (z.original_registrar ?? '–'),
    expires: reg?.expires_at?.slice(0, 10) ?? null, renewal: null, ssl: ssl ? SSL[ssl.value] ?? ssl.value : null, nameServers: z.name_servers ?? [],
    requests24h: groups ? groups.reduce((a, g) => a + (g.sum?.requests ?? 0), 0) : null,
    records: records.map((r) => ({ type: r.type, name: r.name === z.name ? r.name : r.name.replace('.' + z.name, ''), content: r.content, proxied: !!r.proxied })),
  };
}

const api = new Hono();
api.use('*', guard);
api.get('/cloudflare', async (c) => {
  if (MOCK && !cfg('cf_token')) return c.json(MOCK_DATA);
  try { return c.json(await cached('cloudflare:' + cfg('cf_domain'), TTL, load)); }
  catch (e) { return c.json({ error: e.message }, 502); }
});

export default api;
