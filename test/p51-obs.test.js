// Prompt 51 (OBS51): drift – helsedashbord med trendvarsel, selvreparasjon (bare omstart via proxyen, maks N per time, issue-utkast
// uten hemmeligheter), spor for trege forespørsler og ntfy (emner per bruker/enhet, høy prioritet for «Hent meg»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p51o-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-51o';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4604';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
delete process.env.DOCKER_HOST;
delete process.env.NTFY_URL;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
const extCalls = [];
globalThis.fetch = async (u) => { extCalls.push(String(u)); throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const logs = await import('../server/logs44.js');
const H = await import('../server/obs51/health.js');
const HE = await import('../server/obs51/heal.js');
const T = await import('../server/obs51/trace.js');
const N = await import('../server/obs51/ntfy.js');
const { notifyUser } = await import('../server/notify.js');
const { db } = await import('../server/db.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { 'x-forwarded-for': `198.51.100.${ipN++ % 250}`, ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text };
}
async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${ipN++ % 250}` }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (h) => (path, method = 'GET', body) => req(path, { method, headers: h, body });
const A = as({ cookie: await login('sebastian', 'testpassord1') });
const nu = await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' });
assert.equal(nu.status, 200);
const INGRID = nu.body.id ?? nu.body.user?.id ?? (await A('/api/users')).body.users?.find((x) => x.username === 'ingrid')?.id;
const I = as({ cookie: await login('ingrid', 'ingridPassord123') });
const NONE = as({});
const tick = () => new Promise((r) => setImmediate(r));

/* ---------------- Tilgang ---------------- */

test('bare admin ser driften; ntfy er per bruker', async () => {
  for (const p of ['/api/system/obs51/health', '/api/system/obs51/traces', '/api/system/obs51/heal', '/api/system/obs51/proxmox']) {
    assert.equal((await NONE(p)).status, 401, p);
    const r = await I(p);
    assert.equal(r.status, 403, p);
    assert.equal(r.body.restricted, true);
  }
  assert.equal((await I('/api/system/obs51/heal', 'PUT', { on: false })).status, 403);
  assert.equal((await NONE('/api/me/ntfy51')).status, 401);
  assert.equal((await I('/api/me/ntfy51')).status, 200);
});

/* ---------------- Helsedashbord og trend ---------------- */

test('helsedashbordet: containere (demo), disk for data-mappen, Ollama, Mac-OCR, Mac mini, Proxmox og ntfy', async () => {
  H._setObsDeps51({ macHealth: async () => ({ enabled: true, configured: true, ok: false, error: 'Svarte ikke innen 2 s' }) });
  const r = await A('/api/system/obs51/health?force=1');
  assert.equal(r.status, 200, r.text);
  const h = r.body;
  assert.equal(h.containers.available, true);
  assert.ok(h.containers.items.length >= 5);
  const run = h.containers.items.find((c) => c.state === 'running');
  assert.match(run.cpuText, /%$/); assert.match(run.memText, /MB/);
  assert.equal(h.containers.items[0].color, 'red', 'røde først');
  const d = h.disks.find((x) => x.id === 'data');
  assert.ok(d.total > 0 && d.free > 0, JSON.stringify(d));
  assert.ok(['ok', 'warn', 'crit'].includes(d.level));
  assert.equal(h.ollama.ok, false);
  assert.ok(Array.isArray(h.ollama.loaded));
  assert.equal(h.macOcr.ok, false);
  assert.ok(h.alerts.some((a) => a.key === 'macocr'));
  assert.ok(h.alerts.some((a) => a.key === 'ct:postgres:down'));
  assert.equal(h.proxmox.configured, false);
  assert.equal(h.ntfy.configured, false);
  assert.ok(['ok', 'warn', 'crit'].includes(h.overall));
});

test('trendvarsel: «Disken er full om 9 dager» fra lineær regresjon over ledig plass', () => {
  const now = Date.now();
  for (let i = 0; i <= 48; i++) H.sample51('disk.test.free', 180e9 - (i / 24) * 10e9, now - (48 - i) * 3_600_000); // 10 GB/døgn, 160 GB ledig nå
  const t = H.trend51('disk.test.free', now);
  assert.ok(Math.abs(t.perDay + 10e9) < 1e6, String(t.perDay));
  assert.ok(Math.abs(t.fullInDays - 16) < 0.2, String(t.fullInDays));
  assert.equal(H.fullText51(9.2), 'Disken er full om 9 dager');
  assert.equal(H.fullText51(1.2), 'Disken er full om 1 dag');
  assert.equal(H.fullText51(0.4), 'Disken er full i løpet av et døgn');
  assert.equal(H.fullText51(null), null);
  // For få målinger → ingen trend.
  H.sample51('disk.ny.free', 1e9, now);
  assert.equal(H.trend51('disk.ny.free', now).fullInDays, null);
  // Varsel på dashbordet når trenden sier under 14 dager.
  const al = H.alerts51({ disks: [{ id: 'x', name: 'Data-mappen', text: '90 GB ledig av 1 TB', pct: 91, pctText: '91 %', level: 'warn', trend: { text: 'Disken er full om 9 dager', perDayText: '−10 GB per døgn' } }] });
  assert.equal(al[0].title, 'Disken er full om 9 dager');
  assert.equal(al[0].level, 'warn');
});

/* ---------------- Selvreparasjon ---------------- */

function fakeDocker(state) {
  return (method, path) => {
    state.calls.push(`${method} ${path}`);
    if (method === 'GET' && path.startsWith('/containers/json')) return { body: state.list.map(([id, name, st, status]) => ({ Id: id.padEnd(64, '0'), Names: [`/${name}`], Image: `${name}:1.0`, State: st, Status: status })) };
    const m = path.match(/^\/containers\/([0-9a-f]+)\/(\w+)/);
    if (m && m[2] === 'logs') return { body: '2026-10-24T10:00:00.000000000Z ERROR healthcheck failed token=hemmelig123 apikey=abcdef0123456789abcdef\n2026-10-24T10:00:01.000000000Z INFO GET /api?api_key=topphemmelig 200 Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk\n' };
    if (m && m[2] === 'json') return { body: { State: { Status: 'running' }, RestartCount: 0, Config: { Env: [] } } };
    if (method === 'POST' && m && m[2] === 'restart') { state.restarts.push(m[1].slice(0, 12)); return { status: 204, body: '' }; }
    return { status: 404, body: { message: 'ukjent' } };
  };
}

test('selvreparasjon: unhealthy to runder → omstart via proxyen (bare restart), maks N per time, issue-utkast uten hemmeligheter', async () => {
  HE._resetHeal51();
  const st = { calls: [], restarts: [], list: [['aaaaaaaaaaaa', 'sonarr', 'running', 'Up 2 hours (unhealthy)'], ['bbbbbbbbbbbb', 'homelab-os', 'running', 'Up 2 hours (unhealthy)'], ['cccccccccccc', 'radarr', 'running', 'Up 1 hour (healthy)'], ['dddddddddddd', 'jellyfin', 'running', 'Up 1 hour (unhealthy)']] };
  const later = [];
  HE._setHealTimer51((fn) => later.push(fn));
  logs._setDocker44(fakeDocker(st));
  try {
    assert.equal(HE.saveHeal51({ maxPerHour: 2, exclude: ['jellyfin'] }), null);
    assert.match(HE.saveHeal51({ maxPerHour: 99 }), /1–10/);
    assert.match(HE.saveHeal51({ exclude: ['ok', '../x y'] }), /containernavn/);
    let t = Date.now();
    let r = await HE.healOnce51(t);
    assert.deepEqual(r.restarted, [], 'første runde venter');
    assert.ok(r.skipped.some((s) => s.name === 'sonarr' && /venter/.test(s.why)));
    // Rask ny runde (< 50 s) teller ikke.
    r = await HE.healOnce51(t + 10_000);
    assert.deepEqual(r.restarted, []);
    t += 60_000;
    r = await HE.healOnce51(t);
    assert.deepEqual(r.restarted, ['sonarr']);
    assert.ok(r.skipped.some((s) => s.name === 'homelab-os' && s.why === 'Homelab selv'));
    assert.ok(r.skipped.some((s) => s.name === 'jellyfin' && s.why === 'unntatt'));
    assert.deepEqual(st.restarts, ['aaaaaaaaaaaa']);
    // Varsel etterpå: fortsatt syk → verify-hendelse.
    await later.shift()();
    assert.ok(HE.healOut51().events.some((e) => e.action === 'verify' && !e.ok));
    // Ny episode: to runder til → omstart nr. 2. Deretter er grensen (2 per time) nådd.
    r = await HE.healOnce51(t += 60_000); assert.deepEqual(r.restarted, []);
    r = await HE.healOnce51(t += 60_000); assert.deepEqual(r.restarted, ['sonarr']);
    r = await HE.healOnce51(t += 60_000);
    r = await HE.healOnce51(t += 60_000);
    assert.deepEqual(r.restarted, []);
    assert.ok(r.skipped.some((s) => s.name === 'sonarr' && s.why === 'grensen per time'));
    assert.equal(r.drafts.length, 1, 'issue-utkast når grensen nås');
    assert.equal(st.restarts.length, 2);
    // Bare GET og POST …/restart mot proxyen.
    for (const c of st.calls) assert.match(c, /^GET |^POST \/containers\/[0-9a-f]+\/restart\?t=10$/, c);
    // Utkastet: maskerte logger, aldri opprettet automatisk.
    const out = await A('/api/system/obs51/heal');
    assert.equal(out.status, 200);
    assert.equal(out.body.drafts.length, 1);
    const d = await A(`/api/system/obs51/heal/drafts/${out.body.drafts[0].id}`);
    assert.equal(d.status, 200);
    assert.match(d.body.title, /sonarr/);
    assert.match(d.body.markdown, /Siste logglinjer/);
    assert.match(d.body.markdown, /healthcheck failed/);
    for (const s of ['hemmelig123', 'topphemmelig', 'abcdef0123456789abcdef', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIi']) assert.ok(!d.body.markdown.includes(s), s);
    assert.match(d.body.note, /ikke sendt/);
    assert.ok(!extCalls.some((u) => /github/i.test(u)), 'ingen issue opprettes automatisk');
    assert.equal((await A(`/api/system/obs51/heal/drafts/${out.body.drafts[0].id}`, 'DELETE')).status, 200);
    assert.equal((await A('/api/system/obs51/heal')).body.drafts.length, 0);
    // Av → ingenting skjer.
    assert.equal((await A('/api/system/obs51/heal', 'PUT', { on: false })).status, 200);
    r = await HE.healOnce51(t += 3_600_000);
    assert.equal(r.off, 'av');
    assert.equal((await A('/api/system/obs51/heal/run', 'POST', {})).status, 400, 'krever confirm');
    assert.equal((await A('/api/system/obs51/heal/run', 'POST', { confirm: true })).status, 200);
  } finally { logs._setDocker44(null); HE._setHealTimer51((fn, ms) => setTimeout(fn, ms).unref()); }
});

test('selvreparasjon bruker bare GET og restart (ingen nye Docker-handlinger i obs51)', () => {
  for (const f of readdirSync('server/obs51')) {
    const s = readFileSync(join('server/obs51', f), 'utf8');
    assert.doesNotMatch(s, /dockerJson|dockerRaw|'POST', `\/containers|\/(stop|kill|exec|create|pause|update)\b['`?]/, f);
  }
  const l = readFileSync('server/logs44.js', 'utf8');
  const blk = l.slice(l.indexOf('export const docker51'));
  assert.match(blk, /restart: \(id\) => action44\(id, 'restart'\)/);
  assert.doesNotMatch(blk, /'stop'|'start'\)|POST/);
});

