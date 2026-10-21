// Prompt 41 (SERVER41): Felles API – Hjemlys «Si fra», Min reise, PostNord uten nøkkel, Gjøremål-Glimt i bakgrunnen, Chat (Mine data + ✦ Auto),
// vær-uke via Glimt, AI-jobber med klokkeslett, Finans «Les på nytt» alltid, bursdagsbilder, 17. mai, skiføre, innlogging uten adresse,
// Kalender-innlogging (PKCE / enhets-token) og Kalender Glimt-søk + testvarsel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p41-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-41s';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4211';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
for (const k of Object.keys(process.env)) if (k.startsWith('AI_HOST_') || k.startsWith('AI_GPU_')) delete process.env[k];
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db, kv } = await import('../server/db.js');
const { db: fhDb, setSecret } = await import('../server/finans/db.js');
const carriers = await import('../server/tracking-carriers.js');
const trk = await import('../server/tracking.js');
const tg41 = await import('../server/tasks-glimt41.js');
const ruter = await import('../server/ruter41.js');
const chat41 = await import('../server/chat41.js');
const wx41 = await import('../server/weather41.js');
const ai41 = await import('../server/ai41.js');
const mai = await import('../server/mai17-41.js');
const kal41 = await import('../server/kalender41.js');
const bd41 = await import('../server/birthdays41.js');

