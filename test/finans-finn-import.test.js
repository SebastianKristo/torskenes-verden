import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fh-finnimp-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.OLLAMA_URL = 'http://127.0.0.1:9'; // ingen AI i testene: tilkoblingen avvises straks
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { default: api } = await import('../server/finans/routes.js');
const F = await import('../server/finans/finn-routes.js');
const { zip } = await import('../server/finans/xlsx.js');

const login = await api.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}` };
const call = async (path, method = 'GET', body) => {
  const r = await api.request(path, { method, headers: body instanceof FormData ? H : { ...H, 'content-type': 'application/json' }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const eml = (from, subject, text, id, date = 'Tue, 14 Oct 2025 10:00:00 +0200') => `From: ${from}\r\nSubject: ${subject}\r\nMessage-ID: <${id}@x>\r\nDate: ${date}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}\r\n`;
const SOLD = eml('FINN.no <noreply@finn.no>', 'Du har solgt Kontorstol HÅG Capisco', 'Du har solgt Kontorstol HÅG Capisco til kjøper Kari N.\nFinn-kode: 455500111\nOrdrenummer: TB-7731002\nSalgspris: 1 800,00 kr\nTotalt: 1 800,00 kr\nKjøper har betalt med Trygg betaling. Send varen innen 5 dager.', 's1');
const POSTEN = eml('Posten Bring <sporing@posten.no>', 'Pakken er levert', 'Pakken med Finn-kode 455500111 er levert. Sporingsnummer: 370724760099887766', 'p1');
const NOISE = eml('Butikk <post@butikk.no>', 'Tilbud', 'Kontorstoler på salg!', 'n1');

test('finnCodes og mbox-oppdeling', () => {
  assert.deepEqual(F.finnCodes('https://www.finn.no/recommerce/forsale/item/476377764\nhttps://www.finn.no/bap/forsale/ad.html?finnkode=123456789\nhttps://www.finn.no/recommerce/forsale/item/476377764'), ['476377764', '123456789']);
  const box = `From noreply@finn.no Tue Oct 14 10:00:00 2025\n${SOLD}\nFrom sporing@posten.no Tue Oct 15 10:00:00 2025\n${POSTEN}`;
  assert.equal(F.splitMbox(box).length, 2);
});

test('.eml og .mbox: handelsmail oppretter handelen, Posten-mail kobles, annet hoppes over', async () => {
  const fd = new FormData();
  fd.append('files', new File([SOLD], 'solgt.eml', { type: 'message/rfc822' }));
  fd.append('files', new File([`From x\n${POSTEN}\nFrom y\n${NOISE}`], 'eksport.mbox'));
  const r = await call('/finn/import/eml', 'POST', fd);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.running, false);
  assert.deepEqual([r.body.added, r.body.linked, r.body.skipped], [1, 1, 1]);
  const list = (await call('/finn')).body.items;
  const deal = list.find((d) => d.item.includes('Capisco'));
  assert.equal(deal.role, 'sold');
  const full = (await call(`/finn/${deal.id}`)).body;
  assert.equal(full.emails.length, 2);
  // Samme fil igjen gir ingen nye handler.
  const again = new FormData(); again.append('files', new File([SOLD], 'solgt.eml'));
  const r2 = await call('/finn/import/eml', 'POST', again);
  assert.equal(r2.body.added, 0);
  assert.equal((await call('/finn')).body.items.filter((d) => d.item.includes('Capisco')).length, 1);
});

test('.zip med .eml (Proton-eksport)', async () => {
  const z = zip([['mail/a.eml', eml('FINN.no <noreply@finn.no>', 'Kvittering: du har betalt for «Lampe Le Klint»', 'Du har kjøpt Lampe Le Klint fra selger Per.\nOrdrenummer: FK-1200001\nTotalt: 900,00 kr\nTrygg betaling', 'z1')], ['mail/note.txt', 'x']]);
  const fd = new FormData(); fd.append('files', new File([z], 'proton.zip', { type: 'application/zip' }));
  const r = await call('/finn/import/eml', 'POST', fd);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.added, 1);
});

test('Hent alle Finn-e-poster fra Bridge (mocket henter)', async () => {
  F._setFinnMailFetcher(async () => ({ ok: true, sources: [Buffer.from(eml('FINN.no <noreply@finn.no>', 'Du har solgt Sykkel Trek FX3', 'Du har solgt Sykkel Trek FX3 til kjøper Ola.\nOrdrenummer: TB-555\nTotalt: 4 500,00 kr\nTrygg betaling', 'm1')), Buffer.from(NOISE)] }));
  const r = await call('/finn/import/mail', 'POST', {});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.added, 1);
  assert.match(r.body.message, /Fant 2 e-poster fra Finn/);
  F._setFinnMailFetcher(async () => ({ ok: false, sources: [], message: 'E-post er ikke satt opp' }));
  const e = await call('/finn/import/mail', 'POST', {});
  assert.equal(e.body.message, 'E-post er ikke satt opp');
  F._setFinnMailFetcher(null);
  assert.equal((await call('/finn/import/status')).body.kind, 'mail');
});

test('annonselenker: ny handel med tittel, pris og bilder; feil lenke rapporteres', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000000000500010d0a2db40000000049454e44ae426082', 'hex');
  const html = `<html><head><title>Sofabord i eik | FINN torget</title><script type="application/ld+json">{"@type":"Product","name":"Sofabord i eik","description":"Pent brukt sofabord.","image":["https://images.finncdn.no/dynamic/1280w/item/476377764/abc.jpg"],"offers":{"price":"1200"}}</script></head><body></body></html>`;
  F._setFetch(async (u) => {
    const url = String(u);
    if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /search\n');
    if (url.includes('images.finncdn.no')) return new Response(png, { headers: { 'content-type': 'image/jpeg' } });
    if (url.includes('/item/476377764')) return new Response(html, { headers: { 'content-type': 'text/html' } });
    return new Response('nei', { status: 404 });
  }, 0);
  const r = await call('/finn/import/links', 'POST', { text: 'https://www.finn.no/recommerce/forsale/item/476377764\nhttps://www.finn.no/recommerce/forsale/item/999999999', role: 'sold' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.added, 1);
  assert.equal(r.body.errors.length, 1);
  assert.equal(r.body.items[0].status, 'ok');
  assert.equal(r.body.items[0].images, 1);
  const list = (await call('/finn')).body.items;
  const d = list.find((x) => x.item === 'Sofabord i eik');
  assert.ok(d, JSON.stringify(list.map((x) => x.item)));
  assert.equal(d.role, 'sold');
  assert.equal(d.amount, 1200);
  assert.ok(!list.some((x) => x.item === 'Finn-annonse 999999999'));
  // Samme lenke igjen oppdaterer handelen i stedet for å lage en ny.
  const r2 = await call('/finn/import/links', 'POST', { text: 'https://www.finn.no/recommerce/forsale/item/476377764' });
  assert.deepEqual([r2.body.added, r2.body.linked], [0, 1]);
  assert.equal((await call('/finn/import/links', 'POST', { text: 'ingen lenker' })).status, 400);
  F._setFetch(null);
});

test('e-post kobles til annonse som allerede er importert, og annonsen hentes for nye handler', async () => {
  const html = (code, name) => `<html><head><script type="application/ld+json">{"@type":"Product","name":"${name}","description":"Fin.","offers":{"price":"900"}}</script></head><body>finn.no/recommerce/forsale/item/${code}</body></html>`;
  const hits = [];
  F._setFetch(async (u) => {
    const url = String(u); hits.push(url);
    if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /search\n');
    if (url.includes('/item/476377764')) return new Response(html('476377764', 'Sofabord i eik'), { headers: { 'content-type': 'text/html' } });
    if (url.includes('/item/488800222')) return new Response(html('488800222', 'Lampe Le Klint'), { headers: { 'content-type': 'text/html' } });
    return new Response('nei', { status: 404 });
  }, 0);
  const before = (await call('/finn')).body.items.length;
  const fd = new FormData();
  fd.append('file', new File([eml('FINN.no <noreply@finn.no>', 'Du har solgt Sofabord i eik', 'Du har solgt Sofabord i eik til kjøper Per.\nFinn-kode: 476377764\nSalgspris: 1 150,00 kr\nTotalt: 1 150,00 kr\nTrygg betaling', 'sofa1')], 'sofa.eml'));
  fd.append('file', new File([eml('FINN.no <noreply@finn.no>', 'Kvittering: du har betalt for «Lampe Le Klint»', 'Du har kjøpt Lampe Le Klint fra selger Eva via Fiks ferdig.\nFinn-kode: 488800222\nTotalt: 950,00 kr', 'lampe1')], 'lampe.eml'));
  const r = await call('/finn/import/eml', 'POST', fd);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.added, r.body.linked], [1, 1], JSON.stringify(r.body));
  const list = (await call('/finn')).body.items;
  assert.equal(list.length, before + 1);
  const sofa = list.filter((x) => x.item === 'Sofabord i eik');
  assert.equal(sofa.length, 1, 'samme handel, ikke en ny');
  assert.equal(sofa[0].amount, 1150);
  // Lampen var ny: annonsen hentes fra finn.no etter importen.
  assert.ok(hits.some((u) => u.includes('/item/488800222')), hits.join('\n'));
  assert.equal(r.body.ads, 1);
  F._setFetch(null);
});

test('Importer fra mappen FINN: mappenavnet sendes videre og «FINN» finner «Folders/FINN»', async () => {
  const { resolveFolder } = await import('../server/finans/mail.js');
  const boxes = ['INBOX', 'All Mail', 'Folders/FINN', 'Labels/Kvittering'];
  assert.equal(resolveFolder(boxes, 'FINN'), 'Folders/FINN');
  assert.equal(resolveFolder(boxes, 'finn'), 'Folders/FINN');
  assert.equal(resolveFolder(boxes, 'Folders/FINN'), 'Folders/FINN');
  assert.equal(resolveFolder(boxes, 'Kvittering'), 'Labels/Kvittering');
  assert.equal(resolveFolder(boxes, 'Finnes ikke'), null);
  let asked = null;
  F._setFinnMailFetcher(async (o) => { asked = o; return { ok: true, sources: [Buffer.from(eml('FINN.no <noreply@finn.no>', 'Du har solgt Ski Madshus', 'Du har solgt Ski Madshus til kjøper Ole.\nOrdrenummer: TB-8080\nTotalt: 700,00 kr\nTrygg betaling', 'ski1'))] }; });
  const r = await call('/finn/import/mail', 'POST', { folder: 'FINN', fetchAds: false });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(asked.folder, 'FINN');
  assert.equal(r.body.added, 1);
  assert.match(r.body.message, /mappen «FINN»/);
  F._setFinnMailFetcher(null);
});
