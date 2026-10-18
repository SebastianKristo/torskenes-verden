// Prompt 24 (server): Bursdager (Google Kalender med PKCE og syncToken, Home Assistant, påminnelser, widget), Familie med
// én oppføring per person og flere enheter, Integrasjoner (alle oppsett, bare admin), profiler i /api/me/layout,
// bakgrunn per bolig, domene-pillen og ✦ AI-søk i innstillingene. Google og HA er mocket (ingen nett i sandkassen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-p24-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-24';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
process.env.OCR_FALLBACK = '0';
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: app } = await import('../server/index.js');
const bd = await import('../server/birthdays.js');
const ia = await import('../server/integrations-api.js');
const { kv } = await import('../server/db.js');
const { secret } = await import('../server/finans/db.js');
const { cfg } = await import('../server/settings.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (auth) => async (path, method = 'GET', body, extra = {}) => {
  const raw = body instanceof FormData || body instanceof Uint8Array;
  const h = { ...(auth?.startsWith('fh_') ? { authorization: `Bearer ${auth}` } : auth ? { cookie: auth } : {}), ...(body && !raw ? { 'content-type': 'application/json' } : {}), ...extra };
  const r = await app.request(path, { method, headers: h, body: raw ? body : body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null; try { json = JSON.parse(buf.toString()); } catch { /* ikke JSON */ }
  return { status: r.status, body: json, text: buf.toString(), headers: r.headers, buf };
};
const cookieA = await login('sebastian', 'testpassord1');
const A = client(cookieA);
assert.equal((await A('/api/users', 'POST', { username: 'ola', password: 'olaPassord123', role: 'bruker', name: 'Ola' })).status, 200);
assert.equal((await A('/api/users', 'POST', { username: 'ingrid', password: 'ingridPassord1', role: 'bruker', name: 'Ingrid' })).status, 200);
const cookieB = await login('ola', 'olaPassord123');
const B = client(cookieB);
const anon = client(null);
const tokA = (await A('/finans/api/tokens', 'POST', { name: 'iPhone', scopes: ['finance:read', 'finance:write'] })).body.token;
const tokB = (await B('/finans/api/tokens', 'POST', { name: 'Pixel', scopes: ['finance:read'] })).body.token;
assert.ok(tokA && tokB);
const TA = client(tokA), TB = client(tokB);
const json = (b, status = 200) => new Response(status === 204 ? null : JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const alive = setInterval(() => {}, 1000);
test.after(() => clearInterval(alive));

/* ---------------- 1. Bursdager ---------------- */

test('bursdager: per bruker, sortert etter dager igjen, neste, alder, validering og widget', async () => {
  assert.equal((await anon('/api/birthdays')).status, 401);
  let r = await A('/api/birthdays', 'POST', { name: 'Ingrid', month: 11, day: 2, year: 1985, relation: 'familie', reminderDays: 7, saveTo: 'local' });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.item.source, 'local');
  assert.equal(r.body.item.relation, 'familie');
  assert.equal(r.body.item.personId, (await A('/api/users')).body.users.find((u) => u.username === 'ingrid').id, 'koblet til Familie-personen med samme navn');
  await A('/api/birthdays', 'POST', { name: 'Rune', month: 11, day: 2, year: 1962, relation: 'familie' });
  await A('/api/birthdays', 'POST', { name: 'Cybele', month: 1, day: 9, relation: 'venn', reminderDays: null });
  await B('/api/birthdays', 'POST', { name: 'Henrik', month: 10, day: 19, year: 1988, relation: 'venn' });

  r = await A('/api/birthdays');
  assert.equal(r.status, 200);
  const items = r.body.items;
  assert.deepEqual(items.map((x) => x.name).sort(), ['Cybele', 'Ingrid', 'Rune'], 'bare egne bursdager');
  for (let i = 1; i < items.length; i++) assert.ok(items[i - 1].daysLeft <= items[i].daysLeft, 'sortert etter daysLeft');
  const ing = items.find((x) => x.name === 'Ingrid');
  for (const k of ['id', 'name', 'month', 'day', 'year', 'age', 'nextDate', 'daysLeft', 'relation', 'reminderDays', 'source', 'avatarUrl']) assert.ok(k in ing, k);
  assert.equal(ing.age, Number(ing.nextDate.slice(0, 4)) - 1985);
  assert.equal(ing.reminderDays, 7);
  assert.match(ing.remindAt, /T0[78]:00:00.000Z$/, 'kl. 09:00 norsk tid');
  assert.equal(items.find((x) => x.name === 'Cybele').age, null);
  assert.equal(items.find((x) => x.name === 'Cybele').remindAt, null);
  assert.equal(items.find((x) => x.name === 'Rune').reminderDays, 1, 'standard påminnelse er 1 dag før');
  const nx = r.body.next;
  if (nx.date === ing.nextDate) { assert.deepEqual(nx.names.sort(), ['Ingrid', 'Rune']); assert.equal(nx.label.includes(' og '), true); }
  assert.ok(Array.isArray(nx.then));
  assert.deepEqual(Object.keys(r.body.google).sort(), ['calendarId', 'configured', 'connected', 'contacts', 'email', 'error', 'syncedAt', 'writeNew'].sort());
  assert.equal(r.body.google.connected, false);
  assert.ok('entityId' in r.body.ha && 'twoWay' in r.body.ha && 'syncedAt' in r.body.ha);

  // Endre og slette: bare egne. Andre får 404.
  assert.equal((await B(`/api/birthdays/${ing.id}`, 'PATCH', { name: 'Hacket' })).status, 404);
  assert.equal((await B(`/api/birthdays/${ing.id}`, 'DELETE')).status, 404);
  r = await A(`/api/birthdays/${ing.id}`, 'PATCH', { year: 1986, relation: 'venn' });
  assert.equal(r.status, 200);
  assert.equal(r.body.item.year, 1986);
  assert.equal(r.body.item.relation, 'venn');
  for (const bad of [{ name: '' }, { month: 13 }, { month: 2, day: 30 }, { relation: 'fiende' }, { reminderDays: 3 }, { year: 1800 }]) assert.equal((await A(`/api/birthdays/${ing.id}`, 'PATCH', bad)).status, 400, JSON.stringify(bad));
  assert.equal((await A('/api/birthdays', 'POST', { name: 'X', month: 1, day: 1, saveTo: 'google' })).status, 409, 'krever Google-innlogging');
  assert.equal((await B('/api/birthdays', 'POST', { name: 'X', month: 1, day: 1, saveTo: 'ha' })).status, 403, 'HA er serveroppsett, bare admin');

  // Widget: de tre neste og neste. App-token virker.
  r = await TA('/api/widgets/birthdays');
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 3);
  assert.ok(r.body.next.daysLeft >= 0);
  assert.equal(r.body.deepLink, 'finanshub://bursdager');
  for (const k of ['id', 'name', 'month', 'day', 'year', 'age', 'nextDate', 'daysLeft', 'relation', 'avatarUrl']) assert.ok(k in r.body.items[0], k);
  assert.deepEqual((await TB('/api/widgets/birthdays')).body.items.map((x) => x.name), ['Henrik']);
  assert.ok((await TA('/api/mobile/widgets')).body.birthdays.items.length === 3, '/api/mobile/widgets har også bursdager');
  assert.equal((await anon('/api/widgets/birthdays')).status, 401);
});

test('bursdager: dato-hjelpere og navn fra Google', () => {
  assert.equal(bd.nextDateOf(2, 29, '2026-10-18'), '2027-02-28');
  assert.equal(bd.nextDateOf(10, 18, '2026-10-18'), '2026-10-18');
  assert.equal(bd.nextDateOf(10, 17, '2026-10-18'), '2027-10-17');
  for (const [s, n] of [['Ingrids bursdag', 'Ingrid'], ['Ingrid – bursdag', 'Ingrid'], ['Bursdag: Ingrid', 'Ingrid'], ["Ingrid's birthday", 'Ingrid'], ['Ingrid Hansen', 'Ingrid Hansen'], ['Rune fyller 62', 'Rune']]) assert.equal(bd.parseName(s), n, s);
});

/* ---------------- 2. Google Kalender ---------------- */

test('Google: admin legger inn klienten, PKCE-innlogging, kryptert refresh-token, synk med syncToken, skriv og slett', async () => {
  // Klient-ID og hemmelighet via Integrasjoner → Google Kalender.
  assert.equal((await B('/api/integrations/google', 'PUT', { googleClientId: 'abc.apps.googleusercontent.com' })).status, 403);
  let r = await A('/api/integrations/google', 'PUT', { googleClientId: 'abc.apps.googleusercontent.com', googleClientSecret: 'hemmelig-klient' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.status, 'ok');
  assert.equal(r.body.fields.find((f) => f.key === 'googleClientSecret').value, null);
  assert.equal(r.body.fields.find((f) => f.key === 'googleClientSecret').saved, true);
  assert.ok(!JSON.stringify(r.body).includes('hemmelig-klient'));

  const calls = [];
  const store = new Map([['ev1', { id: 'ev1', status: 'confirmed', eventType: 'birthday', birthdayProperties: { type: 'birthday' }, summary: 'Henriks bursdag', start: { date: '1988-10-19' }, end: { date: '1988-10-20' } }],
    ['ev2', { id: 'ev2', status: 'confirmed', eventType: 'default', summary: 'Tannlege', start: { date: '2026-11-01' } }],
    ['ev3', { id: 'ev3', status: 'confirmed', eventType: 'default', summary: 'Ingrid – bursdag', start: { date: '2026-11-02' }, extendedProperties: { private: { birth_year: '1986' } } }]]);
  let seq = 0;
  bd._setGoogleFetch(async (url, init = {}) => {
    const u = new URL(url), m = init.method ?? 'GET';
    calls.push({ url: u, method: m, body: init.body, headers: init.headers });
    if (u.href.startsWith('https://oauth2.googleapis.com/token')) {
      const p = new URLSearchParams(init.body);
      if (p.get('grant_type') === 'authorization_code') { assert.ok(p.get('code_verifier')?.length >= 43, 'PKCE-verifier sendes'); assert.equal(p.get('client_secret'), 'hemmelig-klient'); }
      return json({ access_token: 'at-1', expires_in: 3600, refresh_token: 'rt-hemmelig', id_token: `x.${Buffer.from(JSON.stringify({ email: 'sebastian@gmail.com' })).toString('base64url')}.y` });
    }
    if (u.href.startsWith('https://oauth2.googleapis.com/revoke')) return json({});
    assert.equal(init.headers.authorization, 'Bearer at-1');
    if (u.pathname === '/calendar/v3/users/me/calendarList') return json({ items: [{ id: 'sebastian@gmail.com', summary: 'Sebastian', primary: true, accessRole: 'owner' }, { id: 'fam@group.calendar.google.com', summary: 'Familie', accessRole: 'writer' }] });
    const ev = u.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/(.+))?$/);
    if (ev && m === 'GET') {
      assert.equal(u.searchParams.get('singleEvents'), 'false');
      assert.deepEqual(u.searchParams.getAll('eventTypes'), ['birthday', 'default']);
      const tok = u.searchParams.get('syncToken');
      if (tok === 'gammel') return json({ error: { message: 'gone' } }, 410);
      const items = tok ? [...store.values()].filter((e) => e.seq > Number(tok.slice(1))) : [...store.values()].filter((e) => e.status !== 'cancelled');
      return json({ items, nextSyncToken: `s${seq}` });
    }
    if (ev && m === 'POST') { const b = JSON.parse(init.body); const id = `new${++seq}`; store.set(id, { ...b, id, status: 'confirmed', seq }); return json({ ...b, id }); }
    if (ev && m === 'PATCH') { const e = store.get(decodeURIComponent(ev[2])); Object.assign(e, JSON.parse(init.body), { seq: ++seq }); return json(e); }
    if (ev && m === 'DELETE') { const e = store.get(decodeURIComponent(ev[2])); e.status = 'cancelled'; e.seq = ++seq; return json(null, 204); }
    return json({ error: { message: 'ukjent' } }, 404);
  });

  // Innlogging fra appen: kortlivet kode (ingen token i URL-en), eller ?token=.
  r = await TA('/api/birthdays/google/start', 'POST', { return: 'finanshub://bursdager' });
  assert.equal(r.status, 200);
  assert.match(r.body.url, /^\/api\/birthdays\/google\/auth\?code=/);
  r = await anon(r.body.url);
  assert.equal(r.status, 302);
  const loc = new URL(r.headers.get('location'));
  assert.equal(loc.origin + loc.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(loc.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(loc.searchParams.get('access_type'), 'offline');
  assert.match(loc.searchParams.get('scope'), /calendar\.events/);
  assert.match(loc.searchParams.get('redirect_uri'), /\/api\/birthdays\/google\/callback$/);
  assert.equal((await anon(`/api/birthdays/google/auth?token=${tokB}`)).status, 302, '?token= godtas også');
  assert.equal((await anon('/api/birthdays/google/auth?code=feil')).status, 401);

  r = await anon(`/api/birthdays/google/callback?state=${loc.searchParams.get('state')}&code=kode-fra-google`);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), 'finanshub://bursdager?ok=1&google=ok');
  assert.equal((await anon(`/api/birthdays/google/callback?state=${loc.searchParams.get('state')}&code=x`)).status, 400, 'state er engangs');
  const stored = kv.get((await A('/api/me')).body.id, 'bd_google', {});
  assert.match(stored.refresh, /^enc:/, 'refresh-token lagres kryptert');
  assert.ok(!JSON.stringify(stored).includes('rt-hemmelig'));
  await new Promise((res) => setTimeout(res, 50));

  r = await A('/api/birthdays/google/sync', 'POST', { full: true });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.google.connected, true);
  assert.equal(r.body.google.email, 'sebastian@gmail.com');
  const names = r.body.items.map((x) => `${x.name}:${x.source}`);
  assert.ok(names.includes('Henrik:google'), names.join());
  assert.ok(!names.some((n) => n.startsWith('Tannlege')), 'vanlige hendelser hentes ikke');
  const ing = r.body.items.filter((x) => x.name === 'Ingrid');
  assert.equal(ing.length, 1, 'samme navn og dato blir ikke duplikat');
  assert.equal(ing[0].googleEventId, 'ev3');
  assert.match(ing[0].googleUrl, /^https:\/\/calendar\.google\.com\/calendar\/event\?eid=/);
  assert.equal(r.body.items.find((x) => x.name === 'Henrik').year, 1988, 'år fra kontaktbursdagen');
  assert.equal((await B('/api/birthdays')).body.items.filter((x) => x.source === 'google').length, 0, 'Google-tilkoblingen er per bruker');

  // Kalenderliste og valg.
  r = await A('/api/birthdays/google/calendars');
  assert.deepEqual(r.body.items.map((x) => x.id), ['primary', 'fam@group.calendar.google.com']);
  assert.equal((await B('/api/birthdays/google/calendars')).status, 409);

  // Ny bursdag lagres i Google som årlig heldagshendelse med homelab_id og birth_year.
  r = await A('/api/birthdays', 'POST', { name: 'Marius', month: 2, day: 3, year: 1994, relation: 'jobb', reminderDays: 1, saveTo: 'google' });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.warning, undefined);
  const post = calls.findLast((x) => x.method === 'POST' && /\/events$/.test(x.url.pathname));
  const ev = JSON.parse(post.body);
  assert.deepEqual(ev.recurrence, ['RRULE:FREQ=YEARLY']);
  assert.deepEqual(ev.start, { date: '1994-02-03' });
  assert.deepEqual(ev.end, { date: '1994-02-04' });
  assert.equal(ev.extendedProperties.private.homelab_id, String(r.body.item.id));
  assert.equal(ev.extendedProperties.private.birth_year, '1994');
  assert.equal(ev.summary, 'Marius – bursdag');
  assert.equal(r.body.item.source, 'google');
  const mid = r.body.item.id, gid = r.body.item.googleEventId;
  assert.ok(gid);

  // Inkrementell synk bruker syncToken; utløpt token (410) gir full synk.
  r = await A('/api/birthdays/google/sync', 'POST');
  assert.ok(calls.findLast((x) => x.method === 'GET' && /\/events$/.test(x.url.pathname)).url.searchParams.get('syncToken'));
  kv.set((await A('/api/me')).body.id, 'bd_google', { ...kv.get((await A('/api/me')).body.id, 'bd_google'), syncToken: 'gammel' });
  r = await A('/api/birthdays/google/sync', 'POST');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.items.filter((x) => x.name === 'Marius').length, 1);

  // Endring patches i Google; sletting sletter i Google også.
  await A(`/api/birthdays/${mid}`, 'PATCH', { name: 'Marius B' });
  assert.equal(JSON.parse(calls.findLast((x) => x.method === 'PATCH').body).summary, 'Marius B – bursdag');
  r = await A(`/api/birthdays/${mid}`, 'DELETE');
  assert.equal(r.status, 200);
  assert.ok(calls.some((x) => x.method === 'DELETE' && x.url.pathname.endsWith(`/events/${gid}`)));
  // Slettet i Google → borte her ved neste synk.
  store.get('ev1').status = 'cancelled'; store.get('ev1').seq = ++seq;
  r = await A('/api/birthdays/google/sync', 'POST');
  assert.ok(!r.body.items.some((x) => x.name === 'Henrik'));

  // Innstillinger og logg ut (tokenet trekkes tilbake, bursdagene beholdes som lokale).
  r = await A('/api/birthdays/google', 'PUT', { writeNew: false, contacts: true });
  assert.equal(r.body.google.writeNew, false);
  r = await A('/api/birthdays/google', 'DELETE');
  assert.equal(r.body.google.connected, false);
  assert.ok(calls.some((x) => x.url.href.startsWith('https://oauth2.googleapis.com/revoke')));
  assert.ok(r.body.items.some((x) => x.name === 'Ingrid' && x.source === 'local'));
  assert.equal(r.body.items.filter((x) => x.googleEventId).length, 0);

  // Test-knappen i Integrasjoner: invalid_grant = klienten er riktig.
  ia._setIntegrationsGoogleFetch(async () => json({ error: 'invalid_grant' }, 400));
  assert.equal((await A('/api/integrations/google/test', 'POST')).body.ok, true);
  ia._setIntegrationsGoogleFetch(async () => json({ error: 'invalid_client' }, 401));
  r = await A('/api/integrations/google/test', 'POST');
  assert.equal(r.body.ok, false);
  assert.equal((await A('/api/integrations')).body.find((x) => x.id === 'google').status, 'error', 'siste test feilet');
  bd._setGoogleFetch(null);
});

