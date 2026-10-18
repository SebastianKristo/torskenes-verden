// ISO2 (ISO-INT): alt individuelt utenom Boliger. To administratorer (sebastian = eieren, rune) og én vanlig bruker (kari).
// Ingen ser de andres integrasjoner, sporing, Mat eller Home OS, og Sebastians gamle data er uendret etter migreringen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-iso2-int-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
process.env.NODE_ENV = 'test';
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
delete process.env.MOCK_DATA;
for (const k of ['PLEX_TOKEN', 'PLEX_URL', 'SCHOOL_ICAL_URL', 'TRADING212_API_KEY', 'IMAP_HOST']) delete process.env[k];

// En database fra før ISO2: felles tabeller uten user_id, og eierens verdier i det felles oppsettet.
{
  const old = new Database(join(process.env.DATA_DIR, 'homelab.db'));
  old.exec(`CREATE TABLE kv (user TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (user, key));
  CREATE TABLE hl_shipments (id INTEGER PRIMARY KEY AUTOINCREMENT, tracking_no TEXT NOT NULL UNIQUE, carrier TEXT NOT NULL DEFAULT 'other', name TEXT NOT NULL DEFAULT '',
    shop TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manual', source_ref TEXT, source_note TEXT NOT NULL DEFAULT '', direction TEXT NOT NULL DEFAULT 'in',
    status TEXT NOT NULL DEFAULT 'registered', eta TEXT, pickup_point TEXT, archived INTEGER NOT NULL DEFAULT 0, last_error TEXT, checked_at INTEGER, updated_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE hl_shipment_events (id INTEGER PRIMARY KEY AUTOINCREMENT, shipment_id INTEGER NOT NULL REFERENCES hl_shipments(id) ON DELETE CASCADE, ts INTEGER NOT NULL, status TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '', raw TEXT, UNIQUE(shipment_id, ts, status));
  CREATE TABLE matplan_fixed (weekday INTEGER PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6), dish_id TEXT NOT NULL, cook_id TEXT);`);
  const now = Date.now();
  old.prepare("INSERT INTO hl_shipments(id,tracking_no,carrier,name,status,updated_at,created_at) VALUES(7,'CV700000001NO','posten','Sebastians gamle pakke','in_transit',?,?)").run(now, now);
  old.prepare("INSERT INTO hl_shipment_events(shipment_id,ts,status,location) VALUES(7,?,'Ankommet terminal','Oslo')").run(now);
  old.prepare("INSERT INTO matplan_fixed(weekday,dish_id,cook_id) VALUES(4,'taco1','Sebastian')").run();
  const kvSet = old.prepare('INSERT INTO kv(user,key,value) VALUES(?,?,?)');
  kvSet.run('owner', 'cfg', JSON.stringify({ plex_url: 'http://10.9.9.9:32400', plex_token: 'SEB-PLEX-TOKEN', cal_ics: 'https://skole.example/seb.ics', ha_url: 'http://10.1.1.1:8123', trk_bring_uid: 'seb@example.no' }));
  kvSet.run('owner', 'home_property', JSON.stringify({ value: 4000000, valueDate: '2026-01', loan: 1, bank: 'SebBank', rate: 4, payment: 1, costs: [] }));
  kvSet.run('owner', 'home_inventory', JSON.stringify([{ id: 'x1', name: 'Sebastians TV', room: 'Stue' }]));
  kvSet.run('owner', 'mat', JSON.stringify({ v: 2, dishes: [{ id: 'taco1', name: 'Sebastians taco', src: 'own', ing: [], steps: [], cost: 100 }], cooks: [{ name: 'Sebastian', best: [] }], plan: {}, fixed: {}, auto: false, lastAuto: '', shop: {}, fixedDb: true, foldersInit: true, calKey: 'sebastian-kalender-nokkel-123' }));
  old.close();
}

const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: app } = await import('../server/index.js');
const { db, kv, OWNER } = await import('../server/db.js');
const settings = await import('../server/settings.js');

