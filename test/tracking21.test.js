// Prompt 21: pakker med logo (butikk → fraktselskap → bokstav), tittel uten sporingsnummer, moreCount, shop_domain
// fra e-postavsender og Finn, og egne logovalg (POST /finans/api/logos/override).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hl-trk21-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.USER_NAME = 'Sebastian';
// Logomappe uten de manuelt kontrollerte fraktlogoene (files/manuell), så testen ikke avhenger av hva
// workflowen «Logoer» har lastet ned.
process.env.LOGO_FILES_DIR = mkdtempSync(join(tmpdir(), 'hl-trk21-logos-'));
cpSync(new URL('../server/logos/files', import.meta.url), process.env.LOGO_FILES_DIR, { recursive: true, filter: (src) => !/[\\/]manuell([\\/]|$)/.test(src) });
delete process.env.MOCK_DATA;
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { db } = await import('../server/db.js');
const { default: fin } = await import('../server/finans/routes.js');
const trk = await import('../server/tracking.js');
const { matchMerchant } = await import('../server/logos/match.js');

const { token } = await (await fin.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) })).json();
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const list = async () => (await (await trk.default.request('/', { headers: H })).json()).items;
const byNo = async (no) => (await list()).find((x) => x.trackingNo === no);

test('kolonnen shop_domain finnes (idempotent migrasjon)', () => {
  assert.ok(db.prepare('PRAGMA table_info(hl_shipments)').all().some((c) => c.name === 'shop_domain'));
});

test('Bring uten butikk: Bring-logo og «Pakke fra Bring»', async () => {
  trk.upsertShipment({ trackingNo: '70712345678901234', carrier: 'bring', source: 'manual' });
  const s = await byNo('70712345678901234');
  assert.equal(s.title, 'Pakke fra Bring');
  assert.equal(s.name, 'Pakke fra Bring');
  assert.ok(!s.title.includes('1234'));
  assert.equal(s.logo.kind, 'carrier');
  assert.equal(s.logo.domain, 'bring.no');
  assert.equal(s.logo.id, 'bring');
  // Prompt 22: Bring har manuelt kontrollert logo. Uten den kontrollerte filen (files/manuell/bring.png) gis ingen URL: fargefyll med navn.
  assert.equal(s.logo.url, null);
  assert.equal(s.logo.label, 'Bring');
  assert.equal(s.logo.carrierLogo, null);
  // Eldre autogenerert navn («Bring · 1234») regnes som tomt.
  db.prepare("UPDATE hl_shipments SET name='Bring · 1234' WHERE tracking_no='70712345678901234'").run();
  assert.equal((await byNo('70712345678901234')).title, 'Pakke fra Bring');
});

test('Komplett via PostNord: Komplett-logo med PostNord-merkelapp, tittel «Komplett · skjerm»', async () => {
  trk.upsertShipment({ trackingNo: '00370726201234567890', name: 'Komplett · skjerm', shop: 'Komplett', source: 'email' });
  const s = await byNo('00370726201234567890');
  assert.equal(s.title, 'Komplett · skjerm');
  assert.equal(s.shopDomain, 'komplett.no');
  assert.equal(s.logo.kind, 'shop');
  assert.equal(s.logo.id, 'komplett');
  assert.equal(s.logo.carrierLogo.id, 'postnord');
  assert.equal(s.logo.carrierLogo.domain, 'postnord.no');
  assert.equal(s.logo.carrierLogo.letter, 'PN');
});

test('ukjent fraktselskap og ingen butikk: bokstav-reserve', async () => {
  trk.upsertShipment({ trackingNo: 'XQ99887766', carrier: 'other', source: 'manual' });
  const s = await byNo('XQ99887766');
  assert.equal(s.logo.kind, 'letter');
  assert.equal(s.logo.url, null);
  assert.ok(s.logo.letter && s.logo.color);
  assert.equal(s.title, 'Pakke');
});

test('butikk og domene fra e-postavsender; transportøren som avsender gir ingen butikk', async () => {
  assert.equal(trk.domainOf('ordre@mail.komplett.no'), 'komplett.no');
  assert.equal(trk.domainOf('noreply@zalando.co.uk'), 'zalando.co.uk');
  assert.equal(trk.domainOf('noreply@posten.no'), '');
  assert.equal(trk.domainOf('tull'), '');
  await trk.fromMail({ subject: 'Ordren din er sendt', from: { value: [{ name: 'Kundeservice', address: 'ordre@send.kioskhansen.no' }] }, text: 'Pakken er sendt. Sporingsnummer: CV111222333NO', date: new Date() });
  const row = db.prepare("SELECT shop, shop_domain FROM hl_shipments WHERE tracking_no='CV111222333NO'").get();
  assert.equal(row.shop_domain, 'kioskhansen.no');
  const s = await byNo('CV111222333NO');
  assert.equal(s.logo.kind, 'shop');
  assert.equal(s.logo.domain, 'kioskhansen.no');
  assert.equal(s.logo.url, '/finans/api/logo/kioskhansen.no');
  assert.equal(s.logo.carrierLogo.id, 'posten');
});

test('moreCount: alle aktive minus denne, i packagesFor og /widget', async () => {
  const n = db.prepare("SELECT COUNT(*) n FROM hl_shipments WHERE archived=0 AND status<>'delivered'").get().n;
  assert.ok(n >= 4);
  const p = trk.packagesFor(2);
  assert.equal(p[0].moreCount, n - 1);
  for (const k of ['title', 'logo', 'moreCount', 'shop']) assert.ok(k in p[0], k);
  const w = await (await trk.default.request('/widget', { headers: H })).json();
  assert.equal(w.moreCount, n - 1);
  assert.equal(w.items[0].moreCount, n - 1);
});

test('logoer: aliasene finnes, og admin kan velge domene for et navn', async () => {
  for (const [t, id] of [['Tv2', 'tv2-play'], ['squarespace', 'squarespace'], ['Claue', 'claude'], ['YouTube Premium', 'youtube'], ['Google One', 'google-one'], ['Posten', 'posten'], ['Bring', 'bring'], ['Komplett · skjerm', 'komplett'], ['HBO', 'max'], ['GLS', 'gls'], ['Porterbuddy', 'porterbuddy']]) {
    assert.equal(matchMerchant(t)?.id, id, t);
  }
  assert.equal(matchMerchant('Kiosk Hansen'), null);
  assert.equal((await fin.request('/logos/override', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"Kiosk Hansen","domain":"kioskhansen.no"}' })).status, 401);
  const bad = await fin.request('/logos/override', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Kiosk Hansen', domain: 'ikke et domene' }) });
  assert.equal(bad.status, 400);
  const r = await fin.request('/logos/override', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Kiosk Hansen', domain: 'https://www.kioskhansen.no/' }) });
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.domain, 'kioskhansen.no');
  assert.equal(matchMerchant('KIOSK HANSEN')?.domene, 'kioskhansen.no');
  const m = await (await fin.request('/logos/match?q=Kiosk%20Hansen')).json();
  assert.equal(m.match.domene, 'kioskhansen.no');
  // Tomt domene fjerner valget.
  await fin.request('/logos/override', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Kiosk Hansen', domain: '' }) });
  assert.equal(matchMerchant('Kiosk Hansen'), null);
});