/* ---------------- 3. Home Assistant ---------------- */

test('HA: calendar.*, import uten duplikater, create_event med rrule, sletting via WebSocket, bare admin', async () => {
  const rest = [], ws = [];
  const events = [
    { uid: 'u1', summary: 'Kari – bursdag', description: 'Født 1958', start: { date: '2026-10-29' } },
    { uid: 'u2', summary: 'Rune bursdag', start: { date: '2026-11-02' } }, // finnes fra før (lokal)
    { uid: 'u1', summary: 'Kari – bursdag', start: { date: '2027-10-29' } }, // neste års forekomst
  ];
  bd._setHaTransport({
    rest: async (method, path, body) => {
      rest.push({ method, path, body });
      if (path === '/api/calendars') return { status: 200, json: [{ entity_id: 'calendar.bursdager', name: 'Bursdager' }, { entity_id: 'calendar.jobb', name: 'Jobb' }, { entity_id: 'todo.handle', name: 'x' }] };
      if (path.startsWith('/api/calendars/calendar.bursdager')) return { status: 200, json: events };
      if (path === '/api/services/calendar/create_event') return body.rrule === 'FREQ=YEARLY' ? { status: 200, json: [] } : { status: 400, json: null };
      return { status: 404, json: null };
    },
    ws: async (cmd) => { ws.push(cmd); return null; },
  });
  assert.equal((await B('/api/birthdays/ha/calendars')).status, 403);
  assert.equal((await B('/api/birthdays/ha', 'PUT', { entityId: 'calendar.bursdager' })).status, 403);
  let r = await A('/api/birthdays/ha/calendars');
  assert.deepEqual(r.body.items.map((x) => x.entityId), ['calendar.bursdager', 'calendar.jobb']);
  assert.equal((await A('/api/birthdays/ha', 'PUT', { entityId: 'sensor.x' })).status, 400);
  r = await A('/api/birthdays/ha', 'PUT', { entityId: 'calendar.bursdager', twoWay: true });
  assert.equal(r.body.ha.entityId, 'calendar.bursdager');
  assert.equal(r.body.ha.twoWay, true);
  r = await A('/api/birthdays/ha/import', 'POST');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.added, 1);
  const kari = r.body.items.filter((x) => x.name === 'Kari');
  assert.equal(kari.length, 1);
  assert.equal(kari[0].source, 'ha');
  assert.equal(kari[0].year, 1958);
  assert.equal(r.body.items.filter((x) => x.name === 'Rune').length, 1, 'Rune fantes allerede: ingen duplikat');
  r = await A('/api/birthdays/ha/import', 'POST');
  assert.equal(r.body.added, 0, 'ny import gir ingen duplikater');

  r = await A('/api/birthdays', 'POST', { name: 'Liv', month: 9, day: 2, year: 1972, relation: 'familie', saveTo: 'ha' });
  assert.equal(r.status, 201, r.text);
  const ce = rest.find((x) => x.path === '/api/services/calendar/create_event');
  assert.equal(ce.body.entity_id, 'calendar.bursdager');
  assert.equal(ce.body.rrule, 'FREQ=YEARLY');
  assert.equal(ce.body.summary, 'Liv – bursdag');
  assert.match(ce.body.start_date, /^\d{4}-09-02$/);

  r = await A(`/api/birthdays/${kari[0].id}`, 'DELETE');
  assert.equal(r.status, 200);
  assert.deepEqual(ws.at(-1), { type: 'calendar/event/delete', entity_id: 'calendar.bursdager', uid: 'u1' });
  bd._setHaTransport(null);
});

