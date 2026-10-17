import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fh-finn-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const { db } = await import('../server/finans/db.js');
const { default: api } = await import('../server/finans/routes.js');
const F = await import('../server/finans/finn-routes.js');
const { simpleParser } = await import('mailparser');

const login = await api.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}` };
const J = { ...H, 'content-type': 'application/json' };
const call = async (path, method = 'GET', body) => {
  const r = await api.request(path, { method, headers: body instanceof FormData ? H : J, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null), raw: r };
};

const MAIL = `Hei!\n\nDu har kjøpt Sykkelhjelm Giro, str. M fra selger Ola via Fiks ferdig.\n\nOrdrenummer: FK-88231774\nFinn-kode: 412345678\nDato: 14.10.2026\n\nVarepris: 550,00 kr\nFrakt (Posten, pakke i postkassen): 100,00 kr\nTotalt: 650,00 kr\n\nSelger har sendt pakken. Sporingsnummer: 370724760012345678\nHilsen FINN.no`;
let deal;

test('handel fra innlimt e-post får Finn-kode, ordre, sporing, kvitteringslinjer og e-posten', async () => {
  const r = await call('/finn', 'POST', { email: MAIL });
  assert.equal(r.status, 200);
  deal = r.body;
  assert.equal(deal.code, '412345678');
  assert.equal(deal.tracking, '370724760012345678');
  assert.equal(deal.stage, 2); // Betalt → Sendt
  assert.deepEqual(deal.track.map((s) => s.t), ['Betalt', 'Sendt', 'Mottatt', 'Godkjent']);
  assert.equal(deal.track[1].cur, true);
  const full = (await call(`/finn/${deal.id}`)).body;
  assert.equal(full.emails.length, 1);
  assert.deepEqual(full.receipt.lines.map((l) => [l.l, l.v]), [['Varepris', 550], ['Frakt · Fiks ferdig', 100]]);
  assert.equal(full.receipt.total, 650);
  assert.match(full.summary.text, /1 e-post/);
  assert.equal(full.adUrlGuess, 'https://www.finn.no/recommerce/forsale/item/412345678');
});

test('IMAP-kobling: Posten-mail med sporingsnummer og FINN-mail med varenavn kobles, andre ikke', async () => {
  const mk = (from, subject, text, id) => simpleParser(`From: ${from}\r\nSubject: ${subject}\r\nMessage-ID: <${id}@x>\r\nDate: Thu, 16 Oct 2026 10:00:00 +0200\r\n\r\n${text}`);
  assert.equal(F.linkMail(await mk('Posten <sporing@posten.no>', 'Pakken kan hentes', 'Sporingsnummer 370724760012345678 ligger klar på hentestedet.', 'p1')), 1);
  assert.equal(F.linkMail(await mk('FINN.no <noreply@finn.no>', 'Godkjenn Sykkelhjelm Giro', 'Husk å godkjenne sykkelhjelm giro innen 24 timer.', 'f1')), 1);
  assert.equal(F.linkMail(await mk('Butikk <post@butikk.no>', 'Tilbud på sykkelhjelm', 'Sykkelhjelm Giro på salg!', 'b1')), 0);
  assert.equal(F.linkMail(await mk('Posten <sporing@posten.no>', 'Pakken kan hentes', 'Sporingsnummer 370724760012345678.', 'p1')), 0); // samme e-post to ganger
  const full = (await call(`/finn/${deal.id}`)).body;
  assert.equal(full.emails.length, 3);
  assert.equal(full.stage, 3); // Mottatt: «ligger klar på hentestedet»
  assert.equal(full.next, 'Godkjenn varen innen 24 t');
});

test('fremtidig «utbetales når kjøper har bekreftet mottatt» gir ikke Levert/Utbetalt', () => {
  const f = { role: 'sold', steps: '[]', stage: null };
  assert.equal(F.stageOf(f, [{ subject: 'Solgt', body: 'Pengene utbetales når kjøper har bekreftet mottatt.' }]), 1);
  assert.equal(F.stageOf(f, [{ subject: 'Utbetaling', body: 'Pengene er utbetalt til kontoen din.' }]), 4);
});

test('✦ Hent annonsen: robots.txt, uttrekk fra JSON-LD, bilder lagres lokalt, rate-limit', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex');
  const html = `<html><head><title>Sykkelhjelm | FINN torget</title><meta property="og:image" content="https://images.finncdn.no/dynamic/1280w/item/412345678/a.jpg">
    <script type="application/ld+json">{"@type":"Product","name":"Sykkelhjelm Giro Register, str. M","description":"Lite brukt hjelm.","image":["https://images.finncdn.no/dynamic/1280w/item/412345678/a.jpg","https://images.finncdn.no/dynamic/1280w/item/412345678/b.jpg","https://evil.example.com/x.jpg"],
    "offers":{"price":"500","availableAtOrFrom":{"address":{"addressLocality":"Bislett","addressRegion":"Oslo"}}}}</script></head><body>Pris 500 kr</body></html>`;
  const calls = [];
  F._setFetch(async (u) => {
    const url = String(u); calls.push(url);
    if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /search\n', { status: 200 });
    if (url.includes('images.finncdn.no')) return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
    if (url.includes('/item/412345678')) return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
    return new Response('nei', { status: 404 });
  });
  const bad = await call(`/finn/${deal.id}/ad`, 'POST', { url: 'https://example.com/x' });
  assert.equal(bad.status, 400);
  const r = await call(`/finn/${deal.id}/ad`, 'POST', {});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ad.title, 'Sykkelhjelm Giro Register, str. M');
  assert.equal(r.body.ad.price, 500);
  assert.equal(r.body.ad.place, 'Bislett, Oslo');
  assert.equal(r.body.ad.images.length, 2);
  assert.ok(!calls.some((u) => u.includes('evil.example.com')));
  const img = await api.request(r.body.ad.images[0], { headers: H }).catch(() => null) ?? null;
  const ir = await api.request(r.body.ad.images[0].replace('/finans/api', ''), { headers: H });
  assert.equal(ir.status, 200); assert.equal(ir.headers.get('content-type'), 'image/png');
  assert.ok(img === null || img.status !== 500);
  const files = db.prepare('SELECT images FROM fh_finn_ad WHERE finn_id=?').pluck().get(deal.id);
  for (const rel of JSON.parse(files)) assert.ok(existsSync(join(process.env.DATA_DIR, 'finn', rel)));
  assert.ok(JSON.parse(files)[0].startsWith('412345678/'));
  const again = await call(`/finn/${deal.id}/ad`, 'POST', {});
  assert.equal(again.status, 429);
  F._setFetch(async (u) => (String(u).endsWith('/robots.txt') ? new Response('User-agent: *\nDisallow: /recommerce/\n') : new Response(html)));
  const blocked = await call(`/finn/${deal.id}/ad`, 'POST', {});
  assert.equal(blocked.status, 403);
  F._setFetch(null);
});

test('kvittering, bilder og .eml legges ved og fjernes; listen viser sammendrag', async () => {
  const fd = new FormData();
  fd.set('kind', 'receipt');
  fd.append('file', new File(['%PDF-1.4 kvittering'], 'kvittering.pdf', { type: 'application/pdf' }));
  fd.append('file', new File(['From: a@b\r\nSubject: x\r\n\r\nhei'], 'ordre.eml', { type: 'message/rfc822' }));
  let r = await call(`/finn/${deal.id}/files`, 'POST', fd);
  assert.equal(r.status, 200); assert.equal(r.body.receipts.length, 2);
  const ph = new FormData(); ph.set('kind', 'photo');
  ph.append('file', new File([Buffer.from([0xff, 0xd8, 0xff])], 'mottak.jpg', { type: 'image/jpeg' }));
  r = await call(`/finn/${deal.id}/files`, 'POST', ph);
  assert.equal(r.body.photos.length, 1);
  const bad = new FormData(); bad.set('kind', 'photo'); bad.append('file', new File(['x'], 'skript.js', { type: 'text/javascript' }));
  assert.equal((await call(`/finn/${deal.id}/files`, 'POST', bad)).status, 400);
  const get = await api.request(r.body.photos[0].url.replace('/finans/api', ''), { headers: H });
  assert.equal(get.status, 200); assert.equal(get.headers.get('content-type'), 'image/jpeg');
  const eml = new FormData();
  eml.append('file', new File([`From: Ola <ola@finn.no>\r\nSubject: Sendt i dag\r\nMessage-ID: <manuell-1@finn.no>\r\nDate: Wed, 15 Oct 2026 09:00:00 +0200\r\n\r\nHei, pakken er sendt.`], 'melding.eml', { type: 'message/rfc822' }));
  r = await call(`/finn/${deal.id}/emails`, 'POST', eml);
  assert.equal(r.status, 200); assert.equal(r.body.added, 1); assert.equal(r.body.emails.length, 4);
  const list = (await call('/finn')).body;
  const it = list.items.find((x) => x.id === deal.id);
  assert.equal(it.summary.text, '4 e-poster · kvittering ✓ · annonse lagret · 1 bilde');
  assert.match(it.cover, /\/files\/\d+$/); // eget bilde går foran annonsebildene
  r = await call(`/finn/${deal.id}/files/${r.body.receipts[0].id}`, 'DELETE');
  assert.equal(r.body.receipts.length, 1);
  assert.equal(list.months.length, 12);
});

test('manuelt steg og sletting fjerner filene', async () => {
  let r = await call(`/finn/${deal.id}`, 'PATCH', { stage: 4 });
  assert.equal(r.body.status, 'Fullført'); assert.equal(r.body.done, true);
  r = await call(`/finn/${deal.id}`, 'PATCH', { stage: null });
  assert.equal(r.body.manualStage, null);
  const rels = db.prepare('SELECT file FROM fh_finn_files WHERE finn_id=?').pluck().all(deal.id);
  assert.equal((await call(`/finn/${deal.id}`, 'DELETE')).status, 200);
  for (const rel of rels) assert.ok(!existsSync(join(process.env.DATA_DIR, 'finn', rel)));
  assert.equal(db.prepare('SELECT count(*) FROM fh_finn_emails WHERE finn_id=?').pluck().get(deal.id), 0);
});