/* ---------------- Spor ---------------- */

test('spor: trege forespørsler med spenn for DB, AI og eksterne kall (uten spørrestreng og tokens)', async () => {
  assert.equal(T.routeOf51('/api/finans/receipts/123/image'), '/api/finans/receipts/:id/image');
  assert.equal(T.routeOf51('/api/x/0f8fad5b-d9cb-469f-a165-70867728950e?y=1'), '/api/x/:id');
  const u = T.urlOf51('https://api.example.com/bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/send?token=abc');
  assert.equal(u.host, 'api.example.com');
  assert.ok(!u.path.includes('AAHdqTcv') && !u.path.includes('token'), u.path);
  T._resetTrace51();
  const old = T.TRACE51.slowMs;
  T.TRACE51.slowMs = 0;
  process.env.NTFY_URL = 'http://ntfy.test';
  try {
    await I('/api/me/ntfy51/topics', 'POST', { device: 'Test' });
    await I('/api/me/ntfy51/test', 'POST', {});
    const r = await A('/api/system/obs51/traces?limit=50');
    assert.equal(r.status, 200);
    const x = r.body.items.find((i) => i.route === '/api/me/ntfy51/test');
    assert.ok(x, JSON.stringify(r.body.items.map((i) => i.route)));
    assert.ok(x.spans.db.n > 0, 'db-spenn');
    assert.equal(x.spans.ext.n, 1, 'eksternt kall');
    assert.match(x.spans.ext.top[0].label, /^ntfy\.test\//);
    assert.ok(r.body.routes.some((y) => y.route === '/api/me/ntfy51/test' && y.p95 != null));
    assert.ok(!JSON.stringify(r.body).includes('/api/system/obs51/traces'), 'spor-ruten spores ikke');
  } finally { T.TRACE51.slowMs = old; delete process.env.NTFY_URL; }
});

/* ---------------- ntfy ---------------- */

test('ntfy: emner per enhet, varsler fra notifyUser, «Hent meg» med høy prioritet, tokenet sendes aldri ut', async () => {
  process.env.NTFY_URL = 'http://ntfy:80';
  process.env.NTFY_PUBLIC_URL = 'http://10.0.0.5:2586';
  process.env.NTFY_TOKEN = 'tk_hemmeligntfytoken123';
  const sent = [];
  N._setNtfyFetch51(async (url, init) => { sent.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return new Response('{}', { status: 200 }); });
  try {
    let r = await A('/api/me/ntfy51');
    assert.equal(r.body.enabled, true);
    assert.equal(r.body.upstream.enabled, false);
    r = await A('/api/me/ntfy51/topics', 'POST', { device: 'iPhone' });
    assert.equal(r.status, 200);
    const t = r.body.topic;
    assert.match(t.topic, /^hl_[A-Za-z0-9]{20,}$/);
    assert.equal(t.subscribeUrl, `http://10.0.0.5:2586/${t.topic}`);
    assert.ok(!r.text.includes('tk_hemmelig'), 'tokenet sendes aldri til klienten');
    // Ingrid ser ikke Sebastians emner.
    const ri = await I('/api/me/ntfy51');
    assert.ok(!ri.text.includes(t.topic));
    assert.equal((await I(`/api/me/ntfy51/topics/${t.id}`, 'DELETE')).status, 404);
    // Vanlig varsel (dagtid) → prioritet 3; «Hent meg» → 5.
    const noon = Date.parse('2026-10-24T10:00:00Z');
    await notifyUser('owner', { title: 'Pakken er levert', body: 'Hentested Kiwi', category: 'pakker' }, { now: noon });
    await tick(); await tick();
    await notifyUser('owner', { title: 'Hent meg', body: 'Ingrid vil bli hentet', category: 'familie', data: { priority: 'high' } }, { now: Date.parse('2026-10-24T23:30:00Z') });
    await tick(); await tick();
    const mine = sent.filter((s) => s.body.topic === t.topic);
    assert.equal(mine.length, 2, JSON.stringify(sent));
    assert.equal(mine[0].body.title, 'Pakken er levert');
    assert.equal(mine[0].body.priority, 3);
    assert.equal(mine[1].body.priority, 5, '«Hent meg» går gjennom stille timer med høy prioritet');
    assert.deepEqual(mine[1].body.tags, ['rotating_light']);
    assert.equal(mine[0].url, 'http://ntfy:80');
    assert.equal(mine[0].headers.Authorization, 'Bearer tk_hemmeligntfytoken123');
    assert.equal(N.priorityOf51({ category: 'system', data: { obs51: true } }), 4);
    // Test-knappen.
    r = await A('/api/me/ntfy51/test', 'POST', {});
    assert.equal(r.status, 200); assert.equal(r.body.sent, 1);
    assert.equal((await A(`/api/me/ntfy51/topics/${t.id}`, 'DELETE')).status, 200);
  } finally { N._setNtfyFetch51(null); delete process.env.NTFY_URL; delete process.env.NTFY_PUBLIC_URL; delete process.env.NTFY_TOKEN; }
});

/* ---------------- Proxmox ---------------- */

test('Proxmox: token lagres kryptert, vises aldri, og noder/lagring kommer på dashbordet', async () => {
  assert.equal((await A('/api/system/obs51/proxmox', 'PUT', { url: 'http://pve:8006' })).status, 400, 'bare https');
  assert.equal((await A('/api/system/obs51/proxmox', 'PUT', { url: 'https://pve.lan:8006', tokenId: 'feil' })).status, 400);
  const SECRET = '1b2c3d4e-5f60-7182-93a4-b5c6d7e8f901';
  let r = await A('/api/system/obs51/proxmox', 'PUT', { url: 'https://pve.lan:8006', tokenId: 'homelab@pve!drift', secret: SECRET });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.configured, true); assert.equal(r.body.secretSet, true);
  assert.ok(!r.text.includes(SECRET));
  const raw = db.prepare("SELECT value FROM kv WHERE key='obs51_proxmox'").get().value;
  assert.ok(!raw.includes(SECRET), 'kryptert i kv');
  const seen = [];
  H._setPveFetch51(async (url, init) => {
    seen.push({ url, auth: init.headers.Authorization });
    const data = url.endsWith('/nodes') ? [{ node: 'pve', status: 'online', cpu: 0.12, maxcpu: 8, mem: 8e9, maxmem: 32e9, uptime: 1000 }] : [{ storage: 'local-lvm', type: 'lvmthin', active: 1, total: 500e9, used: 470e9, avail: 30e9 }];
    return new Response(JSON.stringify({ data }), { status: 200 });
  });
  try {
    r = await A('/api/system/obs51/health?force=1');
    assert.equal(r.body.proxmox.ok, true);
    assert.equal(r.body.proxmox.nodes[0].node, 'pve');
    assert.equal(seen[0].auth, `PVEAPIToken=homelab@pve!drift=${SECRET}`);
    const disk = r.body.disks.find((d) => d.id === 'pve.pve.local-lvm');
    assert.ok(disk, JSON.stringify(r.body.disks)); assert.equal(disk.level, 'warn', '94 % brukt');
    assert.ok(!r.text.includes(SECRET), 'hemmeligheten er aldri i svaret');
    assert.equal((await A('/api/system/obs51/proxmox', 'PUT', { clear: true })).body.configured, false);
  } finally { H._setPveFetch51(null); }
});