test('påminnelser: kl. 09 sendes bare når kategorien «birthdays» er på', async () => {
  const me = (await A('/api/me')).body.id;
  const n = await A('/api/me/notify');
  assert.equal(n.body.groups.birthdays, true);
  assert.ok(n.body.groupList.some((g) => g.id === 'birthdays' && g.label === 'Bursdager'));
  const today = bd.osloDate();
  const [, m, d] = today.split('-').map(Number);
  await B('/api/me/notify', 'PUT', { groups: { birthdays: false } }); // Olas Henrik (19.10) kan også være på tur
  await A('/api/birthdays', 'POST', { name: 'Idag', month: m, day: d, relation: 'venn', reminderDays: 0 });
  const nine = new Date(`${today}T09:30:00+02:00`).getTime();
  const at9 = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', hourCycle: 'h23' }).format(new Date(nine))) === 9 ? nine : new Date(`${today}T09:30:00+01:00`).getTime();
  assert.ok(bd.dueReminders(me, at9).some((x) => x.name === 'Idag'));
  await A('/api/me/notify', 'PUT', { groups: { birthdays: false } });
  assert.equal(bd._reminderTick(at9), 0);
  await A('/api/me/notify', 'PUT', { groups: { birthdays: true } });
  assert.ok(bd._reminderTick(at9) >= 1);
  assert.equal(bd._reminderTick(at9), 0, 'sendes bare én gang');
  assert.equal(bd._reminderTick(at9 - 3 * 3600_000), 0, 'bare kl. 09');
  assert.ok((await A('/api/birthdays/reminders')).body.items.length >= 1);
});

