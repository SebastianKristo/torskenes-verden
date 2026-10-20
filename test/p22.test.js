// Prompt 22 (server): standardtema «lys», sporing (Mybring, statuser, sjekkeplan, gamle pakker, manuelle logoer),
// Familie (soneikoner og -farger, profilbilde per seer) og vær (Yr mot Pent, timedata og sol/måne for 7 dager).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p22-'));
process.env.LOGO_FILES_DIR = mkdtempSync(join(tmpdir(), 'hl-p22-logos-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: app } = await import('../server/index.js');
const { db, kv, OWNER } = await import('../server/db.js');
const { cfg, updateConfig, publicConfig } = await import('../server/settings.js');
const trk = await import('../server/tracking.js');
const { mybringStatus, normStatus } = await import('../server/tracking-carriers.js');
const match = await import('../server/logos/match.js');
const wx = await import('../server/weather-full.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (cookie) => async (path, method = 'GET', body, headers = {}) => {
  const isRaw = body instanceof FormData || Buffer.isBuffer(body);
  const r = await app.request(path, { method, headers: { cookie, ...(body && !isRaw ? { 'content-type': 'application/json' } : {}), ...headers }, body: isRaw ? body : body ? JSON.stringify(body) : undefined });
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null; try { json = JSON.parse(buf.toString()); } catch { /* */ }
  return { status: r.status, body: json, buf, text: buf.toString() };
};
const A = client(await login('sebastian', 'testpassord1'));
assert.equal((await A('/api/users', 'POST', { username: 'ola', password: 'olaPassord123', role: 'bruker', name: 'Ola' })).status, 200);
const B = client(await login('ola', 'olaPassord123'));
const aId = (await A('/api/me')).body.id, bId = (await B('/api/me')).body.id;
const mockFetch = (handler) => { const orig = globalThis.fetch; globalThis.fetch = async (url, init) => (await handler(String(url), init)) ?? new Response('{}', { status: 404 }); return () => { globalThis.fetch = orig; }; };
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

/* ---------------- 1. Standardtema ---------------- */

test('standardtema: design «lys» når ingenting er lagret; lagret valg overskrives ikke', async () => {
  assert.equal((await A('/api/me/layout')).body.design, 'lys');
  assert.equal((await B('/api/me/layout')).body.design, 'lys');
  assert.equal((await A('/api/me/layout', 'PUT', { design: 'glod' })).status, 200);
  assert.equal((await A('/api/me/layout')).body.design, 'glod');
  assert.equal((await B('/api/me/layout')).body.design, 'lys', 'per bruker');
  await A('/api/me/layout', 'PUT', { design: 'v2' });
  assert.equal((await A('/api/me/layout')).body.design, 'v2', '«Nåværende (FinansHub v2)» finnes fortsatt');
});

/* ---------------- 3. Sporing ---------------- */

test('nøkler: mybringUid, mybringKey og postnordKey; gamle navn leses fortsatt', () => {
  kv.set(OWNER, 'cfg', { ...kv.get(OWNER, 'cfg', {}), trk_bring_uid: 'gammel@x.no' });
  assert.equal(cfg('mybringUid'), 'gammel@x.no');
  updateConfig({ mybringUid: 'meg@x.no', mybringKey: 'k1', postnordKey: 'p1' });
  assert.equal(cfg('mybringUid'), 'meg@x.no');
  assert.equal(cfg('trk_bring_key'), 'k1', 'gammelt navn peker på det nye');
  const g = publicConfig().find((x) => x.id === 'tracking');
  for (const k of ['mybringUid', 'mybringKey', 'postnordKey']) assert.ok(g.fields.some((f) => f.key === k), k);
  assert.equal(g.fields.find((f) => f.key === 'mybringKey').value, '', 'hemmeligheten sendes ikke');
});

test('Mybring-statuser kartlegges', () => {
  const exp = { PRE_NOTIFIED: 'registered', IN_TRANSIT: 'in_transit', TRANSPORT_TO_RECIPIENT: 'in_transit', HANDED_IN: 'picked_up', READY_FOR_PICKUP: 'ready_for_pickup', DELIVERED: 'delivered', DELIVERED_SENDER: 'delivered', RETURN: 'returned' };
  for (const [k, v] of Object.entries(exp)) assert.equal(mybringStatus(k), v, k);
  assert.equal(normStatus('Returned to sender'), 'returned');
});

const bringResp = (events, extra = {}) => json({ consignmentSet: [{ consignment: [{ packageSet: [{ ...extra, eventSet: events }] }] }] });

test('LL134336179NO (levert, e-post eldre enn 14 dager) → Levert, Arkiv, Posten-logo uten favicon', async () => {
  const old = new Date(Date.now() - 20 * 86400_000);
  trk.upsertShipment({ trackingNo: 'LL134336179NO', source: 'email', sourceNote: 'Funnet i e-post · 17.10 23:31', sourceDate: old });
  const restore = mockFetch((url, init) => {
    if (url.includes('api.bring.com')) { assert.equal(init.headers['X-Mybring-API-Uid'], 'meg@x.no'); assert.equal(init.headers['X-Mybring-API-Key'], 'k1');
      return bringResp([{ status: 'DELIVERED', description: 'Sendingen er levert', dateIso: '2026-10-08T12:10:00+02:00', city: 'Oslo' }, { status: 'IN_TRANSIT', description: 'Ankommet terminal', dateIso: '2026-10-07T06:12:00+02:00', city: 'Oslo' }]); }
  });
  try { const r = await A('/api/tracking/refresh', 'POST'); assert.equal(r.status, 200, r.text); }
  finally { restore(); }
  const s = (await A('/api/tracking')).body.items.find((x) => x.trackingNo === 'LL134336179NO');
  assert.equal(s.status, 'delivered');
  assert.equal(s.archived, true);
  assert.equal(s.carrier, 'posten');
  assert.equal(s.lastEvent.text, 'Sendingen er levert');
  assert.equal(s.lastEvent.place, 'Oslo');
  assert.ok(s.lastEvent.time);
  assert.equal(s.updateError, null);
  assert.equal(s.nextCheckAt, null, 'Levert sjekkes ikke mer');
  // Ingen kontrollert fil i testmappen: fargefyll med navn, ingen URL og aldri favicon.
  assert.equal(s.logo.kind, 'carrier');
  assert.equal(s.logo.url, null);
  assert.equal(s.logo.svg, null);
  assert.equal(s.logo.label, 'Posten');
  assert.equal(s.logo.color, '#E32D22');
  assert.equal(s.carrierLogo, null);
  assert.equal(s.timeline.length, 5);
  assert.ok(s.timeline[4].current && s.timeline[4].time);
  const fav = await app.request('/finans/api/logo/posten.no');
  assert.equal(fav.status, 404, 'ikke favicon for Posten');
});

test('manuell logo: kontrollert fil i files/manuell brukes; files/posten.png (favicon) ignoreres', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000400000004008060000', 'hex');
  writeFileSync(join(process.env.LOGO_FILES_DIR, 'posten.png'), png); // et gammelt favicon
  assert.equal(match.filePath('posten'), null);
  mkdirSync(join(process.env.LOGO_FILES_DIR, 'manuell'), { recursive: true });
  writeFileSync(join(process.env.LOGO_FILES_DIR, 'manuell', 'posten.png'), png);
  assert.match(match.filePath('posten'), /manuell[\\/]posten\.png$/);
  const s = (await A('/api/tracking')).body.items.find((x) => x.trackingNo === 'LL134336179NO');
  assert.equal(s.logo.url, '/finans/api/logos/file/posten');
  assert.equal(s.carrierLogo, '/finans/api/logos/file/posten');
  const reg = match.registry().items;
  for (const id of ['posten', 'bring', 'postnord', 'dhl', 'helthjem', 'instabox', 'budbee', 'ups', 'fedex']) {
    const it = reg.find((x) => x.id === id);
    assert.equal(it.kilde, 'manuell', id);
    assert.match(it.src, /^https:\/\//, id);
  }
  assert.equal(reg.find((x) => x.id === 'posten').farge, '#E32D22');
  assert.equal(reg.find((x) => x.id === 'bring').farge, '#7BC144');
});

test('Bring i transport og hentested: siste hendelse, forventet levering, pickup {name, deadline}', async () => {
  trk.upsertShipment({ trackingNo: '70712345678901111', carrier: 'bring', source: 'manual' });
  trk.upsertShipment({ trackingNo: '70712345678902222', carrier: 'bring', source: 'manual' });
  const restore = mockFetch((url) => {
    if (url.includes('q=70712345678901111')) return bringResp([{ status: 'IN_TRANSIT', description: 'Ankommet terminal', dateIso: '2026-10-18T06:12:00+02:00', city: 'Oslo' }], { dateOfEstimatedDelivery: '2026-10-21' });
    if (url.includes('q=70712345678902222')) return bringResp([{ status: 'READY_FOR_PICKUP', description: 'Klar for henting', dateIso: '2026-10-18T09:00:00+02:00', city: 'Oslo', unitInformation: { name: 'Kiwi Bislett' } }], { dateOfReturn: '2026-10-30' });
  });
  try { await A('/api/tracking/refresh', 'POST'); } finally { restore(); }
  const items = (await A('/api/tracking')).body.items;
  const t = items.find((x) => x.trackingNo === '70712345678901111');
  assert.equal(t.status, 'in_transit');
  assert.equal(t.estimatedDelivery, '2026-10-21');
  assert.equal(t.lastEvent.line, 'Ankommet terminal · Oslo · 18.10 06:12');
  assert.ok(t.nextCheckAt);
  const p = items.find((x) => x.trackingNo === '70712345678902222');
  assert.equal(p.status, 'ready_for_pickup');
  assert.deepEqual(p.pickup, { name: 'Kiwi Bislett', deadline: '2026-10-30' });
  assert.equal(p.steps[3], 'Hentested');
});

test('API-feil: updateError {text, retryAt}, «Registrert» ikke bekreftet', async () => {
  trk.upsertShipment({ trackingNo: '70712345678903333', carrier: 'bring', source: 'manual' });
  const restore = mockFetch((url) => (url.includes('api.bring.com') ? new Response('nede', { status: 500 }) : null));
  try { await A('/api/tracking/refresh', 'POST'); } finally { restore(); }
  const s = (await A('/api/tracking')).body.items.find((x) => x.trackingNo === '70712345678903333');
  assert.match(s.updateError.text, /^Kunne ikke oppdatere · prøver igjen \d\d:\d\d$/);
  assert.ok(Date.parse(s.updateError.retryAt) > Date.now());
  assert.equal(s.statusUnverified, true);
});

test('sjekkeplan: 45 min for aktive (prompt 41: dynamisk polling), 6 t for «Registrert» > 3 dager, stopp ved Levert/Returnert', () => {
  const now = Date.now();
  assert.equal(trk.checkInterval({ status: 'in_transit', created_at: now }), 45 * 60_000);
  assert.equal(trk.checkInterval({ status: 'registered', created_at: now - 86400_000 }), 45 * 60_000);
  assert.equal(trk.checkInterval({ status: 'registered', created_at: now - 4 * 86400_000 }), 6 * 3600_000);
  assert.equal(trk.checkInterval({ status: 'delivered' }), null);
  assert.equal(trk.checkInterval({ status: 'returned' }), null);
  assert.equal(trk.nextCheckAt({ status: 'in_transit', created_at: now, checked_at: null }, now), now, 'straks når den er ny');
});

test('ikke funnet etter 30 dager → Arkiv med status Levert', async () => {
  trk.upsertShipment({ trackingNo: 'CV123456789NO', source: 'email', sourceDate: new Date(Date.now() - 40 * 86400_000) });
  const restore = mockFetch((url) => (url.includes('api.bring.com') ? json({ consignmentSet: [{ error: { message: 'Not found' } }] }) : null));
  try { await A('/api/tracking/refresh', 'POST'); } finally { restore(); }
  const s = (await A('/api/tracking')).body.items.find((x) => x.trackingNo === 'CV123456789NO');
  assert.equal(s.status, 'delivered');
  assert.equal(s.archived, true);
});

test('sporing er per bruker (ISO2): vanlig bruker har egen, tom liste', async () => {
  const r = await B('/api/tracking');
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 0);
  assert.equal((await B('/api/tracking/refresh', 'POST')).status, 200);
});

/* ---------------- 4. Familie ---------------- */

test('soner: icon og color i POST/PATCH, standardikon etter navn', async () => {
  const mk = async (name, extra = {}) => (await A('/api/family/zones', 'POST', { name, lat: 59.9, lon: 10.7, radius: 200, ...extra })).body;
  assert.equal((await mk('Hjem')).icon, 'home');
  assert.equal((await mk('Jobb')).icon, 'work');
  assert.equal((await mk('Skole')).icon, 'school');
  assert.equal((await mk('Mormor')).icon, 'heart');
  const z = await mk('Fotballbanen', { icon: 'ball', color: '#12AB9F' });
  assert.equal(z.icon, 'ball');
  assert.equal(z.color, '#12ab9f');
  assert.equal((await mk('Ukjent')).icon, 'pin');
  assert.equal((await A('/api/family/zones', 'POST', { name: 'X', lat: 59.9, lon: 10.7, icon: 'rakett' })).status, 400);
  assert.equal((await A('/api/family/zones', 'POST', { name: 'X', lat: 59.9, lon: 10.7, color: 'rød' })).status, 400);
  const p = await A(`/api/family/zones/${z.id}`, 'PATCH', { icon: 'coffee', color: '#000000' });
  assert.equal(p.body.icon, 'coffee');
  assert.equal(p.body.color, '#000000');
  assert.equal((await A(`/api/family/zones/${z.id}`, 'PATCH', { icon: null })).body.icon, 'pin');
  assert.equal((await B(`/api/family/zones/${z.id}`, 'PATCH', { icon: 'star' })).status, 404, 'privat sone');
});

const pngSquare = (w, h = w) => { const b = Buffer.alloc(33); Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(b); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };

test('profilbilde per person: PUT (base64 og multipart), photoUrl bare for seeren, DELETE', async () => {
  const before = (await A('/api/family')).body.members.find((m) => m.userId === aId);
  assert.equal(before.photoUrl, before.avatarUrl);
  const r = await A(`/api/family/photo/${aId}`, 'PUT', { image: `data:image/png;base64,${pngSquare(160).toString('base64')}` });
  assert.equal(r.status, 200, r.text);
  assert.match(r.body.photoUrl, new RegExp(`^/api/family/photo/${aId}\\?v=\\d+$`));
  const me = (await A('/api/family')).body.members.find((m) => m.userId === aId);
  assert.equal(me.photoUrl, r.body.photoUrl);
  assert.equal(me.photoOverride, true);
  const img = await A(r.body.photoUrl);
  assert.equal(img.status, 200);
  assert.equal(img.buf.length, 33);
  // iOS: JSON {photo}
  assert.equal((await A(`/api/family/photo/${bId}`, 'PUT', { photo: pngSquare(160).toString('base64') })).status, 200);
  // Andre ser ikke seerens bilde.
  assert.equal((await B(`/api/family/photo/${aId}`)).status, 404);
  // Multipart
  const fd = new FormData(); fd.append('file', new File([pngSquare(160)], 'a.png', { type: 'image/png' }));
  assert.equal((await B(`/api/family/photo/${bId}`, 'PUT', fd)).status, 200);
  const bself = (await B('/api/family')).body.members.find((m) => m.userId === bId);
  assert.match(bself.photoUrl, /\/api\/family\/photo\//);
  // Ikke kvadratisk / ukjent person / ikke bilde
  assert.equal((await A(`/api/family/photo/${aId}`, 'PUT', { image: pngSquare(160, 90).toString('base64') })).status, 400);
  assert.equal((await A('/api/family/photo/finnes-ikke', 'PUT', { image: pngSquare(160).toString('base64') })).status, 404);
  assert.equal((await A(`/api/family/photo/${aId}`, 'PUT', { image: Buffer.from('hei').toString('base64') })).status, 400);
  assert.equal((await A(`/api/family/photo/${aId}`, 'DELETE')).status, 200);
  const after = (await A('/api/family')).body.members.find((m) => m.userId === aId);
  assert.equal(after.photoUrl, after.avatarUrl);
  assert.equal((await A(`/api/family/photo/${aId}`)).status, 404);
});

/* ---------------- 5. Vær ---------------- */

test('Yr mot Pent: agreement good/mid/bad etter snittavvik i makstemperatur', () => {
  const raw = (max, code = 2) => ({ daily: { time: ['2026-10-18', '2026-10-19'], temperature_2m_max: max, temperature_2m_min: [1, 2], precipitation_sum: [0, 3], weather_code: [code, 61] },
    hourly: { time: ['2026-10-18T12:00', '2026-10-18T13:00'], temperature_2m: [5, 6], precipitation: [0, 0.2], weather_code: [2, 3] } });
  const now = '2026-10-18T12:00';
  const good = wx.buildPentCompare(raw([10, 8]), raw([10.5, 8.5]), now);
  assert.equal(good.agreement, 'good');
  assert.equal(good.avgDiff, 0.5);
  assert.equal(good.label, 'Pent (StormGeo-modell)');
  assert.deepEqual(Object.keys(good.days[0]).sort(), ['date', 'diff', 'pent', 'yr']);
  assert.deepEqual(Object.keys(good.days[0].yr).sort(), ['code', 'icon', 'max', 'min', 'precip']);
  assert.equal(good.days[1].yr.icon, 'rain');
  assert.equal(good.hours[0].time, '2026-10-18T12:00');
  assert.ok(good.hours[0].yr && good.hours[0].pent);
  assert.equal(wx.buildPentCompare(raw([10, 8]), raw([12, 10.4]), now).agreement, 'mid');
  const bad = wx.buildPentCompare(raw([10, 8]), raw([14, 12]), now);
  assert.equal(bad.agreement, 'bad');
  assert.equal(bad.days[0].diff, -4);
});

test('/api/weather/full: compare, detail (7 × 24 timer) og sunMoon (7 dager), bakoverkompatibelt', async () => {
  const P = { lat: 59.9139, lon: 10.7522 };
  const restore = mockFetch((url) => {
    if (url.includes('api.met.no')) return new Response('nede', { status: 503 });
    if (url.includes('models=ecmwf_ifs025')) { const r = wx.mockRaw(P); r.daily.temperature_2m_max = r.daily.temperature_2m_max.map((v) => v + 2); return json(r); }
    if (url.includes('api.open-meteo.com')) return json(wx.mockRaw(P));
  });
  try {
    const r = await A('/api/weather/full?place=oslo');
    assert.equal(r.status, 200);
    const w = r.body;
    for (const k of ['current', 'today', 'hours', 'days', 'moon']) assert.ok(k in w, k);
    assert.ok(['good', 'mid', 'bad'].includes(w.compare.agreement));
    assert.equal(typeof w.compare.avgDiff, 'number');
    assert.ok(w.compare.days.length >= 4);
    assert.ok(w.compare.hours.length >= 12);
    assert.equal(w.detail.days.length, 7);
    assert.ok(w.detail.days.every((d) => d.hours.length === 24));
    const h = w.detail.days[1].hours[12];
    for (const k of ['humidity', 'uv', 'precip', 'precipProb', 'gust', 'pressure', 'visibility', 'feels']) assert.ok(k in h, k);
    assert.equal(w.hours7.length, 7 * 24);
    assert.equal(w.sunMoon.length, 7);
    assert.ok(w.sunMoon.every((d) => d.sunrise && d.sunset && d.daylight > 0 && d.moon.name && d.moon.illum >= 0));
    assert.equal(w.compare.agreement, 'mid');
  } finally { restore(); }
});

test('detail: MET først, Open-Meteo fyller timer MET mangler (og sikt)', () => {
  const met = { hourly: { time: ['2026-10-18T10:00'], temperature_2m: [5], visibility: [null], relative_humidity_2m: [80] } };
  const om = { hourly: { time: ['2026-10-18T10:00', '2026-10-18T11:00'], temperature_2m: [4, 6], visibility: [25000, 20000], relative_humidity_2m: [70, 60] } };
  const d = wx.buildDetail(met, om, '2026-10-18', 1).days[0].hours;
  assert.equal(d[10].temp, 5); assert.equal(d[10].src, 'met'); assert.equal(d[10].visibility, 25); assert.equal(d[10].humidity, 80);
  assert.equal(d[11].temp, 6); assert.equal(d[11].src, 'open-meteo');
});

test('stedssøk: /api/weather/search (Open-Meteo geocoding som reserve)', async () => {
  const restore = mockFetch((url) => {
    if (url.includes('ws.geonorge.no')) return new Response('nede', { status: 503 });
    if (url.includes('geocoding-api.open-meteo.com')) return json({ results: [{ name: 'Lillehammer', admin1: 'Innlandet', country: 'Norge', latitude: 61.11, longitude: 10.46 }] });
  });
  try {
    const r = await A('/api/weather/search?q=Lilleham');
    assert.equal(r.status, 200);
    assert.equal(r.body[0].name, 'Lillehammer');
  } finally { restore(); }
});
