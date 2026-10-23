// Prompt 46 (DATA46): Sporing – Posten/Bring og PostNord (claude-code-sporing-posten-postnord-fiks.md), med lagrede (anonymiserte) svar
// i test/fixtures/p46. Dekker: tom shipments, ute for levering via kode 113, klar for henting (+ forlenget liggetid), levert via arkiv og
// hendelser, added_by_user etter levering, retur, 401 med vellykket refresh, 401 etter refresh, roterende refresh-token, paginering med
// remainingCount, Bring v2-formen (rotårsaken), ha-postnord-headere, avvist nøkkel → offentlig sporing, Posten↔PostNord for SSCC,
// innlogging (PKCE / Basic), krypterte tokens som aldri vises, og per bruker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p46d-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-46d';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.MOCK_DATA = '1';
process.env.OCR_FALLBACK = '0';
process.env.PORT = '4262';
delete process.env.OLLAMA_URL;
delete process.env.GEMINI_API_KEY;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
test.after(() => { globalThis.fetch = realFetch; });

const { default: app } = await import('../server/index.js');
const { db, kv, OWNER } = await import('../server/db.js');
const C = await import('../server/tracking-carriers.js');
const T = await import('../server/tracking46.js');
const { updateConfig } = await import('../server/settings.js');

const FX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'p46');
const NOW = () => new Date(Date.now() - 2 * 3600_000).toISOString();
const fx = (name) => JSON.parse(readFileSync(join(FX, name), 'utf8').replaceAll('__NOW__', NOW()).replaceAll('__LATER__', new Date(Date.now() - 3600_000).toISOString()));
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