/* ---------------- 4. Familie: én person, flere enheter ---------------- */

test('familie: én post per person, kilde = mest nøyaktige siste 5 min, manuell kilde, helse uten dobbeltelling', async () => {
  await A('/api/family/me', 'PUT', { sharing: 'on' });
  const now = Date.now();
  await TA('/api/family/location', 'POST', { lat: 59.91, lon: 10.75, acc: 40, battery: 82, ts: now - 60_000, device: 'iPhone 15 Pro · iOS 18.1', deviceId: 'ios-1', platform: 'ios' });
  await TA('/api/family/location', 'POST', { lat: 59.95, lon: 10.70, acc: 8, battery: 54, ts: now - 120_000, device: 'Galaxy S24', deviceId: 'and-1', platform: 'android' });
  await TA('/api/family/location', 'POST', { points: [{ lat: 59.80, lon: 10.60, acc: 3, battery: 99, ts: now - 20 * 60_000 }], device: 'iPad', deviceId: 'ipad-1', platform: 'ipados' });
  let r = await A('/api/family');
  const me = r.body.members.filter((x) => x.self);
  assert.equal(me.length, 1, 'én oppføring per person');
  assert.equal(me[0].deviceCount, 3);
  assert.equal(me[0].sourceDevice, 'and-1', 'lavest accuracy innen 5 min (iPad er eldre)');
  assert.equal(me[0].last.battery, 54, 'batteri fra kildeenheten');
  assert.equal(me[0].last.lat, 59.95);
  const dev = me[0].devices.find((x) => x.id === 'ios-1');
  assert.deepEqual(Object.keys(dev).sort(), ['accuracy', 'battery', 'id', 'isSource', 'lastSeen', 'name', 'platform'].sort());
  assert.equal(dev.name, 'iPhone 15 Pro');
  assert.equal(dev.platform, 'ios');
  assert.equal(me[0].devices.filter((x) => x.isSource).length, 1);

  r = await A('/api/family/positions');
  const row = r.body.find((x) => x.self);
  assert.equal(r.body.filter((x) => x.self).length, 1);
  assert.equal(row.deviceCount, 3);
  assert.equal(row.enheter, '3 enheter');
  assert.equal(row.sourceDevice, 'and-1');

  assert.equal((await A('/api/family/me/source', 'PUT', { deviceId: 'finnes-ikke' })).status, 400);
  r = await TA('/api/family/me/source', 'PUT', { deviceId: 'ipad-1' });
  assert.equal(r.status, 200);
  assert.equal(r.body.sourceDevice, 'ipad-1');
  assert.equal((await A('/api/family')).body.members.find((x) => x.self).last.battery, 99);
  r = await A('/api/family/me/source', 'PUT', { deviceId: null });
  assert.equal(r.body.sourceMode, 'auto');
  assert.equal(r.body.sourceDevice, 'and-1');

  // Sporet kommer fra kildeenheten.
  const tr = await A(`/api/family/track/${(await A('/api/me')).body.id}`);
  assert.ok(tr.body.points.every((p) => p.lat === 59.95));

  // Helse fra to enheter samme dag: høyeste verdi, ikke summen.
  await A('/api/family/me', 'PUT', { shareHealth: { steps: true, sleep: true } });
  const date = new Date().toISOString().slice(0, 10);
  await A('/api/family/health', 'POST', { date, steps: 8000, sleepMin: 400 });
  r = await A('/api/family/health', 'POST', { date, steps: 6500, sleepMin: 420 });
  assert.equal(r.body.health.today.steps, 8000);
  assert.equal(r.body.health.today.sleepMin, 420);
});