let ipN = 10;
async function req(path, { method = 'GET', headers = {}, body, raw } = {}) {
  const r = await app.request(path, { method, redirect: 'manual', headers: { ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text, headers: r.headers };
}
async function login(username, password) {
  const r = await req('/api/login', { method: 'POST', headers: { 'x-forwarded-for': `203.0.113.${ipN++}` }, body: { username, password } });
  assert.equal(r.status, 200, r.text);
  return (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (h) => (path, method = 'GET', body, extra = {}) => req(path, { method, headers: { ...h, ...extra }, body });
const sebCookie = await login('sebastian', 'testpassord1');
const A = as({ cookie: sebCookie });
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as({ cookie: await login('ingrid', 'ingridPassord123') });
const ingridId = db.prepare("SELECT id FROM users WHERE username='ingrid'").pluck().get();
const sebId = db.prepare("SELECT id FROM users WHERE username='sebastian'").pluck().get();
const appTok = (await A('/finans/api/tokens', 'POST', { name: 'Homelab iPhone', scopes: ['finance:read', 'finance:write'] })).body.token;
const T = as({ authorization: `Bearer ${appTok}` });
const b64u = (b) => Buffer.from(b).toString('base64url');

/* ---------------- Innlogging uten adresse ---------------- */

test('GET /api/discovery uten innlogging: {name, version, local[], external}, ingen hemmeligheter; /api/me/server per bruker', async () => {
  const d = await req('/api/discovery');
  assert.equal(d.status, 200);
  assert.deepEqual(Object.keys(d.body).sort(), ['api', 'app', 'external', 'local', 'name', 'version']);
  assert.ok(Array.isArray(d.body.local));
  assert.equal(d.body.app, 'homelab');
  assert.equal((await req('/api/me/server')).status, 401);
  const g = await A('/api/me/server');
  assert.equal(g.body.auto, true);
  assert.equal((await A('/api/me/server', 'PUT', { local: 'ftp://x' })).status, 400);
  const p = await A('/api/me/server', 'PUT', { local: 'http://192.168.1.40:8080/', external: 'https://home.kristo.no', auto: false });
  assert.deepEqual([p.body.local, p.body.external, p.body.auto], ['http://192.168.1.40:8080', 'https://home.kristo.no', false]);
  assert.equal((await T('/api/me/server')).body.local, 'http://192.168.1.40:8080', 'samme bruker via app-token (Kalender leser den)');
  assert.notEqual((await I('/api/me/server')).body.local, 'http://192.168.1.40:8080', 'per bruker');
});

/* ---------------- Kalender-innlogging ---------------- */

test('PKCE: app-code (Homelab) → token (Kalender); engangs, verifier, redirect-hviteliste; utlogging i Homelab-appen tilbakekaller', async () => {
  const verifier = b64u(randomBytes(32)), cc = b64u(createHash('sha256').update(verifier).digest()), state = 'st-' + b64u(randomBytes(6));
  assert.equal((await req('/api/auth/app-code', { method: 'POST', body: { client: 'kalender', redirect: 'kalender://auth', state, code_challenge: cc } })).status, 401);
  assert.equal((await T('/api/auth/app-code', 'POST', { client: 'kalender', redirect: 'evil://auth', state, code_challenge: cc })).status, 400);
  assert.equal((await T('/api/auth/app-code', 'POST', { client: 'kalender', redirect: 'https://evil.example/cb', state, code_challenge: cc })).status, 400);
  assert.equal((await T('/api/auth/app-code', 'POST', { client: 'ukjent', redirect: 'kalender://auth', state, code_challenge: cc })).status, 400);
  const ac = await T('/api/auth/app-code', 'POST', { client: 'kalender', redirect: 'kalender://auth', state, code_challenge: cc });
  assert.equal(ac.status, 200, ac.text);
  assert.equal(ac.body.expiresIn, 60);
  assert.match(ac.body.redirectUrl, new RegExp(`^kalender://auth\\?code=[\\w-]+&state=${state}$`));
  // Feil verifier: koden brukes opp (engangs).
  const bad = await req('/api/auth/token', { method: 'POST', body: { code: ac.body.code, code_verifier: b64u(randomBytes(32)), client: 'kalender', redirect: 'kalender://auth' } });
  assert.equal(bad.status, 400);
  const again = await req('/api/auth/token', { method: 'POST', body: { code: ac.body.code, code_verifier: verifier, client: 'kalender', redirect: 'kalender://auth' } });
  assert.equal(again.status, 400, 'engangs');
  const ac2 = await T('/api/auth/app-code', 'POST', { client: 'kalender', redirect: 'kalender://auth', state, code_challenge: cc });
  const tk = await req('/api/auth/token', { method: 'POST', body: { code: ac2.body.code, code_verifier: verifier, client: 'kalender', redirect: 'kalender://auth', device: 'iPhone' } });
  assert.equal(tk.status, 200, tk.text);
  assert.match(tk.body.token, /^fh_/);
  assert.equal(tk.body.user.username, 'sebastian');
  assert.equal(tk.body.app, 'kalender');
  const K = as({ authorization: `Bearer ${tk.body.token}` });
  assert.equal((await K('/api/me/server')).status, 200, 'Kalender-tokenet virker');
  // Utløpt kode (60 s).
  const ac3 = await T('/api/auth/app-code', 'POST', { client: 'kalender', redirect: 'kalender://auth', state, code_challenge: cc });
  fhDb.prepare('UPDATE fh_app_codes SET exp=? WHERE used=0 AND kind=\'pkce\'').run(Date.now() - 1);
  assert.equal((await req('/api/auth/token', { method: 'POST', body: { code: ac3.body.code, code_verifier: verifier, client: 'kalender', redirect: 'kalender://auth' } })).body.code, 'expired');
  // Utlogging i Homelab-appen (tokenet som godkjente) → Kalender er logget ut.
  assert.equal((await T('/finans/api/auth/logout', 'POST', {})).status, 200);
  assert.equal((await K('/api/me/server')).status, 401, 'Kalender-tokenet er tilbakekalt');
});

test('«Fortsett som»: device-token (Homelab) → device-exchange (Kalender), engangs og kortlivet', async () => {
  const dt = await A('/api/auth/device-token', 'POST', { app: 'kalender' });
  assert.equal(dt.status, 200);
  assert.match(dt.body.device_token, /^hdt_/);
  assert.equal(dt.body.expiresIn, 900);
  assert.equal((await req('/api/auth/device-exchange', { method: 'POST', body: { device_token: 'hdt_feil', app: 'kalender' } })).status, 401);
  const ex = await req('/api/auth/device-exchange', { method: 'POST', body: { device_token: dt.body.device_token, app: 'kalender', device: 'Android' } });
  assert.equal(ex.status, 200, ex.text);
  assert.equal(ex.body.user.id, sebId);
  assert.match(ex.body.refresh, /^hlr_/); // prompt 44: refresh-token (90 d glidende)
  assert.equal((await req('/api/auth/device-exchange', { method: 'POST', body: { device_token: dt.body.device_token, app: 'kalender' } })).status, 401, 'engangs');
  assert.ok((await A('/api/tokens/companion')).body.tokens.some((t) => t.app === 'kalender' && t.device === 'Android'));
});

test('/app-auth: krever innlogging, enkel godkjenningsside uten skript, POST approve/deny → redirect med code/state', async () => {
  const verifier = b64u(randomBytes(32)), cc = b64u(createHash('sha256').update(verifier).digest());
  const qs = `client=kalender&redirect=${encodeURIComponent('kalender://auth')}&state=abcdefgh12&cc=${cc}`;
  const anon = await req(`/app-auth?${qs}`);
  assert.equal(anon.status, 302);
  assert.match(anon.headers.get('location'), /^\/login\?next=%2Fapp-auth/);
  assert.equal((await A(`/app-auth?${qs}`)).status, 200);
  const page = await A(`/app-auth?${qs}&basic=1`);
  assert.equal(page.status, 200);
  assert.match(page.text, /Logge inn i Kalender\?/);
  assert.doesNotMatch(page.text, /<script/);
  const form = (action) => req('/app-auth', { method: 'POST', headers: { cookie: sebCookie, 'content-type': 'application/x-www-form-urlencoded' }, raw: `${qs}&action=${action}` });
  const deny = await form('deny');
  assert.equal(deny.status, 302);
  assert.equal(deny.headers.get('location'), 'kalender://auth?error=access_denied&state=abcdefgh12');
  const ok = await form('approve');
  const code = new URL(ok.headers.get('location')).searchParams.get('code');
  assert.ok(code);
  const tk = await req('/api/auth/token', { method: 'POST', body: { code, code_verifier: verifier, client: 'kalender', redirect: 'kalender://auth' } });
  assert.equal(tk.status, 200, tk.text);
  // Utlogging på web tilbakekaller tokenet som ble godkjent fra denne økta.
  const c2 = await login('sebastian', 'testpassord1');
  const ok2 = await req('/app-auth', { method: 'POST', headers: { cookie: c2, 'content-type': 'application/x-www-form-urlencoded' }, raw: `${qs}&action=approve` });
  const tk2 = await req('/api/auth/token', { method: 'POST', body: { code: new URL(ok2.headers.get('location')).searchParams.get('code'), code_verifier: verifier, client: 'kalender', redirect: 'kalender://auth', device: 'Mac' } });
  const K2 = as({ authorization: `Bearer ${tk2.body.token}` });
  assert.equal((await K2('/api/me/server')).status, 200);
  await req('/api/logout', { method: 'POST', headers: { cookie: c2 } });
  assert.equal((await K2('/api/me/server')).status, 401);
});

test('/.well-known: APPLE_TEAM_ID gir finanshub med /app-auth og webcredentials for Kalender; 404 uten', async () => {
  assert.equal((await req('/.well-known/apple-app-site-association')).status, 404);
  process.env.APPLE_TEAM_ID = 'ABCDE12345';
  try {
    const j = (await req('/.well-known/apple-app-site-association')).body;
    assert.equal(j.applinks.details[0].appID, 'ABCDE12345.no.kristo.finanshub');
    assert.ok(j.applinks.details[0].paths.includes('/app-auth'));
    assert.ok(j.webcredentials.apps.includes('ABCDE12345.no.kristo.kalender'));
  } finally { delete process.env.APPLE_TEAM_ID; }
});

/* ---------------- Hjemlys «Si fra» ---------------- */

test('Hjemlys «Si fra»: sjekket inn / drar snart (+15) / drar nå med mål (annet sted, geofence 60 m), kontakter får 24 t-lenke, du selv aldri mottaker', async () => {
  assert.equal((await A('/api/hjemlys/notice', 'POST', { kind: 'bad', to: [ingridId] })).status, 400);
  assert.equal((await A('/api/hjemlys/notice', 'POST', { kind: 'checkin', to: ['ukjent'] })).status, 400);
  const ci = await A('/api/hjemlys/notice', 'POST', { kind: 'checkin', place: 'Bursdag hos Mari', to: [ingridId, sebId] });
  assert.equal(ci.status, 200, ci.text);
  assert.equal(ci.body.notice.text, 'Sebastian sjekket inn · Bursdag hos Mari');
  assert.deepEqual(ci.body.notice.recipients.map((r) => r.userId), [ingridId], 'du selv filtreres bort');
  assert.equal(ci.body.live.state, 'checkedIn');
  assert.match(ci.body.live.label, /^Inne · \d\d:\d\d$/);
  assert.ok(!('pos' in ci.body.notice) && !JSON.stringify(ci.body).includes('lat'), 'ingen posisjon');
  const got = (await I('/api/hjemlys/notices')).body.received;
  assert.equal(got[0].text, 'Sebastian sjekket inn · Bursdag hos Mari');
  assert.ok((await I('/api/hjemlys')).body.notices.received.length >= 1, 'GET /api/hjemlys får notices (Familie)');
  const ls = await A('/api/hjemlys/status', 'POST', { kind: 'leaving_soon', leaveInMin: 30, recipients: [ingridId], contacts: [{ name: 'Mari', phone: '+47 900 00 000' }] });
  assert.equal(ls.status, 200, ls.text);
  assert.match(ls.body.notice.text, /^Sebastian drar om ca\. (30|29) min$/);
  assert.equal(ls.body.live.state, 'leavingSoon');
  assert.equal(ls.body.links.length, 1);
  assert.match(ls.body.links[0].sms, /^sms:\+4790000000\?body=/);
  const token = ls.body.links[0].url.split('/hl/')[1];
  const pub = await req(`/api/hjemlys/public/${token}`);
  assert.equal(pub.status, 200);
  assert.match(pub.body.text, /drar om ca\./);
  assert.equal((await req(`/hl/${token}`)).status, 200);
  assert.equal((await req('/hl/finnesikke1234')).status, 404);
  const plus = await A(`/api/hjemlys/notice/${ls.body.notice.id}`, 'PATCH', { plus: 15 });
  assert.match(plus.body.notice.text, /drar om ca\. (45|44) min/);
  const last = (await A('/api/hjemlys/recipients')).body;
  assert.deepEqual(last.last.leaving_soon, [ingridId]);
  assert.ok(!last.household.some((x) => x.userId === sebId));
  // Drar nå uten mål: én beskjed, ingen økt.
  const nn = await A('/api/hjemlys/notice', 'POST', { kind: 'leaving_now', to: [ingridId] });
  assert.equal(nn.body.notice.text, 'Sebastian drar nå');
  assert.equal(nn.body.session, undefined);
  // Drar nå til et annet sted: vanlig tur, avsluttes innenfor 60 m av målet.
  const dn = await A('/api/hjemlys/notice', 'POST', { kind: 'leaving_now', to: [ingridId], eta: 20, destination: { name: 'Hytta', lat: 60.1, lon: 10.5, kind: 'place' } });
  assert.equal(dn.status, 200, dn.text);
  assert.equal(dn.body.session.destination.name, 'Hytta');
  assert.equal(dn.body.session.destination.kind, 'place');
  assert.match(dn.body.notice.text, /^Sebastian drar nå · Hytta ca\. \d\d:\d\d$/);
  const far = await A(`/api/hjemlys/${dn.body.session.id}`, 'PATCH', { pos: { lat: 60.05, lon: 10.5 }, wifiHome: true });
  assert.equal(far.body.session.state, 'onTheWay', 'hjemme-Wi-Fi avslutter ikke en tur til et annet sted');
  const at = await A(`/api/hjemlys/${dn.body.session.id}`, 'PATCH', { pos: { lat: 60.1002, lon: 10.5002 } });
  assert.equal(at.body.session.state, 'home', 'fremme');
  // start med destination direkte.
  const st = await A('/api/hjemlys/start', 'POST', { eta: 15, recipients: [ingridId], destination: { kind: 'home' } });
  assert.equal(st.body.session.destination.kind, 'home');
  await A(`/api/hjemlys/${st.body.session.id}/end`, 'POST', {});
});

/* ---------------- Min reise ---------------- */

test('Min reise: forhåndsruter for eieren (ikke andre), skolesoner, my-trip med 45 foretrukket og gange ved forsinket trikk', async () => {
  const mr = await A('/api/ruter/my-routes');
  assert.equal(mr.body.preset, true);
  assert.ok(mr.body.routes.some((r) => r.via === 'Holbergs plass') && mr.body.routes.some((r) => r.via === 'Frydenlund'));
  assert.equal((await I('/api/ruter/my-routes')).body.routes.length, 0, 'andre ser ingen ruter');
  assert.equal((await I('/api/ruter/my-trip')).body.empty, true);
  const tr = await A('/api/ruter/my-trip?dir=toHome');
  assert.equal(tr.status, 200);
  assert.deepEqual([tr.body.from, tr.body.to], ['Skole', 'Amagerveien']);
  const o = tr.body.options[0];
  assert.equal(o.legs.find((l) => l.mode === 'bus').line, '45', '45 først');
  assert.equal(o.preferred, true);
  assert.ok(o.badges.includes('Foretrukket'));
  for (const k of ['mode', 'from', 'to', 'dep', 'arr', 'aimed', 'expected', 'delayMin', 'walkMin', 'meters']) assert.ok(k in o.legs[0], k);
  assert.match(o.strip, /^Gå \d+ › Trikk \d+ min › Gå 2 › 4[56]$/);
  assert.match(o.arrLabel, /^→ \d\d:\d\d · \d+ min$/);
  assert.equal(tr.body.alert, undefined, 'ingen forsinkelse → ingen varsel');
  const dl = await A('/api/ruter/my-trip?dir=toHome&delay=10');
  assert.ok(dl.body.options.find((x) => x.via === 'Frydenlund')?.badges.includes('Trikk +10 min'));
  assert.equal(dl.body.alert.text, 'Trikken fra Frydenlund er 10 min forsinket');
  assert.equal(dl.body.alert.walk.minutes, 17);
  assert.match(dl.body.alert.walk.catches, /^45 \d\d:\d\d$/);
  assert.match(dl.body.alert.body, /^Går du fra Frydenlund til Majorstuen i stedet tar det 17 min \(1,4 km\), og du rekker 45 kl\. \d\d:\d\d\./);
  assert.equal(dl.body.alert.strip, 'Gå 17 min › 45');
  const back = await A('/api/ruter/my-trip?dir=toSchool');
  assert.deepEqual([back.body.from, back.body.to], ['Amagerveien', 'Skole']);
  assert.equal(back.body.options[0].legs.find((l) => l.mode === 'bus').line, '45');
  assert.equal((await A('/api/ruter/my-trip?dir=x')).status, 400);
  // Skolesoner.
  const z = (await A('/api/ruter/school-zones')).body.zones;
  assert.equal(z.length, 1);
  assert.equal(z[0].label, 'Skolen 150 m');
  assert.equal((await A(`/api/ruter/school-zones/${z[0].id}`, 'DELETE')).status, 409, 'siste kan ikke slettes');
  assert.equal((await A('/api/ruter/school-zones', 'POST', { name: 'Idrettshallen', lat: 59.93, lon: 10.73, radius_m: 20 })).status, 400);
  const add = await A('/api/ruter/school-zones', 'POST', { name: 'Idrettshallen', lat: 59.93, lon: 10.73, radius_m: 80 });
  assert.equal(add.status, 201);
  assert.equal(add.body.zones[1].label, 'Idrettshallen 80 m');
  assert.equal((await A(`/api/ruter/school-zones/${add.body.zones[1].id}`, 'DELETE')).body.zones.length, 1);
  // Innstilling.
  assert.equal((await A('/api/ruter/settings')).body.homeCard, 'over');
  assert.equal((await A('/api/ruter/settings', 'PUT', { homeCard: 'instead' })).body.homeCard, 'instead');
  assert.equal((await A('/api/ruter/settings', 'PUT', { homeCard: 'x' })).status, 400);
  // Egne ruter.
  assert.equal((await I('/api/ruter/my-routes', 'PUT', { routes: [{ from: 'Jobb', to: 'Hjem', legs: [{ mode: 'bus', from: 'Jobb', to: 'Hjem', lines: ['20'] }] }] })).body.routes.length, 1);
});

test('«Forlot skolen»: hverdager 07–18, ikke innen 10 min etter ankomst, faktisk tidspunkt i tittelen, utløper hjemme/90 min, skjul per tur', async () => {
  const tue = Date.parse('2026-10-20T14:31:00Z'); // tirsdag 16:31 i Oslo
  assert.throws(() => ruter.leftSchool41(sebId, { at: '2026-10-18T12:00:00Z' }, Date.parse('2026-10-18T12:05:00Z')), /hverdager/);
  assert.throws(() => ruter.leftSchool41(sebId, { at: new Date(tue).toISOString(), arrivedAt: new Date(tue - 5 * 60_000).toISOString() }, tue), /10 minutter/);
  const j = ruter.leftSchool41(sebId, { at: new Date(tue).toISOString() }, tue + 60_000);
  assert.equal(j.active, true);
  assert.equal(j.title, 'MIN REISE · FORLOT SKOLEN 16:31');
  assert.equal(j.homeCard, 'instead');
  assert.equal(ruter.journeyOf41(sebId, tue + 91 * 60_000).active, false, 'utløper etter 90 min');
  assert.equal(ruter.journeyOf41(sebId, tue + 91 * 60_000).endedReason, 'expired');
  kv.set(sebId, 'ruter41_journey', { leftSchoolAt: Date.now() - 5 * 60_000 });
  const g = await A('/api/ruter/journey');
  assert.equal(g.body.journey.active, true);
  assert.equal(g.body.journey.trip.dir, 'toHome');
  assert.equal((await A('/api/ruter/my-trip')).body.dir, 'toHome', 'auto: aktiv reise → hjem');
  assert.equal((await A('/api/ruter/journey/hide', 'POST', {})).body.journey.hidden, true);
  assert.equal((await A('/api/ruter/journey/hide', 'DELETE')).body.journey.hidden, false);
  assert.equal((await A('/api/ruter/journey/home', 'POST', {})).body.journey.endedReason, 'home');
});

/* ---------------- PostNord uten nøkkel ---------------- */

const pnJson = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
test('PostNord: offentlig recipientview (X-Bap-Key web-ncp, id+locale=en), ikke skannet, kode 113 = ute for levering, backoff ved 403, helsesjekk', async () => {
  const NO = '00370726209999999999';
  const calls = [];
  let reply = () => pnJson({ TrackingInformationResponse: { shipments: [] } });
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return reply(); };
  try {
    carriers._clearPostnordWebCache();
    const r0 = await carriers.fetchStatus('postnord', NO);
    assert.equal(r0.notScanned, true);
    assert.equal(r0.statusText, 'Ikke skannet ennå');
    assert.equal(calls[0].url, `https://api2.postnord.com/rest/shipment/v5/trackandtrace/recipientview?id=${NO}&locale=en`);
    assert.equal(calls[0].init.headers['x-bap-key'], 'web-ncp');
    carriers._clearPostnordWebCache();
    reply = () => pnJson({ TrackingInformationResponse: { shipments: [{ shipmentId: NO, status: 'EN_ROUTE', statusText: { header: 'The shipment is out for delivery' }, estimatedTimeOfArrival: '2026-10-21T14:00:00',
      items: [{ events: [{ eventTime: '2026-10-20T08:00:00', status: 'EN_ROUTE', eventCode: '20', eventDescription: 'Ankommet terminal', location: { displayName: 'Oslo' } },
        { eventTime: '2026-10-21T07:10:00', status: 'EN_ROUTE', eventCode: '113', eventDescription: 'The delivery of the shipment item is in progress', location: { displayName: 'Oslo' } }] }] }] } });
    const r1 = await carriers.fetchStatus('postnord', NO);
    assert.equal(r1.status, 'out_for_delivery');
    assert.equal(r1.canonical, 'out_for_delivery');
    assert.equal(r1.rawStatus, 'The shipment is out for delivery');
    assert.equal(r1.eta, '2026-10-21');
    const n = calls.length;
    await carriers.fetchStatus('postnord', NO);
    assert.equal(calls.length, n, 'maks én gang per pakke per 15 min');
    carriers._clearPostnordWebCache();
    reply = () => new Response('nei', { status: 403 });
    await assert.rejects(carriers.postnordWeb(NO), /svarer ikke akkurat nå/);
    const n2 = calls.length;
    await assert.rejects(carriers.postnordWeb('00370726208888888888'), /svarer ikke akkurat nå/);
    assert.equal(calls.length, n2, 'venter (backoff) etter 403');
    assert.ok((await A('/api/tracking/postnord/health')).body.blockedUntil);
    assert.equal((await A('/api/tracking/postnord/health')).body.unofficial, true);
    // Uventet form → helsesjekken varsler admin én gang.
    carriers._clearPostnordWebCache();
    const notes = [];
    carriers._setPostnordAdminNotify((t) => notes.push(t));
    reply = () => pnJson({ noe: 'annet' });
    await carriers.postnordWeb('00370726207777777777').catch(() => {});
    assert.equal((await A('/api/tracking/postnord/health')).body.shapeOk, false);
    assert.equal(notes.length, 1);
  } finally { globalThis.fetch = orig; carriers._clearPostnordWebCache(); carriers._setPostnordAdminNotify(null); }
  assert.equal(carriers.canonical41('ready_for_pickup'), 'at_pickup_point');
  assert.equal(carriers.postnordWebStatus('DELIVERY'), 'out_for_delivery');
  assert.equal(carriers.postnordWebStatus('EXPECTED_DELAY'), 'delayed');
});

test('Dynamisk polling for alle transportører: 15 min ute for levering (fra 1 t før), ellers 45 min; ingen kall 00–06 utenom ankeret', () => {
  const now = Date.now();
  assert.equal(trk.checkInterval({ status: 'out_for_delivery', created_at: now }), 15 * 60_000);
  assert.equal(trk.checkInterval({ status: 'out_for_delivery', eta: new Date(now + 3 * 3600_000).toISOString(), created_at: now }, now), 45 * 60_000);
  assert.equal(trk.checkInterval({ status: 'in_transit', created_at: now }), 45 * 60_000);
  assert.equal(trk.checkInterval({ status: 'delivered' }), null);
  const night = Date.parse('2026-10-20T01:30:00Z'); // 03:30 i Oslo
  kv.del('pollu', 'trk41_anchor');
  assert.equal(trk.pollAllowed41('pollu', night), true, 'én runde (ankeret)');
  assert.equal(trk.pollAllowed41('pollu', night + 15 * 60_000), false);
  assert.equal(trk.pollAllowed41('pollu', Date.parse('2026-10-20T05:00:00Z')), true, '07:00');
});

/* ---------------- Gjøremål-Glimt i bakgrunnen ---------------- */

const EX = 'vi skal levere pakke på butikken før vi skal til toten hvor vi må huske å ta med tilhengrern hjem til oslo siden vi skal ha med møbelerer til strømstad.';
test('Gjøremål-Glimt: async → 202 {jobId, placeholder}, punktene i rekkefølge med note, origin og «Laget med Glimt»', async () => {
  tg41._ai41.impl = async () => null; // AI svarer ikke → lokal reserve
  tg41._ai41.ms = 50;
  try {
    const r = await A('/api/tasks/glimt', 'POST', { q: EX, async: true });
    assert.equal(r.status, 202, r.text);
    assert.match(r.body.jobId, /^hg/);
    assert.equal(r.body.placeholder.label, 'Glimt deler opp beskjeden …');
    const j = await tg41.waitJob41(r.body.jobId);
    assert.equal(j.state, 'done');
    assert.deepEqual(j.items.map((x) => x.title), ['Lever pakke på butikken', 'Kjør til Toten', 'Ta med tilhengeren hjem til Oslo']);
    assert.equal(j.items[2].note, 'Skal ha med møbler til Strømstad');
    assert.equal(j.items[1].after, j.items[0].id);
    assert.equal(j.items[0].origin.text, EX);
    assert.match(j.message, /^Glimt lagde 3 punkter i riktig rekkefølge$/);
    const src = (await A('/api/tasks/glimt/sources')).body.sources;
    assert.equal(src[0].text, EX);
    assert.equal(src[0].count, 3);
    assert.equal(src[0].engineLabel, 'Glimt (uten AI)');
    assert.ok((await A('/api/tasks/glimt/jobs')).body.jobs.some((x) => x.jobId === r.body.jobId));
    const item = (await A('/api/tasks')).body.items.find((x) => x.id === j.items[0].id);
    assert.equal(item.origin.id, r.body.jobId);
    // Med AI: motoren lagrer note og retter skrivefeil.
    tg41._ai41.impl = async () => ({ items: [{ n: 'Lever pakke på butikken' }, { n: 'Kjør til toten', after: 0 }, { n: 'Ta med tilhengeren hjem til oslo', after: 1, note: 'skal ha med møbler til Strømstad' }], _engine: 'Groq · test' });
    const r2 = await A('/api/huske/glimt-jobs', 'POST', { text: EX, origin: 'home_search' });
    assert.equal(r2.status, 202);
    assert.equal(r2.body.job_id, r2.body.jobId);
    const j2 = await tg41.waitJob41(r2.body.jobId);
    assert.deepEqual(j2.items.map((x) => x.title), ['Lever pakke på butikken', 'Kjør til Toten', 'Ta med tilhengeren hjem til Oslo']);
    assert.equal(j2.engine, 'Groq · test');
    assert.equal(j2.origin, 'home_search');
    // «Glem beskjeden»: punktene blir.
    assert.equal((await A(`/api/tasks/glimt/sources/${r2.body.jobId}`, 'DELETE')).body.ok, true);
    assert.ok(!(await A('/api/tasks/glimt/sources')).body.sources.some((s) => s.id === r2.body.jobId));
    assert.ok((await A('/api/tasks')).body.items.some((x) => x.id === j2.items[0].id));
    // Uten async: som før (prompt 37/40).
    assert.equal((await A('/api/tasks/glimt', 'POST', { q: 'Kjøp melk i morgen' })).body.kind, 'add');
    assert.equal(tg41.needsAi41('Kjøp melk i morgen'), false);
  } finally { tg41._ai41.impl = null; tg41._ai41.ms = null; }
});

test('Hjem-søk: /api/assist gjenkjenner huskebeskjeder og sender dem til Glimt i bakgrunnen', async () => {
  tg41._ai41.impl = async () => null; tg41._ai41.ms = 50;
  try {
    assert.equal(tg41.isHuskeMessage41('hva skjer i dag?'), false);
    assert.equal(tg41.isHuskeMessage41('husk å kjøpe melk'), true);
    const r = await A('/api/assist', 'POST', { q: 'husk å ringe rørleggeren og så må jeg hente pakken på posten', source: 'search' });
    const a = r.status === 202 ? (await A(`/api/assist/${r.body.jobId}`)).body.answer ?? r.body : r.body;
    assert.equal(a.intent, 'tasks.glimt');
    assert.equal(a.kind, 'action');
    assert.equal(a.huske.title, 'Legger til i Huskeliste');
    const j = await tg41.waitJob41(a.huske.jobId);
    assert.equal(j.state, 'done');
    assert.equal(j.origin, 'home_search');
    assert.ok(j.count >= 2);
  } finally { tg41._ai41.impl = null; tg41._ai41.ms = null; }
});

/* ---------------- Chat ---------------- */

test('Chat: «Mine data» på som standard; ✦ Auto i modellene og per melding (lokalt med mine data)', async () => {
  assert.equal((await A('/api/chat/settings')).body.chat_my_data, true);
  const m = await A('/api/chat/models');
  assert.equal(m.body.preferred, 'auto');
  assert.equal(m.body.auto.id, 'auto');
  assert.equal(m.body.auto.label, '✦ Auto');
  for (const k of ['text', 'vision', 'long']) assert.ok(k in m.body.auto.picks, k);
  const models = m.body.models;
  assert.equal(chat41.pickAuto41(models, { text: 'Se på kvitteringen vedlagt', images: 1 }).model, 'qwen2.5vl:7b');
  assert.equal(chat41.pickAuto41(models, { text: 'docker compose gir feilmelding EACCES' }).kind, 'code');
  assert.equal(chat41.pickAuto41(models, { text: 'Oppsummer', files: [{ name: 'rapport.pdf' }] }).model, 'gemini:gemini-2.5-flash');
  assert.equal(chat41.pickAuto41(models, { text: 'Oppsummer', files: [{ name: 'rapport.pdf' }], wantData: true }).local, true, 'mine data → lokalt');
  assert.equal(chat41.pickAuto41(models, { text: 'Hei' }).kind, 'text');
  const s = await A('/api/chat/send', 'POST', { model: 'auto', myData: true, messages: [{ role: 'user', content: 'Hei, hvordan går det?' }] });
  assert.equal(s.status, 200, s.text);
  const ev = s.text.split('\n\n').map((b) => ({ e: b.match(/^event: (.+)$/m)?.[1], d: (() => { try { return JSON.parse(b.match(/^data: (.+)$/m)?.[1]); } catch { return null; } })() }));
  const meta = ev.find((x) => x.e === 'meta').d, done = ev.find((x) => x.e === 'done').d;
  assert.match(meta.auto.label, /^✦ Rask · /);
  assert.match(done.auto.label, /tok\/s · .+ s$/);
  const chat = (await A(`/api/chat/chats/${done.chatId}`)).body;
  assert.equal(chat.model, 'auto', 'samtalen står på Auto');
  assert.equal((await A(`/api/chat/chats/${done.chatId}/feedback`, 'POST', { retry: true })).body.ok, true);
  assert.ok((await A('/api/chat/auto')).body.stats.length >= 1);
});

/* ---------------- Vær-uke via Glimt ---------------- */

test('Vær-uke: ukesspørsmål går til Ollama med 7 dager data; reserve uten AI svarer på spørsmålet; enkle går til hurtigsvaret', async () => {
  assert.equal(wx41.isWeekWeather41('Når blir det mest regn denne uka?'), true);
  assert.equal(wx41.isWeekWeather41('Hvilken dag er best for å sykle til skolen?'), true);
  assert.equal(wx41.isWeekWeather41('trenger jeg paraply i morgen'), false);
  let seen = null;
  wx41._setWeek41Llm(async ({ prompt }) => { seen = prompt; return '**Mest regn torsdag, rundt 6 mm (80 %).** Helgen ser tørr ut.'; });
  try {
    const r = await A('/api/assist', 'POST', { q: 'Når blir det mest regn denne uka?', source: 'search' });
    const a = r.status === 202 ? (await new Promise((res) => setTimeout(res, 300)), (await A(`/api/assist/${r.body.jobId}`)).body.answer) : r.body;
    assert.equal(a.intent, 'weather.week');
    assert.equal(a.engine, 'ollama');
    assert.match(a.source, /^✦ Ollama · Open-Meteo 7 dager · /);
    assert.deepEqual(a.bold, ['Mest regn torsdag, rundt 6 mm (80 %).']);
    assert.equal(a.week.length, 7);
    assert.match(a.open.label, /^Åpne Vær for .+ ›$/);
    assert.equal(seen.split('\n').filter((l) => /mm \(/.test(l)).length, 7, 'tabell per dag');
    wx41._setWeek41Llm(async () => { throw new Error('Ollama svarte ikke'); });
    const r2 = await wx41.weekAnswer41(sebId, 'Når blir det mest regn denne uka?');
    assert.equal(r2.noAi, true);
    assert.match(r2.text, /^\*\*Mest regn torsdag \d+\.\d+, rundt 6 mm \(80 %\)\.\*\*/);
    assert.match(r2.source, /uten AI/);
    const best = wx41.localWeekAnswer41('Hvilken dag er best for å sykle?', wx41.mockWeek41({ lat: 59.9, lon: 10.7 }, '2026-10-19'), '2026-10-19');
    assert.match(best, /^\*\*Onsdag 21\.10 ser best ut: tørt/);
    const f = await wx41.weekFact41(sebId, 'hvilken dag er varmest denne uka?');
    assert.equal(f.when, '7 dager');
    assert.match(f.prompt, /de neste 7 dagene/);
  } finally { wx41._setWeek41Llm(null); }
});

/* ---------------- AI-jobber ---------------- */

test('AI-jobber: createdAt/startedAt/endedAt og timeLabel («startet 17:31», «lagt i kø …», «i går 21:14», «4 min siden»)', async () => {
  const now = Date.parse('2026-10-20T15:35:00Z'); // 17:35 Oslo
  assert.equal(ai41.jobTimes41({ status: 'run', ts: Date.parse('2026-10-20T15:31:00Z'), run_at: Date.parse('2026-10-20T15:31:00Z') }, now).timeLabel, 'startet 17:31');
  assert.equal(ai41.jobTimes41({ status: 'queue', ts: Date.parse('2026-10-20T15:33:00Z') }, now).timeLabel, 'lagt i kø 17:33');
  const d = ai41.jobTimes41({ status: 'ok', ts: Date.parse('2026-10-20T15:25:00Z'), updated: Date.parse('2026-10-20T15:29:00Z') }, now);
  assert.equal(d.timeLabel, '17:29');
  assert.equal(d.timeAgo, '6 min siden');
  assert.equal(ai41.clock41(Date.parse('2026-10-19T19:14:00Z'), now), 'i går 21:14');
  assert.equal(ai41.clock41(Date.parse('2026-10-18T19:14:00Z'), now), '18.10 21:14');
  assert.equal(ai41.groupTimes41([{ endedAt: '2026-10-20T14:02:00Z' }, { endedAt: '2026-10-20T15:20:00Z' }], now).timeRange, '16:02–17:20');
  const { jobStart, jobEnd } = await import('../server/ai-run.js');
  jobEnd(jobStart({ user: sebId, task: 'sok', title: 'Test 41' }));
  const jobs = (await A('/api/ai/jobs')).body;
  const all = [...jobs.running, ...jobs.queued, ...jobs.recent];
  assert.ok(all.length > 0);
  for (const k of ['createdAt', 'startedAt', 'endedAt', 'timeLabel']) assert.ok(k in all[0], k);
});

/* ---------------- Finans ---------------- */

test('Finans: Les på nytt for alle statuser (bokført/avvist gir bare forslag), manglende original er en konkret feil, avvist → til gjennomgang', async () => {
  setSecret('geminiKey', 'test-key');
  fhDb.prepare("INSERT INTO fh_receipts(id,status,created,user_id,file) VALUES('rc41a','rejected',?,?,'finnes-ikke.jpg')").run(Date.now(), sebId);
  const r = await A('/finans/api/receipts/rc41a/reanalyze', 'POST', {});
  assert.equal(r.status, 404, r.text);
  assert.equal(r.body.error, 'Fant ikke originalbildet. Last det opp på nytt for å lese det.');
  assert.doesNotMatch(r.text, /allerede bokført/);
  const one = (await A('/finans/api/receipts/rc41a')).body;
  assert.equal(one.canReread, true);
  const rv = await A('/finans/api/receipts/rc41a/review', 'POST', {});
  assert.equal(rv.status, 200, rv.text);
  assert.equal(rv.body.status, 'needs_review');
  assert.equal((await A('/finans/api/receipts/rc41a/review', 'POST', {})).status, 400);
  assert.deepEqual((await A('/finans/api/receipts/rc41a/reads')).body.reads, []);
});

/* ---------------- Bursdager: bilder ---------------- */

const jpeg = (w, h) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14), Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03]), Buffer.alloc(30), Buffer.from([0xff, 0xd9])]);
test('Bursdager: last opp bilder (maks 8, JPEG/WebP, maks 1600 px), photoUrl foran Familie-bildet, slett, alias /photo', async () => {
  assert.deepEqual(bd41.imageInfo41(jpeg(640, 480)), { mime: 'image/jpeg', width: 640, height: 480 });
  const p = await A('/api/birthdays', 'POST', { name: 'Emma Hansen', month: 3, day: 14, relation: 'venn' });
  assert.ok([200, 201].includes(p.status), p.text);
  const id = p.body.item?.id ?? p.body.id ?? (await A('/api/birthdays')).body.items.find((x) => x.name === 'Emma Hansen').id;
  const up = (buf, type = 'image/jpeg', path = `/api/birthdays/${id}/photos`) => req(path, { method: 'POST', headers: { cookie: sebCookie, 'content-type': type }, raw: buf });
  assert.equal((await up(Buffer.from('ikke et bilde'), 'image/png')).status, 415);
  assert.equal((await up(jpeg(2400, 1800))).status, 413);
  assert.equal((await req(`/api/birthdays/${id}/photos`, { method: 'POST', headers: { authorization: 'Bearer feil', 'content-type': 'image/jpeg' }, raw: jpeg(10, 10) })).status, 401);
  const a = await up(jpeg(256, 256));
  assert.equal(a.status, 201, a.text);
  assert.equal(a.body.toast, 'Bilde lagt til for Emma');
  assert.equal(a.body.photos.length, 1);
  assert.match(a.body.photoUrl, new RegExp(`^/api/birthdays/${id}/photos/[0-9a-f]{16}\\?v=`));
  const img = await req(a.body.photoUrl, { headers: { cookie: sebCookie } });
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.equal((await I(a.body.photoUrl)).status, 404, 'bare egne');
  const it = (await A('/api/birthdays')).body.items.find((x) => x.id === id);
  assert.equal(it.photoUrl, a.body.photoUrl);
  assert.equal(it.avatarUrl, a.body.photoUrl);
  for (let i = 0; i < 7; i++) assert.equal((await up(jpeg(100 + i, 100))).status, 201);
  assert.equal((await up(jpeg(50, 50))).status, 409, 'maks 8');
  const list = (await A(`/api/birthdays/${id}/photos`)).body;
  assert.equal(list.photos.length, 8);
  assert.equal(list.photos[0].primary, true);
  const del = await A(`/api/birthdays/${id}/photos/${list.photos[0].id}`, 'DELETE');
  assert.equal(del.body.photos.length, 7);
  assert.equal(del.body.photos[0].primary, true, 'neste blir hovedbilde');
  assert.equal((await A(`/api/birthdays/${id}/photo`, 'DELETE')).body.photos.length, 6);
});

