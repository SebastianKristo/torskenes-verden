import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fh-mail-'));
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-12';
delete process.env.MOCK_DATA;
const { db, setSecret, saveSettings } = await import('../server/finans/db.js');
const mail = await import('../server/finans/mail.js');
const t212 = await import('../server/finans/stocks.js');
const { precheck } = await import('../public/js/settings-mail.js');

/* ---------------- Trading 212 ---------------- */

test('T212: verdier renses for mellomrom, linjeskift, anførselstegn og «Basic »', () => {
  assert.equal(t212.cleanCred('  "35875800ZxYa"\n'), '35875800ZxYa');
  assert.equal(t212.cleanCred('«abc def»'), 'abcdef');
  assert.equal(t212.cleanCred('Basic  KEY123\r\n'), 'KEY123');
  assert.equal(t212.cleanCred('​key﻿'), 'key');
});

test('T212: Authorization er Basic base64(KEY:SECRET) uten linjeskift', () => {
  const h = t212.t212AuthHeader(' key-id\n', "'s3cr3t'");
  assert.equal(h, 'Basic ' + Buffer.from('key-id:s3cr3t').toString('base64'));
  assert.ok(!/\s/.test(h.slice(6)));
  assert.equal(t212.t212AuthHeader('legacykey', ''), 'legacykey', 'uten secret: eldre format');
});

test('T212: statuskoder gir hver sin norske melding', () => {
  assert.match(t212.t212Error(401, '/equity/account/summary').message, /401.*nøkkel-ID eller secret.*Demo/);
  assert.match(t212.t212Error(401, '/x', { env: 'demo' }).message, /Live og ikke Demo/);
  const e403 = t212.t212Error(403, '/equity/portfolio');
  assert.equal(e403.scope, 'portfolio');
  assert.match(e403.message, /403.*«portfolio».*IP/);
  assert.match(t212.t212Error(429, '/x', { retryAfter: '30' }).message, /429.*30 s/);
  assert.equal(t212.t212Error(500).code, 'http');
});