/* ---------------- 5. Integrasjoner ---------------- */

test('integrasjoner: alle oppsett, hemmeligheter sendes aldri ut, lagres kryptert, bare admin', async () => {
  assert.equal((await B('/api/integrations')).status, 403);
  assert.equal((await TB('/api/integrations')).status, 403);
  assert.equal((await anon('/api/integrations')).status, 401);
  let r = await TA('/api/integrations');
  assert.equal(r.status, 200);
  const ids = r.body.map((x) => x.id);
  for (const id of ['ha', 'google', 'ai', 't212', 'bank', 'imap', 'entur', 'mybring', 'postnord', 'parcelsapp', 'cloudflare', 'finn', 'met', 'map', 'icons', 'photos']) assert.ok(ids.includes(id), id);
  for (const x of r.body) {
    assert.ok(['ok', 'missing', 'error'].includes(x.status));
    assert.equal(typeof x.canTest, 'boolean');
    for (const f of x.fields) { assert.ok(['text', 'secret', 'url'].includes(f.type), f.key); assert.equal(typeof f.saved, 'boolean'); if (f.type === 'secret') assert.equal(f.value, null); }
  }
  assert.equal(r.body.find((x) => x.id === 'mybring').status, 'missing');

  r = await TA('/api/integrations/mybring', 'PUT', { mybringUid: 'meg@example.no', mybringKey: 'bring-hemmelig-123' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.status, 'ok');
  assert.equal(r.body.fields.find((f) => f.key === 'mybringUid').value, 'meg@example.no');
  assert.ok(!JSON.stringify(r.body).includes('bring-hemmelig'));
  assert.equal(cfg('mybringKey'), 'bring-hemmelig-123', 'samme lagringsnøkkel som Sporing bruker');
  assert.match(kv.get('owner', 'cfg').mybringKey, /^enc1:/, 'kryptert');
  assert.ok(!JSON.stringify((await A('/api/integrations')).body).includes('bring-hemmelig'));

  // FinansHub-hemmeligheter (AI, IMAP) og Trading 212 i begge lagringene.
  r = await A('/api/integrations/ai', 'PUT', { groqKey: 'gsk_hemmelig', ollamaUrl: 'http://10.0.0.5:11434' });
  assert.equal(r.status, 200, r.text);
  assert.equal(secret('groqKey'), 'gsk_hemmelig');
  assert.equal(r.body.fields.find((f) => f.key === 'ollamaUrl').value, 'http://10.0.0.5:11434');
  assert.equal((await A('/api/integrations/ai', 'PUT', { ollamaUrl: 'ikke en url' })).status, 400);
  r = await A('/api/integrations/t212', 'PUT', { t212Key: 'KEY123', t212Secret: 'SEC456', t212Env: 'demo' });
  assert.equal(r.status, 200, r.text);
  assert.equal(secret('t212Key'), 'KEY123');
  assert.equal(cfg('t212_key'), 'KEY123');
  assert.equal(cfg('t212_env'), 'demo');
  assert.equal((await A('/api/integrations/t212', 'PUT', { t212Env: 'test' })).status, 400);
  assert.equal((await A('/api/integrations/bank', 'PUT', { csvProfile: 'Nordea' })).body.fields[0].value, 'Nordea');
  assert.equal((await A('/api/integrations/bank', 'PUT', { csvProfile: 'Ukjent bank' })).status, 400);
  assert.equal((await A('/api/integrations/mybring', 'PUT', { ukjent: 'x' })).status, 400);
  assert.equal((await A('/api/integrations/finnes-ikke', 'PUT', {})).status, 404);
  // Tom hemmelighet = behold.
  await A('/api/integrations/mybring', 'PUT', { mybringKey: '' });
  assert.equal(cfg('mybringKey'), 'bring-hemmelig-123');

  r = await A('/api/integrations/mybring/mybringKey', 'DELETE');
  assert.equal(r.status, 200);
  assert.equal(r.body.fields.find((f) => f.key === 'mybringKey').saved, false);
  assert.equal(r.body.status, 'missing');
  assert.equal((await B('/api/integrations/mybring/mybringUid', 'DELETE')).status, 403);
  r = await A('/api/integrations/bank/test', 'POST');
  assert.equal(r.status, 400, 'bank har ingen test');
});

/* ---------------- 6. Profiler ---------------- */

test('profiler: ferdige oppsett, egendefinert ved endring, appnavn maks 20 tegn, sidemenyen på desktop beholdes', async () => {
  let r = await A('/api/me/profiles');
  assert.deepEqual(r.body.standard, { startRoute: 'hjem', homeNav: ['hjem', 'finans', 'mat', 'mer'], finNav: ['oversikt', 'liste', 'finn', 'sok'] });
  assert.deepEqual(r.body.finans_boliger, { startRoute: 'finans/boliger', homeNav: ['finans'], finNav: ['boliger', 'sok', 'liste', 'oversikt', 'kvitteringer'] });
  assert.ok(r.body.boliger.finNav[0] === 'boliger');
  r = await A('/api/me/layout');
  assert.equal(r.body.profile, 'standard');
  assert.deepEqual(r.body.finNav, ['oversikt', 'liste', 'finn', 'sok']);

  // Sidemenyen på desktop (finNav-objekt) virker som før og overskrives ikke av profilen.
  assert.equal((await A('/api/me/layout', 'PUT', { finNav: { order: ['oversikt', 'liste'], hidden: ['budsjett'] } })).status, 200);
  r = await TA('/api/me/layout', 'PUT', { profile: 'finans_boliger' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.profile, 'finans_boliger');
  assert.equal(r.body.startRoute, 'finans/boliger');
  assert.deepEqual(r.body.homeNav, ['finans']);
  assert.deepEqual(r.body.finNav, ['boliger', 'sok', 'liste', 'oversikt', 'kvitteringer']);
  r = await A('/api/me/layout');
  assert.deepEqual(r.body.finSideNav.order, ['oversikt', 'liste']);
  assert.deepEqual((await B('/api/me/layout')).body.profile, 'standard', 'per bruker');

  r = await A('/api/me/layout', 'PUT', { finNav: ['boliger', 'sok'] });
  assert.equal(r.body.profile, 'custom');
  r = await A('/api/me/layout', 'PUT', { profile: 'standard' });
  assert.equal(r.body.profile, 'standard');
  assert.deepEqual(r.body.finNav, ['oversikt', 'liste', 'finn', 'sok']);
  for (const bad of [{ profile: 'x' }, { finNav: ['ukjent'] }, { homeNav: ['hjem', 'hjem'] }, { startRoute: 'Hjem side' }, { appName: 'x'.repeat(21) }, { appName: '' }]) assert.equal((await A('/api/me/layout', 'PUT', bad)).status, 400, JSON.stringify(bad));
  r = await A('/api/me/layout', 'PUT', { appName: '  Torskenes  Verden ', appIcon: 'bokstav' });
  assert.equal(r.body.appName, 'Torskenes Verden');
  assert.equal((await A('/api/me/layout')).body.appIcon, 'bokstav');
});

/* ---------------- 7. Boliger: bakgrunn ---------------- */

test('boliger: bakgrunn farge/Strømstad/opplasting, Strømstad som standard, tilgang følger medlemskap', async () => {
  let r = await A('/finans/api/folders', 'POST', { name: 'Leiligheten', type: 'Leilighet', address: 'Storgata 1, Strømstad' });
  assert.equal(r.status, 200, r.text);
  const id = r.body.id;
  assert.equal(r.body.background, 'preset:stromstad');
  assert.equal(r.body.backgroundUrl, '/assets/boliger/stromstad.webp');
  r = await A('/finans/api/folders', 'POST', { name: 'Hytta', type: 'Hytte' });
  const hytta = r.body.id;
  assert.equal(r.body.background, 'color');
  assert.equal(r.body.backgroundUrl, null);
  assert.ok((await A('/finans/api/folders')).body.every((f) => 'background' in f && 'backgroundUrl' in f));

  r = await A(`/finans/api/folders/${hytta}`, 'PATCH', { background: 'preset:stromstad', name: 'Hytta 2', budget: 2000 });
  assert.equal(r.body.background, 'preset:stromstad');
  assert.equal(r.body.name, 'Hytta 2');
  assert.equal((await A(`/finans/api/folders/${hytta}`, 'PATCH', { background: 'preset:paris' })).status, 400);
  assert.equal((await A(`/finans/api/folders/${hytta}`, 'PATCH', { background: 'upload:abcdef123456' })).status, 400, 'må være lastet opp');
  assert.equal((await A(`/finans/api/folders/${id}`, 'PATCH', { background: 'color' })).body.background, 'color');

  // Opplasting (base64 og multipart). Andre brukere (ikke medlem) får 404.
  const png = readFileSync(join(process.cwd(), 'public', 'boliger', 'stromstad.jpg'));
  assert.equal((await B(`/finans/api/folders/${id}/bg`, 'PUT', { image: png.toString('base64') })).status, 404);
  r = await A(`/finans/api/folders/${id}/bg`, 'PUT', { image: `data:image/jpeg;base64,${png.toString('base64')}` });
  assert.equal(r.status, 200, r.text);
  assert.match(r.body.background, /^upload:[a-f0-9]+$/);
  assert.ok(existsSync(join(process.env.DATA_DIR, 'boliger', String(id), 'bg.jpg')));
  const url = r.body.backgroundUrl;
  r = await A(url);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/jpeg');
  assert.equal((await B(url)).status, 404);
  const fd = new FormData();
  fd.append('file', new File([png], 'bg.jpg', { type: 'image/jpeg' }));
  r = await TA(`/finans/api/folders/${id}/bg`, 'PUT', fd);
  assert.equal(r.status, 200, r.text);
  assert.equal((await A(`/finans/api/folders/${id}`, 'PATCH', { background: r.body.background })).body.background, r.body.background);
  assert.equal((await A(`/finans/api/folders/${id}/bg`, 'PUT', { image: Buffer.from('ikke et bilde').toString('base64') })).status, 400);
});

/* ---------------- 8. Domene-pillen og ✦ AI-søk ---------------- */

test('domene-pillen: {visitsToday, domains, status}, bare admin', async () => {
  const r = await TA('/api/domains/summary');
  assert.equal(r.status, 200, r.text);
  assert.equal(typeof r.body.visitsToday, 'number');
  assert.equal(typeof r.body.domains, 'number');
  assert.ok(['ok', 'warn', 'error'].includes(r.body.status));
  assert.equal((await B('/api/domains/summary')).status, 403);
  assert.equal((await anon('/api/domains/summary')).status, 401);
  assert.equal((await A('/api/domener/sammendrag')).status, 200);
});

test('AI-søk i innstillinger: AI velger id-er fra listen, tekstmatch uten AI', async () => {
  const items = [{ id: 'app-ikon', title: 'App-ikon', path: 'Innstillinger · Homelab' }, { id: 'tema', title: 'Mørkt tema', path: 'Innstillinger · Utseende' }, { id: 'mybring', title: 'Mybring-nøkkel', path: 'Integrasjoner · Mybring' }];
  assert.equal((await B('/api/settings/ai-search', 'POST', { q: '', items })).status, 400);
  ia._setSettingsAi(async () => { throw new Error('ingen motor'); });
  let r = await TB('/api/settings/ai-search', 'POST', { q: 'hvor bytter jeg ikon?', items });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.mode, 'text');
  assert.equal(r.body.ids[0], 'app-ikon');
  assert.ok(r.body.answer.includes('App-ikon'));
  assert.equal((await B('/api/settings/ai-search', 'POST', { q: 'bring-nøkkel', items })).body.ids[0], 'mybring');
  ia._setSettingsAi(async (prompt) => { assert.match(prompt, /mørkt tema/i); return { provider: 'Test', data: { answer: 'Mørkt tema ligger under Utseende.', ids: ['tema', 'finnes-ikke'] } }; });
  r = await B('/api/settings/ai-search', 'POST', { q: 'mørkt tema', items });
  assert.equal(r.body.mode, 'ai');
  assert.deepEqual(r.body.ids, ['tema'], 'ukjente id-er fjernes');
  assert.equal(r.body.answer, 'Mørkt tema ligger under Utseende.');
  ia._setSettingsAi(null);
});

test('«Test tilkobling» på web (POST /api/config/test/google) bruker Google-testen, ikke «Ukjent integrasjon»', async () => {
  await A('/api/integrations/google', 'PUT', { googleClientId: 'abc.apps.googleusercontent.com', googleClientSecret: 'hemmelig-klient' });
  ia._setIntegrationsGoogleFetch(async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400, headers: { 'content-type': 'application/json' } }));
  for (const key of ['google', 'Google Kalender']) {
    const r = await A(`/api/config/test/${encodeURIComponent(key)}`, 'POST');
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.ok, true);
    assert.match(r.body.message, /godtok klienten/);
  }
  ia._setIntegrationsGoogleFetch(async () => new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401, headers: { 'content-type': 'application/json' } }));
  const bad = await A('/api/config/test/google', 'POST');
  assert.equal(bad.body.ok, false);
  assert.equal((await A('/api/config/test/finnes-ikke', 'POST')).status, 404);
});