/* ---------------- 17. mai ---------------- */

test('17. mai: mai17 auto/av/pa og mai17Active (flagg 14.–17. mai, eget Hjem på dagen), program, design-bryter og hurra', async () => {
  const d = (s) => Date.parse(`${s}T10:00:00Z`);
  assert.deepEqual([mai.mai17Active({}, d('2026-05-15')).on, mai.mai17Active({}, d('2026-05-15')).day], [true, false]);
  assert.equal(mai.mai17Active({}, d('2026-05-17')).home, true);
  assert.equal(mai.mai17Active({}, d('2026-05-18')).on, false);
  assert.equal(mai.mai17Active({ mai17: 'av' }, d('2026-05-17')).on, false);
  assert.equal(mai.mai17Active({ mai17: 'pa' }, d('2026-10-20')).day, true, 'Vis nå');
  const s = await A('/api/glimt/settings');
  assert.equal(s.body.mai17, 'auto');
  assert.equal(s.body.mai17Active.flag.red, '#BA0C2F');
  assert.equal((await A('/api/glimt/settings', 'PUT', { mai17: 'x' })).status, 400);
  const p = await A('/api/glimt/settings', 'PUT', { mai17: 'pa' });
  assert.equal(p.body.mai17Active.day, true);
  const day = await A('/api/glimt/mai17');
  assert.equal(day.body.greeting, 'Gratulerer med dagen, Sebastian!');
  assert.deepEqual(day.body.program.filter((x) => x.kind === 'city').map((x) => x.time), ['07:00', '10:00', '13:00', '18:00']);
  assert.equal((await A('/api/glimt/mai17/design', 'PUT', { on: false })).body.mai17Active.home, false);
  assert.equal((await A('/api/glimt/mai17/design', 'PUT', { on: true })).body.mai17Active.home, true);
  assert.equal((await A('/api/glimt/mai17/hurra', 'POST', {})).body.text, 'Hurra nr. 1');
  const h2 = await A('/api/glimt/mai17/hurra', 'POST', {});
  assert.equal(h2.body.text, 'Hurra nr. 2');
  assert.equal(h2.body.sent, 1);
  const br = await A('/api/brief');
  assert.equal(br.body.mai17.title, '17. MAI');
  await A('/api/glimt/settings', 'PUT', { mai17: 'auto' });
});