test('T212: test tilkobling sender riktig header, viser valuta og total, og oppdager feil miljø', async () => {
  const orig = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, opts) => {
    seen.push({ url: String(url), auth: opts.headers.Authorization });
    const live = String(url).startsWith('https://live.');
    if (live) return new Response('{}', { status: 401 });
    return new Response(JSON.stringify({ currency: 'NOK', totalValue: 1234.5, investments: {}, cash: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const demo = await t212.testT212({ key: 'k', secret: 's', env: 'demo' });
    assert.equal(demo.ok, true);
    assert.equal(demo.currency, 'NOK');
    assert.equal(demo.total, 1234.5);
    assert.equal(seen[0].auth, 'Basic ' + Buffer.from('k:s').toString('base64'));
    assert.match(seen[0].url, /demo\.trading212\.com\/api\/v0\/equity\/account\/summary$/);
    const wrong = await t212.testT212({ key: 'k', secret: 's', env: 'live' });
    assert.equal(wrong.ok, false);
    assert.equal(wrong.code, 'wrong_env');
    assert.equal(wrong.suggest, 'demo');
    assert.equal(wrong.keyLength, 1);
  } finally { globalThis.fetch = orig; }
});

test('T212: lagret secret som ikke kan dekrypteres faller ikke tilbake til .env', async () => {
  process.env.TRADING212_API_KEY = 'gammel-dashboard-nokkel';
  const kv = db.prepare("SELECT value FROM kv WHERE key='fh_secret'").get();
  const s = kv ? JSON.parse(kv.value) : {};
  s.t212Key = 'enc:ødelagt'; s.t212Secret = 'enc:ødelagt';
  db.prepare("INSERT INTO kv(user,key,value) VALUES('owner','fh_secret',?) ON CONFLICT(user,key) DO UPDATE SET value=excluded.value").run(JSON.stringify(s));
  assert.equal(t212.t212Configured(), false);
  const r = await t212.testT212({});
  assert.equal(r.code, 'undecryptable');
  delete process.env.TRADING212_API_KEY;
  setSecret('t212Key', ''); setSecret('t212Secret', '');
});

/* ---------------- E-post (Proton Mail Bridge) ---------------- */

const raw = (parts) => Buffer.from(parts.join('\r\n'));
const withPdf = raw([
  'From: "Elkjøp" <ordre@elkjop.no>', 'To: navn@proton.me', 'Subject: Din kvittering', 'Message-ID: <abc-123@elkjop.no>', 'Date: Fri, 16 Oct 2026 10:00:00 +0200',
  'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="B"', '', '--B', 'Content-Type: text/plain; charset=utf-8', '', 'Takk for handelen!', '--B',
  'Content-Type: application/pdf; name="kvittering.pdf"', 'Content-Disposition: attachment; filename="kvittering.pdf"', 'Content-Transfer-Encoding: base64', '',
  Buffer.from('%PDF-1.4 ' + 'x'.repeat(400)).toString('base64'), '--B--', '']);
const htmlOnly = raw([
  'From: Komplett <noreply@komplett.no>', 'Subject: Ordrebekreftelse 998877', 'Message-ID: <ordre-998877@komplett.no>', 'MIME-Version: 1.0',
  'Content-Type: text/html; charset=utf-8', '', '<html><style>.x{}</style><body><h1>Ordre 998877</h1><p>USB-C-kabel 2 m</p><p>Totalt: 199,00 kr</p><p>Betalt med Visa</p></body></html>', '']);

test('E-post: PDF-vedlegg blir én kvitteringsjobb med avsender og emne, og samme e-post importeres ikke to ganger', async () => {
  const got = [];
  const ingest = async (x) => { got.push(x); return `r${got.length}`; };
  const a = await mail.importMessage(withPdf, { folder: 'Folders/Kvitteringer', ingest });
  assert.equal(a.imported, 1);
  assert.equal(got[0].mime, 'application/pdf');
  assert.equal(got[0].name, 'kvittering.pdf');
  assert.match(got[0].meta.from, /ordre@elkjop\.no/);
  assert.equal(got[0].meta.subject, 'Din kvittering');
  const b = await mail.importMessage(withPdf, { folder: 'Folders/Kvitteringer', ingest });
  assert.equal(b.imported, 0);
  assert.equal(b.skipped, 1);
  assert.equal(db.prepare("SELECT count(*) n FROM fh_mail_imports WHERE message_id='<abc-123@elkjop.no>'").get().n, 1);
});

test('E-post uten vedlegg: renset tekst sendes til AI som .txt', async () => {
  const got = [];
  await mail.importMessage(htmlOnly, { folder: 'INBOX', ingest: async (x) => { got.push(x); return 'r'; } });
  assert.equal(got.length, 1);
  assert.equal(got[0].mime, 'text/plain');
  const t = got[0].buffer.toString('utf8');
  assert.match(t, /Ordre 998877/i);
  assert.match(t, /Totalt: 199,00 kr/);
  assert.ok(!/<p>|\.x\{\}/.test(t), 'HTML og CSS er fjernet');
});

test('E-post: IMAP-feil gir konkrete meldinger', () => {
  const cfg = { host: 'protonmail-bridge', port: 1143, folder: 'Kvitteringer' };
  assert.equal(mail.mailError(Object.assign(new Error('x'), { authenticationFailed: true }), cfg).code, 'auth');
  assert.match(mail.mailError(Object.assign(new Error('x'), { authenticationFailed: true }), cfg).message, /Bridge-passordet/);
  const ref = mail.mailError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), cfg);
  assert.equal(ref.code, 'refused'); assert.match(ref.message, /143 \(ikke 1143\)/);
  const nf = mail.mailError(Object.assign(new Error('Command failed'), { responseText: 'Mailbox doesn\'t exist', serverResponseCode: 'NONEXISTENT' }), cfg);
  assert.equal(nf.code, 'folder'); assert.match(nf.message, /Folders\//);
  assert.equal(mail.mailError(Object.assign(new Error('self-signed certificate'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }), cfg).code, 'cert');
  assert.equal(mail.mailError(Object.assign(new Error('x'), { code: 'PIN_MISMATCH' }), cfg).code, 'cert');
  assert.equal(mail.mailError(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }), cfg).code, 'host');
});