let ipN = 40;
async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const r = await app.request(path, { method, headers: { ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: j, text };
}
async function cookieFor(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${ipN++}` }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().map((x) => x.split(';')[0]).find((x) => x.startsWith('hl_sid='));
}
const as = (h) => (path, method = 'GET', body) => req(path, { method, headers: h, body });
const A = as({ cookie: await cookieFor('sebastian', 'testpassord1') });
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord123', role: 'bruker', name: 'Ingrid' })).status, 200);
const I = as({ cookie: await cookieFor('ingrid', 'ingridPassord123') });

function withFetch(handler) {
  const orig = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); return (await handler(String(url), init)) ?? new Response('{}', { status: 404 }); };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}

/* ---------------- Normalisering (rene funksjoner) ---------------- */

test('PostNord: kode 113 under EN_ROUTE = ute for levering, vekt/mål i contract-formen, lenke til tracking.postnord.com', () => {
  const p = T.normalizePostnord46(fx('postnord-out-for-delivery-113.json').TrackingInformationResponse.shipments[0]);
  assert.equal(p.status, 'out_for_delivery');
  assert.equal(p.carrier, 'PostNord');
  assert.equal(p.sender, 'Eksempelbutikken');
  assert.equal(p.weight, 1.25);
  assert.deepEqual(p.dimensions, { length: 30, width: 20, height: 10, text: '30 x 20 x 10 cm' });
  assert.equal(p.planned_from, '2026-10-24T13:00:00Z');
  assert.equal(p.url, 'https://tracking.postnord.com/no/tracking?id=00370000000000000101');
  assert.equal(p.history.at(-1).status, 'out_for_delivery');
  for (const k of ['carrier', 'barcode', 'sender', 'receiver', 'status', 'raw_status', 'delivered', 'delivered_at', 'planned_from', 'planned_to', 'pickup', 'pickup_point', 'url', 'weight', 'dimensions', 'history']) assert.ok(k in p, k);
  const r = T.toResult46(p, 'postnord-web');
  assert.equal(r.status, 'out_for_delivery');
  assert.equal(r.statusText46, 'Ute for levering');
  assert.equal(r.events[0].status, 'The delivery of the shipment item is in progress.', 'nyeste først');
});

test('PostNord: klar for henting med hentested, forlenget liggetid (z2F) er fortsatt klar; retur som ender DELIVERED = levert', () => {
  const p = T.normalizePostnord46(fx('postnord-pickup-retention.json').TrackingInformationResponse.shipments[0]);
  assert.equal(p.status, 'at_pickup_point');
  assert.equal(p.pickup, true);
  assert.equal(p.pickup_point, 'Kiwi Pilestredet');
  const r = T.toResult46(p, 'x');
  assert.equal(r.status, 'ready_for_pickup');
  assert.deepEqual(r.pickup, { name: 'Kiwi Pilestredet', deadline: '2026-10-31' });
  const ret = T.normalizePostnord46(fx('postnord-return-delivered.json').TrackingInformationResponse.shipments[0]);
  assert.equal(ret.status, 'delivered');
  assert.equal(T.normalizePostnord46({ shipmentId: 'X', status: 'RETURNED', items: [] }).status, 'returning');
  assert.equal(T.normalizePostnord46({ shipmentId: 'X', status: 'DELIVERY_IMPOSSIBLE', items: [] }).status, 'problem');
  assert.equal(T.normalizePostnord46({ shipmentId: 'X', status: 'NOE_NYTT', items: [] }).status, 'unknown');
});

test('Posten: små bokstaver, archived → siste delivered-hendelse (added_by_user etter levering ignoreres), retur, vindu', () => {
  const [p1, p2] = fx('posten-inbox-page1.json').parcels.map(T.normalizePosten46);
  assert.equal(p1.status, 'in_transit');
  assert.equal(p1.planned_from, '2026-10-24T13:00:00Z');
  assert.equal(p1.planned_to, '2026-10-24T15:00:00Z');
  assert.equal(p1.url, 'https://sporing.posten.no/sporing/CV100000001NO');
  assert.equal(p2.status, 'at_pickup_point');
  assert.equal(p2.pickup_point, 'Rema 1000 Bislett');
  const [p3, p4] = fx('posten-inbox-page2.json').parcels.map(T.normalizePosten46);
  assert.equal(p3.status, 'delivered', 'added_by_user etter delivered gir fortsatt levert');
  assert.ok(p3.delivered_at);
  assert.equal(p3.planned_from, null, 'ingen ETA når levert');
  assert.equal(p4.status, 'returning');
  assert.equal(T.postenStatus46('ARCHIVED', []), 'unknown');
  assert.equal(T.postenStatus46('Underway'), 'in_transit', 'store/små bokstaver');
  assert.ok(!T.toResult46(p1, 'x').events.some((e) => e.status === 'added_by_user'));
});

/* ---------------- Nummersporing ---------------- */

test('PostNord uten nøkkel: tom shipments = venter på første skanning (ikke feil); bare X-Bap-Key som ha-postnord', async () => {
  C._clearPostnordWebCache(); C._clearPostenWebCache();
  const f = withFetch((url) => (url.includes('recipientview') ? json(fx('postnord-empty.json')) : null));
  try {
    const r = await C.fetchStatus('postnord', '00370000000000000999');
    assert.equal(r.notScanned, true);
    assert.equal(r.status, 'unknown');
    const h = f.calls[0].init.headers;
    assert.equal(h['x-bap-key'], 'web-ncp');
    assert.equal(h.Origin, undefined, 'ingen falske nettleser-headere');
    assert.equal(h['User-Agent'], undefined);
  } finally { f.restore(); }
});

test('PostNord: 403 med ha-headere → nettleser-headere én gang, profilen som virket huskes; begge avvist → backoff maks 1 t', async () => {
  C._clearPostnordWebCache();
  const f = withFetch((url, init) => (url.includes('recipientview') ? (init.headers.Origin ? json(fx('postnord-out-for-delivery-113.json')) : new Response('Forbidden', { status: 403 })) : null));
  try {
    const r = await C.postnordWeb('00370000000000000101');
    assert.equal(r.status, 'out_for_delivery');
    assert.equal(f.calls.length, 2);
    assert.equal(C.pnProfile46Of(), 'browser');
  } finally { f.restore(); }
  C._clearPostnordWebCache();
  const g = withFetch((url) => (url.includes('recipientview') ? new Response('Forbidden', { status: 403 }) : null));
  try {
    await assert.rejects(C.postnordWeb('00370000000000000102'), /svarer ikke/);
    const until = Date.parse((await A('/api/tracking/postnord/health')).body.blockedUntil);
    assert.ok(until - Date.now() <= 3600_000 + 1000, 'maks 1 t');
  } finally { g.restore(); C._clearPostnordWebCache(); }
});

test('PostNord med avvist nøkkel (401 på findByIdentifier) → offentlig recipientview i stedet for feil', async () => {
  updateConfig({ postnordKey: 'gammel-nokkel' }, OWNER);
  C._clearPostnordWebCache();
  const f = withFetch((url) => (url.includes('findByIdentifier') ? new Response('nei', { status: 401 }) : url.includes('recipientview') ? json(fx('postnord-pickup-retention.json')) : null));
  try {
    const r = await C.fetchStatus('postnord', '00370000000000000102');
    assert.equal(r.status, 'ready_for_pickup');
    assert.equal(r.pickupPoint, 'Kiwi Pilestredet');
    assert.ok(f.calls.some((c) => c.url.includes('recipientview')));
  } finally { f.restore(); updateConfig({ postnordKey: null }, OWNER); C._clearPostnordWebCache(); }
});

test('ROTÅRSAK Bring: ekte v2-form consignmentSet[].packageSet[] leses (før: «Fant ikke sendingen»), Mybring-headere, 404 = fant ikke', async () => {
  updateConfig({ mybringUid: 'meg@example.no', mybringKey: 'k46' }, OWNER);
  const f = withFetch((url) => (url.includes('api.bring.com') ? json(fx('bring-v2-pickup.json')) : null));
  try {
    const r = await C.fetchStatus('bring', '370712345678901234');
    assert.equal(r.status, 'ready_for_pickup');
    assert.equal(r.pickupPoint, 'Rema 1000 Bislett');
    assert.equal(r.events[0].status, 'Sendingen er klar til henting');
    assert.equal(r.weight, 1.3);
    const h = f.calls[0].init.headers;
    assert.equal(h['X-Mybring-API-Uid'], 'meg@example.no');
    assert.equal(h['X-Mybring-API-Key'], 'k46');
    assert.ok(h['X-Bring-Client-URL']);
  } finally { f.restore(); }
  const g = withFetch((url) => (url.includes('api.bring.com') ? json(fx('bring-v2-notfound.json')) : null));
  try { await assert.rejects(C.fetchStatus('posten', 'CV999999999NO'), (e) => e.status === 404); } finally { g.restore(); }
  // Avvist Mybring-nøkkel → Postens offentlige sporing (samme format).
  C._clearPostenWebCache();
  const h = withFetch((url) => (url.includes('api.bring.com') ? new Response('nei', { status: 401 }) : url.startsWith('https://sporing.posten.no/tracking/api/fetch') ? json(fx('bring-v2-pickup.json')) : null));
  try {
    const r = await C.fetchStatus('posten', 'CV100000009NO');
    assert.equal(r.status, 'ready_for_pickup');
    assert.equal(r.via, 'posten-web');
    assert.equal(r.unofficial, true);
  } finally { h.restore(); updateConfig({ mybringUid: null, mybringKey: null }, OWNER); C._clearPostenWebCache(); }
});

test('Posten uten nøkkel: offentlig sporing; nede (403/HTML) regnes ikke som «fant ikke» (ingen feilarkivering etter 30 dager)', async () => {
  C._clearPostenWebCache();
  const f = withFetch((url) => (url.startsWith('https://sporing.posten.no') ? new Response('<html>Access denied</html>', { status: 403 }) : null));
  try { await assert.rejects(C.fetchStatus('posten', 'CV100000010NO'), (e) => e.status !== 404 && /Posten-kontoen|Mybring/.test(e.message)); } finally { f.restore(); }
  assert.match(C.missingKeyText('posten'), /Posten-kontoen/);
});

test('SSCC-nummer: ikke skannet hos PostNord, men funnet hos Posten → carrierFound = posten', async () => {
  C._clearPostnordWebCache(); C._clearPostenWebCache();
  const f = withFetch((url) => (url.includes('recipientview') ? json(fx('postnord-empty.json')) : url.startsWith('https://sporing.posten.no') ? json(fx('bring-v2-pickup.json')) : null));
  try {
    const r = await C.fetchStatus('postnord', '00370712345678901234');
    assert.equal(r.carrierFound, 'posten');
    assert.equal(r.status, 'ready_for_pickup');
  } finally { f.restore(); C._clearPostnordWebCache(); C._clearPostenWebCache(); }
});

/* ---------------- Konto: innlogging, tokens og synk ---------------- */

test('PostNord-innlogging: PKCE S256 med appens client_id; feil state avvises; tokens kryptert og aldri i API-svar', async () => {
  const st = await A('/api/tracking/accounts/postnord/start', 'POST', {});
  assert.equal(st.status, 200, st.text);
  const u = new URL(st.body.authorizeUrl);
  assert.equal(u.origin + u.pathname, 'https://account.postnord.com/auth');
  assert.equal(u.searchParams.get('client_id'), 'receiverappprod3gvTgY5ATtYWZZy');
  assert.equal(u.searchParams.get('redirect_uri'), 'com.postnord.app://redirect');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(u.searchParams.get('scope').includes('offline_access'));
  assert.equal(st.body.callbackScheme, 'com.postnord.app');
  const state = u.searchParams.get('state');
  assert.equal((await A('/api/tracking/accounts/postnord/finish', 'POST', { redirectUrl: 'com.postnord.app://redirect?code=abc&state=feil' })).status, 400);
  assert.equal((await A('/api/tracking/accounts/postnord/finish', 'POST', { redirectUrl: 'https://evil.example/?code=abc&state=' + state })).status, 400, 'feil skjema');
  const calls = [];
  T._setFetch46(async (url, init = {}) => {
    calls.push({ url, init });
    if (url === 'https://account.postnord.com/oauth2/token') return json({ access_token: 'PN-ACCESS-1', refresh_token: 'PN-REFRESH-1', expires_in: 3600 });
    if (url.startsWith('https://api2.postnord.com/rest/customer/v2/receiverapp/tracking')) return json(fx('postnord-account.json'));
    return new Response('{}', { status: 404 });
  });
  try {
    const r = await A('/api/tracking/accounts/postnord/finish', 'POST', { redirectUrl: `Location: "com.postnord.app://redirect?code=KODE&state=${state}"` });
    assert.equal(r.status, 200, r.text);
    const tokenCall = calls.find((c) => c.url.endsWith('/oauth2/token'));
    const form = new URLSearchParams(tokenCall.init.body);
    assert.equal(form.get('grant_type'), 'authorization_code');
    assert.equal(form.get('code'), 'KODE');
    assert.ok(form.get('code_verifier')?.length >= 43, 'PKCE-verifier');
    const trk = calls.find((c) => c.url.includes('receiverapp/tracking'));
    assert.match(trk.url, /summary=false&apikey=1ecf161be47543b19fce03f953a6e8d2/);
    assert.equal(trk.init.headers.Authorization, 'Bearer PN-ACCESS-1');
    assert.equal(trk.init.headers.context, 'mobileapp');
    const src = r.body.sources.find((s) => s.id === 'postnord');
    assert.equal(src.state, 'ok');
    assert.match(src.text, /^Tilkoblet · 2 pakker · oppdatert \d\d:\d\d$/);
    assert.ok(!r.text.includes('PN-ACCESS') && !r.text.includes('PN-REFRESH'), 'tokens aldri til klienten');
    const stored = kv.get(OWNER, 'trk46_acc').postnord;
    assert.match(stored.access, /^enc:/); assert.match(stored.refresh, /^enc:/);
    assert.ok(!JSON.stringify(stored).includes('PN-REFRESH'));
    const list = (await A('/api/tracking')).body.items;
    const a = list.find((x) => x.trackingNo === '00370000000000000111');
    assert.ok(a, 'aktiv kontopakke i Sporing');
    assert.equal(a.source, 'account');
    assert.equal(a.status, 'in_transit');
    assert.equal(a.viaLabel, 'via PostNord-kontoen');
    const d = list.find((x) => x.trackingNo === '00370000000000000112');
    assert.equal(d.status, 'delivered');
    assert.ok(!(await I('/api/tracking')).body.items.some((x) => x.trackingNo === '00370000000000000111'), 'per bruker');
    assert.equal((await I('/api/tracking/sources46')).body.sources.find((s) => s.id === 'postnord').connected, false);
  } finally { T._setFetch46(null); }
});

test('PostNord-konto: 401 → refresh én gang (rotert refresh-token lagres) → OK; 401 også etter refresh = app-nøkkelen er byttet (ikke logg inn på nytt)', async () => {
  let accessOk = 'PN-ACCESS-2';
  const seen = [];
  T._setFetch46(async (url, init = {}) => {
    if (url.endsWith('/oauth2/token')) { seen.push(new URLSearchParams(init.body).get('refresh_token')); return json({ access_token: 'PN-ACCESS-2', refresh_token: 'PN-REFRESH-2' }); }
    if (url.includes('receiverapp/tracking')) return init.headers.Authorization === `Bearer ${accessOk}` ? json(fx('postnord-account.json')) : new Response('', { status: 401 });
    return new Response('{}', { status: 404 });
  });
  try {
    const r = await T.syncAccount46(OWNER, 'postnord');
    assert.equal(r.ok, true, r.message);
    assert.deepEqual(seen, ['PN-REFRESH-1']);
    const { unseal } = await import('../server/finans/db.js');
    assert.equal(unseal(kv.get(OWNER, 'trk46_acc').postnord.refresh), 'PN-REFRESH-2', 'rotert token lagret');
    accessOk = 'aldri';
    const r2 = await T.syncAccount46(OWNER, 'postnord');
    assert.equal(r2.ok, false);
    assert.equal(r2.state, 'compat');
    const src = (await A('/api/tracking/sources46')).body.sources.find((s) => s.id === 'postnord');
    assert.equal(src.text, 'PostNord har endret app-nøkkelen, oppdatering kreves');
    assert.equal(T.accountDue46(OWNER, 'postnord'), false, 'ingen polling før oppdatering');
  } finally { T._setFetch46(null); }
  // Refresh-tokenet avvist → «Må logge inn på nytt».
  kv.set(OWNER, 'trk46_acc', { ...kv.get(OWNER, 'trk46_acc'), postnord: { ...kv.get(OWNER, 'trk46_acc').postnord, state: 'ok' } });
  T._setFetch46(async (url) => (url.endsWith('/oauth2/token') ? json({ error: 'invalid_grant' }, 400) : new Response('', { status: 401 })));
  try {
    const r = await T.syncAccount46(OWNER, 'postnord');
    assert.equal(r.state, 'reauth');
    assert.equal((await A('/api/tracking/sources46')).body.sources.find((s) => s.id === 'postnord').text, 'Må logge inn på nytt');
  } finally { T._setFetch46(null); }
  assert.equal((await A('/api/tracking/accounts/postnord', 'DELETE')).status, 200);
});

test('Posten-ID: Basic-autentisert app-klient uten PKCE, roterende refresh-token lagres straks, paginering med remainingCount og exclude', async () => {
  const st = await A('/api/tracking/accounts/posten/start', 'POST', { brand: 'bring' });
  const u = new URL(st.body.authorizeUrl);
  assert.equal(u.origin + u.pathname, 'https://login.bring.com/api/oauth/authorizations/new');
  assert.equal(u.searchParams.get('redirect_uri'), 'bring://login');
  assert.equal(u.searchParams.get('is_app'), 'true');
  assert.equal(u.searchParams.get('brand'), 'bring');
  assert.equal(u.searchParams.get('code_challenge'), null, 'ingen PKCE');
  const state = u.searchParams.get('state');
  const calls = [];
  let n = 0;
  T._setFetch46(async (url, init = {}) => {
    calls.push({ url, init });
    if (url === 'https://login.bring.com/api/oauth/accesstoken') {
      const f = new URLSearchParams(init.body);
      n++;
      if (f.get('grant_type') === 'authorization_code') return json({ access_token: 'PB-A0', refresh_token: 'PB-R0', expires_in: 3600 });
      return json({ access_token: `PB-A${n}`, refresh_token: `PB-R${n}`, expires_in: 3600 });
    }
    if (url === 'https://api.posten.no/parcel-api/v1/parcel') {
      const b = JSON.parse(init.body);
      return json(b.exclude.length ? fx('posten-inbox-page2.json') : fx('posten-inbox-page1.json'));
    }
    return new Response('{}', { status: 404 });
  });
  try {
    const r = await A('/api/tracking/accounts/posten/finish', 'POST', { redirectUrl: ` bring://login?code=PKODE&state=${state} ` });
    assert.equal(r.status, 200, r.text);
    const tok = calls.find((c) => c.url.endsWith('/accesstoken'));
    const exp = 'Basic ' + Buffer.from('ffb3cd07a5a043a5977b7e272a06bb8f:0b00ac6b4c474c0ea087552341f10a1446592b94dada40cbbdba97aa84cfe5bb41cba49339582').toString('base64');
    assert.equal(tok.init.headers.Authorization, exp);
    assert.equal(new URLSearchParams(tok.init.body).get('code_verifier'), null);
    const pages = calls.filter((c) => c.url.includes('parcel-api'));
    assert.equal(pages.length, 2, 'to sider (remainingCount)');
    const b2 = JSON.parse(pages[1].init.body);
    assert.deepEqual(b2.exclude.sort(), ['CV100000001NO', 'CV100000002NO']);
    assert.ok(Date.parse(b2.lastUpdated) < Date.now() - 29 * 86400_000, 'lastUpdated = nå − 30 d');
    assert.equal(r.body.sources.find((s) => s.id === 'posten').count, 4, 'duplikat (CV100000002NO) fjernet');
    const items = (await A('/api/tracking')).body.items;
    assert.equal(items.find((x) => x.trackingNo === 'CV100000002NO').status, 'ready_for_pickup');
    assert.equal(items.find((x) => x.trackingNo === 'CV100000002NO').pickupPoint, 'Rema 1000 Bislett');
    assert.equal(items.find((x) => x.trackingNo === 'CV100000003NO').status, 'delivered');
    assert.equal(items.find((x) => x.trackingNo === 'CV100000004NO').status, 'returned');
    // Utløpt access-token → refresh med det SISTE refresh-tokenet; nytt lagres med en gang.
    const acc = kv.get(OWNER, 'trk46_acc'); acc.posten.exp = Date.now() - 1; kv.set(OWNER, 'trk46_acc', acc);
    await T.syncAccount46(OWNER, 'posten');
    const ref = calls.filter((c) => c.url.endsWith('/accesstoken')).map((c) => new URLSearchParams(c.init.body)).filter((f) => f.get('grant_type') === 'refresh_token');
    assert.equal(ref[0].get('refresh_token'), 'PB-R0');
    const { unseal } = await import('../server/finans/db.js');
    assert.equal(unseal(kv.get(OWNER, 'trk46_acc').posten.refresh), 'PB-R2');
    const acc2 = kv.get(OWNER, 'trk46_acc'); acc2.posten.exp = Date.now() - 1; kv.set(OWNER, 'trk46_acc', acc2);
    await T.syncAccount46(OWNER, 'posten');
    const ref2 = calls.filter((c) => c.url.endsWith('/accesstoken')).map((c) => new URLSearchParams(c.init.body)).filter((f) => f.get('grant_type') === 'refresh_token');
    assert.equal(ref2[1].get('refresh_token'), 'PB-R2', 'aldri et brent token');
    // Nummersporingen bruker kontoens svar for et nummer i innboksen (ingen offentlig kall).
    const f = withFetch(() => null);
    try {
      const { runAsUser } = await import('../server/settings.js');
      const r3 = await runAsUser(OWNER, () => C.fetchStatus('posten', 'CV100000002NO'));
      assert.equal(r3.via, 'posten-konto');
      assert.equal(f.calls.length, 0);
    } finally { f.restore(); }
  } finally { T._setFetch46(null); }
});