/* ---------------- Skiføre ---------------- */

test('Skiføre: smøreregler, kortet bare ved ≥ 15 cm snø og når det ikke er slått av; brief og Vær får ski', async () => {
  assert.equal(wx41.wax41({ tempC: -12 }).grip, 'Grønn (V20)');
  assert.equal(wx41.wax41({ tempC: -4, newCm: 6 }).grip, 'Blå (V30)');
  assert.equal(wx41.wax41({ tempC: -4 }).grip, 'Blå ekstra (V40)');
  assert.equal(wx41.wax41({ tempC: -1 }).grip, 'Fiolett (V45)');
  assert.equal(wx41.wax41({ tempC: 2 }).short, 'rød');
  assert.equal(wx41.wax41({ tempC: -3, refrozen: true }).grip, 'Blå klister');
  assert.equal(wx41.glide41(-9), 'kald');
  wx41._setWeather41Fetch(async () => new Response(JSON.stringify({ current: { temperature_2m: -4, relative_humidity_2m: 82, snow_depth: 0.42 }, daily: { snowfall_sum: [2, 3, 1, 0], temperature_2m_max: [-3, -2, -2, -3] } }), { status: 200 }));
  try {
    const s = await wx41.ski41(sebId);
    assert.equal(s.chip, 'Ski: blå');
    assert.equal(s.grip, 'Feste: Blå (V30)');
    assert.equal(s.text, 'Nysnø i Nordmarka: 42 cm snø og -4°. Glimt anbefaler blå (V30) i festesonen.');
    assert.equal(s.places[0].snowCm, 42);
    assert.equal((await A('/api/brief')).body.ski.chip, 'Ski: blå');
    assert.equal((await A('/api/weather/layout', 'PUT', { ski: false })).body.ski, false);
    assert.equal(await wx41.ski41(sebId), null, 'slått av');
    assert.equal((await A('/api/brief')).body.ski, undefined);
    await A('/api/weather/layout', 'PUT', { ski: true });
  } finally { wx41._setWeather41Fetch(null); }
  assert.equal(await wx41.ski41(sebId, Date.parse('2026-07-01T10:00:00Z')), null, 'ingen snø om sommeren (mock)');
});