/* ---------------- docker-compose ---------------- */

test('docker-compose: ntfy med fast tag, egen profil, bare LAN, deny-all, upstream av; Docker-proxyen er ikke utvidet', () => {
  const y = readFileSync('docker-compose.yml', 'utf8');
  const blk = y.slice(y.indexOf('  ntfy:'), y.indexOf('\nnetworks:'));
  assert.match(blk, /image: binwiederhier\/ntfy:v\d+\.\d+\.\d+\n/);
  assert.match(blk, /profiles: \[ntfy\]/);
  assert.match(blk, /NTFY_AUTH_DEFAULT_ACCESS: deny-all/);
  assert.match(blk, /"\$\{NTFY_BIND:-127\.0\.0\.1\}:/);
  assert.doesNotMatch(blk, /^\s+NTFY_UPSTREAM_BASE_URL:/m);
  const px = y.slice(y.indexOf('  homelab-docker:'), y.indexOf('  cloudflared:'));
  assert.match(px, /POST: 0/);
  const allows = px.match(/ALLOW_\w+/g);
  assert.deepEqual([...new Set(allows)].sort(), ['ALLOW_RESTARTS', 'ALLOW_START', 'ALLOW_STOP']);
  assert.match(readFileSync('.gitignore', 'utf8'), /^ntfy\/$/m);
});