test('Posten-innboks: 401 etter vellykket refresh er ikke «logg inn på nytt» før tredje gang; polling 15/45 min, stille 00–06', async () => {
  T._setFetch46(async (url) => (url.endsWith('/accesstoken') ? json({ access_token: 'X', refresh_token: 'Y', expires_in: 3600 }) : new Response('', { status: 403 })));
  try {
    assert.equal((await T.syncAccount46(OWNER, 'posten')).state, 'error');
    assert.equal((await T.syncAccount46(OWNER, 'posten')).state, 'error');
    assert.equal((await T.syncAccount46(OWNER, 'posten')).state, 'reauth');
  } finally { T._setFetch46(null); }
  assert.equal(T.accountInterval46(OWNER, 'posten'), 45 * 60_000);
  db.prepare("UPDATE hl_shipments SET status='out_for_delivery' WHERE user_id=? AND tracking_no='CV100000001NO'").run(OWNER);
  assert.equal(T.accountInterval46(OWNER, 'posten'), 15 * 60_000);
  const acc = kv.get(OWNER, 'trk46_acc'); acc.posten.state = 'ok'; acc.posten.lastSync = 0; acc.posten.lastTry = 0; kv.set(OWNER, 'trk46_acc', acc);
  const night = new Date(); night.setUTCHours(1, 0, 0, 0); // 02/03 i Oslo
  assert.equal(T.accountDue46(OWNER, 'posten', night.getTime()), false);
  const day = new Date(); day.setUTCHours(10, 0, 0, 0);
  assert.equal(T.accountDue46(OWNER, 'posten', day.getTime()), true);
});

test('ukjente kilder og ugyldig innliming gir tydelige feil', async () => {
  assert.equal((await A('/api/tracking/accounts/dhl/start', 'POST', {})).status, 404);
  assert.equal((await A('/api/tracking/accounts/postnord/finish', 'POST', {})).status, 400);
  kv.del(OWNER, 'trk46_login');
  const r = await A('/api/tracking/accounts/postnord/finish', 'POST', { redirectUrl: 'com.postnord.app://redirect?code=a&state=b' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /utløpt/);
  assert.deepEqual(T.parseRedirect46('posten://login?code=1&state=2', 'posten://login'), { code: '1', state: '2', error: null });
  assert.equal(T.parseRedirect46('bring://login?code=1&state=2', 'posten://login').wrongScheme, true);
});