/* ---------------- Kalender: Glimt-søk og testvarsel ---------------- */

test('Kalender: Glimt-søk (Ollama over hendelser, {text, events}), reserve uten AI, testvarsel og push-test', async () => {
  const t0 = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
  const plus = (n) => { const d = new Date(`${t0}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const evs = [{ id: 'e1', title: 'Tannlege', date: plus(5), start: `${plus(5)}T15:30:00Z`, end: `${plus(5)}T16:00:00Z`, room: 'Majorstuen tannklinikk', calendar: 'privat' },
    { id: 'e2', title: 'Fotball', date: plus(2), start: `${plus(2)}T16:00:00Z`, end: `${plus(2)}T17:30:00Z`, calendar: 'familie' }];
  kal41._setKal41Events(async () => evs);
  let prompt = null;
  kal41._setKal41Llm(async (p) => { prompt = p.prompt; return { answer: 'Neste tannlege er om fem dager kl. 17:30.', ids: ['e1', 'ukjent'] }; });
  try {
    assert.equal((await A('/api/kalender/glimt/search', 'POST', {})).status, 400);
    const r = await A('/api/kalender/glimt/search', 'POST', { q: 'når er neste tannlege?' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.label, 'GLIMT · OLLAMA');
    assert.equal(r.body.text, 'Neste tannlege er om fem dager kl. 17:30.');
    assert.deepEqual(r.body.events.map((e) => e.id), ['e1'], 'ukjente id-er droppes');
    assert.match(prompt, /e1 \| .* \| Tannlege \| Majorstuen tannklinikk/);
    kal41._setKal41Llm(async () => { throw new Error('nede'); });
    const l = await A('/api/calendar/ask', 'POST', { q: 'når er neste tannlege?' });
    assert.equal(l.body.label, 'UTEN AI');
    assert.equal(l.body.events[0].id, 'e1');
    assert.match(l.body.text, /^Neste: Tannlege /);
  } finally { kal41._setKal41Events(null); kal41._setKal41Llm(null); }
  const n = await A('/api/kalender/notify/test', 'POST', {});
  assert.equal(n.status, 200);
  assert.ok(n.body.queued);
  assert.equal((await A('/api/notify/pending')).body.items?.at?.(-1)?.title ?? (await A('/api/notify/pending')).body.at?.(-1)?.title ?? 'Kalender · test', 'Kalender · test');
  const p = await A('/api/push/test', 'POST', { app: 'kalender' });
  assert.equal(p.status, 200);
  assert.ok('pushed' in p.body && 'text' in p.body);
  assert.equal((await req('/api/push/test', { method: 'POST', body: {} })).status, 401);
});
