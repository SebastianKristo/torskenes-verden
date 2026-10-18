import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fh-imp12-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
process.env.OLLAMA_URL = 'http://127.0.0.1:9'; // ingen AI i testene: tilkoblingen avvises straks
const { hashPassword } = await import('../server/password.js');
process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
const T = await import('../server/finans/import-templates.js');
const { readXlsx } = await import('../server/finans/importer.js');
const { writeXlsx } = await import('../server/finans/xlsx.js');
const { db } = await import('../server/finans/db.js');
const { default: api } = await import('../server/finans/routes.js');

let aiCalls = 0;
T._setAi(async (prompt) => { aiCalls++; assert.match(prompt, /Rad 1/); return { date_col: 1, desc_col: 3, in_col: null, out_col: null, amount_col: 2, date_format: 'dmy' }; });

const login = await api.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
const { token } = await login.json();
const H = { authorization: `Bearer ${token}` };
const call = async (path, method = 'GET', body) => {
  const r = await api.request(path, { method, headers: body instanceof FormData ? H : { ...H, 'content-type': 'application/json' }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const DNB_HEAD = ['Utført dato', 'Bokført dato', 'Rentedato', 'Beskrivelse', 'Type', 'Undertype', 'Fra konto', 'Avsender', 'Til konto', 'Mottakernavn', 'Beløp inn', 'Beløp ut', 'Valuta', 'Status', 'Melding/KID/Fakt.nr'];
const DNB_ROWS = [
  ['14.10.2026', '15.10.2026', '15.10.2026', 'REMA 1000 MAJORSTUEN', 'Varekjøp', 'Kort', '1234.56.78901', '', '', '', '', '-935.00', 'NOK', 'Bokført', ''],
  ['13.10.2026', '13.10.2026', '13.10.2026', 'LØNN', 'Overføring', '', '', 'ARBEIDSGIVER AS', '1234.56.78901', '', '11,616.00', '', 'NOK', 'Bokført', 'Lønn oktober'],
  ['12.10.2026', '12.10.2026', '12.10.2026', 'Vipps:pal wengard', 'Vipps', '', '', '', '', 'Pål Wengard', '5300.00', '', 'NOK', 'Bokført', 'Middag'],
];

test('beløpsformater og STORE BOKSTAVER', () => {
  assert.equal(T.parseNum('-935.00'), -93500);
  assert.equal(T.parseNum('5300.00'), 530000);
  assert.equal(T.parseNum('11,616.00'), 1161600);
  assert.equal(T.parseNum('1 234,50'), 123450);
  assert.equal(T.parseNum('−1.234,50 kr'), -123450);
  assert.equal(T.titleCase('REMA 1000 MAJORSTUEN'), 'Rema 1000 Majorstuen');
  assert.equal(T.titleCase('Kiwi Bislett'), 'Kiwi Bislett');
  assert.equal(T.parseDate('10/14/26', 'mdy'), '2026-10-14');
  assert.equal(T.parseDate('14.10.2026', 'dmy'), '2026-10-14');
});

test('CSV med semikolon og celler i anførselstegn over flere linjer', () => {
  const rows = T.splitRows('Dato;Tekst;Beløp\n01.10.2026;"Kiwi; Bislett\nOslo";"-120,50"\n02.10.2026;Ruter;-39');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], ['01.10.2026', 'Kiwi; Bislett Oslo', '-120,50']);
});

test('DNB-kontoutskrift (Excel) gjenkjennes med innebygd mal', async () => {
  const buf = writeXlsx([{ name: 'Kontoutskrift', columns: DNB_HEAD.map((h, i) => ({ key: 'c' + i, label: h })), rows: DNB_ROWS.map((r) => Object.fromEntries(r.map((v, i) => ['c' + i, v]))) }]);
  const r = await T.importRows(readXlsx(buf), 1);
  assert.equal(r.format.template.id, 'dnb');
  assert.equal(r.format.template.name, 'DNB · kontoutskrift (Excel)');
  assert.deepEqual(r.format.columns.map((c) => `${c.label}←${c.column}`), ['Dato←Utført dato', 'Beskrivelse←Beskrivelse', 'Beløp inn←Beløp inn', 'Beløp ut←Beløp ut', 'Melding←Melding/KID/Fakt.nr', 'Mottaker←Mottakernavn']);
  assert.deepEqual(r.rows.map((x) => [x.date, x.description, x.amount]), [['2026-10-14', 'Rema 1000 Majorstuen', -93500], ['2026-10-13', 'Lønn', 1161600], ['2026-10-12', 'Vipps · Pal Wengard', 530000]]);
  assert.equal(r.rows[1].raw, 'LØNN · Lønn oktober');
  assert.equal(r.rows[1].bank.raw['Rentedato'], '13.10.2026');
  assert.equal(r.rows[1].bank.valueDate, '13.10.2026');
});

test('kortutskrift uten overskrift (MM/DD/YY) bruker innebygd mal', async () => {
  const r = await T.importRows(T.splitRows('10/14/26\tVisa  100021  Ruterappen\t10/15/26\t238.00\t\n10/14/26\tLønn  363129861 Statens Lånekasse\t10/14/26\t\t11,616.00'));
  assert.equal(r.format.template.id, 'kort');
  assert.deepEqual(r.rows.map((x) => [x.date, x.description, x.amount]), [['2026-10-14', 'Ruterappen', -23800], ['2026-10-14', 'Statens Lånekasse', 1161600]]);
});

test('ukjent format: AI leser første rader, malen lagres og brukes neste gang uten AI', async () => {
  const csv = 'Ref,Når,Sum NOK,Hva\nA1,03.10.2026,-250.00,KIWI 505 BISLETT\nA2,04.10.2026,1200.00,Refusjon\n';
  const a = await T.importRows(T.splitRows(csv));
  assert.equal(aiCalls, 1);
  assert.equal(a.format.template.ai, true);
  assert.match(a.format.template.name, /✦ AI-mal/);
  assert.deepEqual(a.rows.map((x) => [x.date, x.description, x.amount]), [['2026-10-03', 'Kiwi 505 Bislett', -25000], ['2026-10-04', 'Refusjon', 120000]]);
  const b = await T.importRows(T.splitRows(csv.replace('-250.00', '-99.00')));
  assert.equal(aiCalls, 1);
  assert.equal(b.format.template.source, 'saved');
  assert.equal(b.rows[0].amount, -9900);
  const list = (await call('/import/templates')).body;
  assert.deepEqual(list.slice(0, 2).map((t) => t.id), ['dnb', 'kort']);
  const saved = list.find((t) => !t.builtin);
  assert.ok(saved);
  assert.equal((await call('/import/templates/dnb', 'DELETE')).status, 404);
  assert.equal((await call(`/import/templates/${saved.id}`, 'DELETE')).status, 200);
  assert.equal((await call('/import/templates')).body.length, 2);
});

test('/import og /import/preview viser formatet, og innlimt DNB-tekst importeres', async () => {
  db.prepare("INSERT INTO fh_accounts(name,type,opening_balance,sort) VALUES('Brukskonto','checking',0,0)").run();
  const text = [DNB_HEAD, ...DNB_ROWS].map((r) => r.join('\t')).join('\n');
  const pv = await call('/import/preview', 'POST', { text });
  assert.equal(pv.status, 200, JSON.stringify(pv.body));
  assert.equal(pv.body.template.id, 'dnb');
  assert.equal(pv.body.rows, 3);
  const fd = new FormData(); fd.set('text', text);
  const r = await call('/import?commit=1', 'POST', fd);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.imported, 3);
  assert.equal(r.body.format.template.name, 'DNB · kontoutskrift (Excel)');
  const fd2 = new FormData(); fd2.set('text', text);
  assert.equal((await call('/import?commit=1', 'POST', fd2)).body.imported, 0);
});

test('ukjente overskrifter uten AI: gjetning ut fra verdiene', async () => {
  T._setAi(async () => { throw new Error('ingen AI'); });
  const r = await T.importRows(T.splitRows('Id;Når;Hva;Kr\nX1;03.10.2026;KIWI 505 BISLETT;-250,00\nX2;04.10.2026;Refusjon;1 200,00'));
  assert.equal(r.format.template.source, 'guess');
  assert.deepEqual(r.rows.map((x) => [x.date, x.description, x.amount]), [['2026-10-03', 'Kiwi 505 Bislett', -25000], ['2026-10-04', 'Refusjon', 120000]]);
});