async function login(username, password) {
  const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
const client = (cookie) => async (path, method = 'GET', body) => {
  const r = await app.request(path, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: json, text };
};
const S = client(await login('sebastian', 'testpassord1'));
for (const [username, role] of [['rune', 'admin'], ['kari', 'bruker']]) assert.equal((await S('/api/users', 'POST', { username, password: `${username}Passord123`, role, name: username })).status, 200);
const R = client(await login('rune', 'runePassord123'));
const K = client(await login('kari', 'kariPassord123'));
const runeId = (await R('/api/me')).body.id, kariId = (await K('/api/me')).body.id;

test('migrering: Sebastians gamle data er uendret og hans egne', async () => {
  // Sporing: samme id, samme hendelse, nå med user_id = OWNER og UNIQUE(user_id, tracking_no).
  const s = db.prepare('SELECT * FROM hl_shipments WHERE id=7').get();
  assert.equal(s.user_id, OWNER);
  assert.equal(s.name, 'Sebastians gamle pakke');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM hl_shipment_events WHERE shipment_id=7').get().n, 1);
  assert.match(db.prepare("SELECT sql FROM sqlite_master WHERE name='hl_shipments'").get().sql, /UNIQUE\(user_id, tracking_no\)/);
  // Mat: faste retter flyttet til (user_id, weekday).
  assert.deepEqual(db.prepare('SELECT user_id, weekday, dish_id FROM matplan_fixed').all(), [{ user_id: OWNER, weekday: 4, dish_id: 'taco1' }]);
  // Oppsett: det gamle felles oppsettet er urørt, og verdiene er kopiert til eierens personlige.
  assert.equal(kv.get(OWNER, 'cfg').plex_token, 'SEB-PLEX-TOKEN');
  assert.equal(settings.userCfg(OWNER, 'plex_token'), 'SEB-PLEX-TOKEN');
  assert.equal(settings.userCfg(OWNER, 'mybringUid'), 'seb@example.no', 'gammelt nøkkelnavn');
  assert.equal(settings.userCfg(runeId, 'plex_token'), '');
  const items = (await S('/api/tracking')).body.items;
  assert.ok(items.some((x) => x.trackingNo === 'CV700000001NO'));
  assert.equal((await S('/home/api/property')).body.bank, 'SebBank');
  assert.ok((await S('/mat/api/week')).text.includes('Sebastians taco'));
});

test('/api/config: egne personlige grupper for alle, servergrupper bare for admin, ingen ser andres verdier', async () => {
  const s = (await S('/api/config')).body, r = (await R('/api/config')).body, k = (await K('/api/config')).body;
  for (const g of [...s, ...r, ...k]) assert.ok(['personal', 'server'].includes(g.scope), g.name);
  assert.ok(s.some((g) => g.scope === 'server') && r.some((g) => g.scope === 'server'));
  assert.ok(k.every((g) => g.scope === 'personal'));
  const plex = (list) => list.find((g) => g.id === 'plex').fields.find((f) => f.key === 'plex_url');
  assert.equal(plex(s).value, 'http://10.9.9.9:32400');
  assert.equal(plex(r).value, '', 'Rune ser ikke Sebastians Plex');
  assert.equal(plex(k).value, '');
  for (const list of [r, k]) assert.ok(!JSON.stringify(list).includes('10.9.9.9') && !JSON.stringify(list).includes('seb@example.no'));
  // Rune setter opp sin egen Plex; Sebastians er uendret.
  assert.equal((await R('/api/config', 'PUT', { plex_url: 'http://10.2.2.2:32400', plex_token: 'RUNE-TOKEN' })).status, 200);
  assert.equal(plex((await R('/api/config')).body).value, 'http://10.2.2.2:32400');
  assert.equal(plex((await S('/api/config')).body).value, 'http://10.9.9.9:32400');
  assert.equal(settings.userCfg(runeId, 'plex_token'), 'RUNE-TOKEN');
  assert.match(kv.get(runeId, 'cfg_personal').plex_token, /^enc1:/, 'kryptert');
  // Kari kan endre sine egne, men ikke serveroppsett.
  assert.equal((await K('/api/config', 'PUT', { cal_ics: 'https://skole.example/kari.ics' })).status, 200);
  assert.equal((await K('/api/config', 'PUT', { ha_url: 'http://x:1' })).status, 403);
  assert.equal(settings.cfg('ha_url'), 'http://10.1.1.1:8123');
  assert.equal(settings.userCfg(OWNER, 'cal_ics'), 'https://skole.example/seb.ics');
  // Test av en personlig gruppe er lov for alle, en servergruppe bare for admin.
  assert.equal((await K('/api/config/test/Kalender%20%2F%20timeplan', 'POST')).status, 200);
  assert.equal((await K('/api/config/test/Home%20Assistant', 'POST')).status, 403);
  assert.equal((await K('/api/state')).body.schoolUrl, '');
});

test('/api/integrations: scope per integrasjon, egne verdier, servergrupper bare for admin', async () => {
  const k = (await K('/api/integrations')).body, r = (await R('/api/integrations')).body;
  assert.ok(k.every((x) => x.scope === 'personal'));
  for (const id of ['plex', 'jellyfin', 'calendar', 't212', 'imap', 'mybring', 'postnord', 'parcelsapp']) assert.ok(k.some((x) => x.id === id), id);
  assert.ok(r.some((x) => x.id === 'ai' && x.scope === 'server'));
  assert.equal((await K('/api/integrations/ai')).status, 403);
  assert.equal((await K('/api/integrations/t212', 'PUT', { t212Key: 'KARI-KEY', t212Secret: 'KARI-SEC' })).status, 200);
  assert.equal(settings.userCfg(kariId, 't212_key'), 'KARI-KEY');
  assert.equal(settings.userCfg(OWNER, 't212_key'), '', 'eierens Trading 212 er uendret');
  assert.equal(kv.get(OWNER, 'fh_secret', {}).t212Key, undefined, 'andres nøkler speiles aldri til eierens FinansHub');
  const plexR = r.find((x) => x.id === 'plex');
  assert.equal(plexR.fields.find((f) => f.key === 'plex_url').value, 'http://10.2.2.2:32400');
  assert.equal(plexR.fields.find((f) => f.key === 'plex_token').value, null, 'hemmelig');
  // IMAP-test uten eget passord kjøres ikke (eierens passord brukes aldri for andre).
  await K('/api/integrations/imap', 'PUT', { imapHost: 'mail.kari.example', imapUser: 'kari' });
  const t = await K('/api/integrations/imap/test', 'POST');
  assert.equal(t.body.ok, false);
  assert.match(t.body.message, /passord/);
});

test('media, skole, trading og upcoming: egne integrasjoner; uten oppsett configured:false', async () => {
  // Kari har Trading 212 (forrige test) og Rune har Plex, så hver sjekkes mot den som ikke har satt opp noe.
  for (const [p, who] of [['/api/trading', R], ['/api/media/now', K], ['/api/media/recent', K], ['/api/media/history', K], ['/api/upcoming', K], ['/api/upcoming', R]]) {
    const r = await who(p);
    assert.equal(r.status, 200, p);
    assert.equal(r.body.configured, false, p);
    assert.ok(!('restricted' in r.body), p);
  }
  // Kari har sin egen iCal; den hentes (her: mislykkes uten nett), ikke Sebastians.
  const orig = globalThis.fetch, seen = [];
  globalThis.fetch = async (u) => { seen.push(String(u)); return new Response('BEGIN:VCALENDAR\nEND:VCALENDAR', { status: 200 }); };
  try {
    const r = await K('/api/school');
    assert.equal(r.status, 200);
    assert.equal(r.body.configured, true);
    const s = await S('/api/school');
    assert.equal(s.body.configured, true);
    assert.equal((await R('/api/school')).body.configured, false);
  } finally { globalThis.fetch = orig; }
  assert.ok(seen.includes('https://skole.example/kari.ics') && seen.includes('https://skole.example/seb.ics'));
  assert.equal(seen.filter((u) => u.includes('seb.ics')).length, 1, 'cachen er per bruker');
  assert.equal((await K('/api/media/poster?src=plex&id=/library/metadata/1/thumb')).status, 404);
});

test('sporing: per bruker, samme nummer kan spores av flere, ingen ser eller endrer andres', async () => {
  const k = await K('/api/tracking', 'POST', { trackingNo: 'CV700000001NO', name: 'Karis pakke' });
  assert.equal(k.status, 200, k.text);
  const kid = k.body.item.id;
  assert.notEqual(kid, 7);
  const kList = (await K('/api/tracking')).body.items;
  assert.deepEqual(kList.map((x) => x.name), ['Karis pakke']);
  assert.ok(!(await R('/api/tracking')).body.items.length, 'Rune ser ingenting');
  assert.equal((await K('/api/tracking/7', 'PATCH', { name: 'hacket' })).status, 404);
  await K('/api/tracking/7', 'DELETE');
  await K('/api/tracking/bulk', 'POST', { ids: [7], action: 'delete' });
  assert.equal(db.prepare('SELECT name FROM hl_shipments WHERE id=7').get().name, 'Sebastians gamle pakke');
  await K('/api/tracking/prefs', 'PUT', { delivered: false });
  assert.equal((await S('/api/tracking')).body.prefs.delivered, true, 'varselvalg per bruker');
  await K('/api/tracking/sources', 'PUT', { email: false });
  assert.equal((await S('/api/tracking')).body.sources.email.on, true, 'kilder per bruker');
  const home = await K('/api/mobile/home');
  assert.deepEqual(home.body.packages.map((p) => p.id), [kid]);
  assert.ok((await S('/api/mobile/home')).body.packages.every((p) => p.id !== kid));
  assert.equal(db.prepare('SELECT user_id FROM hl_shipments WHERE id=?').get(kid).user_id, kariId);
});

test('Mat og Home OS: hver sin', async () => {
  const k = await K('/mat/api/week');
  assert.equal(k.status, 200);
  assert.ok(!k.text.includes('Sebastians taco'));
  assert.equal((await K('/mat/api/meals', 'POST', { name: 'Karis lasagne' })).status < 300, true);
  assert.ok(!(await S('/mat/api/week')).text.includes('Karis lasagne'));
  assert.ok(!(await R('/mat/api/week')).text.includes('Karis lasagne'));
  const fk = (await K('/mat/api/folders')).body, fs = (await S('/mat/api/folders')).body;
  assert.ok(fk.length && fk.every((f) => !fs.some((x) => x.id === f.id)), 'egne mapper');
  // Kalenderfeeden følger nøkkelen.
  const ics = await app.request('/mat/calendar.ics?key=sebastian-kalender-nokkel-123');
  assert.equal(ics.status, 200);
  assert.equal((await app.request('/mat/calendar.ics?key=feil-nokkel-1234567890')).status, 403);
  // Home OS
  assert.equal((await K('/home/api/property')).body.bank, '');
  assert.deepEqual((await K('/home/api/inventory')).body, []);
  await K('/home/api/property', 'PUT', { bank: 'KariBank' });
  assert.equal((await S('/home/api/property')).body.bank, 'SebBank');
  assert.equal((await K('/home/api/property')).body.bank, 'KariBank');
  assert.equal(kv.get(OWNER, 'home_inventory')[0].name, 'Sebastians TV');
});

test('Boliger kan fortsatt deles', async () => {
  const f = await S('/finans/api/folders', 'POST', { name: 'Hytta' });
  assert.ok(f.status < 300, f.text);
  const id = f.body.id ?? f.body.folder?.id;
  assert.ok((await S(`/finans/api/folders/${id}/members`, 'POST', { userId: runeId, role: 'viewer' })).status < 300);
  const shared = (await R('/finans/api/folders')).body;
  assert.ok(Array.isArray(shared) && shared.some((x) => x.id === id), 'Rune ser den delte boligen');
  assert.ok(!(await K('/finans/api/folders')).body.some?.((x) => x.id === id), 'Kari ser den ikke');
});