test('E-post: klientsjekken fanger vanlige feil før tilkobling', () => {
  assert.match(precheck({ host: 'imap.proton.me', port: '993' }), /ingen offentlig IMAP/);
  assert.match(precheck({ host: 'protonmail-bridge', port: '993', security: 'starttls' }), /Bridge bruker ikke port 993/);
  assert.match(precheck({ host: 'protonmail-bridge', port: '143', user: 'navn' }), /hele Proton-adressen/);
  assert.match(precheck({ host: 'protonmail-bridge', port: '143', user: 'a@proton.me', pass: 'kort' }), /16 tegn/);
  assert.match(precheck({ host: 'protonmail-bridge', port: '143', user: 'a@proton.me', folder: 'Kvitteringer' }), /Folders\/Kvitteringer/);
  assert.equal(precheck({ host: 'protonmail-bridge', port: '143', user: 'a@proton.me', pass: 'x'.repeat(16), folder: 'Folders/Kvitteringer' }), null);
});

test('E-post: test uten oppsett sier hva som mangler, og innstillinger kommer fra .env som standard', async () => {
  saveSettings({ imapHost: '', imapUser: '' });
  const r = await mail.testMail();
  assert.equal(r.ok, false);
  assert.equal(r.code, 'missing');
  assert.equal(mail.mailConfig().security, 'starttls');
  assert.equal(mail.mailConfig().folder, 'Folders/Kvitteringer');
});

test('E-post: STARTTLS-sertifikatet leses (for pinning) fra en lokal testserver', async (t) => {
  const { execFileSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'fh-cert-'));
  try { execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=127.0.0.1'], { stdio: 'ignore' }); }
  catch { t.skip('openssl mangler'); return; }
  const net = await import('node:net'), tls = await import('node:tls'), { readFileSync } = await import('node:fs');
  const ctx = tls.createSecureContext({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) });
  const srv = net.createServer((s) => {
    s.write('* OK IMAP4rev1 Bridge ready\r\n');
    s.once('data', () => { s.write('a1 OK Begin TLS negotiation now\r\n'); const t2 = new tls.TLSSocket(s, { isServer: true, secureContext: ctx }); t2.on('error', () => {}); });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const cert = await mail.probeCert({ host: '127.0.0.1', port: srv.address().port, security: 'starttls' });
    assert.equal(cert.authorized, false, 'selvsignert');
    assert.match(cert.fingerprint, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    assert.match(cert.pem, /BEGIN CERTIFICATE/);
  } finally { srv.close(); }
});

test('E-post: ingestReceipt legger kvitteringen i køen med source=email og avsender/emne i API-et', async () => {
  const { hashPassword } = await import('../server/password.js');
  process.env.APP_PASSWORD_HASH = hashPassword('testpassord1');
  const { default: api, ingestReceipt } = await import('../server/finans/routes.js');
  const id = await ingestReceipt({ buffer: Buffer.from('Fra: a@b.no\nEmne: Kvittering\n\nTotalt 120 kr'), mime: 'text/plain', name: 'Kvittering.txt', meta: { from: 'Butikk <a@b.no>', subject: 'Kvittering', date: null } });
  const row = db.prepare('SELECT source, mime, meta FROM fh_receipts WHERE id=?').get(id);
  assert.equal(row.source, 'email');
  assert.equal(row.mime, 'text/plain');
  const login = await api.request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'testpassord1', device: 'test' }) });
  const { token } = await login.json();
  const r = await (await api.request(`/receipts/${id}`, { headers: { authorization: `Bearer ${token}` } })).json();
  assert.equal(r.source, 'email');
  assert.equal(r.email.subject, 'Kvittering');
  // Oppsett og test av e-post krever innlogging i nettleseren (ikke app-token).
  assert.equal((await api.request('/mail/test', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' })).status, 403);
});
